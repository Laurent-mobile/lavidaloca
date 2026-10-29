'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Users, Clock, DollarSign, Calendar, Plus, Download,
  Search, Filter, Eye, Edit2, Trash2, CheckCircle, X,
  UserCheck, UserX, FileText, Printer, Calculator, Save
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import PayrollDetailModal from './components/PayrollDetailModal';

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  matricule?: string;  // ✅ AJOUTÉ
  role?: string;
  position?: string;
  department?: string;
  salary?: number;
  is_active?: boolean;
  status?: 'ACTIVE' | 'INACTIVE';
}

interface Attendance {
  id: string;
  employee_id: string;
  date: string;
  check_in: string;
  check_out?: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE';
  restaurant_employees?: { first_name: string; last_name: string };
}

interface Payroll {
  id: string;
  period_start: string;
  period_end: string;
  total_amount: number;
  employee_count: number;
  status: 'PAID' | 'PENDING';
  created_at: string;
}

export default function GestionEmployesPage() {
  const supabase = createClient();
  const [siteId, setSiteId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'list' | 'attendance' | 'payroll' | 'leave'>('list');
  
  // Données
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  
  // Filtres
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  
  // Stats
  const [stats, setStats] = useState({
    activeEmployees: 0,
    monthlySalary: 0,
    bonuses: 0,
    deductions: 0,
    advances: 0,
    presentToday: 0,
    absentToday: 0,
    lateThisMonth: 0
  });

  // Modals
  const [showNewEmployeeModal, setShowNewEmployeeModal] = useState(false);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showPayrollModal, setShowPayrollModal] = useState(false);
  const [showPayrollDetailModal, setShowPayrollDetailModal] = useState(false);
  const [selectedPayroll, setSelectedPayroll] = useState<Payroll | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [showEmployeeDetailModal, setShowEmployeeDetailModal] = useState(false);

  // ✅ Formulaires corrigés (valeurs par défaut '' au lieu de null/undefined)
  const [newEmployeeForm, setNewEmployeeForm] = useState({
    first_name: '',
    last_name: '',
    role: '',
    department: '',
    salary: 0,
    is_active: true
  });

  const [newAttendanceForm, setNewAttendanceForm] = useState({
    employee_id: '',
    date: new Date().toISOString().split('T')[0],
    check_in: '',
    check_out: '',
    status: 'PRESENT' as const
  });

  const [newLeaveForm, setNewLeaveForm] = useState({
    employee_id: '',
    leave_type: 'CONGE_ANNUEL',
    start_date: '',
    end_date: '',
    reason: ''
  });

  const [payrollPeriod, setPayrollPeriod] = useState({
    start_date: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end_date: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]
  });
  const [showPayrollDetail, setShowPayrollDetail] = useState(false);
const [selectedPayrollDetail, setSelectedPayrollDetail] = useState<any>(null);

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
      loadEmployees();
      loadAttendance();
      loadPayrolls();
    }
  }, [siteId, activeTab]);
const handleViewPayrollDetails = (payroll: any) => {
  // Simulez les données détaillées (à remplacer par un appel Supabase réel)
  const mockData = {
    id: payroll.id,
    period_start: payroll.period_start,
    period_end: payroll.period_end,
    status: payroll.status || 'PAID',
    total_brut: 1265000,
    total_deductions: 0,
    total_net: 1265000,
    employee_count: 20,
    employees: employees.map(emp => ({
      employee_id: emp.id,
      employee_name: `${emp.first_name} ${emp.last_name}`,
      employee_matricule: emp.matricule || `EMP${emp.id.slice(0, 8)}`,
      base_salary: emp.salary || 0,
      overtime_hours: 0,
      overtime_amount: 0,
      bonuses: 0,
      advances: 0,
      deductions: 0,
      gross_salary: emp.salary || 0,
      net_salary: emp.salary || 0
    }))
  };
  
  setSelectedPayrollDetail(mockData);
  setShowPayrollDetail(true);
};
  const loadEmployees = async () => {
    try {
      const { data } = await supabase
        .from('restaurant_employees')
        .select('*')
        .eq('site_id', siteId)
        .order('last_name', { ascending: true });
      
      setEmployees(data || []);
      
      const active = data?.filter((e: any) => e.is_active !== false) || [];
      const monthlySalary = active.reduce((sum: number, e: any) => sum + (e.salary || 0), 0);
      
      setStats(prev => ({
        ...prev,
        activeEmployees: active.length,
        monthlySalary
      }));
    } catch (error) {
      console.error('Erreur chargement employés:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAttendance = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('attendance')
        .select('*, restaurant_employees(first_name, last_name)')
        .eq('site_id', siteId)
        .order('date', { ascending: false })
        .limit(50);
      
      setAttendance(data || []);
      
      const todayAttendance = data?.filter((a: any) => a.date === today) || [];
      const presentToday = todayAttendance.filter((a: any) => a.status === 'PRESENT').length;
      const absentToday = todayAttendance.filter((a: any) => a.status === 'ABSENT').length;
      
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
      const lateThisMonth = data?.filter((a: any) => a.date >= startOfMonth && a.status === 'LATE').length || 0;
      
      setStats(prev => ({
        ...prev,
        presentToday,
        absentToday,
        lateThisMonth
      }));
    } catch (error) {
      // Silencieux si la table n'existe pas encore
      console.log('Table attendance non disponible ou vide');
    }
  };

  const loadPayrolls = async () => {
    try {
      const { data } = await supabase
        .from('payroll_periods')
        .select('*')
        .eq('site_id', siteId)
        .order('created_at', { ascending: false })
        .limit(20);
      
      setPayrolls(data || []);
    } catch (error) {
      // Silencieux si la table n'existe pas encore
      console.log('Table payroll_periods non disponible ou vide');
    }
  };

  // ✅ FONCTION : Créer un nouvel employé (adaptée au schéma réel)
  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmployeeForm.first_name || !newEmployeeForm.last_name || !newEmployeeForm.role) {
      alert('Veuillez remplir le prénom, le nom et le poste');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // On insère uniquement les colonnes qui existent dans restaurant_employees
      const insertData: any = {
        site_id: siteId,
        first_name: newEmployeeForm.first_name,
        last_name: newEmployeeForm.last_name,
        role: newEmployeeForm.role,
        is_active: newEmployeeForm.is_active
      };

      const { error } = await supabase.from('restaurant_employees').insert(insertData);

      if (error) {
        console.error('Détail de l\'erreur Supabase:', error);
        throw error;
      }

      setNewEmployeeForm({
        first_name: '',
        last_name: '',
        role: '',
        department: '',
        salary: 0,
        is_active: true
      });

      setShowNewEmployeeModal(false);
      loadEmployees();
      alert('✅ Employé créé avec succès !');
    } catch (error: any) {
      console.error('Erreur création employé:', error);
      alert(`Erreur: ${error.message}`);
    }
  };

  const handleCreateAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAttendanceForm.employee_id || !newAttendanceForm.check_in) {
      alert('Veuillez sélectionner un employé et saisir l\'heure d\'arrivée');
      return;
    }

    try {
      const { error } = await supabase.from('attendance').insert({
        site_id: siteId,
        employee_id: newAttendanceForm.employee_id,
        date: newAttendanceForm.date,
        check_in: newAttendanceForm.check_in,
        check_out: newAttendanceForm.check_out || null,
        status: newAttendanceForm.status
      });

      if (error) throw error;

      setNewAttendanceForm({
        employee_id: '',
        date: new Date().toISOString().split('T')[0],
        check_in: '',
        check_out: '',
        status: 'PRESENT'
      });

      setShowAttendanceModal(false);
      loadAttendance();
      alert('✅ Pointage enregistré avec succès !');
    } catch (error: any) {
      console.error('Erreur pointage:', error);
      alert(`Erreur: ${error.message}`);
    }
  };

  const handleCreateLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeaveForm.employee_id || !newLeaveForm.start_date || !newLeaveForm.end_date) {
      alert('Veuillez remplir tous les champs obligatoires');
      return;
    }

    try {
      const { error } = await supabase.from('leave_requests').insert({
        site_id: siteId,
        employee_id: newLeaveForm.employee_id,
        leave_type: newLeaveForm.leave_type,
        start_date: newLeaveForm.start_date,
        end_date: newLeaveForm.end_date,
        reason: newLeaveForm.reason,
        status: 'PENDING'
      });

      if (error) throw error;

      setNewLeaveForm({
        employee_id: '',
        leave_type: 'CONGE_ANNUEL',
        start_date: '',
        end_date: '',
        reason: ''
      });

      setShowLeaveModal(false);
      alert('✅ Demande de congé créée avec succès !');
    } catch (error: any) {
      console.error('Erreur congé:', error);
      alert(`Erreur: ${error.message}`);
    }
  };

    const handleCalculatePayroll = async () => {
    if (!payrollPeriod.start_date || !payrollPeriod.end_date) {
      alert('Veuillez sélectionner une période');
      return;
    }

    if (!confirm(`Calculer la paie pour la période du ${new Date(payrollPeriod.start_date).toLocaleDateString('fr-FR')} au ${new Date(payrollPeriod.end_date).toLocaleDateString('fr-FR')} ?`)) {
      return;
    }

    try {
      const activeEmployees = employees.filter(e => e.is_active !== false);
      const totalAmount = activeEmployees.reduce((sum, e) => sum + (e.salary || 0), 0);

      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase.from('payroll_periods').insert({
        site_id: siteId,
        period_start: payrollPeriod.start_date,
        period_end: payrollPeriod.end_date,
        total_amount: totalAmount,
        employee_count: activeEmployees.length,
        status: 'PENDING',
        created_by: user?.id
      }).select();

      if (error) {
        console.error('Détail de l\'erreur Supabase:', error);
        throw error;
      }

      loadPayrolls();
      alert(`✅ Paie calculée avec succès !\nTotal: ${totalAmount.toLocaleString('fr-FR')} f CFA\nEmployés: ${activeEmployees.length}`);
    } catch (error: any) {
      console.error('Erreur calcul paie détaillée:', error);
      // ✅ Affiche le message, les détails ou l'indice fourni par Supabase
      const errorMsg = error?.message || error?.details || error?.hint || "Erreur inconnue (vérifiez l'onglet Réseau de la console)";
      alert(`❌ Erreur lors du calcul de la paie :\n\n${errorMsg}`);
    }
  };

  const handleViewEmployee = (employee: Employee) => {
    setSelectedEmployee(employee);
    setShowEmployeeDetailModal(true);
  };

  const handleEditEmployee = (employee: Employee) => {
    setNewEmployeeForm({
      first_name: employee.first_name,
      last_name: employee.last_name,
      role: employee.role || employee.position || '',
      department: employee.department || '',
      salary: employee.salary || 0,
      is_active: employee.is_active !== false
    });
    setSelectedEmployee(employee);
    setShowNewEmployeeModal(true);
  };

  const handleDeleteEmployee = async (employee: Employee) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer ${employee.first_name} ${employee.last_name} ?`)) {
      return;
    }

    try {
      const { error } = await supabase.from('restaurant_employees').delete().eq('id', employee.id);
      if (error) throw error;

      loadEmployees();
      alert('✅ Employé supprimé avec succès !');
    } catch (error: any) {
      console.error('Erreur suppression:', error);
      alert(`Erreur: ${error.message}`);
    }
  };

  const handleViewPayroll = (payroll: Payroll) => {
    setSelectedPayroll(payroll);
    setShowPayrollDetailModal(true);
  };

  const handlePrintPayroll = (payroll: Payroll) => {
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      alert('Veuillez autoriser les popups pour imprimer.');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bulletin de Paie</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
          .header { text-align: center; border-bottom: 3px solid #1e40af; padding-bottom: 20px; margin-bottom: 30px; }
          .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
          .total { font-size: 24px; font-weight: bold; color: #1e40af; text-align: right; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>LA TERRA COTTA OUAGA</h1>
          <h2>Bulletin de Paie</h2>
        </div>
        <div class="info-row"><span>Période:</span><strong>${new Date(payroll.period_start).toLocaleDateString('fr-FR')} - ${new Date(payroll.period_end).toLocaleDateString('fr-FR')}</strong></div>
        <div class="info-row"><span>Nombre d'employés:</span><strong>${payroll.employee_count}</strong></div>
        <div class="info-row"><span>Statut:</span><strong>${payroll.status === 'PAID' ? 'Payé' : 'En attente'}</strong></div>
        <div class="total">Total: ${payroll.total_amount.toLocaleString('fr-FR')} f CFA</div>
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
  };

  const filteredEmployees = employees.filter(emp => {
    const fullName = `${emp.first_name} ${emp.last_name}`.toLowerCase();
    const matchesSearch = fullName.includes(search.toLowerCase()) || (emp.role || '').toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? emp.is_active !== false : emp.is_active === false);
    
    return matchesSearch && matchesStatus;
  });

  const handleExportCSV = () => {
    const headers = ['Prénom', 'Nom', 'Poste', 'Département', 'Salaire', 'Statut'];
    const rows = filteredEmployees.map(e => [
      e.first_name,
      e.last_name,
      e.role || e.position || '-',
      e.department || '-',
      (e.salary || 0).toString(),
      e.is_active !== false ? 'Actif' : 'Inactif'
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `employes_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const getStatusBadge = (isActive: boolean | undefined) => {
    if (isActive !== false) {
      return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">Actif</span>;
    }
    return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">Inactif</span>;
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-7 h-7 text-indigo-600" />
            Gestion des Employés
          </h1>
          <p className="text-sm text-slate-500 mt-1">Gestion complète du personnel du restaurant</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleExportCSV}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button 
            onClick={() => setShowNewEmployeeModal(true)}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Nouvel Employé
          </button>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-2 border-b border-slate-200">
        <button onClick={() => setActiveTab('list')} className={`flex items-center gap-2 px-4 py-3 font-medium text-sm transition-colors ${activeTab === 'list' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}>
          <Users className="w-4 h-4" /> Liste des Employés
        </button>
        <button onClick={() => setActiveTab('attendance')} className={`flex items-center gap-2 px-4 py-3 font-medium text-sm transition-colors ${activeTab === 'attendance' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}>
          <Clock className="w-4 h-4" /> Présences
        </button>
        <button onClick={() => setActiveTab('payroll')} className={`flex items-center gap-2 px-4 py-3 font-medium text-sm transition-colors ${activeTab === 'payroll' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}>
          <DollarSign className="w-4 h-4" /> Paie
        </button>
        <button onClick={() => setActiveTab('leave')} className={`flex items-center gap-2 px-4 py-3 font-medium text-sm transition-colors ${activeTab === 'leave' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}>
          <Calendar className="w-4 h-4" /> Congés
        </button>
      </div>

      {/* Contenu selon l'onglet */}
      {activeTab === 'list' && (
        <>
          {/* Filtres et Stats */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="text-sm text-slate-600">
                {filteredEmployees.length} employé(s) trouvé(s) • {stats.activeEmployees} actif(s)
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Nom, prénom, poste..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm w-64"
                  />
                </div>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
                  <option value="ALL">Tous les statuts</option>
                  <option value="ACTIVE">Actif</option>
                  <option value="INACTIVE">Inactif</option>
                </select>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                <div className="text-xs text-emerald-700 mb-1">Employés Actifs</div>
                <div className="text-2xl font-bold text-emerald-900">{stats.activeEmployees}</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                <div className="text-xs text-blue-700 mb-1">Masse salariale</div>
                <div className="text-lg font-bold text-blue-900">{stats.monthlySalary.toLocaleString('fr-FR')} f CFA</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                <div className="text-xs text-purple-700 mb-1">Primes ce mois</div>
                <div className="text-lg font-bold text-purple-900">{stats.bonuses.toLocaleString('fr-FR')} f CFA</div>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                <div className="text-xs text-amber-700 mb-1">Avances en cours</div>
                <div className="text-lg font-bold text-amber-900">{stats.advances.toLocaleString('fr-FR')} f CFA</div>
              </div>
            </div>
          </div>

          {/* Tableau des employés */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">EMPLOYÉ</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">POSTE</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">DÉPARTEMENT</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">SALAIRE</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">STATUT</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center">
                        <div className="flex items-center justify-center gap-2 text-slate-500">
                          <div className="w-5 h-5 border-2 border-slate-300 border-t-indigo-600 rounded-full animate-spin"></div>
                          Chargement...
                        </div>
                      </td>
                    </tr>
                  ) : filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">Aucun employé trouvé</td>
                    </tr>
                  ) : (
                    filteredEmployees.map((employee) => (
                      <tr key={employee.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                              <span className="text-xs font-bold text-indigo-700">
                                {employee.first_name.charAt(0)}{employee.last_name.charAt(0)}
                              </span>
                            </div>
                            <div>
                              <div className="font-medium text-slate-900">{employee.first_name} {employee.last_name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{employee.role || employee.position || '-'}</td>
                        <td className="px-4 py-3 text-slate-700">{employee.department || '-'}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-900">
                          {(employee.salary || 0).toLocaleString('fr-FR')} f CFA
                        </td>
                        <td className="px-4 py-3 text-center">{getStatusBadge(employee.is_active)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => handleViewEmployee(employee)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Voir">
                              <Eye className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleEditEmployee(employee)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded" title="Modifier">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDeleteEmployee(employee)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Supprimer">
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
        </>
      )}

      {activeTab === 'attendance' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Gestion des Présences</h2>
            <button onClick={() => setShowAttendanceModal(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              <Plus className="w-4 h-4" /> Nouveau Pointage
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-emerald-700 mb-1">Présents aujourd'hui</div>
                  <div className="text-2xl font-bold text-emerald-900">{stats.presentToday}</div>
                </div>
                <UserCheck className="w-8 h-8 text-emerald-600" />
              </div>
            </div>
            <div className="bg-red-50 rounded-xl border border-red-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-red-700 mb-1">Absents aujourd'hui</div>
                  <div className="text-2xl font-bold text-red-900">{stats.absentToday}</div>
                </div>
                <UserX className="w-8 h-8 text-red-600" />
              </div>
            </div>
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-amber-700 mb-1">Retards ce mois</div>
                  <div className="text-2xl font-bold text-amber-900">{stats.lateThisMonth}</div>
                </div>
                <Clock className="w-8 h-8 text-amber-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">EMPLOYÉ</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">DATE</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">ARRIVÉE</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">DÉPART</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">STATUT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attendance.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Aucune donnée de présence</td></tr>
                  ) : (
                    attendance.map((record) => (
                      <tr key={record.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {record.restaurant_employees ? `${record.restaurant_employees.first_name} ${record.restaurant_employees.last_name}` : 'Employé inconnu'}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{new Date(record.date).toLocaleDateString('fr-FR')}</td>
                        <td className="px-4 py-3 text-slate-600">{record.check_in}</td>
                        <td className="px-4 py-3 text-slate-600">{record.check_out || '-'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            record.status === 'PRESENT' ? 'bg-emerald-100 text-emerald-800' :
                            record.status === 'ABSENT' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {record.status === 'PRESENT' ? 'Présent' : record.status === 'ABSENT' ? 'Absent' : 'Retard'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'payroll' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Gestion de la Paie</h2>
            <button onClick={() => setShowPayrollModal(true)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              <Calculator className="w-4 h-4" /> Calculer la Paie
            </button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <h3 className="font-semibold text-slate-900 mb-4">Période de Paie</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Date de début</label>
                <input type="date" value={payrollPeriod.start_date} onChange={(e) => setPayrollPeriod({...payrollPeriod, start_date: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Date de fin</label>
                <input type="date" value={payrollPeriod.end_date} onChange={(e) => setPayrollPeriod({...payrollPeriod, end_date: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2" />
              </div>
              <div className="flex items-end">
                <button onClick={handleCalculatePayroll} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2 rounded-lg">Calculer</button>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">PÉRIODE</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">MONTANT</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">EMPLOYÉS</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">STATUT</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payrolls.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Aucune période de paie enregistrée</td></tr>
                  ) : (
                    payrolls.map((payroll) => (
                      <tr key={payroll.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-600">{new Date(payroll.period_start).toLocaleDateString('fr-FR')} - {new Date(payroll.period_end).toLocaleDateString('fr-FR')}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-900">{payroll.total_amount.toLocaleString('fr-FR')} f CFA</td>
                        <td className="px-4 py-3 text-center text-slate-600">{payroll.employee_count}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">Payé</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button 
  onClick={() => handleViewPayrollDetails(payroll)}
  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded flex items-center gap-1"
>
  <Eye className="w-3 h-3" /> Détails
</button>
                            <button onClick={() => handlePrintPayroll(payroll)} className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded flex items-center gap-1">
                              <Printer className="w-3 h-3" /> Imprimer
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
        </div>
      )}

      {activeTab === 'leave' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Gestion des Congés</h2>
            <button onClick={() => setShowLeaveModal(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              <Plus className="w-4 h-4" /> Nouvelle Demande
            </button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-8 text-center">
            <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">Aucune demande de congé</h3>
            <p className="text-sm text-slate-500 mb-4">Commencez par créer votre première demande de congé</p>
            <button onClick={() => setShowLeaveModal(true)} className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium">Créer la première demande</button>
          </div>
        </div>
      )}

      {/* ================= MODAL NOUVEL EMPLOYÉ ================= */}
      {showNewEmployeeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between sticky top-0 z-10">
              <h3 className="text-lg font-bold">{selectedEmployee ? 'Modifier l\'Employé' : 'Nouvel Employé'}</h3>
              <button onClick={() => { setShowNewEmployeeModal(false); setSelectedEmployee(null); }} className="hover:bg-white/20 p-2 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateEmployee} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Prénom *</label>
                  <input type="text" value={newEmployeeForm.first_name} onChange={(e) => setNewEmployeeForm({...newEmployeeForm, first_name: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Nom *</label>
                  <input type="text" value={newEmployeeForm.last_name} onChange={(e) => setNewEmployeeForm({...newEmployeeForm, last_name: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Poste / Rôle *</label>
                  <input type="text" value={newEmployeeForm.role} onChange={(e) => setNewEmployeeForm({...newEmployeeForm, role: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="Ex: Serveur, Cuisinier..." required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Département</label>
                  <input type="text" value={newEmployeeForm.department} onChange={(e) => setNewEmployeeForm({...newEmployeeForm, department: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="Ex: Cuisine, Salle..." />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Salaire (f CFA)</label>
                  <input type="number" min="0" value={newEmployeeForm.salary} onChange={(e) => setNewEmployeeForm({...newEmployeeForm, salary: Number(e.target.value)})} className="w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="0" />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer p-3 border border-slate-300 rounded-lg w-full hover:bg-slate-50">
                    <input type="checkbox" checked={newEmployeeForm.is_active} onChange={(e) => setNewEmployeeForm({...newEmployeeForm, is_active: e.target.checked})} className="w-4 h-4 text-blue-600 rounded" />
                    <span className="text-sm font-medium text-slate-700">Employé actif</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button type="button" onClick={() => { setShowNewEmployeeModal(false); setSelectedEmployee(null); }} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-lg">Annuler</button>
                <button type="submit" className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" /> {selectedEmployee ? 'Enregistrer' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL NOUVEAU POINTAGE ================= */}
      {showAttendanceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="bg-blue-600 text-white px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h3 className="text-lg font-bold">Nouveau Pointage</h3>
              <button onClick={() => setShowAttendanceModal(false)} className="hover:bg-white/20 p-2 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreateAttendance} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Employé *</label>
                <select value={newAttendanceForm.employee_id} onChange={(e) => setNewAttendanceForm({...newAttendanceForm, employee_id: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2" required>
                  <option value="">Sélectionner un employé</option>
                  {employees.filter(e => e.is_active !== false).map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name} - {emp.role}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Heure d'arrivée *</label>
                  <input type="time" value={newAttendanceForm.check_in} onChange={(e) => setNewAttendanceForm({...newAttendanceForm, check_in: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Heure de départ</label>
                  <input type="time" value={newAttendanceForm.check_out} onChange={(e) => setNewAttendanceForm({...newAttendanceForm, check_out: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2" />
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button type="button" onClick={() => setShowAttendanceModal(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-lg">Annuler</button>
                <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" /> Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL NOUVELLE DEMANDE DE CONGÉ ================= */}
      {showLeaveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="bg-blue-600 text-white px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h3 className="text-lg font-bold">Nouvelle Demande de Congé</h3>
              <button onClick={() => setShowLeaveModal(false)} className="hover:bg-white/20 p-2 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreateLeave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Employé *</label>
                <select value={newLeaveForm.employee_id} onChange={(e) => setNewLeaveForm({...newLeaveForm, employee_id: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2" required>
                  <option value="">Sélectionner un employé</option>
                  {employees.filter(e => e.is_active !== false).map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Date de début *</label>
                  <input type="date" value={newLeaveForm.start_date} onChange={(e) => setNewLeaveForm({...newLeaveForm, start_date: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Date de fin *</label>
                  <input type="date" value={newLeaveForm.end_date} onChange={(e) => setNewLeaveForm({...newLeaveForm, end_date: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2" required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Motif</label>
                <textarea value={newLeaveForm.reason} onChange={(e) => setNewLeaveForm({...newLeaveForm, reason: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2" rows={3} placeholder="Motif de la demande..." />
              </div>
              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button type="button" onClick={() => setShowLeaveModal(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-lg">Annuler</button>
                <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" /> Créer la demande
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL CALCUL DE PAIE ================= */}
      {showPayrollModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="bg-emerald-600 text-white px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h3 className="text-lg font-bold">Calculer la Paie</h3>
              <button onClick={() => setShowPayrollModal(false)} className="hover:bg-white/20 p-2 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="text-sm text-blue-900">
                  <strong>Période sélectionnée :</strong>
                  <div className="mt-1">Du {new Date(payrollPeriod.start_date).toLocaleDateString('fr-FR')} au {new Date(payrollPeriod.end_date).toLocaleDateString('fr-FR')}</div>
                </div>
              </div>
              <div className="bg-slate-50 p-4 rounded-lg">
                <div className="text-sm text-slate-600 mb-2">Résumé</div>
                <div className="space-y-1">
                  <div className="flex justify-between"><span className="text-slate-700">Employés actifs :</span><span className="font-bold">{stats.activeEmployees}</span></div>
                  <div className="flex justify-between"><span className="text-slate-700">Masse salariale :</span><span className="font-bold">{stats.monthlySalary.toLocaleString('fr-FR')} f CFA</span></div>
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button onClick={() => setShowPayrollModal(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-lg">Annuler</button>
                <button onClick={handleCalculatePayroll} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2">
                  <Calculator className="w-4 h-4" /> Calculer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL DÉTAILS EMPLOYÉ ================= */}
      {showEmployeeDetailModal && selectedEmployee && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl">
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h3 className="text-lg font-bold">Détails de l'Employé</h3>
              <button onClick={() => setShowEmployeeDetailModal(false)} className="hover:bg-white/20 p-2 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl font-bold text-indigo-700">{selectedEmployee.first_name.charAt(0)}{selectedEmployee.last_name.charAt(0)}</span>
                </div>
                <div>
                  <h4 className="text-xl font-bold text-slate-900">{selectedEmployee.first_name} {selectedEmployee.last_name}</h4>
                  <div className="mt-1">{getStatusBadge(selectedEmployee.is_active)}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded-lg">
                  <div className="text-xs text-slate-500 mb-1">Poste</div>
                  <div className="font-medium text-slate-900">{selectedEmployee.role || selectedEmployee.position || '-'}</div>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <div className="text-xs text-slate-500 mb-1">Département</div>
                  <div className="font-medium text-slate-900">{selectedEmployee.department || '-'}</div>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <div className="text-xs text-slate-500 mb-1">Salaire</div>
                  <div className="font-medium text-slate-900">{(selectedEmployee.salary || 0).toLocaleString('fr-FR')} f CFA</div>
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button onClick={() => setShowEmployeeDetailModal(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-lg">Fermer</button>
                <button onClick={() => { setShowEmployeeDetailModal(false); handleEditEmployee(selectedEmployee); }} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2">
                  <Edit2 className="w-4 h-4" /> Modifier
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL DÉTAILS PAIE ================= */}
      {showPayrollDetailModal && selectedPayroll && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl">
            <div className="bg-purple-600 text-white px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h3 className="text-lg font-bold">Détails de la Paie</h3>
              <button onClick={() => setShowPayrollDetailModal(false)} className="hover:bg-white/20 p-2 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-4 rounded-lg">
                <div className="text-sm text-slate-600 mb-2">Période</div>
                <div className="font-bold text-slate-900">{new Date(selectedPayroll.period_start).toLocaleDateString('fr-FR')} - {new Date(selectedPayroll.period_end).toLocaleDateString('fr-FR')}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 p-3 rounded-lg">
                  <div className="text-xs text-blue-700 mb-1">Nombre d'employés</div>
                  <div className="text-2xl font-bold text-blue-900">{selectedPayroll.employee_count}</div>
                </div>
                <div className="bg-emerald-50 p-3 rounded-lg">
                  <div className="text-xs text-emerald-700 mb-1">Montant Total</div>
                  <div className="text-2xl font-bold text-emerald-900">{selectedPayroll.total_amount.toLocaleString('fr-FR')} f CFA</div>
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button onClick={() => setShowPayrollDetailModal(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-lg">Fermer</button>
                <button onClick={() => handlePrintPayroll(selectedPayroll)} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2">
                  <Printer className="w-4 h-4" /> Imprimer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <PayrollDetailModal
  isOpen={showPayrollDetail}
  onClose={() => setShowPayrollDetail(false)}
  payrollData={selectedPayrollDetail || {
    id: '',
    period_start: '',
    period_end: '',
    status: 'PENDING',
    total_brut: 0,
    total_deductions: 0,
    total_net: 0,
    employee_count: 0,
    employees: []
  }}
/>
    </div>
  );
}
