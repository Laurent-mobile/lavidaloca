'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import RoomServiceModal from '@/components/RoomServiceModal';
import { Utensils } from 'lucide-react';

export default function RoomServicePage() {
  const supabase = createClient();
  const [siteId, setSiteId] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('site_id').eq('id', user.id).maybeSingle();
        if (profile?.site_id) {
          setSiteId(profile.site_id);
          setIsOpen(true);
        }
      }
    };
    init();
  }, []);

  if (!siteId) return null;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Utensils className="w-7 h-7 text-indigo-600" /> Room Service
          </h1>
          <p className="text-sm text-slate-500 mt-1">Commandes directes en chambre</p>
        </div>
        <button onClick={() => setIsOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
          Nouvelle commande
        </button>
      </div>

      <RoomServiceModal siteId={siteId} isOpen={isOpen} onClose={() => setIsOpen(false)} onSuccess={() => {}} />
    </div>
  );
}
