import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { SPGConfig } from '../types';
import { ErrorBoundary, lazyWithReload } from '../components/ErrorBoundary';
import { useLocationTracking } from '../hooks/useLocationTracking';
import { FieldSession, fieldApi, shiftInfo } from './api';
import { LoginScreen } from './LoginScreen';
import { FieldHome } from './FieldHome';
import { CustomerFlow, CustomerPrefill } from './CustomerFlow';
import { VenuePicker } from './VenuePicker';
import { CloseDayScreen, IssueScreen, StockScreen, StockViewScreen } from './TlScreens';
import { useTapRipple } from './fx';
import { IdleAttract } from './IdleAttract';
import { getSession, refreshClaimCache, refreshMasters, saveSession, startAutoSync } from './store';

const OwnerDashboard = lazyWithReload(() => import('../dashboard/OwnerDashboard').then((m) => ({ default: m.OwnerDashboard })));

type View = 'home' | 'customer' | 'admin' | 'stock' | 'close' | 'stockview' | 'issue';

/** Kedalaman layar: maju = geser dari kanan, kembali = geser dari kiri. */
const DEPTH: Record<View, number> = { home: 0, customer: 1, admin: 1, stock: 2, close: 1, stockview: 1, issue: 1 };

const UNIT_TYPE: Record<string, SPGConfig['unitType']> = { mobil: 'Mobil Diskon', kiosk1: 'Kiosk 1', kiosk2: 'Kiosk 2' };

/** Field App (fase 1): aplikasi kerja crew. Visitor tidak memegang tablet. */
export const FieldApp: React.FC = () => {
  const [session, setSession] = useState<FieldSession | null>(() => getSession());
  const [view, setView] = useState<View>('home');
  const [prefill, setPrefill] = useState<CustomerPrefill | null>(null);
  const [venueOpen, setVenueOpen] = useState(false);
  const [backfill, setBackfill] = useState(false);
  const [formKey, setFormKey] = useState(0);

  useTapRipple();
  const prevView = useRef<View>('home');
  const dirRef = useRef<'fwd' | 'back'>('fwd');
  if (prevView.current !== view) {
    dirRef.current = DEPTH[view] >= DEPTH[prevView.current] && view !== 'home' ? 'fwd' : 'back';
    prevView.current = view;
  }

  useEffect(() => startAutoSync(), []);

  // Layar iklan setelah 45 detik tanpa sentuhan di beranda
  const [idle, setIdle] = useState(false);
  const idleAllowed = Boolean(session) && view === 'home' && !venueOpen;
  useEffect(() => {
    if (!idleAllowed) return;
    let t = window.setTimeout(() => setIdle(true), 45_000);
    const bump = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => setIdle(true), 45_000);
    };
    const evts = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
    evts.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    return () => {
      window.clearTimeout(t);
      evts.forEach((e) => window.removeEventListener(e, bump));
    };
  }, [idleAllowed]);
  // Segarkan cache double claim saat aplikasi dibuka / kembali online
  useEffect(() => {
    if (!session) return;
    const run = () => {
      if (!navigator.onLine) return;
      refreshClaimCache(session.token).catch(() => {});
      refreshMasters().catch(() => {});
    };
    run();
    window.addEventListener('online', run);
    const t = window.setInterval(run, 5 * 60_000);
    return () => {
      window.removeEventListener('online', run);
      window.clearInterval(t);
    };
  }, [session?.token]);

  const update = (s: FieldSession | null) => {
    saveSession(s);
    setSession(s);
  };

  // Lokasi tablet untuk peta internal selama shift
  const trackCfg = useMemo<SPGConfig>(
    () => ({
      poiLocation: session?.poi_location || '',
      poiCategory: (session?.poi_category as SPGConfig['poiCategory']) || 'Station',
      unitType: UNIT_TYPE[session?.unit_id || ''] || 'Mobil Diskon',
      spgName: session?.spg_name || '',
      dutyStart: shiftInfo(session?.shift).jam.slice(0, 5).replace('.', ':'),
      dutyEnd: shiftInfo(session?.shift).jam.slice(6).replace('.', ':'),
      dutyDate: '',
    }),
    [session],
  );
  useLocationTracking(trackCfg, Boolean(session));

  if (!session) {
    return (
      <div className="fx-root animate-fade-in">
      <LoginScreen
        onLoggedIn={(s) => {
          update(s);
          setView('home');
          setVenueOpen(true);
        }}
      />
      </div>
    );
  }

  const logout = async () => {
    try {
      if (navigator.onLine) await fieldApi.logout(session.token);
    } catch {
      /* tetap keluar */
    }
    update(null);
  };

  let screen: React.ReactNode;
  if (view === 'customer') {
    screen = (
      <CustomerFlow
        key={prefill ? `${prefill.phone}-${prefill.type}` : `new-${formKey}`}
        session={session}
        prefill={prefill}
        backfill={backfill && session.role === 'tl'}
        onExit={() => {
          setBackfill(false);
          setView('home');
        }}
        onDone={(next) => {
          if (next) {
            setPrefill(next);
            setView('home');
            window.setTimeout(() => setView('customer'), 0);
          } else if (backfill) {
            setPrefill(null);
            setFormKey((k) => k + 1);
          } else {
            setPrefill(null);
            setView('home');
          }
        }}
      />
    );
  } else if (view === 'stockview') {
    screen = <StockViewScreen session={session} onBack={() => setView('home')} onOpenStock={session.role === 'tl' ? () => setView('stock') : undefined} />;
  } else if (view === 'issue') {
    screen = <IssueScreen session={session} onBack={() => setView('home')} />;
  } else if (view === 'stock' && session.role === 'tl') {
    screen = <StockScreen session={session} onBack={() => setView('home')} />;
  } else if (view === 'close' && session.role === 'tl') {
    screen = <CloseDayScreen session={session} onBack={() => setView('home')} />;
  } else {
    screen = (
      <FieldHome
        session={session}
        onNewCustomer={() => {
          setPrefill(null);
          setBackfill(false);
          setView('customer');
        }}
        onBackfill={() => {
          setPrefill(null);
          setBackfill(true);
          setFormKey((k) => k + 1);
          setView('customer');
        }}
        onOpenStockView={() => setView('stockview')}
        onOpenIssue={() => setView('issue')}
        onChangeVenue={() => setVenueOpen(true)}
        onOpenDashboard={() => setView('admin')}
        onOpenStock={() => setView('stock')}
        onOpenClose={() => setView('close')}
        onLogout={logout}
      />
    );
  }

  return (
    <div className="fx-root min-h-[100dvh] bg-canvas font-sans antialiased overflow-x-clip">
      <div key={view} className={dirRef.current === 'fwd' ? 'animate-slide-right' : 'animate-slide-left'}>
        {screen}
      </div>
      {idle && idleAllowed && <IdleAttract onWake={() => setIdle(false)} />}
      {venueOpen && (
        <VenuePicker
          unitId={session.unit_id}
          current={session.poi_location}
          onClose={session.poi_location ? () => setVenueOpen(false) : undefined}
          onPick={(loc, cat) => {
            update({ ...session, poi_location: loc, poi_category: cat });
            setVenueOpen(false);
          }}
        />
      )}
      {view === 'admin' && (
        <ErrorBoundary label="dashboard" compact onReset={() => setView('home')}>
          <Suspense fallback={null}>
            <div className="fixed inset-0 z-[80] overflow-y-auto bg-canvas animate-zoom-in">
              <OwnerDashboard embedded onExit={() => setView('home')} />
            </div>
          </Suspense>
        </ErrorBoundary>
      )}
    </div>
  );
};
