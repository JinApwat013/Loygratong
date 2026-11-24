export enum UserRole {
  MEMBER = 'MEMBER',
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

export type AppView = 'dashboard' | 'studio' | 'river' | 'hearts' | 'chat';

export const PRIVATE_ROOM_ID = 'OUR_LOVE_ROOM_001';
export const PRIVATE_ROOM_NAME = 'OUR LITTLE UNIVERSE · ห้องลอยกระทง';

export interface RoomUser {
  uid: string;
  displayName: string;
  role: UserRole;
  onlineStatus: boolean;
  lastSeen: string;
}

export interface Krathong {
  krathongId: string;
  ownerUid: string;
  ownerName: string;
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

export interface ChatMessage {
  messageId: string;
  roomId: typeof PRIVATE_ROOM_ID;
  senderId: string;
  senderName: string;
  message: string;
  createdAt: string;
}

export interface RoomState {
  room: {
    roomId: typeof PRIVATE_ROOM_ID;
    roomName: string;
    memberUids: string[];
    createdAt: string;
  };
  users: Record<string, RoomUser>;
  krathongs: Record<string, Krathong>;
  events: RoomEvent[];
  messages: ChatMessage[];
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
  | { type: 'ROOM_RESET'; payload: RoomState }
  | { type: 'CHAT_MESSAGE'; payload: ChatMessage }
  | {
      type: 'TYPING_STATUS';
      payload: {
        uid: string;
        isTyping: boolean;
      };
    };

export type WsClientMessage = {
  type: 'TYPING';
  payload: {
    isTyping: boolean;
  };
};

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
