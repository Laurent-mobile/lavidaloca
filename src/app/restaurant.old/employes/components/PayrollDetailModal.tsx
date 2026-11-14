'use client';

import { useState } from 'react';
import { X, Printer, Eye, FileText, TrendingUp, TrendingDown, DollarSign, Users } from 'lucide-react';

interface PayrollEmployee {
  employee_id: string;
  employee_name: string;
  employee_matricule: string;
  base_salary: number;
  overtime_hours: number;
  overtime_amount: number;
  bonuses: number;
  advances: number;
  deductions: number;
  gross_salary: number;
  net_salary: number;
}

interface PayrollDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  payrollData: {
    id: string;
    period_start: string;
    period_end: string;
    status: 'PAID' | 'PENDING';
    total_brut: number;
    total_deductions: number;
    total_net: number;
    employee_count: number;
    employees: PayrollEmployee[];
  };
}

export default function PayrollDetailModal({ isOpen, onClose, payrollData }: PayrollDetailModalProps) {
  const [printing, setPrinting] = useState(false);

  if (!isOpen) return null;

  const handlePrintAll = () => {
    setPrinting(true);
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      alert('Veuillez autoriser les popups pour imprimer.');
      setPrinting(false);
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bulletins de Paie - ${new Date(payrollData.period_start).toLocaleDateString('fr-FR')} au ${new Date(payrollData.period_end).toLocaleDateString('fr-FR')}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .page-break { page-break-after: always; }
          .bulletin { max-width: 600px; margin: 0 auto 40px; padding: 20px; border: 1px solid #ddd; }
          .header { text-align: center; border-bottom: 3px solid #7c3aed; padding-bottom: 15px; margin-bottom: 20px; }
          .header h1 { color: #7c3aed; margin: 0; font-size: 22px; }
          .info-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
          .salary-table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 13px; }
          .salary-table th, .salary-table td { padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb; }
          .salary-table th { background: #f8fafc; font-weight: 600; }
          .salary-table .amount { text-align: right; font-weight: 600; }
          .total-row { background: #eff6ff; font-weight: bold; }
          .net-row { background: #dcfce7; font-size: 16px; }
          .footer { margin-top: 30px; text-align: center; color: #64748b; font-size: 11px; border-top: 2px solid #e5e7eb; padding-top: 15px; }
          @media print { body { padding: 10px; } .bulletin { page-break-after: always; } }
        </style>
      </head>
      <body>
        ${payrollData.employees.map(emp => `
          <div class="bulletin">
            <div class="header">
              <h1>LA TERRA COTTA OUAGA</h1>
              <h2>Bulletin de Paie</h2>
              <p>Période: ${new Date(payrollData.period_start).toLocaleDateString('fr-FR')} - ${new Date(payrollData.period_end).toLocaleDateString('fr-FR')}</p>
            </div>
            <div class="info-row"><span><strong>Employé:</strong></span><span>${emp.employee_name}</span></div>
            <div class="info-row"><span><strong>Matricule:</strong></span><span>${emp.employee_matricule}</span></div>
            <table class="salary-table">
              <thead><tr><th>Rubrique</th><th class="amount">Montant</th></tr></thead>
              <tbody>
                <tr><td>Salaire de base</td><td class="amount">${emp.base_salary.toLocaleString('fr-FR')} f CFA</td></tr>
                ${emp.overtime_hours > 0 ? `<tr><td>Heures supplémentaires (${emp.overtime_hours}h)</td><td class="amount">${emp.overtime_amount.toLocaleString('fr-FR')} f CFA</td></tr>` : ''}
                ${emp.bonuses > 0 ? `<tr><td>Primes</td><td class="amount">${emp.bonuses.toLocaleString('fr-FR')} f CFA</td></tr>` : ''}
                <tr class="total-row"><td>Total Brut</td><td class="amount">${emp.gross_salary.toLocaleString('fr-FR')} f CFA</td></tr>
                ${emp.deductions > 0 ? `<tr><td style="color: #dc2626;">Déductions</td><td class="amount" style="color: #dc2626;">-${emp.deductions.toLocaleString('fr-FR')} f CFA</td></tr>` : ''}
                ${emp.advances > 0 ? `<tr><td style="color: #ea580c;">Avances</td><td class="amount" style="color: #ea580c;">-${emp.advances.toLocaleString('fr-FR')} f CFA</td></tr>` : ''}
                <tr class="net-row"><td><strong>NET À PAYER</strong></td><td class="amount" style="color: #16a34a;"><strong>${emp.net_salary.toLocaleString('fr-FR')} f CFA</strong></td></tr>
              </tbody>
            </table>
            <div class="footer">Document généré le ${new Date().toLocaleDateString('fr-FR')}</div>
          </div>
        `).join('')}
        <script>window.onload = function() { setTimeout(function() { window.print(); }, 300); };</script>
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => setPrinting(false), 2000);
  };

  const handlePrintSingle = (employee: PayrollEmployee) => {
    const printWindow = window.open('', '_blank', 'width=600,height=800');
    if (!printWindow) {
      alert('Veuillez autoriser les popups pour imprimer.');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bulletin de Paie - ${employee.employee_name}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 30px; max-width: 600px; margin: 0 auto; }
          .header { text-align: center; border-bottom: 3px solid #7c3aed; padding-bottom: 20px; margin-bottom: 30px; }
          .header h1 { color: #7c3aed; margin: 0; font-size: 24px; }
          .header h2 { margin: 10px 0 0; font-size: 18px; color: #64748b; }
          .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
          .salary-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          .salary-table th, .salary-table td { padding: 10px; text-align: left; border-bottom: 1px solid #e5e7eb; }
          .salary-table th { background: #f8fafc; font-weight: 600; }
          .salary-table .amount { text-align: right; font-weight: 600; }
          .total-row { background: #eff6ff; font-weight: bold; }
          .net-row { background: #dcfce7; font-size: 18px; }
          .footer { margin-top: 40px; text-align: center; color: #64748b; font-size: 12px; border-top: 2px solid #e5e7eb; padding-top: 20px; }
          @media print { body { padding: 15px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>LA TERRA COTTA OUAGA</h1>
          <h2>Bulletin de Paie</h2>
          <p>Période: ${new Date(payrollData.period_start).toLocaleDateString('fr-FR')} - ${new Date(payrollData.period_end).toLocaleDateString('fr-FR')}</p>
        </div>
        <div class="info-row"><span><strong>Employé:</strong></span><span>${employee.employee_name}</span></div>
        <div class="info-row"><span><strong>Matricule:</strong></span><span>${employee.employee_matricule}</span></div>
        <table class="salary-table">
          <thead><tr><th>Rubrique</th><th class="amount">Montant</th></tr></thead>
          <tbody>
            <tr><td>Salaire de base</td><td class="amount">${employee.base_salary.toLocaleString('fr-FR')} f CFA</td></tr>
            ${employee.overtime_hours > 0 ? `<tr><td>Heures supplémentaires (${employee.overtime_hours}h)</td><td class="amount">${employee.overtime_amount.toLocaleString('fr-FR')} f CFA</td></tr>` : ''}
            ${employee.bonuses > 0 ? `<tr><td>Primes</td><td class="amount">${employee.bonuses.toLocaleString('fr-FR')} f CFA</td></tr>` : ''}
            <tr class="total-row"><td>Total Brut</td><td class="amount">${employee.gross_salary.toLocaleString('fr-FR')} f CFA</td></tr>
            ${employee.deductions > 0 ? `<tr><td style="color: #dc2626;">Déductions</td><td class="amount" style="color: #dc2626;">-${employee.deductions.toLocaleString('fr-FR')} f CFA</td></tr>` : ''}
            ${employee.advances > 0 ? `<tr><td style="color: #ea580c;">Avances</td><td class="amount" style="color: #ea580c;">-${employee.advances.toLocaleString('fr-FR')} f CFA</td></tr>` : ''}
            <tr class="net-row"><td><strong>NET À PAYER</strong></td><td class="amount" style="color: #16a34a;"><strong>${employee.net_salary.toLocaleString('fr-FR')} f CFA</strong></td></tr>
          </tbody>
        </table>
        <div class="footer">Document généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}</div>
        <script>window.onload = function() { setTimeout(function() { window.print(); }, 300); };</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleViewDetails = (employee: PayrollEmployee) => {
    alert(`Détails complets de ${employee.employee_name}\n\nMatricule: ${employee.employee_matricule}\nSalaire de base: ${employee.base_salary.toLocaleString('fr-FR')} f CFA\nHeures supp: ${employee.overtime_hours}h\nPrimes: ${employee.bonuses.toLocaleString('fr-FR')} f CFA\nAvances: ${employee.advances.toLocaleString('fr-FR')} f CFA\nDéductions: ${employee.deductions.toLocaleString('fr-FR')} f CFA\nBrut: ${employee.gross_salary.toLocaleString('fr-FR')} f CFA\nNet: ${employee.net_salary.toLocaleString('fr-FR')} f CFA`);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl my-8">
        {/* Header avec gradient violet */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-700 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <div>
            <h3 className="text-xl font-bold">
              Détails de la Paie - Paie {new Date(payrollData.period_start).toLocaleDateString('fr-FR')} - {new Date(payrollData.period_end).toLocaleDateString('fr-FR')}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-purple-100">
                {new Date(payrollData.period_start).toLocaleDateString('fr-FR')} au {new Date(payrollData.period_end).toLocaleDateString('fr-FR')}
              </span>
              {payrollData.status === 'PAID' && (
                <span className="px-2 py-0.5 bg-emerald-500 text-white text-xs rounded-full font-medium">
                  PAYÉ
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrintAll}
              disabled={printing}
              className="bg-white/20 hover:bg-white/30 disabled:bg-white/10 px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
            >
              <Printer className="w-4 h-4" />
              {printing ? 'Impression...' : 'Imprimer tous les bulletins'}
            </button>
            <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* 4 Cartes de statistiques */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="text-sm text-blue-700 mb-1">Total Brut</div>
              <div className="text-2xl font-bold text-blue-900">{payrollData.total_brut.toLocaleString('fr-FR')} f CFA</div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="text-sm text-red-700 mb-1">Total Déductions</div>
              <div className="text-2xl font-bold text-red-900">{payrollData.total_deductions.toLocaleString('fr-FR')} f CFA</div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <div className="text-sm text-emerald-700 mb-1">Total Net</div>
              <div className="text-2xl font-bold text-emerald-900">{payrollData.total_net.toLocaleString('fr-FR')} f CFA</div>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="text-sm text-purple-700 mb-1">Nombre d'employés</div>
              <div className="text-2xl font-bold text-purple-900">{payrollData.employee_count}</div>
            </div>
          </div>

          {/* Tableau détaillé des employés */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Employé</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">Base</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">H. Sup</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">Primes</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">Avances</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">Déduct.</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">Brut</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">Net</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payrollData.employees.map((employee, index) => (
                    <tr key={index} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{employee.employee_name}</div>
                        <div className="text-xs text-slate-500">{employee.employee_matricule}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">
                        {employee.base_salary.toLocaleString('fr-FR')}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-600">
                        {employee.overtime_hours > 0 ? `${employee.overtime_hours}h` : '0.0h'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {employee.bonuses > 0 ? (
                          <span className="text-emerald-600 font-medium">+{employee.bonuses.toLocaleString('fr-FR')}</span>
                        ) : (
                          <span className="text-slate-400">-0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {employee.advances > 0 ? (
                          <span className="text-amber-600 font-medium">-{employee.advances.toLocaleString('fr-FR')}</span>
                        ) : (
                          <span className="text-slate-400">-0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {employee.deductions > 0 ? (
                          <span className="text-red-600 font-medium">-{employee.deductions.toLocaleString('fr-FR')}</span>
                        ) : (
                          <span className="text-slate-400">-0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">
                        {employee.gross_salary.toLocaleString('fr-FR')}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600">
                        {employee.net_salary.toLocaleString('fr-FR')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handlePrintSingle(employee)}
                            className="p-1.5 text-purple-600 hover:bg-purple-50 rounded transition-colors"
                            title="Imprimer bulletin"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleViewDetails(employee)}
                            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded transition-colors"
                            title="Voir détails"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
