'use client';
import { useRouter } from 'next/navigation';
import { useHotelRooms } from '@/hooks/useHotel';
import NightAuditModal from '@/components/NightAuditModal';
import { Loader2 } from 'lucide-react';

export default function AuditPage() {
  const { siteId, loading, rooms, refresh } = useHotelRooms();
  const router = useRouter();
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-indigo-600 animate-spin" /></div>;
  if (!siteId) return null;
  return <NightAuditModal siteId={siteId} rooms={rooms} isOpen onClose={() => router.push('/')} onSuccess={refresh} />;
}
