'use client';
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, DollarSign, ShoppingCart, Printer, FileText, CheckCircle, AlertCircle, History, RotateCcw, TrendingUp, TrendingDown } from 'lucide-react';

interface Props {
  siteId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

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
}

const categoryIcons: Record<string, string> = {
  ROOM_PAYMENT: '🛏️', MAINTENANCE: '🔧', FB_PAYMENT: '🍽️',
  SUPPLIES: '🧴', SALARY: '👷', UTILITIES: '⚡',
  OTHER_INCOME: '💰', OTHER_EXPENSE: '📦',
};

export default function CashierModal({ siteId, isOpen, onClose, onSuccess }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [pendingTransactions, setPendingTransactions] = useState<Transaction[]>([]);
  const [paidTransactions, setPaidTransactions] = useState<Transaction[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [amountReceived, setAmountReceived] = useState(0);
  const [taxRate, setTaxRate] = useState(18);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      loadTaxSettings();
      loadPendingTransactions();
      loadPaidTransactions();
    }
  }, [isOpen, filterDate]);

  const loadTaxSettings = async () => {
    const { data } = await supabase.from('tax_settings').select('*').eq('site_id', siteId).single();
    if (data) setTaxRate(Number(data.tax_rate));
  };

  const enrichTransaction = async (t: any): Promise<Transaction> => {
    let name = t.provider_name || '';
    let room_number = '';
    if (t.reference_table === 'stays' && t.reference_id) {
      const { data: stay } = await supabase
        .from('stays')
        .select('customer_id, room_id, customers(first_name, last_name), rooms(number)')
        .eq('id', t.reference_id)
        .single();
      if (stay) {
        name = `${stay.customers?.last_name || ''} ${stay.customers?.first_name || ''}`.trim() || name;
        room_number = stay.rooms?.number || '';
      }
    }
    return { ...t, customer_name: name, room_number };
  };

  const loadPendingTransactions = async () => {
    const { data } = await supabase
      .from('cash_transactions')
      .select('*')
      .eq('site_id', siteId)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true });
    if (data) setPendingTransactions(await Promise.all(data.map(enrichTransaction)));
  };

  const loadPaidTransactions = async () => {
    const startOfDay = new Date(filterDate); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(filterDate); endOfDay.setHours(23, 59, 59, 999);
    const { data } = await supabase
      .from('cash_transactions')
      .select('*')
      .eq('site_id', siteId)
      .eq('status', 'PAID')
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString())
      .order('created_at', { ascending: false });
    if (data) setPaidTransactions(await Promise.all(data.map(enrichTransaction)));
  };

  const handleOpenPayment = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setAmountReceived(transaction.amount);
    setShowPayment(true);
  };

  const handleProcessPayment = async () => {
    if (!selectedTransaction) return;
    if (amountReceived < selectedTransaction.amount) {
      setError('Le montant est insuffisant.');
      return;
    }
    setLoading(true);
    setError('');
    const change = amountReceived - selectedTransaction.amount;
    const receiptNumber = `REC-${Date.now().toString().slice(-8)}`;

    try {
      const { error } = await supabase.from('cash_transactions').update({
        status: 'PAID', amount_received: amountReceived, change_amount: change, receipt_number: receiptNumber,
      }).eq('id', selectedTransaction.id);

      if (error) throw new Error(error.message);

      const netAmount = selectedTransaction.amount * 100 / (100 + taxRate);
      const taxAmount = selectedTransaction.amount - netAmount;

      setReceiptData({ 
        ...selectedTransaction, 
        amount_received: amountReceived, 
        change_amount: change, 
        receipt_number: receiptNumber, 
        tax_rate: taxRate, 
        tax_amount: taxAmount, 
        net_amount: netAmount, 
        paid_at: new Date().toISOString() 
      });
      setShowPayment(false);
      setShowReceipt(true);
      setSelectedTransaction(null);
      loadPendingTransactions();
      loadPaidTransactions();
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleReprint = (transaction: Transaction) => {
    const netAmount = transaction.amount * 100 / (100 + taxRate);
    setReceiptData({ 
      ...transaction, 
      tax_rate: taxRate, 
      tax_amount: transaction.amount - netAmount, 
      net_amount: netAmount, 
      paid_at: transaction.created_at 
    });
    setShowReceipt(true);
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
    invoiceWindow.document.write(`<html><head><title>${isExpense ? 'Fiche de Dépense' : 'Facture'} ${receiptData.receipt_number}</title><style>body { font-family: Arial, sans-serif; margin: 40px; color: #333; } .header { display: flex; justify-content: space-between; border-bottom: 3px solid ${isExpense ? '#dc2626' : '#1e3a8a'}; padding-bottom: 20px; margin-bottom: 30px; } .company h1 { color: ${isExpense ? '#dc2626' : '#1e3a8a'}; margin: 0; } .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px; } .info-box { background: #f8fafc; padding: 15px; border-radius: 8px; } table { width: 100%; border-collapse: collapse; margin: 20px 0; } th { background: ${isExpense ? '#dc2626' : '#1e3a8a'}; color: white; padding: 12px; text-align: left; } td { padding: 12px; border-bottom: 1px solid #e2e8f0; } .totals { margin-left: auto; width: 300px; } .totals .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; } .totals .total { font-size: 18px; font-weight: bold; color: ${isExpense ? '#dc2626' : '#1e3a8a'}; border-top: 2px solid ${isExpense ? '#dc2626' : '#1e3a8a'}; padding-top: 10px; } .reprint-badge { background: #fbbf24; color: #78350f; padding: 4px 12px; border-radius: 4px; font-size: 11px; font-weight: bold; display: inline-block; margin-bottom: 10px; }</style></head><body><div class="header"><div class="company"><h1>LA VIDA-LOCA</h1><p>Ouagadougou, Burkina Faso<br/>Tél: +226 25 30 00 00</p></div><div class="invoice-info"><h2>${isExpense ? 'FICHE DE DÉPENSE' : 'FACTURE'}</h2><p><strong>N°:</strong> ${receiptData.receipt_number || 'N/A'}</p><p><strong>Date:</strong> ${new Date(receiptData.paid_at).toLocaleDateString('fr-FR')}</p>${receiptData.status === 'PAID' ? '<div class="reprint-badge">📄 DUPLICATA</div>' : ''}</div></div><div class="info-grid"><div class="info-box"><h3>${isExpense ? 'Fournisseur' : 'Client'}</h3><p><strong>${receiptData.provider_name || receiptData.customer_name || 'N/A'}</strong></p>${receiptData.room_number ? `<p>Chambre: ${receiptData.room_number}</p>` : ''}</div><div class="info-box"><h3>Détails</h3><p>${receiptData.description}</p><p>Mode: ${receiptData.payment_method}</p></div></div><table><thead><tr><th>Description</th><th style="text-align:right">Montant</th></tr></thead><tbody><tr><td>${receiptData.description}</td><td style="text-align:right"><strong>${Number(receiptData.amount).toLocaleString('fr-FR')} F</strong></td></tr></tbody></table><div class="totals"><div class="row"><span>Total</span><span>${Number(receiptData.amount).toLocaleString('fr-FR')} F</span></div>${receiptData.amount_received ? `<div class="row"><span>Montant donné</span><span>${Number(receiptData.amount_received).toLocaleString('fr-FR')} F</span></div>` : ''}${receiptData.change_amount !== undefined ? `<div class="row total"><span>Monnaie rendue</span><span>${Number(receiptData.change_amount).toLocaleString('fr-FR')} F</span></div>` : ''}</div><div style="margin-top:50px;text-align:center;color:#64748b;font-size:12px;"><p>Document généré par LA VIDA-LOCA PMS</p></div></body></html>`);
    invoiceWindow.document.close();
    setTimeout(() => invoiceWindow.print(), 500);
  };

  const todayIncome = paidTransactions.filter(t => t.type === 'INCOME').reduce((sum, t) => sum + Number(t.amount), 0);
  const todayExpense = paidTransactions.filter(t => t.type === 'EXPENSE').reduce((sum, t) => sum + Number(t.amount), 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <DollarSign className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-bold">Caisse</h2>
              <p className="text-xs text-emerald-100">{pendingTransactions.length} en attente • TVA: {taxRate}%</p>
            </div>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-lg border border-red-200 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-50 border-2 border-emerald-200 rounded-lg p-4">
              <div className="text-xs font-medium text-emerald-700 mb-1 flex items-center gap-1"><TrendingUp className="w-4 h-4" /> Encaissé</div>
              <div className="text-2xl font-bold text-emerald-900">{Number(todayIncome).toLocaleString('fr-FR')} F</div>
            </div>
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
              <div className="text-xs font-medium text-red-700 mb-1 flex items-center gap-1"><TrendingDown className="w-4 h-4" /> Dépensé</div>
              <div className="text-2xl font-bold text-red-900">{Number(todayExpense).toLocaleString('fr-FR')} F</div>
            </div>
            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
              <div className="text-xs font-medium text-blue-700 mb-1">⚖️ Solde net</div>
              <div className="text-2xl font-bold text-blue-900">{Number(todayIncome - todayExpense).toLocaleString('fr-FR')} F</div>
            </div>
          </div>

          <div className="flex gap-2 border-b border-slate-200">
            <button 
              onClick={() => setActiveTab('pending')} 
              className={`flex items-center gap-2 px-4 py-2 font-medium text-sm transition-colors ${activeTab === 'pending' ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <ShoppingCart className="w-4 h-4" /> À traiter ({pendingTransactions.length})
            </button>
            <button 
              onClick={() => setActiveTab('history')} 
              className={`flex items-center gap-2 px-4 py-2 font-medium text-sm transition-colors ${activeTab === 'history' ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <History className="w-4 h-4" /> Historique ({paidTransactions.length})
            </button>
            <div className="ml-auto flex items-center gap-2">
              <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="border border-slate-300 rounded px-2 py-1 text-sm" />
            </div>
          </div>

          {activeTab === 'pending' && (
            <div>
              {pendingTransactions.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-lg">
                  <CheckCircle className="w-12 h-12 mx-auto mb-2 text-emerald-400" />
                  <p className="text-sm text-slate-500">Aucune transaction en attente</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingTransactions.map(t => {
                    const isExpense = t.type === 'EXPENSE';
                    return (
                      <div key={t.id} className={`flex items-center justify-between rounded-lg p-4 border-2 hover:shadow-md transition-shadow ${isExpense ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                        <div className="flex items-center gap-4 flex-1">
                          <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl ${isExpense ? 'bg-red-200' : 'bg-amber-200'}`}>
                            {categoryIcons[t.category] || '💰'}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-900">{t.customer_name || t.provider_name || 'N/A'}</span>
                              {t.room_number && <span className="text-xs bg-indigo-100 text-indigo-900 px-2 py-0.5 rounded">🚪 Chambre {t.room_number}</span>}
                              <span className={`text-xs px-2 py-0.5 rounded font-medium ${isExpense ? 'bg-red-200 text-red-900' : 'bg-amber-200 text-amber-900'}`}>
                                {t.payment_method}
                              </span>
                            </div>
                            <div className="text-xs text-slate-600 mt-1">{t.description}</div>
                            <div className="text-xs text-slate-500 mt-1">🕐 {new Date(t.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className={`text-2xl font-bold ${isExpense ? 'text-red-900' : 'text-amber-900'}`}>
                              {Number(t.amount).toLocaleString('fr-FR')} F
                            </div>
                            <div className="text-xs text-slate-600">{isExpense ? 'Décaissement' : 'TVA incluse'}</div>
                          </div>
                          <button 
                            onClick={() => handleOpenPayment(t)} 
                            className={`${isExpense ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white px-4 py-2 rounded-lg font-semibold flex items-center gap-2`}
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
                <div className="text-center py-8 bg-slate-50 rounded-lg">
                  <History className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm text-slate-500">Aucune transaction pour cette date</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {paidTransactions.map(t => {
                    const isExpense = t.type === 'EXPENSE';
                    return (
                      <div key={t.id} className={`flex items-center justify-between rounded-lg p-4 border-2 ${isExpense ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                        <div className="flex items-center gap-4 flex-1">
                          <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl ${isExpense ? 'bg-red-200' : 'bg-emerald-200'}`}>
                            {categoryIcons[t.category] || '💰'}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-900">{t.customer_name || t.provider_name || 'N/A'}</span>
                              {t.receipt_number && <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-mono">#{t.receipt_number}</span>}
                            </div>
                            <div className="text-xs text-slate-600 mt-1">{t.description}</div>
                            <div className="text-xs text-slate-500 mt-1">🕐 {new Date(t.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className={`text-2xl font-bold ${isExpense ? 'text-red-900' : 'text-emerald-900'}`}>
                              {isExpense ? '-' : '+'}{Number(t.amount).toLocaleString('fr-FR')} F
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <button 
                              onClick={() => handleReprint(t)} 
                              className="bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded-lg font-medium flex items-center gap-1 text-xs" 
                              title="Réimprimer"
                            >
                              <Printer className="w-4 h-4" /> Ticket
                            </button>
                            <button 
                              onClick={() => handleReprint(t)} 
                              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg font-medium flex items-center gap-1 text-xs" 
                              title="Réimprimer"
                            >
                              <FileText className="w-4 h-4" /> Document
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

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
                <div className={`text-xs mb-1 ${selectedTransaction.type === 'EXPENSE' ? 'text-red-700' : 'text-amber-700'}`}>
                  {selectedTransaction.type === 'EXPENSE' ? 'Montant à payer' : 'Montant à encaisser'}
                </div>
                <div className={`text-3xl font-bold ${selectedTransaction.type === 'EXPENSE' ? 'text-red-900' : 'text-amber-900'}`}>
                  {Number(selectedTransaction.amount).toLocaleString('fr-FR')} F
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  💵 {selectedTransaction.type === 'EXPENSE' ? 'Montant donné au fournisseur (FCFA)' : 'Montant reçu du client (FCFA)'}
                </label>
                <input 
                  type="number" 
                  min={selectedTransaction.amount} 
                  value={amountReceived} 
                  onChange={(e) => setAmountReceived(Number(e.target.value))} 
                  className="w-full border-2 border-slate-300 rounded-lg px-4 py-3 text-2xl font-bold text-center focus:ring-2 focus:ring-emerald-500" 
                  autoFocus 
                />
                <button 
                  type="button" 
                  onClick={() => setAmountReceived(selectedTransaction.amount)} 
                  className="text-xs text-emerald-600 hover:text-emerald-800 mt-1"
                >
                  💡 Mettre le montant exact
                </button>
              </div>
              {amountReceived >= selectedTransaction.amount && (
                <div className="bg-emerald-50 border-2 border-emerald-300 p-3 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-emerald-900">💰 Monnaie à rendre</span>
                    <span className="text-2xl font-bold text-emerald-900">
                      {Number(amountReceived - selectedTransaction.amount).toLocaleString('fr-FR')} F
                    </span>
                  </div>
                </div>
              )}
              {amountReceived < selectedTransaction.amount && (
                <div className="bg-red-50 border border-red-200 p-3 rounded-lg text-sm text-red-900 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Montant insuffisant. Il manque {Number(selectedTransaction.amount - amountReceived).toLocaleString('fr-FR')} F</span>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button 
                  onClick={() => { setShowPayment(false); setSelectedTransaction(null); }} 
                  className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-lg"
                >
                  Annuler
                </button>
                <button 
                  onClick={handleProcessPayment} 
                  disabled={loading || amountReceived < selectedTransaction.amount} 
                  className={`flex-1 font-semibold py-3 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 text-white ${selectedTransaction.type === 'EXPENSE' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                >
                  <CheckCircle className="w-5 h-5" />
                  {loading ? 'Traitement...' : 'Valider'}
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
              <h3 className="text-lg font-bold flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                {receiptData.status === 'PAID' ? '📄 Réimpression' : 'Opération réussie !'}
              </h3>
              <button onClick={() => { setShowReceipt(false); setReceiptData(null); }} className="hover:bg-white/20 p-2 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {receiptData.status === 'PAID' && (
                <div className="bg-amber-50 border-2 border-amber-300 p-3 rounded-lg flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-amber-700" />
                  <div>
                    <div className="font-semibold text-amber-900 text-sm">Mode réimpression</div>
                    <div className="text-xs text-amber-700">Document original du {new Date(receiptData.paid_at).toLocaleString('fr-FR')} • N° {receiptData.receipt_number}</div>
                  </div>
                </div>
              )}
              
              <div ref={receiptRef} className="bg-white p-4 border-2 border-slate-300 rounded" style={{ fontFamily: 'Courier New, monospace', fontSize: '12px', maxWidth: '300px', margin: '0 auto' }}>
                <div style={{ textAlign: 'center', marginBottom: '10px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '14px' }}>LA VIDA-LOCA</div>
                  <div>Ouagadougou, BF</div>
                  <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }}></div>
                  <div style={{ fontWeight: 'bold' }}>{receiptData.status === 'PAID' ? 'DUPLICATA' : (receiptData.type === 'EXPENSE' ? 'FICHE DE DÉPENSE' : 'TICKET DE CAISSE')}</div>
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
                  <span>{Number(receiptData.amount).toLocaleString('fr-FR')} F</span>
                </div>
                {receiptData.amount_received && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Donné/Reçu:</span>
                    <span>{Number(receiptData.amount_received).toLocaleString('fr-FR')} F</span>
                  </div>
                )}
                {receiptData.change_amount !== undefined && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                    <span>Monnaie:</span>
                    <span>{Number(receiptData.change_amount).toLocaleString('fr-FR')} F</span>
                  </div>
                )}
                <div style={{ borderTop: '1px dashed #000', margin: '8px 0' }}></div>
                <div style={{ textAlign: 'center', fontSize: '10px' }}>Merci ! 🌴</div>
              </div>

              <div className="flex gap-2 pt-2">
                <button 
                  onClick={handlePrintReceipt} 
                  className="flex-1 bg-slate-700 hover:bg-slate-800 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
                >
                  <Printer className="w-5 h-5" /> Imprimer ticket (80mm)
                </button>
                <button 
                  onClick={handlePrintInvoice} 
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
                >
                  <FileText className="w-5 h-5" /> Imprimer document A4
                </button>
              </div>
              <button 
                onClick={() => { setShowReceipt(false); setReceiptData(null); }} 
                className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2 rounded-lg mt-2"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
