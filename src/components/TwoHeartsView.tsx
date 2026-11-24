import { useState } from 'react';
import { Flame, Heart, RotateCcw, Star } from 'lucide-react';
import { DESIGN_OPTIONS, KrathongStatus, RoomState, RoomUser } from '../types/universe';

interface TwoHeartsViewProps {
  currentUser: RoomUser;
  roomState: RoomState;
  onResetRoom: () => Promise<void>;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    return new Intl.DateTimeFormat('th-TH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return '-';
  }
}

export function TwoHeartsView({ currentUser, roomState, onResetRoom }: TwoHeartsViewProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const memberOrder: Array<'user_001' | 'user_002'> = ['user_001', 'user_002'];

  const handleConfirmReset = async () => {
    setResetting(true);
    try {
      await onResetRoom();
      setConfirmReset(false);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <p className="text-xs text-violet-300">TWO HEARTS · สถานะแบบเรียลไทม์</p>
        <h1 className="font-display mt-1 text-2xl font-semibold text-white sm:text-3xl">
          สถานะของเราสองคนในคืนนี้
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">
          อัปเดตสถานะการออนไลน์และการลอยกระทงของทั้งสองบัญชีทันทีที่มีการเปลี่ยนแปลง
        </p>
      </div>

      {/* Legend Bar (clean unboxed text items) */}
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-white/10 py-3 text-xs text-slate-300">
        <span className="inline-flex items-center gap-1.5">
          <Star className="h-3.5 w-3.5 fill-emerald-400 text-emerald-400" />
          <span>ออนไลน์</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Star className="h-3.5 w-3.5 fill-slate-500 text-slate-500" />
          <span>ออฟไลน์</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Heart className="h-3.5 w-3.5 fill-pink-400 text-pink-400" />
          <span>ลอยกระทงแล้ว</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Flame className="h-3.5 w-3.5 text-amber-400" />
          <span>กำลังเตรียมกระทง</span>
        </span>
      </div>

      {/* Two Member Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        {memberOrder.map((uid) => {
          const user = roomState.users[uid];
          const krathong = roomState.krathongs[uid];
          const isMe = currentUser.uid === uid;
          const isFloated = krathong?.status === KrathongStatus.FLOATING;
          const designLabel = krathong
            ? DESIGN_OPTIONS.find((d) => d.id === krathong.design)?.label ?? '-'
            : 'ยังไม่ได้สร้าง';

          return (
            <section
              key={uid}
              className="rounded-2xl border border-white/10 bg-[#0d0a22]/90 p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono-tabular text-xs text-slate-400">
                    {user.uid} · {isMe ? 'บัญชีที่เข้าสู่ระบบอยู่' : 'คู่ของเรา'}
                  </p>
                  <h2 className="font-display mt-1 text-2xl font-semibold text-white">
                    {user.displayName}
                  </h2>
                </div>

                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Star
                    className={`h-4 w-4 ${
                      user.onlineStatus
                        ? 'fill-emerald-400 text-emerald-400'
                        : 'fill-slate-500 text-slate-500'
                    }`}
                  />
                  <span className={user.onlineStatus ? 'text-emerald-300' : 'text-slate-400'}>
                    {user.onlineStatus ? 'ออนไลน์' : 'ออฟไลน์'}
                  </span>
                </div>
              </div>

              <div className="mt-6 space-y-3.5 border-t border-white/10 pt-5 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-400">การสร้างกระทง</span>
                  <span className="font-medium text-slate-100">
                    {krathong ? `สร้างแล้ว (${designLabel})` : 'ยังไม่ได้สร้างกระทง'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-400">สถานะการลอย</span>
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    {isFloated ? (
                      <>
                        <Heart className="h-4 w-4 fill-pink-400 text-pink-400" />
                        <span className="text-pink-300">ลอยกระทงแล้ว</span>
                      </>
                    ) : krathong ? (
                      <>
                        <Flame className="h-4 w-4 text-amber-400" />
                        <span className="text-amber-300">กำลังเตรียมกระทง</span>
                      </>
                    ) : (
                      <span className="text-slate-400">รอดำเนินการ</span>
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-400">เวลาที่ลอย</span>
                  <span className="font-mono-tabular text-xs text-slate-300">
                    {isFloated ? formatDateTime(krathong?.floatedAt) : '-'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-400">อัปเดตสถานะล่าสุด</span>
                  <span className="font-mono-tabular text-xs text-slate-400">
                    {formatDateTime(user.lastSeen)}
                  </span>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {/* Room Reset Action for Re-testing */}
      <section className="mt-8 rounded-2xl border border-white/10 bg-[#0d0a22]/70 p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-sm font-semibold text-white">เริ่มลอยกระทงรอบใหม่สำหรับห้องนี้</h3>
            <p className="mt-1 text-xs text-slate-400">
              ใช้เมื่อต้องการล้างกระทงของทั้งสองคนในรอบปัจจุบัน เพื่อทดสอบการสร้างและลอยกระทงพร้อมกันใหม่อีกครั้ง
            </p>
          </div>
          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="inline-flex items-center gap-2 self-start rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-white/10 whitespace-nowrap sm:self-auto"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>รีเซ็ตการลอยรอบนี้</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                disabled={resetting}
                onClick={() => setConfirmReset(false)}
                className="rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-300 hover:bg-white/5 whitespace-nowrap"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={resetting}
                onClick={handleConfirmReset}
                className="rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-500 whitespace-nowrap"
              >
                {resetting ? 'กำลังรีเซ็ต...' : 'ยืนยันเริ่มรอบใหม่'}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
