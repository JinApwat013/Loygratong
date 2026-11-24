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
const TOKEN_SECRET = process.env.UNIVERSE_SESSION_SECRET || 'our-little-universe-private-room-001';

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

function signToken(uid: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid, roomId: PRIVATE_ROOM_ID, iat: Date.now() }),
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token: string | undefined): RoomUser | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      uid?: string;
      roomId?: string;
    };
    if (decoded.roomId !== PRIVATE_ROOM_ID || !decoded.uid) return null;
    return roomState.users[decoded.uid] ?? null;
  } catch {
    return null;
  }
}

interface AuthenticatedRequest extends Request {
  authUser?: RoomUser;
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  const user = verifyToken(token);
  if (!user) {
    res.status(401).json({ error: 'กรุณากรอกชื่อก่อนเข้าสู่ระบบ' });
    return;
  }
  req.authUser = user;
  next();
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

function getSafeUsersSnapshot(): Record<string, RoomUser> {
  const snapshot: Record<string, RoomUser> = {};
  for (const [uid, user] of Object.entries(roomState.users)) {
    snapshot[uid] = { ...user };
  }
  return snapshot;
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

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const rawName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : '';
    if (!rawName) {
      res.status(400).json({ error: 'กรุณากรอกชื่อก่อนเข้าสู่ระบบ' });
      return;
    }

    const displayName = rawName.slice(0, 40);
    const requestedUid =
      typeof req.body?.uid === 'string' ? req.body.uid.trim() : undefined;

    const now = new Date().toISOString();
    let targetUid: string | null = null;
    let isNewOrRenamed = false;

    if (requestedUid && roomState.users[requestedUid]) {
      const existingUser = roomState.users[requestedUid];
      const activeConnections = userSockets.get(requestedUid)?.size ?? 0;

      if (activeConnections === 0 || existingUser.displayName === displayName) {
        // Same user logging back in (either keeping name or changing their name after logout)
        targetUid = requestedUid;
        if (existingUser.displayName !== displayName) {
          updateDisplayNameEverywhere(requestedUid, displayName);
          isNewOrRenamed = true;
        }
      } else {
        // Another tab in the same browser is actively connected under requestedUid with a different name.
        // Treat this as a separate user so two-tab testing works seamlessly.
        const matchingOffline = Object.values(roomState.users).find(
          (u) => u.uid !== requestedUid && u.displayName === displayName && (userSockets.get(u.uid)?.size ?? 0) === 0,
        );
        if (matchingOffline) {
          targetUid = matchingOffline.uid;
        }
      }
    }

    if (!targetUid) {
      targetUid = `user_${crypto.randomUUID().slice(0, 8)}`;
      roomState.users[targetUid] = {
        uid: targetUid,
        displayName,
        role: UserRole.MEMBER,
        onlineStatus: false,
        lastSeen: now,
      };
      if (!roomState.room.memberUids.includes(targetUid)) {
        roomState.room.memberUids.push(targetUid);
      }
      isNewOrRenamed = true;
    }

    roomState.users[targetUid].lastSeen = now;
    saveRoomState(roomState);

    if (isNewOrRenamed) {
      broadcast({ type: 'ROOM_SYNC', payload: roomState });
    }

    const token = signToken(targetUid);
    res.json({
      token,
      user: { ...roomState.users[targetUid] },
    });
  });

  app.patch('/api/auth/name', requireAuth, (req: AuthenticatedRequest, res: Response) => {
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

  app.post('/api/auth/logout', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const uid = req.authUser!.uid;
    if (roomState.users[uid]) {
      roomState.users[uid].lastSeen = new Date().toISOString();
      saveRoomState(roomState);
    }
    res.json({ ok: true });
  });

  app.get('/api/room', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
    res.json({
      ...roomState,
      users: getSafeUsersSnapshot(),
    });
  });

  app.put('/api/krathong', requireAuth, (req: AuthenticatedRequest, res: Response) => {
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

  app.post('/api/krathong/float', requireAuth, (req: AuthenticatedRequest, res: Response) => {
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

  app.post('/api/chat/messages', requireAuth, (req: AuthenticatedRequest, res: Response) => {
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

  app.post('/api/room/reset', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
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

    const token = reqUrl.searchParams.get('token') ?? undefined;
    const user = verifyToken(token);
    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
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
