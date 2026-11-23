export const VIRTUAL_WIDTH = 1280;
export const VIRTUAL_HEIGHT = 720;

export const MAX_PAGES = 50;
export const MAX_ELEMENTS_PER_PAGE = 400;
export const MAX_TEMPLATE_BLOCKS = 20;

export type ViewMode = 'projector' | 'extend' | 'tablet';

export type ToolType =
  | 'select'
  | 'pen'
  | 'highlighter'
  | 'text'
  | 'sticky'
  | 'line'
  | 'arrow'
  | 'rect'
  | 'ellipse'
  | 'eraser';

export type PaperBackground = 'white' | 'grid' | 'lined' | 'chalkboard';

export type StrokeSizeKey = 'thin' | 'medium' | 'thick';
export type FontSizeKey = 'sm' | 'md' | 'lg' | 'xl';

export interface PaletteColor {
  id: string;
  label: string;
  hex: string;
  ring: string;
}

export const COLOR_PALETTE: PaletteColor[] = [
  { id: 'navy', label: 'Navy', hex: '#0F294A', ring: '#1E3A8A' },
  { id: 'black', label: 'Hitam', hex: '#111827', ring: '#374151' },
  { id: 'red', label: 'Merah', hex: '#DC2626', ring: '#EF4444' },
  { id: 'orange', label: 'Oranye', hex: '#EA580C', ring: '#F97316' },
  { id: 'teal', label: 'Hijau Teal', hex: '#0D9488', ring: '#14B8A6' },
  { id: 'chalk', label: 'Putih Kapur', hex: '#F8FAFC', ring: '#94A3B8' },
];

export interface StickyColorOption {
  id: string;
  label: string;
  bg: string;
  border: string;
  text: string;
}

export const STICKY_COLORS: StickyColorOption[] = [
  { id: 'yellow', label: 'Kuning', bg: '#FEF08A', border: '#CA8A04', text: '#1E293B' },
  { id: 'mint', label: 'Hijau Mint', bg: '#BBF7D0', border: '#059669', text: '#0F172A' },
  { id: 'sky', label: 'Biru Langit', bg: '#BAE6FD', border: '#0284C7', text: '#0F172A' },
  { id: 'peach', label: 'Persik', bg: '#FED7AA', border: '#EA580C', text: '#0F172A' },
  { id: 'rose', label: 'Merah Muda', bg: '#FECDD3', border: '#E11D48', text: '#0F172A' },
];

export const STROKE_WIDTHS: Record<StrokeSizeKey, { label: string; pen: number; highlighter: number }> = {
  thin: { label: 'Tipis', pen: 3, highlighter: 18 },
  medium: { label: 'Sedang', pen: 6, highlighter: 28 },
  thick: { label: 'Tebal', pen: 12, highlighter: 42 },
};

export const TEXT_SIZES: Record<FontSizeKey, { label: string; px: number }> = {
  sm: { label: 'Kecil', px: 22 },
  md: { label: 'Sedang', px: 32 },
  lg: { label: 'Besar', px: 44 },
  xl: { label: 'Judul', px: 60 },
};

export const PAPER_BACKGROUNDS: { id: PaperBackground; label: string; description: string }[] = [
  { id: 'white', label: 'Putih Polos', description: 'Papan tulis putih bersih' },
  { id: 'grid', label: 'Kotak-Kotak', description: 'Kisi grafik & hitungan' },
  { id: 'lined', label: 'Bergaris', description: 'Catatan terstruktur rapi' },
  { id: 'chalkboard', label: 'Papan Hijau', description: 'Nyaman untuk ruang gelap' },
];

export interface BaseElement {
  id: string;
  color: string;
  size: number;
  opacity: number;
}

export interface StrokeElement extends BaseElement {
  type: 'pen' | 'highlighter';
  /** Flat quantized virtual coordinates: [x0, y0, x1, y1, ...] in 1280x720 space */
  points: number[];
}

export interface ShapeElement extends BaseElement {
  type: 'line' | 'arrow' | 'rect' | 'ellipse';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TextElement extends BaseElement {
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

export interface StickyNoteElement extends BaseElement {
  type: 'sticky';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  bgColor: string;
  fontSize: number;
}

export type CanvasElement = StrokeElement | ShapeElement | TextElement | StickyNoteElement;

export interface FlipchartPage {
  pageId: string;
  name: string;
  background: PaperBackground;
  order: number;
  elements: CanvasElement[];
  updatedAtMs: number;
}

export interface TemplateBlock {
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
}

export interface QuickTemplate {
  templateId: string;
  title: string;
  category: string;
  background: PaperBackground;
  blocks: TemplateBlock[];
  shapes?: ShapeElement[];
  isBuiltIn?: boolean;
}

export const BUILTIN_TEMPLATES: QuickTemplate[] = [
  {
    templateId: 'tpl-agenda',
    title: 'Agenda & Poin Kunci',
    category: 'Presentasi',
    background: 'lined',
    isBuiltIn: true,
    blocks: [
      { x: 96, y: 72, text: 'AGENDA SESI HARI INI', fontSize: 44, color: '#0F294A' },
      { x: 96, y: 180, text: '1. Pembukaan & Tujuan Utama', fontSize: 32, color: '#111827' },
      { x: 96, y: 264, text: '2. Pembahasan Materi Inti', fontSize: 32, color: '#111827' },
      { x: 96, y: 348, text: '3. Studi Kasus & Tanya Jawab', fontSize: 32, color: '#111827' },
      { x: 96, y: 432, text: '4. Kesimpulan & Tindak Lanjut', fontSize: 32, color: '#0D9488' },
    ],
    shapes: [
      { id: 'tpl-ag-line', type: 'line', x1: 96, y1: 138, x2: 720, y2: 138, color: '#0D9488', size: 4, opacity: 1 },
    ],
  },
  {
    templateId: 'tpl-swot',
    title: 'Matriks 2×2 / Analisis SWOT',
    category: 'Strategi',
    background: 'white',
    isBuiltIn: true,
    blocks: [
      { x: 72, y: 44, text: 'KEKUATAN (Strengths)', fontSize: 28, color: '#0D9488' },
      { x: 676, y: 44, text: 'KELEMAHAN (Weaknesses)', fontSize: 28, color: '#EA580C' },
      { x: 72, y: 386, text: 'PELUANG (Opportunities)', fontSize: 28, color: '#0F294A' },
      { x: 676, y: 386, text: 'TANTANGAN (Threats)', fontSize: 28, color: '#DC2626' },
    ],
    shapes: [
      { id: 'tpl-swot-v', type: 'line', x1: 640, y1: 36, x2: 640, y2: 684, color: '#0F294A', size: 3, opacity: 0.7 },
      { id: 'tpl-swot-h', type: 'line', x1: 48, y1: 360, x2: 1232, y2: 360, color: '#0F294A', size: 3, opacity: 0.7 },
    ],
  },
  {
    templateId: 'tpl-flow',
    title: 'Alur Proses 3 Tahap',
    category: 'Alur Kerja',
    background: 'white',
    isBuiltIn: true,
    blocks: [
      { x: 84, y: 64, text: 'ALUR TAHAPAN KERJA', fontSize: 44, color: '#0F294A' },
      { x: 112, y: 248, text: 'TAHAP 1\nPersiapan', fontSize: 32, color: '#0F294A' },
      { x: 522, y: 248, text: 'TAHAP 2\nEksekusi', fontSize: 32, color: '#0D9488' },
      { x: 932, y: 248, text: 'TAHAP 3\nEvaluasi', fontSize: 32, color: '#EA580C' },
    ],
    shapes: [
      { id: 'tpl-fl-r1', type: 'rect', x1: 80, y1: 210, x2: 370, y2: 430, color: '#0F294A', size: 4, opacity: 1 },
      { id: 'tpl-fl-a1', type: 'arrow', x1: 386, y1: 320, x2: 478, y2: 320, color: '#0F294A', size: 4, opacity: 1 },
      { id: 'tpl-fl-r2', type: 'rect', x1: 494, y1: 210, x2: 784, y2: 430, color: '#0D9488', size: 4, opacity: 1 },
      { id: 'tpl-fl-a2', type: 'arrow', x1: 800, y1: 320, x2: 892, y2: 320, color: '#0D9488', size: 4, opacity: 1 },
      { id: 'tpl-fl-r3', type: 'rect', x1: 908, y1: 210, x2: 1198, y2: 430, color: '#EA580C', size: 4, opacity: 1 },
    ],
  },
  {
    templateId: 'tpl-graph',
    title: 'Grafik Koordinat X–Y',
    category: 'Matematika',
    background: 'grid',
    isBuiltIn: true,
    blocks: [
      { x: 84, y: 52, text: 'Grafik Fungsi / Data', fontSize: 36, color: '#0F294A' },
      { x: 660, y: 74, text: 'Y (+)', fontSize: 24, color: '#0F294A' },
      { x: 1148, y: 372, text: 'X (+)', fontSize: 24, color: '#0F294A' },
      { x: 654, y: 374, text: '0', fontSize: 22, color: '#111827' },
    ],
    shapes: [
      { id: 'tpl-gr-y', type: 'arrow', x1: 640, y1: 660, x2: 640, y2: 72, color: '#0F294A', size: 4, opacity: 1 },
      { id: 'tpl-gr-x', type: 'arrow', x1: 96, y1: 360, x2: 1184, y2: 360, color: '#0F294A', size: 4, opacity: 1 },
    ],
  },
  {
    templateId: 'tpl-chalk-summary',
    title: 'Ringkasan Papan Kapur',
    category: 'Ruang Gelap',
    background: 'chalkboard',
    isBuiltIn: true,
    blocks: [
      { x: 88, y: 68, text: 'RANGKUMAN MATERI', fontSize: 48, color: '#F8FAFC' },
      { x: 88, y: 196, text: '• Konsep Utama:', fontSize: 32, color: '#EA580C' },
      { x: 88, y: 344, text: '• Contoh Penerapan:', fontSize: 32, color: '#F8FAFC' },
      { x: 88, y: 492, text: '• Catatan Penting:', fontSize: 32, color: '#0D9488' },
    ],
    shapes: [
      { id: 'tpl-ch-line', type: 'line', x1: 88, y1: 138, x2: 640, y2: 138, color: '#EA580C', size: 4, opacity: 0.9 },
    ],
  },
];

export function createId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const ts = Date.now().toString(36).slice(-4);
  return `${prefix}-${ts}${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `OBEE-${suffix}`;
}

export function sanitizeId(input: string, maxLength = 32): string {
  const cleaned = input.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  return cleaned.slice(0, maxLength);
}
