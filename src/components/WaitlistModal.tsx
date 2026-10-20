'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, UserPlus, Clock, Trash2, ArrowLeft, User } from 'lucide-react';
import { addToOutbox } from '@/lib/outbox';

interface Props {
  siteId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  prefillCategory?: string;
}

export default function WaitlistModal({ siteId, isOpen, onClose, onSuccess, prefillCategory }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isOnline, setIsOnline] = useState(true);
  const [waitlist, setWaitlist] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);

  const [form, setForm] = useState({
    customer_id: '',
    room_category_id: prefillCategory || '',
    check_in_date: '',
    check_out_date: '',
    adults: 1,
    children: 0,
    priority: 0,
    notes: '',
  });

  const [newCustomer, setNewCustomer] = useState({
    type: 'IND',
    first_name: '',
    last_name: '',
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
      setForm(prev => ({ 
        ...prev, 
        check_in_date: today, 
        check_out_date: tomorrow,
        room_category_id: prefillCategory || prev.room_category_id
      }));
    }
  }, [isOpen, prefillCategory]);

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

    const { data: cust } = await supabase
      .from('customers')
      .select('id, first_name, last_name, is_vip')
      .eq('site_id', siteId)
      .order('last_name');
    
    if (cust) {
      setCustomers(cust);
      const { setCache } = await import('@/lib/localCache');
      setCache('customers', cust);
    } else if (isOffline) {
      const { getCache } = await import('@/lib/localCache');
      const cached = getCache<any[]>('customers');
      if (cached) {
        setCustomers(cached);
        setError('️ Mode hors-ligne. Données en cache.');
      }
    }

    const { data: cat } = await supabase
      .from('room_categories')
      .select('id, code, name')
      .eq('site_id', siteId)
      .order('code');
    
    if (cat) {
      setCategories(cat);
      const { setCache } = await import('@/lib/localCache');
      setCache('categories', cat);
    } else if (isOffline) {
      const { getCache } = await import('@/lib/localCache');
      const cached = getCache<any[]>('categories');
      if (cached) setCategories(cached);
    }

    const { data: wl } = await supabase
      .from('waitlist')
      .select(`
        id, check_in_date, check_out_date, status, priority, created_at, expires_at,
        customers (first_name, last_name, phone),
        room_categories (code, name)
      `)
      .eq('site_id', siteId)
      .eq('status', 'WAITING')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true });
    
    if (wl) {
      setWaitlist(wl);
      const { setCache } = await import('@/lib/localCache');
      setCache('waitlist', wl);
    } else if (isOffline) {
      const { getCache } = await import('@/lib/localCache');
      const cached = getCache<any[]>('waitlist');
      if (cached) setWaitlist(cached);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!newCustomer.last_name.trim()) {
      setError('Le nom est obligatoire.');
      setLoading(false);
      return;
    }

    const { data: customer, error } = await supabase
      .from('customers')
      .insert({
        site_id: siteId,
        type: newCustomer.type,
        first_name: newCustomer.first_name,
        last_name: newCustomer.last_name,
        id_number: newCustomer.id_number,
        phone: newCustomer.phone,
        nationality: newCustomer.nationality,
      })
      .select()
      .single();

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setCustomers(prev => [...prev, customer]);
    setForm(prev => ({ ...prev, customer_id: customer.id }));
    setShowNewCustomerForm(false);
    setNewCustomer({ type: 'IND', first_name: '', last_name: '', id_number: '', phone: '', nationality: 'BF' });
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!form.customer_id || !form.room_category_id) {
      setError('Client et catégorie obligatoires.');
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();

    if (!isOnline) {
      try {
        await addToOutbox({
          type: 'INSERT',
          table: 'waitlist',
          data: {
            site_id: siteId,
            customer_id: form.customer_id,
            room_category_id: form.room_category_id,
            check_in_date: form.check_in_date,
            check_out_date: form.check_out_date,
            adults: form.adults,
            children: form.children,
            priority: form.priority,
            status: 'WAITING',
            notes: form.notes,
            created_by: user?.id,
          },
        });
        setError('');
        setLoading(false);
        onSuccess();
        loadData();
        setForm({
          customer_id: '',
          room_category_id: prefillCategory || '',
          check_in_date: new Date().toISOString().split('T')[0],
          check_out_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
          adults: 1,
          children: 0,
          priority: 0,
          notes: '',
        });
        return;
      } catch (err: any) {
        setError(`Erreur hors-ligne: ${err.message}`);
        setLoading(false);
        return;
      }
    }

    const { error } = await supabase.from('waitlist').insert({
      site_id: siteId,
      customer_id: form.customer_id,
      room_category_id: form.room_category_id,
      check_in_date: form.check_in_date,
      check_out_date: form.check_out_date,
      adults: form.adults,
      children: form.children,
      priority: form.priority,
      status: 'WAITING',
      notes: form.notes,
      created_by: user?.id,
    });

    if (error) {
      setError(error.message);
    } else {
      onSuccess();
      loadData();
      setForm({
        customer_id: '',
        room_category_id: prefillCategory || '',
        check_in_date: new Date().toISOString().split('T')[0],
        check_out_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        adults: 1,
        children: 0,
        priority: 0,
        notes: '',
      });
    }
    setLoading(false);
  };

  const handleCancel = async (id: string) => {
    if (!isOnline) {
      await addToOutbox({
        type: 'UPDATE',
        table: 'waitlist',
        data: { id, status: 'CANCELLED' },
      });
      loadData();
      onSuccess();
      return;
    }
    await supabase.from('waitlist').update({ status: 'CANCELLED' }).eq('id', id);
    loadData();
    onSuccess();
  };

  const priorityLabels: Record<number, { label: string; color: string }> = {
    0: { label: 'Normal', color: 'bg-slate-200 text-slate-700' },
    1: { label: 'VIP', color: 'bg-purple-200 text-purple-900' },
    2: { label: 'Urgent', color: 'bg-red-200 text-red-900' },
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-indigo-900 to-purple-900 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6" />
            <h2 className="text-xl font-bold">Liste d'attente</h2>
          </div>
          <div className="flex items-center gap-2">
            {!isOnline && (
              <span className="bg-red-500 text-white text-xs px-2 py-1 rounded font-medium">
                📴 Hors ligne
              </span>
            )}
            <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-lg border border-red-200 text-sm">
              {error}
            </div>
          )}

          {!isOnline && (
            <div className="bg-amber-50 text-amber-900 p-3 rounded-lg border border-amber-200 text-sm">
              ⚠️ Mode hors-ligne. Les ajouts seront synchronisés automatiquement.
            </div>
          )}

          {waitlist.length > 0 && (
            <div>
              <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                En attente ({waitlist.length})
              </h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {waitlist.map((item: any) => {
                  const prio = priorityLabels[item.priority] || priorityLabels[0];
                  return (
                    <div key={item.id} className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">
                            {item.customers?.last_name} {item.customers?.first_name}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${prio.color}`}>
                            {prio.label}
                          </span>
                          <span className="text-xs bg-indigo-100 text-indigo-900 px-2 py-0.5 rounded">
                            {item.room_categories?.code}
                          </span>
                        </div>
                        <div className="text-xs text-slate-600 mt-1">
                          📞 {item.customers?.phone || '—'} • 
                          📅 {item.check_in_date} → {item.check_out_date}
                        </div>
                      </div>
                      <button
                        onClick={() => handleCancel(item.id)}
                        className="ml-2 text-red-600 hover:text-red-800 p-1"
                        title="Annuler"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {waitlist.length === 0 && (
            <div className="text-center py-6 bg-slate-50 rounded-lg">
              <Clock className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm text-slate-500">Aucun client en attente</p>
            </div>
          )}

          <div className="border-t border-slate-200 pt-4">
            <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              Ajouter à la liste d'attente
            </h3>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  <User className="w-3 h-3 inline mr-1" />Client *
                </label>
                
                {!showNewCustomerForm ? (
                  <div className="flex gap-2">
                    <select
                      value={form.customer_id}
                      onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                      className="flex-1 border border-slate-300 rounded px-2 py-1.5 text-sm"
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
                      className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded text-sm font-medium"
                    >
                      <UserPlus className="w-3 h-3" />
                      Nouveau
                    </button>
                  </div>
                ) : (
                  <div className="border border-emerald-200 rounded-lg p-3 bg-emerald-50 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-emerald-900 text-sm flex items-center gap-1">
                        <UserPlus className="w-3 h-3" />
                        Nouveau client
                      </h4>
                      <button
                        type="button"
                        onClick={() => setShowNewCustomerForm(false)}
                        className="text-xs text-emerald-700 hover:text-emerald-900 flex items-center gap-1"
                      >
                        <ArrowLeft className="w-3 h-3" /> Retour
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-0.5">Type</label>
                        <select
                          value={newCustomer.type}
                          onChange={(e) => setNewCustomer({ ...newCustomer, type: e.target.value })}
                          className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                        >
                          <option value="IND">Individuel</option>
                          <option value="ENT">Entreprise</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-0.5">Nationalité</label>
                        <input
                          type="text"
                          value={newCustomer.nationality}
                          onChange={(e) => setNewCustomer({ ...newCustomer, nationality: e.target.value })}
                          className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                          placeholder="BF"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-0.5">Nom *</label>
                        <input
                          type="text"
                          value={newCustomer.last_name}
                          onChange={(e) => setNewCustomer({ ...newCustomer, last_name: e.target.value })}
                          className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-0.5">Prénom</label>
                        <input
                          type="text"
                          value={newCustomer.first_name}
                          onChange={(e) => setNewCustomer({ ...newCustomer, first_name: e.target.value })}
                          className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-0.5">Téléphone</label>
                        <input
                          type="tel"
                          value={newCustomer.phone}
                          onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                          className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                          placeholder="+226 ..."
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-0.5">N° Pièce d'identité</label>
                        <input
                          type="text"
                          value={newCustomer.id_number}
                          onChange={(e) => setNewCustomer({ ...newCustomer, id_number: e.target.value })}
                          className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                          placeholder="CNI, Passeport..."
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleCreateCustomer}
                      disabled={loading}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-1.5 rounded disabled:opacity-50"
                    >
                      {loading ? 'Création...' : '✅ Créer et sélectionner ce client'}
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Catégorie *</label>
                  <select
                    value={form.room_category_id}
                    onChange={(e) => setForm({ ...form, room_category_id: e.target.value })}
                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                    required
                  >
                    <option value="">-- Catégorie --</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Priorité</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                  >
                    <option value="0">Normal</option>
                    <option value="1">VIP</option>
                    <option value="2">Urgent</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Arrivée souhaitée</label>
                  <input
                    type="date"
                    value={form.check_in_date}
                    onChange={(e) => setForm({ ...form, check_in_date: e.target.value })}
                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Départ souhaité</label>
                  <input
                    type="date"
                    value={form.check_out_date}
                    onChange={(e) => setForm({ ...form, check_out_date: e.target.value })}
                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Adultes</label>
                  <input
                    type="number"
                    min="1"
                    value={form.adults}
                    onChange={(e) => setForm({ ...form, adults: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Enfants</label>
                  <input
                    type="number"
                    min="0"
                    value={form.children}
                    onChange={(e) => setForm({ ...form, children: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                  placeholder="Ex: Client fidèle, préfère étage élevé..."
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className={`w-full font-semibold py-2 rounded-lg disabled:opacity-50 text-white ${
                  isOnline 
                    ? 'bg-indigo-600 hover:bg-indigo-700' 
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {loading ? 'Ajout...' : isOnline ? '➕ Ajouter à la liste d\'attente' : '💾 Sauvegarder hors-ligne'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
