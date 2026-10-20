// Service Outbox - File d'attente locale pour opérations hors-ligne
const DB_NAME = 'vidaloca_outbox';
const DB_VERSION = 1;
const STORE_NAME = 'operations';

export interface OutboxOperation {
  id: string;
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  data: any;
  timestamp: number;
  synced: boolean;
  retryCount: number;
  error?: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('synced', 'synced', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

export async function addToOutbox(operation: Omit<OutboxOperation, 'id' | 'timestamp' | 'synced' | 'retryCount'>): Promise<string> {
  const db = await openDB();
  const id = generateUUID();
  const fullOperation: OutboxOperation = {
    ...operation,
    id,
    timestamp: Date.now(),
    synced: false,
    retryCount: 0,
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.add(fullOperation);
    request.onsuccess = () => resolve(id);
    request.onerror = () => reject(request.error);
  });
}

export async function getPendingOperations(): Promise<OutboxOperation[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const allOps = request.result;
      const pending = allOps.filter(op => !op.synced);
      resolve(pending);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function markAsSynced(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => {
      const op = request.result;
      if (op) {
        op.synced = true;
        store.put(op);
      }
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

export async function markAsError(id: string, error: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => {
      const op = request.result;
      if (op) {
        op.error = error;
        op.retryCount = (op.retryCount || 0) + 1;
        store.put(op);
      }
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

// Version corrigée : utiliser un cursor pour compter
export async function countPendingOperations(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.openCursor();
    
    let count = 0;

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        const op = cursor.value as OutboxOperation;
        if (!op.synced) {
          count++;
        }
        cursor.continue();
      } else {
        resolve(count);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function cleanupSyncedOperations(): Promise<void> {
  const db = await openDB();
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.openCursor();

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        const op = cursor.value as OutboxOperation;
        if (op.synced && op.timestamp < sevenDaysAgo) {
          cursor.delete();
        }
        cursor.continue();
      } else {
        resolve();
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export function generateUUID(): string {
  return crypto.randomUUID();
}
