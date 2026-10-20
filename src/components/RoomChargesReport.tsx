'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Hotel, FileText, Printer, DollarSign } from 'lucide-react';

interface Props {
  siteId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function RoomChargesReport({ siteId, isOpen, onClose }: Props) {
  const supabase = createClient();
  const [charges, setCharges] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (isOpen) loadCharges();
  }, [isOpen, dateFrom, dateTo]);

  const loadCharges = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('room_charges')
      .select(`
        *,
        stays(
          check_in_at, check_out_at, status, folio_balance,
          rooms(number),
          customers(first_name, last_name)
        )
      `)
      .eq('site_id', siteId)
      .eq('is_voided', false)
      .gte('charge_date', dateFrom)
      .lte('charge_date', dateTo)
      .order('charge_date', { ascending: false });

    if (data) setCharges(data);
    setLoading(false);
  };

  const handlePrint = () => {
    const totalAmount = charges.reduce((sum, c) => sum + Number(c.amount), 0);
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Rapport Imputations Chambres</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            h1 { color: #1e3a8a; border-bottom: 3px solid #1e3a8a; padding-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #1e3a8a; color: white; padding: 10px; text-align: left; }
            td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
            .total { font-weight: bold; background: #f1f5f9; }
            .header-info { margin: 20px 0; padding: 15px; background: #f8fafc; border-radius: 8px; }
            @media print { body { margin: 20px; } }
          </style>
        </head>
        <body>
          <h1>🏨 Rapport des Imputations Chambres</h1>
          <div class="header-info">
            <strong>Période :</strong> ${new Date(dateFrom).toLocaleDateString('fr-FR')} au ${new Date(dateTo).toLocaleDateString('fr-FR')}<br>
            <strong>Total imputations :</strong> ${charges.length}<br>
            <strong>Montant total :</strong> ${totalAmount.toLocaleString('fr-FR')} F
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Chambre</th>
                <th>Client</th>
                <th>Description</th>
                <th>Montant</th>
              </tr>
            </thead>
            <tbody>
              ${charges.map(c => `
                <tr>
                  <td>${new Date(c.charge_date).toLocaleDateString('fr-FR')}</td>
                  <td>${c.stays?.rooms?.number || '-'}</td>
                  <td>${c.stays?.customers?.first_name} ${c.stays?.customers?.last_name}</td>
                  <td>${c.description}</td>
                  <td>${Number(c.amount).toLocaleString('fr-FR')} F</td>
                </tr>
              `).join('')}
              <tr class="total">
                <td colspan="4">TOTAL</td>
                <td>${totalAmount.toLocaleString('fr-FR')} F</td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-700 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Hotel className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-bold">Rapport Imputations Chambres</h2>
              <p className="text-xs text-indigo-100">Toutes les charges restaurant/bar sur les folios</p>
            </div>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex gap-3 bg-slate-50 p-3 rounded-lg">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Du</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border border-slate-300 rounded px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Au</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border border-slate-300 rounded px-2 py-1 text-sm" />
            </div>
            <div className="flex-1" />
            <button onClick={handlePrint} className="bg-slate-700 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
              <Printer className="w-4 h-4" /> Imprimer
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-indigo-50 border-2 border-indigo-200 rounded-lg p-4">
              <div className="text-xs font-medium text-indigo-700">Total imputations</div>
              <div className="text-2xl font-bold text-indigo-900">{charges.length}</div>
            </div>
            <div className="bg-emerald-50 border-2 border-emerald-200 rounded-lg p-4">
              <div className="text-xs font-medium text-emerald-700">Montant total</div>
              <div className="text-2xl font-bold text-emerald-900">
                {Number(charges.reduce((sum, c) => sum + Number(c.amount), 0)).toLocaleString('fr-FR')} F
              </div>
            </div>
            <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4">
              <div className="text-xs font-medium text-amber-700">Chambres concernées</div>
              <div className="text-2xl font-bold text-amber-900">
                {new Set(charges.map(c => c.stays?.rooms?.id)).size}
              </div>
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Chambre</th>
                  <th className="px-3 py-2 text-left">Client</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-right">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {charges.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2">{new Date(c.charge_date).toLocaleDateString('fr-FR')}</td>
                    <td className="px-3 py-2 font-semibold">{c.stays?.rooms?.number}</td>
                    <td className="px-3 py-2">{c.stays?.customers?.first_name} {c.stays?.customers?.last_name}</td>
                    <td className="px-3 py-2 text-xs">{c.description}</td>
                    <td className="px-3 py-2 text-right font-bold">{Number(c.amount).toLocaleString('fr-FR')} F</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
