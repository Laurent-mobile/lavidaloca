'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/hooks/useHotel';
import UserManagementModal from '@/components/UserManagementModal';
import { Loader2, Shield } from 'lucide-react';

export default function UtilisateursPage() {
  const { siteId, role, loading } = useProfile();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!loading && role !== 'DIRECTOR') {
      router.push('/');
    }
  }, [role, loading]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (!siteId) return null;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="w-7 h-7 text-purple-600" />
            Gestion des Utilisateurs
          </h1>
          <p className="text-sm text-slate-500 mt-1">Gérer les rôles et permissions</p>
        </div>
        <button
          onClick={() => setIsOpen(true)}
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          Ouvrir la gestion
        </button>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
        <Shield className="w-16 h-16 text-purple-300 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-slate-900 mb-2">Administration des utilisateurs</h2>
        <p className="text-sm text-slate-500 mb-4">
          Cliquez sur le bouton ci-dessus pour gérer les utilisateurs, leurs rôles et permissions.
        </p>
        <button
          onClick={() => setIsOpen(true)}
          className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-medium"
        >
          Gérer les utilisateurs
        </button>
      </div>

      <UserManagementModal
        siteId={siteId}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSuccess={() => {}}
      />
    </div>
  );
}
