import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  Cloud,
  Copy,
  ExternalLink,
  LogIn,
  LogOut,
  Monitor,
  RefreshCw,
  Smartphone,
  X,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { CloudSyncState } from '../hooks/useWhiteboardSync';

interface ConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  user: User | null;
  cloudState: CloudSyncState;
  cloudMessage: string;
  onSwitchRoom: (nextRoom: string) => void;
  onCreateNewRoom: () => void;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onSwitchToExtendHere: () => void;
  onSwitchToTabletHere: () => void;
}

export const ConnectModal: React.FC<ConnectModalProps> = ({
  isOpen,
  onClose,
  roomId,
  user,
  cloudState,
  cloudMessage,
  onSwitchRoom,
  onCreateNewRoom,
  onSignIn,
  onSignOut,
  onSwitchToExtendHere,
  onSwitchToTabletHere,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedTarget, setCopiedTarget] = useState<'tablet' | 'extend' | null>(null);
  const [roomInput, setRoomInput] = useState(roomId);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const tabletUrl = `${origin}/?view=tablet&room=${encodeURIComponent(roomId)}`;
  const extendUrl = `${origin}/?view=extend&room=${encodeURIComponent(roomId)}`;

  useEffect(() => {
    setRoomInput(roomId);
  }, [roomId]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    QRCode.toDataURL(tabletUrl, {
      width: 260,
      margin: 2,
      color: {
        dark: '#0F172A',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [isOpen, tabletUrl]);

  if (!isOpen) return null;

  const copyLink = async (text: string, target: 'tablet' | 'extend') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTarget(target);
      setTimeout(() => setCopiedTarget(null), 1800);
    } catch {
      // Ignore
    }
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomInput.trim().length >= 4) {
      onSwitchRoom(roomInput.trim());
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/65 sm:backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90dvh] flex flex-col bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="font-display text-base sm:text-lg font-bold text-slate-900">
              Hubungkan Tablet / HP & Layar Proyektor
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Scan QR Code dari kamera Tablet/HP untuk langsung menulis real-time tanpa PIN.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors shrink-0"
            aria-label="Tutup dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] grid grid-cols-1 md:grid-cols-12 gap-5 sm:gap-6">
          {/* Left: QR Code Card */}
          <div className="md:col-span-5 flex flex-col items-center justify-between bg-slate-50 rounded-xl border border-slate-200 p-5">
            <div className="text-center">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 mb-2">
                <Smartphone className="w-4 h-4" />
                Mode Remote Tablet / HP
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs inline-block">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`QR Code untuk ruang ${roomId}`}
                    className="w-48 h-48 block"
                  />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center text-xs text-slate-400">
                    Menyiapkan QR...
                  </div>
                )}
              </div>
            </div>

            <div className="w-full mt-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-600 px-1">
                <span>Kode Ruang</span>
                <span className="font-mono font-semibold text-slate-900 text-sm">{roomId}</span>
              </div>
              <button
                type="button"
                onClick={() => copyLink(tabletUrl, 'tablet')}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
              >
                {copiedTarget === 'tablet' ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    Link Tablet Disalin
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Salin Link Remote Tablet/HP
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  onSwitchToTabletHere();
                  onClose();
                }}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-medium hover:bg-slate-100 transition-colors"
              >
                Buka Tampilan Tablet di Tab Ini
              </button>
            </div>
          </div>

          {/* Right: Cloud Sync, Room & Extend Controls */}
          <div className="md:col-span-7 flex flex-col justify-between gap-4">
            {/* Cloud Sync (Firebase Firestore) */}
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Cloud
                    className={`w-5 h-5 mt-0.5 shrink-0 ${
                      cloudState === 'synced' ? 'text-teal-600' : 'text-slate-400'
                    }`}
                  />
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Sinkronisasi Real-Time Antar Perangkat (Firestore)
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                      {cloudMessage}
                    </p>
                    {user && (
                      <p className="text-xs text-slate-500 mt-1">
                        Akun aktif: <span className="font-medium text-slate-800">{user.email}</span>
                      </p>
                    )}
                  </div>
                </div>
                {user ? (
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Keluar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onSignIn}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 transition-colors"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    Masuk Google
                  </button>
                )}
              </div>
            </div>

            {/* Room Switcher */}
            <form onSubmit={handleJoinRoom} className="rounded-xl border border-slate-200 p-4 space-y-2.5">
              <label className="block text-sm font-semibold text-slate-900">
                Kode Ruang Papan Tulis
              </label>
              <p className="text-xs text-slate-500">
                Gunakan kode ruang yang sama di Laptop dan Tablet/HP, atau buat kode ruang baru untuk sesi lain.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={roomInput}
                  onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                  maxLength={24}
                  placeholder="PAPAN-XXXX"
                  className="min-w-0 flex-1 min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 text-base sm:text-sm font-mono text-slate-900 focus:outline-none focus:border-teal-600"
                />
                <button
                  type="submit"
                  className="min-h-[44px] px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                >
                  Buka Ruang
                </button>
                <button
                  type="button"
                  onClick={onCreateNewRoom}
                  title="Buat Kode Ruang Baru"
                  className="min-w-[44px] min-h-[44px] rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors shrink-0"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </form>

            {/* Extend Window */}
            <div className="rounded-xl border border-slate-200 p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Monitor className="w-4 h-4 text-slate-700" />
                Jendela Extend Layar ke-2 (Proyektor Bersih)
              </div>
              <p className="text-xs text-slate-500">
                Buka di tab terpisah lalu geser ke layar monitor/proyektor ke-2 untuk tampilan kanvas penuh tanpa toolbar.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={extendUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 transition-colors whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Buka Jendela Extend
                </a>
                <button
                  type="button"
                  onClick={() => copyLink(extendUrl, 'extend')}
                  className="min-h-[44px] px-3 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  {copiedTarget === 'extend' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-teal-600" />
                      Disalin
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Salin Link
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSwitchToExtendHere();
                    onClose();
                  }}
                  className="min-h-[44px] px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-medium transition-colors whitespace-nowrap"
                >
                  Di Tab Ini
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
