'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useHotelRooms } from '@/hooks/useHotel';
import MaintenanceModal from '@/components/MaintenanceModal';
import { Loader2 } from 'lucide-react';

export default function MaintenancePage() {
  const { siteId, loading, rooms, refresh } = useHotelRooms();
  const router = useRouter();
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-indigo-600 animate-spin" /></div>;
  if (!siteId) return null;
  return <MaintenanceModal siteId={siteId} rooms={rooms} isOpen onClose={() => router.push('/')} onSuccess={refresh} />;
}