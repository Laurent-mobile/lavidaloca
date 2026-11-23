'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, User, Calendar, Bed, FileText, UserPlus, ArrowLeft, Award, LogIn, AlertCircle, AlertTriangle } from 'lucide-react';
import CustomerHistoryModal from './CustomerHistoryModal';
import { addToOutbox } from '@/lib/outbox';

interface Props {
  siteId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preselectRoomId?: string;
  editingReservation?: any; // ✅ NOUVEAU : Pour la modification
}

type Mode = 'RESERVATION' | 'WALK_IN';

// ✅ Helper pour formater les dates en français
const formatDateFr = (dateString: string) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
};

export default function ReservationModal({ siteId, isOpen, onClose, onSuccess, preselectRoomId, editingReservation }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isOnline, setIsOnline] = useState(true);
  const [mode, setMode] = useState<Mode>('RESERVATION');
  const [customers, setCustomers] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [showCustomerHistory, setShowCustomerHistory] = useState(false);
  const [lockedRoom, setLockedRoom] = useState<any>(null);
  const [roomReservations, setRoomReservations] = useState<any[]>([]);
  const [conflictReservation, setConflictReservation] = useState<any>(null);
  const [resolutionAction, setResolutionAction] = useState<'CHANGE_ROOM' | 'CANCEL_EXISTING'>('CHANGE_ROOM');
  const [resolutionMotif, setResolutionMotif] = useState('');

  const [form, setForm] = useState({
    customer_id: '', room_category_id: '', room_id: '',
    check_in_date: '', check_out_date: '',
    adults: 1, children: 0, nightly_rate: 0, deposit: 0, notes: '',
  });

  const [newCustomer, setNewCustomer] = useState({
    type: 'IND', first_name: '', last_name: '', id_type: 'CNIB', id_number: '', phone: '', nationality: 'BF',
  });

  useEffect(() => {
    if (isOpen) {
      setIsOnline(navigator.onLine);
      loadData();
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      
      // ✅ Réinitialisation ou Pré-remplissage pour modification
      if (editingReservation) {
  setMode('RESERVATION');
  setForm({
    customer_id: editingReservation.customer_id || '',
    room_category_id: editingReservation.room_category_id || '',
    room_id: editingReservation.room_id || '',
    check_in_date: editingReservation.check_in_date || today,
    check_out_date: editingReservation.check_out_date || tomorrow,
    adults: editingReservation.adults || 1,
    children: editingReservation.children || 0,
    nightly_rate: editingReservation.nightly_rate || 0,
    deposit: editingReservation.deposit || 0,
    notes: editingReservation.notes || '',
  });
  if (editingReservation.room_id) {
    hydrateRoom(editingReservation.room_id);
  }
} else {
        setForm(prev => ({ ...prev, check_in_date: today, check_out_date: tomorrow }));
        setMode('RESERVATION');
        setLockedRoom(null);
        setConflictReservation(null);
        setResolutionMotif('');
        if (preselectRoomId) hydrateRoom(preselectRoomId);
      }
    }
  }, [isOpen, preselectRoomId, editingReservation]);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const hydrateRoom = async (roomId: string) => {
    try {
      const { data } = await supabase
        .from('rooms')
        .select('id, number, status, category_id, room_categories(id, code, name, base_price)')
        .eq('id', roomId)
        .maybeSingle();
      if (data) {
        const cat = Array.isArray(data.room_categories) ? data.room_categories[0] : data.room_categories;
        setLockedRoom({ id: data.id, number: data.number, category: cat?.name, code: cat?.code });
        setForm(prev => ({
          ...prev,
          room_id: data.id,
          room_category_id: cat?.id || '',
          nightly_rate: cat?.base_price || 0,
        }));
      }
    } catch (err) {
      console.error('Erreur pré-sélection chambre:', err);
    }
  };

  const loadRoomReservations = async (roomId: string) => {
    if (!roomId) { setRoomReservations([]); return; }
    const { data } = await supabase
      .from('reservations')
      .select('id, number, check_in_date, check_out_date, status, customers(last_name, first_name)')
      .eq('site_id', siteId)
      .eq('room_id', roomId)
      .in('status', ['CONFIRMED', 'CHECKED_IN'])
      // ✅ Exclure la réservation en cours de modification pour éviter un faux conflit
      .neq('id', editingReservation?.id || 'none') 
      .order('check_in_date', { ascending: true });
    setRoomReservations((data || []).map(r => ({
      ...r,
      customers: Array.isArray(r.customers) ? r.customers[0] : r.customers,
    })));
  };

  const loadData = async () => {
    const isOffline = !navigator.onLine;
    try {
      const { data: cust } = await supabase.from('customers').select('id, first_name, last_name, is_vip').eq('site_id', siteId).order('last_name');
      if (cust) {
        setCustomers(cust);
        const { setCache } = await import('@/lib/localCache');
        setCache('customers', cust);
      }
    } catch (err) { console.error('Erreur chargement clients:', err); }
    if (isOffline) {
      const { getCache } = await import('@/lib/localCache');
      const c = getCache<any[]>('customers');
      if (c?.length) setCustomers(c);
      else setError('⚠️ Mode hors-ligne. Aucun client en cache. Utilisez "Nouveau".');
    }
    try {
      const { data: cat } = await supabase.from('room_categories').select('id, code, name, base_price').eq('site_id', siteId).order('code');
      if (cat) {
        setCategories(cat);
        const { setCache } = await import('@/lib/localCache');
        setCache('categories', cat);
      }
    } catch (err) { console.error('Erreur chargement catégories:', err); }
    if (isOffline) {
      const { getCache } = await import('@/lib/localCache');
      const cc = getCache<any[]>('categories');
      if (cc?.length) setCategories(cc);
      else setError('⚠️ Mode hors-ligne. Aucune catégorie en cache.');
    }
  };

  useEffect(() => {
    if (form.room_category_id) loadRooms(form.room_category_id);
    else setRooms([]);
  }, [form.room_category_id]);

  useEffect(() => {
    if (form.room_id) loadRoomReservations(form.room_id);
    else setRoomReservations([]);
  }, [form.room_id]);

  const loadRooms = async (categoryId: string) => {
    const isOffline = !navigator.onLine;
    if (isOffline) {
      const { getCache } = await import('@/lib/localCache');
      const cached = getCache<any[]>(`rooms_${categoryId}`);
      setRooms(cached || []);
      return;
    }
    try {
      const { data } = await supabase
        .from('rooms')
        .select('id, number, status, category_id')
        .eq('site_id', siteId)
        .eq('category_id', categoryId)
        .in('status', ['VACANT', 'RESERVED', 'OCCUPIED']) // ✅ Autoriser la sélection de la chambre actuelle même si occupée
        .order('number');
      if (data) {
        setRooms(data);
        const { setCache } = await import('@/lib/localCache');
        setCache(`rooms_${categoryId}`, data);
      } else setRooms([]);
    } catch (err) { console.error('Erreur chargement chambres:', err); setRooms([]); }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    if (!newCustomer.last_name.trim()) { setError('Le nom est obligatoire.'); setLoading(false); return; }
    if (!newCustomer.id_number?.trim()) { setError('🪪 Le numéro de pièce (CNIB) est OBLIGATOIRE.'); setLoading(false); return; }
    if (newCustomer.id_number.trim().length < 5) { setError('Le numéro doit contenir au moins 5 caractères.'); setLoading(false); return; }

    if (!isOnline) {
      try {
        const { createClientOffline } = await import('@/lib/localCache');
        const newId = await createClientOffline(siteId, { ...newCustomer, id_type: newCustomer.id_type || 'CNIB' });
        setCustomers(prev => [...prev, { id: newId, ...newCustomer, is_vip: false }]);
        setForm(prev => ({ ...prev, customer_id: newId }));
        setShowNewCustomerForm(false);
        resetNewCustomer();
        setLoading(false);
        return;
      } catch (err: any) { setError(`Erreur hors-ligne: ${err.message}`); setLoading(false); return; }
    }

    const { data: customer, error } = await supabase.from('customers').insert({
      site_id: siteId, type: newCustomer.type, first_name: newCustomer.first_name, last_name: newCustomer.last_name,
      id_number: newCustomer.id_number.trim(), id_type: newCustomer.id_type || 'CNIB', phone: newCustomer.phone, nationality: newCustomer.nationality,
    }).select().single();

    if (error) { setError(`Erreur: ${error.message}`); setLoading(false); return; }
    setCustomers(prev => [...prev, customer]);
    setForm(prev => ({ ...prev, customer_id: customer.id }));
    setShowNewCustomerForm(false);
    resetNewCustomer();
    setLoading(false);
  };

  const resetNewCustomer = () => setNewCustomer({ type: 'IND', first_name: '', last_name: '', id_type: 'CNIB', id_number: '', phone: '', nationality: 'BF' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!form.customer_id || !form.room_category_id || !form.check_in_date) {
      setError('Veuillez remplir client, catégorie et date d\'arrivée.'); setLoading(false); return;
    }
    const isWalkIn = mode === 'WALK_IN' && !editingReservation; // Pas de walk-in en mode modification
    if (!isWalkIn && !form.check_out_date) { setError('Date de départ obligatoire.'); setLoading(false); return; }
    if (!isWalkIn && new Date(form.check_out_date) <= new Date(form.check_in_date)) {
      setError('La date de départ doit être postérieure à l\'arrivée.'); setLoading(false); return;
    }

    let roomId = form.room_id;
    let roomNumber = lockedRoom?.number || '';
    if (!roomId) {
      const { data: availableRoom } = await supabase.from('rooms')
        .select('id, number').eq('site_id', siteId).eq('category_id', form.room_category_id)
        .eq('status', 'VACANT').order('number').limit(1).maybeSingle();
      if (!availableRoom) { setError('Aucune chambre libre dans cette catégorie.'); setLoading(false); return; }
      roomId = availableRoom.id; roomNumber = availableRoom.number;
    }

    // 1. VÉRIFICATION DU CONFLIT
    const { data: existingRes } = await supabase.from('reservations')
      .select('id, number, room_id, check_in_date, check_out_date, status, customer_id, customers(last_name, first_name), notes')
      .eq('site_id', siteId)
      .eq('room_id', roomId)
      .in('status', ['CONFIRMED', 'CHECKED_IN'])
      .lte('check_in_date', isWalkIn ? form.check_in_date : form.check_out_date)
      .gte('check_out_date', form.check_in_date)
      .neq('id', editingReservation?.id || 'none') // ✅ Exclut la réservation en cours de modif
      .maybeSingle();

    const newIn = form.check_in_date;
    const newOut = isWalkIn ? form.check_in_date : form.check_out_date;

    const hasConflict = existingRes && (
      (existingRes.check_in_date < newOut && existingRes.check_out_date > newIn) ||
      (existingRes.check_out_date === newIn || existingRes.check_in_date === newOut)
    );

    let conflictMotifText = '';

    if (hasConflict) {
      setConflictReservation(existingRes);
      if (!resolutionMotif.trim()) {
        setError('⚠️ Conflit détecté. Veuillez choisir une action de résolution et fournir un motif obligatoire.');
        setLoading(false);
        return;
      }

      conflictMotifText = `RÉSOLU CONFLIT : ${resolutionMotif} (Nouvelle résa: ${isWalkIn ? 'Walk-in' : `${formatDateFr(newIn)} au ${formatDateFr(newOut)}`})`;

      if (resolutionAction === 'CANCEL_EXISTING') {
        const { error: cancelErr } = await supabase.from('reservations').update({
          status: 'CANCELLED',
          notes: `${existingRes.notes ? existingRes.notes + ' | ' : ''}${conflictMotifText}`
        }).eq('id', existingRes.id);
        if (cancelErr) { setError(`Erreur annulation ancienne réservation: ${cancelErr.message}`); setLoading(false); return; }
      } else if (resolutionAction === 'CHANGE_ROOM') {
        if (roomId === existingRes.room_id) {
          setError('Vous avez choisi "Changer de chambre", mais la chambre sélectionnée est la même. Veuillez en sélectionner une autre.');
          setLoading(false);
          return;
        }
      }
    } else {
      setConflictReservation(null);
      setResolutionMotif('');
    }

    // 2. CRÉATION OU MODIFICATION
    const nights = isWalkIn ? 1 : Math.ceil((new Date(form.check_out_date).getTime() - new Date(form.check_in_date).getTime()) / 86400000);
    const total = nights * form.nightly_rate;
    const { data: { user } } = await supabase.auth.getUser();
    const reservationNumber = editingReservation?.number || `RES-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`;

    const reservationData = {
      site_id: siteId, number: reservationNumber, customer_id: form.customer_id,
      room_category_id: form.room_category_id, room_id: roomId,
      check_in_date: form.check_in_date, check_out_date: isWalkIn ? form.check_in_date : form.check_out_date,
      adults: form.adults, children: form.children, nightly_rate: form.nightly_rate,
      total_amount: total, deposit: form.deposit,
      status: isWalkIn ? 'CHECKED_IN' : (editingReservation?.status || 'CONFIRMED'),
      notes: form.notes ? (conflictMotifText ? `${form.notes} | ${conflictMotifText}` : form.notes) : conflictMotifText,
    };

    // ===== HORS-LIGNE =====
    if (!isOnline) {
      try {
        if (editingReservation) {
          await addToOutbox({ type: 'UPDATE', table: 'reservations', data: { ...reservationData, id: editingReservation.id } });
        } else {
          await addToOutbox({ type: 'INSERT', table: 'reservations', data: reservationData });
          const newRoomStatus = isWalkIn ? 'OCCUPIED' : (form.check_in_date <= new Date().toISOString().split('T')[0] ? 'RESERVED' : null);
          if (newRoomStatus) await addToOutbox({ type: 'UPDATE', table: 'rooms', data: { id: roomId, status: newRoomStatus } });
          if (isWalkIn) {
             await addToOutbox({ type: 'INSERT', table: 'stays', data: { room_id: roomId, customer_id: form.customer_id, check_in_at: new Date().toISOString(), status: 'IN_HOUSE', folio_balance: 0, nightly_rate: form.nightly_rate } });
          }
        }
        setLoading(false); onSuccess(); onClose(); return;
      } catch (err: any) { setError(`Erreur hors-ligne: ${err.message}`); setLoading(false); return; }
    }

    // ===== EN LIGNE =====
    if (editingReservation) {
      // ✅ MODE MODIFICATION
      const { error: updateError } = await supabase.from('reservations').update(reservationData).eq('id', editingReservation.id);
      if (updateError) { setError(`Erreur modification: ${updateError.message}`); setLoading(false); return; }
      alert(`✅ Réservation ${reservationNumber} modifiée avec succès !`);
    } else {
      // ✅ MODE CRÉATION
      const { data: createdRes, error: resError } = await supabase.from('reservations').insert(reservationData).select('id').single();
      if (resError) { setError(`Erreur réservation: ${resError.message}`); setLoading(false); return; }

      if (isWalkIn) {
        const { error: stayErr } = await supabase.from('stays').insert({
          room_id: roomId, customer_id: form.customer_id, reservation_id: createdRes.id,
          check_in_at: new Date().toISOString(), status: 'IN_HOUSE', folio_balance: 0, nightly_rate: form.nightly_rate,
        });
        if (stayErr) { setError(`Réservation créée mais check-in échoué: ${stayErr.message}`); setLoading(false); return; }
        await supabase.from('rooms').update({ status: 'OCCUPIED' }).eq('id', roomId);
        alert(`✅ Check-in direct effectué !\nChambre ${roomNumber} occupée.`);
      } else if (form.check_in_date <= new Date().toISOString().split('T')[0]) {
        await supabase.from('rooms').update({ status: 'RESERVED' }).eq('id', roomId);
        alert(`✅ Réservation ${reservationNumber} créée — chambre ${roomNumber} marquée Réservée.`);
      } else {
        alert(`✅ Réservation ${reservationNumber} enregistrée pour le ${formatDateFr(form.check_in_date)}.\nLa chambre ${roomNumber} reste Libre jusqu'à l'arrivée.`);
      }
    }

    await new Promise(r => setTimeout(r, 400));
    setLoading(false); onSuccess(); onClose();
  };

  if (!isOpen) return null;

  const isEditMode = !!editingReservation;
  const isWalkIn = mode === 'WALK_IN' && !editingReservation; 

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-indigo-900 to-purple-900 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6" />
            <h2 className="text-xl font-bold">{isEditMode ? 'Modifier la Réservation' : (mode === 'WALK_IN' ? 'Check-in direct (Walk-in)' : 'Nouvelle Réservation')}</h2>
          </div>
          <div className="flex items-center gap-2">
            {!isOnline && <span className="bg-red-500 text-white text-xs px-2 py-1 rounded font-medium">Hors ligne</span>}
            <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {!isEditMode && (
          <div className="px-6 pt-4">
            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-lg">
              <button type="button" onClick={() => setMode('RESERVATION')}
                className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-semibold transition ${mode === 'RESERVATION' ? 'bg-indigo-600 text-white shadow' : 'text-slate-600'}`}>
                <Calendar className="w-4 h-4" /> Réservation
              </button>
              <button type="button" onClick={() => setMode('WALK_IN')}
                className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-semibold transition ${mode === 'WALK_IN' ? 'bg-emerald-600 text-white shadow' : 'text-slate-600'}`}>
                <LogIn className="w-4 h-4" /> Check-in direct
              </button>
            </div>
            {mode === 'WALK_IN' && (
              <p className="text-xs text-emerald-700 mt-2 flex items-center gap-1">
                <LogIn className="w-3 h-3" /> Le client sera hébergé immédiatement : chambre passée en <b>Occupée</b> et séjour créé.
              </p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-lg border border-red-200 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {conflictReservation && (
            <div className="bg-amber-50 border-2 border-amber-400 rounded-lg p-4 space-y-4">
              <div className="flex items-center gap-2 text-amber-900 font-bold">
                <AlertTriangle className="w-5 h-5" /> Conflit de réservation détecté
              </div>
              <div className="bg-white p-3 rounded border border-amber-200 text-sm text-slate-800 space-y-1">
                <p><strong>Réservation en conflit :</strong> {conflictReservation.number}</p>
                <p><strong>Client :</strong> {conflictReservation.customers?.last_name || ''} {conflictReservation.customers?.first_name || ''}</p>
                <p><strong>Période :</strong> {formatDateFr(conflictReservation.check_in_date)} au {formatDateFr(conflictReservation.check_out_date)}</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1">Action de résolution *</label>
                <select
                  value={resolutionAction}
                  onChange={(e) => setResolutionAction(e.target.value as any)}
                  className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-amber-500"
                >
                  <option value="CHANGE_ROOM">🔄 Changer de chambre pour cette nouvelle réservation</option>
                  <option value="CANCEL_EXISTING">❌ Annuler la réservation existante (libérer la chambre)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1">Motif de la modification / résolution *</label>
                <textarea
                  value={resolutionMotif}
                  onChange={(e) => setResolutionMotif(e.target.value)}
                  className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500"
                  rows={3}
                  placeholder="Ex: Le client de la réservation existante a reporté son séjour..."
                  required
                />
                <p className="text-[10px] text-amber-700 mt-1">💡 Ce motif sera enregistré dans l'historique des deux réservations pour traçabilité.</p>
              </div>
            </div>
          )}

          {lockedRoom && (
            <div className="bg-indigo-50 border-2 border-indigo-300 rounded-lg p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bed className="w-5 h-5 text-indigo-700" />
                <div>
                  <div className="text-sm font-bold text-indigo-900">Chambre {lockedRoom.number} présélectionnée</div>
                  <div className="text-xs text-indigo-700">{lockedRoom.code} — {lockedRoom.category}</div>
                </div>
              </div>
              <button type="button" onClick={() => { setLockedRoom(null); setForm(p => ({ ...p, room_id: '', room_category_id: '', nightly_rate: 0 })); }}
                className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Changer</button>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1"><User className="w-4 h-4 inline mr-1" />Client *</label>
            {!showNewCustomerForm ? (
              <div className="flex gap-2">
                <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" required>
                  <option value="">-- Sélectionner un client --</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.last_name} {c.first_name} {c.is_vip ? '⭐' : ''}</option>)}
                </select>
                <button type="button" onClick={() => setShowNewCustomerForm(true)} className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-sm font-medium"><UserPlus className="w-4 h-4" />Nouveau</button>
                {form.customer_id && (
                  <button type="button" onClick={() => setShowCustomerHistory(true)} className="flex items-center gap-1 bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg text-sm font-medium"><Award className="w-4 h-4" />Historique</button>
                )}
              </div>
            ) : (
              <div className="border border-indigo-200 rounded-lg p-3 bg-indigo-50 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-indigo-900 text-sm">Nouveau client</h3>
                  <button type="button" onClick={() => setShowNewCustomerForm(false)} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"><ArrowLeft className="w-3 h-3" /> Retour à la liste</button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-medium text-slate-700 mb-1">Type</label>
                    <select value={newCustomer.type} onChange={(e) => setNewCustomer({ ...newCustomer, type: e.target.value })} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"><option value="IND">Individuel</option><option value="ENT">Entreprise</option></select></div>
                  <div><label className="block text-xs font-medium text-slate-700 mb-1">Nationalité</label>
                    <input type="text" value={newCustomer.nationality} onChange={(e) => setNewCustomer({ ...newCustomer, nationality: e.target.value })} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" placeholder="BF" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-medium text-slate-700 mb-1">Nom * <span className="text-red-600">(obligatoire)</span></label>
                    <input type="text" value={newCustomer.last_name} onChange={(e) => setNewCustomer({ ...newCustomer, last_name: e.target.value })} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" required /></div>
                  <div><label className="block text-xs font-medium text-slate-700 mb-1">Prénom</label>
                    <input type="text" value={newCustomer.first_name} onChange={(e) => setNewCustomer({ ...newCustomer, first_name: e.target.value })} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-medium text-slate-700 mb-1">Téléphone</label>
                    <input type="tel" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" placeholder="+226 ..." /></div>
                  <div><label className="block text-xs font-medium text-slate-700 mb-1">Type de pièce *</label>
                    <select value={newCustomer.id_type || 'CNIB'} onChange={(e) => setNewCustomer({ ...newCustomer, id_type: e.target.value })} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"><option value="CNIB">CNIB</option><option value="PASSEPORT">Passeport</option><option value="PERMIS">Permis</option><option value="AUTRE">Autre</option></select></div>
                </div>
                <div><label className="block text-xs font-medium text-slate-700 mb-1">N° Pièce d'identité * <span className="text-red-600">(CNIB obligatoire)</span></label>
                  <input type="text" value={newCustomer.id_number} onChange={(e) => setNewCustomer({ ...newCustomer, id_number: e.target.value })} className="w-full border-2 border-slate-300 rounded px-2 py-1.5 text-sm font-semibold" placeholder="Ex: B1234567" required />
                  <p className="text-[10px] text-slate-500 mt-1">💡 La CNIB est obligatoire pour l'enregistrement de tout client</p></div>
                <button type="button" onClick={handleCreateCustomer} disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-50">{loading ? 'Création...' : '✅ Créer et sélectionner ce client'}</button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1"><Bed className="w-4 h-4 inline mr-1" />Catégorie *</label>
              <select value={form.room_category_id} onChange={(e) => { const cat = categories.find(c => c.id === e.target.value); setForm({ ...form, room_category_id: e.target.value, room_id: '', nightly_rate: cat?.base_price || 0 }); setLockedRoom(null); }}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" required>
                <option value="">-- Catégorie --</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.code} - {c.name} ({Number(c.base_price).toLocaleString('fr-FR')} F)</option>)}
              </select></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Chambre {isWalkIn ? '*' : '(auto si vide)'}</label>
              <select value={form.room_id} onChange={(e) => setForm({ ...form, room_id: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500">
                <option value="">-- Attribution automatique --</option>
                {rooms.map(r => <option key={r.id} value={r.id}>{r.number} ({r.status === 'VACANT' ? 'Libre' : r.status === 'RESERVED' ? 'Réservée' : 'Occupée'})</option>)}
              </select></div>
            {form.room_id && roomReservations.length > 0 && (
              <div className="col-span-2 bg-amber-50 border border-amber-300 rounded-lg p-3">
                <div className="text-xs font-bold text-amber-900 mb-2 flex items-center gap-1">📌 Autres réservations sur cette chambre ({roomReservations.length})</div>
                <div className="space-y-1">
                  {roomReservations.map(r => (
                    <div key={r.id} className="text-xs text-amber-800 flex justify-between">
                      <span className="font-medium">{r.number}</span>
                      <span>{r.customers?.last_name} {r.customers?.first_name}</span>
                      <span className="font-semibold">{formatDateFr(r.check_in_date)} → {formatDateFr(r.check_out_date)}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-amber-700 mt-2">💡 Vérifiez qu'il n'y a pas de chevauchement avec votre nouvelle période.</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1"><Calendar className="w-4 h-4 inline mr-1" />Arrivée *</label>
              <input type="date" value={form.check_in_date} onChange={(e) => setForm({ ...form, check_in_date: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" required /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1"><Calendar className="w-4 h-4 inline mr-1" />Départ {isWalkIn ? '' : '*'}</label>
              <input type="date" value={form.check_out_date} onChange={(e) => setForm({ ...form, check_out_date: e.target.value })} disabled={isWalkIn} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-400" required={!isWalkIn} /></div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Adultes</label><input type="number" min="1" max="10" value={form.adults} onChange={(e) => setForm({ ...form, adults: Number(e.target.value) })} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Enfants</label><input type="number" min="0" max="10" value={form.children} onChange={(e) => setForm({ ...form, children: Number(e.target.value) })} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" /></div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Tarif nuit (FCFA) *</label><input type="number" min="0" value={form.nightly_rate} onChange={(e) => setForm({ ...form, nightly_rate: Number(e.target.value) })} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" required /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Acompte (FCFA)</label><input type="number" min="0" value={form.deposit} onChange={(e) => setForm({ ...form, deposit: Number(e.target.value) })} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" /></div>
          </div>

          {form.check_in_date && form.nightly_rate > 0 && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
              <div className="flex justify-between text-sm"><span className="text-slate-700">{isWalkIn ? 'Nuit en cours :' : 'Nombre de nuits :'}</span><span className="font-bold">{isWalkIn ? 1 : Math.ceil((new Date(form.check_out_date).getTime() - new Date(form.check_in_date).getTime()) / 86400000)}</span></div>
              <div className="flex justify-between text-sm mt-1"><span className="text-slate-700">Total estimé :</span><span className="font-bold text-indigo-900">{Number((isWalkIn ? 1 : Math.ceil((new Date(form.check_out_date).getTime() - new Date(form.check_in_date).getTime()) / 86400000)) * form.nightly_rate).toLocaleString('fr-FR')} FCFA</span></div>
            </div>
          )}

          <div><label className="block text-sm font-medium text-slate-700 mb-1">Notes</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" placeholder="Demandes spéciales..." /></div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg">Annuler</button>
            <button type="submit" disabled={loading} className={`flex-1 font-semibold py-2.5 rounded-lg disabled:opacity-50 text-white flex items-center justify-center gap-2 ${isWalkIn ? 'bg-emerald-600 hover:bg-emerald-700' : isOnline ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-amber-600 hover:bg-amber-700'}`}>
              {loading ? 'Enregistrement...' : isEditMode ? <><FileText className="w-4 h-4" /> Enregistrer les modifications</> : isWalkIn ? <><LogIn className="w-4 h-4" /> Check-in direct</> : <><FileText className="w-4 h-4" /> Confirmer la réservation</>}
            </button>
          </div>
        </form>
      </div>

      {showCustomerHistory && form.customer_id && (
        <CustomerHistoryModal siteId={siteId} customerId={form.customer_id} isOpen={showCustomerHistory} onClose={() => setShowCustomerHistory(false)} />
      )}
    </div>
  );
}
