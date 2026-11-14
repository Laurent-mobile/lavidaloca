'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  ChefHat, Wine, Clock, CheckCircle, Truck, AlertCircle,
  RefreshCw, Volume2, VolumeX, Filter, X, Users, Bed,
  TrendingUp, Printer, Eye, Ban
} from 'lucide-react';

interface OrderItem {
  id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  status: 'PENDING' | 'PREPARING' | 'READY' | 'SERVED';
  destination: 'KITCHEN' | 'BAR';
  notes?: string;
}

interface RestaurantOrder {
  id: string;
  order_number: string;
  order_type: string;
  status: string;
  total_amount: number;
  created_at: string;
  table_id?: string | null;
  room_id?: string | null;
  restaurant_tables?: { number: string } | null;
  rooms?: { number: string } | null;
  restaurant_order_items?: OrderItem[];
}

interface Props {
  // Props si nécessaire
}

export default function CuisineBarPage() {
  const supabase = createClient();
  const [siteId, setSiteId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'KITCHEN' | 'BAR'>('KITCHEN');
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'PREPARING' | 'READY'>('ALL');
  const [filterType, setFilterType] = useState<'ALL' | 'DINE_IN' | 'ROOM_SERVICE' | 'TAKEAWAY'>('ALL');
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [selectedOrder, setSelectedOrder] = useState<RestaurantOrder | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const previousOrderCount = useRef(0);

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
      loadOrders();
      // Polling toutes les 10 secondes pour les mises à jour en temps réel
      const interval = setInterval(() => {
        loadOrders();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [siteId]);

  const loadOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('restaurant_orders')
        .select(`
          *,
          restaurant_tables(number),
          rooms(number),
          restaurant_order_items(
            id, item_name, quantity, unit_price, total_price, status, destination, notes
          )
        `)
        .eq('site_id', siteId)
        .in('status', ['SENT', 'PREPARING', 'READY', 'SERVED'])
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Détecter les nouvelles commandes pour le son
      if (data && data.length > previousOrderCount.current && previousOrderCount.current > 0) {
        if (soundEnabled) playNotificationSound();
      }
      previousOrderCount.current = data?.length || 0;

      setOrders(data || []);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Erreur chargement commandes:', error);
    } finally {
      setLoading(false);
    }
  };

  const playNotificationSound = () => {
    // Son de notification simple (beep)
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.value = 800;
      gainNode.gain.value = 0.3;
      oscillator.start();
      setTimeout(() => oscillator.stop(), 200);
    } catch (e) {
      console.log('Son non disponible');
    }
  };

  const handleStatusChange = async (itemId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('restaurant_order_items')
        .update({ status: newStatus })
        .eq('id', itemId);

      if (error) throw error;
      await loadOrders();
    } catch (error) {
      console.error('Erreur changement statut:', error);
      alert('Erreur lors du changement de statut');
    }
  };

  const handleOrderStatusChange = async (orderId: string, newStatus: string) => {
    if (!confirm(`Passer la commande ${orderId.slice(0, 8)}... au statut "${newStatus}" ?`)) return;
    try {
      const updateData: any = { status: newStatus };
      if (newStatus === 'SERVED') updateData.completed_at = new Date().toISOString();
      
      const { error } = await supabase
        .from('restaurant_orders')
        .update(updateData)
        .eq('id', orderId);

      if (error) throw error;
      await loadOrders();
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors du changement de statut');
    }
  };

  const handleCancelOrder = async (order: RestaurantOrder) => {
    const reason = prompt('Motif d\'annulation :');
    if (!reason) return;
    
    try {
      const { error } = await supabase
        .from('restaurant_orders')
        .update({
          status: 'CANCELLED',
          cancellation_reason: reason,
          cancelled_at: new Date().toISOString(),
          completed_at: new Date().toISOString()
        })
        .eq('id', order.id);

      if (error) throw error;
      
      // Libérer la table si DINE_IN
      if (order.table_id && order.order_type === 'DINE_IN') {
        await supabase.from('restaurant_tables').update({ status: 'AVAILABLE' }).eq('id', order.table_id);
      }
      
      await loadOrders();
      alert('✅ Commande annulée');
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de l\'annulation');
    }
  };

  const getLocationLabel = (order: RestaurantOrder) => {
    if (order.order_type === 'DINE_IN') return `Table ${order.restaurant_tables?.number || '-'}`;
    if (order.order_type === 'ROOM_SERVICE') return `Ch. ${order.rooms?.number || '-'}`;
    if (order.order_type === 'TAKEAWAY') return 'À emporter';
    if (order.order_type === 'DELIVERY') return 'Livraison';
    return '-';
  };

  const getOrderTypeIcon = (type?: string) => {
    switch (type) {
      case 'DINE_IN': return '🍽️';
      case 'TAKEAWAY': return '🥡';
      case 'DELIVERY': return '🚚';
      case 'ROOM_SERVICE': return '🛎️';
      default: return '🍽️';
    }
  };

  // Filtrer les commandes pour l'onglet actif
  const filteredOrders = orders.filter(order => {
    const items = order.restaurant_order_items || [];
    const hasItemsForTab = items.some(item => item.destination === activeTab);
    
    if (!hasItemsForTab) return false;
    if (filterType !== 'ALL' && order.order_type !== filterType) return false;
    
    // Filtrer par statut des articles
    if (filterStatus !== 'ALL') {
      const hasItemsWithStatus = items.some(
        item => item.destination === activeTab && item.status === filterStatus
      );
      if (!hasItemsWithStatus) return false;
    }
    
    return true;
  });

  // Statistiques
  const stats = {
    pending: orders.filter(o => o.restaurant_order_items?.some(i => i.destination === activeTab && i.status === 'PENDING')).length,
    preparing: orders.filter(o => o.restaurant_order_items?.some(i => i.destination === activeTab && i.status === 'PREPARING')).length,
    ready: orders.filter(o => o.restaurant_order_items?.some(i => i.destination === activeTab && i.status === 'READY')).length,
    total: filteredOrders.length
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'PENDING':
        return { label: 'À préparer', color: 'bg-red-100 text-red-800 border-red-300', icon: Clock, nextStatus: 'PREPARING' };
      case 'PREPARING':
        return { label: 'En préparation', color: 'bg-amber-100 text-amber-800 border-amber-300', icon: ChefHat, nextStatus: 'READY' };
      case 'READY':
        return { label: 'Prêt', color: 'bg-emerald-100 text-emerald-800 border-emerald-300', icon: CheckCircle, nextStatus: 'SERVED' };
      case 'SERVED':
        return { label: 'Servi', color: 'bg-blue-100 text-blue-800 border-blue-300', icon: Truck, nextStatus: null };
      default:
        return { label: status, color: 'bg-slate-100 text-slate-800 border-slate-300', icon: Clock, nextStatus: null };
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 min-h-screen bg-slate-50">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ChefHat className="w-7 h-7 text-indigo-600" />
            Cuisine / Bar
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestion des commandes en temps réel • Dernière MAJ: {lastUpdate.toLocaleTimeString('fr-FR')}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
              soundEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            {soundEnabled ? 'Son ON' : 'Son OFF'}
          </button>
          <button
            onClick={loadOrders}
            className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-50"
          >
            <RefreshCw className="w-4 h-4" />
            Actualiser
          </button>
        </div>
      </div>

      {/* Onglets Cuisine / Bar */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => { setActiveTab('KITCHEN'); setFilterStatus('ALL'); }}
          className={`flex items-center gap-2 px-6 py-3 font-bold text-sm transition-colors ${
            activeTab === 'KITCHEN'
              ? 'border-b-3 border-blue-600 text-blue-700 bg-blue-50'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ChefHat className="w-5 h-5" />
          CUISINE
          <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
            {stats.total}
          </span>
        </button>
        <button
          onClick={() => { setActiveTab('BAR'); setFilterStatus('ALL'); }}
          className={`flex items-center gap-2 px-6 py-3 font-bold text-sm transition-colors ${
            activeTab === 'BAR'
              ? 'border-b-3 border-amber-600 text-amber-700 bg-amber-50'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Wine className="w-5 h-5" />
          BAR
          <span className="bg-amber-600 text-white text-xs px-2 py-0.5 rounded-full">
            {stats.total}
          </span>
        </button>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-700">Filtres:</span>
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as any)}
          className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
        >
          <option value="ALL">Tous les statuts</option>
          <option value="PENDING">🔴 À préparer</option>
          <option value="PREPARING">🟡 En préparation</option>
          <option value="READY">🟢 Prêt</option>
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as any)}
          className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
        >
          <option value="ALL">Tous les types</option>
          <option value="DINE_IN">🍽️ Sur place</option>
          <option value="ROOM_SERVICE">🛎️ Chambre</option>
          <option value="TAKEAWAY">🥡 À emporter</option>
        </select>
        <div className="ml-auto flex gap-2 text-sm">
          <div className="bg-red-100 text-red-800 px-3 py-1 rounded-lg font-medium">
            🔴 À préparer: {stats.pending}
          </div>
          <div className="bg-amber-100 text-amber-800 px-3 py-1 rounded-lg font-medium">
            🟡 En prép: {stats.preparing}
          </div>
          <div className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-lg font-medium">
            🟢 Prêt: {stats.ready}
          </div>
        </div>
      </div>

      {/* Liste des commandes */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          {activeTab === 'KITCHEN' ? (
            <ChefHat className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          ) : (
            <Wine className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          )}
          <h3 className="text-xl font-medium text-slate-900 mb-2">
            Aucune commande {activeTab === 'KITCHEN' ? 'cuisine' : 'bar'} en cours
          </h3>
          <p className="text-slate-500">
            Les nouvelles commandes apparaîtront ici automatiquement.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredOrders.map((order) => {
            const items = (order.restaurant_order_items || []).filter(
              item => item.destination === activeTab
            );
            const pendingItems = items.filter(i => i.status === 'PENDING').length;
            const preparingItems = items.filter(i => i.status === 'PREPARING').length;
            const readyItems = items.filter(i => i.status === 'READY').length;

            return (
              <div
                key={order.id}
                className={`bg-white rounded-xl border-2 shadow-sm hover:shadow-lg transition-all ${
                  pendingItems > 0 ? 'border-red-300' :
                  preparingItems > 0 ? 'border-amber-300' :
                  'border-emerald-300'
                }`}
              >
                {/* En-tête de la commande */}
                <div className={`px-4 py-3 rounded-t-xl ${
                  pendingItems > 0 ? 'bg-red-50' :
                  preparingItems > 0 ? 'bg-amber-50' :
                  'bg-emerald-50'
                }`}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-bold text-lg text-slate-900">
                        {order.order_number}
                      </div>
                      <div className="text-xs text-slate-600 flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3" />
                        {new Date(order.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        <span className="ml-2">
                          {getOrderTypeIcon(order.order_type)} {order.order_type === 'DINE_IN' ? 'Sur place' : order.order_type === 'ROOM_SERVICE' ? 'Chambre' : order.order_type === 'TAKEAWAY' ? 'À emporter' : 'Livraison'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => { setSelectedOrder(order); setShowDetailModal(true); }}
                      className="p-1.5 text-slate-600 hover:bg-white/50 rounded"
                      title="Voir les détails"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {order.order_type === 'DINE_IN' ? <Users className="w-4 h-4" /> :
                     order.order_type === 'ROOM_SERVICE' ? <Bed className="w-4 h-4" /> :
                     <TrendingUp className="w-4 h-4" />}
                    <span className="text-slate-900">{getLocationLabel(order)}</span>
                  </div>
                </div>

                {/* Liste des articles */}
                <div className="p-4 space-y-2">
                  {items.map((item) => {
                    const statusConfig = getStatusConfig(item.status);
                    const StatusIcon = statusConfig.icon;
                    return (
                      <div
                        key={item.id}
                        className={`p-3 rounded-lg border ${statusConfig.color} flex items-center justify-between`}
                      >
                        <div className="flex-1">
                          <div className="font-semibold text-slate-900">
                            {item.item_name}
                          </div>
                          <div className="text-xs text-slate-600 mt-1">
                            Qté: <strong>{item.quantity}</strong>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium flex items-center gap-1">
                            <StatusIcon className="w-3 h-3" />
                            {statusConfig.label}
                          </span>
                          {statusConfig.nextStatus && (
                            <button
                              onClick={() => handleStatusChange(item.id, statusConfig.nextStatus)}
                              className={`px-3 py-1 rounded text-xs font-bold text-white ${
                                item.status === 'PENDING' ? 'bg-amber-600 hover:bg-amber-700' :
                                item.status === 'PREPARING' ? 'bg-emerald-600 hover:bg-emerald-700' :
                                'bg-blue-600 hover:bg-blue-700'
                              }`}
                            >
                              {item.status === 'PENDING' ? '▶ Démarrer' :
                               item.status === 'PREPARING' ? '✓ Prêt' :
                               '✓ Servi'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Actions de la commande */}
                <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 rounded-b-xl flex gap-2">
                  <button
                    onClick={() => handleOrderStatusChange(order.id, 'SERVED')}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-1"
                  >
                    <CheckCircle className="w-3 h-3" />
                    Tout servir
                  </button>
                  <button
                    onClick={() => handleCancelOrder(order)}
                    className="px-3 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold py-2 rounded-lg"
                    title="Annuler"
                  >
                    <Ban className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Détails */}
      {showDetailModal && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between sticky top-0 z-10">
              <div>
                <h3 className="text-xl font-bold">Détails de la commande</h3>
                <p className="text-sm text-indigo-100">{selectedOrder.order_number}</p>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="hover:bg-white/20 p-2 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded-lg">
                  <div className="text-xs text-slate-500 mb-1">Lieu</div>
                  <div className="font-semibold text-slate-900">{getLocationLabel(selectedOrder)}</div>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <div className="text-xs text-slate-500 mb-1">Type</div>
                  <div className="font-semibold text-slate-900">
                    {getOrderTypeIcon(selectedOrder.order_type)} {selectedOrder.order_type === 'DINE_IN' ? 'Sur place' : selectedOrder.order_type === 'ROOM_SERVICE' ? 'Chambre' : selectedOrder.order_type === 'TAKEAWAY' ? 'À emporter' : 'Livraison'}
                  </div>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <div className="text-xs text-slate-500 mb-1">Heure</div>
                  <div className="font-semibold text-slate-900">
                    {new Date(selectedOrder.created_at).toLocaleString('fr-FR')}
                  </div>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <div className="text-xs text-slate-500 mb-1">Total</div>
                  <div className="font-bold text-indigo-600 text-lg">
                    {Number(selectedOrder.total_amount).toLocaleString('fr-FR')} F
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-slate-900 mb-3">Articles</h4>
                <div className="space-y-2">
                  {(selectedOrder.restaurant_order_items || []).map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div>
                        <div className="font-medium text-slate-900">{item.item_name}</div>
                        <div className="text-xs text-slate-500">
                          Qté: {item.quantity} • {item.destination === 'KITCHEN' ? '👨‍🍳 Cuisine' : '🍹 Bar'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          item.status === 'PENDING' ? 'bg-red-100 text-red-800' :
                          item.status === 'PREPARING' ? 'bg-amber-100 text-amber-800' :
                          item.status === 'READY' ? 'bg-emerald-100 text-emerald-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {item.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-lg"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
