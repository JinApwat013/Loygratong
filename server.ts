import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express, { NextFunction, Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';
import {
  Krathong,
  KrathongDecoration,
  KrathongDesign,
  KrathongStatus,
  PRIVATE_ROOM_ID,
  PRIVATE_ROOM_NAME,
  RoomState,
  RoomUser,
  UserRole,
  WsServerMessage,
} from './src/types/universe.ts';

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'room-state.json');
const TOKEN_SECRET = process.env.UNIVERSE_SESSION_SECRET || 'our-little-universe-private-room-001';

interface MockCredentialAccount {
  uid: 'user_001' | 'user_002';
  username: 'jin' | 'love';
  password: string;
  displayName: 'เรา' | 'เธอ';
  role: UserRole;
}

const FIXED_ACCOUNTS: readonly MockCredentialAccount[] = [
  {
    uid: 'user_001',
    username: 'jin',
    password: '1234',
    displayName: 'เรา',
    role: UserRole.USER_1,
  },
  {
    uid: 'user_002',
    username: 'love',
    password: '5678',
    displayName: 'เธอ',
    role: UserRole.USER_2,
  },
];

function createInitialRoomState(): RoomState {
  const now = new Date().toISOString();
  return {
    room: {
      roomId: PRIVATE_ROOM_ID,
      roomName: PRIVATE_ROOM_NAME,
      memberUids: ['user_001', 'user_002'],
      createdAt: now,
    },
    users: {
      user_001: {
        uid: 'user_001',
        username: 'jin',
        displayName: 'เรา',
        role: UserRole.USER_1,
        onlineStatus: false,
        lastSeen: now,
      },
      user_002: {
        uid: 'user_002',
        username: 'love',
        displayName: 'เธอ',
        role: UserRole.USER_2,
        onlineStatus: false,
        lastSeen: now,
      },
    },
    krathongs: {},
    events: [],
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
      if (parsed?.room?.roomId === PRIVATE_ROOM_ID && parsed.users?.user_001 && parsed.users?.user_002) {
        // Reset transient online flags on fresh server boot
        parsed.users.user_001.onlineStatus = false;
        parsed.users.user_002.onlineStatus = false;
        return parsed;
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

function signToken(uid: 'user_001' | 'user_002'): string {
  const payload = Buffer.from(
    JSON.stringify({ uid, roomId: PRIVATE_ROOM_ID, iat: Date.now() }),
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token: string | undefined): MockCredentialAccount | null {
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
    if (decoded.roomId !== PRIVATE_ROOM_ID) return null;
    return FIXED_ACCOUNTS.find((acc) => acc.uid === decoded.uid) ?? null;
  } catch {
    return null;
  }
}

interface AuthenticatedRequest extends Request {
  authUser?: MockCredentialAccount;
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  const account = verifyToken(token);
  if (!account) {
    res.status(401).json({ error: 'ไม่มีสิทธิ์เข้าถึงห้องส่วนตัวนี้ กรุณาเข้าสู่ระบบ' });
    return;
  }
  req.authUser = account;
  next();
}

const roomState: RoomState = loadRoomState();
const userSockets = new Map<'user_001' | 'user_002', Set<WebSocket>>([
  ['user_001', new Set()],
  ['user_002', new Set()],
]);

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

function syncPresence(uid: 'user_001' | 'user_002'): void {
  const activeCount = userSockets.get(uid)?.size ?? 0;
  const isOnline = activeCount > 0;
  const prev = roomState.users[uid].onlineStatus;
  roomState.users[uid].onlineStatus = isOnline;
  roomState.users[uid].lastSeen = new Date().toISOString();
  if (prev !== isOnline) {
    saveRoomState(roomState);
    broadcast({ type: 'PRESENCE_UPDATE', payload: roomState.users });
  }
}

function getSafeUsersSnapshot(): Record<'user_001' | 'user_002', RoomUser> {
  return {
    user_001: { ...roomState.users.user_001 },
    user_002: { ...roomState.users.user_002 },
  };
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    const matched = FIXED_ACCOUNTS.find(
      (acc) => acc.username === username && acc.password === password,
    );

    if (!matched) {
      res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
      return;
    }

    const token = signToken(matched.uid);
    roomState.users[matched.uid].lastSeen = new Date().toISOString();
    saveRoomState(roomState);

    res.json({
      token,
      user: { ...roomState.users[matched.uid] },
    });
  });

  app.post('/api/auth/logout', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const uid = req.authUser!.uid;
    roomState.users[uid].lastSeen = new Date().toISOString();
    saveRoomState(roomState);
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
        error: 'กระทงใบนี้ลอยลงสู่แม่น้ำกาแล็กซีแล้ว ไม่สามารถแก้ไขเพิ่มเติมได้',
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

    const k1 = roomState.krathongs.user_001;
    const k2 = roomState.krathongs.user_002;
    const bothFloating =
      k1?.status === KrathongStatus.FLOATING && k2?.status === KrathongStatus.FLOATING;

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
    const account = verifyToken(token);
    if (!account) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, account);
    });
  });

  wss.on('connection', (ws: WebSocket, account: MockCredentialAccount) => {
    const set = userSockets.get(account.uid)!;
    set.add(ws);
    syncPresence(account.uid);

    const initMsg: WsServerMessage = {
      type: 'ROOM_SYNC',
      payload: roomState,
    };
    ws.send(JSON.stringify(initMsg));

    ws.on('close', () => {
      set.delete(ws);
      syncPresence(account.uid);
    });

    ws.on('error', () => {
      set.delete(ws);
      syncPresence(account.uid);
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
