'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  DollarSign, TrendingDown, TrendingUp, BarChart3,
  ShoppingCart, AlertTriangle, Tag, Clock,
} from 'lucide-react';

type Period = 'today' | 'week' | 'month' | 'year';

const money = (n: number) => Number(n || 0).toLocaleString('fr-FR');

interface CategoryData {
  name: string;
  value: number;
  percent: string;
}

interface TopItem {
  name: string;
  qty: number;
  total: number;
}

interface PaymentMethod {
  name: string;
  value: number;
}

export default function DashboardPage() {
  const supabase = createClient();
  const [siteId, setSiteId] = useState('');
  const [period, setPeriod] = useState<Period>('today');
  const [loading, setLoading] = useState(true);

  const [kpi, setKpi] = useState({
    totalSales: 0, transactions: 0,
    totalExpenses: 0, revenue: 0, netProfit: 0, margin: 0,
    activeOrders: 0, lowStock: 0, totalSales_count: 0, avgBasket: 0,
    mediumStock: 0, goodStock: 0
  });
  
  const [categoryData, setCategoryData] = useState<CategoryData[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('site_id').eq('id', user.id).maybeSingle();
      if (data?.site_id) setSiteId(data.site_id);
    })();
  }, []);

  useEffect(() => {
    if (siteId) loadDashboard();
  }, [siteId, period]);

  const getDateRange = () => {
    const now = new Date();
    let start = new Date();
    if (period === 'today') start.setHours(0, 0, 0, 0);
    else if (period === 'week') start.setDate(now.getDate() - 7);
    else if (period === 'month') start.setMonth(now.getMonth() - 1);
    else if (period === 'year') start.setFullYear(now.getFullYear() - 1);
    return { start: start.toISOString(), end: now.toISOString() };
  };

  const loadDashboard = async () => {
    setLoading(true);
    const { start, end } = getDateRange();

    try {
      const { data: paidOrders } = await supabase
        .from('restaurant_orders')
        .select('*, restaurant_order_items(item_name, quantity, unit_price, total_price)')
        .eq('site_id', siteId)
        .eq('status', 'PAID')
        .gte('paid_at', start)
        .lte('paid_at', end);

      const { data: activeOrders } = await supabase
        .from('restaurant_orders')
        .select('id')
        .eq('site_id', siteId)
        .in('status', ['DRAFT', 'SENT', 'PREPARING', 'READY', 'SERVED']);

      const { data: expenses } = await supabase
        .from('expenses')
        .select('*')
        .eq('site_id', siteId)
        .gte('created_at', start)
        .lte('created_at', end);

      const { data: stockItems } = await supabase
        .from('stock_items')
        .select('id, name, current_stock, min_stock')
        .eq('site_id', siteId);

      const totalSales = paidOrders?.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0) || 0;
      const transactions = paidOrders?.length || 0;
      const totalExpenses = expenses?.reduce((s: number, e: any) => s + Number(e.amount || 0), 0) || 0;
      const revenue = totalSales;
      const netProfit = revenue - totalExpenses;
      const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
      const avgBasket = transactions > 0 ? totalSales / transactions : 0;

      const lowStock = stockItems?.filter((s: any) => (s.current_stock || 0) <= (s.min_stock || 0)).length || 0;
      const mediumStock = stockItems?.filter((s: any) => {
        const cur = s.current_stock || 0;
        const min = s.min_stock || 0;
        return cur > min && cur <= min * 3;
      }).length || 0;
      const goodStock = stockItems?.filter((s: any) => (s.current_stock || 0) > (s.min_stock || 0) * 3).length || 0;

      setKpi({
        totalSales, transactions, totalExpenses, revenue, netProfit, margin,
        activeOrders: activeOrders?.length || 0, lowStock, totalSales_count: transactions, avgBasket,
        mediumStock, goodStock
      });

      const byCategory: Record<string, number> = {};
      paidOrders?.forEach((o: any) => {
        o.restaurant_order_items?.forEach((item: any) => {
          const cat = item.item_name?.split(' ')[0] || 'Autres';
          byCategory[cat] = (byCategory[cat] || 0) + Number(item.total_price || 0);
        });
      });
      const totalCat = Object.values(byCategory).reduce((a, b) => a + b, 0);
      setCategoryData(
        Object.entries(byCategory)
          .map(([name, value]) => ({ name, value, percent: totalCat > 0 ? ((value / totalCat) * 100).toFixed(1) : '0' }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 5)
      );

      const itemSales: Record<string, { qty: number; total: number }> = {};
      paidOrders?.forEach((o: any) => {
        o.restaurant_order_items?.forEach((item: any) => {
          if (!itemSales[item.item_name]) itemSales[item.item_name] = { qty: 0, total: 0 };
          itemSales[item.item_name].qty += item.quantity;
          itemSales[item.item_name].total += Number(item.total_price || 0);
        });
      });
      setTopItems(
        Object.entries(itemSales)
          .map(([name, data]) => ({ name, qty: data.qty, total: data.total }))
          .sort((a, b) => b.qty - a.qty)
          .slice(0, 5)
      );

      const { data: payments } = await supabase
        .from('restaurant_payments')
        .select('method, amount')
        .eq('site_id', siteId)
        .gte('paid_at', start)
        .lte('paid_at', end);

      const byMethod: Record<string, number> = {};
      payments?.forEach((p: any) => {
        byMethod[p.method] = (byMethod[p.method] || 0) + Number(p.amount || 0);
      });
      setPaymentMethods(Object.entries(byMethod).map(([name, value]) => ({ name, value })));

    } catch (error) {
      console.error('Erreur dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 bg-slate-50 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">LA VIDA LOCA</h1>
          <p className="text-slate-500 capitalize">{today}</p>
        </div>
        <div className="flex bg-white rounded-lg border border-slate-200 p-1">
          {([['today', "Aujourd'hui"], ['week', 'Semaine'], ['month', 'Mois'], ['year', 'Année']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPeriod(key as Period)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${period === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-blue-500 rounded-xl p-5 text-white shadow-lg">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm opacity-90">Total des ventes</div>
              <div className="text-3xl font-bold mt-2">{money(kpi.totalSales)} F</div>
              <div className="text-xs opacity-90 mt-1">{kpi.transactions} transactions</div>
            </div>
            <DollarSign className="w-10 h-10 opacity-80" />
          </div>
        </div>
        <div className="bg-red-500 rounded-xl p-5 text-white shadow-lg">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm opacity-90">Total des dépenses</div>
              <div className="text-3xl font-bold mt-2">{money(kpi.totalExpenses)} F</div>
              <div className="text-xs opacity-90 mt-1">Coûts opérationnels</div>
            </div>
            <TrendingDown className="w-10 h-10 opacity-80" />
          </div>
        </div>
        <div className="bg-emerald-500 rounded-xl p-5 text-white shadow-lg">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm opacity-90">Chiffre d'affaires</div>
              <div className="text-3xl font-bold mt-2">{money(kpi.revenue)} F</div>
              <div className="text-xs opacity-90 mt-1">Ventes totales</div>
            </div>
            <BarChart3 className="w-10 h-10 opacity-80" />
          </div>
        </div>
        <div className="bg-emerald-600 rounded-xl p-5 text-white shadow-lg">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm opacity-90">Bénéfice net</div>
              <div className="text-3xl font-bold mt-2">{money(kpi.netProfit)} F</div>
              <div className="text-xs opacity-90 mt-1">Marge: {kpi.margin.toFixed(1)}%</div>
            </div>
            <TrendingUp className="w-10 h-10 opacity-80" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-slate-900">Commandes actives</div>
            <Clock className="w-5 h-5 text-orange-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{kpi.activeOrders}</div>
          <div className="text-xs text-slate-500 mt-1">En cours de préparation</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-slate-900">Stock faible</div>
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600">{kpi.lowStock}</div>
          <div className="text-xs text-slate-500 mt-1">Articles à réapprovisionner</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-slate-900">Nombre de ventes</div>
            <Tag className="w-5 h-5 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-purple-600">{kpi.totalSales_count}</div>
          <div className="text-xs text-slate-500 mt-1">Transactions effectuées</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-slate-900">Panier moyen</div>
            <ShoppingCart className="w-5 h-5 text-cyan-500" />
          </div>
          <div className="text-2xl font-bold text-cyan-600">{money(kpi.avgBasket)} F</div>
          <div className="text-xs text-slate-500 mt-1">Par transaction</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-orange-600" />
            Articles les plus vendus
          </h3>
          {topItems.length === 0 ? (
            <div className="text-center text-slate-400 py-8 text-sm">Aucune vente sur cette période</div>
          ) : (
            <div className="space-y-3">
              {topItems.map((item, i) => {
                const maxQty = topItems[0].qty;
                const widthPct = maxQty > 0 ? (item.qty / maxQty) * 100 : 0;
                return (
                  <div key={i} className="relative">
                    <div className="flex justify-between text-sm mb-1 z-10 relative">
                      <span className="font-medium text-slate-900">{item.name}</span>
                      <span className="text-slate-600">{item.qty} × ({money(item.total)} F)</span>
                    </div>
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${widthPct}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-purple-600" />
            Méthodes de paiement
          </h3>
          {paymentMethods.length === 0 ? (
            <div className="text-center text-slate-400 py-8 text-sm">Aucun paiement enregistré</div>
          ) : (
            <div className="space-y-3">
              {paymentMethods.map((m, i) => {
                const total = paymentMethods.reduce((s, x) => s + x.value, 0);
                const pct = total > 0 ? (m.value / total) * 100 : 0;
                const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500', 'bg-slate-500'];
                return (
                  <div key={i} className="relative">
                    <div className="flex justify-between text-sm mb-1 z-10 relative">
                      <span className="font-medium">{m.name}</span>
                      <span className="text-slate-600">{pct.toFixed(1)}% ({money(m.value)} F)</span>
                    </div>
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${colors[i % colors.length]} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {kpi.lowStock > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-amber-900">Alertes de stock</h4>
            <p className="text-sm text-amber-800 mt-1">
              <b>{kpi.lowStock} article(s)</b> sont en stock faible et nécessitent un réapprovisionnement.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h4 className="font-bold text-slate-900 mb-3">Performance quotidienne</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-600">Ventes totales:</span><b>{money(kpi.totalSales)} F</b></div>
            <div className="flex justify-between"><span className="text-slate-600">Commandes:</span><b>{kpi.transactions}</b></div>
            <div className="flex justify-between"><span className="text-slate-600">Panier moyen:</span><b>{money(kpi.avgBasket)} F</b></div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h4 className="font-bold text-slate-900 mb-3">Efficacité des coûts</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-600">Dépenses totales:</span><b>{money(kpi.totalExpenses)} F</b></div>
            <div className="flex justify-between"><span className="text-slate-600">Bénéfice net:</span><b className="text-emerald-600">{money(kpi.netProfit)} F</b></div>
            <div className="flex justify-between"><span className="text-slate-600">Marge nette:</span><b>{kpi.margin.toFixed(1)}%</b></div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h4 className="font-bold text-slate-900 mb-3">État du stock</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-600">Stock faible:</span><b className="text-amber-600">{kpi.lowStock}</b></div>
            <div className="flex justify-between"><span className="text-slate-600">Stock moyen:</span><b className="text-blue-600">{kpi.mediumStock}</b></div>
            <div className="flex justify-between"><span className="text-slate-600">Bon stock:</span><b className="text-emerald-600">{kpi.goodStock}</b></div>
          </div>
        </div>
      </div>
    </div>
  );
}
