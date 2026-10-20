'use client';
import { useState, useEffect } from 'react';

interface NetworkStatus {
  isOnline: boolean;
  lastSync: Date | null;
  pendingOperations: number;
}

export function useNetworkStatus() {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: typeof window !== 'undefined' ? navigator.onLine : true,
    lastSync: null,
    pendingOperations: 0,
  });

  useEffect(() => {
    const handleOnline = () => {
      setStatus(prev => ({ ...prev, isOnline: true }));
    };

    const handleOffline = () => {
      setStatus(prev => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const updateSyncStatus = (lastSync: Date, pendingOps: number) => {
    setStatus(prev => ({
      ...prev,
      lastSync,
      pendingOperations: pendingOps,
    }));
  };

  return { ...status, updateSyncStatus };
}
