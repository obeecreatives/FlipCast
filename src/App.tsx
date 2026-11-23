import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Download,
  Edit3,
  Eye,
  FileText,
  Maximize2,
  Minimize2,
  Monitor,
  MonitorUp,
  PanelTopClose,
  PanelTopOpen,
  QrCode,
  Radio,
  Redo2,
  RotateCw,
  Send,
  Smartphone,
  Undo2,
} from 'lucide-react';
import { ConnectModal } from './components/ConnectModal';
import { DrawingToolbar } from './components/DrawingToolbar';
import { FlipchartBar } from './components/FlipchartBar';
import { OfflineIndicator, PWAInstallModal } from './components/PWAWidgets';
import { TemplateDrawer } from './components/TemplateDrawer';
import { WhiteboardCanvas } from './components/WhiteboardCanvas';
import { usePWAInstall } from './hooks/usePWAInstall';
import { useWhiteboardSync } from './hooks/useWhiteboardSync';
import { exportAllPagesAsPDF, exportPageAsPNG } from './lib/exportUtils';
import { FontSizeKey, STICKY_COLORS, StrokeSizeKey, ToolType } from './types/whiteboard';

export default function App() {
  const wb = useWhiteboardSync();
  const pwa = usePWAInstall();

  const [activeTool, setActiveTool] = useState<ToolType>('pen');
  const [color, setColor] = useState<string>('#0F294A');
  const [stickyColor, setStickyColor] = useState<string>(STICKY_COLORS[0].bg);
  const [strokeSize, setStrokeSize] = useState<StrokeSizeKey>('medium');
  const [fontSize, setFontSize] = useState<FontSizeKey>('md');

  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLandscapeLocked, setIsLandscapeLocked] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [chromeCollapsed, setChromeCollapsed] = useState(false);
  const [extendControlsVisible, setExtendControlsVisible] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 720,
  }));

  const rootRef = useRef<HTMLDivElement | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const isLandscape = viewport.width > viewport.height;
  const isShortLandscape = isLandscape && viewport.height <= 560;

  // Close unified Connect/Install dropdown on outside click or Escape
  useEffect(() => {
    if (!isActionMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setIsActionMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsActionMenuOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isActionMenuOpen]);

  const handleInstallAppClick = async () => {
    setIsActionMenuOpen(false);
    if (pwa.isInstallable) {
      const accepted = await pwa.install();
      if (accepted) return;
    }
    setIsInstallModalOpen(true);
  };

  // Track device auto-rotation & viewport changes reliably across Android & iOS
  useEffect(() => {
    let settleTimer: number | null = null;
    const syncViewport = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    const handleRotate = () => {
      syncViewport();
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(syncViewport, 160);
    };

    window.addEventListener('resize', syncViewport, { passive: true });
    window.addEventListener('orientationchange', handleRotate, { passive: true });
    const screenOrientation = window.screen?.orientation;
    screenOrientation?.addEventListener?.('change', handleRotate);
    return () => {
      window.removeEventListener('resize', syncViewport);
      window.removeEventListener('orientationchange', handleRotate);
      screenOrientation?.removeEventListener?.('change', handleRotate);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
    };
  }, []);

  const unlockOrientationSafe = useCallback(() => {
    try {
      const ori = window.screen?.orientation as
        | (ScreenOrientation & { unlock?: () => void })
        | undefined;
      ori?.unlock?.();
    } catch {
      // Ignore unsupported browsers (e.g. iOS Safari)
    }
    setIsLandscapeLocked(false);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        const el = rootRef.current || document.documentElement;
        await el.requestFullscreen();
      } else {
        unlockOrientationSafe();
        await document.exitFullscreen();
      }
    } catch {
      // Fallback visual fullscreen toggle when blocked by iframe or iOS Safari
      setIsFullscreen((prev) => !prev);
      setChromeCollapsed((prev) => !prev);
    }
  }, [unlockOrientationSafe]);

  // 1-tap Rotate to Landscape + Fullscreen for Phone/Tablet Remote mode
  const toggleLandscapeMode = useCallback(async () => {
    const ori = window.screen?.orientation as
      | (ScreenOrientation & {
          lock?: (orientation: string) => Promise<void>;
          unlock?: () => void;
        })
      | undefined;

    if (isLandscapeLocked || document.fullscreenElement) {
      unlockOrientationSafe();
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        }
      } catch {
        // Ignore
      }
      setIsFullscreen(false);
      return;
    }

    let locked = false;
    try {
      const el = rootRef.current || document.documentElement;
      if (el.requestFullscreen && !document.fullscreenElement) {
        await el.requestFullscreen();
      }
      if (ori?.lock) {
        await ori.lock('landscape');
        locked = true;
        setIsLandscapeLocked(true);
      }
    } catch {
      // iOS Safari or desktop browsers without orientation.lock support
    }

    if (!locked) {
      if (window.innerWidth <= window.innerHeight) {
        setExportNotice('Putar HP/Tablet ke posisi mendatar (Landscape) — pastikan Auto-Rotate aktif');
        setTimeout(() => setExportNotice(null), 3200);
      } else {
        setChromeCollapsed((prev) => !prev);
      }
    }
  }, [isLandscapeLocked, unlockOrientationSafe]);

  useEffect(() => {
    const onFsChange = () => {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
      if (!active) {
        unlockOrientationSafe();
        setChromeCollapsed(false);
      } else if (wb.viewMode !== 'tablet') {
        setChromeCollapsed(true);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [wb.viewMode, unlockOrientationSafe]);

  // Global keyboard shortcuts (F = Fullscreen, Ctrl+Z = Undo, Ctrl+Y = Redo)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (isTyping) return;

      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        void toggleFullscreen();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          wb.redo();
        } else {
          wb.undo();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        wb.redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleFullscreen, wb]);

  const showToast = useCallback((msg: string) => {
    setExportNotice(msg);
    setTimeout(() => setExportNotice(null), 2600);
  }, []);

  // Notify immediately when Tablet/HP receives active board state from PC/Laptop Host
  useEffect(() => {
    if (wb.lastHostSyncedAt > 0) {
      showToast(`Terhubung ke papan aktif PC/Laptop (${wb.roomId})`);
    }
  }, [wb.lastHostSyncedAt, wb.roomId, showToast]);

  const handleExportPNG = () => {
    if (!wb.activePage) return;
    exportPageAsPNG(wb.activePage, wb.roomId);
    showToast(`Halaman "${wb.activePage.name}" diunduh sebagai PNG`);
  };

  const handleExportPDF = () => {
    if (wb.pages.length === 0) return;
    exportAllPagesAsPDF(wb.pages, wb.roomTitle, wb.roomId);
    showToast(`Flipchart (${wb.pages.length} lembar) diekspor ke PDF`);
  };

  // --- VIEW 1: EXTEND PROJECTOR WINDOW (?view=extend) ---
  if (wb.viewMode === 'extend') {
    return (
      <div
        ref={rootRef}
        onClick={() => setExtendControlsVisible((v) => !v)}
        className="h-[100dvh] w-screen bg-slate-950 flex items-center justify-center p-2 sm:p-4 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))] relative overflow-hidden group"
      >
        <div className="w-full h-full min-h-0 flex items-center justify-center [container-type:size]">
          <div
            className="flex items-center justify-center"
            style={{
              width: 'min(100cqw, calc(100cqh * 16 / 9))',
              height: 'min(100cqh, calc(100cqw * 9 / 16))',
            }}
          >
            <WhiteboardCanvas
              background={wb.activePage?.background || 'white'}
              elements={wb.activePage?.elements || []}
              remoteLiveElement={wb.remoteLiveElement}
              activeTool="pen"
              color={color}
              strokeSize={strokeSize}
              fontSize={fontSize}
              readOnly={true}
              onAddElement={() => {}}
              onUpdateElement={() => {}}
              onRemoveElement={() => {}}
              onEmitLiveStroke={() => {}}
            />
          </div>
        </div>

        {/* Accessible on both desktop hover AND touch tap */}
        <div
          onClick={(e) => e.stopPropagation()}
          className={`fixed top-4 right-4 z-30 flex items-center gap-2 transition-opacity bg-slate-900/95 sm:backdrop-blur-md text-white px-3 py-2 rounded-xl border border-slate-700 shadow-lg ${
            extendControlsVisible
              ? 'opacity-100 pointer-events-auto'
              : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto'
          }`}
        >
          <span className="text-xs font-mono text-slate-300 hidden sm:inline">
            {wb.roomId} · {wb.activePage?.name}
          </span>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="min-h-[44px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-xs font-semibold transition-colors"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            {isFullscreen ? 'Keluar Fullscreen' : 'Fullscreen (F)'}
          </button>
          <button
            type="button"
            onClick={() => wb.setViewMode('projector')}
            className="min-h-[44px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors"
          >
            Mode Utama
          </button>
        </div>

        <OfflineIndicator />
      </div>
    );
  }

  const isTabletMode = wb.viewMode === 'tablet';
  const isCanvasReadOnly = !isTabletMode && !wb.laptopCanEdit;
  const extendWindowUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?view=extend&room=${encodeURIComponent(wb.roomId)}`
      : `/?view=extend&room=${encodeURIComponent(wb.roomId)}`;

  // --- VIEW 2 & 3: PROJECTOR / MAIN LAPTOP MODE & TABLET / HP REMOTE MODE ---
  return (
    <div
      ref={rootRef}
      className={`h-[100dvh] w-screen flex flex-col overflow-hidden ${
        isFullscreen ? 'bg-slate-950' : 'bg-slate-100'
      }`}
    >
      {/* TOP BAR (Collapsible for ultra-clean whiteboard view on PC, Laptop, Tablet & HP) */}
      {!chromeCollapsed && !headerCollapsed && (
        <header
          className={`shrink-0 bg-white border-b border-slate-200 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:px-5 ${
            isShortLandscape ? 'py-1' : 'py-2'
          } flex items-center justify-between gap-2 sm:gap-3 z-20`}
        >
          {/* Brand & Room Context */}
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-display text-base sm:text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
              obeecreatives
            </span>
            <span className="hidden sm:inline text-slate-300" aria-hidden="true">
              /
            </span>
            <div className="flex items-center gap-1.5 text-xs text-slate-600 min-w-0">
              <button
                type="button"
                onClick={() => setIsConnectOpen(true)}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 sm:bg-transparent hover:bg-slate-100 border border-slate-200/80 sm:border-transparent transition-colors min-w-0"
                title="Klik untuk masukkan kode ruang PC/Laptop atau lihat QR Code"
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    wb.p2pState === 'connected'
                      ? 'bg-emerald-500'
                      : wb.cloudState === 'synced' || wb.p2pState === 'ready'
                      ? 'bg-teal-500'
                      : wb.p2pState === 'connecting' || wb.p2pState === 'initializing'
                      ? 'bg-slate-400 animate-pulse'
                      : 'bg-amber-500'
                  }`}
                />
                <span className="font-mono font-semibold text-slate-800 whitespace-nowrap">
                  {wb.roomId}
                </span>
                <span aria-hidden="true" className="hidden lg:inline text-slate-300">
                  ·
                </span>
                <span
                  className={`hidden lg:inline truncate max-w-[145px] font-medium ${
                    wb.p2pState === 'connected'
                      ? 'text-emerald-700'
                      : wb.cloudState === 'synced' || wb.p2pState === 'ready'
                      ? 'text-teal-700'
                      : wb.p2pState === 'not-found'
                      ? 'text-amber-700'
                      : 'text-slate-500'
                  }`}
                >
                  {wb.p2pState === 'connected'
                    ? isTabletMode
                      ? 'Terhubung ke PC'
                      : `Terhubung (${wb.p2pPeerCount})`
                    : wb.cloudState === 'synced'
                    ? 'Cloud Real-Time'
                    : wb.p2pState === 'ready'
                    ? 'Siap Remote'
                    : wb.p2pState === 'not-found'
                    ? 'Menunggu PC...'
                    : 'Menyambung...'}
                </span>
              </button>
              {!isTabletMode && (wb.isRemoteTransmitting || wb.p2pState === 'connected') && (
                <span className="hidden xl:inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md whitespace-nowrap">
                  <Radio className="w-3 h-3 animate-pulse" />
                  Remote Aktif
                </span>
              )}
            </div>
          </div>

          {/* Center Controls */}
          {isTabletMode ? (
            /* TABLET / HP REMOTE: Live Broadcast ON/OFF Quick Switch */
            <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto no-scrollbar">
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => void wb.toggleLiveBroadcast(true)}
                  className={`min-h-[38px] px-2.5 sm:px-3 rounded-lg inline-flex items-center gap-1.5 text-xs font-bold transition-colors whitespace-nowrap ${
                    wb.isLiveBroadcast
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Radio className="w-3.5 h-3.5 shrink-0" />
                  <span>Live: ON</span>
                </button>
                <button
                  type="button"
                  onClick={() => void wb.toggleLiveBroadcast(false)}
                  className={`min-h-[38px] px-2.5 sm:px-3 rounded-lg inline-flex items-center gap-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    !wb.isLiveBroadcast
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>Draft: OFF</span>
                </button>
              </div>

              {!wb.isLiveBroadcast && (
                <button
                  type="button"
                  onClick={async () => {
                    await wb.publishDraftNow();
                    showToast('Coretan draft dikirim ke layar Proyektor');
                  }}
                  className="min-h-[42px] px-3 rounded-xl bg-slate-900 text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-slate-800 whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Kirim ke Proyektor</span>
                </button>
              )}
            </div>
          ) : (
            /* LAPTOP / PROJECTOR: Mirror vs Edit Switch + Exports + Extend + Fullscreen */
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {/* Laptop Mirror vs Direct Edit segmented switch */}
              <div className="hidden md:flex items-center bg-slate-100 p-1 rounded-xl shrink-0">
                <button
                  type="button"
                  onClick={() => wb.setLaptopCanEdit(false)}
                  className={`min-h-[34px] px-2.5 rounded-lg inline-flex items-center gap-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    !wb.laptopCanEdit
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Tampilkan coretan dari Tablet tanpa risiko tercoret mouse Laptop"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Mirror Tablet
                </button>
                <button
                  type="button"
                  onClick={() => wb.setLaptopCanEdit(true)}
                  className={`min-h-[34px] px-2.5 rounded-lg inline-flex items-center gap-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    wb.laptopCanEdit
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Ikut menulis langsung di Laptop selain menerima dari Tablet"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit di Laptop
                </button>
              </div>

              {/* Export PNG & PDF */}
              <button
                type="button"
                onClick={handleExportPNG}
                title="Unduh halaman aktif sebagai gambar PNG resolusi tinggi"
                className="min-h-[42px] min-w-[42px] px-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span className="hidden xl:inline">PNG</span>
              </button>

              <button
                type="button"
                onClick={handleExportPDF}
                title="Unduh seluruh lembar flipchart menjadi 1 file PDF landscape"
                className="min-h-[42px] min-w-[42px] px-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <FileText className="w-4 h-4 text-teal-700 shrink-0" />
                <span className="hidden xl:inline">Ekspor PDF</span>
                <span className="hidden sm:inline xl:hidden">PDF</span>
              </button>

              <a
                href={extendWindowUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Buka Jendela Extend (Monitor ke-2 / Proyektor Bersih tanpa toolbar)"
                className="min-h-[42px] min-w-[42px] px-2.5 rounded-xl border border-teal-200 bg-teal-50/70 hover:bg-teal-100/80 text-teal-800 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <MonitorUp className="w-4 h-4 shrink-0" />
                <span className="hidden 2xl:inline">Extend Layar ke-2</span>
                <span className="hidden lg:inline 2xl:hidden">Extend</span>
              </a>

              <button
                type="button"
                onClick={toggleFullscreen}
                title="Fullscreen Proyektor (Shortcut: F)"
                className="min-h-[42px] min-w-[42px] px-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4 shrink-0" />
                ) : (
                  <Maximize2 className="w-4 h-4 shrink-0" />
                )}
                <span className="hidden 2xl:inline">Proyektor (F)</span>
              </button>
            </div>
          )}

          {/* Right Action Zone: Icon-only Undo/Redo + Unified Dynamic Connect/Install Dropdown + Collapse Header */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Compact Icon-Only Undo / Redo Group (Always visible in Header when editing) */}
            {!isCanvasReadOnly && (
              <div
                role="group"
                aria-label="Riwayat Coretan Undo dan Redo"
                className="inline-flex items-center bg-slate-50 border border-slate-200 rounded-xl p-0.5 shrink-0"
              >
                <button
                  type="button"
                  onClick={wb.undo}
                  disabled={!wb.canUndo}
                  title="Urungkan (Ctrl+Z)"
                  aria-label="Undo"
                  className="w-[38px] h-[38px] rounded-lg inline-flex items-center justify-center text-slate-700 hover:bg-white hover:text-slate-900 hover:shadow-xs active:scale-95 disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:shadow-none disabled:active:scale-100 transition-all cursor-pointer disabled:cursor-not-allowed"
                >
                  <Undo2 className="w-4 h-4" />
                </button>
                <span className="w-px h-4 bg-slate-200/90" aria-hidden="true" />
                <button
                  type="button"
                  onClick={wb.redo}
                  disabled={!wb.canRedo}
                  title="Ulangi (Ctrl+Y / Ctrl+Shift+Z)"
                  aria-label="Redo"
                  className="w-[38px] h-[38px] rounded-lg inline-flex items-center justify-center text-slate-700 hover:bg-white hover:text-slate-900 hover:shadow-xs active:scale-95 disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:shadow-none disabled:active:scale-100 transition-all cursor-pointer disabled:cursor-not-allowed"
                >
                  <Redo2 className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Tablet-specific quick controls */}
            {isTabletMode && (
              <>
                <button
                  type="button"
                  onClick={() => void toggleLandscapeMode()}
                  title={
                    isLandscapeLocked || isFullscreen
                      ? 'Keluar Mode Landscape / Layar Penuh'
                      : 'Putar ke Landscape / Layar Penuh'
                  }
                  aria-label="Putar ke Landscape"
                  className={`min-w-[42px] min-h-[42px] px-2 rounded-xl border inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    isLandscapeLocked || isFullscreen
                      ? 'border-teal-600 bg-teal-50 text-teal-800'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {isLandscapeLocked || isFullscreen ? (
                    <Minimize2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <RotateCw className="w-4 h-4 shrink-0" />
                  )}
                  <span className="hidden lg:inline">
                    {isLandscapeLocked || isFullscreen ? 'Normal' : 'Landscape'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setChromeCollapsed(true)}
                  title="Sembunyikan toolbar agar kanvas tulis maksimal"
                  aria-label="Fokus Kanvas"
                  className="min-w-[42px] min-h-[42px] rounded-xl border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-50 shrink-0"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleExportPDF}
                  title="Unduh semua lembar ke PDF"
                  aria-label="Unduh PDF"
                  className="hidden sm:flex min-w-[42px] min-h-[42px] rounded-xl border border-slate-200 items-center justify-center text-slate-700 hover:bg-slate-50 shrink-0"
                >
                  <FileText className="w-4 h-4" />
                </button>
              </>
            )}

            {/* Unified Dynamic Action Button: Hubungkan Tablet/HP (QR) + Pasang Aplikasi */}
            <div ref={actionMenuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (pwa.isInstalled) {
                    setIsConnectOpen(true);
                  } else {
                    setIsActionMenuOpen((prev) => !prev);
                  }
                }}
                aria-haspopup={!pwa.isInstalled ? 'menu' : undefined}
                aria-expanded={!pwa.isInstalled ? isActionMenuOpen : undefined}
                title={
                  pwa.isInstalled
                    ? 'Hubungkan Tablet / HP (QR & Kode Ruang)'
                    : 'Hubungkan Tablet / HP (QR) atau Pasang Aplikasi'
                }
                className={`min-h-[42px] px-3 sm:px-3.5 rounded-xl text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors whitespace-nowrap cursor-pointer ${
                  isTabletMode
                    ? 'bg-slate-900 hover:bg-slate-800'
                    : 'bg-teal-600 hover:bg-teal-700'
                }`}
              >
                <QrCode className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">
                  {isTabletMode ? 'Koneksi' : 'Hubungkan'}
                </span>
                {!pwa.isInstalled && (
                  <ChevronDown
                    className={`w-3.5 h-3.5 opacity-90 transition-transform duration-150 ${
                      isActionMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                )}
              </button>

              {/* Dynamic Dropdown Menu (Shown when app is not yet installed as standalone PWA) */}
              {!pwa.isInstalled && isActionMenuOpen && (
                <div
                  role="menu"
                  aria-label="Menu Koneksi dan Pasang Aplikasi"
                  className="absolute right-0 top-full mt-2 w-[280px] rounded-2xl bg-white border border-slate-200/90 shadow-xl p-1.5 z-50"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsActionMenuOpen(false);
                      setIsConnectOpen(true);
                    }}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 border border-teal-100 flex items-center justify-center shrink-0">
                      <QrCode className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-900 leading-tight">
                        Hubungkan Tablet / HP (QR)
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {wb.p2pState === 'connected'
                          ? isTabletMode
                            ? `Terhubung ke PC (${wb.roomId})`
                            : `${wb.p2pPeerCount} Remote aktif · ${wb.roomId}`
                          : `Scan QR / kode ruang ${wb.roomId}`}
                      </div>
                    </div>
                  </button>

                  <div className="h-px bg-slate-100 my-1 mx-2" />

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleInstallAppClick()}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                      <Download className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-900 leading-tight flex items-center gap-1.5">
                        <span>Pasang Aplikasi</span>
                        <Smartphone className="w-3 h-3 text-slate-400 shrink-0" />
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {pwa.isInstallable
                          ? 'Instal langsung di perangkat ini'
                          : 'Buka cepat layar penuh & mode offline'}
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Independent Collapse Header Trigger */}
            <button
              type="button"
              onClick={() => {
                setIsActionMenuOpen(false);
                setHeaderCollapsed(true);
              }}
              title="Ciutkan menu header agar papan tulis lebih bersih"
              aria-label="Ciutkan Header"
              className="min-w-[42px] min-h-[42px] rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors shrink-0"
            >
              <PanelTopClose className="w-4 h-4" />
            </button>
          </div>
        </header>
      )}

      {/* Floating Top-Left Slim Dock when Header is Collapsed & Left Sidebar is Collapsed/Hidden (0% canvas overlap) */}
      {!chromeCollapsed && headerCollapsed && (sidebarCollapsed || isCanvasReadOnly) && (
        <div
          role="group"
          aria-label="Kontrol Header dan Undo Redo"
          className="fixed top-[max(0.625rem,env(safe-area-inset-top))] left-[max(0.5rem,env(safe-area-inset-left))] z-30 min-w-[44px] py-2 px-1.5 rounded-2xl bg-white/95 sm:backdrop-blur-md border border-slate-200/90 shadow-lg flex flex-col items-center gap-1"
        >
          <button
            type="button"
            onClick={() => setHeaderCollapsed(false)}
            title={`Tampilkan menu header (obeecreatives · ${wb.roomId})`}
            aria-label="Tampilkan Header"
            className="w-[34px] h-[34px] rounded-xl inline-flex items-center justify-center text-teal-600 hover:bg-teal-50 transition-all active:scale-95"
          >
            <PanelTopOpen className="w-4 h-4 shrink-0" />
          </button>

          {!isCanvasReadOnly && (
            <>
              <span className="w-5 h-px bg-slate-200 my-0.5" aria-hidden="true" />
              <button
                type="button"
                onClick={wb.undo}
                disabled={!wb.canUndo}
                title="Urungkan (Ctrl+Z)"
                aria-label="Undo"
                className="w-[34px] h-[34px] rounded-xl inline-flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-35 disabled:hover:bg-transparent transition-colors"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={wb.redo}
                disabled={!wb.canRedo}
                title="Ulangi (Ctrl+Y)"
                aria-label="Redo"
                className="w-[34px] h-[34px] rounded-xl inline-flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-35 disabled:hover:bg-transparent transition-colors"
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      )}

      {/* MAIN WORKSPACE: Left Drawing Mini-Sidebar + Full-Height 16:9 Canvas Stage + Right Flipchart Mini-Sidebar */}
      <main
        className={`flex-1 min-h-0 w-full flex flex-row items-stretch gap-2 sm:gap-3 ${
          chromeCollapsed
            ? 'p-1.5 sm:p-3 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))]'
            : isShortLandscape
            ? 'px-2 py-1 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pb-[max(0.375rem,env(safe-area-inset-bottom))]'
            : 'px-2.5 py-2 sm:px-4 sm:py-3 pl-[max(0.625rem,env(safe-area-inset-left))] pr-[max(0.625rem,env(safe-area-inset-right))] pb-[max(0.625rem,env(safe-area-inset-bottom))]'
        } relative`}
      >
        {/* Left Collapsible Mini-Sidebar for Drawing Tools (+ Integrated Top Expand/Undo Bar when Header is Collapsed & Sidebar Expanded) */}
        {!chromeCollapsed && !isCanvasReadOnly && (
          sidebarCollapsed ? (
            <DrawingToolbar
              activeTool={activeTool}
              onSelectTool={setActiveTool}
              color={color}
              onSelectColor={setColor}
              stickyColor={stickyColor}
              onSelectStickyColor={setStickyColor}
              strokeSize={strokeSize}
              onSelectStrokeSize={setStrokeSize}
              fontSize={fontSize}
              onSelectFontSize={setFontSize}
              background={wb.activePage?.background || 'white'}
              onSelectBackground={(bg) => void wb.setActivePageBackground(bg)}
              onClearPage={wb.clearActivePage}
              onOpenTemplates={() => setIsTemplatesOpen(true)}
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
              compact={isTabletMode}
            />
          ) : (
            <div className="shrink-0 flex flex-col gap-1.5 h-full max-h-full z-20">
              {headerCollapsed && (
                <div
                  role="group"
                  aria-label="Tampilkan Header dan Undo Redo"
                  className="shrink-0 w-[100px] sm:w-[110px] bg-white border border-slate-200/90 rounded-2xl shadow-sm p-1 flex items-center justify-between"
                >
                  <button
                    type="button"
                    onClick={() => setHeaderCollapsed(false)}
                    title={`Tampilkan menu header (obeecreatives · ${wb.roomId})`}
                    aria-label="Tampilkan Header"
                    className="w-[30px] sm:w-[32px] h-[34px] rounded-xl inline-flex items-center justify-center text-teal-600 hover:bg-teal-50 transition-colors"
                  >
                    <PanelTopOpen className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={wb.undo}
                    disabled={!wb.canUndo}
                    title="Urungkan (Ctrl+Z)"
                    aria-label="Undo"
                    className="w-[30px] sm:w-[32px] h-[34px] rounded-xl inline-flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-35 disabled:hover:bg-transparent transition-colors"
                  >
                    <Undo2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={wb.redo}
                    disabled={!wb.canRedo}
                    title="Ulangi (Ctrl+Y)"
                    aria-label="Redo"
                    className="w-[30px] sm:w-[32px] h-[34px] rounded-xl inline-flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-35 disabled:hover:bg-transparent transition-colors"
                  >
                    <Redo2 className="w-4 h-4" />
                  </button>
                </div>
              )}
              <div className="flex-1 min-h-0 flex">
                <DrawingToolbar
                  activeTool={activeTool}
                  onSelectTool={setActiveTool}
                  color={color}
                  onSelectColor={setColor}
                  stickyColor={stickyColor}
                  onSelectStickyColor={setStickyColor}
                  strokeSize={strokeSize}
                  onSelectStrokeSize={setStrokeSize}
                  fontSize={fontSize}
                  onSelectFontSize={setFontSize}
                  background={wb.activePage?.background || 'white'}
                  onSelectBackground={(bg) => void wb.setActivePageBackground(bg)}
                  onClearPage={wb.clearActivePage}
                  onOpenTemplates={() => setIsTemplatesOpen(true)}
                  collapsed={sidebarCollapsed}
                  onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
                  compact={isTabletMode}
                />
              </div>
            </div>
          )
        )}

        {/* Center Stage Column: Optional Mirror Bar + Precision 16:9 Canvas */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col items-center justify-center relative">
          {/* Subtle informational bar on Mirror mode */}
          {!chromeCollapsed && isCanvasReadOnly && (
            <div className="mb-1.5 w-full max-w-[1280px] flex items-center justify-between text-xs text-slate-600 px-1">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Monitor className="w-3.5 h-3.5 text-teal-600" />
                Mode Mirror Aktif — Layar menerima coretan live dari Tablet/HP secara otomatis.
              </span>
              <button
                type="button"
                onClick={() => wb.setLaptopCanEdit(true)}
                className="text-teal-700 font-semibold hover:underline"
              >
                Aktifkan Edit di Laptop
              </button>
            </div>
          )}

          {/* Mathematically exact 16:9 Container-Query Stage (auto-expands when header or sidebars collapse!) */}
          <div className="flex-1 w-full h-full min-h-0 flex items-center justify-center [container-type:size]">
            <div
              className="flex items-center justify-center"
              style={{
                width: 'min(100cqw, calc(100cqh * 16 / 9))',
                height: 'min(100cqh, calc(100cqw * 9 / 16))',
              }}
            >
              <WhiteboardCanvas
                background={wb.activePage?.background || 'white'}
                elements={wb.activePage?.elements || []}
                remoteLiveElement={wb.remoteLiveElement}
                activeTool={activeTool}
                color={color}
                stickyColor={stickyColor}
                strokeSize={strokeSize}
                fontSize={fontSize}
                readOnly={isCanvasReadOnly}
                onAddElement={wb.addElement}
                onUpdateElement={wb.updateElement}
                onRemoveElement={wb.removeElementById}
                onEmitLiveStroke={wb.emitLiveStroke}
              />
            </div>
          </div>
        </div>

        {/* Right Collapsible Mini-Sidebar for Flipchart Pages & Mode Switcher */}
        {!chromeCollapsed && (
          <FlipchartBar
            pages={wb.pages}
            activePageId={wb.activePageId}
            readOnly={isCanvasReadOnly}
            collapsed={rightSidebarCollapsed}
            onToggleCollapse={() => setRightSidebarCollapsed((v) => !v)}
            isTabletMode={isTabletMode}
            onToggleViewMode={() => wb.setViewMode(isTabletMode ? 'projector' : 'tablet')}
            onSelectPage={(id) => void wb.selectPage(id)}
            onAddPage={() => void wb.addPage()}
            onRenamePage={(id, name) => void wb.renamePage(id, name)}
            onDeletePage={(id) => void wb.deletePage(id)}
          />
        )}

        {/* Fullscreen / Collapsed Chrome Floating Controls (Includes Icon-Only Undo/Redo when editing) */}
        {(isFullscreen || chromeCollapsed) && (
          <div className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-[max(0.75rem,env(safe-area-inset-right))] z-40 flex items-center gap-2">
            {chromeCollapsed && !isCanvasReadOnly && (
              <div className="inline-flex items-center bg-slate-900/95 border border-slate-700 rounded-xl p-0.5 shadow-lg sm:backdrop-blur-sm">
                <button
                  type="button"
                  onClick={wb.undo}
                  disabled={!wb.canUndo}
                  title="Urungkan (Ctrl+Z)"
                  aria-label="Undo"
                  className="w-[40px] h-[40px] rounded-lg inline-flex items-center justify-center text-white hover:bg-slate-800 disabled:opacity-35 transition-colors"
                >
                  <Undo2 className="w-4 h-4" />
                </button>
                <span className="w-px h-4 bg-slate-700" aria-hidden="true" />
                <button
                  type="button"
                  onClick={wb.redo}
                  disabled={!wb.canRedo}
                  title="Ulangi (Ctrl+Y)"
                  aria-label="Redo"
                  className="w-[40px] h-[40px] rounded-lg inline-flex items-center justify-center text-white hover:bg-slate-800 disabled:opacity-35 transition-colors"
                >
                  <Redo2 className="w-4 h-4" />
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => setChromeCollapsed((c) => !c)}
              className="min-h-[44px] px-3.5 rounded-xl bg-slate-900/95 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-lg border border-slate-700 sm:backdrop-blur-sm"
            >
              {chromeCollapsed ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  Tampilkan Toolbar
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  Sembunyikan Toolbar
                </>
              )}
            </button>
            {isFullscreen && chromeCollapsed && (
              <button
                type="button"
                onClick={toggleFullscreen}
                className="min-h-[44px] px-3 rounded-xl bg-slate-900/95 hover:bg-slate-800 text-slate-200 text-xs font-medium inline-flex items-center gap-1.5 shadow-lg border border-slate-700 sm:backdrop-blur-sm"
              >
                <Minimize2 className="w-4 h-4" />
                Keluar
              </button>
            )}
          </div>
        )}

        {/* Export / Draft / Rotation / Room Confirmation Toast */}
        {exportNotice && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 max-w-[90vw] text-center bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg">
            {exportNotice}
          </div>
        )}
      </main>

      {/* Modals & Overlays */}
      <ConnectModal
        isOpen={isConnectOpen}
        onClose={() => setIsConnectOpen(false)}
        viewMode={wb.viewMode}
        roomId={wb.roomId}
        user={wb.user}
        authError={wb.authError}
        anonymousProviderDisabled={wb.anonymousProviderDisabled}
        cloudState={wb.cloudState}
        cloudMessage={wb.cloudMessage}
        p2pState={wb.p2pState}
        p2pPeerCount={wb.p2pPeerCount}
        p2pMessage={wb.p2pMessage}
        onSwitchRoom={wb.switchRoom}
        onCreateNewRoom={wb.createNewRoom}
        onRetryConnect={wb.retryCloudConnect}
        onSignIn={wb.handleGoogleSignIn}
        onSignOut={wb.handleGoogleSignOut}
        onSwitchToExtendHere={() => wb.setViewMode('extend')}
        onSwitchToTabletHere={() => wb.setViewMode('tablet')}
        onRoomSwitched={(code, isRemote) =>
          showToast(
            isRemote
              ? `Menghubungkan Remote ke papan PC (${code})...`
              : `Ruang aktif: ${code}`
          )
        }
      />

      <PWAInstallModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
        isInstallable={pwa.isInstallable}
        platform={pwa.platform}
        isInIframe={pwa.isInIframe}
        onInstall={pwa.install}
      />

      <TemplateDrawer
        isOpen={isTemplatesOpen}
        onClose={() => setIsTemplatesOpen(false)}
        templates={wb.allTemplates}
        onApply={(tpl, mode) => void wb.applyTemplateToActivePage(tpl, mode)}
        onSaveCurrentAsTemplate={wb.saveActivePageAsTemplate}
        onDeleteCustom={wb.deleteCustomTemplate}
      />

      <OfflineIndicator />
    </div>
  );
}
