interface LogoutConfirmModalProps {
  open: boolean;
  displayName: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function LogoutConfirmModal({
  open,
  displayName,
  onCancel,
  onConfirm,
}: LogoutConfirmModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#0e0b26] p-6 shadow-2xl">
        <h2 id="logout-modal-title" className="font-display text-xl font-semibold text-white">
          ออกจากจักรวาลของเราใช่ไหม?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          ข้อมูลกระทงและคำอธิษฐานของ <span className="font-medium text-white">{displayName}</span>{' '}
          จะยังคงถูกเก็บรักษาไว้ และจะแสดงให้เห็นเหมือนเดิมเมื่อเข้าสู่ระบบอีกครั้ง
        </p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/10 whitespace-nowrap"
          >
            อยู่ต่อก่อน
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-500 whitespace-nowrap"
          >
            ยืนยันออกจากระบบ
          </button>
        </div>
      </div>
    </div>
  );
}
