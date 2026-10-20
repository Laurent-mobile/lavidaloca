'use client';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { Wifi, WifiOff, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { countPendingOperations } from '@/lib/outbox';

export default function NetworkStatusIndicator() {
  const { isOnline, updateSyncStatus } = useNetworkStatus();
  const [pendingOps, setPendingOps] = useState(0);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [showDetails, setShowDetails] = useState(false);

    useEffect(() => {
    const updateCount = async () => {
      const count = await countPendingOperations();
      setPendingOps(count);
      updateSyncStatus(lastSync || new Date(), count);
    };

    updateCount();
    const interval = setInterval(updateCount, 5000);
    
    // 🔧 NOUVEAU : Écouter le retour en ligne pour synchro auto
    const handleOnline = async () => {
      console.log('🌐 Réseau détecté, synchronisation automatique...');
      const { syncPendingOperations } = await import('@/lib/sync');
      const result = await syncPendingOperations();
      
      if (result.synced > 0 || result.errors > 0) {
        setLastSync(new Date());
        window.dispatchEvent(new Event('syncCompleted'));
      }
      
      const count = await countPendingOperations();
      setPendingOps(count);
    };

    window.addEventListener('online', handleOnline);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

   const handleManualSync = async () => {
    const { syncPendingOperations } = await import('@/lib/sync');
    const result = await syncPendingOperations();
    
    if (result.synced > 0) {
      setLastSync(new Date());
      // 🔔 Envoyer un signal global à l'application : "La synchro est terminée !"
      window.dispatchEvent(new Event('syncCompleted'));
    }
    
    const count = await countPendingOperations();
    setPendingOps(count);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          isOnline 
            ? pendingOps > 0 
              ? 'bg-amber-500 text-white hover:bg-amber-600'
              : 'bg-emerald-500 text-white hover:bg-emerald-600'
            : 'bg-red-500 text-white hover:bg-red-600 animate-pulse'
        }`}
      >
        {isOnline ? (
          pendingOps > 0 ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Wifi className="w-3 h-3" />
        ) : (
          <WifiOff className="w-3 h-3" />
        )}
        <span className="hidden sm:inline">
          {isOnline 
            ? pendingOps > 0 
              ? `${pendingOps} en attente`
              : 'En ligne'
            : 'Hors ligne'
          }
        </span>
      </button>

      {showDetails && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-lg border border-slate-200 p-3 z-50">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-sm text-slate-900">Statut réseau</h4>
            <button onClick={() => setShowDetails(false)} className="text-slate-400 hover:text-slate-600">
              ✕
            </button>
          </div>
          
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              {isOnline ? (
                <>
                  <Wifi className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-700 font-medium">Connecté</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-red-600" />
                  <span className="text-red-700 font-medium">Déconnecté</span>
                </>
              )}
            </div>

            {pendingOps > 0 && (
              <div className="flex items-center gap-2 bg-amber-50 p-2 rounded">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span className="text-amber-900">
                  <strong>{pendingOps}</strong> opération(s) en attente
                </span>
              </div>
            )}

            {lastSync && (
              <div className="text-slate-600">
                Dernière sync: {lastSync.toLocaleTimeString('fr-FR')}
              </div>
            )}

            {isOnline && pendingOps > 0 && (
              <button
                onClick={handleManualSync}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-1.5 rounded font-medium"
              >
                Synchroniser maintenant
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
