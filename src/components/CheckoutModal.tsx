'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Hotel, Calendar, DollarSign, CreditCard, Printer, FileText, AlertCircle, CheckCircle, Bed, Utensils, Coffee, Minus, Plus } from 'lucide-react';

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
  const [showInvoice, setShowInvoice] = useState(false);

  useEffect(() => {
    if (isOpen && stay) {
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
      const { error: paymentError } = await supabase
        .from('payments')
        .insert({
          stay_id: stay.id,
          amount: grandTotal,
          method: paymentMethod,
          paid_at: new Date().toISOString(),
        });

      if (paymentError) throw paymentError;

      // 2. Mettre à jour le séjour
      const { error: stayError } = await supabase
        .from('stays')
        .update({
          status: 'CHECKED_OUT',
          check_out_at: new Date().toISOString(),
          folio_balance: 0,
        })
        .eq('id', stay.id);

      if (stayError) throw stayError;

      // 3. Libérer la chambre
      const { error: roomError } = await supabase
        .from('rooms')
        .update({ status: 'DIRTY' })
        .eq('id', stay.room_id);

      if (roomError) throw roomError;

      // 4. Créer une transaction dans la caisse hôtel
      const { error: cashError } = await supabase
        .from('cash_transactions')
        .insert({
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
        console.warn('Erreur création transaction caisse:', cashError);
      }

      setShowInvoice(true);
      setLoading(false);
      onSuccess();
      
    } catch (err: any) {
      console.error('Erreur check-out:', err);
      setError(err.message || 'Erreur lors du check-out');
      setLoading(false);
    }
  };

  const printInvoice = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const chargesByCategory = roomCharges.reduce((acc, charge) => {
      const category = charge.charge_type || 'AUTRE';
      if (!acc[category]) acc[category] = [];
      acc[category].push(charge);
      return acc;
    }, {} as Record<string, any[]>);

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Facture - Chambre ${stay.rooms?.number}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
          .header { text-align: center; border-bottom: 3px solid #1e3a8a; padding-bottom: 20px; margin-bottom: 30px; }
          .header h1 { color: #1e3a8a; margin: 0; }
          .header .subtitle { color: #666; margin-top: 10px; }
          .section { margin-bottom: 30px; }
          .section h2 { color: #1e3a8a; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
          .info-item { background: #f9fafb; padding: 15px; border-radius: 8px; }
          .info-item label { font-size: 12px; color: #6b7280; display: block; margin-bottom: 5px; }
          .info-item value { font-size: 16px; font-weight: bold; color: #1f2937; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background: #1e3a8a; color: white; padding: 12px; text-align: left; }
          td { padding: 12px; border-bottom: 1px solid #e5e7eb; }
          .total-row { background: #f3f4f6; font-weight: bold; }
          .grand-total { background: #1e3a8a; color: white; font-size: 18px; }
          .footer { margin-top: 50px; text-align: center; color: #6b7280; font-size: 12px; border-top: 2px solid #e5e7eb; padding-top: 20px; }
          @media print { body { margin: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>LA VIDA-LOCA</h1>
          <div class="subtitle">Hôtel & Restaurant - Ouagadougou</div>
          <div class="subtitle">FACTURE DE SÉJOUR</div>
        </div>

        <div class="section">
          <h2>Informations Client</h2>
          <div class="info-grid">
            <div class="info-item">
              <label>Client</label>
              <value>${stay.customers?.first_name} ${stay.customers?.last_name}</value>
            </div>
            <div class="info-item">
              <label>Chambre</label>
              <value>${stay.rooms?.number} - ${stay.rooms?.room_categories?.code}</value>
            </div>
            <div class="info-item">
              <label>Arrivée</label>
              <value>${new Date(stay.check_in_at).toLocaleDateString('fr-FR')}</value>
            </div>
            <div class="info-item">
              <label>Départ</label>
              <value>${new Date().toLocaleDateString('fr-FR')}</value>
            </div>
          </div>
        </div>

        <div class="section">
          <h2>Détail du Séjour</h2>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Qté</th>
                <th>Prix Unitaire</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Nuitées - Chambre ${stay.rooms?.number}</td>
                <td>${nights}</td>
                <td>${nightlyRate.toLocaleString('fr-FR')} F</td>
                <td>${totalNights.toLocaleString('fr-FR')} F</td>
              </tr>
              ${Object.entries(chargesByCategory).map(([category, charges]) => `
                <tr class="total-row">
                  <td colspan="3"><strong>${category === 'RESTAURANT' ? '🍽️ Restaurant' : category === 'BAR' ? '🍹 Bar' : category}</strong></td>
                  <td></td>
                </tr>
                ${(charges as any[]).map(charge => `
                  <tr>
                    <td style="padding-left: 30px;">${charge.description}</td>
                    <td>${charge.quantity || 1}</td>
                    <td>${Number(charge.amount).toLocaleString('fr-FR')} F</td>
                    <td>${Number(charge.amount).toLocaleString('fr-FR')} F</td>
                  </tr>
                `).join('')}
              `).join('')}
            </tbody>
            <tfoot>
              <tr class="grand-total">
                <td colspan="3">TOTAL GÉNÉRAL</td>
                <td>${grandTotal.toLocaleString('fr-FR')} F</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div class="section">
          <h2>Paiement</h2>
          <div class="info-grid">
            <div class="info-item">
              <label>Mode de paiement</label>
              <value>${paymentMethod === 'CASH' ? '💵 Espèces' : paymentMethod === 'CARD' ? ' Carte' : '📱 Mobile Money'}</value>
            </div>
            <div class="info-item">
              <label>Montant payé</label>
              <value>${amountReceived.toLocaleString('fr-FR')} F</value>
            </div>
            <div class="info-item">
              <label>Monnaie rendue</label>
              <value>${changeAmount.toLocaleString('fr-FR')} F</value>
            </div>
            <div class="info-item">
              <label>Date de paiement</label>
              <value>${new Date().toLocaleString('fr-FR')}</value>
            </div>
          </div>
        </div>

        <div class="footer">
          <p>Merci de votre séjour ! À bientôt chez LA VIDA-LOCA</p>
          <p>Facture générée le ${new Date().toLocaleString('fr-FR')}</p>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  if (!isOpen || !stay) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-y-auto">
        {/* En-tête */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-700 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Hotel className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-bold">Check-out - Chambre {stay.rooms?.number}</h2>
              <p className="text-xs text-indigo-100">
                {stay.customers?.first_name} {stay.customers?.last_name} • Arrivée: {new Date(stay.check_in_at).toLocaleDateString('fr-FR')}
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

          {showInvoice ? (
            <div className="space-y-4">
              <div className="bg-emerald-50 border-2 border-emerald-300 p-4 rounded-lg flex items-center gap-3">
                <CheckCircle className="w-8 h-8 text-emerald-700" />
                <div className="flex-1">
                  <div className="font-bold text-emerald-900 text-lg">Check-out effectué avec succès !</div>
                  <div className="text-sm text-emerald-700">
                    Chambre {stay.rooms?.number} libérée • Facture générée
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={printInvoice}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
                >
                  <Printer className="w-5 h-5" />
                  Imprimer la facture
                </button>
                <button
                  onClick={() => { setShowInvoice(false); onClose(); }}
                  className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-lg"
                >
                  Fermer
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Résumé du séjour */}
              <div className="bg-indigo-50 border-2 border-indigo-200 rounded-lg p-4">
                <h3 className="font-semibold text-indigo-900 mb-3 flex items-center gap-2">
                  <Bed className="w-5 h-5" />
                  Hébergement
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white p-3 rounded border border-indigo-200">
                    <div className="text-xs text-slate-600">Nuitées</div>
                    <div className="text-2xl font-bold text-indigo-900">{nights}</div>
                    <div className="text-xs text-slate-500">× {nightlyRate.toLocaleString('fr-FR')} F</div>
                  </div>
                  <div className="bg-white p-3 rounded border border-indigo-200">
                    <div className="text-xs text-slate-600">Total nuitées</div>
                    <div className="text-2xl font-bold text-indigo-900">{totalNights.toLocaleString('fr-FR')} F</div>
                  </div>
                  <div className="bg-white p-3 rounded border border-indigo-200">
                    <div className="text-xs text-slate-600">Folio actuel</div>
                    <div className="text-2xl font-bold text-indigo-900">{Number(stay.folio_balance || 0).toLocaleString('fr-FR')} F</div>
                  </div>
                </div>
              </div>

              {/* Charges supplémentaires */}
              {roomCharges.length > 0 && (
                <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4">
                  <h3 className="font-semibold text-amber-900 mb-3 flex items-center gap-2">
                    <Utensils className="w-5 h-5" />
                    Charges Supplémentaires ({roomCharges.length})
                  </h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {roomCharges.map(charge => (
                      <div key={charge.id} className="flex items-center justify-between bg-white p-2 rounded border border-slate-200">
                        <div className="flex-1">
                          <div className="font-medium text-sm">{charge.description}</div>
                          <div className="text-xs text-slate-500">
                            {new Date(charge.charge_date).toLocaleDateString('fr-FR')}
                            {charge.order_id && ` • Cmd: ${charge.order_id.slice(0, 8)}`}
                          </div>
                        </div>
                        <div className="font-bold text-sm text-amber-900">
                          {Number(charge.amount).toLocaleString('fr-FR')} F
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t-2 border-amber-300 flex justify-between items-center">
                    <span className="text-sm font-bold text-amber-900">Total charges</span>
                    <span className="text-lg font-bold text-amber-900">{totalCharges.toLocaleString('fr-FR')} F</span>
                  </div>
                </div>
              )}

              {/* Total */}
              <div className="bg-emerald-50 border-2 border-emerald-300 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <span className="text-xl font-bold text-emerald-900">TOTAL À PAYER</span>
                  <span className="text-3xl font-bold text-emerald-900">{grandTotal.toLocaleString('fr-FR')} F</span>
                </div>
              </div>

              {/* Paiement */}
              <div className="border-2 border-slate-200 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <CreditCard className="w-5 h-5" />
                  Paiement
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Mode de paiement</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['CASH', 'CARD', 'MOBILE_MONEY'] as const).map(method => (
                        <button
                          key={method}
                          onClick={() => setPaymentMethod(method)}
                          className={`p-3 rounded-lg border-2 transition ${
                            paymentMethod === method
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                          }`}
                        >
                          {method === 'CASH' ? '💵 Espèces' : method === 'CARD' ? '💳 Carte' : '📱 Mobile'}
                        </button>
                      ))}
                    </div>
                  </div>
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
                      className="w-full border-2 border-slate-300 rounded-lg px-3 py-2 text-lg font-bold"
                    />
                  </div>
                  {changeAmount > 0 && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-emerald-900">Monnaie à rendre</span>
                        <span className="text-xl font-bold text-emerald-900">{changeAmount.toLocaleString('fr-FR')} F</span>
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Notes (optionnel)</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                      placeholder="Observations..."
                    />
                  </div>
                </div>
              </div>

              {/* Boutons d'action */}
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  disabled={loading}
                  className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-lg disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  onClick={handleCheckout}
                  disabled={loading || amountReceived < grandTotal}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
