'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Bell, CheckCircle, X, User, Calendar, Bed, Zap } from 'lucide-react';

interface Props {
  siteId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface WaitlistMatch {
  waitlistId: string;
  customerName: string;
  customerPhone: string;
  categoryCode: string;
  categoryName: string;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  children: number;
  priority: number;
  notes: string;
  roomId?: string;
  roomNumber?: string;
  basePrice?: number;
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
}

export default function WaitlistAlert({ siteId, isOpen, onClose, onSuccess }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<WaitlistMatch[]>([]);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      findMatches();
    }
  }, [isOpen]);

  const findMatches = async () => {
    setLoading(true);
    try {
      // 1. Récupérer les chambres VACANT (libres)
      const { data: vacantRooms } = await supabase
        .from('rooms')
        .select('id, number, category_id, room_categories (code, name, base_price)')
        .eq('site_id', siteId)
        .eq('status', 'VACANT');

      if (!vacantRooms || vacantRooms.length === 0) {
        setMatches([]);
        setLoading(false);
        return;
      }

      // 2. Récupérer les clients en attente
      const { data: waitlist } = await supabase
        .from('waitlist')
        .select(`
          id, check_in_date, check_out_date, adults, children, priority, notes,
          room_category_id,
          customers (first_name, last_name, phone),
          room_categories (code, name)
        `)
        .eq('site_id', siteId)
        .eq('status', 'WAITING')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true });

      if (!waitlist || waitlist.length === 0) {
        setMatches([]);
        setLoading(false);
        return;
      }

      const today = new Date().toISOString().split('T')[0];
      const matched: WaitlistMatch[] = [];

            // 3. Pour chaque client en attente, trouver une chambre compatible
      for (const item of waitlist) {
        // Chercher une chambre libre de la bonne catégorie
        const matchingRoom = vacantRooms.find(r => 
          r.category_id === item.room_category_id
        );

        if (matchingRoom) {
          // Calculer l'urgence
          const checkIn = new Date(item.check_in_date);
          const daysUntilCheckIn = Math.ceil((checkIn.getTime() - Date.now()) / 86400000);
          
          let urgency: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
          if (daysUntilCheckIn <= 1) urgency = 'HIGH';
          else if (daysUntilCheckIn <= 3) urgency = 'MEDIUM';

          // ✅ CORRECTION : Supabase retourne les jointures sous forme de tableaux
          const customer = item.customers?.[0] || {};
          const roomCat = item.room_categories?.[0] || {};
          const matchRoomCat = matchingRoom.room_categories?.[0] || {};

          matched.push({
            waitlistId: item.id,
            customerName: `${customer.last_name || ''} ${customer.first_name || ''}`.trim(),
            customerPhone: customer.phone || '',
            categoryCode: roomCat.code || '',
            categoryName: roomCat.name || '',
            checkInDate: item.check_in_date,
            checkOutDate: item.check_out_date,
            adults: item.adults,
            children: item.children,
            priority: item.priority,
            notes: item.notes || '',
            roomId: matchingRoom.id,
            roomNumber: matchingRoom.number,
            basePrice: matchRoomCat.base_price || 0,
            urgency,
          });
        }
      }

      setMatches(matched);
    } catch (err) {
      console.error('Erreur recherche correspondances:', err);
    }
    setLoading(false);
  };

  const handleConvert = async (match: WaitlistMatch) => {
    if (!match.roomId) return;
    
    setProcessing(match.waitlistId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const nights = Math.max(1, Math.ceil(
        (new Date(match.checkOutDate).getTime() - new Date(match.checkInDate).getTime()) / 86400000
      ));
      const totalAmount = nights * (match.basePrice ?? 0);

      // 1. Créer la réservation
      const { data: reservation, error: resError } = await supabase
        .from('reservations')
        .insert({
          site_id: siteId,
          number: `RES-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`,
          customer_id: null, // On récupérera l'ID via la waitlist
          room_category_id: null,
          room_id: match.roomId,
          check_in_date: match.checkInDate,
          check_out_date: match.checkOutDate,
          adults: match.adults,
          children: match.children,
          nightly_rate: match.basePrice,
          total_amount: totalAmount,
          deposit: 0,
          status: 'CONFIRMED',
          notes: `[Converti depuis liste d'attente] ${match.notes}`,
          created_by: user?.id,
        })
        .select('id')
        .single();

      if (resError) throw new Error(`Réservation: ${resError.message}`);

      // 2. Mettre la chambre en RESERVED
      await supabase
        .from('rooms')
        .update({ status: 'RESERVED' })
        .eq('id', match.roomId);

      // 3. Marquer la waitlist comme CONVERTED
      await supabase
        .from('waitlist')
        .update({ status: 'CONVERTED' })
        .eq('id', match.waitlistId);

      // 4. Rafraîchir
      await findMatches();
      onSuccess();
      setProcessing(null);
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
      setProcessing(null);
    }
  };

  const handleDismiss = async (waitlistId: string) => {
    await supabase
      .from('waitlist')
      .update({ status: 'CANCELLED', notes: 'Ignoré manuellement' })
      .eq('id', waitlistId);
    await findMatches();
  };

  if (!isOpen) return null;

  const getUrgencyConfig = (urgency: string) => {
    switch (urgency) {
      case 'HIGH': return { label: 'URGENT', color: 'bg-red-100 text-red-900 border-red-300', icon: '🔴' };
      case 'MEDIUM': return { label: 'Bientôt', color: 'bg-amber-100 text-amber-900 border-amber-300', icon: '🟡' };
      default: return { label: 'Normal', color: 'bg-slate-100 text-slate-700 border-slate-300', icon: '⚪' };
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Bell className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-bold">Correspondances détectées</h2>
              <p className="text-xs text-purple-200">
                {matches.length} client(s) en attente peuvent être logé(s) maintenant
              </p>
            </div>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {loading ? (
            <div className="text-center py-8 text-slate-500">
              Recherche de correspondances...
            </div>
          ) : matches.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Aucune correspondance</h3>
              <p className="text-sm text-slate-600">
                Aucun client en attente ne correspond aux chambres actuellement libres.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-900 flex items-start gap-2">
                <Zap className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  <strong>{matches.length} opportunité(s) détectée(s) !</strong>
                  <p className="text-xs mt-1">
                    Des chambres libres correspondent aux demandes en attente.
                    Cliquez sur "Convertir" pour créer la réservation instantanément.
                  </p>
                </div>
              </div>

              {matches.map((match) => {
                const urgency = getUrgencyConfig(match.urgency);
                return (
                  <div key={match.waitlistId} className="border-2 border-slate-200 rounded-lg p-4 hover:border-indigo-300 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-slate-900">{match.customerName}</h3>
                          <span className={`text-xs px-2 py-0.5 rounded border font-medium ${urgency.color}`}>
                            {urgency.icon} {urgency.label}
                          </span>
                          {match.priority === 1 && (
                            <span className="text-xs px-2 py-0.5 rounded bg-purple-200 text-purple-900 font-medium">
                              ⭐ VIP
                            </span>
                          )}
                          {match.priority === 2 && (
                            <span className="text-xs px-2 py-0.5 rounded bg-red-200 text-red-900 font-medium">
                              🚨 Urgent
                            </span>
                          )}
                        </div>
                        {match.customerPhone && (
                          <p className="text-xs text-slate-600 mt-1">📞 {match.customerPhone}</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                      <div className="bg-slate-50 p-2 rounded">
                        <p className="text-xs text-slate-600">Chambre proposée</p>
                        <p className="font-semibold text-indigo-900">
                          🚪 {match.roomNumber} ({match.categoryCode})
                        </p>
                      </div>
                      <div className="bg-slate-50 p-2 rounded">
                        <p className="text-xs text-slate-600">Tarif</p>
                        <p className="font-semibold text-emerald-900">
                          {Number(match.basePrice ?? 0).toLocaleString('fr-FR')} F/nuit
                        </p>
                      </div>
                      <div className="bg-slate-50 p-2 rounded">
                        <p className="text-xs text-slate-600">Arrivée</p>
                        <p className="font-semibold">
                          <Calendar className="w-3 h-3 inline mr-1" />
                          {new Date(match.checkInDate).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                      <div className="bg-slate-50 p-2 rounded">
                        <p className="text-xs text-slate-600">Départ</p>
                        <p className="font-semibold">
                          {new Date(match.checkOutDate).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                      <div className="bg-slate-50 p-2 rounded col-span-2">
                        <p className="text-xs text-slate-600">Occupants</p>
                        <p className="font-semibold">
                          <User className="w-3 h-3 inline mr-1" />
                          {match.adults} adulte(s), {match.children} enfant(s)
                        </p>
                      </div>
                    </div>

                    {match.notes && (
                      <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-900 mb-3">
                        <strong>Notes :</strong> {match.notes}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleConvert(match)}
                        disabled={processing === match.waitlistId}
                        className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 rounded-lg disabled:opacity-50"
                      >
                        {processing === match.waitlistId ? (
                          'Conversion...'
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4" />
                            Convertir en réservation
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleDismiss(match.waitlistId)}
                        className="px-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium py-2 rounded-lg"
                        title="Ignorer"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
