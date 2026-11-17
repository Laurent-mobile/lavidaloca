'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Hotel, DollarSign, CreditCard, Printer, FileText, AlertCircle, CheckCircle, Bed, Utensils, ArrowRight, ArrowLeft } from 'lucide-react';

interface Props {
  siteId: string;
  stay: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CheckoutModal({ siteId, stay, isOpen, onClose, onSuccess }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'summary' | 'payment'>('summary');
  const [roomCharges, setRoomCharges] = useState<any[]>([]);
  const [nights, setNights] = useState(0);
  const [nightlyRate, setNightlyRate] = useState(0);
  const [totalNights, setTotalNights] = useState(0);
  const [totalCharges, setTotalCharges] = useState(0);
  const [grandTotal, setGrandTotal] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'MOBILE_MONEY'>('CASH');
  const [amountReceived, setAmountReceived] = useState(0);
  const [changeAmount, setChangeAmount] = useState(0);
  const [notes, setNotes] = useState('');

  // ✅ Fallback robuste pour le numéro de chambre (objets normalisés OU tableaux)
  const roomNum = stay?.rooms?.[0]?.number || stay?.rooms?.number || stay?.room_number || '—';

  useEffect(() => {
    if (isOpen && stay) {
      setStep('summary');
      loadCheckoutData();
    }
  }, [isOpen, stay]);

  const loadCheckoutData = async () => {
    setLoading(true);
    setError('');
    try {
      const checkIn = new Date(stay.check_in_at);
      const checkOut = new Date();
      const diffDays = Math.ceil(Math.abs(checkOut.getTime() - checkIn.getTime()) / 86400000);
      const calculatedNights = diffDays || 1;
      setNights(calculatedNights);
      setNightlyRate(Number(stay.nightly_rate) || 0);
      setTotalNights(calculatedNights * (Number(stay.nightly_rate) || 0));

      const { data: charges, error: chargesError } = await supabase
        .from('room_charges')
        .select('*')
        .eq('stay_id', stay.id)
        .eq('is_voided', false)
        .order('charge_date', { ascending: false });
      if (chargesError) throw chargesError;
      setRoomCharges(charges || []);
      const totalChargesAmount = (charges || []).reduce((sum, c) => sum + Number(c.amount), 0);
      setTotalCharges(totalChargesAmount);
      const total = (calculatedNights * (Number(stay.nightly_rate) || 0)) + totalChargesAmount;
      setGrandTotal(total);
      setAmountReceived(total);
    } catch (err: any) {
      console.error('Erreur chargement check-out:', err);
      setError(err.message || 'Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  const handlePrintFolio = () => {
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) return;
    const checkIn = new Date(stay.check_in_at).toLocaleDateString('fr-FR');
    const checkOut = new Date().toLocaleDateString('fr-FR');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Folio - Chambre ${roomNum}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; color: #333; font-size: 14px; }
          .header { text-align: center; border-bottom: 3px solid #4f46e5; padding-bottom: 20px; margin-bottom: 30px; }
          .header h1 { color: #4f46e5; margin: 0; font-size: 24px; }
          .subtitle { color: #666; margin-top: 5px; font-size: 14px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; background: #f9fafb; padding: 20px; border-radius: 8px; }
          .info-item label { font-size: 12px; color: #6b7280; display: block; margin-bottom: 4px; font-weight: bold; text-transform: uppercase; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background: #4f46e5; color: white; padding: 12px; text-align: left; font-size: 13px; }
          td { padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
          .grand-total { background: #4f46e5; color: white; font-size: 16px; }
          .grand-total td { border: none; padding: 15px 12px; }
          .footer { margin-top: 50px; text-align: center; color: #6b7280; font-size: 12px; border-top: 2px solid #e5e7eb; padding-top: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>LA VIDA-LOCA</h1>
          <div class="subtitle">Hôtel • Resto • Lounge — Ouagadougou</div>
          <div class="subtitle" style="font-weight: bold; margin-top: 10px; font-size: 16px;">FOLIO DE SÉJOUR (PROVISOIRE)</div>
        </div>
        <div class="info-grid">
          <div class="info-item"><label>Client</label>${stay.customers?.first_name || ''} ${stay.customers?.last_name || 'Client'}</div>
          <div class="info-item"><label>Chambre</label>N° ${roomNum}</div>
          <div class="info-item"><label>Date d'arrivée</label>${checkIn}</div>
          <div class="info-item"><label>Date de départ</label>${checkOut}</div>
        </div>
        <table>
          <thead><tr><th>Date</th><th>Description</th><th style="text-align:right">Qté</th><th style="text-align:right">P.U.</th><th style="text-align:right">Total (fcfa)</th></tr></thead>
          <tbody>
            <tr><td>${checkIn}</td><td><strong>Hébergement</strong> - Chambre ${roomNum}</td><td style="text-align:right">${nights}</td><td style="text-align:right">${nightlyRate.toLocaleString('fr-FR')}</td><td style="text-align:right">${totalNights.toLocaleString('fr-FR')}</td></tr>
            ${roomCharges.length > 0 ? roomCharges.map(c => `
              <tr><td>${new Date(c.charge_date).toLocaleDateString('fr-FR')}</td><td>${c.description || 'Consommation'}</td><td style="text-align:right">1</td><td style="text-align:right">${Number(c.amount).toLocaleString('fr-FR')}</td><td style="text-align:right">${Number(c.amount).toLocaleString('fr-FR')}</td></tr>
            `).join('') : '<tr><td colspan="5" style="text-align:center; color:#666; padding:20px;">Aucune consommation supplémentaire</td></tr>'}
          </tbody>
          <tfoot><tr class="grand-total"><td colspan="4" style="text-align:right;">TOTAL GÉNÉRAL À PAYER</td><td style="text-align:right">${grandTotal.toLocaleString('fr-FR')} fcfa</td></tr></tfoot>
        </table>
        <div class="footer"><p>Document généré le ${new Date().toLocaleString('fr-FR')}</p><p>Merci de votre séjour ! À bientôt chez LA VIDA-LOCA 🌴</p></div>
        <script>window.onload = function() { setTimeout(function() { window.print(); window.close(); }, 300); };</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };
const handleAutoReconcile = async () => {
  if (!confirm('Régulariser automatiquement toutes les commandes dont le séjour est CHECKED_OUT avec folio à 0 ?')) return;
  setLoading(true);
  try {
    // 1. Récupérer les commandes anomales
    const { data: anomalies } = await supabase
      .from('restaurant_orders')
      .select('id, order_number, total_amount, site_id, stay_id')
      .eq('status', 'ROOM_CHARGE')
      .eq('site_id', siteId);
    
    let fixed = 0;
    for (const order of (anomalies || [])) {
      // Vérifier que le séjour est bien clôturé avec folio 0
      const { data: stay } = await supabase
        .from('stays')
        .select('status, folio_balance')
        .eq('id', order.stay_id)
        .maybeSingle();
      
      if (!stay || stay.status !== 'CHECKED_OUT' || Number(stay.folio_balance) > 0) continue;
      
      // 2. Créer le paiement
      const { error: payErr } = await supabase.from('restaurant_payments').insert({
        site_id: order.site_id,
        order_id: order.id,
        session_id: null,
        method: 'ROOM_CHARGE',
        amount: Number(order.total_amount),
        received_amount: Number(order.total_amount),
        change_amount: 0,
        paid_at: new Date().toISOString(),
        status: 'COMPLETED',
        notes: 'Régularisation automatique (Réconciliations)'
      });
      if (payErr) { console.error(payErr); continue; }
      
      // 3. Marquer la commande payée
      await supabase.from('restaurant_orders')
        .update({ status: 'PAID', paid_at: new Date().toISOString() })
        .eq('id', order.id);
      
      fixed++;
    }
    
    alert(`✅ ${fixed} commande(s) régularisée(s)`);
    
  } catch (err: any) {
    alert(`Erreur: ${err.message}`);
  }
  setLoading(false);
};
    const handleCheckout = async () => {
    if (amountReceived < grandTotal) {
      setError('Le montant reçu est insuffisant');
      return;
      }
    setLoading(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const roomNumber = stay.rooms?.[0]?.number || stay.rooms?.number || stay.room_number || '—';
      const reconciliation: string[] = [];

      // 1. Paiement global
      const { error: paymentError } = await supabase.from('payments').insert({
        stay_id: stay.id,
        amount: grandTotal,
        method: paymentMethod,
        paid_at: new Date().toISOString(),
      });
      if (paymentError) throw paymentError;
      reconciliation.push('✅ Paiement enregistré');

      // 2. Fermer le séjour
      const { error: stayError } = await supabase.from('stays').update({
        status: 'CHECKED_OUT',
        check_out_at: new Date().toISOString(),
        folio_balance: 0,
      }).eq('id', stay.id);
      if (stayError) throw stayError;
      reconciliation.push('✅ Séjour clôturé');

      // 3. Libérer la chambre → DIRTY
      const roomId = stay.room_id || stay.rooms?.[0]?.id || stay.rooms?.id;
      if (roomId) {
        await supabase.from('rooms').update({ status: 'DIRTY' }).eq('id', roomId);
        reconciliation.push(`✅ Chambre ${roomNumber} → À nettoyer`);
      }

      // 4. Réconciliation restaurant
      if (roomCharges && roomCharges.length > 0) {
        let reconciledCount = 0;
        for (const charge of roomCharges) {
          if (charge.order_id && charge.charge_type === 'RESTAURANT') {
            await supabase.from('restaurant_payments').insert({
              site_id: siteId, // ✅ CRITIQUE
              order_id: charge.order_id,
              session_id: null,
              method: 'ROOM_CHARGE',
              amount: Number(charge.amount),
              received_amount: Number(charge.amount),
              change_amount: 0,
              paid_at: new Date().toISOString(),
              status: 'COMPLETED',
              notes: `Payé à la réception (Ch. ${roomNumber})`
            });
            
            await supabase.from('restaurant_orders').update({
              status: 'PAID',
              paid_at: new Date().toISOString()
            }).eq('id', charge.order_id);
            
            reconciledCount++;
          }
        }
        reconciliation.push(`✅ ${reconciledCount} commande(s) restaurant réconciliée(s)`);
      }

      // 5. Transaction caisse
      await supabase.from('cash_transactions').insert({
        site_id: siteId,
        type: 'INCOME',
        category: 'ROOM_PAYMENT',
        amount: grandTotal,
        payment_method: paymentMethod,
        status: 'PAID',
        provider_name: `${stay.customers?.last_name || ''} ${stay.customers?.first_name || ''}`.trim() || 'Client',
        description: `Check-out Ch. ${roomNumber} - ${nights} nuit(s) + ${roomCharges.length} charge(s)`,
        reference_id: stay.id,
        reference_table: 'stays',
        received_by: user?.id,
        amount_received: amountReceived,
        change_amount: Math.max(0, amountReceived - grandTotal),
        receipt_number: `REC-${Date.now().toString().slice(-8)}`,
        transaction_date: new Date().toISOString(),
      });
      reconciliation.push('✅ Transaction caisse créée');

      alert(`✅ CHECK-OUT TERMINÉ — Chambre ${roomNumber}\n\nMontant: ${grandTotal.toLocaleString('fr-FR')} F\nMode: ${paymentMethod}\n\nRéconciliation:\n${reconciliation.join('\n')}`);
      
      onSuccess(); // ✅ SEUL APPEL ICI
    } catch (err: any) {
      console.error('Erreur check-out:', err);
      setError(err.message || 'Erreur lors du check-out');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !stay) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-700 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Hotel className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-bold">
                {step === 'summary' ? 'Récapitulatif du Séjour (Folio)' : 'Paiement et Check-out'}
              </h2>
              <p className="text-xs text-indigo-100">
                {stay.customers?.first_name} {stay.customers?.last_name} • Chambre {roomNum}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-lg border border-red-200 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /><span>{error}</span>
            </div>
          )}

          {step === 'summary' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 text-center">
                  <div className="text-xs text-slate-600 mb-1">Nuitées</div>
                  <div className="text-2xl font-bold text-indigo-900">{nights}</div>
                  <div className="text-xs text-slate-500">× {nightlyRate.toLocaleString('fr-FR')} F</div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                  <div className="text-xs text-slate-600 mb-1">Consommations</div>
                  <div className="text-2xl font-bold text-amber-900">{totalCharges.toLocaleString('fr-FR')} F</div>
                  <div className="text-xs text-slate-500">{roomCharges.length} opération(s)</div>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
                  <div className="text-xs text-slate-600 mb-1">Total à payer</div>
                  <div className="text-3xl font-bold text-emerald-900">{grandTotal.toLocaleString('fr-FR')} F</div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-600" />
                  <h3 className="font-semibold text-slate-900 text-sm">Détail des prestations</h3>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                    <tr><th className="px-4 py-2 text-left">Date</th><th className="px-4 py-2 text-left">Description</th><th className="px-4 py-2 text-right">Montant</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr className="bg-indigo-50/50">
                      <td className="px-4 py-3 text-slate-600">{new Date(stay.check_in_at).toLocaleDateString('fr-FR')}</td>
                      <td className="px-4 py-3 font-medium text-slate-900 flex items-center gap-2">
                        <Bed className="w-4 h-4 text-indigo-600" /> Hébergement - Chambre {roomNum} ({nights} nuit(s))
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-indigo-900">{totalNights.toLocaleString('fr-FR')} F</td>
                    </tr>
                    {roomCharges.length > 0 ? roomCharges.map(charge => (
                      <tr key={charge.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-600">{new Date(charge.charge_date).toLocaleDateString('fr-FR')}</td>
                        <td className="px-4 py-3 text-slate-700 flex items-center gap-2">
                          <Utensils className="w-4 h-4 text-amber-600" />
                          {charge.description || 'Consommation Restaurant/Bar'}
                          {charge.order_id && <span className="text-xs text-slate-400">(Cmd: {charge.order_id.slice(0, 8)})</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-amber-900">{Number(charge.amount).toLocaleString('fr-FR')} F</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400 italic">Aucune consommation supplémentaire.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button onClick={handlePrintFolio} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 rounded-lg flex items-center justify-center gap-2">
                  <Printer className="w-5 h-5" /> Imprimer le folio
                </button>
                <button onClick={() => setStep('payment')} className="flex-[2] bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2">
                  Passer au paiement <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {step === 'payment' && (
            <div className="space-y-4">
              <div className="bg-emerald-50 border-2 border-emerald-300 rounded-lg p-4 flex justify-between items-center">
                <span className="text-lg font-bold text-emerald-900">TOTAL À PAYER</span>
                <span className="text-3xl font-bold text-emerald-900">{grandTotal.toLocaleString('fr-FR')} F</span>
              </div>
              <div className="border-2 border-slate-200 rounded-lg p-4 space-y-4">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2"><CreditCard className="w-5 h-5" /> Mode de paiement</h3>
                <div className="grid grid-cols-3 gap-3">
                  {(['CASH', 'CARD', 'MOBILE_MONEY'] as const).map(method => (
                    <button key={method} onClick={() => setPaymentMethod(method)}
                      className={`p-3 rounded-lg border-2 transition text-sm font-medium ${paymentMethod === method ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}>
                      {method === 'CASH' ? '💵 Espèces' : method === 'CARD' ? '💳 Carte' : '📱 Mobile Money'}
                    </button>
                  ))}
                </div>
                {paymentMethod === 'CASH' && (
                  <div className="space-y-3 pt-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Montant reçu (F)</label>
                      <input type="number" value={amountReceived}
                        onChange={(e) => { const val = Number(e.target.value); setAmountReceived(val); setChangeAmount(Math.max(0, val - grandTotal)); }}
                        className="w-full border-2 border-slate-300 rounded-lg px-3 py-3 text-xl font-bold text-center focus:ring-2 focus:ring-emerald-500 outline-none" />
                    </div>
                    {changeAmount > 0 && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex justify-between items-center">
                        <span className="text-sm font-medium text-emerald-900">Monnaie à rendre</span>
                        <span className="text-xl font-bold text-emerald-900">{changeAmount.toLocaleString('fr-FR')} F</span>
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Notes (optionnel)</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Observations sur le séjour..." />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setStep('summary')} disabled={loading} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50">
                  <ArrowLeft className="w-5 h-5" /> Retour au récapitulatif
                </button>
                <button onClick={handleCheckout} disabled={loading || (paymentMethod === 'CASH' && amountReceived < grandTotal)}
                  className="flex-[2] bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading ? (
                    <><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> Traitement...</>
                  ) : (
                    <><CheckCircle className="w-5 h-5" /> Finaliser le Check-out</>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
