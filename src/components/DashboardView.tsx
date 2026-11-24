import { ArrowRight, Flame, Heart, Star, Wifi, WifiOff } from 'lucide-react';
import {
  AppView,
  DESIGN_OPTIONS,
  KrathongStatus,
  PRIVATE_ROOM_ID,
  RoomState,
  RoomUser,
} from '../types/universe';

interface DashboardViewProps {
  currentUser: RoomUser;
  roomState: RoomState;
  wsConnected: boolean;
  onNavigate: (view: AppView) => void;
}

export function DashboardView({
  currentUser,
  roomState,
  wsConnected,
  onNavigate,
}: DashboardViewProps) {
  const isUser1 = currentUser.uid === 'user_001';
  const partnerUid = isUser1 ? 'user_002' : 'user_001';

  const me = roomState.users[currentUser.uid];
  const partner = roomState.users[partnerUid];
  const myKrathong = roomState.krathongs[currentUser.uid];
  const partnerKrathong = roomState.krathongs[partnerUid];

  const floatedCount = [myKrathong, partnerKrathong].filter(
    (k) => k?.status === KrathongStatus.FLOATING,
  ).length;

  const myDesignLabel = myKrathong
    ? DESIGN_OPTIONS.find((d) => d.id === myKrathong.design)?.label ?? 'กลีบบัวดารา'
    : 'ยังไม่ได้สร้าง';

  const greetingTitle = isUser1 ? 'สวัสดี เรา 🌙' : 'สวัสดีนะเธอ ❤️';
  const greetingSubtitle = isUser1
    ? 'คืนนี้เธออาจกำลังรอเราอยู่บนแม่น้ำแห่งดวงดาวนะ'
    : 'คืนนี้มีใครบางคนเตรียมกระทงไว้ลอยกับเธอแล้วนะ';

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      {/* Hero Welcome Banner */}
      <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#161036]/90 via-[#0e0b24]/95 to-[#0b1330]/90 p-7 sm:p-10">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-violet-300">
              <span>PRIVATE LOVE ROOM</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular text-slate-400">{PRIVATE_ROOM_ID}</span>
              <span aria-hidden="true">·</span>
              <span className="text-slate-300">บัญชี {currentUser.displayName}</span>
            </div>

            <h1 className="font-display mt-3 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {greetingTitle}
            </h1>
            <p className="mt-2.5 text-base leading-relaxed text-slate-300">{greetingSubtitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('studio')}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:from-violet-500 hover:to-indigo-500 whitespace-nowrap"
            >
              <span>
                {myKrathong?.status === KrathongStatus.FLOATING
                  ? 'ดูกระทงของเรา'
                  : myKrathong
                    ? 'แต่งกระทงต่อ'
                    : 'สร้างกระทงของฉัน'}
              </span>
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('river')}
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-100 transition-colors hover:bg-white/10 whitespace-nowrap"
            >
              <span>ไปยังแม่น้ำกาแล็กซี</span>
            </button>
          </div>
        </div>
      </section>

      {/* 4-column Overview Grid */}
      <section className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. My Status */}
        <div className="rounded-2xl border border-white/10 bg-[#0d0a22]/85 p-5">
          <p className="text-xs font-medium text-slate-400">สถานะของ{me.displayName}</p>
          <div className="mt-3 flex items-center gap-2.5">
            <Star
              className={`h-4 w-4 ${
                me.onlineStatus
                  ? 'fill-emerald-400 text-emerald-400'
                  : 'fill-slate-500 text-slate-500'
              }`}
            />
            <span className="text-base font-semibold text-white">
              {me.onlineStatus ? 'ออนไลน์อยู่ในห้อง' : 'กำลังเชื่อมต่อ'}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {myKrathong?.status === KrathongStatus.FLOATING
              ? 'ลอยกระทงลงแม่น้ำแล้ว'
              : myKrathong
                ? 'กำลังเตรียมกระทง'
                : 'ยังไม่ได้เริ่มสร้างกระทง'}
          </p>
        </div>

        {/* 2. Partner Status */}
        <div className="rounded-2xl border border-white/10 bg-[#0d0a22]/85 p-5">
          <p className="text-xs font-medium text-slate-400">สถานะของ{partner.displayName}</p>
          <div className="mt-3 flex items-center gap-2.5">
            <Star
              className={`h-4 w-4 ${
                partner.onlineStatus
                  ? 'fill-emerald-400 text-emerald-400'
                  : 'fill-slate-500 text-slate-500'
              }`}
            />
            <span className="text-base font-semibold text-white">
              {partner.onlineStatus ? 'ออนไลน์พร้อมกัน' : 'ออฟไลน์'}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {partnerKrathong?.status === KrathongStatus.FLOATING
              ? `${partner.displayName}ลอยกระทงแล้ว`
              : partnerKrathong
                ? `${partner.displayName}กำลังเตรียมกระทง`
                : `รอ${partner.displayName}สร้างกระทง`}
          </p>
        </div>

        {/* 3. My Krathong Summary */}
        <div className="rounded-2xl border border-white/10 bg-[#0d0a22]/85 p-5">
          <p className="text-xs font-medium text-slate-400">กระทงของ{me.displayName}</p>
          <div className="mt-3 flex items-center gap-2.5">
            {myKrathong?.status === KrathongStatus.FLOATING ? (
              <Heart className="h-4 w-4 fill-pink-400 text-pink-400" />
            ) : (
              <Flame className="h-4 w-4 text-amber-400" />
            )}
            <span className="truncate text-base font-semibold text-white">{myDesignLabel}</span>
          </div>
          <p className="mt-2 truncate text-xs text-slate-400">
            {myKrathong?.wishMessage ? `“${myKrathong.wishMessage}”` : 'ยังไม่ได้เขียนคำอธิษฐาน'}
          </p>
        </div>

        {/* 4. Floated Count & Sync */}
        <div className="rounded-2xl border border-white/10 bg-[#0d0a22]/85 p-5">
          <p className="text-xs font-medium text-slate-400">จำนวนกระทงที่ลอยแล้ว</p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono-tabular text-2xl font-semibold text-white">
              {floatedCount}
            </span>
            <span className="font-mono-tabular text-sm text-slate-400">/ 2 ใบ</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs">
            {wsConnected ? (
              <>
                <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-300">เชื่อมต่อ Real-time พร้อมซิงก์</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-amber-300">กำลังเชื่อมต่อเซิร์ฟเวอร์ใหม่...</span>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Two Hearts Connection Summary Row */}
      <section className="mt-8 rounded-2xl border border-white/10 bg-[#0d0a22]/75 p-6 sm:p-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">
              ความคืบหน้าในแม่น้ำกาแล็กซีของเราสองคน
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {floatedCount === 2
                ? 'กระทงของเราสองคนลอยเคียงคู่กันบนแม่น้ำแห่งดวงดาวแล้ว'
                : floatedCount === 1
                  ? 'มีกระทงลอยลงสู่แม่น้ำแล้ว 1 ใบ รออีกใบมาลอยเคียงคู่กัน'
                  : 'ออกแบบกระทงของตัวเองแล้วกดลอย เพื่อส่งคำอธิษฐานสู่แม่น้ำกาแล็กซี'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('hearts')}
            className="self-start rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 whitespace-nowrap sm:self-auto"
          >
            ดูหน้าสถานะสองหัวใจ
          </button>
        </div>
      </section>
    </div>
  );
}
