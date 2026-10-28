'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  Package, Search, Plus, Eye, CheckCircle, 
  X, Download, Printer, RefreshCw, TrendingUp,
  Truck, CreditCard, Calendar, Clock, History as HistoryIcon
} from 'lucide-react';
import SupplierReceptionModal from '@/components/SupplierReceptionModal';
import MonthlySummaryModal from './components/MonthlySummaryModal';
import BulkPaymentModal from './components/BulkPaymentModal';
import NewSupplierOrderModal from './components/NewSupplierOrderModal';
import QuickCreateItemModal from './components/QuickCreateItemModal';

interface SupplierOrder {
  id: string;
  order_number: string;
  supplier_id: string;
  suppliers?: { name: string };
  order_date: string;
  expected_date?: string;
  status: string;
  total_amount: number;
  notes?: string;
  created_at: string;
}

interface Stats {
  totalMonth: number;
  paidMonth: number;
  unpaidMonth: number;
  paymentRate: number;
}

export default function CommandesFournisseursPage() {
  const supabase = createClient();
  const [siteId, setSiteId] = useState<string>('');
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
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
const [stockItems, setStockItems] = useState<MenuItem[]>([]);
const [orderItems, setOrderItems] = useState<Record<string, any[]>>({});
const [receptions, setReceptions] = useState<Record<string, any[]>>({});
  
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
      const formatted = data.map(item => ({
        id: item.id,
        name: item.name,
        category: item.category || 'Autres',
        price: item.sale_price || 0,
        stock: item.current_stock || 0,
        unit: item.unit || 'unité',
        destination: item.destination || 'KITCHEN'
      }));
      setStockItems(formatted);
      setMenuItems(formatted); // Pour compatibilité avec le reste du code
    } else {
      setMenuItems([]);
      setStockItems([]);
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
    
    // ✅ Calculer les stats avec les vraies données
    await calculateStats(data || []);
    
    // Charger les articles et réceptions pour chaque commande
    if (data && data.length > 0) {
      const itemsMap: Record<string, any[]> = {};
      const receptionsMap: Record<string, any[]> = {};
      
      for (const order of data) {
        // Charger les articles
        const { data: items } = await supabase
          .from('supplier_order_items')
          .select('*')
          .eq('order_id', order.id);
        itemsMap[order.id] = items || [];
        
        // Charger les réceptions
        const { data: receptionsData } = await supabase
          .from('supplier_receptions')
          .select('*, supplier_reception_items(*, supplier_order_items(item_name))')
          .eq('order_id', order.id)
          .order('reception_date', { ascending: false });
        
        if (receptionsData) {
          receptionsMap[order.id] = receptionsData.map(r => ({
            ...r,
            items: (r.supplier_reception_items || []).map(ri => ({
              ...ri,
              item_name: ri.supplier_order_items?.item_name || 'Article'
            }))
          }));
        } else {
          receptionsMap[order.id] = [];
        }
      }
      
      setOrderItems(itemsMap);
      setReceptions(receptionsMap);
    }
  } catch (error) {
    console.error('Erreur chargement commandes:', error);
  } finally {
    setLoading(false);
  }
};

  const calculateStats = async (ordersData: SupplierOrder[]) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  // Filtrer les commandes du mois en cours
  const monthOrders = ordersData.filter(o => 
    new Date(o.order_date) >= startOfMonth
  );

  const totalMonth = monthOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);

  // ✅ Récupérer les vrais paiements depuis la table supplier_payments
  try {
    const { data: paymentsData, error: paymentsError } = await supabase
      .from('supplier_payments')
      .select('amount, paid_at')
      .eq('site_id', siteId)
      .gte('paid_at', startOfMonth.toISOString());

    if (paymentsError) {
      console.error('Erreur chargement paiements:', paymentsError);
    }

    const paidMonth = paymentsData?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
    const unpaidMonth = totalMonth - paidMonth;
    const paymentRate = totalMonth > 0 ? (paidMonth / totalMonth) * 100 : 0;

    setStats({ 
      totalMonth, 
      paidMonth, 
      unpaidMonth, 
      paymentRate 
    });
  } catch (error) {
    console.error('Erreur calcul stats:', error);
    // Fallback en cas d'erreur
    setStats({ 
      totalMonth, 
      paidMonth: 0, 
      unpaidMonth: totalMonth, 
      paymentRate: 0 
    });
  }
};

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesSearch = 
        order.order_number.toLowerCase().includes(search.toLowerCase()) ||
        order.suppliers?.name.toLowerCase().includes(search.toLowerCase());
      
      const matchesDateFrom = dateFrom ? new Date(order.order_date) >= new Date(dateFrom) : true;
      const matchesDateTo = dateTo ? new Date(order.order_date) <= new Date(dateTo) : true;
      
      return matchesSearch && matchesDateFrom && matchesDateTo;
    });
  }, [orders, search, dateFrom, dateTo]);

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RECEIVED': return 'bg-emerald-100 text-emerald-800';
      case 'PARTIAL': return 'bg-amber-100 text-amber-800';
      case 'SENT': return 'bg-blue-100 text-blue-800';
      case 'CANCELLED': return 'bg-red-100 text-red-800';
      default: return 'bg-slate-100 text-slate-800';
    }
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
          <div className="text-xs text-slate-500 mb-1">Montant Total ce Mois</div>
          <div className="text-2xl font-bold text-slate-900">
            {stats.totalMonth.toLocaleString('fr-FR')} f CFA
          </div>
        </div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4 shadow-sm">
          <div className="text-xs text-emerald-700 mb-1">Payé ce Mois</div>
          <div className="text-2xl font-bold text-emerald-900">
            {stats.paidMonth.toLocaleString('fr-FR')} f CFA
          </div>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-200 p-4 shadow-sm">
          <div className="text-xs text-red-700 mb-1">Impayé ce Mois</div>
          <div className="text-2xl font-bold text-red-900">
            {stats.unpaidMonth.toLocaleString('fr-FR')} f CFA
          </div>
        </div>
        <div className="bg-purple-50 rounded-xl border border-purple-200 p-4 shadow-sm">
          <div className="text-xs text-purple-700 mb-1">Taux de Paiement</div>
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
                <th className="px-4 py-3 text-center font-semibold text-slate-700">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center">
                    <div className="flex items-center justify-center gap-2 text-slate-500">
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      Chargement...
                    </div>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Aucune commande trouvée
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
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
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                        <CheckCircle className="w-3 h-3" />
                        {getStatusLabel(order.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleViewDetails(order)}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded"
                          title="Voir détails"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {order.status !== 'RECEIVED' && order.status !== 'CANCELLED' && (
                          <button
                            onClick={() => handleOpenReception(order.id)}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"
                            title="Enregistrer réception"
                          >
                            <Package className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
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
                {orderItems[selectedOrder.id]?.map(item => {
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
                    {reception.items.map(item => (
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
    </div>
  );
}
