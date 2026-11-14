'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Bed, Bath, Users, AlertCircle, Plus, Loader2,
  Clock, LogIn, Bell, Wrench, Settings, Building2
} from 'lucide-react';
import ReservationModal from '@/components/ReservationModal';
import RoomActionModal from '@/components/RoomActionModal';
import WaitlistModal from '@/components/WaitlistModal';
import WaitlistAlert from '@/components/WaitlistAlert';
import MaintenanceModal from '@/components/MaintenanceModal';
import AdminModal from '@/components/AdminModal';
import RoomServiceModal from '@/components/RoomServiceModal';
import CashierModal from '@/components/CashierModal';


const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  VACANT: { label: 'Libre', color: 'bg-emerald-100 border-emerald-400 text-emerald-900', icon: Bed },
  RESERVED: { label: 'Réservée', color: 'bg-amber-100 border-amber-400 text-amber-900', icon: Bed },
  OCCUPIED: { label: 'Occupée', color: 'bg-blue-100 border-blue-400 text-blue-900', icon: Users },
  DIRTY: { label: 'À nettoyer', color: 'bg-orange-100 border-orange-400 text-orange-900', icon: Bath },
  OUT_OF_ORDER: { label: 'Hors service', color: 'bg-red-100 border-red-400 text-red-900', icon: AlertCircle },
};

export default function HotelDashboard() {
  const supabase = createClient();
  const [profile, setProfile] = useState<any>(null);
  const [rooms, setRooms] = useState<any[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [reservations, setReservations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<any>(null);
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);
  const [waitlistCount, setWaitlistCount] = useState(0);
  const [showWaitlistAlert, setShowWaitlistAlert] = useState(false);
  const [waitlistMatchesCount, setWaitlistMatchesCount] = useState(0);
  const [isMaintenanceOpen, setIsMaintenanceOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [maintenanceRoomId, setMaintenanceRoomId] = useState<string | undefined>();
  const [isCashOpen, setIsCashOpen] = useState(false);
  const [isRoomServiceOpen, setIsRoomServiceOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, [refreshKey]);

  const loadData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*, sites(id, name, code)')
      .eq('id', user.id)
      .single();
    if (!profileData) { setLoading(false); return; }
    setProfile(profileData);
    const siteId = profileData.sites.id;

    const { data: roomsData } = await supabase
      .from('rooms')
      .select('id, number, floor, status, room_categories (code, name, base_price)')
      .eq('site_id', siteId)
      .order('number', { ascending: true });
    if (roomsData) {
      setRooms(roomsData);
      const s = roomsData.reduce((acc: any, r: any) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
      setStats(s);
    }

    const { data: reservationsData } = await supabase
      .from('reservations')
      .select('id, number, check_in_date, check_out_date, status, nightly_rate, customers (first_name, last_name, phone), room_id, room_categories (code, name), rooms (number)')
      .eq('site_id', siteId)
      .in('status', ['CONFIRMED', 'CHECKED_IN'])
      .order('check_in_date', { ascending: true });
    if (reservationsData) setReservations(reservationsData);

    const { count } = await supabase.from('waitlist').select('*', { count: 'exact', head: true }).eq('site_id', siteId).eq('status', 'WAITING');
    if (count !== null) setWaitlistCount(count);

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (!profile) return null;

  const siteId = profile.sites.id;
  const total = rooms.length;
  const occupied = stats.OCCUPIED || 0;
  const occRate = total ? Math.round((occupied / total) * 100) : 0;

  const byFloor = rooms.reduce((acc: any, room: any) => {
    const floor = room.floor || 0;
    if (!acc[floor]) acc[floor] = [];
    acc[floor].push(room);
    return acc;
  }, {});

  const upcomingReservations = reservations.filter(r => r.status === 'CONFIRMED');
  const currentStays = reservations.filter(r => r.status === 'CHECKED_IN');

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">🏨 Tableau de bord Hôtel</h1>
          <p className="text-sm text-slate-500 mt-1">Vue d'ensemble des chambres et séjours</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setIsWaitlistOpen(true)} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-lg text-sm font-medium relative">
            <Clock className="w-4 h-4" />
            <span className="hidden sm:inline">Liste d'attente</span>
            {waitlistCount > 0 && <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">{waitlistCount}</span>}
          </button>
          <button onClick={() => setIsRoomServiceOpen(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg text-sm font-medium">
            <Building2 className="w-4 h-4" /> Room Service
          </button>
          <button onClick={() => setIsCashOpen(true)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-sm font-medium">
            <Bed className="w-4 h-4" /> Caisse
          </button>
          <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-indigo-900 px-3 py-2 rounded-lg text-sm font-bold">
            <Plus className="w-4 h-4" /> Nouvelle Réservation
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Object.entries(statusConfig).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <div key={key} className={`rounded-lg border-2 p-3 ${cfg.color}`}>
              <div className="flex items-center justify-between">
                <Icon className="w-5 h-5" />
                <span className="text-2xl font-bold">{stats[key] || 0}</span>
              </div>
              <div className="text-xs mt-1">{cfg.label}</div>
            </div>
          );
        })}
      </div>

      {/* Taux d'occupation */}
      <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-slate-700">Taux d'occupation</span>
          <span className="text-xl font-bold text-slate-900">{occRate}%</span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-2.5">
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2.5 rounded-full" style={{ width: `${occRate}%` }} />
        </div>
      </div>

      {/* Plan des chambres */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {Object.keys(byFloor).sort().map((floor: string) => (
            <div key={floor} className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
              <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-200">
                <h3 className="font-semibold text-slate-800 text-sm">Étage {floor}</h3>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 p-3">
                {byFloor[floor].map((room: any) => {
                  const cfg = statusConfig[room.status] || statusConfig.VACANT;
                  return (
                    <button
                      key={room.id}
                      onClick={() => { setSelectedRoom(room); setIsRoomModalOpen(true); }}
                      onContextMenu={(e) => { e.preventDefault(); setMaintenanceRoomId(room.id); setIsMaintenanceOpen(true); }}
                      className={`rounded-lg border-2 p-2 text-left hover:shadow-md transition-all cursor-pointer relative group ${cfg.color}`}
                    >
                      {room.status === 'OUT_OF_ORDER' && <div className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">🔧</div>}
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-base font-bold">{room.number}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/60 font-semibold">{room.room_categories?.code}</span>
                      </div>
                      <div className="text-[10px] opacity-80">{cfg.label}</div>
                      <div className="text-[10px] mt-1 font-semibold">{Number(room.room_categories?.base_price || 0).toLocaleString("fr-FR")} F</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Colonne droite : séjours */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
            <div className="bg-amber-100 px-3 py-2 border-b border-amber-200">
              <h3 className="font-semibold text-amber-900 text-sm">📅 Réservations ({upcomingReservations.length})</h3>
            </div>
            <div className="p-2 space-y-2 max-h-64 overflow-y-auto">
              {upcomingReservations.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">Aucune réservation</p>
              ) : (
                upcomingReservations.map((res: any) => (
                  <div key={res.id} className="p-2 rounded-lg border border-amber-200 bg-amber-50">
                    <div className="font-bold text-xs">{res.number}</div>
                    <div className="text-xs">👤 {res.customers?.last_name} {res.customers?.first_name}</div>
                    {res.rooms?.number && <div className="text-[10px] font-semibold text-amber-700">🚪 Ch. {res.rooms.number}</div>}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
            <div className="bg-blue-100 px-3 py-2 border-b border-blue-200">
              <h3 className="font-semibold text-blue-900 text-sm">🔑 En séjour ({currentStays.length})</h3>
            </div>
            <div className="p-2 space-y-2 max-h-64 overflow-y-auto">
              {currentStays.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">Aucun client</p>
              ) : (
                currentStays.map((res: any) => (
                  <div key={res.id} className="p-2 rounded-lg border border-blue-200 bg-blue-50">
                    <div className="font-bold text-xs">{res.number}</div>
                    <div className="text-xs">👤 {res.customers?.last_name} {res.customers?.first_name}</div>
                    {res.rooms?.number && <div className="text-[10px] font-semibold text-blue-700">🚪 Ch. {res.rooms.number}</div>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <ReservationModal siteId={siteId} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSuccess={() => setRefreshKey(k => k + 1)} />
      <RoomActionModal siteId={siteId} room={selectedRoom} isOpen={isRoomModalOpen} onClose={() => setIsRoomModalOpen(false)} onSuccess={() => setRefreshKey(k => k + 1)} />
      <WaitlistModal siteId={siteId} isOpen={isWaitlistOpen} onClose={() => setIsWaitlistOpen(false)} onSuccess={() => setRefreshKey(k => k + 1)} />
      <WaitlistAlert siteId={siteId} isOpen={showWaitlistAlert} onClose={() => setShowWaitlistAlert(false)} onSuccess={() => setRefreshKey(k => k + 1)} />
      <MaintenanceModal siteId={siteId} rooms={rooms} isOpen={isMaintenanceOpen} onClose={() => setIsMaintenanceOpen(false)} onSuccess={() => setRefreshKey(k => k + 1)} preselectRoomId={maintenanceRoomId} />
      <AdminModal siteId={siteId} isOpen={isAdminOpen} onClose={() => setIsAdminOpen(false)} onSuccess={() => setRefreshKey(k => k + 1)} />
      <CashierModal siteId={siteId} isOpen={isCashOpen} onClose={() => setIsCashOpen(false)} onSuccess={() => setRefreshKey(k => k + 1)} />
      <RoomServiceModal siteId={siteId} isOpen={isRoomServiceOpen} onClose={() => setIsRoomServiceOpen(false)} onSuccess={() => setRefreshKey(k => k + 1)} />
    </div>
  );
}
