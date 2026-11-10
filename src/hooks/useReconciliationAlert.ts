'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface ReconciliationAlert {
  pending: number;      // Client encore sur place
  paid: number;         // Réconcilié automatiquement
  anomaly: number;      // ⚠️ Check-out mais folio impayé
  total: number;
  anomalyAmount: number; // Montant total des anomalies
}

export function useReconciliationAlert(siteId: string | null) {
  const supabase = createClient();
  const [alert, setAlert] = useState<ReconciliationAlert>({
    pending: 0,
    paid: 0,
    anomaly: 0,
    total: 0,
    anomalyAmount: 0
  });
  const [loading, setLoading] = useState(false);

  const loadAlert = async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const { data: orders, error } = await supabase
        .from('restaurant_orders')
        .select(`
          id, total_amount,
          stays!inner(id, status, folio_balance)
        `)
        .eq('site_id', siteId)
        .eq('order_type', 'ROOM_SERVICE')
        .in('status', ['DRAFT', 'SENT', 'PREPARING', 'READY', 'SERVED']);

      if (error) throw error;

      let pending = 0;
      let paid = 0;
      let anomaly = 0;
      let anomalyAmount = 0;

      orders?.forEach(order => {
        const stay = order.stays as any;
        if (stay?.status === 'CHECKED_OUT') {
          if (stay.folio_balance === 0) {
            paid++;
          } else {
            anomaly++;
            anomalyAmount += Number(order.total_amount || 0);
          }
        } else {
          pending++;
        }
      });

      setAlert({
        pending,
        paid,
        anomaly,
        total: orders?.length || 0,
        anomalyAmount
      });
    } catch (error) {
      console.error('Erreur chargement alerte réconciliation:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlert();
    
    // Rafraîchir toutes les 60 secondes
    const interval = setInterval(loadAlert, 60000);
    return () => clearInterval(interval);
  }, [siteId]);

  return { alert, loadAlert, loading };
}
