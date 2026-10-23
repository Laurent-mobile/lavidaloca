'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, LogIn, LogOut, Sparkles, User, Calendar, AlertTriangle, Bed, AlertCircle, Clock, FileText, Unlock } from 'lucide-react';
import CheckoutModal from './CheckoutModal';
import { addToOutbox } from '@/lib/outbox';
import FolioModal from './FolioModal'; // ✅ AJOUTÉ

interface Props {
  siteId: string;
  room: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function RoomActionModal({ siteId, room, isOpen, onClose, onSuccess }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isOnline, setIsOnline] = useState(true);
  const [currentStay, setCurrentStay] = useState<any>(null);
  const [pendingReservation, setPendingReservation] = useState<any>(null);
  const [showExtendForm, setShowExtendForm] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [extendNights, setExtendNights] = useState(1);
  const [extendNote, setExtendNote] = useState('');
  const [showFolio, setShowFolio] = useState(false); // ✅ AJOUTÉ

  useEffect(() => {
    if (isOpen && room) {
      setIsOnline(navigator.onLine);
      setError('');
      setCurrentStay(null);
      setPendingReservation(null);
      setShowExtendForm(false);
      setShowCheckout(false);
      setExtendNights(1);
      setExtendNote('');
      loadRoomData();
    }
  }, [isOpen, room]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadRoomData = async () => {
    if (!room) return;

    const { data: stay } = await supabase
      .from('stays')
      .select(`id, check_in_at, nightly_rate, folio_balance, status, customer_id, reservation_id, reservations (id, number, check_in_date, check_out_date)`)
      .eq('room_id', room.id)
      .eq('status', 'IN_HOUSE')
      .limit(1)
      .maybeSingle();

    if (stay) {
      const { data: customer } = await supabase
        .from('customers')
        .select('first_name, last_name, phone')
        .eq('id', stay.customer_id)
        .maybeSingle();
      setCurrentStay({ ...stay, customers: customer });
    }

    let { data: res } = await supabase
      .from('reservations')
      .select(`id, number, check_in_date, check_out_date, adults, children, nightly_rate, customer_id, status, room_categories (code, name)`)
      .eq('room_id', room.id)
      .eq('status', 'CONFIRMED')
      .order('check_in_date', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!res && room.room_categories?.id) {
      const today = new Date().toISOString().split('T')[0];
      const { data: resByCat } = await supabase
        .from('reservations')
        .select(`id, number, check_in_date, check_out_date, adults, children, nightly_rate, customer_id, status, room_categories (code, name)`)
        .eq('room_category_id', room.room_categories.id)
        .eq('status', 'CONFIRMED')
        .lte('check_in_date', today)
        .gt('check_out_date', today)
        .order('check_in_date', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (resByCat) res = resByCat;
    }

    if (res) {
      const { data: customer } = await supabase
        .from('customers')
        .select('first_name, last_name, phone')
        .eq('id', res.customer_id)
        .maybeSingle();
      setPendingReservation({ ...res, customers: customer });
    }
  };

  const handleCheckIn = async () => {
    if (!pendingReservation) {
      setError('Aucune réservation confirmée trouvée.');
      return;
    }

    if (!pendingReservation.customer_id) {
      setError(' Cette réservation n\'a pas de client associé. Impossible de faire le check-in.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (!isOnline) {
        await addToOutbox({ type: 'INSERT', table: 'stays', data: { reservation_id: pendingReservation.id, room_id: room.id, customer_id: pendingReservation.customer_id, check_in_at: new Date().toISOString(), nightly_rate: pendingReservation.nightly_rate, status: 'IN_HOUSE', folio_balance: pendingReservation.nightly_rate } });
        await addToOutbox({ type: 'UPDATE', table: 'rooms', data: { id: room.id, status: 'OCCUPIED' } });
        setLoading(false);
        onSuccess();
        onClose();
        return;
      }

      const { data: stay, error: stayError } = await supabase.from('stays').insert({ reservation_id: pendingReservation.id, room_id: room.id, customer_id: pendingReservation.customer_id, check_in_at: new Date().toISOString(), nightly_rate: pendingReservation.nightly_rate, status: 'IN_HOUSE', folio_balance: pendingReservation.nightly_rate }).select().single();

      if (stayError) throw new Error(`Séjour: ${stayError.message}`);
      if (!stay) throw new Error('Échec création séjour');

      const { error: roomError } = await supabase.from('rooms').update({ status: 'OCCUPIED' }).eq('id', room.id);
      if (roomError) { await supabase.from('stays').delete().eq('id', stay.id); throw new Error(`Chambre: ${roomError.message}`); }

      await supabase.from('reservations').update({ status: 'CHECKED_IN' }).eq('id', pendingReservation.id);

      setLoading(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(`Erreur: ${err.message}`);
      setLoading(false);
    }
  };

  // 🔓 FORCER LA LIBÉRATION (pour chambres OUT_OF_ORDER sans maintenance)
  const handleForceVacant = async () => {
    if (!confirm('⚠️ Cette chambre est marquée "Hors service" mais aucune maintenance active n\'est trouvée.\n\nVoulez-vous vraiment la forcer en statut "Libre" ?')) {
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      if (!isOnline) {
        await addToOutbox({ type: 'UPDATE', table: 'rooms', data: { id: room.id, status: 'VACANT', out_of_order_reason: null } });
        setLoading(false);
        onSuccess();
        onClose();
        return;
      }

      const { error } = await supabase
        .from('rooms')
        .update({ status: 'VACANT', out_of_order_reason: null })
        .eq('id', room.id);

      if (error) throw new Error(error.message);
      await new Promise(resolve => setTimeout(resolve, 300));
      setLoading(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(`Erreur: ${err.message}`);
      setLoading(false);
    }
  };

  const handleMakeClean = async () => {
    setLoading(true);
    try {
      if (!isOnline) {
        await addToOutbox({ type: 'UPDATE', table: 'rooms', data: { id: room.id, status: 'VACANT' } });
        setLoading(false);
        onSuccess();
        onClose();
        return;
      }
      await supabase.from('rooms').update({ status: 'VACANT' }).eq('id', room.id);
      setLoading(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(`Erreur: ${err.message}`);
      setLoading(false);
    }
  };

  const handleForceCheckOut = async () => {
    if (!confirm('Chambre marquée Occupée mais aucun séjour enregistré. Passer en "À nettoyer" ?')) return;
    setLoading(true);
    try {
      if (!isOnline) {
        await addToOutbox({ type: 'UPDATE', table: 'rooms', data: { id: room.id, status: 'DIRTY' } });
        setLoading(false);
        onSuccess();
        onClose();
        return;
      }
      await supabase.from('rooms').update({ status: 'DIRTY' }).eq('id', room.id);
      setLoading(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(`Erreur: ${err.message}`);
      setLoading(false);
    }
  };

  const handleForceOccupy = async () => {
    if (!currentStay) return;
    setLoading(true);
    try {
      if (!isOnline) {
        await addToOutbox({ type: 'UPDATE', table: 'rooms', data: { id: room.id, status: 'OCCUPIED' } });
        setLoading(false);
        onSuccess();
        onClose();
        return;
      }
      await supabase.from('rooms').update({ status: 'OCCUPIED' }).eq('id', room.id);
      setLoading(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(`Erreur: ${err.message}`);
      setLoading(false);
    }
  };

    const handleExtendStay = async () => {
    if (!currentStay || !currentStay.reservation_id) {
      setError('Aucun séjour actif à prolonger.');
      return;
    }
    if (extendNights < 1) {
      setError('Le nombre de nuits doit être au moins 1.');
      return;
    }
    setLoading(true);
    setError('');
    
    try {
      // ✅ CORRECTION : Utiliser maybeSingle() et vérifier si reservation existe
      const { data: reservation, error: resError } = await supabase
        .from('reservations')
        .select('check_out_date, nightly_rate, total_amount, notes')
        .eq('id', currentStay.reservation_id)
        .maybeSingle();

      if (resError || !reservation) {
        throw new Error('Impossible de récupérer les détails de la réservation.');
      }

      const currentCheckOut = new Date(reservation.check_out_date);
      const newCheckOut = new Date(currentCheckOut);
      newCheckOut.setDate(newCheckOut.getDate() + extendNights);
      const additionalAmount = extendNights * (reservation.nightly_rate || 0);

      if (!isOnline) {
        await addToOutbox({ 
          type: 'UPDATE', 
          table: 'reservations', 
          data: { 
            id: currentStay.reservation_id, 
            check_out_date: newCheckOut.toISOString().split('T')[0], 
            total_amount: (reservation.total_amount || 0) + additionalAmount 
          } 
        });
        await addToOutbox({ 
          type: 'UPDATE', 
          table: 'stays', 
          data: { 
            id: currentStay.id, 
            folio_balance: (currentStay.folio_balance || 0) + additionalAmount 
          } 
        });
        setLoading(false);
        onSuccess();
        onClose();
        return;
      }

      await supabase.from('reservations').update({ 
        check_out_date: newCheckOut.toISOString().split('T')[0], 
        total_amount: (reservation.total_amount || 0) + additionalAmount 
      }).eq('id', currentStay.reservation_id);
      
      await supabase.from('stays').update({ 
        folio_balance: (currentStay.folio_balance || 0) + additionalAmount 
      }).eq('id', currentStay.id);
      
      setLoading(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(`Erreur: ${err.message}`);
      setLoading(false);
    }
  };

  if (!isOpen || !room) return null;

  const statusLabels: Record<string, string> = {
    VACANT: 'Libre', RESERVED: 'Réservée', OCCUPIED: 'Occupée',
    DIRTY: 'À nettoyer', OUT_OF_ORDER: 'Hors service',
  };

  const isInconsistent = 
    (room.status === 'OCCUPIED' && !currentStay) ||
    (room.status === 'VACANT' && currentStay) ||
    (room.status === 'RESERVED' && currentStay);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-indigo-900 to-purple-900 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0">
          <div>
            <h2 className="text-xl font-bold">Chambre {room.number}</h2>
            <p className="text-xs text-indigo-200">{room.room_categories?.code} — {statusLabels[room.status] || room.status}</p>
          </div>
          <div className="flex items-center gap-2">
            {!isOnline && <span className="bg-red-500 text-white text-xs px-2 py-1 rounded font-medium">📴 Hors ligne</span>}
            <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg border border-red-200 text-sm flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /><span>{error}</span></div>}

          {!isOnline && <div className="bg-amber-50 text-amber-900 p-3 rounded-lg border border-amber-200 text-sm">⚠️ Mode hors-ligne. Les actions seront synchronisées automatiquement.</div>}

          {isInconsistent && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-700 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-900">
                <strong>Incohérence :</strong>
                {room.status === 'OCCUPIED' && !currentStay && " Chambre Occupée mais aucun séjour."}
                {room.status === 'VACANT' && currentStay && " Séjour actif mais chambre Libre."}
                {room.status === 'RESERVED' && currentStay && " Séjour actif mais chambre Réservée."}
              </div>
            </div>
          )}

          {currentStay && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2"><User className="w-4 h-4 text-blue-700" /><span className="font-semibold text-blue-900">Séjour en cours</span></div>
                <div className="flex gap-1 flex-wrap">
  {/* ✅ NOUVEAU : Bouton Voir le folio */}
  <button 
    onClick={() => setShowFolio(true)} 
    className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-2 py-1 rounded font-medium"
  >
    <FileText className="w-3 h-3" /> Voir le folio
  </button>
  
  <button 
    onClick={() => setShowExtendForm(!showExtendForm)} 
    className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 rounded font-medium"
  >
    <Clock className="w-3 h-3" /> Prolonger
  </button>
  
  <button 
    onClick={() => setShowCheckout(true)} 
    className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-2 py-1 rounded font-medium"
  >
    <FileText className="w-3 h-3" /> Check-out
  </button>
</div>
              </div>
              <div className="text-sm space-y-1">
                <p><strong>Client :</strong> {currentStay.customers?.last_name || 'Inconnu'} {currentStay.customers?.first_name || ''}</p>
                {currentStay.reservations && <p><strong>Réservation :</strong> {currentStay.reservations.number}</p>}
                <p><strong>Arrivée :</strong> {new Date(currentStay.check_in_at).toLocaleDateString('fr-FR')}</p>
                {currentStay.reservations?.check_out_date && <p><strong>Départ prévu :</strong> {new Date(currentStay.reservations.check_out_date).toLocaleDateString('fr-FR')}</p>}
                <p><strong>Tarif/nuit :</strong> {Number(currentStay.nightly_rate).toLocaleString('fr-FR')} F</p>
                <p className="font-bold text-blue-900"><strong>Solde folio :</strong> {Number(currentStay.folio_balance || 0).toLocaleString('fr-FR')} F</p>
              </div>

              {showExtendForm && (
                <div className="mt-3 pt-3 border-t border-blue-200 bg-white rounded p-3 space-y-2">
                  <h4 className="font-semibold text-sm text-slate-800 flex items-center gap-1"><Clock className="w-4 h-4 text-blue-600" /> Prolonger le séjour</h4>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-600">Nuits supplémentaires :</label>
                    <input type="number" min="1" max="30" value={extendNights} onChange={(e) => setExtendNights(Number(e.target.value))} className="w-16 border border-slate-300 rounded px-2 py-1 text-sm" />
                    <span className="text-xs text-slate-600">= <strong className="text-blue-700">{Number(extendNights * currentStay.nightly_rate).toLocaleString('fr-FR')} F</strong></span>
                  </div>
                  <input type="text" value={extendNote} onChange={(e) => setExtendNote(e.target.value)} placeholder="Motif (optionnel)..." className="w-full border border-slate-300 rounded px-2 py-1 text-xs" />
                  <div className="flex gap-2">
                    <button onClick={handleExtendStay} disabled={loading || extendNights < 1} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-1.5 rounded disabled:opacity-50">{loading ? '...' : '✅ Confirmer la prolongation'}</button>
                    <button onClick={() => setShowExtendForm(false)} className="px-3 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold py-1.5 rounded">Annuler</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {pendingReservation && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2"><Calendar className="w-4 h-4 text-amber-700" /><span className="font-semibold text-amber-900">Réservation confirmée</span></div>
              <div className="text-sm space-y-1">
                <p><strong>N° :</strong> {pendingReservation.number}</p>
                <p><strong>Client :</strong> {pendingReservation.customers?.last_name || 'Inconnu'} {pendingReservation.customers?.first_name || ''}</p>
                <p><strong>Arrivée :</strong> {pendingReservation.check_in_date}</p>
                <p><strong>Départ :</strong> {pendingReservation.check_out_date}</p>
                <p><strong>Tarif :</strong> {Number(pendingReservation.nightly_rate).toLocaleString('fr-FR')} F/nuit</p>
              </div>
            </div>
          )}

          <div className="space-y-2 pt-2">
            {currentStay && (
              <button onClick={() => setShowCheckout(true)} disabled={loading} className="w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 rounded-lg disabled:opacity-50">
                <LogOut className="w-5 h-5" /> Effectuer le Check-out
              </button>
            )}

            {!currentStay && pendingReservation && (room.status === 'VACANT' || room.status === 'RESERVED') && (
              <button onClick={handleCheckIn} disabled={loading} className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-lg disabled:opacity-50">
                <LogIn className="w-5 h-5" /> Effectuer le Check-in
              </button>
            )}

            {room.status === 'OCCUPIED' && !currentStay && (
              <button onClick={handleForceCheckOut} disabled={loading} className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg disabled:opacity-50">
                <AlertTriangle className="w-5 h-5" /> ⚠️ Check-out forcé
              </button>
            )}

            {(room.status === 'VACANT' || room.status === 'RESERVED') && currentStay && (
              <button onClick={handleForceOccupy} disabled={loading} className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg disabled:opacity-50">
                <AlertCircle className="w-5 h-5" />  Synchroniser : marquer Occupée
              </button>
            )}

            {room.status === 'DIRTY' && (
              <button onClick={handleMakeClean} disabled={loading} className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg disabled:opacity-50">
                <Sparkles className="w-5 h-5" /> ✨ Marquer comme propre
              </button>
            )}

            {/* 🔓 NOUVEAU : Bouton Forcer la libération pour OUT_OF_ORDER */}
            {room.status === 'OUT_OF_ORDER' && (
              <div className="space-y-3">
                <div className="text-center text-red-600 py-3 bg-red-50 rounded-lg border border-red-200">
                  <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
                  <p className="font-bold">Chambre hors service</p>
                  {room.out_of_order_reason && (
                    <p className="text-xs mt-1 text-red-800 bg-red-100 inline-block px-2 py-1 rounded">
                      Motif : {room.out_of_order_reason}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 mt-2">
                    Aucune demande de maintenance active n'est associée à cette chambre.
                  </p>
                </div>
                
                <button 
                  onClick={handleForceVacant} 
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-800 text-white font-semibold py-3 rounded-lg disabled:opacity-50 transition-colors"
                >
                  <Unlock className="w-5 h-5" />
                  {loading ? 'Traitement...' : ' Forcer la libération (Marquer Libre)'}
                </button>
              </div>
            )}

            {room.status === 'VACANT' && !pendingReservation && !currentStay && (
              <div className="text-center text-slate-500 py-4 bg-slate-50 rounded-lg">
                <Bed className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p>Chambre libre sans réservation en attente.</p>
              </div>
            )}
          </div>

          <button onClick={onClose} className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2 rounded-lg">Fermer</button>
        </div>
      </div>

      {showCheckout && currentStay && (
        <CheckoutModal
          siteId={siteId}
          stay={currentStay}
          isOpen={showCheckout}
          onClose={() => setShowCheckout(false)}
          onSuccess={() => { setShowCheckout(false); onSuccess(); onClose(); }}
        />
      )}
      {/* ✅ NOUVEAU : Modal de visualisation du folio (sans check-out) */}
{showFolio && currentStay && (
  <FolioModal
    siteId={siteId}
    stay={currentStay}
    isOpen={showFolio}
    onClose={() => setShowFolio(false)}
  />
)}
    </div>
  );
}
