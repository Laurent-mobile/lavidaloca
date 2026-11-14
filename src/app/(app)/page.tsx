'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Bed, Users, Calendar, DollarSign, TrendingUp,
  ShoppingCart, ChefHat, AlertCircle
} from 'lucide-react';

export default function UnifiedDashboard() {
  const supabase = createClient();
  const [siteId, setSiteId] = useState('');
  const [stats, setStats] = useState({
    // Hôtel
    totalRooms: 0,
    occupiedRooms: 0,
    vacantRooms: 0,
    todayCheckIns: 0,
    todayCheckOuts: 0,
    // Restaurant
    activeOrders: 0,
    todayRevenue: 0,
    pendingPayments: 0,
  });

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('site_id').eq('id', user.id).maybeSingle();
      if (profile?.site_id) {
        setSiteId(profile.site_id);
        loadStats(profile.site_id);
      }
    };
    init();
  }, []);

  const loadStats = async (sid: string) => {
    try {
      // Hôtel : chambres
      const { data: rooms } = await supabase.from('rooms').select('status').eq('site_id', sid);
      const occupied = rooms?.filter(r => r.status === 'OCCUPIED').length || 0;
      const vacant = rooms?.filter(r => r.status === 'VACANT').length || 0;

      // Hôtel : arrivées/départs du jour
      const today = new Date().toISOString().split('T')[0];
      const { count: checkIns } = await supabase.from('reservations').select('*', { count: 'exact', head: true }).eq('site_id', sid).eq('check_in_date', today).eq('status', 'CONFIRMED');
      const { count: checkOuts } = await supabase.from('reservations').select('*', { count: 'exact', head: true }).eq('site_id', sid).eq('check_out_date', today).eq('status', 'CHECKED_IN');

      // Restaurant : commandes actives
      const { count: activeOrders } = await supabase.from('restaurant_orders').select('*', { count: 'exact', head: true }).eq('site_id', sid).in('status', ['DRAFT', 'SENT', 'PREPARING', 'READY', 'SERVED']);

      // Restaurant : CA du jour
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const { data: payments } = await supabase.from('restaurant_cash_transactions').select('amount').eq('site_id', sid).eq('type', 'INCOME').eq('status', 'PAID').gte('transaction_date', startOfDay.toISOString());
      const todayRevenue = payments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;

      setStats({
        totalRooms: rooms?.length || 0,
        occupiedRooms: occupied,
        vacantRooms: vacant,
        todayCheckIns: checkIns || 0,
        todayCheckOuts: checkOuts || 0,
        activeOrders: activeOrders || 0,
        todayRevenue,
        pendingPayments: 0,
      });
    } catch (error) {
      console.error('Erreur stats:', error);
    }
  };

  const occupancyRate = stats.totalRooms > 0 ? Math.round((stats.occupiedRooms / stats.totalRooms) * 100) : 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Tableau de bord unifié</h1>
        <p className="text-sm text-slate-500 mt-1">Vue d'ensemble Hôtel & Restaurant</p>
      </div>

      {/* 🏨 Section Hôtel */}
      <div>
        <h2 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
          <span className="text-2xl">🏨</span> Hôtel
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <StatCard icon={Bed} label="Chambres totales" value={stats.totalRooms} color="slate" />
          <StatCard icon={Users} label="Occupées" value={stats.occupiedRooms} color="blue" />
          <StatCard icon={Bed} label="Libres" value={stats.vacantRooms} color="emerald" />
          <StatCard icon={Calendar} label="Arrivées aujourd'hui" value={stats.todayCheckIns} color="amber" />
          <StatCard icon={Calendar} label="Départs aujourd'hui" value={stats.todayCheckOuts} color="purple" />
        </div>
        <div className="mt-4 bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">Taux d'occupation</span>
            <span className="text-xl font-bold text-slate-900">{occupancyRate}%</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2.5">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2.5 rounded-full" style={{ width: `${occupancyRate}%` }} />
          </div>
        </div>
      </div>

      {/* 🍽️ Section Restaurant */}
      <div>
        <h2 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
          <span className="text-2xl">🍽️</span> Restaurant
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={ShoppingCart} label="Commandes actives" value={stats.activeOrders} color="indigo" />
          <StatCard icon={DollarSign} label="CA aujourd'hui" value={`${stats.todayRevenue.toLocaleString('fr-FR')} F`} color="emerald" />
          <StatCard icon={ChefHat} label="En cuisine" value="—" color="amber" />
          <StatCard icon={AlertCircle} label="Paiements en attente" value={stats.pendingPayments} color="red" />
        </div>
      </div>

      {/* Actions rapides */}
      <div>
        <h2 className="text-lg font-bold text-slate-800 mb-3">⚡ Actions rapides</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickAction emoji="🛏️" label="Nouvelle réservation" href="/hotel/reservations" color="indigo" />
          <QuickAction emoji="🍽️" label="Nouvelle commande" href="/restaurant/commandes" color="emerald" />
          <QuickAction emoji="💰" label="Ouvrir la caisse" href="/hotel/caisse" color="amber" />
          <QuickAction emoji="📊" label="Rapports" href="/hotel/rapports" color="purple" />
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: any; color: string }) {
  const colors: Record<string, string> = {
    slate: 'bg-slate-50 border-slate-200 text-slate-900',
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    purple: 'bg-purple-50 border-purple-200 text-purple-900',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-900',
    red: 'bg-red-50 border-red-200 text-red-900',
  };
  return (
    <div className={`rounded-xl border-2 p-4 ${colors[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <Icon className="w-5 h-5 opacity-70" />
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs opacity-80 mt-1">{label}</div>
    </div>
  );
}

function QuickAction({ emoji, label, href, color }: { emoji: string; label: string; href: string; color: string }) {
  const colors: Record<string, string> = {
    indigo: 'bg-indigo-600 hover:bg-indigo-700',
    emerald: 'bg-emerald-600 hover:bg-emerald-700',
    amber: 'bg-amber-600 hover:bg-amber-700',
    purple: 'bg-purple-600 hover:bg-purple-700',
  };
  return (
    <a href={href} className={`${colors[color]} text-white rounded-xl p-4 text-center transition-colors shadow-sm hover:shadow-md`}>
      <div className="text-3xl mb-2">{emoji}</div>
      <div className="text-sm font-medium">{label}</div>
    </a>
  );
}
