import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileText,
  Layers,
  Minimize2,
  Pin,
  PinOff,
  Plus,
  QrCode,
  Redo2,
  Sparkles,
  Undo2,
} from 'lucide-react';
import { FlipchartPage } from '../types/whiteboard';

interface FullscreenFloatingDockProps {
  visible: boolean;
  pinned: boolean;
  isFullscreen: boolean;
  readOnly: boolean;
  roomId: string;
  pages: FlipchartPage[];
  activePageId: string;
  canUndo: boolean;
  canRedo: boolean;
  smoothWriting: boolean;
  onToggleSmoothWriting: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSelectPage: (pageId: string) => void;
  onAddPage: () => void;
  onOpenConnect: () => void;
  onExportPDF: () => void;
  onTogglePin: () => void;
  onExit: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onPopoverOpenChange?: (open: boolean) => void;
}

export const FullscreenFloatingDock: React.FC<FullscreenFloatingDockProps> = ({
  visible,
  pinned,
  isFullscreen,
  readOnly,
  roomId,
  pages,
  activePageId,
  canUndo,
  canRedo,
  smoothWriting,
  onToggleSmoothWriting,
  onUndo,
  onRedo,
  onSelectPage,
  onAddPage,
  onOpenConnect,
  onExportPDF,
  onTogglePin,
  onExit,
  onPointerEnter,
  onPointerLeave,
  onPopoverOpenChange,
}) => {
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const dockRef = useRef<HTMLDivElement | null>(null);

  const activeIdx = Math.max(
    0,
    pages.findIndex((p) => p.pageId === activePageId)
  );
  const activePage = pages[activeIdx];
  const hasPrev = activeIdx > 0;
  const hasNext = activeIdx < pages.length - 1;

  useEffect(() => {
    if (!visible && pageMenuOpen) {
      setPageMenuOpen(false);
    }
  }, [visible, pageMenuOpen]);

  useEffect(() => {
    onPopoverOpenChange?.(pageMenuOpen);
  }, [pageMenuOpen, onPopoverOpenChange]);

  useEffect(() => {
    if (!pageMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (dockRef.current && !dockRef.current.contains(e.target as Node)) {
        setPageMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [pageMenuOpen]);

  return (
    <div
      ref={dockRef}
      data-floating-overlay="bottom"
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
      className={`fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-40 max-w-[96vw] transition-all duration-200 ease-out ${
        visible
          ? 'translate-y-0 opacity-100 pointer-events-auto'
          : 'translate-y-[135%] opacity-0 pointer-events-none'
      }`}
    >
      {/* Upward Page Picker Popover */}
      {pageMenuOpen && visible && (
        <div
          role="menu"
          aria-label="Pilih Lembar Flipchart"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 w-60 max-h-64 overflow-y-auto rounded-2xl bg-slate-900/95 sm:backdrop-blur-md border border-slate-700/90 shadow-2xl p-1.5 text-slate-100"
        >
          <div className="px-2.5 py-1.5 flex items-center justify-between border-b border-slate-800 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Lembar Flipchart
            </span>
            <span className="text-[11px] font-mono text-slate-400">{roomId}</span>
          </div>
          <div className="space-y-0.5">
            {pages.map((page, idx) => {
              const isActive = page.pageId === activePageId;
              return (
                <button
                  key={page.pageId}
                  type="button"
                  onClick={() => {
                    onSelectPage(page.pageId);
                    setPageMenuOpen(false);
                  }}
                  className={`w-full min-h-[38px] px-2.5 py-1.5 rounded-xl flex items-center gap-2 text-left text-xs transition-colors ${
                    isActive
                      ? 'bg-teal-600 text-white font-semibold'
                      : 'text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <span
                    className={`w-3 h-3 rounded-xs border shrink-0 ${
                      page.background === 'chalkboard'
                        ? 'bg-emerald-950 border-emerald-500/50'
                        : 'bg-white border-slate-400'
                    }`}
                  />
                  <span className="flex-1 truncate">{page.name}</span>
                  <span className="text-[10px] font-mono opacity-75">{idx + 1}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Floating Dock Pill */}
      <div className="flex items-center gap-1 sm:gap-1.5 bg-slate-900/95 sm:backdrop-blur-md border border-slate-700/80 text-white rounded-2xl shadow-2xl px-2 py-1.5 overflow-x-auto no-scrollbar">
        {/* Undo / Redo */}
        {!readOnly && (
          <>
            <div className="inline-flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                title="Urungkan (Ctrl+Z)"
                aria-label="Undo"
                className="w-[38px] h-[38px] rounded-xl inline-flex items-center justify-center text-slate-100 hover:bg-slate-800 active:scale-95 disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo}
                title="Ulangi (Ctrl+Y)"
                aria-label="Redo"
                className="w-[38px] h-[38px] rounded-xl inline-flex items-center justify-center text-slate-100 hover:bg-slate-800 active:scale-95 disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                <Redo2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onToggleSmoothWriting}
                aria-pressed={smoothWriting}
                title={`Haluskan Tulisan (${smoothWriting ? 'AKTIF' : 'MATI'})`}
                aria-label={`Haluskan Tulisan (${smoothWriting ? 'AKTIF' : 'MATI'})`}
                className={`w-[38px] h-[38px] rounded-xl inline-flex items-center justify-center transition-all active:scale-95 cursor-pointer ${
                  smoothWriting
                    ? 'bg-teal-600/25 text-teal-300 ring-1 ring-teal-500/50 hover:bg-teal-600/35'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                }`}
              >
                <Sparkles className="w-4 h-4" />
              </button>
            </div>
            <span className="w-px h-5 bg-slate-700 shrink-0" aria-hidden="true" />
          </>
        )}

        {/* Flipchart Page Stepper & Picker */}
        <div className="inline-flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            disabled={!hasPrev}
            onClick={() => hasPrev && onSelectPage(pages[activeIdx - 1].pageId)}
            title="Lembar Sebelumnya"
            aria-label="Lembar Sebelumnya"
            className="w-[36px] h-[38px] rounded-xl inline-flex items-center justify-center text-slate-200 hover:bg-slate-800 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setPageMenuOpen((v) => !v)}
            title="Pilih Lembar Flipchart"
            className={`min-h-[38px] px-2.5 rounded-xl inline-flex items-center gap-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
              pageMenuOpen
                ? 'bg-slate-800 text-teal-300'
                : 'text-slate-100 hover:bg-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-teal-400 shrink-0" />
            <span className="max-w-[96px] truncate hidden sm:inline">
              {activePage?.name || `Lembar ${activeIdx + 1}`}
            </span>
            <span className="font-mono text-[11px] text-slate-300">
              {activeIdx + 1}/{pages.length}
            </span>
            <ChevronUp
              className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                pageMenuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          <button
            type="button"
            disabled={!hasNext}
            onClick={() => hasNext && onSelectPage(pages[activeIdx + 1].pageId)}
            title="Lembar Berikutnya"
            aria-label="Lembar Berikutnya"
            className="w-[36px] h-[38px] rounded-xl inline-flex items-center justify-center text-slate-200 hover:bg-slate-800 disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {!readOnly && (
            <button
              type="button"
              onClick={onAddPage}
              title="Tambah Lembar Flipchart Baru"
              aria-label="Tambah Lembar Baru"
              className="w-[38px] h-[38px] rounded-xl bg-teal-600 hover:bg-teal-500 text-white inline-flex items-center justify-center transition-colors ml-0.5 shrink-0"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        <span className="w-px h-5 bg-slate-700 shrink-0" aria-hidden="true" />

        {/* Quick Actions: QR Connect + Export PDF + Pin + Exit Fullscreen */}
        <div className="inline-flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onOpenConnect}
            title={`Hubungkan Tablet / HP (${roomId})`}
            aria-label="Hubungkan Tablet atau HP"
            className="w-[38px] h-[38px] rounded-xl inline-flex items-center justify-center text-slate-200 hover:bg-slate-800 hover:text-teal-300 transition-colors"
          >
            <QrCode className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onExportPDF}
            title="Ekspor semua lembar ke PDF"
            aria-label="Ekspor PDF"
            className="w-[38px] h-[38px] rounded-xl inline-flex items-center justify-center text-slate-200 hover:bg-slate-800 hover:text-teal-300 transition-colors"
          >
            <FileText className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onTogglePin}
            title={pinned ? 'Lepas Pin (sembunyi otomatis)' : 'Pin Dock agar tetap tampil'}
            aria-label={pinned ? 'Lepas Pin Dock' : 'Pin Dock'}
            className={`w-[38px] h-[38px] rounded-xl inline-flex items-center justify-center transition-colors ${
              pinned
                ? 'bg-teal-600/25 text-teal-300 ring-1 ring-teal-500/50'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            {pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onExit}
            title={isFullscreen ? 'Keluar Fullscreen (F / Esc)' : 'Kembali ke Tampilan Normal'}
            className="min-h-[38px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ml-0.5"
          >
            <Minimize2 className="w-3.5 h-3.5 shrink-0" />
            <span>{isFullscreen ? 'Keluar' : 'Normal'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
