'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, User, Calendar, Bed, FileText, UserPlus, ArrowLeft, Award } from 'lucide-react';
import CustomerHistoryModal from './CustomerHistoryModal';
import { addToOutbox } from '@/lib/outbox';

interface Props {
  siteId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ReservationModal({ siteId, isOpen, onClose, onSuccess }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isOnline, setIsOnline] = useState(true);
  const [customers, setCustomers] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [showCustomerHistory, setShowCustomerHistory] = useState(false);

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
    type: 'IND',
    first_name: '',
    last_name: '',
    id_type: 'CNIB',
    id_number: '',
    phone: '',
    nationality: 'BF',
  });

  useEffect(() => {
    if (isOpen) {
      setIsOnline(navigator.onLine);
      loadData();
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      setForm(prev => ({ ...prev, check_in_date: today, check_out_date: tomorrow }));
    }
  }, [isOpen]);

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

     const loadData = async () => {
    const isOffline = !navigator.onLine;
    
    // Essayer de charger depuis Supabase
    try {
      const { data: cust } = await supabase
        .from('customers')
        .select('id, first_name, last_name, is_vip')
        .eq('site_id', siteId)
        .order('last_name');
      
      if (cust) {
        setCustomers(cust);
        // Mettre en cache
        const { setCache } = await import('@/lib/localCache');
        setCache('customers', cust);
      }
    } catch (err) {
      console.error('Erreur chargement clients:', err);
    }
    
    // Si offline, utiliser le cache
    if (isOffline) {
      const { getCache } = await import('@/lib/localCache');
      const cachedCustomers = getCache<any[]>('customers');
      if (cachedCustomers && cachedCustomers.length > 0) {
        setCustomers(cachedCustomers);
      } else {
        setError('⚠️ Mode hors-ligne. Aucun client en cache. Utilisez le bouton "Nouveau" pour créer un client.');
      }
    }

    // Charger les catégories
    try {
      const { data: cat } = await supabase
        .from('room_categories')
        .select('id, code, name, base_price')
        .eq('site_id', siteId)
        .order('code');
      
      if (cat) {
        setCategories(cat);
        const { setCache } = await import('@/lib/localCache');
        setCache('categories', cat);
      }
    } catch (err) {
      console.error('Erreur chargement catégories:', err);
    }
    
    if (isOffline) {
      const { getCache } = await import('@/lib/localCache');
      const cachedCategories = getCache<any[]>('categories');
      if (cachedCategories && cachedCategories.length > 0) {
        setCategories(cachedCategories);
      } else {
        setError('⚠️ Mode hors-ligne. Aucune catégorie en cache.');
      }
    }
  };

  useEffect(() => {
    if (form.room_category_id) {
      loadRooms(form.room_category_id);
    } else {
      setRooms([]);
    }
  }, [form.room_category_id]);

      const loadRooms = async (categoryId: string) => {
    const isOffline = !navigator.onLine;
    
    //  Si offline, utiliser le cache IMMÉDIATEMENT
    if (isOffline) {
      const { getCache } = await import('@/lib/localCache');
      const cachedRooms = getCache<any[]>(`rooms_${categoryId}`);
      if (cachedRooms) {
        setRooms(cachedRooms);
      } else {
        setRooms([]);
      }
      return; // Ne pas essayer de charger depuis Supabase
    }

    // Mode online : charger depuis Supabase
    try {
      const { data } = await supabase
        .from('rooms')
        .select('id, number, status, category_id')
        .eq('site_id', siteId)
        .eq('category_id', categoryId)
        .in('status', ['VACANT', 'RESERVED'])
        .order('number', { ascending: true });
      
      if (data) {
        setRooms(data);
        const { setCache } = await import('@/lib/localCache');
        setCache(`rooms_${categoryId}`, data);
      } else {
        setRooms([]);
      }
    } catch (err) {
      console.error('Erreur chargement chambres:', err);
      setRooms([]);
    }
  };

      const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Validation 1 : Nom obligatoire
    if (!newCustomer.last_name.trim()) {
      setError('Le nom est obligatoire.');
      setLoading(false);
      return;
    }

    // 🔒 Validation 2 : CNIB OBLIGATOIRE
    if (!newCustomer.id_number || !newCustomer.id_number.trim()) {
      setError('🪪 Le numéro de pièce d\'identité (CNIB) est OBLIGATOIRE pour créer un client.');
      setLoading(false);
      return;
    }

    // Validation 3 : Longueur minimale
    if (newCustomer.id_number.trim().length < 5) {
      setError('Le numéro de pièce doit contenir au moins 5 caractères.');
      setLoading(false);
      return;
    }

    if (!isOnline) {
      // MODE HORS-LIGNE
      try {
        const { createClientOffline } = await import('@/lib/localCache');
        const newId = await createClientOffline(siteId, {
          ...newCustomer,
          id_type: newCustomer.id_type || 'CNIB',
        });
        
        const tempCustomer = {
          id: newId,
          ...newCustomer,
          id_type: newCustomer.id_type || 'CNIB',
          is_vip: false,
        };
        setCustomers(prev => [...prev, tempCustomer]);
        setForm(prev => ({ ...prev, customer_id: newId }));
        setShowNewCustomerForm(false);
        setNewCustomer({ 
          type: 'IND', 
          first_name: '', 
          last_name: '', 
          id_type: 'CNIB',
          id_number: '', 
          phone: '', 
          nationality: 'BF' 
        });
        setLoading(false);
        return;
      } catch (err: any) {
        setError(`Erreur hors-ligne: ${err.message}`);
        setLoading(false);
        return;
      }
    }

    // MODE EN LIGNE
    const { data: customer, error } = await supabase
      .from('customers')
      .insert({
        site_id: siteId,
        type: newCustomer.type,
        first_name: newCustomer.first_name,
        last_name: newCustomer.last_name,
        id_number: newCustomer.id_number.trim(),
        id_type: newCustomer.id_type || 'CNIB',
        phone: newCustomer.phone,
        nationality: newCustomer.nationality,
      })
      .select()
      .single();

    if (error) {
      setError(`Erreur: ${error.message}`);
      setLoading(false);
      return;
    }

    setCustomers(prev => [...prev, customer]);
    setForm(prev => ({ ...prev, customer_id: customer.id }));
    setShowNewCustomerForm(false);
    setNewCustomer({ 
      type: 'IND', 
      first_name: '', 
      last_name: '', 
      id_type: 'CNIB',
      id_number: '', 
      phone: '', 
      nationality: 'BF' 
    });
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!form.customer_id || !form.room_category_id || !form.check_in_date || !form.check_out_date) {
      setError('Veuillez remplir tous les champs obligatoires.');
      setLoading(false);
      return;
    }

    if (new Date(form.check_out_date) <= new Date(form.check_in_date)) {
      setError('La date de départ doit être postérieure à la date d\'arrivée.');
      setLoading(false);
      return;
    }

    let roomId = form.room_id;
    if (!roomId) {
      const { data: availableRoom } = await supabase
        .from('rooms')
        .select('id, number')
        .eq('site_id', siteId)
        .eq('category_id', form.room_category_id)
        .eq('status', 'VACANT')
        .order('number', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (availableRoom) {
        roomId = availableRoom.id;
      } else {
        setError('Aucune chambre libre disponible dans cette catégorie.');
        setLoading(false);
        return;
      }
    }

    const nights = Math.ceil(
      (new Date(form.check_out_date).getTime() - new Date(form.check_in_date).getTime()) / 86400000
    );
    const total = nights * form.nightly_rate;

    const { data: { user } } = await supabase.auth.getUser();
    const reservationNumber = `RES-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`;

    if (!isOnline) {
      // MODE HORS-LIGNE : ajouter à l'Outbox
      try {
        await addToOutbox({
          type: 'INSERT',
          table: 'reservations',
          data: {
            site_id: siteId,
            number: reservationNumber,
            customer_id: form.customer_id,
            room_category_id: form.room_category_id,
            room_id: roomId,
            check_in_date: form.check_in_date,
            check_out_date: form.check_out_date,
            adults: form.adults,
            children: form.children,
            nightly_rate: form.nightly_rate,
            total_amount: total,
            deposit: form.deposit,
            status: 'CONFIRMED',
            notes: form.notes,
            created_by: user?.id,
          },
        });
        await addToOutbox({
          type: 'UPDATE',
          table: 'rooms',
          data: { id: roomId, status: 'RESERVED' },
        });
        setError('');
        setLoading(false);
        onSuccess();
        onClose();
        return;
      } catch (err: any) {
        setError(`Erreur hors-ligne: ${err.message}`);
        setLoading(false);
        return;
      }
    }

    // MODE EN LIGNE : comportement normal
    const { error: resError } = await supabase
      .from('reservations')
      .insert({
        site_id: siteId,
        number: reservationNumber,
        customer_id: form.customer_id,
        room_category_id: form.room_category_id,
        room_id: roomId,
        check_in_date: form.check_in_date,
        check_out_date: form.check_out_date,
        adults: form.adults,
        children: form.children,
        nightly_rate: form.nightly_rate,
        total_amount: total,
        deposit: form.deposit,
        status: 'CONFIRMED',
        notes: form.notes,
        created_by: user?.id,
      });

    if (resError) {
      setError(`Erreur réservation: ${resError.message}`);
      setLoading(false);
      return;
    }

    await supabase
      .from('rooms')
      .update({ status: 'RESERVED' })
      .eq('id', roomId);

    await new Promise(resolve => setTimeout(resolve, 500));

    setLoading(false);
    onSuccess();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-indigo-900 to-purple-900 text-white px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6" />
            <h2 className="text-xl font-bold">Nouvelle Réservation</h2>
          </div>
          <div className="flex items-center gap-2">
            {!isOnline && (
              <span className="bg-red-500 text-white text-xs px-2 py-1 rounded font-medium">
                 Hors ligne (mode file d'attente)
              </span>
            )}
            <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-lg border border-red-200 text-sm">
              {error}
            </div>
          )}

          {!isOnline && (
            <div className="bg-amber-50 text-amber-900 p-3 rounded-lg border border-amber-200 text-sm">
              ️ Vous êtes hors ligne. La réservation sera sauvegardée localement et synchronisée automatiquement dès que la connexion sera rétablie.
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              <User className="w-4 h-4 inline mr-1" />Client *
            </label>
            
            {!showNewCustomerForm ? (
              <div className="flex gap-2">
                <select
                  value={form.customer_id}
                  onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
                  required
                >
                  <option value="">-- Sélectionner un client --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.last_name} {c.first_name} {c.is_vip ? '⭐' : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewCustomerForm(true)}
                  className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-sm font-medium"
                >
                  <UserPlus className="w-4 h-4" />
                  Nouveau
                </button>
                {form.customer_id && (
                  <button
                    type="button"
                    onClick={() => setShowCustomerHistory(true)}
                    className="flex items-center gap-1 bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg text-sm font-medium"
                  >
                    <Award className="w-4 h-4" />
                    Historique
                  </button>
                )}
              </div>
            ) : (
              <div className="border border-indigo-200 rounded-lg p-3 bg-indigo-50 space-y-3">
                {showNewCustomerForm && (
  <div className="border border-indigo-200 rounded-lg p-3 bg-indigo-50 space-y-3">
    <div className="flex items-center justify-between">
      <h3 className="font-semibold text-indigo-900 text-sm">Nouveau client</h3>
      <button
        type="button"
        onClick={() => setShowNewCustomerForm(false)}
        className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
      >
        ← Retour à la liste
      </button>
    </div>

    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Type</label>
        <select
          value={newCustomer.type}
          onChange={(e) => setNewCustomer({ ...newCustomer, type: e.target.value })}
          className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
        >
          <option value="IND">Individuel</option>
          <option value="ENT">Entreprise</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Nationalité</label>
        <input
          type="text"
          value={newCustomer.nationality}
          onChange={(e) => setNewCustomer({ ...newCustomer, nationality: e.target.value })}
          className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
          placeholder="BF"
        />
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">
          Nom * <span className="text-red-600">(obligatoire)</span>
        </label>
        <input
          type="text"
          value={newCustomer.last_name}
          onChange={(e) => setNewCustomer({ ...newCustomer, last_name: e.target.value })}
          className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
          required
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Prénom</label>
        <input
          type="text"
          value={newCustomer.first_name}
          onChange={(e) => setNewCustomer({ ...newCustomer, first_name: e.target.value })}
          className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
        />
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">Téléphone</label>
        <input
          type="tel"
          value={newCustomer.phone}
          onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
          className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
          placeholder="+226 ..."
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">
          Type de pièce *
        </label>
        <select
          value={newCustomer.id_type || 'CNIB'}
          onChange={(e) => setNewCustomer({ ...newCustomer, id_type: e.target.value })}
          className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
        >
          <option value="CNIB">CNIB</option>
          <option value="PASSEPORT">Passeport</option>
          <option value="PERMIS">Permis de conduire</option>
          <option value="AUTRE">Autre</option>
        </select>
      </div>
    </div>

    {/* 🔒 CHAMP CNIB OBLIGATOIRE - C'EST CELUI QUI MANQUAIT ! */}
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1">
        N° Pièce d'identité * <span className="text-red-600">(CNIB obligatoire)</span>
      </label>
      <input
        type="text"
        value={newCustomer.id_number}
        onChange={(e) => setNewCustomer({ ...newCustomer, id_number: e.target.value })}
        className="w-full border-2 border-slate-300 rounded px-2 py-1.5 text-sm font-semibold"
        placeholder="Ex: B1234567"
        required
      />
      <p className="text-[10px] text-slate-500 mt-1">
        💡 La CNIB est obligatoire pour l'enregistrement de tout client
      </p>
    </div>

    <button
      type="button"
      onClick={handleCreateCustomer}
      disabled={loading}
      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-50"
    >
      {loading ? 'Création...' : '✅ Créer et sélectionner ce client'}
    </button>
  </div>
)}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Type</label>
                    <select
                      value={newCustomer.type}
                      onChange={(e) => setNewCustomer({ ...newCustomer, type: e.target.value })}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                    >
                      <option value="IND">Individuel</option>
                      <option value="ENT">Entreprise</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Nationalité</label>
                    <input
                      type="text"
                      value={newCustomer.nationality}
                      onChange={(e) => setNewCustomer({ ...newCustomer, nationality: e.target.value })}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                      placeholder="BF"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Nom *</label>
                    <input
                      type="text"
                      value={newCustomer.last_name}
                      onChange={(e) => setNewCustomer({ ...newCustomer, last_name: e.target.value })}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Prénom</label>
                    <input
                      type="text"
                      value={newCustomer.first_name}
                      onChange={(e) => setNewCustomer({ ...newCustomer, first_name: e.target.value })}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Téléphone</label>
                    <input
                      type="tel"
                      value={newCustomer.phone}
                      onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                      placeholder="+226 ..."
                    />
                  </div>
                  <div>
    <label className="block text-xs font-medium text-slate-700 mb-0.5">Type de pièce *</label>
    <select
      value={newCustomer.id_type || 'CNIB'}
      onChange={(e) => setNewCustomer({ ...newCustomer, id_type: e.target.value })}
      className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
    >
      <option value="CNIB">CNIB</option>
      <option value="PASSEPORT">Passeport</option>
      <option value="PERMIS">Permis de conduire</option>
      <option value="AUTRE">Autre</option>
    </select>
  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCreateCustomer}
                  disabled={loading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-50"
                >
                  {loading ? 'Création...' : '✅ Créer et sélectionner ce client'}
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                <Bed className="w-4 h-4 inline mr-1" />Catégorie *
              </label>
              <select
                value={form.room_category_id}
                onChange={(e) => {
                  const cat = categories.find(c => c.id === e.target.value);
                  setForm({ 
                    ...form, 
                    room_category_id: e.target.value,
                    room_id: '',
                    nightly_rate: cat?.base_price || 0
                  });
                }}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
                required
              >
                <option value="">-- Catégorie --</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.code} - {c.name} ({Number(c.base_price).toLocaleString('fr-FR')} F)</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Chambre (optionnel - auto si vide)
              </label>
              <select
                value={form.room_id}
                onChange={(e) => setForm({ ...form, room_id: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">-- Attribution automatique --</option>
                {rooms.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.number} ({r.status === 'VACANT' ? 'Libre' : 'Réservée'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                <Calendar className="w-4 h-4 inline mr-1" />Arrivée *
              </label>
              <input
                type="date"
                value={form.check_in_date}
                onChange={(e) => setForm({ ...form, check_in_date: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                <Calendar className="w-4 h-4 inline mr-1" />Départ *
              </label>
              <input
                type="date"
                value={form.check_out_date}
                onChange={(e) => setForm({ ...form, check_out_date: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Adultes</label>
              <input
                type="number"
                min="1"
                max="10"
                value={form.adults}
                onChange={(e) => setForm({ ...form, adults: Number(e.target.value) })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Enfants</label>
              <input
                type="number"
                min="0"
                max="10"
                value={form.children}
                onChange={(e) => setForm({ ...form, children: Number(e.target.value) })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tarif nuit (FCFA) *</label>
              <input
                type="number"
                min="0"
                value={form.nightly_rate}
                onChange={(e) => setForm({ ...form, nightly_rate: Number(e.target.value) })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Acompte (FCFA)</label>
              <input
                type="number"
                min="0"
                value={form.deposit}
                onChange={(e) => setForm({ ...form, deposit: Number(e.target.value) })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {form.check_in_date && form.check_out_date && form.nightly_rate > 0 && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-700">Nombre de nuits :</span>
                <span className="font-bold">
                  {Math.ceil((new Date(form.check_out_date).getTime() - new Date(form.check_in_date).getTime()) / 86400000)}
                </span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-slate-700">Total estimé :</span>
                <span className="font-bold text-indigo-900">
                  {Number(Math.ceil((new Date(form.check_out_date).getTime() - new Date(form.check_in_date).getTime()) / 86400000) * form.nightly_rate).toLocaleString('fr-FR')} FCFA
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
              placeholder="Demandes spéciales..."
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`flex-1 font-semibold py-2.5 rounded-lg disabled:opacity-50 text-white ${
                isOnline 
                  ? 'bg-indigo-600 hover:bg-indigo-700' 
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {loading ? 'Enregistrement...' : isOnline ? '✅ Confirmer la réservation' : ' Sauvegarder hors-ligne'}
            </button>
          </div>
        </form>
      </div>

      {showCustomerHistory && form.customer_id && (
        <CustomerHistoryModal
          siteId={siteId}
          customerId={form.customer_id}
          isOpen={showCustomerHistory}
          onClose={() => setShowCustomerHistory(false)}
        />
      )}
    </div>
  );
}
