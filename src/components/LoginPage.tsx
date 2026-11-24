import { FormEvent, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Loader2, Lock, User } from 'lucide-react';
import { motion } from 'motion/react';

interface LoginPageProps {
  onLogin: (username: string, password: string) => Promise<void>;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    const stars = Array.from({ length: 140 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.6 + Math.random() * 1.7,
      phase: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 1.6,
      hue: Math.random() > 0.7 ? '#fde68a' : Math.random() > 0.4 ? '#c4b5fd' : '#e0f2fe',
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!username.trim() || !password) {
      setErrorMsg('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
      return;
    }

    setLoading(true);
    try {
      await onLogin(username.trim(), password);
    } catch (err) {
      setErrorMsg(
        err instanceof Error && err.message
          ? err.message
          : 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#060516] px-4 py-10">
      {/* Fantasy Galaxy Background Gradients */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_15%,rgba(109,40,217,0.32),transparent_55%),radial-gradient(ellipse_at_80%_25%,rgba(37,99,235,0.26),transparent_50%),radial-gradient(ellipse_at_50%_95%,rgba(76,29,149,0.28),transparent_60%)]"
      />

      {/* Animated Starfield Canvas */}
      <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0" />

      {/* Luminous Galaxy Moon */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[8%] top-[8%] h-32 w-32 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fef9c3_0%,#fde68a_42%,rgba(196,181,253,0.18)_75%,transparent_100%)] shadow-[0_0_90px_rgba(253,230,138,0.35)] sm:h-44 sm:w-44"
      />

      {/* Glassmorphism Login Container */}
      <motion.main
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md rounded-2xl border border-white/15 bg-[#0c0922]/70 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur-xl sm:p-10"
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
            พื้นที่เล็ก ๆ ที่มีไว้สำหรับเราสองคนเท่านั้น
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
          <div>
            <label htmlFor="login-username" className="block text-xs font-medium text-slate-300">
              ชื่อผู้ใช้
            </label>
            <div className="relative mt-2">
              <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="กรอกชื่อผู้ใช้ของคุณ"
                disabled={loading}
                className="w-full rounded-xl border border-white/15 bg-white/5 py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 transition-colors focus:border-violet-400 focus:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40"
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="block text-xs font-medium text-slate-300">
              รหัสผ่าน
            </label>
            <div className="relative mt-2">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="กรอกรหัสผ่าน"
                disabled={loading}
                className="w-full rounded-xl border border-white/15 bg-white/5 py-3 pl-10 pr-11 text-sm text-white placeholder-slate-500 transition-colors focus:border-violet-400 focus:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="rounded-xl border border-rose-400/35 bg-rose-500/15 px-4 py-2.5 text-center text-sm text-rose-200"
            >
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition-all hover:from-violet-500 hover:to-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-65"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>{loading ? 'กำลังเปิดประตูจักรวาล...' : 'เข้าสู่จักรวาลของเรา'}</span>
          </button>
        </form>

        <p className="mt-7 border-t border-white/10 pt-5 text-center text-xs tracking-wider text-slate-400">
          Private Space · Only Two Hearts
        </p>
      </motion.main>
    </div>
  );
}
