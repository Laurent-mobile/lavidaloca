'use client';
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  X, FileText, TrendingUp, TrendingDown, DollarSign, CheckCircle, 
  AlertCircle, Printer, Search, RotateCcw 
} from 'lucide-react';

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
  const [search, setSearch] = useState('');

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
      setClosingBalance(0);
      setClosingNote('');
    }

    setLoading(false);
  };

  // ✅ Filtrage multicritère en temps réel
  const filteredTransactions = useMemo(() => {
    if (!search.trim()) return transactions;
    const lowerSearch = search.toLowerCase();
    return transactions.filter(t => 
      (t.category || '').toLowerCase().includes(lowerSearch) ||
      (t.description || '').toLowerCase().includes(lowerSearch) ||
      (t.provider_name || '').toLowerCase().includes(lowerSearch)
    );
  }, [transactions, search]);

  // ✅ Statistiques basées sur les données filtrées (pour l'affichage)
  const stats = useMemo(() => {
    const totalIncome = filteredTransactions.filter(t => t.type === 'INCOME').reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const totalExpense = filteredTransactions.filter(t => t.type === 'EXPENSE').reduce((sum, t) => sum + Number(t.amount || 0), 0);
    return {
      totalIncome,
      totalExpense,
      netBalance: totalIncome - totalExpense,
      countIncome: filteredTransactions.filter(t => t.type === 'INCOME').length,
      countExpense: filteredTransactions.filter(t => t.type === 'EXPENSE').length,
      totalCount: filteredTransactions.length
    };
  }, [filteredTransactions]);

  // ✅ Statistiques globales (pour le calcul d'écart de caisse, qui doit concerner toute la journée)
  const globalStats = useMemo(() => {
    const totalIncome = transactions.filter(t => t.type === 'INCOME').reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const totalExpense = transactions.filter(t => t.type === 'EXPENSE').reduce((sum, t) => sum + Number(t.amount || 0), 0);
    return { netBalance: totalIncome - totalExpense };
  }, [transactions]);

  const handleCloseDay = async () => {
    if (!confirm('Confirmer la clôture de la journée du ' + new Date(reportDate).toLocaleDateString('fr-FR') + ' ?')) return;
    
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    // On utilise les stats globales (non filtrées) pour la clôture officielle
    const { error } = await supabase.from('daily_closings').insert({
      site_id: siteId,
      closing_date: reportDate,
      total_income: globalStats.netBalance + (transactions.filter(t => t.type === 'EXPENSE').reduce((sum, t) => sum + Number(t.amount || 0), 0)), // Recalcul propre
      total_expense: transactions.filter(t => t.type === 'EXPENSE').reduce((sum, t) => sum + Number(t.amount || 0), 0),
      net_balance: globalStats.netBalance,
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

    // L'impression utilise les données filtrées
    const { totalIncome, totalExpense, netBalance } = stats;

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
          <h1>📊 RAPPORT DE FIN DE JOURNÉE</h1>
          <p><strong>LA VIDA-LOCA</strong> - ${new Date(reportDate).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          ${search ? `<p style="color: #64748b; font-size: 14px; margin-top: -10px;"><em>Filtre appliqué : "${search}"</em></p>` : ''}
          
          <div class="summary">
            <div class="card income">
              <h3>💰 ENCAISSEMENTS</h3>
              <div class="amount" style="color: #10b981;">+ ${Number(totalIncome).toLocaleString('fr-FR')} fcfa</div>
            </div>
            <div class="card expense">
              <h3>💸 DÉCAISSEMENTS</h3>
              <div class="amount" style="color: #ef4444;">- ${Number(totalExpense).toLocaleString('fr-FR')} fcfa</div>
            </div>
            <div class="card">
              <h3>⚖️ SOLDE NET</h3>
              <div class="amount" style="color: #1e3a8a;">${Number(netBalance).toLocaleString('fr-FR')} fcfa</div>
            </div>
          </div>

          <h2>Détail des transactions (${filteredTransactions.length})</h2>
          <table>
            <thead>
              <tr><th>Heure</th><th>Type</th><th>Catégorie</th><th>Description</th><th style="text-align:right">Montant</th></tr>
            </thead>
            <tbody>
              ${filteredTransactions.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding: 20px;">Aucune transaction ne correspond aux critères</td></tr>' : ''}
              ${filteredTransactions.map(t => `
                <tr>
                  <td>${new Date(t.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                  <td>${t.type === 'INCOME' ? '📈 Recette' : '📉 Dépense'}</td>
                  <td>${t.category}</td>
                  <td>${t.description || '-'} ${t.provider_name ? '(' + t.provider_name + ')' : ''}</td>
                  <td style="text-align:right; font-weight:bold; color: ${t.type === 'INCOME' ? '#10b981' : '#ef4444'};">
                    ${t.type === 'INCOME' ? '+' : '-'} ${Number(t.amount).toLocaleString('fr-FR')} fcfa
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          ${isClosed ? `<div style="margin-top:30px; padding:15px; background:#d1fae5; border:2px solid #10b981; border-radius:8px; text-align:center;"><strong>✅ JOURNÉE CLÔTURÉE</strong><br/>Solde de clôture déclaré: ${Number(closingBalance).toLocaleString('fr-FR')} fcfa</div>` : ''}

          <div class="footer">
            <p>Document généré par LA VIDA-LOCA le ${new Date().toLocaleString('fr-FR')}</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  const handleReset = () => {
    setSearch('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white px-6 py-4 flex items-center justify-between rounded-t-xl flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Rapport de fin de journée</h2>
              <p className="text-xs text-blue-200">Clôture de caisse et résumé financier</p>
            </div>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenu scrollable */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          
          {/* Barre de filtres */}
          <div className="flex flex-col md:flex-row gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-700 whitespace-nowrap">Date :</label>
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                disabled={isClosed}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
              />
            </div>
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher par catégorie, description ou fournisseur..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              {search && (
                <button onClick={handleReset} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button 
              onClick={handlePrint} 
              className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
            >
              <Printer className="w-4 h-4" /> Imprimer
            </button>
          </div>

          {isClosed && (
            <div className="bg-emerald-50 border-2 border-emerald-300 p-3 rounded-lg flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-700 flex-shrink-0" />
              <div>
                <div className="font-semibold text-emerald-900 text-sm">✅ Journée déjà clôturée</div>
                <div className="text-xs text-emerald-700">Solde de clôture déclaré : {Number(closingBalance).toLocaleString('fr-FR')} fcfa</div>
              </div>
            </div>
          )}

          {/* Résumé (basé sur les filtres) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Encaissements</div>
                <div className="text-3xl font-bold text-emerald-900 mt-1">+ {Number(stats.totalIncome).toLocaleString('fr-FR')} <span className="text-sm font-normal">fcfa</span></div>
                <div className="text-xs text-emerald-700 mt-1">{stats.countIncome} transaction(s)</div>
              </div>
              <TrendingUp className="w-8 h-8 text-emerald-300" />
            </div>
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-red-700 uppercase tracking-wide">Décaissements</div>
                <div className="text-3xl font-bold text-red-900 mt-1">- {Number(stats.totalExpense).toLocaleString('fr-FR')} <span className="text-sm font-normal">fcfa</span></div>
                <div className="text-xs text-red-700 mt-1">{stats.countExpense} transaction(s)</div>
              </div>
              <TrendingDown className="w-8 h-8 text-red-300" />
            </div>
            <div className={`border-2 rounded-xl p-4 flex items-center justify-between ${stats.netBalance >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
              <div>
                <div className={`text-xs font-semibold uppercase tracking-wide ${stats.netBalance >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>Solde net</div>
                <div className={`text-3xl font-bold mt-1 ${stats.netBalance >= 0 ? 'text-blue-900' : 'text-orange-900'}`}>
                  {Number(stats.netBalance).toLocaleString('fr-FR')} <span className="text-sm font-normal">fcfa</span>
                </div>
                <div className={`text-xs mt-1 ${stats.netBalance >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>{stats.totalCount} transaction(s) au total</div>
              </div>
              <DollarSign className={`w-8 h-8 ${stats.netBalance >= 0 ? 'text-blue-300' : 'text-orange-300'}`} />
            </div>
          </div>

          {/* Liste des transactions */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 text-sm">Détail des transactions</h3>
              <span className="text-xs text-slate-500 bg-white px-2 py-1 rounded-full border border-slate-200">{filteredTransactions.length} résultat(s)</span>
            </div>
            {loading ? (
              <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <p>Chargement des données...</p>
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-3">
                <Search className="w-12 h-12 text-slate-300" />
                <p className="font-medium">Aucune transaction ne correspond à vos critères.</p>
                {search && <button onClick={handleReset} className="text-blue-600 hover:underline text-sm">Réinitialiser la recherche</button>}
              </div>
            ) : (
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 text-slate-600 font-semibold uppercase text-xs tracking-wider sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-left">Heure</th>
                      <th className="px-4 py-3 text-left">Type</th>
                      <th className="px-4 py-3 text-left">Catégorie</th>
                      <th className="px-4 py-3 text-left">Description</th>
                      <th className="px-4 py-3 text-right">Montant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredTransactions.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          {new Date(t.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${t.type === 'INCOME' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                            {t.type === 'INCOME' ? '📈 Recette' : '📉 Dépense'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700 font-medium">{t.category}</td>
                        <td className="px-4 py-3 text-slate-600 max-w-xs truncate" title={t.description}>
                          {t.description || '-'} {t.provider_name && <span className="text-slate-400 text-xs">({t.provider_name})</span>}
                        </td>
                        <td className={`px-4 py-3 text-right font-bold font-mono whitespace-nowrap ${t.type === 'INCOME' ? 'text-emerald-700' : 'text-red-700'}`}>
                          {t.type === 'INCOME' ? '+' : '-'} {Number(t.amount).toLocaleString('fr-FR')} fcfa
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Clôture */}
          {!isClosed && transactions.length > 0 && (
            <div className="border-t-2 border-slate-200 pt-4 space-y-4">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                Clôture de la journée
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Solde de caisse réel (FCFA) *</label>
                  <input
                    type="number"
                    value={closingBalance}
                    onChange={(e) => setClosingBalance(Number(e.target.value))}
                    className="w-full border-2 border-slate-300 rounded-lg px-3 py-2.5 text-lg font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="Comptez la caisse..."
                  />
                  {closingBalance !== 0 && closingBalance !== globalStats.netBalance && (
                    <div className={`text-xs mt-2 font-medium flex items-center gap-1 ${closingBalance > globalStats.netBalance ? 'text-emerald-700' : 'text-red-700'}`}>
                      <AlertCircle className="w-3 h-3" />
                      Écart: {Number(closingBalance - globalStats.netBalance).toLocaleString('fr-FR')} fcfa ({closingBalance > globalStats.netBalance ? 'excédent' : 'manquant'})
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Notes / Observations</label>
                  <textarea
                    value={closingNote}
                    onChange={(e) => setClosingNote(e.target.value)}
                    rows={3}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                    placeholder="Ex: Écart dû à une erreur de rendu de monnaie..."
                  />
                </div>
              </div>
              <button
                onClick={handleCloseDay}
                disabled={loading || closingBalance === 0}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm"
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
