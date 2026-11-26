'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time To Live en ms
}

const globalCache = new Map<string, CacheEntry<any>>();

export function useCachedData<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = 60000, // 1 minute par défaut
  deps: any[] = []
) {
  const [data, setData] = useState<T | null>(globalCache.get(key)?.data || null);
  const [loading, setLoading] = useState(!globalCache.get(key));
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    // Invalider le cache
    globalCache.delete(key);
    
    try {
      const result = await fetcher();
      if (mountedRef.current) {
        globalCache.set(key, { data: result, timestamp: Date.now(), ttl });
        setData(result);
        setLoading(false);
        setError(null);
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setError(err.message);
        setLoading(false);
      }
    }
  }, [key, fetcher, ttl]);

  useEffect(() => {
    mountedRef.current = true;
    
    const cached = globalCache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      setData(cached.data);
      setLoading(false);
      return;
    }

    refresh();

    return () => { mountedRef.current = false; };
  }, [key, ...deps]);

  return { data, loading, error, refresh };
}

// Helper pour invalider le cache après une mutation
export const invalidateCache = (keyPattern: string) => {
  for (const key of globalCache.keys()) {
    if (key.includes(keyPattern)) {
      globalCache.delete(key);
    }
  }
};
