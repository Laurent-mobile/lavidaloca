'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  ShoppingCart, Search, Plus, Edit2, Trash2, X, CheckCircle, 
  AlertCircle, Truck, Package, Eye, FileText, Save, Clock,
  Calendar, DollarSign, Box, ClipboardList, History
} from 'lucide-react';

interface Supplier { id: string; name: string; }
interface StockItem { id: string; name: string; unit: string; purchase_unit: string; conversion_factor: number; unit_cost: number; }

interface OrderItem {
  id?: string; stock_item_id: string; item_name: string; quantity: number;
  unit: string; purchase_unit: string; conversion_factor: number;
  unit_price: number; total_price: number; received_quantity?: number;
}

interface SupplierOrder {
  id: string; order_number: string; order_date: string; expected_date?: string;
  status: 'DRAFT' | 'SENT' | 'RECEIVED' | 'CANCELLED'; notes?: string; total_amount: number;
  created_at: string; received_at?: string; suppliers?: { name: string };
  supplier_order_items?: OrderItem[];
}

export default function SupplierOrdersPage() {
  const supabase = createClient();
  const [siteId, setSiteId] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [search, setSearch] = useState('');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<SupplierOrder | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [newItemStockId, setNewItemStockId] = useState('');
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemPrice, setNewItemPrice] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [viewingOrder, setViewingOrder] = useState<SupplierOrder | null>(null);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [receiveItems, setReceiveItems] = useState<{ itemId: string; qty: number }[]>([]);
  const [isReceiving, setIsReceiving] = useState(false);
  const [receptionHistory, setReceptionHistory] = useState<any[]>([]);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data: profile } = await supabase.from('profiles').select('site_id').eq('id', user.id).maybeSingle();
        if (profile) setSiteId(profile.site_id || '');
      }
      loadSuppliers();
      loadStockItems();
      loadOrders();
    };
    init();
  }, []);

  useEffect(() => {
    if (viewingOrder) {
      loadReceptionHistory(viewingOrder.order_number);
    } else {
      setReceptionHistory([]);
    }
  }, [viewingOrder]);

  const loadReceptionHistory = async (orderNumber: string) => {
    const { data } = await supabase
      .from('stock_movements')
      .select('quantity, reason, created_at')
      .eq('movement_type', 'IN')
      .like('reason', `%Cmd: ${orderNumber}%`)
      .order('created_at', { ascending: false });
    setReceptionHistory(data || []);
  };

  const loadSuppliers = async () => {
    const { data } = await supabase.from('suppliers').select('id, name').eq('is_active', true).order('name');
    setSuppliers(data || []);
  };

  const loadStockItems = async () => {
    const { data } = await supabase.from('stock_items').select('id, name, unit, purchase_unit, conversion_factor, unit_cost').order('name');
    setStockItems(data || []);
  };

  const loadOrders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('supplier_orders')
        .select(`*, suppliers(name), supplier_order_items(id, stock_item_id, item_name, quantity, unit, purchase_unit, conversion_factor, unit_price, total_price, received_quantity)`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setOrders(data || []);
    } catch (error) { console.error('Erreur chargement commandes:', error); } 
    finally { setLoading(false); }
  };

  const openCreateForm = () => {
    setEditingOrder(null); setSelectedSupplier(''); setOrderDate(new Date().toISOString().split('T')[0]);
    setExpectedDate(''); setNotes(''); setOrderItems([]); setNewItemStockId(''); setNewItemQty(1); setNewItemPrice(0);
    setIsFormOpen(true);
  };

  const openEditForm = (order: SupplierOrder) => {
    if (order.status !== 'DRAFT') { alert('Seules les commandes en brouillon peuvent être modifiées.'); return; }
    setEditingOrder(order); setSelectedSupplier(order.suppliers?.name || ''); setOrderDate(order.order_date);
    setExpectedDate(order.expected_date || ''); setNotes(order.notes || ''); setOrderItems(order.supplier_order_items || []);
    setIsFormOpen(true);
  };

  const addItemToOrder = () => {
    if (!newItemStockId || newItemQty <= 0) return;
    const stockItem = stockItems.find(i => i.id === newItemStockId);
    if (!stockItem) return;

    const price = newItemPrice || stockItem.unit_cost || 0;
    const newItem: OrderItem = {
      stock_item_id: stockItem.id, item_name: stockItem.name, quantity: newItemQty,
      unit: stockItem.unit, purchase_unit: stockItem.purchase_unit || 'unité',
      conversion_factor: stockItem.conversion_factor || 1,
      unit_price: price, total_price: newItemQty * price,
    };
    setOrderItems([...orderItems, newItem]);
    setNewItemStockId(''); setNewItemQty(1); setNewItemPrice(0);
  };

  const removeItemFromOrder = (index: number) => setOrderItems(orderItems.filter((_, i) => i !== index));
  const updateItemQuantity = (index: number, qty: number) => {
    const updated = [...orderItems]; updated[index].quantity = qty; updated[index].total_price = qty * updated[index].unit_price;
    setOrderItems(updated);
  };
  const updateItemPrice = (index: number, price: number) => {
    const updated = [...orderItems]; updated[index].unit_price = price; updated[index].total_price = updated[index].quantity * price;
    setOrderItems(updated);
  };

  const totalOrderAmount = orderItems.reduce((sum, item) => sum + item.total_price, 0);

  const handleSaveOrder = async (status: 'DRAFT' | 'SENT') => {
    if (!selectedSupplier || orderItems.length === 0) { alert('Veuillez sélectionner un fournisseur et ajouter au moins un article.'); return; }
    if (editingOrder && editingOrder.status !== 'DRAFT' && status === 'DRAFT') { alert('⚠️ Impossible de repasser une commande envoyée ou reçue en brouillon.'); return; }

    setIsSubmitting(true);
    try {
      const supplier = suppliers.find(s => s.name === selectedSupplier);
      if (!supplier) throw new Error('Fournisseur non trouvé');

      const orderData = { site_id: siteId, supplier_id: supplier.id, order_date: orderDate, expected_date: expectedDate || null, status, notes, total_amount: totalOrderAmount };
      let orderId: string;

      if (editingOrder) {
        orderId = editingOrder.id;
        await supabase.from('supplier_orders').update(orderData).eq('id', editingOrder.id);
        await supabase.from('supplier_order_items').delete().eq('order_id', editingOrder.id);
      } else {
        // ✅ CORRECTION : Vérification stricte pour éviter l'erreur "order is possibly null"
        const { data: order, error: insertError } = await supabase
          .from('supplier_orders')
          .insert({ ...orderData, order_number: `CMD-FRS-${Date.now().toString().slice(-6)}`, created_by: userId })
          .select('id')
          .single();
        
        if (insertError || !order) throw insertError || new Error("Échec de la création de la commande");
        orderId = order.id;
      }

      const itemsToInsert = orderItems.map(item => ({
        order_id: orderId, stock_item_id: item.stock_item_id, item_name: item.item_name, quantity: item.quantity,
        unit: item.unit, purchase_unit: item.purchase_unit, conversion_factor: item.conversion_factor,
        unit_price: item.unit_price, total_price: item.total_price,
      }));
      await supabase.from('supplier_order_items').insert(itemsToInsert);

      setIsFormOpen(false); loadOrders();
      alert(`✅ Commande ${editingOrder ? 'mise à jour' : 'créée'} !\nStatut : ${status === 'DRAFT' ? '📝 Brouillon' : '🚚 Envoyée'}`);
    } catch (error) { console.error('Erreur sauvegarde:', error); alert('Erreur lors de la sauvegarde.'); } 
    finally { setIsSubmitting(false); }
  };

  const openReceiveModal = (order: SupplierOrder) => {
    setViewingOrder(order);
    setReceiveItems((order.supplier_order_items || []).map(item => {
      const alreadyReceived = item.received_quantity || 0;
      return { itemId: item.id || '', qty: Math.max(0, item.quantity - alreadyReceived) };
    }));
    setIsReceiveModalOpen(true);
  };

  const handleReceiveOrder = async () => {
    if (!viewingOrder) return;
    setIsReceiving(true);
    try {
      let allFullyReceived = true;
      for (const item of viewingOrder.supplier_order_items || []) {
        const receiveItem = receiveItems.find(r => r.itemId === item.id);
        const qtyToAddToOrder = receiveItem ? receiveItem.qty : 0; 
        const oldReceivedQty = item.received_quantity || 0;
        const newReceivedQty = oldReceivedQty + qtyToAddToOrder;

        await supabase.from('supplier_order_items').update({ received_quantity: newReceivedQty }).eq('id', item.id);

        if (qtyToAddToOrder > 0 && item.stock_item_id) {
          const conversionFactor = item.conversion_factor || 1;
          const actualStockQtyToAdd = qtyToAddToOrder * conversionFactor;
          const { data: stockItem } = await supabase.from('stock_items').select('quantity').eq('id', item.stock_item_id).single();
          if (stockItem) {
            const newStockQty = stockItem.quantity + actualStockQtyToAdd;
            await supabase.from('stock_items').update({ quantity: newStockQty }).eq('id', item.stock_item_id);
            await supabase.from('stock_movements').insert({
              site_id: siteId, stock_item_id: item.stock_item_id, movement_type: 'IN',
              quantity: actualStockQtyToAdd,
              reason: `Réception ${qtyToAddToOrder} ${item.purchase_unit}(s) de ${item.item_name} (Cmd: ${viewingOrder.order_number})`,
              performed_by: userId,
            });
          }
        }
        if (newReceivedQty < item.quantity) allFullyReceived = false;
      }

      const newStatus = allFullyReceived ? 'RECEIVED' : 'SENT'; 
      const updateData: any = { status: newStatus };
      if (newStatus === 'RECEIVED' && !viewingOrder.received_at) {
        updateData.received_at = new Date().toISOString(); updateData.received_by = userId;
      }

      await supabase.from('supplier_orders').update(updateData).eq('id', viewingOrder.id);
      await loadOrders();
      setIsReceiveModalOpen(false); setViewingOrder(null);
      alert(allFullyReceived ? '✅ Commande entièrement reçue ! Statut passé à "Reçue".' : '✅ Réception partielle enregistrée !');
    } catch (error) { 
      console.error('Erreur réception:', error); 
      alert('Erreur lors de la réception.'); 
    } finally { 
      setIsReceiving(false); 
    }
  };

  const activeOrders = useMemo(() => orders.filter(o => o.status === 'DRAFT' || o.status === 'SENT'), [orders]);
  const historyOrders = useMemo(() => orders.filter(o => o.status === 'RECEIVED' || o.status === 'CANCELLED'), [orders]);
  const filteredActive = useMemo(() => activeOrders.filter(o => o.order_number.toLowerCase().includes(search.toLowerCase()) || o.suppliers?.name.toLowerCase().includes(search.toLowerCase())), [activeOrders, search]);
  const filteredHistory = useMemo(() => historyOrders.filter(o => o.order_number.toLowerCase().includes(search.toLowerCase()) || o.suppliers?.name.toLowerCase().includes(search.toLowerCase())), [historyOrders, search]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT': return { label: 'Brouillon', color: 'bg-slate-100 text-slate-800 border-slate-200', icon: FileText };
      case 'SENT': return { label: 'À réceptionner', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: Truck };
      case 'RECEIVED': return { label: 'Reçue', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: CheckCircle };
      case 'CANCELLED': return { label: 'Annulée', color: 'bg-red-100 text-red-800 border-red-200', icon: X };
      default: return { label: status, color: 'bg-slate-100 text-slate-800', icon: FileText };
    }
  };

  const renderOrderTable = (ordersToRender: SupplierOrder[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-semibold">
            <th className="px-6 py-4">N° Commande</th><th className="px-6 py-4">Fournisseur</th><th className="px-6 py-4">Date</th>
            <th className="px-6 py-4 text-center">Articles</th><th className="px-6 py-4 text-right">Montant</th>
            <th className="px-6 py-4 text-center">Statut</th><th className="px-6 py-4 text-center">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {ordersToRender.map((order) => {
            const badge = getStatusBadge(order.status);
            const StatusIcon = badge.icon;
            return (
              <tr key={order.id} className="hover:bg-slate-50 transition-colors group">
                <td className="px-6 py-4 font-bold text-indigo-600">{order.order_number}</td>
                <td className="px-6 py-4 font-medium text-slate-900">{order.suppliers?.name || 'Inconnu'}</td>
                <td className="px-6 py-4 text-sm text-slate-600"><div className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-slate-400" />{new Date(order.order_date).toLocaleDateString('fr-FR')}</div></td>
                <td className="px-6 py-4 text-center text-sm text-slate-700">{order.supplier_order_items?.length || 0} article(s)</td>
                <td className="px-6 py-4 text-right font-bold text-slate-900">{Number(order.total_amount).toLocaleString('fr-FR')} F</td>
                <td className="px-6 py-4 text-center"><span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${badge.color}`}><StatusIcon className="w-3.5 h-3.5" />{badge.label}</span></td>
                <td className="px-6 py-4 text-center">
                  <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setViewingOrder(order)} className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Détail"><Eye className="w-4 h-4" /></button>
                    {order.status === 'DRAFT' && <button onClick={() => openEditForm(order)} className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg" title="Modifier"><Edit2 className="w-4 h-4" /></button>}
                    {order.status === 'SENT' && <button onClick={() => openReceiveModal(order)} className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg animate-pulse" title="Réceptionner"><CheckCircle className="w-4 h-4" /></button>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="p-4 lg:p-6 h-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><ShoppingCart className="w-7 h-7 text-indigo-600" /> Commandes Fournisseurs</h1>
          <p className="text-sm text-slate-500 mt-1">Gérez vos commandes, réceptions et mises à jour de stock.</p>
        </div>
        <button onClick={openCreateForm} className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors shadow-sm">
          <Plus className="w-5 h-5" /> Nouvelle Commande
        </button>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <button onClick={() => setActiveTab('active')} className={`flex items-center gap-2 px-4 py-3 font-medium text-sm transition-colors ${activeTab === 'active' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}>
          <ClipboardList className="w-4 h-4" /> Commandes en cours ({activeOrders.length})
        </button>
        <button onClick={() => setActiveTab('history')} className={`flex items-center gap-2 px-4 py-3 font-medium text-sm transition-colors ${activeTab === 'history' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}>
          <History className="w-4 h-4" /> Historique des réceptions ({historyOrders.length})
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input type="text" placeholder="Rechercher par n° commande ou fournisseur..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
          {activeTab === 'active' ? (
            filteredActive.length === 0 ? <div className="text-center py-16 text-slate-500">Aucune commande en cours.</div> : renderOrderTable(filteredActive)
          ) : (
            filteredHistory.length === 0 ? <div className="text-center py-16 text-slate-500">Aucun historique de réception.</div> : renderOrderTable(filteredHistory)
          )}
        </div>
      )}

      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between sticky top-0 z-10">
              <h3 className="text-lg font-bold flex items-center gap-2"><Plus className="w-5 h-5" />{editingOrder ? 'Modifier' : 'Nouvelle'} Commande</h3>
              <button onClick={() => setIsFormOpen(false)} className="hover:bg-indigo-700 p-1 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Fournisseur *</label><select value={selectedSupplier} onChange={(e) => setSelectedSupplier(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"><option value="">-- Sélectionner --</option>{suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Date</label><input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Livraison prévue</label><input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2" /></div>
              </div>
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2"><Package className="w-4 h-4" /> Ajouter des articles</h4>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-5"><label className="text-xs text-slate-600 mb-1 block">Article</label><select value={newItemStockId} onChange={(e) => { setNewItemStockId(e.target.value); const item = stockItems.find(i => i.id === e.target.value); if (item) setNewItemPrice(item.unit_cost || 0); }} className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"><option value="">-- Choisir --</option>{stockItems.map(i => <option key={i.id} value={i.id}>{i.name} (1 {i.purchase_unit} = {i.conversion_factor} {i.unit})</option>)}</select></div>
                  <div className="md:col-span-2"><label className="text-xs text-slate-600 mb-1 block">Qté</label><input type="number" min="1" value={newItemQty || ''} onChange={(e) => setNewItemQty(Number(e.target.value))} className="w-full border border-slate-300 rounded-lg px-3 py-2" /></div>
                  <div className="md:col-span-3"><label className="text-xs text-slate-600 mb-1 block">Prix unit. (F)</label><input type="number" min="0" value={newItemPrice || ''} onChange={(e) => setNewItemPrice(Number(e.target.value))} className="w-full border border-slate-300 rounded-lg px-3 py-2" /></div>
                  <div className="md:col-span-2"><button type="button" onClick={addItemToOrder} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 rounded-lg flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Ajouter</button></div>
                </div>
                {newItemStockId && newItemQty > 0 && (
                  <div className="mt-3 text-sm text-emerald-700 bg-emerald-50 p-2 rounded border border-emerald-200 flex items-center gap-2">
                    <Box className="w-4 h-4" /> Impact stock : +{newItemQty * (stockItems.find(i => i.id === newItemStockId)?.conversion_factor || 1)} {stockItems.find(i => i.id === newItemStockId)?.unit}s
                  </div>
                )}
              </div>
              {orderItems.length > 0 && (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100"><tr><th className="px-4 py-2 text-left">Article</th><th className="px-4 py-2 text-center">Qté (Achat)</th><th className="px-4 py-2 text-center">Impact Stock</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2"></th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {orderItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="px-4 py-2 font-medium">{item.item_name}</td>
                          <td className="px-4 py-2 text-center"><input type="number" min="1" value={item.quantity} onChange={(e) => updateItemQuantity(idx, Number(e.target.value))} className="w-20 border border-slate-300 rounded px-2 py-1 text-center" /><span className="text-xs text-slate-500 ml-1">{item.purchase_unit}</span></td>
                          <td className="px-4 py-2 text-center text-emerald-600 font-medium">+{item.quantity * item.conversion_factor} {item.unit}</td>
                          <td className="px-4 py-2 text-right font-bold">{Number(item.total_price).toLocaleString('fr-FR')} F</td>
                          <td className="px-4 py-2 text-center"><button type="button" onClick={() => removeItemFromOrder(idx)} className="text-red-600 hover:text-red-700 p-1"><Trash2 className="w-4 h-4" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold"><tr><td colSpan={3} className="px-4 py-3 text-right">TOTAL :</td><td className="px-4 py-3 text-right text-lg text-indigo-600">{totalOrderAmount.toLocaleString('fr-FR')} F</td><td></td></tr></tfoot>
                  </table>
                </div>
              )}
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Notes (optionnel)</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Informations complémentaires..." /></div>
              <div className="flex gap-3 pt-2 border-t border-slate-200">
                <button type="button" onClick={() => setIsFormOpen(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold py-2.5 rounded-lg">Annuler</button>
                <button type="button" onClick={() => handleSaveOrder('DRAFT')} disabled={isSubmitting || !selectedSupplier || orderItems.length === 0} className="flex-1 bg-slate-600 hover:bg-slate-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">{isSubmitting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <><FileText className="w-4 h-4" />Brouillon</>}</button>
                <button type="button" onClick={() => handleSaveOrder('SENT')} disabled={isSubmitting || !selectedSupplier || orderItems.length === 0} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">{isSubmitting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <><Truck className="w-4 h-4" />Envoyer</>}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewingOrder && !isReceiveModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="bg-slate-700 text-white px-6 py-4 flex items-center justify-between sticky top-0 z-10">
              <h3 className="text-lg font-bold flex items-center gap-2"><Eye className="w-5 h-5" /> Détail {viewingOrder.order_number}</h3>
              <button onClick={() => setViewingOrder(null)} className="hover:bg-slate-600 p-1 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><div className="text-slate-500 text-xs">Fournisseur</div><div className="font-semibold">{viewingOrder.suppliers?.name}</div></div>
                <div><div className="text-slate-500 text-xs">Date</div><div className="font-semibold">{new Date(viewingOrder.order_date).toLocaleDateString('fr-FR')}</div></div>
                <div><div className="text-slate-500 text-xs">Statut</div><div className="font-semibold">{getStatusBadge(viewingOrder.status).label}</div></div>
                <div><div className="text-slate-500 text-xs">Montant total</div><div className="font-bold text-indigo-600">{Number(viewingOrder.total_amount).toLocaleString('fr-FR')} F</div></div>
              </div>
              {viewingOrder.supplier_order_items && viewingOrder.supplier_order_items.length > 0 && (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100"><tr><th className="px-4 py-2 text-left">Article</th><th className="px-4 py-2 text-center">Qté cmdée</th><th className="px-4 py-2 text-center">Qté reçue</th><th className="px-4 py-2 text-right">Prix unit.</th><th className="px-4 py-2 text-right">Total</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {viewingOrder.supplier_order_items.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2 font-medium">{item.item_name}</td>
                          <td className="px-4 py-2 text-center">{item.quantity} {item.purchase_unit}</td>
                          <td className="px-4 py-2 text-center">{item.received_quantity !== undefined && item.received_quantity > 0 ? <span className="text-emerald-600 font-bold">{item.received_quantity} {item.purchase_unit}</span> : <span className="text-slate-400">-</span>}</td>
                          <td className="px-4 py-2 text-right">{Number(item.unit_price).toLocaleString('fr-FR')} F</td>
                          <td className="px-4 py-2 text-right font-bold">{Number(item.total_price).toLocaleString('fr-FR')} F</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {receptionHistory.length > 0 && (
                <div className="border border-indigo-200 rounded-lg overflow-hidden bg-indigo-50/30">
                  <div className="bg-indigo-100 px-4 py-2 border-b border-indigo-200">
                    <h4 className="text-sm font-bold text-indigo-900 flex items-center gap-2"><History className="w-4 h-4" /> Historique des réceptions partielles</h4>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-white/50"><tr><th className="px-4 py-2 text-left">Date et heure</th><th className="px-4 py-2 text-left">Détail de la réception</th><th className="px-4 py-2 text-center">Quantité ajoutée au stock</th></tr></thead>
                    <tbody className="divide-y divide-indigo-100">
                      {receptionHistory.map((m, idx) => (
                        <tr key={idx} className="hover:bg-white/70">
                          <td className="px-4 py-2 text-slate-600 text-xs whitespace-nowrap">{new Date(m.created_at).toLocaleString('fr-FR')}</td>
                          <td className="px-4 py-2 text-slate-800">{m.reason}</td>
                          <td className="px-4 py-2 text-center font-bold text-emerald-600">+{m.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {viewingOrder.notes && <div className="bg-slate-50 p-3 rounded-lg border border-slate-200"><div className="text-xs text-slate-500 mb-1">Notes</div><div className="text-sm text-slate-700">{viewingOrder.notes}</div></div>}
              {viewingOrder.status === 'RECEIVED' && viewingOrder.received_at && (
                <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 text-sm text-emerald-900 flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Reçue définitivement le {new Date(viewingOrder.received_at).toLocaleString('fr-FR')}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {isReceiveModalOpen && viewingOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="bg-emerald-600 text-white px-6 py-4 flex items-center justify-between sticky top-0 z-10">
              <h3 className="text-lg font-bold flex items-center gap-2"><CheckCircle className="w-5 h-5" /> Réception {viewingOrder.order_number}</h3>
              <button onClick={() => setIsReceiveModalOpen(false)} className="hover:bg-emerald-700 p-1 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg text-sm text-emerald-900"><strong>⚠️ Info :</strong> Le stock sera mis à jour en multipliant la quantité reçue par le facteur de conversion de chaque article.</div>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100"><tr><th className="px-4 py-3 text-left">Article</th><th className="px-4 py-3 text-center">Commandé</th><th className="px-4 py-3 text-center">Déjà reçu</th><th className="px-4 py-3 text-center">Reçu maintenant</th><th className="px-4 py-3 text-center">Reste</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {(viewingOrder.supplier_order_items || []).map((item) => {
                      const alreadyReceived = item.received_quantity || 0;
                      const remaining = Math.max(0, item.quantity - alreadyReceived);
                      const receiveItem = receiveItems.find(r => r.itemId === item.id);
                      const currentInput = receiveItem ? receiveItem.qty : (remaining > 0 ? remaining : 0);
                      return (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-900">{item.item_name}<div className="text-xs text-slate-500 mt-0.5">(1 {item.purchase_unit} = {item.conversion_factor} {item.unit})</div></td>
                          <td className="px-4 py-3 text-center text-slate-600 font-medium">{item.quantity} {item.purchase_unit}</td>
                          <td className="px-4 py-3 text-center">{alreadyReceived > 0 ? <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded text-sm">{alreadyReceived} {item.purchase_unit}</span> : <span className="text-slate-400">0</span>}</td>
                          <td className="px-4 py-3 text-center">
                            <input type="number" min="0" max={remaining} value={currentInput} onChange={(e) => {
                              const val = Math.min(Number(e.target.value), remaining);
                              const updated = [...receiveItems];
                              const existing = updated.find(r => r.itemId === item.id);
                              if (existing) existing.qty = val; else updated.push({ itemId: item.id || '', qty: val });
                              setReceiveItems(updated);
                            }} className="w-24 border-2 border-emerald-300 rounded-lg px-2 py-1.5 text-center font-bold text-emerald-700 focus:ring-2 focus:ring-emerald-500 outline-none" />
                          </td>
                          <td className="px-4 py-3 text-center font-medium text-slate-500">{remaining - currentInput} {item.purchase_unit}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="text-sm text-slate-700"><strong>Résumé :</strong> Vous allez réceptionner les quantités indiquées. Le stock sera augmenté de : <span className="font-bold text-emerald-600">
                  {receiveItems.reduce((sum, r) => {
                    const item = viewingOrder.supplier_order_items?.find(i => i.id === r.itemId);
                    return sum + (r.qty * (item?.conversion_factor || 1));
                  }, 0)}
                </span> unités en stock.</div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setIsReceiveModalOpen(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold py-2.5 rounded-lg">Annuler</button>
                <button onClick={handleReceiveOrder} disabled={isReceiving} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                  {isReceiving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <><CheckCircle className="w-4 h-4" />Valider la réception</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
