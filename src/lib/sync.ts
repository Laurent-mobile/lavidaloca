import { createClient } from '@/lib/supabase/client';
import { getPendingOperations, markAsSynced, markAsError, countPendingOperations } from './outbox';

let isSyncing = false;

// Synchroniser toutes les opérations en attente
export async function syncPendingOperations(onProgress?: (synced: number, total: number) => void): Promise<{ synced: number; errors: number }> {
  if (isSyncing) return { synced: 0, errors: 0 };
  if (!navigator.onLine) return { synced: 0, errors: 0 };

  isSyncing = true;
  let synced = 0;
  let errors = 0;

  try {
    const operations = await getPendingOperations();
    const total = operations.length;

    for (const op of operations) {
      try {
        await executeOperation(op);
        await markAsSynced(op.id);
        synced++;
        onProgress?.(synced, total);
      } catch (err: any) {
        await markAsError(op.id, err.message);
        errors++;
      }
    }

    // Nettoyer les anciennes opérations
    const { cleanupSyncedOperations } = await import('./outbox');
    await cleanupSyncedOperations();
  } finally {
    isSyncing = false;
  }

  return { synced, errors };
}

// Exécuter une opération sur Supabase
async function executeOperation(op: any): Promise<void> {
  const supabase = createClient();

  switch (op.type) {
    case 'INSERT':
      const { error: insertError } = await supabase
        .from(op.table)
        .insert(op.data);
      if (insertError) throw insertError;
      break;

    case 'UPDATE':
      const { error: updateError } = await supabase
        .from(op.table)
        .update(op.data)
        .eq('id', op.data.id);
      if (updateError) throw updateError;
      break;

    case 'DELETE':
      const { error: deleteError } = await supabase
        .from(op.table)
        .delete()
        .eq('id', op.data.id);
      if (deleteError) throw deleteError;
      break;

    default:
      throw new Error(`Type d'opération inconnu: ${op.type}`);
  }
}

// Hook React pour la synchronisation automatique
export function useAutoSync(onSyncComplete?: (result: { synced: number; errors: number }) => void) {
  const { useEffect } = require('react');
  const { useNetworkStatus } = require('@/hooks/useNetworkStatus');
  const { isOnline } = useNetworkStatus();

  useEffect(() => {
    if (isOnline) {
      syncPendingOperations().then((result) => {
        if (result.synced > 0 || result.errors > 0) {
          onSyncComplete?.(result);
        }
      });
    }
  }, [isOnline]);

  // Synchronisation périodique toutes les 30 secondes quand online
  useEffect(() => {
    if (!isOnline) return;

    const interval = setInterval(() => {
      syncPendingOperations().then((result) => {
        if (result.synced > 0 || result.errors > 0) {
          onSyncComplete?.(result);
        }
      });
    }, 30000);

    return () => clearInterval(interval);
  }, [isOnline]);
}
