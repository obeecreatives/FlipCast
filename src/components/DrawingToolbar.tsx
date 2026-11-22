import React, { useState } from 'react';
import {
  ArrowUpRight,
  Eraser,
  Grid3X3,
  Highlighter,
  LayoutTemplate,
  Minus,
  PenTool,
  Redo2,
  Rows3,
  Square,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import {
  COLOR_PALETTE,
  FontSizeKey,
  PAPER_BACKGROUNDS,
  PaperBackground,
  STROKE_WIDTHS,
  StrokeSizeKey,
  TEXT_SIZES,
  ToolType,
} from '../types/whiteboard';

interface DrawingToolbarProps {
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  color: string;
  onSelectColor: (hex: string) => void;
  strokeSize: StrokeSizeKey;
  onSelectStrokeSize: (size: StrokeSizeKey) => void;
  fontSize: FontSizeKey;
  onSelectFontSize: (size: FontSizeKey) => void;
  background: PaperBackground;
  onSelectBackground: (bg: PaperBackground) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClearPage: () => void;
  onOpenTemplates: () => void;
  compact?: boolean;
}

const TOOLS: { id: ToolType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'pen', label: 'Spidol', icon: PenTool },
  { id: 'highlighter', label: 'Stabilo', icon: Highlighter },
  { id: 'text', label: 'Teks', icon: Type },
  { id: 'line', label: 'Garis', icon: Minus },
  { id: 'arrow', label: 'Panah', icon: ArrowUpRight },
  { id: 'rect', label: 'Kotak', icon: Square },
  { id: 'eraser', label: 'Hapus', icon: Eraser },
];

export const DrawingToolbar: React.FC<DrawingToolbarProps> = React.memo(({
  activeTool,
  onSelectTool,
  color,
  onSelectColor,
  strokeSize,
  onSelectStrokeSize,
  fontSize,
  onSelectFontSize,
  background,
  onSelectBackground,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClearPage,
  onOpenTemplates,
  compact = false,
}) => {
  const [confirmClear, setConfirmClear] = useState(false);

  const handlePaperSwitch = (bg: PaperBackground) => {
    onSelectBackground(bg);
    // Smart high-contrast ink assist when switching to/from dark chalkboard
    if (bg === 'chalkboard' && (color === '#111827' || color === '#0F294A')) {
      onSelectColor('#F8FAFC');
    } else if (bg !== 'chalkboard' && color === '#F8FAFC') {
      onSelectColor('#0F294A');
    }
  };

  return (
    <div className="w-full bg-white border border-slate-200/90 rounded-2xl shadow-sm px-2.5 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar">
      {/* Drawing Tools */}
      <div className="flex items-center gap-1 shrink-0" role="toolbar" aria-label="Alat Tulis">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => onSelectTool(tool.id)}
              title={tool.label}
              className={`min-h-[44px] ${
                compact ? 'min-w-[44px] px-2.5' : 'px-3'
              } rounded-xl inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-all whitespace-nowrap shrink-0 active:scale-[0.97] ${
                isActive
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!compact && <span className="hidden xl:inline">{tool.label}</span>}
            </button>
          );
        })}
      </div>

      <div className="w-px h-7 bg-slate-200 shrink-0" aria-hidden="true" />

      {/* High-Contrast Color Palette */}
      <div className="flex items-center gap-1.5 shrink-0" aria-label="Warna Tinta">
        {COLOR_PALETTE.map((swatch) => {
          const isSelected = color === swatch.hex;
          const isLight = swatch.hex === '#F8FAFC';
          return (
            <button
              key={swatch.id}
              type="button"
              onClick={() => {
                onSelectColor(swatch.hex);
                if (activeTool === 'eraser') onSelectTool('pen');
              }}
              title={swatch.label}
              aria-label={`Warna ${swatch.label}`}
              className={`min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center transition-transform active:scale-95 ${
                isSelected ? 'ring-2 ring-offset-1 ring-teal-600 scale-105' : 'hover:scale-105'
              }`}
            >
              <span
                className={`w-6 h-6 rounded-full block ${
                  isLight ? 'border border-slate-300 shadow-inner' : ''
                }`}
                style={{ backgroundColor: swatch.hex }}
              />
            </button>
          );
        })}
      </div>

      <div className="w-px h-7 bg-slate-200 shrink-0" aria-hidden="true" />

      {/* Contextual Thickness OR Text Size */}
      {activeTool === 'text' ? (
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
          {(Object.keys(TEXT_SIZES) as FontSizeKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onSelectFontSize(key)}
              className={`min-h-[40px] px-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                fontSize === key
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {TEXT_SIZES[key].label}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
          {(Object.keys(STROKE_WIDTHS) as StrokeSizeKey[]).map((key) => {
            const dotPx = key === 'thin' ? 6 : key === 'medium' ? 10 : 14;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectStrokeSize(key)}
                title={`Ketebalan ${STROKE_WIDTHS[key].label}`}
                className={`min-h-[40px] min-w-[40px] px-2.5 rounded-lg inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  strokeSize === key
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span
                  className="rounded-full bg-current inline-block shrink-0"
                  style={{ width: dotPx, height: dotPx }}
                />
                <span className="hidden sm:inline">{STROKE_WIDTHS[key].label}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="w-px h-7 bg-slate-200 shrink-0" aria-hidden="true" />

      {/* Paper Background Selector */}
      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0" aria-label="Latar Kertas">
        {PAPER_BACKGROUNDS.map((bg) => {
          const isActive = background === bg.id;
          return (
            <button
              key={bg.id}
              type="button"
              onClick={() => handlePaperSwitch(bg.id)}
              title={`${bg.label} — ${bg.description}`}
              className={`min-h-[40px] min-w-[40px] px-2.5 rounded-lg inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {bg.id === 'white' && (
                <span className="w-3.5 h-3.5 rounded-xs bg-white border border-slate-300 inline-block" />
              )}
              {bg.id === 'grid' && <Grid3X3 className="w-3.5 h-3.5 text-slate-600" />}
              {bg.id === 'lined' && <Rows3 className="w-3.5 h-3.5 text-sky-600" />}
              {bg.id === 'chalkboard' && (
                <span className="w-3.5 h-3.5 rounded-xs bg-[#14332B] border border-emerald-900 inline-block" />
              )}
              <span className="hidden lg:inline">{bg.label}</span>
            </button>
          );
        })}
      </div>

      <div className="w-px h-7 bg-slate-200 shrink-0" aria-hidden="true" />

      {/* Templates + Undo/Redo + Clear */}
      <div className="flex items-center gap-1 shrink-0 ml-auto">
        <button
          type="button"
          onClick={onOpenTemplates}
          title="Template Cepat & Kerangka Catatan"
          className="min-h-[44px] min-w-[44px] px-2.5 rounded-xl inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50 transition-colors whitespace-nowrap"
        >
          <LayoutTemplate className="w-4 h-4 shrink-0" />
          <span className="hidden md:inline">Template</span>
        </button>

        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title="Urungkan (Ctrl+Z)"
          aria-label="Urungkan"
          className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-30 transition-colors"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          title="Ulangi (Ctrl+Y)"
          aria-label="Ulangi"
          className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-30 transition-colors"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        {confirmClear ? (
          <div className="flex items-center gap-1 bg-red-50 border border-red-200 rounded-xl px-2 py-1">
            <span className="text-[11px] font-semibold text-red-700 whitespace-nowrap">
              Bersihkan?
            </span>
            <button
              type="button"
              onClick={() => {
                onClearPage();
                setConfirmClear(false);
              }}
              className="px-2 py-1 rounded-lg bg-red-600 text-white text-[11px] font-semibold hover:bg-red-700"
            >
              Ya
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="px-2 py-1 rounded-lg bg-white text-slate-700 text-[11px] font-medium hover:bg-slate-100"
            >
              Batal
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            title="Bersihkan Halaman Aktif"
            aria-label="Bersihkan Halaman"
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
});
