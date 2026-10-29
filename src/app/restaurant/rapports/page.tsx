'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  BarChart3, ShoppingCart, Wallet, Package, CreditCard, 
  ChefHat, FileText, Download, Printer, Search,
  Calendar, TrendingUp, AlertCircle
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function RapportsDetaillesPage() {
  const supabase = createClient();
  const [siteId, setSiteId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  
  // Filtres
  const [startDate, setStartDate] = useState('01/10/2026');
  const [endDate, setEndDate] = useState('28/10/2026');
  const [activeTab, setActiveTab] = useState<'resume' | 'ventes' | 'depenses-courantes' | 'depenses-fixes' | 'commandes-fournisseurs' | 'paiements-fournisseurs' | 'cuisine-bar'>('resume');
  
  // Données
  const [stats, setStats] = useState({
    totalVentes: 0,
    countVentes: 0,
    totalDepenses: 0,
    depensesCourantes: 0,
    countDepensesCourantes: 0,
    depensesFixes: 0,
    countDepensesFixes: 0,
    paiementsFournisseurs: 0,
    countPaiementsFournisseurs: 0,
    commandesFournisseurs: 0,
    countCommandesFournisseurs: 0,
    profitNet: 0,
    margeBeneficiaire: 0
  });

  const [ventes, setVentes] = useState<any[]>([]);
  const [depensesCourantes, setDepensesCourantes] = useState<any[]>([]);
  const [depensesFixes, setDepensesFixes] = useState<any[]>([]);
  const [commandesFournisseurs, setCommandesFournisseurs] = useState<any[]>([]);
  const [paiementsFournisseurs, setPaiementsFournisseurs] = useState<any[]>([]);

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
      loadAllData();
    }
  }, [siteId, startDate, endDate]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [startDay, startMonth, startYear] = startDate.split('/');
      const [endDay, endMonth, endYear] = endDate.split('/');
      const startDateISO = `${startYear}-${startMonth}-${startDay}`;
      const endDateISO = `${endYear}-${endMonth}-${endDay}`;

      // ✅ 1. Charger les ventes avec PAGINATION (pour éviter la limite de 1000 lignes de Supabase)
      let allVentes: any[] = [];
      let hasMore = true;
      let offset = 0;
      const PAGE_SIZE = 1000;

      while (hasMore) {
        const { data: ordersPage, error: ordersError } = await supabase
          .from('restaurant_orders')
          .select(`
            *, 
            restaurant_tables(number),
            restaurant_employees(first_name, last_name)
          `)
          .eq('site_id', siteId)
          .eq('status', 'PAID')
          .gte('created_at', startDateISO)
          .lte('created_at', endDateISO)
          .order('created_at', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        if (ordersError) {
          console.error('Erreur chargement ventes:', ordersError);
          break;
        }

        if (ordersPage && ordersPage.length > 0) {
          allVentes = [...allVentes, ...ordersPage];
          offset += PAGE_SIZE;
          
          if (ordersPage.length < PAGE_SIZE) {
            hasMore = false; // Plus de données à charger
          }
          
          if (allVentes.length >= 10000) {
            hasMore = false;
            console.warn('⚠️ Limite de 10 000 ventes atteinte. Veuillez réduire la période.');
          }
        } else {
          hasMore = false;
        }
      }

      const totalVentes = allVentes.reduce((sum, o) => sum + (o.total_amount || 0), 0);
      setVentes(allVentes);

      // ✅ 2. Charger les dépenses courantes (avec sécurité anti-limite)
      const { data: expensesCourantes } = await supabase
        .from('expenses')
        .select('*')
        .eq('site_id', siteId)
        .eq('type', 'COURANTE')
        .gte('date', startDateISO)
        .lte('date', endDateISO)
        .range(0, 9999);

      const depensesCourantesTotal = expensesCourantes?.reduce((sum, e) => sum + e.amount, 0) || 0;
      setDepensesCourantes(expensesCourantes || []);

      // ✅ 3. Charger les dépenses fixes
      const { data: expensesFixes } = await supabase
        .from('expenses')
        .select('*')
        .eq('site_id', siteId)
        .eq('type', 'FIXE')
        .gte('date', startDateISO)
        .lte('date', endDateISO)
        .range(0, 9999);

      const depensesFixesTotal = expensesFixes?.reduce((sum, e) => sum + e.amount, 0) || 0;
      setDepensesFixes(expensesFixes || []);

      // ✅ 4. Charger les commandes fournisseurs
      const { data: supplierOrders } = await supabase
        .from('supplier_orders')
        .select('*, suppliers(name)')
        .eq('site_id', siteId)
        .gte('order_date', startDateISO)
        .lte('order_date', endDateISO)
        .range(0, 9999);

      const commandesFournisseursTotal = supplierOrders?.reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0;
      setCommandesFournisseurs(supplierOrders || []);

      // ✅ 5. Charger les paiements fournisseurs
      const { data: supplierPayments } = await supabase
        .from('supplier_payments')
        .select('*, suppliers(name)')
        .eq('site_id', siteId)
        .gte('paid_at', startDateISO)
        .lte('paid_at', endDateISO)
        .range(0, 9999);

      const paiementsFournisseursTotal = supplierPayments?.reduce((sum, p) => sum + p.amount, 0) || 0;
      setPaiementsFournisseurs(supplierPayments || []);

      // Calculer les stats
      const totalDepenses = depensesCourantesTotal + depensesFixesTotal + paiementsFournisseursTotal;
      const profitNet = totalVentes - totalDepenses;
      const margeBeneficiaire = totalVentes > 0 ? (profitNet / totalVentes) * 100 : 0;

      setStats({
        totalVentes,
        countVentes: allVentes.length,
        totalDepenses,
        depensesCourantes: depensesCourantesTotal,
        countDepensesCourantes: expensesCourantes?.length || 0,
        depensesFixes: depensesFixesTotal,
        countDepensesFixes: expensesFixes?.length || 0,
        paiementsFournisseurs: paiementsFournisseursTotal,
        countPaiementsFournisseurs: supplierPayments?.length || 0,
        commandesFournisseurs: commandesFournisseursTotal,
        countCommandesFournisseurs: supplierOrders?.length || 0,
        profitNet,
        margeBeneficiaire
      });
    } catch (error) {
      console.error('Erreur chargement données:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = (type: string) => {
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.setTextColor(79, 70, 229);
    doc.text(`Rapport ${type}`, 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Période: ${startDate} au ${endDate}`, 105, 28, { align: 'center' });
    
    let tableData: any[] = [];
    let headers: string[] = [];

    if (type === 'Ventes') {
      headers = ['Commande', 'Table', 'Date', 'Serveur', 'Montant'];
      tableData = ventes.map(v => [
        v.order_number,
        v.restaurant_tables?.number || '-',
        new Date(v.created_at).toLocaleDateString('fr-FR'),
        `${v.restaurant_employees?.first_name || ''} ${v.restaurant_employees?.last_name || ''}`,
        `${v.total_amount.toLocaleString('fr-FR')} F`
      ]);
    } else if (type === 'Dépenses Courantes') {
      headers = ['Description', 'Catégorie', 'Date', 'Montant'];
      tableData = depensesCourantes.map(d => [
        d.description,
        d.category,
        new Date(d.date).toLocaleDateString('fr-FR'),
        `${d.amount.toLocaleString('fr-FR')} F`
      ]);
    } else if (type === 'Paiements Fournisseurs') {
      headers = ['Référence', 'Fournisseur', 'Date', 'Montant', 'Mode'];
      tableData = paiementsFournisseurs.map(p => [
        p.reference_number || '-',
        p.suppliers?.name || '-',
        new Date(p.paid_at).toLocaleDateString('fr-FR'),
        `${p.amount.toLocaleString('fr-FR')} F`,
        p.payment_method
      ]);
    }

    autoTable(doc, {
      startY: 35,
      head: [headers],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229], textColor: 255 },
      styles: { fontSize: 9 }
    });
    
    doc.save(`Rapport_${type}_${startDate.replace(/\//g, '-')}.pdf`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-indigo-600" />
            Rapports Détaillés
          </h1>
          <p className="text-sm text-slate-500 mt-1">Analyse complète des performances du restaurant</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Printer className="w-4 h-4" />
            Imprimer Résumé
          </button>
          <button className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <FileText className="w-4 h-4" />
            Résumé PDF
          </button>
          <button className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <FileText className="w-4 h-4" />
            Rapport Complet PDF
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Date de début</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={startDate.split('/').reverse().join('-')}
                onChange={(e) => {
                  const [year, month, day] = e.target.value.split('-');
                  setStartDate(`${day}/${month}/${year}`);
                }}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Date de fin</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={endDate.split('/').reverse().join('-')}
                onChange={(e) => {
                  const [year, month, day] = e.target.value.split('-');
                  setEndDate(`${day}/${month}/${year}`);
                }}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="flex items-end justify-end">
            <button 
              onClick={loadAllData}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              <TrendingUp className="w-4 h-4" />
              Actualiser avec les filtres
            </button>
          </div>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-2 border-b border-slate-200 overflow-x-auto">
        <button onClick={() => setActiveTab('resume')} className={`flex items-center gap-2 px-4 py-3 font-medium text-sm whitespace-nowrap transition-colors ${activeTab === 'resume' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}>
          <BarChart3 className="w-4 h-4" /> Résumé
        </button>
        <button onClick={() => setActiveTab('ventes')} className={`flex items-center gap-2 px-4 py-3 font-medium text-sm whitespace-nowrap transition-colors ${activeTab === 'ventes' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}>
          <ShoppingCart className="w-4 h-4" /> Ventes ({stats.countVentes})
        </button>
        <button onClick={() => setActiveTab('depenses-courantes')} className={`flex items-center gap-2 px-4 py-3 font-medium text-sm whitespace-nowrap transition-colors ${activeTab === 'depenses-courantes' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}>
          <Wallet className="w-4 h-4" /> Dépenses Courantes ({stats.countDepensesCourantes})
        </button>
        <button onClick={() => setActiveTab('depenses-fixes')} className={`flex items-center gap-2 px-4 py-3 font-medium text-sm whitespace-nowrap transition-colors ${activeTab === 'depenses-fixes' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}>
          <Package className="w-4 h-4" /> Dépenses Fixes ({stats.countDepensesFixes})
        </button>
        <button onClick={() => setActiveTab('commandes-fournisseurs')} className={`flex items-center gap-2 px-4 py-3 font-medium text-sm whitespace-nowrap transition-colors ${activeTab === 'commandes-fournisseurs' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}>
          <Package className="w-4 h-4" /> Commandes Fournisseurs ({stats.countCommandesFournisseurs})
        </button>
        <button onClick={() => setActiveTab('paiements-fournisseurs')} className={`flex items-center gap-2 px-4 py-3 font-medium text-sm whitespace-nowrap transition-colors ${activeTab === 'paiements-fournisseurs' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}>
          <CreditCard className="w-4 h-4" /> Paiements Fournisseurs ({stats.countPaiementsFournisseurs})
        </button>
        <button onClick={() => setActiveTab('cuisine-bar')} className={`flex items-center gap-2 px-4 py-3 font-medium text-sm whitespace-nowrap transition-colors ${activeTab === 'cuisine-bar' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}>
          <ChefHat className="w-4 h-4" /> Cuisine & Bar
        </button>
      </div>

      {/* Contenu des onglets */}
      {activeTab === 'resume' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">Ventes Totales</p>
                <p className="text-2xl font-bold text-slate-900">{stats.totalVentes.toLocaleString('fr-FR')} f CFA</p>
                <p className="text-xs text-slate-400 mt-2">{stats.countVentes} vente(s)</p>
              </div>
              <div className="p-3 bg-emerald-50 rounded-lg">
                <ShoppingCart className="w-6 h-6 text-emerald-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">Dépenses Totales</p>
                <p className="text-2xl font-bold text-slate-900">{stats.totalDepenses.toLocaleString('fr-FR')} f CFA</p>
                <p className="text-xs text-slate-400 mt-2">Toutes dépenses confondues</p>
              </div>
              <div className="p-3 bg-red-50 rounded-lg">
                <Wallet className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">Profit Net</p>
                <p className={`text-2xl font-bold ${stats.profitNet >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {stats.profitNet.toLocaleString('fr-FR')} f CFA
                </p>
                <p className="text-xs text-slate-400 mt-2">Ventes - Dépenses</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <TrendingUp className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">Marge Bénéficiaire</p>
                <p className={`text-2xl font-bold ${stats.margeBeneficiaire >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {stats.margeBeneficiaire.toFixed(2)}%
                </p>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ventes' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="p-4 border-b border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-900">Ventes Détaillées</h3>
                <p className="text-sm text-slate-500 mt-1">
                  {stats.countVentes} vente(s) filtrée(s) • Total: {stats.totalVentes.toLocaleString('fr-FR')} f CFA
                </p>
                {/* ✅ Indicateur si la limite est atteinte */}
                {ventes.length >= 10000 && (
                  <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Limite maximale de 10 000 ventes atteinte. Veuillez réduire la période.
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="text" placeholder="Rechercher commande, table..." className="pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm" />
                </div>
                <button onClick={() => handleExportPDF('Ventes')} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                  <FileText className="w-4 h-4" /> Export PDF
                </button>
              </div>
            </div>
          </div>
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {ventes.map((vente) => (
              <div key={vente.id} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-emerald-50 rounded-lg">
                      <ShoppingCart className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900">Commande #{vente.order_number}</div>
                      <div className="text-sm text-slate-500 mt-1">
                        Table {vente.restaurant_tables?.number || '-'} • 
                        {new Date(vente.created_at).toLocaleString('fr-FR')} • 
                        Serveur: {vente.restaurant_employees?.first_name || ''} {vente.restaurant_employees?.last_name || ''}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-slate-900 text-lg">{vente.total_amount.toLocaleString('fr-FR')} f CFA</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'depenses-courantes' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="p-4 border-b border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-900">Dépenses Courantes</h3>
                <p className="text-sm text-slate-500 mt-1">{stats.countDepensesCourantes} dépense(s) • Total: {stats.depensesCourantes.toLocaleString('fr-FR')} f CFA</p>
              </div>
              <button onClick={() => handleExportPDF('Dépenses Courantes')} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                <FileText className="w-4 h-4" /> Export PDF
              </button>
            </div>
          </div>
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {depensesCourantes.map((depense) => (
              <div key={depense.id} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-blue-50 rounded-lg"><Wallet className="w-5 h-5 text-blue-600" /></div>
                    <div>
                      <div className="font-semibold text-slate-900">{depense.description}</div>
                      <div className="text-sm text-slate-500 mt-1">{new Date(depense.date).toLocaleDateString('fr-FR')} • {depense.category}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-slate-900 text-lg">{depense.amount.toLocaleString('fr-FR')} f CFA</div>
                    <div className="text-sm text-slate-500 mt-1">{depense.payment_method}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'depenses-fixes' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="p-4 border-b border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-900">Dépenses Fixes</h3>
                <p className="text-sm text-slate-500 mt-1">{stats.countDepensesFixes} dépense(s) • Total: {stats.depensesFixes.toLocaleString('fr-FR')} f CFA</p>
              </div>
              <button onClick={() => handleExportPDF('Dépenses Fixes')} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                <FileText className="w-4 h-4" /> Export PDF
              </button>
            </div>
          </div>
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {depensesFixes.map((depense) => (
              <div key={depense.id} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-purple-50 rounded-lg"><Package className="w-5 h-5 text-purple-600" /></div>
                    <div>
                      <div className="font-semibold text-slate-900">{depense.description}</div>
                      <div className="text-sm text-slate-500 mt-1">{new Date(depense.date).toLocaleDateString('fr-FR')} • {depense.category}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-slate-900 text-lg">{depense.amount.toLocaleString('fr-FR')} f CFA</div>
                    <div className="text-sm text-slate-500 mt-1">{depense.payment_method}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'commandes-fournisseurs' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="p-4 border-b border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-900">Détail des Commandes Fournisseurs</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Total: {stats.countCommandesFournisseurs} commandes • 
                  <span className="text-emerald-600"> Payées: {commandesFournisseurs.filter(c => c.status === 'RECEIVED').length}</span> • 
                  <span className="text-amber-600"> Partielles: {commandesFournisseurs.filter(c => c.status === 'PARTIAL').length}</span> • 
                  <span className="text-red-600"> Impayées: {commandesFournisseurs.filter(c => c.status === 'SENT' || c.status === 'DRAFT').length}</span>
                </p>
              </div>
              <button onClick={() => handleExportPDF('Commandes Fournisseurs')} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                <FileText className="w-4 h-4" /> Export PDF
              </button>
            </div>
          </div>
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {commandesFournisseurs.map((commande) => (
              <div key={commande.id} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${commande.status === 'RECEIVED' ? 'bg-emerald-50' : commande.status === 'PARTIAL' ? 'bg-amber-50' : 'bg-red-50'}`}>
                      <Package className={`w-5 h-5 ${commande.status === 'RECEIVED' ? 'text-emerald-600' : commande.status === 'PARTIAL' ? 'text-amber-600' : 'text-red-600'}`} />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900">{commande.order_number}</div>
                      <div className="text-sm text-slate-500 mt-1">
                        Fournisseur: {commande.suppliers?.name} • Date: {new Date(commande.order_date).toLocaleDateString('fr-FR')}
                      </div>
                      <div className="flex gap-2 mt-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${commande.status === 'RECEIVED' ? 'bg-emerald-100 text-emerald-800' : commande.status === 'PARTIAL' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
                          {commande.status === 'RECEIVED' ? 'Payée' : commande.status === 'PARTIAL' ? 'Partielle' : 'Impayée'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-slate-900 text-lg">{commande.total_amount.toLocaleString('fr-FR')} f CFA</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'paiements-fournisseurs' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="p-4 border-b border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-900">Paiements Fournisseurs</h3>
                <p className="text-sm text-slate-500 mt-1">{stats.countPaiementsFournisseurs} paiement(s) • Total: {stats.paiementsFournisseurs.toLocaleString('fr-FR')} f CFA</p>
              </div>
              <button onClick={() => handleExportPDF('Paiements Fournisseurs')} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                <FileText className="w-4 h-4" /> Export PDF
              </button>
            </div>
          </div>
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {paiementsFournisseurs.map((paiement) => (
              <div key={paiement.id} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-amber-50 rounded-lg"><CreditCard className="w-5 h-5 text-amber-600" /></div>
                    <div>
                      <div className="font-semibold text-slate-900">Paiement - {paiement.reference_number}</div>
                      <div className="text-sm text-slate-500 mt-1">
                        Fournisseur: {paiement.suppliers?.name} • Date: {new Date(paiement.paid_at).toLocaleDateString('fr-FR')}
                      </div>
                      {paiement.notes && <div className="text-xs text-slate-500 mt-1">Notes: {paiement.notes}</div>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-slate-900 text-lg">{paiement.amount.toLocaleString('fr-FR')} f CFA</div>
                    <div className="text-sm text-emerald-600 mt-1">{paiement.payment_method}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'cuisine-bar' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="text-center py-12">
            <ChefHat className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">Rapport Cuisine & Bar</h3>
            <p className="text-sm text-slate-500 mb-4">Statistiques détaillées des préparations cuisine et bar</p>
            <button className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              <Download className="w-4 h-4" /> Générer le rapport
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
