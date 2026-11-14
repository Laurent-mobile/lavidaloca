'use client';
import { useState } from 'react';
import { useProfile } from '@/hooks/useHotel';
import DailyReportModal from '@/components/DailyReportModal';
import RoomChargesReport from '@/components/RoomChargesReport';
import { FileText, Hotel, Loader2 } from 'lucide-react';

export default function RapportsPage() {
  const { siteId, loading } = useProfile();
  const [open, setOpen] = useState<'none' | 'daily' | 'charges'>('none');
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-indigo-600 animate-spin" /></div>;
  if (!siteId) return null;
  return (
    <div className="p-6 space-y-4">
      <div><h1 className="text-2xl font-bold text-slate-900">📊 Rapports</h1><p className="text-sm text-slate-500 mt-1">Clôture et imputations</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button onClick={() => setOpen('daily')} className="bg-white border-2 border-slate-200 hover:border-indigo-400 rounded-xl p-6 text-left transition">
          <FileText className="w-8 h-8 text-indigo-600 mb-2" /><div className="font-bold text-slate-900">Rapport de fin de journée</div><div className="text-sm text-slate-500 mt-1">Clôture de caisse et résumé financier</div></button>
        <button onClick={() => setOpen('charges')} className="bg-white border-2 border-slate-200 hover:border-indigo-400 rounded-xl p-6 text-left transition">
          <Hotel className="w-8 h-8 text-purple-600 mb-2" /><div className="font-bold text-slate-900">Imputations chambres</div><div className="text-sm text-slate-500 mt-1">Charges restaurant/bar sur les folios</div></button>
      </div>
      <DailyReportModal siteId={siteId} isOpen={open === 'daily'} onClose={() => setOpen('none')} onSuccess={() => {}} />
      <RoomChargesReport siteId={siteId} isOpen={open === 'charges'} onClose={() => setOpen('none')} />
    </div>
  );
}
