import { FormEvent, useEffect, useState } from 'react';
import { Check, Loader2, Send, Sparkles } from 'lucide-react';
import { KrathongDraftPayload } from '../services/roomClient';
import { KrathongPreviewCanvas } from '../three/KrathongPreviewCanvas';
import {
  CANDLE_COLOR_OPTIONS,
  DECORATION_OPTIONS,
  DESIGN_OPTIONS,
  FLOWER_COLOR_OPTIONS,
  Krathong,
  KrathongDecoration,
  KrathongDesign,
  KrathongStatus,
  RoomUser,
} from '../types/universe';

interface KrathongStudioViewProps {
  currentUser: RoomUser;
  myKrathong: Krathong | undefined;
  onSaveDraft: (payload: KrathongDraftPayload) => Promise<void>;
  onFloatKrathong: (payload: KrathongDraftPayload) => Promise<void>;
  onGoToRiver: () => void;
}

export function KrathongStudioView({
  currentUser,
  myKrathong,
  onSaveDraft,
  onFloatKrathong,
  onGoToRiver,
}: KrathongStudioViewProps) {
  const isFloated = myKrathong?.status === KrathongStatus.FLOATING;

  const [design, setDesign] = useState<KrathongDesign>(
    myKrathong?.design ?? KrathongDesign.CLASSIC_LOTUS,
  );
  const [flowerColor, setFlowerColor] = useState<string>(
    myKrathong?.flowerColor ?? FLOWER_COLOR_OPTIONS[0].hex,
  );
  const [candleColor, setCandleColor] = useState<string>(
    myKrathong?.candleColor ?? CANDLE_COLOR_OPTIONS[0].hex,
  );
  const [decoration, setDecoration] = useState<KrathongDecoration>(
    myKrathong?.decoration ?? KrathongDecoration.MINI_SATURN,
  );
  const [wishMessage, setWishMessage] = useState<string>(myKrathong?.wishMessage ?? '');
  const [showWish, setShowWish] = useState<boolean>(myKrathong?.showWish ?? true);

  const [saving, setSaving] = useState(false);
  const [floating, setFloating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!myKrathong) return;
    setDesign(myKrathong.design);
    setFlowerColor(myKrathong.flowerColor);
    setCandleColor(myKrathong.candleColor);
    setDecoration(myKrathong.decoration);
    setWishMessage(myKrathong.wishMessage);
    setShowWish(myKrathong.showWish);
  }, [
    myKrathong?.krathongId,
    myKrathong?.updatedAt,
    myKrathong?.status,
  ]);

  const currentPayload: KrathongDraftPayload = {
    design,
    flowerColor,
    candleColor,
    decoration,
    wishMessage,
    showWish,
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (isFloated) return;
    setErrorMsg(null);
    setFeedback(null);
    setSaving(true);
    try {
      await onSaveDraft(currentPayload);
      setFeedback(`บันทึกกระทงของ${currentUser.displayName}เรียบร้อยแล้ว`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถบันทึกกระทงได้');
    } finally {
      setSaving(false);
    }
  };

  const handleFloat = async () => {
    if (isFloated) {
      onGoToRiver();
      return;
    }
    setErrorMsg(null);
    setFeedback(null);
    setFloating(true);
    try {
      await onFloatKrathong(currentPayload);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถลอยกระทงได้');
    } finally {
      setFloating(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs text-violet-300">
            พื้นที่ออกแบบส่วนตัว · เจ้าของ: {currentUser.displayName} ({currentUser.uid})
          </p>
          <h1 className="font-display mt-1 text-2xl font-semibold text-white sm:text-3xl">
            สร้างและตกแต่งกระทงของ{currentUser.displayName}
          </h1>
        </div>
        {myKrathong && (
          <p className="font-mono-tabular text-xs text-slate-400">
            Krathong ID: {myKrathong.krathongId}
          </p>
        )}
      </div>

      <div className="grid items-stretch gap-6 lg:grid-cols-12">
        {/* Left: Live 3D Krathong Viewport */}
        <div className="min-h-[360px] lg:col-span-6 lg:min-h-[560px]">
          <KrathongPreviewCanvas
            config={{
              design,
              flowerColor,
              candleColor,
              decoration,
            }}
          />
        </div>

        {/* Right: Controls Form */}
        <form
          onSubmit={handleSave}
          className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#0d0a22]/90 p-6 lg:col-span-6"
        >
          <div className="space-y-6">
            {isFloated && (
              <div className="rounded-xl border border-pink-400/30 bg-pink-500/10 p-4 text-sm text-pink-100">
                <p className="font-semibold">
                  กระทงของ{currentUser.displayName}ลอยอยู่ในแม่น้ำกาแล็กซีแล้ว
                </p>
                <p className="mt-1 text-xs text-pink-200/80">
                  เมื่อกดลอยแล้วจะไม่สามารถแก้ไขรูปแบบหรือคำอธิษฐานได้ เพื่อเก็บเป็นความทรงจำของคืนนี้
                </p>
              </div>
            )}

            {/* 1. Design */}
            <div>
              <label className="block text-xs font-medium text-slate-300">
                1. เลือกรูปแบบกระทง
              </label>
              <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
                {DESIGN_OPTIONS.map((opt) => {
                  const selected = design === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={isFloated}
                      onClick={() => setDesign(opt.id)}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        selected
                          ? 'border-violet-400 bg-violet-600/20 text-white'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/25'
                      } disabled:cursor-not-allowed disabled:opacity-65`}
                    >
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{opt.subtitle}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Flower Color & Candle Color */}
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-300">2. สีกลีบดอกไม้</label>
                <div className="mt-2.5 flex flex-wrap gap-2.5">
                  {FLOWER_COLOR_OPTIONS.map((opt) => {
                    const selected = flowerColor === opt.hex;
                    return (
                      <button
                        key={opt.hex}
                        type="button"
                        disabled={isFloated}
                        title={opt.label}
                        onClick={() => setFlowerColor(opt.hex)}
                        className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-transform ${
                          selected
                            ? 'scale-110 border-white ring-2 ring-violet-400/50'
                            : 'border-white/20 hover:scale-105'
                        } disabled:cursor-not-allowed disabled:opacity-65`}
                        style={{ backgroundColor: opt.hex }}
                      >
                        {selected && <Check className="h-4 w-4 text-slate-950" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">3. สีเทียนอธิษฐาน</label>
                <div className="mt-2.5 flex flex-wrap gap-2.5">
                  {CANDLE_COLOR_OPTIONS.map((opt) => {
                    const selected = candleColor === opt.hex;
                    return (
                      <button
                        key={opt.hex}
                        type="button"
                        disabled={isFloated}
                        title={opt.label}
                        onClick={() => setCandleColor(opt.hex)}
                        className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-transform ${
                          selected
                            ? 'scale-110 border-white ring-2 ring-amber-400/50'
                            : 'border-white/20 hover:scale-105'
                        } disabled:cursor-not-allowed disabled:opacity-65`}
                        style={{ backgroundColor: opt.hex }}
                      >
                        {selected && <Check className="h-4 w-4 text-slate-950" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 3. Decoration */}
            <div>
              <label className="block text-xs font-medium text-slate-300">4. ของตกแต่งพิเศษ</label>
              <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
                {DECORATION_OPTIONS.map((opt) => {
                  const selected = decoration === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={isFloated}
                      onClick={() => setDecoration(opt.id)}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        selected
                          ? 'border-amber-400/70 bg-amber-500/15 text-white'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/25'
                      } disabled:cursor-not-allowed disabled:opacity-65`}
                    >
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{opt.subtitle}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. Wish Message */}
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="wish-input" className="text-xs font-medium text-slate-300">
                  5. คำอธิษฐานของ{currentUser.displayName}
                </label>
                <span className="font-mono-tabular text-[11px] text-slate-400">
                  {wishMessage.length} / 220
                </span>
              </div>
              <textarea
                id="wish-input"
                rows={3}
                maxLength={220}
                disabled={isFloated}
                value={wishMessage}
                onChange={(e) => setWishMessage(e.target.value)}
                placeholder={`เขียนคำอธิษฐานของ${currentUser.displayName}สำหรับคืนนี้...`}
                className="mt-2 w-full resize-none rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-violet-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-65"
              />
              <label className="mt-2.5 flex cursor-pointer items-center gap-2.5 text-xs text-slate-300">
                <input
                  type="checkbox"
                  disabled={isFloated}
                  checked={showWish}
                  onChange={(e) => setShowWish(e.target.checked)}
                  className="h-4 w-4 rounded border-white/25 bg-white/5 text-violet-500 focus:ring-violet-500"
                />
                <span>แสดงคำอธิษฐานของ{currentUser.displayName}บนแม่น้ำกาแล็กซี</span>
              </label>
            </div>
          </div>

          <div className="mt-6 space-y-3 border-t border-white/10 pt-5">
            {feedback && (
              <p className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                {feedback}
              </p>
            )}
            {errorMsg && (
              <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                {errorMsg}
              </p>
            )}

            {isFloated ? (
              <button
                type="button"
                onClick={onGoToRiver}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 px-5 py-3 text-sm font-semibold text-white transition-all hover:from-violet-500 hover:to-pink-500"
              >
                <Sparkles className="h-4 w-4" />
                <span>ไปชมกระทงของ{currentUser.displayName}บนแม่น้ำกาแล็กซี</span>
              </button>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="submit"
                  disabled={saving || floating}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>บันทึกกระทงของ{currentUser.displayName}</span>
                </button>
                <button
                  type="button"
                  onClick={handleFloat}
                  disabled={saving || floating}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-950/50 transition-all hover:from-violet-500 hover:to-pink-500 disabled:opacity-60"
                >
                  {floating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  <span>ลอยกระทงของ{currentUser.displayName}</span>
                </button>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
