import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Laptop,
  Share,
  Smartphone,
  Tablet,
  WifiOff,
  X,
} from 'lucide-react';
import { DevicePlatform, usePWAInstall } from '../hooks/usePWAInstall';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, platform, isInIframe, install } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<DevicePlatform>(platform);
  const [qrUrl, setQrUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const appUrl =
    typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '';

  useEffect(() => {
    setActiveTab(platform);
  }, [platform]);

  useEffect(() => {
    if (!showModal || !appUrl) return;
    let mounted = true;
    QRCode.toDataURL(appUrl, {
      width: 180,
      margin: 2,
      color: { dark: '#0F172A', light: '#FFFFFF' },
    })
      .then((url) => {
        if (mounted) setQrUrl(url);
      })
      .catch(() => {
        if (mounted) setQrUrl('');
      });
    return () => {
      mounted = false;
    };
  }, [showModal, appUrl]);

  // Sembunyikan tombol jika aplikasi sudah berjalan sebagai aplikasi terinstal (standalone)
  if (isInstalled) return null;

  const handlePrimaryClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) {
        setShowModal(true);
      }
      return;
    }
    setShowModal(true);
  };

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handlePrimaryClick()}
        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        title="Instal aplikasi FlipCast di HP, Tablet, PC, atau Laptop"
      >
        <Download className="w-4 h-4 shrink-0" />
        {!compact && <span>Pasang Aplikasi</span>}
      </button>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/65 sm:backdrop-blur-xs p-0 sm:p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="w-full sm:max-w-xl max-h-[90dvh] flex flex-col bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Pasang FlipCast di HP, Tablet, PC & Laptop
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Berjalan mandiri layar penuh seperti aplikasi bawaan dan tetap berfungsi saat offline.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 shrink-0"
                aria-label="Tutup panduan instalasi"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-5">
              {/* Native 1-Click Install CTA if available */}
              {isInstallable && (
                <div className="rounded-xl bg-teal-50 border border-teal-200 p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-teal-950">
                      Perangkat Siap Instal Langsung
                    </p>
                    <p className="text-xs text-teal-800 mt-0.5">
                      Klik tombol di samping untuk memasang FlipCast ke layar utama / desktop sekarang.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await install();
                      if (ok) setShowModal(false);
                    }}
                    className="shrink-0 min-h-[42px] px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    Instal Sekarang
                  </button>
                </div>
              )}

              {/* Iframe notice: browser requires top-level tab for native PWA install */}
              {isInIframe && !isInstallable && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-amber-950 leading-relaxed">
                    <p className="font-bold">Buka di Tab Browser Penuh untuk Instal</p>
                    <p className="mt-0.5 text-amber-900">
                      Browser tidak mengizinkan instalasi aplikasi dari dalam jendela pratinjau. Buka link penuh di tab baru agar tombol instalasi 1-klik muncul.
                    </p>
                  </div>
                  <a
                    href={appUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Buka Tab Penuh
                  </a>
                </div>
              )}

              {/* Device Selector Segmented Tabs */}
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setActiveTab('desktop')}
                  className={`min-h-[40px] px-2.5 rounded-lg inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors ${
                    activeTab === 'desktop'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Laptop className="w-4 h-4 shrink-0" />
                  <span>PC & Laptop</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('android')}
                  className={`min-h-[40px] px-2.5 rounded-lg inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors ${
                    activeTab === 'android'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Smartphone className="w-4 h-4 shrink-0" />
                  <span>Android</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('ios')}
                  className={`min-h-[40px] px-2.5 rounded-lg inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors ${
                    activeTab === 'ios'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Tablet className="w-4 h-4 shrink-0" />
                  <span>iPhone / iPad</span>
                </button>
              </div>

              {/* Platform Instructions + QR */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                <div className="sm:col-span-7 space-y-3">
                  {activeTab === 'desktop' && (
                    <ol className="space-y-2.5 text-sm text-slate-700 list-decimal list-inside">
                      <li>
                        Buka FlipCast di browser <strong className="text-slate-900">Google Chrome</strong> atau <strong className="text-slate-900">Microsoft Edge</strong> (Windows, macOS, Linux, atau Chromebook).
                      </li>
                      <li>
                        Klik ikon <strong className="text-slate-900">Instal / Pasang Aplikasi</strong> di ujung kanan bilah alamat (address bar), atau klik tombol <strong className="text-slate-900">Pasang Aplikasi</strong> di header.
                      </li>
                      <li>
                        Di <strong className="text-slate-900">Safari macOS</strong>: pilih menu <em>File → Add to Dock</em>.
                      </li>
                    </ol>
                  )}

                  {activeTab === 'android' && (
                    <ol className="space-y-2.5 text-sm text-slate-700 list-decimal list-inside">
                      <li>
                        Buka link aplikasi di <strong className="text-slate-900">Google Chrome</strong> pada HP atau Tablet Android (bisa scan QR di samping).
                      </li>
                      <li>
                        Ketuk tombol <strong className="text-slate-900">Pasang Aplikasi</strong> atau menu titik tiga (<strong className="text-slate-900">⋮</strong>) di pojok kanan atas Chrome.
                      </li>
                      <li>
                        Pilih <strong className="text-slate-900">Instal aplikasi / Tambahkan ke layar utama</strong> lalu konfirmasi.
                      </li>
                    </ol>
                  )}

                  {activeTab === 'ios' && (
                    <ol className="space-y-2.5 text-sm text-slate-700 list-decimal list-inside">
                      <li>
                        Buka link aplikasi menggunakan browser <strong className="text-slate-900">Safari</strong> di iPhone atau iPad.
                      </li>
                      <li>
                        Ketuk ikon <strong className="text-slate-900 inline-flex items-center gap-1">Bagikan <Share className="w-3.5 h-3.5 inline" /></strong> di bilah menu Safari.
                      </li>
                      <li>
                        Gulir ke bawah dan pilih <strong className="text-slate-900">Tambahkan ke Layar Utama</strong> (Add to Home Screen), lalu ketuk <strong className="text-slate-900">Tambah</strong>.
                      </li>
                    </ol>
                  )}

                  <div className="pt-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyUrl}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-teal-600" />
                          Link Disalin
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Salin Link Aplikasi
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Quick QR to open & install directly on HP / Tablet */}
                <div className="sm:col-span-5 flex flex-col items-center justify-center bg-slate-50 rounded-xl border border-slate-200 p-4 text-center">
                  <div className="bg-white p-2 rounded-xl border border-slate-200">
                    {qrUrl ? (
                      <img
                        src={qrUrl}
                        alt="QR Code untuk instalasi di HP dan Tablet"
                        className="w-32 h-32 block"
                      />
                    ) : (
                      <div className="w-32 h-32 flex items-center justify-center text-xs text-slate-400">
                        Memuat QR...
                      </div>
                    )}
                  </div>
                  <p className="mt-2.5 text-[11px] font-medium text-slate-600 leading-snug">
                    Scan dari kamera HP / Tablet untuk langsung memasang aplikasi
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>Mode Offline — Coretan tersimpan lokal di perangkat</span>
    </div>
  );
};
