'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Printer, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  siteId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface MonthlyStats {
  month: string;
  year: number;
  totalAmount: number;
  paidAmount: number;
  unpaidAmount: number;
  paymentRate: number;
  orderCount: number;
}

export default function MonthlySummaryModal({ siteId, isOpen, onClose }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats[]>([]);
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      loadMonthlyStats();
    }
  }, [isOpen, selectedMonth]);

  const loadMonthlyStats = async () => {
    setLoading(true);
    try {
      const { data: orders } = await supabase
        .from('supplier_orders')
        .select('*')
        .eq('site_id', siteId)
        .order('order_date', { ascending: false });

      if (!orders) return;

      const statsMap: Record<string, MonthlyStats> = {};

      orders.forEach(order => {
        const date = new Date(order.order_date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const monthName = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

        if (!statsMap[monthKey]) {
          statsMap[monthKey] = {
            month: monthName,
            year: date.getFullYear(),
            totalAmount: 0,
            paidAmount: 0,
            unpaidAmount: 0,
            paymentRate: 0,
            orderCount: 0
          };
        }

        statsMap[monthKey].totalAmount += order.total_amount || 0;
        statsMap[monthKey].orderCount += 1;

        // Simplification: on considère que RECEIVED = payé
        if (order.status === 'RECEIVED') {
          statsMap[monthKey].paidAmount += order.total_amount || 0;
        } else {
          statsMap[monthKey].unpaidAmount += order.total_amount || 0;
        }
      });

      // Calculer les taux de paiement
      Object.values(statsMap).forEach(stats => {
        stats.paymentRate = stats.totalAmount > 0 
          ? (stats.paidAmount / stats.totalAmount) * 100 
          : 0;
      });

      const statsArray = Object.values(statsMap).sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return parseInt(b.month.split('-')[1]) - parseInt(a.month.split('-')[1]);
      });

      if (selectedMonth !== 'all') {
        const filtered = statsArray.filter(s => {
          const monthNum = String(s.year) + '-' + String(statsArray.indexOf(s) + 1).padStart(2, '0');
          return monthNum === selectedMonth;
        });
        setMonthlyStats(filtered.length > 0 ? filtered : statsArray);
      } else {
        setMonthlyStats(statsArray);
      }
    } catch (error) {
      console.error('Erreur chargement stats mensuelles:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleMonth = (monthKey: string) => {
    const newExpanded = new Set(expandedMonths);
    if (newExpanded.has(monthKey)) {
      newExpanded.delete(monthKey);
    } else {
      newExpanded.add(monthKey);
    }
    setExpandedMonths(newExpanded);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Résumé Mensuel - LA TERRA COTTA OUAGA</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { text-align: center; color: #1e293b; }
          h2 { color: #475569; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
          .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }
          .stat-card { border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; }
          .stat-value { font-size: 24px; font-weight: bold; margin: 10px 0; }
          .stat-label { font-size: 12px; color: #64748b; }
          .total { color: #1e293b; }
          .paid { color: #10b981; }
          .unpaid { color: #ef4444; }
          @media print { body { padding: 10px; } }
        </style>
      </head>
      <body>
        <h1>Résumé Mensuel des Commandes Fournisseurs</h1>
        <p style="text-align: center; color: #64748b;">LA TERRA COTTA OUAGA</p>
        ${monthlyStats.map(stats => `
          <h2>${stats.month}</h2>
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">Montant Total</div>
              <div class="stat-value total">${stats.totalAmount.toLocaleString('fr-FR')} f CFA</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Payé (${stats.paymentRate.toFixed(0)}%)</div>
              <div class="stat-value paid">${stats.paidAmount.toLocaleString('fr-FR')} f CFA</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Reste à Payer</div>
              <div class="stat-value unpaid">${stats.unpaidAmount.toLocaleString('fr-FR')} f CFA</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Commandes</div>
              <div class="stat-value">${stats.orderCount}</div>
            </div>
          </div>
        `).join('')}
        <script>
          window.onload = function() { setTimeout(function() { window.print(); }, 300); };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-slate-700 to-slate-900 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <h3 className="text-xl font-bold">Résumé Mensuel des Paiements</h3>
          <div className="flex items-center gap-3">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-white text-slate-900 px-3 py-1 rounded-lg text-sm"
            >
              <option value="all">Tous les mois</option>
              {monthlyStats.map((stats, idx) => (
                <option key={idx} value={`${stats.year}-${String(idx + 1).padStart(2, '0')}`}>
                  {stats.month}
                </option>
              ))}
            </select>
            <button
              onClick={handlePrint}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg flex items-center gap-2 text-sm"
            >
              <Printer className="w-4 h-4" />
              Imprimer
            </button>
            <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {loading ? (
            <div className="text-center py-8 text-slate-500">Chargement...</div>
          ) : monthlyStats.length === 0 ? (
            <div className="text-center py-8 text-slate-500">Aucune donnée disponible</div>
          ) : (
            monthlyStats.map((stats, idx) => {
              const monthKey = `${stats.year}-${idx}`;
              const isExpanded = expandedMonths.has(monthKey);

              return (
                <div key={idx} className="border border-slate-200 rounded-lg overflow-hidden">
                  <div
                    className="bg-slate-50 px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-100"
                    onClick={() => toggleMonth(monthKey)}
                  >
                    <h4 className="font-semibold text-slate-900">{stats.month}</h4>
                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </div>

                  {isExpanded && (
                    <div className="p-6">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-white border-2 border-slate-200 rounded-lg p-4">
                          <div className="text-2xl font-bold text-slate-900">
                            {stats.totalAmount.toLocaleString('fr-FR')} f CFA
                          </div>
                          <div className="text-sm text-slate-600 mt-1">Montant Total</div>
                        </div>
                        <div className="bg-white border-2 border-emerald-200 rounded-lg p-4">
                          <div className="text-2xl font-bold text-emerald-600">
                            {stats.paidAmount.toLocaleString('fr-FR')} f CFA
                          </div>
                          <div className="text-sm text-slate-600 mt-1">
                            Payé ({stats.paymentRate.toFixed(0)}%)
                          </div>
                        </div>
                        <div className="bg-white border-2 border-red-200 rounded-lg p-4">
                          <div className="text-2xl font-bold text-red-600">
                            {stats.unpaidAmount.toLocaleString('fr-FR')} f CFA
                          </div>
                          <div className="text-sm text-slate-600 mt-1">Reste à Payer</div>
                        </div>
                        <div className="bg-white border-2 border-slate-200 rounded-lg p-4">
                          <div className="text-2xl font-bold text-slate-900">
                            {stats.orderCount}
                          </div>
                          <div className="text-sm text-slate-600 mt-1">Commandes</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
