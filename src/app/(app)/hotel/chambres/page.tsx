'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useProfile } from '@/hooks/useHotel';
import {
  Bed, Bath, Users, AlertCircle, Plus, Loader2,
  Clock, LogIn, Bell, Wrench, Settings, Building2, Calendar, CheckCircle, Edit, AlertTriangle
} from 'lucide-react';
import ReservationModal from '@/components/ReservationModal';
import RoomActionModal from '@/components/RoomActionModal';
import WaitlistModal from '@/components/WaitlistModal';
import WaitlistAlert from '@/components/WaitlistAlert';
import MaintenanceModal from '@/components/MaintenanceModal';
import AdminModal from '@/components/AdminModal';
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
  
  // ==========================================
  // 1. TOUS LES HOOKS DOIVENT ÊTRE ICI (AVANT TOUT RETURN)
  // ==========================================
  const [rooms, setRooms] = useState<any[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [upcomingReservations, setUpcomingReservations] = useState<any[]>([]);
  const [activeStays, setActiveStays] = useState<any[]>([]);
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
  const [reservationRoomId, setReservationRoomId] = useState<string | undefined>();
  
  const [isCashOpen, setIsCashOpen] = useState(false);
  const [isRoomServiceOpen, setIsRoomServiceOpen] = useState(false);
  const [todayResMap, setTodayResMap] = useState<Map<string, any>>(new Map());
  const [futureResMap, setFutureResMap] = useState<Map<string, any>>(new Map());
  const [selectedReservation, setSelectedReservation] = useState<any>(null);
const [editingReservation, setEditingReservation] = useState<any>(null); // ✅ NOUVEAU : réservation en cours de modification
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (profileSiteId) loadData();
  }, [profileSiteId, refreshKey]);

  const loadData = async () => {
    setLoading(true);
    try {
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

      const todayStr = new Date().toISOString().split('T')[0];
      const { data: resData } = await supabase
  .from('reservations')
  .select('id, number, room_id, customer_id, check_in_date, check_out_date, status, nightly_rate, adults, children, deposit, notes, customers (first_name, last_name, phone), rooms (number), room_categories (code, name)')
  .eq('site_id', profileSiteId)
  .in('status', ['CONFIRMED', 'CHECKED_IN'])
  .gte('check_in_date', todayStr)
  .order('check_in_date', { ascending: true });

      if (resData) {
        const { data: activeStaysData } = await supabase
          .from('stays')
          .select('reservation_id')
          .eq('status', 'IN_HOUSE');
        
        const activeReservationIds = new Set((activeStaysData || []).map((s: any) => s.reservation_id));
        const filteredReservations = resData.filter((r: any) => !activeReservationIds.has(r.id));
        
        setUpcomingReservations(filteredReservations);

        const todayMap = new Map<string, any>();
        const futureMap = new Map<string, any>();
        for (const r of filteredReservations) {
          if (!r.room_id) continue;
          if (r.check_in_date === todayStr) todayMap.set(r.room_id, r);
          else if (!futureMap.has(r.room_id)) futureMap.set(r.room_id, r);
        }
        setTodayResMap(todayMap);
        setFutureResMap(futureMap);
      }

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

  const syncRooms = async () => {
    if (!confirm('Synchroniser le statut des chambres avec les séjours actifs ?')) return;
    setSyncing(true);
    try {
      const stayRoomIds = activeStays.map(s => s.room_id).filter(Boolean);
      for (const rid of stayRoomIds) {
        await supabase.from('rooms').update({ status: 'OCCUPIED' }).eq('id', rid);
      }
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

  // ✅ Détecte UNIQUEMENT les VRAIS chevauchements (pas les enchaînements légitimes)
  const roomsWithMultipleRes = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const r of upcomingReservations) {
      if (!r.room_id) continue;
      const list = map.get(r.room_id) || [];
      list.push(r);
      map.set(r.room_id, list);
    }
    const result: { roomNumber: string; count: number; periods: string; conflictType: string }[] = [];
    
    for (const [roomId, list] of map) {
      if (list.length < 2) continue;
      
      // Trier par date d'arrivée
      const sorted = [...list].sort((a, b) => 
        new Date(a.check_in_date).getTime() - new Date(b.check_in_date).getTime()
      );
      
      // ✅ Détecter les VRAIS chevauchements (pas juste la contiguïté)
      let hasOverlap = false;
      let overlapDetails: string[] = [];
      
      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const next = sorted[i + 1];
        
        // Chevauchement STRICT : current.check_out_date > next.check_in_date
        // (la contiguïté exacte current.check_out_date === next.check_in_date n'est PAS un conflit)
        if (current.check_out_date > next.check_in_date) {
          hasOverlap = true;
          overlapDetails.push(`${current.number} (${current.check_in_date}→${current.check_out_date}) chevauche ${next.number} (${next.check_in_date}→${next.check_out_date})`);
        }
      }
      
      // ✅ N'afficher l'alerte que s'il y a un VRAI chevauchement
      if (hasOverlap) {
        const roomNumber = rooms.find(r => r.id === roomId)?.number || '—';
        result.push({
          roomNumber,
          count: list.length,
          periods: sorted.map(r => `${r.check_in_date.slice(8,10)}/${r.check_in_date.slice(5,7)}→${r.check_out_date.slice(8,10)}/${r.check_out_date.slice(5,7)}`).join(' • '),
          conflictType: 'CHEVAUCHEMENT'
        });
      }
    }
    return result;
  }, [upcomingReservations, rooms]);

  // ==========================================
  // 2. EARLY RETURNS (après tous les hooks)
  // ==========================================
  if (profileLoading || loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }
  if (!profileSiteId) return null;

  // ==========================================
  // 3. VARIABLES DÉRIVÉES & RENDER
  // ==========================================
  const total = rooms.length;
  const occupied = stats.OCCUPIED || 0;
  const occRate = total ? Math.round((occupied / total) * 100) : 0;
  const desync = activeStays.length !== occupied;

  const byCategory = rooms.reduce((acc: any, room: any) => {
    const catName = room.room_categories?.name || 'Non catégorisé';
    if (!acc[catName]) {
      acc[catName] = {
        name: catName,
        code: room.room_categories?.code || 'NC',
        price: room.room_categories?.base_price || 0,
        rooms: []
      };
    }
    acc[catName].rooms.push(room);
    return acc;
  }, {});

  const sortedCategories = Object.values(byCategory).sort((a: any, b: any) => b.price - a.price);
  
  const getDisplayStatus = (room: any) =>
    room.status !== 'VACANT' ? room.status : (todayResMap.has(room.id) ? 'RESERVED' : 'VACANT');
  // ✅ Helper pour formater les dates en français (format court)
  const formatDateShort = (dateString: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">🚪 Chambres</h1>
          <p className="text-sm text-slate-500 mt-1">Plan de l'hôtel — {total} chambre(s) • Clic gauche : Réserver/Actions • Clic droit : Maintenance</p>
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
          <button onClick={() => { setSelectedRoom(null); setIsModalOpen(true); }} className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-indigo-900 px-3 py-2 rounded-lg text-sm font-bold">
            <Plus className="w-4 h-4" /> Nouvelle Réservation
          </button>
        </div>
      </div>

      {/* Alerte de désynchronisation */}
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
          {sortedCategories.map((cat: any) => (
            <div key={cat.name} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3 border-b border-indigo-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
                    <Bed className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">{cat.name}</h3>
                    <p className="text-xs text-indigo-100">
                      Code: {cat.code} • {Number(cat.price).toLocaleString('fr-FR')} fcfa / nuit
                    </p>
                    <p className="text-[10px] text-indigo-200 mt-0.5">
                      🏢 Étages : {[...new Set(cat.rooms.map((r: any) => r.floor ?? '—'))].sort((a: any, b: any) => a - b).join(', ')}
                    </p>
                  </div>
                </div>
                <div className="bg-white/20 px-3 py-1 rounded-full text-xs font-bold text-white backdrop-blur-sm">
                  {cat.rooms.length} chambre{cat.rooms.length > 1 ? 's' : ''}
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 p-3">
                {cat.rooms.map((room: any) => {
                  const ds = getDisplayStatus(room);
                  const cfg = statusConfig[ds] || statusConfig.VACANT;
                  const futureRes = ds === 'VACANT' ? futureResMap.get(room.id) : null;
                  return (
                    <button
                      key={room.id}
                      onClick={() => {
                        if (ds === 'VACANT') {
                          setReservationRoomId(room.id);
                          setIsModalOpen(true);
                        } else {
                          setSelectedRoom({ ...room, status: ds });
                          setSelectedReservation(todayResMap.get(room.id) || null);
                          setIsRoomModalOpen(true);
                        }
                      }}
                      onContextMenu={(e) => { e.preventDefault(); setMaintenanceRoomId(room.id); setIsMaintenanceOpen(true); }}
                      className={`rounded-lg border-2 p-2 text-left hover:shadow-md transition-all cursor-pointer relative ${cfg.color}`}
                    >
                      {ds === 'OUT_OF_ORDER' && (
                        <div className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs z-10">🔧</div>
                      )}

                      {ds === 'VACANT' && (
                        <div className="absolute inset-0 bg-emerald-600/90 text-white flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity rounded-lg z-20">
                          <span className="font-bold text-sm flex items-center gap-1"><Plus className="w-4 h-4" /> Réserver</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-base font-bold">{room.number}</span>
                          <span className="text-[9px] font-semibold text-slate-500 bg-white/60 px-1 py-0.5 rounded">📍 É{room.floor ?? '—'}</span>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/60 font-semibold">{cat.code}</span>
                      </div>
                      <div className="text-[10px] opacity-80">{cfg.label}</div>
                      <div className="text-[10px] mt-1 font-semibold">{Number(cat.price).toLocaleString('fr-FR')} fcfa</div>

                      {futureRes && (
                        <div className="text-[9px] mt-0.5 text-indigo-600 font-medium flex items-center gap-0.5">
                          📅 Réservée pour le {new Date(futureRes.check_in_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Colonne droite */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
            <div className="bg-amber-100 px-3 py-2 border-b border-amber-200">
              <h3 className="font-semibold text-amber-900 text-sm">📅 Réservations à venir ({upcomingReservations.length})</h3>
            </div>
            <div className="p-2 space-y-2 max-h-60 overflow-y-auto">
                            {roomsWithMultipleRes.length > 0 && (
                <div className="p-2 rounded-lg border-2 border-red-400 bg-red-100 text-red-900 text-xs">
                  <div className="font-bold mb-1 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" />
                    ⚠️ Conflits de dates détectés :
                  </div>
                  {roomsWithMultipleRes.map(x => (
                    <div key={x.roomNumber} className="flex flex-col gap-0.5">
                      <span className="font-semibold">Ch. {x.roomNumber} ({x.count} résas)</span>
                      <span className="text-[10px]">{x.periods}</span>
                    </div>
                  ))}
                </div>
              )}
                            {upcomingReservations.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">Aucune réservation à venir</p>
              ) : (
                upcomingReservations.map((res: any) => (
                  <div key={res.id} className="p-2 rounded-lg border border-amber-200 bg-amber-50 group">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-bold text-xs">{res.number}</div>
                        <div className="text-xs">👤 {res.customers?.last_name} {res.customers?.first_name}</div>
                        {res.rooms?.number && <div className="text-[10px] font-semibold text-amber-700">🚪 Ch. {res.rooms.number}</div>}
                        <div className="text-[10px] text-amber-600 mt-0.5">📅 {formatDateShort(res.check_in_date)} → {formatDateShort(res.check_out_date)}</div>
                      </div>
                      {/* ✅ NOUVEAU : Bouton Modifier */}
                      <button
                        onClick={() => {
                          setEditingReservation(res);
                          setIsModalOpen(true);
                        }}
                        className="ml-2 p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg opacity-80 group-hover:opacity-100 transition-opacity"
                        title="Modifier la réservation"
                      >
                        <Edit className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

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
            <ReservationModal 
        siteId={profileSiteId} 
        isOpen={isModalOpen} 
        editingReservation={editingReservation} // ✅ Passe la réservation à modifier
        preselectRoomId={!editingReservation ? reservationRoomId : undefined} // ✅ Uniquement si pas en mode édition
        onClose={() => { 
          setIsModalOpen(false); 
          setReservationRoomId(undefined);
          setEditingReservation(null); // ✅ Nettoie à la fermeture
        }} 
        onSuccess={() => { 
          setReservationRoomId(undefined);
          setEditingReservation(null); // ✅ Nettoie au succès
          setRefreshKey(k => k + 1); 
          setIsModalOpen(false); 
        }} 
      />
            <RoomActionModal
        siteId={profileSiteId}
        room={selectedRoom}
        reservation={selectedReservation}   
        isOpen={isRoomModalOpen}
        onClose={() => { 
          setIsRoomModalOpen(false); 
          setSelectedReservation(null); 
        }}
        onSuccess={() => setRefreshKey(k => k + 1)}
        onEditReservation={(res: any) => { // ✅ NOUVEAU : callback pour ouvrir le modal d'édition
          setIsRoomModalOpen(false);
          setEditingReservation(res);
          setIsModalOpen(true);
        }}
      />
      <WaitlistModal 
        siteId={profileSiteId} 
        isOpen={isWaitlistOpen} 
        onClose={() => setIsWaitlistOpen(false)} 
        onSuccess={() => setRefreshKey(k => k + 1)} 
      />
      <WaitlistAlert 
        siteId={profileSiteId} 
        isOpen={showWaitlistAlert} 
        onClose={() => setShowWaitlistAlert(false)} 
        onSuccess={() => setRefreshKey(k => k + 1)} 
      />
      <MaintenanceModal 
        siteId={profileSiteId} 
        rooms={rooms} 
        isOpen={isMaintenanceOpen} 
        onClose={() => setIsMaintenanceOpen(false)} 
        onSuccess={() => setRefreshKey(k => k + 1)} 
        preselectRoomId={maintenanceRoomId} 
      />
      <AdminModal 
        siteId={profileSiteId} 
        isOpen={isAdminOpen} 
        onClose={() => setIsAdminOpen(false)} 
        onSuccess={() => setRefreshKey(k => k + 1)} 
      />
      <CashierModal 
        siteId={profileSiteId} 
        isOpen={isCashOpen} 
        onClose={() => setIsCashOpen(false)} 
        onSuccess={() => setRefreshKey(k => k + 1)} 
      />
    </div>
  );
}
