import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express, { NextFunction, Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';
import {
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
} from './src/types/universe.ts';

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'room-state.json');

function createInitialRoomState(): RoomState {
  const now = new Date().toISOString();
  return {
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
}

function loadRoomState(): RoomState {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as RoomState;
      const hasLegacyPlaceholder =
        parsed?.users?.user_002?.displayName === 'ชื่อแฟน' &&
        parsed?.users?.user_001?.displayName === 'จิน';

      if (parsed?.room?.roomId === PRIVATE_ROOM_ID && !hasLegacyPlaceholder) {
        const users: Record<string, RoomUser> = {};
        for (const [uid, user] of Object.entries(parsed.users ?? {})) {
          if (user && typeof user.displayName === 'string' && user.displayName.trim()) {
            users[uid] = {
              uid,
              displayName: user.displayName.trim(),
              role: UserRole.MEMBER,
              onlineStatus: false,
              lastSeen: user.lastSeen || new Date().toISOString(),
            };
          }
        }
        return {
          room: {
            roomId: PRIVATE_ROOM_ID,
            roomName: PRIVATE_ROOM_NAME,
            memberUids: Object.keys(users),
            createdAt: parsed.room.createdAt || new Date().toISOString(),
          },
          users,
          krathongs: parsed.krathongs && typeof parsed.krathongs === 'object' ? parsed.krathongs : {},
          events: Array.isArray(parsed.events) ? parsed.events : [],
          messages: Array.isArray(parsed.messages) ? parsed.messages.slice(-500) : [],
        };
      }
    }
  } catch (err) {
    console.error('Failed to read room state, initializing fresh state:', err);
  }
  const fresh = createInitialRoomState();
  saveRoomState(fresh);
  return fresh;
}

function saveRoomState(state: RoomState): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist room state:', err);
  }
}

const roomState: RoomState = loadRoomState();
const userSockets = new Map<string, Set<WebSocket>>();

function getSocketSet(uid: string): Set<WebSocket> {
  let set = userSockets.get(uid);
  if (!set) {
    set = new Set<WebSocket>();
    userSockets.set(uid, set);
  }
  return set;
}

function getSafeUsersSnapshot(): Record<string, RoomUser> {
  const snapshot: Record<string, RoomUser> = {};
  for (const [uid, user] of Object.entries(roomState.users)) {
    snapshot[uid] = { ...user };
  }
  return snapshot;
}

function broadcast(message: WsServerMessage): void {
  const encoded = JSON.stringify(message);
  for (const sockets of userSockets.values()) {
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(encoded);
      }
    }
  }
}

function updateDisplayNameEverywhere(uid: string, nextName: string): void {
  const user = roomState.users[uid];
  if (!user) return;
  user.displayName = nextName;
  if (roomState.krathongs[uid]) {
    roomState.krathongs[uid].ownerName = nextName;
  }
  for (const msg of roomState.messages) {
    if (msg.senderId === uid) {
      msg.senderName = nextName;
    }
  }
}

function ensureUserRegistered(rawUid: string | undefined, rawName: string | undefined): RoomUser | null {
  const uid = typeof rawUid === 'string' ? rawUid.trim().slice(0, 64) : '';
  const displayName = typeof rawName === 'string' ? rawName.trim().slice(0, 40) : '';
  if (!uid || !/^[a-zA-Z0-9_-]+$/.test(uid)) {
    return null;
  }

  const now = new Date().toISOString();
  const existing = roomState.users[uid];

  if (existing) {
    if (displayName && existing.displayName !== displayName) {
      updateDisplayNameEverywhere(uid, displayName);
    }
    existing.lastSeen = now;
    return existing;
  }

  if (!displayName) {
    return null;
  }

  const created: RoomUser = {
    uid,
    displayName,
    role: UserRole.MEMBER,
    onlineStatus: false,
    lastSeen: now,
  };
  roomState.users[uid] = created;
  if (!roomState.room.memberUids.includes(uid)) {
    roomState.room.memberUids.push(uid);
  }
  saveRoomState(roomState);
  broadcast({ type: 'ROOM_SYNC', payload: roomState });
  return created;
}

function syncPresence(uid: string): void {
  const user = roomState.users[uid];
  if (!user) return;
  const activeCount = userSockets.get(uid)?.size ?? 0;
  const isOnline = activeCount > 0;
  const prev = user.onlineStatus;
  user.onlineStatus = isOnline;
  user.lastSeen = new Date().toISOString();
  if (prev !== isOnline) {
    saveRoomState(roomState);
    broadcast({ type: 'PRESENCE_UPDATE', payload: getSafeUsersSnapshot() });
  }
}

interface AuthenticatedRequest extends Request {
  authUser?: RoomUser;
}

function decodeHeaderValue(val: string | string[] | undefined): string | undefined {
  if (typeof val !== 'string' || !val.trim()) return undefined;
  try {
    return decodeURIComponent(val.trim());
  } catch {
    return val.trim();
  }
}

function requireRoomUser(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const uid = decodeHeaderValue(req.headers['x-user-id']);
  const displayName = decodeHeaderValue(req.headers['x-user-name']);
  const user = ensureUserRegistered(uid, displayName);
  if (!user) {
    res.status(400).json({ error: 'กรุณากรอกชื่อก่อนเข้าสู่ระบบ' });
    return;
  }
  req.authUser = user;
  next();
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/room', requireRoomUser, (_req: AuthenticatedRequest, res: Response) => {
    res.json({
      ...roomState,
      users: getSafeUsersSnapshot(),
    });
  });

  app.patch('/api/auth/name', requireRoomUser, (req: AuthenticatedRequest, res: Response) => {
    const user = req.authUser!;
    const rawName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : '';
    if (!rawName) {
      res.status(400).json({ error: 'กรุณากรอกชื่อก่อนบันทึก' });
      return;
    }

    const displayName = rawName.slice(0, 40);
    updateDisplayNameEverywhere(user.uid, displayName);
    roomState.users[user.uid].lastSeen = new Date().toISOString();
    saveRoomState(roomState);
    broadcast({ type: 'ROOM_SYNC', payload: roomState });

    res.json({
      user: { ...roomState.users[user.uid] },
      state: roomState,
    });
  });

  app.put('/api/krathong', requireRoomUser, (req: AuthenticatedRequest, res: Response) => {
    const user = req.authUser!;
    const existing = roomState.krathongs[user.uid];

    if (existing && existing.status === KrathongStatus.FLOATING) {
      res.status(409).json({
        error: `กระทงของ${user.displayName}ลอยลงสู่แม่น้ำกาแล็กซีแล้ว ไม่สามารถแก้ไขเพิ่มเติมได้`,
      });
      return;
    }

    const body = req.body ?? {};
    const validDesigns = Object.values(KrathongDesign);
    const validDecorations = Object.values(KrathongDecoration);

    const design = validDesigns.includes(body.design)
      ? (body.design as KrathongDesign)
      : KrathongDesign.CLASSIC_LOTUS;
    const decoration = validDecorations.includes(body.decoration)
      ? (body.decoration as KrathongDecoration)
      : KrathongDecoration.MINI_SATURN;

    const flowerColor =
      typeof body.flowerColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.flowerColor)
        ? body.flowerColor
        : '#f472b6';
    const candleColor =
      typeof body.candleColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.candleColor)
        ? body.candleColor
        : '#f59e0b';
    const wishMessage =
      typeof body.wishMessage === 'string' ? body.wishMessage.trim().slice(0, 220) : '';
    const showWish = typeof body.showWish === 'boolean' ? body.showWish : true;

    const now = new Date().toISOString();
    const krathong: Krathong = {
      krathongId: existing?.krathongId ?? `krathong_${user.uid}_${crypto.randomUUID().slice(0, 8)}`,
      ownerUid: user.uid,
      ownerName: user.displayName,
      roomId: PRIVATE_ROOM_ID,
      design,
      flowerColor,
      candleColor,
      decoration,
      wishMessage,
      showWish,
      status: KrathongStatus.DRAFT,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      floatedAt: null,
    };

    roomState.krathongs[user.uid] = krathong;
    saveRoomState(roomState);
    broadcast({ type: 'ROOM_SYNC', payload: roomState });
    res.json({ krathong, state: roomState });
  });

  app.post('/api/krathong/float', requireRoomUser, (req: AuthenticatedRequest, res: Response) => {
    const user = req.authUser!;
    const body = req.body ?? {};
    const existing = roomState.krathongs[user.uid];

    if (existing && existing.status === KrathongStatus.FLOATING) {
      res.json({ krathong: existing, state: roomState });
      return;
    }

    const validDesigns = Object.values(KrathongDesign);
    const validDecorations = Object.values(KrathongDecoration);

    const design = validDesigns.includes(body.design)
      ? (body.design as KrathongDesign)
      : existing?.design ?? KrathongDesign.CLASSIC_LOTUS;
    const decoration = validDecorations.includes(body.decoration)
      ? (body.decoration as KrathongDecoration)
      : existing?.decoration ?? KrathongDecoration.MINI_SATURN;

    const flowerColor =
      typeof body.flowerColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.flowerColor)
        ? body.flowerColor
        : existing?.flowerColor ?? '#f472b6';
    const candleColor =
      typeof body.candleColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.candleColor)
        ? body.candleColor
        : existing?.candleColor ?? '#f59e0b';
    const wishMessage =
      typeof body.wishMessage === 'string'
        ? body.wishMessage.trim().slice(0, 220)
        : existing?.wishMessage ?? '';
    const showWish =
      typeof body.showWish === 'boolean' ? body.showWish : existing?.showWish ?? true;

    const now = new Date().toISOString();
    const krathong: Krathong = {
      krathongId: existing?.krathongId ?? `krathong_${user.uid}_${crypto.randomUUID().slice(0, 8)}`,
      ownerUid: user.uid,
      ownerName: user.displayName,
      roomId: PRIVATE_ROOM_ID,
      design,
      flowerColor,
      candleColor,
      decoration,
      wishMessage,
      showWish,
      status: KrathongStatus.FLOATING,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      floatedAt: now,
    };

    roomState.krathongs[user.uid] = krathong;

    const floatingKrathongs = Object.values(roomState.krathongs).filter(
      (k) => k.status === KrathongStatus.FLOATING,
    );
    const bothFloating = floatingKrathongs.length >= 2;

    const alreadyHasSharedMoment = roomState.events.some(
      (ev) => ev.eventType === 'SHARED_LOVE_MOMENT',
    );

    if (bothFloating && !alreadyHasSharedMoment) {
      roomState.events.push({
        eventId: `evt_love_${crypto.randomUUID().slice(0, 8)}`,
        roomId: PRIVATE_ROOM_ID,
        eventType: 'SHARED_LOVE_MOMENT',
        createdAt: now,
      });
    }

    saveRoomState(roomState);
    broadcast({
      type: 'KRATHONG_FLOATED',
      payload: { krathong, state: roomState },
    });

    res.json({ krathong, state: roomState });
  });

  app.post('/api/chat/messages', requireRoomUser, (req: AuthenticatedRequest, res: Response) => {
    const user = req.authUser!;
    const rawMessage = typeof req.body?.message === 'string' ? req.body.message.trim() : '';

    if (!rawMessage) {
      res.status(400).json({ error: 'กรุณาพิมพ์ข้อความก่อนส่ง' });
      return;
    }

    const chatMessage: ChatMessage = {
      messageId: `msg_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      roomId: PRIVATE_ROOM_ID,
      senderId: user.uid,
      senderName: user.displayName,
      message: rawMessage.slice(0, 1000),
      createdAt: new Date().toISOString(),
    };

    roomState.messages.push(chatMessage);
    if (roomState.messages.length > 500) {
      roomState.messages = roomState.messages.slice(-500);
    }

    saveRoomState(roomState);
    broadcast({ type: 'CHAT_MESSAGE', payload: chatMessage });
    broadcast({
      type: 'TYPING_STATUS',
      payload: { uid: user.uid, isTyping: false },
    });

    res.status(201).json({ message: chatMessage });
  });

  app.post('/api/room/reset', requireRoomUser, (_req: AuthenticatedRequest, res: Response) => {
    roomState.krathongs = {};
    roomState.events = [];
    saveRoomState(roomState);
    broadcast({ type: 'ROOM_RESET', payload: roomState });
    res.json({ state: roomState });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const reqUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (reqUrl.pathname !== '/ws') {
      socket.destroy();
      return;
    }

    const uid = reqUrl.searchParams.get('uid') ?? undefined;
    const name = reqUrl.searchParams.get('name') ?? undefined;
    const user = ensureUserRegistered(uid, name);
    if (!user) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, user);
    });
  });

  wss.on('connection', (ws: WebSocket, user: RoomUser) => {
    const set = getSocketSet(user.uid);
    set.add(ws);
    syncPresence(user.uid);

    const initMsg: WsServerMessage = {
      type: 'ROOM_SYNC',
      payload: roomState,
    };
    ws.send(JSON.stringify(initMsg));

    ws.on('message', (raw) => {
      try {
        const parsed = JSON.parse(String(raw)) as WsClientMessage;
        if (parsed?.type === 'TYPING') {
          broadcast({
            type: 'TYPING_STATUS',
            payload: {
              uid: user.uid,
              isTyping: Boolean(parsed.payload?.isTyping),
            },
          });
        }
      } catch {
        // Ignore invalid socket payloads
      }
    });

    ws.on('close', () => {
      set.delete(ws);
      if (set.size === 0) {
        broadcast({
          type: 'TYPING_STATUS',
          payload: { uid: user.uid, isTyping: false },
        });
      }
      syncPresence(user.uid);
    });

    ws.on('error', () => {
      set.delete(ws);
      if (set.size === 0) {
        broadcast({
          type: 'TYPING_STATUS',
          payload: { uid: user.uid, isTyping: false },
        });
      }
      syncPresence(user.uid);
    });
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`OUR LITTLE UNIVERSE server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
