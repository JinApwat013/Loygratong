import {
  AuthSession,
  ChatMessage,
  Krathong,
  KrathongDecoration,
  KrathongDesign,
  KrathongStatus,
  PRIVATE_ROOM_ID,
  PRIVATE_ROOM_NAME,
  RoomState,
  RoomUser,
  UserRole,
  WsClientMessage,
  WsServerMessage,
} from '../types/universe';

const TAB_SESSION_KEY = 'olu_tab_session_v2';
const LS_ACTIVE_SESSION_KEY = 'olu_active_session_v1';
const LS_SAVED_PROFILE_KEY = 'olu_saved_profile_v1';
const LS_ROOM_STATE_KEY = `olu_room_state_${PRIVATE_ROOM_ID}`;
const LS_KRATHONG_PREFIX = 'olu_krathong_';
const LS_EVENTS_KEY = `olu_events_${PRIVATE_ROOM_ID}`;
const LS_CHAT_KEY = `olu_chat_messages_${PRIVATE_ROOM_ID}`;
const LS_SEEN_EVENT_PREFIX = 'olu_seen_love_event_';
const BROADCAST_CHANNEL_NAME = 'olu_universe_channel_v1';

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
        return parsed;
      }
    }
    const localRaw = localStorage.getItem(LS_ACTIVE_SESSION_KEY);
    if (localRaw) {
      const parsed = JSON.parse(localRaw) as AuthSession;
      if (parsed?.user?.uid && parsed?.user?.displayName) {
        sessionStorage.setItem(TAB_SESSION_KEY, localRaw);
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
    const encoded = JSON.stringify(session);
    sessionStorage.setItem(TAB_SESSION_KEY, encoded);
    localStorage.setItem(LS_ACTIVE_SESSION_KEY, encoded);
  } catch {
    // Ignore storage errors
  }
}

export function clearTabSession(): void {
  try {
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
  upsertLocalRoomUser(user);
  return session;
}

export function logoutSession(): void {
  clearTabSession();
}

function readLocalRoomState(seedUser?: RoomUser): RoomState {
  const now = new Date().toISOString();
  let state: RoomState = {
    room: {
      roomId: PRIVATE_ROOM_ID,
      roomName: PRIVATE_ROOM_NAME,
      memberUids: [],
      createdAt: now,
    },
    users: {},
    krathongs: {},
    events: [],
    messages: [],
  };

  try {
    const raw = localStorage.getItem(LS_ROOM_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RoomState;
      if (parsed?.room?.roomId === PRIVATE_ROOM_ID) {
        state = {
          room: {
            roomId: PRIVATE_ROOM_ID,
            roomName: PRIVATE_ROOM_NAME,
            memberUids: Array.isArray(parsed.room.memberUids) ? parsed.room.memberUids : [],
            createdAt: parsed.room.createdAt || now,
          },
          users: parsed.users ?? {},
          krathongs: parsed.krathongs ?? {},
          events: Array.isArray(parsed.events) ? parsed.events : [],
          messages: Array.isArray(parsed.messages) ? parsed.messages : [],
        };
      }
    }
  } catch {
    // Fallback to empty state
  }

  if (seedUser) {
    state.users[seedUser.uid] = {
      ...state.users[seedUser.uid],
      ...seedUser,
      onlineStatus: true,
      lastSeen: now,
    };
    if (!state.room.memberUids.includes(seedUser.uid)) {
      state.room.memberUids.push(seedUser.uid);
    }
  }

  return state;
}

function upsertLocalRoomUser(user: RoomUser): RoomState {
  const state = readLocalRoomState(user);
  mirrorStateToLocalStorage(state);
  return state;
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

export function appendChatMessageToLocalStorage(msg: ChatMessage): void {
  try {
    const raw = localStorage.getItem(LS_CHAT_KEY);
    const list: ChatMessage[] = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
    if (!list.some((item) => item.messageId === msg.messageId)) {
      list.push(msg);
      localStorage.setItem(LS_CHAT_KEY, JSON.stringify(list.slice(-500)));
    }
    const state = readLocalRoomState();
    if (!state.messages.some((item) => item.messageId === msg.messageId)) {
      state.messages = [...state.messages, msg].slice(-500);
      localStorage.setItem(LS_ROOM_STATE_KEY, JSON.stringify(state));
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

function buildUserHeaders(user: RoomUser): Record<string, string> {
  return {
    'X-User-Id': user.uid,
    'X-User-Name': encodeURIComponent(user.displayName),
  };
}

/**
 * Safely parses JSON only if the server actually returned JSON.
 * Prevents "Unexpected token 'T', 'The page c'..." when an endpoint returns HTML or plain text.
 */
async function safeParseJson<T>(res: Response): Promise<T | null> {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return null;
  }
  try {
    const text = await res.text();
    const trimmed = text.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return null;
    }
    return JSON.parse(trimmed) as T;
  } catch {
    return null;
  }
}

export async function fetchRoomState(user: RoomUser): Promise<RoomState> {
  try {
    const res = await fetch('/api/room', {
      headers: buildUserHeaders(user),
    });
    if (res.ok) {
      const serverState = await safeParseJson<RoomState>(res);
      if (serverState?.room?.roomId === PRIVATE_ROOM_ID) {
        mirrorStateToLocalStorage(serverState);
        return serverState;
      }
    }
  } catch {
    // Fallback cleanly to localStorage state when backend is unavailable
  }

  return upsertLocalRoomUser(user);
}

export async function updateMyDisplayName(
  user: RoomUser,
  displayName: string,
): Promise<{ user: RoomUser; state: RoomState }> {
  const trimmed = displayName.trim().slice(0, 40);
  if (!trimmed) {
    throw new Error('กรุณากรอกชื่อก่อนบันทึก');
  }

  try {
    const res = await fetch('/api/auth/name', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...buildUserHeaders(user),
      },
      body: JSON.stringify({ displayName: trimmed }),
    });
    if (res.ok) {
      const data = await safeParseJson<{ user: RoomUser; state: RoomState }>(res);
      if (data?.user && data?.state) {
        saveTabSession({ token: data.user.uid, user: data.user });
        saveRememberedProfile(data.user.uid, data.user.displayName);
        mirrorStateToLocalStorage(data.state);
        notifyLocalTabs({ type: 'ROOM_SYNC', payload: data.state });
        return data;
      }
    }
  } catch {
    // Fallback to localStorage update
  }

  const updatedUser: RoomUser = {
    ...user,
    displayName: trimmed,
    lastSeen: new Date().toISOString(),
  };
  const state = readLocalRoomState(updatedUser);
  if (state.krathongs[user.uid]) {
    state.krathongs[user.uid].ownerName = trimmed;
  }
  state.messages = state.messages.map((m) =>
    m.senderId === user.uid ? { ...m, senderName: trimmed } : m,
  );
  saveTabSession({ token: updatedUser.uid, user: updatedUser });
  saveRememberedProfile(updatedUser.uid, trimmed);
  mirrorStateToLocalStorage(state);
  notifyLocalTabs({ type: 'ROOM_SYNC', payload: state });
  return { user: updatedUser, state };
}

export async function saveMyKrathongDraft(
  user: RoomUser,
  payload: KrathongDraftPayload,
): Promise<{ krathong: Krathong; state: RoomState }> {
  try {
    const res = await fetch('/api/krathong', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...buildUserHeaders(user),
      },
      body: JSON.stringify(payload),
    });
    const data = await safeParseJson<{ krathong?: Krathong; state?: RoomState; error?: string }>(res);
    if (!res.ok && data?.error) {
      throw new Error(data.error);
    }
    if (res.ok && data?.krathong && data?.state) {
      mirrorStateToLocalStorage(data.state);
      notifyLocalTabs({ type: 'ROOM_SYNC', payload: data.state });
      return { krathong: data.krathong, state: data.state };
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('ลอยลงสู่แม่น้ำ')) {
      throw err;
    }
  }

  // Local persistence fallback
  const state = readLocalRoomState(user);
  const existing = state.krathongs[user.uid];
  if (existing && existing.status === KrathongStatus.FLOATING) {
    throw new Error(`กระทงของ${user.displayName}ลอยลงสู่แม่น้ำกาแล็กซีแล้ว ไม่สามารถแก้ไขเพิ่มเติมได้`);
  }
  const now = new Date().toISOString();
  const krathong: Krathong = {
    krathongId: existing?.krathongId ?? `krathong_${user.uid}_${Date.now().toString(36)}`,
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
  state.krathongs[user.uid] = krathong;
  mirrorStateToLocalStorage(state);
  notifyLocalTabs({ type: 'ROOM_SYNC', payload: state });
  return { krathong, state };
}

export async function floatMyKrathong(
  user: RoomUser,
  payload: KrathongDraftPayload,
): Promise<{ krathong: Krathong; state: RoomState }> {
  try {
    const res = await fetch('/api/krathong/float', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildUserHeaders(user),
      },
      body: JSON.stringify(payload),
    });
    const data = await safeParseJson<{ krathong?: Krathong; state?: RoomState; error?: string }>(res);
    if (res.ok && data?.krathong && data?.state) {
      mirrorStateToLocalStorage(data.state);
      notifyLocalTabs({
        type: 'KRATHONG_FLOATED',
        payload: { krathong: data.krathong, state: data.state },
      });
      return { krathong: data.krathong, state: data.state };
    }
  } catch {
    // Fallback cleanly to localStorage + BroadcastChannel
  }

  const state = readLocalRoomState(user);
  const existing = state.krathongs[user.uid];
  if (existing && existing.status === KrathongStatus.FLOATING) {
    return { krathong: existing, state };
  }
  const now = new Date().toISOString();
  const krathong: Krathong = {
    krathongId: existing?.krathongId ?? `krathong_${user.uid}_${Date.now().toString(36)}`,
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
  state.krathongs[user.uid] = krathong;

  const floatingCount = Object.values(state.krathongs).filter(
    (k) => k.status === KrathongStatus.FLOATING,
  ).length;
  if (
    floatingCount >= 2 &&
    !state.events.some((ev) => ev.eventType === 'SHARED_LOVE_MOMENT')
  ) {
    state.events.push({
      eventId: `evt_love_${Date.now().toString(36)}`,
      roomId: PRIVATE_ROOM_ID,
      eventType: 'SHARED_LOVE_MOMENT',
      createdAt: now,
    });
  }

  mirrorStateToLocalStorage(state);
  notifyLocalTabs({
    type: 'KRATHONG_FLOATED',
    payload: { krathong, state },
  });
  return { krathong, state };
}

export async function resetPrivateRoom(
  user: RoomUser,
  memberUids: string[],
): Promise<RoomState> {
  try {
    const res = await fetch('/api/room/reset', {
      method: 'POST',
      headers: buildUserHeaders(user),
    });
    const data = await safeParseJson<{ state?: RoomState }>(res);
    if (res.ok && data?.state) {
      clearAllSeenLoveEvents(memberUids);
      mirrorStateToLocalStorage(data.state);
      notifyLocalTabs({ type: 'ROOM_RESET', payload: data.state });
      return data.state;
    }
  } catch {
    // Fallback to localStorage reset
  }

  const state = readLocalRoomState(user);
  state.krathongs = {};
  state.events = [];
  clearAllSeenLoveEvents(memberUids);
  mirrorStateToLocalStorage(state);
  notifyLocalTabs({ type: 'ROOM_RESET', payload: state });
  return state;
}

export async function sendChatMessage(user: RoomUser, message: string): Promise<ChatMessage> {
  const trimmed = message.trim().slice(0, 1000);
  if (!trimmed) {
    throw new Error('กรุณาพิมพ์ข้อความก่อนส่ง');
  }

  try {
    const res = await fetch('/api/chat/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildUserHeaders(user),
      },
      body: JSON.stringify({ message: trimmed }),
    });
    const data = await safeParseJson<{ message?: ChatMessage; error?: string }>(res);
    if (res.ok && data?.message) {
      appendChatMessageToLocalStorage(data.message);
      notifyLocalTabs({ type: 'CHAT_MESSAGE', payload: data.message });
      return data.message;
    }
  } catch {
    // Fallback cleanly to localStorage + BroadcastChannel
  }

  const chatMessage: ChatMessage = {
    messageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    roomId: PRIVATE_ROOM_ID,
    senderId: user.uid,
    senderName: user.displayName,
    message: trimmed,
    createdAt: new Date().toISOString(),
  };
  appendChatMessageToLocalStorage(chatMessage);
  notifyLocalTabs({ type: 'CHAT_MESSAGE', payload: chatMessage });
  return chatMessage;
}

function notifyLocalTabs(message: WsServerMessage): void {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    channel.postMessage(message);
    channel.close();
  } catch {
    // Ignore BroadcastChannel errors
  }
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
  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let channel: BroadcastChannel | null = null;

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channel.onmessage = (event: MessageEvent<WsServerMessage>) => {
        if (!closed && event.data) {
          handlers.onMessage(event.data);
        }
      };
    } catch {
      channel = null;
    }
  }

  const connect = () => {
    if (closed) return;
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws?uid=${encodeURIComponent(user.uid)}&name=${encodeURIComponent(user.displayName)}`;
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        if (!closed) {
          handlers.onConnectionChange(true);
        }
      };

      socket.onmessage = (event) => {
        if (closed) return;
        try {
          const msg = JSON.parse(String(event.data)) as WsServerMessage;
          if (msg.type === 'ROOM_SYNC' || msg.type === 'ROOM_RESET') {
            mirrorStateToLocalStorage(msg.payload);
          } else if (msg.type === 'KRATHONG_FLOATED') {
            mirrorStateToLocalStorage(msg.payload.state);
          } else if (msg.type === 'CHAT_MESSAGE') {
            appendChatMessageToLocalStorage(msg.payload);
          }
          handlers.onMessage(msg);
        } catch {
          // Ignore malformed packets
        }
      };

      socket.onclose = () => {
        if (closed) return;
        handlers.onConnectionChange(false);
        reconnectTimer = window.setTimeout(connect, 3000);
      };

      socket.onerror = () => {
        socket?.close();
      };
    } catch {
      handlers.onConnectionChange(false);
    }
  };

  connect();

  const sendTyping = (uid: string, isTyping: boolean) => {
    if (closed) return;
    const payload: WsClientMessage = {
      type: 'TYPING',
      payload: { isTyping },
    };
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
    notifyLocalTabs({
      type: 'TYPING_STATUS',
      payload: { uid, isTyping },
    });
  };

  const unsubscribe = () => {
    closed = true;
    handlers.onConnectionChange(false);
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
    }
    if (socket) {
      socket.onclose = null;
      socket.close();
    }
    if (channel) {
      channel.close();
    }
  };

  return { unsubscribe, sendTyping };
}
