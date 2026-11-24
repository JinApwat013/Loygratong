import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  AuthSession,
  ChatMessage,
  Krathong,
  KrathongDecoration,
  KrathongDesign,
  KrathongStatus,
  PRIVATE_ROOM_ID,
  PRIVATE_ROOM_NAME,
  RoomEvent,
  RoomState,
  RoomUser,
  UserRole,
  WsServerMessage,
} from '../types/universe';
import {
  db,
  handleFirestoreError,
  OperationType,
  setActiveDiagnosticUserId,
  testFirestoreConnection,
} from './firebase';

const TAB_SESSION_KEY = 'olu_tab_session_v2';
const LS_ACTIVE_SESSION_KEY = 'olu_active_session_v1';
const LS_SAVED_PROFILE_KEY = 'olu_saved_profile_v1';
const LS_ROOM_STATE_KEY = `olu_room_state_${PRIVATE_ROOM_ID}`;
const LS_KRATHONG_PREFIX = 'olu_krathong_';
const LS_EVENTS_KEY = `olu_events_${PRIVATE_ROOM_ID}`;
const LS_CHAT_KEY = `olu_chat_messages_${PRIVATE_ROOM_ID}`;
const LS_SEEN_EVENT_PREFIX = 'olu_seen_love_event_';

const KRATHONGS_COLLECTION = 'krathongs';
const ROOM_USERS_COLLECTION = 'room_users';
const CHAT_MESSAGES_COLLECTION = 'chat_messages';
const ROOM_EVENTS_COLLECTION = 'room_events';

export interface RememberedProfile {
  uid: string;
  displayName: string;
}

export interface KrathongDraftPayload {
  design: KrathongDesign;
  flowerColor: string;
  candleColor: string;
  decoration: KrathongDecoration;
  wishMessage: string;
  showWish: boolean;
}

/**
 * Generates a stable, deterministic User ID from the user's trimmed name
 * so returning with the same name always maps to the same User ID.
 */
export function createUidFromName(displayName: string): string {
  const normalized = displayName.trim().toLowerCase();
  const bytes = new TextEncoder().encode(normalized);
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < bytes.length; i++) {
    h1 ^= bytes[i];
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= bytes[i] + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(4, '0').slice(0, 4);
  return `user_${part1}${part2}`;
}

export function getRememberedProfile(): RememberedProfile | null {
  try {
    const raw = localStorage.getItem(LS_SAVED_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberedProfile>;
    if (
      typeof parsed?.uid === 'string' &&
      typeof parsed?.displayName === 'string' &&
      parsed.displayName.trim()
    ) {
      return {
        uid: parsed.uid,
        displayName: parsed.displayName.trim(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveRememberedProfile(uid: string, displayName: string): void {
  try {
    localStorage.setItem(
      LS_SAVED_PROFILE_KEY,
      JSON.stringify({ uid, displayName: displayName.trim() }),
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function getSavedTabSession(): AuthSession | null {
  try {
    const tabRaw = sessionStorage.getItem(TAB_SESSION_KEY);
    if (tabRaw) {
      const parsed = JSON.parse(tabRaw) as AuthSession;
      if (parsed?.user?.uid && parsed?.user?.displayName) {
        setActiveDiagnosticUserId(parsed.user.uid);
        return parsed;
      }
    }
    const localRaw = localStorage.getItem(LS_ACTIVE_SESSION_KEY);
    if (localRaw) {
      const parsed = JSON.parse(localRaw) as AuthSession;
      if (parsed?.user?.uid && parsed?.user?.displayName) {
        sessionStorage.setItem(TAB_SESSION_KEY, localRaw);
        setActiveDiagnosticUserId(parsed.user.uid);
        return parsed;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function saveTabSession(session: AuthSession): void {
  try {
    setActiveDiagnosticUserId(session.user.uid);
    const encoded = JSON.stringify(session);
    sessionStorage.setItem(TAB_SESSION_KEY, encoded);
    localStorage.setItem(LS_ACTIVE_SESSION_KEY, encoded);
  } catch {
    // Ignore storage errors
  }
}

export function clearTabSession(): void {
  try {
    setActiveDiagnosticUserId(null);
    sessionStorage.removeItem(TAB_SESSION_KEY);
    localStorage.removeItem(LS_ACTIVE_SESSION_KEY);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Pure client-side name-only login.
 * Never calls fetch(), never uses API endpoints, and never parses response.json().
 */
export function loginWithName(displayName: string): AuthSession {
  const trimmed = displayName.trim().slice(0, 40);
  if (!trimmed) {
    throw new Error('กรุณากรอกชื่อก่อนเข้าสู่ระบบ');
  }

  const uid = createUidFromName(trimmed);
  const now = new Date().toISOString();
  const user: RoomUser = {
    uid,
    displayName: trimmed,
    role: UserRole.MEMBER,
    onlineStatus: true,
    lastSeen: now,
  };

  const session: AuthSession = {
    token: uid,
    user,
  };

  saveTabSession(session);
  saveRememberedProfile(uid, trimmed);
  return session;
}

export function logoutSession(user?: RoomUser): void {
  clearTabSession();
  if (user) {
    const userDocId = `${PRIVATE_ROOM_ID}_${user.uid}`;
    updateDoc(doc(db, ROOM_USERS_COLLECTION, userDocId), {
      onlineStatus: false,
      isTyping: false,
      lastSeen: new Date().toISOString(),
    }).catch(() => {
      // Ignore background presence cleanup errors on logout
    });
  }
}

export function mirrorStateToLocalStorage(state: RoomState): void {
  try {
    localStorage.setItem(LS_ROOM_STATE_KEY, JSON.stringify(state));
    for (const [uid, krathong] of Object.entries(state.krathongs)) {
      localStorage.setItem(`${LS_KRATHONG_PREFIX}${uid}`, JSON.stringify(krathong));
    }
    localStorage.setItem(LS_EVENTS_KEY, JSON.stringify(state.events));
    if (Array.isArray(state.messages)) {
      localStorage.setItem(LS_CHAT_KEY, JSON.stringify(state.messages));
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function hasSeenLoveEvent(uid: string, eventId: string): boolean {
  try {
    return localStorage.getItem(`${LS_SEEN_EVENT_PREFIX}${uid}`) === eventId;
  } catch {
    return false;
  }
}

export function markLoveEventSeen(uid: string, eventId: string): void {
  try {
    localStorage.setItem(`${LS_SEEN_EVENT_PREFIX}${uid}`, eventId);
  } catch {
    // Ignore storage errors
  }
}

export function clearAllSeenLoveEvents(uids: string[]): void {
  try {
    for (const uid of uids) {
      localStorage.removeItem(`${LS_SEEN_EVENT_PREFIX}${uid}`);
    }
  } catch {
    // Ignore storage errors
  }
}

function getKrathongDocId(uid: string): string {
  return `${PRIVATE_ROOM_ID}_${uid}`;
}

function getRoomUserDocId(uid: string): string {
  return `${PRIVATE_ROOM_ID}_${uid}`;
}

async function upsertRoomUser(
  user: RoomUser,
  onlineStatus: boolean,
  isTyping = false,
): Promise<void> {
  const userDocId = getRoomUserDocId(user.uid);
  const path = `${ROOM_USERS_COLLECTION}/${userDocId}`;
  const ref = doc(db, ROOM_USERS_COLLECTION, userDocId);
  const now = new Date().toISOString();

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        displayName: user.displayName,
        roomId: PRIVATE_ROOM_ID,
        role: UserRole.MEMBER,
        onlineStatus,
        isTyping,
        lastSeen: now,
      });
    } else {
      await updateDoc(ref, {
        displayName: user.displayName,
        onlineStatus,
        isTyping,
        lastSeen: now,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

function createEmptyRoomState(): RoomState {
  return {
    room: {
      roomId: PRIVATE_ROOM_ID,
      roomName: PRIVATE_ROOM_NAME,
      memberUids: [],
      createdAt: new Date().toISOString(),
    },
    users: {},
    krathongs: {},
    events: [],
    messages: [],
  };
}

export async function fetchRoomState(user: RoomUser): Promise<RoomState> {
  setActiveDiagnosticUserId(user.uid);
  await testFirestoreConnection();
  await upsertRoomUser(user, true, false);

  const state = createEmptyRoomState();

  // 1. Fetch all room members in OUR_LOVE_ROOM_001
  try {
    const usersSnap = await getDocs(
      query(collection(db, ROOM_USERS_COLLECTION), where('roomId', '==', PRIVATE_ROOM_ID)),
    );
    usersSnap.forEach((docSnap) => {
      const data = docSnap.data() as RoomUser;
      if (data?.uid) {
        state.users[data.uid] = {
          uid: data.uid,
          displayName: data.displayName,
          role: UserRole.MEMBER,
          onlineStatus: Boolean(data.onlineStatus),
          lastSeen: data.lastSeen,
        };
      }
    });
    state.room.memberUids = Object.keys(state.users);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, ROOM_USERS_COLLECTION);
  }

  // 2. Fetch ALL krathongs in OUR_LOVE_ROOM_001 (never filter by current user's ownerUid!)
  try {
    const krathongsSnap = await getDocs(
      query(collection(db, KRATHONGS_COLLECTION), where('roomId', '==', PRIVATE_ROOM_ID)),
    );
    krathongsSnap.forEach((docSnap) => {
      const k = docSnap.data() as Krathong;
      if (k?.ownerUid) {
        state.krathongs[k.ownerUid] = k;
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, KRATHONGS_COLLECTION);
  }

  // 3. Fetch chat messages in OUR_LOVE_ROOM_001
  try {
    const msgsSnap = await getDocs(
      query(collection(db, CHAT_MESSAGES_COLLECTION), where('roomId', '==', PRIVATE_ROOM_ID)),
    );
    const list: ChatMessage[] = [];
    msgsSnap.forEach((docSnap) => {
      list.push(docSnap.data() as ChatMessage);
    });
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    state.messages = list.slice(-500);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, CHAT_MESSAGES_COLLECTION);
  }

  // 4. Fetch room events in OUR_LOVE_ROOM_001
  try {
    const eventsSnap = await getDocs(
      query(collection(db, ROOM_EVENTS_COLLECTION), where('roomId', '==', PRIVATE_ROOM_ID)),
    );
    const events: RoomEvent[] = [];
    eventsSnap.forEach((docSnap) => {
      events.push(docSnap.data() as RoomEvent);
    });
    events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    state.events = events;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, ROOM_EVENTS_COLLECTION);
  }

  mirrorStateToLocalStorage(state);
  return state;
}

export async function updateMyDisplayName(
  user: RoomUser,
  displayName: string,
): Promise<{ user: RoomUser; state: RoomState }> {
  const trimmed = displayName.trim().slice(0, 40);
  if (!trimmed) {
    throw new Error('กรุณากรอกชื่อก่อนบันทึก');
  }

  const now = new Date().toISOString();
  const updatedUser: RoomUser = {
    ...user,
    displayName: trimmed,
    lastSeen: now,
  };

  await upsertRoomUser(updatedUser, true, false);

  // Update ownerName on user's krathong if it exists
  const krathongDocId = getKrathongDocId(user.uid);
  const krathongRef = doc(db, KRATHONGS_COLLECTION, krathongDocId);
  try {
    const kSnap = await getDoc(krathongRef);
    if (kSnap.exists()) {
      await updateDoc(krathongRef, {
        ownerName: trimmed,
        updatedAt: now,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${KRATHONGS_COLLECTION}/${krathongDocId}`);
  }

  // Update senderName on user's past chat messages
  try {
    const msgsSnap = await getDocs(
      query(
        collection(db, CHAT_MESSAGES_COLLECTION),
        where('roomId', '==', PRIVATE_ROOM_ID),
        where('senderId', '==', user.uid),
      ),
    );
    if (!msgsSnap.empty) {
      const batch = writeBatch(db);
      msgsSnap.forEach((docSnap) => {
        batch.update(docSnap.ref, { senderName: trimmed });
      });
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, CHAT_MESSAGES_COLLECTION);
  }

  saveTabSession({ token: updatedUser.uid, user: updatedUser });
  saveRememberedProfile(updatedUser.uid, trimmed);
  const state = await fetchRoomState(updatedUser);
  return { user: updatedUser, state };
}

export async function saveMyKrathongDraft(
  user: RoomUser,
  payload: KrathongDraftPayload,
): Promise<{ krathong: Krathong; state: RoomState }> {
  const krathongId = getKrathongDocId(user.uid);
  const path = `${KRATHONGS_COLLECTION}/${krathongId}`;
  const ref = doc(db, KRATHONGS_COLLECTION, krathongId);

  let existing: Krathong | null = null;
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      existing = snap.data() as Krathong;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (existing && existing.status === KrathongStatus.FLOATING) {
    throw new Error(`กระทงของ${user.displayName}ลอยลงสู่แม่น้ำกาแล็กซีแล้ว ไม่สามารถแก้ไขเพิ่มเติมได้`);
  }

  const now = new Date().toISOString();
  const krathong: Krathong = {
    krathongId,
    ownerUid: user.uid,
    ownerName: user.displayName,
    roomId: PRIVATE_ROOM_ID,
    design: payload.design,
    flowerColor: payload.flowerColor,
    candleColor: payload.candleColor,
    decoration: payload.decoration,
    wishMessage: payload.wishMessage.trim().slice(0, 220),
    showWish: payload.showWish,
    status: KrathongStatus.DRAFT,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    floatedAt: null,
  };

  try {
    if (!existing) {
      await setDoc(ref, krathong);
    } else {
      await updateDoc(ref, {
        ownerName: krathong.ownerName,
        design: krathong.design,
        flowerColor: krathong.flowerColor,
        candleColor: krathong.candleColor,
        decoration: krathong.decoration,
        wishMessage: krathong.wishMessage,
        showWish: krathong.showWish,
        status: KrathongStatus.DRAFT,
        updatedAt: now,
        floatedAt: null,
      });
    }
  } catch (error) {
    handleFirestoreError(error, existing ? OperationType.UPDATE : OperationType.CREATE, path);
  }

  const state = await fetchRoomState(user);
  return { krathong, state };
}

async function ensureSharedLoveMomentIfBothFloated(): Promise<void> {
  const krathongsSnap = await getDocs(
    query(collection(db, KRATHONGS_COLLECTION), where('roomId', '==', PRIVATE_ROOM_ID)),
  );
  let floatingCount = 0;
  krathongsSnap.forEach((docSnap) => {
    const data = docSnap.data() as Krathong;
    if (data?.status === KrathongStatus.FLOATING) {
      floatingCount++;
    }
  });

  if (floatingCount >= 2) {
    const eventId = `evt_love_${PRIVATE_ROOM_ID}`;
    const eventRef = doc(db, ROOM_EVENTS_COLLECTION, eventId);
    const existingEvent = await getDoc(eventRef);
    if (!existingEvent.exists()) {
      const eventDoc: RoomEvent = {
        eventId,
        roomId: PRIVATE_ROOM_ID,
        eventType: 'SHARED_LOVE_MOMENT',
        createdAt: new Date().toISOString(),
      };
      await setDoc(eventRef, eventDoc);
    }
  }
}

export async function floatMyKrathong(
  user: RoomUser,
  payload: KrathongDraftPayload,
): Promise<{ krathong: Krathong; state: RoomState }> {
  const krathongId = getKrathongDocId(user.uid);
  const path = `${KRATHONGS_COLLECTION}/${krathongId}`;
  const ref = doc(db, KRATHONGS_COLLECTION, krathongId);

  let existing: Krathong | null = null;
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      existing = snap.data() as Krathong;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (existing && existing.status === KrathongStatus.FLOATING) {
    const state = await fetchRoomState(user);
    return { krathong: existing, state };
  }

  const now = new Date().toISOString();
  const krathong: Krathong = {
    krathongId,
    ownerUid: user.uid,
    ownerName: user.displayName,
    roomId: PRIVATE_ROOM_ID,
    design: payload.design,
    flowerColor: payload.flowerColor,
    candleColor: payload.candleColor,
    decoration: payload.decoration,
    wishMessage: payload.wishMessage.trim().slice(0, 220),
    showWish: payload.showWish,
    status: KrathongStatus.FLOATING,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    floatedAt: now,
  };

  try {
    if (!existing) {
      await setDoc(ref, krathong);
    } else {
      await updateDoc(ref, {
        ownerName: krathong.ownerName,
        design: krathong.design,
        flowerColor: krathong.flowerColor,
        candleColor: krathong.candleColor,
        decoration: krathong.decoration,
        wishMessage: krathong.wishMessage,
        showWish: krathong.showWish,
        status: KrathongStatus.FLOATING,
        updatedAt: now,
        floatedAt: now,
      });
    }
  } catch (error) {
    handleFirestoreError(error, existing ? OperationType.UPDATE : OperationType.CREATE, path);
  }

  try {
    await ensureSharedLoveMomentIfBothFloated();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, ROOM_EVENTS_COLLECTION);
  }

  const state = await fetchRoomState(user);
  return { krathong, state };
}

export async function resetPrivateRoom(
  user: RoomUser,
  memberUids: string[],
): Promise<RoomState> {
  try {
    const batch = writeBatch(db);
    const krathongsSnap = await getDocs(
      query(collection(db, KRATHONGS_COLLECTION), where('roomId', '==', PRIVATE_ROOM_ID)),
    );
    krathongsSnap.forEach((docSnap) => batch.delete(docSnap.ref));

    const eventsSnap = await getDocs(
      query(collection(db, ROOM_EVENTS_COLLECTION), where('roomId', '==', PRIVATE_ROOM_ID)),
    );
    eventsSnap.forEach((docSnap) => batch.delete(docSnap.ref));

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, KRATHONGS_COLLECTION);
  }

  clearAllSeenLoveEvents(memberUids);
  const state = await fetchRoomState(user);
  return state;
}

export async function sendChatMessage(user: RoomUser, message: string): Promise<ChatMessage> {
  const trimmed = message.trim().slice(0, 1000);
  if (!trimmed) {
    throw new Error('กรุณาพิมพ์ข้อความก่อนส่ง');
  }

  const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const chatMessage: ChatMessage = {
    messageId,
    roomId: PRIVATE_ROOM_ID,
    senderId: user.uid,
    senderName: user.displayName,
    message: trimmed,
    createdAt: new Date().toISOString(),
  };

  const path = `${CHAT_MESSAGES_COLLECTION}/${messageId}`;
  try {
    await setDoc(doc(db, CHAT_MESSAGES_COLLECTION, messageId), chatMessage);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  return chatMessage;
}

export interface RealtimeSubscriptionHandlers {
  onMessage: (message: WsServerMessage) => void;
  onConnectionChange: (connected: boolean) => void;
}

export interface RealtimeSubscriptionHandle {
  unsubscribe: () => void;
  sendTyping: (uid: string, isTyping: boolean) => void;
}

export function subscribeRealtimeRoom(
  user: RoomUser,
  handlers: RealtimeSubscriptionHandlers,
): RealtimeSubscriptionHandle {
  let closed = false;

  const liveState: RoomState = createEmptyRoomState();
  let prevFloatedIds = new Set<string>();
  let prevMsgIds = new Set<string>();
  let initializedMessages = false;
  let initializedKrathongs = false;

  const emitRoomSync = () => {
    if (closed) return;
    const cloned: RoomState = {
      room: { ...liveState.room, memberUids: [...liveState.room.memberUids] },
      users: { ...liveState.users },
      krathongs: { ...liveState.krathongs },
      events: [...liveState.events],
      messages: [...liveState.messages],
    };
    mirrorStateToLocalStorage(cloned);
    handlers.onMessage({ type: 'ROOM_SYNC', payload: cloned });
  };

  // Mark online immediately in Firestore
  upsertRoomUser(user, true, false).catch(() => {
    // Error handled inside upsertRoomUser
  });
  handlers.onConnectionChange(true);

  const handlePageUnload = () => {
    const userDocId = getRoomUserDocId(user.uid);
    updateDoc(doc(db, ROOM_USERS_COLLECTION, userDocId), {
      onlineStatus: false,
      isTyping: false,
      lastSeen: new Date().toISOString(),
    }).catch(() => {});
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', handlePageUnload);
  }

  // 1. Real-time onSnapshot for ALL krathongs in OUR_LOVE_ROOM_001 (never filtered by ownerUid)
  const krathongsQuery = query(
    collection(db, KRATHONGS_COLLECTION),
    where('roomId', '==', PRIVATE_ROOM_ID),
  );
  const unsubKrathongs = onSnapshot(
    krathongsQuery,
    (snapshot) => {
      if (closed) return;
      handlers.onConnectionChange(true);

      const nextKrathongs: Record<string, Krathong> = {};
      const nextFloatedIds = new Set<string>();
      const newlyFloated: Krathong[] = [];

      snapshot.forEach((docSnap) => {
        const k = docSnap.data() as Krathong;
        if (k?.ownerUid) {
          nextKrathongs[k.ownerUid] = k;
          if (k.status === KrathongStatus.FLOATING) {
            nextFloatedIds.add(k.krathongId);
            if (initializedKrathongs && !prevFloatedIds.has(k.krathongId)) {
              newlyFloated.push(k);
            }
          }
        }
      });

      const wasNonEmpty = Object.keys(liveState.krathongs).length > 0;
      liveState.krathongs = nextKrathongs;
      prevFloatedIds = nextFloatedIds;
      initializedKrathongs = true;

      emitRoomSync();

      for (const k of newlyFloated) {
        handlers.onMessage({
          type: 'KRATHONG_FLOATED',
          payload: {
            krathong: k,
            state: {
              ...liveState,
              users: { ...liveState.users },
              krathongs: { ...liveState.krathongs },
              events: [...liveState.events],
              messages: [...liveState.messages],
            },
          },
        });
      }

      if (wasNonEmpty && Object.keys(nextKrathongs).length === 0) {
        handlers.onMessage({
          type: 'ROOM_RESET',
          payload: {
            ...liveState,
            users: { ...liveState.users },
            krathongs: {},
            events: [],
            messages: [...liveState.messages],
          },
        });
      }
    },
    (error) => {
      handlers.onConnectionChange(false);
      handleFirestoreError(error, OperationType.LIST, KRATHONGS_COLLECTION);
    },
  );

  // 2. Real-time onSnapshot for room users (presence + typing + display names)
  const usersQuery = query(
    collection(db, ROOM_USERS_COLLECTION),
    where('roomId', '==', PRIVATE_ROOM_ID),
  );
  const unsubUsers = onSnapshot(
    usersQuery,
    (snapshot) => {
      if (closed) return;
      const nextUsers: Record<string, RoomUser> = {};
      snapshot.forEach((docSnap) => {
        const raw = docSnap.data() as RoomUser & { isTyping?: boolean };
        if (raw?.uid) {
          nextUsers[raw.uid] = {
            uid: raw.uid,
            displayName: raw.displayName,
            role: UserRole.MEMBER,
            onlineStatus: Boolean(raw.onlineStatus),
            lastSeen: raw.lastSeen,
          };
          if (raw.uid !== user.uid) {
            handlers.onMessage({
              type: 'TYPING_STATUS',
              payload: { uid: raw.uid, isTyping: Boolean(raw.isTyping) },
            });
          }
        }
      });

      liveState.users = nextUsers;
      liveState.room.memberUids = Object.keys(nextUsers);
      mirrorStateToLocalStorage(liveState);
      handlers.onMessage({ type: 'PRESENCE_UPDATE', payload: nextUsers });
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, ROOM_USERS_COLLECTION);
    },
  );

  // 3. Real-time onSnapshot for chat messages in OUR_LOVE_ROOM_001
  const messagesQuery = query(
    collection(db, CHAT_MESSAGES_COLLECTION),
    where('roomId', '==', PRIVATE_ROOM_ID),
  );
  const unsubMessages = onSnapshot(
    messagesQuery,
    (snapshot) => {
      if (closed) return;
      const list: ChatMessage[] = [];
      snapshot.forEach((docSnap) => {
        list.push(docSnap.data() as ChatMessage);
      });
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const trimmedList = list.slice(-500);

      const newMessages: ChatMessage[] = [];
      const nextMsgIds = new Set<string>();
      for (const m of trimmedList) {
        nextMsgIds.add(m.messageId);
        if (initializedMessages && !prevMsgIds.has(m.messageId)) {
          newMessages.push(m);
        }
      }

      liveState.messages = trimmedList;
      prevMsgIds = nextMsgIds;
      initializedMessages = true;

      emitRoomSync();
      for (const m of newMessages) {
        handlers.onMessage({ type: 'CHAT_MESSAGE', payload: m });
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, CHAT_MESSAGES_COLLECTION);
    },
  );

  // 4. Real-time onSnapshot for room events (SHARED_LOVE_MOMENT)
  const eventsQuery = query(
    collection(db, ROOM_EVENTS_COLLECTION),
    where('roomId', '==', PRIVATE_ROOM_ID),
  );
  const unsubEvents = onSnapshot(
    eventsQuery,
    (snapshot) => {
      if (closed) return;
      const events: RoomEvent[] = [];
      snapshot.forEach((docSnap) => {
        events.push(docSnap.data() as RoomEvent);
      });
      events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      liveState.events = events;
      emitRoomSync();
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, ROOM_EVENTS_COLLECTION);
    },
  );

  const sendTyping = (uid: string, isTyping: boolean) => {
    if (closed) return;
    const userDocId = getRoomUserDocId(uid);
    updateDoc(doc(db, ROOM_USERS_COLLECTION, userDocId), {
      isTyping,
      lastSeen: new Date().toISOString(),
    }).catch(() => {
      // Ignore typing update transient errors
    });
  };

  const unsubscribe = () => {
    closed = true;
    handlers.onConnectionChange(false);
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', handlePageUnload);
    }
    unsubKrathongs();
    unsubUsers();
    unsubMessages();
    unsubEvents();
  };

  return { unsubscribe, sendTyping };
}
