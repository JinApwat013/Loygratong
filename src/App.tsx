import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Heart, Loader2, MessageCircle, X } from 'lucide-react';
import { ChatView } from './components/ChatView';
import { DashboardView } from './components/DashboardView';
import { KrathongStudioView } from './components/KrathongStudioView';
import { LoginPage } from './components/LoginPage';
import { LogoutConfirmModal } from './components/LogoutConfirmModal';
import { SharedLoveOverlay } from './components/SharedLoveOverlay';
import { TopNav } from './components/TopNav';
import { TwoHeartsView } from './components/TwoHeartsView';
import {
  fetchRoomState,
  floatMyKrathong,
  getSavedTabSession,
  hasSeenLoveEvent,
  KrathongDraftPayload,
  loginWithName,
  logoutSession,
  markLoveEventSeen,
  RealtimeSubscriptionHandle,
  resetPrivateRoom,
  saveMyKrathongDraft,
  sendChatMessage,
  subscribeRealtimeRoom,
  updateMyDisplayName,
} from './services/roomClient';
import { GalaxyRiverCanvas } from './three/GalaxyRiverCanvas';
import {
  AppView,
  AuthSession,
  KrathongStatus,
  RoomState,
  RoomUser,
  WsServerMessage,
} from './types/universe';

interface ToastBanner {
  id: string;
  message: string;
  targetView: AppView;
}

function resolvePartnerUser(
  users: Record<string, RoomUser>,
  currentUid: string,
): RoomUser | undefined {
  const others = Object.values(users).filter((u) => u.uid !== currentUid);
  if (others.length === 0) return undefined;
  others.sort(
    (a, b) => Number(b.onlineStatus) - Number(a.onlineStatus) || b.lastSeen.localeCompare(a.lastSeen),
  );
  return others[0];
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
  const [typingUid, setTypingUid] = useState<string | null>(null);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const activeViewRef = useRef(activeView);
  activeViewRef.current = activeView;
  const realtimeRef = useRef<RealtimeSubscriptionHandle | null>(null);
  const lastFloatedNotifiedRef = useRef<string | null>(null);
  const lastChatNotifiedRef = useRef<string | null>(null);
  const partnerOnlineMapRef = useRef<Record<string, boolean>>({});

  const navigateTo = useCallback((nextView: AppView) => {
    setActiveView(nextView);
    if (nextView === 'chat') {
      setUnreadChatCount(0);
    }
  }, []);

  const checkAndTriggerSharedLove = useCallback(
    (nextState: RoomState, uid: string) => {
      const floatingCount = Object.values(nextState.krathongs).filter(
        (k) => k?.status === KrathongStatus.FLOATING,
      ).length;
      const bothFloating = floatingCount >= 2;

      const latestEvent = nextState.events.find(
        (ev) => ev.eventType === 'SHARED_LOVE_MOMENT',
      );

      if (bothFloating && latestEvent && !hasSeenLoveEvent(uid, latestEvent.eventId)) {
        markLoveEventSeen(uid, latestEvent.eventId);
        navigateTo('river');
        setShowLoveOverlay(true);
      }
    },
    [navigateTo],
  );

  const handleWsMessage = useCallback(
    (msg: WsServerMessage) => {
      const currentUid = sessionRef.current?.user.uid;
      if (!currentUid) return;

      if (msg.type === 'ROOM_SYNC') {
        const nextMap: Record<string, boolean> = {};
        for (const u of Object.values(msg.payload.users)) {
          if (u.uid !== currentUid) {
            nextMap[u.uid] = u.onlineStatus;
          }
        }
        partnerOnlineMapRef.current = nextMap;
        setRoomState(msg.payload);
        checkAndTriggerSharedLove(msg.payload, currentUid);
      } else if (msg.type === 'ROOM_RESET') {
        setRoomState(msg.payload);
        setShowLoveOverlay(false);
        lastFloatedNotifiedRef.current = null;
      } else if (msg.type === 'PRESENCE_UPDATE') {
        const nextMap: Record<string, boolean> = {};
        for (const u of Object.values(msg.payload)) {
          if (u.uid !== currentUid) {
            const wasOnline = partnerOnlineMapRef.current[u.uid];
            if ((wasOnline === false || wasOnline === undefined) && u.onlineStatus === true) {
              setToast({
                id: `presence_${u.uid}_${Date.now()}`,
                message: `${u.displayName}มาแล้ว ❤️`,
                targetView: 'dashboard',
              });
            }
            nextMap[u.uid] = u.onlineStatus;
          }
        }
        partnerOnlineMapRef.current = nextMap;
        setRoomState((prev) => (prev ? { ...prev, users: msg.payload } : prev));
      } else if (msg.type === 'TYPING_STATUS') {
        if (msg.payload.uid !== currentUid) {
          setTypingUid(msg.payload.isTyping ? msg.payload.uid : null);
        }
      } else if (msg.type === 'CHAT_MESSAGE') {
        const incomingMsg = msg.payload;
        setRoomState((prev) => {
          if (!prev) return prev;
          const exists = prev.messages.some((m) => m.messageId === incomingMsg.messageId);
          if (exists) return prev;
          return {
            ...prev,
            messages: [...prev.messages, incomingMsg].slice(-500),
          };
        });

        if (
          incomingMsg.senderId !== currentUid &&
          lastChatNotifiedRef.current !== incomingMsg.messageId
        ) {
          lastChatNotifiedRef.current = incomingMsg.messageId;
          setTypingUid((prev) => (prev === incomingMsg.senderId ? null : prev));
          if (activeViewRef.current !== 'chat') {
            setUnreadChatCount((c) => c + 1);
            const preview =
              incomingMsg.message.length > 36
                ? `${incomingMsg.message.slice(0, 36)}...`
                : incomingMsg.message;
            setToast({
              id: incomingMsg.messageId,
              message: `${incomingMsg.senderName}: ${preview}`,
              targetView: 'chat',
            });
          }
        }
      } else if (msg.type === 'KRATHONG_FLOATED') {
        setRoomState(msg.payload.state);
        const floatedKrathong = msg.payload.krathong;

        if (
          floatedKrathong.ownerUid !== currentUid &&
          lastFloatedNotifiedRef.current !== floatedKrathong.krathongId
        ) {
          lastFloatedNotifiedRef.current = floatedKrathong.krathongId;
          setToast({
            id: floatedKrathong.krathongId,
            message: `กระทงของ${floatedKrathong.ownerName}มาถึงแล้ว`,
            targetView: 'river',
          });
        }

        checkAndTriggerSharedLove(msg.payload.state, currentUid);
      }
    },
    [checkAndTriggerSharedLove],
  );

  // Hydrate room state & attach real-time listener when logged in
  useEffect(() => {
    if (!session) {
      setBootstrapping(false);
      return;
    }

    let cancelled = false;
    setBootstrapping(true);
    setSyncError(null);

    fetchRoomState(session.user)
      .then((state) => {
        if (cancelled) return;
        const initPresence: Record<string, boolean> = {};
        for (const u of Object.values(state.users)) {
          if (u.uid !== session.user.uid) {
            initPresence[u.uid] = u.onlineStatus;
          }
        }
        partnerOnlineMapRef.current = initPresence;
        setRoomState(state);
        checkAndTriggerSharedLove(state, session.user.uid);
        setBootstrapping(false);

        realtimeRef.current?.unsubscribe();
        realtimeRef.current = subscribeRealtimeRoom(session.user, {
          onMessage: handleWsMessage,
          onConnectionChange: setWsConnected,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setSyncError(err instanceof Error ? err.message : 'ไม่สามารถเชื่อมต่อ Firestore ได้');
        setBootstrapping(false);
      });

    return () => {
      cancelled = true;
      realtimeRef.current?.unsubscribe();
      realtimeRef.current = null;
    };
  }, [session?.user.uid, session?.user.displayName, handleWsMessage, checkAndTriggerSharedLove]);

  // Auto-dismiss arrival toast after 6 seconds
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleLoginWithName = (displayName: string) => {
    const newSession = loginWithName(displayName);
    partnerOnlineMapRef.current = {};
    setUnreadChatCount(0);
    setTypingUid(null);
    setActiveView('dashboard');
    setSession(newSession);
  };

  const handleRename = async (nextName: string) => {
    if (!session) return;
    const { user, state } = await updateMyDisplayName(session.user, nextName);
    setSession((prev) => (prev ? { ...prev, user } : prev));
    setRoomState(state);
  };

  const handleConfirmLogout = () => {
    setLogoutModalOpen(false);
    realtimeRef.current?.unsubscribe();
    realtimeRef.current = null;
    logoutSession(session?.user);
    partnerOnlineMapRef.current = {};
    setSession(null);
    setRoomState(null);
    setWsConnected(false);
    setShowLoveOverlay(false);
    setTypingUid(null);
    setUnreadChatCount(0);
    setToast(null);
    setSyncError(null);
  };

  const handleSaveDraft = async (payload: KrathongDraftPayload) => {
    if (!session) return;
    const { state } = await saveMyKrathongDraft(session.user, payload);
    setRoomState(state);
  };

  const handleFloatKrathong = async (payload: KrathongDraftPayload) => {
    if (!session) return;
    const { state } = await floatMyKrathong(session.user, payload);
    setRoomState(state);
    setActiveView('river');
    checkAndTriggerSharedLove(state, session.user.uid);
  };

  const handleResetRoom = async () => {
    if (!session || !roomState) return;
    const nextState = await resetPrivateRoom(session.user, Object.keys(roomState.users));
    setRoomState(nextState);
    setShowLoveOverlay(false);
    lastFloatedNotifiedRef.current = null;
  };

  const handleSendChatMessage = async (message: string) => {
    if (!session) return;
    const created = await sendChatMessage(session.user, message);
    setRoomState((prev) => {
      if (!prev) return prev;
      if (prev.messages.some((m) => m.messageId === created.messageId)) return prev;
      return {
        ...prev,
        messages: [...prev.messages, created].slice(-500),
      };
    });
  };

  const handleTypingChange = useCallback((isTyping: boolean) => {
    const uid = sessionRef.current?.user.uid;
    if (!uid) return;
    realtimeRef.current?.sendTyping(uid, isTyping);
  }, []);

  const allKrathongsList = useMemo(() => {
    if (!roomState) return [];
    return Object.values(roomState.krathongs).filter(
      (k): k is NonNullable<typeof k> => Boolean(k),
    );
  }, [roomState]);

  const floatingCount = useMemo(
    () => allKrathongsList.filter((k) => k.status === KrathongStatus.FLOATING).length,
    [allKrathongsList],
  );

  const bothFloating = floatingCount >= 2;

  const hasSharedLoveEvent = useMemo(() => {
    if (!roomState) return false;
    return roomState.events.some((ev) => ev.eventType === 'SHARED_LOVE_MOMENT');
  }, [roomState]);

  if (!session) {
    return <LoginPage onLogin={handleLoginWithName} />;
  }

  if (syncError && !roomState) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#070714] px-4 text-center">
        <div className="max-w-md rounded-2xl border border-rose-400/30 bg-[#120b24] p-6">
          <p className="text-sm font-medium text-rose-200">ไม่สามารถเชื่อมต่อฐานข้อมูล Firestore ได้</p>
          <p className="mt-2 break-words text-xs text-slate-400">{syncError}</p>
          <button
            type="button"
            onClick={handleConfirmLogout}
            className="mt-4 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500"
          >
            กลับไปหน้าเข้าสู่ระบบ
          </button>
        </div>
      </div>
    );
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
  const partnerUser = resolvePartnerUser(roomState.users, currentUser.uid);
  const myKrathong = roomState.krathongs[currentUser.uid];
  const typingUserName = typingUid ? roomState.users[typingUid]?.displayName ?? null : null;

  return (
    <div className="min-h-screen bg-[#070714] text-slate-100">
      <TopNav
        activeView={activeView}
        unreadChatCount={unreadChatCount}
        onNavigate={navigateTo}
        onRequestLogout={() => setLogoutModalOpen(true)}
      />

      {/* Real-time Notification Toast when partner arrives, floats krathong, or sends chat */}
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
            {toast.targetView === 'chat' ? (
              <MessageCircle className="h-4 w-4 shrink-0 text-pink-300" />
            ) : (
              <Heart className="h-4 w-4 shrink-0 fill-pink-400 text-pink-400" />
            )}
            <span className="text-sm font-medium text-white">{toast.message}</span>
            {activeView !== toast.targetView && (
              <button
                type="button"
                onClick={() => {
                  navigateTo(toast.targetView);
                  setToast(null);
                }}
                className="rounded-md bg-pink-500/20 px-2.5 py-1 text-xs font-medium text-pink-200 hover:bg-pink-500/30 whitespace-nowrap"
              >
                {toast.targetView === 'chat'
                  ? 'เปิดแชต'
                  : toast.targetView === 'river'
                    ? 'ไปดูเลย'
                    : 'ดูสถานะ'}
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
            partnerUser={partnerUser}
            roomState={roomState}
            wsConnected={wsConnected}
            unreadChatCount={unreadChatCount}
            onNavigate={navigateTo}
            onRename={handleRename}
          />
        )}

        {activeView === 'studio' && (
          <KrathongStudioView
            currentUser={currentUser}
            myKrathong={myKrathong}
            onSaveDraft={handleSaveDraft}
            onFloatKrathong={handleFloatKrathong}
            onGoToRiver={() => navigateTo('river')}
          />
        )}

        {activeView === 'river' && (
          <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h1 className="font-display text-xl font-semibold text-white sm:text-2xl">
                  {partnerUser
                    ? `แม่น้ำกาแล็กซีของ ${currentUser.displayName} และ ${partnerUser.displayName}`
                    : `แม่น้ำกาแล็กซีของ ${currentUser.displayName}`}
                </h1>
                <p className="text-xs text-slate-400">
                  พื้นที่แม่น้ำส่วนกลาง · แสดงเฉพาะกระทงที่ลอยแล้วแบบเรียลไทม์
                </p>
              </div>
              <div className="font-mono-tabular text-xs text-slate-400">
                ลอยแล้ว {floatingCount} / {Math.max(2, floatingCount)} ใบ
              </div>
            </div>

            <div className="relative h-[calc(100vh-175px)] min-h-[480px] w-full">
              <GalaxyRiverCanvas
                krathongs={allKrathongsList}
                sharedLoveActive={bothFloating}
                hasSharedLoveEvent={hasSharedLoveEvent && bothFloating}
                myName={currentUser.displayName}
                partnerName={partnerUser?.displayName}
                onReplaySharedLove={() => setShowLoveOverlay(true)}
              />
            </div>
          </div>
        )}

        {activeView === 'chat' && (
          <ChatView
            currentUser={currentUser}
            partnerUser={partnerUser}
            usersMap={roomState.users}
            messages={roomState.messages ?? []}
            typingUserName={typingUserName}
            onSendMessage={handleSendChatMessage}
            onTypingChange={handleTypingChange}
            onBackToRiver={() => navigateTo('river')}
          />
        )}

        {activeView === 'hearts' && (
          <TwoHeartsView
            currentUser={currentUser}
            partnerUser={partnerUser}
            roomState={roomState}
            onResetRoom={handleResetRoom}
          />
        )}
      </main>

      {partnerUser && (
        <SharedLoveOverlay
          visible={activeView === 'river' && bothFloating && showLoveOverlay}
          myName={currentUser.displayName}
          partnerName={partnerUser.displayName}
          onDismiss={() => setShowLoveOverlay(false)}
        />
      )}

      <LogoutConfirmModal
        open={logoutModalOpen}
        displayName={currentUser.displayName}
        onCancel={() => setLogoutModalOpen(false)}
        onConfirm={handleConfirmLogout}
      />
    </div>
  );
}
