'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Menu, Bell, LogOut } from 'lucide-react';
import Sidebar from '@/components/Sidebar';

export default function RestaurantLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const supabase = createClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [siteId, setSiteId] = useState<string>('');
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [kitchenOrdersCount, setKitchenOrdersCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserData();
    loadCounts();
    const interval = setInterval(loadCounts, 15000);
    return () => clearInterval(interval);
  }, []);

  const loadUserData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, full_name, role, site_id, is_active')
        .eq('id', user.id)
        .maybeSingle();

      if (profileData) {
        let finalProfile: any = { 
          ...profileData, 
          sites: { name: 'La Vida Loca' }, 
          restaurant_employees: { role: profileData.role } 
        };
        setSiteId(profileData.site_id || '');

        if (profileData.site_id) {
          const { data: siteData } = await supabase.from('sites').select('name').eq('id', profileData.site_id).maybeSingle();
          if (siteData) finalProfile.sites = { name: siteData.name };
        }

        try {
          const { data: empData } = await supabase.from('restaurant_employees').select('role').eq('id', user.id).maybeSingle();
          if (empData) finalProfile.restaurant_employees = { role: empData.role };
        } catch (e) {}

        setProfile(finalProfile);
      }
    } catch (error) {
      console.error('Erreur chargement utilisateur:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCounts = async () => {
    try {
      if (!siteId) return;
      const { count: pendingCount } = await supabase.from('restaurant_orders').select('*', { count: 'exact', head: true }).eq('site_id', siteId).eq('status', 'READY');
      setPendingOrdersCount(pendingCount || 0);

      const { count: kitchenCount } = await supabase.from('restaurant_orders').select('*', { count: 'exact', head: true }).eq('site_id', siteId).in('status', ['SENT', 'PREPARING']);
      setKitchenOrdersCount(kitchenCount || 0);
    } catch (error) {
      console.error('Erreur chargement compteurs:', error);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const userRole = profile?.restaurant_employees?.role || profile?.role || 'SERVER';
  const userName = profile?.full_name || user?.email || 'Utilisateur';
  const siteName = profile?.sites?.name || 'La Vida Loca';

  // ✅ STRUCTURE RACINE TOUJOURS IDENTIQUE (Pas de return anticipé)
  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar
        userRole={userRole}
        userName={userName}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        pendingOrdersCount={pendingOrdersCount}
        kitchenOrdersCount={kitchenOrdersCount}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-slate-600 hover:text-slate-900 p-2 rounded-lg hover:bg-slate-100">
              <Menu className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-slate-900">{siteName}</h1>
              <p className="text-xs text-slate-500 hidden sm:block">{userRole}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative text-slate-600 hover:text-slate-900 p-2 rounded-lg hover:bg-slate-100">
              <Bell className="w-5 h-5" />
              {(pendingOrdersCount + kitchenOrdersCount) > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                  {pendingOrdersCount + kitchenOrdersCount}
                </span>
              )}
            </button>
            <button onClick={handleLogout} className="flex items-center gap-2 text-sm text-slate-600 hover:text-red-600 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          {/* ✅ Le chargement est géré À L'INTÉRIEUR du main, la structure racine ne change pas */}
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-slate-600">Chargement de l'espace restaurant...</p>
              </div>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
