'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useProfile } from '@/hooks/useHotel';
import {
  Landmark, Plus, RefreshCw, TrendingUp, TrendingDown, Clock, CheckCircle,
  X, Save, AlertCircle, Filter, Search, Edit2, Trash2, Loader2,
  ArrowDownCircle, ArrowUpCircle, Receipt, DollarSign, Calendar,
  Printer, FileText, QrCode
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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

// ✅ Helper pour formater les montants
const money = (n: number) => Number(n || 0).toLocaleString('fr-FR');

// ✅ Helper pour les types de transaction
const getTransactionTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    TRANSFER: 'Virement',
    CHECK: 'Chèque',
    DEPOSIT: 'Dépôt',
    MOBILE_MONEY: 'Mobile Money',
    CARD: 'Carte bancaire',
    CASH: 'Espèces'
  };
  return labels[type] || type;
};

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
      const { error: transError } = await supabase
        .from('bank_transactions')
        .update({ 
          status: 'RECONCILED',
          reconciled_at: new Date().toISOString()
        })
        .eq('id', transactionId);

      if (transError) throw transError;

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

  // ✅ NOUVEAU : Impression d'un reçu de transaction (Dépôt ou Paiement)
  const handlePrintTransaction = (transaction: BankTransaction) => {
    if (!selectedAccount) return;
    
    const isDeposit = transaction.direction === 'INCOME';
    const reportId = `TX-${transaction.id.slice(0, 8).toUpperCase()}`;
    const generatedAt = new Date().toISOString();
    const qrData = `VIDALOCA_BANK|${reportId}|${transaction.reference}|${transaction.amount}|${generatedAt}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrData)}`;
    
    const printWindow = window.open('', '_blank', 'width=800,height=1000');
    if (!printWindow) { alert('Veuillez autoriser les popups.'); return; }
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${isDeposit ? 'Reçu de Dépôt' : 'Reçu de Paiement'} - ${transaction.reference}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: Arial, sans-serif; font-size: 12px; color: #1f2937; margin: 0; padding: 20px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${isDeposit ? '#059669' : '#dc2626'}; padding-bottom: 15px; margin-bottom: 20px; }
          .header-left h1 { color: ${isDeposit ? '#059669' : '#dc2626'}; margin: 0; font-size: 24px; }
          .header-left .subtitle { color: #6b7280; font-size: 12px; margin-top: 4px; }
          .header-left .title { font-size: 18px; font-weight: bold; margin-top: 10px; color: #1f2937; }
          .qr-box { text-align: center; }
          .qr-box img { border: 2px solid #e2e8f0; padding: 5px; border-radius: 8px; }
          .qr-box small { display: block; margin-top: 5px; color: #6b7280; font-size: 10px; }
          .section { margin-bottom: 20px; }
          .section-title { font-size: 14px; font-weight: bold; color: ${isDeposit ? '#059669' : '#dc2626'}; border-bottom: 2px solid ${isDeposit ? '#059669' : '#dc2626'}; padding-bottom: 5px; margin-bottom: 10px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px; }
          .info-box { background: #f9fafb; padding: 10px; border-radius: 6px; border-left: 3px solid ${isDeposit ? '#059669' : '#dc2626'}; }
          .info-box label { font-size: 10px; color: #6b7280; display: block; margin-bottom: 3px; text-transform: uppercase; font-weight: bold; }
          .info-box value { font-size: 13px; color: #1f2937; font-weight: bold; }
          .highlight-box { background: ${isDeposit ? '#ecfdf5' : '#fef2f2'}; border: 2px solid ${isDeposit ? '#059669' : '#dc2626'}; padding: 15px; border-radius: 8px; margin: 15px 0; text-align: center; }
          .highlight-box .label { font-size: 11px; color: #6b7280; margin-bottom: 3px; }
          .highlight-box .value { font-size: 24px; font-weight: bold; color: ${isDeposit ? '#059669' : '#dc2626'}; }
          .footer { margin-top: 40px; border-top: 2px solid #e5e7eb; padding-top: 15px; }
          .authenticity { background: #fef3c7; border: 1px solid #f59e0b; padding: 10px; border-radius: 6px; margin-bottom: 20px; font-size: 11px; color: #92400e; text-align: center; }
          .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 30px; }
          .signature-box { border-top: 1px solid #1f2937; padding-top: 5px; text-align: center; font-size: 11px; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          @media print { body { padding: 0; } .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-left">
            <h1>🏦 LA VIDA-LOCA</h1>
            <div class="subtitle">Hôtel • Resto • Lounge</div>
            <div class="subtitle">📍 Rue 15.293, Ouaga 2000, Ouagadougou</div>
            <div class="subtitle">📞 +226 01 04 11 11</div>
            <div class="title">${isDeposit ? '📥 REÇU DE DÉPÔT BANCAIRE' : '📤 REÇU DE PAIEMENT BANCAIRE'}</div>
            <div class="subtitle">N° ${reportId}</div>
          </div>
          <div class="qr-box">
            <img src="${qrUrl}" alt="QR Code d'authenticité" />
            <small>Document unique<br/>ID: ${reportId}</small>
          </div>
        </div>

        <div class="section">
          <div class="section-title">📋 Informations du compte</div>
          <div class="info-grid">
            <div class="info-box"><label>Banque</label><value>${selectedAccount.bank_name}</value></div>
            <div class="info-box"><label>Titulaire</label><value>${selectedAccount.account_name}</value></div>
            <div class="info-box"><label>N° de compte</label><value>${selectedAccount.account_number || '—'}</value></div>
            <div class="info-box"><label>Type</label><value>${selectedAccount.account_type === 'CHECKING' ? 'Courant' : selectedAccount.account_type === 'SAVINGS' ? 'Épargne' : 'Carte de crédit'}</value></div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">💰 Détails de la transaction</div>
          <div class="info-grid">
            <div class="info-box"><label>Référence</label><value>${transaction.reference}</value></div>
            <div class="info-box"><label>Type</label><value>${getTransactionTypeLabel(transaction.transaction_type)}</value></div>
            <div class="info-box"><label>Date</label><value>${new Date(transaction.transaction_date).toLocaleDateString('fr-FR')}</value></div>
            <div class="info-box"><label>Statut</label><value>${transaction.status === 'RECONCILED' ? '✅ Rapprochée' : '⏳ En attente'}</value></div>
            ${transaction.counterparty ? `<div class="info-box"><label>Bénéficiaire</label><value>${transaction.counterparty}</value></div>` : ''}
            ${transaction.source_table ? `<div class="info-box"><label>Source</label><value>${transaction.source_table}</value></div>` : ''}
          </div>
          ${transaction.description ? `
          <div class="info-box" style="margin-bottom: 15px;">
            <label>Description</label>
            <value style="display:block; margin-top: 3px;">${transaction.description}</value>
          </div>` : ''}
        </div>

        <div class="highlight-box">
          <div class="label">MONTANT ${isDeposit ? 'DÉPOSÉ' : 'DÉBITÉ'}</div>
          <div class="value">${money(transaction.amount)} FCFA</div>
        </div>

        ${transaction.notes ? `
        <div class="section">
          <div class="section-title">📝 Notes</div>
          <div style="background: #f9fafb; padding: 10px; border-radius: 6px; border-left: 3px solid #6b7280;">
            ${transaction.notes}
          </div>
        </div>` : ''}

        <div class="footer">
          <div class="authenticity">
            🔐 <strong>Document certifié unique</strong> — Ce reçu est protégé par un QR code d'authenticité. Scannez-le pour vérifier l'intégrité des données.
          </div>
          <div class="signatures">
            <div><div class="signature-box"><div style="height: 50px;"></div><div><b>Caissier(ère)</b></div><div style="font-size: 10px; color: #6b7280;">Nom et signature</div></div></div>
            <div><div class="signature-box"><div style="height: 50px;"></div><div><b>Responsable / Directeur</b></div><div style="font-size: 10px; color: #6b7280;">Nom et signature</div></div></div>
          </div>
          <div class="text-center" style="margin-top: 20px; font-size: 10px; color: #6b7280;">
            Document généré le ${new Date().toLocaleString('fr-FR')} • LA VIDA-LOCA PMS
          </div>
        </div>

        <div class="no-print" style="text-align: center; margin-top: 30px;">
          <button onclick="window.print()" style="padding: 12px 30px; background: ${isDeposit ? '#059669' : '#dc2626'}; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: bold;">🖨️ Imprimer le reçu</button>
          <button onclick="window.close()" style="padding: 12px 30px; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; margin-left: 10px;">Fermer</button>
        </div>
        <script>window.onload = function() { setTimeout(function() { window.print(); }, 500); };</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // ✅ NOUVEAU : Relevé de compte complet avec QR Code
  const handlePrintAccountStatement = () => {
    if (!selectedAccount) return;
    
    const reportId = `REL-${selectedAccount.id.slice(0, 8).toUpperCase()}-${Date.now().toString().slice(-6)}`;
    const generatedAt = new Date().toISOString();
    const qrData = `VIDALOCA_BANK_STATEMENT|${reportId}|${selectedAccount.account_number}|${stats.theoreticalBalance}|${generatedAt}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrData)}`;
    
    // Stats pour le relevé
    const totalDeposits = transactions.filter(t => t.direction === 'INCOME').reduce((sum, t) => sum + Number(t.amount), 0);
    const totalPayments = transactions.filter(t => t.direction === 'EXPENSE').reduce((sum, t) => sum + Number(t.amount), 0);
    const pendingCount = transactions.filter(t => t.status === 'PENDING').length;
    const reconciledCount = transactions.filter(t => t.status === 'RECONCILED').length;
    
    const printWindow = window.open('', '_blank', 'width=900,height=1200');
    if (!printWindow) { alert('Veuillez autoriser les popups.'); return; }
    
    const transactionsRows = transactions.map(t => `
      <tr>
        <td>${new Date(t.transaction_date).toLocaleDateString('fr-FR')}</td>
        <td><strong>${t.reference}</strong></td>
        <td>${getTransactionTypeLabel(t.transaction_type)}</td>
        <td>${t.description || '—'}</td>
        <td style="text-align:right; color: ${t.direction === 'INCOME' ? '#059669' : '#dc2626'}; font-weight: bold;">
          ${t.direction === 'INCOME' ? '+' : '-'}${money(t.amount)} F
        </td>
        <td style="text-align:center;">
          ${t.status === 'RECONCILED' ? '<span style="color:#059669;">✅</span>' : '<span style="color:#d97706;">⏳</span>'}
        </td>
      </tr>
    `).join('');
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Relevé de Compte - ${selectedAccount.bank_name}</title>
        <style>
          @page { size: A4 landscape; margin: 12mm; }
          body { font-family: Arial, sans-serif; font-size: 10px; color: #1f2937; margin: 0; padding: 15px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1e40af; padding-bottom: 12px; margin-bottom: 15px; }
          .header-left h1 { color: #1e40af; margin: 0; font-size: 22px; }
          .header-left .subtitle { color: #6b7280; font-size: 11px; margin-top: 3px; }
          .header-left .title { font-size: 16px; font-weight: bold; margin-top: 8px; color: #1f2937; }
          .qr-box { text-align: center; }
          .qr-box img { border: 2px solid #e2e8f0; padding: 4px; border-radius: 6px; }
          .qr-box small { display: block; margin-top: 3px; color: #6b7280; font-size: 9px; }
          .section { margin-bottom: 15px; }
          .section-title { font-size: 12px; font-weight: bold; color: #1e40af; border-bottom: 2px solid #1e40af; padding-bottom: 4px; margin-bottom: 8px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px; }
          .info-box { background: #f9fafb; padding: 8px; border-radius: 5px; border-left: 3px solid #1e40af; }
          .info-box label { font-size: 9px; color: #6b7280; display: block; margin-bottom: 2px; text-transform: uppercase; font-weight: bold; }
          .info-box value { font-size: 11px; color: #1f2937; font-weight: bold; }
          .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0; }
          .stat-card { background: #f9fafb; padding: 10px; border-radius: 6px; text-align: center; border: 1px solid #e5e7eb; }
          .stat-value { font-size: 18px; font-weight: bold; color: #1e40af; }
          .stat-label { font-size: 9px; color: #6b7280; margin-top: 3px; }
          .stat-card.income { background: #ecfdf5; border-color: #059669; }
          .stat-card.income .stat-value { color: #059669; }
          .stat-card.expense { background: #fef2f2; border-color: #dc2626; }
          .stat-card.expense .stat-value { color: #dc2626; }
          .stat-card.balance { background: #eff6ff; border-color: #1e40af; }
          .stat-card.balance .stat-value { color: #1e40af; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 9px; }
          th { background: #1e40af; color: white; padding: 6px; text-align: left; font-size: 9px; }
          td { padding: 5px 6px; border-bottom: 1px solid #e5e7eb; }
          tr:nth-child(even) { background: #f9fafb; }
          .footer { margin-top: 30px; border-top: 2px solid #e5e7eb; padding-top: 12px; }
          .authenticity { background: #fef3c7; border: 1px solid #f59e0b; padding: 8px; border-radius: 5px; margin-bottom: 15px; font-size: 10px; color: #92400e; text-align: center; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          @media print { body { padding: 0; } .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-left">
            <h1>🏦 LA VIDA-LOCA</h1>
            <div class="subtitle">Hôtel • Resto • Lounge</div>
            <div class="subtitle">📍 Rue 15.293, Ouaga 2000, Ouagadougou</div>
            <div class="subtitle">📞 +226 01 04 11 11</div>
            <div class="title">📊 RELEVÉ DE COMPTE BANCAIRE</div>
            <div class="subtitle">N° ${reportId}</div>
          </div>
          <div class="qr-box">
            <img src="${qrUrl}" alt="QR Code d'authenticité" />
            <small>Document unique<br/>ID: ${reportId}</small>
          </div>
        </div>

        <div class="section">
          <div class="section-title">📋 Informations du compte</div>
          <div class="info-grid">
            <div class="info-box"><label>Banque</label><value>${selectedAccount.bank_name}</value></div>
            <div class="info-box"><label>Titulaire</label><value>${selectedAccount.account_name}</value></div>
            <div class="info-box"><label>N° de compte</label><value>${selectedAccount.account_number || '—'}</value></div>
            <div class="info-box"><label>Type</label><value>${selectedAccount.account_type === 'CHECKING' ? 'Courant' : selectedAccount.account_type === 'SAVINGS' ? 'Épargne' : 'Carte de crédit'}</value></div>
            <div class="info-box"><label>Devise</label><value>${selectedAccount.currency}</value></div>
            <div class="info-box"><label>Période</label><value>${transactions.length > 0 ? new Date(transactions[transactions.length - 1].transaction_date).toLocaleDateString('fr-FR') : '—'} au ${transactions.length > 0 ? new Date(transactions[0].transaction_date).toLocaleDateString('fr-FR') : '—'}</value></div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">💰 Résumé financier</div>
          <div class="stats-grid">
            <div class="stat-card balance">
              <div class="stat-value">${money(stats.theoreticalBalance)} F</div>
              <div class="stat-label">Solde actuel</div>
            </div>
            <div class="stat-card income">
              <div class="stat-value">${money(totalDeposits)} F</div>
              <div class="stat-label">Total dépôts</div>
            </div>
            <div class="stat-card expense">
              <div class="stat-value">${money(totalPayments)} F</div>
              <div class="stat-label">Total paiements</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${transactions.length}</div>
              <div class="stat-label">Transactions (${reconciledCount}✅ / ${pendingCount}⏳)</div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">📜 Détail des transactions (${transactions.length})</div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Référence</th>
                <th>Type</th>
                <th>Description</th>
                <th style="text-align:right;">Montant</th>
                <th style="text-align:center;">Statut</th>
              </tr>
            </thead>
            <tbody>
              ${transactionsRows}
            </tbody>
          </table>
        </div>

        <div class="footer">
          <div class="authenticity">
            🔐 <strong>Document certifié unique</strong> — Ce relevé est protégé par un QR code d'authenticité. Scannez-le pour vérifier l'intégrité des données.
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 20px;">
            <div><div style="border-top: 1px solid #1f2937; padding-top: 5px; text-align: center; font-size: 10px;"><div style="height: 40px;"></div><b>Responsable Financier</b><div style="font-size: 9px; color: #6b7280;">Nom et signature</div></div></div>
            <div><div style="border-top: 1px solid #1f2937; padding-top: 5px; text-align: center; font-size: 10px;"><div style="height: 40px;"></div><b>Directeur Général</b><div style="font-size: 9px; color: #6b7280;">Nom et signature</div></div></div>
          </div>
          <div class="text-center" style="margin-top: 15px; font-size: 9px; color: #6b7280;">
            Document généré le ${new Date().toLocaleString('fr-FR')} • LA VIDA-LOCA PMS • ${transactions.length} transaction(s)
          </div>
        </div>

        <div class="no-print" style="text-align: center; margin-top: 20px;">
          <button onclick="window.print()" style="padding: 10px 25px; background: #1e40af; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold;">🖨️ Imprimer le relevé</button>
          <button onclick="window.close()" style="padding: 10px 25px; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; margin-left: 10px;">Fermer</button>
        </div>
        <script>window.onload = function() { setTimeout(function() { window.print(); }, 500); };</script>
      </body>
      </html>
    `);
    printWindow.document.close();
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
          {/* ✅ NOUVEAU : Bouton Relevé PDF */}
          <button
            onClick={handlePrintAccountStatement}
            disabled={!selectedAccountId || transactions.length === 0}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white px-4 py-2 rounded-lg text-sm font-medium"
            title="Générer le relevé de compte PDF avec QR Code"
          >
            <FileText className="w-4 h-4" /> Relevé PDF
          </button>
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
                        {getTransactionTypeLabel(trans.transaction_type)}
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
                      <div className="flex items-center justify-center gap-1">
                        {/* ✅ NOUVEAU : Bouton Imprimer reçu */}
                        <button
                          onClick={() => handlePrintTransaction(trans)}
                          className="text-indigo-600 hover:bg-indigo-50 p-1.5 rounded"
                          title="Imprimer le reçu PDF"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        {trans.status === 'PENDING' && (
                          <button
                            onClick={() => handleReconcile(trans.id)}
                            className="text-emerald-600 hover:bg-emerald-50 p-1.5 rounded"
                            title="Rapprocher"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}
                      </div>
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
