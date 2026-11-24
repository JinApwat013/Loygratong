import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Application ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#070714] px-6 text-center text-slate-100">
          <div className="max-w-md rounded-2xl border border-rose-400/30 bg-[#120b24] p-7 shadow-2xl">
            <h1 className="font-display text-xl font-semibold text-white">
              เกิดข้อผิดพลาดในการเชื่อมต่อข้อมูล
            </h1>
            <p className="mt-2 break-words text-xs leading-relaxed text-rose-200">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-violet-500"
            >
              โหลดหน้าใหม่อีกครั้ง
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
