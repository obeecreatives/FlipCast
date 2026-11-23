import React, { useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Layers,
  Monitor,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import { FlipchartPage, MAX_PAGES } from '../types/whiteboard';

interface FlipchartBarProps {
  pages: FlipchartPage[];
  activePageId: string;
  readOnly: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  isTabletMode: boolean;
  onToggleViewMode: () => void;
  onSelectPage: (pageId: string) => void;
  onAddPage: () => void;
  onRenamePage: (pageId: string, name: string) => void;
  onDeletePage: (pageId: string) => void;
}

export const FlipchartBar: React.FC<FlipchartBarProps> = React.memo(({
  pages,
  activePageId,
  readOnly,
  collapsed,
  onToggleCollapse,
  isTabletMode,
  onToggleViewMode,
  onSelectPage,
  onAddPage,
  onRenamePage,
  onDeletePage,
}) => {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const activeIdx = Math.max(
    0,
    pages.findIndex((p) => p.pageId === activePageId)
  );

  const goPrev = () => {
    if (activeIdx > 0) {
      onSelectPage(pages[activeIdx - 1].pageId);
    }
  };

  const goNext = () => {
    if (activeIdx < pages.length - 1) {
      onSelectPage(pages[activeIdx + 1].pageId);
    }
  };

  const startRename = (page: FlipchartPage) => {
    setRenamingId(page.pageId);
    setRenameDraft(page.name);
    setConfirmDeleteId(null);
  };

  const commitRename = () => {
    if (renamingId && renameDraft.trim()) {
      onRenamePage(renamingId, renameDraft.trim());
    }
    setRenamingId(null);
  };

  // COLLAPSED STATE: Compact floating right-edge handle (positioned mid-upper right, safe from palm rest on tablets)
  if (collapsed) {
    return (
      <div className="fixed right-[max(0.5rem,env(safe-area-inset-right))] top-[42%] -translate-y-1/2 z-30 flex flex-col items-center gap-1.5">
        <button
          type="button"
          onClick={onToggleCollapse}
          title="Buka Sidebar Lembar Flipchart"
          aria-label="Buka Sidebar Lembar"
          className="min-w-[44px] py-3 px-2 rounded-2xl bg-white/95 hover:bg-slate-50 border border-slate-200/90 shadow-lg flex flex-col items-center gap-1.5 text-slate-700 transition-all active:scale-95"
        >
          <PanelRightOpen className="w-4 h-4 text-teal-600" />
          <span className="w-6 h-px bg-slate-200" aria-hidden="true" />
          <Layers className="w-4 h-4 text-slate-800" />
          <span className="font-mono text-[10px] font-bold text-slate-700 leading-none">
            {activeIdx + 1}/{pages.length}
          </span>
        </button>

        {!readOnly && pages.length < MAX_PAGES && (
          <button
            type="button"
            onClick={onAddPage}
            title="Tambah Lembar Baru"
            aria-label="Tambah Lembar Baru"
            className="w-[44px] h-[44px] rounded-2xl bg-teal-600 hover:bg-teal-700 text-white shadow-md flex items-center justify-center transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  // EXPANDED STATE: Collapsible Right Mini-Sidebar (symmetrical with Left Drawing Mini-Sidebar)
  return (
    <aside
      aria-label="Sidebar Lembar Flipchart"
      className="shrink-0 w-[156px] sm:w-[174px] h-full max-h-full bg-white border border-slate-200/90 rounded-2xl shadow-sm flex flex-col overflow-hidden z-20"
    >
      {/* Header with Collapse Toggle */}
      <div className="shrink-0 flex items-center justify-between px-2.5 py-1.5 border-b border-slate-100">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Lembar
          </span>
          <span className="font-mono text-[11px] font-semibold text-slate-400">
            {activeIdx + 1}/{pages.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          title="Ciutkan Sidebar Lembar"
          aria-label="Ciutkan Sidebar Lembar"
          className="min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
        >
          <PanelRightClose className="w-4 h-4" />
        </button>
      </div>

      {/* Quick Prev / Next Navigation Row */}
      <div className="shrink-0 px-2 pt-2 pb-1.5 border-b border-slate-100 flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={goPrev}
          disabled={activeIdx <= 0}
          aria-label="Lembar sebelumnya"
          title="Lembar sebelumnya"
          className="flex-1 min-h-[36px] rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/70 flex items-center justify-center text-slate-700 disabled:opacity-35 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={activeIdx >= pages.length - 1}
          aria-label="Lembar berikutnya"
          title="Lembar berikutnya"
          className="flex-1 min-h-[36px] rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/70 flex items-center justify-center text-slate-700 disabled:opacity-35 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Vertical Scrollable Flipchart Page List */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-2 space-y-1.5">
        {pages.map((page, index) => {
          const isActive = page.pageId === activePageId;
          const isRenaming = renamingId === page.pageId;
          const isDeleting = confirmDeleteId === page.pageId;

          if (isRenaming) {
            return (
              <form
                key={page.pageId}
                onSubmit={(e) => {
                  e.preventDefault();
                  commitRename();
                }}
                className="rounded-xl bg-slate-100 border border-slate-200 p-1.5 space-y-1.5"
              >
                <input
                  type="text"
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  maxLength={80}
                  autoFocus
                  className="w-full bg-white border border-teal-500 rounded-lg px-2 py-1 text-base sm:text-xs font-medium text-slate-900 focus:outline-none"
                />
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="submit"
                    className="min-h-[30px] rounded-lg bg-teal-600 text-white hover:bg-teal-700 flex items-center justify-center text-[11px] font-semibold gap-1"
                    title="Simpan nama"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Simpan
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenamingId(null)}
                    className="min-h-[30px] rounded-lg bg-white text-slate-600 hover:bg-slate-200 flex items-center justify-center text-[11px] font-medium gap-1"
                    title="Batal"
                  >
                    <X className="w-3.5 h-3.5" />
                    Batal
                  </button>
                </div>
              </form>
            );
          }

          if (isDeleting) {
            return (
              <div
                key={page.pageId}
                className="rounded-xl bg-red-50 border border-red-200 p-2 space-y-1.5 text-center"
              >
                <span className="block text-[11px] font-semibold text-red-700 truncate">
                  Hapus {page.name}?
                </span>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      onDeletePage(page.pageId);
                      setConfirmDeleteId(null);
                    }}
                    className="py-1 rounded-lg bg-red-600 text-white text-[11px] font-semibold hover:bg-red-700"
                  >
                    Hapus
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(null)}
                    className="py-1 rounded-lg bg-white text-slate-700 text-[11px] font-medium hover:bg-slate-100"
                  >
                    Batal
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div
              key={page.pageId}
              className={`group rounded-xl border transition-all ${
                isActive
                  ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                  : 'bg-slate-50/90 border-slate-200/80 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectPage(page.pageId)}
                onDoubleClick={() => {
                  if (!readOnly) startRename(page);
                }}
                className="w-full min-h-[42px] px-2.5 py-2 flex items-center gap-2 text-left"
              >
                <span
                  className={`w-3 h-3 rounded-xs shrink-0 border ${
                    page.background === 'chalkboard'
                      ? 'bg-[#14332B] border-emerald-400/50'
                      : page.background === 'grid'
                      ? 'bg-slate-200 border-slate-400'
                      : page.background === 'lined'
                      ? 'bg-sky-100 border-sky-400'
                      : 'bg-white border-slate-300'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold truncate leading-tight">
                    {page.name}
                  </span>
                  <span
                    className={`block text-[10px] font-mono leading-tight mt-0.5 ${
                      isActive ? 'text-slate-400' : 'text-slate-400'
                    }`}
                  >
                    #{index + 1}
                  </span>
                </div>
              </button>

              {!readOnly && isActive && (
                <div className="flex items-center justify-end gap-1 px-2 pb-1.5 pt-0.5 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => startRename(page)}
                    title="Ganti nama lembar"
                    className="min-w-[30px] min-h-[28px] rounded-md text-slate-300 hover:text-white hover:bg-white/15 flex items-center justify-center transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {pages.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(page.pageId)}
                      title="Hapus lembar"
                      className="min-w-[30px] min-h-[28px] rounded-md text-slate-300 hover:text-red-300 hover:bg-white/15 flex items-center justify-center transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Actions inside Right Sidebar: Add Page + Mode Switcher */}
      <div className="shrink-0 p-2 border-t border-slate-100 space-y-1.5 bg-slate-50/50">
        {!readOnly && (
          <button
            type="button"
            onClick={onAddPage}
            disabled={pages.length >= MAX_PAGES}
            className="w-full min-h-[42px] px-2.5 rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Lembar Baru</span>
          </button>
        )}

        <button
          type="button"
          onClick={onToggleViewMode}
          title={isTabletMode ? 'Beralih ke Mode Proyektor Laptop' : 'Beralih ke Mode Remote Tablet'}
          className="w-full min-h-[40px] px-2.5 rounded-xl bg-white border border-slate-200/90 text-xs font-semibold text-slate-700 hover:bg-slate-100 inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
        >
          {isTabletMode ? (
            <>
              <Monitor className="w-3.5 h-3.5 text-slate-600 shrink-0" />
              <span>Mode Proyektor</span>
            </>
          ) : (
            <>
              <Smartphone className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span>Mode Tablet</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
});
