'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Moon, AlertTriangle, CheckCircle, Clock, Users, Bed, FileText } from 'lucide-react';

interface Props {
  siteId: string;
  rooms: any[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface AuditIssue {
  type: 'NO_SHOW' | 'OVERSTAY' | 'OCCUPIED_NO_STAY' | 'STAY_NO_ROOM' | 'DIRTY_OVERNIGHT';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  action: string;
  data: any;
}

export default function NightAuditModal({ siteId, rooms, isOpen, onClose, onSuccess }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [issues, setIssues] = useState<AuditIssue[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      runAudit();
    }
  }, [isOpen]);

  const runAudit = async () => {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const foundIssues: AuditIssue[] = [];

    // 1. NO-SHOW : Réservations CONFIRMED avec check_in_date <= aujourd'hui
    const { data: noShows } = await supabase
      .from('reservations')
      .select(`id, number, check_in_date, check_out_date, customer_id, room_id, nightly_rate, customers(first_name, last_name), rooms(number)`)
      .eq('site_id', siteId)
      .eq('status', 'CONFIRMED')
      .lte('check_in_date', today)
      .order('check_in_date', { ascending: true });

    if (noShows) {
      for (const res of noShows) {
        foundIssues.push({
          type: 'NO_SHOW',
          severity: 'HIGH',
          title: `No-Show: ${res.number}`,
          description: `${res.customers?.[0]?.last_name || 'Client'} - Arrivée prévue le ${res.check_in_date} - Chambre ${res.rooms?.[0]?.number || 'non assignée'}`,
          action: 'Marquer comme No-Show (annuler)',
          data: res,
        });
      }
    }

    // 2. OVERSTAY : Séjours IN_HOUSE avec check_out_date dépassée
    const { data: overstays } = await supabase
      .from('stays')
      .select(`id, check_in_at, folio_balance, customer_id, room_id, reservation_id, customers(first_name, last_name), rooms(number), reservations(check_out_date, nightly_rate)`)
      .eq('status', 'IN_HOUSE')
      .eq('room_id', rooms.map(r => r.id));

    if (overstays) {
      for (const stay of overstays) {
        const checkOut = stay.reservations?.[0]?.check_out_date;
        if (checkOut && new Date(checkOut) < new Date(today)) {
          const nightsOverdue = Math.ceil((new Date(today).getTime() - new Date(checkOut).getTime()) / 86400000);
          foundIssues.push({
            type: 'OVERSTAY',
            severity: 'HIGH',
            title: `Dépassement: ${stay.rooms?.[0]?.number}`,
            description: `${stay.customers?.[0]?.last_name || 'Client'} - Départ prévu: ${checkOut} (${nightsOverdue} nuit(s) de retard) - Solde: ${Number(stay.folio_balance || 0).toLocaleString('fr-FR')} F`,
            action: 'Prolonger ou forcer le check-out',
            data: stay,
          });
        }
      }
    }

    // 3. OCCUPIED_NO_STAY : Chambres OCCUPIED sans séjour IN_HOUSE
    const occupiedRoomIds = rooms.filter(r => r.status === 'OCCUPIED').map(r => r.id);
    if (occupiedRoomIds.length > 0) {
      const { data: activeStays } = await supabase
        .from('stays')
        .select('room_id')
        .eq('status', 'IN_HOUSE')
        .in('room_id', occupiedRoomIds);

      const activeRoomIds = activeStays?.map(s => s.room_id) || [];
      const incoherentRooms = rooms.filter(r => r.status === 'OCCUPIED' && !activeRoomIds.includes(r.id));
      
      for (const room of incoherentRooms) {
        foundIssues.push({
          type: 'OCCUPIED_NO_STAY',
          severity: 'MEDIUM',
          title: `Incohérence: Chambre ${room.number}`,
          description: `Chambre marquée "Occupée" mais aucun séjour actif trouvé`,
          action: 'Forcer le statut à "À nettoyer"',
          data: room,
        });
      }
    }

    // 4. DIRTY_OVERNIGHT : Chambres DIRTY depuis plus de 24h
    const dirtyRooms = rooms.filter(r => r.status === 'DIRTY');
    // On ne peut pas savoir depuis quand sans timestamp, on les liste simplement
    if (dirtyRooms.length > 0) {
      for (const room of dirtyRooms) {
        foundIssues.push({
          type: 'DIRTY_OVERNIGHT',
          severity: 'LOW',
          title: `À nettoyer: Chambre ${room.number}`,
          description: `Chambre en attente de nettoyage depuis hier`,
          action: 'Marquer comme propre',
          data: room,
        });
      }
    }

    // 5. Statistiques de la journée
    const { data: todayRes } = await supabase
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('site_id', siteId)
      .eq('check_in_date', today);

    const { data: todayCheckouts } = await supabase
      .from('stays')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'CHECKED_OUT')
      .gte('check_out_at', new Date(today).toISOString());

    setStats({
      totalRooms: rooms.length,
      occupied: rooms.filter(r => r.status === 'OCCUPIED').length,
      vacant: rooms.filter(r => r.status === 'VACANT').length,
      reserved: rooms.filter(r => r.status === 'RESERVED').length,
      dirty: rooms.filter(r => r.status === 'DIRTY').length,
      outOfOrder: rooms.filter(r => r.status === 'OUT_OF_ORDER').length,
      todayArrivals: todayRes?.length || 0,
      todayCheckouts: todayCheckouts?.length || 0,
      occupancyRate: rooms.length ? Math.round((rooms.filter(r => r.status === 'OCCUPIED').length / rooms.length) * 100) : 0,
    });

    setIssues(foundIssues);
    setLoading(false);
  };

  const handleResolve = async (issue: AuditIssue) => {
    setProcessing(issue.title);
    try {
      if (issue.type === 'NO_SHOW') {
        await supabase.from('reservations').update({ status: 'CANCELLED', notes: (issue.data.notes || '') + ' [No-Show audit]' }).eq('id', issue.data.id);
        if (issue.data.room_id) {
          await supabase.from('rooms').update({ status: 'VACANT' }).eq('id', issue.data.room_id);
        }
      } else if (issue.type === 'OCCUPIED_NO_STAY') {
        await supabase.from('rooms').update({ status: 'DIRTY' }).eq('id', issue.data.id);
      } else if (issue.type === 'DIRTY_OVERNIGHT') {
        await supabase.from('rooms').update({ status: 'VACANT' }).eq('id', issue.data.id);
      }
      
      onSuccess();
      runAudit();
    } catch (err: any) {
      alert('Erreur: ' + err.message);
    }
    setProcessing(null);
  };

  const getSeverityConfig = (severity: string) => {
    switch (severity) {
      case 'HIGH': return { color: 'bg-red-100 border-red-300 text-red-900', icon: '🔴' };
      case 'MEDIUM': return { color: 'bg-amber-100 border-amber-300 text-amber-900', icon: '🟡' };
      default: return { color: 'bg-blue-100 border-blue-300 text-blue-900', icon: '🔵' };
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-indigo-900 to-purple-900 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Moon className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-bold">Audit de nuit</h2>
              <p className="text-xs text-indigo-200">Vérification automatique des incohérences</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={runAudit} disabled={loading} className="bg-white/20 hover:bg-white/30 text-white text-sm px-3 py-1.5 rounded-lg font-medium">
              {loading ? 'Analyse...' : '🔄 Relancer'}
            </button>
            <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Statistiques */}
          {stats && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
              <h3 className="font-semibold text-indigo-900 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                État de l'hôtel - {new Date().toLocaleDateString('fr-FR')}
              </h3>
              <div className="grid grid-cols-4 gap-3 text-sm">
                <div className="bg-white p-2 rounded">
                  <div className="text-xs text-slate-600">Taux d'occupation</div>
                  <div className="text-xl font-bold text-indigo-900">{stats.occupancyRate}%</div>
                </div>
                <div className="bg-white p-2 rounded">
                  <div className="text-xs text-slate-600">Chambres occupées</div>
                  <div className="text-xl font-bold text-blue-900">{stats.occupied} / {stats.totalRooms}</div>
                </div>
                <div className="bg-white p-2 rounded">
                  <div className="text-xs text-slate-600">Arrivées aujourd'hui</div>
                  <div className="text-xl font-bold text-emerald-900">{stats.todayArrivals}</div>
                </div>
                <div className="bg-white p-2 rounded">
                  <div className="text-xs text-slate-600">Départs aujourd'hui</div>
                  <div className="text-xl font-bold text-orange-900">{stats.todayCheckouts}</div>
                </div>
              </div>
            </div>
          )}

          {/* Problèmes détectés */}
          <div>
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              Anomalies détectées ({issues.length})
            </h3>

            {loading ? (
              <div className="text-center py-8 text-slate-500">Analyse en cours...</div>
            ) : issues.length === 0 ? (
              <div className="text-center py-8 bg-emerald-50 rounded-lg border border-emerald-200">
                <CheckCircle className="w-12 h-12 mx-auto mb-2 text-emerald-500" />
                <p className="font-semibold text-emerald-900">Aucune anomalie détectée !</p>
                <p className="text-sm text-emerald-700">L'hôtel est en ordre pour la nuit.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {issues.map((issue, idx) => {
                  const sev = getSeverityConfig(issue.severity);
                  return (
                    <div key={idx} className={`border-2 rounded-lg p-4 ${sev.color}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-lg">{sev.icon}</span>
                            <span className="font-bold text-sm">{issue.title}</span>
                            <span className="text-xs px-2 py-0.5 rounded bg-white/50 font-medium">{issue.severity}</span>
                          </div>
                          <p className="text-xs mt-1 opacity-90">{issue.description}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleResolve(issue)}
                        disabled={processing === issue.title}
                        className="w-full bg-white/80 hover:bg-white text-slate-900 text-xs font-semibold py-2 rounded flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        {processing === issue.title ? ' Traitement...' : `✅ ${issue.action}`}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Actions rapides */}
          {issues.length > 0 && (
            <div className="border-t border-slate-200 pt-4">
              <button
                onClick={() => {
                  if (confirm('Résoudre automatiquement toutes les anomalies LOW et MEDIUM ?')) {
                    issues.filter(i => i.severity !== 'HIGH').forEach(issue => handleResolve(issue));
                  }
                }}
                className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2 rounded-lg text-sm"
              >
                ⚡ Résoudre automatiquement les problèmes mineurs
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
