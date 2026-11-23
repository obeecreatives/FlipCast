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
  Radio,
  RefreshCw,
  Smartphone,
  Wifi,
  X,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { CloudSyncState } from '../hooks/useWhiteboardSync';
import { P2PConnectionState } from '../lib/peerSync';
import { ViewMode } from '../types/whiteboard';

interface SwitchRoomResult {
  ok: boolean;
  roomId?: string;
  error?: string;
  needsSignIn?: boolean;
}

interface ConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  viewMode: ViewMode;
  roomId: string;
  user: User | null;
  authError?: string | null;
  anonymousProviderDisabled?: boolean;
  cloudState: CloudSyncState;
  cloudMessage: string;
  p2pState: P2PConnectionState;
  p2pPeerCount: number;
  p2pMessage: string;
  onSwitchRoom: (nextRoom: string, nextViewMode?: ViewMode) => SwitchRoomResult;
  onCreateNewRoom: () => SwitchRoomResult;
  onRetryConnect: () => Promise<void>;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onSwitchToExtendHere: () => void;
  onSwitchToTabletHere: () => void;
  onRoomSwitched?: (roomCode: string, switchedToRemote?: boolean) => void;
}

export const ConnectModal: React.FC<ConnectModalProps> = ({
  isOpen,
  onClose,
  viewMode,
  roomId,
  user,
  authError,
  anonymousProviderDisabled = false,
  cloudState,
  p2pState,
  p2pPeerCount,
  p2pMessage,
  onSwitchRoom,
  onCreateNewRoom,
  onRetryConnect,
  onSignIn,
  onSignOut,
  onSwitchToExtendHere,
  onSwitchToTabletHere,
  onRoomSwitched,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrVersion, setQrVersion] = useState<string>(() => Date.now().toString(36));
  const [copiedTarget, setCopiedTarget] = useState<'tablet' | 'extend' | null>(null);
  const [roomInput, setRoomInput] = useState(roomId);
  const [roomFeedback, setRoomFeedback] = useState<{
    tone: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  // Anti-cache &v=... parameter ensures Tablet/HP always opens the latest app version when scanning QR
  const tabletUrl = `${origin}/?view=tablet&room=${encodeURIComponent(roomId)}&v=${qrVersion}`;
  const extendUrl = `${origin}/?view=extend&room=${encodeURIComponent(roomId)}&v=${qrVersion}`;

  useEffect(() => {
    setRoomInput(roomId);
  }, [roomId]);

  useEffect(() => {
    if (isOpen) {
      setQrVersion(Date.now().toString(36));
    } else {
      setRoomFeedback(null);
    }
  }, [isOpen, roomId]);

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

  const isGoogleSignedIn = Boolean(user && !user.isAnonymous);
  const isP2PConnected = p2pState === 'connected';
  const isP2PReady = p2pState === 'ready';

  const copyLink = async (text: string, target: 'tablet' | 'extend') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTarget(target);
      setTimeout(() => setCopiedTarget(null), 1800);
    } catch {
      // Ignore
    }
  };

  const applyRoomAndMode = (targetMode?: ViewMode) => {
    const res = onSwitchRoom(roomInput, targetMode);
    if (!res.ok) {
      setRoomFeedback({
        tone: 'error',
        text: res.error || 'Kode ruang tidak valid (minimal 4 karakter).',
      });
      return false;
    }

    const joinedCode = res.roomId || roomInput.trim().toUpperCase();
    setRoomInput(joinedCode);
    onRoomSwitched?.(joinedCode, targetMode === 'tablet');

    setRoomFeedback({
      tone: 'success',
      text:
        targetMode === 'tablet'
          ? `Menghubungkan Remote Tablet/HP ke papan aktif PC/Laptop (${joinedCode})...`
          : targetMode === 'extend'
          ? `Membuka layar Extend untuk ruang ${joinedCode}...`
          : `Ruang ${joinedCode} aktif — menyambungkan otomatis tanpa login email.`,
    });

    window.setTimeout(() => {
      onClose();
    }, 550);
    return true;
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    applyRoomAndMode(viewMode === 'tablet' ? 'tablet' : undefined);
  };

  const handleConnectAsRemote = () => {
    applyRoomAndMode('tablet');
  };

  const handleSwitchToTabletWithInput = () => {
    const trimmed = roomInput.trim();
    if (trimmed.length >= 4) {
      applyRoomAndMode('tablet');
    } else {
      onSwitchToTabletHere();
      onClose();
    }
  };

  const handleSwitchToExtendWithInput = () => {
    const trimmed = roomInput.trim();
    if (trimmed.length >= 4 && trimmed.toUpperCase() !== roomId) {
      applyRoomAndMode('extend');
    } else {
      onSwitchToExtendHere();
      onClose();
    }
  };

  const handleGenerateRoom = () => {
    const res = onCreateNewRoom();
    if (res.ok && res.roomId) {
      setRoomInput(res.roomId);
      setRoomFeedback({
        tone: 'success',
        text: `Ruang baru ${res.roomId} dibuat — siap dihubungkan dari Tablet/HP tanpa login email.`,
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/65 sm:backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[92dvh] flex flex-col bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="font-display text-base sm:text-lg font-bold text-slate-900">
              Hubungkan Tablet / HP & Layar Proyektor
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Langsung tersambung real-time tanpa login email & tanpa PIN — cukup scan QR atau masukkan Kode Ruang PC/Laptop.
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
          {/* Right/Top on Mobile: Room Code + Direct Connection Status + Extend */}
          <div className="md:col-span-7 md:order-2 flex flex-col justify-between gap-4">
            {/* Direct Real-Time Link Status (Works immediately without email login) */}
            <div
              className={`rounded-xl border p-4 ${
                isP2PConnected
                  ? 'border-emerald-200 bg-emerald-50/60'
                  : isP2PReady || cloudState === 'synced'
                  ? 'border-teal-200 bg-teal-50/40'
                  : p2pState === 'not-found'
                  ? 'border-amber-200 bg-amber-50/50'
                  : 'border-slate-200 bg-slate-50/60'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  {isP2PConnected ? (
                    <Radio className="w-5 h-5 mt-0.5 shrink-0 text-emerald-600 animate-pulse" />
                  ) : (
                    <Wifi
                      className={`w-5 h-5 mt-0.5 shrink-0 ${
                        isP2PReady || cloudState === 'synced'
                          ? 'text-teal-600'
                          : p2pState === 'not-found'
                          ? 'text-amber-600'
                          : 'text-slate-400'
                      }`}
                    />
                  )}
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900">
                      {isP2PConnected
                        ? viewMode === 'projector'
                          ? `Terhubung Langsung (${p2pPeerCount} Remote Aktif)`
                          : 'Terhubung Langsung ke Papan PC/Laptop'
                        : viewMode === 'projector'
                        ? 'Papan PC/Laptop Siap Menerima Remote'
                        : p2pState === 'not-found'
                        ? 'Menunggu Papan Aktif PC/Laptop'
                        : 'Menghubungkan Langsung Tanpa Email...'}
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{p2pMessage}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void onRetryConnect()}
                  title="Segarkan koneksi langsung"
                  className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Segarkan
                </button>
              </div>
            </div>

            {/* Room Switcher + One-Tap Remote Connect */}
            <form onSubmit={handleJoinRoom} className="rounded-xl border border-slate-200 p-4 space-y-3">
              <div>
                <label className="block text-sm font-semibold text-slate-900">
                  Kode Ruang Papan Tulis
                </label>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ketik kode yang tampil di layar PC/Laptop lalu tekan{' '}
                  <span className="font-semibold text-slate-700">Hubungkan Remote Tablet/HP</span>{' '}
                  untuk langsung mengarah ke papan yang sedang aktif.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={roomInput}
                  onChange={(e) => {
                    setRoomInput(e.target.value.toUpperCase());
                    if (roomFeedback) setRoomFeedback(null);
                  }}
                  maxLength={24}
                  placeholder="PAPAN-XXXX"
                  className="min-w-0 flex-1 min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 text-base sm:text-sm font-mono font-semibold text-slate-900 focus:outline-none focus:border-teal-600"
                />
                <button
                  type="button"
                  onClick={handleGenerateRoom}
                  title="Buat Kode Ruang Baru"
                  className="min-w-[44px] min-h-[44px] rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors shrink-0"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleConnectAsRemote}
                  className="min-h-[44px] px-3.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 active:scale-[0.98] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all whitespace-nowrap cursor-pointer"
                >
                  <Smartphone className="w-4 h-4 shrink-0" />
                  Hubungkan Remote Tablet/HP
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-all whitespace-nowrap cursor-pointer"
                >
                  <Monitor className="w-4 h-4 shrink-0" />
                  Buka Ruang di Mode Ini
                </button>
              </div>

              {roomFeedback && (
                <div
                  className={`rounded-lg px-3 py-2 text-xs font-medium leading-relaxed border ${
                    roomFeedback.tone === 'success'
                      ? 'bg-teal-50 border-teal-200 text-teal-900'
                      : roomFeedback.tone === 'warning'
                      ? 'bg-amber-50 border-amber-200 text-amber-950'
                      : 'bg-red-50 border-red-200 text-red-700'
                  }`}
                >
                  <p>{roomFeedback.text}</p>
                </div>
              )}
            </form>

            {/* Extend Window */}
            <div className="rounded-xl border border-slate-200 p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Monitor className="w-4 h-4 text-slate-700" />
                Jendela Extend Layar ke-2 (Proyektor Bersih)
              </div>
              <p className="text-xs text-slate-500">
                Buka di tab terpisah lalu geser ke monitor/proyektor ke-2 (HDMI) untuk tampilan kanvas penuh tanpa toolbar.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={extendUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors whitespace-nowrap"
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
                  onClick={handleSwitchToExtendWithInput}
                  className="min-h-[44px] px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-medium transition-colors whitespace-nowrap"
                >
                  Di Tab Ini
                </button>
              </div>
            </div>

            {/* Optional Cloud Backup (Compact, non-blocking) */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Cloud
                  className={`w-4 h-4 shrink-0 ${
                    cloudState === 'synced' ? 'text-teal-600' : 'text-slate-400'
                  }`}
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-700 truncate">
                    {cloudState === 'synced'
                      ? isGoogleSignedIn && user?.email
                        ? `Backup Cloud Aktif · ${user.email}`
                        : 'Backup Cloud Firestore Aktif'
                      : anonymousProviderDisabled
                      ? 'Backup Cloud Opsional (Koneksi langsung sudah aktif tanpa login)'
                      : 'Backup Cloud Opsional'}
                  </p>
                  {authError && (
                    <p className="text-[11px] text-red-600 mt-0.5 leading-snug">{authError}</p>
                  )}
                </div>
              </div>
              {isGoogleSignedIn ? (
                <button
                  type="button"
                  onClick={() => void onSignOut()}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                >
                  <LogOut className="w-3 h-3" />
                  Keluar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void onSignIn()}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                >
                  <LogIn className="w-3 h-3" />
                  Google (Opsional)
                </button>
              )}
            </div>
          </div>

          {/* Left/Bottom on Mobile: QR Code Card */}
          <div className="md:col-span-5 md:order-1 flex flex-col items-center justify-between bg-slate-50 rounded-xl border border-slate-200 p-5">
            <div className="text-center">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 mb-2">
                <Smartphone className="w-4 h-4" />
                Scan QR dari Tablet / HP
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
                <span>Kode Ruang Aktif</span>
                <span className="font-mono font-bold text-slate-900 text-sm">{roomId}</span>
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
                onClick={handleSwitchToTabletWithInput}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-medium hover:bg-slate-100 transition-colors"
              >
                Buka Tampilan Tablet di Tab Ini
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
