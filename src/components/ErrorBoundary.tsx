import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = error.message || 'Terjadi gangguan pada aplikasi.';
    try {
      const parsed = JSON.parse(error.message);
      if (parsed?.error) {
        if (String(parsed.error).toLowerCase().includes('quota exceeded')) {
          readable =
            'Kuota harian Firestore tercapai. Anda tetap dapat menggunakan papan tulis secara lokal hingga kuota direset besok.';
        } else if (String(parsed.error).includes('permission')) {
          readable =
            'Akses sinkronisasi ditolak. Pastikan Anda sudah masuk dengan akun Google yang terverifikasi.';
        } else {
          readable = parsed.error;
        }
      }
    } catch {
      // Plain error message
    }
    return { hasError: true, message: readable };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('FlipCast ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[100dvh] w-full bg-slate-100 flex items-center justify-center p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center">
            <div className="mx-auto mb-4 w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h1 className="font-display text-lg font-bold text-slate-900">
              Terjadi Gangguan Sinkronisasi
            </h1>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.reload();
              }}
              className="mt-5 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Muat Ulang Papan Tulis
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
