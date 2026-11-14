'use client';
import { useState, useEffect } from 'react';
import { useProfile } from '@/hooks/useHotel';
import { createClient } from '@/lib/supabase/client';
import ReservationModal from '@/components/ReservationModal';
import WaitlistModal from '@/components/WaitlistModal';
import WaitlistAlert from '@/components/WaitlistAlert';
import { Plus, Clock, Zap, Loader2, Calendar } from 'lucide-react';

const statusBadge: Record<string, string> = {
  CONFIRMED: 'bg-amber-100 text-amber-900', CHECKED_IN: 'bg-blue-100 text-blue-900',
  CHECKED_OUT: 'bg-emerald-100 text-emerald-900', CANCELLED: 'bg-red-100 text-red-900',
  NO_SHOW: 'bg-slate-200 text-slate-700',
};

export default function ReservationsPage() {
  const { siteId, loading } = useProfile();
  const supabase = createClient();
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [isResaOpen, setIsResaOpen] = useState(false);
  const [isWaitOpen, setIsWaitOpen] = useState(false);
  const [isAlertOpen, setIsAlertOpen] = useState(false);

  const load = async () => {
    if (!siteId) return;
    const { data } = await supabase.from('reservations')
      .select('id, number, check_in_date, check_out_date, status, total_amount, nightly_rate, adults, children, customers(first_name, last_name, phone), rooms(number), room_categories(code, name)')
      .eq('site_id', siteId).order('check_in_date', { ascending: false }).limit(300);
    setRows(data || []);
  };
  useEffect(() => { if (siteId) load(); }, [siteId]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-indigo-600 animate-spin" /></div>;
  if (!siteId) return null;

  const filtered = rows.filter(r =>
    (filter === 'ALL' || r.status === filter) &&
    (!search || `${r.number} ${r.customers?.first_name} ${r.customers?.last_name}`.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div><h1 className="text-2xl font-bold text-slate-900">📅 Réservations</h1><p className="text-sm text-slate-500 mt-1">{rows.length} réservation(s)</p></div>
        <div className="flex gap-2">
          <button onClick={() => setIsAlertOpen(true)} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg text-sm font-medium"><Zap className="w-4 h-4" /> Correspondances</button>
          <button onClick={() => setIsWaitOpen(true)} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-lg text-sm font-medium"><Clock className="w-4 h-4" /> Liste d'attente</button>
          <button onClick={() => setIsResaOpen(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg text-sm font-bold"><Plus className="w-4 h-4" /> Nouvelle réservation</button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher (n° ou client)..." className="border border-slate-300 rounded px-3 py-1.5 text-sm" />
        {['ALL', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'].map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1 rounded text-xs font-medium ${filter === s ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-300 text-slate-700'}`}>{s === 'ALL' ? 'Toutes' : s}</button>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>
            <th className="px-4 py-2 text-left">N°</th><th className="px-4 py-2 text-left">Client</th><th className="px-4 py-2 text-left">Chambre</th>
            <th className="px-4 py-2 text-left">Arrivée</th><th className="px-4 py-2 text-left">Départ</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2 text-center">Statut</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map(r => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-2 font-bold text-indigo-600">{r.number}</td>
                <td className="px-4 py-2">{r.customers?.last_name} {r.customers?.first_name}</td>
                <td className="px-4 py-2">{r.rooms?.number || r.room_categories?.code || '—'}</td>
                <td className="px-4 py-2"><Calendar className="w-3 h-3 inline mr-1" />{r.check_in_date}</td>
                <td className="px-4 py-2">{r.check_out_date}</td>
                <td className="px-4 py-2 text-right font-semibold">{Number(r.total_amount || 0).toLocaleString('fr-FR')} F</td>
                <td className="px-4 py-2 text-center"><span className={`text-xs px-2 py-0.5 rounded ${statusBadge[r.status] || 'bg-slate-100'}`}>{r.status}</span></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-slate-400">Aucune réservation</td></tr>}
          </tbody>
        </table>
      </div>

      <ReservationModal siteId={siteId} isOpen={isResaOpen} onClose={() => setIsResaOpen(false)} onSuccess={load} />
      <WaitlistModal siteId={siteId} isOpen={isWaitOpen} onClose={() => setIsWaitOpen(false)} onSuccess={load} />
      <WaitlistAlert siteId={siteId} isOpen={isAlertOpen} onClose={() => setIsAlertOpen(false)} onSuccess={load} />
    </div>
  );
}
