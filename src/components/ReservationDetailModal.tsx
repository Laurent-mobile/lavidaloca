'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Calendar, User, Bed, DollarSign, Phone, Award, FileText, LogIn, Clock } from 'lucide-react';

interface Props {
  siteId: string;
  reservationId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const statusLabels: Record<string, { label: string; color: string; icon: string }> = {
  CONFIRMED: { label: 'Confirmée', color: 'bg-amber-100 text-amber-900 border-amber-200', icon: '📅' },
  CHECKED_IN: { label: 'En séjour', color: 'bg-blue-100 text-blue-900 border-blue-200', icon: '🔑' },
  CHECKED_OUT: { label: 'Parti(e)', color: 'bg-emerald-100 text-emerald-900 border-emerald-200', icon: '✅' },
  CANCELLED: { label: 'Annulée', color: 'bg-red-100 text-red-900 border-red-200', icon: '❌' },
  NO_SHOW: { label: 'Non présenté(e)', color: 'bg-slate-200 text-slate-700 border-slate-300', icon: '🚫' },
};

export default function ReservationDetailModal({ siteId, reservationId, isOpen, onClose, onSuccess }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [res, setRes] = useState<any>(null);
  const [stay, setStay] = useState<any>(null);

  useEffect(() => {
    if (isOpen && reservationId) loadDetail();
  }, [isOpen, reservationId]);

  const loadDetail = async () => {
    setLoading(true);
    setError('');
    try {
      const { data: r, error: e } = await supabase
        .from('reservations')
        .select(`
          id, number, check_in_date, check_out_date, status, adults, children,
          nightly_rate, total_amount, deposit, notes, created_at,
          customer_id, room_id, room_category_id,
          customers (id, first_name, last_name, phone, email, id_number, nationality, is_vip),
          rooms (id, number, floor, status, room_categories (code, name, base_price))
        `)
        .eq('id', reservationId)
        .single();
      if (e) throw e;

      // Supabase renvoie les jointures en tableaux selon la config → on normalise
            const normalized = {
        ...r,
        customers: Array.isArray(r.customers) ? r.customers[0] : r.customers,
        rooms: Array.isArray(r.rooms) ? r.rooms[0] : r.rooms,
      };
      
      // ✅ Normalisation de room_categories qui est imbriqué dans rooms
      const roomCats = Array.isArray(normalized.rooms?.room_categories) 
        ? normalized.rooms.room_categories[0] 
        : normalized.rooms?.room_categories;
        
      normalized.room_categories = roomCats || null;
      setRes(normalized);

      // Séjour lié (si check-in effectué)
      const { data: s } = await supabase
        .from('stays')
        .select('id, check_in_at, check_out_at, folio_balance, status, nightly_rate')
        .eq('reservation_id', reservationId)
        .order('check_in_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setStay(s || null);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleCheckIn = async () => {
    if (!res || !res.rooms) return;
    setLoading(true);
    try {
      const { error: stayErr } = await supabase.from('stays').insert({
        reservation_id: res.id,
        room_id: res.rooms.id,
        customer_id: res.customer_id,
        check_in_at: new Date().toISOString(),
        nightly_rate: res.nightly_rate,
        status: 'IN_HOUSE',
        folio_balance: res.nightly_rate,
      });
      if (stayErr) throw stayErr;
      await supabase.from('reservations').update({ status: 'CHECKED_IN' }).eq('id', res.id);
      await supabase.from('rooms').update({ status: 'OCCUPIED' }).eq('id', res.rooms.id);
      await loadDetail();
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleCancel = async () => {
    if (!res) return;
    if (!confirm(`Annuler la réservation ${res.number} ?`)) return;
    setLoading(true);
    try {
      await supabase.from('reservations').update({ status: 'CANCELLED' }).eq('id', res.id);
      if (res.rooms && res.rooms.status === 'RESERVED') {
        await supabase.from('rooms').update({ status: 'VACANT' }).eq('id', res.rooms.id);
      }
      await loadDetail();
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  if (!isOpen || !reservationId) return null;
  const nights = res ? Math.max(1, Math.ceil((new Date(res.check_out_date).getTime() - new Date(res.check_in_date).getTime()) / 86400000)) : 0;
  const cfg = statusLabels[res?.status] || statusLabels.CONFIRMED;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-indigo-900 to-purple-900 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-bold">Détail réservation {res?.number || ''}</h2>
              <p className="text-xs text-indigo-200">{res ? new Date(res.created_at).toLocaleDateString('fr-FR') : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg border border-red-200 text-sm">{error}</div>}
          {loading && !res && <div className="text-center py-8 text-slate-500">Chargement...</div>}

          {res && (
            <>
              {/* Statut */}
              <div className="flex items-center justify-between">
                <span className={`text-sm px-3 py-1 rounded-full border font-semibold ${cfg.color}`}>{cfg.icon} {cfg.label}</span>
                {res.is_vip && <span className="text-xs bg-purple-200 text-purple-900 px-2 py-1 rounded flex items-center gap-1"><Award className="w-3 h-3" /> VIP</span>}
              </div>

              {/* Client */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1"><User className="w-3 h-3" /> Client</h3>
                <div className="font-bold text-slate-900">{res.customers?.last_name} {res.customers?.first_name}</div>
                <div className="text-sm text-slate-600 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {res.customers?.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {res.customers.phone}</span>}
                  {res.customers?.id_number && <span>🪪 {res.customers.id_number}</span>}
                  {res.customers?.nationality && <span>🌍 {res.customers.nationality}</span>}
                </div>
              </div>

              {/* Séjour */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                  <h3 className="text-xs font-bold text-indigo-700 uppercase mb-2 flex items-center gap-1"><Calendar className="w-3 h-3" /> Dates</h3>
                  <div className="text-sm text-slate-700">Arrivée : <b>{new Date(res.check_in_date).toLocaleDateString('fr-FR')}</b></div>
                  <div className="text-sm text-slate-700">Départ : <b>{new Date(res.check_out_date).toLocaleDateString('fr-FR')}</b></div>
                  <div className="text-sm text-indigo-900 font-bold mt-1">{nights} nuit(s)</div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <h3 className="text-xs font-bold text-amber-700 uppercase mb-2 flex items-center gap-1"><Bed className="w-3 h-3" /> Chambre</h3>
                  {res.rooms ? (
                    <>
                      <div className="text-lg font-bold text-slate-900">Ch. {res.rooms.number}</div>
                      <div className="text-sm text-slate-600">{res.room_categories?.code} — {res.room_categories?.name}</div>
                      <div className="text-xs text-slate-500 mt-1">Étage {res.rooms.floor} • {res.rooms.status}</div>
                    </>
                  ) : (
                    <div className="text-sm text-slate-500 italic">Non assignée</div>
                  )}
                </div>
              </div>

              {/* Financier */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <h3 className="text-xs font-bold text-emerald-700 uppercase mb-2 flex items-center gap-1"><DollarSign className="w-3 h-3" /> Financier</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>Tarif/nuit : <b>{Number(res.nightly_rate).toLocaleString('fr-FR')} F</b></div>
                  <div>Acompte : <b>{Number(res.deposit || 0).toLocaleString('fr-FR')} F</b></div>
                  <div className="col-span-2 text-lg font-bold text-emerald-900">Total : {Number(res.total_amount).toLocaleString('fr-FR')} F</div>
                </div>
              </div>

              {/* Notes */}
              {res.notes && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-700">
                  <b>Notes :</b> {res.notes}
                </div>
              )}

              {/* Séjour lié */}
              {stay && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                  <div className="font-semibold text-blue-900 flex items-center gap-1"><LogIn className="w-4 h-4" /> Séjour actif</div>
                  <div className="text-blue-800 mt-1">Arrivé(e) le {new Date(stay.check_in_at).toLocaleDateString('fr-FR')} • Solde folio : <b>{Number(stay.folio_balance || 0).toLocaleString('fr-FR')} F</b></div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t border-slate-200">
                {res.status === 'CONFIRMED' && (
                  <button onClick={handleCheckIn} disabled={loading} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50">
                    <LogIn className="w-4 h-4" /> Effectuer le Check-in
                  </button>
                )}
                {(res.status === 'CONFIRMED' || res.status === 'CHECKED_IN') && (
                  <button onClick={handleCancel} disabled={loading} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50">
                    ❌ Annuler la réservation
                  </button>
                )}
                <button onClick={onClose} className="px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg">Fermer</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
