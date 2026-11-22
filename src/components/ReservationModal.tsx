'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, User, Calendar, Bed, FileText, UserPlus, ArrowLeft, Award, LogIn } from 'lucide-react';
import CustomerHistoryModal from './CustomerHistoryModal';
import { addToOutbox } from '@/lib/outbox';

interface Props {
  siteId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preselectRoomId?: string;   // ✅ NOUVELLE PROP : chambre cliquée
}

type Mode = 'RESERVATION' | 'WALK_IN';

export default function ReservationModal({ siteId, isOpen, onClose, onSuccess, preselectRoomId }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isOnline, setIsOnline] = useState(true);
  const [mode, setMode] = useState<Mode>('RESERVATION');   // ✅ Mode actif
  const [customers, setCustomers] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [showCustomerHistory, setShowCustomerHistory] = useState(false);
  const [lockedRoom, setLockedRoom] = useState<any>(null);   // ✅ détail de la chambre pré-sélectionnée

  const [form, setForm] = useState({
    customer_id: '',
    room_category_id: '',
    room_id: '',
    check_in_date: '',
    check_out_date: '',
    adults: 1,
    children: 0,
    nightly_rate: 0,
    deposit: 0,
    notes: '',
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
      setForm(prev => ({ ...prev, check_in_date: today, check_out_date: tomorrow }));
      setMode('RESERVATION');
      setLockedRoom(null);
      // ✅ Pré-sélection de la chambre cliquée
      if (preselectRoomId) {
        hydrateRoom(preselectRoomId);
      }
    }
  }, [isOpen, preselectRoomId]);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // ✅ Charge la catégorie + tarif de la chambre pré-sélectionnée
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
        .in('status', ['VACANT', 'RESERVED'])
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
  const isWalkIn = mode === 'WALK_IN';
  if (!isWalkIn && !form.check_out_date) { setError('Date de départ obligatoire.'); setLoading(false); return; }
  if (!isWalkIn && new Date(form.check_out_date) <= new Date(form.check_in_date)) {
    setError('La date de départ doit être postérieure à l\'arrivée.'); setLoading(false); return;
  }

  const todayStr = new Date().toISOString().split('T')[0];

  // Résolution de la chambre
  let roomId = form.room_id;
  let roomNumber = lockedRoom?.number || '';
  if (!roomId) {
    const { data: availableRoom } = await supabase.from('rooms')
      .select('id, number').eq('site_id', siteId).eq('category_id', form.room_category_id)
      .eq('status', 'VACANT').order('number').limit(1).maybeSingle();
    if (!availableRoom) { setError('Aucune chambre libre dans cette catégorie.'); setLoading(false); return; }
    roomId = availableRoom.id; roomNumber = availableRoom.number;
  }

  // ✅ ANTI‑CHEVAUCHEMENT : empêcher 2 réservations qui se recouvrent sur la même chambre
  const { data: conflict } = await supabase.from('reservations')
    .select('id, number, check_in_date, check_out_date')
    .eq('site_id', siteId).eq('room_id', roomId)
    .in('status', ['CONFIRMED', 'CHECKED_IN'])
    .lt('check_in_date', isWalkIn ? form.check_in_date : form.check_out_date)
    .gt('check_out_date', form.check_in_date)
    .maybeSingle();
  if (conflict) {
    setError(`⛔ La chambre ${roomNumber} est déjà réservée du ${conflict.check_in_date} au ${conflict.check_out_date} (${conflict.number}).`);
    setLoading(false); return;
  }

  const nights = isWalkIn ? 1 : Math.ceil((new Date(form.check_out_date).getTime() - new Date(form.check_in_date).getTime()) / 86400000);
  const total = nights * form.nightly_rate;
  const { data: { user } } = await supabase.auth.getUser();
  const reservationNumber = `RES-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`;

  const reservationData = {
    site_id: siteId, number: reservationNumber, customer_id: form.customer_id,
    room_category_id: form.room_category_id, room_id: roomId,
    check_in_date: form.check_in_date, check_out_date: isWalkIn ? form.check_in_date : form.check_out_date,
    adults: form.adults, children: form.children, nightly_rate: form.nightly_rate,
    total_amount: total, deposit: form.deposit,
    status: isWalkIn ? 'CHECKED_IN' : 'CONFIRMED', notes: form.notes, created_by: user?.id,
  };

  const stayData = {
    room_id: roomId, customer_id: form.customer_id,
    check_in_at: new Date().toISOString(), status: 'IN_HOUSE',
    folio_balance: 0, nightly_rate: form.nightly_rate,
  };

  // ✅ Statut physique de la chambre : OCCUPIED (walk‑in) / RESERVED (arrivée aujourd'hui) / inchangé (future)
  const newRoomStatus = isWalkIn ? 'OCCUPIED' : (form.check_in_date <= todayStr ? 'RESERVED' : null);

  // ===== HORS‑LIGNE =====
  if (!isOnline) {
    try {
      await addToOutbox({ type: 'INSERT', table: 'reservations', data: reservationData });
      if (newRoomStatus) await addToOutbox({ type: 'UPDATE', table: 'rooms', data: { id: roomId, status: newRoomStatus } });
      if (isWalkIn) await addToOutbox({ type: 'INSERT', table: 'stays', data: stayData });
      setLoading(false); onSuccess(); onClose(); return;
    } catch (err: any) { setError(`Erreur hors‑ligne: ${err.message}`); setLoading(false); return; }
  }

  // ===== EN LIGNE =====
  const { data: createdRes, error: resError } = await supabase.from('reservations').insert(reservationData).select('id').single();
  if (resError) { setError(`Erreur réservation: ${resError.message}`); setLoading(false); return; }

  if (isWalkIn) {
    const { error: stayErr } = await supabase.from('stays').insert({ ...stayData, reservation_id: createdRes.id });
    if (stayErr) { setError(`Réservation créée mais check‑in échoué: ${stayErr.message}`); setLoading(false); return; }
    await supabase.from('rooms').update({ status: 'OCCUPIED' }).eq('id', roomId);
    alert(`✅ Check‑in direct effectué !\nChambre ${roomNumber} occupée.`);
  } else if (form.check_in_date <= todayStr) {
    // Arrivée aujourd'hui → on réserve physiquement
    await supabase.from('rooms').update({ status: 'RESERVED' }).eq('id', roomId);
    alert(`✅ Réservation ${reservationNumber} créée — chambre ${roomNumber} marquée Réservée (arrivée aujourd'hui).`);
  } else {
    // ✅ Arrivée future → la chambre RESTE LIBRE aujourd'hui
    alert(`✅ Réservation ${reservationNumber} enregistrée pour le ${form.check_in_date}.\nLa chambre ${roomNumber} reste Libre jusqu'à la date d'arrivée.`);
  }

  await new Promise(r => setTimeout(r, 400));
  setLoading(false); onSuccess(); onClose();
};

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-indigo-900 to-purple-900 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6" />
            <h2 className="text-xl font-bold">{mode === 'WALK_IN' ? 'Check-in direct (Walk-in)' : 'Nouvelle Réservation'}</h2>
          </div>
          <div className="flex items-center gap-2">
            {!isOnline && <span className="bg-red-500 text-white text-xs px-2 py-1 rounded font-medium">Hors ligne</span>}
            <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* ✅ Toggle de mode */}
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg border border-red-200 text-sm">{error}</div>}

          {/* ✅ Bandeau chambre pré-sélectionnée */}
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

          {/* Client */}
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

          {/* Catégorie + Chambre */}
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1"><Bed className="w-4 h-4 inline mr-1" />Catégorie *</label>
              <select value={form.room_category_id} onChange={(e) => { const cat = categories.find(c => c.id === e.target.value); setForm({ ...form, room_category_id: e.target.value, room_id: '', nightly_rate: cat?.base_price || 0 }); setLockedRoom(null); }}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" required>
                <option value="">-- Catégorie --</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.code} - {c.name} ({Number(c.base_price).toLocaleString('fr-FR')} F)</option>)}
              </select></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Chambre {mode === 'WALK_IN' ? '*' : '(auto si vide)'}</label>
              <select value={form.room_id} onChange={(e) => setForm({ ...form, room_id: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500">
                <option value="">-- Attribution automatique --</option>
                {rooms.map(r => <option key={r.id} value={r.id}>{r.number} ({r.status === 'VACANT' ? 'Libre' : 'Réservée'})</option>)}
              </select></div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1"><Calendar className="w-4 h-4 inline mr-1" />Arrivée *</label>
              <input type="date" value={form.check_in_date} onChange={(e) => setForm({ ...form, check_in_date: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" required /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1"><Calendar className="w-4 h-4 inline mr-1" />Départ {mode === 'WALK_IN' ? '' : '*'}</label>
              <input type="date" value={form.check_out_date} onChange={(e) => setForm({ ...form, check_out_date: e.target.value })} disabled={mode === 'WALK_IN'} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-400" required={mode !== 'WALK_IN'} /></div>
          </div>

          {/* Occupants */}
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Adultes</label><input type="number" min="1" max="10" value={form.adults} onChange={(e) => setForm({ ...form, adults: Number(e.target.value) })} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Enfants</label><input type="number" min="0" max="10" value={form.children} onChange={(e) => setForm({ ...form, children: Number(e.target.value) })} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" /></div>
          </div>

          {/* Tarif + Acompte */}
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Tarif nuit (FCFA) *</label><input type="number" min="0" value={form.nightly_rate} onChange={(e) => setForm({ ...form, nightly_rate: Number(e.target.value) })} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" required /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Acompte (FCFA)</label><input type="number" min="0" value={form.deposit} onChange={(e) => setForm({ ...form, deposit: Number(e.target.value) })} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" /></div>
          </div>

          {form.check_in_date && form.nightly_rate > 0 && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
              <div className="flex justify-between text-sm"><span className="text-slate-700">{mode === 'WALK_IN' ? 'Nuit en cours :' : 'Nombre de nuits :'}</span><span className="font-bold">{mode === 'WALK_IN' ? 1 : Math.ceil((new Date(form.check_out_date).getTime() - new Date(form.check_in_date).getTime()) / 86400000)}</span></div>
              <div className="flex justify-between text-sm mt-1"><span className="text-slate-700">Total estimé :</span><span className="font-bold text-indigo-900">{Number((mode === 'WALK_IN' ? 1 : Math.ceil((new Date(form.check_out_date).getTime() - new Date(form.check_in_date).getTime()) / 86400000)) * form.nightly_rate).toLocaleString('fr-FR')} FCFA</span></div>
            </div>
          )}

          <div><label className="block text-sm font-medium text-slate-700 mb-1">Notes</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500" placeholder="Demandes spéciales..." /></div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg">Annuler</button>
            <button type="submit" disabled={loading} className={`flex-1 font-semibold py-2.5 rounded-lg disabled:opacity-50 text-white flex items-center justify-center gap-2 ${mode === 'WALK_IN' ? 'bg-emerald-600 hover:bg-emerald-700' : isOnline ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-amber-600 hover:bg-amber-700'}`}>
              {loading ? 'Enregistrement...' : mode === 'WALK_IN' ? <><LogIn className="w-4 h-4" /> Check-in direct</> : isOnline ? <><FileText className="w-4 h-4" /> Confirmer la réservation</> : ' Sauvegarder hors-ligne'}
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
