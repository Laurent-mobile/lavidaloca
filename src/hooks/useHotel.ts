'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export function useProfile() {
  const supabase = createClient();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // 1. On récupère le profil SANS la relation pour éviter l'erreur 400
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();
          
          if (error) {
            console.error('❌ Erreur chargement profil:', error);
          }
          
          if (data) {
            // 2. Si on a un site_id, on va chercher les infos du site séparément
            let siteData = null;
            if (data.site_id) {
              const { data: site } = await supabase
                .from('sites')
                .select('id, name, code')
                .eq('id', data.site_id)
                .maybeSingle();
              siteData = site;
            }
            
            setProfile({ 
              ...data, 
              email: user.email,
              sites: siteData 
            });
          }
        }
      } catch (err) {
        console.error('❌ Erreur useProfile:', err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const siteId = profile?.site_id || profile?.sites?.id || '';
  const role = profile?.role || '';
  
  return { profile, siteId, role, loading };
}

export function useHotelRooms() {
  const { siteId, loading: siteLoading } = useProfile();
  const supabase = createClient();
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const refresh = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    const { data } = await supabase
      .from('rooms')
      .select('id, number, floor, status, category_id, out_of_order_reason, room_categories (code, name, base_price)')
      .eq('site_id', siteId)
      .order('number');
    setRooms(data || []);
    setLoading(false);
  }, [siteId]);

  useEffect(() => { 
    if (siteId) refresh(); 
  }, [siteId, refresh]);

  return { siteId, loading: siteLoading || loading, rooms, refresh };
}
