import React, { useState, useEffect } from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Database,
  CheckCircle2,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import {
  isNetworkOnline,
  processQueuedSync,
  setupQueuedSyncListener,
  getSimulatedOfflineMode,
  setSimulatedOfflineMode,
} from '../services/queuedSync';
import { getQueuedVisitors, getQueuedVisitorsCount, QueuedSyncItem } from '../services/indexedDb';
import { maskPhone } from '../services/storage';
import { IS_STAFF_MODE } from '../config/mode';

export const ConnectionStatusIndicator: React.FC = () => {
  const [online, setOnline] = useState<boolean>(true);
  const [queuedCount, setQueuedCount] = useState<number>(0);
  const [queuedItems, setQueuedItems] = useState<QueuedSyncItem[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  const [lastSyncResult, setLastSyncResult] = useState<{
    time: string;
    synced: number;
    message?: string;
  } | null>(null);
  const [isSimulatedOffline, setIsSimulatedOffline] = useState<boolean>(false);

  useEffect(() => {
    setOnline(isNetworkOnline());
    setIsSimulatedOffline(getSimulatedOfflineMode());

    const refreshQueue = async () => {
      const count = await getQueuedVisitorsCount();
      setQueuedCount(count);
      if (count > 0) {
        const items = await getQueuedVisitors();
        setQueuedItems(items);
      } else {
        setQueuedItems([]);
      }
    };

    refreshQueue();

    const cleanup = setupQueuedSyncListener((count, isOnline) => {
      setQueuedCount(count);
      setOnline(isOnline);
      refreshQueue();
    }, { runSync: false });

    const handleSyncStarted = () => setIsSyncing(true);
    const handleSyncCompleted = (e: any) => {
      setIsSyncing(false);
      refreshQueue();
      if (e?.detail) {
        setLastSyncResult({
          time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          synced: e.detail.synced,
          message: e.detail.synced > 0 ? `${e.detail.synced} data berhasil disinkronkan ke Supabase` : undefined,
        });
      }
    };

    window.addEventListener('modis_sync_started', handleSyncStarted);
    window.addEventListener('modis_sync_completed', handleSyncCompleted);

    return () => {
      cleanup();
      window.removeEventListener('modis_sync_started', handleSyncStarted);
      window.removeEventListener('modis_sync_completed', handleSyncCompleted);
    };
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const res = await processQueuedSync();
      setLastSyncResult({
        time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        synced: res.synced,
        message:
          res.synced > 0
            ? `${res.synced} data berhasil disinkronkan ke Supabase!`
            : res.remaining > 0
            ? `Koneksi terputus: ${res.remaining} data tetap aman di IndexedDB.`
            : 'Semua data telah tersinkronisasi.',
      });
      const count = await getQueuedVisitorsCount();
      setQueuedCount(count);
      const items = await getQueuedVisitors();
      setQueuedItems(items);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleToggleSimulation = (simulateOffline: boolean) => {
    setSimulatedOfflineMode(simulateOffline);
    setIsSimulatedOffline(simulateOffline);
    setOnline(!simulateOffline);
  };

  return (
    <div className="relative font-sans select-none">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs border ${
          !online
            ? 'bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-200'
            : queuedCount > 0
            ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
            : 'bg-emerald-50/90 hover:bg-emerald-100 text-emerald-800 border-emerald-200/80'
        }`}
        title="Klik untuk melihat detail koneksi & antrean IndexedDB"
      >
        {!online ? (
          <>
            <WifiOff className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />
            <span className="font-extrabold">Offline</span>
            {queuedCount > 0 && (
              <span className="bg-rose-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full">
                {queuedCount} IDB
              </span>
            )}
          </>
        ) : queuedCount > 0 ? (
          <>
            <RefreshCw className={`w-3.5 h-3.5 text-amber-600 flex-shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : `${queuedCount} Antrean Sync`}</span>
          </>
        ) : (
          <>
            <span className="w-2 h-2 rounded-full bg-[#00B14F] shadow-xs flex-shrink-0" />
            <span className="hidden xs:inline font-bold">Online</span>
            <span className="text-[10px] text-emerald-600 font-semibold hidden md:inline">Cloud siap</span>
          </>
        )}
      </button>

      {showDropdown && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white text-gray-900 rounded-2xl shadow-2xl border border-gray-200 z-50 p-4 animate-fadeIn text-xs">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-lg ${online ? 'bg-emerald-50 text-[#00B14F]' : 'bg-rose-50 text-rose-600'}`}>
                {online ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
              </div>
              <div>
                <h4 className="font-black text-gray-950 text-sm">Status Sinkronisasi & Koneksi</h4>
                <p className="text-[11px] text-gray-400">Fitur Queued Sync dengan IndexedDB</p>
              </div>
            </div>
            <button
              onClick={() => setShowDropdown(false)}
              className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 my-3">
            <div
              className={`p-2.5 rounded-xl border flex flex-col justify-between ${
                online
                  ? 'bg-emerald-50/70 border-emerald-100 text-emerald-950'
                  : 'bg-rose-50/70 border-rose-100 text-rose-950'
              }`}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Koneksi Internet</div>
              <div className="font-black text-xs flex items-center gap-1.5 mt-1">
                <span className={`w-2 h-2 rounded-full ${online ? 'bg-[#00B14F]' : 'bg-rose-600'}`} />
                <span>{online ? 'Online (Terhubung)' : 'Offline (Terputus)'}</span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl border border-gray-200 bg-gray-50/70 text-gray-900 flex flex-col justify-between">
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Antrean IndexedDB</div>
              <div className="font-black text-xs flex items-center gap-1.5 mt-1">
                <Database className="w-3.5 h-3.5 text-blue-600" />
                <span>{queuedCount} Data Pending</span>
              </div>
            </div>
          </div>

          <div className="p-2.5 bg-blue-50/60 rounded-xl border border-blue-100 text-[11px] text-blue-950 leading-relaxed space-y-1 mb-3">
            <div className="font-bold flex items-center gap-1 text-blue-900">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
              <span>Proteksi Offline-First Aktif:</span>
            </div>
            <p className="text-gray-600">
              Jika sinyal internet di stasiun atau booth terputus, data visitor otomatis diamankan ke database lokal{' '}
              <strong>IndexedDB</strong>. Begitu internet kembali online, sistem secara otomatis melakukan{' '}
              <em>retry</em> sinkronisasi ke Supabase.
            </p>
          </div>

          {queuedCount > 0 && (
            <div className="mb-3 space-y-1.5">
              <div className="flex justify-between items-center text-[11px] font-bold text-gray-700">
                <span>Daftar Antrean Menunggu Sinkronisasi:</span>
                <span className="text-amber-600">{queuedCount} data</span>
              </div>
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {queuedItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-2 bg-amber-50/60 border border-amber-200 rounded-xl flex items-center justify-between text-[11px]"
                  >
                    <div>
                      <div className="font-bold text-gray-900">
                        {item.record.isMinor ? 'Peserta <18' : (item.record.fullName || '').split(' ')[0] || 'Visitor'}
                      </div>
                      <div className="text-gray-500 text-[10px]">
                        {maskPhone(item.record.phoneNumber)} • {item.record.poiLocation}
                      </div>
                      {item.lastError?.startsWith('Ditolak server') && (
                        <div className="text-rose-600 text-[9px]">{item.lastError}</div>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded text-[9px] font-bold">
                        {item.syncStatus === 'syncing' ? 'Syncing...' : 'Pending'}
                      </span>
                      <div className="text-[9px] text-gray-400 mt-0.5">Retry: {item.retryCount || 0}x</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {lastSyncResult && (
            <div className="mb-3 p-2 bg-gray-50 rounded-xl border border-gray-200 text-[11px] flex items-center justify-between text-gray-600">
              <span>
                Terakhir Sinkron: <strong>{lastSyncResult.time}</strong>
              </span>
              {lastSyncResult.message && <span className="text-[#009A45] font-semibold">{lastSyncResult.message}</span>}
            </div>
          )}

          <div className="space-y-2 pt-2 border-t border-gray-100">
            <button
              onClick={handleManualSync}
              disabled={isSyncing || !online || queuedCount === 0}
              className="w-full py-2.5 px-3 bg-[#00B14F] hover:bg-[#009643] active:scale-95 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-xs disabled:opacity-40 disabled:pointer-events-none"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Sedang Sinkronisasi ke Supabase...' : 'Sinkronkan Sekarang'}</span>
            </button>

            {IS_STAFF_MODE && (
            <div className="flex items-center justify-between p-2 rounded-xl bg-gray-50 border border-gray-200 text-[11px]">
              <div className="flex items-center gap-1.5 text-gray-700">
                <SlidersHorizontal className="w-3.5 h-3.5 text-gray-500" />
                <span>Simulasi Offline (Testing):</span>
              </div>
              <button
                type="button"
                onClick={() => handleToggleSimulation(!isSimulatedOffline)}
                className={`px-2 py-1 rounded-lg font-bold text-[10px] transition ${
                  isSimulatedOffline
                    ? 'bg-rose-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {isSimulatedOffline ? 'Mode Offline Aktif' : 'Aktifkan Offline'}
              </button>
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
