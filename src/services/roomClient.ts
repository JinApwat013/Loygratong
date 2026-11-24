import {
  AuthSession,
  ChatMessage,
  Krathong,
  KrathongDecoration,
  KrathongDesign,
  PRIVATE_ROOM_ID,
  RoomState,
  RoomUser,
  WsClientMessage,
  WsServerMessage,
} from '../types/universe';

const TAB_SESSION_KEY = 'olu_tab_session_v2';
const LS_SAVED_PROFILE_KEY = 'olu_saved_profile_v1';
const LS_KRATHONG_PREFIX = 'olu_krathong_';
const LS_EVENTS_KEY = `olu_events_${PRIVATE_ROOM_ID}`;
const LS_CHAT_KEY = `olu_chat_messages_${PRIVATE_ROOM_ID}`;
const LS_SEEN_EVENT_PREFIX = 'olu_seen_love_event_';
const BROADCAST_CHANNEL_NAME = 'olu_universe_channel_v1';

export interface RememberedProfile {
  uid: string;
  displayName: string;
}

export function getRememberedProfile(): RememberedProfile | null {
  try {
    const raw = localStorage.getItem(LS_SAVED_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberedProfile>;
    if (typeof parsed?.uid === 'string' && typeof parsed?.displayName === 'string' && parsed.displayName.trim()) {
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

export interface KrathongDraftPayload {
  design: KrathongDesign;
  flowerColor: string;
  candleColor: string;
  decoration: KrathongDecoration;
  wishMessage: string;
  showWish: boolean;
}

export function getSavedTabSession(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(TAB_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.token || !parsed?.user?.uid || !parsed?.user?.displayName) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveTabSession(session: AuthSession): void {
  sessionStorage.setItem(TAB_SESSION_KEY, JSON.stringify(session));
}

export function clearTabSession(): void {
  sessionStorage.removeItem(TAB_SESSION_KEY);
}

/**
 * Mirrors server room state into localStorage separated by ownerUid
 * for resilience across refreshes.
 */
export function mirrorStateToLocalStorage(state: RoomState): void {
  try {
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

export async function loginWithName(displayName: string): Promise<AuthSession> {
  const remembered = getRememberedProfile();
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: displayName.trim(),
      uid: remembered?.uid,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'ไม่สามารถเข้าสู่ระบบได้');
  }
  const session: AuthSession = {
    token: data.token,
    user: data.user,
  };
  saveTabSession(session);
  saveRememberedProfile(session.user.uid, session.user.displayName);
  return session;
}

export async function updateMyDisplayName(
  token: string,
  displayName: string,
): Promise<{ user: RoomUser; state: RoomState }> {
  const res = await fetch('/api/auth/name', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ displayName: displayName.trim() }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'ไม่สามารถเปลี่ยนชื่อได้');
  }

  const currentSession = getSavedTabSession();
  if (currentSession) {
    saveTabSession({
      ...currentSession,
      user: data.user,
    });
  }
  saveRememberedProfile(data.user.uid, data.user.displayName);
  mirrorStateToLocalStorage(data.state);
  notifyLocalTabs({ type: 'ROOM_SYNC', payload: data.state });
  return data;
}

export async function logoutSession(token: string): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } finally {
    clearTabSession();
  }
}

export async function fetchRoomState(token: string): Promise<RoomState> {
  const res = await fetch('/api/room', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    if (res.status === 401) {
      clearTabSession();
    }
    throw new Error('ไม่สามารถโหลดข้อมูลห้องส่วนตัวได้');
  }
  const state = (await res.json()) as RoomState;
  mirrorStateToLocalStorage(state);
  return state;
}

export async function saveMyKrathongDraft(
  token: string,
  payload: KrathongDraftPayload,
): Promise<{ krathong: Krathong; state: RoomState }> {
  const res = await fetch('/api/krathong', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'บันทึกกระทงไม่สำเร็จ');
  }
  mirrorStateToLocalStorage(data.state);
  notifyLocalTabs({ type: 'ROOM_SYNC', payload: data.state });
  return data;
}

export async function floatMyKrathong(
  token: string,
  payload: KrathongDraftPayload,
): Promise<{ krathong: Krathong; state: RoomState }> {
  const res = await fetch('/api/krathong/float', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'ลอยกระทงไม่สำเร็จ');
  }
  mirrorStateToLocalStorage(data.state);
  notifyLocalTabs({
    type: 'KRATHONG_FLOATED',
    payload: { krathong: data.krathong, state: data.state },
  });
  return data;
}

export async function resetPrivateRoom(token: string, memberUids: string[]): Promise<RoomState> {
  const res = await fetch('/api/room/reset', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'รีเซ็ตห้องไม่สำเร็จ');
  }
  clearAllSeenLoveEvents(memberUids);
  mirrorStateToLocalStorage(data.state);
  notifyLocalTabs({ type: 'ROOM_RESET', payload: data.state });
  return data.state;
}

export async function sendChatMessage(token: string, message: string): Promise<ChatMessage> {
  const res = await fetch('/api/chat/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'ส่งข้อความไม่สำเร็จ');
  }
  const chatMessage = data.message as ChatMessage;
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
  token: string,
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
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
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
      reconnectTimer = window.setTimeout(connect, 2000);
    };

    socket.onerror = () => {
      socket?.close();
    };
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
