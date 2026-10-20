// Service de cache local pour données de référence
const CACHE_PREFIX = 'vidaloca_cache_';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 heures

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export function setCache<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(entry));
  } catch (err) {
    console.error('Erreur cache:', err);
  }
}

export function getCache<T>(key: string): T | null {
  try {
    const cached = localStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!cached) return null;

    const entry: CacheEntry<T> = JSON.parse(cached);
    const isExpired = Date.now() - entry.timestamp > CACHE_EXPIRY;

    if (isExpired) {
      localStorage.removeItem(`${CACHE_PREFIX}${key}`);
      return null;
    }

    return entry.data;
  } catch (err) {
    console.error('Erreur lecture cache:', err);
    return null;
  }
}

export function clearCache(): void {
  Object.keys(localStorage)
    .filter(key => key.startsWith(CACHE_PREFIX))
    .forEach(key => localStorage.removeItem(key));
}

// NOUVELLE FONCTION : Créer un client en mode offline (ajout à l'Outbox)
// NOUVELLE FONCTION : Créer un client en mode offline (ajout à l'Outbox)
export async function createClientOffline(siteId: string, customerData: any): Promise<string> {
  const { addToOutbox } = await import('./outbox');
  
  // Utilise l'API native du navigateur pour un UUID 100% valide et unique
  const id = crypto.randomUUID();
  
  await addToOutbox({
    type: 'INSERT',
    table: 'customers',
    data: {
      id,
      site_id: siteId,
      ...customerData,
    },
  });
  
  return id;
}


