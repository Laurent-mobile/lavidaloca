'use client';

import { useState, useEffect , useCallback} from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Calendar, Clock, DollarSign, TrendingUp, TrendingDown,
  Search, Filter, Download, Printer, Eye, FileText,
  X, RefreshCw, CheckCircle, AlertCircle, CreditCard,
  Smartphone, Banknote, Receipt, Users, TrendingUpDown
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface CashSession {
  id: string;
  session_number: string;
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
  total_restocks?: number;
  cash_sales?: number;
  mobile_sales?: number;
  card_sales?: number;
  notes?: string;
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
  const [showReportModal, setShowReportModal] = useState(false);

  // ✅ 1. DÉFINISSEZ loadSessions ICI (avant le useEffect)
  const loadSessions = useCallback(async () => {
    if (!siteId) {
      console.log('⚠️ siteId non défini, chargement annulé');
      setLoading(false);
      return;
    }

    setLoading(true);
    console.log(' Chargement des sessions pour siteId:', siteId);
    console.log('📅 Filtres de date:', startDate, 'à', endDate);
    
    try {
      // 1. Essayer d'abord cash_sessions
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('cash_sessions')
        .select('*')
        .eq('site_id', siteId)
        .order('opened_at', { ascending: false });

      console.log('📦 Données cash_sessions:', sessionsData);
      console.log('❌ Erreur cash_sessions:', sessionsError);

      let sessionsList = sessionsData || [];

      // 2. FALLBACK : Si cash_sessions est vide OU si les montants sont à 0
      const hasValidData = sessionsList.some(s => 
        (s.total_sales && s.total_sales > 0) || 
        (s.closing_balance && s.closing_balance > 0)
      );

      if (sessionsError || !hasValidData) {
        console.log('⚠️ Fallback activé - Calcul depuis restaurant_orders...');
        
        // ✅ CORRECTION APPLIQUÉE : 'payment_method' a été retiré du .select()
let query = supabase
  .from('restaurant_orders')
  .select('total_amount, created_at') 
  .eq('site_id', siteId)
  .eq('status', 'PAID')
  .order('created_at', { ascending: false });

        // Appliquer les filtres de date
        if (startDate) {
          const [startDay, startMonth, startYear] = startDate.split('/');
          const startDateISO = `${startYear}-${startMonth}-${startDay}T00:00:00`;
          console.log('📅 Filtre date début:', startDateISO);
          query = query.gte('created_at', startDateISO);
        }
        if (endDate) {
          const [endDay, endMonth, endYear] = endDate.split('/');
          const endDateISO = `${endYear}-${endMonth}-${endDay}T23:59:59`;
          console.log('📅 Filtre date fin:', endDateISO);
          query = query.lte('created_at', endDateISO);
        }

        const { data: paidOrders, error: ordersError } = await query;

        console.log('📦 Commandes PAID trouvées:', paidOrders);
        console.log(' Erreur orders:', ordersError);

        if (!ordersError && paidOrders && paidOrders.length > 0) {
          // Regrouper par jour
          const dailyStats: Record<string, any> = {};
          
          paidOrders.forEach((order: any) => {
            const day = new Date(order.created_at).toISOString().split('T')[0];
            
            if (!dailyStats[day]) {
              dailyStats[day] = { 
                date: day, 
                total_sales: 0, 
                cash_sales: 0, 
                mobile_sales: 0, 
                card_sales: 0, 
                count: 0 
              };
            }
            
            const amount = order.total_amount || 0;
            dailyStats[day].total_sales += amount;
            dailyStats[day].count += 1;
            
            // Répartition par mode de paiement
            const method = (order.payment_method || 'Espèces').toLowerCase();
            if (method.includes('espèce') || method.includes('cash') || method.includes('espece')) {
              dailyStats[day].cash_sales += amount;
            } else if (method.includes('mobile') || method.includes('orange') || method.includes('wave') || method.includes('momo')) {
              dailyStats[day].mobile_sales += amount;
            } else if (method.includes('carte') || method.includes('card')) {
              dailyStats[day].card_sales += amount;
            } else {
              // Par défaut, considérer comme espèces
              dailyStats[day].cash_sales += amount;
            }
            
            console.log(`💰 Commande ${order.total_amount} F - Mode: ${method}`);
          });

          // Transformer en sessions
          sessionsList = Object.values(dailyStats).map((stat: any, index: number) => {
            const session = {
              id: `virtual-${index}-${stat.date}`,
              session_number: `SESSION-${stat.date}`,
              opened_at: `${stat.date}T08:00:00`,
              closed_at: `${stat.date}T23:59:59`,
              status: 'CLOSED' as const,
              opening_balance: 0,
              closing_balance: stat.total_sales,
              expected_closing: stat.total_sales,
              variance: 0,
              total_sales: stat.total_sales,
              cash_sales: stat.cash_sales,
              mobile_sales: stat.mobile_sales,
              card_sales: stat.card_sales,
              total_expenses: 0,
              opened_by: 'Système',
              closed_by: 'Système',
              notes: `${stat.count} commande(s) payée(s)`
            };
            console.log('✅ Session créée:', session);
            return session;
          });
          
          console.log(' Total sessions calculées:', sessionsList.length);
        } else {
          console.warn('️ Aucune commande PAID trouvée');
        }
      }

      console.log('📦 Sessions finales à afficher:', sessionsList);
      setSessions(sessionsList);
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

  // ✅ 2. MAINTENANT loadSessions est définie, donc on peut l'utiliser ici
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
    totalRestocks: sessions.reduce((sum, s) => sum + (s.total_restocks || 0), 0)
  };

  const filteredSessions = sessions.filter(session => {
    const matchesSearch = search === '' || 
      session.session_number.toLowerCase().includes(search.toLowerCase()) ||
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
      s.session_number,
      new Date(s.opened_at).toLocaleString('fr-FR'),
      s.closed_at ? new Date(s.closed_at).toLocaleString('fr-FR') : '-',
      s.status === 'OPEN' ? 'Ouverte' : 'Fermée',
      `${s.opening_balance.toLocaleString('fr-FR')} F`,
      `${(s.closing_balance || 0).toLocaleString('fr-FR')} F`,
      `${(s.variance || 0).toLocaleString('fr-FR')} F`,
      `${(s.total_sales || 0).toLocaleString('fr-FR')} F`,
      s.opened_by || '-',
      s.closed_by || '-'
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `historique_caisses_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const handlePrintReport = (session: CashSession) => {
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) {
      alert('Veuillez autoriser les popups pour imprimer.');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Rapport Session ${session.session_number}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
          .header { text-align: center; border-bottom: 3px solid #1e40af; padding-bottom: 20px; margin-bottom: 30px; }
          .header h1 { color: #1e40af; margin: 0; font-size: 28px; }
          .header h2 { color: #64748b; margin: 10px 0 0; font-size: 16px; }
          .section { margin-bottom: 30px; }
          .section-title { background: #1e40af; color: white; padding: 10px 15px; font-weight: bold; margin-bottom: 15px; border-radius: 5px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
          .info-item { background: #f8fafc; padding: 12px; border-radius: 5px; border-left: 4px solid #1e40af; }
          .info-label { font-size: 12px; color: #64748b; margin-bottom: 5px; }
          .info-value { font-size: 16px; font-weight: bold; color: #1e293b; }
          .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 20px 0; }
          .stat-card { background: #f8fafc; padding: 15px; border-radius: 8px; text-align: center; }
          .stat-value { font-size: 24px; font-weight: bold; color: #1e40af; }
          .stat-label { font-size: 12px; color: #64748b; margin-top: 5px; }
          .payment-methods { margin: 15px 0; }
          .payment-item { display: flex; justify-content: space-between; padding: 10px; background: #f8fafc; margin-bottom: 8px; border-radius: 5px; }
          @media print { body { padding: 10px; } .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>LA TERRA COTTA OUAGA</h1>
          <h2>Rapport Détaillé de Session de Caisse</h2>
          <p>Session ${session.session_number} - ${new Date(session.opened_at).toLocaleDateString('fr-FR')}</p>
        </div>
        <div class="section">
          <div class="section-title">Informations Générales</div>
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Statut</div>
              <div class="info-value">${session.status === 'OPEN' ? '🔵 Ouverte' : '✅ Fermée'}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Ouverte le</div>
              <div class="info-value">${new Date(session.opened_at).toLocaleString('fr-FR')}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Fermée le</div>
              <div class="info-value">${session.closed_at ? new Date(session.closed_at).toLocaleString('fr-FR') : '-'}</div>
            </div>
          </div>
        </div>
        <div class="section">
          <div class="section-title">Finances</div>
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value">${(session.opening_balance || 0).toLocaleString('fr-FR')} F</div>
              <div class="stat-label">Solde Ouverture</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${(session.closing_balance || 0).toLocaleString('fr-FR')} F</div>
              <div class="stat-label">Solde Fermeture</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${(session.variance || 0).toLocaleString('fr-FR')} F</div>
              <div class="stat-label">Écart</div>
            </div>
          </div>
        </div>
        <div style="margin-top: 40px; text-align: center; color: #64748b; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
          Rapport généré le ${new Date().toLocaleString('fr-FR')}
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const getStatusBadge = (status: string) => {
    if (status === 'OPEN') {
      return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">🔵 Ouverte</span>;
    }
    return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-800">✅ Fermée</span>;
  };

  const getVarianceBadge = (variance: number) => {
    if (variance === 0) {
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
        <div className="bg-teal-50 rounded-xl border border-teal-200 p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-teal-700 mb-1">Approvisionnements</p>
              <p className="text-2xl font-bold text-teal-900">{stats.totalRestocks.toLocaleString('fr-FR')} f CFA</p>
            </div>
            <div className="p-3 bg-teal-100 rounded-lg">
              <CreditCard className="w-6 h-6 text-teal-600" />
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
              <input type="text" placeholder="Rechercher par ID session, notes..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
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
                filteredSessions.map((session) => (
                  <tr key={session.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-blue-50 rounded-lg">
                          <Calendar className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">
                            {new Date(session.opened_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                          </div>
                          <div className="text-sm text-slate-500 mt-1">
                            {new Date(session.opened_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            {session.closed_at && ` - ${new Date(session.closed_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            {getStatusBadge(session.status)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{(session.opening_balance || 0).toLocaleString('fr-FR')} f CFA</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{(session.closing_balance || 0).toLocaleString('fr-FR')} f CFA</div>
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
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm">
                        <div className="text-slate-500 mb-1">Ouvert par</div>
                        <div className="font-medium text-slate-900">{session.opened_by || '-'}</div>
                        {session.closed_by && (
                          <>
                            <div className="text-slate-500 mt-2 mb-1">Fermé par</div>
                            <div className="font-medium text-slate-900">{session.closed_by}</div>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-2">
                        <button onClick={() => { setSelectedSession(session); setShowDetailsModal(true); }} className="w-full flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors">
                          <Eye className="w-4 h-4" /> Détails
                        </button>
                        <button onClick={() => handlePrintReport(session)} className="w-full flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors">
                          <Printer className="w-4 h-4" /> Imprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Détails */}
      {showDetailsModal && selectedSession && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between sticky top-0 z-10">
              <div>
                <h3 className="text-xl font-bold">Détails de la Session</h3>
                <p className="text-sm text-slate-300 mt-1">Session du {new Date(selectedSession.opened_at).toLocaleString('fr-FR')}</p>
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
                      <span className="text-sm text-slate-600">ID Session</span>
                      <span className="font-mono text-sm bg-slate-100 px-2 py-1 rounded">{selectedSession.id.slice(0, 8)}...</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-sm text-slate-600">Ouverte le</span>
                      <span className="font-medium">{new Date(selectedSession.opened_at).toLocaleString('fr-FR')}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-sm text-slate-600">Fermée le</span>
                      <span className="font-medium">{selectedSession.closed_at ? new Date(selectedSession.closed_at).toLocaleString('fr-FR') : '-'}</span>
                    </div>
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
                    <div className="flex justify-between py-2">
                      <span className="text-sm text-slate-600">Écart</span>
                      {getVarianceBadge(selectedSession.variance || 0)}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button onClick={() => setShowDetailsModal(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-lg">Fermer</button>
                <button onClick={() => { setShowDetailsModal(false); handlePrintReport(selectedSession); }} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2">
                  <Printer className="w-4 h-4" /> Imprimer Rapport
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
