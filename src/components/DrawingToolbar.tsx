import React, { useState } from 'react';
import {
  ArrowUpRight,
  Circle,
  Eraser,
  Grid3X3,
  Highlighter,
  LayoutTemplate,
  Minus,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  PenTool,
  Rows3,
  Square,
  StickyNote,
  Trash2,
  Type,
} from 'lucide-react';
import {
  COLOR_PALETTE,
  FontSizeKey,
  PAPER_BACKGROUNDS,
  PaperBackground,
  STICKY_COLORS,
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
  stickyColor: string;
  onSelectStickyColor: (bgHex: string) => void;
  strokeSize: StrokeSizeKey;
  onSelectStrokeSize: (size: StrokeSizeKey) => void;
  fontSize: FontSizeKey;
  onSelectFontSize: (size: FontSizeKey) => void;
  background: PaperBackground;
  onSelectBackground: (bg: PaperBackground) => void;
  onClearPage: () => void;
  onOpenTemplates: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  compact?: boolean;
}

const TOOLS: {
  id: ToolType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'select', label: 'Pilih & Geser', icon: MousePointer2 },
  { id: 'pen', label: 'Spidol', icon: PenTool },
  { id: 'highlighter', label: 'Stabilo', icon: Highlighter },
  { id: 'text', label: 'Teks', icon: Type },
  { id: 'sticky', label: 'Catatan Tempel', icon: StickyNote },
  { id: 'line', label: 'Garis', icon: Minus },
  { id: 'arrow', label: 'Panah', icon: ArrowUpRight },
  { id: 'rect', label: 'Kotak', icon: Square },
  { id: 'ellipse', label: 'Lingkaran', icon: Circle },
  { id: 'eraser', label: 'Hapus', icon: Eraser },
];

const SHORT_TEXT_LABELS: Record<FontSizeKey, string> = {
  sm: 'S',
  md: 'M',
  lg: 'L',
  xl: 'XL',
};

export const DrawingToolbar: React.FC<DrawingToolbarProps> = React.memo(({
  activeTool,
  onSelectTool,
  color,
  onSelectColor,
  stickyColor,
  onSelectStickyColor,
  strokeSize,
  onSelectStrokeSize,
  fontSize,
  onSelectFontSize,
  background,
  onSelectBackground,
  onClearPage,
  onOpenTemplates,
  collapsed,
  onToggleCollapse,
}) => {
  const [confirmClear, setConfirmClear] = useState(false);

  const handlePaperSwitch = (bg: PaperBackground) => {
    onSelectBackground(bg);
    if (bg === 'chalkboard' && (color === '#111827' || color === '#0F294A')) {
      onSelectColor('#F8FAFC');
    } else if (bg !== 'chalkboard' && color === '#F8FAFC') {
      onSelectColor('#0F294A');
    }
  };

  const activeToolMeta = TOOLS.find((t) => t.id === activeTool) || TOOLS[1];
  const ActiveToolIcon = activeToolMeta.icon;
  const activeSwatchColor = activeTool === 'sticky' ? stickyColor : color;

  // COLLAPSED STATE: Floating sleek left-edge tab so canvas gets 100% width
  if (collapsed) {
    return (
      <div className="fixed left-[max(0.5rem,env(safe-area-inset-left))] top-1/2 -translate-y-1/2 z-30">
        <button
          type="button"
          onClick={onToggleCollapse}
          title="Buka Mini Sidebar Alat Tulis"
          aria-label="Buka Sidebar Alat Tulis"
          className="min-w-[44px] py-3 px-2 rounded-2xl bg-white/95 hover:bg-slate-50 border border-slate-200/90 shadow-lg flex flex-col items-center gap-2 text-slate-700 transition-all active:scale-95"
        >
          <PanelLeftOpen className="w-4 h-4 text-teal-600" />
          <span className="w-6 h-px bg-slate-200" aria-hidden="true" />
          <ActiveToolIcon className="w-4 h-4 text-slate-900" />
          <span
            className="w-4 h-4 rounded-full border border-slate-300 block"
            style={{ backgroundColor: activeSwatchColor }}
          />
        </button>
      </div>
    );
  }

  // EXPANDED STATE: Compact 2-column vertical Mini-Sidebar on the left
  return (
    <aside
      aria-label="Mini Sidebar Alat Tulis"
      className="shrink-0 w-[100px] sm:w-[110px] h-full max-h-full bg-white border border-slate-200/90 rounded-2xl shadow-sm flex flex-col overflow-hidden z-20"
    >
      {/* Mini-Sidebar Header with Collapse Button */}
      <div className="shrink-0 flex items-center justify-between px-2.5 py-1.5 border-b border-slate-100">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Alat
        </span>
        <button
          type="button"
          onClick={onToggleCollapse}
          title="Ciutkan Sidebar Alat"
          aria-label="Ciutkan Sidebar"
          className="min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable Vertical Rail (Fits without scrolling on Desktop/Tablet, scrolls cleanly on short Phone Landscape) */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-1.5 space-y-2">
        {/* 10 Drawing Tools in Crisp 2-Column Grid */}
        <div
          className="grid grid-cols-2 gap-1"
          role="toolbar"
          aria-label="Alat Tulis"
        >
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            const isActive = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => onSelectTool(tool.id)}
                title={tool.label}
                aria-label={tool.label}
                className={`min-h-[42px] w-full rounded-xl flex items-center justify-center transition-all active:scale-95 ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
              </button>
            );
          })}
        </div>

        <div className="h-px bg-slate-200/80 mx-1" aria-hidden="true" />

        {/* Contextual Color Grid: Sticky Note Pastel Colors OR Ink Colors */}
        {activeTool === 'sticky' ? (
          <div className="space-y-1">
            <span className="block text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Catatan
            </span>
            <div className="grid grid-cols-3 gap-1 place-items-center" aria-label="Warna Catatan Tempel">
              {STICKY_COLORS.map((swatch) => {
                const isSelected = stickyColor.toLowerCase() === swatch.bg.toLowerCase();
                return (
                  <button
                    key={swatch.id}
                    type="button"
                    onClick={() => onSelectStickyColor(swatch.bg)}
                    title={`Catatan ${swatch.label}`}
                    aria-label={`Warna catatan ${swatch.label}`}
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform active:scale-95 ${
                      isSelected ? 'ring-2 ring-offset-1 ring-teal-600 scale-105' : 'hover:scale-105'
                    }`}
                  >
                    <span
                      className="w-5 h-5 rounded-md block border shadow-xs"
                      style={{ backgroundColor: swatch.bg, borderColor: swatch.border }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <span className="block text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Warna
            </span>
            <div className="grid grid-cols-3 gap-1 place-items-center" aria-label="Warna Tinta">
              {COLOR_PALETTE.map((swatch) => {
                const isSelected = color === swatch.hex;
                const isLight = swatch.hex === '#F8FAFC';
                return (
                  <button
                    key={swatch.id}
                    type="button"
                    onClick={() => {
                      onSelectColor(swatch.hex);
                      if (activeTool === 'eraser' || activeTool === 'select') onSelectTool('pen');
                    }}
                    title={swatch.label}
                    aria-label={`Warna ${swatch.label}`}
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform active:scale-95 ${
                      isSelected ? 'ring-2 ring-offset-1 ring-teal-600 scale-105' : 'hover:scale-105'
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full block ${
                        isLight ? 'border border-slate-300 shadow-inner' : ''
                      }`}
                      style={{ backgroundColor: swatch.hex }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="h-px bg-slate-200/80 mx-1" aria-hidden="true" />

        {/* Contextual Size / Mode Indicator */}
        {activeTool === 'select' ? (
          <div className="px-1.5 py-1.5 rounded-xl bg-teal-50 text-teal-800 text-[10px] font-semibold text-center leading-tight">
            Ketuk & geser objek
          </div>
        ) : activeTool === 'sticky' ? (
          <div className="px-1.5 py-1.5 rounded-xl bg-amber-50 text-amber-900 text-[10px] font-semibold text-center leading-tight">
            Ketuk papan untuk tempel
          </div>
        ) : activeTool === 'text' ? (
          <div className="space-y-1">
            <span className="block text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Huruf
            </span>
            <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl">
              {(Object.keys(TEXT_SIZES) as FontSizeKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelectFontSize(key)}
                  title={`Ukuran ${TEXT_SIZES[key].label}`}
                  className={`min-h-[34px] rounded-lg text-[11px] font-bold transition-colors ${
                    fontSize === key
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {SHORT_TEXT_LABELS[key]}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <span className="block text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Tebal
            </span>
            <div className="grid grid-cols-3 gap-0.5 bg-slate-100 p-1 rounded-xl">
              {(Object.keys(STROKE_WIDTHS) as StrokeSizeKey[]).map((key) => {
                const dotPx = key === 'thin' ? 5 : key === 'medium' ? 8 : 12;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onSelectStrokeSize(key)}
                    title={`Ketebalan ${STROKE_WIDTHS[key].label}`}
                    aria-label={`Ketebalan ${STROKE_WIDTHS[key].label}`}
                    className={`min-h-[34px] rounded-lg flex items-center justify-center transition-colors ${
                      strokeSize === key
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span
                      className="rounded-full bg-current inline-block shrink-0"
                      style={{ width: dotPx, height: dotPx }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="h-px bg-slate-200/80 mx-1" aria-hidden="true" />

        {/* Paper Background 2x2 Selector */}
        <div className="space-y-1">
          <span className="block text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Kertas
          </span>
          <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-xl" aria-label="Latar Kertas">
            {PAPER_BACKGROUNDS.map((bg) => {
              const isActive = background === bg.id;
              return (
                <button
                  key={bg.id}
                  type="button"
                  onClick={() => handlePaperSwitch(bg.id)}
                  title={`${bg.label} — ${bg.description}`}
                  aria-label={bg.label}
                  className={`min-h-[34px] rounded-lg flex items-center justify-center transition-colors ${
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
                </button>
              );
            })}
          </div>
        </div>

        <div className="h-px bg-slate-200/80 mx-1" aria-hidden="true" />

        {/* Templates & Clear Page */}
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={onOpenTemplates}
            title="Template Cepat & Kerangka Catatan"
            aria-label="Template Cepat"
            className="min-h-[40px] rounded-xl flex items-center justify-center text-teal-700 hover:bg-teal-50 transition-colors"
          >
            <LayoutTemplate className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmClear((v) => !v)}
            title="Bersihkan Halaman Aktif"
            aria-label="Bersihkan Halaman"
            className={`min-h-[40px] rounded-xl flex items-center justify-center transition-colors ${
              confirmClear
                ? 'bg-red-100 text-red-700'
                : 'text-slate-600 hover:text-red-600 hover:bg-red-50'
            }`}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {confirmClear && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-1.5 space-y-1.5 text-center">
            <span className="block text-[10px] font-bold text-red-700">
              Bersihkan?
            </span>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => {
                  onClearPage();
                  setConfirmClear(false);
                }}
                className="py-1 rounded-lg bg-red-600 text-white text-[10px] font-bold hover:bg-red-700"
              >
                Ya
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="py-1 rounded-lg bg-white text-slate-700 text-[10px] font-medium hover:bg-slate-100"
              >
                Batal
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
});
