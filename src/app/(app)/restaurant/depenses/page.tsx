'use client';

'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  RefreshCw, Filter, Settings, Plus, Calendar, DollarSign,
  ShoppingCart, Wallet, Users, TrendingUp, TrendingDown,
  Edit2, Trash2, X, Search, ChevronDown, Receipt, Lock, AlertTriangle, Building2, Utensils, Printer, FileText, QrCode
} from 'lucide-react';

interface Expense {
  id: string;
  date: string;
  category: string;
  description: string;
  type: 'COURANTE' | 'FIXE' | 'FOURNISSEUR' | 'SALAIRE';
  subtype?: 'HOTEL' | 'RESTAURANT' | string; // ✅ Département
  reference?: string;
  amount: number;
  payment_method: string;
  notes?: string;
  is_recurring?: boolean;
  created_by?: string;
  created_at: string;
}

interface Category {
  id: string;
  name: string;
  description?: string;
  category_type: string;
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
  // Dates dynamiques : premier et dernier jour du mois en cours
const getCurrentMonthRange = () => {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return {
    start: `${pad(firstDay.getDate())}/${pad(firstDay.getMonth() + 1)}/${firstDay.getFullYear()}`,
    end: `${pad(lastDay.getDate())}/${pad(lastDay.getMonth() + 1)}/${lastDay.getFullYear()}`
  };
};

const monthRange = getCurrentMonthRange();
const [startDate, setStartDate] = useState(monthRange.start);
const [endDate, setEndDate] = useState(monthRange.end);
const [showPeriodPicker, setShowPeriodPicker] = useState(false);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<'ALL' | 'HOTEL' | 'RESTAURANT'>('ALL'); // ✅ NOUVEAU
  
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
  
  const [supplierPayments, setSupplierPayments] = useState<any[]>([]);
  const [loadingSupplierPayments, setLoadingSupplierPayments] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
    const [newExpenseForm, setNewExpenseForm] = useState({
    type: 'COURANTE',
    subtype: 'HOTEL' as 'HOTEL' | 'RESTAURANT',
    category: '',
    date: new Date().toISOString().split('T')[0],
    amount: '',
    payment_method: 'Espèces',
    reference: '', // ✅ NOUVEAU : Référence de paiement
    description: '',
    notes: '',
    is_recurring: false
  });

  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});

  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  const [newCategoryType, setNewCategoryType] = useState('current');
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);

    // ✅ Fonction pour appliquer une période prédéfinie
  const applyPeriod = (period: 'today' | 'week' | 'month' | 'year' | 'custom') => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const formatDate = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    
    let start: Date, end: Date;
    
    switch (period) {
      case 'today':
        start = end = now;
        break;
      case 'week':
        const day = now.getDay();
        const diffToMonday = day === 0 ? -6 : 1 - day;
        start = new Date(now);
        start.setDate(now.getDate() + diffToMonday);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        break;
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'year':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
        break;
      default:
        return;
    }
    
    setStartDate(formatDate(start));
    setEndDate(formatDate(end));
    setShowPeriodPicker(false);
  };

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
      if (activeTab === 'fournisseurs') {
        await loadSupplierPayments();
        return;
      }

      let query = supabase
        .from('expenses')
        .select('*')
        .eq('site_id', siteId)
        .order('date', { ascending: false });

      if (activeTab === 'courantes') query = query.eq('type', 'COURANTE');
      else if (activeTab === 'fixes') query = query.eq('type', 'FIXE');
      else if (activeTab === 'salaires') query = query.eq('type', 'SALAIRE');

      const [startDay, startMonth, startYear] = startDate.split('/');
      const [endDay, endMonth, endYear] = endDate.split('/');
      const startDateISO = `${startYear}-${startMonth}-${startDay}`;
      const endDateISO = `${endYear}-${endMonth}-${endDay}`;
      
      query = query.gte('date', startDateISO).lte('date', endDateISO);

      const { data, error } = await query;
      if (error) throw error;
      setExpenses(data || []);
      await calculateStats(data || []);
    } catch (error) {
      console.error('Erreur chargement dépenses:', error);
    } finally {
      setLoading(false);
    }
  };

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
        reference: newExpenseForm.reference?.trim() || null, // ✅ Sauvegarde la référence
        notes: newExpenseForm.notes || null,
        is_recurring: newExpenseForm.is_recurring,
        created_by: user?.id
      });

      if (error) throw error;

      // ✅ NOUVEAU : Si c'est un paiement bancaire, créer une transaction banque
      const bankMethods = ['Virement', 'Chèque', 'Mobile Money'];
      if (bankMethods.includes(newExpenseForm.payment_method) && newExpenseForm.reference?.trim()) {
        const { data: bankAccount } = await supabase
          .from('bank_accounts')
          .select('id')
          .eq('site_id', siteId)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();

        await supabase.from('bank_transactions').insert({
          site_id: siteId,
          bank_account_id: bankAccount?.id || null,
          reference: newExpenseForm.reference.trim(),
          transaction_type: newExpenseForm.payment_method === 'Virement' ? 'TRANSFER' 
                          : newExpenseForm.payment_method === 'Chèque' ? 'CHECK' 
                          : 'MOBILE_MONEY',
          direction: 'EXPENSE',
          amount: parseFloat(newExpenseForm.amount),
          counterparty: newExpenseForm.description,
          description: `Dépense: ${newExpenseForm.description}`,
          transaction_date: newExpenseForm.date,
          status: 'PENDING',
          source_table: 'expenses',
        });
      }
          setNewExpenseForm({
        type: 'COURANTE',
        subtype: 'HOTEL',
        category: '',
        date: new Date().toISOString().split('T')[0],
        amount: '',
        payment_method: 'Espèces',
        reference: '', // ✅ Reset
        description: '',
        notes: '',
        is_recurring: false
      });

      setShowNewExpenseModal(false);
      loadExpenses();
      alert('✅ Dépense créée avec succès !');
    } catch (error: any) {
      console.error('Erreur création dépense:', error);
      alert(`Erreur: ${error.message || 'Une erreur inconnue est survenue'}`);
    } finally {
      setIsCreating(false);
    }
  };

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
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('supplier_payments')
        .select('*, suppliers(name)')
        .eq('site_id', siteId)
        .order('paid_at', { ascending: false });

      if (paymentsError) throw paymentsError;

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

      const totalFournisseurs = filteredPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
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
    const [startDay, startMonth, startYear] = startDate.split('/');
    const [endDay, endMonth, endYear] = endDate.split('/');
    const startDateISO = `${startYear}-${startMonth}-${startDay}`;
    const endDateISO = `${endYear}-${endMonth}-${endDay}`;

    try {
      const { data: allExpenses, error: expensesError } = await supabase
        .from('expenses')
        .select('*')
        .eq('site_id', siteId)
        .gte('date', startDateISO)
        .lte('date', endDateISO);

      if (expensesError) throw expensesError;

      const { data: paymentsData, error: paymentsError } = await supabase
        .from('supplier_payments')
        .select('amount, paid_at')
        .eq('site_id', siteId)
        .gte('paid_at', startDateISO)
        .lte('paid_at', endDateISO);

      if (paymentsError) throw paymentsError;

      const courantes = (allExpenses || []).filter(e => e.type === 'COURANTE').reduce((sum, e) => sum + e.amount, 0);
      const fixes = (allExpenses || []).filter(e => e.type === 'FIXE').reduce((sum, e) => sum + e.amount, 0);
      const salaires = (allExpenses || []).filter(e => e.type === 'SALAIRE').reduce((sum, e) => sum + e.amount, 0);
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
    }
  };

  const filteredSupplierPayments = useMemo(() => {
    if (!search.trim()) return supplierPayments;
    return supplierPayments.filter(p => 
      p.suppliers?.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.reference_number?.toLowerCase().includes(search.toLowerCase())
    );
  }, [supplierPayments, search]);

  // ✅ Filtrage unifié avec le Département
  const filteredExpenses = useMemo(() => {
    let filtered = expenses;
    
    if (departmentFilter !== 'ALL') {
      filtered = filtered.filter(e => e.subtype === departmentFilter);
    }
    
    if (search.trim()) {
      filtered = filtered.filter(e => 
        e.description.toLowerCase().includes(search.toLowerCase()) ||
        e.category.toLowerCase().includes(search.toLowerCase()) ||
        (e.reference && e.reference.toLowerCase().includes(search.toLowerCase()))
      );
    }
    return filtered;
  }, [expenses, search, departmentFilter]);

    const openEditModal = (expense: Expense) => {
    setEditingExpense(expense);
    setEditForm({
      type: expense.type,
      subtype: expense.subtype || 'HOTEL',
      category: expense.category,
      date: expense.date ? new Date(expense.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      amount: expense.amount.toString(),
      payment_method: expense.payment_method,
      reference: expense.reference || '', // ✅ CETTE LIGNE DOIT EXISTER
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
        reference: editForm.reference?.trim() || null, // ✅ CETTE LIGNE DOIT EXISTER
        description: editForm.description,
        notes: editForm.notes || null,
        is_recurring: editForm.is_recurring
      }).eq('id', editingExpense.id);

      if (error) throw error;
      
      setEditingExpense(null);
      loadExpenses();
      alert('✅ Dépense modifiée avec succès !');
    } catch (error: any) {
      console.error('Erreur modification:', error);
      alert(`Erreur: ${error.message}`);
    } finally {
      setIsEditing(false);
    }
  };

  const handleDeleteExpense = async () => {
    if (!deletingExpense) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('expenses').delete().eq('id', deletingExpense.id);
      if (error) throw error;
      setDeletingExpense(null);
      loadExpenses();
      alert('✅ Dépense supprimée avec succès !');
    } catch (error: any) {
      console.error('Erreur suppression:', error);
      alert(`Erreur: ${error.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

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

  const getCategoryEmoji = (name: string) => {
    const iconMap: Record<string, string> = {
      'ACHATS CUISINE': '🍳', 'Achats Fournisseurs': '🛒', 'Appvisionnement caisse': '💰',
      'Divers': '📦', 'Equipement': '🛠️', 'Paiements Fournisseurs': '🤝', 'Assurance': '🛡️',
      'Communication': '📱', 'Eau': '💧', 'Électricité': '⚡', 'Impôts': '🏛️',
      'Internet': '📡', 'Loyer': '🏠', 'Salaires': '👥', 'SECURITE': '🔒',
    };
    return iconMap[name] || '📋';
  };

  // ✅ AJOUTEZ CES 2 FONCTIONS ICI :
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

  const getSystemBadge = (isSystem: boolean) => {
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        isSystem ? 'bg-slate-100 text-slate-700' : 'bg-green-100 text-green-800'
      }`}>
        {isSystem ? 'Système' : 'Personnalisée'}
      </span>
    );
  };

  const getPaymentMethodIcon = (method: string) => {
    const m = method?.toLowerCase();
    if (m?.includes('especes') || m?.includes('espèces')) return '🪙';
    if (m?.includes('carte')) return '💳';
    if (m?.includes('virement')) return '🏦';
    if (m?.includes('cheque') || m?.includes('chèque')) return '📝';
    return '';
  };
// ✅ Helper pour formater les montants
const formatMoney = (n: number) => Number(n || 0).toLocaleString('fr-FR');

// ✅ NOUVEAU : Imprimer un reçu de dépense individuelle
const handlePrintExpenseReceipt = (expense: Expense) => {
  const reportId = `DEP-${expense.id.slice(0, 8).toUpperCase()}`;
  const generatedAt = new Date().toISOString();
  const qrData = `VIDALOCA_EXPENSE|${reportId}|${expense.reference || expense.description}|${expense.amount}|${generatedAt}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrData)}`;
  
  const printWindow = window.open('', '_blank', 'width=800,height=1000');
  if (!printWindow) { alert('Veuillez autoriser les popups.'); return; }
  
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Reçu de Dépense - ${expense.reference || expense.description}</title>
      <style>
        @page { size: A4; margin: 15mm; }
        body { font-family: Arial, sans-serif; font-size: 12px; color: #1f2937; margin: 0; padding: 20px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #dc2626; padding-bottom: 15px; margin-bottom: 20px; }
        .header-left h1 { color: #dc2626; margin: 0; font-size: 24px; }
        .header-left .subtitle { color: #6b7280; font-size: 12px; margin-top: 4px; }
        .header-left .title { font-size: 18px; font-weight: bold; margin-top: 10px; color: #1f2937; }
        .qr-box { text-align: center; }
        .qr-box img { border: 2px solid #e2e8f0; padding: 5px; border-radius: 8px; }
        .qr-box small { display: block; margin-top: 5px; color: #6b7280; font-size: 10px; }
        .section { margin-bottom: 20px; }
        .section-title { font-size: 14px; font-weight: bold; color: #dc2626; border-bottom: 2px solid #dc2626; padding-bottom: 5px; margin-bottom: 10px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .info-box { background: #f9fafb; padding: 10px; border-radius: 6px; border-left: 3px solid #dc2626; }
        .info-box label { font-size: 10px; color: #6b7280; display: block; margin-bottom: 3px; text-transform: uppercase; font-weight: bold; }
        .info-box value { font-size: 13px; color: #1f2937; font-weight: bold; display: block; }
        .highlight-box { background: #fef2f2; border: 2px solid #dc2626; padding: 15px; border-radius: 8px; margin: 15px 0; text-align: center; }
        .highlight-box .label { font-size: 11px; color: #6b7280; margin-bottom: 3px; }
        .highlight-box .value { font-size: 24px; font-weight: bold; color: #dc2626; }
        .footer { margin-top: 40px; border-top: 2px solid #e5e7eb; padding-top: 15px; }
        .authenticity { background: #fef3c7; border: 1px solid #f59e0b; padding: 10px; border-radius: 6px; margin-bottom: 20px; font-size: 11px; color: #92400e; text-align: center; }
        .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 30px; }
        .signature-box { border-top: 1px solid #1f2937; padding-top: 5px; text-align: center; font-size: 11px; }
        .text-center { text-align: center; }
        @media print { body { padding: 0; } .no-print { display: none; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="header-left">
          <h1>🏨 LA VIDA-LOCA</h1>
          <div class="subtitle">Hôtel • Resto • Lounge</div>
          <div class="subtitle">📍 Rue 15.293, Ouaga 2000, Ouagadougou</div>
          <div class="subtitle">📞 +226 01 04 11 11</div>
          <div class="title">📤 REÇU DE DÉPENSE</div>
          <div class="subtitle">N° ${reportId}</div>
        </div>
        <div class="qr-box">
          <img src="${qrUrl}" alt="QR Code d'authenticité" />
          <small>Document unique<br/>ID: ${reportId}</small>
        </div>
      </div>

      <div class="section">
        <div class="section-title">📋 Informations générales</div>
        <div class="info-grid">
          <div class="info-box"><label>Date</label><value>${new Date(expense.date).toLocaleDateString('fr-FR')}</value></div>
          <div class="info-box"><label>Type</label><value>${expense.type === 'COURANTE' ? 'Dépense courante' : expense.type === 'FIXE' ? 'Dépense fixe' : expense.type === 'SALAIRE' ? 'Salaire' : 'Fournisseur'}</value></div>
          <div class="info-box"><label>Département</label><value>${expense.subtype === 'HOTEL' ? '🏨 Hôtel' : '🍽️ Restaurant'}</value></div>
          <div class="info-box"><label>Catégorie</label><value>${getCategoryEmoji(expense.category)} ${expense.category}</value></div>
          <div class="info-box"><label>Mode de paiement</label><value>${getPaymentMethodIcon(expense.payment_method)} ${expense.payment_method}</value></div>
          ${expense.reference ? `<div class="info-box"><label>Référence</label><value>${expense.reference}</value></div>` : ''}
        </div>
      </div>

      <div class="section">
        <div class="section-title">📝 Description</div>
        <div class="info-box" style="border-left-color: #6b7280;">
          <value style="font-size: 14px;">${expense.description}</value>
        </div>
        ${expense.notes ? `
        <div class="info-box" style="margin-top: 10px; border-left-color: #6b7280;">
          <label>Notes</label>
          <value style="font-size: 12px; font-weight: normal;">${expense.notes}</value>
        </div>` : ''}
      </div>

      <div class="highlight-box">
        <div class="label">MONTANT DE LA DÉPENSE</div>
        <div class="value">${formatMoney(expense.amount)} FCFA</div>
      </div>

      <div class="footer">
        <div class="authenticity">
          🔐 <strong>Document certifié unique</strong> — Ce reçu est protégé par un QR code d'authenticité.
        </div>
        <div class="signatures">
          <div><div class="signature-box"><div style="height: 50px;"></div><div><b>Demandeur</b></div><div style="font-size: 10px; color: #6b7280;">Nom et signature</div></div></div>
          <div><div class="signature-box"><div style="height: 50px;"></div><div><b>Directeur / Responsable</b></div><div style="font-size: 10px; color: #6b7280;">Nom et signature</div></div></div>
        </div>
        <div class="text-center" style="margin-top: 20px; font-size: 10px; color: #6b7280;">
          Document généré le ${new Date().toLocaleString('fr-FR')} • LA VIDA-LOCA PMS
        </div>
      </div>

      <div class="no-print" style="text-align: center; margin-top: 30px;">
        <button onclick="window.print()" style="padding: 12px 30px; background: #dc2626; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: bold;">🖨️ Imprimer le reçu</button>
        <button onclick="window.close()" style="padding: 12px 30px; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; margin-left: 10px;">Fermer</button>
      </div>
      <script>window.onload = function() { setTimeout(function() { window.print(); }, 500); };</script>
    </body>
    </html>
  `);
  printWindow.document.close();
};

// ✅ NOUVEAU : Imprimer l'état récapitulatif de la période
const handlePrintPeriodReport = () => {
  const reportId = `RPT-DEP-${Date.now().toString().slice(-8)}`;
  const generatedAt = new Date().toISOString();
  const qrData = `VIDALOCA_EXPENSE_REPORT|${reportId}|${startDate}|${endDate}|${stats.total}|${generatedAt}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrData)}`;
  
  // Regrouper par catégorie
  const byCategory: Record<string, { amount: number; count: number; items: Expense[] }> = {};
  (activeTab === 'fournisseurs' ? [] : filteredExpenses).forEach(e => {
    if (!byCategory[e.category]) byCategory[e.category] = { amount: 0, count: 0, items: [] };
    byCategory[e.category].amount += e.amount;
    byCategory[e.category].count += 1;
    byCategory[e.category].items.push(e);
  });
  
  // Regrouper par département
  const byDept: Record<string, number> = { HOTEL: 0, RESTAURANT: 0 };
  (activeTab === 'fournisseurs' ? [] : filteredExpenses).forEach(e => {
    if (e.subtype === 'HOTEL') byDept.HOTEL += e.amount;
    else if (e.subtype === 'RESTAURANT') byDept.RESTAURANT += e.amount;
  });
  
  // Regrouper par mode de paiement
  const byPayment: Record<string, number> = {};
  (activeTab === 'fournisseurs' ? [] : filteredExpenses).forEach(e => {
    byPayment[e.payment_method] = (byPayment[e.payment_method] || 0) + e.amount;
  });
  
  const categoryRows = Object.entries(byCategory)
    .sort((a, b) => b[1].amount - a[1].amount)
    .map(([cat, data]) => `
      <tr>
        <td>${getCategoryEmoji(cat)} ${cat}</td>
        <td style="text-align:center;">${data.count}</td>
        <td style="text-align:right; font-weight: bold;">${formatMoney(data.amount)} F</td>
        <td style="text-align:right;">${stats.total > 0 ? ((data.amount / stats.total) * 100).toFixed(1) : 0}%</td>
      </tr>
    `).join('');
  
  const deptRows = Object.entries(byDept)
    .filter(([, v]) => v > 0)
    .map(([dept, amount]) => `
      <tr>
        <td>${dept === 'HOTEL' ? '🏨 Hôtel' : '🍽️ Restaurant'}</td>
        <td style="text-align:right; font-weight: bold;">${formatMoney(amount)} F</td>
        <td style="text-align:right;">${stats.total > 0 ? ((amount / stats.total) * 100).toFixed(1) : 0}%</td>
      </tr>
    `).join('');
  
  const paymentRows = Object.entries(byPayment)
    .sort((a, b) => b[1] - a[1])
    .map(([method, amount]) => `
      <tr>
        <td>${getPaymentMethodIcon(method)} ${method}</td>
        <td style="text-align:right; font-weight: bold;">${formatMoney(amount)} F</td>
        <td style="text-align:right;">${stats.total > 0 ? ((amount / stats.total) * 100).toFixed(1) : 0}%</td>
      </tr>
    `).join('');
  
  const expensesList = (activeTab === 'fournisseurs' ? [] : filteredExpenses)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map(e => `
      <tr>
        <td>${new Date(e.date).toLocaleDateString('fr-FR')}</td>
        <td>${e.category}</td>
        <td>${e.description}</td>
        <td>${e.subtype === 'HOTEL' ? '🏨' : '🍽️'}</td>
        <td>${e.payment_method}</td>
        ${e.reference ? `<td style="font-family:monospace;font-size:10px;">${e.reference}</td>` : '<td>—</td>'}
        <td style="text-align:right; font-weight: bold;">${formatMoney(e.amount)} F</td>
      </tr>
    `).join('');
  
  const printWindow = window.open('', '_blank', 'width=1000,height=1400');
  if (!printWindow) { alert('Veuillez autoriser les popups.'); return; }
  
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>État des Dépenses - ${startDate} au ${endDate}</title>
      <style>
        @page { size: A4 landscape; margin: 12mm; }
        body { font-family: Arial, sans-serif; font-size: 10px; color: #1f2937; margin: 0; padding: 15px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #dc2626; padding-bottom: 12px; margin-bottom: 15px; }
        .header-left h1 { color: #dc2626; margin: 0; font-size: 22px; }
        .header-left .subtitle { color: #6b7280; font-size: 11px; margin-top: 3px; }
        .header-left .title { font-size: 16px; font-weight: bold; margin-top: 8px; color: #1f2937; }
        .qr-box { text-align: center; }
        .qr-box img { border: 2px solid #e2e8f0; padding: 4px; border-radius: 6px; }
        .qr-box small { display: block; margin-top: 3px; color: #6b7280; font-size: 9px; }
        .section { margin-bottom: 15px; }
        .section-title { font-size: 12px; font-weight: bold; color: #dc2626; border-bottom: 2px solid #dc2626; padding-bottom: 4px; margin-bottom: 8px; }
        .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0; }
        .stat-card { background: #f9fafb; padding: 10px; border-radius: 6px; text-align: center; border: 1px solid #e5e7eb; }
        .stat-value { font-size: 18px; font-weight: bold; color: #dc2626; }
        .stat-label { font-size: 9px; color: #6b7280; margin-top: 3px; }
        .stat-card.blue { background: #eff6ff; border-color: #3b82f6; }
        .stat-card.blue .stat-value { color: #1e40af; }
        .stat-card.purple { background: #f5f3ff; border-color: #8b5cf6; }
        .stat-card.purple .stat-value { color: #6d28d9; }
        .stat-card.amber { background: #fffbeb; border-color: #f59e0b; }
        .stat-card.amber .stat-value { color: #b45309; }
        .stat-card.green { background: #ecfdf5; border-color: #10b981; }
        .stat-card.green .stat-value { color: #047857; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px; }
        .info-box { background: #f9fafb; padding: 8px; border-radius: 5px; border-left: 3px solid #dc2626; }
        .info-box label { font-size: 9px; color: #6b7280; display: block; margin-bottom: 2px; text-transform: uppercase; font-weight: bold; }
        .info-box value { font-size: 11px; color: #1f2937; font-weight: bold; display: block; }
        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 9px; }
        th { background: #dc2626; color: white; padding: 6px; text-align: left; font-size: 9px; }
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
          <h1>🏨 LA VIDA-LOCA</h1>
          <div class="subtitle">Hôtel • Resto • Lounge</div>
          <div class="subtitle">📍 Rue 15.293, Ouaga 2000, Ouagadougou</div>
          <div class="subtitle">📞 +226 01 04 11 11</div>
          <div class="title">📊 ÉTAT RÉCAPITULATIF DES DÉPENSES</div>
          <div class="subtitle">N° ${reportId}</div>
        </div>
        <div class="qr-box">
          <img src="${qrUrl}" alt="QR Code d'authenticité" />
          <small>Document unique<br/>ID: ${reportId}</small>
        </div>
      </div>

      <div class="section">
        <div class="section-title">📋 Période concernée</div>
        <div class="info-grid">
          <div class="info-box"><label>Du</label><value>${startDate}</value></div>
          <div class="info-box"><label>Au</label><value>${endDate}</value></div>
          <div class="info-box"><label>Total opérations</label><value>${stats.countCourantes + stats.countFixes + stats.countFournisseurs + stats.countSalaires}</value></div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">💰 Synthèse financière</div>
        <div class="stats-grid">
          <div class="stat-card blue">
            <div class="stat-value">${formatMoney(stats.courantes)} F</div>
            <div class="stat-label">Dépenses courantes</div>
          </div>
          <div class="stat-card purple">
            <div class="stat-value">${formatMoney(stats.fixes)} F</div>
            <div class="stat-label">Dépenses fixes</div>
          </div>
          <div class="stat-card amber">
            <div class="stat-value">${formatMoney(stats.fournisseurs)} F</div>
            <div class="stat-label">Fournisseurs</div>
          </div>
          <div class="stat-card green">
            <div class="stat-value">${formatMoney(stats.total)} F</div>
            <div class="stat-label">TOTAL GÉNÉRAL</div>
          </div>
        </div>
      </div>

      <div class="two-col">
        <div class="section">
          <div class="section-title">📊 Par catégorie</div>
          <table>
            <thead><tr><th>Catégorie</th><th style="text-align:center;">Nb</th><th style="text-align:right;">Montant</th><th style="text-align:right;">%</th></tr></thead>
            <tbody>${categoryRows}</tbody>
            <tfoot>
              <tr style="background:#fef2f2; font-weight:bold;">
                <td>TOTAL</td>
                <td style="text-align:center;">${Object.values(byCategory).reduce((s, c) => s + c.count, 0)}</td>
                <td style="text-align:right;">${formatMoney(stats.total)} F</td>
                <td style="text-align:right;">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div>
          <div class="section">
            <div class="section-title">🏢 Par département</div>
            <table>
              <thead><tr><th>Département</th><th style="text-align:right;">Montant</th><th style="text-align:right;">%</th></tr></thead>
              <tbody>${deptRows}</tbody>
            </table>
          </div>

          <div class="section">
            <div class="section-title">💳 Par mode de paiement</div>
            <table>
              <thead><tr><th>Mode</th><th style="text-align:right;">Montant</th><th style="text-align:right;">%</th></tr></thead>
              <tbody>${paymentRows}</tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">📜 Détail des dépenses (${filteredExpenses.length})</div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Catégorie</th>
              <th>Description</th>
              <th>Dépt</th>
              <th>Paiement</th>
              <th>Référence</th>
              <th style="text-align:right;">Montant</th>
            </tr>
          </thead>
          <tbody>${expensesList}</tbody>
          <tfoot>
            <tr style="background:#fef2f2; font-weight:bold;">
              <td colspan="6" style="text-align:right;">TOTAL GÉNÉRAL :</td>
              <td style="text-align:right;">${formatMoney(stats.total)} F</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="footer">
        <div class="authenticity">
          🔐 <strong>Document certifié unique</strong> — Cet état est protégé par un QR code d'authenticité.
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 20px;">
          <div><div style="border-top: 1px solid #1f2937; padding-top: 5px; text-align: center; font-size: 10px;"><div style="height: 40px;"></div><b>Comptable</b><div style="font-size: 9px; color: #6b7280;">Nom et signature</div></div></div>
          <div><div style="border-top: 1px solid #1f2937; padding-top: 5px; text-align: center; font-size: 10px;"><div style="height: 40px;"></div><b>Directeur Financier</b><div style="font-size: 9px; color: #6b7280;">Nom et signature</div></div></div>
          <div><div style="border-top: 1px solid #1f2937; padding-top: 5px; text-align: center; font-size: 10px;"><div style="height: 40px;"></div><b>Directeur Général</b><div style="font-size: 9px; color: #6b7280;">Nom et signature</div></div></div>
        </div>
        <div class="text-center" style="margin-top: 15px; font-size: 9px; color: #6b7280;">
          Document généré le ${new Date().toLocaleString('fr-FR')} • LA VIDA-LOCA PMS
        </div>
      </div>

      <div class="no-print" style="text-align: center; margin-top: 20px;">
        <button onclick="window.print()" style="padding: 10px 25px; background: #dc2626; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold;">🖨️ Imprimer l'état</button>
        <button onclick="window.close()" style="padding: 10px 25px; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; margin-left: 10px;">Fermer</button>
      </div>
      <script>window.onload = function() { setTimeout(function() { window.print(); }, 500); };</script>
    </body>
    </html>
  `);
  printWindow.document.close();
};

// ✅ NOUVEAU : Export CSV amélioré avec toutes les colonnes
const handleExportCSV = () => {
  const isFournisseurs = activeTab === 'fournisseurs';
  const data = isFournisseurs ? filteredSupplierPayments : filteredExpenses;
  
  const headers = isFournisseurs 
    ? ['Date', 'Fournisseur', 'Référence', 'Montant', 'Mode paiement', 'Notes']
    : ['Date', 'Type', 'Département', 'Catégorie', 'Description', 'Montant', 'Mode paiement', 'Référence', 'Notes'];
  
  const rows = data.map((item: any) => {
    if (isFournisseurs) {
      return [
        new Date(item.paid_at).toLocaleDateString('fr-FR'),
        item.suppliers?.name || '-',
        item.reference_number || '-',
        item.amount.toString(),
        item.payment_method || '-',
        item.notes || ''
      ];
    }
    return [
      new Date(item.date).toLocaleDateString('fr-FR'),
      item.type,
      item.subtype || '-',
      item.category,
      item.description,
      item.amount.toString(),
      item.payment_method,
      item.reference || '',
      item.notes || ''
    ];
  });

  const csvContent = [headers, ...rows].map(row => row.join(';')).join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `depenses_${activeTab}_${startDate.replace(/\//g, '-')}_au_${endDate.replace(/\//g, '-')}.csv`;
  link.click();
};
  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
          <h1 className="text-2xl font-bold text-slate-900">Gestion Centralisée des Dépenses</h1>
          <div className="flex items-center gap-3 flex-wrap mt-1">
            <p className="text-sm text-slate-500">
              Hôtel & Restaurant • Période : <span className="font-semibold text-slate-700">{startDate} au {endDate}</span>
            </p>
            
            {/* ✅ Bouton sélecteur de période */}
            <div className="relative">
              <button
                onClick={() => setShowPeriodPicker(!showPeriodPicker)}
                className="flex items-center gap-1.5 bg-white border border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 transition-colors"
              >
                <Calendar className="w-3.5 h-3.5" />
                Changer
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showPeriodPicker ? 'rotate-180' : ''}`} />
              </button>
              
              {showPeriodPicker && (
                <>
                  {/* Overlay pour fermer au clic extérieur */}
                  <div className="fixed inset-0 z-40" onClick={() => setShowPeriodPicker(false)} />
                  
                  {/* Menu déroulant */}
                  <div className="absolute top-full mt-1 left-0 bg-white border border-slate-200 rounded-lg shadow-lg p-2 z-50 min-w-[200px]">
                    <div className="text-xs font-semibold text-slate-500 uppercase px-2 py-1">Périodes rapides</div>
                    <button onClick={() => applyPeriod('today')} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 rounded flex items-center gap-2">📅 Aujourd'hui</button>
                    <button onClick={() => applyPeriod('week')} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 rounded flex items-center gap-2">📆 Cette semaine</button>
                    <button onClick={() => applyPeriod('month')} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 rounded flex items-center gap-2">🗓️ Ce mois</button>
                    <button onClick={() => applyPeriod('year')} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 rounded flex items-center gap-2">📊 Cette année</button>
                    
                    <div className="border-t border-slate-200 my-1"></div>
                    <button 
                      onClick={() => { setShowPeriodPicker(false); setShowFiltersModal(true); }} 
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 rounded flex items-center gap-2"
                    >
                      ✏️ Saisir les dates manuellement...
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
  <button onClick={loadExpenses} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
    <RefreshCw className="w-4 h-4" /> Rafraîchir
  </button>
  
  {/* ✅ NOUVEAU : Bouton Imprimer l'état PDF */}
  <button 
    onClick={handlePrintPeriodReport}
    disabled={filteredExpenses.length === 0 && filteredSupplierPayments.length === 0}
    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white px-4 py-2 rounded-lg text-sm font-medium"
    title="Générer l'état PDF de la période avec QR Code"
  >
    <Printer className="w-4 h-4" /> État PDF
  </button>
  
  {/* ✅ NOUVEAU : Bouton Export CSV amélioré */}
  <button 
    onClick={handleExportCSV}
    disabled={filteredExpenses.length === 0 && filteredSupplierPayments.length === 0}
    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white px-4 py-2 rounded-lg text-sm font-medium"
  >
    <FileText className="w-4 h-4" /> Export CSV
  </button>
  
  <button onClick={() => setShowFiltersModal(true)} className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium">
    <Filter className="w-4 h-4" /> Filtres
  </button>
  <button onClick={() => setShowCategoriesModal(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
    <Settings className="w-4 h-4" /> Catégories
  </button>
  <button onClick={() => setShowNewExpenseModal(true)} className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium">
    <Plus className="w-4 h-4" /> Nouvelle Dépense
  </button>
</div>
      </div>

      {/* Onglets */}
      <div className="flex gap-6 border-b border-slate-200 overflow-x-auto">
        {(['courantes', 'fixes', 'fournisseurs', 'salaires'] as const).map(tab => {
          const labels = { courantes: 'Dépenses Courantes', fixes: 'Dépenses Fixes', fournisseurs: 'Fournisseurs', salaires: 'Salaires' };
          const icons = { courantes: Wallet, fixes: Calendar, fournisseurs: ShoppingCart, salaires: Users };
          const colors = { courantes: 'blue', fixes: 'purple', fournisseurs: 'amber', salaires: 'emerald' };
          const Icon = icons[tab];
          const counts = { courantes: stats.countCourantes, fixes: stats.countFixes, fournisseurs: stats.countFournisseurs, salaires: stats.countSalaires };
          
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab ? `border-${colors[tab]}-600 text-${colors[tab]}-600` : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {labels[tab]}
              <span className={`px-2 py-0.5 bg-${colors[tab]}-100 text-${colors[tab]}-700 rounded-full text-xs`}>
                {counts[tab]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Cartes de statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Dépenses Courantes', value: stats.courantes, count: stats.countCourantes, color: 'blue', icon: Wallet },
          { label: 'Dépenses Fixes', value: stats.fixes, count: stats.countFixes, color: 'purple', icon: Calendar },
          { label: 'Paiements Fournisseurs', value: stats.fournisseurs, count: stats.countFournisseurs, color: 'amber', icon: ShoppingCart },
          { label: 'Total des dépenses', value: stats.total, count: stats.countCourantes + stats.countFixes + stats.countFournisseurs + stats.countSalaires, color: 'emerald', icon: DollarSign },
        ].map((stat, idx) => (
          <div key={idx} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">{stat.label}</p>
                <p className="text-2xl font-bold text-slate-900">{stat.value.toLocaleString('fr-FR')} f CFA</p>
                <p className="text-xs text-slate-400 mt-2">{stat.count} opération(s)</p>
              </div>
              <div className={`p-3 bg-${stat.color}-50 rounded-lg`}>
                <stat.icon className={`w-6 h-6 text-${stat.color}-600`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tableau des dépenses */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-slate-900">
              {activeTab === 'courantes' && 'Dépenses Courantes'}
              {activeTab === 'fixes' && 'Dépenses Fixes'}
              {activeTab === 'fournisseurs' && 'Paiements Fournisseurs'}
              {activeTab === 'salaires' && 'Salaires'}
            </h3>
          </div>
          <div className="flex items-center gap-3 flex-1 sm:justify-end">
            {/* ✅ Filtre Département */}
            {activeTab !== 'fournisseurs' && (
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value as any)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="ALL">🏢 Tous les départements</option>
                <option value="HOTEL">🏨 Hôtel</option>
                <option value="RESTAURANT">🍽️ Restaurant</option>
              </select>
            )}
            <div className="relative flex-1 sm:max-w-xs">
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
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-semibold">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                {activeTab !== 'fournisseurs' && <th className="px-4 py-3 text-left">Département</th>}
                <th className="px-4 py-3 text-left">Catégorie</th>
                <th className="px-4 py-3 text-left">Description</th>
                <th className="px-4 py-3 text-right">Montant</th>
                <th className="px-4 py-3 text-left">Paiement</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeTab === 'fournisseurs' ? (
                loadingSupplierPayments ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-slate-400" /></td></tr>
                ) : filteredSupplierPayments.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Aucun paiement fournisseur trouvé</td></tr>
                ) : (
                  filteredSupplierPayments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-600">{new Date(payment.paid_at).toLocaleDateString('fr-FR')}</td>
                      <td className="px-4 py-3"><span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">Fournisseur</span></td>
                      <td className="px-4 py-3 font-medium text-slate-900">{payment.suppliers?.name || 'Fournisseur'}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">{payment.amount.toLocaleString('fr-FR')} f CFA</td>
                      <td className="px-4 py-3 text-slate-600">💰 {payment.payment_method || 'Espèces'}</td>
                      <td className="px-4 py-3 text-center">
  <div className="flex items-center justify-center gap-1">
    <button 
      onClick={() => handlePrintExpenseReceipt({
        id: payment.id,
        date: payment.paid_at,
        category: payment.suppliers?.name || 'Fournisseur',
        description: `Paiement fournisseur - ${payment.reference_number || 'N/A'}`,
        type: 'FOURNISSEUR',
        subtype: 'HOTEL',
        reference: payment.reference_number,
        amount: payment.amount,
        payment_method: payment.payment_method || 'Espèces',
        notes: payment.notes || '',
        created_at: payment.created_at
      })}
      className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded" 
      title="Imprimer le reçu"
    >
      <Printer className="w-4 h-4" />
    </button>
    <button className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Modifier">
      <Edit2 className="w-4 h-4" />
    </button>
  </div>
</td>
                    </tr>
                  ))
                )
              ) : loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-slate-400" /></td></tr>
              ) : filteredExpenses.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Aucune dépense trouvée</td></tr>
              ) : (
                filteredExpenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-600">{new Date(expense.date).toLocaleDateString('fr-FR')}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        expense.subtype === 'HOTEL' ? 'bg-indigo-100 text-indigo-800' : 'bg-orange-100 text-orange-800'
                      }`}>
                        {expense.subtype === 'HOTEL' ? '🏨 Hôtel' : '🍽️ Restaurant'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs font-medium">
                        {getCategoryEmoji(expense.category)} {expense.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{expense.description}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">{expense.amount.toLocaleString('fr-FR')} f CFA</td>
                                        <td className="px-4 py-3">
                      <div className="text-slate-600">
                        {getPaymentMethodIcon(expense.payment_method)} {expense.payment_method}
                      </div>
                      {expense.reference && (
                        <div className="text-[10px] text-blue-600 font-mono mt-0.5 flex items-center gap-1">
                          <Receipt className="w-3 h-3" />
                          {expense.reference}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
  <div className="flex items-center justify-center gap-1">
    {/* ✅ NOUVEAU : Bouton Imprimer le reçu */}
    <button 
      onClick={() => handlePrintExpenseReceipt(expense)}
      className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded" 
      title="Imprimer le reçu PDF"
    >
      <Printer className="w-4 h-4" />
    </button>
    <button onClick={() => openEditModal(expense)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Modifier">
      <Edit2 className="w-4 h-4" />
    </button>
    <button onClick={() => setDeletingExpense(expense)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Supprimer">
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
      </div>

      {/* ================= MODALE NOUVELLE DÉPENSE ================= */}
      {showNewExpenseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
              <h3 className="text-lg font-bold">Nouvelle dépense</h3>
              <button onClick={() => setShowNewExpenseModal(false)} className="hover:bg-white/20 p-2 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreateExpense} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Type de Dépense <span className="text-red-500">*</span></label>
                <select value={newExpenseForm.type} onChange={(e) => setNewExpenseForm({ ...newExpenseForm, type: e.target.value as any, category: '' })} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 bg-white" required>
                  <option value="COURANTE">Dépense Courante</option>
                  <option value="FIXE">Dépense Fixe (Admin/Manager)</option>
                  <option value="SALAIRE">Salaire</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Catégorie <span className="text-red-500">*</span></label>
                  <select value={newExpenseForm.category} onChange={(e) => setNewExpenseForm({ ...newExpenseForm, category: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 bg-white" required>
                    <option value="">-- Sélectionner --</option>
                    {getCategoriesByType(newExpenseForm.type).map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Département <span className="text-red-500">*</span></label>
                  <select value={newExpenseForm.subtype} onChange={(e) => setNewExpenseForm({ ...newExpenseForm, subtype: e.target.value as any })} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 bg-white" required>
                    <option value="HOTEL">🏨 Hôtel</option>
                    <option value="RESTAURANT">🍽️ Restaurant</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Date <span className="text-red-500">*</span></label>
                  <input type="date" value={newExpenseForm.date} onChange={(e) => setNewExpenseForm({ ...newExpenseForm, date: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2.5" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Montant (f CFA) <span className="text-red-500">*</span></label>
                  <input type="number" min="0" step="100" value={newExpenseForm.amount} onChange={(e) => setNewExpenseForm({ ...newExpenseForm, amount: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2.5" placeholder="0" required />
                </div>
              </div>

                          <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Mode de paiement <span className="text-red-500">*</span></label>
                  <select 
                    value={newExpenseForm.payment_method} 
                    onChange={(e) => setNewExpenseForm({ ...newExpenseForm, payment_method: e.target.value })} 
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 bg-white" 
                    required
                  >
                    <option value="Espèces">Espèces</option>
                    <option value="Carte bancaire">Carte bancaire</option>
                    <option value="Virement">🏦 Virement</option>
                    <option value="Chèque">📝 Chèque</option>
                    <option value="Mobile Money">📱 Mobile Money</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer p-3 border border-slate-300 rounded-lg hover:bg-slate-50 w-full">
                    <input 
                      type="checkbox" 
                      checked={newExpenseForm.is_recurring} 
                      onChange={(e) => setNewExpenseForm({ ...newExpenseForm, is_recurring: e.target.checked })} 
                      className="w-4 h-4 text-blue-600 rounded" 
                    />
                    <span className="text-sm font-medium text-slate-700">Dépense récurrente</span>
                  </label>
                </div>
              </div>

              {/* ✅ NOUVEAU : Champ Référence (visible si paiement bancaire) */}
              {['Virement', 'Chèque', 'Mobile Money', 'Carte bancaire'].includes(newExpenseForm.payment_method) && (
                <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                    <Receipt className="w-4 h-4" />
                    Référence du paiement
                  </div>
                  <input
                    type="text"
                    value={newExpenseForm.reference}
                    onChange={(e) => setNewExpenseForm({ ...newExpenseForm, reference: e.target.value })}
                    className="w-full border border-blue-300 rounded-lg px-3 py-2.5 bg-white text-sm"
                    placeholder={
                      newExpenseForm.payment_method === 'Virement' ? 'N° de virement bancaire (ex: VIR-2026-1118)' :
                      newExpenseForm.payment_method === 'Chèque' ? 'N° de chèque (ex: CHQ-0012345)' :
                      newExpenseForm.payment_method === 'Mobile Money' ? 'ID transaction Orange/MTN' :
                      'Référence de la transaction carte'
                    }
                  />
                  <p className="text-xs text-blue-700">
                    ℹ️ Cette référence sera utilisée pour le rapprochement bancaire dans le menu <b>Banque</b>.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Description <span className="text-red-500">*</span></label>
                <input type="text" value={newExpenseForm.description} onChange={(e) => setNewExpenseForm({ ...newExpenseForm, description: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2.5" placeholder="Ex: Loyer mensuel, Facture d'électricité..." required />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Notes</label>
                <textarea value={newExpenseForm.notes} onChange={(e) => setNewExpenseForm({ ...newExpenseForm, notes: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 resize-y" rows={3} placeholder="Notes supplémentaires (optionnel)..." />
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button type="button" onClick={() => setShowNewExpenseModal(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-lg" disabled={isCreating}>Annuler</button>
                <button type="submit" disabled={isCreating} className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                  {isCreating ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <><Plus className="w-4 h-4" /> Créer</>}
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
                          <span className="text-base">{getCategoryEmoji(cat.name)}</span>
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
                  <select 
                    value={editForm.payment_method} 
                    onChange={(e) => setEditForm({...editForm, payment_method: e.target.value})} 
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5" 
                    required
                  >
                    <option value="Espèces">Espèces</option>
                    <option value="Carte bancaire">Carte bancaire</option>
                    <option value="Virement">🏦 Virement</option>
                    <option value="Chèque">📝 Chèque</option>
                    <option value="Mobile Money">📱 Mobile Money</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer p-3 border border-slate-300 rounded-lg w-full">
                    <input 
                      type="checkbox" 
                      checked={editForm.is_recurring} 
                      onChange={(e) => setEditForm({...editForm, is_recurring: e.target.checked})} 
                      className="w-4 h-4 text-blue-600 rounded" 
                    />
                    <span className="text-sm font-medium text-slate-700">Dépense récurrente</span>
                  </label>
                </div>
              </div>

              {/* ✅ CHAMP RÉFÉRENCE CONDITIONNEL */}
              {['Virement', 'Chèque', 'Mobile Money', 'Carte bancaire'].includes(editForm.payment_method) && (
                <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                    <Receipt className="w-4 h-4" />
                    Référence du paiement
                  </div>
                  <input
                    type="text"
                    value={editForm.reference || ''}
                    onChange={(e) => setEditForm({...editForm, reference: e.target.value})}
                    className="w-full border border-blue-300 rounded-lg px-3 py-2.5 bg-white text-sm"
                    placeholder={
                      editForm.payment_method === 'Virement' ? 'N° de virement bancaire (ex: VIR-2026-1118)' :
                      editForm.payment_method === 'Chèque' ? 'N° de chèque (ex: CHQ-0012345)' :
                      editForm.payment_method === 'Mobile Money' ? 'ID transaction Orange/MTN' :
                      'Référence de la transaction carte'
                    }
                  />
                  <p className="text-xs text-blue-700">
                    ℹ️ Cette référence sera utilisée pour le rapprochement bancaire.
                  </p>
                </div>
              )}

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
