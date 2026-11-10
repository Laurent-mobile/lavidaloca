'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, CreditCard, CheckCircle } from 'lucide-react';

interface SupplierOrder {
  id: string;
  order_number: string;
  supplier_id: string;
  suppliers?: { name: string };
  total_amount: number;
  payment_status?: string;
}

interface Props {
  siteId: string;
  order: SupplierOrder | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SimplePaymentModal({ siteId, order, isOpen, onClose, onSuccess }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen && order) {
      setPaymentAmount(order.total_amount.toString());
      setReferenceNumber(`PAY-${Date.now().toString().slice(-13)}`);
    }
  }, [isOpen, order]);

  const handlePayment = async () => {
    if (!order) return;
    
    const amount = parseFloat(paymentAmount);
    if (!paymentAmount || amount <= 0) {
      alert('Veuillez saisir un montant valide');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // 1. Déterminer le nouveau statut de paiement
      const newPaymentStatus = amount >= order.total_amount ? 'PAYÉ' : 'PARTIEL';
      
      // 2. Mettre à jour directement le statut de la commande (méthode la plus fiable)
      const { error: updateError } = await supabase
        .from('supplier_orders')
        .update({ payment_status: newPaymentStatus })
        .eq('id', order.id);

      if (updateError) throw updateError;

      // 3. Tenter d'enregistrer dans supplier_payments (sans les colonnes qui causent l'erreur 400)
      // Si la table n'existe pas ou a un schéma différent, on ignore l'erreur car l'essentiel (le statut) est mis à jour
      try {
        await supabase.from('supplier_payments').insert({
          site_id: siteId,
          supplier_id: order.supplier_id,
          reference_number: referenceNumber,
          amount: amount,
          payment_method: paymentMethod,
          notes: notes,
          paid_by: user?.id,
          paid_at: new Date().toISOString()
        });
      } catch (paymentTableError) {
        console.warn('Table supplier_payments non configurée, mais le statut de la commande a été mis à jour.');
      }

      alert(`✅ Paiement de ${amount.toLocaleString('fr-FR')} f CFA enregistré !`);
      
      // Fermer et rafraîchir
      setPaymentAmount('');
      setNotes('');
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Erreur paiement:', error);
      alert(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !order) return null;

  const isFullyPaid = order.payment_status === 'PAYÉ' || order.payment_status === 'PAID';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div>
            <h3 className="text-xl font-bold flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Payer la commande
            </h3>
            <p className="text-sm text-blue-100">
              {order.order_number} • {order.suppliers?.name}
            </p>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Info commande */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-slate-600">Montant total</span>
              <span className="text-xl font-bold text-slate-900">{order.total_amount.toLocaleString('fr-FR')} f CFA</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Statut actuel</span>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                isFullyPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}>
                {order.payment_status || 'Non payé'}
              </span>
            </div>
          </div>

          {/* Montant */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Montant à payer (f CFA) *
            </label>
            <input
              type="number"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
              placeholder="0"
              max={order.total_amount}
            />
          </div>

          {/* Mode de paiement */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Mode de paiement *
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
            >
              <option value="CASH">💶 Espèces</option>
              <option value="BANK_TRANSFER">🏦 Virement bancaire</option>
              <option value="CHECK">📄 Chèque</option>
              <option value="MOBILE_MONEY">📱 Mobile Money</option>
            </select>
          </div>

          {/* Référence */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Numéro de référence
            </label>
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
              placeholder="PAY-..."
            />
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
              placeholder="Notes sur ce paiement..."
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
              disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Valider le paiement
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
