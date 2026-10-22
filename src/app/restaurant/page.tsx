'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import {
  Utensils, Coffee, Users, TrendingUp, ShoppingCart, Bell, LogOut
} from 'lucide-react';

// Imports des modales (gardés au cas où tu les utilises encore via des boutons)
import RestaurantCaisseModal from '@/components/RestaurantCaisseModal';
import MenuManagerModal from '@/components/MenuManagerModal';
import EmployeeManagerModal from '@/components/EmployeeManagerModal';
import FBFloorPlan from '@/components/FBFloorPlan';
import FBKitchenDisplay from '@/components/FBKitchenDisplay';

export default function RestaurantDashboard() {
  const router = useRouter();
  const supabase = createClient();
  
  // États
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [siteId, setSiteId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  
  // États des statistiques (avec valeurs par défaut pour éviter les erreurs de rendu)
  const [stats, setStats] = useState({
    todayOrders: 0,
    todayRevenue: 0,
    activeOrders: 0,
    availableTables: 0,
    totalTables: 0,
  });
  
  const [activeOrders, setActiveOrders] = useState<any[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  // États des modales (optionnels, selon ton flux)
  const [isCaisseOpen, setIsCaisseOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEmployeeOpen, setIsEmployeeOpen] = useState(false);
  const [isFloorOpen, setIsFloorOpen] = useState(false);
  const [isKitchenOpen, setIsKitchenOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*, sites(id, name)')
        .eq('id', user.id)
        .single();

      if (!profileData) {
        setLoading(false);
        return;
      }
      setProfile(profileData);
      setSiteId(profileData.sites.id);

      const today = new Date().toISOString().split('T')[0];
      const startOfDay = new Date(today);
      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);

      // 1. Commandes payées aujourd'hui
      let todayOrders = 0;
      try {
        const { count } = await supabase
          .from('restaurant_orders')
          .select('*', { count: 'exact', head: true })
          .eq('site_id', profileData.sites.id)
          .eq('status', 'PAID')
          .gte('created_at', startOfDay.toISOString())
          .lte('created_at', endOfDay.toISOString());
        todayOrders = count || 0;
      } catch (e) { console.warn('Erreur stats orders:', e); }

      // 2. Chiffre d'affaires aujourd'hui
      let todayRevenue = 0;
      try {
        const { data } = await supabase
          .from('restaurant_cash_transactions')
          .select('amount')
          .eq('site_id', profileData.sites.id)
          .eq('type', 'INCOME')
          .eq('status', 'PAID')
          .gte('transaction_date', startOfDay.toISOString())
          .lte('transaction_date', endOfDay.toISOString());
        todayRevenue = data?.reduce((sum: number, t: any) => sum + Number(t.amount), 0) || 0;
      } catch (e) { console.warn('Erreur stats revenue:', e); }

      // 3. Commandes actives
      let activeOrdersCount = 0;
      try {
        const { count } = await supabase
          .from('restaurant_orders')
          .select('*', { count: 'exact', head: true })
          .eq('site_id', profileData.sites.id)
          .in('status', ['SENT', 'PREPARING', 'READY', 'SERVED']);
        activeOrdersCount = count || 0;
      } catch (e) { console.warn('Erreur stats active:', e); }

      // 4. Tables
      let availableTables = 0;
      let totalTables = 0;
      try {
        const { count: avail } = await supabase
          .from('restaurant_tables')
          .select('*', { count: 'exact', head: true })
          .eq('site_id', profileData.sites.id)
          .eq('status', 'AVAILABLE');
        const { count: total } = await supabase
          .from('restaurant_tables')
          .select('*', { count: 'exact', head: true })
          .eq('site_id', profileData.sites.id);
        availableTables = avail || 0;
        totalTables = total || 0;
      } catch (e) { console.warn('Erreur stats tables:', e); }

      setStats({
        todayOrders,
        todayRevenue,
        activeOrders: activeOrdersCount,
        availableTables,
        totalTables,
      });

      // 5. Liste des commandes actives
      try {
        const { data: orders } = await supabase
          .from('restaurant_orders')
          .select(`
            id, order_number, status, total_amount, created_at, order_type,
            restaurant_tables(number),
            restaurant_employees(first_name, last_name)
          `)
          .eq('site_id', profileData.sites.id)
          .in('status', ['SENT', 'PREPARING', 'READY', 'SERVED'])
          .order('created_at', { ascending: true });
        if (orders) setActiveOrders(orders);
      } catch (e) { console.warn('Erreur fetch orders:', e); }

    } catch (error) {
      console.error("Erreur critique dans loadData:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SENT': return { label: 'Envoyée', color: 'bg-amber-200 text-amber-900', icon: '⏳' };
      case 'PREPARING': return { label: 'En préparation', color: 'bg-blue-200 text-blue-900', icon: '🔪' };
      case 'READY': return { label: 'Prête', color: 'bg-emerald-200 text-emerald-900', icon: '✅' };
      case 'SERVED': return { label: 'Servie', color: 'bg-purple-200 text-purple-900', icon: '🍽️' };
      default: return { label: status, color: 'bg-slate-200 text-slate-900', icon: '' };
    }
  };

  // ✅ RÈGLE D'OR TURBOPACK : UNE SEULE INSTRUCTION RETURN À LA FIN
  // La structure racine <div className="p-4 lg:p-6 space-y-6"> est TOUJOURS rendue.
  return (
    <div className="p-4 lg:p-6 space-y-6">
      {loading || !profile ? (
        // État de chargement À L'INTÉRIEUR de la structure racine
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-slate-600 font-medium">Chargement du tableau de bord...</p>
          </div>
        </div>
      ) : (
        // Contenu principal du dashboard
        <>
          {/* Cartes de statistiques */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 text-emerald-700 mb-2">
                <TrendingUp className="w-5 h-5" />
                <span className="text-sm font-medium">Chiffre d'affaires</span>
              </div>
              <div className="text-2xl font-bold text-slate-900">{Number(stats.todayRevenue).toLocaleString('fr-FR')} F</div>
              <div className="text-xs text-slate-500 mt-1">Aujourd'hui</div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 text-blue-700 mb-2">
                <ShoppingCart className="w-5 h-5" />
                <span className="text-sm font-medium">Commandes payées</span>
              </div>
              <div className="text-2xl font-bold text-slate-900">{stats.todayOrders}</div>
              <div className="text-xs text-slate-500 mt-1">Aujourd'hui</div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 text-amber-700 mb-2">
                <Bell className="w-5 h-5" />
                <span className="text-sm font-medium">Commandes actives</span>
              </div>
              <div className="text-2xl font-bold text-slate-900">{stats.activeOrders}</div>
              <div className="text-xs text-slate-500 mt-1">En cours</div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 text-purple-700 mb-2">
                <Users className="w-5 h-5" />
                <span className="text-sm font-medium">Tables libres</span>
              </div>
              <div className="text-2xl font-bold text-slate-900">{stats.availableTables} / {stats.totalTables}</div>
              <div className="text-xs text-slate-500 mt-1">Disponibles</div>
            </div>
          </div>

          {/* Section Commandes en cours */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Bell className="w-5 h-5 text-amber-600" />
                Commandes en cours ({activeOrders.length})
              </h2>
              <button 
                onClick={() => router.push('/restaurant/salle')}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
              >
                Voir tout <Utensils className="w-4 h-4" />
              </button>
            </div>

            {activeOrders.length === 0 ? (
              <div className="text-center py-10 text-slate-500">
                <Coffee className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">Aucune commande active pour le moment</p>
                <p className="text-sm mt-1">Le calme avant la tempête !</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {activeOrders.map(order => {
                  const badge = getStatusBadge(order.status);
                  const locationLabel = order.restaurant_tables?.number 
                    ? `Table ${order.restaurant_tables.number}` 
                    : (order.order_type === 'ROOM_SERVICE' ? '🛎️ Chambre' : '🥡 À emporter');

                  return (
                    <button
                      key={order.id}
                      onClick={() => {
                        setSelectedOrderId(order.id);
                        setIsFloorOpen(true);
                      }}
                      className={`border-2 rounded-lg p-4 text-left hover:shadow-md transition-all cursor-pointer ${
                        order.status === 'SENT' ? 'bg-amber-50 border-amber-200 hover:border-amber-400' :
                        order.status === 'PREPARING' ? 'bg-blue-50 border-blue-200 hover:border-blue-400' :
                        order.status === 'READY' ? 'bg-emerald-50 border-emerald-200 hover:border-emerald-400' :
                        order.status === 'SERVED' ? 'bg-purple-50 border-purple-200 hover:border-purple-400' :
                        'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-bold text-slate-900 text-sm">{locationLabel}</div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${badge.color}`}>
                          {badge.icon} {badge.label}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 mb-2">
                        #{order.order_number} • {order.restaurant_employees?.first_name} {order.restaurant_employees?.last_name}
                      </div>
                      <div className="flex items-end justify-between">
                        <div className="text-lg font-bold text-slate-900">
                          {Number(order.total_amount).toLocaleString('fr-FR')} F
                        </div>
                        <div className="text-xs text-slate-500">
                          {new Date(order.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Modales (rendues en dehors du flux principal pour ne pas perturber le layout) */}
      {isCaisseOpen && (
        <RestaurantCaisseModal siteId={siteId} isOpen={isCaisseOpen} onClose={() => setIsCaisseOpen(false)} onSuccess={loadData} />
      )}
      {isMenuOpen && (
        <MenuManagerModal siteId={siteId} isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} onSuccess={loadData} />
      )}
      {isEmployeeOpen && (
        <EmployeeManagerModal siteId={siteId} isOpen={isEmployeeOpen} onClose={() => setIsEmployeeOpen(false)} onSuccess={loadData} />
      )}
      {isFloorOpen && (
        <FBFloorPlan
          siteId={siteId}
          isOpen={isFloorOpen}
          onClose={() => { setIsFloorOpen(false); setSelectedOrderId(null); }}
          onSuccess={() => { loadData(); setSelectedOrderId(null); }}
          preselectedOrderId={selectedOrderId}
        />
      )}
      {isKitchenOpen && (
        <FBKitchenDisplay siteId={siteId} isOpen={isKitchenOpen} onClose={() => setIsKitchenOpen(false)} />
      )}
    </div>
  );
}
