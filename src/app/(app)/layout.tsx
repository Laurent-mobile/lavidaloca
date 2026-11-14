'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import UnifiedSidebar from '@/components/UnifiedSidebar';
import { useProfile } from '@/hooks/useHotel'; // ✅ On utilise le hook sécurisé
import type { UserRole } from '@/lib/permissions';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const supabase = createClient();
  
  // ✅ On récupère les données via le hook qui évite les jointures problématiques
  const { profile, siteId, role, loading } = useProfile();

  useEffect(() => {
    if (!loading && !profile) {
      router.push('/login');
    }
  }, [loading, profile, router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!profile) {
    return null; // La redirection est gérée par le useEffect ci-dessus
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <UnifiedSidebar
        role={(role as UserRole) || 'RECEPTIONIST'}
        siteName={profile.sites?.name || 'Site'}
        userEmail={profile.email || ''}
        onLogout={handleLogout}
      />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
