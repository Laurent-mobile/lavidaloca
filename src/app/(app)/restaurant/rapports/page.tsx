'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  BarChart3, ShoppingCart, Wallet, Package, CreditCard, 
  ChefHat, FileText, Download, Search, Calendar, TrendingUp, AlertCircle, CheckCircle,
  ChevronDown, ChevronUp, Printer, X, Coffee
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ExpenseSummary {
  current: number;
  fixed: number;
  supplierPayments: number;
  total: number;
}

interface SupplierOrderStatus {
  paid: { count: number; amount: number };
  partial: { count: number; amount: number };
  unpaid: { count: number; amount: number };
}

// Formatage des dates natif YYYY-MM-DD pour éviter les bugs
const getDefaultDates = () => {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    start: firstDay.toISOString().split('T')[0],
    end: today.toISOString().split('T')[0]
  };
};

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Espèces', CARD: 'Carte', MOBILE_MONEY: 'Mobile Money',
  CHECK: 'Chèque', TRANSFER: 'Virement', BANK_TRANSFER: 'Virement',
  ROOM_CHARGE: 'Chambre',
};

export default function RapportsDetaillesPage() {
  const supabase = createClient();
  const [siteId, setSiteId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  
  // Filtres au format YYYY-MM-DD
  const [startDate, setStartDate] = useState(getDefaultDates().start);
  const [endDate, setEndDate] = useState(getDefaultDates().end);
  const [activeTab, setActiveTab] = useState<'resume' | 'ventes' | 'depenses-courantes' | 'depenses-fixes' | 'commandes-fournisseurs' | 'paiements-fournisseurs' | 'cuisine-bar'>('resume');
  
  // Données
  const [stats, setStats] = useState({
    totalVentes: 0, countVentes: 0,
    totalDepenses: 0, depensesCourantes: 0, countDepensesCourantes: 0,
    depensesFixes: 0, countDepensesFixes: 0,
    paiementsFournisseurs: 0, countPaiementsFournisseurs: 0,
    commandesFournisseurs: 0, countCommandesFournisseurs: 0,
    profitNet: 0, margeBeneficiaire: 0
  });

  const [ventes, setVentes] = useState<any[]>([]);
  const [depensesCourantes, setDepensesCourantes] = useState<any[]>([]);
  const [depensesFixes, setDepensesFixes] = useState<any[]>([]);
  const [commandesFournisseurs, setCommandesFournisseurs] = useState<any[]>([]);
  const [paiementsFournisseurs, setPaiementsFournisseurs] = useState<any[]>([]);
  const [cuisineBarData, setCuisineBarData] = useState<any[]>([]);
  
  const [expenseSummary, setExpenseSummary] = useState<ExpenseSummary>({
    current: 0, fixed: 0, supplierPayments: 0, total: 0
  });
  const [supplierOrderStatus, setSupplierOrderStatus] = useState<SupplierOrderStatus>({
    paid: { count: 0, amount: 0 },
    partial: { count: 0, amount: 0 },
    unpaid: { count: 0, amount: 0 }
  });
  const [expenseCounts, setExpenseCounts] = useState({ current: 0, fixed: 0, supplier: 0 });
  
  // États pour l'accordéon des ventes
  const [expandedVenteId, setExpandedVenteId] = useState<string | null>(null);
  const [detailsCache, setDetailsCache] = useState<Record<string, any[]>>({});
  const [loadingDetailsId, setLoadingDetailsId] = useState<string | null>(null);
  const [paymentMethodsMap, setPaymentMethodsMap] = useState<Record<string, string>>({});

  // Filtres de l'onglet ventes
  const [searchVentes, setSearchVentes] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'recent' | 'old'>('recent');
    // États pour l'onglet Cuisine & Bar
  const [cbViewMode, setCbViewMode] = useState<'detail' | 'resume'>('detail');
  const [cbItems, setCbItems] = useState<any[]>([]); // Liste détaillée
  const [cbSummary, setCbSummary] = useState<any[]>([]); // Liste agrégée
  const [cbStats, setCbStats] = useState({
    total: 0, totalQty: 0, totalArticles: 0,
    cuisine: 0, cuisineQty: 0, cuisineArticles: 0,
    bar: 0, barQty: 0, barArticles: 0
  });
  const [cbFilters, setCbFilters] = useState({
    type: 'ALL', category: 'ALL', search: ''
  });

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('site_id').eq('id', user.id).maybeSingle();
        if (profile) setSiteId(profile.site_id || '');
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (siteId) {
      loadAllData();
      loadPaymentMethods();
    }
  }, [siteId, startDate, endDate]);

const loadAllData = async () => {
  setLoading(true);
  try {
    const startDateISO = `${startDate}T00:00:00`;
    const endDateISO = `${endDate}T23:59:59`;

    // ✅ 5 REQUÊTES PARALLÈLES AU LIEU DE 6 SÉQUENTIELLES
    const [ventesRes, expCourantesRes, expFixesRes, suppOrdersRes, suppPaymentsRes] = await Promise.all([
      supabase.from('restaurant_orders')
        .select(`*, restaurant_tables(number), restaurant_employees(first_name, last_name)`)
        .eq('site_id', siteId)
        .eq('status', 'PAID')
        .gte('created_at', startDateISO)
        .lte('created_at', endDateISO)
        .order('created_at', { ascending: false })
        .limit(5000),
      supabase.from('expenses')
        .select('*')
        .eq('site_id', siteId)
        .eq('type', 'COURANTE')
        .gte('date', startDate)
        .lte('date', endDate)
        .limit(5000),
      supabase.from('expenses')
        .select('*')
        .eq('site_id', siteId)
        .eq('type', 'FIXE')
        .gte('date', startDate)
        .lte('date', endDate)
        .limit(5000),
      supabase.from('supplier_orders')
        .select('*, suppliers(name)')
        .eq('site_id', siteId)
        .gte('order_date', startDate)
        .lte('order_date', endDate)
        .limit(5000),
      supabase.from('supplier_payments')
        .select('*, suppliers(name)')
        .eq('site_id', siteId)
        .gte('paid_at', startDateISO)
        .lte('paid_at', endDateISO)
        .limit(5000)
    ]);

    const allVentes = ventesRes.data || [];
    const expensesCourantes = expCourantesRes.data || [];
    const expensesFixes = expFixesRes.data || [];
    const supplierOrders = suppOrdersRes.data || [];
    const supplierPayments = suppPaymentsRes.data || [];

    // Calculs
    const totalVentes = allVentes.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const depensesCourantesTotal = expensesCourantes.reduce((sum, e) => sum + (e.amount || 0), 0);
    const depensesFixesTotal = expensesFixes.reduce((sum, e) => sum + (e.amount || 0), 0);
    const commandesFournisseursTotal = supplierOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const paiementsFournisseursTotal = supplierPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

    setVentes(allVentes);
    setDepensesCourantes(expensesCourantes);
    setDepensesFixes(expensesFixes);
    setCommandesFournisseurs(supplierOrders);
    setPaiementsFournisseurs(supplierPayments);

    // ✅ Cuisine & Bar - optimisé
    const orderIds = allVentes.map(o => o.id);
    let cbDetailed: any[] = [];
    
    if (orderIds.length > 0) {
      const { data: items } = await supabase
        .from('restaurant_order_items')
        .select('id, item_name, quantity, unit_price, total_price, destination, menu_item_id')
        .in('order_id', orderIds);

      const orderMap: Record<string, any> = {};
      allVentes.forEach(o => { orderMap[o.id] = o; });

      const menuIds = [...new Set((items || []).map((it: any) => it.menu_item_id).filter(Boolean))];
      const catMap: Record<string, string> = {};
      
      if (menuIds.length > 0) {
        const { data: riData } = await supabase
          .from('restaurant_items')
          .select('id, restaurant_categories(name)')
          .in('id', menuIds);
        (riData || []).forEach((r: any) => {
          const rc = Array.isArray(r.restaurant_categories) ? r.restaurant_categories[0] : r.restaurant_categories;
          catMap[r.id] = rc?.name || '—';
        });
      }

      let totalAll = 0, totalQtyAll = 0, cuisineTotal = 0, cuisineQty = 0, barTotal = 0, barQty = 0;
      const seen = new Set<string>();
      
      (items || []).forEach((it: any) => {
        const order = orderMap[it.order_id];
        if (!order) return;
        const category = it.menu_item_id ? (catMap[it.menu_item_id] || '—') : '—';
        const type = (it.destination || '').toUpperCase() === 'BAR' ? 'Bar' : 'Cuisine';
        const qty = Number(it.quantity) || 0;
        const amount = Number(it.total_price) || 0;
        
        totalAll += amount; totalQtyAll += qty;
        if (type === 'Bar') { barTotal += amount; barQty += qty; }
        else { cuisineTotal += amount; cuisineQty += qty; }
        seen.add(it.item_name);
        
        cbDetailed.push({
          id: it.id, name: it.item_name, category, type, qty,
          unitPrice: Number(it.unit_price) || 0, total: amount,
          orderNumber: order.order_number || '-',
          table: order.restaurant_tables?.number || (order.order_type === 'TAKEAWAY' ? 'À emporter' : '—'),
          server: order.restaurant_employees
            ? `${order.restaurant_employees.first_name} ${order.restaurant_employees.last_name}` : '—',
          date: order.created_at
        });
      });

      const agg: Record<string, any> = {};
      cbDetailed.forEach(it => {
        if (!agg[it.name]) agg[it.name] = { qty: 0, total: 0, unitPrice: it.unitPrice, category: it.category, type: it.type };
        agg[it.name].qty += it.qty; agg[it.name].total += it.total;
      });
      const cbAggregated = Object.entries(agg).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.total - a.total);
      
      setCbSummary(cbAggregated);
      setCbStats({
        total: totalAll, totalQty: totalQtyAll, totalArticles: seen.size,
        cuisine: cuisineTotal, cuisineQty, cuisineArticles: cbAggregated.filter(i => i.type === 'Cuisine').length,
        bar: barTotal, barQty, barArticles: cbAggregated.filter(i => i.type === 'Bar').length
      });
    } else {
      setCbItems([]); setCbSummary([]);
      setCbStats({ total: 0, totalQty: 0, totalArticles: 0, cuisine: 0, cuisineQty: 0, cuisineArticles: 0, bar: 0, barQty: 0, barArticles: 0 });
    }
    setCbItems(cbDetailed);

    const totalDepenses = depensesCourantesTotal + depensesFixesTotal + paiementsFournisseursTotal;
    const profitNet = totalVentes - totalDepenses;
    const margeBeneficiaire = totalVentes > 0 ? (profitNet / totalVentes) * 100 : 0;

    setStats({
      totalVentes, countVentes: allVentes.length,
      totalDepenses,
      depensesCourantes: depensesCourantesTotal, countDepensesCourantes: expensesCourantes.length,
      depensesFixes: depensesFixesTotal, countDepensesFixes: expensesFixes.length,
      paiementsFournisseurs: paiementsFournisseursTotal, countPaiementsFournisseurs: supplierPayments.length,
      commandesFournisseurs: commandesFournisseursTotal, countCommandesFournisseurs: supplierOrders.length,
      profitNet, margeBeneficiaire
    });

    setExpenseSummary({
      current: depensesCourantesTotal,
      fixed: depensesFixesTotal,
      supplierPayments: paiementsFournisseursTotal,
      total: totalDepenses
    });

    setExpenseCounts({
      current: expensesCourantes.length,
      fixed: expensesFixes.length,
      supplier: supplierPayments.length
    });

    const paidOrders = supplierOrders.filter(o => ['PAYÉ', 'PAID'].includes(o.payment_status));
    const partialOrders = supplierOrders.filter(o => ['PARTIEL', 'PARTIAL'].includes(o.payment_status));
    const unpaidOrders = supplierOrders.filter(o => !['PAYÉ', 'PAID', 'PARTIEL', 'PARTIAL'].includes(o.payment_status || ''));
    
    setSupplierOrderStatus({
      paid: { count: paidOrders.length, amount: paidOrders.reduce((s, o) => s + (o.total_amount || 0), 0) },
      partial: { count: partialOrders.length, amount: partialOrders.reduce((s, o) => s + (o.total_amount || 0), 0) },
      unpaid: { count: unpaidOrders.length, amount: unpaidOrders.reduce((s, o) => s + (o.total_amount || 0), 0) }
    });
  } catch (error) {
    console.error('Erreur chargement données:', error);
  } finally {
    setLoading(false);
  }
};

  const loadPaymentMethods = async () => {
    const startDateISO = `${startDate}T00:00:00`;
    const endDateISO = `${endDate}T23:59:59`;
    const { data } = await supabase
      .from('restaurant_payments')
      .select('order_id, method')
      .eq('site_id', siteId)
      .gte('paid_at', startDateISO)
      .lte('paid_at', endDateISO);
    const map: Record<string, string> = {};
    (data || []).forEach(p => { if (p.order_id && !map[p.order_id]) map[p.order_id] = p.method; });
    setPaymentMethodsMap(map);
  };

    const toggleVente = async (vente: any) => {
    // 1. Fermer si déjà ouvert
    if (expandedVenteId === vente.id) {
      setExpandedVenteId(null);
      return;
    }
    
    setExpandedVenteId(vente.id);
    if (detailsCache[vente.id]) return; // Déjà en cache, pas besoin de recharger

    setLoadingDetailsId(vente.id);
    try {
      // 2. Récupérer les articles de la commande (avec menu_item_id pour la jointure)
      const { data: orderItems, error: itemsError } = await supabase
        .from('restaurant_order_items')
        .select('item_name, quantity, unit_price, total_price, menu_item_id')
        .eq('order_id', vente.id);

      if (itemsError) throw itemsError;

      // 3. Récupérer les catégories via la table restaurant_items
      const menuIds = (orderItems || [])
        .map((it: any) => it.menu_item_id)
        .filter(Boolean); // Garder uniquement les IDs valides (non null/undefined)

      let catMap: Record<string, string> = {};
      if (menuIds.length > 0) {
        const { data: riData } = await supabase
          .from('restaurant_items')
          .select('id, restaurant_categories(name)')
          .in('id', menuIds);

        (riData || []).forEach((r: any) => {
          // Gérer le cas où restaurant_categories est un tableau ou un objet
          const rc = Array.isArray(r.restaurant_categories) ? r.restaurant_categories[0] : r.restaurant_categories;
          catMap[r.id] = rc?.name || '—';
        });
      }

      // 4. Fusionner les données et mettre en cache
      const enrichedItems = (orderItems || []).map((it: any) => ({
        ...it,
        category: it.menu_item_id ? (catMap[it.menu_item_id] || '—') : '—'
      }));

      setDetailsCache(prev => ({ ...prev, [vente.id]: enrichedItems }));
      
    } catch (error) {
      console.error('Erreur chargement détails:', error);
      // ⚠️ IMPORTANT : En cas d'erreur, on NE met PAS en cache un tableau vide.
      // Cela permet de réessayer au prochain clic si le problème est résolu.
      setDetailsCache(prev => {
        const copy = { ...prev };
        delete copy[vente.id];
        return copy;
      });
    } finally {
      setLoadingDetailsId(null);
    }
  };

  const filteredVentes = (() => {
    let list = [...ventes];
    const q = searchVentes.trim().toLowerCase();
    if (q) list = list.filter(v =>
      v.order_number?.toLowerCase().includes(q) ||
      v.restaurant_tables?.number?.toString().toLowerCase().includes(q) ||
      `${v.restaurant_employees?.first_name || ''} ${v.restaurant_employees?.last_name || ''}`.toLowerCase().includes(q)
    );
    if (paymentFilter !== 'ALL') list = list.filter(v => paymentMethodsMap[v.id] === paymentFilter);
    list.sort((a, b) => sortBy === 'recent'
      ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      : new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return list;
  })();

  const filteredTotal = filteredVentes.reduce((s, v) => s + Number(v.total_amount || 0), 0);

  const handlePrintVentes = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const rows = filteredVentes.map(v => `
      <tr>
        <td>${v.order_number}</td>
        <td>${new Date(v.created_at).toLocaleString('fr-FR')}</td>
        <td>${v.restaurant_tables?.number || '-'}</td>
        <td>${v.restaurant_employees ? `${v.restaurant_employees.first_name} ${v.restaurant_employees.last_name}` : '-'}</td>
        <td>${PAYMENT_LABELS[paymentMethodsMap[v.id]] || '-'}</td>
        <td style="text-align:right">${Number(v.total_amount).toLocaleString('fr-FR')} F</td>
      </tr>`).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>État des Ventes</title>
      <style>body{font-family:Arial;padding:20px;}h1{color:#4f46e5;text-align:center;}
      table{width:100%;border-collapse:collapse;margin-top:20px;font-size:12px;}
      th{background:#4f46e5;color:white;padding:8px;text-align:left;}
      td{padding:6px 8px;border-bottom:1px solid #ddd;}
      .tot{margin-top:15px;font-weight:bold;text-align:right;font-size:16px;}</style></head><body>
      <h1>LA VIDA-LOCA — État des Ventes</h1>
      <p style="text-align:center;color:#666">Période : ${startDate} au ${endDate} • ${filteredVentes.length} vente(s)</p>
      <table><thead><tr><th>N°</th><th>Date</th><th>Table</th><th>Serveur</th><th>Paiement</th><th style="text-align:right">Montant</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="tot">TOTAL : ${filteredTotal.toLocaleString('fr-FR')} f CFA</div>
      <script>window.onload=()=>{setTimeout(()=>{window.print();window.close();},300);}</script>
      </body></html>`);
    w.document.close();
  };

  const handleExportPDF = (type: string, data: any[], headers: string[], mapRow: (item: any) => any[]) => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.setTextColor(79, 70, 229);
    doc.text(`Rapport ${type}`, 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Période: ${startDate} au ${endDate}`, 105, 28, { align: 'center' });
    
    const tableData = data.map(mapRow);

    autoTable(doc, {
      startY: 35,
      head: [headers],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229], textColor: 255 },
      styles: { fontSize: 9 }
    });
    
    doc.save(`Rapport_${type}_${startDate}.pdf`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-indigo-600" />
            Rapports Détaillés
          </h1>
          <p className="text-sm text-slate-500 mt-1">Analyse complète des performances du restaurant</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Date de début</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Date de fin</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="flex items-end justify-end">
            <button 
              onClick={loadAllData}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              <TrendingUp className="w-4 h-4" />
              Actualiser
            </button>
          </div>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-2 border-b border-slate-200 overflow-x-auto">
        {[
          { id: 'resume', label: 'Résumé', icon: BarChart3 },
          { id: 'ventes', label: `Ventes (${stats.countVentes})`, icon: ShoppingCart },
          { id: 'depenses-courantes', label: `Dépenses Courantes (${stats.countDepensesCourantes})`, icon: Wallet },
          { id: 'depenses-fixes', label: `Dépenses Fixes (${stats.countDepensesFixes})`, icon: Package },
          { id: 'commandes-fournisseurs', label: `Commandes Frs (${stats.countCommandesFournisseurs})`, icon: Package },
          { id: 'paiements-fournisseurs', label: `Paiements Frs (${stats.countPaiementsFournisseurs})`, icon: CreditCard },
          { id: 'cuisine-bar', label: 'Cuisine & Bar', icon: ChefHat },
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)} 
            className={`flex items-center gap-2 px-4 py-3 font-medium text-sm whitespace-nowrap transition-colors ${
              activeTab === tab.id ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* Contenu : Résumé */}
      {activeTab === 'resume' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">Ventes Totales</p>
                <p className="text-2xl font-bold text-slate-900">{stats.totalVentes.toLocaleString('fr-FR')} f CFA</p>
                <p className="text-xs text-slate-400 mt-2">{stats.countVentes} vente(s)</p>
              </div>
              <div className="p-3 bg-emerald-50 rounded-lg"><ShoppingCart className="w-6 h-6 text-emerald-600" /></div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">Dépenses Totales</p>
                <p className="text-2xl font-bold text-slate-900">{stats.totalDepenses.toLocaleString('fr-FR')} f CFA</p>
                <p className="text-xs text-slate-400 mt-2">Toutes dépenses confondues</p>
              </div>
              <div className="p-3 bg-red-50 rounded-lg"><Wallet className="w-6 h-6 text-red-600" /></div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">Profit Net</p>
                <p className={`text-2xl font-bold ${stats.profitNet >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {stats.profitNet.toLocaleString('fr-FR')} f CFA
                </p>
                <p className="text-xs text-slate-400 mt-2">Ventes - Dépenses</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg"><TrendingUp className="w-6 h-6 text-blue-600" /></div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">Marge Bénéficiaire</p>
                <p className={`text-2xl font-bold ${stats.margeBeneficiaire >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {stats.margeBeneficiaire.toFixed(2)}%
                </p>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg"><TrendingUp className="w-6 h-6 text-purple-600" /></div>
            </div>
          </div>
          
          {/* SECTION DÉTAIL DES DÉPENSES */}
          <div className="col-span-1 md:col-span-2 lg:col-span-4 bg-white rounded-xl border border-slate-200 p-6 shadow-sm mt-2">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                Détail des Dépenses & Commandes
              </h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Colonne 1 : Répartition des Dépenses */}
              <div>
                <h4 className="font-semibold text-slate-700 mb-3 text-sm uppercase tracking-wide">Répartition des Dépenses</h4>
                <div className="space-y-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-blue-700 font-medium text-sm mb-1">
                        <Wallet className="w-4 h-4" /> Dépenses Courantes
                      </div>
                      <div className="text-xl font-bold text-blue-900">{expenseSummary.current.toLocaleString('fr-FR')} f CFA</div>
                      <div className="text-xs text-blue-600">{expenseCounts.current} opération(s)</div>
                    </div>
                  </div>

                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-purple-700 font-medium text-sm mb-1">
                        <Package className="w-4 h-4" /> Dépenses Fixes
                      </div>
                      <div className="text-xl font-bold text-purple-900">{expenseSummary.fixed.toLocaleString('fr-FR')} f CFA</div>
                      <div className="text-xs text-purple-600">{expenseCounts.fixed} opération(s)</div>
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-amber-700 font-medium text-sm mb-1">
                        <CreditCard className="w-4 h-4" /> Paiements Fournisseurs
                      </div>
                      <div className="text-xl font-bold text-amber-900">{expenseSummary.supplierPayments.toLocaleString('fr-FR')} f CFA</div>
                      <div className="text-xs text-amber-600">{expenseCounts.supplier} paiement(s)</div>
                    </div>
                  </div>

                  <div className="bg-slate-100 border-2 border-slate-300 rounded-lg p-4 flex items-center justify-between mt-4">
                    <div className="font-bold text-slate-900">TOTAL DES DÉPENSES</div>
                    <div className="text-2xl font-bold text-slate-900">{expenseSummary.total.toLocaleString('fr-FR')} f CFA</div>
                  </div>
                </div>
              </div>

              {/* Colonne 2 : Statut des Commandes Fournisseurs */}
              <div>
                <h4 className="font-semibold text-slate-700 mb-3 text-sm uppercase tracking-wide">Statut des Commandes Fournisseurs</h4>
                <div className="space-y-3">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-emerald-700 font-medium text-sm mb-1">
                        <CheckCircle className="w-4 h-4" /> Commandes Payées
                      </div>
                      <div className="text-xl font-bold text-emerald-900">{supplierOrderStatus.paid.amount.toLocaleString('fr-FR')} f CFA</div>
                      <div className="text-xs text-emerald-600">{supplierOrderStatus.paid.count} commande(s)</div>
                    </div>
                  </div>

                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-orange-700 font-medium text-sm mb-1">
                        <AlertCircle className="w-4 h-4" /> Partiellement Payées
                      </div>
                      <div className="text-xl font-bold text-orange-900">{supplierOrderStatus.partial.amount.toLocaleString('fr-FR')} f CFA</div>
                      <div className="text-xs text-orange-600">{supplierOrderStatus.partial.count} commande(s)</div>
                    </div>
                  </div>

                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-red-700 font-medium text-sm mb-1">
                        <AlertCircle className="w-4 h-4" /> Commandes Impayées
                      </div>
                      <div className="text-xl font-bold text-red-900">{supplierOrderStatus.unpaid.amount.toLocaleString('fr-FR')} f CFA</div>
                      <div className="text-xs text-red-600">{supplierOrderStatus.unpaid.count} commande(s) en attente</div>
                    </div>
                  </div>

                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mt-4">
                    <div className="text-xs text-indigo-700 mb-1 font-semibold">Note de calcul</div>
                    <div className="text-xs text-indigo-900 leading-relaxed">
                      Les <strong>Dépenses Totales</strong> incluent uniquement les montants réellement sortis (Fixes + Courantes + Paiements Fournisseurs effectués). Les commandes fournisseurs <strong>impayées</strong> ne sont pas comptabilisées dans les dépenses tant qu'elles ne sont pas réglées.
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                   <button onClick={() => setActiveTab('depenses-courantes')} className="flex-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg text-xs font-medium transition-colors">
                     Voir le détail des dépenses
                   </button>
                   <button onClick={() => setActiveTab('paiements-fournisseurs')} className="flex-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg text-xs font-medium transition-colors">
                     Voir les paiements
                   </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contenu : Ventes (Accordéon) */}
      {activeTab === 'ventes' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900">Ventes Détaillées</h3>
              <p className="text-sm text-slate-500 mt-1">
                {filteredVentes.length} vente(s) filtrée(s) • Total: {filteredTotal.toLocaleString('fr-FR')} f CFA
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={searchVentes}
                  onChange={(e) => setSearchVentes(e.target.value)}
                  placeholder="Rechercher commande, table..."
                  className="pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm w-56"
                />
              </div>
              <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-2 bg-white text-sm">
                <option value="ALL">Tous paiements</option>
                {Object.entries(PAYMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}
                className="border border-slate-300 rounded-lg px-3 py-2 bg-white text-sm">
                <option value="recent">Plus récent</option>
                <option value="old">Plus ancien</option>
              </select>
              <button
                onClick={() => handleExportPDF('Ventes', filteredVentes,
                  ['Commande', 'Table', 'Date', 'Serveur', 'Paiement', 'Montant'],
                  v => [v.order_number, v.restaurant_tables?.number || '-',
                    new Date(v.created_at).toLocaleDateString('fr-FR'),
                    `${v.restaurant_employees?.first_name || ''} ${v.restaurant_employees?.last_name || ''}`,
                    PAYMENT_LABELS[paymentMethodsMap[v.id]] || '-',
                    `${Number(v.total_amount).toLocaleString('fr-FR')} F`])}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                <FileText className="w-4 h-4" /> Export PDF
              </button>
              <button onClick={handlePrintVentes}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                <Printer className="w-4 h-4" /> Imprimer
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
            {filteredVentes.length === 0 ? (
              <p className="p-8 text-center text-slate-500">Aucune vente ne correspond aux filtres.</p>
            ) : filteredVentes.map((vente) => {
              const isOpen = expandedVenteId === vente.id;
              const items = detailsCache[vente.id];
              const mode = PAYMENT_LABELS[paymentMethodsMap[vente.id]] || '—';
              return (
                <div key={vente.id} className={isOpen ? 'bg-slate-50' : 'hover:bg-slate-50'}>
                  <button
                    onClick={() => toggleVente(vente)}
                    className="w-full text-left p-4 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="p-2 bg-emerald-50 rounded-lg flex-shrink-0">
                        <ShoppingCart className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900">Commande #{vente.order_number}</div>
                        <div className="text-sm text-slate-500 mt-1">
                          Table {vente.restaurant_tables?.number || '-'} • {new Date(vente.created_at).toLocaleString('fr-FR')}
                          {' • Serveur: '}{vente.restaurant_employees ? `${vente.restaurant_employees.first_name} ${vente.restaurant_employees.last_name}` : 'N/A'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <div className="font-bold text-slate-900">{Number(vente.total_amount).toLocaleString('fr-FR')} f CFA</div>
                        <div className="text-xs text-slate-500">{mode}</div>
                      </div>
                      {isOpen
                        ? <ChevronUp className="w-5 h-5 text-slate-400" />
                        : <ChevronDown className="w-5 h-5 text-slate-400" />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 space-y-4">
                      <div className="bg-white border border-slate-200 rounded-lg p-4">
                        <h4 className="font-semibold text-slate-900 mb-3">Articles ({items?.length ?? 0})</h4>
                        {loadingDetailsId === vente.id ? (
                          <div className="flex justify-center py-6">
                            <div className="w-6 h-6 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                          </div>
                        ) : (items?.length ?? 0) === 0 ? (
                          <p className="text-sm text-slate-500">Aucun article pour cette commande.</p>
                        ) : (
                          <div className="divide-y divide-slate-100">
                            {items!.map((it, idx) => (
                              <div key={idx} className="py-2 flex items-center justify-between">
                                <div>
                                  <div className="font-medium text-slate-900">{it.item_name}</div>
                                  <div className="text-xs text-slate-500">
                                    {it.quantity} x {Number(it.unit_price).toLocaleString('fr-FR')} f CFA • {it.category}
                                  </div>
                                </div>
                                <div className="font-bold text-slate-900">{Number(it.total_price).toLocaleString('fr-FR')} f CFA</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="bg-white border border-slate-200 rounded-lg p-4">
                        <h4 className="font-semibold text-slate-900 mb-3">Résumé financier</h4>
                        <div className="grid grid-cols-2 gap-y-2 text-sm">
                          <div className="text-slate-600">Sous-total: <span className="font-bold text-slate-900">{Number(vente.total_amount).toLocaleString('fr-FR')} f CFA</span></div>
                          <div className="text-slate-600">Taxes: <span className="font-bold text-slate-900">{Number((vente as any).tax_amount || 0).toLocaleString('fr-FR')} f CFA</span></div>
                          <div className="text-slate-600">Frais de livraison: <span className="font-bold text-slate-900">{Number((vente as any).delivery_fee || 0).toLocaleString('fr-FR')} f CFA</span></div>
                          <div className="text-slate-600">Total: <span className="font-bold text-slate-900">{Number(vente.total_amount).toLocaleString('fr-FR')} f CFA</span></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Contenu : Paiements Fournisseurs */}
      {activeTab === 'paiements-fournisseurs' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900">Paiements Fournisseurs</h3>
              <p className="text-sm text-slate-500 mt-1">{stats.countPaiementsFournisseurs} paiement(s) • Total: {stats.paiementsFournisseurs.toLocaleString('fr-FR')} f CFA</p>
            </div>
            <button onClick={() => handleExportPDF('Paiements Fournisseurs', paiementsFournisseurs,
              ['Référence', 'Fournisseur', 'Date', 'Mode', 'Montant'],
              p => [p.reference_number || '-', p.suppliers?.name || 'Inconnu', new Date(p.paid_at).toLocaleDateString('fr-FR'), p.payment_method, `${p.amount.toLocaleString('fr-FR')} F`]
            )} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              <FileText className="w-4 h-4" /> Export PDF
            </button>
          </div>
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {paiementsFournisseurs.map((paiement) => (
              <div key={paiement.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-amber-50 rounded-lg"><CreditCard className="w-5 h-5 text-amber-600" /></div>
                  <div>
                    <div className="font-semibold text-slate-900">Paiement - {paiement.reference_number || 'N/A'}</div>
                    <div className="text-sm text-slate-500 mt-1">
                      Fournisseur: {paiement.suppliers?.name || 'Inconnu'} • Date: {new Date(paiement.paid_at).toLocaleDateString('fr-FR')}
                    </div>
                    {paiement.notes && <div className="text-xs text-slate-500 mt-1">Notes: {paiement.notes}</div>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-slate-900 text-lg">{paiement.amount.toLocaleString('fr-FR')} f CFA</div>
                  <div className="text-sm text-emerald-600 mt-1">{paiement.payment_method}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

          {/* Contenu : Cuisine & Bar */}
      {activeTab === 'cuisine-bar' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900">Rapport Cuisine & Bar</h3>
              <p className="text-sm text-slate-500 mt-1">
                {cbViewMode === 'detail' ? `${cbItems.length} article(s)` : `${cbSummary.length} article(s) résumé(s)`} • {startDate} - {endDate}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex bg-slate-100 rounded-lg p-1">
                <button onClick={() => setCbViewMode('detail')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium ${cbViewMode === 'detail' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>
                  <ChefHat className="w-3.5 h-3.5" /> Détail
                </button>
                <button onClick={() => setCbViewMode('resume')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium ${cbViewMode === 'resume' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>
                  <BarChart3 className="w-3.5 h-3.5" /> Résumé
                </button>
              </div>
              <button onClick={() => handleExportPDF('Cuisine Bar', cbSummary, ['Article','Catégorie','Type','Qté','P.U.','Montant'], i => [i.name, i.category, i.type, i.qty, `${i.unitPrice} F`, `${i.total.toLocaleString('fr-FR')} F`])}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                <Printer className="w-4 h-4" /> Imprimer
              </button>
              <button onClick={() => {
                const csv = [['Article','Catégorie','Type','Quantité','Prix unitaire','Montant total'], ...cbSummary.map(i => [i.name,i.category,i.type,i.qty,i.unitPrice,i.total])].map(r => r.join(';')).join('\n');
                const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8;' });
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Cuisine_Bar_${startDate}.csv`; a.click();
              }} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium">
                <Download className="w-4 h-4" /> CSV
              </button>
            </div>
          </div>

          {/* KPIs */}
          <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 mb-1">Total</div>
                <div className="text-2xl font-bold text-slate-900">{cbStats.total.toLocaleString('fr-FR')} f CFA</div>
                <div className="text-xs text-slate-500 mt-2">🍽️ {cbStats.totalQty} unités · # {cbStats.totalArticles} articles</div>
              </div>
              <div className="p-2 bg-purple-100 rounded-lg"><BarChart3 className="w-6 h-6 text-purple-600" /></div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-emerald-700 mb-1">Cuisine</div>
                <div className="text-2xl font-bold text-emerald-900">{cbStats.cuisine.toLocaleString('fr-FR')} f CFA</div>
                <div className="text-xs text-emerald-600 mt-2">🍽️ {cbStats.cuisineQty} unités · # {cbStats.cuisineArticles} articles</div>
              </div>
              <div className="p-2 bg-emerald-100 rounded-lg"><ChefHat className="w-6 h-6 text-emerald-600" /></div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-blue-700 mb-1">Bar</div>
                <div className="text-2xl font-bold text-blue-900">{cbStats.bar.toLocaleString('fr-FR')} f CFA</div>
                <div className="text-xs text-blue-600 mt-2">🍹 {cbStats.barQty} unités · # {cbStats.barArticles} articles</div>
              </div>
              <div className="p-2 bg-blue-100 rounded-lg"><Coffee className="w-6 h-6 text-blue-600" /></div>
            </div>
          </div>

          {/* Filtres */}
          <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
              <select value={cbFilters.type} onChange={(e) => setCbFilters({ ...cbFilters, type: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-sm">
                <option value="ALL">Tous les types</option><option value="Cuisine">Cuisine</option><option value="Bar">Bar</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Catégorie</label>
              <select value={cbFilters.category} onChange={(e) => setCbFilters({ ...cbFilters, category: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-sm">
                <option value="ALL">Toutes les catégories</option>
                {Array.from(new Set(cbSummary.map(i => i.category))).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Recherche</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input value={cbFilters.search} onChange={(e) => setCbFilters({ ...cbFilters, search: e.target.value })} placeholder="Rechercher article..." className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm" />
              </div>
            </div>
          </div>

          {/* VUE DÉTAIL */}
          {cbViewMode === 'detail' && (
            <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
              {cbItems.filter(it => (cbFilters.type === 'ALL' || it.type === cbFilters.type) && (cbFilters.category === 'ALL' || it.category === cbFilters.category) && (!cbFilters.search || it.name.toLowerCase().includes(cbFilters.search.toLowerCase()))).length === 0 ? (
                <p className="p-8 text-center text-slate-500">Aucun article vendu sur cette période.</p>
              ) : cbItems.filter(it => (cbFilters.type === 'ALL' || it.type === cbFilters.type) && (cbFilters.category === 'ALL' || it.category === cbFilters.category) && (!cbFilters.search || it.name.toLowerCase().includes(cbFilters.search.toLowerCase()))).map((it) => (
                <div key={it.id} className="p-4 hover:bg-slate-50 flex items-center justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className={`p-2 rounded-lg flex-shrink-0 ${it.type === 'Bar' ? 'bg-blue-50' : 'bg-emerald-50'}`}>
                      {it.type === 'Bar' ? <Coffee className="w-5 h-5 text-blue-600" /> : <ChefHat className="w-5 h-5 text-emerald-600" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900">{it.name}</span>
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${it.type === 'Bar' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>{it.type}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">Commande {it.orderNumber} • Table {it.table} • Serveur: {it.server}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{it.date ? new Date(it.date).toLocaleString('fr-FR') : ''}</div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold text-slate-900">{it.total.toLocaleString('fr-FR')} f CFA</div>
                    <div className="text-xs text-slate-500">{it.qty} x {it.unitPrice.toLocaleString('fr-FR')} f CFA</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* VUE RÉSUMÉ */}
          {cbViewMode === 'resume' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 text-xs uppercase">Article</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 text-xs uppercase">Catégorie</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 text-xs uppercase">Type</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700 text-xs uppercase">Quantité totale</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700 text-xs uppercase">Prix unitaire</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700 text-xs uppercase">Montant total</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700 text-xs uppercase">% du total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cbSummary.filter(it => (cbFilters.type === 'ALL' || it.type === cbFilters.type) && (cbFilters.category === 'ALL' || it.category === cbFilters.category) && (!cbFilters.search || it.name.toLowerCase().includes(cbFilters.search.toLowerCase()))).map((it, idx) => {
                    const pct = cbStats.total > 0 ? (it.total / cbStats.total) * 100 : 0;
                    return (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">{it.name}</td>
                        <td className="px-4 py-3 text-slate-600">{it.category}</td>
                        <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${it.type === 'Bar' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>{it.type}</span></td>
                        <td className="px-4 py-3 text-center text-slate-600">🍽️ {it.qty}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{it.unitPrice.toLocaleString('fr-FR')} f CFA</td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-600">{it.total.toLocaleString('fr-FR')} f CFA</td>
                        <td className="px-4 py-3"><div className="flex items-center gap-2 justify-end"><div className="w-16 bg-slate-100 rounded-full h-1.5"><div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${Math.min(pct * 5, 100)}%` }} /></div><span className="text-xs text-slate-600 w-10 text-right">{pct.toFixed(1)}%</span></div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Contenu : Dépenses Courantes */}
      {activeTab === 'depenses-courantes' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900">Dépenses Courantes</h3>
              <p className="text-sm text-slate-500 mt-1">Total: {stats.depensesCourantes.toLocaleString('fr-FR')} f CFA</p>
            </div>
          </div>
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {depensesCourantes.map((depense) => (
              <div key={depense.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg"><Wallet className="w-5 h-5 text-blue-600" /></div>
                  <div>
                    <div className="font-semibold text-slate-900">{depense.description}</div>
                    <div className="text-sm text-slate-500 mt-1">{new Date(depense.date).toLocaleDateString('fr-FR')} • {depense.category}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-slate-900 text-lg">{depense.amount.toLocaleString('fr-FR')} f CFA</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
          {/* Contenu : Dépenses Fixes */}
      {activeTab === 'depenses-fixes' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900">Dépenses Fixes</h3>
              <p className="text-sm text-slate-500 mt-1">
                {stats.countDepensesFixes} charge(s) récurrente(s) • Total: {stats.depensesFixes.toLocaleString('fr-FR')} f CFA
              </p>
            </div>
            <button
              onClick={() => handleExportPDF('Dépenses Fixes', depensesFixes,
                ['Description', 'Catégorie', 'Date', 'Montant'],
                d => [
                  d.description || '-',
                  d.category || '-',
                  new Date(d.date).toLocaleDateString('fr-FR'),
                  `${Number(d.amount).toLocaleString('fr-FR')} F`
                ])}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              <FileText className="w-4 h-4" /> Export PDF
            </button>
          </div>

          {depensesFixes.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Aucune dépense fixe enregistrée pour cette période.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Description</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Catégorie</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {depensesFixes.map((depense) => (
                    <tr key={depense.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900">{depense.description || 'Sans description'}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                          {depense.category || 'Fixe'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {new Date(depense.date).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">
                        {Number(depense.amount).toLocaleString('fr-FR')} f CFA
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-purple-50 font-bold">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-right text-purple-900">TOTAL :</td>
                    <td className="px-4 py-3 text-right text-purple-900">
                      {stats.depensesFixes.toLocaleString('fr-FR')} f CFA
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
      {/* Contenu : Commandes Fournisseurs */}
      {activeTab === 'commandes-fournisseurs' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900">Commandes Fournisseurs</h3>
              <p className="text-sm text-slate-500 mt-1">Total: {stats.commandesFournisseurs.toLocaleString('fr-FR')} f CFA</p>
            </div>
          </div>
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {commandesFournisseurs.map((commande) => (
              <div key={commande.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-purple-50 rounded-lg"><Package className="w-5 h-5 text-purple-600" /></div>
                  <div>
                    <div className="font-semibold text-slate-900">{commande.order_number}</div>
                    <div className="text-sm text-slate-500 mt-1">
                      Fournisseur: {commande.suppliers?.name || 'Inconnu'} • Date: {new Date(commande.order_date).toLocaleDateString('fr-FR')}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-slate-900 text-lg">{commande.total_amount.toLocaleString('fr-FR')} f CFA</div>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    commande.payment_status === 'PAYÉ' || commande.payment_status === 'PAID' ? 'bg-emerald-100 text-emerald-800' :
                    commande.payment_status === 'PARTIEL' || commande.payment_status === 'PARTIAL' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {commande.payment_status || 'En attente'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}