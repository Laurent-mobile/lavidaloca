'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, FileText, TrendingUp, TrendingDown, DollarSign, CheckCircle, AlertCircle, Printer } from 'lucide-react';

interface Props {
  siteId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function DailyReportModal({ siteId, isOpen, onClose, onSuccess }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [closingBalance, setClosingBalance] = useState(0);
  const [isClosed, setIsClosed] = useState(false);
  const [closingNote, setClosingNote] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadReport();
    }
  }, [isOpen, reportDate]);

  const loadReport = async () => {
    setLoading(true);
    const startOfDay = new Date(reportDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(reportDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Charger les transactions
    const { data: txData } = await supabase
      .from('cash_transactions')
      .select('*')
      .eq('site_id', siteId)
      .eq('status', 'PAID')
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString())
      .order('created_at', { ascending: true });

    if (txData) setTransactions(txData);

    // Vérifier si la journée est déjà clôturée
    const { data: closingData } = await supabase
      .from('daily_closings')
      .select('*')
      .eq('site_id', siteId)
      .eq('closing_date', reportDate)
      .single();

    if (closingData) {
      setIsClosed(true);
      setClosingBalance(closingData.closing_balance || 0);
      setClosingNote(closingData.notes || '');
    } else {
      setIsClosed(false);
    }

    setLoading(false);
  };

  const handleCloseDay = async () => {
    if (!confirm('Confirmer la clôture de la journée du ' + new Date(reportDate).toLocaleDateString('fr-FR') + ' ?')) return;
    
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    const totalIncome = transactions.filter(t => t.type === 'INCOME').reduce((sum, t) => sum + Number(t.amount), 0);
    const totalExpense = transactions.filter(t => t.type === 'EXPENSE').reduce((sum, t) => sum + Number(t.amount), 0);
    const netBalance = totalIncome - totalExpense;

    const { error } = await supabase.from('daily_closings').insert({
      site_id: siteId,
      closing_date: reportDate,
      total_income: totalIncome,
      total_expense: totalExpense,
      net_balance: netBalance,
      transaction_count: transactions.length,
      closing_balance: closingBalance,
      notes: closingNote,
      closed_by: user?.id,
    });

    if (error) {
      alert('Erreur: ' + error.message);
    } else {
      setIsClosed(true);
      onSuccess();
      alert('✅ Journée clôturée avec succès !');
    }
    setLoading(false);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const totalIncome = transactions.filter(t => t.type === 'INCOME').reduce((sum, t) => sum + Number(t.amount), 0);
    const totalExpense = transactions.filter(t => t.type === 'EXPENSE').reduce((sum, t) => sum + Number(t.amount), 0);

    printWindow.document.write(`
      <html>
        <head>
          <title>Rapport du ${reportDate}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
            h1 { color: #1e3a8a; border-bottom: 3px solid #1e3a8a; padding-bottom: 10px; }
            .summary { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin: 30px 0; }
            .card { background: #f8fafc; padding: 20px; border-radius: 8px; border-left: 4px solid #1e3a8a; }
            .card.income { border-left-color: #10b981; }
            .card.expense { border-left-color: #ef4444; }
            .card h3 { margin: 0 0 10px 0; font-size: 14px; color: #64748b; }
            .card .amount { font-size: 24px; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-top: 30px; }
            th { background: #1e3a8a; color: white; padding: 10px; text-align: left; }
            td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
            .footer { margin-top: 50px; text-align: center; color: #64748b; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 20px; }
            @media print { body { margin: 20px; } }
          </style>
        </head>
        <body>
          <h1> RAPPORT DE FIN DE JOURNÉE</h1>
          <p><strong>LA VIDA-LOCA</strong> - ${new Date(reportDate).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          
          <div class="summary">
            <div class="card income">
              <h3>💰 ENCAISSEMENTS</h3>
              <div class="amount" style="color: #10b981;">+ ${Number(totalIncome).toLocaleString('fr-FR')} F</div>
            </div>
            <div class="card expense">
              <h3>💸 DÉCAISSEMENTS</h3>
              <div class="amount" style="color: #ef4444;">- ${Number(totalExpense).toLocaleString('fr-FR')} F</div>
            </div>
            <div class="card">
              <h3>️ SOLDE NET</h3>
              <div class="amount" style="color: #1e3a8a;">${Number(totalIncome - totalExpense).toLocaleString('fr-FR')} F</div>
            </div>
          </div>

          <h2>Détail des transactions (${transactions.length})</h2>
          <table>
            <thead>
              <tr><th>Heure</th><th>Type</th><th>Catégorie</th><th>Description</th><th style="text-align:right">Montant</th></tr>
            </thead>
            <tbody>
              ${transactions.map(t => `
                <tr>
                  <td>${new Date(t.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                  <td>${t.type === 'INCOME' ? '📈 Recette' : '📉 Dépense'}</td>
                  <td>${t.category}</td>
                  <td>${t.description || '-'} ${t.provider_name ? '(' + t.provider_name + ')' : ''}</td>
                  <td style="text-align:right; font-weight:bold; color: ${t.type === 'INCOME' ? '#10b981' : '#ef4444'};">
                    ${t.type === 'INCOME' ? '+' : '-'} ${Number(t.amount).toLocaleString('fr-FR')} F
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          ${isClosed ? `<div style="margin-top:30px; padding:15px; background:#d1fae5; border:2px solid #10b981; border-radius:8px; text-align:center;"><strong>✅ JOURNÉE CLÔTURÉE</strong><br/>Solde de clôture: ${Number(closingBalance).toLocaleString('fr-FR')} F</div>` : ''}

          <div class="footer">
            <p>Document généré par LA VIDA-LOCA PMS le ${new Date().toLocaleString('fr-FR')}</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  const totalIncome = transactions.filter(t => t.type === 'INCOME').reduce((sum, t) => sum + Number(t.amount), 0);
  const totalExpense = transactions.filter(t => t.type === 'EXPENSE').reduce((sum, t) => sum + Number(t.amount), 0);
  const netBalance = totalIncome - totalExpense;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-bold">Rapport de fin de journée</h2>
              <p className="text-xs text-blue-200">Clôture de caisse et résumé financier</p>
            </div>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Sélecteur de date */}
          <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg">
            <label className="text-sm font-medium text-slate-700"> Date du rapport :</label>
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              disabled={isClosed}
              className="border border-slate-300 rounded px-3 py-1.5 text-sm"
            />
            <button onClick={handlePrint} className="ml-auto flex items-center gap-2 bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium">
              <Printer className="w-4 h-4" /> Imprimer le rapport
            </button>
          </div>

          {isClosed && (
            <div className="bg-emerald-50 border-2 border-emerald-300 p-3 rounded-lg flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-700" />
              <div>
                <div className="font-semibold text-emerald-900 text-sm">✅ Journée déjà clôturée</div>
                <div className="text-xs text-emerald-700">Solde de clôture: {Number(closingBalance).toLocaleString('fr-FR')} F</div>
              </div>
            </div>
          )}

          {/* Résumé */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-50 border-2 border-emerald-200 rounded-lg p-4">
              <div className="text-xs font-medium text-emerald-700 mb-1 flex items-center gap-1"><TrendingUp className="w-4 h-4" /> Encaissements</div>
              <div className="text-2xl font-bold text-emerald-900">+ {Number(totalIncome).toLocaleString('fr-FR')} F</div>
              <div className="text-xs text-emerald-700 mt-1">{transactions.filter(t => t.type === 'INCOME').length} transaction(s)</div>
            </div>
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
              <div className="text-xs font-medium text-red-700 mb-1 flex items-center gap-1"><TrendingDown className="w-4 h-4" /> Décaissements</div>
              <div className="text-2xl font-bold text-red-900">- {Number(totalExpense).toLocaleString('fr-FR')} F</div>
              <div className="text-xs text-red-700 mt-1">{transactions.filter(t => t.type === 'EXPENSE').length} transaction(s)</div>
            </div>
            <div className={`border-2 rounded-lg p-4 ${netBalance >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
              <div className={`text-xs font-medium mb-1 flex items-center gap-1 ${netBalance >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                <DollarSign className="w-4 h-4" /> Solde net
              </div>
              <div className={`text-2xl font-bold ${netBalance >= 0 ? 'text-blue-900' : 'text-orange-900'}`}>
                {Number(netBalance).toLocaleString('fr-FR')} F
              </div>
              <div className={`text-xs mt-1 ${netBalance >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>{transactions.length} transaction(s) au total</div>
            </div>
          </div>

          {/* Liste des transactions */}
          <div>
            <h3 className="font-semibold text-slate-900 mb-2">Détail des transactions ({transactions.length})</h3>
            {transactions.length === 0 ? (
              <div className="text-center py-6 bg-slate-50 rounded-lg text-sm text-slate-500">Aucune transaction pour cette date</div>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {transactions.map(t => (
                  <div key={t.id} className={`flex items-center justify-between p-2 rounded border text-sm ${t.type === 'INCOME' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center gap-3 flex-1">
                      <span className="text-xs text-slate-500 w-12">{new Date(t.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${t.type === 'INCOME' ? 'bg-emerald-200 text-emerald-900' : 'bg-red-200 text-red-900'}`}>
                        {t.type === 'INCOME' ? '📈' : '📉'} {t.category}
                      </span>
                      <span className="text-xs text-slate-700 flex-1">{t.description} {t.provider_name && <span className="text-slate-500">({t.provider_name})</span>}</span>
                    </div>
                    <span className={`font-bold ${t.type === 'INCOME' ? 'text-emerald-700' : 'text-red-700'}`}>
                      {t.type === 'INCOME' ? '+' : '-'}{Number(t.amount).toLocaleString('fr-FR')} F
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Clôture */}
          {!isClosed && transactions.length > 0 && (
            <div className="border-t-2 border-slate-200 pt-4 space-y-3">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                Clôture de la journée
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Solde de caisse réel (FCFA)</label>
                  <input
                    type="number"
                    value={closingBalance}
                    onChange={(e) => setClosingBalance(Number(e.target.value))}
                    className="w-full border-2 border-slate-300 rounded-lg px-3 py-2 text-lg font-bold"
                    placeholder="Comptez la caisse..."
                  />
                  {closingBalance !== 0 && closingBalance !== netBalance && (
                    <div className={`text-xs mt-1 ${closingBalance > netBalance ? 'text-emerald-700' : 'text-red-700'}`}>
                      Écart: {Number(closingBalance - netBalance).toLocaleString('fr-FR')} F ({closingBalance > netBalance ? 'excédent' : 'manquant'})
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Notes / Observations</label>
                  <textarea
                    value={closingNote}
                    onChange={(e) => setClosingNote(e.target.value)}
                    rows={2}
                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                    placeholder="Ex: Écart dû à..."
                  />
                </div>
              </div>
              <button
                onClick={handleCloseDay}
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-5 h-5" />
                {loading ? 'Clôture en cours...' : '✅ Clôturer la journée'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
