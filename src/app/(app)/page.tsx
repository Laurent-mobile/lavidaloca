'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import {
  Bed, Users, Calendar, DollarSign, TrendingUp, TrendingDown,
  ShoppingCart, ChefHat, AlertCircle, CheckCircle, Clock,
  ArrowRight, Wrench, FileText, Palmtree, Utensils, Wallet,
  Receipt, CreditCard, Banknote, CalendarDays
} from 'lucide-react';

type Period = 'day' | 'week' | 'month' | 'year';

export default function UnifiedDashboard() {
  const supabase = createClient();
  const [siteId, setSiteId] = useState('');
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('day');
  
  const [stats, setStats] = useState({
    totalRevenueToday: 0,
    hotelRevenueToday: 0,
    restoRevenueToday: 0,
    totalExpensesToday: 0,
    netCashFlow: 0,
    totalRooms: 0,
    occupiedRooms: 0,
    vacantRooms: 0,
    dirtyRooms: 0,
    todayCheckIns: 0,
    todayCheckOuts: 0,
    activeOrders: 0,
    kitchenOrders: 0,
    urgentMaintenance: 0,
  });

  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [periodLabel, setPeriodLabel] = useState('');

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('site_id').eq('id', user.id).maybeSingle();
      if (profile?.site_id) {
        setSiteId(profile.site_id);
        await loadDashboardData(profile.site_id, 'day');
      }
      setLoading(false);
    };
    init();
  }, []);

  // Calcul des dates selon la période
  const getPeriodDates = (p: Period) => {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);

    switch (p) {
      case 'day':
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'week':
        const day = now.getDay();
        const diffToMonday = day === 0 ? -6 : 1 - day;
        start.setDate(now.getDate() + diffToMonday);
        start.setHours(0, 0, 0, 0);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        break;
      case 'month':
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end.setMonth(now.getMonth() + 1);
        end.setDate(0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'year':
        start.setMonth(0, 1);
        start.setHours(0, 0, 0, 0);
        end.setMonth(11, 31);
        end.setHours(23, 59, 59, 999);
        break;
    }
    return { start, end };
  };

  const getPeriodLabel = (p: Period) => {
    const now = new Date();
    switch (p) {
      case 'day':
        return now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      case 'week': {
        const { start, end } = getPeriodDates(p);
        return `Semaine du ${start.toLocaleDateString('fr-FR')} au ${end.toLocaleDateString('fr-FR')}`;
      }
      case 'month':
        return now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      case 'year':
        return `Année ${now.getFullYear()}`;
    }
  };

  const loadDashboardData = async (sid: string, p: Period) => {
    setLoading(true);
    try {
      const { start, end } = getPeriodDates(p);
      const today = new Date().toISOString().split('T')[0];

      setPeriodLabel(getPeriodLabel(p));

      // 1. HÔTEL : Chambres (toujours en temps réel)
      const { data: rooms } = await supabase.from('rooms').select('status').eq('site_id', sid);
      const occupied = rooms?.filter(r => r.status === 'OCCUPIED').length || 0;
      const vacant = rooms?.filter(r => r.status === 'VACANT').length || 0;
      const dirty = rooms?.filter(r => r.status === 'DIRTY').length || 0;

      // 2. HÔTEL : Mouvements (filtrés par période)
      const { count: checkIns } = await supabase
        .from('reservations')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', sid)
        .gte('check_in_date', start.toISOString().split('T')[0])
        .lte('check_in_date', end.toISOString().split('T')[0])
        .in('status', ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT']);

      const { count: checkOuts } = await supabase
        .from('reservations')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', sid)
        .gte('check_out_date', start.toISOString().split('T')[0])
        .lte('check_out_date', end.toISOString().split('T')[0])
        .in('status', ['CHECKED_OUT']);

      // 3. RESTAURANT : Commandes actives (temps réel) + commandes de la période
      const { data: orders } = await supabase
        .from('restaurant_orders')
        .select('status, created_at')
        .eq('site_id', sid)
        .in('status', ['DRAFT', 'SENT', 'PREPARING', 'READY', 'SERVED']);
      const activeOrders = orders?.length || 0;
      const kitchenOrders = orders?.filter(o => o.status === 'PREPARING' || o.status === 'SENT').length || 0;

      // 4. FINANCES : CA Hôtel sur la période
      const { data: hotelPayments } = await supabase
        .from('cash_transactions')
        .select('amount')
        .eq('site_id', sid)
        .eq('type', 'INCOME')
        .eq('status', 'PAID')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString());
      const hotelRev = hotelPayments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;

      // 5. FINANCES : CA Restaurant sur la période
      const { data: restoPayments } = await supabase
        .from('restaurant_cash_transactions')
        .select('amount')
        .eq('site_id', sid)
        .eq('type', 'INCOME')
        .eq('status', 'PAID')
        .gte('transaction_date', start.toISOString())
        .lte('transaction_date', end.toISOString());
      const restoRev = restoPayments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;

      // 6. FINANCES : Dépenses sur la période
      const { data: expenses } = await supabase
        .from('expenses')
        .select('amount')
        .eq('site_id', sid)
        .gte('date', start.toISOString().split('T')[0])
        .lte('date', end.toISOString().split('T')[0]);
      const totalExpenses = expenses?.reduce((sum, e) => sum + Number(e.amount || 0), 0) || 0;

      // 7. ALERTES : Maintenance urgente (toujours en temps réel)
      const { count: maint } = await supabase
        .from('maintenance_requests')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', sid)
        .in('status', ['PENDING', 'IN_PROGRESS'])
        .eq('priority', 'URGENT');

      // 8. ACTIVITÉ RÉCENTE : Transactions de la période
      const { data: recentTrans } = await supabase
        .from('cash_transactions')
        .select('*')
        .eq('site_id', sid)
        .eq('status', 'PAID')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false })
        .limit(10);

      const recent = (recentTrans || []).map(t => ({
        id: t.id,
        type: t.type === 'INCOME' ? 'income' : 'expense',
        text: `${t.type === 'INCOME' ? '💰 Encaissement' : '💸 Dépense'} : ${t.description || 'Sans description'}${t.room_number ? ` (Ch. ${t.room_number})` : ''}`,
        time: new Date(t.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
        amount: t.amount,
        icon: t.type === 'INCOME' ? DollarSign : TrendingDown,
        color: t.type === 'INCOME' ? 'text-emerald-600' : 'text-red-600',
        bg: t.type === 'INCOME' ? 'bg-emerald-100' : 'bg-red-100'
      }));

      setStats({
        totalRooms: rooms?.length || 0,
        occupiedRooms: occupied,
        vacantRooms: vacant,
        dirtyRooms: dirty,
        todayCheckIns: checkIns || 0,
        todayCheckOuts: checkOuts || 0,
        activeOrders,
        kitchenOrders,
        hotelRevenueToday: hotelRev,
        restoRevenueToday: restoRev,
        totalRevenueToday: hotelRev + restoRev,
        totalExpensesToday: totalExpenses,
        netCashFlow: (hotelRev + restoRev) - totalExpenses,
        urgentMaintenance: maint || 0,
      });
      
      setRecentActivity(recent);

    } catch (error) {
      console.error('Erreur chargement dashboard:', error);
    }
    setLoading(false);
  };

  const occupancyRate = stats.totalRooms > 0 ? Math.round((stats.occupiedRooms / stats.totalRooms) * 100) : 0;

  const handlePeriodChange = (p: Period) => {
    setPeriod(p);
    if (siteId) loadDashboardData(siteId, p);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 font-medium">Chargement du tableau de bord...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* En-tête avec sélecteur de période */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
  <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
    <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center p-1 shadow-sm border border-slate-200">
      <img
        src="/logo.png"
        alt="LA VIDA-LOCA"
        className="w-full h-full object-contain"
      />
    </div>
    Tableau de bord unifié
  </h1>
  <p className="text-sm text-slate-500 mt-1">
    Vue d'ensemble financière et opérationnelle • <span className="font-medium text-slate-700">{periodLabel}</span>
  </p>
</div>
        <div className="flex items-center gap-2">
          {/* ✅ Sélecteur de période */}
          <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
            {([
              { id: 'day', label: 'Jour', icon: CalendarDays },
              { id: 'week', label: 'Semaine', icon: Calendar },
              { id: 'month', label: 'Mois', icon: Calendar },
              { id: 'year', label: 'Année', icon: Calendar },
            ] as const).map(p => {
              const Icon = p.icon;
              return (
                <button
                  key={p.id}
                  onClick={() => handlePeriodChange(p.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    period === p.id
                      ? 'bg-white text-indigo-700 shadow-sm border border-indigo-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {p.label}
                </button>
              );
            })}
          </div>
          <button onClick={() => loadDashboardData(siteId, period)} className="flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <TrendingUp className="w-4 h-4" /> Actualiser
          </button>
        </div>
      </div>

      {/* 💰 KPIs FINANCIERS GLOBAUX */}
      <div>
        <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          <DollarSign className="w-4 h-4" /> Performance financière {period === 'day' ? 'du jour' : period === 'week' ? 'de la semaine' : period === 'month' ? 'du mois' : 'de l\'année'}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard 
            icon={DollarSign} 
            label="Chiffre d'affaires" 
            value={`${stats.totalRevenueToday.toLocaleString('fr-FR')} F`} 
            subValue={`Hôtel: ${stats.hotelRevenueToday.toLocaleString('fr-FR')} F • Resto: ${stats.restoRevenueToday.toLocaleString('fr-FR')} F`}
            color="emerald" 
            trend="up"
          />
          <KPICard 
            icon={TrendingDown} 
            label="Dépenses" 
            value={`${stats.totalExpensesToday.toLocaleString('fr-FR')} F`} 
            subValue="Toutes catégories confondues"
            color="red" 
          />
          <KPICard 
            icon={Wallet} 
            label="Flux net de trésorerie" 
            value={`${stats.netCashFlow.toLocaleString('fr-FR')} F`} 
            subValue={stats.netCashFlow >= 0 ? '✅ Excédentaire' : '⚠️ Déficitaire'}
            color={stats.netCashFlow >= 0 ? "blue" : "red"} 
          />
          <KPICard 
            icon={Bed} 
            label="Taux d'occupation" 
            value={`${occupancyRate}%`} 
            subValue={`${stats.occupiedRooms} / ${stats.totalRooms} chambres`}
            color="indigo" 
          />
        </div>
      </div>

      {/* 📊 RÉPARTITION FINANCIÈRE DÉTAILLÉE */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hôtel */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <span className="p-2 bg-indigo-100 rounded-lg"><Bed className="w-4 h-4 text-indigo-600" /></span>
              Hôtel
            </h3>
            <Link href="/hotel/caisse" className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
              Détails <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            <FinanceRow icon={Banknote} label="CA Hôtel" value={stats.hotelRevenueToday} color="emerald" />
            <FinanceRow icon={Users} label="Arrivées" value={stats.todayCheckIns} color="blue" isCount />
            <FinanceRow icon={Calendar} label="Départs" value={stats.todayCheckOuts} color="purple" isCount />
            <div className="pt-3 border-t border-slate-100">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-slate-600">Taux d'occupation</span>
                <span className="text-sm font-bold text-slate-900">{occupancyRate}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 mt-2">
                <div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${occupancyRate}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Restaurant */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <span className="p-2 bg-amber-100 rounded-lg"><Utensils className="w-4 h-4 text-amber-600" /></span>
              Restaurant
            </h3>
            <Link href="/restaurant/caisse" className="text-xs font-medium text-amber-600 hover:text-amber-800 flex items-center gap-1">
              Détails <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            <FinanceRow icon={Banknote} label="CA Restaurant" value={stats.restoRevenueToday} color="emerald" />
            <FinanceRow icon={ShoppingCart} label="Commandes actives" value={stats.activeOrders} color="indigo" isCount />
            <FinanceRow icon={ChefHat} label="En cuisine" value={stats.kitchenOrders} color="amber" isCount />
            <div className="pt-3 border-t border-slate-100">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-slate-600">Part du CA total</span>
                <span className="text-sm font-bold text-slate-900">
                  {stats.totalRevenueToday > 0 ? Math.round((stats.restoRevenueToday / stats.totalRevenueToday) * 100) : 0}%
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 mt-2">
                <div 
                  className="bg-amber-500 h-2 rounded-full" 
                  style={{ width: `${stats.totalRevenueToday > 0 ? (stats.restoRevenueToday / stats.totalRevenueToday) * 100 : 0}%` }} 
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 📋 Flux financier & Indicateurs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alertes & Indicateurs */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> Indicateurs clés
          </h3>
          
          <div className={`rounded-xl border-2 p-4 ${stats.urgentMaintenance > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
            <div className="flex items-center gap-3">
              <Wrench className={`w-6 h-6 ${stats.urgentMaintenance > 0 ? 'text-red-600' : 'text-emerald-600'}`} />
              <div>
                <div className="text-xs font-medium opacity-80">Maintenance urgente</div>
                <div className={`text-2xl font-bold ${stats.urgentMaintenance > 0 ? 'text-red-900' : 'text-emerald-900'}`}>
                  {stats.urgentMaintenance}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <Bed className="w-6 h-6 text-blue-600" />
              <div>
                <div className="text-xs font-medium text-blue-700">Chambres libres</div>
                <div className="text-2xl font-bold text-blue-900">{stats.vacantRooms}</div>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <Clock className="w-6 h-6 text-amber-600" />
              <div>
                <div className="text-xs font-medium text-amber-700">Chambres à nettoyer</div>
                <div className="text-2xl font-bold text-amber-900">{stats.dirtyRooms}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Activité financière récente */}
        <div className="lg:col-span-2">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4" /> Flux financier {period === 'day' ? 'du jour' : period === 'week' ? 'de la semaine' : period === 'month' ? 'du mois' : 'de l\'année'}
          </h3>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {recentActivity.length > 0 ? recentActivity.map((activity, idx) => (
              <div key={activity.id} className={`flex items-center gap-4 p-4 ${idx !== recentActivity.length - 1 ? 'border-b border-slate-100' : ''}`}>
                <div className={`p-2 rounded-full ${activity.bg} flex-shrink-0`}>
                  <activity.icon className={`w-4 h-4 ${activity.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{activity.text}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{activity.time}</p>
                </div>
                <div className={`font-bold text-sm ${activity.type === 'income' ? 'text-emerald-700' : 'text-red-700'}`}>
                  {activity.type === 'income' ? '+' : '-'}{Number(activity.amount).toLocaleString('fr-FR')} F
                </div>
              </div>
            )) : (
              <div className="p-8 text-center text-slate-500 text-sm">
                Aucune transaction financière sur cette période
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Composants réutilisables ---

function KPICard({ icon: Icon, label, value, subValue, color, trend }: any) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    red: 'bg-red-50 border-red-200 text-red-900',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-900',
  };
  const iconColors: Record<string, string> = {
    emerald: 'text-emerald-600', blue: 'text-blue-600', amber: 'text-amber-600', red: 'text-red-600', indigo: 'text-indigo-600'
  };

  return (
    <div className={`rounded-xl border-2 p-5 ${colors[color]} transition-shadow hover:shadow-md`}>
      <div className="flex items-center justify-between mb-3">
        <Icon className={`w-6 h-6 ${iconColors[color]}`} />
        {trend === 'up' && <TrendingUp className="w-4 h-4 text-emerald-600" />}
      </div>
      <div className="text-2xl font-bold mb-1">{value}</div>
      <div className="text-xs font-medium opacity-80">{label}</div>
      {subValue && <div className="text-[10px] opacity-60 mt-1 leading-tight">{subValue}</div>}
    </div>
  );
}

function FinanceRow({ icon: Icon, label, value, color, isCount }: any) {
  const colors: Record<string, string> = {
    emerald: 'text-emerald-700', blue: 'text-blue-700', amber: 'text-amber-700', 
    indigo: 'text-indigo-700', purple: 'text-purple-700', red: 'text-red-700'
  };
  return (
    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
      <div className="flex items-center gap-3">
        <Icon className={`w-4 h-4 ${colors[color]}`} />
        <span className="text-sm font-medium text-slate-700">{label}</span>
      </div>
      <span className={`font-bold ${isCount ? 'text-slate-900' : 'text-emerald-900'}`}>
        {isCount ? value : `${Number(value).toLocaleString('fr-FR')} F`}
      </span>
    </div>
  );
}
