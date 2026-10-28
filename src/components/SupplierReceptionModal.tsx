'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Package, CheckCircle, AlertCircle, Save, History, Clock } from 'lucide-react';

interface OrderItem {
  id: string;
  item_name: string;
  unit: string;
  purchase_unit?: string;       // ✅ AJOUTÉ
  conversion_factor?: number;
  quantity: number;
  received_quantity: number;
  unit_price: number;
  stock_item_id?: string;
}

interface Reception {
  id: string;
  reception_number: string;
  reception_date: string;
  received_by?: string;
  notes?: string;
  items: ReceptionItem[];
}

interface ReceptionItem {
  id: string;
  item_name: string;
  quantity_received: number;
  unit_price: number;
  notes?: string;
}

interface Props {
  siteId: string;
  orderId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SupplierReceptionModal({ siteId, orderId, isOpen, onClose, onSuccess }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [receptionItems, setReceptionItems] = useState<Record<string, number>>({});
  const [receptionNotes, setReceptionNotes] = useState('');
  const [orderInfo, setOrderInfo] = useState<any>(null);
  const [receptions, setReceptions] = useState<Reception[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (isOpen && orderId) {
      loadOrderData();
      loadReceptions();
    }
  }, [isOpen, orderId]);

  const loadOrderData = async () => {
    setLoading(true);
    try {
      const { data: items } = await supabase
        .from('supplier_order_items')
        .select('*')
        .eq('order_id', orderId);
      
      const { data: order } = await supabase
        .from('supplier_orders')
        .select('*, suppliers(name)')
        .eq('id', orderId)
        .single();
      
      setOrderInfo(order);
      setOrderItems(items || []);
    } catch (error) {
      console.error('Erreur chargement:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadReceptions = async () => {
    try {
      const { data: receptionsData } = await supabase
        .from('supplier_receptions')
        .select('*, supplier_reception_items(*, supplier_order_items(item_name))')
        .eq('order_id', orderId)
        .order('reception_date', { ascending: false });

      if (receptionsData) {
        const formattedReceptions: Reception[] = receptionsData.map(r => ({
          id: r.id,
          reception_number: r.reception_number,
          reception_date: r.reception_date,
          received_by: r.received_by,
          notes: r.notes,
          items: (r.supplier_reception_items || []).map((ri: any) => ({
            id: ri.id,
            item_name: ri.supplier_order_items?.item_name || 'Article',
            quantity_received: ri.quantity_received,
            unit_price: ri.unit_price,
            notes: ri.notes
          }))
        }));
        setReceptions(formattedReceptions);
      }
    } catch (error) {
      console.error('Erreur chargement réceptions:', error);
    }
  };

  const handleReceptionChange = (itemId: string, quantity: number) => {
    const item = orderItems.find(i => i.id === itemId);
    if (!item) return;
    
    const remaining = item.quantity - item.received_quantity;
    
    // ✅ CONTRÔLE STRICT : Empêcher de recevoir plus que le reste
    if (quantity > remaining) {
      alert(`️ Quantité maximale autorisée : ${remaining} ${item.unit}\nIl reste seulement ${remaining} ${item.unit} à recevoir pour cet article.`);
      setReceptionItems(prev => ({
        ...prev,
        [itemId]: remaining
      }));
      return;
    }
    
    if (quantity < 0) {
      alert('La quantité ne peut pas être négative');
      return;
    }
    
    setReceptionItems(prev => ({
      ...prev,
      [itemId]: quantity
    }));
  };

  const handleSaveReception = async () => {
  // Filtrer uniquement les articles avec une quantité > 0
  const itemsToReceive = Object.entries(receptionItems).filter(([_, qty]) => qty > 0);
  
  if (itemsToReceive.length === 0) {
    alert('Veuillez sélectionner au moins un article à recevoir');
    return;
  }

  // ✅ CONTRÔLE FINAL : Vérifier qu'aucun article ne dépasse le reste à recevoir
  for (const [itemId, quantity] of itemsToReceive) {
    const item = orderItems.find(i => i.id === itemId);
    if (item) {
      const remaining = item.quantity - item.received_quantity;
      if (quantity > remaining) {
        alert(`⚠️ Erreur pour "${item.item_name}" : La quantité (${quantity}) dépasse le reste à recevoir (${remaining} ${item.purchase_unit || item.unit})`);
        return;
      }
    }
  }

  // Confirmation avant validation
  const totalItems = itemsToReceive.length;
  if (!confirm(`Confirmer la réception de ${totalItems} article(s) ?\n\nLe stock sera automatiquement mis à jour en tenant compte des facteurs de conversion.`)) {
    return;
  }

  setLoading(true);
  try {
    const { data: { user } } = await supabase.auth.getUser();
    console.log(' Utilisateur connecté:', user?.id);
    console.log('📦 Articles à recevoir:', itemsToReceive);
    
    // 1. Créer la réception
    const receptionNumber = `REC-${Date.now().toString().slice(-8)}`;
    console.log('📝 Création réception:', receptionNumber);
    
    const { data: reception, error: receptionError } = await supabase
      .from('supplier_receptions')
      .insert({
        order_id: orderId,
        reception_number: receptionNumber,
        received_by: user?.id,
        notes: receptionNotes
      })
      .select()
      .single();
    
    if (receptionError) {
      console.error('❌ Erreur création réception:', receptionError);
      alert(`Erreur création réception: ${receptionError.message}`);
      return;
    }
    
    console.log('✅ Réception créée:', reception);

    // 2. Traiter chaque article reçu
    for (const [itemId, quantity] of itemsToReceive) {
      const item = orderItems.find(i => i.id === itemId);
      if (!item) continue;

      console.log(`📦 Traitement article: ${item.item_name}`);
      console.log(`   - Quantité reçue: ${quantity} ${item.purchase_unit || item.unit}`);
      console.log(`   - Facteur de conversion: ${item.conversion_factor || 1}`);
      console.log(`   - Équivalent en stock: ${quantity * (item.conversion_factor || 1)} ${item.unit}`);

      // 2a. Mettre à jour received_quantity dans l'article commandé
      const newQuantityReceived = item.received_quantity + quantity;
      const { error: updateError } = await supabase
        .from('supplier_order_items')
        .update({ received_quantity: newQuantityReceived })
        .eq('id', itemId);
      
      if (updateError) {
        console.error('❌ Erreur mise à jour article:', updateError);
        alert(`Erreur article "${item.item_name}": ${updateError.message}`);
        return;
      }

      // 2b. Créer l'entrée dans supplier_reception_items
      const { data: receptionItem, error: riError } = await supabase
        .from('supplier_reception_items')
        .insert({
          reception_id: reception.id,
          order_item_id: itemId,
          quantity_received: quantity,
          unit_price: item.unit_price,
          notes: `Reçu ${quantity} ${item.purchase_unit || item.unit} (×${item.conversion_factor || 1} = ${quantity * (item.conversion_factor || 1)} ${item.unit})`
        })
        .select()
        .single();

      if (riError) {
        console.error('❌ Erreur reception_items:', riError);
        alert(`Erreur réception article "${item.item_name}": ${riError.message}`);
        return;
      }

      // 2c. ✅ Mettre à jour le stock avec le facteur de conversion
      console.log('🔄 Mise à jour du stock via RPC...');
      const { error: stockError } = await supabase.rpc('process_reception_stock', {
        p_site_id: siteId,
        p_item_name: item.item_name,
        p_quantity_received: quantity,
        p_unit_price: item.unit_price,
        p_stock_item_id: item.stock_item_id || null,
        p_conversion_factor: item.conversion_factor || 1 // ✅ C'est ici que la conversion se fait
      });

      if (stockError) {
        console.error('❌ Erreur stock RPC:', stockError);
        alert(`Erreur mise à jour stock pour "${item.item_name}": ${stockError.message}\n\nLa réception a été enregistrée mais le stock n'a pas été mis à jour.`);
        return;
      }
      
      console.log(`✅ Stock mis à jour pour ${item.item_name}`);
    }

    // 3. Mettre à jour le statut de la commande
    console.log('🔄 Mise à jour statut commande...');
    const { error: statusError } = await supabase.rpc('update_order_reception_status', {
      p_order_id: orderId
    });

    if (statusError) {
      console.error('❌ Erreur statut:', statusError);
    }

    // 4. Vérifier si tous les articles sont reçus pour marquer la commande comme complète
    const { data: updatedItems } = await supabase
      .from('supplier_order_items')
      .select('quantity, received_quantity')
      .eq('order_id', orderId);

    const allReceived = updatedItems?.every(i => i.received_quantity >= i.quantity);
    if (allReceived) {
      await supabase
        .from('supplier_orders')
        .update({ 
          received_at: new Date().toISOString(),
          received_by: user?.id
        })
        .eq('id', orderId);
      console.log('✅ Commande marquée comme entièrement reçue');
    }

    // 5. Succès
    const summary = itemsToReceive.map(([itemId, qty]) => {
      const item = orderItems.find(i => i.id === itemId);
      const factor = item?.conversion_factor || 1;
      return `• ${item?.item_name}: ${qty} ${item?.purchase_unit || item?.unit} (×${factor} = ${qty * factor} ${item?.unit})`;
    }).join('\n');

    alert(`✅ Réception ${receptionNumber} enregistrée avec succès!\n\n${summary}\n\nLe stock a été mis à jour automatiquement.`);
    
    onSuccess();
    onClose();
  } catch (error: any) {
    console.error('❌ Erreur générale:', error);
    alert(`Erreur: ${error.message || JSON.stringify(error)}`);
  } finally {
    setLoading(false);
  }
};

  if (!isOpen) return null;

  const totalReceivedValue = Object.entries(receptionItems).reduce((sum, [itemId, qty]) => {
    const item = orderItems.find(i => i.id === itemId);
    return sum + (qty * (item?.unit_price || 0));
  }, 0);

  const totalRemaining = orderItems.reduce((sum, item) => {
    return sum + (item.quantity - item.received_quantity);
  }, 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <div>
            <h3 className="text-xl font-bold">Réception de Commande</h3>
            <p className="text-sm text-emerald-100">{orderInfo?.suppliers?.name} • {orderInfo?.order_number}</p>
          </div>
          <div className="flex items-center gap-2">
            {receptions.length > 0 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="bg-white/20 hover:bg-white/30 px-3 py-2 rounded-lg flex items-center gap-2 text-sm"
              >
                <History className="w-4 h-4" />
                Historique ({receptions.length})
              </button>
            )}
            <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Résumé de la commande */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-slate-500 mb-1">Total commandé</div>
                <div className="text-lg font-bold text-slate-900">{orderItems.reduce((sum, i) => sum + i.quantity, 0)} articles</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Déjà reçu</div>
                <div className="text-lg font-bold text-emerald-600">{orderItems.reduce((sum, i) => sum + i.received_quantity, 0)} articles</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Reste à recevoir</div>
                <div className="text-lg font-bold text-amber-600">{totalRemaining} articles</div>
              </div>
            </div>
          </div>

          {/* Historique des réceptions */}
          {showHistory && receptions.length > 0 && (
            <div className="border border-indigo-200 rounded-lg overflow-hidden">
              <div className="bg-indigo-50 px-4 py-3 flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-600" />
                <h4 className="font-semibold text-indigo-900">Historique des réceptions ({receptions.length})</h4>
              </div>
              <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {receptions.map(reception => (
                  <div key={reception.id} className="p-4 hover:bg-slate-50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                        <span className="font-medium text-slate-900">{reception.reception_number}</span>
                      </div>
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(reception.reception_date).toLocaleString('fr-FR')}
                      </span>
                    </div>
                    <div className="ml-6 space-y-1">
                      {reception.items.map(item => (
                        <div key={item.id} className="flex justify-between text-sm">
                          <span className="text-slate-700">{item.item_name}</span>
                          <span className="font-medium text-emerald-700">+{item.quantity_received} reçu(s)</span>
                        </div>
                      ))}
                    </div>
                    {reception.notes && (
                      <div className="ml-6 mt-2 text-xs text-slate-500 italic">📝 {reception.notes}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tableau des articles à recevoir */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left">Article</th>
                  <th className="px-4 py-3 text-center">Commandé</th>
                  <th className="px-4 py-3 text-center">Déjà reçu</th>
                  <th className="px-4 py-3 text-center">Reste</th>
                  <th className="px-4 py-3 text-center">À recevoir</th>
                  <th className="px-4 py-3 text-right">Prix unitaire</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orderItems.map(item => {
                  const remaining = item.quantity - item.received_quantity;
                  const canReceive = remaining > 0;
                  const isFullyReceived = remaining === 0;
                  
                  return (
                    <tr key={item.id} className={isFullyReceived ? 'bg-emerald-50' : ''}>
                      <td className="px-4 py-3">
                        <div className="font-medium">{item.item_name}</div>
                        <div className="text-xs text-slate-500">{item.unit}</div>
                      </td>
                      <td className="px-4 py-3 text-center font-medium">{item.quantity}</td>
                      <td className="px-4 py-3 text-center text-emerald-600">{item.received_quantity}</td>
                      <td className="px-4 py-3 text-center text-amber-600 font-medium">{remaining}</td>
                                            <td className="px-4 py-3">
                        {canReceive ? (
                          <div>
                            <input
                              type="number"
                              min="0"
                              max={remaining}
                              step="0.5"
                              value={receptionItems[item.id] || ''}
                              onChange={(e) => handleReceptionChange(item.id, parseFloat(e.target.value) || 0)}
                              className="w-24 border border-slate-300 rounded px-2 py-1 text-center focus:ring-2 focus:ring-emerald-500 mb-1"
                              placeholder="0"
                            />
                            <div className="text-[10px] text-slate-500 text-center">
                              1 {item.purchase_unit || 'unité'} = {item.conversion_factor || 1} {item.unit}
                            </div>
                          </div>
                        ) : (
                          <CheckCircle className="w-5 h-5 mx-auto text-emerald-500" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">{item.unit_price?.toLocaleString('fr-FR')} F</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Notes de réception */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Notes de réception (optionnel)</label>
            <textarea
              value={receptionNotes}
              onChange={(e) => setReceptionNotes(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
              rows={3}
              placeholder="Observations sur la livraison..."
            />
          </div>

          {/* Résumé */}
          <div className="bg-emerald-50 border-2 border-emerald-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-emerald-600" />
                <span className="font-semibold text-emerald-900">
                  {Object.values(receptionItems).filter(q => q > 0).length} article(s) à recevoir
                </span>
              </div>
              <div className="text-right">
                <div className="text-sm text-emerald-700">Valeur totale:</div>
                <div className="text-2xl font-bold text-emerald-900">
                  {totalReceivedValue.toLocaleString('fr-FR')} F
                </div>
              </div>
            </div>
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
              onClick={handleSaveReception}
              disabled={loading || Object.values(receptionItems).every(q => !q)}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Enregistrer la réception
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
