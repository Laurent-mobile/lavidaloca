'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  Package, Search, Plus, AlertTriangle, CheckCircle, XCircle, 
  Edit2, Trash2, X, TrendingUp, TrendingDown, History, List,
  User, Clock, DollarSign, AlertCircle, Save, Box, ClipboardCheck, RotateCcw,
  Printer, FileText  // ✅ AJOUTER CES DEUX ICÔNES
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
  
  // ✅ NOUVEAU : Onglet inventaire ajouté
  const [activeTab, setActiveTab] = useState<'items' | 'history' | 'inventory'>('items');
  
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

  // ✅ NOUVEAU : États pour l'inventaire
  const [inventoryCounts, setInventoryCounts] = useState<Record<string, number>>({});
  const [isSavingInventory, setIsSavingInventory] = useState(false);
    // ✅ NOUVEAU : États pour les catégories
  const [stockCategories, setStockCategories] = useState<{ id: string; name: string; color: string }[]>([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#6366F1');
  const [isAddingCategory, setIsAddingCategory] = useState(false);

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
      loadCategories();
    };
    init();
  }, []);

// ✅ NOUVEAU : Charger les catégories
  const loadCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('stock_categories')
        .select('id, name, color')
        .eq('is_active', true)
        .order('name', { ascending: true });
      
      if (error) throw error;
      setStockCategories(data || []);
    } catch (error) {
      console.error('Erreur chargement catégories:', error);
    }
  };

  // ✅ NOUVEAU : Ajouter une catégorie
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    
    setIsAddingCategory(true);
    try {
      const { error } = await supabase.from('stock_categories').insert({
        site_id: siteId,
        name: newCategoryName.trim(),
        color: newCategoryColor,
        is_active: true,
        created_by: userId
      });
      
      if (error) {
        if (error.code === '23505') {
          alert('⚠️ Cette catégorie existe déjà.');
        } else {
          throw error;
        }
        return;
      }
      
      setNewCategoryName('');
      setNewCategoryColor('#6366F1');
      setShowCategoryModal(false);
      await loadCategories();
      alert('✅ Catégorie ajoutée !');
    } catch (error: any) {
      alert('Erreur : ' + error.message);
    } finally {
      setIsAddingCategory(false);
    }
  };

  const loadStockItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('stock_items')
        .select('*')
        .order('name', { ascending: true });
      
      if (error) throw error;

      const formattedItems = (data || []).map(item => ({
        ...item,
        quantity: item.current_stock || 0,
        unit: item.unit || 'unité',
        purchase_unit: item.purchase_unit || 'unité',
        conversion_factor: item.conversion_factor || 1,
        min_threshold: item.min_threshold || 0,
        unit_cost: item.last_purchase_price || item.unit_cost || 0
      }));
      
      setItems(formattedItems);
    } catch (error) {
      console.error('Erreur chargement stock:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMovements = async () => {
    try {
      // ✅ AUGMENTATION DE LA LIMITE À 500 POUR VOIR PLUS D'HISTORIQUE
      const { data, error } = await supabase
        .from('stock_movements')
        .select(`
          *, 
          stock_items(name, unit)
        `)
        .order('created_at', { ascending: false })
        .limit(500); 

      if (error) throw error;
      
      // Filtrage de sécurité au cas où certaines jointures échouent
      const validMovements = (data || []).filter(m => m.stock_items !== null);
      
      setMovements(validMovements);
    } catch (error) {
      console.error('Erreur chargement mouvements:', error);
    }
  };

  // ✅ NOUVEAU : Sauvegarde de l'inventaire physique
  const saveInventory = async () => {
    if (!confirm("Valider cet inventaire ? Les écarts seront enregistrés comme des ajustements de stock.")) return;
    
    setIsSavingInventory(true);
    try {
      let adjustmentsCount = 0;
      
      for (const [itemId, countedQty] of Object.entries(inventoryCounts)) {
        const item = items.find(i => i.id === itemId);
        if (!item || countedQty === item.quantity) continue; // Pas de changement

        const diff = countedQty - item.quantity;
        
        // 1. Mettre à jour le stock
        await supabase.from('stock_items').update({ 
          current_stock: countedQty 
        }).eq('id', itemId);

        // 2. Enregistrer le mouvement d'ajustement
        await supabase.from('stock_movements').insert({
          site_id: siteId,
          stock_item_id: itemId,
          movement_type: diff > 0 ? 'IN' : 'OUT',
          quantity: Math.abs(diff),
          reason: `Inventaire physique (Écart: ${diff > 0 ? '+' : ''}${diff})`,
          performed_by: userId
        });
        
        adjustmentsCount++;
      }
      
      alert(`✅ Inventaire validé ! ${adjustmentsCount} ajustement(s) enregistré(s).`);
      setInventoryCounts({}); // Reset des champs
      loadStockItems(); // Recharger les données fraîches
      loadMovements(); // Mettre à jour l'historique
      setActiveTab('history'); // Basculer sur l'historique pour voir les ajustements
    } catch (error: any) {
      alert("Erreur lors de la validation: " + error.message);
    } finally {
      setIsSavingInventory(false);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name || !newItem.category) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('stock_items').insert({
        site_id: siteId,
        name: newItem.name,
        category: newItem.category,
        current_stock: newItem.quantity,
        unit: newItem.unit,
        purchase_unit: newItem.purchase_unit,
        conversion_factor: newItem.conversion_factor,
        min_stock: newItem.min_threshold,
        last_purchase_price: newItem.unit_cost,
        is_active: true
      });
      
      if (error) throw error;
      
      setNewItem({ 
        name: '', category: '', quantity: 0, unit: 'unités', 
        purchase_unit: 'unité', conversion_factor: 1, min_threshold: 0, unit_cost: 0 
      });
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
      const newQuantity = adjustType === 'IN' 
        ? selectedItem.quantity + adjustQuantity 
        : selectedItem.quantity - adjustQuantity;
      
      if (newQuantity < 0) { 
        alert('⚠️ Stock insuffisant !'); 
        setIsAdjusting(false); 
        return; 
      }

      await supabase
        .from('stock_items')
        .update({ current_stock: newQuantity })
        .eq('id', selectedItem.id);
        
      await supabase
        .from('stock_movements')
        .insert({
          site_id: siteId,
          stock_item_id: selectedItem.id,
          movement_type: adjustType,
          quantity: adjustQuantity,
          reason: adjustReason,
          performed_by: userId
        });

      setAdjustQuantity(0); 
      setAdjustReason(''); 
      setIsAdjustModalOpen(false); 
      setSelectedItem(null);
      loadStockItems(); 
      loadMovements();
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
        name: editForm.name,
        category: editForm.category,
        unit: editForm.unit,
        purchase_unit: editForm.purchase_unit,
        conversion_factor: editForm.conversion_factor,
        min_stock: editForm.min_threshold,
        last_purchase_price: editForm.unit_cost
      }).eq('id', editingItem.id);

      if (error) throw error;
      setIsEditModalOpen(false); 
      setEditingItem(null); 
      loadStockItems();
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
// ✅ Helper pour formater les montants
const formatMoney = (n: number) => Number(n || 0).toLocaleString('fr-FR');

// ✅ NOUVEAU : Imprimer l'état global du stock avec QR Code
const handlePrintStockReport = () => {
  const reportId = `STOCK-${siteId?.slice(0, 8).toUpperCase() || 'GLOBAL'}-${Date.now().toString().slice(-6)}`;
  const generatedAt = new Date().toISOString();
  const qrData = `VIDALOCA_STOCK_REPORT|${reportId}|${items.length}|${stats.totalValue}|${generatedAt}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrData)}`;

  // Stats par catégorie
  const byCategory: Record<string, { items: number; value: number; low: number; out: number }> = {};
  items.forEach(item => {
    if (!byCategory[item.category]) byCategory[item.category] = { items: 0, value: 0, low: 0, out: 0 };
    byCategory[item.category].items += 1;
    byCategory[item.category].value += item.quantity * item.unit_cost;
    if (item.quantity === 0) byCategory[item.category].out += 1;
    else if (item.quantity <= item.min_threshold) byCategory[item.category].low += 1;
  });

  const categoryRows = Object.entries(byCategory)
    .sort((a, b) => b[1].value - a[1].value)
    .map(([cat, data]) => `
      <tr>
        <td>${cat}</td>
        <td style="text-align:center;">${data.items}</td>
        <td style="text-align:center; color: ${data.out > 0 ? '#dc2626' : data.low > 0 ? '#d97706' : '#059669'};">
          ${data.out > 0 ? `⚠️ ${data.out}` : data.low > 0 ? `⚡ ${data.low}` : '✅ 0'}
        </td>
        <td style="text-align:right; font-weight: bold;">${formatMoney(data.value)} F</td>
        <td style="text-align:right;">${stats.totalValue > 0 ? ((data.value / stats.totalValue) * 100).toFixed(1) : 0}%</td>
      </tr>
    `).join('');

  // Articles en alerte (stock bas ou rupture)
  const alertItems = items.filter(i => i.quantity <= i.min_threshold);
  const alertRows = alertItems.map(item => `
    <tr style="background: ${item.quantity === 0 ? '#fef2f2' : '#fffbeb'};">
      <td>${item.name}</td>
      <td>${item.category}</td>
      <td style="text-align:center; font-weight: bold; color: ${item.quantity === 0 ? '#dc2626' : '#d97706'};">
        ${item.quantity} ${item.unit}
      </td>
      <td style="text-align:center;">${item.min_threshold} ${item.unit}</td>
      <td style="text-align:right;">${formatMoney(item.unit_cost)} F</td>
      <td style="text-align:center;">
        ${item.quantity === 0 ? '<span style="color:#dc2626;">❌ RUPTURE</span>' : '<span style="color:#d97706;">⚠️ STOCK BAS</span>'}
      </td>
    </tr>
  `).join('');

  // Détail complet des articles
  const itemsRows = items
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
    .map(item => {
      const status = item.quantity === 0 ? '❌' : item.quantity <= item.min_threshold ? '⚠️' : '✅';
      return `
        <tr>
          <td>${item.name}</td>
          <td>${item.category}</td>
          <td style="text-align:center;">${item.quantity} ${item.unit}</td>
          <td style="text-align:center;">${item.min_threshold}</td>
          <td style="text-align:center;">${status}</td>
          <td style="text-align:right;">${formatMoney(item.unit_cost)} F</td>
          <td style="text-align:right; font-weight: bold;">${formatMoney(item.quantity * item.unit_cost)} F</td>
        </tr>
      `;
    }).join('');

  // Mouvements récents
  const recentMovements = movements.slice(0, 20);
  const movementRows = recentMovements.map(m => `
    <tr>
      <td>${new Date(m.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
      <td>${m.stock_items?.name || 'Inconnu'}</td>
      <td style="text-align:center;">
        ${m.movement_type === 'IN' ? '<span style="color:#059669;">📥 Entrée</span>' : '<span style="color:#dc2626;">📤 Sortie</span>'}
      </td>
      <td style="text-align:right; font-weight: bold; color: ${m.movement_type === 'IN' ? '#059669' : '#dc2626'};">
        ${m.movement_type === 'IN' ? '+' : '-'}${m.quantity} ${m.stock_items?.unit || ''}
      </td>
      <td>${m.reason || '—'}</td>
    </tr>
  `).join('');

  const printWindow = window.open('', '_blank', 'width=1000,height=1400');
  if (!printWindow) { alert('Veuillez autoriser les popups.'); return; }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>État Global du Stock - ${new Date().toLocaleDateString('fr-FR')}</title>
      <style>
        @page { size: A4; margin: 12mm; }
        body { font-family: Arial, sans-serif; font-size: 10px; color: #1f2937; margin: 0; padding: 15px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #4f46e5; padding-bottom: 12px; margin-bottom: 15px; }
        .header-left h1 { color: #4f46e5; margin: 0; font-size: 22px; }
        .header-left .subtitle { color: #6b7280; font-size: 11px; margin-top: 3px; }
        .header-left .title { font-size: 16px; font-weight: bold; margin-top: 8px; color: #1f2937; }
        .qr-box { text-align: center; }
        .qr-box img { border: 2px solid #e2e8f0; padding: 4px; border-radius: 6px; }
        .qr-box small { display: block; margin-top: 3px; color: #6b7280; font-size: 9px; }
        .section { margin-bottom: 15px; }
        .section-title { font-size: 12px; font-weight: bold; color: #4f46e5; border-bottom: 2px solid #4f46e5; padding-bottom: 4px; margin-bottom: 8px; }
        .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0; }
        .stat-card { background: #f9fafb; padding: 10px; border-radius: 6px; text-align: center; border: 1px solid #e5e7eb; }
        .stat-value { font-size: 18px; font-weight: bold; color: #4f46e5; }
        .stat-label { font-size: 9px; color: #6b7280; margin-top: 3px; }
        .stat-card.green { background: #ecfdf5; border-color: #10b981; }
        .stat-card.green .stat-value { color: #059669; }
        .stat-card.red { background: #fef2f2; border-color: #ef4444; }
        .stat-card.red .stat-value { color: #dc2626; }
        .stat-card.amber { background: #fffbeb; border-color: #f59e0b; }
        .stat-card.amber .stat-value { color: #d97706; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 9px; }
        th { background: #4f46e5; color: white; padding: 6px; text-align: left; font-size: 9px; }
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
          <div class="title">📊 ÉTAT GLOBAL DU STOCK</div>
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
          <div style="background: #f9fafb; padding: 8px; border-radius: 5px; border-left: 3px solid #4f46e5;">
            <div style="font-size: 9px; color: #6b7280; text-transform: uppercase; font-weight: bold;">Date du rapport</div>
            <div style="font-size: 11px; font-weight: bold;">${new Date().toLocaleString('fr-FR')}</div>
          </div>
          <div style="background: #f9fafb; padding: 8px; border-radius: 5px; border-left: 3px solid #4f46e5;">
            <div style="font-size: 9px; color: #6b7280; text-transform: uppercase; font-weight: bold;">Nombre d'articles</div>
            <div style="font-size: 11px; font-weight: bold;">${items.length} articles</div>
          </div>
          <div style="background: #f9fafb; padding: 8px; border-radius: 5px; border-left: 3px solid #4f46e5;">
            <div style="font-size: 9px; color: #6b7280; text-transform: uppercase; font-weight: bold;">Catégories</div>
            <div style="font-size: 11px; font-weight: bold;">${Object.keys(byCategory).length} catégories</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">💰 Synthèse financière</div>
        <div class="stats-grid">
          <div class="stat-card green">
            <div class="stat-value">${formatMoney(stats.totalValue)} F</div>
            <div class="stat-label">Valeur totale du stock</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${items.length}</div>
            <div class="stat-label">Articles référencés</div>
          </div>
          <div class="stat-card amber">
            <div class="stat-value">${stats.lowStock}</div>
            <div class="stat-label">Stocks bas</div>
          </div>
          <div class="stat-card red">
            <div class="stat-value">${stats.outOfStock}</div>
            <div class="stat-label">En rupture</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">📊 Répartition par catégorie</div>
        <table>
          <thead>
            <tr>
              <th>Catégorie</th>
              <th style="text-align:center;">Nb articles</th>
              <th style="text-align:center;">Alertes</th>
              <th style="text-align:right;">Valeur</th>
              <th style="text-align:right;">% du total</th>
            </tr>
          </thead>
          <tbody>${categoryRows}</tbody>
          <tfoot>
            <tr style="background:#eef2ff; font-weight:bold;">
              <td>TOTAL</td>
              <td style="text-align:center;">${items.length}</td>
              <td style="text-align:center;">${stats.lowStock + stats.outOfStock}</td>
              <td style="text-align:right;">${formatMoney(stats.totalValue)} F</td>
              <td style="text-align:right;">100%</td>
            </tr>
          </tfoot>
        </table>
      </div>

      ${alertItems.length > 0 ? `
      <div class="section">
        <div class="section-title">⚠️ Alertes de stock (${alertItems.length} article(s))</div>
        <table>
          <thead>
            <tr>
              <th>Article</th>
              <th>Catégorie</th>
              <th style="text-align:center;">Stock actuel</th>
              <th style="text-align:center;">Seuil min.</th>
              <th style="text-align:right;">Coût unit.</th>
              <th style="text-align:center;">Statut</th>
            </tr>
          </thead>
          <tbody>${alertRows}</tbody>
        </table>
      </div>
      ` : ''}

      <div class="section">
        <div class="section-title">📦 Détail complet des articles (${items.length})</div>
        <table>
          <thead>
            <tr>
              <th>Article</th>
              <th>Catégorie</th>
              <th style="text-align:center;">Quantité</th>
              <th style="text-align:center;">Seuil min.</th>
              <th style="text-align:center;">Statut</th>
              <th style="text-align:right;">Coût unit.</th>
              <th style="text-align:right;">Valeur</th>
            </tr>
          </thead>
          <tbody>${itemsRows}</tbody>
          <tfoot>
            <tr style="background:#eef2ff; font-weight:bold;">
              <td colspan="6" style="text-align:right;">VALEUR TOTALE :</td>
              <td style="text-align:right;">${formatMoney(stats.totalValue)} F</td>
            </tr>
          </tfoot>
        </table>
      </div>

      ${recentMovements.length > 0 ? `
      <div class="section">
        <div class="section-title">📜 Derniers mouvements de stock (${recentMovements.length})</div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Article</th>
              <th style="text-align:center;">Type</th>
              <th style="text-align:right;">Quantité</th>
              <th>Motif</th>
            </tr>
          </thead>
          <tbody>${movementRows}</tbody>
        </table>
      </div>
      ` : ''}

      <div class="footer">
        <div class="authenticity">
          🔐 <strong>Document certifié unique</strong> — Cet état de stock est protégé par un QR code d'authenticité. Scannez-le pour vérifier l'intégrité des données.
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 20px;">
          <div><div style="border-top: 1px solid #1f2937; padding-top: 5px; text-align: center; font-size: 10px;"><div style="height: 40px;"></div><b>Responsable Stock</b><div style="font-size: 9px; color: #6b7280;">Nom et signature</div></div></div>
          <div><div style="border-top: 1px solid #1f2937; padding-top: 5px; text-align: center; font-size: 10px;"><div style="height: 40px;"></div><b>Directeur Général</b><div style="font-size: 9px; color: #6b7280;">Nom et signature</div></div></div>
        </div>
        <div class="text-center" style="margin-top: 15px; font-size: 9px; color: #6b7280;">
          Document généré le ${new Date().toLocaleString('fr-FR')} • LA VIDA-LOCA PMS • ${items.length} article(s) • Valeur: ${formatMoney(stats.totalValue)} F
        </div>
      </div>

      <div class="no-print" style="text-align: center; margin-top: 20px;">
        <button onclick="window.print()" style="padding: 10px 25px; background: #4f46e5; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold;">🖨️ Imprimer l'état de stock</button>
        <button onclick="window.close()" style="padding: 10px 25px; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; margin-left: 10px;">Fermer</button>
      </div>
      <script>window.onload = function() { setTimeout(function() { window.print(); }, 500); };</script>
    </body>
    </html>
  `);
  printWindow.document.close();
};

  return (
    <div className="p-4 lg:p-6 h-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
  <div>
    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Package className="w-7 h-7 text-indigo-600" /> Gestion des Stocks</h1>
    <p className="text-sm text-slate-500 mt-1">Gérez vos articles, quantités, historique et inventaires.</p>
  </div>
  <div className="flex flex-wrap gap-2">
    {/* ✅ NOUVEAU : Bouton État PDF */}
    <button 
      onClick={handlePrintStockReport}
      disabled={items.length === 0}
      className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white px-4 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
      title="Générer l'état global du stock PDF avec QR Code"
    >
      <FileText className="w-5 h-5" /> État PDF
    </button>
    <button onClick={() => setIsAddModalOpen(true)} className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors shadow-sm">
      <Plus className="w-5 h-5" /> Nouvel Article
    </button>
  </div>
</div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 mb-2"><Package className="w-5 h-5" /><span className="text-sm font-medium">Total articles</span></div>
          <div className="text-2xl font-bold text-slate-900">{stats.totalItems}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 text-emerald-700 mb-2"><DollarSign className="w-5 h-5" /><span className="text-sm font-medium">Valeur du stock</span></div>
          <div className="text-2xl font-bold text-slate-900">{Number(stats.totalValue).toLocaleString('fr-FR')} fcfa</div>
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

      {/* ✅ NOUVEAU : Onglets avec Inventaire */}
      <div className="flex gap-2 border-b border-slate-200 overflow-x-auto">
        <button onClick={() => setActiveTab('items')} className={`flex items-center gap-2 px-4 py-3 font-medium text-sm transition-colors whitespace-nowrap ${activeTab === 'items' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}>
          <List className="w-4 h-4" /> Articles ({items.length})
        </button>
        <button onClick={() => setActiveTab('history')} className={`flex items-center gap-2 px-4 py-3 font-medium text-sm transition-colors whitespace-nowrap ${activeTab === 'history' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}>
          <History className="w-4 h-4" /> Historique ({movements.length})
        </button>
        <button onClick={() => setActiveTab('inventory')} className={`flex items-center gap-2 px-4 py-3 font-medium text-sm transition-colors whitespace-nowrap ${activeTab === 'inventory' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}>
          <ClipboardCheck className="w-4 h-4" /> Inventaire Physique
        </button>
      </div>

      {activeTab === 'items' && (
        <>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input type="text" placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div className="flex gap-3">
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-4 py-2 border border-slate-300 rounded-lg bg-white text-sm cursor-pointer">
  <option value="ALL">Toutes catégories</option>
  {stockCategories.map(cat => (
    <option key={cat.id} value={cat.name}>{cat.name}</option>
  ))}
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
                          <td className="px-6 py-4 text-right text-sm text-slate-700 font-medium">{Number(item.unit_cost).toLocaleString('fr-FR')} fcfa</td>
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
      )}

      {/* ✅ MODIFICATION DE L'HISTORIQUE POUR DISTINGUER LES TYPES DE SORTIES */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {movements.length === 0 ? (
            <div className="text-center py-16"><History className="w-12 h-12 text-slate-300 mx-auto mb-3" /><h3 className="text-lg font-medium text-slate-900">Aucun mouvement</h3></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-semibold">
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Article</th>
                    <th className="px-6 py-4 text-center">Type</th>
                    <th className="px-6 py-4 text-center">Quantité</th>
                    <th className="px-6 py-4">Motif / Détails</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {movements.map((m) => {
                    // Logique pour déterminer le badge visuel
                    const isBottleOpening = m.reason?.toLowerCase().includes('ouverture');
                    const isInventoryAdj = m.reason?.toLowerCase().includes('inventaire');
                    
                    let badgeClass = "";
                    let badgeText = "";
                    
                    if (m.movement_type === 'IN') {
                      badgeClass = "bg-emerald-100 text-emerald-800 border-emerald-200";
                      badgeText = isInventoryAdj ? "📋 INVENTAIRE (+)" : "📥 ENTRÉE";
                    } else {
                      if (isBottleOpening) {
                        badgeClass = "bg-purple-100 text-purple-800 border-purple-200";
                        badgeText = "🍾 OUVERTURE";
                      } else if (isInventoryAdj) {
                        badgeClass = "bg-orange-100 text-orange-800 border-orange-200";
                        badgeText = "📋 INVENTAIRE (-)";
                      } else {
                        badgeClass = "bg-blue-100 text-blue-800 border-blue-200";
                        badgeText = "🥃 VENTE CONSOMMATION";
                      }
                    }

                    return (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 text-sm text-slate-600"><div className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-slate-400" />{new Date(m.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></td>
                        <td className="px-6 py-4 font-medium text-slate-900">{m.stock_items?.name || 'Inconnu'}</td>
                        
                        {/* ✅ Badge amélioré */}
                        <td className="px-6 py-4 text-center">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${badgeClass}`}>
                            {badgeText}
                          </span>
                        </td>
                        
                        <td className="px-6 py-4 text-center"><span className={`font-bold ${m.movement_type === 'IN' ? 'text-emerald-600' : 'text-red-600'}`}>{m.movement_type === 'IN' ? '+' : '-'}{m.quantity}</span> <span className="text-xs text-slate-500">{m.stock_items?.unit}</span></td>
                        
                        {/* ✅ Motif détaillé avec utilisateur */}
                        <td className="px-6 py-4 text-sm text-slate-700">
                          <div className="flex flex-col">
                            <span className="font-medium">{m.reason}</span>
                            {m.performed_by && (
                              <span className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                                <User className="w-3 h-3" /> Par: {m.performed_by}
                              </span>
                            )}
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
      )}

      {/* ✅ NOUVEAU : ONGLET INVENTAIRE PHYSIQUE */}
      {activeTab === 'inventory' && (
        <div className="space-y-4">
          <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="font-bold text-blue-900 flex items-center gap-2"><ClipboardCheck className="w-5 h-5"/> Inventaire Physique</h3>
              <p className="text-sm text-blue-700 mt-1">Comptez vos bouteilles réelles. Le système ajustera automatiquement le stock théorique et tracera les écarts.</p>
            </div>
            <button 
              onClick={saveInventory}
              disabled={isSavingInventory || Object.keys(inventoryCounts).length === 0}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-all shadow-sm"
            >
              {isSavingInventory ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> : <Save className="w-4 h-4"/>}
              Valider l'inventaire
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-semibold">
                    <th className="px-6 py-4 w-1/3">Article</th>
                    <th className="px-6 py-4 text-center w-1/6">Stock Théorique</th>
                    <th className="px-6 py-4 text-center w-1/4">Stock Compté (Réel)</th>
                    <th className="px-6 py-4 text-center w-1/6">Écart</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => {
                    const counted = inventoryCounts[item.id] ?? item.quantity;
                    const diff = counted - item.quantity;
                    const hasChanged = inventoryCounts[item.id] !== undefined;
                    
                    return (
                      <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${hasChanged ? 'bg-blue-50/50' : ''}`}>
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-900">{item.name}</div>
                          <div className="text-xs text-slate-500">{item.category}</div>
                        </td>
                        <td className="px-6 py-4 text-center text-slate-500 font-mono">{item.quantity} {item.unit}</td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <input 
                              type="number" 
                              min="0"
                              step="0.01"
                              value={inventoryCounts[item.id] ?? ''}
                              onChange={(e) => setInventoryCounts(prev => ({...prev, [item.id]: parseFloat(e.target.value) >= 0 ? parseFloat(e.target.value) : 0}))}
                              placeholder={item.quantity.toString()}
                              className={`w-28 text-center border rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none font-mono ${hasChanged ? 'border-blue-300 bg-white' : 'border-slate-200 bg-slate-50'}`}
                            />
                            {hasChanged && (
                              <button 
                                onClick={() => setInventoryCounts(prev => { const n = {...prev}; delete n[item.id]; return n; })}
                                className="text-slate-400 hover:text-red-500 p-1"
                                title="Réinitialiser"
                              >
                                <RotateCcw className="w-3.5 h-3.5"/>
                              </button>
                            )}
                          </div>
                        </td>
                        <td className={`px-6 py-4 text-center font-bold font-mono ${
                          diff === 0 ? 'text-slate-300' : diff > 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}>
                          {hasChanged && (diff !== 0 ? `${diff > 0 ? '+' : ''}${diff}` : '-')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {items.length === 0 && (
              <div className="text-center py-16"><Package className="w-12 h-12 text-slate-300 mx-auto mb-3" /><h3 className="text-lg font-medium text-slate-900">Aucun article à inventorier</h3></div>
            )}
          </div>
        </div>
      )}

      {/* Modale Ajout (inchangée) */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2"><Plus className="w-5 h-5" /> Nouvel Article</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="hover:bg-indigo-700 p-1 rounded"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAddItem} className="p-6 space-y-4">
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Nom *</label><input type="text" required value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" /></div>
              <div>
  <label className="block text-sm font-medium text-slate-700 mb-1">Catégorie *</label>
  <div className="flex gap-2">
    <select 
      required 
      value={newItem.category} 
      onChange={(e) => setNewItem({ ...newItem, category: e.target.value })} 
      className="flex-1 border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
    >
      <option value="">-- Choisir une catégorie --</option>
      {stockCategories.map(cat => (
        <option key={cat.id} value={cat.name}>
          {cat.name}
        </option>
      ))}
    </select>
    <button 
      type="button"
      onClick={() => setShowCategoryModal(true)}
      className="px-3 py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg transition-colors"
      title="Ajouter une nouvelle catégorie"
    >
      <Plus className="w-5 h-5" />
    </button>
  </div>
  {stockCategories.length === 0 && (
    <p className="text-xs text-amber-600 mt-1">⚠️ Aucune catégorie disponible. Cliquez sur + pour en créer une.</p>
  )}
</div>
              
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
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Coût unit. (fcfa)</label><input type="number" min="0" value={newItem.unit_cost} onChange={(e) => setNewItem({ ...newItem, unit_cost: Number(e.target.value) })} className="w-full border border-slate-300 rounded-lg px-3 py-2" /></div>
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

      {/* Modale Ajustement (inchangée) */}
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

      {/* Modale Modification (inchangée) */}
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
              <div>
  <label className="block text-sm font-medium text-slate-700 mb-1">Catégorie *</label>
  <div className="flex gap-2">
    <select 
  required 
  value={editForm.category} 
  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} 
  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
>
  <option value="">-- Choisir une catégorie --</option>
  {stockCategories.map(cat => (
    <option key={cat.id} value={cat.name}>{cat.name}</option>
  ))}
</select>
    <button 
      type="button"
      onClick={() => setShowCategoryModal(true)}
      className="px-3 py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg transition-colors"
      title="Ajouter une nouvelle catégorie"
    >
      <Plus className="w-5 h-5" />
    </button>
  </div>
  {stockCategories.length === 0 && (
    <p className="text-xs text-amber-600 mt-1">⚠️ Aucune catégorie disponible. Cliquez sur + pour en créer une.</p>
  )}
</div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Unité vente</label><input type="text" value={editForm.unit} onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Unité achat</label><input type="text" value={editForm.purchase_unit} onChange={(e) => setEditForm({ ...editForm, purchase_unit: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Facteur de conv.</label><input type="number" min="1" value={editForm.conversion_factor} onChange={(e) => setEditForm({ ...editForm, conversion_factor: Number(e.target.value) })} className="w-full border border-slate-300 rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Seuil d'alerte</label><input type="number" min="0" value={editForm.min_threshold} onChange={(e) => setEditForm({ ...editForm, min_threshold: Number(e.target.value) })} className="w-full border border-slate-300 rounded-lg px-3 py-2" /></div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Coût unitaire (fcfa)</label><input type="number" min="0" value={editForm.unit_cost} onChange={(e) => setEditForm({ ...editForm, unit_cost: Number(e.target.value) })} className="w-full border border-slate-300 rounded-lg px-3 py-2" /></div>
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

      {/* Modale Suppression (inchangée) */}
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

          {/* ✅ NOUVEAU : Modal Ajout de Catégorie */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Plus className="w-5 h-5" /> Nouvelle Catégorie
              </h3>
              <button onClick={() => { setShowCategoryModal(false); setNewCategoryName(''); }} className="hover:bg-indigo-700 p-1 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddCategory} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nom de la catégorie *</label>
                <input 
                  type="text" 
                  required 
                  value={newCategoryName} 
                  onChange={(e) => setNewCategoryName(e.target.value)} 
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Ex: Boissons, Alimentation, Viandes..."
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Couleur</label>
                <div className="flex items-center gap-3">
                  <input 
                    type="color" 
                    value={newCategoryColor} 
                    onChange={(e) => setNewCategoryColor(e.target.value)}
                    className="w-12 h-10 border border-slate-300 rounded-lg cursor-pointer"
                  />
                  <div className="flex gap-2 flex-wrap">
                    {['#3B82F6', '#10B981', '#EF4444', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'].map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewCategoryColor(color)}
                        className={`w-7 h-7 rounded-full border-2 transition-transform ${
                          newCategoryColor === color ? 'border-slate-900 scale-110' : 'border-slate-200'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="text-xs text-slate-600 mb-2">Aperçu :</div>
                <span 
                  className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium text-white"
                  style={{ backgroundColor: newCategoryColor }}
                >
                  {newCategoryName || 'Nom de la catégorie'}
                </span>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button" 
                  onClick={() => { setShowCategoryModal(false); setNewCategoryName(''); }} 
                  className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold py-2.5 rounded-lg"
                >
                  Annuler
                </button>
                <button 
                  type="submit" 
                  disabled={isAddingCategory || !newCategoryName.trim()} 
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2"
                >
                  {isAddingCategory ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" /> Créer
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
