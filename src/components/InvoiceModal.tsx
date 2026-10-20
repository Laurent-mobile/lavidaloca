'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Printer, Download, FileText } from 'lucide-react';

interface Props {
  siteId: string;
  stayId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function InvoiceModal({ siteId, stayId, isOpen, onClose }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

    useEffect(() => {
    if (isOpen && stayId) {
      loadInvoiceData();
      // Scroll en haut du modal à l'ouverture
      setTimeout(() => {
        const modal = document.getElementById('invoice-modal');
        if (modal) modal.scrollTop = 0;
      }, 100);
    }
  }, [isOpen, stayId]);

  const loadInvoiceData = async () => {
    setLoading(true);
    try {
      const { data: stay } = await supabase
        .from('stays')
        .select(`
          id, check_in_at, check_out_at, nightly_rate, folio_balance, status,
          customer_id, reservation_id,
          reservations (
            id, number, check_in_date, check_out_date, total_amount, deposit,
            adults, children, notes
          ),
          rooms (number, room_categories (code, name))
        `)
        .eq('id', stayId)
        .single();

      if (!stay) {
        setLoading(false);
        return;
      }

      const { data: customer } = await supabase
        .from('customers')
        .select('first_name, last_name, phone, id_number, nationality, address')
        .eq('id', stay.customer_id)
        .single();

      const { data: site } = await supabase
        .from('sites')
        .select('name, code, city, address, phone, email, nif, rccm')
        .eq('id', siteId)
        .single();

      setData({
        stay,
        customer,
        site,
      });
    } catch (err) {
      console.error('Erreur chargement facture:', err);
    }
    setLoading(false);
  };

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white p-6 rounded-lg">Chargement...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white p-6 rounded-lg">Données introuvables</div>
      </div>
    );
  }

  const { stay, customer, site } = data;
  const reservation = stay.reservations;
  const room = stay.rooms;

  // Calculs
  const checkIn = new Date(stay.check_in_at);
  const checkOut = stay.check_out_at ? new Date(stay.check_out_at) : new Date(reservation?.check_out_date);
  const nights = Math.max(1, Math.ceil((checkOut.getTime() - checkIn.getTime()) / 86400000));
  const subtotal = nights * stay.nightly_rate;
  const tva = subtotal * 0.18; // TVA 18% au Burkina Faso
  const totalTTC = subtotal + tva;
  const deposit = reservation?.deposit || 0;
  const balance = totalTTC - deposit;

  const invoiceNumber = `FAC-${stay.id.slice(0, 8).toUpperCase()}`;
  const invoiceDate = new Date().toLocaleDateString('fr-FR');

  return (
    <div id="invoice-modal" className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl my-4 print:my-0 print:shadow-none print:max-w-none">
        
        {/* Barre d'actions (masquée à l'impression) */}
        <div className="bg-gradient-to-r from-indigo-900 to-purple-900 text-white px-6 py-3 flex items-center justify-between rounded-t-xl print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            <h2 className="text-lg font-bold">Facture / Folio</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 bg-white text-indigo-900 px-4 py-2 rounded-lg font-semibold hover:bg-indigo-50"
            >
              <Printer className="w-4 h-4" />
              Imprimer / PDF
            </button>
            <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Contenu de la facture */}
        <div className="p-8 print:p-4" id="invoice-content">
          
          {/* En-tête */}
          <div className="flex justify-between items-start mb-8 pb-4 border-b-2 border-indigo-900">
            <div>
              <h1 className="text-2xl font-bold text-indigo-900">{site?.name || 'LA VIDA-LOCA'}</h1>
              <p className="text-sm text-slate-600 mt-1">{site?.address || 'Ouagadougou, Burkina Faso'}</p>
              <p className="text-sm text-slate-600">Tél: {site?.phone || '+226 25 00 00 00'}</p>
              <p className="text-sm text-slate-600">Email: {site?.email || 'contact@vidaloca.bf'}</p>
            </div>
            <div className="text-right">
              <h2 className="text-3xl font-bold text-indigo-900">FACTURE</h2>
              <p className="text-sm text-slate-600 mt-2">N° <strong>{invoiceNumber}</strong></p>
              <p className="text-sm text-slate-600">Date: <strong>{invoiceDate}</strong></p>
              <p className="text-xs text-slate-500 mt-2">NIF: {site?.nif || '—'}</p>
              <p className="text-xs text-slate-500">RCCM: {site?.rccm || '—'}</p>
            </div>
          </div>

          {/* Infos client & séjour */}
          <div className="grid grid-cols-2 gap-6 mb-8">
            <div className="bg-slate-50 p-4 rounded-lg">
              <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Client</h3>
              <p className="font-semibold text-slate-900">
                {customer?.last_name} {customer?.first_name}
              </p>
              <p className="text-sm text-slate-600">Tél: {customer?.phone || '—'}</p>
              <p className="text-sm text-slate-600">Pièce: {customer?.id_number || '—'}</p>
              <p className="text-sm text-slate-600">Nationalité: {customer?.nationality || '—'}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-lg">
              <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Séjour</h3>
              <p className="text-sm"><strong>Réservation:</strong> {reservation?.number || '—'}</p>
              <p className="text-sm"><strong>Chambre:</strong> {room?.number} ({room?.room_categories?.code})</p>
              <p className="text-sm"><strong>Arrivée:</strong> {checkIn.toLocaleDateString('fr-FR')}</p>
              <p className="text-sm"><strong>Départ:</strong> {checkOut.toLocaleDateString('fr-FR')}</p>
              <p className="text-sm"><strong>Nuit(s):</strong> {nights}</p>
              <p className="text-sm"><strong>Occupants:</strong> {reservation?.adults || 1} adulte(s), {reservation?.children || 0} enfant(s)</p>
            </div>
          </div>

          {/* Tableau des prestations */}
          <table className="w-full mb-6 border-collapse">
            <thead>
              <tr className="bg-indigo-900 text-white">
                <th className="text-left p-3 text-sm">Description</th>
                <th className="text-center p-3 text-sm">Qté</th>
                <th className="text-right p-3 text-sm">P.U. (FCFA)</th>
                <th className="text-right p-3 text-sm">Total (FCFA)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-200">
                <td className="p-3 text-sm">
                  <strong>Hébergement</strong> - Chambre {room?.number} ({room?.room_categories?.name})
                  <br />
                  <span className="text-xs text-slate-500">
                    Du {checkIn.toLocaleDateString('fr-FR')} au {checkOut.toLocaleDateString('fr-FR')}
                  </span>
                </td>
                <td className="p-3 text-sm text-center">{nights}</td>
                <td className="p-3 text-sm text-right">{Number(stay.nightly_rate).toLocaleString('fr-FR')}</td>
                <td className="p-3 text-sm text-right font-semibold">{Number(subtotal).toLocaleString('fr-FR')}</td>
              </tr>
            </tbody>
          </table>

          {/* Totaux */}
          <div className="flex justify-end mb-8">
            <div className="w-80">
              <div className="flex justify-between py-2 border-b border-slate-200">
                <span className="text-sm text-slate-600">Sous-total HT</span>
                <span className="text-sm font-semibold">{Number(subtotal).toLocaleString('fr-FR')} F</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-200">
                <span className="text-sm text-slate-600">TVA (18%)</span>
                <span className="text-sm font-semibold">{Number(tva).toLocaleString('fr-FR')} F</span>
              </div>
              <div className="flex justify-between py-2 border-b-2 border-indigo-900 bg-indigo-50">
                <span className="text-base font-bold text-indigo-900">Total TTC</span>
                <span className="text-base font-bold text-indigo-900">{Number(totalTTC).toLocaleString('fr-FR')} F</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-200">
                <span className="text-sm text-slate-600">Acompte versé</span>
                <span className="text-sm text-emerald-600">- {Number(deposit).toLocaleString('fr-FR')} F</span>
              </div>
              <div className="flex justify-between py-3 bg-orange-50 rounded mt-2">
                <span className="text-base font-bold text-orange-900">Solde à payer</span>
                <span className="text-base font-bold text-orange-900">{Number(balance).toLocaleString('fr-FR')} F</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {reservation?.notes && (
            <div className="mb-6 p-3 bg-slate-50 rounded border border-slate-200">
              <h4 className="text-xs font-bold text-slate-500 uppercase mb-1">Notes</h4>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{reservation.notes}</p>
            </div>
          )}

          {/* Pied de page */}
          <div className="mt-12 pt-4 border-t border-slate-300">
            <div className="grid grid-cols-2 gap-8">
              <div>
                <p className="text-xs text-slate-500 mb-8">Signature du client</p>
                <div className="border-b border-slate-400 pb-1"></div>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-8">Cachet et signature de l'hôtel</p>
                <div className="border-b border-slate-400 pb-1"></div>
              </div>
            </div>
            <p className="text-center text-xs text-slate-500 mt-8">
              Merci de votre visite ! À bientôt chez LA VIDA-LOCA 🌴
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
