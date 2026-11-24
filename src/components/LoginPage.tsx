import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Heart, Loader2, Moon } from 'lucide-react';
import { motion } from 'motion/react';
import { getLastSelectedProfileUid } from '../services/roomClient';

interface LoginPageProps {
  onSelectProfile: (uid: 'user_001' | 'user_002') => Promise<void>;
}

interface ProfileCardOption {
  uid: 'user_001' | 'user_002';
  displayName: 'จิน' | 'ชื่อแฟน';
  subtitle: string;
  accentClass: string;
  iconBgClass: string;
}

const PROFILE_CARDS: readonly ProfileCardOption[] = [
  {
    uid: 'user_001',
    displayName: 'จิน',
    subtitle: 'เข้าสู่จักรวาลในนาม จิน',
    accentClass: 'hover:border-violet-400/70 hover:bg-violet-500/15',
    iconBgClass: 'bg-violet-500/20 text-amber-200 border-violet-300/30',
  },
  {
    uid: 'user_002',
    displayName: 'ชื่อแฟน',
    subtitle: 'เข้าสู่จักรวาลในนาม ชื่อแฟน',
    accentClass: 'hover:border-pink-400/70 hover:bg-pink-500/15',
    iconBgClass: 'bg-pink-500/20 text-pink-200 border-pink-300/30',
  },
];

export function LoginPage({ onSelectProfile }: LoginPageProps) {
  const [loadingUid, setLoadingUid] = useState<'user_001' | 'user_002' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const lastUid = getLastSelectedProfileUid();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    const stars = Array.from({ length: 150 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.6 + Math.random() * 1.7,
      phase: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 1.6,
      hue: Math.random() > 0.7 ? '#fde68a' : Math.random() > 0.4 ? '#f9a8d4' : '#c4b5fd',
    }));

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const start = performance.now();
    const render = (now: number) => {
      const t = (now - start) / 1000;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      for (const s of stars) {
        const alpha = 0.25 + 0.7 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = s.hue;
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      animId = requestAnimationFrame(render);
    };
    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const handleChoose = async (uid: 'user_001' | 'user_002') => {
    if (loadingUid) return;
    setErrorMsg(null);
    setLoadingUid(uid);
    try {
      await onSelectProfile(uid);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถเข้าสู่ห้องได้');
      setLoadingUid(null);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#060516] px-4 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_15%,rgba(109,40,217,0.34),transparent_55%),radial-gradient(ellipse_at_80%_25%,rgba(37,99,235,0.26),transparent_50%),radial-gradient(ellipse_at_50%_95%,rgba(244,114,182,0.2),transparent_60%)]"
      />

      <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0" />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[8%] top-[8%] h-32 w-32 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fef9c3_0%,#fde68a_42%,rgba(196,181,253,0.18)_75%,transparent_100%)] shadow-[0_0_90px_rgba(253,230,138,0.35)] sm:h-44 sm:w-44"
      />

      <motion.main
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-2xl rounded-2xl border border-white/15 bg-[#0c0922]/75 p-7 shadow-[0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur-xl sm:p-10"
      >
        <div className="text-center">
          <p className="text-xs font-medium tracking-[0.22em] text-violet-300">
            OUR LITTLE UNIVERSE
          </p>
          <p className="mt-1.5 text-xs text-slate-400">
            PRIVATE LOVE ROOM · ห้องลอยกระทงของเราสองคน
          </p>

          <h1 className="font-display mt-6 text-balance text-2xl font-semibold leading-snug text-white sm:text-3xl">
            ยินดีต้อนรับสู่จักรวาลของเรา
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            พื้นที่เล็ก ๆ ที่มีไว้สำหรับเราสองคนเท่านั้น · กดเลือกชื่อเพื่อเข้าสู่ห้องได้ทันที
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {PROFILE_CARDS.map((card) => {
            const isLoading = loadingUid === card.uid;
            const isRecent = lastUid === card.uid;
            return (
              <button
                key={card.uid}
                type="button"
                disabled={Boolean(loadingUid)}
                onClick={() => handleChoose(card.uid)}
                className={`group relative flex flex-col items-start justify-between rounded-2xl border border-white/15 bg-white/5 p-6 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-65 ${card.accentClass}`}
              >
                <div className="flex w-full items-start justify-between gap-3">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl border ${card.iconBgClass}`}
                  >
                    {card.uid === 'user_001' ? (
                      <Moon className="h-6 w-6" />
                    ) : (
                      <Heart className="h-6 w-6 fill-pink-300/30" />
                    )}
                  </div>

                  {isRecent && (
                    <span className="text-[11px] font-medium text-amber-200">
                      เลือกไว้ล่าสุด
                    </span>
                  )}
                </div>

                <div className="mt-5 w-full">
                  <p className="font-mono-tabular text-[11px] text-slate-400">{card.uid}</p>
                  <h2 className="font-display mt-0.5 text-2xl font-semibold text-white">
                    {card.displayName}
                  </h2>
                  <p className="mt-1 text-xs text-slate-300">{card.subtitle}</p>
                </div>

                <div className="mt-6 flex w-full items-center justify-between border-t border-white/10 pt-4 text-xs font-medium text-violet-200">
                  <span>{isLoading ? 'กำลังเข้าสู่ห้อง...' : 'เข้าสู่จักรวาล'}</span>
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-rose-400/35 bg-rose-500/15 px-4 py-2.5 text-center text-sm text-rose-200"
          >
            {errorMsg}
          </div>
        )}

        <p className="mt-8 border-t border-white/10 pt-5 text-center text-xs tracking-wider text-slate-400">
          Private Space · Only Two Hearts
        </p>
      </motion.main>
    </div>
  );
}
