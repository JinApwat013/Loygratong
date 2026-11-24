export enum UserRole {
  USER_1 = 'USER_1',
  USER_2 = 'USER_2',
}

export enum KrathongStatus {
  DRAFT = 'DRAFT',
  FLOATING = 'FLOATING',
}

export enum KrathongDesign {
  CLASSIC_LOTUS = 'classic_lotus',
  COSMIC_CRYSTAL = 'cosmic_crystal',
  GALAXY_LEAF = 'galaxy_leaf',
  MOON_BOAT = 'moon_boat',
}

export enum KrathongDecoration {
  MINI_SATURN = 'mini_saturn',
  FLOATING_PETALS = 'floating_petals',
  STARLIGHT_FIREFLIES = 'starlight_fireflies',
  MOON_PEARLS = 'moon_pearls',
}

export type AppView = 'dashboard' | 'studio' | 'river' | 'hearts';

export const PRIVATE_ROOM_ID = 'OUR_LOVE_ROOM_001';
export const PRIVATE_ROOM_NAME = 'PRIVATE LOVE ROOM · ห้องลอยกระทงของเราสองคน';

export interface RoomUser {
  uid: 'user_001' | 'user_002';
  username: 'jin' | 'love';
  displayName: 'เรา' | 'เธอ';
  role: UserRole;
  onlineStatus: boolean;
  lastSeen: string;
}

export interface Krathong {
  krathongId: string;
  ownerUid: 'user_001' | 'user_002';
  ownerName: 'เรา' | 'เธอ';
  roomId: typeof PRIVATE_ROOM_ID;
  design: KrathongDesign;
  flowerColor: string;
  candleColor: string;
  decoration: KrathongDecoration;
  wishMessage: string;
  showWish: boolean;
  status: KrathongStatus;
  createdAt: string;
  updatedAt: string;
  floatedAt: string | null;
}

export interface RoomEvent {
  eventId: string;
  roomId: typeof PRIVATE_ROOM_ID;
  eventType: 'SHARED_LOVE_MOMENT';
  createdAt: string;
}

export interface RoomState {
  room: {
    roomId: typeof PRIVATE_ROOM_ID;
    roomName: string;
    memberUids: ['user_001', 'user_002'];
    createdAt: string;
  };
  users: Record<'user_001' | 'user_002', RoomUser>;
  krathongs: Partial<Record<'user_001' | 'user_002', Krathong>>;
  events: RoomEvent[];
}

export interface AuthSession {
  token: string;
  user: RoomUser;
}

export type WsServerMessage =
  | { type: 'ROOM_SYNC'; payload: RoomState }
  | {
      type: 'KRATHONG_FLOATED';
      payload: {
        krathong: Krathong;
        state: RoomState;
      };
    }
  | { type: 'PRESENCE_UPDATE'; payload: RoomState['users'] }
  | { type: 'ROOM_RESET'; payload: RoomState };

export const DESIGN_OPTIONS: Array<{
  id: KrathongDesign;
  label: string;
  subtitle: string;
}> = [
  {
    id: KrathongDesign.CLASSIC_LOTUS,
    label: 'กลีบบัวดารา',
    subtitle: 'กลีบบัวซ้อนสองชั้นเปล่งประกายจันทร์',
  },
  {
    id: KrathongDesign.COSMIC_CRYSTAL,
    label: 'คริสตัลเนบิวลา',
    subtitle: 'ฐานแก้วเจียระไนสะท้อนแสงดาว',
  },
  {
    id: KrathongDesign.GALAXY_LEAF,
    label: 'ใบตองจักรวาล',
    subtitle: 'งานจักสานทรงไทยประดับประกายทอง',
  },
  {
    id: KrathongDesign.MOON_BOAT,
    label: 'เรือพระจันทร์เสี้ยว',
    subtitle: 'นาวาจันทราล่องสายน้ำแห่งความฝัน',
  },
];

export const FLOWER_COLOR_OPTIONS: Array<{
  hex: string;
  label: string;
}> = [
  { hex: '#f472b6', label: 'ชมพูซากุระ' },
  { hex: '#c084fc', label: 'ม่วงลาเวนเดอร์' },
  { hex: '#fbbf24', label: 'ทองคำเปลว' },
  { hex: '#38bdf8', label: 'ฟ้าเนบิวลา' },
  { hex: '#f8fafc', label: 'ขาวไข่มุก' },
];

export const CANDLE_COLOR_OPTIONS: Array<{
  hex: string;
  label: string;
}> = [
  { hex: '#f59e0b', label: 'ทองอบอุ่น' },
  { hex: '#fb7185', label: 'โรสโกลด์' },
  { hex: '#60a5fa', label: 'ฟ้าแสงดาว' },
  { hex: '#a78bfa', label: 'ม่วงอเมทิสต์' },
];

export const DECORATION_OPTIONS: Array<{
  id: KrathongDecoration;
  label: string;
  subtitle: string;
}> = [
  {
    id: KrathongDecoration.MINI_SATURN,
    label: 'วงแหวนดาวเสาร์จิ๋ว',
    subtitle: 'ดาวเคราะห์เล็ก ๆ โคจรเคียงเปลวเทียน',
  },
  {
    id: KrathongDecoration.MOON_PEARLS,
    label: 'ไข่มุกจันทรา',
    subtitle: 'เม็ดมุกเรืองรองล้อมขอบกลีบกระทง',
  },
  {
    id: KrathongDecoration.STARLIGHT_FIREFLIES,
    label: 'หิ่งห้อยแสงดาว',
    subtitle: 'ละอองแสงระยิบระยับลอยรอบกระทง',
  },
  {
    id: KrathongDecoration.FLOATING_PETALS,
    label: 'กลีบกุหลาบโปรย',
    subtitle: 'กลีบดอกไม้ประดับรอบฐานกระทง',
  },
];
