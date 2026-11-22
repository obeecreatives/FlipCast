import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Move, Trash2, X } from 'lucide-react';
import {
  findHitElementId,
  renderBoardCanvas,
} from '../lib/canvasRenderer';
import {
  CanvasElement,
  createId,
  FontSizeKey,
  PaperBackground,
  ShapeElement,
  STROKE_WIDTHS,
  StrokeElement,
  StrokeSizeKey,
  TEXT_SIZES,
  TextElement,
  ToolType,
  VIRTUAL_HEIGHT,
  VIRTUAL_WIDTH,
} from '../types/whiteboard';

interface WhiteboardCanvasProps {
  background: PaperBackground;
  elements: CanvasElement[];
  remoteLiveElement: CanvasElement | null;
  activeTool: ToolType;
  color: string;
  strokeSize: StrokeSizeKey;
  fontSize: FontSizeKey;
  readOnly: boolean;
  onAddElement: (el: CanvasElement) => void;
  onUpdateElement: (el: CanvasElement) => void;
  onRemoveElement: (id: string) => void;
  onEmitLiveStroke: (el: CanvasElement | null, force?: boolean) => void;
}

interface FloatingTextEditorState {
  id: string | null; // null = new text, string = editing existing text element
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
}

export const WhiteboardCanvas: React.FC<WhiteboardCanvasProps> = ({
  background,
  elements,
  remoteLiveElement,
  activeTool,
  color,
  strokeSize,
  fontSize,
  readOnly,
  onAddElement,
  onUpdateElement,
  onRemoveElement,
  onEmitLiveStroke,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [displaySize, setDisplaySize] = useState({ width: 960, height: 540 });
  const [liveElement, setLiveElement] = useState<CanvasElement | null>(null);
  const [hoveredEraseId, setHoveredEraseId] = useState<string | null>(null);
  const [textEditor, setTextEditor] = useState<FloatingTextEditorState | null>(null);

  // Refs for low-latency pointer tracking without re-creating handlers
  const isDrawingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const draftElementRef = useRef<CanvasElement | null>(null);
  const draggingTextRef = useRef<{
    id: string;
    offsetX: number;
    offsetY: number;
    original: TextElement;
    moved: boolean;
  } | null>(null);
  const erasedInDragRef = useRef<Set<string>>(new Set());

  // Keep canvas pixel resolution sharp and strictly 16:9 across resizes & device auto-rotations
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let settleTimer: number | null = null;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setDisplaySize((prev) =>
          Math.abs(prev.width - rect.width) < 0.5 && Math.abs(prev.height - rect.height) < 0.5
            ? prev
            : { width: rect.width, height: rect.height }
        );
      }
    };

    const handleOrientationShift = () => {
      updateSize();
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      // Mobile browsers (especially iOS Safari) finalize viewport rect ~120ms after rotation
      settleTimer = window.setTimeout(updateSize, 150);
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(container);
    window.addEventListener('resize', updateSize, { passive: true });
    window.addEventListener('orientationchange', handleOrientationShift, { passive: true });
    const screenOrientation = window.screen?.orientation;
    screenOrientation?.addEventListener?.('change', handleOrientationShift);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
      window.removeEventListener('orientationchange', handleOrientationShift);
      screenOrientation?.removeEventListener?.('change', handleOrientationShift);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
    };
  }, []);

  // Re-render canvas whenever visual state changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.max(320, Math.round(displaySize.width * dpr));
    const targetH = Math.max(180, Math.round(displaySize.height * dpr));

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.save();
    ctx.setTransform(targetW / VIRTUAL_WIDTH, 0, 0, targetH / VIRTUAL_HEIGHT, 0, 0);
    renderBoardCanvas(ctx, background, elements, {
      liveElement,
      remoteLiveElement,
      hoveredEraseId: activeTool === 'eraser' ? hoveredEraseId : null,
      editingTextId: textEditor?.id ?? null,
      showTextFrames: !readOnly && activeTool === 'text',
    });
    ctx.restore();
  }, [
    background,
    elements,
    liveElement,
    remoteLiveElement,
    hoveredEraseId,
    textEditor?.id,
    activeTool,
    readOnly,
    displaySize,
  ]);

  // Focus textarea when opening text editor
  useEffect(() => {
    if (textEditor && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [textEditor?.id, textEditor?.x, textEditor?.y]);

  const toVirtualCoords = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * VIRTUAL_WIDTH;
    const y = ((clientY - rect.top) / rect.height) * VIRTUAL_HEIGHT;
    return {
      x: Math.max(0, Math.min(VIRTUAL_WIDTH, x)),
      y: Math.max(0, Math.min(VIRTUAL_HEIGHT, y)),
    };
  }, []);

  const commitTextEditor = useCallback(() => {
    if (!textEditor) return;
    const trimmed = textEditor.text.trim();
    if (trimmed) {
      const payload: TextElement = {
        id: textEditor.id || createId('txt'),
        type: 'text',
        x: Math.round(textEditor.x),
        y: Math.round(textEditor.y),
        text: trimmed.slice(0, 1000),
        fontSize: textEditor.fontSize,
        color: textEditor.color,
        size: 4,
        opacity: 1,
      };
      if (textEditor.id) {
        onUpdateElement(payload);
      } else {
        onAddElement(payload);
      }
    } else if (textEditor.id) {
      onRemoveElement(textEditor.id);
    }
    setTextEditor(null);
  }, [onAddElement, onRemoveElement, onUpdateElement, textEditor]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    // Commit any active floating text editor before starting a new interaction
    if (textEditor) {
      commitTextEditor();
    }

    const pt = toVirtualCoords(e.clientX, e.clientY);
    const ctx = canvasRef.current?.getContext('2d') || null;

    if (activeTool === 'text') {
      const hitTextId = findHitElementId(elements, pt.x, pt.y, ctx, 14, 'text');
      if (hitTextId) {
        const found = elements.find(
          (el): el is TextElement => el.id === hitTextId && el.type === 'text'
        );
        if (found) {
          e.currentTarget.setPointerCapture(e.pointerId);
          activePointerIdRef.current = e.pointerId;
          draggingTextRef.current = {
            id: found.id,
            offsetX: pt.x - found.x,
            offsetY: pt.y - found.y,
            original: found,
            moved: false,
          };
          return;
        }
      }

      // Open new floating text editor at clicked virtual position
      setTextEditor({
        id: null,
        x: Math.min(pt.x, VIRTUAL_WIDTH - 240),
        y: Math.min(pt.y, VIRTUAL_HEIGHT - 80),
        text: '',
        color,
        fontSize: TEXT_SIZES[fontSize].px,
      });
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    activePointerIdRef.current = e.pointerId;
    isDrawingRef.current = true;

    if (activeTool === 'eraser') {
      erasedInDragRef.current.clear();
      const hitId = findHitElementId(elements, pt.x, pt.y, ctx, 20);
      if (hitId) {
        erasedInDragRef.current.add(hitId);
        onRemoveElement(hitId);
      }
      return;
    }

    if (activeTool === 'pen' || activeTool === 'highlighter') {
      const widthCfg = STROKE_WIDTHS[strokeSize];
      const stroke: StrokeElement = {
        id: createId(activeTool === 'pen' ? 'pen' : 'hl'),
        type: activeTool,
        color,
        size: activeTool === 'pen' ? widthCfg.pen : widthCfg.highlighter,
        opacity: activeTool === 'highlighter' ? 0.36 : 1,
        points: [Math.round(pt.x), Math.round(pt.y)],
      };
      draftElementRef.current = stroke;
      setLiveElement(stroke);
      onEmitLiveStroke(stroke, true);
      return;
    }

    // Vector Shapes: line, arrow, rect
    const shape: ShapeElement = {
      id: createId('shp'),
      type: activeTool,
      color,
      size: STROKE_WIDTHS[strokeSize].pen + 1,
      opacity: 1,
      x1: Math.round(pt.x),
      y1: Math.round(pt.y),
      x2: Math.round(pt.x),
      y2: Math.round(pt.y),
    };
    draftElementRef.current = shape;
    setLiveElement(shape);
    onEmitLiveStroke(shape, true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly) return;

    const pt = toVirtualCoords(e.clientX, e.clientY);
    const ctx = canvasRef.current?.getContext('2d') || null;

    // Hover feedback for Eraser when not pressing
    if (!isDrawingRef.current && !draggingTextRef.current) {
      if (activeTool === 'eraser') {
        const hitId = findHitElementId(elements, pt.x, pt.y, ctx, 18);
        setHoveredEraseId(hitId);
      } else if (hoveredEraseId) {
        setHoveredEraseId(null);
      }
      return;
    }

    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) {
      return;
    }

    // Dragging an existing text block
    if (draggingTextRef.current) {
      const drag = draggingTextRef.current;
      const nx = Math.max(12, Math.min(VIRTUAL_WIDTH - 120, Math.round(pt.x - drag.offsetX)));
      const ny = Math.max(12, Math.min(VIRTUAL_HEIGHT - 40, Math.round(pt.y - drag.offsetY)));
      if (Math.hypot(nx - drag.original.x, ny - drag.original.y) > 5) {
        drag.moved = true;
      }
      if (drag.moved) {
        const movedText: TextElement = { ...drag.original, x: nx, y: ny };
        draftElementRef.current = movedText;
        setLiveElement(movedText);
        onEmitLiveStroke(movedText);
      }
      return;
    }

    if (activeTool === 'eraser') {
      const hitId = findHitElementId(elements, pt.x, pt.y, ctx, 20);
      setHoveredEraseId(hitId);
      if (hitId && !erasedInDragRef.current.has(hitId)) {
        erasedInDragRef.current.add(hitId);
        onRemoveElement(hitId);
      }
      return;
    }

    const draft = draftElementRef.current;
    if (!draft) return;

    if (draft.type === 'pen' || draft.type === 'highlighter') {
      const nativeEvt = e.nativeEvent as PointerEvent;
      const coalesced =
        typeof nativeEvt.getCoalescedEvents === 'function'
          ? nativeEvt.getCoalescedEvents()
          : [nativeEvt];
      const nextPts = [...draft.points];

      for (const ce of coalesced) {
        const cPt = toVirtualCoords(ce.clientX, ce.clientY);
        const rx = Math.round(cPt.x);
        const ry = Math.round(cPt.y);
        const lastX = nextPts[nextPts.length - 2];
        const lastY = nextPts[nextPts.length - 1];
        // Filter micro-jitter < 2.5 virtual px for silky Bezier curves and compact Firestore payloads
        if (Math.hypot(rx - lastX, ry - lastY) >= 2.5) {
          nextPts.push(rx, ry);
        }
      }

      const updated: StrokeElement = { ...draft, points: nextPts };
      draftElementRef.current = updated;
      setLiveElement(updated);
      onEmitLiveStroke(updated);
      return;
    }

    if (draft.type === 'line' || draft.type === 'arrow' || draft.type === 'rect') {
      const updated: ShapeElement = {
        ...draft,
        x2: Math.round(pt.x),
        y2: Math.round(pt.y),
      };
      draftElementRef.current = updated;
      setLiveElement(updated);
      onEmitLiveStroke(updated);
    }
  };

  const finishInteraction = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) {
      return;
    }

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }

    // Finish text drag or open existing text for editing on tap
    if (draggingTextRef.current) {
      const drag = draggingTextRef.current;
      draggingTextRef.current = null;
      activePointerIdRef.current = null;
      if (drag.moved && draftElementRef.current && draftElementRef.current.type === 'text') {
        const moved = draftElementRef.current;
        draftElementRef.current = null;
        setLiveElement(null);
        onEmitLiveStroke(null, true);
        onUpdateElement(moved);
      } else {
        // User tapped existing text without dragging -> open inline editor to re-edit!
        setTextEditor({
          id: drag.original.id,
          x: drag.original.x,
          y: drag.original.y,
          text: drag.original.text,
          color: drag.original.color,
          fontSize: drag.original.fontSize,
        });
      }
      return;
    }

    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    activePointerIdRef.current = null;

    const draft = draftElementRef.current;
    draftElementRef.current = null;
    setLiveElement(null);
    onEmitLiveStroke(null, true);

    if (!draft) return;

    if (draft.type === 'line' || draft.type === 'arrow' || draft.type === 'rect') {
      if (Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) < 6) {
        return; // Ignore accidental micro-clicks on shapes
      }
    }

    onAddElement(draft);
  };

  const cursorClass = readOnly
    ? 'cursor-default'
    : activeTool === 'text'
    ? 'cursor-text'
    : activeTool === 'eraser'
    ? 'cursor-pointer'
    : 'cursor-crosshair';

  const scaleX = displaySize.width / VIRTUAL_WIDTH;
  const scaleY = displaySize.height / VIRTUAL_HEIGHT;

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-[16/9] max-h-full rounded-xl overflow-hidden shadow-md border border-slate-300/80 bg-white select-none"
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishInteraction}
        onPointerCancel={finishInteraction}
        className={`block w-full h-full board-touch-surface ${cursorClass}`}
      />

      {/* Floating Inline Text Editor anchored strictly to virtual 1280x720 coordinates */}
      {textEditor && !readOnly && (
        <div
          style={{
            left: `${(textEditor.x / VIRTUAL_WIDTH) * 100}%`,
            top: `${(textEditor.y / VIRTUAL_HEIGHT) * 100}%`,
          }}
          className="absolute z-20 min-w-[200px] max-w-[80%]"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="rounded-lg border-2 border-teal-500 bg-white shadow-lg p-2">
            <textarea
              ref={textareaRef}
              value={textEditor.text}
              onChange={(e) =>
                setTextEditor((prev) => (prev ? { ...prev, text: e.target.value } : null))
              }
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setTextEditor(null);
                } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  commitTextEditor();
                }
              }}
              placeholder="Ketik catatan di sini..."
              rows={2}
              style={{
                color:
                  background === 'chalkboard' && textEditor.color === '#F8FAFC'
                    ? '#0F172A'
                    : textEditor.color,
                fontSize: `${Math.max(16, Math.round(textEditor.fontSize * Math.min(scaleX, scaleY)))}px`,
                lineHeight: 1.25,
              }}
              className="w-full min-w-[180px] resize bg-transparent font-display font-semibold outline-none placeholder:text-slate-400"
            />
            <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-slate-200 pt-1.5">
              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                <Move className="w-3 h-3" />
                Ketuk teks lagi untuk pindah / ubah
              </span>
              <div className="flex items-center gap-1">
                {textEditor.id && (
                  <button
                    type="button"
                    onClick={() => {
                      onRemoveElement(textEditor.id!);
                      setTextEditor(null);
                    }}
                    className="p-1.5 rounded-md text-red-600 hover:bg-red-50 transition-colors"
                    title="Hapus Teks"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setTextEditor(null)}
                  className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 transition-colors"
                  title="Batal"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={commitTextEditor}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-teal-600 text-white text-xs font-medium hover:bg-teal-700 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  Tempel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
