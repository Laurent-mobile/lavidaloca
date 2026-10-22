'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  Package, Search, Plus, AlertTriangle, CheckCircle, XCircle, 
  Edit2, Trash2, X, TrendingUp, TrendingDown, History, List,
  User, Clock, DollarSign, AlertCircle, Save, Box
} from 'lucide-react';

interface StockItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  purchase_unit: string;
  conversion_factor: number;
  min_threshold: number;
  unit_cost: number;
  created_at: string;
}

interface StockMovement {
  id: string;
  stock_item_id: string;
  movement_type: 'IN' | 'OUT';
  quantity: number;
  reason: string;
  performed_by: string;
  created_at: string;
  stock_items?: { name: string; unit: string };
}

export default function StockPage() {
  const supabase = createClient();
  const [siteId, setSiteId] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [items, setItems] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'items' | 'history'>('items');
  
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // États modale ajout
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newItem, setNewItem] = useState({ 
    name: '', category: '', quantity: 0, unit: 'unités', 
    purchase_unit: 'unité', conversion_factor: 1, min_threshold: 0, unit_cost: 0 
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // États modale ajustement
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [adjustType, setAdjustType] = useState<'IN' | 'OUT'>('IN');
  const [adjustQuantity, setAdjustQuantity] = useState(0);
  const [adjustReason, setAdjustReason] = useState('');
  const [isAdjusting, setIsAdjusting] = useState(false);

  // États pour la modification
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [editForm, setEditForm] = useState({ name: '', category: '', unit: 'unités', purchase_unit: 'unité', conversion_factor: 1, min_threshold: 0, unit_cost: 0 });
  const [isEditing, setIsEditing] = useState(false);

  // États pour la suppression
  const [itemToDelete, setItemToDelete] = useState<StockItem | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data: profile } = await supabase.from('profiles').select('site_id').eq('id', user.id).maybeSingle();
        if (profile) setSiteId(profile.site_id || '');
      }
      loadStockItems();
      loadMovements();
    };
    init();
  }, []);

  const loadStockItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('stock_items').select('*').order('name', { ascending: true });
      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error('Erreur chargement stock:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMovements = async () => {
    try {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('*, stock_items(name, unit)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setMovements(data || []);
    } catch (error) {
      console.error('Erreur chargement mouvements:', error);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name || !newItem.category) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('stock_items').insert({
        site_id: siteId, ...newItem
      });
      if (error) throw error;
      setNewItem({ name: '', category: '', quantity: 0, unit: 'unités', purchase_unit: 'unité', conversion_factor: 1, min_threshold: 0, unit_cost: 0 });
      setIsAddModalOpen(false);
      loadStockItems();
    } catch (error) {
      console.error('Erreur ajout:', error);
      alert('Erreur lors de l\'ajout.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || adjustQuantity <= 0 || !adjustReason.trim()) return;
    setIsAdjusting(true);
    try {
      const newQuantity = adjustType === 'IN' ? selectedItem.quantity + adjustQuantity : selectedItem.quantity - adjustQuantity;
      if (newQuantity < 0) { alert('⚠️ Stock insuffisant !'); setIsAdjusting(false); return; }

      await supabase.from('stock_items').update({ quantity: newQuantity }).eq('id', selectedItem.id);
      await supabase.from('stock_movements').insert({
        site_id: siteId, stock_item_id: selectedItem.id, movement_type: adjustType,
        quantity: adjustQuantity, reason: adjustReason, performed_by: userId
      });

      setAdjustQuantity(0); setAdjustReason(''); setIsAdjustModalOpen(false); setSelectedItem(null);
      loadStockItems(); loadMovements();
    } catch (error) {
      console.error('Erreur ajustement:', error);
      alert('Erreur lors de l\'ajustement.');
    } finally {
      setIsAdjusting(false);
    }
  };

  const openAdjustModal = (item: StockItem, type: 'IN' | 'OUT') => {
    setSelectedItem(item); setAdjustType(type); setAdjustQuantity(0); setAdjustReason(''); setIsAdjustModalOpen(true);
  };

  const openEditModal = (item: StockItem) => {
    setEditingItem(item);
    setEditForm({
      name: item.name, category: item.category, unit: item.unit,
      purchase_unit: item.purchase_unit || 'unité', conversion_factor: item.conversion_factor || 1,
      min_threshold: item.min_threshold, unit_cost: item.unit_cost
    });
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    setIsEditing(true);
    try {
      const { error } = await supabase.from('stock_items').update({
        name: editForm.name, category: editForm.category, unit: editForm.unit,
        purchase_unit: editForm.purchase_unit, conversion_factor: editForm.conversion_factor,
        min_threshold: editForm.min_threshold, unit_cost: editForm.unit_cost
      }).eq('id', editingItem.id);

      if (error) throw error;
      setIsEditModalOpen(false); setEditingItem(null); loadStockItems();
    } catch (error) {
      console.error('Erreur modification:', error);
      alert('Erreur lors de la modification.');
    } finally {
      setIsEditing(false);
    }
  };

  const openDeleteModal = (item: StockItem) => {
    setItemToDelete(item); setDeleteError('');
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true); setDeleteError('');
    try {
      const { count, error: countError } = await supabase
        .from('stock_movements')
        .select('*', { count: 'exact', head: true })
        .eq('stock_item_id', itemToDelete.id);

      if (countError) throw countError;
      if (count && count > 0) {
        setDeleteError(`Impossible de supprimer "${itemToDelete.name}" : cet article possède ${count} mouvement(s) dans l'historique.`);
        setIsDeleting(false); return;
      }

      const { error } = await supabase.from('stock_items').delete().eq('id', itemToDelete.id);
      if (error) throw error;

      setItemToDelete(null); loadStockItems();
    } catch (error) {
      console.error('Erreur suppression:', error);
      setDeleteError('Une erreur est survenue lors de la suppression.');
    } finally {
      setIsDeleting(false);
    }
  };

  const stats = useMemo(() => {
    const outOfStock = items.filter(i => i.quantity === 0).length;
    const lowStock = items.filter(i => i.quantity > 0 && i.quantity <= i.min_threshold).length;
    const totalItems = items.length;
    const totalValue = items.reduce((sum, i) => sum + (i.quantity * i.unit_cost), 0);
    return { outOfStock, lowStock, totalItems, totalValue };
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase()) || item.category.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === 'ALL' || item.category === categoryFilter;
      let matchesStatus = true;
      if (statusFilter === 'OK') matchesStatus = item.quantity > item.min_threshold;
      else if (statusFilter === 'LOW') matchesStatus = item.quantity > 0 && item.quantity <= item.min_threshold;
      else if (statusFilter === 'OUT') matchesStatus = item.quantity === 0;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [items, search, categoryFilter, statusFilter]);

  const getStatus = (item: StockItem) => {
    if (item.quantity === 0) return { label: 'Rupture', color: 'bg-red-100 text-red-800 border-red-200', icon: XCircle };
    if (item.quantity <= item.min_threshold) return { label: 'Stock bas', color: 'bg-amber-100 text-amber-800 border-amber-200', icon: AlertTriangle };
    return { label: 'OK', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: CheckCircle };
  };

  const categories = ['ALL', ...Array.from(new Set(items.map(i => i.category)))];

  return (
    <div className="p-4 lg:p-6 h-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Package className="w-7 h-7 text-indigo-600" /> Gestion des Stocks</h1>
          <p className="text-sm text-slate-500 mt-1">Gérez vos articles, quantités et alertes de rupture.</p>
        </div>
        <button onClick={() => setIsAddModalOpen(true)} className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors shadow-sm">
          <Plus className="w-5 h-5" /> Nouvel Article
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 mb-2"><Package className="w-5 h-5" /><span className="text-sm font-medium">Total articles</span></div>
          <div className="text-2xl font-bold text-slate-900">{stats.totalItems}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 text-emerald-700 mb-2"><DollarSign className="w-5 h-5" /><span className="text-sm font-medium">Valeur du stock</span></div>
          <div className="text-2xl font-bold text-slate-900">{Number(stats.totalValue).toLocaleString('fr-FR')} F</div>
        </div>
        <div className="bg-white rounded-xl border border-amber-200 p-5 shadow-sm bg-amber-50">
          <div className="flex items-center gap-2 text-amber-700 mb-2"><AlertTriangle className="w-5 h-5" /><span className="text-sm font-medium">Stock bas</span></div>
          <div className="text-2xl font-bold text-amber-900">{stats.lowStock}</div>
        </div>
        <div className="bg-white rounded-xl border border-red-200 p-5 shadow-sm bg-red-50">
          <div className="flex items-center gap-2 text-red-700 mb-2"><AlertCircle className="w-5 h-5" /><span className="text-sm font-medium">En rupture</span></div>
          <div className="text-2xl font-bold text-red-900">{stats.outOfStock}</div>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <button onClick={() => setActiveTab('items')} className={`flex items-center gap-2 px-4 py-2 font-medium text-sm transition-colors ${activeTab === 'items' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}>
          <List className="w-4 h-4" /> Articles ({items.length})
        </button>
        <button onClick={() => setActiveTab('history')} className={`flex items-center gap-2 px-4 py-2 font-medium text-sm transition-colors ${activeTab === 'history' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}>
          <History className="w-4 h-4" /> Historique ({movements.length})
        </button>
      </div>

      {activeTab === 'items' ? (
        <>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input type="text" placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div className="flex gap-3">
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-4 py-2 border border-slate-300 rounded-lg bg-white text-sm cursor-pointer">
                <option value="ALL">Toutes catégories</option>
                {categories.filter(c => c !== 'ALL').map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2 border border-slate-300 rounded-lg bg-white text-sm cursor-pointer">
                <option value="ALL">Tous les statuts</option>
                <option value="OK">✅ En stock</option>
                <option value="LOW">⚠️ Stock bas</option>
                <option value="OUT">❌ Rupture</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-16"><Package className="w-12 h-12 text-slate-300 mx-auto mb-3" /><h3 className="text-lg font-medium text-slate-900">Aucun article trouvé</h3></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-semibold">
                      <th className="px-6 py-4">Article</th>
                      <th className="px-6 py-4">Catégorie</th>
                      <th className="px-6 py-4 text-center">Quantité</th>
                      <th className="px-6 py-4 text-center">Achat / Conv.</th>
                      <th className="px-6 py-4 text-center">Seuil min.</th>
                      <th className="px-6 py-4 text-center">Statut</th>
                      <th className="px-6 py-4 text-right">Coût unit.</th>
                      <th className="px-6 py-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredItems.map((item) => {
                      const status = getStatus(item);
                      const StatusIcon = status.icon;
                      return (
                        <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-6 py-4 font-medium text-slate-900">{item.name}</td>
                          <td className="px-6 py-4"><span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">{item.category}</span></td>
                          <td className="px-6 py-4 text-center"><span className={`font-bold ${status.label === 'Rupture' ? 'text-red-600' : status.label === 'Stock bas' ? 'text-amber-600' : 'text-slate-900'}`}>{item.quantity}</span> <span className="text-xs text-slate-500">{item.unit}</span></td>
                          <td className="px-6 py-4 text-center text-xs text-slate-600">1 {item.purchase_unit || 'unité'}<br/>= {item.conversion_factor || 1} {item.unit}</td>
                          <td className="px-6 py-4 text-center text-sm text-slate-600">{item.min_threshold}</td>
                          <td className="px-6 py-4 text-center"><span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${status.color}`}><StatusIcon className="w-3.5 h-3.5" />{status.label}</span></td>
                          <td className="px-6 py-4 text-right text-sm text-slate-700 font-medium">{Number(item.unit_cost).toLocaleString('fr-FR')} F</td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => openAdjustModal(item, 'IN')} className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg" title="Entrée"><TrendingUp className="w-4 h-4" /></button>
                              <button onClick={() => openAdjustModal(item, 'OUT')} className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg" title="Sortie"><TrendingDown className="w-4 h-4" /></button>
                              <button onClick={() => openEditModal(item)} className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg" title="Modifier"><Edit2 className="w-4 h-4" /></button>
                              <button onClick={() => openDeleteModal(item)} className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Supprimer"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {movements.length === 0 ? (
            <div className="text-center py-16"><History className="w-12 h-12 text-slate-300 mx-auto mb-3" /><h3 className="text-lg font-medium text-slate-900">Aucun mouvement</h3></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-semibold">
                    <th className="px-6 py-4">Date</th><th className="px-6 py-4">Article</th><th className="px-6 py-4 text-center">Type</th><th className="px-6 py-4 text-center">Quantité</th><th className="px-6 py-4">Motif</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {movements.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 text-sm text-slate-600"><div className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-slate-400" />{new Date(m.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></td>
                      <td className="px-6 py-4 font-medium text-slate-900">{m.stock_items?.name || 'Inconnu'}</td>
                      <td className="px-6 py-4 text-center">{m.movement_type === 'IN' ? <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200"><TrendingUp className="w-3.5 h-3.5" />Entrée</span> : <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200"><TrendingDown className="w-3.5 h-3.5" />Sortie</span>}</td>
                      <td className="px-6 py-4 text-center"><span className={`font-bold ${m.movement_type === 'IN' ? 'text-emerald-600' : 'text-red-600'}`}>{m.movement_type === 'IN' ? '+' : '-'}{m.quantity}</span> <span className="text-xs text-slate-500">{m.stock_items?.unit}</span></td>
                      <td className="px-6 py-4 text-sm text-slate-700 flex items-start gap-2"><span className="flex-1">{m.reason}</span>{m.performed_by && <User className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modale Ajout */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2"><Plus className="w-5 h-5" /> Nouvel Article</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="hover:bg-indigo-700 p-1 rounded"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAddItem} className="p-6 space-y-4">
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Nom *</label><input type="text" required value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Catégorie *</label><input type="text" required value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" /></div>
              
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Unité de vente (Stock)</label><input type="text" value={newItem.unit} onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="ex: bouteille" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Unité d'achat (Frs)</label><input type="text" value={newItem.purchase_unit} onChange={(e) => setNewItem({ ...newItem, purchase_unit: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="ex: carton" /></div>
              </div>

              <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                <label className="block text-sm font-medium text-amber-900 mb-2 flex items-center gap-1"><Box className="w-4 h-4" /> Facteur de conversion</label>
                <div className="flex items-center gap-2 text-sm text-amber-800 flex-wrap">
                  <span>1</span>
                  <input type="text" value={newItem.purchase_unit || 'unité'} readOnly className="w-24 bg-white border border-amber-300 rounded px-2 py-1 text-center font-bold" />
                  <span>=</span>
                  <input type="number" min="1" value={newItem.conversion_factor} onChange={(e) => setNewItem({ ...newItem, conversion_factor: Number(e.target.value) })} className="w-20 bg-white border border-amber-300 rounded px-2 py-1 text-center font-bold" />
                  <input type="text" value={newItem.unit || 'unités'} readOnly className="w-24 bg-white border border-amber-300 rounded px-2 py-1 text-center" />
                </div>
                <p className="text-xs text-amber-700 mt-2">⚠️ Lors d'une réception, le stock sera augmenté de ce multiplicateur.</p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Qté initiale</label><input type="number" min="0" value={newItem.quantity} onChange={(e) => setNewItem({ ...newItem, quantity: Number(e.target.value) })} className="w-full border border-slate-300 rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Seuil d'alerte</label><input type="number" min="0" value={newItem.min_threshold} onChange={(e) => setNewItem({ ...newItem, min_threshold: Number(e.target.value) })} className="w-full border border-slate-300 rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Coût unit. (F)</label><input type="number" min="0" value={newItem.unit_cost} onChange={(e) => setNewItem({ ...newItem, unit_cost: Number(e.target.value) })} className="w-full border border-slate-300 rounded-lg px-3 py-2" /></div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold py-2.5 rounded-lg">Annuler</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                  {isSubmitting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <><CheckCircle className="w-4 h-4" />Enregistrer</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale Ajustement */}
      {isAdjustModalOpen && selectedItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className={`px-6 py-4 flex items-center justify-between text-white ${adjustType === 'IN' ? 'bg-emerald-600' : 'bg-red-600'}`}>
              <h3 className="text-lg font-bold flex items-center gap-2">{adjustType === 'IN' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}{adjustType === 'IN' ? 'Entrée' : 'Sortie'} de Stock</h3>
              <button onClick={() => setIsAdjustModalOpen(false)} className="hover:bg-white/20 p-1 rounded"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAdjustStock} className="p-6 space-y-4">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="text-xs text-slate-600 mb-1">Article</div>
                <div className="font-bold text-slate-900">{selectedItem.name}</div>
                <div className="text-sm text-slate-600 mt-1">Stock actuel : <span className="font-bold text-indigo-600">{selectedItem.quantity} {selectedItem.unit}</span></div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Quantité *</label><input type="number" min="1" required value={adjustQuantity || ''} onChange={(e) => setAdjustQuantity(Number(e.target.value))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-lg font-bold" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Motif *</label><textarea required value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2" rows={3} placeholder="Ex: Livraison, Casse..." /></div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsAdjustModalOpen(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold py-2.5 rounded-lg">Annuler</button>
                <button type="submit" disabled={isAdjusting || adjustQuantity <= 0 || !adjustReason.trim()} className={`flex-1 font-semibold py-2.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 text-white ${adjustType === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}>
                  {isAdjusting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <><CheckCircle className="w-4 h-4" />Confirmer</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale Modification */}
      {isEditModalOpen && editingItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-blue-600 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2"><Edit2 className="w-5 h-5" /> Modifier l'article</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="hover:bg-blue-700 p-1 rounded"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 mb-2">
                <div className="text-xs text-blue-700">Modification des informations</div>
                <div className="text-sm text-slate-700 mt-1">La quantité actuelle (<span className="font-bold">{editingItem.quantity} {editingItem.unit}</span>) ne sera pas modifiée ici.</div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Nom *</label><input type="text" required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Catégorie *</label><input type="text" required value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Unité vente</label><input type="text" value={editForm.unit} onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Unité achat</label><input type="text" value={editForm.purchase_unit} onChange={(e) => setEditForm({ ...editForm, purchase_unit: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Facteur de conv.</label><input type="number" min="1" value={editForm.conversion_factor} onChange={(e) => setEditForm({ ...editForm, conversion_factor: Number(e.target.value) })} className="w-full border border-slate-300 rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Seuil d'alerte</label><input type="number" min="0" value={editForm.min_threshold} onChange={(e) => setEditForm({ ...editForm, min_threshold: Number(e.target.value) })} className="w-full border border-slate-300 rounded-lg px-3 py-2" /></div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Coût unitaire (F)</label><input type="number" min="0" value={editForm.unit_cost} onChange={(e) => setEditForm({ ...editForm, unit_cost: Number(e.target.value) })} className="w-full border border-slate-300 rounded-lg px-3 py-2" /></div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsEditModalOpen(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold py-2.5 rounded-lg">Annuler</button>
                <button type="submit" disabled={isEditing} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                  {isEditing ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <><Save className="w-4 h-4" />Enregistrer</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale Suppression */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-red-600 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2"><AlertCircle className="w-5 h-5" /> Confirmation</h3>
              <button onClick={() => setItemToDelete(null)} className="hover:bg-red-700 p-1 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              {deleteError ? (
                <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg text-sm mb-4 flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <p>{deleteError}</p>
                </div>
              ) : (
                <p className="text-slate-700 mb-6">Êtes-vous sûr de vouloir supprimer définitivement <strong>"{itemToDelete.name}"</strong> ? Cette action est irréversible.</p>
              )}
              <div className="flex gap-3">
                <button onClick={() => setItemToDelete(null)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold py-2.5 rounded-lg">{deleteError ? 'Fermer' : 'Annuler'}</button>
                {!deleteError && (
                  <button onClick={confirmDelete} disabled={isDeleting} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                    {isDeleting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <><Trash2 className="w-4 h-4" />Supprimer</>}
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
