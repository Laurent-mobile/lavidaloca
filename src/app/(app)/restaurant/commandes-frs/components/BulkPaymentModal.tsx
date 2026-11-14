'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, CheckSquare, Square, Loader2 } from 'lucide-react';

interface SupplierOrder {
  id: string;
  order_number: string;
  supplier_id: string;
  suppliers?: { name: string };
  order_date: string;
  total_amount: number;
  status: string;
  payment_status?: string;
}

interface Supplier {
  id: string;
  name: string;
}

interface Props {
  siteId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function BulkPaymentModal({ siteId, isOpen, onClose, onSuccess }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadSuppliers();
      generateReferenceNumber();
      // Reset des états à l'ouverture
      setSelectedSupplierId('');
      setOrders([]);
      setSelectedOrders(new Set());
      setPaymentAmount('');
      setNotes('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedSupplierId) {
      loadSupplierOrders();
    }
  }, [selectedSupplierId]);

  const loadSuppliers = async () => {
    const { data } = await supabase
      .from('suppliers')
      .select('id, name')
      .eq('site_id', siteId)
      .eq('is_active', true)
      .order('name');
    setSuppliers(data || []);
  };

  const loadSupplierOrders = async () => {
  setLoading(true);
  try {
    const { data } = await supabase
      .from('supplier_orders')
      .select('*, suppliers(name)')
      .eq('site_id', siteId)
      .eq('supplier_id', selectedSupplierId)
      .neq('status', 'CANCELLED')
      // ✅ EXCLURE les commandes déjà payées
      .neq('payment_status', 'PAYÉ')
      .neq('payment_status', 'PAID')
      .order('order_date', { ascending: false });

    setOrders(data || []);
    setSelectedOrders(new Set());
  } catch (error) {
    console.error('Erreur chargement commandes:', error);
  } finally {
    setLoading(false);
  }
};

  const generateReferenceNumber = () => {
    setReferenceNumber(`BULK-${Date.now().toString().slice(-13)}`);
  };

  const toggleOrderSelection = (orderId: string) => {
    const newSelected = new Set(selectedOrders);
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId);
    } else {
      newSelected.add(orderId);
    }
    setSelectedOrders(newSelected);
  };

  const selectAll = () => {
    setSelectedOrders(new Set(orders.map(o => o.id)));
  };

  const deselectAll = () => {
    setSelectedOrders(new Set());
  };

  const selectedOrdersList = orders.filter(o => selectedOrders.has(o.id));
  const totalSelected = selectedOrdersList.reduce((sum, o) => sum + o.total_amount, 0);
  const totalDue = orders.reduce((sum, o) => sum + o.total_amount, 0);

  const handlePayment = async () => {
    if (selectedOrders.size === 0) {
      alert('Veuillez sélectionner au moins une commande');
      return;
    }

    const amount = parseFloat(paymentAmount);
    if (!paymentAmount || amount <= 0) {
      alert('Veuillez saisir un montant valide');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // 1. Créer l'enregistrement de paiement groupé
      const { error: paymentError } = await supabase
        .from('supplier_payments')
        .insert({
          site_id: siteId,
          supplier_id: selectedSupplierId,
          reference_number: referenceNumber,
          amount: amount,
          payment_method: paymentMethod,
          notes: notes,
          paid_by: user?.id,
          paid_at: new Date().toISOString(),
          order_ids: Array.from(selectedOrders)
        });

      if (paymentError) throw paymentError;

      // 2. ✅ CORRECTION MAJEURE : Mettre à jour le payment_status, PAS le status de livraison
      const newPaymentStatus = amount >= totalSelected ? 'PAYÉ' : 'PARTIEL';

      for (const orderId of selectedOrders) {
        await supabase
          .from('supplier_orders')
          .update({ payment_status: newPaymentStatus }) // ✅ On touche uniquement le paiement
          .eq('id', orderId);
      }

      alert(`✅ Paiement groupé de ${amount.toLocaleString('fr-FR')} f CFA enregistré avec succès!`);
      onSuccess(); // Déclenche le rechargement des données dans la page parent
      onClose();
    } catch (error: any) {
      console.error('Erreur paiement:', error);
      alert(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-purple-600 to-purple-800 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <h3 className="text-xl font-bold">Paiement Groupé - Fournisseur</h3>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Sélection du fournisseur */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Sélectionner le fournisseur *
            </label>
            <select
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
            >
              <option value="">-- Choisir un fournisseur --</option>
              {suppliers.map(supplier => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>

          {/* Liste des commandes */}
          {selectedSupplierId && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-slate-900">Commandes à régler</h4>
                <div className="flex gap-2">
                  <button onClick={selectAll} className="text-sm text-blue-600 hover:text-blue-800 font-medium">Tout sélectionner</button>
                  <span className="text-slate-300">|</span>
                  <button onClick={deselectAll} className="text-sm text-red-600 hover:text-red-800 font-medium">Tout désélectionner</button>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg max-h-64 overflow-y-auto">
                {loading ? (
                  <div className="p-8 text-center text-slate-500 flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" /> Chargement...
                  </div>
                ) : orders.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">Aucune commande pour ce fournisseur.</div>
                ) : (
                  orders.map(order => (
                    <div
                      key={order.id}
                      className={`p-3 border-b border-slate-100 flex items-center gap-3 hover:bg-slate-50 transition-colors ${
                        selectedOrders.has(order.id) ? 'bg-blue-50' : ''
                      }`}
                    >
                      <button onClick={() => toggleOrderSelection(order.id)} className="flex-shrink-0">
                        {selectedOrders.has(order.id) ? (
                          <CheckSquare className="w-5 h-5 text-blue-600" />
                        ) : (
                          <Square className="w-5 h-5 text-slate-400" />
                        )}
                      </button>
                      <div className="flex-1">
                        <div className="font-medium text-slate-900">{order.order_number}</div>
                        <div className="text-xs text-slate-500">
                          {new Date(order.order_date).toLocaleDateString('fr-FR')} 
                          {order.payment_status && ` • Statut: ${order.payment_status}`}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-slate-900">
                          {order.total_amount.toLocaleString('fr-FR')} f CFA
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Résumé de la sélection */}
              <div className="mt-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-slate-600">Commandes sélectionnées:</div>
                    <div className="text-lg font-bold text-slate-900">{selectedOrders.size}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-slate-600">Total dû sélectionné:</div>
                    <div className="text-lg font-bold text-emerald-600">{totalSelected.toLocaleString('fr-FR')} f CFA</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Formulaire de paiement */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Montant à payer (f CFA) *</label>
              <input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2"
                placeholder="0"
              />
              <div className="text-xs text-slate-500 mt-1">
                Total global dû: {totalDue.toLocaleString('fr-FR')} f CFA
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Mode de paiement *</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
              >
                <option value="CASH">Espèces</option>
                <option value="BANK_TRANSFER">Virement bancaire</option>
                <option value="CHECK">Chèque</option>
                <option value="MOBILE_MONEY">Mobile Money</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Numéro de référence</label>
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
              placeholder="BULK-..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Notes (optionnel)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
              rows={2}
              placeholder="Ex: Paiement de la facture de mars..."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-slate-200">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-lg disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              onClick={handlePayment}
              disabled={loading || selectedOrders.size === 0}
              className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Traitement...</>
              ) : (
                <><CheckSquare className="w-5 h-5" /> Effectuer le paiement</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
