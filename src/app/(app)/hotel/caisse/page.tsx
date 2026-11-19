'use client';
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useProfile } from '@/hooks/useHotel';
import {
  DollarSign, TrendingUp, TrendingDown, ShoppingCart, History,
  Calendar, CheckCircle, AlertCircle, X, Printer, FileText,
  Loader2, Lock, Play, Plus, ReceiptText, RefreshCw, Minus
} from 'lucide-react';

interface Transaction {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  category: string;
  amount: number;
  payment_method: string;
  provider_name: string;
  description: string;
  reference_id: string;
  reference_table: string;
  created_at: string;
  status: string;
  amount_received?: number;
  change_amount?: number;
  receipt_number?: string;
  customer_name?: string;
  room_number?: string;
  notes?: string;
}

interface CashSession {
  id: string;
  site_id: string;
  opened_by: string;
  opening_float: number;
  status: string;
  opened_at: string;
  closed_at?: string;
  counted_amount?: number;
  expected_amount?: number;
  difference?: number;
}

const categoryIcons: Record<string, string> = {
  ROOM_PAYMENT: '🛏️', CHECKOUT_PAYMENT: '🛏️', MAINTENANCE: '🔧',
  FB_PAYMENT: '🍽️', SUPPLIES: '🧴', SALARY: '👷', UTILITIES: '⚡',
  TRANSPORT: '🚗', FOOD: '🥘', OTHER_INCOME: '💰', OTHER_EXPENSE: '📦',
};

const categoryLabels: Record<string, string> = {
  ROOM_PAYMENT: 'Paiement chambre', CHECKOUT_PAYMENT: 'Check-out', MAINTENANCE: 'Maintenance',
  FB_PAYMENT: 'Restauration', SUPPLIES: 'Fournitures', SALARY: 'Salaires', UTILITIES: 'Factures',
  TRANSPORT: 'Transport', FOOD: 'Nourriture', OTHER_INCOME: 'Autre revenu', OTHER_EXPENSE: 'Autre dépense',
};

const paymentMethodLabels: Record<string, string> = {
  CASH: '💵 Espèces', CARD: '💳 Carte bancaire', MOBILE_MONEY: '📱 Mobile Money',
  CHECK: '📝 Chèque', BANK_TRANSFER: '🏦 Virement',
};

// ✅ Helper pour gérer les formats de paiement variés
const getPaymentLabel = (method: string) => {
  if (paymentMethodLabels[method]) return paymentMethodLabels[method];
  const m = method?.toLowerCase() || '';
  if (m.includes('espèce') || m.includes('cash')) return '💵 Espèces';
  if (m.includes('chèque') || m.includes('cheque')) return '📝 Chèque';
  if (m.includes('virement')) return '🏦 Virement';
  if (m.includes('mobile')) return '📱 Mobile Money';
  if (m.includes('carte')) return '💳 Carte bancaire';
  return method || '💵 Espèces';
};

const expenseCategories = [
  { id: 'MAINTENANCE', label: 'Maintenance', icon: '🔧' },
  { id: 'SUPPLIES', label: 'Fournitures', icon: '🧴' },
  { id: 'UTILITIES', label: 'Factures (eau/élec)', icon: '⚡' },
  { id: 'FOOD', label: 'Nourriture', icon: '🥘' },
  { id: 'TRANSPORT', label: 'Transport', icon: '🚗' },
  { id: 'SALARY', label: 'Salaires', icon: '👷' },
  { id: 'OTHER_EXPENSE', label: 'Autre', icon: '📦' },
];

const getWeekRange = () => {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday.toISOString().split('T')[0], end: sunday.toISOString().split('T')[0] };
};

const formatFCFA = (amount: number) => `${Number(amount || 0).toLocaleString('fr-FR')} FCFA`;

export default function HotelCaissePage() {
  const supabase = createClient();
  const { siteId, loading: profileLoading } = useProfile();
  
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [pendingTransactions, setPendingTransactions] = useState<Transaction[]>([]);
  const [paidTransactions, setPaidTransactions] = useState<Transaction[]>([]);
  const [session, setSession] = useState<CashSession | null>(null);
  const [showOpenSession, setShowOpenSession] = useState(false);
  const [showCloseSession, setShowCloseSession] = useState(false);
  const [openingFloat, setOpeningFloat] = useState('15000');
  const [countedAmount, setCountedAmount] = useState('');
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [amountReceived, setAmountReceived] = useState(0);
  const [taxRate] = useState(18);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);
  
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('OTHER_EXPENSE');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseProvider, setExpenseProvider] = useState('');
  const [expenseNotes, setExpenseNotes] = useState('');
  
  const week = getWeekRange();
  const [startDate, setStartDate] = useState(week.start);
  const [endDate, setEndDate] = useState(week.end);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (siteId) {
      loadSession();
      loadPendingTransactions();
      loadPaidTransactions();
    }
  }, [siteId, startDate, endDate]);

  const loadSession = async () => {
    if (!siteId) return;
    const { data } = await supabase.from('cash_sessions').select('*').eq('site_id', siteId).eq('status', 'OPEN').order('opened_at', { ascending: false }).limit(1).maybeSingle();
    setSession(data || null);
  };

  const enrichTransaction = async (t: any): Promise<Transaction> => {
    let name = t.provider_name || '';
    let room_number = '';
    let amount = Number(t.amount) || 0;

    if (/^\d+$/.test(name)) {
      const corruptedAmount = Number(name);
      if (amount === 0 && corruptedAmount > 0) amount = corruptedAmount;
      name = t.description || 'Prestataire';
    }

    if (t.reference_table === 'stays' && t.reference_id) {
      const { data: stay } = await supabase.from('stays').select('customer_id, room_id, customers(first_name, last_name), rooms(number)').eq('id', t.reference_id).maybeSingle();
      if (stay) {
        const cust = Array.isArray(stay.customers) ? stay.customers[0] : stay.customers;
        const room = Array.isArray(stay.rooms) ? stay.rooms[0] : stay.rooms;
        name = `${cust?.last_name || ''} ${cust?.first_name || ''}`.trim() || name;
        room_number = room?.number || '';
      }
    }

    if (t.reference_table === 'maintenance_documents' && t.reference_id) {
      const { data: doc } = await supabase.from('maintenance_documents').select('provider_name, total_amount, amount').eq('id', t.reference_id).maybeSingle();
      if (doc) {
        const docAmount = Number(doc.total_amount || doc.amount) || 0;
        if (docAmount > 0 && amount < docAmount) amount = docAmount;
        if (doc.provider_name && !/^\d+$/.test(doc.provider_name)) name = doc.provider_name;
      }
    }
    return { ...t, amount, customer_name: name, room_number };
  };

  const loadPendingTransactions = async () => {
    if (!siteId) return;
    const { data } = await supabase.from('cash_transactions').select('*').eq('site_id', siteId).eq('status', 'PENDING').order('created_at', { ascending: true });
    if (data) setPendingTransactions(await Promise.all(data.map(enrichTransaction)));
  };

  const loadPaidTransactions = async () => {
    if (!siteId) return;
    const startOfDay = new Date(startDate); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(endDate); endOfDay.setHours(23, 59, 59, 999);
    const { data } = await supabase.from('cash_transactions').select('*').eq('site_id', siteId).eq('status', 'PAID').gte('created_at', startOfDay.toISOString()).lte('created_at', endOfDay.toISOString()).order('created_at', { ascending: false });
    if (data) setPaidTransactions(await Promise.all(data.map(enrichTransaction)));
  };

  const handleOpenSession = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.from('cash_sessions').insert({
        site_id: siteId, opened_by: user?.id, opening_float: Number(openingFloat) || 0, status: 'OPEN', opened_at: new Date().toISOString(),
      }).select().single();
      if (error) throw error;
      setSession(data);
      setShowOpenSession(false);
      alert('✅ Caisse ouverte avec succès !');
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
    setLoading(false);
  };

  const handleCloseSession = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const counted = Number(countedAmount) || 0;
      const expected = session.opening_float + 
        paidTransactions.filter(t => t.type === 'INCOME' && t.payment_method === 'CASH').reduce((s, t) => s + t.amount, 0) -
        paidTransactions.filter(t => t.type === 'EXPENSE' && t.payment_method === 'CASH').reduce((s, t) => s + t.amount, 0);
      const difference = counted - expected;

      const { error } = await supabase.from('cash_sessions').update({
        status: 'CLOSED', closed_at: new Date().toISOString(), counted_amount: counted, expected_amount: expected, difference: difference,
      }).eq('id', session.id);
      if (error) throw error;

      alert(`✅ Caisse clôturée !\n\nMontant attendu: ${expected.toLocaleString('fr-FR')} FCFA\nMontant compté: ${counted.toLocaleString('fr-FR')} FCFA\nÉcart: ${difference > 0 ? '+' : ''}${difference.toLocaleString('fr-FR')} FCFA`);
      setSession(null);
      setShowCloseSession(false);
      setCountedAmount('');
      loadSession();
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
    setLoading(false);
  };

  const handlePrintClosingReport = () => {
    if (!session) return;
    
    const counted = Number(countedAmount) || 0;
    const expected = session.opening_float + 
      paidTransactions.filter(t => t.type === 'INCOME' && t.payment_method === 'CASH').reduce((s, t) => s + t.amount, 0) -
      paidTransactions.filter(t => t.type === 'EXPENSE' && t.payment_method === 'CASH').reduce((s, t) => s + t.amount, 0);
    const difference = counted - expected;

    const totalIncome = paidTransactions.filter(t => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0);
    const totalExpense = paidTransactions.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0);
    const netBalance = totalIncome - totalExpense;

    const incomeByMethod: Record<string, number> = {};
    paidTransactions.filter(t => t.type === 'INCOME').forEach(t => {
      incomeByMethod[t.payment_method] = (incomeByMethod[t.payment_method] || 0) + t.amount;
    });

    const expenseByCategory: Record<string, number> = {};
    paidTransactions.filter(t => t.type === 'EXPENSE').forEach(t => {
      expenseByCategory[t.category] = (expenseByCategory[t.category] || 0) + t.amount;
    });

    // ✅ QR Code unique pour l'authenticité
    const reportId = session.id.slice(0, 8).toUpperCase();
    const generatedAt = new Date().toISOString();
    const qrData = `VIDALOCA|${reportId}|${generatedAt}|${totalIncome}|${totalExpense}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrData)}`;

    const printWindow = window.open('', '_blank', 'width=900,height=1200');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Rapport de fermeture de caisse - ${reportId}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: Arial, sans-serif; font-size: 11px; color: #1f2937; margin: 0; padding: 20px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #059669; padding-bottom: 15px; margin-bottom: 20px; }
          .header-left h1 { color: #059669; margin: 0; font-size: 24px; }
          .header-left .subtitle { color: #6b7280; font-size: 12px; margin-top: 4px; }
          .header-left .title { font-size: 18px; font-weight: bold; margin-top: 10px; color: #1f2937; }
          .qr-box { text-align: center; }
          .qr-box img { border: 2px solid #e2e8f0; padding: 5px; border-radius: 8px; }
          .qr-box small { display: block; margin-top: 5px; color: #6b7280; font-size: 10px; }
          .section { margin-bottom: 20px; }
          .section-title { font-size: 14px; font-weight: bold; color: #059669; border-bottom: 2px solid #059669; padding-bottom: 5px; margin-bottom: 10px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px; }
          .info-box { background: #f9fafb; padding: 10px; border-radius: 6px; border-left: 3px solid #059669; }
          .info-box label { font-size: 10px; color: #6b7280; display: block; margin-bottom: 3px; text-transform: uppercase; font-weight: bold; }
          .info-box value { font-size: 13px; color: #1f2937; font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
          th { background: #059669; color: white; padding: 8px; text-align: left; font-size: 11px; }
          td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
          tr:nth-child(even) { background: #f9fafb; }
          .total-row { background: #ecfdf5 !important; font-weight: bold; }
          .total-row td { border-top: 2px solid #059669; padding: 10px 8px; }
          .highlight-box { background: #ecfdf5; border: 2px solid #059669; padding: 12px; border-radius: 8px; margin: 15px 0; }
          .highlight-box.danger { background: #fef2f2; border-color: #dc2626; }
          .highlight-box.warning { background: #fffbeb; border-color: #d97706; }
          .highlight-box .label { font-size: 11px; color: #6b7280; margin-bottom: 3px; }
          .highlight-box .value { font-size: 18px; font-weight: bold; color: #059669; }
          .highlight-box.danger .value { color: #dc2626; }
          .highlight-box.warning .value { color: #d97706; }
          .footer { margin-top: 40px; border-top: 2px solid #e5e7eb; padding-top: 15px; }
          .authenticity { background: #fef3c7; border: 1px solid #f59e0b; padding: 10px; border-radius: 6px; margin-bottom: 20px; font-size: 11px; color: #92400e; text-align: center; }
          .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 30px; }
          .signature-box { border-top: 1px solid #1f2937; padding-top: 5px; text-align: center; font-size: 11px; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: bold; }
          .badge-income { background: #d1fae5; color: #065f46; }
          .badge-expense { background: #fee2e2; color: #991b1b; }
          @media print { body { padding: 0; } .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-left">
            <h1>🌴 LA VIDA-LOCA</h1>
            <div class="subtitle">Hôtel • Resto • Lounge</div>
            <div class="subtitle">📍 Rue 15.293, Ouaga 2000, Ouagadougou</div>
            <div class="subtitle">📞 +226 01 04 11 11</div>
            <div class="title">📊 RAPPORT DE FERMETURE DE CAISSE</div>
            <div class="subtitle">N° Session: ${reportId}</div>
          </div>
          <div class="qr-box">
            <img src="${qrUrl}" alt="QR Code d'authenticité" />
            <small>Document unique<br/>ID: ${reportId}</small>
          </div>
        </div>

        <div class="section">
          <div class="section-title">📋 Informations de session</div>
          <div class="info-grid">
            <div class="info-box"><label>Date d'ouverture</label><value>${new Date(session.opened_at).toLocaleString('fr-FR')}</value></div>
            <div class="info-box"><label>Date de fermeture</label><value>${new Date().toLocaleString('fr-FR')}</value></div>
            <div class="info-box"><label>Fond de caisse initial</label><value>${formatFCFA(session.opening_float)}</value></div>
            <div class="info-box"><label>Nombre de transactions</label><value>${paidTransactions.length} opération(s)</value></div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">💰 Récapitulatif financier</div>
          <div class="info-grid">
            <div class="highlight-box"><div class="label">Total encaissé</div><div class="value">${formatFCFA(totalIncome)}</div></div>
            <div class="highlight-box danger"><div class="label">Total dépensé</div><div class="value">${formatFCFA(totalExpense)}</div></div>
            <div class="highlight-box"><div class="label">Solde net de la session</div><div class="value">${formatFCFA(netBalance)}</div></div>
            <div class="highlight-box warning"><div class="label">Fond de caisse + Solde net</div><div class="value">${formatFCFA(session.opening_float + netBalance)}</div></div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">💳 Détail des encaissements par mode de paiement</div>
          <table>
            <thead><tr><th>Mode de paiement</th><th>Nombre</th><th class="text-right">Montant</th></tr></thead>
            <tbody>
              ${Object.entries(incomeByMethod).map(([method, amount]) => {
                const count = paidTransactions.filter(t => t.type === 'INCOME' && t.payment_method === method).length;
                return `<tr><td>${getPaymentLabel(method)}</td><td>${count} transaction(s)</td><td class="text-right">${formatFCFA(amount)}</td></tr>`;
              }).join('')}
              <tr class="total-row"><td colspan="2">TOTAL ENCAISSÉ</td><td class="text-right">${formatFCFA(totalIncome)}</td></tr>
            </tbody>
          </table>
        </div>

        <div class="section">
          <div class="section-title">📉 Détail des dépenses par catégorie</div>
          <table>
            <thead><tr><th>Catégorie</th><th>Nombre</th><th class="text-right">Montant</th></tr></thead>
            <tbody>
              ${Object.entries(expenseByCategory).map(([cat, amount]) => {
                const count = paidTransactions.filter(t => t.type === 'EXPENSE' && t.category === cat).length;
                return `<tr><td>${categoryIcons[cat] || '📦'} ${categoryLabels[cat] || cat}</td><td>${count} dépense(s)</td><td class="text-right">${formatFCFA(amount)}</td></tr>`;
              }).join('')}
              <tr class="total-row"><td colspan="2">TOTAL DÉPENSÉ</td><td class="text-right">${formatFCFA(totalExpense)}</td></tr>
            </tbody>
          </table>
        </div>

        <div class="section">
          <div class="section-title">🔒 Clôture de caisse</div>
          <div class="info-grid">
            <div class="highlight-box"><div class="label">💰 Montant théorique attendu</div><div class="value">${formatFCFA(expected)}</div></div>
            <div class="highlight-box"><div class="label">📦 Montant physiquement compté</div><div class="value">${formatFCFA(counted)}</div></div>
          </div>
          <div class="highlight-box ${difference === 0 ? '' : difference > 0 ? 'warning' : 'danger'}" style="background: ${difference === 0 ? '#ecfdf5' : difference > 0 ? '#fffbeb' : '#fef2f2'}; border-color: ${difference === 0 ? '#059669' : difference > 0 ? '#d97706' : '#dc2626'};">
            <div class="label">⚖️ Écart de caisse</div>
            <div class="value" style="color: ${difference === 0 ? '#059669' : difference > 0 ? '#d97706' : '#dc2626'};">
              ${difference === 0 ? '✅ AUCUN ÉCART' : (difference > 0 ? '+' : '') + formatFCFA(difference)}
              ${difference > 0 ? '(Excédent)' : difference < 0 ? '(Manquant)' : ''}
            </div>
          </div>
        </div>

        <div class="footer">
          <div class="authenticity">
            🔐 <strong>Document certifié unique</strong> — Ce rapport est protégé par un QR code d'authenticité. Scannez-le pour vérifier l'intégrité des données.
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
          <button onclick="window.print()" style="padding: 12px 30px; background: #059669; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: bold;">🖨️ Imprimer le rapport</button>
          <button onclick="window.close()" style="padding: 12px 30px; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; margin-left: 10px;">Fermer</button>
        </div>
        <script>window.onload = function() { setTimeout(function() { window.print(); }, 500); };</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleAddExpense = async () => {
    if (!expenseAmount || parseFloat(expenseAmount) <= 0) { alert('Veuillez saisir un montant valide.'); return; }
    if (!expenseDescription.trim()) { alert('Veuillez décrire la dépense.'); return; }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('cash_transactions').insert({
        site_id: siteId, type: 'EXPENSE', category: expenseCategory, amount: parseFloat(expenseAmount),
        payment_method: 'CASH', status: 'PAID', provider_name: expenseProvider || 'Prestataire',
        description: expenseDescription, notes: expenseNotes, received_by: user?.id, transaction_date: new Date().toISOString(),
      });
      if (error) throw error;
      alert('✅ Dépense enregistrée avec succès !');
      setShowExpenseForm(false);
      setExpenseAmount(''); setExpenseCategory('OTHER_EXPENSE'); setExpenseDescription(''); setExpenseProvider(''); setExpenseNotes('');
      await loadPendingTransactions();
      await loadPaidTransactions();
    } catch (error: any) {
      console.error('Erreur enregistrement dépense:', error);
      alert(`Erreur: ${error.message}`);
    }
    setLoading(false);
  };

  const handleOpenPayment = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setAmountReceived(Number(transaction.amount) || 0);
    setShowPayment(true);
  };

  const handleProcessPayment = async () => {
    if (!selectedTransaction) return;
    // ✅ NOUVEAU : Empêcher l'encaissement si la caisse est fermée
    if (!session) {
      alert('⚠️ La caisse est fermée. Veuillez d\'abord ouvrir la caisse pour effectuer un encaissement ou un paiement.');
      setShowPayment(false);
      setSelectedTransaction(null);
      return;
    }
    if (amountReceived < selectedTransaction.amount) { alert('Le montant est insuffisant.'); return; }
    setLoading(true);
    try {
      const change = amountReceived - selectedTransaction.amount;
      const receiptNumber = `REC-${Date.now().toString().slice(-8)}`;
      const { error } = await supabase.from('cash_transactions').update({
        status: 'PAID', amount_received: amountReceived, change_amount: change, receipt_number: receiptNumber,
      }).eq('id', selectedTransaction.id);
      if (error) throw error;

      const netAmount = selectedTransaction.amount * 100 / (100 + taxRate);
      setReceiptData({
        ...selectedTransaction, amount_received: amountReceived, change_amount: change, receipt_number: receiptNumber,
        tax_rate: taxRate, tax_amount: selectedTransaction.amount - netAmount, net_amount: netAmount, paid_at: new Date().toISOString(),
      });
      setShowPayment(false);
      setShowReceipt(true);
      setSelectedTransaction(null);
      loadPendingTransactions();
      loadPaidTransactions();
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
    setLoading(false);
  };

  const handlePrintReceipt = () => {
    const printContent = receiptRef.current;
    if (!printContent) return;
    const printWindow = window.open('', '_blank', 'width=300,height=600');
    if (!printWindow) return;
    const isExpense = receiptData.type === 'EXPENSE';
    printWindow.document.write(`<html><head><title>${isExpense ? 'Dépense' : 'Ticket'} ${receiptData.receipt_number}</title><style>body { font-family: 'Courier New', monospace; font-size: 12px; margin: 0; padding: 10px; width: 80mm; } .center { text-align: center; } .row { display: flex; justify-content: space-between; margin: 2px 0; }</style></head><body>${printContent.innerHTML}<script>window.onload = () => { window.print(); window.close(); }</script></body></html>`);
    printWindow.document.close();
  };

  const handlePrintInvoice = () => {
    if (!receiptData) return;
    const invoiceWindow = window.open('', '_blank');
    if (!invoiceWindow) return;
    const isExpense = receiptData.type === 'EXPENSE';
    const color = isExpense ? '#dc2626' : '#1e3a8a';
    invoiceWindow.document.write(`<html><head><title>${isExpense ? 'Fiche de Dépense' : 'Facture'} ${receiptData.receipt_number}</title><style>body { font-family: Arial, sans-serif; margin: 40px; color: #333; } .header { display: flex; justify-content: space-between; border-bottom: 3px solid ${color}; padding-bottom: 20px; margin-bottom: 30px; } .company h1 { color: ${color}; margin: 0; } table { width: 100%; border-collapse: collapse; margin: 20px 0; } th { background: ${color}; color: white; padding: 12px; text-align: left; } td { padding: 12px; border-bottom: 1px solid #e2e8f0; } .totals { margin-left: auto; width: 300px; } .totals .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; } .totals .total { font-size: 18px; font-weight: bold; color: ${color}; border-top: 2px solid ${color}; padding-top: 10px; }</style></head><body><div class="header"><div class="company"><h1>LA VIDA-LOCA</h1><p>Rue 15.293, Ouaga 2000, Ouagadougou<br/>+226 01 04 11 11</p></div><div><h2>${isExpense ? 'FICHE DE DÉPENSE' : 'FACTURE'}</h2><p><strong>N°:</strong> ${receiptData.receipt_number || 'N/A'}</p><p><strong>Date:</strong> ${new Date(receiptData.paid_at).toLocaleDateString('fr-FR')}</p></div></div><p><strong>${isExpense ? 'Fournisseur' : 'Client'}:</strong> ${receiptData.provider_name || receiptData.customer_name || 'N/A'}</p>${receiptData.room_number ? `<p>Chambre: ${receiptData.room_number}</p>` : ''}<table><thead><tr><th>Description</th><th style="text-align:right">Montant</th></tr></thead><tbody><tr><td>${receiptData.description}</td><td style="text-align:right"><strong>${Number(receiptData.amount).toLocaleString('fr-FR')} FCFA</strong></td></tr></tbody></table><div class="totals"><div class="row"><span>Total</span><span>${Number(receiptData.amount).toLocaleString('fr-FR')} FCFA</span></div>${receiptData.amount_received ? `<div class="row"><span>Montant donné</span><span>${Number(receiptData.amount_received).toLocaleString('fr-FR')} FCFA</span></div>` : ''}${receiptData.change_amount !== undefined ? `<div class="row total"><span>Monnaie rendue</span><span>${Number(receiptData.change_amount).toLocaleString('fr-FR')} FCFA</span></div>` : ''}</div></body></html>`);
    invoiceWindow.document.close();
    setTimeout(() => invoiceWindow.print(), 500);
  };

  const periodIncome = paidTransactions.filter(t => t.type === 'INCOME').reduce((sum, t) => sum + Number(t.amount), 0);
  const periodExpense = paidTransactions.filter(t => t.type === 'EXPENSE').reduce((sum, t) => sum + Number(t.amount), 0);
  const netBalance = periodIncome - periodExpense;

  if (profileLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 text-indigo-600 animate-spin" /></div>;
  if (!siteId) return null;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <DollarSign className="w-7 h-7 text-emerald-600" />
            Caisse Hôtel
          </h1>
          <p className="text-sm text-slate-500 mt-1">Encaissements et décaissements</p>
        </div>
        <div className="flex gap-2">
          {session && (
            <button onClick={() => setShowExpenseForm(true)} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              <Minus className="w-4 h-4" /> Nouvelle dépense
            </button>
          )}
          {session ? (
            <button onClick={() => setShowCloseSession(true)} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              <Lock className="w-4 h-4" /> Fermer la caisse
            </button>
          ) : (
            <button onClick={() => setShowOpenSession(true)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              <Play className="w-4 h-4" /> Ouvrir la caisse
            </button>
          )}
        </div>
      </div>

      {session && (
        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-emerald-900">
            <CheckCircle className="w-4 h-4" />
            <span className="font-semibold">Caisse ouverte</span>
            <span className="text-emerald-700">• Fond: {formatFCFA(session.opening_float)}</span>
            <span className="text-emerald-700">• Ouverte le {new Date(session.opened_at).toLocaleString('fr-FR')}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-lg p-4">
          <div className="text-xs font-medium text-emerald-700 mb-1 flex items-center gap-1"><TrendingUp className="w-4 h-4" /> Encaissé</div>
          <div className="text-2xl font-bold text-emerald-900">{formatFCFA(periodIncome)}</div>
        </div>
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
          <div className="text-xs font-medium text-red-700 mb-1 flex items-center gap-1"><TrendingDown className="w-4 h-4" /> Dépensé</div>
          <div className="text-2xl font-bold text-red-900">{formatFCFA(periodExpense)}</div>
        </div>
        <div className={`border-2 rounded-lg p-4 ${netBalance >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
          <div className={`text-xs font-medium mb-1 flex items-center gap-1 ${netBalance >= 0 ? 'text-blue-700' : 'text-orange-700'}`}><DollarSign className="w-4 h-4" /> Solde net</div>
          <div className={`text-2xl font-bold ${netBalance >= 0 ? 'text-blue-900' : 'text-orange-900'}`}>{formatFCFA(netBalance)}</div>
        </div>
      </div>

          {/* ✅ Alerte si la caisse est fermée */}
      {!session && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4 flex items-start gap-3">
          <Lock className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-amber-900">Caisse actuellement fermée</h3>
            <p className="text-sm text-amber-800 mt-1">
              Aucun encaissement, paiement ou nouvelle dépense ne peut être enregistré tant que la caisse n'est pas ouverte. 
              Cliquez sur le bouton <strong>"Ouvrir la caisse"</strong> en haut à droite pour commencer.
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-2 border-b border-slate-200">
        <button onClick={() => setActiveTab('pending')} className={`flex items-center gap-2 px-4 py-2 font-medium text-sm transition-colors ${activeTab === 'pending' ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-slate-600 hover:text-slate-900'}`}>
          <ShoppingCart className="w-4 h-4" /> À traiter ({pendingTransactions.length})
        </button>
        <button onClick={() => setActiveTab('history')} className={`flex items-center gap-2 px-4 py-2 font-medium text-sm transition-colors ${activeTab === 'history' ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-slate-600 hover:text-slate-900'}`}>
          <History className="w-4 h-4" /> Historique ({paidTransactions.length})
        </button>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input type="date" value={startDate} max={endDate} onChange={(e) => setStartDate(e.target.value)} className="text-xs font-medium text-slate-700 outline-none bg-transparent" />
            <span className="text-xs text-slate-400">→</span>
            <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className="text-xs font-medium text-slate-700 outline-none bg-transparent" />
          </div>
          <button onClick={() => { const t = new Date().toISOString().split('T')[0]; setStartDate(t); setEndDate(t); }} className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-2 py-1 rounded hover:bg-indigo-200">Jour</button>
          <button onClick={() => { const now = new Date(); setStartDate(new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0]); setEndDate(now.toISOString().split('T')[0]); }} className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-1 rounded hover:bg-amber-200">7j</button>
          <button onClick={() => { const now = new Date(); setStartDate(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]); setEndDate(now.toISOString().split('T')[0]); }} className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-1 rounded hover:bg-emerald-200">Mois</button>
          <button onClick={() => { const r = getWeekRange(); setStartDate(r.start); setEndDate(r.end); }} className="text-[10px] font-semibold bg-purple-100 text-purple-700 px-2 py-1 rounded hover:bg-purple-200">Semaine</button>
        </div>
      </div>

      {activeTab === 'pending' && (
        <div>
          {pendingTransactions.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg">
              <CheckCircle className="w-12 h-12 mx-auto mb-2 text-emerald-400" />
              <p className="text-sm text-slate-500">Aucune transaction en attente</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pendingTransactions.map(t => {
                const isExpense = t.type === 'EXPENSE';
                return (
                  <div key={t.id} className={`flex items-center justify-between rounded-lg p-4 border-2 hover:shadow-md ${isExpense ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                    <div className="flex items-center gap-4 flex-1">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl ${isExpense ? 'bg-red-200' : 'bg-amber-200'}`}>
                        {categoryIcons[t.category] || '💰'}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900">{t.customer_name || t.provider_name || 'N/A'}</span>
                          {t.room_number && <span className="text-xs bg-indigo-100 text-indigo-900 px-2 py-0.5 rounded">🚪 Chambre {t.room_number}</span>}
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${isExpense ? 'bg-red-200 text-red-900' : 'bg-amber-200 text-amber-900'}`}>
                            {getPaymentLabel(t.payment_method)}
                          </span>
                        </div>
                        <div className="text-xs text-slate-600 mt-1">{t.description}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          📅 {new Date(t.created_at).toLocaleDateString('fr-FR')} à {new Date(t.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className={`text-2xl font-bold ${isExpense ? 'text-red-900' : 'text-amber-900'}`}>{formatFCFA(t.amount)}</div>
                        <div className="text-xs text-slate-600">{isExpense ? 'Décaissement' : 'TVA incluse'}</div>
                      </div>
                                            <button
                        onClick={() => handleOpenPayment(t)}
                        disabled={!session} // ✅ Désactivé si pas de session ouverte
                        className={`${
                          isExpense ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
                        } text-white px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-all ${
                          !session ? 'opacity-50 cursor-not-allowed bg-slate-400 hover:bg-slate-400' : ''
                        }`}
                        title={!session ? "Veuillez d'abord ouvrir la caisse" : ""}
                      >
                        <DollarSign className="w-4 h-4" />
                        {isExpense ? 'Payer' : 'Encaisser'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div>
          {paidTransactions.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg">
              <History className="w-12 h-12 mx-auto mb-2 text-slate-300" />
              <p className="text-sm text-slate-500">Aucune transaction pour cette période</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 text-xs uppercase text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left">Date & Heure</th>
                      <th className="px-4 py-3 text-left">Client / Fournisseur</th>
                      <th className="px-4 py-3 text-left">Description</th>
                      <th className="px-4 py-3 text-left">Catégorie</th>
                      {/* ✅ NOUVELLE COLONNE : Type de paiement */}
                      <th className="px-4 py-3 text-left">Paiement</th>
                      <th className="px-4 py-3 text-right">Montant</th>
                      <th className="px-4 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paidTransactions.map(t => {
                      const isExpense = t.type === 'EXPENSE';
                      return (
                        <tr key={t.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div className="text-xs text-slate-700">{new Date(t.created_at).toLocaleDateString('fr-FR')}</div>
                            <div className="text-[10px] text-slate-500">{new Date(t.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900 text-xs">{t.customer_name || t.provider_name || 'N/A'}</div>
                            {t.room_number && <div className="text-[10px] text-indigo-600">🚪 Ch. {t.room_number}</div>}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate">{t.description}</td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${isExpense ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {categoryLabels[t.category] || t.category}
                            </span>
                          </td>
                          {/* ✅ RENDU DE LA COLONNE PAIEMENT */}
                          <td className="px-4 py-3 text-xs font-medium text-slate-700">
                            {getPaymentLabel(t.payment_method)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className={`font-bold text-sm ${isExpense ? 'text-red-900' : 'text-emerald-900'}`}>
                              {isExpense ? '-' : '+'}{formatFCFA(t.amount)}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex gap-1 justify-center">
                              <button onClick={() => {
                                const netAmount = t.amount * 100 / (100 + taxRate);
                                setReceiptData({ ...t, tax_rate: taxRate, tax_amount: t.amount - netAmount, net_amount: netAmount, paid_at: t.created_at });
                                setShowReceipt(true);
                              }} className="bg-slate-700 hover:bg-slate-800 text-white px-2 py-1 rounded text-xs flex items-center gap-1">
                                <Printer className="w-3 h-3" /> Ticket
                              </button>
                              <button onClick={() => {
                                const netAmount = t.amount * 100 / (100 + taxRate);
                                setReceiptData({ ...t, tax_rate: taxRate, tax_amount: t.amount - netAmount, net_amount: netAmount, paid_at: t.created_at });
                                setShowReceipt(true);
                              }} className="bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1 rounded text-xs flex items-center gap-1">
                                <FileText className="w-3 h-3" /> Document
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
        </div>
      )}

      {/* Modals (Expense, Open Session, Close Session, Payment, Receipt) restent identiques */}
      {showExpenseForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="bg-gradient-to-r from-red-600 to-red-800 text-white px-6 py-4 rounded-t-xl flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2"><Minus className="w-5 h-5" /> Enregistrer une dépense</h3>
              <button onClick={() => setShowExpenseForm(false)} className="hover:bg-white/20 p-2 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">💰 Montant (FCFA) *</label>
                <input type="number" min="1" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} className="w-full border-2 border-slate-300 rounded-lg px-4 py-3 text-2xl font-bold text-center focus:ring-2 focus:ring-red-500" placeholder="0" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">📂 Catégorie *</label>
                <select value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)} className="w-full border-2 border-slate-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-red-500">
                  {expenseCategories.map(cat => <option key={cat.id} value={cat.id}>{cat.icon} {cat.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">🏢 Fournisseur / Prestataire</label>
                <input type="text" value={expenseProvider} onChange={(e) => setExpenseProvider(e.target.value)} className="w-full border-2 border-slate-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-red-500" placeholder="Nom du fournisseur..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">📝 Description *</label>
                <input type="text" value={expenseDescription} onChange={(e) => setExpenseDescription(e.target.value)} className="w-full border-2 border-slate-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-red-500" placeholder="Ex: Achat de citron, essence moto..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">📋 Notes (optionnel)</label>
                <textarea value={expenseNotes} onChange={(e) => setExpenseNotes(e.target.value)} rows={2} className="w-full border-2 border-slate-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-red-500" placeholder="Détails supplémentaires..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowExpenseForm(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-lg">Annuler</button>
                <button onClick={handleAddExpense} disabled={loading || !expenseAmount || !expenseDescription.trim()} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                  <CheckCircle className="w-5 h-5" /> {loading ? 'Enregistrement...' : 'Enregistrer la dépense'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showOpenSession && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-6 py-4 rounded-t-xl flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2"><Play className="w-5 h-5" /> Ouvrir la caisse</h3>
              <button onClick={() => setShowOpenSession(false)} className="hover:bg-white/20 p-2 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fond de caisse (monnaie de départ en FCFA)</label>
                <input type="number" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} className="w-full border-2 border-slate-300 rounded-lg px-4 py-3 text-2xl font-bold text-center focus:ring-2 focus:ring-emerald-500" placeholder="15000" />
                <p className="text-xs text-slate-500 mt-1">💡 Montant initial en caisse (billets et pièces)</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowOpenSession(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-lg">Annuler</button>
                <button onClick={handleOpenSession} disabled={loading} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-lg disabled:opacity-50">{loading ? 'Ouverture...' : 'Ouvrir la caisse'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCloseSession && session && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="bg-gradient-to-r from-red-600 to-red-800 text-white px-6 py-4 rounded-t-xl flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2"><Lock className="w-5 h-5" /> Fermer la caisse</h3>
              <button onClick={() => setShowCloseSession(false)} className="hover:bg-white/20 p-2 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-4 rounded-lg">
                <div className="text-xs text-slate-600 mb-1">Fond de caisse</div>
                <div className="font-bold text-slate-900">{formatFCFA(session.opening_float)}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <div className="text-xs text-emerald-700">Encaissé</div>
                  <div className="font-bold text-emerald-900">{formatFCFA(paidTransactions.filter(t => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0))}</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="text-xs text-red-700">Dépensé</div>
                  <div className="font-bold text-red-900">{formatFCFA(paidTransactions.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0))}</div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Montant compté dans le tiroir (FCFA)</label>
                <input type="number" value={countedAmount} onChange={(e) => setCountedAmount(e.target.value)} className="w-full border-2 border-slate-300 rounded-lg px-4 py-3 text-2xl font-bold text-center focus:ring-2 focus:ring-red-500" placeholder="0" />
                <p className="text-xs text-slate-500 mt-1">💡 Comptez physiquement les billets et pièces</p>
              </div>
              {countedAmount && (() => {
                const counted = Number(countedAmount);
                const expected = session.opening_float + paidTransactions.filter(t => t.type === 'INCOME' && t.payment_method === 'CASH').reduce((s, t) => s + t.amount, 0) - paidTransactions.filter(t => t.type === 'EXPENSE' && t.payment_method === 'CASH').reduce((s, t) => s + t.amount, 0);
                const diff = counted - expected;
                return (
                  <div className={`border-2 rounded-lg p-3 ${diff === 0 ? 'bg-emerald-50 border-emerald-300' : diff > 0 ? 'bg-amber-50 border-amber-300' : 'bg-red-50 border-red-300'}`}>
                    <div className="text-xs mb-1">Écart de caisse</div>
                    <div className={`text-xl font-bold ${diff === 0 ? 'text-emerald-900' : diff > 0 ? 'text-amber-900' : 'text-red-900'}`}>
                      {diff === 0 ? '✅ Aucun écart' : (diff > 0 ? '+' : '') + formatFCFA(diff)}
                    </div>
                  </div>
                );
              })()}
              <button onClick={handlePrintClosingReport} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2">
                <Printer className="w-5 h-5" /> 📄 Imprimer le rapport de fermeture (A4 + QR)
              </button>
              <div className="flex gap-3 pt-2 border-t border-slate-200">
                <button onClick={() => setShowCloseSession(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-lg">Annuler</button>
                <button onClick={handleCloseSession} disabled={loading || !countedAmount} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg disabled:opacity-50">{loading ? 'Clôture...' : '✅ Confirmer la fermeture'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPayment && selectedTransaction && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className={`bg-gradient-to-r px-6 py-4 rounded-t-xl text-white ${selectedTransaction.type === 'EXPENSE' ? 'from-red-600 to-red-800' : 'from-emerald-600 to-teal-700'}`}>
              <h3 className="text-lg font-bold flex items-center gap-2">
                {selectedTransaction.type === 'EXPENSE' ? <TrendingDown className="w-5 h-5" /> : <DollarSign className="w-5 h-5" />}
                {selectedTransaction.type === 'EXPENSE' ? 'Paiement fournisseur' : 'Encaissement'}
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-4 rounded-lg">
                <div className="text-xs text-slate-600 mb-1">{selectedTransaction.type === 'EXPENSE' ? 'Fournisseur' : 'Client'}</div>
                <div className="font-bold text-slate-900">{selectedTransaction.provider_name || selectedTransaction.customer_name}</div>
                {selectedTransaction.room_number && <div className="text-xs text-slate-600 mt-1">🚪 Chambre {selectedTransaction.room_number}</div>}
              </div>
              <div className={`border-2 p-4 rounded-lg text-center ${selectedTransaction.type === 'EXPENSE' ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-300'}`}>
                <div className={`text-xs mb-1 ${selectedTransaction.type === 'EXPENSE' ? 'text-red-700' : 'text-amber-700'}`}>{selectedTransaction.type === 'EXPENSE' ? 'Montant à payer' : 'Montant à encaisser'}</div>
                <div className={`text-3xl font-bold ${selectedTransaction.type === 'EXPENSE' ? 'text-red-900' : 'text-amber-900'}`}>{formatFCFA(selectedTransaction.amount)}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">💵 {selectedTransaction.type === 'EXPENSE' ? 'Montant donné au fournisseur (FCFA)' : 'Montant reçu du client (FCFA)'}</label>
                <input type="number" min={selectedTransaction.amount} value={amountReceived} onChange={(e) => setAmountReceived(Number(e.target.value))} className="w-full border-2 border-slate-300 rounded-lg px-4 py-3 text-2xl font-bold text-center focus:ring-2 focus:ring-emerald-500" autoFocus />
                <button type="button" onClick={() => setAmountReceived(selectedTransaction.amount)} className="text-xs text-emerald-600 hover:text-emerald-800 mt-1">💡 Mettre le montant exact</button>
              </div>
              {amountReceived >= selectedTransaction.amount && (
                <div className="bg-emerald-50 border-2 border-emerald-300 p-3 rounded-lg flex justify-between items-center">
                  <span className="text-sm font-medium text-emerald-900">💰 Monnaie à rendre</span>
                  <span className="text-2xl font-bold text-emerald-900">{formatFCFA(amountReceived - selectedTransaction.amount)}</span>
                </div>
              )}
              {amountReceived < selectedTransaction.amount && (
                <div className="bg-red-50 border border-red-200 p-3 rounded-lg text-sm text-red-900 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Montant insuffisant. Il manque {formatFCFA(selectedTransaction.amount - amountReceived)}</span>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button onClick={() => { setShowPayment(false); setSelectedTransaction(null); }} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-lg">Annuler</button>
                <button onClick={handleProcessPayment} disabled={loading || amountReceived < selectedTransaction.amount} className={`flex-1 font-semibold py-3 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 text-white ${selectedTransaction.type === 'EXPENSE' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                  <CheckCircle className="w-5 h-5" /> {loading ? 'Traitement...' : 'Valider'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showReceipt && receiptData && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className={`bg-gradient-to-r text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 ${receiptData.type === 'EXPENSE' ? 'from-red-600 to-red-800' : 'from-emerald-600 to-teal-700'}`}>
              <h3 className="text-lg font-bold flex items-center gap-2"><CheckCircle className="w-5 h-5" /> {receiptData.status === 'PAID' ? '📄 Réimpression' : 'Opération réussie !'}</h3>
              <button onClick={() => { setShowReceipt(false); setReceiptData(null); }} className="hover:bg-white/20 p-2 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div ref={receiptRef} className="bg-white p-4 border-2 border-slate-300 rounded" style={{ fontFamily: 'Courier New, monospace', fontSize: '12px', maxWidth: '300px', margin: '0 auto' }}>
                <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '14px' }}>LA VIDA-LOCA</div>
                  <div>Rue 15.293, Ouaga 2000</div>
                  <div>+226 01 04 11 11</div>
                  <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }}></div>
                  <div style={{ fontWeight: 'bold' }}>{receiptData.type === 'EXPENSE' ? 'FICHE DE DÉPENSE' : 'TICKET DE CAISSE'}</div>
                  <div>N° {receiptData.receipt_number || 'N/A'}</div>
                  <div>{new Date(receiptData.paid_at).toLocaleString('fr-FR')}</div>
                </div>
                <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }}></div>
                <div>{receiptData.type === 'EXPENSE' ? 'Fournisseur' : 'Client'}: {receiptData.provider_name || receiptData.customer_name || '-'}</div>
                {receiptData.room_number && <div>Chambre: {receiptData.room_number}</div>}
                <div>{receiptData.description}</div>
                <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }}></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                  <span>TOTAL:</span>
                  <span>{formatFCFA(receiptData.amount)}</span>
                </div>
                {receiptData.amount_received && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Donné/Reçu:</span>
                    <span>{formatFCFA(receiptData.amount_received)}</span>
                  </div>
                )}
                {receiptData.change_amount !== undefined && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                    <span>Monnaie:</span>
                    <span>{formatFCFA(receiptData.change_amount)}</span>
                  </div>
                )}
                <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }}></div>
                <div style={{ textAlign: 'center', fontSize: '10px' }}>Merci ! 🌴</div>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={handlePrintReceipt} className="flex-1 bg-slate-700 hover:bg-slate-800 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2">
                  <Printer className="w-5 h-5" /> Imprimer ticket (80mm)
                </button>
                <button onClick={handlePrintInvoice} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2">
                  <FileText className="w-5 h-5" /> Imprimer document A4
                </button>
              </div>
              <button onClick={() => { setShowReceipt(false); setReceiptData(null); }} className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2 rounded-lg mt-2">Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}