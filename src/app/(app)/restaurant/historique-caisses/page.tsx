'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Calendar, Clock, DollarSign, TrendingUp, TrendingDown,
  Search, Download, Printer, Eye, X, RefreshCw, CheckCircle,
  AlertCircle, CreditCard, Smartphone, Banknote, Receipt
} from 'lucide-react';

// ✅ Interface mise à jour avec tous les champs nécessaires
interface CashSession {
  id: string;
  session_number?: string;
  opened_at: string;
  closed_at?: string;
  status: 'OPEN' | 'CLOSED';
  opening_balance: number;
  closing_balance?: number;
  expected_closing?: number;
  variance?: number;
  opened_by?: string;
  closed_by?: string;
  total_sales?: number;
  total_expenses?: number;
  cash_sales?: number;
  mobile_sales?: number;
  card_sales?: number;
  notes?: string;
  // ✅ Nouveaux champs ajoutés
  opened_by_name?: string;
  closed_by_name?: string;
  isOvernight?: boolean;
  opening_float?: number;
  counted_amount?: number;
  expected_amount?: number;
}

export default function HistoriqueCaissesPage() {
  const supabase = createClient();
  const [siteId, setSiteId] = useState<string>('');
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedSession, setSelectedSession] = useState<CashSession | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // ✅ Helper pour formater l'affichage des sessions
  const formatSessionDate = (openedAt: string, closedAt?: string) => {
    const openDate = new Date(openedAt);
    const closeDate = closedAt ? new Date(closedAt) : null;

    const formatDate = (d: Date) => d.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const formatTime = (d: Date) => d.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });

    if (!closeDate) {
      return {
        main: `${formatDate(openDate)}`,
        sub: `Ouverte à ${formatTime(openDate)}`,
        isOvernight: false
      };
    }

    const isSameDay = openDate.toDateString() === closeDate.toDateString();
    const isOvernight = closeDate.getTime() < openDate.getTime();

    if (isSameDay) {
      return {
        main: `${formatDate(openDate)}`,
        sub: `${formatTime(openDate)} → ${formatTime(closeDate)}`,
        isOvernight: false
      };
    }

    return {
      main: `${formatDate(openDate)} → ${formatDate(closeDate)}`,
      sub: `${formatTime(openDate)} → ${formatTime(closeDate)}`,
      isOvernight: true
    };
  };

  const loadSessions = useCallback(async () => {
    if (!siteId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    
    try {
      let query = supabase
        .from('cash_sessions')
        .select(`
          *,
          opened_user:profiles!cash_sessions_opened_by_fkey(first_name, last_name),
          closed_user:profiles!cash_sessions_closed_by_fkey(first_name, last_name)
        `)
        .eq('site_id', siteId)
        .order('opened_at', { ascending: false });

      if (startDate) query = query.gte('opened_at', `${startDate}T00:00:00`);
      if (endDate) query = query.lte('opened_at', `${endDate}T23:59:59`);

      const { data: sessionsData, error: sessionsError } = await query;
      if (sessionsError) throw sessionsError;

      if (!sessionsData || sessionsData.length === 0) {
        setSessions([]);
        setLoading(false);
        return;
      }

      const enrichedSessions = await Promise.all(
        sessionsData.map(async (session) => {
          const { data: payments } = await supabase
            .from('restaurant_payments')
            .select('method, amount')
            .eq('session_id', session.id);

          let cash_sales = 0, mobile_sales = 0, card_sales = 0, total_sales = 0;

          if (payments) {
            payments.forEach((p: any) => {
              const amount = Number(p.amount) || 0;
              total_sales += amount;
              const method = (p.method || '').toUpperCase();
              if (method === 'CASH') cash_sales += amount;
              else if (method === 'MOBILE_MONEY') mobile_sales += amount;
              else if (method === 'CARD') card_sales += amount;
            });
          }

          const { data: expenses } = await supabase
            .from('expenses')
            .select('amount')
            .eq('site_id', siteId)
            .eq('subtype', 'CAISSE')
            .gte('created_at', session.opened_at)
            .lte('created_at', session.closed_at || new Date().toISOString());

          const total_expenses = expenses?.reduce((sum, e) => sum + (Number(e.amount) || 0), 0) || 0;

          const opening_balance = Number(
            session.opening_balance ?? session.opening_float ?? 0
          );
          
          let closing_balance = Number(
            session.closing_balance ?? session.counted_amount ?? 0
          );
          
          if (closing_balance === 0 && total_sales > 0) {
            closing_balance = opening_balance + cash_sales - total_expenses;
          }

          const variance = session.status === 'CLOSED'
            ? closing_balance - Number(session.expected_closing ?? session.expected_amount ?? closing_balance)
            : undefined;

          const formatName = (user: any) => {
            if (!user) return '-';
            return `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Utilisateur inconnu';
          };

          // ✅ Calculer isOvernight et le stocker
          const dateInfo = formatSessionDate(session.opened_at, session.closed_at);

          return {
            ...session,
            opening_balance,
            closing_balance,
            total_sales,
            cash_sales,
            mobile_sales,
            card_sales,
            total_expenses,
            variance,
            opened_by_name: formatName(session.opened_user),
            closed_by_name: formatName(session.closed_user),
            isOvernight: dateInfo.isOvernight, // ✅ Stocké ici
          };
        })
      );

      setSessions(enrichedSessions);
      
    } catch (error) {
      console.error('❌ Erreur chargement sessions:', error);
    } finally {
      setLoading(false);
    }
  }, [siteId, startDate, endDate]);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('site_id').eq('id', user.id).maybeSingle();
        if (profile) setSiteId(profile.site_id || '');
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (siteId) {
      loadSessions();
    }
  }, [siteId, loadSessions]);

  const stats = {
    total: sessions.length,
    open: sessions.filter(s => s.status === 'OPEN').length,
    totalSales: sessions.reduce((sum, s) => sum + (s.total_sales || 0), 0),
    totalExpenses: sessions.reduce((sum, s) => sum + (s.total_expenses || 0), 0),
  };

  const filteredSessions = sessions.filter(session => {
    const matchesSearch = search === '' || 
      (session.session_number && session.session_number.toLowerCase().includes(search.toLowerCase())) ||
      (session.notes && session.notes.toLowerCase().includes(search.toLowerCase()));
    
    const matchesStatus = statusFilter === 'ALL' || session.status === statusFilter;
    
    const sessionDate = new Date(session.opened_at);
    const matchesStartDate = !startDate || sessionDate >= new Date(startDate);
    const matchesEndDate = !endDate || sessionDate <= new Date(endDate);
    
    return matchesSearch && matchesStatus && matchesStartDate && matchesEndDate;
  });

  const handleExportCSV = () => {
    const headers = ['Session', 'Date Ouverture', 'Date Fermeture', 'Statut', 'Solde Ouverture', 'Solde Fermeture', 'Écart', 'Ventes Total', 'Ouvert Par', 'Fermé Par'];
    const rows = filteredSessions.map(s => [
      s.session_number || s.id,
      new Date(s.opened_at).toLocaleString('fr-FR'),
      s.closed_at ? new Date(s.closed_at).toLocaleString('fr-FR') : '-',
      s.status === 'OPEN' ? 'Ouverte' : 'Fermée',
      `${(s.opening_balance || 0).toLocaleString('fr-FR')} F`,
      `${(s.closing_balance || 0).toLocaleString('fr-FR')} F`,
      `${(s.variance || 0).toLocaleString('fr-FR')} F`,
      `${(s.total_sales || 0).toLocaleString('fr-FR')} F`,
      s.opened_by_name || '-',
      s.closed_by_name || '-'
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `historique_caisses_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const getStatusBadge = (status: string) => {
    if (status === 'OPEN') {
      return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">🔵 Ouverte</span>;
    }
    return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-800">✅ Fermée</span>;
  };

  const getVarianceBadge = (variance: number) => {
    if (variance === 0 || variance === undefined) {
      return <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800"><CheckCircle className="w-3 h-3" /> Équilibré</span>;
    } else if (variance > 0) {
      return <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"><TrendingUp className="w-3 h-3" /> Excédent: +{variance.toLocaleString('fr-FR')} F</span>;
    } else {
      return <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800"><TrendingDown className="w-3 h-3" /> Déficit: {variance.toLocaleString('fr-FR')} F</span>;
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Receipt className="w-7 h-7 text-indigo-600" />
            Historique des Caisses
          </h1>
          <p className="text-sm text-slate-500 mt-1">Consultation complète des sessions d'ouverture et fermeture de caisse</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-blue-700 mb-1">Sessions Total</p>
              <p className="text-2xl font-bold text-blue-900">{stats.total}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <Calendar className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-emerald-700 mb-1">Sessions Ouvertes</p>
              <p className="text-2xl font-bold text-emerald-900">{stats.open}</p>
            </div>
            <div className="p-3 bg-emerald-100 rounded-lg">
              <Clock className="w-6 h-6 text-emerald-600" />
            </div>
          </div>
        </div>
        <div className="bg-purple-50 rounded-xl border border-purple-200 p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-purple-700 mb-1">Ventes Total</p>
              <p className="text-2xl font-bold text-purple-900">{stats.totalSales.toLocaleString('fr-FR')} f CFA</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-200 p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-red-700 mb-1">Dépenses Total</p>
              <p className="text-2xl font-bold text-red-900">{stats.totalExpenses.toLocaleString('fr-FR')} f CFA</p>
            </div>
            <div className="p-3 bg-red-100 rounded-lg">
              <DollarSign className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">Filtres et Recherche</h3>
          <div className="flex gap-2">
            <button onClick={() => { setSearch(''); setStatusFilter('ALL'); setStartDate(''); setEndDate(''); }} className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium">
              <RefreshCw className="w-4 h-4" /> Réinitialiser
            </button>
            <button onClick={loadSessions} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              <RefreshCw className="w-4 h-4" /> Actualiser
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Recherche avancée</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="text" placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Statut</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="ALL">Tous les statuts</option>
              <option value="OPEN">Ouverte</option>
              <option value="CLOSED">Fermée</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Date début</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Date fin</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-slate-200">
          <p className="text-sm text-slate-600 font-medium">{filteredSessions.length} session(s) trouvée(s)</p>
          <button onClick={handleExportCSV} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Download className="w-4 h-4" /> Exporter CSV
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Session</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Solde Ouverture</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Solde Fermeture</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Écart</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Ventes</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Utilisateurs</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="flex items-center justify-center gap-2 text-slate-500">
                      <RefreshCw className="w-5 h-5 animate-spin" /> Chargement...
                    </div>
                  </td>
                </tr>
              ) : filteredSessions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">Aucune session trouvée</td>
                </tr>
              ) : (
                filteredSessions.map((session) => {
                  const dateInfo = formatSessionDate(session.opened_at, session.closed_at);
                  
                  return (
                    <tr key={session.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg ${session.isOvernight ? 'bg-indigo-50' : 'bg-blue-50'}`}>
                            <Calendar className={`w-5 h-5 ${session.isOvernight ? 'text-indigo-600' : 'text-blue-600'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-slate-900 flex items-center gap-2 flex-wrap">
                              {dateInfo.main}
                              {dateInfo.isOvernight && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                                  🌙 Session de nuit
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-slate-500 mt-1 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {dateInfo.sub}
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              {getStatusBadge(session.status)}
                              {session.total_sales && session.total_sales > 0 && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">
                                  💰 {session.total_sales.toLocaleString('fr-FR')} F
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-bold text-slate-900">{(session.opening_balance || 0).toLocaleString('fr-FR')} f CFA</div>
                          <div className="text-xs text-slate-500 mt-1">Fond de caisse</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className={`font-bold ${session.status === 'CLOSED' ? 'text-slate-900' : 'text-slate-400'}`}>
                            {(session.closing_balance || 0).toLocaleString('fr-FR')} f CFA
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            {session.status === 'CLOSED' 
                              ? (session.closing_balance && session.closing_balance > 0 ? 'Compté à la fermeture' : 'Calculé')
                              : 'Session en cours'}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {getVarianceBadge(session.variance || 0)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-100 text-emerald-800 text-xs">
                              <Banknote className="w-3 h-3" /> Espèces
                            </span>
                            <span className="font-semibold text-slate-900">{(session.cash_sales || 0).toLocaleString('fr-FR')} f CFA</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-purple-100 text-purple-800 text-xs">
                              <Smartphone className="w-3 h-3" /> Mobile
                            </span>
                            <span className="font-semibold text-slate-900">{(session.mobile_sales || 0).toLocaleString('fr-FR')} f CFA</span>
                          </div>
                          {session.card_sales && session.card_sales > 0 && (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-100 text-blue-800 text-xs">
                                <CreditCard className="w-3 h-3" /> Carte
                              </span>
                              <span className="font-semibold text-slate-900">{session.card_sales.toLocaleString('fr-FR')} f CFA</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm">
                          <div className="text-slate-500 mb-1">Ouvert par</div>
                          <div className="font-medium text-slate-900">{session.opened_by_name || '-'}</div>
                          
                          {session.closed_by && (
                            <>
                              <div className="text-slate-500 mt-2 mb-1">Fermé par</div>
                              <div className="font-medium text-slate-900">{session.closed_by_name || '-'}</div>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-2">
                          <button onClick={() => { setSelectedSession(session); setShowDetailsModal(true); }} className="w-full flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors">
                            <Eye className="w-4 h-4" /> Détails
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showDetailsModal && selectedSession && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between sticky top-0 z-10">
              <div>
                <h3 className="text-xl font-bold">Détails de la Session</h3>
                <p className="text-sm text-slate-300 mt-1">
                  {formatSessionDate(selectedSession.opened_at, selectedSession.closed_at).main}
                </p>
              </div>
              <button onClick={() => setShowDetailsModal(false)} className="hover:bg-white/20 p-2 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h4 className="font-bold text-slate-900 mb-4">Informations Générales</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-sm text-slate-600">Statut</span>
                      {getStatusBadge(selectedSession.status)}
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-sm text-slate-600">Ouverte le</span>
                      <span className="font-medium">{new Date(selectedSession.opened_at).toLocaleString('fr-FR')}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-sm text-slate-600">Fermée le</span>
                      <span className="font-medium">{selectedSession.closed_at ? new Date(selectedSession.closed_at).toLocaleString('fr-FR') : '-'}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-sm text-slate-600">Ouvert par</span>
                      <span className="font-medium">{selectedSession.opened_by_name || '-'}</span>
                    </div>
                    {selectedSession.closed_by_name && (
                      <div className="flex justify-between py-2 border-b border-slate-100">
                        <span className="text-sm text-slate-600">Fermé par</span>
                        <span className="font-medium">{selectedSession.closed_by_name}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 mb-4">Finances</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-sm text-slate-600">Solde Ouverture</span>
                      <span className="font-bold">{(selectedSession.opening_balance || 0).toLocaleString('fr-FR')} f CFA</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-sm text-slate-600">Solde Fermeture</span>
                      <span className="font-bold">{(selectedSession.closing_balance || 0).toLocaleString('fr-FR')} f CFA</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-sm text-slate-600">Écart</span>
                      {getVarianceBadge(selectedSession.variance || 0)}
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-sm text-slate-600">Total Ventes</span>
                      <span className="font-bold text-emerald-700">{(selectedSession.total_sales || 0).toLocaleString('fr-FR')} f CFA</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-sm text-slate-600">Total Dépenses</span>
                      <span className="font-bold text-red-700">{(selectedSession.total_expenses || 0).toLocaleString('fr-FR')} f CFA</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button onClick={() => setShowDetailsModal(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-lg">Fermer</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
