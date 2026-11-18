'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useProfile } from '@/hooks/useHotel';
import {
  Landmark, Plus, RefreshCw, TrendingUp, TrendingDown, Clock, CheckCircle,
  X, Save, AlertCircle, Filter, Search, Edit2, Trash2, Loader2,
  ArrowDownCircle, ArrowUpCircle, Receipt, DollarSign, Calendar
} from 'lucide-react';

interface BankAccount {
  id: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  currency: string;
  opening_balance: number;
  current_balance: number;
  account_type: string;
  is_active: boolean;
}

interface BankTransaction {
  id: string;
  bank_account_id: string;
  reference: string;
  transaction_type: string;
  direction: string;
  amount: number;
  counterparty: string;
  description: string;
  transaction_date: string;
  status: string;
  source_table: string;
  source_id: string;
  notes: string;
  created_at: string;
}

export default function BanquePage() {
  const supabase = createClient();
  const { siteId, loading: profileLoading } = useProfile();
  
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'reconciled' | 'deposits' | 'payments'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showReconcile, setShowReconcile] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<BankTransaction | null>(null);
  
  // Forms
  const [newAccountForm, setNewAccountForm] = useState({
    bank_name: '',
    account_name: '',
    account_number: '',
    currency: 'XOF',
    opening_balance: 0,
    account_type: 'CHECKING'
  });
  
  const [depositForm, setDepositForm] = useState({
    amount: '',
    reference: '',
    description: '',
    transaction_date: new Date().toISOString().split('T')[0],
    notes: ''
  });
  
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    reference: '',
    transaction_type: 'TRANSFER',
    counterparty: '',
    description: '',
    transaction_date: new Date().toISOString().split('T')[0],
    notes: ''
  });

  useEffect(() => {
    if (siteId) {
      loadAccounts();
    }
  }, [siteId]);

  useEffect(() => {
    if (selectedAccountId) {
      loadTransactions();
    }
  }, [selectedAccountId, activeTab]);

  const loadAccounts = async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('site_id', siteId)
        .eq('is_active', true)
        .order('bank_name');
      
      if (error) throw error;
      setAccounts(data || []);
      if (data && data.length > 0 && !selectedAccountId) {
        setSelectedAccountId(data[0].id);
      }
    } catch (err: any) {
      console.error('Erreur chargement comptes:', err);
    }
    setLoading(false);
  };

  const loadTransactions = async () => {
    if (!selectedAccountId) return;
    setLoading(true);
    try {
      let query = supabase
        .from('bank_transactions')
        .select('*')
        .eq('bank_account_id', selectedAccountId)
        .order('transaction_date', { ascending: false });

      if (activeTab === 'pending') query = query.eq('status', 'PENDING');
      else if (activeTab === 'reconciled') query = query.eq('status', 'RECONCILED');
      else if (activeTab === 'deposits') query = query.eq('direction', 'INCOME');
      else if (activeTab === 'payments') query = query.eq('direction', 'EXPENSE');

      const { data, error } = await query;
      if (error) throw error;
      setTransactions(data || []);
    } catch (err: any) {
      console.error('Erreur chargement transactions:', err);
    }
    setLoading(false);
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountForm.bank_name || !newAccountForm.account_name) {
      alert('Nom de banque et titulaire sont obligatoires');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('bank_accounts').insert({
        site_id: siteId,
        ...newAccountForm,
        current_balance: newAccountForm.opening_balance
      });

      if (error) throw error;
      alert('✅ Compte bancaire créé avec succès !');
      setShowNewAccount(false);
      setNewAccountForm({
        bank_name: '',
        account_name: '',
        account_number: '',
        currency: 'XOF',
        opening_balance: 0,
        account_type: 'CHECKING'
      });
      await loadAccounts();
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
    setLoading(false);
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!depositForm.amount || !depositForm.reference) {
      alert('Montant et référence sont obligatoires');
      return;
    }

    setLoading(true);
    try {
      const amount = parseFloat(depositForm.amount);
      
      // 1. Créer la transaction
      const { error: transError } = await supabase.from('bank_transactions').insert({
        site_id: siteId,
        bank_account_id: selectedAccountId,
        reference: depositForm.reference,
        transaction_type: 'DEPOSIT',
        direction: 'INCOME',
        amount: amount,
        description: depositForm.description,
        transaction_date: depositForm.transaction_date,
        status: 'RECONCILED',
        notes: depositForm.notes
      });

      if (transError) throw transError;

      // 2. Mettre à jour le solde du compte
      const { data: account } = await supabase
        .from('bank_accounts')
        .select('current_balance')
        .eq('id', selectedAccountId)
        .single();

      if (account) {
        const newBalance = Number(account.current_balance) + amount;
        await supabase
          .from('bank_accounts')
          .update({ current_balance: newBalance })
          .eq('id', selectedAccountId);
      }

      alert('✅ Dépôt enregistré avec succès !');
      setShowDeposit(false);
      setDepositForm({
        amount: '',
        reference: '',
        description: '',
        transaction_date: new Date().toISOString().split('T')[0],
        notes: ''
      });
      await loadTransactions();
      await loadAccounts();
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
    setLoading(false);
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentForm.amount || !paymentForm.reference) {
      alert('Montant et référence sont obligatoires');
      return;
    }

    setLoading(true);
    try {
      const amount = parseFloat(paymentForm.amount);
      
      // 1. Créer la transaction
      const { error: transError } = await supabase.from('bank_transactions').insert({
        site_id: siteId,
        bank_account_id: selectedAccountId,
        reference: paymentForm.reference,
        transaction_type: paymentForm.transaction_type,
        direction: 'EXPENSE',
        amount: amount,
        counterparty: paymentForm.counterparty,
        description: paymentForm.description,
        transaction_date: paymentForm.transaction_date,
        status: 'PENDING',
        notes: paymentForm.notes
      });

      if (transError) throw transError;

      alert('✅ Paiement enregistré ! Statut: En attente de rapprochement');
      setShowPayment(false);
      setPaymentForm({
        amount: '',
        reference: '',
        transaction_type: 'TRANSFER',
        counterparty: '',
        description: '',
        transaction_date: new Date().toISOString().split('T')[0],
        notes: ''
      });
      await loadTransactions();
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
    setLoading(false);
  };

  const handleReconcile = async (transactionId: string) => {
    if (!confirm('Confirmer le rapprochement de cette transaction ?')) return;
    
    setLoading(true);
    try {
      // 1. Marquer comme rapprochée
      const { error: transError } = await supabase
        .from('bank_transactions')
        .update({ 
          status: 'RECONCILED',
          reconciled_at: new Date().toISOString()
        })
        .eq('id', transactionId);

      if (transError) throw transError;

      // 2. Mettre à jour le solde du compte
      const { data: transaction } = await supabase
        .from('bank_transactions')
        .select('amount, direction')
        .eq('id', transactionId)
        .single();

      if (transaction) {
        const { data: account } = await supabase
          .from('bank_accounts')
          .select('current_balance')
          .eq('id', selectedAccountId)
          .single();

        if (account) {
          let newBalance = Number(account.current_balance);
          if (transaction.direction === 'EXPENSE') {
            newBalance -= Number(transaction.amount);
          } else {
            newBalance += Number(transaction.amount);
          }
          
          await supabase
            .from('bank_accounts')
            .update({ current_balance: newBalance })
            .eq('id', selectedAccountId);
        }
      }

      alert('✅ Transaction rapprochée avec succès !');
      await loadTransactions();
      await loadAccounts();
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
    setLoading(false);
  };

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);
  
  const stats = {
    theoreticalBalance: selectedAccount?.current_balance || 0,
    pendingCount: transactions.filter(t => t.status === 'PENDING').length,
    pendingAmount: transactions.filter(t => t.status === 'PENDING').reduce((sum, t) => sum + Number(t.amount), 0),
    reconciledCount: transactions.filter(t => t.status === 'RECONCILED').length,
    totalDeposits: transactions.filter(t => t.direction === 'INCOME').reduce((sum, t) => sum + Number(t.amount), 0),
    totalPayments: transactions.filter(t => t.direction === 'EXPENSE').reduce((sum, t) => sum + Number(t.amount), 0)
  };

  const filteredTransactions = transactions.filter(t => {
    if (!searchTerm) return true;
    return t.reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
           t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
           t.counterparty?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }
  if (!siteId) return null;

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Landmark className="w-7 h-7 text-blue-600" />
            Banque
          </h1>
          <p className="text-sm text-slate-500 mt-1">Gestion des comptes bancaires et rapprochement</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowDeposit(true)}
            disabled={!selectedAccountId}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <ArrowDownCircle className="w-4 h-4" /> Dépôt
          </button>
          <button
            onClick={() => setShowPayment(true)}
            disabled={!selectedAccountId}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <ArrowUpCircle className="w-4 h-4" /> Paiement
          </button>
          <button
            onClick={() => setShowNewAccount(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Nouveau compte
          </button>
        </div>
      </div>

      {/* Sélecteur de compte */}
      {accounts.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <label className="block text-sm font-medium text-slate-700 mb-2">Compte bancaire</label>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>
                {acc.bank_name} - {acc.account_name} ({acc.account_number})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Stats */}
      {selectedAccount && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
            <div className="text-xs font-medium text-blue-700 mb-1 flex items-center gap-1">
              <DollarSign className="w-4 h-4" /> Solde théorique
            </div>
            <div className="text-2xl font-bold text-blue-900">
              {Number(stats.theoreticalBalance).toLocaleString('fr-FR')} FCFA
            </div>
            <div className="text-xs text-blue-700 mt-1">{selectedAccount.bank_name}</div>
          </div>
          <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4">
            <div className="text-xs font-medium text-amber-700 mb-1 flex items-center gap-1">
              <Clock className="w-4 h-4" /> En attente
            </div>
            <div className="text-2xl font-bold text-amber-900">{stats.pendingCount}</div>
            <div className="text-xs text-amber-700 mt-1">{Number(stats.pendingAmount).toLocaleString('fr-FR')} FCFA</div>
          </div>
          <div className="bg-emerald-50 border-2 border-emerald-200 rounded-lg p-4">
            <div className="text-xs font-medium text-emerald-700 mb-1 flex items-center gap-1">
              <TrendingUp className="w-4 h-4" /> Total dépôts
            </div>
            <div className="text-2xl font-bold text-emerald-900">
              {Number(stats.totalDeposits).toLocaleString('fr-FR')} FCFA
            </div>
          </div>
          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
            <div className="text-xs font-medium text-red-700 mb-1 flex items-center gap-1">
              <TrendingDown className="w-4 h-4" /> Total paiements
            </div>
            <div className="text-2xl font-bold text-red-900">
              {Number(stats.totalPayments).toLocaleString('fr-FR')} FCFA
            </div>
          </div>
        </div>
      )}

      {/* Onglets */}
      <div className="flex gap-2 border-b border-slate-200">
        {([
          { id: 'all', label: 'Toutes', icon: Receipt },
          { id: 'pending', label: 'En attente', icon: Clock },
          { id: 'reconciled', label: 'Rapprochées', icon: CheckCircle },
          { id: 'deposits', label: 'Dépôts', icon: ArrowDownCircle },
          { id: 'payments', label: 'Paiements', icon: ArrowUpCircle }
        ] as const).map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 font-medium text-sm transition-colors ${
                activeTab === tab.id ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Rechercher par référence, description..."
          className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm"
        />
      </div>

      {/* Tableau des transactions */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-lg">
          <Landmark className="w-12 h-12 mx-auto mb-2 text-slate-300" />
          <p className="text-sm text-slate-500">Aucune transaction trouvée</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-semibold">
                <tr>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Référence</th>
                  <th className="px-4 py-3 text-left">Description</th>
                  <th className="px-4 py-3 text-right">Montant</th>
                  <th className="px-4 py-3 text-center">Statut</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTransactions.map(trans => (
                  <tr key={trans.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(trans.transaction_date).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded font-medium ${
                        trans.direction === 'INCOME' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {trans.direction === 'INCOME' ? <ArrowDownCircle className="w-3 h-3" /> : <ArrowUpCircle className="w-3 h-3" />}
                        {trans.transaction_type === 'TRANSFER' ? 'Virement' :
                         trans.transaction_type === 'CHECK' ? 'Chèque' :
                         trans.transaction_type === 'DEPOSIT' ? 'Dépôt' :
                         trans.transaction_type === 'MOBILE_MONEY' ? 'Mobile Money' : trans.transaction_type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-blue-600">{trans.reference}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-900">{trans.description}</div>
                      {trans.counterparty && <div className="text-xs text-slate-500">{trans.counterparty}</div>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold ${trans.direction === 'INCOME' ? 'text-emerald-900' : 'text-red-900'}`}>
                        {trans.direction === 'INCOME' ? '+' : '-'}{Number(trans.amount).toLocaleString('fr-FR')} FCFA
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${
                        trans.status === 'RECONCILED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {trans.status === 'RECONCILED' ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                        {trans.status === 'RECONCILED' ? 'Rapprochée' : 'En attente'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {trans.status === 'PENDING' && (
                        <button
                          onClick={() => handleReconcile(trans.id)}
                          className="text-emerald-600 hover:bg-emerald-50 p-1.5 rounded"
                          title="Rapprocher"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Nouveau Compte */}
      {showNewAccount && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="bg-blue-600 text-white px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Landmark className="w-5 h-5" /> Nouveau compte bancaire
              </h3>
              <button onClick={() => setShowNewAccount(false)} className="hover:bg-white/20 p-2 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateAccount} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nom de la banque *</label>
                <input
                  type="text"
                  value={newAccountForm.bank_name}
                  onChange={(e) => setNewAccountForm({ ...newAccountForm, bank_name: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                  placeholder="Ex: Coris Bank, Ecobank..."
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Titulaire du compte *</label>
                <input
                  type="text"
                  value={newAccountForm.account_name}
                  onChange={(e) => setNewAccountForm({ ...newAccountForm, account_name: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                  placeholder="Ex: LA VIDA-LOCA SARL"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">N° de compte</label>
                  <input
                    type="text"
                    value={newAccountForm.account_number}
                    onChange={(e) => setNewAccountForm({ ...newAccountForm, account_number: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2"
                    placeholder="0001234567890"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Type de compte</label>
                  <select
                    value={newAccountForm.account_type}
                    onChange={(e) => setNewAccountForm({ ...newAccountForm, account_type: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2"
                  >
                    <option value="CHECKING">Courant</option>
                    <option value="SAVINGS">Épargne</option>
                    <option value="CREDIT_CARD">Carte de crédit</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Devise</label>
                  <select
                    value={newAccountForm.currency}
                    onChange={(e) => setNewAccountForm({ ...newAccountForm, currency: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2"
                  >
                    <option value="XOF">FCFA (XOF)</option>
                    <option value="EUR">Euro (EUR)</option>
                    <option value="USD">Dollar (USD)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Solde initial (FCFA)</label>
                  <input
                    type="number"
                    value={newAccountForm.opening_balance}
                    onChange={(e) => setNewAccountForm({ ...newAccountForm, opening_balance: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2"
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowNewAccount(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg">
                  Annuler
                </button>
                <button type="submit" disabled={loading} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50">
                  {loading ? 'Création...' : 'Créer le compte'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Dépôt */}
      {showDeposit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="bg-emerald-600 text-white px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <ArrowDownCircle className="w-5 h-5" /> Dépôt en banque
              </h3>
              <button onClick={() => setShowDeposit(false)} className="hover:bg-white/20 p-2 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleDeposit} className="p-6 space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-900">
                <strong>Compte :</strong> {selectedAccount?.bank_name} - {selectedAccount?.account_name}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Montant (FCFA) *</label>
                <input
                  type="number"
                  value={depositForm.amount}
                  onChange={(e) => setDepositForm({ ...depositForm, amount: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-2xl font-bold text-center"
                  placeholder="0"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Référence du dépôt *</label>
                <input
                  type="text"
                  value={depositForm.reference}
                  onChange={(e) => setDepositForm({ ...depositForm, reference: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                  placeholder="Ex: DEP-2026-1118"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <input
                  type="text"
                  value={depositForm.description}
                  onChange={(e) => setDepositForm({ ...depositForm, description: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                  placeholder="Ex: Dépôt espèces caisse"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  value={depositForm.transaction_date}
                  onChange={(e) => setDepositForm({ ...depositForm, transaction_date: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea
                  value={depositForm.notes}
                  onChange={(e) => setDepositForm({ ...depositForm, notes: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                  rows={2}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowDeposit(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg">
                  Annuler
                </button>
                <button type="submit" disabled={loading} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50">
                  {loading ? 'Enregistrement...' : 'Enregistrer le dépôt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Paiement */}
      {showPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="bg-red-600 text-white px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <ArrowUpCircle className="w-5 h-5" /> Paiement bancaire
              </h3>
              <button onClick={() => setShowPayment(false)} className="hover:bg-white/20 p-2 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handlePayment} className="p-6 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-900">
                <strong>Compte :</strong> {selectedAccount?.bank_name} - {selectedAccount?.account_name}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Type de paiement *</label>
                  <select
                    value={paymentForm.transaction_type}
                    onChange={(e) => setPaymentForm({ ...paymentForm, transaction_type: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2"
                    required
                  >
                    <option value="TRANSFER">🏦 Virement</option>
                    <option value="CHECK">📝 Chèque</option>
                    <option value="MOBILE_MONEY">📱 Mobile Money</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Montant (FCFA) *</label>
                  <input
                    type="number"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-2xl font-bold text-center"
                    placeholder="0"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Référence *</label>
                <input
                  type="text"
                  value={paymentForm.reference}
                  onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                  placeholder={
                    paymentForm.transaction_type === 'TRANSFER' ? 'N° de virement' :
                    paymentForm.transaction_type === 'CHECK' ? 'N° de chèque' :
                    'ID transaction'
                  }
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Bénéficiaire</label>
                <input
                  type="text"
                  value={paymentForm.counterparty}
                  onChange={(e) => setPaymentForm({ ...paymentForm, counterparty: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                  placeholder="Nom du bénéficiaire"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <input
                  type="text"
                  value={paymentForm.description}
                  onChange={(e) => setPaymentForm({ ...paymentForm, description: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                  placeholder="Objet du paiement"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  value={paymentForm.transaction_date}
                  onChange={(e) => setPaymentForm({ ...paymentForm, transaction_date: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                  required
                />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900">
                <AlertCircle className="w-4 h-4 inline mr-1" />
                Ce paiement sera marqué "En attente" jusqu'à rapprochement bancaire.
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowPayment(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg">
                  Annuler
                </button>
                <button type="submit" disabled={loading} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50">
                  {loading ? 'Enregistrement...' : 'Enregistrer le paiement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
