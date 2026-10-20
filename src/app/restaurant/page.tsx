'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import {
  Utensils, Coffee, Users, DollarSign, TrendingUp, TrendingDown,
  ChefHat, FileText, LogOut, Bell, ShoppingCart,
  UserCheck, LayoutGrid
} from 'lucide-react';
import RestaurantCaisseModal from '@/components/RestaurantCaisseModal';
import MenuManagerModal from '@/components/MenuManagerModal';
import EmployeeManagerModal from '@/components/EmployeeManagerModal';
import SupplierManagerModal from '@/components/SupplierManagerModal';
import FBFloorPlan from '@/components/FBFloorPlan';
import FBKitchenDisplay from '@/components/FBKitchenDisplay';

//export const dynamic = 'force-dynamic';

export default function RestaurantDashboard() {
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [siteId, setSiteId] = useState<string>('');
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [isCaisseOpen, setIsCaisseOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEmployeeOpen, setIsEmployeeOpen] = useState(false);
  const [isSupplierOpen, setIsSupplierOpen] = useState(false);
  const [isFloorOpen, setIsFloorOpen] = useState(false);
  const [isKitchenOpen, setIsKitchenOpen] = useState(false);
  const [activeOrders, setActiveOrders] = useState<any[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

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

      const { data: profile } = await supabase
        .from('profiles')
        .select('*, sites(id, name)')
        .eq('id', user.id)
        .single();

      if (!profile) {
        setLoading(false);
        return;
      }
      setProfile(profile);
      setSiteId(profile.sites.id);

      const today = new Date().toISOString().split('T')[0];
      const startOfDay = new Date(today);
      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);

      let todayOrders = 0;
      try {
        const { count } = await supabase
          .from('restaurant_orders')
          .select('*', { count: 'exact', head: true })
          .eq('site_id', profile.sites.id)
          .eq('status', 'PAID')
          .gte('created_at', startOfDay.toISOString())
          .lte('created_at', endOfDay.toISOString());
        todayOrders = count || 0;
      } catch (e) { console.warn('Erreur stats orders:', e); }

      let todayRevenue = 0;
      try {
        const { data } = await supabase
          .from('restaurant_cash_transactions')
          .select('amount')
          .eq('site_id', profile.sites.id)
          .eq('type', 'INCOME')
          .eq('status', 'PAID')
          .gte('transaction_date', startOfDay.toISOString())
          .lte('transaction_date', endOfDay.toISOString());
        todayRevenue = data?.reduce((sum: number, t: any) => sum + Number(t.amount), 0) || 0;
      } catch (e) { console.warn('Erreur stats revenue:', e); }

      let activeOrdersCount = 0;
      try {
        const { count } = await supabase
          .from('restaurant_orders')
          .select('*', { count: 'exact', head: true })
          .eq('site_id', profile.sites.id)
          .in('status', ['SENT', 'PREPARING', 'READY', 'SERVED']);
        activeOrdersCount = count || 0;
      } catch (e) { console.warn('Erreur stats active:', e); }

      let availableTables = 0;
      let totalTables = 0;
      try {
        const { count: avail } = await supabase
          .from('restaurant_tables')
          .select('*', { count: 'exact', head: true })
          .eq('site_id', profile.sites.id)
          .eq('status', 'AVAILABLE');
        const { count: total } = await supabase
          .from('restaurant_tables')
          .select('*', { count: 'exact', head: true })
          .eq('site_id', profile.sites.id);
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

      try {
        const { data: orders } = await supabase
          .from('restaurant_orders')
          .select(`
            id, order_number, status, total_amount, created_at, order_type,
            restaurant_tables(number),
            restaurant_employees(first_name, last_name)
          `)
          .eq('site_id', profile.sites.id)
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

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-600">Chargement...</p>
        </div>
      </div>
    );
  }

  const roleLabels: Record<string, string> = {
    RESTAURANT_CASHIER: 'Caissier Restaurant',
    RESTAURANT_MANAGER: 'Manager Restaurant',
    SERVER: 'Serveur',
    CHEF: 'Chef',
    DIRECTOR: 'Directeur',
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

  return (
    <main className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50">
      <header className="bg-gradient-to-r from-amber-700 to-orange-800 text-white px-6 py-4 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-lg">
              <Utensils className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">LA VIDA-LOCA</h1>
              <p className="text-xs text-amber-100">
                Restaurant • {profile.sites.name} • {roleLabels[profile.role] || profile.role}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsKitchenOpen(true)}
              className="flex items-center gap-2 bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              <ChefHat className="w-5 h-5" />
              <span className="hidden sm:inline">Cuisine</span>
              {stats.activeOrders > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {stats.activeOrders}
                </span>
              )}
            </button>
            <button
              onClick={() => { setIsFloorOpen(true); setSelectedOrderId(null); }}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              <LayoutGrid className="w-5 h-5" />
              <span className="hidden sm:inline">Plan de salle</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-slate-600">Chargement du dashboard...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-xl shadow-sm border-2 border-emerald-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                  <span className="text-xs font-medium text-emerald-700">Chiffre d'affaires</span>
                </div>
                <div className="text-2xl font-bold text-emerald-900">
                  {Number(stats.todayRevenue).toLocaleString('fr-FR')} F
                </div>
                <div className="text-xs text-slate-500 mt-1">Aujourd'hui</div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border-2 border-blue-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ShoppingCart className="w-5 h-5 text-blue-600" />
                  <span className="text-xs font-medium text-blue-700">Commandes payées</span>
                </div>
                <div className="text-2xl font-bold text-blue-900">{stats.todayOrders}</div>
                <div className="text-xs text-slate-500 mt-1">Aujourd'hui</div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border-2 border-amber-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Bell className="w-5 h-5 text-amber-600" />
                  <span className="text-xs font-medium text-amber-700">Commandes actives</span>
                </div>
                <div className="text-2xl font-bold text-amber-900">{stats.activeOrders}</div>
                <div className="text-xs text-slate-500 mt-1">En cours</div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border-2 border-purple-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-5 h-5 text-purple-600" />
                  <span className="text-xs font-medium text-purple-700">Tables libres</span>
                </div>
                <div className="text-2xl font-bold text-purple-900">
                  {stats.availableTables} / {stats.totalTables}
                </div>
                <div className="text-xs text-slate-500 mt-1">Disponibles</div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <button
                onClick={() => { setIsFloorOpen(true); setSelectedOrderId(null); }}
                className="bg-white hover:bg-amber-50 border-2 border-amber-300 rounded-xl p-6 text-left transition-all hover:shadow-lg"
              >
                <LayoutGrid className="w-10 h-10 text-amber-600 mb-2" />
                <div className="font-bold text-slate-900">Plan de salle</div>
                <div className="text-xs text-slate-600 mt-1">Gérer les tables & commandes</div>
              </button>

              <button
                onClick={() => setIsCaisseOpen(true)}
                className="bg-white hover:bg-emerald-50 border-2 border-emerald-300 rounded-xl p-6 text-left transition-all hover:shadow-lg"
              >
                <DollarSign className="w-10 h-10 text-emerald-600 mb-2" />
                <div className="font-bold text-slate-900">Caisse Restaurant</div>
                <div className="text-xs text-slate-600 mt-1">Encaissements & rapports</div>
              </button>

              <button
                onClick={() => setIsMenuOpen(true)}
                className="bg-white hover:bg-blue-50 border-2 border-blue-300 rounded-xl p-6 text-left transition-all hover:shadow-lg"
              >
                <FileText className="w-10 h-10 text-blue-600 mb-2" />
                <div className="font-bold text-slate-900">Menus & Articles</div>
                <div className="text-xs text-slate-600 mt-1">Gérer la carte</div>
              </button>

              <button
                onClick={() => setIsEmployeeOpen(true)}
                className="bg-white hover:bg-purple-50 border-2 border-purple-300 rounded-xl p-6 text-left transition-all hover:shadow-lg"
              >
                <UserCheck className="w-10 h-10 text-purple-600 mb-2" />
                <div className="font-bold text-slate-900">Employés</div>
                <div className="text-xs text-slate-600 mt-1">Serveurs & personnel</div>
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Bell className="w-5 h-5 text-amber-600" />
                Commandes en cours ({activeOrders.length})
                <span className="text-xs font-normal text-slate-500 ml-2">• Cliquez sur une carte pour modifier ou envoyer à la caisse</span>
              </h2>

              {activeOrders.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Coffee className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                  <p>Aucune commande active</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {activeOrders.map(order => {
                    const badge = getStatusBadge(order.status);
                    const isReadyForPayment = order.status === 'READY' || order.status === 'SERVED';
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
                        className={`border-2 rounded-lg p-4 text-left hover:shadow-lg transition-all cursor-pointer ${
                          order.status === 'SENT' ? 'bg-amber-50 border-amber-300 hover:border-amber-500' :
                          order.status === 'PREPARING' ? 'bg-blue-50 border-blue-300 hover:border-blue-500' :
                          order.status === 'READY' ? 'bg-emerald-50 border-emerald-300 hover:border-emerald-500' :
                          order.status === 'SERVED' ? 'bg-purple-50 border-purple-300 hover:border-purple-500' :
                          'bg-slate-50 border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-bold text-slate-900">{locationLabel}</div>
                          <span className={`text-xs px-2 py-1 rounded font-medium ${badge.color}`}>
                            {badge.icon} {badge.label}
                          </span>
                        </div>
                        <div className="text-xs text-slate-600">
                          #{order.order_number} • {order.restaurant_employees?.first_name} {order.restaurant_employees?.last_name}
                        </div>
                        <div className="text-sm font-bold text-slate-900 mt-2">
                          {Number(order.total_amount).toLocaleString('fr-FR')} F
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {new Date(order.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </div>

                        {isReadyForPayment && (
                          <div className="mt-2 pt-2 border-t border-current/20">
                            <div className="text-xs font-semibold flex items-center justify-between">
                              <span className="text-emerald-700">💰 Prête à payer</span>
                              <span className="bg-emerald-600 text-white px-2 py-0.5 rounded text-[10px]">
                                CLIQUER →
                              </span>
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {profile.role === 'DIRECTOR' && (
              <div className="mt-6 bg-indigo-50 border-2 border-indigo-200 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-600 text-white p-2 rounded-lg">
                    <Utensils className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="font-bold text-indigo-900">Mode Directeur</div>
                    <div className="text-xs text-indigo-700">Vous avez accès aux deux modules</div>
                  </div>
                </div>
                <button
                  onClick={() => router.push('/')}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2"
                >
                  <span></span>
                  Aller au module Hôtel
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {isCaisseOpen && (
        <RestaurantCaisseModal
          siteId={siteId}
          isOpen={isCaisseOpen}
          onClose={() => setIsCaisseOpen(false)}
          onSuccess={loadData}
        />
      )}
      {isMenuOpen && (
        <MenuManagerModal
          siteId={siteId}
          isOpen={isMenuOpen}
          onClose={() => setIsMenuOpen(false)}
          onSuccess={loadData}
        />
      )}
      {isEmployeeOpen && (
        <EmployeeManagerModal
          siteId={siteId}
          isOpen={isEmployeeOpen}
          onClose={() => setIsEmployeeOpen(false)}
          onSuccess={loadData}
        />
      )}
      {isSupplierOpen && (
        <SupplierManagerModal
          siteId={siteId}
          isOpen={isSupplierOpen}
          onClose={() => setIsSupplierOpen(false)}
          onSuccess={loadData}
        />
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
        <FBKitchenDisplay
          siteId={siteId}
          isOpen={isKitchenOpen}
          onClose={() => setIsKitchenOpen(false)}
        />
      )}
    </main>
  );
}
