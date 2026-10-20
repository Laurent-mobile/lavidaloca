'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, User, Calendar, DollarSign, Award, TrendingUp } from 'lucide-react';

interface Props {
  siteId: string;
  customerId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function CustomerHistoryModal({ siteId, customerId, isOpen, onClose }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (isOpen && customerId) {
      loadHistory();
    }
  }, [isOpen, customerId]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const { data: customer } = await supabase
        .from('customers')
        .select('first_name, last_name, phone, id_number, nationality, is_vip')
        .eq('id', customerId)
        .single();

      const { data: stays } = await supabase
        .from('stays')
        .select(`
          id, check_in_at, check_out_at, nightly_rate, folio_balance, status,
          rooms (number, room_categories (code, name)),
          reservations (number, check_in_date, check_out_date)
        `)
        .eq('customer_id', customerId)
        .order('check_in_at', { ascending: false });

      const { data: reservations } = await supabase
        .from('reservations')
        .select('id, number, check_in_date, check_out_date, status, total_amount')
        .eq('customer_id', customerId)
        .order('check_in_date', { ascending: false });

      // Calculs statistiques
      const completedStays = stays?.filter(s => s.status === 'CHECKED_OUT') || [];
      const totalSpent = completedStays.reduce((sum, s) => sum + (s.folio_balance || 0), 0);
      const totalNights = completedStays.reduce((sum, s) => {
        if (s.check_in_at && s.check_out_at) {
          return sum + Math.ceil((new Date(s.check_out_at).getTime() - new Date(s.check_in_at).getTime()) / 86400000);
        }
        return sum + 1;
      }, 0);

      setData({
        customer,
        stays: stays || [],
        reservations: reservations || [],
        stats: {
          totalStays: completedStays.length,
          totalNights,
          totalSpent,
          avgPerNight: totalNights > 0 ? totalSpent / totalNights : 0,
        },
      });
    } catch (err) {
      console.error('Erreur chargement historique:', err);
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-indigo-900 to-purple-900 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <User className="w-6 h-6" />
            <h2 className="text-xl font-bold">Historique client</h2>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {loading ? (
            <div className="text-center py-8">Chargement...</div>
          ) : !data ? (
            <div className="text-center py-8 text-slate-500">Client introuvable</div>
          ) : (
            <>
              {/* Infos client */}
              <div className="bg-slate-50 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-lg text-slate-900">
                    {data.customer?.last_name} {data.customer?.first_name}
                  </h3>
                  {data.customer?.is_vip && (
                    <span className="bg-purple-200 text-purple-900 text-xs px-2 py-1 rounded font-semibold flex items-center gap-1">
                      <Award className="w-3 h-3" /> VIP
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm text-slate-600">
                  <p>📞 {data.customer?.phone || '—'}</p>
                  <p> {data.customer?.id_number || '—'}</p>
                  <p>🌍 {data.customer?.nationality || '—'}</p>
                </div>
              </div>

              {/* Statistiques */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg">
                  <Calendar className="w-5 h-5 text-blue-700 mb-1" />
                  <div className="text-2xl font-bold text-blue-900">{data.stats.totalStays}</div>
                  <div className="text-xs text-blue-700">Séjours</div>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-emerald-700 mb-1" />
                  <div className="text-2xl font-bold text-emerald-900">{data.stats.totalNights}</div>
                  <div className="text-xs text-emerald-700">Nuits</div>
                </div>
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
                  <DollarSign className="w-5 h-5 text-amber-700 mb-1" />
                  <div className="text-2xl font-bold text-amber-900">
                    {Number(data.stats.totalSpent).toLocaleString('fr-FR')}
                  </div>
                  <div className="text-xs text-amber-700">FCFA dépensés</div>
                </div>
                <div className="bg-purple-50 border border-purple-200 p-3 rounded-lg">
                  <Award className="w-5 h-5 text-purple-700 mb-1" />
                  <div className="text-2xl font-bold text-purple-900">
                    {Number(data.stats.avgPerNight).toLocaleString('fr-FR')}
                  </div>
                  <div className="text-xs text-purple-700">FCFA/nuit moy.</div>
                </div>
              </div>

              {/* Historique des séjours */}
              <div>
                <h4 className="font-semibold text-slate-800 mb-2">Séjours passés ({data.stays.length})</h4>
                {data.stays.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">Aucun séjour enregistré</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {data.stays.map((stay: any) => (
                      <div key={stay.id} className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-sm">
                            {stay.reservations?.number || 'Séjour direct'}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                            stay.status === 'CHECKED_OUT' ? 'bg-emerald-200 text-emerald-900' :
                            stay.status === 'IN_HOUSE' ? 'bg-blue-200 text-blue-900' :
                            'bg-slate-200 text-slate-700'
                          }`}>
                            {stay.status === 'CHECKED_OUT' ? 'Terminé' : 
                             stay.status === 'IN_HOUSE' ? 'En cours' : stay.status}
                          </span>
                        </div>
                        <div className="text-xs text-slate-600">
                          🏨 Chambre {stay.rooms?.number} ({stay.rooms?.room_categories?.code})
                        </div>
                        <div className="text-xs text-slate-600">
                          📅 {new Date(stay.check_in_at).toLocaleDateString('fr-FR')} → 
                          {stay.check_out_at ? new Date(stay.check_out_at).toLocaleDateString('fr-FR') : '...'}
                        </div>
                        <div className="text-xs font-semibold text-slate-800 mt-1">
                          💰 {Number(stay.folio_balance || 0).toLocaleString('fr-FR')} F
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Réservations */}
              {data.reservations.length > 0 && (
                <div>
                  <h4 className="font-semibold text-slate-800 mb-2">Toutes les réservations ({data.reservations.length})</h4>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {data.reservations.map((res: any) => (
                      <div key={res.id} className="flex items-center justify-between bg-slate-50 p-2 rounded text-xs">
                        <span className="font-medium">{res.number}</span>
                        <span className="text-slate-600">
                          {res.check_in_date} → {res.check_out_date}
                        </span>
                        <span className={`px-2 py-0.5 rounded ${
                          res.status === 'CHECKED_OUT' ? 'bg-emerald-100 text-emerald-900' :
                          res.status === 'CHECKED_IN' ? 'bg-blue-100 text-blue-900' :
                          res.status === 'CONFIRMED' ? 'bg-amber-100 text-amber-900' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {res.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
