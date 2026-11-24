import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Heart, Loader2, X } from 'lucide-react';
import { DashboardView } from './components/DashboardView';
import { KrathongStudioView } from './components/KrathongStudioView';
import { LoginPage } from './components/LoginPage';
import { LogoutConfirmModal } from './components/LogoutConfirmModal';
import { SharedLoveOverlay } from './components/SharedLoveOverlay';
import { TopNav } from './components/TopNav';
import { TwoHeartsView } from './components/TwoHeartsView';
import {
  clearTabSession,
  fetchRoomState,
  floatMyKrathong,
  getSavedTabSession,
  hasSeenLoveEvent,
  KrathongDraftPayload,
  loginWithCredentials,
  logoutSession,
  markLoveEventSeen,
  resetPrivateRoom,
  saveMyKrathongDraft,
  subscribeRealtimeRoom,
} from './services/roomClient';
import { GalaxyRiverCanvas } from './three/GalaxyRiverCanvas';
import {
  AppView,
  AuthSession,
  KrathongStatus,
  RoomState,
  WsServerMessage,
} from './types/universe';

interface ToastBanner {
  id: string;
  message: string;
}

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(() => getSavedTabSession());
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [bootstrapping, setBootstrapping] = useState<boolean>(() => Boolean(getSavedTabSession()));
  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [wsConnected, setWsConnected] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [toast, setToast] = useState<ToastBanner | null>(null);
  const [showLoveOverlay, setShowLoveOverlay] = useState(false);

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const lastFloatedNotifiedRef = useRef<string | null>(null);

  const checkAndTriggerSharedLove = useCallback(
    (nextState: RoomState, uid: 'user_001' | 'user_002') => {
      const k1 = nextState.krathongs.user_001;
      const k2 = nextState.krathongs.user_002;
      const bothFloating =
        k1?.status === KrathongStatus.FLOATING && k2?.status === KrathongStatus.FLOATING;

      const latestEvent = nextState.events.find(
        (ev) => ev.eventType === 'SHARED_LOVE_MOMENT',
      );

      if (bothFloating && latestEvent && !hasSeenLoveEvent(uid, latestEvent.eventId)) {
        markLoveEventSeen(uid, latestEvent.eventId);
        setActiveView('river');
        setShowLoveOverlay(true);
      }
    },
    [],
  );

  const handleWsMessage = useCallback(
    (msg: WsServerMessage) => {
      const currentUid = sessionRef.current?.user.uid;
      if (!currentUid) return;

      if (msg.type === 'ROOM_SYNC') {
        setRoomState(msg.payload);
        checkAndTriggerSharedLove(msg.payload, currentUid);
      } else if (msg.type === 'ROOM_RESET') {
        setRoomState(msg.payload);
        setShowLoveOverlay(false);
        lastFloatedNotifiedRef.current = null;
      } else if (msg.type === 'PRESENCE_UPDATE') {
        setRoomState((prev) => (prev ? { ...prev, users: msg.payload } : prev));
      } else if (msg.type === 'KRATHONG_FLOATED') {
        setRoomState(msg.payload.state);
        const floatedKrathong = msg.payload.krathong;

        if (
          floatedKrathong.ownerUid !== currentUid &&
          lastFloatedNotifiedRef.current !== floatedKrathong.krathongId
        ) {
          lastFloatedNotifiedRef.current = floatedKrathong.krathongId;
          const notifyText =
            floatedKrathong.ownerUid === 'user_001'
              ? 'เราลอยกระทงแล้วนะ'
              : 'เธอลอยกระทงแล้ว ❤️';
          setToast({
            id: floatedKrathong.krathongId,
            message: notifyText,
          });
        }

        checkAndTriggerSharedLove(msg.payload.state, currentUid);
      }
    },
    [checkAndTriggerSharedLove],
  );

  // Hydrate room state & attach real-time listener when authenticated
  useEffect(() => {
    if (!session) {
      setBootstrapping(false);
      return;
    }

    let cancelled = false;
    setBootstrapping(true);

    fetchRoomState(session.token)
      .then((state) => {
        if (cancelled) return;
        setRoomState(state);
        checkAndTriggerSharedLove(state, session.user.uid);
        setBootstrapping(false);

        unsubscribeRef.current?.();
        unsubscribeRef.current = subscribeRealtimeRoom(session.token, {
          onMessage: handleWsMessage,
          onConnectionChange: setWsConnected,
        });
      })
      .catch(() => {
        if (cancelled) return;
        clearTabSession();
        setSession(null);
        setRoomState(null);
        setBootstrapping(false);
      });

    return () => {
      cancelled = true;
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, [session?.token, session?.user.uid, handleWsMessage, checkAndTriggerSharedLove]);

  // Auto-dismiss arrival toast after 6 seconds
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleLogin = async (username: string, password: string) => {
    const newSession = await loginWithCredentials(username, password);
    setActiveView('dashboard');
    setSession(newSession);
  };

  const handleConfirmLogout = async () => {
    setLogoutModalOpen(false);
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    if (session) {
      await logoutSession(session.token);
    }
    setSession(null);
    setRoomState(null);
    setWsConnected(false);
    setShowLoveOverlay(false);
    setToast(null);
  };

  const handleSaveDraft = async (payload: KrathongDraftPayload) => {
    if (!session) return;
    const { state } = await saveMyKrathongDraft(session.token, payload);
    setRoomState(state);
  };

  const handleFloatKrathong = async (payload: KrathongDraftPayload) => {
    if (!session) return;
    const { state } = await floatMyKrathong(session.token, payload);
    setRoomState(state);
    setActiveView('river');
    checkAndTriggerSharedLove(state, session.user.uid);
  };

  const handleResetRoom = async () => {
    if (!session) return;
    const nextState = await resetPrivateRoom(session.token);
    setRoomState(nextState);
    setShowLoveOverlay(false);
    lastFloatedNotifiedRef.current = null;
  };

  const allKrathongsList = useMemo(() => {
    if (!roomState) return [];
    return Object.values(roomState.krathongs).filter(
      (k): k is NonNullable<typeof k> => Boolean(k),
    );
  }, [roomState]);

  const bothFloating = useMemo(() => {
    if (!roomState) return false;
    return (
      roomState.krathongs.user_001?.status === KrathongStatus.FLOATING &&
      roomState.krathongs.user_002?.status === KrathongStatus.FLOATING
    );
  }, [roomState]);

  const hasSharedLoveEvent = useMemo(() => {
    if (!roomState) return false;
    return roomState.events.some((ev) => ev.eventType === 'SHARED_LOVE_MOMENT');
  }, [roomState]);

  if (!session) {
    return <LoginPage onLogin={handleLogin} />;
  }

  if (bootstrapping || !roomState) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#070714] px-4 text-center">
        <Loader2 className="h-7 w-7 animate-spin text-violet-400" />
        <p className="mt-3 text-sm text-slate-300">กำลังเชื่อมต่อห้องส่วนตัว OUR LITTLE UNIVERSE...</p>
      </div>
    );
  }

  const currentUser = roomState.users[session.user.uid] ?? session.user;
  const myKrathong = roomState.krathongs[session.user.uid];

  return (
    <div className="min-h-screen bg-[#070714] text-slate-100">
      <TopNav
        activeView={activeView}
        onNavigate={setActiveView}
        onRequestLogout={() => setLogoutModalOpen(true)}
      />

      {/* Real-time Notification Toast when partner floats krathong */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.25 }}
            className="fixed right-4 top-20 z-40 flex items-center gap-3 rounded-xl border border-pink-400/35 bg-[#160e2e]/95 px-4 py-3 shadow-2xl"
          >
            <Heart className="h-4 w-4 shrink-0 fill-pink-400 text-pink-400" />
            <span className="text-sm font-medium text-white">{toast.message}</span>
            {activeView !== 'river' && (
              <button
                type="button"
                onClick={() => {
                  setActiveView('river');
                  setToast(null);
                }}
                className="rounded-md bg-pink-500/20 px-2.5 py-1 text-xs font-medium text-pink-200 hover:bg-pink-500/30 whitespace-nowrap"
              >
                ไปดูเลย
              </button>
            )}
            <button
              type="button"
              onClick={() => setToast(null)}
              aria-label="ปิดการแจ้งเตือน"
              className="text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <main>
        {activeView === 'dashboard' && (
          <DashboardView
            currentUser={currentUser}
            roomState={roomState}
            wsConnected={wsConnected}
            onNavigate={setActiveView}
          />
        )}

        {activeView === 'studio' && (
          <KrathongStudioView
            currentUser={currentUser}
            myKrathong={myKrathong}
            onSaveDraft={handleSaveDraft}
            onFloatKrathong={handleFloatKrathong}
            onGoToRiver={() => setActiveView('river')}
          />
        )}

        {activeView === 'river' && (
          <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h1 className="font-display text-xl font-semibold text-white sm:text-2xl">
                  แม่น้ำกาแล็กซีของเราสองคน
                </h1>
                <p className="text-xs text-slate-400">
                  พื้นที่แม่น้ำส่วนกลาง · แสดงเฉพาะกระทงที่ลอยแล้วแบบเรียลไทม์
                </p>
              </div>
              <div className="font-mono-tabular text-xs text-slate-400">
                ลอยแล้ว {allKrathongsList.filter((k) => k.status === KrathongStatus.FLOATING).length}{' '}
                / 2 ใบ
              </div>
            </div>

            <div className="relative h-[calc(100vh-175px)] min-h-[480px] w-full">
              <GalaxyRiverCanvas
                krathongs={allKrathongsList}
                sharedLoveActive={bothFloating}
                hasSharedLoveEvent={hasSharedLoveEvent && bothFloating}
                onReplaySharedLove={() => setShowLoveOverlay(true)}
              />
            </div>
          </div>
        )}

        {activeView === 'hearts' && (
          <TwoHeartsView
            currentUser={currentUser}
            roomState={roomState}
            onResetRoom={handleResetRoom}
          />
        )}
      </main>

      <SharedLoveOverlay
        visible={activeView === 'river' && bothFloating && showLoveOverlay}
        onDismiss={() => setShowLoveOverlay(false)}
      />

      <LogoutConfirmModal
        open={logoutModalOpen}
        displayName={currentUser.displayName}
        onCancel={() => setLogoutModalOpen(false)}
        onConfirm={handleConfirmLogout}
      />
    </div>
  );
}

