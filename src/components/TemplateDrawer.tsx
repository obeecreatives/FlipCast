import React, { useState } from 'react';
import { BookmarkPlus, LayoutTemplate, Plus, Trash2, X } from 'lucide-react';
import { QuickTemplate } from '../types/whiteboard';

interface TemplateDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  templates: QuickTemplate[];
  onApply: (tpl: QuickTemplate, mode: 'replace' | 'append') => void;
  onSaveCurrentAsTemplate: (title: string, category: string) => Promise<void>;
  onDeleteCustom: (templateId: string) => Promise<void>;
}

export const TemplateDrawer: React.FC<TemplateDrawerProps> = ({
  isOpen,
  onClose,
  templates,
  onApply,
  onSaveCurrentAsTemplate,
  onDeleteCustom,
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Catatan Saya');
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    await onSaveCurrentAsTemplate(title, category);
    setTitle('');
    setSaving(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 sm:backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl max-h-[90dvh] flex flex-col bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <LayoutTemplate className="w-5 h-5 text-teal-600 shrink-0" />
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Template Cepat & Kerangka Catatan
              </h2>
              <p className="text-xs text-slate-500">
                Sisipkan kerangka siap pakai ke halaman aktif atau simpan susunan teks Anda sendiri.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 shrink-0"
            aria-label="Tutup template"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Save current page as template */}
        <form
          onSubmit={handleSave}
          className="shrink-0 px-5 sm:px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row gap-2"
        >
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder="Simpan teks halaman ini jadi template baru..."
            className="flex-1 min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-base sm:text-sm text-slate-900 focus:outline-none focus:border-teal-600"
          />
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            maxLength={40}
            placeholder="Kategori"
            className="sm:w-36 min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 bg-white text-base sm:text-sm text-slate-900 focus:outline-none focus:border-teal-600"
          />
          <button
            type="submit"
            disabled={!title.trim() || saving}
            className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap"
          >
            <BookmarkPlus className="w-4 h-4" />
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </form>

        {/* Template Cards */}
        <div className="flex-1 p-5 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {templates.map((tpl) => (
            <div
              key={tpl.templateId}
              className="rounded-xl border border-slate-200 p-4 flex flex-col justify-between gap-3 hover:border-slate-300 transition-colors"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-slate-500">
                      {tpl.category} · {tpl.background === 'chalkboard' ? 'Papan Hijau' : tpl.background === 'grid' ? 'Kotak-Kotak' : tpl.background === 'lined' ? 'Bergaris' : 'Putih Polos'}
                    </p>
                    <h3 className="font-display text-sm font-bold text-slate-900 mt-0.5">
                      {tpl.title}
                    </h3>
                  </div>
                  {!tpl.isBuiltIn && (
                    <button
                      type="button"
                      onClick={() => onDeleteCustom(tpl.templateId)}
                      className="min-w-[40px] min-h-[40px] rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Hapus template kustom"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-600 line-clamp-2">
                  {tpl.blocks.map((b) => b.text.replace(/\n/g, ' ')).join(' · ') || 'Kerangka kosong dengan latar khusus'}
                </p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onApply(tpl, 'append');
                    onClose();
                  }}
                  className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Sisipkan
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onApply(tpl, 'replace');
                    onClose();
                  }}
                  className="min-h-[44px] px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 transition-colors"
                >
                  Ganti Isi
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
