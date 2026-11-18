'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useProfile } from '@/hooks/useHotel';
import ReservationModal from '@/components/ReservationModal';
import WaitlistModal from '@/components/WaitlistModal';
import WaitlistAlert from '@/components/WaitlistAlert';
import { Plus, Clock, Zap, Loader2, Calendar, Search, Filter } from 'lucide-react';
import ReservationDetailModal from '@/components/ReservationDetailModal';

// ✅ Traduction et styling des statuts
const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
  CONFIRMED: { label: 'Confirmée', color: 'bg-amber-100 text-amber-900 border-amber-200', icon: '📅' },
  CHECKED_IN: { label: 'En séjour', color: 'bg-blue-100 text-blue-900 border-blue-200', icon: '🔑' },
  CHECKED_OUT: { label: 'Parti(e)', color: 'bg-emerald-100 text-emerald-900 border-emerald-200', icon: '✅' },
  CANCELLED: { label: 'Annulée', color: 'bg-red-100 text-red-900 border-red-200', icon: '❌' },
  NO_SHOW: { label: 'Non présenté(e)', color: 'bg-slate-200 text-slate-700 border-slate-300', icon: '🚫' },
};

export default function ReservationsPage() {
  const { siteId, loading: profileLoading } = useProfile();
  const supabase = createClient();
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [isResaOpen, setIsResaOpen] = useState(false);
  const [isWaitOpen, setIsWaitOpen] = useState(false);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);

    const load = async () => {
    if (!siteId) return;
    setLoading(true);
    
    const today = new Date().toISOString().split('T')[0];
    
    // 1. Charger toutes les réservations
    const { data } = await supabase
      .from('reservations')
      .select('id, number, check_in_date, check_out_date, status, total_amount, nightly_rate, adults, children, room_id, customer_id, customers(first_name, last_name, phone), rooms(number), room_categories(code, name)')
      .eq('site_id', siteId)
      .order('check_in_date', { ascending: false })
      .limit(300);

    // 2. ✅ Auto-correction basée sur les séjours réels
    for (const res of (data || [])) {
      let newStatus = res.status;
      
      // Chercher un séjour lié à cette réservation
      const { data: stay } = await supabase
        .from('stays')
        .select('status')
        .eq('reservation_id', res.id)
        .limit(1)
        .maybeSingle();
      
      if (stay) {
        // Séjour trouvé → le statut de la réservation suit le séjour
        if (stay.status === 'IN_HOUSE') newStatus = 'CHECKED_IN';
        else if (stay.status === 'CHECKED_OUT') newStatus = 'CHECKED_OUT';
      } else if (res.status === 'CONFIRMED' && res.check_in_date < today) {
        // Pas de séjour + date passée → NO_SHOW
        newStatus = 'NO_SHOW';
      }
      
      if (newStatus !== res.status) {
        await supabase.from('reservations').update({ status: newStatus }).eq('id', res.id);
      }
    }

    // 3. Recharger les données corrigées
    const { data: correctedData } = await supabase
      .from('reservations')
      .select('id, number, check_in_date, check_out_date, status, total_amount, nightly_rate, adults, children, customers(first_name, last_name, phone), rooms(number), room_categories(code, name)')
      .eq('site_id', siteId)
      .order('check_in_date', { ascending: false })
      .limit(300);
    
    setRows(correctedData || []);
    setLoading(false);
  };

  useEffect(() => { if (siteId) load(); }, [siteId]);

  if (profileLoading || loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-indigo-600 animate-spin" /></div>;
  }
  if (!siteId) return null;

  const filtered = rows.filter(r =>
    (filter === 'ALL' || r.status === filter) &&
    (!search || `${r.number} ${r.customers?.first_name} ${r.customers?.last_name}`.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="p-6 space-y-6">
      {/* En-tête */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">📅 Réservations</h1>
          <p className="text-sm text-slate-500 mt-1">{rows.length} réservation(s) au total</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setIsAlertOpen(true)} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <Zap className="w-4 h-4" /> Correspondances
          </button>
          <button onClick={() => setIsWaitOpen(true)} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <Clock className="w-4 h-4" /> Liste d'attente
          </button>
          <button onClick={() => setIsResaOpen(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors">
            <Plus className="w-4 h-4" /> Nouvelle réservation
          </button>
        </div>
      </div>

      {/* Filtres et Recherche */}
      <div className="flex flex-col md:flex-row gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            placeholder="Rechercher par N° ou nom du client..." 
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" 
          />
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1 md:pb-0">
          {['ALL', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW'].map(s => (
  <button 
    key={s} 
    onClick={() => setFilter(s)} 
    className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
      filter === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    }`}
  >
    {s === 'ALL' ? 'Toutes' : statusConfig[s]?.label}
  </button>
))}
        </div>
      </div>

      {/* Tableau des réservations */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left">N° Résa</th>
                <th className="px-4 py-3 text-left">Client</th>
                <th className="px-4 py-3 text-left">Chambre</th>
                <th className="px-4 py-3 text-left">Dates</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-center">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(r => {
                const status = statusConfig[r.status] || statusConfig.CONFIRMED;
                return (
                  <tr key={r.id} onClick={() => setDetailId(r.id)} className="hover:bg-slate-50 transition-colors cursor-pointer">
                    <td className="px-4 py-3 font-bold text-indigo-600">{r.number}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{r.customers?.last_name} {r.customers?.first_name}</div>
                      <div className="text-xs text-slate-500">{r.customers?.phone || 'Pas de téléphone'}</div>
                    </td>
                    <td className="px-4 py-3">
                      {r.rooms?.number ? (
                        <span className="font-medium text-slate-900">Ch. {r.rooms.number}</span>
                      ) : (
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">{r.room_categories?.code || 'Non assignée'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{r.check_in_date}</span>
                      </div>
                      <div className="text-xs text-slate-500 ml-5">au {r.check_out_date}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">{Number(r.total_amount || 0).toLocaleString('fr-FR')} fcfa</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${status.color}`}>
                        <span>{status.icon}</span> {status.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    <Filter className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    Aucune réservation ne correspond à vos critères.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <ReservationModal siteId={siteId} isOpen={isResaOpen} onClose={() => setIsResaOpen(false)} onSuccess={load} />
      <WaitlistModal siteId={siteId} isOpen={isWaitOpen} onClose={() => setIsWaitOpen(false)} onSuccess={load} />
      <WaitlistAlert siteId={siteId} isOpen={isAlertOpen} onClose={() => setIsAlertOpen(false)} onSuccess={load} />

        <ReservationDetailModal
  siteId={siteId}
  reservationId={detailId}
  isOpen={!!detailId}
  onClose={() => setDetailId(null)}
  onSuccess={load}
/>
    </div>
  );
}
