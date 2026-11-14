'use client';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/hooks/useHotel';
import CashRegisterModal from '@/components/CashRegisterModal';
import { Loader2 } from 'lucide-react';

export default function DepensesHotelPage() {
  const { siteId, loading } = useProfile();
  const router = useRouter();
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-indigo-600 animate-spin" /></div>;
  if (!siteId) return null;
  return <CashRegisterModal siteId={siteId} isOpen onClose={() => router.push('/')} onSuccess={() => {}} />;
}
