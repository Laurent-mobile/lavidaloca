'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  RefreshCw, Filter, Settings, Plus, Calendar, DollarSign,
  ShoppingCart, Wallet, Users, TrendingUp, TrendingDown,
  Edit2, Trash2, X, Search, ChevronDown, Receipt, Lock
} from 'lucide-react';

interface Expense {
  id: string;
  date: string;
  category: string;
  description: string;
  type: 'COURANTE' | 'FIXE' | 'FOURNISSEUR' | 'SALAIRE';
  reference?: string;
  amount: number;
  payment_method: string;
  created_by?: string;
  created_at: string;
}

interface Category {
  id: string;
  name: string;
  description?: string;
  category_type: string; // ✅ 'current', 'fixed', 'salary'
  is_system_category: boolean;
  is_active: boolean;
}

export default function DepensesPage() {
  const supabase = createClient();
  const [siteId, setSiteId] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  
  // États de filtrage
  const [activeTab, setActiveTab] = useState<'courantes' | 'fixes' | 'fournisseurs' | 'salaires'>('courantes');
  const [startDate, setStartDate] = useState('01/10/2026');
  const [endDate, setEndDate] = useState('31/10/2026');
  const [search, setSearch] = useState('');
  
  // Données
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  
  // Stats
  const [stats, setStats] = useState({
    courantes: 0,
    fixes: 0,
    fournisseurs: 0,
    salaires: 0,
    total: 0,
    countCourantes: 0,
    countFixes: 0,
    countFournisseurs: 0,
    countSalaires: 0
  });

  // Modales
  const [showNewExpenseModal, setShowNewExpenseModal] = useState(false);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  // ✅ NOUVEAU : États pour les paiements fournisseurs
const [supplierPayments, setSupplierPayments] = useState<any[]>([]);
const [loadingSupplierPayments, setLoadingSupplierPayments] = useState(false);
const [isCreating, setIsCreating] = useState(false);
const [newExpenseForm, setNewExpenseForm] = useState({
  type: 'COURANTE',
  subtype: 'GENERALE',
  category: '',
  date: new Date().toISOString().split('T')[0],
  amount: '',
  payment_method: 'Espèces',
  description: '',
  notes: '',
  is_recurring: false
});
// États pour l'édition
const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
const [isEditing, setIsEditing] = useState(false);
const [editForm, setEditForm] = useState<any>({});

// États pour la suppression
const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
const [isDeleting, setIsDeleting] = useState(false);
// États pour la gestion des catégories
const [newCategoryName, setNewCategoryName] = useState('');
const [newCategoryDescription, setNewCategoryDescription] = useState('');
const [newCategoryType, setNewCategoryType] = useState('current');
const [isCreatingCategory, setIsCreatingCategory] = useState(false);
const [editingCategory, setEditingCategory] = useState<Category | null>(null);
const [isEditingCategory, setIsEditingCategory] = useState(false);
const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
const [isDeletingCategory, setIsDeletingCategory] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data: profile } = await supabase.from('profiles').select('site_id').eq('id', user.id).maybeSingle();
        if (profile) setSiteId(profile.site_id || '');
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (siteId) {
      loadExpenses();
      loadCategories();
    }
  }, [siteId, activeTab, startDate, endDate]);

  const loadExpenses = async () => {
  setLoading(true);
  try {
    // ✅ Si on est sur l'onglet "fournisseurs", charger depuis supplier_payments
    if (activeTab === 'fournisseurs') {
      await loadSupplierPayments();
      return;
    }

    let query = supabase
      .from('expenses')
      .select('*')
      .eq('site_id', siteId)
      .order('date', { ascending: false });

    // Filtrer par type (pour l'affichage du tableau uniquement)
    if (activeTab === 'courantes') {
      query = query.eq('type', 'COURANTE');
    } else if (activeTab === 'fixes') {
      query = query.eq('type', 'FIXE');
    } else if (activeTab === 'salaires') {
      query = query.eq('type', 'SALAIRE');
    }

    // Filtrer par date
    const [startDay, startMonth, startYear] = startDate.split('/');
    const [endDay, endMonth, endYear] = endDate.split('/');
    const startDateISO = `${startYear}-${startMonth}-${startDay}`;
    const endDateISO = `${endYear}-${endMonth}-${endDay}`;
    
    query = query.gte('date', startDateISO).lte('date', endDateISO);

    const { data, error } = await query;
    if (error) throw error;
    setExpenses(data || []);
    
    // ✅ Calculer les stats pour TOUS les types (pas seulement l'onglet actif)
    await calculateStats(data || []);
  } catch (error) {
    console.error('Erreur chargement dépenses:', error);
  } finally {
    setLoading(false);
  }
};;

// ✅ Fonction de soumission du formulaire
const handleCreateExpense = async (e: React.FormEvent) => {
  e.preventDefault();
  
  if (!newExpenseForm.category || !newExpenseForm.amount || !newExpenseForm.description) {
    alert('Veuillez remplir tous les champs obligatoires');
    return;
  }

  if (parseFloat(newExpenseForm.amount) <= 0) {
    alert('Le montant doit être supérieur à 0');
    return;
  }

  setIsCreating(true);
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    const { error } = await supabase.from('expenses').insert({
      site_id: siteId,
      date: newExpenseForm.date,
      category: newExpenseForm.category,
      description: newExpenseForm.description,
      type: newExpenseForm.type,
      subtype: newExpenseForm.subtype,
      amount: parseFloat(newExpenseForm.amount),
      payment_method: newExpenseForm.payment_method,
      notes: newExpenseForm.notes || null,       // ✅ Maintenant supporté par la BDD
      is_recurring: newExpenseForm.is_recurring, // ✅ Maintenant supporté par la BDD
      created_by: user?.id
    });

    if (error) {
      console.error('Détail de l\'erreur Supabase:', error);
      throw error;
    }

    // Réinitialiser le formulaire
    setNewExpenseForm({
      type: 'COURANTE',
      subtype: 'GENERALE',
      category: '',
      date: new Date().toISOString().split('T')[0],
      amount: '',
      payment_method: 'Espèces',
      description: '',
      notes: '',
      is_recurring: false
    });

    setShowNewExpenseModal(false);
    loadExpenses(); // Recharger les données
    
    alert('✅ Dépense créée avec succès !');
  } catch (error: any) {
    console.error('Erreur création dépense:', error);
    alert(`Erreur: ${error.message || 'Une erreur inconnue est survenue'}`);
  } finally {
    setIsCreating(false);
  }
};

// ✅ Fonction pour obtenir les catégories filtrées par type
const getCategoriesByType = (type: string) => {
  return categories.filter(cat => {
    if (type === 'COURANTE') return cat.category_type === 'current';
    if (type === 'FIXE') return cat.category_type === 'fixed';
    if (type === 'SALAIRE') return cat.category_type === 'salary';
    return true;
  });
};
const loadSupplierPayments = async () => {
  setLoadingSupplierPayments(true);
  try {
    // Charger les paiements fournisseurs depuis supplier_payments
    const { data: paymentsData, error: paymentsError } = await supabase
      .from('supplier_payments')
      .select('*, suppliers(name)')
      .eq('site_id', siteId)
      .order('paid_at', { ascending: false });

    if (paymentsError) throw paymentsError;

    // Filtrer par date
    const [startDay, startMonth, startYear] = startDate.split('/');
    const [endDay, endMonth, endYear] = endDate.split('/');
    const startDateISO = `${startYear}-${startMonth}-${startDay}`;
    const endDateISO = `${endYear}-${endMonth}-${endDay}`;

    const filteredPayments = (paymentsData || []).filter(p => {
      const paidDate = new Date(p.paid_at);
      const start = new Date(startDateISO);
      const end = new Date(endDateISO);
      end.setHours(23, 59, 59);
      return paidDate >= start && paidDate <= end;
    });

    setSupplierPayments(filteredPayments);

    // Calculer les stats pour les paiements fournisseurs
    const totalFournisseurs = filteredPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    
    // Recalculer les stats globales
    const { data: otherExpenses } = await supabase
      .from('expenses')
      .select('*')
      .eq('site_id', siteId)
      .gte('date', startDateISO)
      .lte('date', endDateISO);

    const courantes = (otherExpenses || []).filter(e => e.type === 'COURANTE').reduce((sum, e) => sum + e.amount, 0);
    const fixes = (otherExpenses || []).filter(e => e.type === 'FIXE').reduce((sum, e) => sum + e.amount, 0);
    const salaires = (otherExpenses || []).filter(e => e.type === 'SALAIRE').reduce((sum, e) => sum + e.amount, 0);

    setStats({
      courantes,
      fixes,
      fournisseurs: totalFournisseurs,
      salaires,
      total: courantes + fixes + totalFournisseurs + salaires,
      countCourantes: (otherExpenses || []).filter(e => e.type === 'COURANTE').length,
      countFixes: (otherExpenses || []).filter(e => e.type === 'FIXE').length,
      countFournisseurs: filteredPayments.length,
      countSalaires: (otherExpenses || []).filter(e => e.type === 'SALAIRE').length
    });
  } catch (error) {
    console.error('Erreur chargement paiements fournisseurs:', error);
  } finally {
    setLoadingSupplierPayments(false);
  }
};
  const loadCategories = async () => {
  const { data } = await supabase
    .from('expense_categories')
    .select('*')
    .eq('is_active', true)
    .order('name');
  setCategories(data || []);
};

  const calculateStats = async (currentExpenses: Expense[]) => {
  // ✅ Récupérer TOUTES les dépenses de la période (pas seulement l'onglet actif)
  const [startDay, startMonth, startYear] = startDate.split('/');
  const [endDay, endMonth, endYear] = endDate.split('/');
  const startDateISO = `${startYear}-${startMonth}-${startDay}`;
  const endDateISO = `${endYear}-${endMonth}-${endDay}`;

  try {
    // Charger toutes les dépenses de la période
    const { data: allExpenses, error: expensesError } = await supabase
      .from('expenses')
      .select('*')
      .eq('site_id', siteId)
      .gte('date', startDateISO)
      .lte('date', endDateISO);

    if (expensesError) throw expensesError;

    // Charger les paiements fournisseurs
    const { data: paymentsData, error: paymentsError } = await supabase
      .from('supplier_payments')
      .select('amount, paid_at')
      .eq('site_id', siteId)
      .gte('paid_at', startDateISO)
      .lte('paid_at', endDateISO);

    if (paymentsError) throw paymentsError;

    // Calculer les stats par type
    const courantes = (allExpenses || [])
      .filter(e => e.type === 'COURANTE')
      .reduce((sum, e) => sum + e.amount, 0);
    
    const fixes = (allExpenses || [])
      .filter(e => e.type === 'FIXE')
      .reduce((sum, e) => sum + e.amount, 0);
    
    const salaires = (allExpenses || [])
      .filter(e => e.type === 'SALAIRE')
      .reduce((sum, e) => sum + e.amount, 0);
    
    const fournisseurs = paymentsData?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;

    setStats({
      courantes,
      fixes,
      fournisseurs,
      salaires,
      total: courantes + fixes + fournisseurs + salaires,
      countCourantes: (allExpenses || []).filter(e => e.type === 'COURANTE').length,
      countFixes: (allExpenses || []).filter(e => e.type === 'FIXE').length,
      countFournisseurs: paymentsData?.length || 0,
      countSalaires: (allExpenses || []).filter(e => e.type === 'SALAIRE').length
    });
  } catch (error) {
    console.error('Erreur calcul stats:', error);
    // Fallback en cas d'erreur
    setStats({
      courantes: 0,
      fixes: 0,
      fournisseurs: 0,
      salaires: 0,
      total: 0,
      countCourantes: 0,
      countFixes: 0,
      countFournisseurs: 0,
      countSalaires: 0
    });
  }
};

const filteredSupplierPayments = useMemo(() => {
  if (!search.trim()) return supplierPayments;
  return supplierPayments.filter(p => 
    p.suppliers?.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.reference_number?.toLowerCase().includes(search.toLowerCase())
  );
}, [supplierPayments, search]);

  // --- FONCTION POUR OBTENIR L'EMOJI SELON LA CATÉGORIE ---
const getCategoryEmoji = (name: string) => {
  const iconMap: Record<string, string> = {
    'ACHATS CUISINE': '🍳',
    'Achats Fournisseurs': '🛒',
    'Appvisionnement caisse': '💰',
    'Divers': '📦',
    'Equipement': '🛠️',
    'Paiements Fournisseurs': '🤝',
    'Assurance': '🛡️',
    'Communication': '📱',
    'Eau': '💧',
    'Électricité': '⚡',
    'Impôts': '🏛️',
    'Internet': '📡',
    'Loyer': '🏠',
    'Salaires': '👥',
    'SECURITE': '🔒',
  };
  return iconMap[name] || '📋';
};

  const getPaymentMethodIcon = (method: string) => {
    switch (method?.toLowerCase()) {
      case 'especes':
      case 'espèces':
        return '🪙';
      case 'carte':
      case 'carte bancaire':
        return '💳';
      case 'virement':
        return '🏦';
      case 'cheque':
      case 'chèque':
        return '📝';
      default:
        return '';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'GENERALE':
        return '';
      case 'CAISSE':
        return '📦';
      case 'RESTAURANT':
        return '🍽️';
      default:
        return '📋';
    }
  };

  const filteredExpenses = useMemo(() => {
    if (!search.trim()) return expenses;
    return expenses.filter(e => 
      e.description.toLowerCase().includes(search.toLowerCase()) ||
      e.category.toLowerCase().includes(search.toLowerCase()) ||
      (e.reference && e.reference.toLowerCase().includes(search.toLowerCase()))
    );
  }, [expenses, search]);

  // --- ÉDITION ---
const openEditModal = (expense: Expense) => {
  setEditingExpense(expense);
  setEditForm({
    type: expense.type,
    subtype: expense.subtype || 'GENERALE',
    category: expense.category,
    date: expense.date ? new Date(expense.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    amount: expense.amount.toString(),
    payment_method: expense.payment_method,
    description: expense.description,
    notes: expense.notes || '',
    is_recurring: expense.is_recurring || false
  });
};

const handleUpdateExpense = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!editingExpense) return;
  
  setIsEditing(true);
  try {
    const { error } = await supabase.from('expenses').update({
      type: editForm.type,
      subtype: editForm.subtype,
      category: editForm.category,
      date: editForm.date,
      amount: parseFloat(editForm.amount),
      payment_method: editForm.payment_method,
      description: editForm.description,
      notes: editForm.notes || null,
      is_recurring: editForm.is_recurring
    }).eq('id', editingExpense.id);

    if (error) throw error;
    
    setEditingExpense(null);
    loadExpenses(); // Recharger les données
    alert('✅ Dépense modifiée avec succès !');
  } catch (error: any) {
    console.error('Erreur modification:', error);
    alert(`Erreur: ${error.message}`);
  } finally {
    setIsEditing(false);
  }
};

// --- SUPPRESSION ---
const handleDeleteExpense = async () => {
  if (!deletingExpense) return;
  
  setIsDeleting(true);
  try {
    const { error } = await supabase.from('expenses').delete().eq('id', deletingExpense.id);
    if (error) throw error;
    
    setDeletingExpense(null);
    loadExpenses(); // Recharger les données
    alert('✅ Dépense supprimée avec succès !');
  } catch (error: any) {
    console.error('Erreur suppression:', error);
    alert(`Erreur: ${error.message}`);
  } finally {
    setIsDeleting(false);
  }
};

// --- CRÉATION DE CATÉGORIE ---
const handleCreateCategory = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!newCategoryName.trim()) {
    alert('Veuillez saisir le nom de la catégorie');
    return;
  }

  setIsCreatingCategory(true);
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    const { error } = await supabase.from('expense_categories').insert({
      site_id: siteId,
      name: newCategoryName.trim(),
      description: newCategoryDescription.trim() || null,
      category_type: newCategoryType,
      is_system_category: false,
      is_active: true,
      created_by: user?.id
    });

    if (error) throw error;

    setNewCategoryName('');
    setNewCategoryDescription('');
    setNewCategoryType('current');
    loadCategories();
    alert('✅ Catégorie créée avec succès !');
  } catch (error: any) {
    console.error('Erreur création catégorie:', error);
    alert(`Erreur: ${error.message}`);
  } finally {
    setIsCreatingCategory(false);
  }
};

// --- MODIFICATION DE CATÉGORIE ---
const openEditCategoryModal = (category: Category) => {
  setEditingCategory(category);
};

const handleUpdateCategory = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!editingCategory) return;

  setIsEditingCategory(true);
  try {
    const { error } = await supabase.from('expense_categories').update({
      name: editingCategory.name,
      description: editingCategory.description,
      category_type: editingCategory.category_type
    }).eq('id', editingCategory.id);

    if (error) throw error;

    setEditingCategory(null);
    loadCategories();
    alert('✅ Catégorie modifiée avec succès !');
  } catch (error: any) {
    console.error('Erreur modification catégorie:', error);
    alert(`Erreur: ${error.message}`);
  } finally {
    setIsEditingCategory(false);
  }
};

// --- SUPPRESSION DE CATÉGORIE ---
const handleDeleteCategory = async () => {
  if (!deletingCategory) return;

  setIsDeletingCategory(true);
  try {
    const { error } = await supabase.from('expense_categories').delete().eq('id', deletingCategory.id);
    if (error) throw error;

    setDeletingCategory(null);
    loadCategories();
    alert('✅ Catégorie supprimée avec succès !');
  } catch (error: any) {
    console.error('Erreur suppression catégorie:', error);
    alert(`Erreur: ${error.message}`);
  } finally {
    setIsDeletingCategory(false);
  }
};

// --- FONCTION POUR OBTENIR L'ICÔNE SELON LA CATÉGORIE ---
const getCategoryIcon = (name: string) => {
  const iconMap: Record<string, string> = {
    'ACHATS CUISINE': '$',
    'Achats Fournisseurs': '🛒',
    'Appvisionnement caisse': '$',
    'Divers': '$',
    'Equipement': '$',
    'Paiements Fournisseurs': '$',
    'Assurance': '🛡️',
    'Communication': '$',
    'Eau': '💧',
    'Électricité': '⚡',
    'Impôts': '🏛️',
    'Internet': '📡',
    'Loyer': '🏠',
    'Salaires': '👥',
    'SECURITE': '$',
  };
  return iconMap[name] || '$';
};

// --- FONCTION POUR OBTENIR LE BADGE DE TYPE ---
const getTypeBadge = (type: string, isSystem: boolean) => {
  if (type === 'current') {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">Courante</span>;
  }
  if (type === 'fixed') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
        Fixe {isSystem && '🔒'}
      </span>
    );
  }
  if (type === 'salary') {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">Salaire</span>;
  }
  return null;
};

// --- FONCTION POUR OBTENIR LE BADGE SYSTÈME ---
const getSystemBadge = (isSystem: boolean) => {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
      isSystem ? 'bg-slate-100 text-slate-700' : 'bg-green-100 text-green-800'
    }`}>
      {isSystem ? 'Système' : 'Personnalisée'}
    </span>
  );
};

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gestion des Dépenses</h1>
          <p className="text-sm text-slate-500 mt-1">Gérez toutes les dépenses (courantes, fixes et fournisseurs)</p>
          <p className="text-xs text-slate-400 mt-1">Période : {startDate} au {endDate}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={loadExpenses}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <RefreshCw className="w-4 h-4" />
            Rafraîchir
          </button>
          <button 
            onClick={() => setShowFiltersModal(true)}
            className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Filter className="w-4 h-4" />
            Filtres
          </button>
          <button 
            onClick={() => setShowCategoriesModal(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Settings className="w-4 h-4" />
            Gérer Catégories
          </button>
          <button 
            onClick={() => setShowNewExpenseModal(true)}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Nouvelle Dépense
          </button>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-6 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('courantes')}
          className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'courantes' 
              ? 'border-blue-600 text-blue-600' 
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Wallet className="w-4 h-4" />
          Dépenses Courantes
          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
            {stats.countCourantes}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('fixes')}
          className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'fixes' 
              ? 'border-purple-600 text-purple-600' 
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Dépenses Fixes
          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs">
            {stats.countFixes}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('fournisseurs')}
          className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'fournisseurs' 
              ? 'border-amber-600 text-amber-600' 
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          Paiements Fournisseurs
          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs">
            {stats.countFournisseurs}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('salaires')}
          className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'salaires' 
              ? 'border-emerald-600 text-emerald-600' 
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Users className="w-4 h-4" />
          Salaires
          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs">
            {stats.countSalaires}
          </span>
        </button>
      </div>

      {/* Cartes de statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Dépenses Courantes</p>
              <p className="text-2xl font-bold text-slate-900">{stats.courantes.toLocaleString('fr-FR')} f CFA</p>
              <p className="text-xs text-slate-400 mt-2">{stats.countCourantes} dépenses (mois en cours)</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
              <Wallet className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Dépenses Fixes</p>
              <p className="text-2xl font-bold text-slate-900">{stats.fixes.toLocaleString('fr-FR')} f CFA</p>
              <p className="text-xs text-slate-400 mt-2">{stats.countFixes} dépenses (mois en cours)</p>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg">
              <Calendar className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Paiements Fournisseurs</p>
              <p className="text-2xl font-bold text-slate-900">{stats.fournisseurs.toLocaleString('fr-FR')} f CFA</p>
              <p className="text-xs text-slate-400 mt-2">{stats.countFournisseurs} paiement(s) (mois en cours)</p>
            </div>
            <div className="p-3 bg-amber-50 rounded-lg">
              <ShoppingCart className="w-6 h-6 text-amber-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">Total des dépenses</p>
              <p className="text-2xl font-bold text-slate-900">{stats.total.toLocaleString('fr-FR')} f CFA</p>
              <p className="text-xs text-slate-400 mt-2">{stats.countCourantes + stats.countFixes + stats.countFournisseurs + stats.countSalaires} dépenses totales</p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-lg">
              <DollarSign className="w-6 h-6 text-emerald-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Tableau des dépenses */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900">
              {activeTab === 'courantes' && 'Dépenses Courantes'}
              {activeTab === 'fixes' && 'Dépenses Fixes'}
              {activeTab === 'fournisseurs' && 'Paiements Fournisseurs'}
              {activeTab === 'salaires' && 'Salaires'}
            </h3>
            <p className="text-sm text-slate-500">
              Période : {startDate} au {endDate}
            </p>
          </div>
          <div className="text-sm text-slate-600">
  Total: <span className="font-bold">
    {activeTab === 'fournisseurs' 
      ? filteredSupplierPayments.reduce((sum, p) => sum + (p.amount || 0), 0).toLocaleString('fr-FR')
      : filteredExpenses.reduce((sum, e) => sum + e.amount, 0).toLocaleString('fr-FR')
    } f CFA
  </span>
</div>
        </div>

        <div className="p-4 border-b border-slate-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-semibold">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Catégorie</th>
                <th className="px-4 py-3 text-left">Description</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Référence</th>
                <th className="px-4 py-3 text-right">Montant</th>
                <th className="px-4 py-3 text-left">Paiement</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
  {/* ✅ Cas spécial : onglet Paiements Fournisseurs */}
  {activeTab === 'fournisseurs' ? (
    loadingSupplierPayments ? (
      <tr>
        <td colSpan={8} className="px-4 py-8 text-center">
          <div className="flex items-center justify-center gap-2 text-slate-500">
            <RefreshCw className="w-5 h-5 animate-spin" />
            Chargement...
          </div>
        </td>
      </tr>
    ) : filteredSupplierPayments.length === 0 ? (
      <tr>
        <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
          Aucun paiement fournisseur trouvé
        </td>
      </tr>
    ) : (
      filteredSupplierPayments.map((payment) => (
        <tr key={payment.id} className="hover:bg-slate-50">
          <td className="px-4 py-3 text-slate-600">
            <div className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              {new Date(payment.paid_at).toLocaleDateString('fr-FR')}
            </div>
          </td>
          <td className="px-4 py-3">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
              Paiement Fournisseur
            </span>
          </td>
          <td className="px-4 py-3">
            <div className="font-medium text-slate-900">
              {payment.suppliers?.name || 'Fournisseur'}
            </div>
            {payment.notes && (
              <div className="text-xs text-slate-500 mt-1">{payment.notes}</div>
            )}
          </td>
          <td className="px-4 py-3">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
              📦 Fournisseur
            </span>
          </td>
          <td className="px-4 py-3 text-slate-500">
            {payment.reference_number || '-'}
          </td>
          <td className="px-4 py-3 text-right font-bold text-slate-900">
            {payment.amount.toLocaleString('fr-FR')} f CFA
          </td>
          <td className="px-4 py-3">
            <span className="inline-flex items-center gap-1 text-xs text-slate-600">
              💰 {payment.payment_method || 'Espèces'}
            </span>
          </td>
          <td className="px-4 py-3">
            <div className="flex items-center justify-center gap-1">
              <button 
                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                title="Voir détails"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </div>
          </td>
        </tr>
      ))
    )
  ) : (
    /* Cas normal : autres onglets (dépenses courantes, fixes, salaires) */
    loading ? (
      <tr>
        <td colSpan={8} className="px-4 py-8 text-center">
          <div className="flex items-center justify-center gap-2 text-slate-500">
            <RefreshCw className="w-5 h-5 animate-spin" />
            Chargement...
          </div>
        </td>
      </tr>
    ) : filteredExpenses.length === 0 ? (
      <tr>
        <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
          Aucune dépense trouvée
        </td>
      </tr>
    ) : (
      filteredExpenses.map((expense) => (
        <tr key={expense.id} className="hover:bg-slate-50">
          <td className="px-4 py-3 text-slate-600">
            <div className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              {new Date(expense.date).toLocaleDateString('fr-FR')}
            </div>
          </td>
          <td className="px-4 py-3">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getCategoryIcon(expense.category)}`}>
                {expense.category}
              </span>
            </div>
          </td>
          <td className="px-4 py-3">
            <div className="font-medium text-slate-900">{expense.description}</div>
          </td>
          <td className="px-4 py-3">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
              {getTypeIcon(expense.type)} {expense.type}
            </span>
          </td>
          <td className="px-4 py-3 text-slate-500">
            {expense.reference || '-'}
          </td>
          <td className="px-4 py-3 text-right font-bold text-slate-900">
            {expense.amount.toLocaleString('fr-FR')} f CFA
          </td>
          <td className="px-4 py-3">
            <span className="inline-flex items-center gap-1 text-xs text-slate-600">
              {getPaymentMethodIcon(expense.payment_method)}
              {expense.payment_method}
            </span>
          </td>
          <td className="px-4 py-3">
  <div className="flex items-center justify-center gap-1">
    <button 
      onClick={() => openEditModal(expense)}
      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
      title="Modifier"
    >
      <Edit2 className="w-4 h-4" />
    </button>
    <button 
      onClick={() => setDeletingExpense(expense)}
      className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
      title="Supprimer"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  </div>
</td>
        </tr>
      ))
    )
  )}
</tbody>
          </table>
        </div>
      </div>

      {/* Modale Nouvelle Dépense - À implémenter */}
      {showNewExpenseModal && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
      {/* Header */}
      <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
        <h3 className="text-lg font-bold">Nouvelle dépense</h3>
        <button 
          onClick={() => setShowNewExpenseModal(false)} 
          className="hover:bg-white/20 p-2 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Formulaire */}
      <form onSubmit={handleCreateExpense} className="p-6 space-y-5">
        {/* Type de Dépense */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Type de Dépense <span className="text-red-500">*</span>
          </label>
          <select
            value={newExpenseForm.type}
            onChange={(e) => {
              const newType = e.target.value;
              setNewExpenseForm({ 
                ...newExpenseForm, 
                type: newType,
                category: '', // Réinitialiser la catégorie quand le type change
                subtype: 'GENERALE'
              });
            }}
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            required
          >
            <option value="COURANTE">Dépense Courante</option>
            <option value="FIXE">Dépense Fixe (Admin/Manager)</option>
            <option value="FOURNISSEUR">Paiement Fournisseur</option>
            <option value="SALAIRE">Salaire</option>
          </select>
          
          {/* Message d'avertissement pour les dépenses fixes */}
          {newExpenseForm.type === 'FIXE' && (
            <div className="mt-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <Lock className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>Les dépenses fixes sont visibles uniquement par les administrateurs et managers</span>
            </div>
          )}
        </div>

        {/* Catégorie et Type */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Catégorie <span className="text-red-500">*</span>
            </label>
            <select
              value={newExpenseForm.category}
              onChange={(e) => setNewExpenseForm({ ...newExpenseForm, category: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
              required
            >
              <option value="">-- Sélectionner --</option>
              {getCategoriesByType(newExpenseForm.type).map(cat => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
            </select>
            <div className="mt-2 flex items-center gap-3 text-xs">
              <button 
                type="button"
                className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                onClick={() => alert('Fonctionnalité à implémenter : Créer une nouvelle catégorie')}
              >
                <Plus className="w-3 h-3" />
                Créer une nouvelle catégorie
              </button>
              <button 
                type="button"
                className="text-slate-600 hover:text-slate-800 font-medium flex items-center gap-1"
                onClick={() => setShowCategoriesModal(true)}
              >
                <Edit2 className="w-3 h-3" />
                Modifier
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Type <span className="text-red-500">*</span>
            </label>
            <select
              value={newExpenseForm.subtype}
              onChange={(e) => setNewExpenseForm({ ...newExpenseForm, subtype: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
              required
            >
              <option value="GENERALE">Dépense générale</option>
              <option value="CAISSE">Caisse</option>
              <option value="RESTAURANT">Restaurant</option>
            </select>
          </div>
        </div>

        {/* Date et Montant */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={newExpenseForm.date}
              onChange={(e) => setNewExpenseForm({ ...newExpenseForm, date: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Montant (f CFA) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0"
              step="100"
              value={newExpenseForm.amount}
              onChange={(e) => setNewExpenseForm({ ...newExpenseForm, amount: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="0"
              required
            />
          </div>
        </div>

        {/* Mode de paiement et Récurrent */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Mode de paiement <span className="text-red-500">*</span>
            </label>
            <select
              value={newExpenseForm.payment_method}
              onChange={(e) => setNewExpenseForm({ ...newExpenseForm, payment_method: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
              required
            >
              <option value="Espèces">Espèces</option>
              <option value="Carte bancaire">Carte bancaire</option>
              <option value="Virement">Virement</option>
              <option value="Chèque">Chèque</option>
              <option value="Mobile Money">Mobile Money</option>
            </select>
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer p-3 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors w-full">
              <input
                type="checkbox"
                checked={newExpenseForm.is_recurring}
                onChange={(e) => setNewExpenseForm({ ...newExpenseForm, is_recurring: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-slate-700">Dépense récurrente</span>
            </label>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Description <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={newExpenseForm.description}
            onChange={(e) => setNewExpenseForm({ ...newExpenseForm, description: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="Ex: Loyer mensuel, Facture d'électricité..."
            required
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Notes
          </label>
          <textarea
            value={newExpenseForm.notes}
            onChange={(e) => setNewExpenseForm({ ...newExpenseForm, notes: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none resize-y"
            rows={3}
            placeholder="Notes supplémentaires (optionnel)..."
          />
        </div>

        {/* Boutons d'action */}
        <div className="flex gap-3 pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={() => setShowNewExpenseModal(false)}
            className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-lg transition-colors"
            disabled={isCreating}
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={isCreating}
            className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isCreating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Création...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Créer
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  </div>
)}

      {/* ================= MODALE GÉRER LES CATÉGORIES ================= */}
{showCategoriesModal && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
        <h3 className="text-lg font-bold text-slate-900">Gérer les catégories</h3>
        <button 
          onClick={() => setShowCategoriesModal(false)} 
          className="hover:bg-slate-100 p-2 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-slate-500" />
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* Formulaire de création */}
        <div className="bg-slate-50 rounded-lg p-5 border border-slate-200">
          <h4 className="font-semibold text-slate-900 mb-4">Nouvelle catégorie</h4>
          <form onSubmit={handleCreateCategory} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Nom de la catégorie <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Ex: Loyer, Électricité, Fournitures..."
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Description
              </label>
              <textarea
                value={newCategoryDescription}
                onChange={(e) => setNewCategoryDescription(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none resize-y"
                rows={2}
                placeholder="Description optionnelle..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Type de catégorie <span className="text-red-500">*</span>
              </label>
              <select
                value={newCategoryType}
                onChange={(e) => setNewCategoryType(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                required
              >
                <option value="current">Courante</option>
                <option value="fixed">Fixe</option>
                <option value="salary">Salaire</option>
              </select>
              <p className="text-xs text-blue-600 mt-2 flex items-center gap-1">
                <input type="checkbox" checked readOnly className="w-3 h-3" />
                Visible par tous les utilisateurs. Pour les dépenses courantes quotidiennes.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCategoriesModal(false)}
                className="flex-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold py-2.5 rounded-lg transition-colors"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isCreatingCategory || !newCategoryName.trim()}
                className="flex-1 bg-slate-700 hover:bg-slate-800 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreatingCategory ? 'Création...' : 'Créer'}
              </button>
            </div>
          </form>
        </div>

        {/* Liste des catégories existantes */}
        <div>
          <h4 className="font-semibold text-slate-900 mb-4">Catégories existantes</h4>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Nom</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Système</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {categories.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      Aucune catégorie trouvée
                    </td>
                  </tr>
                ) : (
                  categories.map((cat) => (
                    <tr key={cat.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{getCategoryIcon(cat.name)}</span>
                          <span className="font-medium text-slate-900">{cat.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {getTypeBadge(cat.category_type, cat.is_system_category)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {cat.description || '-'}
                      </td>
                      <td className="px-4 py-3">
                        {getSystemBadge(cat.is_system_category)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openEditCategoryModal(cat)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Modifier"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeletingCategory(cat)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Supprimer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer avec compteur */}
          <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
            <span>{categories.length} catégories au total</span>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                Courantes: {categories.filter(c => c.category_type === 'current').length}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                Fixes: {categories.filter(c => c.category_type === 'fixed').length}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
)}

{/* ================= MODALE MODIFICATION CATÉGORIE ================= */}
{editingCategory && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
      <div className="bg-blue-600 text-white px-6 py-4 flex items-center justify-between rounded-t-xl">
        <h3 className="text-lg font-bold">Modifier la catégorie</h3>
        <button onClick={() => setEditingCategory(null)} className="hover:bg-white/20 p-2 rounded-lg">
          <X className="w-5 h-5" />
        </button>
      </div>
      <form onSubmit={handleUpdateCategory} className="p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Nom *</label>
          <input
            type="text"
            value={editingCategory.name}
            onChange={(e) => setEditingCategory({...editingCategory, name: e.target.value})}
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Description</label>
          <textarea
            value={editingCategory.description || ''}
            onChange={(e) => setEditingCategory({...editingCategory, description: e.target.value})}
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5"
            rows={2}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Type *</label>
          <select
            value={editingCategory.category_type}
            onChange={(e) => setEditingCategory({...editingCategory, category_type: e.target.value})}
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 bg-white"
            required
          >
            <option value="current">Courante</option>
            <option value="fixed">Fixe</option>
            <option value="salary">Salaire</option>
          </select>
        </div>
        <div className="flex gap-3 pt-4 border-t border-slate-200">
          <button type="button" onClick={() => setEditingCategory(null)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg">
            Annuler
          </button>
          <button type="submit" disabled={isEditingCategory} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50">
            {isEditingCategory ? 'Modification...' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </div>
  </div>
)}

{/* ================= MODALE SUPPRESSION CATÉGORIE ================= */}
{deletingCategory && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
      <div className="bg-red-600 text-white px-6 py-4 flex items-center justify-between rounded-t-xl">
        <h3 className="text-lg font-bold">Confirmer la suppression</h3>
        <button onClick={() => setDeletingCategory(null)} className="hover:bg-white/20 p-2 rounded-lg">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-6">
        <p className="text-slate-700 mb-6">
          Êtes-vous sûr de vouloir supprimer la catégorie :<br/>
          <strong className="text-slate-900">"{deletingCategory.name}"</strong> ?<br/>
          <span className="text-sm text-red-600">Cette action est irréversible.</span>
        </p>
        <div className="flex gap-3">
          <button onClick={() => setDeletingCategory(null)} disabled={isDeletingCategory} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg">
            Annuler
          </button>
          <button onClick={handleDeleteCategory} disabled={isDeletingCategory} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50">
            {isDeletingCategory ? 'Suppression...' : 'Supprimer'}
          </button>
        </div>
      </div>
    </div>
  </div>
)}

      {/* Modale Filtres - À implémenter */}
      {showFiltersModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="bg-slate-100 text-slate-700 px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Filtres
              </h3>
              <button onClick={() => setShowFiltersModal(false)} className="hover:bg-white/20 p-2 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Date de début</label>
                <input
                  type="date"
                  value={startDate.split('/').reverse().join('-')}
                  onChange={(e) => {
                    const [year, month, day] = e.target.value.split('-');
                    setStartDate(`${day}/${month}/${year}`);
                  }}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Date de fin</label>
                <input
                  type="date"
                  value={endDate.split('/').reverse().join('-')}
                  onChange={(e) => {
                    const [year, month, day] = e.target.value.split('-');
                    setEndDate(`${day}/${month}/${year}`);
                  }}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2"
                />
              </div>
              <button
                onClick={() => setShowFiltersModal(false)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg"
              >
                Appliquer les filtres
              </button>
            </div>
          </div>
        </div>
      )}
            {/* ================= MODALE D'ÉDITION ================= */}
      {editingExpense && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="bg-blue-600 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
              <h3 className="text-lg font-bold">Modifier la dépense</h3>
              <button onClick={() => setEditingExpense(null)} className="hover:bg-white/20 p-2 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateExpense} className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Type</label>
                  <select value={editForm.type} onChange={(e) => setEditForm({...editForm, type: e.target.value, category: ''})} className="w-full border border-slate-300 rounded-lg px-3 py-2.5" required>
                    <option value="COURANTE">Dépense Courante</option>
                    <option value="FIXE">Dépense Fixe</option>
                    <option value="SALAIRE">Salaire</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Catégorie</label>
                  <select value={editForm.category} onChange={(e) => setEditForm({...editForm, category: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2.5" required>
                    <option value="">-- Sélectionner --</option>
                    {getCategoriesByType(editForm.type).map(cat => (
                      <option key={cat.id} value={cat.name}>{cat.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Date</label>
                  <input type="date" value={editForm.date} onChange={(e) => setEditForm({...editForm, date: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2.5" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Montant (f CFA)</label>
                  <input type="number" min="0" value={editForm.amount} onChange={(e) => setEditForm({...editForm, amount: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2.5" required />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Description</label>
                <input type="text" value={editForm.description} onChange={(e) => setEditForm({...editForm, description: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2.5" required />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Mode de paiement</label>
                  <select value={editForm.payment_method} onChange={(e) => setEditForm({...editForm, payment_method: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2.5" required>
                    <option value="Espèces">Espèces</option>
                    <option value="Carte bancaire">Carte bancaire</option>
                    <option value="Virement">Virement</option>
                    <option value="Chèque">Chèque</option>
                    <option value="Mobile Money">Mobile Money</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer p-3 border border-slate-300 rounded-lg w-full">
                    <input type="checkbox" checked={editForm.is_recurring} onChange={(e) => setEditForm({...editForm, is_recurring: e.target.checked})} className="w-4 h-4 text-blue-600 rounded" />
                    <span className="text-sm font-medium text-slate-700">Dépense récurrente</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Notes</label>
                <textarea value={editForm.notes} onChange={(e) => setEditForm({...editForm, notes: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2.5" rows={2} />
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button type="button" onClick={() => setEditingExpense(null)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-lg">Annuler</button>
                <button type="submit" disabled={isEditing} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                  {isEditing ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <><Edit2 className="w-4 h-4" /> Enregistrer les modifications</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODALE DE SUPPRESSION ================= */}
      {deletingExpense && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="bg-red-600 text-white px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Confirmer la suppression
              </h3>
              <button onClick={() => setDeletingExpense(null)} className="hover:bg-white/20 p-2 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-slate-700 mb-6">
                Êtes-vous sûr de vouloir supprimer définitivement la dépense :<br/>
                <strong className="text-slate-900">"{deletingExpense.description}"</strong> ({deletingExpense.amount.toLocaleString('fr-FR')} f CFA) ?<br/>
                <span className="text-sm text-red-600">Cette action est irréversible.</span>
              </p>
              <div className="flex gap-3">
                <button onClick={() => setDeletingExpense(null)} disabled={isDeleting} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-lg">
                  Annuler
                </button>
                <button onClick={handleDeleteExpense} disabled={isDeleting} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                  {isDeleting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <><Trash2 className="w-4 h-4" /> Supprimer</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
