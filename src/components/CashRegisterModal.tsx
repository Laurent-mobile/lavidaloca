//src/components/CashRegisterModal.tsx
'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, DollarSign, TrendingUp, TrendingDown, Plus, Filter, Calendar } from 'lucide-react';

interface Props {
  siteId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const incomeCategories = [
  { id: 'ROOM_PAYMENT', label: 'Paiement chambre', icon: '️' },
  { id: 'FB_PAYMENT', label: 'Restaurant/Bar', icon: '🍽️' },
  { id: 'OTHER_INCOME', label: 'Autre recette', icon: '💰' },
];

const expenseCategories = [
  { id: 'MAINTENANCE', label: 'Maintenance', icon: '' },
  { id: 'SUPPLIES', label: 'Fournitures', icon: '🧴' },
  { id: 'SALARY', label: 'Salaires', icon: '👷' },
  { id: 'UTILITIES', label: 'Factures (eau/élec)', icon: '⚡' },
  { id: 'OTHER_EXPENSE', label: 'Autre dépense', icon: '' },
];

const paymentMethods = [
  { id: 'CASH', label: 'Espèces', icon: '💵' },
  { id: 'CARD', label: 'Carte bancaire', icon: '💳' },
  { id: 'MOBILE', label: 'Mobile Money', icon: '📱' },
  { id: 'BANK_TRANSFER', label: 'Virement', icon: '🏦' },
  { id: 'CHECK', label: 'Chèque', icon: '📝' },
];

export default function CashRegisterModal({ siteId, isOpen, onClose, onSuccess }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterType, setFilterType] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');

  const [form, setForm] = useState({
    type: 'EXPENSE' as 'INCOME' | 'EXPENSE',
    category: 'MAINTENANCE',
    amount: 0,
    payment_method: 'CASH',
    provider_name: '',
    description: '',
    notes: '',
    reference_id: '',
  });

  useEffect(() => {
    if (isOpen) {
      loadTransactions();
    }
  }, [isOpen, filterDate, filterType]);

  const loadTransactions = async () => {
    const startOfDay = new Date(filterDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(filterDate);
    endOfDay.setHours(23, 59, 59, 999);

    let query = supabase
      .from('cash_transactions')
      .select('*')
      .eq('site_id', siteId)
      .gte('transaction_date', startOfDay.toISOString())
      .lte('transaction_date', endOfDay.toISOString())
      .order('transaction_date', { ascending: false });

    if (filterType !== 'ALL') {
      query = query.eq('type', filterType);
    }

    const { data } = await query;
    if (data) setTransactions(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (form.amount <= 0) {
      setError('Le montant doit être supérieur à 0.');
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from('cash_transactions').insert({
      site_id: siteId,
      type: form.type,
      category: form.category,
      amount: form.amount,
      payment_method: form.payment_method,
      provider_name: form.provider_name,
      description: form.description,
      notes: form.notes,
      reference_id: form.reference_id || null,
      received_by: user?.id,
    });

    if (error) {
      setError(error.message);
    } else {
      onSuccess();
      loadTransactions();
      setShowForm(false);
      setForm({ type: 'EXPENSE', category: 'MAINTENANCE', amount: 0, payment_method: 'CASH', provider_name: '', description: '', notes: '', reference_id: '' });
    }
    setLoading(false);
  };

  // Calculs
  const totalIncome = transactions
    .filter(t => t.type === 'INCOME')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const totalExpense = transactions
    .filter(t => t.type === 'EXPENSE')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const balance = totalIncome - totalExpense;

  const getCategoryLabel = (cat: string) => {
    const all = [...incomeCategories, ...expenseCategories];
    return all.find(c => c.id === cat)?.label || cat;
  };

  const getCategoryIcon = (cat: string) => {
    const all = [...incomeCategories, ...expenseCategories];
    return all.find(c => c.id === cat)?.icon || '💰';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <DollarSign className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-bold">Caisse</h2>
              <p className="text-xs text-emerald-100">Gestion des encaissements et décaissements</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-1 bg-white text-emerald-700 hover:bg-emerald-50 text-sm px-3 py-1.5 rounded-lg font-medium"
            >
              <Plus className="w-4 h-4" />
              Nouvelle transaction
            </button>
            <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-lg border border-red-200 text-sm">{error}</div>
          )}

          {/* Résumé du jour */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-50 border-2 border-emerald-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-5 h-5 text-emerald-700" />
                <span className="text-xs font-medium text-emerald-700">Encaissements</span>
              </div>
              <div className="text-2xl font-bold text-emerald-900">
                {Number(totalIncome).toLocaleString('fr-FR')} F
              </div>
            </div>
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-5 h-5 text-red-700" />
                <span className="text-xs font-medium text-red-700">Décaissements</span>
              </div>
              <div className="text-2xl font-bold text-red-900">
                {Number(totalExpense).toLocaleString('fr-FR')} F
              </div>
            </div>
            <div className={`border-2 rounded-lg p-4 ${balance >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className={`w-5 h-5 ${balance >= 0 ? 'text-blue-700' : 'text-orange-700'}`} />
                <span className={`text-xs font-medium ${balance >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>Solde</span>
              </div>
              <div className={`text-2xl font-bold ${balance >= 0 ? 'text-blue-900' : 'text-orange-900'}`}>
                {Number(balance).toLocaleString('fr-FR')} F
              </div>
            </div>
          </div>

          {/* Filtres */}
          <div className="flex gap-3 items-center bg-slate-50 p-3 rounded-lg">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-600" />
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="border border-slate-300 rounded px-2 py-1 text-sm"
              />
            </div>
            <div className="flex gap-1">
              {(['ALL', 'INCOME', 'EXPENSE'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-3 py-1 rounded text-xs font-medium ${
                    filterType === type
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-slate-700 border border-slate-300'
                  }`}
                >
                  {type === 'ALL' ? 'Tout' : type === 'INCOME' ? 'Recettes' : 'Dépenses'}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-600 ml-auto">
              {transactions.length} transaction(s)
            </span>
          </div>

          {/* Formulaire */}
          {showForm && (
            <form onSubmit={handleSubmit} className="bg-slate-50 p-4 rounded-lg border-2 border-slate-300 space-y-3">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Nouvelle transaction
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Type *</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as any, category: e.target.value === 'INCOME' ? 'ROOM_PAYMENT' : 'MAINTENANCE' })}
                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                  >
                    <option value="INCOME"> Encaissement (recette)</option>
                    <option value="EXPENSE">💸 Décaissement (dépense)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Catégorie *</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                  >
                    {(form.type === 'INCOME' ? incomeCategories : expenseCategories).map(c => (
                      <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Montant (FCFA) *</label>
                  <input
                    type="number"
                    min="1"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Mode de paiement *</label>
                  <select
                    value={form.payment_method}
                    onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                  >
                    {paymentMethods.map(m => (
                      <option key={m.id} value={m.id}>{m.icon} {m.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {form.type === 'EXPENSE' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Fournisseur / Bénéficiaire</label>
                  <input
                    type="text"
                    value={form.provider_name}
                    onChange={(e) => setForm({ ...form, provider_name: e.target.value })}
                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                    placeholder="Nom de l'entreprise ou personne..."
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Description *</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                  placeholder="Ex: Facture Clim Plus - Réparation climatiseur..."
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={1}
                  className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                />
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2 rounded-lg">
                  Annuler
                </button>
                <button type="submit" disabled={loading} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 rounded-lg disabled:opacity-50">
                  {loading ? 'Enregistrement...' : '💾 Enregistrer la transaction'}
                </button>
              </div>
            </form>
          )}

          {/* Liste des transactions */}
          {transactions.length === 0 ? (
            <div className="text-center py-8 bg-slate-50 rounded-lg">
              <DollarSign className="w-12 h-12 mx-auto mb-2 text-slate-300" />
              <p className="text-sm text-slate-500">Aucune transaction pour cette date</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {transactions.map(t => (
                <div key={t.id} className={`flex items-center justify-between p-3 rounded-lg border ${
                  t.type === 'INCOME' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
                }`}>
                  <div className="flex items-center gap-3 flex-1">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${
                      t.type === 'INCOME' ? 'bg-emerald-200' : 'bg-red-200'
                    }`}>
                      {getCategoryIcon(t.category)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-slate-900">{getCategoryLabel(t.category)}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          t.payment_method === 'CASH' ? 'bg-green-200 text-green-900' :
                          t.payment_method === 'CARD' ? 'bg-blue-200 text-blue-900' :
                          t.payment_method === 'MOBILE' ? 'bg-purple-200 text-purple-900' :
                          'bg-slate-200 text-slate-700'
                        }`}>
                          {paymentMethods.find(m => m.id === t.payment_method)?.icon} {t.payment_method}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 mt-0.5">
                        {t.description}
                        {t.provider_name && <span className="text-slate-500"> • {t.provider_name}</span>}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        🕐 {new Date(t.transaction_date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                  <div className={`text-lg font-bold ${t.type === 'INCOME' ? 'text-emerald-700' : 'text-red-700'}`}>
                    {t.type === 'INCOME' ? '+' : '-'}{Number(t.amount).toLocaleString('fr-FR')} F
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
