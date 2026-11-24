import { FormEvent, useEffect, useRef, useState } from 'react';
import { Loader2, Moon, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { getRememberedProfile } from '../services/roomClient';

interface LoginPageProps {
  onLogin: (displayName: string) => Promise<void>;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const remembered = getRememberedProfile();
  const [name, setName] = useState<string>(() => remembered?.displayName ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    const stars = Array.from({ length: 165 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.6 + Math.random() * 1.8,
      phase: Math.random() * Math.PI * 2,
      speed: 0.45 + Math.random() * 1.6,
      hue: Math.random() > 0.72 ? '#fde68a' : Math.random() > 0.4 ? '#f9a8d4' : '#c4b5fd',
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
        const alpha = 0.25 + 0.72 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const trimmed = name.trim();
    if (!trimmed) {
      setErrorMsg('กรุณากรอกชื่อก่อนเข้าสู่ระบบ');
      inputRef.current?.focus();
      return;
    }

    setErrorMsg(null);
    setSubmitting(true);
    try {
      await onLogin(trimmed);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถเข้าสู่ระบบได้');
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#060516] px-4 py-10">
      {/* Fantasy Galaxy Atmospheric Gradients */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_15%,rgba(109,40,217,0.38),transparent_55%),radial-gradient(ellipse_at_82%_22%,rgba(37,99,235,0.28),transparent_50%),radial-gradient(ellipse_at_50%_92%,rgba(244,114,182,0.22),transparent_60%)]"
      />

      <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0" />

      {/* Luminous Moon */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[8%] top-[8%] h-28 w-28 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fef9c3_0%,#fde68a_42%,rgba(196,181,253,0.18)_75%,transparent_100%)] shadow-[0_0_95px_rgba(253,230,138,0.38)] sm:h-44 sm:w-44"
      />

      <motion.main
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md rounded-2xl border border-white/15 bg-[#0c0922]/80 p-7 shadow-[0_24px_80px_rgba(0,0,0,0.7)] backdrop-blur-xl sm:p-10"
      >
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-amber-200/25 bg-violet-500/15 shadow-[0_0_24px_rgba(167,139,250,0.28)]">
            <Moon className="h-6 w-6 text-amber-200" />
          </div>

          <p className="mt-4 text-xs font-medium tracking-[0.22em] text-violet-300">
            OUR LITTLE UNIVERSE
          </p>
          <p className="mt-1 text-xs text-slate-400">
            PRIVATE LOVE ROOM · ห้องลอยกระทงและแชตส่วนตัว
          </p>

          <h1 className="font-display mt-5 text-balance text-2xl font-semibold leading-snug text-white sm:text-3xl">
            ยินดีต้อนรับสู่จักรวาลแห่งดวงดาว
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            เพียงบอกชื่อเพื่อก้าวเข้าสู่แม่น้ำกาแล็กซีและห้องสนทนาไปด้วยกัน
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
          <div>
            <label
              htmlFor="universe-name-input"
              className="flex items-center gap-1.5 text-sm font-medium text-violet-100"
            >
              <Sparkles className="h-4 w-4 text-pink-300" />
              <span>คุณชื่ออะไร?</span>
            </label>

            <input
              ref={inputRef}
              id="universe-name-input"
              type="text"
              maxLength={40}
              autoComplete="name"
              disabled={submitting}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder="กรอกชื่อของคุณ..."
              className="mt-2.5 w-full rounded-xl border border-white/20 bg-white/8 px-4 py-3.5 text-base text-white placeholder-slate-400 shadow-inner transition-all focus:border-pink-400/75 focus:bg-white/12 focus:outline-none focus:ring-2 focus:ring-pink-400/25 disabled:cursor-not-allowed disabled:opacity-65"
            />
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="rounded-xl border border-rose-400/40 bg-rose-500/15 px-4 py-2.5 text-center text-sm text-rose-200"
            >
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-500 px-6 py-3.5 text-base font-semibold text-white shadow-[0_10px_30px_rgba(192,38,211,0.32)] transition-all hover:from-violet-500 hover:via-fuchsia-500 hover:to-pink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 disabled:cursor-not-allowed disabled:opacity-65"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>กำลังเข้าสู่จักรวาล...</span>
              </>
            ) : (
              <span>เข้าสู่จักรวาลของเรา ❤️</span>
            )}
          </button>
        </form>

        <p className="mt-8 border-t border-white/10 pt-5 text-center text-xs tracking-wider text-slate-400">
          Private Space · Two Hearts Under The Stars
        </p>
      </motion.main>
    </div>
  );
}
