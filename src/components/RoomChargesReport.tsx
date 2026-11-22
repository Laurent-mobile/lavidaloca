'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Hotel, FileText, Printer, DollarSign, Search, RotateCcw } from 'lucide-react';

interface Props {
  siteId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function RoomChargesReport({ siteId, isOpen, onClose }: Props) {
  const supabase = createClient();
  const [charges, setCharges] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Filtres
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [searchRoom, setSearchRoom] = useState('');
  const [searchClient, setSearchClient] = useState('');

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
          rooms(number, id),
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

  // ✅ Filtrage multicritère en temps réel
  const filteredCharges = useMemo(() => {
    return charges.filter(c => {
      const roomNumber = (c.stays?.rooms?.number || '').toLowerCase();
      const clientName = `${c.stays?.customers?.first_name || ''} ${c.stays?.customers?.last_name || ''}`.toLowerCase();
      
      const matchesRoom = roomNumber.includes(searchRoom.toLowerCase().trim());
      const matchesClient = clientName.includes(searchClient.toLowerCase().trim());
      
      return matchesRoom && matchesClient;
    });
  }, [charges, searchRoom, searchClient]);

  // ✅ Statistiques basées sur les données filtrées
  const stats = useMemo(() => {
    const totalAmount = filteredCharges.reduce((sum, c) => sum + Number(c.amount || 0), 0);
    const distinctRooms = new Set(filteredCharges.map(c => c.stays?.rooms?.id).filter(Boolean)).size;
    return { totalAmount, distinctRooms };
  }, [filteredCharges]);

  const handleReset = () => {
    setSearchRoom('');
    setSearchClient('');
    setDateFrom(new Date().toISOString().split('T')[0]);
    setDateTo(new Date().toISOString().split('T')[0]);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Rapport Imputations Chambres</title>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; margin: 30px; color: #1e293b; }
            h1 { color: #4f46e5; border-bottom: 3px solid #4f46e5; padding-bottom: 10px; font-size: 24px; }
            .header-info { margin: 20px 0; padding: 15px; background: #f8fafc; border-radius: 8px; border-left: 4px solid #4f46e5; }
            .header-info p { margin: 5px 0; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
            th { background: #4f46e5; color: white; padding: 10px; text-align: left; font-weight: 600; }
            td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
            tr:nth-child(even) { background: #f8fafc; }
            .total { font-weight: bold; background: #e0e7ff !important; font-size: 14px; }
            .amount { text-align: right; font-family: monospace; font-size: 14px; }
            @media print { body { margin: 15px; } .no-print { display: none; } }
          </style>
        </head>
        <body>
          <h1>🏨 Rapport des Imputations Chambres</h1>
          <div class="header-info">
            <p><strong>Période :</strong> ${new Date(dateFrom).toLocaleDateString('fr-FR')} au ${new Date(dateTo).toLocaleDateString('fr-FR')}</p>
            <p><strong>Filtres appliqués :</strong> ${searchRoom ? `Chambre: ${searchRoom}` : 'Toutes'} ${searchClient ? `| Client: ${searchClient}` : ''}</p>
            <p><strong>Total imputations :</strong> ${filteredCharges.length}</p>
            <p><strong>Montant total :</strong> <span style="color: #059669; font-weight: bold; font-size: 16px;">${stats.totalAmount.toLocaleString('fr-FR')} fcfa</span></p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Chambre</th>
                <th>Client</th>
                <th>Description</th>
                <th style="text-align: right;">Montant</th>
              </tr>
            </thead>
            <tbody>
              ${filteredCharges.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding: 20px; color: #64748b;">Aucune donnée pour ces critères</td></tr>' : ''}
              ${filteredCharges.map(c => `
                <tr>
                  <td>${new Date(c.charge_date).toLocaleDateString('fr-FR')}</td>
                  <td><strong>${c.stays?.rooms?.number || '-'}</strong></td>
                  <td>${c.stays?.customers?.first_name || ''} ${c.stays?.customers?.last_name || ''}</td>
                  <td>${c.description}</td>
                  <td class="amount">${Number(c.amount).toLocaleString('fr-FR')} fcfa</td>
                </tr>
              `).join('')}
              ${filteredCharges.length > 0 ? `
              <tr class="total">
                <td colspan="4" style="text-align: right;">TOTAL GÉNÉRAL</td>
                <td class="amount">${stats.totalAmount.toLocaleString('fr-FR')} fcfa</td>
              </tr>
              ` : ''}
            </tbody>
          </table>
          <div class="no-print" style="margin-top: 30px; text-align: center;">
            <button onclick="window.print()" style="padding: 10px 20px; background: #4f46e5; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">🖨️ Imprimer ce rapport</button>
            <button onclick="window.close()" style="padding: 10px 20px; background: #64748b; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; margin-left: 10px;">Fermer</button>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-700 text-white px-6 py-4 flex items-center justify-between rounded-t-xl flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Hotel className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Rapport Imputations Chambres</h2>
              <p className="text-xs text-indigo-100">Toutes les charges (Resto/Bar/Divers) sur les folios clients</p>
            </div>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenu scrollable */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          
          {/* Barre de filtres */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Du</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Au</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">🔍 Chambre</label>
              <input type="text" placeholder="Ex: 101, 205..." value={searchRoom} onChange={(e) => setSearchRoom(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">👤 Client</label>
              <input type="text" placeholder="Nom ou prénom..." value={searchClient} onChange={(e) => setSearchClient(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div className="flex items-end gap-2">
              <button onClick={handleReset} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-1 transition-colors" title="Réinitialiser les filtres">
                <RotateCcw className="w-4 h-4" /> Reset
              </button>
              <button onClick={handlePrint} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors shadow-sm">
                <Printer className="w-4 h-4" /> Imprimer
              </button>
            </div>
          </div>

          {/* Statistiques (basées sur les filtres) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-indigo-50 border-2 border-indigo-200 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Imputations trouvées</div>
                <div className="text-3xl font-bold text-indigo-900 mt-1">{filteredCharges.length}</div>
              </div>
              <FileText className="w-8 h-8 text-indigo-300" />
            </div>
            <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Montant total filtré</div>
                <div className="text-3xl font-bold text-emerald-900 mt-1">{stats.totalAmount.toLocaleString('fr-FR')} <span className="text-sm font-normal">fcfa</span></div>
              </div>
              <DollarSign className="w-8 h-8 text-emerald-300" />
            </div>
            <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Chambres concernées</div>
                <div className="text-3xl font-bold text-amber-900 mt-1">{stats.distinctRooms}</div>
              </div>
              <Hotel className="w-8 h-8 text-amber-300" />
            </div>
          </div>

          {/* Tableau des données */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            {loading ? (
              <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                <p>Chargement des données...</p>
              </div>
            ) : filteredCharges.length === 0 ? (
              <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-3">
                <Search className="w-12 h-12 text-slate-300" />
                <p className="font-medium">Aucune imputation ne correspond à vos critères de recherche.</p>
                <button onClick={handleReset} className="text-indigo-600 hover:underline text-sm">Réinitialiser les filtres</button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 text-slate-700 font-semibold uppercase text-xs tracking-wider">
                    <tr>
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3 text-left">Chambre</th>
                      <th className="px-4 py-3 text-left">Client</th>
                      <th className="px-4 py-3 text-left">Description</th>
                      <th className="px-4 py-3 text-right">Montant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredCharges.map(c => (
                      <tr key={c.id} className="hover:bg-indigo-50/50 transition-colors">
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{new Date(c.charge_date).toLocaleDateString('fr-FR')}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                            Ch. {c.stays?.rooms?.number || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {c.stays?.customers?.first_name} {c.stays?.customers?.last_name}
                        </td>
                        <td className="px-4 py-3 text-slate-600 max-w-xs truncate" title={c.description}>
                          {c.description}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900 font-mono">
                          {Number(c.amount).toLocaleString('fr-FR')} fcfa
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100 font-bold text-slate-900">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-right uppercase text-xs tracking-wider">Total Général</td>
                      <td className="px-4 py-3 text-right font-mono text-indigo-700 text-base">
                        {stats.totalAmount.toLocaleString('fr-FR')} fcfa
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
