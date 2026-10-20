"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Bed,
  Bath,
  Users,
  AlertCircle,
  Palmtree,
  Plus,
  Loader2,
  Clock,
  LogIn,
  Bell,
} from "lucide-react";
import LogoutButton from "@/components/LogoutButton";
import ReservationModal from "@/components/ReservationModal";
import RoomActionModal from "@/components/RoomActionModal";
import WaitlistModal from "@/components/WaitlistModal";
import NetworkStatusIndicator from "@/components/NetworkStatusIndicator";
import WaitlistAlert from '@/components/WaitlistAlert';
import MaintenanceModal from '@/components/MaintenanceModal';
import AdminModal from '@/components/AdminModal';
import { Wrench, Settings } from 'lucide-react';
import CashierModal from '@/components/CashierModal'; // au lieu de CashRegisterModal
import { DollarSign } from 'lucide-react';
import DailyReportModal from '@/components/DailyReportModal';
import NightAuditModal from '@/components/NightAuditModal';
import { FileText, Moon } from 'lucide-react';
import FBFloorPlan from '@/components/FBFloorPlan';
import FBKitchenDisplay from '@/components/FBKitchenDisplay';
import { Utensils, ChefHat } from 'lucide-react';

const statusConfig: Record<
  string,
  { label: string; color: string; icon: any }
> = {
  VACANT: {
    label: "Libre",
    color: "bg-emerald-100 border-emerald-400 text-emerald-900",
    icon: Bed,
  },
  RESERVED: {
    label: "Réservée",
    color: "bg-amber-100 border-amber-400 text-amber-900",
    icon: Bed,
  },
  OCCUPIED: {
    label: "Occupée",
    color: "bg-blue-100 border-blue-400 text-blue-900",
    icon: Users,
  },
  DIRTY: {
    label: "À nettoyer",
    color: "bg-orange-100 border-orange-400 text-orange-900",
    icon: Bath,
  },
  OUT_OF_ORDER: {
    label: "Hors service",
    color: "bg-red-100 border-red-400 text-red-900",
    icon: AlertCircle,
  },
};

export default function HomePage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [rooms, setRooms] = useState<any[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [reservations, setReservations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
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
const [isDailyReportOpen, setIsDailyReportOpen] = useState(false);
const [isNightAuditOpen, setIsNightAuditOpen] = useState(false);
const [isFBOpen, setIsFBOpen] = useState(false);
const [isKitchenOpen, setIsKitchenOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, [refreshKey]);

  const loadData = async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const supabase = createClient();
    const isOffline = !navigator.onLine;

    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user && !isOffline) {
      window.location.href = "/login";
      setLoading(false);
      return;
    }
    
    if (user) {
      setUser(user);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("*, sites(id, name, code)")
      .eq("id", user?.id)
      .single();

    if (profile) {
      setProfile(profile);
      localStorage.setItem('vidaloca_site_id', profile.sites.id);
      localStorage.setItem('vidaloca_site_name', profile.sites.name);
      localStorage.setItem('vidaloca_user_role', profile.role);
    } else if (isOffline) {
      const cachedSiteId = localStorage.getItem('vidaloca_site_id');
      const cachedSiteName = localStorage.getItem('vidaloca_site_name');
      const cachedRole = localStorage.getItem('vidaloca_user_role');
      
      if (cachedSiteId) {
        setProfile({
          sites: { id: cachedSiteId, name: cachedSiteName },
          role: cachedRole,
        });
      } else {
        console.error('❌ Site ID introuvable même en cache');
        setLoading(false);
        return;
      }
    } else {
      setLoading(false);
      return;
    }

    const siteId = profile?.sites?.id || localStorage.getItem('vidaloca_site_id');
    if (!siteId) {
      console.error('❌ Site ID introuvable');
      setLoading(false);
      return;
    }

    try {
      const { data: roomsData } = await supabase
        .from("rooms")
        .select(`id, number, floor, status, room_categories (code, name, base_price)`)
        .eq("site_id", siteId)
        .order("number", { ascending: true });

      if (roomsData) {
        setRooms(roomsData);
        const s = roomsData.reduce((acc: any, r: any) => {
          acc[r.status] = (acc[r.status] || 0) + 1;
          return acc;
        }, {});
        setStats(s);
        
        const { setCache } = await import('@/lib/localCache');
        setCache('all_rooms', roomsData);
      } else {
        setRooms([]);
        setStats({});
      }
    } catch (err) {
      console.error('Erreur chargement chambres:', err);
      const { getCache } = await import('@/lib/localCache');
      const cachedRooms = getCache<any[]>('all_rooms');
      if (cachedRooms) {
        setRooms(cachedRooms);
        const s = cachedRooms.reduce((acc: any, r: any) => {
          acc[r.status] = (acc[r.status] || 0) + 1;
          return acc;
        }, {});
        setStats(s);
      } else {
        setRooms([]);
        setStats({});
      }
    }

    try {
      const { data: reservationsData } = await supabase
        .from("reservations")
        .select(`
          id, number, check_in_date, check_out_date, status, nightly_rate,
          customers (first_name, last_name, phone),
          room_id,
          room_categories (code, name),
          rooms (number)
        `)
        .eq("site_id", siteId)
        .in("status", ["CONFIRMED", "CHECKED_IN"])
        .order("check_in_date", { ascending: true });

      if (reservationsData) setReservations(reservationsData);
      else setReservations([]);
    } catch (err) {
      console.error('Erreur chargement réservations:', err);
      setReservations([]);
    }

    try {
      const { count } = await supabase
        .from('waitlist')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', siteId)
        .eq('status', 'WAITING');
      if (count !== null) setWaitlistCount(count);
    } catch (err) {
      console.error('Erreur chargement waitlist:', err);
    }

        // 4. Compter les correspondances liste d'attente
    try {
      const { data: vacantRooms } = await supabase
        .from('rooms')
        .select('id, category_id')
        .eq('site_id', siteId)
        .eq('status', 'VACANT');

      if (vacantRooms && vacantRooms.length > 0) {
        const categoryIds = [...new Set(vacantRooms.map(r => r.category_id))];
        const { count } = await supabase
          .from('waitlist')
          .select('*', { count: 'exact', head: true })
          .eq('site_id', siteId)
          .eq('status', 'WAITING')
          .in('room_category_id', categoryIds);
        
        if (count !== null && count > 0) {
          setWaitlistMatchesCount(count);
        } else {
          setWaitlistMatchesCount(0);
        }
      } else {
        setWaitlistMatchesCount(0);
      }
    } catch (err) {
      console.error('Erreur comptage correspondances:', err);
    }

    setLoading(false);
  };

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-red-600 text-center p-6 bg-white rounded-lg shadow-lg max-w-md">
          <h2 className="text-xl font-bold mb-4">Profil introuvable</h2>
          <p className="text-slate-700 mb-2">Vous êtes connecté avec :</p>
          <p className="text-indigo-600 font-bold text-lg mb-4">{user?.email}</p>
          <a href="/login" className="inline-block bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
            Se déconnecter
          </a>
        </div>
      </div>
    );
  }

  const siteName = profile.sites.name;
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

  // Séparer les réservations en 2 catégories
  const upcomingReservations = reservations.filter(r => r.status === 'CONFIRMED');
  const currentStays = reservations.filter(r => r.status === 'CHECKED_IN');

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-gradient-to-r from-indigo-900 via-purple-900 to-indigo-900 text-white px-4 py-3 flex items-center justify-between shadow-lg sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <Palmtree className="w-7 h-7 text-yellow-400" />
          <div>
            <h1 className="text-xl font-bold tracking-wide">LA VIDA-LOCA</h1>
            <p className="text-xs text-indigo-200">{siteName} — {profile.role}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsWaitlistOpen(true)}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-4 py-2 rounded-lg transition-colors relative"
          >
            <Clock className="w-5 h-5" />
            <span className="hidden sm:inline">Liste d'attente</span>
            {waitlistCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {waitlistCount}
              </span>
            )}
          </button>
                    {waitlistMatchesCount > 0 && (
            <button
              onClick={() => setShowWaitlistAlert(true)}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors relative animate-pulse"
            >
              <Bell className="w-5 h-5" />
              <span className="hidden sm:inline">
                {waitlistMatchesCount} correspondance{waitlistMatchesCount > 1 ? 's' : ''}
              </span>
              <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {waitlistMatchesCount}
              </span>
            </button>
          )}
                    <button
            onClick={() => setIsMaintenanceOpen(true)}
            className="flex items-center gap-2 bg-slate-600 hover:bg-slate-700 text-white font-semibold px-3 py-2 rounded-lg transition-colors"
            title="Maintenance"
          >
            <Wrench className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIsAdminOpen(true)}
            className="flex items-center gap-2 bg-slate-600 hover:bg-slate-700 text-white font-semibold px-3 py-2 rounded-lg transition-colors"
            title="Administration"
          >
            <Settings className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-indigo-900 font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>Nouvelle Réservation</span>
          </button>
          <NetworkStatusIndicator />
                    <button
            onClick={() => setIsFBOpen(true)}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold px-3 py-2 rounded-lg transition-colors"
            title="Restaurant & Bar"
          >
            <Utensils className="w-5 h-5" />
            <span className="hidden sm:inline">F&B</span>
          </button>
          <button
            onClick={() => setIsKitchenOpen(true)}
            className="flex items-center gap-2 bg-slate-700 hover:bg-slate-800 text-white font-semibold px-3 py-2 rounded-lg transition-colors"
            title="Écran Cuisine/Bar"
          >
            <ChefHat className="w-5 h-5" />
            <span className="hidden sm:inline">Cuisine</span>
          </button>
                    <button
            onClick={() => setIsCashOpen(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-2 rounded-lg transition-colors"
            title="Caisse"
          >
            <DollarSign className="w-5 h-5" />
            <span className="hidden sm:inline">Caisse</span>
          </button>
                    <button
            onClick={() => setIsDailyReportOpen(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-3 py-2 rounded-lg transition-colors"
            title="Rapport de fin de journée"
          >
            <FileText className="w-5 h-5" />
            <span className="hidden sm:inline">Rapport</span>
          </button>
          <button
            onClick={() => setIsNightAuditOpen(true)}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold px-3 py-2 rounded-lg transition-colors"
            title="Audit de nuit"
          >
            <Moon className="w-5 h-5" />
            <span className="hidden sm:inline">Audit</span>
          </button>
          <LogoutButton />
        </div>
      </header>

      <div className="px-3 py-4 max-w-[99%] mx-auto">
        {loading && (
          <div className="flex items-center justify-center py-2 mb-2 bg-indigo-50 rounded-lg border border-indigo-200">
            <Loader2 className="w-4 h-4 text-indigo-600 animate-spin mr-2" />
            <span className="text-sm text-indigo-700">Actualisation...</span>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
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

        <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">Taux d'occupation</span>
            <span className="text-xl font-bold text-slate-900">{occRate}%</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2.5">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2.5 rounded-full" style={{ width: `${occRate}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            {Object.keys(byFloor).sort().map((floor: string) => (
              <div key={floor} className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-200">
                  <h3 className="font-semibold text-slate-800 text-sm">Étage {floor}</h3>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2 p-3">
                  {byFloor[floor].map((room: any) => {
                    const cfg = statusConfig[room.status] || statusConfig.VACANT;
                    return (
                                            <button
                        key={room.id}
                        onClick={() => {
                          setSelectedRoom(room);
                          setIsRoomModalOpen(true);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setMaintenanceRoomId(room.id);
                          setIsMaintenanceOpen(true);
                        }}
                        className={`rounded-lg border-2 p-2 text-left hover:shadow-md transition-all cursor-pointer relative group ${cfg.color}`}
                      >
                        {/* Badge maintenance si OUT_OF_ORDER */}
                        {room.status === 'OUT_OF_ORDER' && (
                          <div className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                            🔧
                          </div>
                        )}
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-base font-bold">{room.number}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/60 font-semibold">
                            {room.room_categories?.code}
                          </span>
                        </div>
                        <div className="text-[10px] opacity-80">{cfg.label}</div>
                        <div className="text-[10px] mt-1 font-semibold">
                          {Number(room.room_categories?.base_price || 0).toLocaleString("fr-FR")} F
                        </div>
                        {/* Info maintenance au survol */}
                        {room.out_of_order_reason && (
                          <div className="absolute bottom-full left-0 right-0 mb-1 bg-red-900 text-white text-[10px] p-1 rounded hidden group-hover:block z-10">
                             {room.out_of_order_reason}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* COLONNE DROITE : 2 sections séparées */}
          <div className="lg:col-span-1 space-y-4">
            
            {/* Section 1 : Réservations à venir */}
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
              <div className="bg-amber-100 px-3 py-2 border-b border-amber-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-700" />
                  <h3 className="font-semibold text-amber-900 text-sm">
                    Réservations ({upcomingReservations.length})
                  </h3>
                </div>
              </div>
              
              {upcomingReservations.length === 0 ? (
                <div className="p-3 text-center text-slate-500">
                  <Clock className="w-6 h-6 mx-auto mb-1 text-slate-300" />
                  <p className="text-xs">Aucune réservation à venir</p>
                </div>
              ) : (
                <div className="p-2 space-y-2 max-h-64 overflow-y-auto">
                  {upcomingReservations.map((res: any) => (
                    <div key={res.id} className="p-2 rounded-lg border border-amber-200 bg-amber-50">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs text-slate-900">{res.number}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-amber-200 text-amber-900">
                          À venir
                        </span>
                      </div>
                      <div className="text-xs text-slate-600">
                        👤 {res.customers?.last_name} {res.customers?.first_name}
                      </div>
                      {res.room_categories && (
                        <div className="text-[10px] text-slate-500 mt-0.5">
                           {res.room_categories.code} • {Number(res.nightly_rate).toLocaleString("fr-FR")} F/nuit
                        </div>
                      )}
                      {res.rooms?.number && (
                        <div className="text-[10px] font-semibold text-amber-700 mt-1 bg-amber-100 px-2 py-0.5 rounded inline-block">
                          🚪 Chambre {res.rooms.number}
                        </div>
                      )}
                      <div className="flex justify-between text-[10px] text-slate-500 mt-1 pt-1 border-t border-amber-200/50">
                        <span>{new Date(res.check_in_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</span>
                        <span>→</span>
                        <span>{new Date(res.check_out_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section 2 : Clients en séjour */}
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
              <div className="bg-blue-100 px-3 py-2 border-b border-blue-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <LogIn className="w-4 h-4 text-blue-700" />
                  <h3 className="font-semibold text-blue-900 text-sm">
                    En séjour ({currentStays.length})
                  </h3>
                </div>
              </div>
              
              {currentStays.length === 0 ? (
                <div className="p-3 text-center text-slate-500">
                  <Users className="w-6 h-6 mx-auto mb-1 text-slate-300" />
                  <p className="text-xs">Aucun client en séjour</p>
                </div>
              ) : (
                <div className="p-2 space-y-2 max-h-64 overflow-y-auto">
                  {currentStays.map((res: any) => {
                    const checkIn = new Date(res.check_in_date);
                    const checkOut = new Date(res.check_out_date);
                    const today = new Date();
                    const nightsStayed = Math.max(1, Math.ceil((today.getTime() - checkIn.getTime()) / 86400000));
                    const totalNights = Math.max(1, Math.ceil((checkOut.getTime() - checkIn.getTime()) / 86400000));
                    
                    return (
                      <div key={res.id} className="p-2 rounded-lg border border-blue-200 bg-blue-50">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-xs text-slate-900">{res.number}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-blue-200 text-blue-900">
                            En séjour
                          </span>
                        </div>
                        <div className="text-xs text-slate-600">
                          👤 {res.customers?.last_name} {res.customers?.first_name}
                        </div>
                        {res.room_categories && (
                          <div className="text-[10px] text-slate-500 mt-0.5">
                             {res.room_categories.code} • {Number(res.nightly_rate).toLocaleString("fr-FR")} F/nuit
                          </div>
                        )}
                        {res.rooms?.number && (
                          <div className="text-[10px] font-semibold text-blue-700 mt-1 bg-blue-100 px-2 py-0.5 rounded inline-block">
                            🚪 Chambre {res.rooms.number}
                          </div>
                        )}
                        {/* Indicateur de progression du séjour */}
                        <div className="mt-1 pt-1 border-t border-blue-200/50">
                          <div className="flex justify-between text-[10px] text-slate-500">
                            <span>Nuit {nightsStayed}/{totalNights}</span>
                            <span>Départ: {checkOut.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</span>
                          </div>
                          <div className="w-full bg-blue-200 rounded-full h-1 mt-1">
                            <div 
                              className="bg-blue-600 h-1 rounded-full" 
                              style={{ width: `${Math.min(100, (nightsStayed / totalNights) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      <ReservationModal
        siteId={siteId}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => setRefreshKey((k) => k + 1)}
      />

      <RoomActionModal
        siteId={siteId}
        room={selectedRoom}
        isOpen={isRoomModalOpen}
        onClose={() => setIsRoomModalOpen(false)}
        onSuccess={() => setRefreshKey((k) => k + 1)}
      />

      <WaitlistModal
        siteId={siteId}
        isOpen={isWaitlistOpen}
        onClose={() => setIsWaitlistOpen(false)}
        onSuccess={() => setRefreshKey((k) => k + 1)}
      />
            <MaintenanceModal
        siteId={siteId}
        rooms={rooms}
        isOpen={isMaintenanceOpen}
        onClose={() => setIsMaintenanceOpen(false)}
        onSuccess={() => setRefreshKey((k) => k + 1)}
        preselectRoomId={maintenanceRoomId}
      />

      <AdminModal
        siteId={siteId}
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        onSuccess={() => setRefreshKey((k) => k + 1)}
      />

            <WaitlistAlert
        siteId={siteId}
        isOpen={showWaitlistAlert}
        onClose={() => setShowWaitlistAlert(false)}
        onSuccess={() => setRefreshKey((k) => k + 1)}
      />
            <CashierModal
  siteId={siteId}
  isOpen={isCashOpen}
  onClose={() => setIsCashOpen(false)}
  onSuccess={() => setRefreshKey((k) => k + 1)}
/>
      <DailyReportModal
        siteId={siteId}
        isOpen={isDailyReportOpen}
        onClose={() => setIsDailyReportOpen(false)}
        onSuccess={() => setRefreshKey((k) => k + 1)}
      />

      <NightAuditModal
        siteId={siteId}
        rooms={rooms}
        isOpen={isNightAuditOpen}
        onClose={() => setIsNightAuditOpen(false)}
        onSuccess={() => setRefreshKey((k) => k + 1)}
      />
            <FBFloorPlan
        siteId={siteId}
        isOpen={isFBOpen}
        onClose={() => setIsFBOpen(false)}
        onSuccess={() => setRefreshKey((k) => k + 1)}
      />

      <FBKitchenDisplay
        siteId={siteId}
        isOpen={isKitchenOpen}
        onClose={() => setIsKitchenOpen(false)}
      />
    </main>
  );
}
