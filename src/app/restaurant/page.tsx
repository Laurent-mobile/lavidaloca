'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RestaurantRedirect() {
  const router = useRouter();

  useEffect(() => {
    // Redirige automatiquement vers le tableau de bord
    router.replace('/restaurant/dashboard');
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}
