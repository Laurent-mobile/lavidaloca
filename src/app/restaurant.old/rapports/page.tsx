'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  BarChart3, ShoppingCart, Wallet, Package, CreditCard, 
  ChefHat, FileText, Download, Search, Calendar, TrendingUp, AlertCircle
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Formatage des dates natif YYYY-MM-DD pour éviter les bugs
const getDefaultDates = () => {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  return {
    start: firstDay.toISOString().split('T')[0],
    end: today.toISOString().split('T')[0]
  };
};

export default function RapportsDetaillesPage() {
  const supabase = createClient();
  const [siteId, setSiteId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  
  // Filtres au format YYYY-MM-DD
  const [startDate, setStartDate] = useState(getDefaultDates().start);
  const [endDate, setEndDate] = useState(getDefaultDates().end);
  const [activeTab, setActiveTab] = useState<'resume' | 'ventes' | 'depenses-courantes' | 'depenses-fixes' | 'commandes-fournisseurs' | 'paiements-fournisseurs' | 'cuisine-bar'>('resume');
  
  // Données
  const [stats, setStats] = useState({
    totalVentes: 0, countVentes: 0,
    totalDepenses: 0, depensesCourantes: 0, countDepensesCourantes: 0,
    depensesFixes: 0, countDepensesFixes: 0,
    paiementsFournisseurs: 0, countPaiementsFournisseurs: 0,
    commandesFournisseurs: 0, countCommandesFournisseurs: 0,
    profitNet: 0, margeBeneficiaire: 0
  });

  const [ventes, setVentes] = useState<any[]>([]);
  const [depensesCourantes, setDepensesCourantes] = useState<any[]>([]);
  const [depensesFixes, setDepensesFixes] = useState<any[]>([]);
  const [commandesFournisseurs, setCommandesFournisseurs] = useState<any[]>([]);
  const [paiementsFournisseurs, setPaiementsFournisseurs] = useState<any[]>([]);
  const [cuisineBarData, setCuisineBarData] = useState<any[]>([]);

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
      // Ajout de l'heure pour inclure toute la journée de fin
      const startDateISO = `${startDate}T00:00:00`;
      const endDateISO = `${endDate}T23:59:59`;

      // 1. Ventes
      const { data: allVentes, error: ordersError } = await supabase
        .from('restaurant_orders')
        .select(`*, restaurant_tables(number), restaurant_employees(first_name, last_name)`)
        .eq('site_id', siteId)
        .eq('status', 'PAID')
        .gte('created_at', startDateISO)
        .lte('created_at', endDateISO)
        .order('created_at', { ascending: false })
        .limit(5000); // Limite raisonnable pour les rapports

      const totalVentes = allVentes?.reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0;
      setVentes(allVentes || []);

      // 2. Dépenses courantes
      const { data: expensesCourantes } = await supabase
        .from('expenses')
        .select('*')
        .eq('site_id', siteId)
        .eq('type', 'COURANTE')
        .gte('date', startDate)
        .lte('date', endDate)
        .limit(5000);

      const depensesCourantesTotal = expensesCourantes?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0;
      setDepensesCourantes(expensesCourantes || []);

      // 3. Dépenses fixes
      const { data: expensesFixes } = await supabase
        .from('expenses')
        .select('*')
        .eq('site_id', siteId)
        .eq('type', 'FIXE')
        .gte('date', startDate)
        .lte('date', endDate)
        .limit(5000);

      const depensesFixesTotal = expensesFixes?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0;
      setDepensesFixes(expensesFixes || []);

      // 4. Commandes fournisseurs
      const { data: supplierOrders } = await supabase
        .from('supplier_orders')
        .select('*, suppliers(name)')
        .eq('site_id', siteId)
        .gte('order_date', startDate)
        .lte('order_date', endDate)
        .limit(5000);

      const commandesFournisseursTotal = supplierOrders?.reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0;
      setCommandesFournisseurs(supplierOrders || []);

      // 5. Paiements fournisseurs (avec fallback si la relation suppliers échoue)
      const { data: supplierPayments } = await supabase
        .from('supplier_payments')
        .select('*, suppliers(name)')
        .eq('site_id', siteId)
        .gte('paid_at', startDateISO)
        .lte('paid_at', endDateISO)
        .limit(5000);

      const paiementsFournisseursTotal = supplierPayments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
      setPaiementsFournisseurs(supplierPayments || []);

      // 6. ✅ NOUVEAU : Données Cuisine & Bar (Articles vendus)
      const { data: orderItems } = await supabase
        .from('restaurant_order_items')
        .select(`
          item_name, 
          quantity, 
          total_price,
          restaurant_orders!inner (
            status,
            created_at
          )
        `)
        .eq('restaurant_orders.site_id', siteId)
        .eq('restaurant_orders.status', 'PAID')
        .gte('restaurant_orders.created_at', startDateISO)
        .lte('restaurant_orders.created_at', endDateISO)
        .limit(10000);

      // Agrégation des articles
      const itemStats: Record<string, { qty: number; total: number }> = {};
      orderItems?.forEach((item: any) => {
        const name = item.item_name || 'Article inconnu';
        if (!itemStats[name]) itemStats[name] = { qty: 0, total: 0 };
        itemStats[name].qty += item.quantity || 0;
        itemStats[name].total += item.total_price || 0;
      });

      const sortedCuisineBar = Object.entries(itemStats)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.total - a.total) // Tri par CA décroissant
        .slice(0, 50); // Top 50 des articles

      setCuisineBarData(sortedCuisineBar);

      // Calcul des stats globales
      const totalDepenses = depensesCourantesTotal + depensesFixesTotal + paiementsFournisseursTotal;
      const profitNet = totalVentes - totalDepenses;
      const margeBeneficiaire = totalVentes > 0 ? (profitNet / totalVentes) * 100 : 0;

      setStats({
        totalVentes,
        countVentes: allVentes?.length || 0,
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

  const handleExportPDF = (type: string, data: any[], headers: string[], mapRow: (item: any) => any[]) => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.setTextColor(79, 70, 229);
    doc.text(`Rapport ${type}`, 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Période: ${startDate} au ${endDate}`, 105, 28, { align: 'center' });
    
    const tableData = data.map(mapRow);

    autoTable(doc, {
      startY: 35,
      head: [headers],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229], textColor: 255 },
      styles: { fontSize: 9 }
    });
    
    doc.save(`Rapport_${type}_${startDate}.pdf`);
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
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
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
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
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
              Actualiser
            </button>
          </div>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-2 border-b border-slate-200 overflow-x-auto">
        {[
          { id: 'resume', label: 'Résumé', icon: BarChart3 },
          { id: 'ventes', label: `Ventes (${stats.countVentes})`, icon: ShoppingCart },
          { id: 'depenses-courantes', label: `Dépenses Courantes (${stats.countDepensesCourantes})`, icon: Wallet },
          { id: 'depenses-fixes', label: `Dépenses Fixes (${stats.countDepensesFixes})`, icon: Package },
          { id: 'commandes-fournisseurs', label: `Commandes Frs (${stats.countCommandesFournisseurs})`, icon: Package },
          { id: 'paiements-fournisseurs', label: `Paiements Frs (${stats.countPaiementsFournisseurs})`, icon: CreditCard },
          { id: 'cuisine-bar', label: 'Cuisine & Bar', icon: ChefHat },
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)} 
            className={`flex items-center gap-2 px-4 py-3 font-medium text-sm whitespace-nowrap transition-colors ${
              activeTab === tab.id ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* Contenu : Résumé */}
      {activeTab === 'resume' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">Ventes Totales</p>
                <p className="text-2xl font-bold text-slate-900">{stats.totalVentes.toLocaleString('fr-FR')} f CFA</p>
                <p className="text-xs text-slate-400 mt-2">{stats.countVentes} vente(s)</p>
              </div>
              <div className="p-3 bg-emerald-50 rounded-lg"><ShoppingCart className="w-6 h-6 text-emerald-600" /></div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">Dépenses Totales</p>
                <p className="text-2xl font-bold text-slate-900">{stats.totalDepenses.toLocaleString('fr-FR')} f CFA</p>
                <p className="text-xs text-slate-400 mt-2">Toutes dépenses confondues</p>
              </div>
              <div className="p-3 bg-red-50 rounded-lg"><Wallet className="w-6 h-6 text-red-600" /></div>
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
              <div className="p-3 bg-blue-50 rounded-lg"><TrendingUp className="w-6 h-6 text-blue-600" /></div>
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
              <div className="p-3 bg-purple-50 rounded-lg"><TrendingUp className="w-6 h-6 text-purple-600" /></div>
            </div>
          </div>
        </div>
      )}

      {/* Contenu : Ventes */}
      {activeTab === 'ventes' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900">Ventes Détaillées</h3>
              <p className="text-sm text-slate-500 mt-1">Total: {stats.totalVentes.toLocaleString('fr-FR')} f CFA</p>
            </div>
            <button onClick={() => handleExportPDF('Ventes', ventes, 
              ['Commande', 'Table', 'Date', 'Serveur', 'Montant'], 
              v => [v.order_number, v.restaurant_tables?.number || '-', new Date(v.created_at).toLocaleDateString('fr-FR'), `${v.restaurant_employees?.first_name || ''} ${v.restaurant_employees?.last_name || ''}`, `${v.total_amount.toLocaleString('fr-FR')} F`]
            )} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              <FileText className="w-4 h-4" /> Export PDF
            </button>
          </div>
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {ventes.map((vente) => (
              <div key={vente.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-emerald-50 rounded-lg"><ShoppingCart className="w-5 h-5 text-emerald-600" /></div>
                  <div>
                    <div className="font-semibold text-slate-900">Commande #{vente.order_number}</div>
                    <div className="text-sm text-slate-500 mt-1">
                      Table {vente.restaurant_tables?.number || '-'} • {new Date(vente.created_at).toLocaleString('fr-FR')}
                    </div>
                  </div>
                </div>
                <div className="font-bold text-slate-900 text-lg">{vente.total_amount.toLocaleString('fr-FR')} f CFA</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contenu : Paiements Fournisseurs */}
      {activeTab === 'paiements-fournisseurs' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900">Paiements Fournisseurs</h3>
              <p className="text-sm text-slate-500 mt-1">{stats.countPaiementsFournisseurs} paiement(s) • Total: {stats.paiementsFournisseurs.toLocaleString('fr-FR')} f CFA</p>
            </div>
            <button onClick={() => handleExportPDF('Paiements Fournisseurs', paiementsFournisseurs,
              ['Référence', 'Fournisseur', 'Date', 'Mode', 'Montant'],
              p => [p.reference_number || '-', p.suppliers?.name || 'Inconnu', new Date(p.paid_at).toLocaleDateString('fr-FR'), p.payment_method, `${p.amount.toLocaleString('fr-FR')} F`]
            )} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              <FileText className="w-4 h-4" /> Export PDF
            </button>
          </div>
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {paiementsFournisseurs.map((paiement) => (
              <div key={paiement.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-amber-50 rounded-lg"><CreditCard className="w-5 h-5 text-amber-600" /></div>
                  <div>
                    <div className="font-semibold text-slate-900">Paiement - {paiement.reference_number || 'N/A'}</div>
                    <div className="text-sm text-slate-500 mt-1">
                      Fournisseur: {paiement.suppliers?.name || 'Inconnu'} • Date: {new Date(paiement.paid_at).toLocaleDateString('fr-FR')}
                    </div>
                    {paiement.notes && <div className="text-xs text-slate-500 mt-1">Notes: {paiement.notes}</div>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-slate-900 text-lg">{paiement.amount.toLocaleString('fr-FR')} f CFA</div>
                  <div className="text-sm text-emerald-600 mt-1">{paiement.payment_method}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contenu : Cuisine & Bar */}
      {activeTab === 'cuisine-bar' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900">Performance Cuisine & Bar</h3>
              <p className="text-sm text-slate-500 mt-1">Top des articles vendus sur la période sélectionnée</p>
            </div>
            <button onClick={() => handleExportPDF('Cuisine Bar', cuisineBarData,
              ['Article', 'Quantité Vendue', 'Chiffre d\'Affaires'],
              item => [item.name, `${item.qty}`, `${item.total.toLocaleString('fr-FR')} F`]
            )} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              <Download className="w-4 h-4" /> Export PDF
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Rang</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Article</th>
                  <th className="px-4 py-3 text-center font-semibold text-slate-700">Quantité</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Chiffre d'Affaires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                {cuisineBarData.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      Aucune donnée de vente d'articles pour cette période.
                    </td>
                  </tr>
                ) : (
                  cuisineBarData.map((item, index) => (
                    <tr key={index} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                          index === 0 ? 'bg-yellow-100 text-yellow-800' :
                          index === 1 ? 'bg-slate-200 text-slate-800' :
                          index === 2 ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {index + 1}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
                      <td className="px-4 py-3 text-center text-slate-600">{item.qty}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600">{item.total.toLocaleString('fr-FR')} f CFA</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Autres onglets (Dépenses, Commandes Fournisseurs) conservés similaires à votre version originale mais nettoyés */}
      {activeTab === 'depenses-courantes' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900">Dépenses Courantes</h3>
              <p className="text-sm text-slate-500 mt-1">Total: {stats.depensesCourantes.toLocaleString('fr-FR')} f CFA</p>
            </div>
          </div>
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {depensesCourantes.map((depense) => (
              <div key={depense.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg"><Wallet className="w-5 h-5 text-blue-600" /></div>
                  <div>
                    <div className="font-semibold text-slate-900">{depense.description}</div>
                    <div className="text-sm text-slate-500 mt-1">{new Date(depense.date).toLocaleDateString('fr-FR')} • {depense.category}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-slate-900 text-lg">{depense.amount.toLocaleString('fr-FR')} f CFA</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'commandes-fournisseurs' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900">Commandes Fournisseurs</h3>
              <p className="text-sm text-slate-500 mt-1">Total: {stats.commandesFournisseurs.toLocaleString('fr-FR')} f CFA</p>
            </div>
          </div>
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {commandesFournisseurs.map((commande) => (
              <div key={commande.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-purple-50 rounded-lg"><Package className="w-5 h-5 text-purple-600" /></div>
                  <div>
                    <div className="font-semibold text-slate-900">{commande.order_number}</div>
                    <div className="text-sm text-slate-500 mt-1">
                      Fournisseur: {commande.suppliers?.name || 'Inconnu'} • Date: {new Date(commande.order_date).toLocaleDateString('fr-FR')}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-slate-900 text-lg">{commande.total_amount.toLocaleString('fr-FR')} f CFA</div>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    commande.payment_status === 'PAYÉ' || commande.payment_status === 'PAID' ? 'bg-emerald-100 text-emerald-800' :
                    commande.payment_status === 'PARTIEL' || commande.payment_status === 'PARTIAL' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {commande.payment_status || 'En attente'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}