'use client';
import { useState, useEffect } from 'react';
import { useProfile } from '@/hooks/useHotel';
import { createClient } from '@/lib/supabase/client';
import CustomerHistoryModal from '@/components/CustomerHistoryModal';
import { Users, Search, Loader2, Award } from 'lucide-react';

export default function ClientsPage() {
  const { siteId, loading } = useProfile();
  const supabase = createClient();
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selId, setSelId] = useState('');

  useEffect(() => {
    if (!siteId) return;
    supabase.from('customers').select('id, first_name, last_name, phone, nationality, is_vip').eq('site_id', siteId).order('last_name').then(({ data }) => setRows(data || []));
  }, [siteId]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-indigo-600 animate-spin" /></div>;
  if (!siteId) return null;
  const filtered = rows.filter(r => !search || `${r.first_name} ${r.last_name} ${r.phone}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 space-y-4">
      <div><h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Users className="w-7 h-7 text-indigo-600" /> Clients</h1>
        <p className="text-sm text-slate-500 mt-1">{rows.length} client(s) — cliquez pour voir l'historique</p></div>
      <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un client..." className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm" /></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(c => (
          <button key={c.id} onClick={() => setSelId(c.id)} className="text-left bg-white border border-slate-200 rounded-lg p-4 hover:border-indigo-300 hover:shadow-sm transition">
            <div className="flex items-center gap-2"><span className="font-bold text-slate-900">{c.last_name} {c.first_name}</span>{c.is_vip && <span className="text-xs bg-purple-200 text-purple-900 px-1.5 py-0.5 rounded flex items-center gap-1"><Award className="w-3 h-3" /> VIP</span>}</div>
            <div className="text-xs text-slate-500 mt-1">📞 {c.phone || '—'} • 🌍 {c.nationality || '—'}</div>
          </button>
        ))}
      </div>
      {selId && <CustomerHistoryModal siteId={siteId} customerId={selId} isOpen={!!selId} onClose={() => setSelId('')} />}
    </div>
  );
}
