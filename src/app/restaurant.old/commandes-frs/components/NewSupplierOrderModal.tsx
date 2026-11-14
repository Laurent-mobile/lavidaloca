'use client';
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Plus, Trash2, Package, Search, AlertCircle } from 'lucide-react';
import QuickCreateStockItemModal from './QuickCreateStockItemModal';

interface Supplier {
  id: string;
  name: string;
}

interface StockItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  current_stock: number;
  last_purchase_price: number;
}

interface OrderItem {
  id: string;
  stock_item_id: string;
  item_name: string;
  unit: string;
  purchase_unit: string;        // ✅ AJOUTÉ
  conversion_factor: number; 
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface Props {
  siteId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function NewSupplierOrderModal({ siteId, isOpen, onClose, onSuccess }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  
  // Formulaire de base
  const [supplierId, setSupplierId] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  
  // Articles
  const [items, setItems] = useState<OrderItem[]>([]);
  const [selectedStockId, setSelectedStockId] = useState('');
  const [itemQuantity, setItemQuantity] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  
  // Modal création rapide
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [prefillName, setPrefillName] = useState('');
    const [purchaseUnit, setPurchaseUnit] = useState('unité');
  const [conversionFactor, setConversionFactor] = useState('1');

  useEffect(() => {
    if (isOpen) {
      loadSuppliers();
      loadStockItems();
      resetForm();
    }
  }, [isOpen]);

  const loadSuppliers = async () => {
    const { data } = await supabase
      .from('suppliers')
      .select('id, name')
      .eq('site_id', siteId)
      .eq('is_active', true)
      .order('name');
    setSuppliers(data || []);
  };

  const loadStockItems = async () => {
    const { data } = await supabase
      .from('stock_items')
      .select('id, name, category, unit, current_stock, last_purchase_price')
      .eq('site_id', siteId)
      .eq('is_active', true)
      .order('name');
    setStockItems(data || []);
  };

  const resetForm = () => {
    setSupplierId('');
    setOrderDate(new Date().toISOString().split('T')[0]);
    setExpectedDate('');
    setNotes('');
    setItems([]);
    setSelectedStockId('');
    setItemQuantity('');
    setItemPrice('');
    setItemSearch('');
  };

  // Filtrer les articles du stock selon la recherche
  const filteredStockItems = useMemo(() => {
    if (!itemSearch.trim()) return stockItems;
    const search = itemSearch.toLowerCase();
    return stockItems.filter(i => 
      i.name.toLowerCase().includes(search) || 
      i.category.toLowerCase().includes(search)
    );
  }, [stockItems, itemSearch]);

  // Sélectionner un article du stock
    const handleSelectStockItem = (stockItem: StockItem) => {
    setSelectedStockId(stockItem.id);
    setItemPrice(stockItem.last_purchase_price?.toString() || '');
    // ✅ Pré-remplir avec les valeurs par défaut du stock si elles existent
    setPurchaseUnit((stockItem as any).default_purchase_unit || 'unité');
    setConversionFactor((stockItem as any).default_conversion_factor?.toString() || '1');
    setItemSearch('');
  };

  // Ajouter un article à la commande
    const addItem = () => {
    if (!selectedStockId) { alert('Veuillez sélectionner un article'); return; }
    if (!itemQuantity || parseFloat(itemQuantity) <= 0) { alert('Quantité invalide'); return; }
    if (!itemPrice || parseFloat(itemPrice) <= 0) { alert('Prix invalide'); return; }
    if (!conversionFactor || parseFloat(conversionFactor) <= 0) { alert('Facteur de conversion invalide'); return; }

    const stockItem = stockItems.find(i => i.id === selectedStockId);
    if (!stockItem) return;

    const qty = parseFloat(itemQuantity);
    const factor = parseFloat(conversionFactor);
    const pricePerUnit = parseFloat(itemPrice); 

    const newItem = {
      id: Date.now().toString(),
      stock_item_id: stockItem.id,
      item_name: stockItem.name,
      unit: stockItem.unit || 'unité', // Unité de vente
      purchase_unit: purchaseUnit,     // Unité d'achat (ex: Carton)
      conversion_factor: factor,       // Facteur (ex: 24)
      quantity: qty,                   // Quantité achetée (ex: 2 cartons)
      unit_price: pricePerUnit,        // Prix par unité d'achat
      total_price: qty * pricePerUnit
    };

    setItems([...items, newItem]);
    setSelectedStockId('');
    setItemQuantity('');
    setItemPrice('');
    setPurchaseUnit('unité');
    setConversionFactor('1');
  };

  const removeItem = (itemId: string) => {
    setItems(items.filter(i => i.id !== itemId));
  };

  const totalAmount = items.reduce((sum, item) => sum + item.total_price, 0);

  const handleSubmit = async () => {
    if (!supplierId) {
      alert('Veuillez sélectionner un fournisseur');
      return;
    }
    if (items.length === 0) {
      alert('Veuillez ajouter au moins un article');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const orderNumber = `CMD-${Date.now().toString().slice(-13)}`;

      // 1. Créer la commande
      const { data: order, error: orderError } = await supabase
        .from('supplier_orders')
        .insert({
          site_id: siteId,
          supplier_id: supplierId,
          order_number: orderNumber,
          order_date: orderDate,
          expected_date: expectedDate || null,
          status: 'DRAFT',
          total_amount: totalAmount,
          notes: notes,
          created_by: user?.id
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // 2. Ajouter les articles (avec lien vers stock_item_id)
            const orderItems = items.map(item => ({
        order_id: order.id,
        stock_item_id: item.stock_item_id,
        item_name: item.item_name,
        unit: item.unit,
        purchase_unit: item.purchase_unit,
        conversion_factor: item.conversion_factor,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        received_quantity: 0
      }));

      const { error: itemsError } = await supabase
        .from('supplier_order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      alert(`✅ Commande ${orderNumber} créée avec succès !`);
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Erreur création commande:', error);
      alert(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickCreateSuccess = (newItem: any) => {
    setStockItems(prev => [...prev, newItem]);
    setSelectedStockId(newItem.id);
    setItemPrice(newItem.last_purchase_price?.toString() || '');
    setShowQuickCreate(false);
    setPrefillName('');
    loadStockItems(); // Recharger pour être sûr
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-y-auto">
          <div className="bg-gradient-to-r from-slate-700 to-slate-900 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
            <h3 className="text-xl font-bold">Nouvelle Commande Fournisseur</h3>
            <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Informations de base */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Fournisseur *
                </label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                >
                  <option value="">-- Sélectionner un fournisseur --</option>
                  {suppliers.map(supplier => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Date de commande *
                </label>
                <input
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Date de livraison prévue
                </label>
                <input
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                />
              </div>
            </div>

            {/* Ajout d'articles depuis le stock */}
            <div className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Package className="w-5 h-5 text-indigo-600" />
                  Articles de la commande
                </h4>
                <span className="text-sm text-slate-500">
                  {items.length} article(s) ajouté(s)
                </span>
              </div>
              
              {/* Recherche dans le stock */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Rechercher un article en stock *
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    placeholder="Tapez pour rechercher dans le stock..."
                  />
                </div>

                {/* Liste des résultats */}
                {itemSearch && filteredStockItems.length > 0 && (
                  <div className="mt-2 border border-slate-200 rounded-lg max-h-48 overflow-y-auto bg-white shadow-lg">
                    {filteredStockItems.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectStockItem(item)}
                        className={`w-full text-left px-4 py-2 hover:bg-indigo-50 border-b border-slate-100 last:border-0 ${
                          selectedStockId === item.id ? 'bg-indigo-100' : ''
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="font-medium text-slate-900">{item.name}</div>
                            <div className="text-xs text-slate-500">
                              {item.category} • Stock: {item.current_stock} {item.unit}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold text-indigo-600">
                              {item.last_purchase_price?.toLocaleString('fr-FR')} F
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {itemSearch && filteredStockItems.length === 0 && (
                  <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-amber-900 font-medium">
                        Aucun article "{itemSearch}" dans le stock
                      </p>
                      <p className="text-xs text-amber-700 mt-1">
                        Créez-le rapidement pour l'ajouter à cette commande.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPrefillName(itemSearch);
                        setShowQuickCreate(true);
                      }}
                      className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 whitespace-nowrap"
                    >
                      <Plus className="w-3 h-3" />
                      Créer
                    </button>
                  </div>
                )}
              </div>

              {/* Formulaire d'ajout */}
                            {selectedStockId && (
                <div className="bg-indigo-50 border-2 border-indigo-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="font-semibold text-indigo-900">{stockItems.find(i => i.id === selectedStockId)?.name}</div>
                      <div className="text-xs text-indigo-700">
                        {stockItems.find(i => i.id === selectedStockId)?.category} • 
                        Vente en: {stockItems.find(i => i.id === selectedStockId)?.unit}
                      </div>
                    </div>
                    <button type="button" onClick={() => setSelectedStockId('')} className="text-indigo-600 hover:text-indigo-800">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-3">
                    
<div>
  <label className="block text-xs font-medium text-indigo-800 mb-1">Unité d'achat *</label>
  <select
    value={purchaseUnit}
    onChange={(e) => setPurchaseUnit(e.target.value)}
    className="w-full border border-indigo-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
  >
    <option value="unité">Unité / Pièce</option>
    <option value="carton">Carton</option>
    <option value="caisse">Caisse</option>
    <option value="sachet">Sachet</option>
    <option value="sac">Sac</option>
    <option value="bouteille">Bouteille</option>
    <option value="litre">Litre</option>
    <option value="kg">Kilogramme (kg)</option>
    <option value="palette">Palette</option>
  </select>
</div>
                    <div>
                      <label className="block text-xs font-medium text-indigo-800 mb-1">Contenance (Facteur) *</label>
                      <input
                        type="number"
                        value={conversionFactor}
                        onChange={(e) => setConversionFactor(e.target.value)}
                        className="w-full border border-indigo-300 rounded-lg px-3 py-2 text-sm"
                        placeholder="Ex: 24"
                        min="1"
                        step="1"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-indigo-800 mb-1">Quantité achetée *</label>
                      <input
                        type="number"
                        value={itemQuantity}
                        onChange={(e) => setItemQuantity(e.target.value)}
                        className="w-full border border-indigo-300 rounded-lg px-3 py-2 text-sm"
                        placeholder="Ex: 2"
                        step="0.5"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs font-medium text-indigo-800 mb-1">Prix unitaire d'achat (F) *</label>
                      <input
                        type="number"
                        value={itemPrice}
                        onChange={(e) => setItemPrice(e.target.value)}
                        className="w-full border border-indigo-300 rounded-lg px-3 py-2 text-sm"
                        placeholder="Ex: 1500"
                      />
                    </div>
                    <div className="flex items-end pb-2">
                      <div className="text-sm text-indigo-900 bg-white p-2 rounded border border-indigo-200 w-full text-center">
                        Équivalent à : <span className="font-bold text-emerald-600">
                          {((parseFloat(itemQuantity) || 0) * (parseFloat(conversionFactor) || 1)).toLocaleString('fr-FR')} {stockItems.find(i => i.id === selectedStockId)?.unit}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={addItem}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg font-medium flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Ajouter à la commande
                  </button>
                </div>
              )}

              {/* Bouton de création rapide (toujours visible) */}
              {!selectedStockId && (
                <button
                  type="button"
                  onClick={() => {
                    setPrefillName(itemSearch);
                    setShowQuickCreate(true);
                  }}
                  className="w-full border-2 border-dashed border-slate-300 hover:border-emerald-500 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  Créer un nouvel article en stock
                </button>
              )}

              {/* Liste des articles ajoutés */}
              {items.length > 0 ? (
                <div className="mt-4 border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-2 text-left">Article</th>
                        <th className="px-4 py-2 text-center">Unité</th>
                        <th className="px-4 py-2 text-center">Qté</th>
                        <th className="px-4 py-2 text-right">Prix unit.</th>
                        <th className="px-4 py-2 text-right">Total</th>
                        <th className="px-4 py-2 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map(item => (
                        <tr key={item.id}>
                          <td className="px-4 py-2 font-medium">{item.item_name}</td>
                          <td className="px-4 py-2 text-center">
        <div className="text-sm">
          <div className="font-medium text-slate-900">{item.purchase_unit || item.unit}</div>
          <div className="text-xs text-slate-500">
            ×{item.conversion_factor} = {item.quantity * item.conversion_factor} {item.unit}
          </div>
        </div>
      </td>
                          <td className="px-4 py-2 text-center">{item.quantity}</td>
                          <td className="px-4 py-2 text-right">{item.unit_price.toLocaleString('fr-FR')}</td>
                          <td className="px-4 py-2 text-right font-bold">{item.total_price.toLocaleString('fr-FR')}</td>
                          <td className="px-4 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => removeItem(item.id)}
                              className="text-red-600 hover:text-red-800"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold">
                      <tr>
                        <td colSpan={4} className="px-4 py-2 text-right">Total:</td>
                        <td className="px-4 py-2 text-right text-lg text-indigo-600">
                          {totalAmount.toLocaleString('fr-FR')} F
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="mt-4 text-center py-8 text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
                  <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Aucun article ajouté à la commande</p>
                  <p className="text-sm mt-1">Recherchez un article dans le stock ci-dessus</p>
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Notes (optionnel)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2"
                rows={2}
                placeholder="Notes supplémentaires..."
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-slate-200">
              <button
                onClick={onClose}
                className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-lg"
              >
                Annuler
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading || items.length === 0 || !supplierId}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold py-3 rounded-lg"
              >
                {loading ? 'Création...' : 'Créer la commande'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de création rapide d'article en stock */}
      <QuickCreateStockItemModal
        siteId={siteId}
        isOpen={showQuickCreate}
        onClose={() => {
          setShowQuickCreate(false);
          setPrefillName('');
        }}
        onSuccess={handleQuickCreateSuccess}
        prefillName={prefillName}
      />
    </>
  );
}
