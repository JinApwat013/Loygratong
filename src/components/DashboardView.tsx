import { FormEvent, useState } from 'react';
import {
  ArrowRight,
  Check,
  Flame,
  Heart,
  Loader2,
  MessageCircle,
  Pencil,
  Star,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
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
  partnerUser: RoomUser | undefined;
  roomState: RoomState;
  wsConnected: boolean;
  unreadChatCount: number;
  onNavigate: (view: AppView) => void;
  onRename: (nextName: string) => Promise<void>;
}

export function DashboardView({
  currentUser,
  partnerUser,
  roomState,
  wsConnected,
  unreadChatCount,
  onNavigate,
  onRename,
}: DashboardViewProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(currentUser.displayName);
  const [savingName, setSavingName] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const myKrathong = roomState.krathongs[currentUser.uid];
  const partnerKrathong = partnerUser ? roomState.krathongs[partnerUser.uid] : undefined;

  const floatedCount = Object.values(roomState.krathongs).filter(
    (k) => k?.status === KrathongStatus.FLOATING,
  ).length;

  const myDesignLabel = myKrathong
    ? DESIGN_OPTIONS.find((d) => d.id === myKrathong.design)?.label ?? 'กลีบบัวดารา'
    : 'ยังไม่ได้สร้าง';

  const greetingTitle = `สวัสดี ${currentUser.displayName} ❤️`;
  const greetingSubtitle = partnerUser
    ? partnerUser.onlineStatus
      ? `${partnerUser.displayName}เข้ามารอแล้ว · มาลอยกระทงและคุยกันในห้องส่วนตัวได้เลย`
      : `${currentUser.displayName}กำลังรอ${partnerUser.displayName}อยู่นะ · เตรียมกระทงไว้ลอยด้วยกันคืนนี้`
    : `ยินดีต้อนรับ ${currentUser.displayName} · เริ่มสร้างกระทงของ${currentUser.displayName}หรือรออีกคนเข้ามาในห้องได้เลย`;

  const handleRenameSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setRenameError('กรุณากรอกชื่อก่อนบันทึก');
      return;
    }
    setRenameError(null);
    setSavingName(true);
    try {
      await onRename(trimmed);
      setEditingName(false);
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : 'ไม่สามารถเปลี่ยนชื่อได้');
    } finally {
      setSavingName(false);
    }
  };

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
              <span className="text-slate-300">
                ชื่อ: {currentUser.displayName} ({currentUser.uid})
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h1 className="font-display text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {greetingTitle}
              </h1>
              {!editingName && (
                <button
                  type="button"
                  onClick={() => {
                    setNameDraft(currentUser.displayName);
                    setRenameError(null);
                    setEditingName(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Pencil className="h-3 w-3" />
                  <span>เปลี่ยนชื่อ</span>
                </button>
              )}
            </div>

            {editingName && (
              <form onSubmit={handleRenameSubmit} className="mt-3 max-w-md space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    maxLength={40}
                    value={nameDraft}
                    onChange={(e) => {
                      setNameDraft(e.target.value);
                      if (renameError) setRenameError(null);
                    }}
                    placeholder="กรอกชื่อใหม่..."
                    className="min-w-[180px] flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white placeholder-slate-400 focus:border-pink-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={savingName}
                    className="inline-flex items-center gap-1 rounded-lg bg-pink-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-pink-400 disabled:opacity-60"
                  >
                    {savingName ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    <span>บันทึก</span>
                  </button>
                  <button
                    type="button"
                    disabled={savingName}
                    onClick={() => setEditingName(false)}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/10"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>ยกเลิก</span>
                  </button>
                </div>
                {renameError && <p className="text-xs text-rose-300">{renameError}</p>}
              </form>
            )}

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
                  ? `ดูกระทงของ${currentUser.displayName}`
                  : myKrathong
                    ? `แต่งกระทงของ${currentUser.displayName}ต่อ`
                    : `สร้างกระทงของ${currentUser.displayName}`}
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
            <button
              type="button"
              onClick={() => onNavigate('chat')}
              className="inline-flex items-center gap-2 rounded-xl border border-pink-400/35 bg-pink-500/15 px-5 py-2.5 text-sm font-medium text-pink-100 transition-colors hover:bg-pink-500/25 whitespace-nowrap"
            >
              <MessageCircle className="h-4 w-4 text-pink-300" />
              <span>{partnerUser ? `แชตกับ${partnerUser.displayName}` : 'เปิดห้องแชต'}</span>
              {unreadChatCount > 0 && (
                <span className="font-mono-tabular text-xs text-pink-200">
                  ({unreadChatCount})
                </span>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* 4-column Overview Grid */}
      <section className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. My Status */}
        <div className="rounded-2xl border border-white/10 bg-[#0d0a22]/85 p-5">
          <p className="text-xs font-medium text-slate-400">สถานะของ{currentUser.displayName}</p>
          <div className="mt-3 flex items-center gap-2.5">
            <Star
              className={`h-4 w-4 ${
                currentUser.onlineStatus
                  ? 'fill-emerald-400 text-emerald-400'
                  : 'fill-slate-500 text-slate-500'
              }`}
            />
            <span className="text-base font-semibold text-white">
              {currentUser.onlineStatus ? 'ออนไลน์อยู่ในห้อง' : 'กำลังเชื่อมต่อ'}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {myKrathong?.status === KrathongStatus.FLOATING
              ? `${currentUser.displayName}ลอยกระทงลงแม่น้ำแล้ว`
              : myKrathong
                ? `${currentUser.displayName}กำลังเตรียมกระทง`
                : `${currentUser.displayName}ยังไม่ได้เริ่มสร้างกระทง`}
          </p>
        </div>

        {/* 2. Partner Status */}
        <div className="rounded-2xl border border-white/10 bg-[#0d0a22]/85 p-5">
          <p className="text-xs font-medium text-slate-400">
            {partnerUser ? `สถานะของ${partnerUser.displayName}` : 'คู่สนทนาในจักรวาล'}
          </p>
          <div className="mt-3 flex items-center gap-2.5">
            <Star
              className={`h-4 w-4 ${
                partnerUser?.onlineStatus
                  ? 'fill-emerald-400 text-emerald-400'
                  : 'fill-slate-500 text-slate-500'
              }`}
            />
            <span className="text-base font-semibold text-white">
              {partnerUser
                ? partnerUser.onlineStatus
                  ? 'ออนไลน์พร้อมกัน'
                  : 'ออฟไลน์'
                : 'รออีกคนเข้ามา'}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {partnerUser
              ? partnerKrathong?.status === KrathongStatus.FLOATING
                ? `${partnerUser.displayName}ลอยกระทงแล้ว`
                : partnerKrathong
                  ? `${partnerUser.displayName}กำลังเตรียมกระทง`
                  : `รอ${partnerUser.displayName}สร้างกระทง`
              : 'ส่งลิงก์เว็บนี้ให้อีกคนกรอกชื่อเพื่อเข้าห้องได้เลย'}
          </p>
        </div>

        {/* 3. My Krathong Summary */}
        <div className="rounded-2xl border border-white/10 bg-[#0d0a22]/85 p-5">
          <p className="text-xs font-medium text-slate-400">กระทงของ{currentUser.displayName}</p>
          <div className="mt-3 flex items-center gap-2.5">
            {myKrathong?.status === KrathongStatus.FLOATING ? (
              <Heart className="h-4 w-4 fill-pink-400 text-pink-400" />
            ) : (
              <Flame className="h-4 w-4 text-amber-400" />
            )}
            <span className="truncate text-base font-semibold text-white">{myDesignLabel}</span>
          </div>
          <p className="mt-2 truncate text-xs text-slate-400">
            {myKrathong?.wishMessage
              ? `คำอธิษฐานของ${currentUser.displayName}: “${myKrathong.wishMessage}”`
              : `${currentUser.displayName}ยังไม่ได้เขียนคำอธิษฐาน`}
          </p>
        </div>

        {/* 4. Floated Count & Sync */}
        <div className="rounded-2xl border border-white/10 bg-[#0d0a22]/85 p-5">
          <p className="text-xs font-medium text-slate-400">จำนวนกระทงที่ลอยแล้ว</p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono-tabular text-2xl font-semibold text-white">
              {floatedCount}
            </span>
            <span className="font-mono-tabular text-sm text-slate-400">
              / {Math.max(2, Object.keys(roomState.users).length)} ใบ
            </span>
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

      {/* Connection Summary Row */}
      <section className="mt-8 rounded-2xl border border-white/10 bg-[#0d0a22]/75 p-6 sm:p-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">
              {partnerUser
                ? `ความคืบหน้าในแม่น้ำกาแล็กซีของ ${currentUser.displayName} และ ${partnerUser.displayName}`
                : `ความคืบหน้าในแม่น้ำกาแล็กซีของ ${currentUser.displayName}`}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {floatedCount >= 2
                ? partnerUser
                  ? `กระทงของ ${currentUser.displayName} และ ${partnerUser.displayName} ลอยเคียงคู่กันบนแม่น้ำแห่งดวงดาวแล้ว`
                  : 'กระทงลอยเคียงคู่กันบนแม่น้ำแห่งดวงดาวแล้ว'
                : floatedCount === 1
                  ? 'มีกระทงลอยลงสู่แม่น้ำแล้ว 1 ใบ รออีกใบมาลอยเคียงคู่กัน'
                  : `ออกแบบกระทงของ${currentUser.displayName}แล้วกดลอย เพื่อส่งคำอธิษฐานสู่แม่น้ำกาแล็กซี`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('hearts')}
            className="self-start rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 whitespace-nowrap sm:self-auto"
          >
            ดูหน้าสถานะหัวใจ
          </button>
        </div>
      </section>
    </div>
  );
}
