import { sendVisitorToSupabase } from './supabase';
import {
  getQueuedVisitors,
  removeQueuedVisitor,
  updateQueuedVisitorStatus,
  getQueuedVisitorsCount,
  enqueueVisitorForSync,
} from './indexedDb';
import { getLocalVisitors, markRecordSynced } from './storage';

const SIMULATED_OFFLINE_KEY = 'modis_simulated_offline';

/**
 * Checks if the application is currently connected to the internet.
 * Accounts for both native navigator.onLine and optional developer simulation mode.
 */
export function isNetworkOnline(): boolean {
  if (typeof window === 'undefined') return true;
  // Check simulation mode
  const isSimulatedOffline = localStorage.getItem(SIMULATED_OFFLINE_KEY) === 'true';
  if (isSimulatedOffline) return false;
  return navigator.onLine;
}

/**
 * Toggles developer simulation of offline mode for testing Queued Sync in browser.
 */
export function setSimulatedOfflineMode(isOffline: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SIMULATED_OFFLINE_KEY, isOffline ? 'true' : 'false');
  window.dispatchEvent(new CustomEvent(isOffline ? 'offline' : 'online'));
  window.dispatchEvent(new CustomEvent('modis_queued_sync_updated'));
}

export function getSimulatedOfflineMode(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(SIMULATED_OFFLINE_KEY) === 'true';
}

let isSyncRunning = false;

/**
 * Processes all pending items in the IndexedDB sync queue and sends them to Supabase.
 */
export async function processQueuedSync(): Promise<{
  success: boolean;
  synced: number;
  total: number;
  remaining: number;
}> {
  if (isSyncRunning) {
    const count = await getQueuedVisitorsCount();
    return { success: false, synced: 0, total: count, remaining: count };
  }

  if (!isNetworkOnline()) {
    const count = await getQueuedVisitorsCount();
    return { success: false, synced: 0, total: count, remaining: count };
  }

  isSyncRunning = true;
  window.dispatchEvent(new CustomEvent('modis_sync_started'));

  try {
    // 1. Gather all items in IndexedDB
    const queuedItems = await getQueuedVisitors();

    // 2. Also check if there are any unsynced items in localStorage that aren't yet in IndexedDB
    const localRecords = getLocalVisitors();
    const unsyncedLocal = localRecords.filter((r) => !r.syncedToSupabase);
    for (const unsynced of unsyncedLocal) {
      if (!queuedItems.some((q) => q.id === unsynced.id)) {
        await enqueueVisitorForSync(unsynced, 'Queued from local storage');
      }
    }

    // Refresh queued items
    const allToSync = await getQueuedVisitors();
    let syncedCount = 0;

    for (const item of allToSync) {
      if (!isNetworkOnline()) break;
      if (item.lastError?.startsWith('Ditolak server')) continue;

      await updateQueuedVisitorStatus(item.id, 'syncing');

      const res = await sendVisitorToSupabase(item.record);
      if (res.success) {
        await removeQueuedVisitor(item.id);
        markRecordSynced(item.id);
        syncedCount++;
      } else if (res.permanent) {
        // Data ditolak aturan database (mis. format salah): jangan dicoba terus-menerus.
        await updateQueuedVisitorStatus(item.id, 'failed', `Ditolak server: ${res.error}`);
      } else {
        await updateQueuedVisitorStatus(item.id, 'failed', res.error);
      }
    }

    const remaining = await getQueuedVisitorsCount();

    // Dispatch completion event
    window.dispatchEvent(
      new CustomEvent('modis_sync_completed', {
        detail: {
          synced: syncedCount,
          total: allToSync.length,
          remaining,
          timestamp: new Date().toISOString(),
        },
      })
    );
    window.dispatchEvent(new CustomEvent('modis_queued_sync_updated'));

    return {
      success: true,
      synced: syncedCount,
      total: allToSync.length,
      remaining,
    };
  } catch (err) {
    console.error('Queued sync process error:', err);
    const count = await getQueuedVisitorsCount();
    return { success: false, synced: 0, total: count, remaining: count };
  } finally {
    isSyncRunning = false;
  }
}

/**
 * Initializes automatic background queued sync listeners.
 * Listens for network restoration ('online') and runs periodic background sync retries.
 */
export function setupQueuedSyncListener(
  onQueueChange?: (count: number, isOnline: boolean) => void,
  options: { runSync?: boolean } = {}
): () => void {
  const runSync = options.runSync ?? true;
  if (typeof window === 'undefined') return () => {};

  const handleOnline = () => {
    if (runSync) processQueuedSync();
    getQueuedVisitorsCount().then((count) => {
      onQueueChange?.(count, true);
    });
  };

  const handleOffline = () => {
    getQueuedVisitorsCount().then((count) => {
      onQueueChange?.(count, false);
    });
  };

  const handleQueueUpdate = () => {
    getQueuedVisitorsCount().then((count) => {
      onQueueChange?.(count, isNetworkOnline());
    });
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  window.addEventListener('modis_queued_sync_updated', handleQueueUpdate);

  // Initial trigger and check
  if (runSync && isNetworkOnline()) {
    processQueuedSync();
  }
  handleQueueUpdate();

  // Periodic background retry every 25 seconds if online and queue > 0
  const intervalId = window.setInterval(async () => {
    if (runSync && isNetworkOnline()) {
      const pendingCount = await getQueuedVisitorsCount();
      if (pendingCount > 0) {
        processQueuedSync();
      }
    }
  }, 25000);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    window.removeEventListener('modis_queued_sync_updated', handleQueueUpdate);
    window.clearInterval(intervalId);
  };
}
