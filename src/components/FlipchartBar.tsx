import React, { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react';
import { FlipchartPage, MAX_PAGES } from '../types/whiteboard';

interface FlipchartBarProps {
  pages: FlipchartPage[];
  activePageId: string;
  readOnly: boolean;
  onSelectPage: (pageId: string) => void;
  onAddPage: () => void;
  onRenamePage: (pageId: string, name: string) => void;
  onDeletePage: (pageId: string) => void;
}

export const FlipchartBar: React.FC<FlipchartBarProps> = React.memo(({
  pages,
  activePageId,
  readOnly,
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

  return (
    <div className="w-full bg-white border border-slate-200/90 rounded-2xl shadow-sm px-2.5 py-1.5 flex items-center gap-2">
      {/* Prev / Next quick navigation */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={goPrev}
          disabled={activeIdx <= 0}
          aria-label="Lembar sebelumnya"
          className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-30 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-mono text-xs font-semibold text-slate-600 px-1 whitespace-nowrap">
          {activeIdx + 1} / {pages.length}
        </span>
        <button
          type="button"
          onClick={goNext}
          disabled={activeIdx >= pages.length - 1}
          aria-label="Lembar berikutnya"
          className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-30 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="w-px h-6 bg-slate-200 shrink-0" aria-hidden="true" />

      {/* Scrollable Flipchart Tabs */}
      <div className="flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        {pages.map((page) => {
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
                className="flex items-center gap-1 bg-slate-100 rounded-xl px-2 py-1 shrink-0"
              >
                <input
                  type="text"
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  maxLength={80}
                  autoFocus
                  className="w-32 bg-white border border-teal-500 rounded-lg px-2 py-1 text-base sm:text-xs font-medium text-slate-900 focus:outline-none"
                />
                <button
                  type="submit"
                  className="min-w-[36px] min-h-[36px] rounded-md bg-teal-600 text-white hover:bg-teal-700 flex items-center justify-center"
                  title="Simpan nama"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setRenamingId(null)}
                  className="min-w-[36px] min-h-[36px] rounded-md text-slate-500 hover:bg-slate-200 flex items-center justify-center"
                  title="Batal"
                >
                  <X className="w-4 h-4" />
                </button>
              </form>
            );
          }

          if (isDeleting) {
            return (
              <div
                key={page.pageId}
                className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-xl px-2.5 py-1.5 shrink-0"
              >
                <span className="text-[11px] font-semibold text-red-700 whitespace-nowrap">
                  Hapus {page.name}?
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onDeletePage(page.pageId);
                    setConfirmDeleteId(null);
                  }}
                  className="px-2 py-0.5 rounded-md bg-red-600 text-white text-[11px] font-semibold"
                >
                  Hapus
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(null)}
                  className="px-2 py-0.5 rounded-md bg-white text-slate-700 text-[11px] font-medium"
                >
                  Batal
                </button>
              </div>
            );
          }

          return (
            <div
              key={page.pageId}
              className={`group min-h-[44px] rounded-xl flex items-center gap-1.5 pl-3 pr-2 text-xs font-semibold transition-colors shrink-0 ${
                isActive
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectPage(page.pageId)}
                onDoubleClick={() => {
                  if (!readOnly) startRename(page);
                }}
                className="flex items-center gap-1.5 py-2 max-w-[140px] truncate"
              >
                <span
                  className={`w-2.5 h-2.5 rounded-xs shrink-0 border ${
                    page.background === 'chalkboard'
                      ? 'bg-[#14332B] border-emerald-400/50'
                      : page.background === 'grid'
                      ? 'bg-slate-200 border-slate-400'
                      : page.background === 'lined'
                      ? 'bg-sky-100 border-sky-400'
                      : 'bg-white border-slate-300'
                  }`}
                />
                <span className="truncate">{page.name}</span>
              </button>

              {!readOnly && isActive && (
                <div className="flex items-center gap-0.5 ml-0.5">
                  <button
                    type="button"
                    onClick={() => startRename(page)}
                    title="Ganti nama lembar"
                    className="min-w-[32px] min-h-[32px] rounded-md text-slate-300 hover:text-white hover:bg-white/15 flex items-center justify-center transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {pages.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(page.pageId)}
                      title="Hapus lembar"
                      className="min-w-[32px] min-h-[32px] rounded-md text-slate-300 hover:text-red-300 hover:bg-white/15 flex items-center justify-center transition-colors"
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

      {/* Add New Flipchart Page */}
      {!readOnly && (
        <button
          type="button"
          onClick={onAddPage}
          disabled={pages.length >= MAX_PAGES}
          className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Lembar Baru</span>
        </button>
      )}
    </div>
  );
});
