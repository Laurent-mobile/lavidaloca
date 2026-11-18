'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useProfile } from '@/hooks/useHotel';
import {
  Wallet, Plus, Trash2, FileText, CheckCircle, XCircle, Clock,
  Search, Filter, Edit, Loader2, X, Save, TrendingDown, Receipt
} from 'lucide-react';

const categories = [
  { id: 'UTILITIES', label: 'Factures (Eau/Élec)', icon: '⚡' },
  { id: 'MAINTENANCE', label: 'Maintenance', icon: '🔧' },
  { id: 'SUPPLIES', label: 'Fournitures', icon: '🧴' },
  { id: 'FOOD', label: 'Nourriture/Provisions', icon: '🥘' },
  { id: 'SALARY', label: 'Salaires/Avances', icon: '👷' },
  { id: 'TRANSPORT', label: 'Transport/Carburant', icon: '🚗' },
  { id: 'OTHER', label: 'Autre', icon: '📦' },
];

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  PENDING: { label: 'En attente', color: 'bg-amber-100 text-amber-900 border-amber-200', icon: Clock },
  VALIDATED: { label: 'Validée', color: 'bg-blue-100 text-blue-900 border-blue-200', icon: CheckCircle },
  PAID: { label: 'Payée', color: 'bg-emerald-100 text-emerald-900 border-emerald-200', icon: CheckCircle },
  REJECTED: { label: 'Rejetée', color: 'bg-red-100 text-red-900 border-red-200', icon: XCircle },
};

const formatFCFA = (amount: number) => `${Number(amount || 0).toLocaleString('fr-FR')} FCFA`;

export default function HotelExpensesPage() {
  const supabase = createClient();
  const { siteId, loading: profileLoading } = useProfile();
  
  const [loading, setLoading] = useState(false);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'paid'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('ALL');
  
  const [showModal, setShowModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any>(null);
  const [formData, setFormData] = useState({
    category: 'UTILITIES',
    title: '',
    supplier_name: '',
    description: '',
    estimated_amount: 0,
    actual_amount: 0,
    status: 'PENDING',
    payment_method: 'CASH',
    invoice_number: '',
    notes: '',
  });

  useEffect(() => {
    if (siteId) loadExpenses();
  }, [siteId]);

  const loadExpenses = async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('hotel_expenses')
        .select('*')
        .eq('site_id', siteId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setExpenses(data || []);
    } catch (err: any) {
      console.error('Erreur chargement:', err);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      alert('Le titre est obligatoire.');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload: any = {
  site_id: siteId,
  category: formData.category,
  title: formData.title,
  supplier_name: formData.supplier_name || null,
  description: formData.description || null,
  estimated_amount: Number(formData.estimated_amount) || 0,
  actual_amount: Number(formData.actual_amount) || 0,
  status: formData.status,
  payment_method: formData.payment_method || null,
  invoice_number: formData.invoice_number || null,
  notes: formData.notes || null,
};

      if (editingExpense) {
        const { error } = await supabase.from('hotel_expenses').update(payload).eq('id', editingExpense.id);
        if (error) throw error;
      } else {
        payload.created_by = user?.id;
        const { error } = await supabase.from('hotel_expenses').insert(payload);
        if (error) throw error;
      }

      // Si on passe à "Payée", créer automatiquement une transaction en caisse
      if (formData.status === 'PAID' && (!editingExpense || editingExpense.status !== 'PAID')) {
        await supabase.from('cash_transactions').insert({
          site_id: siteId,
          type: 'EXPENSE',
          category: formData.category,
          amount: Number(formData.actual_amount) || Number(formData.estimated_amount),
          payment_method: formData.payment_method || 'CASH',
          status: 'PAID',
          provider_name: formData.supplier_name || 'Divers',
          description: `Dépense: ${formData.title}`,
          reference_table: 'hotel_expenses',
          reference_id: editingExpense?.id || 'new',
          received_by: user?.id,
          transaction_date: new Date().toISOString(),
        });
      }

      alert('✅ Enregistré avec succès !');
      setShowModal(false);
      setEditingExpense(null);
      resetForm();
      await loadExpenses();
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette dépense définitivement ?')) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('hotel_expenses').delete().eq('id', id);
      if (error) throw error;
      await loadExpenses();
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setFormData({
      category: 'UTILITIES',
      title: '',
      supplier_name: '',
      description: '',
      estimated_amount: 0,
      actual_amount: 0,
      status: 'PENDING',
      payment_method: 'CASH',
      invoice_number: '',
      notes: '',
    });
  };

  const filteredExpenses = expenses.filter(e => {
    if (activeTab === 'pending' && e.status !== 'PENDING' && e.status !== 'VALIDATED') return false;
    if (activeTab === 'paid' && e.status !== 'PAID') return false;
    if (filterCategory !== 'ALL' && e.category !== filterCategory) return false;
    if (searchTerm && !e.title.toLowerCase().includes(searchTerm.toLowerCase()) && 
        !(e.supplier_name || '').toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: expenses.reduce((sum, e) => sum + (Number(e.actual_amount) || Number(e.estimated_amount) || 0), 0),
    pending: expenses.filter(e => e.status === 'PENDING' || e.status === 'VALIDATED').reduce((sum, e) => sum + (Number(e.estimated_amount) || 0), 0),
    paid: expenses.filter(e => e.status === 'PAID').reduce((sum, e) => sum + (Number(e.actual_amount) || 0), 0),
  };

  if (profileLoading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-indigo-600 animate-spin" /></div>;
  if (!siteId) return null;

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Wallet className="w-7 h-7 text-red-600" />
            Dépenses Hôtel
          </h1>
          <p className="text-sm text-slate-500 mt-1">Gestion des petites dépenses et paiements fournisseurs</p>
        </div>
        <button
          onClick={() => { resetForm(); setEditingExpense(null); setShowModal(true); }}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> Nouvelle dépense
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-600 mb-1">Total général</div>
          <div className="text-2xl font-bold text-slate-900">{formatFCFA(stats.total)}</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="text-xs font-medium text-amber-700 mb-1">En attente / À payer</div>
          <div className="text-2xl font-bold text-amber-900">{formatFCFA(stats.pending)}</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
          <div className="text-xs font-medium text-emerald-700 mb-1">Déjà payées</div>
          <div className="text-2xl font-bold text-emerald-900">{formatFCFA(stats.paid)}</div>
        </div>
        </div>

      {/* Onglets et Filtres */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex gap-2">
          {(['all', 'pending', 'paid'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === tab ? 'bg-red-100 text-red-900' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab === 'all' ? 'Toutes' : tab === 'pending' ? 'En attente' : 'Payées'}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-1 md:justify-end">
          <div className="relative flex-1 md:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher (titre, fournisseur)..."
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="ALL">Toutes catégories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
          </select>
        </div>
      </div>

      {/* Tableau des dépenses */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-red-600 animate-spin" /></div>
      ) : filteredExpenses.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-lg">
          <Receipt className="w-12 h-12 mx-auto mb-2 text-slate-300" />
          <p className="text-sm text-slate-500">Aucune dépense trouvée</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-semibold">
                <tr>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Fournisseur / Objet</th>
                  <th className="px-4 py-3 text-left">Catégorie</th>
                  <th className="px-4 py-3 text-right">Montant</th>
                  <th className="px-4 py-3 text-center">Statut</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredExpenses.map(exp => {
                  const cat = categories.find(c => c.id === exp.category) || categories[6];
                  const status = statusConfig[exp.status] || statusConfig.PENDING;
                  const StatusIcon = status.icon;
                  const amount = Number(exp.actual_amount) || Number(exp.estimated_amount) || 0;

                  return (
                    <tr key={exp.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {new Date(exp.created_at).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{exp.title}</div>
                        {exp.supplier_name && <div className="text-xs text-slate-500">🏢 {exp.supplier_name}</div>}
                        {exp.invoice_number && <div className="text-[10px] text-slate-400">Facture: {exp.invoice_number}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">
                          {cat.icon} {cat.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900 whitespace-nowrap">
                        {formatFCFA(amount)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border font-medium ${status.color}`}>
                          <StatusIcon className="w-3 h-3" /> {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => {
                              setEditingExpense(exp);
                              setFormData({
                                category: exp.category || 'UTILITIES',
                                title: exp.title || '',
                                supplier_name: exp.supplier_name || '',
                                description: exp.description || '',
                                estimated_amount: Number(exp.estimated_amount) || 0,
                                actual_amount: Number(exp.actual_amount) || 0,
                                status: exp.status || 'PENDING',
                                payment_method: exp.payment_method || 'CASH',
                                invoice_number: exp.invoice_number || '',
                                notes: exp.notes || '',
                              });
                              setShowModal(true);
                            }}
                            className="text-blue-600 hover:bg-blue-50 p-1.5 rounded"
                            title="Modifier"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(exp.id)}
                            className="text-red-600 hover:bg-red-50 p-1.5 rounded"
                            title="Supprimer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Formulaire */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-red-600 to-red-800 text-white px-6 py-4 rounded-t-xl flex items-center justify-between sticky top-0 z-10">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Wallet className="w-5 h-5" />
                {editingExpense ? 'Modifier la dépense' : 'Nouvelle dépense'}
              </h3>
              <button onClick={() => setShowModal(false)} className="hover:bg-white/20 p-2 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Catégorie *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Statut</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    {Object.entries(statusConfig).map(([key, val]) => (
                      <option key={key} value={key}>{val.icon && <val.icon className="w-3 h-3 inline mr-1"/>} {val.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Objet de la dépense *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Ex: Achat de produits d'entretien"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Fournisseur / Prestataire</label>
                  <input
                    type="text"
                    value={formData.supplier_name}
                    onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="Ex: Supermarché Orca"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">N° Facture / Reçu</label>
                  <input
                    type="text"
                    value={formData.invoice_number}
                    onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="Ex: FAC-2024-001"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Montant estimé (FCFA)</label>
                  <input
                    type="number"
                    value={formData.estimated_amount}
                    onChange={(e) => setFormData({ ...formData, estimated_amount: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Montant réel payé (FCFA)</label>
                  <input
                    type="number"
                    value={formData.actual_amount}
                    onChange={(e) => setFormData({ ...formData, actual_amount: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {formData.status === 'PAID' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Mode de paiement</label>
                  <select
                    value={formData.payment_method}
                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="CASH">💵 Espèces (Caisse)</option>
                    <option value="BANK_TRANSFER">🏦 Virement bancaire</option>
                    <option value="MOBILE_MONEY">📱 Mobile Money</option>
                    <option value="CHECK">📝 Chèque</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Description / Détails</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Détails supplémentaires sur la dépense..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Notes internes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Visible uniquement par l'administration..."
                />
              </div>

              <div className="flex gap-3 pt-2 border-t border-slate-200">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {loading ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
