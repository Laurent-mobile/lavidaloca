'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, CheckCircle, Edit3, CreditCard, AlertCircle } from 'lucide-react';

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  matricule?: string;
  role?: string;
  department?: string;
  base_salary?: number;
}

interface Payslip {
  id?: string;
  employee_id: string;
  period_month: number;
  period_year: number;
  base_salary: number;
  bonuses: number;
  deductions: number;
  advances: number;
  net_salary: number;
  status: string;
  payment_method?: string;
  payment_reference?: string;
  payment_date?: string;
  paid_by?: string; // ✅ Ajouté pour satisfaire TypeScript
  notes?: string;
}

interface Props {
  siteId: string;
  employee: Employee | null;
  periodMonth: number;
  periodYear: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export default function PayslipPreviewModal({ siteId, employee, periodMonth, periodYear, isOpen, onClose, onSuccess }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [payslip, setPayslip] = useState<Payslip | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [bonuses, setBonuses] = useState('0');
  const [deductions, setDeductions] = useState('0');
  const [advances, setAdvances] = useState('0');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentReference, setPaymentReference] = useState('');

  useEffect(() => {
    if (isOpen && employee) {
      loadExistingPayslip();
    }
  }, [isOpen, employee]);

  const loadExistingPayslip = async () => {
    if (!employee) return;
    try {
      const { data } = await supabase
        .from('employee_payslips')
        .select('*')
        .eq('employee_id', employee.id)
        .eq('period_month', periodMonth)
        .eq('period_year', periodYear)
        .maybeSingle();

      if (data) {
        setPayslip(data);
        setBonuses(data.bonuses.toString());
        setDeductions(data.deductions.toString());
        setAdvances(data.advances.toString());
        setNotes(data.notes || '');
        setPaymentMethod(data.payment_method || 'CASH');
        setPaymentReference(data.payment_reference || '');
        setIsEditing(data.status === 'DRAFT');
      } else {
        setPayslip({
          employee_id: employee.id,
          period_month: periodMonth,
          period_year: periodYear,
          base_salary: employee.base_salary || 0,
          bonuses: 0,
          deductions: 0,
          advances: 0,
          net_salary: employee.base_salary || 0,
          status: 'DRAFT'
        });
        setBonuses('0');
        setDeductions('0');
        setAdvances('0');
        setIsEditing(true);
      }
    } catch (error) {
      console.error('Erreur chargement bulletin:', error);
    }
  };

  const calculateNetSalary = () => {
    const base = employee?.base_salary || 0;
    const bon = parseFloat(bonuses) || 0;
    const ded = parseFloat(deductions) || 0;
    const adv = parseFloat(advances) || 0;
    return base + bon - ded - adv;
  };

  const handleSaveDraft = async () => {
    if (!employee || !payslip) return;
    setLoading(true);
    try {
      const netSalary = calculateNetSalary();
      const payslipData: any = {
        site_id: siteId,
        employee_id: employee.id,
        period_month: periodMonth,
        period_year: periodYear,
        base_salary: employee.base_salary || 0,
        bonuses: parseFloat(bonuses) || 0,
        deductions: parseFloat(deductions) || 0,
        advances: parseFloat(advances) || 0,
        net_salary: netSalary,
        status: 'DRAFT',
        notes: notes
      };

      const { error } = payslip.id
        ? await supabase.from('employee_payslips').update(payslipData).eq('id', payslip.id)
        : await supabase.from('employee_payslips').insert(payslipData).select().single();

      if (error) throw error;

      alert('✅ Brouillon sauvegardé !');
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Erreur sauvegarde:', error);
      alert(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleValidateAndPay = async () => {
    if (!employee || !payslip) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const netSalary = calculateNetSalary();
      
      // ✅ Utilisation de 'any' pour le payload afin d'inclure 'paid_by' sans erreur TS
      const payslipData: any = {
        site_id: siteId,
        employee_id: employee.id,
        period_month: periodMonth,
        period_year: periodYear,
        base_salary: employee.base_salary || 0,
        bonuses: parseFloat(bonuses) || 0,
        deductions: parseFloat(deductions) || 0,
        advances: parseFloat(advances) || 0,
        net_salary: netSalary,
        status: 'PAID',
        payment_method: paymentMethod,
        payment_reference: paymentReference,
        payment_date: new Date().toISOString(),
        paid_by: user?.id, // ✅ Maintenant reconnu par TypeScript
        notes: notes
      };

      const { error } = payslip.id
        ? await supabase.from('employee_payslips').update(payslipData).eq('id', payslip.id)
        : await supabase.from('employee_payslips').insert(payslipData).select().single();

      if (error) throw error;

      alert(`✅ Paie validée et payée !\nNet: ${netSalary.toLocaleString('fr-FR')} f CFA\nMode: ${paymentMethod}`);
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Erreur paiement:', error);
      alert(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !employee) return null;

  const netSalary = calculateNetSalary();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-700 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <div>
            <h3 className="text-xl font-bold">Bulletin de Paie</h3>
            <p className="text-sm text-indigo-100">
              {employee.first_name} {employee.last_name} • {MONTHS[periodMonth - 1]} {periodYear}
            </p>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {payslip?.status && (
            <div className={`p-3 rounded-lg flex items-center gap-2 ${
              payslip.status === 'PAID' ? 'bg-emerald-50 text-emerald-800' :
              payslip.status === 'VALIDATED' ? 'bg-blue-50 text-blue-800' :
              'bg-amber-50 text-amber-800'
            }`}>
              <AlertCircle className="w-5 h-5" />
              <span className="font-medium">Statut: {payslip.status === 'DRAFT' ? 'Brouillon' : payslip.status === 'VALIDATED' ? 'Validé' : 'Payé'}</span>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-lg">
            <div>
              <div className="text-xs text-slate-500">Matricule</div>
              <div className="font-semibold">{employee.matricule || 'N/A'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Poste</div>
              <div className="font-semibold">{employee.role || 'N/A'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Département</div>
              <div className="font-semibold">{employee.department || 'N/A'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Salaire de base</div>
              <div className="font-bold text-indigo-600">{(employee.base_salary || 0).toLocaleString('fr-FR')} f CFA</div>
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left">Élément</th>
                  <th className="px-4 py-3 text-right">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="px-4 py-3 font-medium">Salaire de base</td>
                  <td className="px-4 py-3 text-right font-bold">{(employee.base_salary || 0).toLocaleString('fr-FR')} f CFA</td>
                </tr>
                <tr className="bg-emerald-50">
                  <td className="px-4 py-3">
                    <label className="text-emerald-700 font-medium">Primes</label>
                    {isEditing && (
                      <input type="number" value={bonuses} onChange={(e) => setBonuses(e.target.value)} className="ml-2 w-32 border border-slate-300 rounded px-2 py-1 text-sm" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-emerald-600 font-bold">+{(parseFloat(bonuses) || 0).toLocaleString('fr-FR')} f CFA</td>
                </tr>
                <tr className="bg-red-50">
                  <td className="px-4 py-3">
                    <label className="text-red-700 font-medium">Déductions</label>
                    {isEditing && (
                      <input type="number" value={deductions} onChange={(e) => setDeductions(e.target.value)} className="ml-2 w-32 border border-slate-300 rounded px-2 py-1 text-sm" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-red-600 font-bold">-{(parseFloat(deductions) || 0).toLocaleString('fr-FR')} f CFA</td>
                </tr>
                <tr className="bg-amber-50">
                  <td className="px-4 py-3">
                    <label className="text-amber-700 font-medium">Avances</label>
                    {isEditing && (
                      <input type="number" value={advances} onChange={(e) => setAdvances(e.target.value)} className="ml-2 w-32 border border-slate-300 rounded px-2 py-1 text-sm" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-amber-600 font-bold">-{(parseFloat(advances) || 0).toLocaleString('fr-FR')} f CFA</td>
                </tr>
                <tr className="bg-indigo-100">
                  <td className="px-4 py-3 text-lg font-bold">NET À PAYER</td>
                  <td className="px-4 py-3 text-right text-2xl font-bold text-indigo-700">{netSalary.toLocaleString('fr-FR')} f CFA</td>
                </tr>
              </tbody>
            </table>
          </div>

          {isEditing && (
            <div className="space-y-4">
              <h4 className="font-bold text-slate-900 flex items-center gap-2">
                <CreditCard className="w-5 h-5" /> Mode de paiement
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Mode *</label>
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white">
                    <option value="CASH">💶 Espèces</option>
                    <option value="MOBILE_MONEY">📱 Mobile Money</option>
                    <option value="BANK_TRANSFER">🏦 Virement bancaire</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Référence</label>
                  <input type="text" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="N° chèque, virement..." />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2" rows={2} placeholder="Notes supplémentaires..." />
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t border-slate-200">
            <button onClick={onClose} disabled={loading} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-lg">Fermer</button>
            {isEditing && payslip?.status !== 'PAID' && (
              <>
                <button onClick={handleSaveDraft} disabled={loading} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2">
                  <Edit3 className="w-5 h-5" /> Sauvegarder brouillon
                </button>
                <button onClick={handleValidateAndPay} disabled={loading} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2">
                  <CheckCircle className="w-5 h-5" /> Valider et payer
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
