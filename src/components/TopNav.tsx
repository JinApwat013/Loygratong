import { AppView } from '../types/universe';

interface TopNavProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  onRequestLogout: () => void;
}

const NAV_ITEMS: Array<{ id: AppView; label: string }> = [
  { id: 'dashboard', label: 'หน้าหลัก' },
  { id: 'studio', label: 'สร้างกระทง' },
  { id: 'river', label: 'แม่น้ำกาแล็กซี' },
  { id: 'hearts', label: 'สถานะหัวใจ' },
];

export function TopNav({ activeView, onNavigate, onRequestLogout }: TopNavProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#070714]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-4 py-3.5 sm:px-6">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="font-display text-left text-base font-semibold tracking-wide text-white transition-opacity hover:opacity-85 whitespace-nowrap shrink-0 sm:text-lg"
        >
          OUR LITTLE UNIVERSE
        </button>

        {/* Zone 2: 4 clean single-line text navigation links */}
        <nav className="hidden items-center gap-6 md:flex" aria-label="เมนูหลัก">
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`relative py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  isActive ? 'text-white' : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[15px] h-0.5 bg-gradient-to-r from-violet-400 to-pink-400"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onRequestLogout}
            className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-slate-100 transition-colors hover:bg-white/15 whitespace-nowrap shrink-0"
          >
            ออกจากระบบ
          </button>
        </div>
      </div>

      {/* Mobile secondary nav row */}
      <nav
        className="flex items-center justify-around border-t border-white/10 px-2 py-2 md:hidden"
        aria-label="เมนูมือถือ"
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                isActive ? 'bg-violet-600/30 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
