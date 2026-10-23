'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Hotel, Calendar, DollarSign, CreditCard, Printer, FileText, AlertCircle, CheckCircle, Bed, Utensils, ArrowRight, ArrowLeft } from 'lucide-react';

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
  const [step, setStep] = useState<'summary' | 'payment'>('summary'); // ✅ NOUVEAU : Gestion des étapes
  
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

  useEffect(() => {
    if (isOpen && stay) {
      setStep('summary'); // Reset à l'étape 1 à chaque ouverture
      loadCheckoutData();
    }
  }, [isOpen, stay]);

  const loadCheckoutData = async () => {
    setLoading(true);
    setError('');
    try {
      // 1. Calculer le nombre de nuitées
      const checkIn = new Date(stay.check_in_at);
      const checkOut = new Date();
      const diffTime = Math.abs(checkOut.getTime() - checkIn.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const calculatedNights = diffDays || 1;
      
      setNights(calculatedNights);
      setNightlyRate(Number(stay.nightly_rate) || 0);
      setTotalNights(calculatedNights * (Number(stay.nightly_rate) || 0));

      // 2. Charger les charges restaurant et autres
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

      // 3. Calculer le total général
      const total = (calculatedNights * (Number(stay.nightly_rate) || 0)) + totalChargesAmount;
      setGrandTotal(total);
      setAmountReceived(total);
    } catch (err: any) {
      console.error('Erreur chargement données check-out:', err);
      setError(err.message || 'Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  // ✅ NOUVEAU : Fonction pour imprimer le folio détaillé
  const handlePrintFolio = () => {
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) return;

    const checkIn = new Date(stay.check_in_at).toLocaleDateString('fr-FR');
    const checkOut = new Date().toLocaleDateString('fr-FR');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Folio - Chambre ${stay.rooms?.number}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; color: #333; font-size: 14px; }
          .header { text-align: center; border-bottom: 3px solid #4f46e5; padding-bottom: 20px; margin-bottom: 30px; }
          .header h1 { color: #4f46e5; margin: 0; font-size: 24px; }
          .header .subtitle { color: #666; margin-top: 5px; font-size: 14px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; background: #f9fafb; padding: 20px; border-radius: 8px; }
          .info-item label { font-size: 12px; color: #6b7280; display: block; margin-bottom: 4px; font-weight: bold; text-transform: uppercase; }
          .info-item value { font-size: 15px; color: #1f2937; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background: #4f46e5; color: white; padding: 12px; text-align: left; font-size: 13px; }
          td { padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
          .total-row { background: #f3f4f6; font-weight: bold; }
          .grand-total { background: #4f46e5; color: white; font-size: 16px; }
          .grand-total td { border: none; padding: 15px 12px; }
          .footer { margin-top: 50px; text-align: center; color: #6b7280; font-size: 12px; border-top: 2px solid #e5e7eb; padding-top: 20px; }
          .category-header { background: #eef2ff; font-weight: bold; color: #4338ca; }
          @media print { body { margin: 20px; } .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>LA VIDA-LOCA</h1>
          <div class="subtitle">Hôtel • Resto • Lounge — Ouagadougou</div>
          <div class="subtitle" style="font-weight: bold; margin-top: 10px; font-size: 16px;">FOLIO DE SÉJOUR (PROVISOIRE)</div>
        </div>

        <div class="info-grid">
          <div class="info-item">
            <label>Client</label>
            <value>${stay.customers?.first_name || ''} ${stay.customers?.last_name || 'Client'}</value>
          </div>
          <div class="info-item">
            <label>Chambre</label>
            <value>N° ${stay.rooms?.number} (${stay.rooms?.room_categories?.code || 'N/A'})</value>
          </div>
          <div class="info-item">
            <label>Date d'arrivée</label>
            <value>${checkIn}</value>
          </div>
          <div class="info-item">
            <label>Date de départ prévue</label>
            <value>${checkOut}</value>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th style="text-align: right;">Quantité</th>
              <th style="text-align: right;">Prix Unit.</th>
              <th style="text-align: right;">Total (F)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${checkIn}</td>
              <td><strong>Hébergement</strong> - Chambre ${stay.rooms?.number}</td>
              <td style="text-align: right;">${nights}</td>
              <td style="text-align: right;">${nightlyRate.toLocaleString('fr-FR')}</td>
              <td style="text-align: right;">${totalNights.toLocaleString('fr-FR')}</td>
            </tr>
            
            ${roomCharges.length > 0 ? roomCharges.map(charge => `
              <tr>
                <td>${new Date(charge.charge_date).toLocaleDateString('fr-FR')}</td>
                <td>${charge.description || 'Consommation'}</td>
                <td style="text-align: right;">1</td>
                <td style="text-align: right;">${Number(charge.amount).toLocaleString('fr-FR')}</td>
                <td style="text-align: right;">${Number(charge.amount).toLocaleString('fr-FR')}</td>
              </tr>
            `).join('') : '<tr><td colspan="5" style="text-align:center; color:#666; padding: 20px;">Aucune consommation supplémentaire</td></tr>'}
          </tbody>
          <tfoot>
            <tr class="grand-total">
              <td colspan="4" style="text-align: right;">TOTAL GÉNÉRAL À PAYER</td>
              <td style="text-align: right;">${grandTotal.toLocaleString('fr-FR')} F</td>
            </tr>
          </tfoot>
        </table>

        <div class="footer">
          <p>Document généré le ${new Date().toLocaleString('fr-FR')}</p>
          <p>Merci de votre séjour ! À bientôt chez LA VIDA-LOCA 🌴</p>
        </div>
        
        <div class="no-print" style="text-align: center; margin-top: 30px;">
          <button onclick="window.print()" style="padding: 10px 20px; background: #4f46e5; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">🖨️ Imprimer ce folio</button>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
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

      // 1. Créer le paiement
      const { error: paymentError } = await supabase.from('payments').insert({
        stay_id: stay.id,
        amount: grandTotal,
        method: paymentMethod,
        paid_at: new Date().toISOString(),
      });
      if (paymentError) throw paymentError;

      // 2. Mettre à jour le séjour
      const { error: stayError } = await supabase.from('stays').update({
        status: 'CHECKED_OUT',
        check_out_at: new Date().toISOString(),
        folio_balance: 0,
      }).eq('id', stay.id);
      if (stayError) throw stayError;

      // 3. Libérer la chambre
      const { error: roomError } = await supabase.from('rooms').update({ status: 'DIRTY' }).eq('id', stay.room_id);
      if (roomError) throw roomError;

      // 4. Créer une transaction dans la caisse hôtel
      const { error: cashError } = await supabase.from('cash_transactions').insert({
        site_id: siteId,
        type: 'INCOME',
        category: 'CHECKOUT_PAYMENT',
        amount: grandTotal,
        payment_method: paymentMethod,
        status: 'PAID',
        provider_name: `Check-out Chambre ${stay.rooms?.number}`,
        description: `Paiement séjour - ${nights} nuit(s) + charges`,
        reference_id: stay.id,
        reference_table: 'stays',
        received_by: user?.id,
      });

      if (cashError) {
        console.warn('Erreur création transaction caisse (non bloquant):', cashError);
      }

      setLoading(false);
      onSuccess();
    } catch (err: any) {
      console.error('Erreur check-out:', err);
      setError(err.message || 'Erreur lors du check-out');
      setLoading(false);
    }
  };

  if (!isOpen || !stay) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-y-auto">
        {/* En-tête */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-700 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Hotel className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-bold">
                {step === 'summary' ? 'Récapitulatif du Séjour (Folio)' : 'Paiement et Check-out'}
              </h2>
              <p className="text-xs text-indigo-100">
                {stay.customers?.first_name} {stay.customers?.last_name} • Chambre {stay.rooms?.number}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-lg border border-red-200 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ================= ÉTAPE 1 : RÉCAPITULATIF (FOLIO) ================= */}
          {step === 'summary' && (
            <div className="space-y-4">
              {/* Résumé rapide */}
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

              {/* Tableau détaillé des charges */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-600" />
                  <h3 className="font-semibold text-slate-900 text-sm">Détail des prestations</h3>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-2 text-left">Date</th>
                      <th className="px-4 py-2 text-left">Description</th>
                      <th className="px-4 py-2 text-right">Montant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr className="bg-indigo-50/50">
                      <td className="px-4 py-3 text-slate-600">{new Date(stay.check_in_at).toLocaleDateString('fr-FR')}</td>
                      <td className="px-4 py-3 font-medium text-slate-900 flex items-center gap-2">
                        <Bed className="w-4 h-4 text-indigo-600" />
                        Hébergement - Chambre {stay.rooms?.number} ({nights} nuit(s))
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-indigo-900">{totalNights.toLocaleString('fr-FR')} F</td>
                    </tr>
                    {roomCharges.length > 0 ? (
                      roomCharges.map((charge, idx) => (
                        <tr key={charge.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-600">{new Date(charge.charge_date).toLocaleDateString('fr-FR')}</td>
                          <td className="px-4 py-3 text-slate-700 flex items-center gap-2">
                            <Utensils className="w-4 h-4 text-amber-600" />
                            {charge.description || 'Consommation Restaurant/Bar'}
                            {charge.order_id && <span className="text-xs text-slate-400">(Cmd: {charge.order_id.slice(0, 8)})</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-amber-900">{Number(charge.amount).toLocaleString('fr-FR')} F</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-slate-400 italic">
                          Aucune consommation supplémentaire enregistrée.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Actions de l'étape 1 */}
              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button
                  onClick={handlePrintFolio}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <Printer className="w-5 h-5" />
                  Imprimer le folio
                </button>
                <button
                  onClick={() => setStep('payment')}
                  className="flex-[2] bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  Passer au paiement
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* ================= ÉTAPE 2 : PAIEMENT ================= */}
          {step === 'payment' && (
            <div className="space-y-4">
              {/* Rappel du total */}
              <div className="bg-emerald-50 border-2 border-emerald-300 rounded-lg p-4 flex justify-between items-center">
                <span className="text-lg font-bold text-emerald-900">TOTAL À PAYER</span>
                <span className="text-3xl font-bold text-emerald-900">{grandTotal.toLocaleString('fr-FR')} F</span>
              </div>

              {/* Formulaire de paiement */}
              <div className="border-2 border-slate-200 rounded-lg p-4 space-y-4">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <CreditCard className="w-5 h-5" /> Mode de paiement
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  {(['CASH', 'CARD', 'MOBILE_MONEY'] as const).map(method => (
                    <button
                      key={method}
                      onClick={() => setPaymentMethod(method)}
                      className={`p-3 rounded-lg border-2 transition text-sm font-medium ${
                        paymentMethod === method
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {method === 'CASH' ? '💵 Espèces' : method === 'CARD' ? '💳 Carte' : '📱 Mobile Money'}
                    </button>
                  ))}
                </div>

                {paymentMethod === 'CASH' && (
                  <div className="space-y-3 pt-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Montant reçu (F)</label>
                      <input
                        type="number"
                        value={amountReceived}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setAmountReceived(val);
                          setChangeAmount(Math.max(0, val - grandTotal));
                        }}
                        className="w-full border-2 border-slate-300 rounded-lg px-3 py-3 text-xl font-bold text-center focus:ring-2 focus:ring-emerald-500 outline-none"
                      />
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
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="Observations sur le séjour..."
                  />
                </div>
              </div>

              {/* Actions de l'étape 2 */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep('summary')}
                  disabled={loading}
                  className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <ArrowLeft className="w-5 h-5" />
                  Retour au récapitulatif
                </button>
                <button
                  onClick={handleCheckout}
                  disabled={loading || (paymentMethod === 'CASH' && amountReceived < grandTotal)}
                  className="flex-[2] bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Traitement...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      Finaliser le Check-out
                    </>
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
