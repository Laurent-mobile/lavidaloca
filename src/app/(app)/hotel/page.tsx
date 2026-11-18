'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useProfile } from '@/hooks/useHotel';
import {
  Bed, Bath, Users, AlertCircle, Plus, Loader2,
  Clock, LogIn, Bell, Wrench, Settings, Building2, Calendar, CheckCircle
} from 'lucide-react';
import ReservationModal from '@/components/ReservationModal';
import RoomActionModal from '@/components/RoomActionModal';
import WaitlistModal from '@/components/WaitlistModal';
import WaitlistAlert from '@/components/WaitlistAlert';
import MaintenanceModal from '@/components/MaintenanceModal';
import AdminModal from '@/components/AdminModal';
//import RoomServiceModal from '@/components/RoomServiceModal';
import CashierModal from '@/components/CashierModal';

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  VACANT: { label: 'Libre', color: 'bg-emerald-100 border-emerald-400 text-emerald-900', icon: Bed },
  RESERVED: { label: 'Réservée', color: 'bg-amber-100 border-amber-400 text-amber-900', icon: Bed },
  OCCUPIED: { label: 'Occupée', color: 'bg-blue-100 border-blue-400 text-blue-900', icon: Users },
  DIRTY: { label: 'À nettoyer', color: 'bg-orange-100 border-orange-400 text-orange-900', icon: Bath },
  OUT_OF_ORDER: { label: 'Hors service', color: 'bg-red-100 border-red-400 text-red-900', icon: AlertCircle },
};

export default function ChambresPage() {
  const supabase = createClient();
  const { siteId: profileSiteId, loading: profileLoading } = useProfile();
  const [rooms, setRooms] = useState<any[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [upcomingReservations, setUpcomingReservations] = useState<any[]>([]);
  const [activeStays, setActiveStays] = useState<any[]>([]);   // ✅ source de vérité
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<any>(null);
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);
  const [waitlistCount, setWaitlistCount] = useState(0);
  const [showWaitlistAlert, setShowWaitlistAlert] = useState(false);
  const [isMaintenanceOpen, setIsMaintenanceOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [maintenanceRoomId, setMaintenanceRoomId] = useState<string | undefined>();
  const [isCashOpen, setIsCashOpen] = useState(false);
  const [isRoomServiceOpen, setIsRoomServiceOpen] = useState(false);

  useEffect(() => {
    if (profileSiteId) loadData();
  }, [profileSiteId, refreshKey]);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Chambres + stats
      const { data: roomsData } = await supabase
        .from('rooms')
        .select('id, number, floor, status, category_id, out_of_order_reason, room_categories (code, name, base_price)')
        .eq('site_id', profileSiteId)
        .order('number', { ascending: true });
      if (roomsData) {
        setRooms(roomsData);
        const s = roomsData.reduce((acc: any, r: any) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
        setStats(s);
      }

    // 2. ✅ EN SÉJOUR = séjours IN_HOUSE liés aux chambres du site
// (on passe par room_id, car stays.site_id peut être NULL)
const { data: staysData } = await supabase
  .from('stays')
  .select(`
    id, room_id, reservation_id, customer_id, check_in_at, folio_balance, nightly_rate,
    rooms (id, number, site_id),
    customers (first_name, last_name, phone),
    reservations (number, check_in_date, check_out_date)
  `)
  .eq('status', 'IN_HOUSE')
  .eq('rooms.site_id', profileSiteId)
  .order('check_in_at', { ascending: false });

const normalizedStays = (staysData || []).map((s: any) => ({
  ...s,
  rooms: Array.isArray(s.rooms) ? s.rooms[0] : s.rooms,
  customers: Array.isArray(s.customers) ? s.customers[0] : s.customers,
  reservations: Array.isArray(s.reservations) ? s.reservations[0] : s.reservations,
}));
setActiveStays(normalizedStays);

      // 3. Réservations À VENIR (confirmees, pas encore check-in)
      const today = new Date().toISOString().split('T')[0];
      const { data: resData } = await supabase
        .from('reservations')
        .select('id, number, check_in_date, check_out_date, status, nightly_rate, customers (first_name, last_name, phone), rooms (number), room_categories (code, name)')
        .eq('site_id', profileSiteId)
        .eq('status', 'CONFIRMED')
        .gte('check_in_date', today)
        .order('check_in_date', { ascending: true });
      if (resData) setUpcomingReservations(resData);

      // 4. Liste d'attente
      const { count } = await supabase
        .from('waitlist')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', profileSiteId)
        .eq('status', 'WAITING');
      if (count !== null) setWaitlistCount(count);
    } catch (err) {
      console.error('Erreur chargement:', err);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Synchronisation chambres <-> séjours en un clic
  const [syncing, setSyncing] = useState(false);
  const syncRooms = async () => {
    if (!confirm('Synchroniser le statut des chambres avec les séjours actifs ?')) return;
    setSyncing(true);
    try {
      const stayRoomIds = activeStays.map(s => s.room_id).filter(Boolean);
      // chambres à passer OCCUPIED
      for (const rid of stayRoomIds) {
        await supabase.from('rooms').update({ status: 'OCCUPIED' }).eq('id', rid);
      }
      // chambres OCCUPIED sans séjour -> DIRTY (à nettoyer)
      const { data: occupied } = await supabase
        .from('rooms').select('id').eq('site_id', profileSiteId).eq('status', 'OCCUPIED');
      for (const r of (occupied || [])) {
        if (!stayRoomIds.includes(r.id)) {
          await supabase.from('rooms').update({ status: 'DIRTY' }).eq('id', r.id);
        }
      }
      alert('✅ Synchronisation terminée');
      setRefreshKey(k => k + 1);
    } catch (e) { console.error(e); }
    setSyncing(false);
  };

  if (profileLoading || loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }
  if (!profileSiteId) return null;

  const total = rooms.length;
  const occupied = stats.OCCUPIED || 0;
  const occRate = total ? Math.round((occupied / total) * 100) : 0;
  const desync = activeStays.length !== occupied;

  const byFloor = rooms.reduce((acc: any, room: any) => {
    const floor = room.floor || 0;
    if (!acc[floor]) acc[floor] = [];
    acc[floor].push(room);
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">🚪 Chambres</h1>
          <p className="text-sm text-slate-500 mt-1">Plan de l'hôtel — {total} chambre(s)</p>
        </div>
        <div className="flex gap-2 flex-wrap">
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

      {/* ⚠️ Alerte de désynchronisation */}
      {desync && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-amber-900">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <span><b>{activeStays.length}</b> séjour(s) actif(s) ≠ <b>{occupied}</b> chambre(s) marquée(s) occupée(s).</span>
          </div>
          <button onClick={syncRooms} disabled={syncing} className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 flex items-center gap-1">
            {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
            Synchroniser
          </button>
        </div>
      )}

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

      {/* Plan + colonne droite */}
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
                      className={`rounded-lg border-2 p-2 text-left hover:shadow-md transition-all cursor-pointer relative ${cfg.color}`}
                    >
                      {room.status === 'OUT_OF_ORDER' && <div className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">🔧</div>}
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-base font-bold">{room.number}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/60 font-semibold">{room.room_categories?.code}</span>
                      </div>
                      <div className="text-[10px] opacity-80">{cfg.label}</div>
                      <div className="text-[10px] mt-1 font-semibold">{Number(room.room_categories?.base_price || 0).toLocaleString('fr-FR')} fcfa</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Colonne droite */}
        <div className="space-y-4">
          {/* À venir */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
            <div className="bg-amber-100 px-3 py-2 border-b border-amber-200">
              <h3 className="font-semibold text-amber-900 text-sm">📅 Réservations à venir ({upcomingReservations.length})</h3>
            </div>
            <div className="p-2 space-y-2 max-h-60 overflow-y-auto">
              {upcomingReservations.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">Aucune réservation à venir</p>
              ) : (
                upcomingReservations.map((res: any) => (
                  <div key={res.id} className="p-2 rounded-lg border border-amber-200 bg-amber-50">
                    <div className="font-bold text-xs">{res.number}</div>
                    <div className="text-xs">👤 {res.customers?.last_name} {res.customers?.first_name}</div>
                    {res.rooms?.number && <div className="text-[10px] font-semibold text-amber-700">🚪 Ch. {res.rooms.number}</div>}
                    <div className="text-[10px] text-amber-600 mt-0.5">📅 {res.check_in_date} → {res.check_out_date}</div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ✅ EN SÉJOUR = séjours IN_HOUSE */}
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
            <div className="bg-blue-100 px-3 py-2 border-b border-blue-200">
              <h3 className="font-semibold text-blue-900 text-sm">🔑 En séjour ({activeStays.length})</h3>
            </div>
            <div className="p-2 space-y-2 max-h-72 overflow-y-auto">
              {activeStays.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">Aucun client en séjour</p>
              ) : (
                activeStays.map((stay: any) => (
                  <div key={stay.id} className="p-2 rounded-lg border border-blue-200 bg-blue-50">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-xs text-slate-900">🚪 Ch. {stay.rooms?.number || '—'}</div>
                      {stay.reservations?.number && <span className="text-[10px] text-blue-700">{stay.reservations.number}</span>}
                    </div>
                    <div className="text-xs mt-0.5">👤 {stay.customers?.last_name} {stay.customers?.first_name}</div>
                    <div className="text-[10px] text-slate-600 mt-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Depuis le {new Date(stay.check_in_at).toLocaleDateString('fr-FR')}
                    </div>
                    <div className="text-[10px] font-semibold text-blue-800 mt-1">
                      Folio : {Number(stay.folio_balance || 0).toLocaleString('fr-FR')} fcfa
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <ReservationModal siteId={profileSiteId} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSuccess={() => setRefreshKey(k => k + 1)} />
      <RoomActionModal siteId={profileSiteId} room={selectedRoom} isOpen={isRoomModalOpen} onClose={() => setIsRoomModalOpen(false)} onSuccess={() => setRefreshKey(k => k + 1)} />
      <WaitlistModal siteId={profileSiteId} isOpen={isWaitlistOpen} onClose={() => setIsWaitlistOpen(false)} onSuccess={() => setRefreshKey(k => k + 1)} />
      <WaitlistAlert siteId={profileSiteId} isOpen={showWaitlistAlert} onClose={() => setShowWaitlistAlert(false)} onSuccess={() => setRefreshKey(k => k + 1)} />
      <MaintenanceModal siteId={profileSiteId} rooms={rooms} isOpen={isMaintenanceOpen} onClose={() => setIsMaintenanceOpen(false)} onSuccess={() => setRefreshKey(k => k + 1)} preselectRoomId={maintenanceRoomId} />
      <AdminModal siteId={profileSiteId} isOpen={isAdminOpen} onClose={() => setIsAdminOpen(false)} onSuccess={() => setRefreshKey(k => k + 1)} />
      <CashierModal siteId={profileSiteId} isOpen={isCashOpen} onClose={() => setIsCashOpen(false)} onSuccess={() => setRefreshKey(k => k + 1)} />
      
    </div>
  );
}
