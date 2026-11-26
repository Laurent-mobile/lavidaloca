'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  Package, Search, Plus, Eye, CheckCircle, 
  X, Download, Printer, RefreshCw, TrendingUp,
  Truck, CreditCard, Calendar, Clock, History as HistoryIcon, FileText
} from 'lucide-react';
import SupplierReceptionModal from '@/components/SupplierReceptionModal';
import MonthlySummaryModal from './components/MonthlySummaryModal';
import BulkPaymentModal from './components/BulkPaymentModal';
import NewSupplierOrderModal from './components/NewSupplierOrderModal';
import QuickCreateItemModal from './components/QuickCreateItemModal';
import SimplePaymentModal from './components/SimplePaymentModal';
import { registerBankTransaction } from '@/lib/bank';

interface SupplierOrder {
  id: string;
  order_number: string;
  supplier_id: string;
  suppliers?: { name: string };
  order_date: string;
  expected_date?: string;
  status: string;
  total_amount: number;
  payment_status: string;
  notes?: string;
  created_at: string;
}

interface Stats {
  totalMonth: number;
  paidMonth: number;
  unpaidMonth: number;
  paymentRate: number;
}

const getPaymentStatusConfig = (status: string) => {
  switch (status?.toUpperCase()) {
    case 'PAYÉ':
    case 'PAID':
      return { label: 'Payé', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    case 'PARTIEL':
    case 'PARTIAL':
      return { label: 'Partiel', color: 'bg-amber-100 text-amber-800 border-amber-200' };
    case 'NON_PAYÉ':
    case 'UNPAID':
      return { label: 'Non payé', color: 'bg-red-100 text-red-800 border-red-200' };
    default:
      return { label: status || 'Inconnu', color: 'bg-slate-100 text-slate-800 border-slate-200' };
  }
};

export default function CommandesFournisseursPage() {
  const supabase = createClient();
  const [siteId, setSiteId] = useState<string>('');
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  
  // Modals
  const [showReceptionModal, setShowReceptionModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showMonthlySummary, setShowMonthlySummary] = useState(false);
  const [showBulkPayment, setShowBulkPayment] = useState(false);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<SupplierOrder | null>(null);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
const [searchForNew, setSearchForNew] = useState(''); // Pour pré-remplir le nom
//const [stockItems, setStockItems] = useState<MenuItem[]>([]);
const [orderItems, setOrderItems] = useState<Record<string, any[]>>({});
const [receptions, setReceptions] = useState<Record<string, any[]>>({});
const [showSimplePayment, setShowSimplePayment] = useState(false);
const [selectedOrderForPayment, setSelectedOrderForPayment] = useState<SupplierOrder | null>(null);
  
  const [stats, setStats] = useState<Stats>({
    totalMonth: 0,
    paidMonth: 0,
    unpaidMonth: 0,
    paymentRate: 0
  });

  useEffect(() => {
    loadSiteId();
  }, []);

  useEffect(() => {
    if (siteId) {
      loadOrders();
    }
  }, [siteId, statusFilter]);

  
  const loadSiteId = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('site_id')
        .eq('id', user.id)
        .maybeSingle();
      if (profile) setSiteId(profile.site_id || '');
    }
  };

  

const loadStockItems = async () => {
  try {
    const { data, error } = await supabase
      .from('stock_items')
      .select('id, name, category, sale_price, current_stock, unit, destination, is_active')
      .eq('site_id', siteId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;

    if (data && data.length > 0) {
      const formatted = data.map((item: any) => ({
        id: item.id,
        name: item.name,
        category: item.category || 'Autres',
        price: item.sale_price || 0,
        stock: item.current_stock || 0,
        unit: item.unit || 'unité',
        destination: item.destination || 'KITCHEN'
      }));
      
      
    } else {
      
     
    }
  } catch (error) {
    console.error('Erreur chargement stock:', error);
  }
};

const loadOrders = async () => {
  setLoading(true);
  try {
    let query = supabase
      .from('supplier_orders')
      .select('*, suppliers(name)')
      .eq('site_id', siteId)
      .order('order_date', { ascending: false });
    
    if (statusFilter !== 'ALL') {
      query = query.eq('status', statusFilter);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    
    setOrders(data || []);
    calculateStats(data || []);
    
    // ✅ CHARGEMENT PARALLÈLE EN UNE SEULE REQUÊTE PAR TABLE
    if (data && data.length > 0) {
      const orderIds = data.map(o => o.id);
      
      const [itemsRes, receptionsRes] = await Promise.all([
        supabase.from('supplier_order_items')
          .select('*')
          .in('order_id', orderIds),
        supabase.from('supplier_receptions')
          .select('*, supplier_reception_items(*, supplier_order_items(item_name))')
          .in('order_id', orderIds)
          .order('reception_date', { ascending: false })
      ]);
      
      // ✅ Construction des maps côté client (plus de boucle N+1)
      const itemsMap: Record<string, any[]> = {};
      const receptionsMap: Record<string, any[]> = {};
      
      (itemsRes.data || []).forEach(item => {
        if (!itemsMap[item.order_id]) itemsMap[item.order_id] = [];
        itemsMap[item.order_id].push(item);
      });
      
      (receptionsRes.data || []).forEach(r => {
        if (!receptionsMap[r.order_id]) receptionsMap[r.order_id] = [];
        receptionsMap[r.order_id].push({
          ...r,
          items: (r.supplier_reception_items || []).map((ri: any) => ({
            ...ri,
            item_name: ri.supplier_order_items?.item_name || 'Article'
          }))
        });
      });
      
      setOrderItems(itemsMap);
      setReceptions(receptionsMap);
    }
  } catch (error) {
    console.error('Erreur chargement commandes:', error);
  } finally {
    setLoading(false);
  }
};

const calculateStats = (ordersData: SupplierOrder[]) => {
  const now = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(now.getDate() - 30); // Fenêtre de 30 jours glissants

  let totalPeriod = 0;
  let paidPeriod = 0;
  let globalUnpaid = 0; // L'impayé est global, peu importe la date de la commande

  ordersData.forEach(o => {
    const orderDate = new Date(o.order_date);
    const amount = o.total_amount || 0;
    const status = (o.payment_status || '').toUpperCase();

    // 1. Calculer le global des impayés (une dette d'octobre est toujours une dette aujourd'hui)
    if (status !== 'PAYÉ' && status !== 'PAID') {
      globalUnpaid += amount;
    }

    // 2. Calculer l'activité des 30 derniers jours
    if (orderDate >= thirtyDaysAgo) {
      totalPeriod += amount;
      if (status === 'PAYÉ' || status === 'PAID') {
        paidPeriod += amount;
      }
    }
  });

  const paymentRate = totalPeriod > 0 ? (paidPeriod / totalPeriod) * 100 : 0;

  console.log('💰 Stats (30 derniers jours & Impayé global):', { 
    totalPeriod: totalPeriod.toLocaleString('fr-FR'), 
    paidPeriod: paidPeriod.toLocaleString('fr-FR'), 
    globalUnpaid: globalUnpaid.toLocaleString('fr-FR'), 
    paymentRate: paymentRate.toFixed(1) + '%' 
  });

  // On injecte les valeurs dans les états existants
  setStats({ 
    totalMonth: totalPeriod, 
    paidMonth: paidPeriod, 
    unpaidMonth: globalUnpaid, // ✅ Affiche TOUT l'impayé, c'est plus logique pour la trésorerie
    paymentRate 
  });
};

    const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesSearch = 
        order.order_number.toLowerCase().includes(search.toLowerCase()) ||
        order.suppliers?.name.toLowerCase().includes(search.toLowerCase());
      
      const matchesDateFrom = dateFrom ? new Date(order.order_date) >= new Date(dateFrom) : true;
      const matchesDateTo = dateTo ? new Date(order.order_date) <= new Date(dateTo) : true;
      
      // ✅ NOUVEAU : Filtrer par statut de paiement
      const matchesPayment = paymentFilter === 'ALL' || (order.payment_status || '').toUpperCase() === paymentFilter.toUpperCase();
      
      return matchesSearch && matchesDateFrom && matchesDateTo && matchesPayment;
    });
  }, [orders, search, dateFrom, dateTo, paymentFilter]);

  const handleOpenReception = (orderId: string) => {
    setSelectedOrderId(orderId);
    setShowReceptionModal(true);
  };

  const handleViewDetails = (order: SupplierOrder) => {
    setSelectedOrder(order);
    setShowDetailModal(true);
  };

  const handleExportCSV = () => {
    const headers = ['Numéro', 'Fournisseur', 'Date', 'Statut', 'Montant'];
    const rows = filteredOrders.map(o => [
      o.order_number,
      o.suppliers?.name || '-',
      new Date(o.order_date).toLocaleDateString('fr-FR'),
      o.status,
      o.total_amount.toString()
    ]);
    
    const csvContent = [headers, ...rows]
      .map(row => row.join(';'))
      .join('\n');
    
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `commandes_fournisseurs_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const handlePrintList = () => {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return;
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Liste des Commandes Fournisseurs</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { text-align: center; color: #1e40af; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #1e40af; color: white; }
          tr:nth-child(even) { background-color: #f2f2f2; }
        </style>
      </head>
      <body>
        <h1>LA TERRA COTTA OUAGA - Commandes Fournisseurs</h1>
        <p>Date d'impression: ${new Date().toLocaleString('fr-FR')}</p>
        <table>
          <thead>
            <tr>
              <th>N° Commande</th>
              <th>Fournisseur</th>
              <th>Date</th>
              <th>Statut</th>
              <th>Montant</th>
            </tr>
          </thead>
          <tbody>
            ${filteredOrders.map(o => `
              <tr>
                <td>${o.order_number}</td>
                <td>${o.suppliers?.name || '-'}</td>
                <td>${new Date(o.order_date).toLocaleDateString('fr-FR')}</td>
                <td>${o.status}</td>
                <td>${o.total_amount.toLocaleString('fr-FR')} F</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <script>
          window.onload = function() { setTimeout(function() { window.print(); }, 300); };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };
// ✅ Helper pour formater les montants
const formatMoney = (n: number) => Number(n || 0).toLocaleString('fr-FR');

// ✅ NOUVEAU : État global des commandes fournisseurs
const handlePrintOrdersReport = () => {
  const reportId = `FRS-${siteId?.slice(0, 8).toUpperCase() || 'GLOBAL'}-${Date.now().toString().slice(-6)}`;
  const generatedAt = new Date().toISOString();
  const qrData = `VIDALOCA_SUPPLIER_ORDERS|${reportId}|${filteredOrders.length}|${stats.totalMonth}|${generatedAt}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrData)}`;

  // Stats par fournisseur
  const bySupplier: Record<string, { count: number; total: number; paid: number; unpaid: number }> = {};
  filteredOrders.forEach(o => {
    const name = o.suppliers?.name || 'Inconnu';
    if (!bySupplier[name]) bySupplier[name] = { count: 0, total: 0, paid: 0, unpaid: 0 };
    bySupplier[name].count += 1;
    bySupplier[name].total += o.total_amount || 0;
    const status = (o.payment_status || '').toUpperCase();
    if (status === 'PAYÉ' || status === 'PAID') bySupplier[name].paid += o.total_amount || 0;
    else bySupplier[name].unpaid += o.total_amount || 0;
  });

  const supplierRows = Object.entries(bySupplier)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([name, data]) => `
      <tr>
        <td>${name}</td>
        <td style="text-align:center;">${data.count}</td>
        <td style="text-align:right; font-weight: bold;">${formatMoney(data.total)} F</td>
        <td style="text-align:right; color:#059669;">${formatMoney(data.paid)} F</td>
        <td style="text-align:right; color:#dc2626;">${formatMoney(data.unpaid)} F</td>
        <td style="text-align:right;">${data.total > 0 ? ((data.paid / data.total) * 100).toFixed(1) : 0}%</td>
      </tr>
    `).join('');

  // Stats par statut de paiement
  const paidOrders = filteredOrders.filter(o => ['PAYÉ', 'PAID'].includes((o.payment_status || '').toUpperCase()));
  const partialOrders = filteredOrders.filter(o => ['PARTIEL', 'PARTIAL'].includes((o.payment_status || '').toUpperCase()));
  const unpaidOrders = filteredOrders.filter(o => !['PAYÉ', 'PAID', 'PARTIEL', 'PARTIAL'].includes((o.payment_status || '').toUpperCase()));

  const paidTotal = paidOrders.reduce((s, o) => s + (o.total_amount || 0), 0);
  const partialTotal = partialOrders.reduce((s, o) => s + (o.total_amount || 0), 0);
  const unpaidTotal = unpaidOrders.reduce((s, o) => s + (o.total_amount || 0), 0);

  // Détail des commandes
  const orderRows = filteredOrders
    .sort((a, b) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime())
    .map(o => {
      const paymentConfig = getPaymentStatusConfig(o.payment_status);
      const receptionStatus = getReceptionStatus(o);
      return `
        <tr>
          <td style="font-family:monospace; font-size:10px;">${o.order_number}</td>
          <td>${o.suppliers?.name || '-'}</td>
          <td>${new Date(o.order_date).toLocaleDateString('fr-FR')}</td>
          <td style="text-align:right; font-weight: bold;">${formatMoney(o.total_amount)} F</td>
          <td style="text-align:center;">
            <span style="padding:2px 6px; border-radius:10px; font-size:9px; background:${receptionStatus.color.includes('emerald') ? '#dcfce7' : receptionStatus.color.includes('amber') ? '#fef3c7' : '#f1f5f9'}; color:${receptionStatus.color.includes('emerald') ? '#059669' : receptionStatus.color.includes('amber') ? '#d97706' : '#64748b'};">
              ${receptionStatus.label}
            </span>
          </td>
          <td style="text-align:center;">
            <span style="padding:2px 6px; border-radius:10px; font-size:9px; background:${paymentConfig.color.includes('emerald') ? '#dcfce7' : paymentConfig.color.includes('amber') ? '#fef3c7' : paymentConfig.color.includes('red') ? '#fee2e2' : '#f1f5f9'}; color:${paymentConfig.color.includes('emerald') ? '#059669' : paymentConfig.color.includes('amber') ? '#d97706' : paymentConfig.color.includes('red') ? '#dc2626' : '#64748b'};">
              ${paymentConfig.label}
            </span>
          </td>
        </tr>
      `;
    }).join('');

  const printWindow = window.open('', '_blank', 'width=1000,height=1400');
  if (!printWindow) { alert('Veuillez autoriser les popups.'); return; }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>État des Commandes Fournisseurs - ${new Date().toLocaleDateString('fr-FR')}</title>
      <style>
        @page { size: A4 landscape; margin: 12mm; }
        body { font-family: Arial, sans-serif; font-size: 10px; color: #1f2937; margin: 0; padding: 15px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #7c3aed; padding-bottom: 12px; margin-bottom: 15px; }
        .header-left h1 { color: #7c3aed; margin: 0; font-size: 22px; }
        .header-left .subtitle { color: #6b7280; font-size: 11px; margin-top: 3px; }
        .header-left .title { font-size: 16px; font-weight: bold; margin-top: 8px; color: #1f2937; }
        .qr-box { text-align: center; }
        .qr-box img { border: 2px solid #e2e8f0; padding: 4px; border-radius: 6px; }
        .qr-box small { display: block; margin-top: 3px; color: #6b7280; font-size: 9px; }
        .section { margin-bottom: 15px; }
        .section-title { font-size: 12px; font-weight: bold; color: #7c3aed; border-bottom: 2px solid #7c3aed; padding-bottom: 4px; margin-bottom: 8px; }
        .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0; }
        .stat-card { background: #f9fafb; padding: 10px; border-radius: 6px; text-align: center; border: 1px solid #e5e7eb; }
        .stat-value { font-size: 18px; font-weight: bold; color: #7c3aed; }
        .stat-label { font-size: 9px; color: #6b7280; margin-top: 3px; }
        .stat-card.green { background: #ecfdf5; border-color: #10b981; }
        .stat-card.green .stat-value { color: #059669; }
        .stat-card.red { background: #fef2f2; border-color: #ef4444; }
        .stat-card.red .stat-value { color: #dc2626; }
        .stat-card.amber { background: #fffbeb; border-color: #f59e0b; }
        .stat-card.amber .stat-value { color: #d97706; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 9px; }
        th { background: #7c3aed; color: white; padding: 6px; text-align: left; font-size: 9px; }
        td { padding: 5px 6px; border-bottom: 1px solid #e5e7eb; }
        tr:nth-child(even) { background: #f9fafb; }
        .footer { margin-top: 30px; border-top: 2px solid #e5e7eb; padding-top: 12px; }
        .authenticity { background: #fef3c7; border: 1px solid #f59e0b; padding: 8px; border-radius: 5px; margin-bottom: 15px; font-size: 10px; color: #92400e; text-align: center; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        @media print { body { padding: 0; } .no-print { display: none; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="header-left">
          <h1>🏨 LA VIDA-LOCA</h1>
          <div class="subtitle">Hôtel • Resto • Lounge</div>
          <div class="subtitle">📍 Rue 15.293, Ouaga 2000, Ouagadougou</div>
          <div class="subtitle">📞 +226 01 04 11 11</div>
          <div class="title">📊 ÉTAT DES COMMANDES FOURNISSEURS</div>
          <div class="subtitle">N° ${reportId}</div>
        </div>
        <div class="qr-box">
          <img src="${qrUrl}" alt="QR Code d'authenticité" />
          <small>Document unique<br/>ID: ${reportId}</small>
        </div>
      </div>

      <div class="section">
        <div class="section-title">📋 Informations générales</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px;">
          <div style="background: #f9fafb; padding: 8px; border-radius: 5px; border-left: 3px solid #7c3aed;">
            <div style="font-size: 9px; color: #6b7280; text-transform: uppercase; font-weight: bold;">Période</div>
            <div style="font-size: 11px; font-weight: bold;">${dateFrom || '—'} au ${dateTo || '—'}</div>
          </div>
          <div style="background: #f9fafb; padding: 8px; border-radius: 5px; border-left: 3px solid #7c3aed;">
            <div style="font-size: 9px; color: #6b7280; text-transform: uppercase; font-weight: bold;">Nombre de commandes</div>
            <div style="font-size: 11px; font-weight: bold;">${filteredOrders.length}</div>
          </div>
          <div style="background: #f9fafb; padding: 8px; border-radius: 5px; border-left: 3px solid #7c3aed;">
            <div style="font-size: 9px; color: #6b7280; text-transform: uppercase; font-weight: bold;">Fournisseurs</div>
            <div style="font-size: 11px; font-weight: bold;">${Object.keys(bySupplier).length}</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">💰 Synthèse financière (30 derniers jours)</div>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${formatMoney(stats.totalMonth)} F</div>
            <div class="stat-label">Total commandes</div>
          </div>
          <div class="stat-card green">
            <div class="stat-value">${formatMoney(stats.paidMonth)} F</div>
            <div class="stat-label">Payé</div>
          </div>
          <div class="stat-card red">
            <div class="stat-value">${formatMoney(stats.unpaidMonth)} F</div>
            <div class="stat-label">Reste à payer</div>
          </div>
          <div class="stat-card amber">
            <div class="stat-value">${stats.paymentRate.toFixed(0)}%</div>
            <div class="stat-label">Taux de règlement</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">📊 Répartition par statut de paiement</div>
        <div class="stats-grid" style="grid-template-columns: repeat(3, 1fr);">
          <div class="stat-card green">
            <div class="stat-value">${paidOrders.length}</div>
            <div class="stat-label">Payées (${formatMoney(paidTotal)} F)</div>
          </div>
          <div class="stat-card amber">
            <div class="stat-value">${partialOrders.length}</div>
            <div class="stat-label">Partielles (${formatMoney(partialTotal)} F)</div>
          </div>
          <div class="stat-card red">
            <div class="stat-value">${unpaidOrders.length}</div>
            <div class="stat-label">Impayées (${formatMoney(unpaidTotal)} F)</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">🏢 Répartition par fournisseur</div>
        <table>
          <thead>
            <tr>
              <th>Fournisseur</th>
              <th style="text-align:center;">Nb commandes</th>
              <th style="text-align:right;">Total</th>
              <th style="text-align:right;">Payé</th>
              <th style="text-align:right;">Impayé</th>
              <th style="text-align:right;">% Payé</th>
            </tr>
          </thead>
          <tbody>${supplierRows}</tbody>
          <tfoot>
            <tr style="background:#f5f3ff; font-weight:bold;">
              <td>TOTAL</td>
              <td style="text-align:center;">${filteredOrders.length}</td>
              <td style="text-align:right;">${formatMoney(filteredOrders.reduce((s, o) => s + (o.total_amount || 0), 0))} F</td>
              <td style="text-align:right;">${formatMoney(paidTotal)} F</td>
              <td style="text-align:right;">${formatMoney(unpaidTotal + partialTotal)} F</td>
              <td style="text-align:right;">${filteredOrders.reduce((s, o) => s + (o.total_amount || 0), 0) > 0 ? ((paidTotal / filteredOrders.reduce((s, o) => s + (o.total_amount || 0), 0)) * 100).toFixed(1) : 0}%</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="section">
        <div class="section-title">📜 Détail des commandes (${filteredOrders.length})</div>
        <table>
          <thead>
            <tr>
              <th>N° Commande</th>
              <th>Fournisseur</th>
              <th>Date</th>
              <th style="text-align:right;">Montant</th>
              <th style="text-align:center;">Réception</th>
              <th style="text-align:center;">Paiement</th>
            </tr>
          </thead>
          <tbody>${orderRows}</tbody>
        </table>
      </div>

      <div class="footer">
        <div class="authenticity">
          🔐 <strong>Document certifié unique</strong> — Cet état est protégé par un QR code d'authenticité.
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 20px;">
          <div><div style="border-top: 1px solid #1f2937; padding-top: 5px; text-align: center; font-size: 10px;"><div style="height: 40px;"></div><b>Responsable Achats</b><div style="font-size: 9px; color: #6b7280;">Nom et signature</div></div></div>
          <div><div style="border-top: 1px solid #1f2937; padding-top: 5px; text-align: center; font-size: 10px;"><div style="height: 40px;"></div><b>Directeur Général</b><div style="font-size: 9px; color: #6b7280;">Nom et signature</div></div></div>
        </div>
        <div class="text-center" style="margin-top: 15px; font-size: 9px; color: #6b7280;">
          Document généré le ${new Date().toLocaleString('fr-FR')} • LA VIDA-LOCA PMS
        </div>
      </div>

      <div class="no-print" style="text-align: center; margin-top: 20px;">
        <button onclick="window.print()" style="padding: 10px 25px; background: #7c3aed; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold;">🖨️ Imprimer l'état</button>
        <button onclick="window.close()" style="padding: 10px 25px; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; margin-left: 10px;">Fermer</button>
      </div>
      <script>window.onload = function() { setTimeout(function() { window.print(); }, 500); };</script>
    </body>
    </html>
  `);
  printWindow.document.close();
};

// ✅ NOUVEAU : État de réception d'une commande spécifique
const handlePrintReceptionReport = (order: SupplierOrder) => {
  const reportId = `REC-${order.id.slice(0, 8).toUpperCase()}`;
  const generatedAt = new Date().toISOString();
  const qrData = `VIDALOCA_RECEPTION|${reportId}|${order.order_number}|${generatedAt}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrData)}`;

  const items = orderItems[order.id] || [];
  const receptionsList = receptions[order.id] || [];

  const totalOrdered = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
  const totalReceived = items.reduce((sum, item) => sum + (item.received_quantity || 0), 0);
  const totalRemaining = totalOrdered - totalReceived;
  const progress = totalOrdered > 0 ? (totalReceived / totalOrdered) * 100 : 0;

  const itemRows = items.map(item => {
    const remaining = item.quantity - (item.received_quantity || 0);
    const itemProgress = item.quantity > 0 ? ((item.received_quantity || 0) / item.quantity) * 100 : 0;
    const isComplete = remaining === 0;
    return `
      <tr style="${isComplete ? 'background:#ecfdf5;' : ''}">
        <td>${item.item_name}</td>
        <td style="text-align:center;">${item.unit || '-'}</td>
        <td style="text-align:center; font-weight: bold;">${item.quantity}</td>
        <td style="text-align:center; color:#059669; font-weight: bold;">${item.received_quantity || 0}</td>
        <td style="text-align:center; color:${remaining > 0 ? '#dc2626' : '#059669'}; font-weight: bold;">${remaining}</td>
        <td style="text-align:right;">${formatMoney(item.unit_price || 0)} F</td>
        <td style="text-align:right; font-weight: bold;">${formatMoney(item.total_price || 0)} F</td>
        <td style="text-align:center;">
          <div style="background:#e5e7eb; border-radius:4px; height:8px; width:100%; display:inline-block;">
            <div style="background:${isComplete ? '#059669' : '#d97706'}; height:8px; border-radius:4px; width:${itemProgress}%;"></div>
          </div>
          <div style="font-size:9px; margin-top:2px;">${itemProgress.toFixed(0)}%</div>
        </td>
      </tr>
    `;
  }).join('');

const receptionRows = receptionsList.map((r: any) => `  // ✅ Type explicite ajouté
    <tr>
      <td style="font-family:monospace;">${r.reception_number || '-'}</td>
      <td>${new Date(r.reception_date).toLocaleString('fr-FR')}</td>
      <td>${r.items?.length || 0} article(s)</td>
      <td>${r.notes || '-'}</td>
    </tr>
  `).join('');

  const printWindow = window.open('', '_blank', 'width=900,height=1200');
  if (!printWindow) { alert('Veuillez autoriser les popups.'); return; }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Bon de Réception - ${order.order_number}</title>
      <style>
        @page { size: A4; margin: 15mm; }
        body { font-family: Arial, sans-serif; font-size: 11px; color: #1f2937; margin: 0; padding: 20px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #059669; padding-bottom: 15px; margin-bottom: 20px; }
        .header-left h1 { color: #059669; margin: 0; font-size: 24px; }
        .header-left .subtitle { color: #6b7280; font-size: 12px; margin-top: 4px; }
        .header-left .title { font-size: 18px; font-weight: bold; margin-top: 10px; color: #1f2937; }
        .qr-box { text-align: center; }
        .qr-box img { border: 2px solid #e2e8f0; padding: 5px; border-radius: 8px; }
        .qr-box small { display: block; margin-top: 5px; color: #6b7280; font-size: 10px; }
        .section { margin-bottom: 20px; }
        .section-title { font-size: 14px; font-weight: bold; color: #059669; border-bottom: 2px solid #059669; padding-bottom: 5px; margin-bottom: 10px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .info-box { background: #f9fafb; padding: 10px; border-radius: 6px; border-left: 3px solid #059669; }
        .info-box label { font-size: 10px; color: #6b7280; display: block; margin-bottom: 3px; text-transform: uppercase; font-weight: bold; }
        .info-box value { font-size: 13px; color: #1f2937; font-weight: bold; display: block; }
        .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0; }
        .stat-card { background: #f9fafb; padding: 10px; border-radius: 6px; text-align: center; border: 1px solid #e5e7eb; }
        .stat-value { font-size: 18px; font-weight: bold; color: #059669; }
        .stat-label { font-size: 9px; color: #6b7280; margin-top: 3px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10px; }
        th { background: #059669; color: white; padding: 6px; text-align: left; font-size: 10px; }
        td { padding: 5px 6px; border-bottom: 1px solid #e5e7eb; }
        tr:nth-child(even) { background: #f9fafb; }
        .footer { margin-top: 40px; border-top: 2px solid #e5e7eb; padding-top: 15px; }
        .authenticity { background: #fef3c7; border: 1px solid #f59e0b; padding: 10px; border-radius: 6px; margin-bottom: 20px; font-size: 11px; color: #92400e; text-align: center; }
        .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 30px; margin-top: 30px; }
        .signature-box { border-top: 1px solid #1f2937; padding-top: 5px; text-align: center; font-size: 11px; }
        @media print { body { padding: 0; } .no-print { display: none; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="header-left">
          <h1>🏨 LA VIDA-LOCA</h1>
          <div class="subtitle">Hôtel • Resto • Lounge</div>
          <div class="subtitle">📍 Rue 15.293, Ouaga 2000, Ouagadougou</div>
          <div class="title">📦 BON DE RÉCEPTION</div>
          <div class="subtitle">N° ${reportId}</div>
        </div>
        <div class="qr-box">
          <img src="${qrUrl}" alt="QR Code d'authenticité" />
          <small>Document unique<br/>ID: ${reportId}</small>
        </div>
      </div>

      <div class="section">
        <div class="section-title">📋 Informations de la commande</div>
        <div class="info-grid">
          <div class="info-box"><label>N° Commande</label><value>${order.order_number}</value></div>
          <div class="info-box"><label>Fournisseur</label><value>${order.suppliers?.name || '-'}</value></div>
          <div class="info-box"><label>Date de commande</label><value>${new Date(order.order_date).toLocaleDateString('fr-FR')}</value></div>
          <div class="info-box"><label>Montant total</label><value>${formatMoney(order.total_amount)} F</value></div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">📊 Progression de réception</div>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${totalOrdered}</div>
            <div class="stat-label">Articles commandés</div>
          </div>
          <div class="stat-card" style="background:#ecfdf5; border-color:#10b981;">
            <div class="stat-value" style="color:#059669;">${totalReceived}</div>
            <div class="stat-label">Articles reçus</div>
          </div>
          <div class="stat-card" style="background:#fef2f2; border-color:#ef4444;">
            <div class="stat-value" style="color:#dc2626;">${totalRemaining}</div>
            <div class="stat-label">Articles restants</div>
          </div>
          <div class="stat-card" style="background:#f5f3ff; border-color:#8b5cf6;">
            <div class="stat-value" style="color:#7c3aed;">${progress.toFixed(0)}%</div>
            <div class="stat-label">Taux de réception</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">📦 Détail des articles</div>
        <table>
          <thead>
            <tr>
              <th>Article</th>
              <th style="text-align:center;">Unité</th>
              <th style="text-align:center;">Commandé</th>
              <th style="text-align:center;">Reçu</th>
              <th style="text-align:center;">Reste</th>
              <th style="text-align:right;">Prix unit.</th>
              <th style="text-align:right;">Total</th>
              <th style="text-align:center;">Progression</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
          <tfoot>
            <tr style="background:#ecfdf5; font-weight:bold;">
              <td colspan="2">TOTAUX</td>
              <td style="text-align:center;">${totalOrdered}</td>
              <td style="text-align:center;">${totalReceived}</td>
              <td style="text-align:center;">${totalRemaining}</td>
              <td></td>
              <td style="text-align:right;">${formatMoney(order.total_amount)} F</td>
              <td style="text-align:center;">${progress.toFixed(0)}%</td>
            </tr>
          </tfoot>
        </table>
      </div>

      ${receptionsList.length > 0 ? `
      <div class="section">
        <div class="section-title">📜 Historique des réceptions (${receptionsList.length})</div>
        <table>
          <thead>
            <tr>
              <th>N° Réception</th>
              <th>Date</th>
              <th>Articles</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>${receptionRows}</tbody>
        </table>
      </div>
      ` : ''}

      <div class="footer">
        <div class="authenticity">
          🔐 <strong>Document certifié unique</strong> — Ce bon de réception est protégé par un QR code d'authenticité.
        </div>
        <div class="signatures">
          <div><div class="signature-box"><div style="height: 50px;"></div><div><b>Réceptionnaire</b></div><div style="font-size: 10px; color: #6b7280;">Nom et signature</div></div></div>
          <div><div class="signature-box"><div style="height: 50px;"></div><div><b>Responsable Stock</b></div><div style="font-size: 10px; color: #6b7280;">Nom et signature</div></div></div>
          <div><div class="signature-box"><div style="height: 50px;"></div><div><b>Directeur</b></div><div style="font-size: 10px; color: #6b7280;">Nom et signature</div></div></div>
        </div>
        <div class="text-center" style="margin-top: 20px; font-size: 10px; color: #6b7280;">
          Document généré le ${new Date().toLocaleString('fr-FR')} • LA VIDA-LOCA PMS
        </div>
      </div>

      <div class="no-print" style="text-align: center; margin-top: 30px;">
        <button onclick="window.print()" style="padding: 12px 30px; background: #059669; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: bold;">🖨️ Imprimer le bon</button>
        <button onclick="window.close()" style="padding: 12px 30px; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; margin-left: 10px;">Fermer</button>
      </div>
      <script>window.onload = function() { setTimeout(function() { window.print(); }, 500); };</script>
    </body>
    </html>
  `);
  printWindow.document.close();
};

// ✅ NOUVEAU : État de paiement d'une commande
const handlePrintPaymentReport = (order: SupplierOrder) => {
  const reportId = `PAY-${order.id.slice(0, 8).toUpperCase()}`;
  const generatedAt = new Date().toISOString();
  const qrData = `VIDALOCA_SUPPLIER_PAYMENT|${reportId}|${order.order_number}|${order.total_amount}|${generatedAt}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrData)}`;

  const paymentConfig = getPaymentStatusConfig(order.payment_status);
  const receptionStatus = getReceptionStatus(order);

  const printWindow = window.open('', '_blank', 'width=800,height=1000');
  if (!printWindow) { alert('Veuillez autoriser les popups.'); return; }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>État de Paiement - ${order.order_number}</title>
      <style>
        @page { size: A4; margin: 15mm; }
        body { font-family: Arial, sans-serif; font-size: 11px; color: #1f2937; margin: 0; padding: 20px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #10b981; padding-bottom: 15px; margin-bottom: 20px; }
        .header-left h1 { color: #10b981; margin: 0; font-size: 24px; }
        .header-left .subtitle { color: #6b7280; font-size: 12px; margin-top: 4px; }
        .header-left .title { font-size: 18px; font-weight: bold; margin-top: 10px; color: #1f2937; }
        .qr-box { text-align: center; }
        .qr-box img { border: 2px solid #e2e8f0; padding: 5px; border-radius: 8px; }
        .qr-box small { display: block; margin-top: 5px; color: #6b7280; font-size: 10px; }
        .section { margin-bottom: 20px; }
        .section-title { font-size: 14px; font-weight: bold; color: #10b981; border-bottom: 2px solid #10b981; padding-bottom: 5px; margin-bottom: 10px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .info-box { background: #f9fafb; padding: 10px; border-radius: 6px; border-left: 3px solid #10b981; }
        .info-box label { font-size: 10px; color: #6b7280; display: block; margin-bottom: 3px; text-transform: uppercase; font-weight: bold; }
        .info-box value { font-size: 13px; color: #1f2937; font-weight: bold; display: block; }
        .highlight-box { background: #ecfdf5; border: 2px solid #10b981; padding: 15px; border-radius: 8px; margin: 15px 0; text-align: center; }
        .highlight-box .label { font-size: 11px; color: #6b7280; margin-bottom: 3px; }
        .highlight-box .value { font-size: 24px; font-weight: bold; color: #10b981; }
        .status-box { display: inline-block; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }
        .footer { margin-top: 40px; border-top: 2px solid #e5e7eb; padding-top: 15px; }
        .authenticity { background: #fef3c7; border: 1px solid #f59e0b; padding: 10px; border-radius: 6px; margin-bottom: 20px; font-size: 11px; color: #92400e; text-align: center; }
        .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 30px; }
        .signature-box { border-top: 1px solid #1f2937; padding-top: 5px; text-align: center; font-size: 11px; }
        @media print { body { padding: 0; } .no-print { display: none; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="header-left">
          <h1>🏨 LA VIDA-LOCA</h1>
          <div class="subtitle">Hôtel • Resto • Lounge</div>
          <div class="subtitle">📍 Rue 15.293, Ouaga 2000, Ouagadougou</div>
          <div class="title">💰 ÉTAT DE PAIEMENT FOURNISSEUR</div>
          <div class="subtitle">N° ${reportId}</div>
        </div>
        <div class="qr-box">
          <img src="${qrUrl}" alt="QR Code d'authenticité" />
          <small>Document unique<br/>ID: ${reportId}</small>
        </div>
      </div>

      <div class="section">
        <div class="section-title">📋 Informations de la commande</div>
        <div class="info-grid">
          <div class="info-box"><label>N° Commande</label><value>${order.order_number}</value></div>
          <div class="info-box"><label>Fournisseur</label><value>${order.suppliers?.name || '-'}</value></div>
          <div class="info-box"><label>Date de commande</label><value>${new Date(order.order_date).toLocaleDateString('fr-FR')}</value></div>
          <div class="info-box"><label>Statut réception</label><value>${receptionStatus.label}</value></div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">💳 Statut de paiement</div>
        <div style="text-align:center; margin: 20px 0;">
          <span class="status-box" style="background:${paymentConfig.color.includes('emerald') ? '#dcfce7' : paymentConfig.color.includes('amber') ? '#fef3c7' : '#fee2e2'}; color:${paymentConfig.color.includes('emerald') ? '#059669' : paymentConfig.color.includes('amber') ? '#d97706' : '#dc2626'}; border: 2px solid ${paymentConfig.color.includes('emerald') ? '#10b981' : paymentConfig.color.includes('amber') ? '#f59e0b' : '#ef4444'};">
            ${paymentConfig.label}
          </span>
        </div>
      </div>

      <div class="highlight-box">
        <div class="label">MONTANT TOTAL DE LA COMMANDE</div>
        <div class="value">${formatMoney(order.total_amount)} FCFA</div>
      </div>

      ${order.notes ? `
      <div class="section">
        <div class="section-title">📝 Notes</div>
        <div style="background: #f9fafb; padding: 10px; border-radius: 6px; border-left: 3px solid #6b7280;">
          ${order.notes}
        </div>
      </div>
      ` : ''}

      <div class="footer">
        <div class="authenticity">
          🔐 <strong>Document certifié unique</strong> — Cet état de paiement est protégé par un QR code d'authenticité.
        </div>
        <div class="signatures">
          <div><div class="signature-box"><div style="height: 50px;"></div><div><b>Responsable Achats</b></div><div style="font-size: 10px; color: #6b7280;">Nom et signature</div></div></div>
          <div><div class="signature-box"><div style="height: 50px;"></div><div><b>Directeur Financier</b></div><div style="font-size: 10px; color: #6b7280;">Nom et signature</div></div></div>
        </div>
        <div class="text-center" style="margin-top: 20px; font-size: 10px; color: #6b7280;">
          Document généré le ${new Date().toLocaleString('fr-FR')} • LA VIDA-LOCA PMS
        </div>
      </div>

      <div class="no-print" style="text-align: center; margin-top: 30px;">
        <button onclick="window.print()" style="padding: 12px 30px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: bold;">🖨️ Imprimer l'état</button>
        <button onclick="window.close()" style="padding: 12px 30px; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; margin-left: 10px;">Fermer</button>
      </div>
      <script>window.onload = function() { setTimeout(function() { window.print(); }, 500); };</script>
    </body>
    </html>
  `);
  printWindow.document.close();
};
  const handleSinglePayment = (order: SupplierOrder) => {
  // ✅ Ouvrir le modal de paiement simple pour cette commande spécifique
  setSelectedOrderForPayment(order);
  setShowSimplePayment(true);
};
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RECEIVED': return 'bg-emerald-100 text-emerald-800';
      case 'PARTIAL': return 'bg-amber-100 text-amber-800';
      case 'SENT': return 'bg-blue-100 text-blue-800';
      case 'CANCELLED': return 'bg-red-100 text-red-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  const getOrderReceptionStatus = (order: SupplierOrder) => {
  const items = orderItems[order.id] || [];
  const totalOrdered = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalReceived = items.reduce((sum, item) => sum + (item.received_quantity || 0), 0);
  
  if (totalOrdered === 0) return { label: 'En attente', color: 'bg-slate-100 text-slate-800' };
  if (totalReceived === 0) return { label: 'En attente', color: 'bg-slate-100 text-slate-800' };
  if (totalReceived >= totalOrdered) return { label: 'Reçue', color: 'bg-emerald-100 text-emerald-800' };
  return { label: 'Partielle', color: 'bg-amber-100 text-amber-800' };
};

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'RECEIVED': return 'Reçue';
      case 'PARTIAL': return 'Partielle';
      case 'SENT': return 'Envoyée';
      case 'CANCELLED': return 'Annulée';
      case 'DRAFT': return 'Brouillon';
      default: return status;
    }
  };

    // ✅ NOUVEAU : Calculer le statut de réception réel basé sur les quantités
  const getReceptionStatus = (order: any) => {
    const items = orderItems[order.id] || [];
    if (items.length === 0) {
      return order.status === 'RECEIVED' 
        ? { label: 'Reçue', color: 'bg-emerald-100 text-emerald-800' }
        : { label: 'En attente', color: 'bg-slate-100 text-slate-800' };
    }
    
    const totalOrdered = items.reduce((sum: any, item: any) => sum + (item.quantity || 0), 0);
    const totalReceived = items.reduce((sum: any, item: any) => sum + (item.received_quantity || 0), 0);
    
    if (totalReceived >= totalOrdered && totalOrdered > 0) {
      return { label: 'Reçue', color: 'bg-emerald-100 text-emerald-800' };
    } else if (totalReceived > 0) {
      return { label: 'Partielle', color: 'bg-amber-100 text-amber-800' };
    }
    
    return { label: 'En attente', color: 'bg-slate-100 text-slate-800' };
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Truck className="w-7 h-7 text-indigo-600" />
            Commandes Fournisseurs
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestion simplifiée des commandes aux fournisseurs
          </p>
        </div>
        <button 
          onClick={() => setShowNewOrder(true)}
          className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Nouvelle Commande
        </button>
      </div>

      {/* Stats */}
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
  <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
    <div className="text-xs text-slate-500 mb-1">Commandes (30 derniers jours)</div>
    <div className="text-2xl font-bold text-slate-900">
      {stats.totalMonth.toLocaleString('fr-FR')} f CFA
    </div>
  </div>
  <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4 shadow-sm">
    <div className="text-xs text-emerald-700 mb-1">Payé (30 derniers jours)</div>
    <div className="text-2xl font-bold text-emerald-900">
      {stats.paidMonth.toLocaleString('fr-FR')} f CFA
    </div>
  </div>
  <div className="bg-red-50 rounded-xl border border-red-200 p-4 shadow-sm">
    <div className="text-xs text-red-700 mb-1">Reste à payer (Global)</div>
    <div className="text-2xl font-bold text-red-900">
      {stats.unpaidMonth.toLocaleString('fr-FR')} f CFA
    </div>
  </div>
  <div className="bg-purple-50 rounded-xl border border-purple-200 p-4 shadow-sm">
    <div className="text-xs text-purple-700 mb-1">Taux de règlement (30j)</div>
    <div className="text-2xl font-bold text-purple-900">
      {stats.paymentRate.toFixed(0)}%
    </div>
  </div>
</div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Rechercher</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Numéro de commande ou fournisseur..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Date de début</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Date de fin</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Statut commande</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="ALL">Tous les statuts</option>
              <option value="DRAFT">Brouillon</option>
              <option value="SENT">Envoyée</option>
              <option value="PARTIAL">Partielle</option>
              <option value="RECEIVED">Reçue</option>
              <option value="CANCELLED">Annulée</option>
            </select>
          </div>
                    <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Statut paiement</label>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="ALL">Tous les paiements</option>
              <option value="NON_PAYÉ">Non payé</option>
              <option value="PARTIEL">Partiel</option>
              <option value="PAYÉ">Payé</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
  <button 
    onClick={() => setShowMonthlySummary(true)}
    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
  >
    <TrendingUp className="w-4 h-4" />
    Résumé Mensuel
  </button>
  <button 
    onClick={() => setShowBulkPayment(true)}
    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
  >
    <CreditCard className="w-4 h-4" />
    Paiement Groupé
  </button>
  {/* ✅ NOUVEAU : Bouton État PDF global */}
  <button 
    onClick={handlePrintOrdersReport}
    disabled={filteredOrders.length === 0}
    className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
    title="Générer l'état global des commandes fournisseurs avec QR Code"
  >
    <FileText className="w-4 h-4" />
    État PDF
  </button>
  <button 
    onClick={handlePrintList}
    className="bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
  >
    <Printer className="w-4 h-4" />
    Imprimer Liste
  </button>
  <button 
    onClick={handleExportCSV}
    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
  >
    <Download className="w-4 h-4" />
    Export CSV
  </button>
</div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">COMMANDE</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">FOURNISSEUR</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">DATE</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700">MONTANT</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-700">STATUT</th>
                {/* ✅ NOUVELLE COLONNE */}
                <th className="px-4 py-3 text-center font-semibold text-slate-700">PAIEMENT</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-700">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center">
                    <div className="flex items-center justify-center gap-2 text-slate-500">
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      Chargement...
                    </div>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Aucune commande trouvée
                  </td>
                </tr>
              ) : (
                                filteredOrders.map((order) => {
                  // ✅ Récupérer la config du badge de paiement
                  const paymentConfig = getPaymentStatusConfig(order.payment_status);
                  
                  return (
                  <tr key={order.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{order.order_number}</div>
                      <div className="text-xs text-slate-500">
                        {new Date(order.order_date).toLocaleDateString('fr-FR')}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{order.suppliers?.name}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(order.order_date).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {order.total_amount.toLocaleString('fr-FR')} f CFA
                    </td>
                      {/* Dans la colonne STATUT */}
                    <td className="px-4 py-3 text-center">
                      {(() => {
                        // Utilise le nouveau calcul intelligent
                        const receptionStatus = getReceptionStatus(order);
                        return (
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${receptionStatus.color}`}>
                            <CheckCircle className="w-3 h-3" />
                            {receptionStatus.label}
                          </span>
                        );
                      })()}
                    </td>
                    
                    {/* ✅ NOUVELLE CELLULE DE PAIEMENT */}
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${paymentConfig.color}`}>
                        {paymentConfig.label}
                      </span>
                    </td>

                      <td className="px-4 py-3">
  <div className="flex items-center justify-center gap-1">
    {/* ✅ NOUVEAU : Bouton Imprimer état paiement */}
    <button
      onClick={() => handlePrintPaymentReport(order)}
      className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded"
      title="Imprimer l'état de paiement PDF"
    >
      <Printer className="w-4 h-4" />
    </button>
    {/* Bouton Voir détails */}
    <button
      onClick={() => handleViewDetails(order)}
      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
      title="Voir détails"
    >
      <Eye className="w-4 h-4" />
    </button>
    {/* ✅ NOUVEAU : Bouton Imprimer bon de réception */}
    <button
      onClick={() => handlePrintReceptionReport(order)}
      className="p-1.5 text-amber-600 hover:bg-amber-50 rounded"
      title="Imprimer le bon de réception PDF"
    >
      <FileText className="w-4 h-4" />
    </button>
    {/* Bouton Réception */}
    {order.status !== 'RECEIVED' && order.status !== 'CANCELLED' && (
      <button
        onClick={() => handleOpenReception(order.id)}
        className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"
        title="Enregistrer réception"
      >
        <Package className="w-4 h-4" />
      </button>
    )}
    {/* Bouton Payer */}
    {order.payment_status !== 'PAYÉ' && order.payment_status !== 'PAID' && (
      <button
        onClick={() => handleSinglePayment(order)}
        className="p-1.5 text-purple-600 hover:bg-purple-50 rounded"
        title="Payer cette commande"
      >
        <CreditCard className="w-4 h-4" />
      </button>
    )}
  </div>
</td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <SupplierReceptionModal
        siteId={siteId}
        orderId={selectedOrderId}
        isOpen={showReceptionModal}
        onClose={() => setShowReceptionModal(false)}
        onSuccess={() => {
          loadOrders();
          setShowReceptionModal(false);
        }}
      />

      <MonthlySummaryModal
        siteId={siteId}
        isOpen={showMonthlySummary}
        onClose={() => setShowMonthlySummary(false)}
      />

      <BulkPaymentModal
        siteId={siteId}
        isOpen={showBulkPayment}
        onClose={() => setShowBulkPayment(false)}
        onSuccess={() => {
          loadOrders();
        }}
      />

      <NewSupplierOrderModal
        siteId={siteId}
        isOpen={showNewOrder}
        onClose={() => setShowNewOrder(false)}
        onSuccess={() => {
          loadOrders();
        }}
      />

      {/* Modal de Détails */}
{showDetailModal && selectedOrder && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-700 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
        <div>
          <h3 className="text-xl font-bold">Détails de la Commande</h3>
          <p className="text-sm text-indigo-100">{selectedOrder.order_number}</p>
        </div>
        <button onClick={() => setShowDetailModal(false)} className="hover:bg-white/20 p-2 rounded-lg">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-50 p-3 rounded-lg">
            <div className="text-xs text-slate-500 mb-1">Fournisseur</div>
            <div className="font-semibold text-slate-900">{selectedOrder.suppliers?.name}</div>
          </div>
          <div className="bg-slate-50 p-3 rounded-lg">
            <div className="text-xs text-slate-500 mb-1">Date de commande</div>
            <div className="font-semibold text-slate-900">{new Date(selectedOrder.order_date).toLocaleDateString('fr-FR')}</div>
          </div>
          <div className="bg-slate-50 p-3 rounded-lg">
            <div className="text-xs text-slate-500 mb-1">Statut</div>
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(selectedOrder.status)}`}>
              {getStatusLabel(selectedOrder.status)}
            </span>
          </div>
          <div className="bg-slate-50 p-3 rounded-lg">
            <div className="text-xs text-slate-500 mb-1">Montant Total</div>
            <div className="font-bold text-indigo-600 text-lg">{selectedOrder.total_amount.toLocaleString('fr-FR')} F</div>
          </div>
        </div>

        {selectedOrder.notes && (
          <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
            <div className="text-xs text-amber-700 mb-1">Notes</div>
            <div className="text-sm text-amber-900">{selectedOrder.notes}</div>
          </div>
        )}

        {/* Articles commandés avec progression de réception */}
        <div>
          <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Package className="w-5 h-5 text-indigo-600" />
            Articles commandés
          </h4>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left">Article</th>
                  <th className="px-4 py-2 text-center">Unité</th>
                  <th className="px-4 py-2 text-center">Commandé</th>
                  <th className="px-4 py-2 text-center">Reçu</th>
                  <th className="px-4 py-2 text-center">Reste</th>
                  <th className="px-4 py-2 text-right">Prix unit.</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2 text-center">Progression</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orderItems[selectedOrder.id]?.map((item: any) => {
                  const remaining = item.quantity - item.received_quantity;
                  const progress = (item.received_quantity / item.quantity) * 100;
                  const isFullyReceived = remaining === 0;
                  
                  return (
                    <tr key={item.id} className={isFullyReceived ? 'bg-emerald-50' : ''}>
                      <td className="px-4 py-2 font-medium">{item.item_name}</td>
                      <td className="px-4 py-2 text-center">{item.unit}</td>
                      <td className="px-4 py-2 text-center font-medium">{item.quantity}</td>
                      <td className="px-4 py-2 text-center text-emerald-600 font-medium">{item.received_quantity}</td>
                      <td className="px-4 py-2 text-center text-amber-600 font-medium">{remaining}</td>
                      <td className="px-4 py-2 text-right">{item.unit_price?.toLocaleString('fr-FR')} F</td>
                      <td className="px-4 py-2 text-right font-bold">{item.total_price?.toLocaleString('fr-FR')} F</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-200 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full ${isFullyReceived ? 'bg-emerald-500' : 'bg-amber-500'}`}
                              style={{ width: `${progress}%` }}
                            ></div>
                          </div>
                          <span className="text-xs font-medium text-slate-600">{progress.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Historique des réceptions */}
        {receptions[selectedOrder.id]?.length > 0 && (
  <div>
    <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
      <HistoryIcon className="w-5 h-5 text-indigo-600" /> {/* ✅ Modifié ici */}
      Historique des réceptions ({receptions[selectedOrder.id].length})
    </h4>
    <div className="space-y-3">
      {receptions[selectedOrder.id].map(reception => (
                <div key={reception.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-emerald-600" />
                      <span className="font-semibold text-slate-900">{reception.reception_number}</span>
                    </div>
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(reception.reception_date).toLocaleString('fr-FR')}
                    </span>
                  </div>
                  <div className="ml-7 space-y-1">
                    {reception.items.map((item: any) => (
                      <div key={item.id} className="flex justify-between text-sm bg-emerald-50 px-3 py-1 rounded">
                        <span className="text-slate-700">{item.item_name}</span>
                        <span className="font-medium text-emerald-700">+{item.quantity_received} reçu(s)</span>
                      </div>
                    ))}
                  </div>
                  {reception.notes && (
                    <div className="ml-7 mt-2 text-xs text-slate-500 italic">📝 {reception.notes}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-4 border-t border-slate-200">
          <button
            onClick={() => setShowDetailModal(false)}
            className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-lg"
          >
            Fermer
          </button>
          {selectedOrder.status !== 'RECEIVED' && selectedOrder.status !== 'CANCELLED' && (
            <button
              onClick={() => {
                setShowDetailModal(false);
                handleOpenReception(selectedOrder.id);
              }}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
            >
              <Package className="w-5 h-5" />
              Enregistrer la réception
            </button>
          )}
        </div>
      </div>
    </div>
  </div>
)}
<SimplePaymentModal
  siteId={siteId}
  order={selectedOrderForPayment}
  isOpen={showSimplePayment}
  onClose={() => setShowSimplePayment(false)}
  onSuccess={() => {
    loadOrders();
    setShowSimplePayment(false);
  }}
/>
    </div>
  );
}
