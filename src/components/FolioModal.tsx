'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Printer, Bed, Utensils, FileText } from 'lucide-react';

interface Props {
  siteId: string;
  stay: any;
  isOpen: boolean;
  onClose: () => void;
}

export default function FolioModal({ siteId, stay, isOpen, onClose }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [roomCharges, setRoomCharges] = useState<any[]>([]);
  const [nights, setNights] = useState(0);
  const [nightlyRate, setNightlyRate] = useState(0);
  const [totalNights, setTotalNights] = useState(0);
  const [totalCharges, setTotalCharges] = useState(0);
  const [grandTotal, setGrandTotal] = useState(0);

  useEffect(() => {
    if (isOpen && stay) {
      loadFolioData();
    }
  }, [isOpen, stay]);

  const loadFolioData = async () => {
    setLoading(true);
    try {
      const checkIn = new Date(stay.check_in_at);
      const checkOut = stay.check_out_at ? new Date(stay.check_out_at) : new Date();
      const diffTime = Math.abs(checkOut.getTime() - checkIn.getTime());
      const calculatedNights = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
      
      setNights(calculatedNights);
      setNightlyRate(Number(stay.nightly_rate) || 0);
      setTotalNights(calculatedNights * (Number(stay.nightly_rate) || 0));

      const { data: charges, error } = await supabase
        .from('room_charges')
        .select('*')
        .eq('stay_id', stay.id)
        .eq('is_voided', false)
        .order('charge_date', { ascending: false });

      if (error) throw error;
      setRoomCharges(charges || []);
      
      const totalChargesAmount = (charges || []).reduce((sum, c) => sum + Number(c.amount), 0);
      setTotalCharges(totalChargesAmount);
      setGrandTotal((calculatedNights * (Number(stay.nightly_rate) || 0)) + totalChargesAmount);
    } catch (err: any) {
      console.error('Erreur chargement folio:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrintFolio = () => {
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) return;

    const checkIn = new Date(stay.check_in_at).toLocaleDateString('fr-FR');
    const checkOut = stay.check_out_at ? new Date(stay.check_out_at).toLocaleDateString('fr-FR') : 'En cours';

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
          .badge { display: inline-block; background: #dbeafe; color: #1e40af; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
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
            <label>Date de départ</label>
            <value>${checkOut} <span class="badge">${stay.status === 'IN_HOUSE' ? 'EN COURS' : 'TERMINÉ'}</span></value>
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
              <td colspan="4" style="text-align: right;">TOTAL GÉNÉRAL (Solde actuel)</td>
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

  if (!isOpen || !stay) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-700 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-bold">Récapitulatif du Séjour (Folio)</h2>
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
          {loading ? (
            <div className="text-center py-8">Chargement du folio...</div>
          ) : (
            <>
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
                  <div className="text-xs text-slate-600 mb-1">Solde actuel</div>
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
                      roomCharges.map((charge) => (
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

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button
                  onClick={handlePrintFolio}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <Printer className="w-5 h-5" />
                  Imprimer le folio (A4)
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-lg"
                >
                  Fermer
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
