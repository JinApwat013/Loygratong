import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

interface SharedLoveOverlayProps {
  visible: boolean;
  myName: string;
  partnerName: string;
  onDismiss: () => void;
}

export function SharedLoveOverlay({
  visible,
  myName,
  partnerName,
  onDismiss,
}: SharedLoveOverlayProps) {
  const [step, setStep] = useState(0);

  const loveSteps = [
    `ในที่สุดกระทงของ${myName}กับ${partnerName}\nก็ได้ลอยไปด้วยกันแล้วนะ`,
    `ขอบคุณที่มาลอยกระทงด้วยกันนะ ${partnerName}`,
    `อยากให้ ${myName} กับ ${partnerName} อยู่ด้วยกันไปนาน ๆ นะ ❤️`,
  ];

  useEffect(() => {
    if (!visible) {
      setStep(0);
      return;
    }
    setStep(0);
    const t1 = window.setTimeout(() => setStep(1), 4200);
    const t2 = window.setTimeout(() => setStep(2), 8000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-30 flex flex-col items-center px-4">
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-auto max-w-lg rounded-2xl border border-pink-300/25 bg-[#120b2a]/85 px-7 py-5 text-center shadow-2xl"
        >
          <p className="text-[11px] tracking-[0.2em] text-pink-300">SHARED LOVE MOMENT</p>
          <p className="font-display mt-2 whitespace-pre-line text-xl font-semibold leading-relaxed text-white sm:text-2xl">
            {loveSteps[step]}
          </p>

          <div className="mt-4 flex items-center justify-center gap-3">
            {step < loveSteps.length - 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(s + 1, loveSteps.length - 1))}
                className="text-xs text-pink-200 underline underline-offset-4 hover:text-white"
              >
                อ่านข้อความถัดไป
              </button>
            ) : (
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-lg border border-pink-300/30 bg-pink-500/20 px-4 py-1.5 text-xs font-medium text-pink-100 transition-colors hover:bg-pink-500/30"
              >
                ปิดข้อความและชมแม่น้ำคู่กัน
              </button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
