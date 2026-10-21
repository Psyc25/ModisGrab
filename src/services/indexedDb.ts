import { VisitorRecord } from '../types';

export interface QueuedSyncItem {
  id: string;
  record: VisitorRecord;
  queuedAt: string;
  retryCount: number;
  lastAttempt?: string;
  lastError?: string;
  syncStatus: 'pending' | 'syncing' | 'failed';
}

const DB_NAME = 'modis_offline_sync_db';
const DB_VERSION = 1;
const STORE_NAME = 'queued_visitors';

let dbInstance: IDBDatabase | null = null;

/**
 * Initializes and returns the IndexedDB database instance.
 */
export function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('queuedAt', 'queuedAt', { unique: false });
        store.createIndex('syncStatus', 'syncStatus', { unique: false });
        store.createIndex('retryCount', 'retryCount', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('IndexedDB open error:', (event.target as IDBOpenDBRequest).error);
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

/**
 * Enqueues a visitor record into IndexedDB for offline queued sync.
 */
export async function enqueueVisitorForSync(
  record: VisitorRecord,
  errorReason?: string
): Promise<void> {
  try {
    const db = await openIndexedDb();
    const item: QueuedSyncItem = {
      id: record.id,
      record: { ...record, syncedToSupabase: false },
      queuedAt: new Date().toISOString(),
      retryCount: 0,
      lastError: errorReason || 'Awaiting network sync',
      syncStatus: 'pending',
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(item);

      request.onsuccess = () => {
        // Dispatch event for UI indicators
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('modis_queued_sync_updated'));
        }
        resolve();
      };

      request.onerror = () => {
        console.error('Failed to enqueue into IndexedDB:', request.error);
        reject(request.error);
      };
    });
  } catch (err) {
    console.warn('Could not enqueue to IndexedDB, fallback to storage:', err);
  }
}

/**
 * Retrieves all queued visitor records from IndexedDB.
 */
export async function getQueuedVisitors(): Promise<QueuedSyncItem[]> {
  try {
    const db = await openIndexedDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (err) {
    console.warn('Error reading from IndexedDB:', err);
    return [];
  }
}

/**
 * Returns the count of items waiting in the IndexedDB queue.
 */
export async function getQueuedVisitorsCount(): Promise<number> {
  try {
    const db = await openIndexedDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.count();

      request.onsuccess = () => {
        resolve(request.result || 0);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch {
    return 0;
  }
}

/**
 * Removes a successfully synced item from IndexedDB.
 */
export async function removeQueuedVisitor(id: string): Promise<void> {
  try {
    const db = await openIndexedDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('modis_queued_sync_updated'));
        }
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (err) {
    console.warn('Error removing from IndexedDB:', err);
  }
}

/**
 * Updates an item's status in the IndexedDB queue (e.g. 'syncing', 'failed').
 */
export async function updateQueuedVisitorStatus(
  id: string,
  status: 'pending' | 'syncing' | 'failed',
  errorMsg?: string
): Promise<void> {
  try {
    const db = await openIndexedDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        const item: QueuedSyncItem = getReq.result;
        if (item) {
          item.syncStatus = status;
          item.lastAttempt = new Date().toISOString();
          if (status === 'failed') {
            item.retryCount = (item.retryCount || 0) + 1;
            item.lastError = errorMsg || 'Sync failed';
          }
          store.put(item);
        }
        resolve();
      };

      getReq.onerror = () => reject(getReq.error);
    });
  } catch (err) {
    console.warn('Error updating status in IndexedDB:', err);
  }
}

/**
 * Clears all items in the IndexedDB queue.
 */
export async function clearQueuedVisitors(): Promise<void> {
  try {
    const db = await openIndexedDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('modis_queued_sync_updated'));
        }
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('Error clearing IndexedDB:', err);
  }
}
