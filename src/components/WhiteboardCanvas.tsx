import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  ImagePlus,
  Move,
  Pencil,
  RotateCcw,
  Shapes,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  findHitElementId,
  getElementBounds,
  LaserTrailPoint,
  renderBoardCanvas,
  subscribeImageCacheReady,
  translateElement,
} from '../lib/canvasRenderer';
import { createImageElementFromBlob } from '../lib/imageUtils';
import { detectAndSnapShape, snapLineEndpointAngle } from '../lib/shapeSnap';
import {
  appendFreehandPoint,
  finalizeFreehandPoints,
  roundCoord,
} from '../lib/strokeSmoothing';
import {
  CanvasElement,
  createId,
  FontSizeKey,
  ImageElement,
  LaserElement,
  PaperBackground,
  ShapeElement,
  STICKY_COLORS,
  StickyNoteElement,
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
  stickyColor?: string;
  strokeSize: StrokeSizeKey;
  fontSize: FontSizeKey;
  smoothWriting?: boolean;
  shapeSnap?: boolean;
  readOnly: boolean;
  onAddElement: (el: CanvasElement) => void;
  onUpdateElement: (el: CanvasElement) => void;
  onRemoveElement: (id: string) => void;
  onEmitLiveStroke: (el: CanvasElement | null, force?: boolean) => void;
  onNotice?: (msg: string) => void;
}

interface FloatingTextEditorState {
  id: string | null;
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
}

interface FloatingStickyEditorState {
  id: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  bgColor: string;
  fontSize: number;
}

const DEFAULT_STICKY_WIDTH = 240;
const DEFAULT_STICKY_HEIGHT = 172;

export const WhiteboardCanvas: React.FC<WhiteboardCanvasProps> = ({
  background,
  elements,
  remoteLiveElement,
  activeTool,
  color,
  stickyColor = STICKY_COLORS[0].bg,
  strokeSize,
  fontSize,
  smoothWriting = true,
  shapeSnap = true,
  readOnly,
  onAddElement,
  onUpdateElement,
  onRemoveElement,
  onEmitLiveStroke,
  onNotice,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const stickyTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [displaySize, setDisplaySize] = useState({ width: 960, height: 540 });
  const [liveElement, setLiveElement] = useState<CanvasElement | null>(null);
  const [hoveredEraseId, setHoveredEraseId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [textEditor, setTextEditor] = useState<FloatingTextEditorState | null>(null);
  const [stickyEditor, setStickyEditor] = useState<FloatingStickyEditorState | null>(null);
  const [imageRenderTick, setImageRenderTick] = useState(0);
  const [laserFrameTick, setLaserFrameTick] = useState(0);
  const [isDragOverImage, setIsDragOverImage] = useState(false);
  const [snapBanner, setSnapBanner] = useState<{
    elementId: string;
    label: string;
    originalStroke: StrokeElement;
  } | null>(null);

  // Refs for low-latency pointer tracking without re-creating handlers
  const isDrawingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const draftElementRef = useRef<CanvasElement | null>(null);
  const draggingObjectRef = useRef<{
    original: CanvasElement;
    startX: number;
    startY: number;
    moved: boolean;
    wasAlreadySelected: boolean;
    openEditorOnTap: boolean;
  } | null>(null);
  const erasedInDragRef = useRef<Set<string>>(new Set());

  // Smart Shape Snap refs (0 ms latency Hold-to-Snap & Quick-Snap)
  const shapeSnapRef = useRef(shapeSnap);
  shapeSnapRef.current = shapeSnap;
  const smoothWritingRef = useRef(smoothWriting);
  smoothWritingRef.current = smoothWriting;
  const holdSnapTimerRef = useRef<number | null>(null);
  const holdSnappedModeRef = useRef<'none' | 'line' | 'shape'>('none');
  const holdSnappedLabelRef = useRef<string | null>(null);
  const rawPointsBeforeSnapRef = useRef<number[] | null>(null);
  const originalStrokeMetaRef = useRef<{
    type: 'pen' | 'highlighter';
    color: string;
    size: number;
    opacity: number;
  } | null>(null);
  const snapBannerTimerRef = useRef<number | null>(null);

  // Ephemeral Laser Pointer trail refs (0 CPU when idle; fades over 1.4s)
  const localLaserTrailRef = useRef<LaserTrailPoint[]>([]);
  const remoteLaserTrailRef = useRef<LaserTrailPoint[]>([]);
  const laserRafRef = useRef<number | null>(null);
  const lastRemoteLaserSigRef = useRef<string>('');
  const lastRemoteLaserIdRef = useRef<string>('');

  const ensureLaserLoop = useCallback(() => {
    if (laserRafRef.current !== null) return;
    const step = () => {
      const now = performance.now();
      const maxAge = 1450;
      if (localLaserTrailRef.current.length > 0) {
        localLaserTrailRef.current = localLaserTrailRef.current.filter((p) => now - p.t <= maxAge);
      }
      if (remoteLaserTrailRef.current.length > 0) {
        remoteLaserTrailRef.current = remoteLaserTrailRef.current.filter((p) => now - p.t <= maxAge);
      }
      setLaserFrameTick((t) => (t + 1) % 1_000_000);
      if (localLaserTrailRef.current.length > 0 || remoteLaserTrailRef.current.length > 0) {
        laserRafRef.current = window.requestAnimationFrame(step);
      } else {
        laserRafRef.current = null;
      }
    };
    laserRafRef.current = window.requestAnimationFrame(step);
  }, []);

  // Redraw automatically when any pasted/inserted image finishes decoding
  useEffect(() => {
    return subscribeImageCacheReady(() => {
      setImageRenderTick((t) => t + 1);
    });
  }, []);

  // Feed incoming remote Laser Pointer packets into the smooth fading trail
  useEffect(() => {
    if (!remoteLiveElement || remoteLiveElement.type !== 'laser') return;
    const pts = remoteLiveElement.points;
    if (!Array.isArray(pts) || pts.length < 2) return;

    const sig = `${remoteLiveElement.id}:${remoteLiveElement.updatedAtMs || 0}:${pts.length}:${pts[pts.length - 2]},${pts[pts.length - 1]}`;
    if (sig === lastRemoteLaserSigRef.current) return;
    lastRemoteLaserSigRef.current = sig;

    const now = performance.now();
    if (remoteLiveElement.id !== lastRemoteLaserIdRef.current) {
      lastRemoteLaserIdRef.current = remoteLiveElement.id;
      remoteLaserTrailRef.current = [];
    }

    const trail = remoteLaserTrailRef.current;
    const totalPairs = Math.floor(pts.length / 2);
    const startPair = Math.max(0, totalPairs - 12);
    for (let i = startPair; i < totalPairs; i++) {
      const x = pts[i * 2];
      const y = pts[i * 2 + 1];
      const last = trail[trail.length - 1];
      if (!last || Math.hypot(x - last.x, y - last.y) >= 1.5) {
        const ageOffset = (totalPairs - 1 - i) * 14;
        trail.push({ x, y, t: now - ageOffset });
      }
    }
    if (trail.length > 72) {
      remoteLaserTrailRef.current = trail.slice(-72);
    }
    ensureLaserLoop();
  }, [remoteLiveElement, ensureLaserLoop]);

  const clearHoldSnapTimer = useCallback(() => {
    if (holdSnapTimerRef.current !== null) {
      window.clearTimeout(holdSnapTimerRef.current);
      holdSnapTimerRef.current = null;
    }
  }, []);

  const dismissSnapBanner = useCallback(() => {
    if (snapBannerTimerRef.current !== null) {
      window.clearTimeout(snapBannerTimerRef.current);
      snapBannerTimerRef.current = null;
    }
    setSnapBanner(null);
  }, []);

  const showSnapBanner = useCallback(
    (elementId: string, label: string, originalStroke: StrokeElement) => {
      if (snapBannerTimerRef.current !== null) {
        window.clearTimeout(snapBannerTimerRef.current);
      }
      setSnapBanner({ elementId, label, originalStroke });
      snapBannerTimerRef.current = window.setTimeout(() => {
        snapBannerTimerRef.current = null;
        setSnapBanner(null);
      }, 3500);
    },
    []
  );

  // Clean up hold-snap, laser rAF & banner timers on unmount
  useEffect(() => {
    return () => {
      clearHoldSnapTimer();
      if (snapBannerTimerRef.current !== null) {
        window.clearTimeout(snapBannerTimerRef.current);
      }
      if (laserRafRef.current !== null) {
        window.cancelAnimationFrame(laserRafRef.current);
      }
    };
  }, [clearHoldSnapTimer]);

  // Dismiss "Kembalikan Asli" banner automatically if the snapped element was undone or erased
  useEffect(() => {
    if (snapBanner && !elements.some((el) => el.id === snapBanner.elementId)) {
      dismissSnapBanner();
    }
  }, [elements, snapBanner, dismissSnapBanner]);

  // Clear selection when leaving Select tool or becoming readOnly
  useEffect(() => {
    if (activeTool !== 'select' || readOnly) {
      setSelectedId(null);
    }
  }, [activeTool, readOnly]);

  // Clear selection if the selected element was deleted remotely or via Undo
  useEffect(() => {
    if (selectedId && !elements.some((el) => el.id === selectedId)) {
      setSelectedId(null);
    }
  }, [elements, selectedId]);

  // Keyboard Delete/Backspace removes the selected object when not typing
  useEffect(() => {
    if (!selectedId || readOnly || textEditor || stickyEditor) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onRemoveElement(selectedId);
        setSelectedId(null);
      } else if (e.key === 'Escape') {
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId, readOnly, textEditor, stickyEditor, onRemoveElement]);

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
      localLaserTrail: localLaserTrailRef.current,
      remoteLaserTrail: remoteLaserTrailRef.current,
      laserNow: performance.now(),
      hoveredEraseId: activeTool === 'eraser' ? hoveredEraseId : null,
      editingTextId: textEditor?.id ?? stickyEditor?.id ?? null,
      selectedElementId: !readOnly && activeTool === 'select' ? selectedId : null,
      hiddenElementId: draggingId,
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
    stickyEditor?.id,
    selectedId,
    draggingId,
    activeTool,
    readOnly,
    displaySize,
    imageRenderTick,
    laserFrameTick,
  ]);

  // Focus textarea when opening text editor
  useEffect(() => {
    if (textEditor && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [textEditor?.id, textEditor?.x, textEditor?.y]);

  // Focus textarea when opening sticky note editor
  useEffect(() => {
    if (stickyEditor && stickyTextareaRef.current) {
      stickyTextareaRef.current.focus();
      const len = stickyTextareaRef.current.value.length;
      stickyTextareaRef.current.setSelectionRange(len, len);
    }
  }, [stickyEditor?.id, stickyEditor?.x, stickyEditor?.y]);

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

  const commitStickyEditor = useCallback(() => {
    if (!stickyEditor) return;
    const trimmed = stickyEditor.text.trim();
    if (trimmed) {
      const palette = STICKY_COLORS.find(
        (c) => c.bg.toLowerCase() === stickyEditor.bgColor.toLowerCase()
      );
      const payload: StickyNoteElement = {
        id: stickyEditor.id || createId('stk'),
        type: 'sticky',
        x: Math.round(stickyEditor.x),
        y: Math.round(stickyEditor.y),
        width: stickyEditor.width,
        height: stickyEditor.height,
        text: trimmed.slice(0, 600),
        bgColor: stickyEditor.bgColor,
        color: palette?.text || '#0F172A',
        fontSize: stickyEditor.fontSize,
        size: 2,
        opacity: 1,
      };
      if (stickyEditor.id) {
        onUpdateElement(payload);
      } else {
        onAddElement(payload);
      }
    } else if (stickyEditor.id) {
      onRemoveElement(stickyEditor.id);
    }
    setStickyEditor(null);
  }, [onAddElement, onRemoveElement, onUpdateElement, stickyEditor]);

  const openEditorForElement = useCallback((el: CanvasElement) => {
    if (el.type === 'text') {
      setTextEditor({
        id: el.id,
        x: el.x,
        y: el.y,
        text: el.text,
        color: el.color,
        fontSize: el.fontSize,
      });
    } else if (el.type === 'sticky') {
      setStickyEditor({
        id: el.id,
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        text: el.text,
        bgColor: el.bgColor,
        fontSize: el.fontSize,
      });
    }
  }, []);

  const handleDuplicateSelected = useCallback(() => {
    if (!selectedId) return;
    const found = elements.find((el) => el.id === selectedId);
    if (!found) return;
    const ctx = canvasRef.current?.getContext('2d') || null;
    const moved = translateElement(found, 28, 28, ctx);
    const clone: CanvasElement = {
      ...moved,
      id: createId(found.type === 'sticky' ? 'stk' : found.type === 'text' ? 'txt' : 'el'),
    };
    onAddElement(clone);
    setSelectedId(clone.id);
  }, [elements, onAddElement, selectedId]);

  const handleRecolorSelectedSticky = useCallback(
    (bg: string) => {
      if (!selectedId) return;
      const found = elements.find(
        (el): el is StickyNoteElement => el.id === selectedId && el.type === 'sticky'
      );
      if (!found) return;
      const palette = STICKY_COLORS.find((c) => c.bg.toLowerCase() === bg.toLowerCase());
      onUpdateElement({
        ...found,
        bgColor: bg,
        color: palette?.text || '#0F172A',
      });
    },
    [elements, onUpdateElement, selectedId]
  );

  const handleResizeSelectedImage = useCallback(
    (scaleFactor: number) => {
      if (!selectedId) return;
      const found = elements.find(
        (el): el is ImageElement => el.id === selectedId && el.type === 'image'
      );
      if (!found) return;
      const aspect =
        found.naturalWidth && found.naturalHeight
          ? found.naturalWidth / found.naturalHeight
          : found.width / Math.max(1, found.height);
      const maxW = VIRTUAL_WIDTH - 32;
      const maxH = VIRTUAL_HEIGHT - 32;
      let nextW = Math.round(found.width * scaleFactor);
      let nextH = Math.round(nextW / Math.max(0.1, aspect));

      if (nextW > maxW) {
        nextW = maxW;
        nextH = Math.round(nextW / Math.max(0.1, aspect));
      }
      if (nextH > maxH) {
        nextH = maxH;
        nextW = Math.round(nextH * Math.max(0.1, aspect));
      }
      if (nextW < 120) {
        nextW = 120;
        nextH = Math.max(60, Math.round(nextW / Math.max(0.1, aspect)));
      }
      if (nextH < 80) {
        nextH = 80;
        nextW = Math.max(100, Math.round(nextH * Math.max(0.1, aspect)));
      }

      const cx = found.x + found.width / 2;
      const cy = found.y + found.height / 2;
      const nextX = Math.max(16, Math.min(VIRTUAL_WIDTH - nextW - 16, Math.round(cx - nextW / 2)));
      const nextY = Math.max(16, Math.min(VIRTUAL_HEIGHT - nextH - 16, Math.round(cy - nextH / 2)));

      onUpdateElement({
        ...found,
        x: nextX,
        y: nextY,
        width: nextW,
        height: nextH,
      });
    },
    [elements, onUpdateElement, selectedId]
  );

  const handleDragOverCanvas = (e: React.DragEvent<HTMLDivElement>) => {
    if (readOnly) return;
    const hasFiles = Array.from(e.dataTransfer?.types || []).includes('Files');
    if (!hasFiles) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDragOverImage) setIsDragOverImage(true);
  };

  const handleDragLeaveCanvas = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsDragOverImage(false);
  };

  const handleDropOnCanvas = async (e: React.DragEvent<HTMLDivElement>) => {
    if (readOnly) return;
    e.preventDefault();
    setIsDragOverImage(false);
    const files = Array.from(e.dataTransfer?.files || []);
    const imgFile = files.find((f) => f.type.startsWith('image/'));
    if (!imgFile) return;

    try {
      const dropPt = toVirtualCoords(e.clientX, e.clientY);
      const imgEl = await createImageElementFromBlob(imgFile, {
        centerX: dropPt.x,
        centerY: dropPt.y,
      });
      onAddElement(imgEl);
      onNotice?.('Gambar disisipkan — coret langsung di atasnya atau pilih untuk geser/ubah ukuran');
    } catch (err) {
      onNotice?.(err instanceof Error ? err.message : 'Gagal memuat gambar');
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    // Commit any active floating editors before starting a new interaction
    if (textEditor) {
      commitTextEditor();
    }
    if (stickyEditor) {
      commitStickyEditor();
    }

    const pt = toVirtualCoords(e.clientX, e.clientY);
    const ctx = canvasRef.current?.getContext('2d') || null;

    // SELECT / MOVE TOOL: grab and drag any object (stroke, shape, ellipse, text, sticky)
    if (activeTool === 'select') {
      const hitId = findHitElementId(elements, pt.x, pt.y, ctx, 18, undefined, true);
      if (!hitId) {
        setSelectedId(null);
        return;
      }
      const found = elements.find((el) => el.id === hitId);
      if (!found) return;

      const wasAlreadySelected = selectedId === found.id;
      setSelectedId(found.id);
      e.currentTarget.setPointerCapture(e.pointerId);
      activePointerIdRef.current = e.pointerId;
      draggingObjectRef.current = {
        original: found,
        startX: pt.x,
        startY: pt.y,
        moved: false,
        wasAlreadySelected,
        openEditorOnTap:
          wasAlreadySelected && (found.type === 'text' || found.type === 'sticky'),
      };
      return;
    }

    // TEXT TOOL
    if (activeTool === 'text') {
      const hitTextId = findHitElementId(elements, pt.x, pt.y, ctx, 14, 'text');
      if (hitTextId) {
        const found = elements.find(
          (el): el is TextElement => el.id === hitTextId && el.type === 'text'
        );
        if (found) {
          e.currentTarget.setPointerCapture(e.pointerId);
          activePointerIdRef.current = e.pointerId;
          draggingObjectRef.current = {
            original: found,
            startX: pt.x,
            startY: pt.y,
            moved: false,
            wasAlreadySelected: true,
            openEditorOnTap: true,
          };
          return;
        }
      }

      setTextEditor({
        id: null,
        x: Math.max(16, Math.min(pt.x, VIRTUAL_WIDTH - 240)),
        y: Math.max(16, Math.min(pt.y, VIRTUAL_HEIGHT - 80)),
        text: '',
        color,
        fontSize: TEXT_SIZES[fontSize].px,
      });
      return;
    }

    // STICKY NOTE TOOL
    if (activeTool === 'sticky') {
      const hitStickyId = findHitElementId(elements, pt.x, pt.y, ctx, 12, 'sticky');
      if (hitStickyId) {
        const found = elements.find(
          (el): el is StickyNoteElement => el.id === hitStickyId && el.type === 'sticky'
        );
        if (found) {
          e.currentTarget.setPointerCapture(e.pointerId);
          activePointerIdRef.current = e.pointerId;
          draggingObjectRef.current = {
            original: found,
            startX: pt.x,
            startY: pt.y,
            moved: false,
            wasAlreadySelected: true,
            openEditorOnTap: true,
          };
          return;
        }
      }

      const sx = Math.max(
        16,
        Math.min(pt.x - DEFAULT_STICKY_WIDTH / 2, VIRTUAL_WIDTH - DEFAULT_STICKY_WIDTH - 16)
      );
      const sy = Math.max(
        16,
        Math.min(pt.y - DEFAULT_STICKY_HEIGHT / 2, VIRTUAL_HEIGHT - DEFAULT_STICKY_HEIGHT - 16)
      );
      setStickyEditor({
        id: null,
        x: Math.round(sx),
        y: Math.round(sy),
        width: DEFAULT_STICKY_WIDTH,
        height: DEFAULT_STICKY_HEIGHT,
        text: '',
        bgColor: stickyColor,
        fontSize: 22,
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

    if (activeTool === 'laser') {
      const now = performance.now();
      const sx = roundCoord(pt.x);
      const sy = roundCoord(pt.y);
      localLaserTrailRef.current = [{ x: sx, y: sy, t: now }];
      const laserEl: LaserElement = {
        id: createId('lsr'),
        type: 'laser',
        color: '#EF4444',
        size: 10,
        opacity: 1,
        points: [sx, sy],
        updatedAtMs: Date.now(),
      };
      draftElementRef.current = laserEl;
      ensureLaserLoop();
      onEmitLiveStroke(laserEl, true);
      return;
    }

    if (activeTool === 'pen' || activeTool === 'highlighter') {
      clearHoldSnapTimer();
      dismissSnapBanner();
      holdSnappedModeRef.current = 'none';
      holdSnappedLabelRef.current = null;
      rawPointsBeforeSnapRef.current = null;

      const widthCfg = STROKE_WIDTHS[strokeSize];
      const strokeSizePx = activeTool === 'pen' ? widthCfg.pen : widthCfg.highlighter;
      const strokeOpacity = activeTool === 'highlighter' ? 0.32 : 1;
      originalStrokeMetaRef.current = {
        type: activeTool,
        color,
        size: strokeSizePx,
        opacity: strokeOpacity,
      };

      const stroke: StrokeElement = {
        id: createId(activeTool === 'pen' ? 'pen' : 'hl'),
        type: activeTool,
        color,
        size: strokeSizePx,
        opacity: strokeOpacity,
        points: [roundCoord(pt.x), roundCoord(pt.y)],
      };
      draftElementRef.current = stroke;
      setLiveElement(stroke);
      onEmitLiveStroke(stroke, true);
      return;
    }

    // Vector Shapes: line, arrow, rect, ellipse
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
    if (!isDrawingRef.current && !draggingObjectRef.current) {
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

    // Dragging an existing object (Select, Text, or Sticky tool)
    if (draggingObjectRef.current) {
      const drag = draggingObjectRef.current;
      const dx = pt.x - drag.startX;
      const dy = pt.y - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) > 4.5) {
        drag.moved = true;
        setDraggingId(drag.original.id);
      }
      if (drag.moved) {
        const movedObj = translateElement(drag.original, dx, dy, ctx);
        draftElementRef.current = movedObj;
        setLiveElement(movedObj);
        onEmitLiveStroke(movedObj);
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

    // Ephemeral Glowing Laser Pointer (streams live, fades smoothly, never saved to board)
    if (draft.type === 'laser') {
      const nativeEvt = e.nativeEvent as PointerEvent;
      const rawCoalesced =
        typeof nativeEvt.getCoalescedEvents === 'function'
          ? nativeEvt.getCoalescedEvents()
          : null;
      const events = rawCoalesced && rawCoalesced.length > 0 ? rawCoalesced : [nativeEvt];
      const now = performance.now();
      const trail = localLaserTrailRef.current;
      let added = false;

      for (const ce of events) {
        const cPt = toVirtualCoords(ce.clientX, ce.clientY);
        const rx = roundCoord(cPt.x);
        const ry = roundCoord(cPt.y);
        const last = trail[trail.length - 1];
        if (!last || Math.hypot(rx - last.x, ry - last.y) >= 2) {
          trail.push({ x: rx, y: ry, t: now });
          added = true;
        }
      }

      if (!added) return;
      if (trail.length > 72) {
        localLaserTrailRef.current = trail.slice(-72);
      }
      ensureLaserLoop();

      const recentSlice = localLaserTrailRef.current.slice(-18);
      const flatPts: number[] = [];
      for (const p of recentSlice) {
        flatPts.push(p.x, p.y);
      }
      const updatedLaser: LaserElement = {
        ...draft,
        points: flatPts,
        updatedAtMs: Date.now(),
      };
      draftElementRef.current = updatedLaser;
      onEmitLiveStroke(updatedLaser);
      return;
    }

    // Hold-to-Snap active modes: live line endpoint steering or locked closed shape
    if (holdSnappedModeRef.current === 'line' && draft.type === 'line') {
      const snappedEnd = snapLineEndpointAngle({ x: draft.x1, y: draft.y1 }, pt);
      const updated: ShapeElement = {
        ...draft,
        x2: snappedEnd.x,
        y2: snappedEnd.y,
      };
      draftElementRef.current = updated;
      setLiveElement(updated);
      onEmitLiveStroke(updated);
      return;
    }

    if (holdSnappedModeRef.current === 'shape') {
      // Keep snapped circle/ellipse/rect steady until pointer is lifted
      return;
    }

    if (draft.type === 'pen' || draft.type === 'highlighter') {
      const nativeEvt = e.nativeEvent as PointerEvent;
      const rawCoalesced =
        typeof nativeEvt.getCoalescedEvents === 'function'
          ? nativeEvt.getCoalescedEvents()
          : null;
      const events = rawCoalesced && rawCoalesced.length > 0 ? rawCoalesced : [nativeEvt];
      const nextPts = [...draft.points];
      let added = false;

      for (const ce of events) {
        const cPt = toVirtualCoords(ce.clientX, ce.clientY);
        if (appendFreehandPoint(nextPts, cPt.x, cPt.y, smoothWriting)) {
          added = true;
        }
      }

      if (!added) return;

      const updated: StrokeElement = { ...draft, points: nextPts };
      draftElementRef.current = updated;
      setLiveElement(updated);
      onEmitLiveStroke(updated);

      // Hold-to-Snap: reset 380ms stillness timer on movement when shapeSnap is active
      if (shapeSnapRef.current) {
        clearHoldSnapTimer();
        holdSnapTimerRef.current = window.setTimeout(() => {
          holdSnapTimerRef.current = null;
          if (!isDrawingRef.current || holdSnappedModeRef.current !== 'none') return;
          const current = draftElementRef.current;
          if (!current || (current.type !== 'pen' && current.type !== 'highlighter')) return;

          const detected = detectAndSnapShape(current.points, true);
          if (!detected) return;

          rawPointsBeforeSnapRef.current = current.points.slice();
          const isHl = current.type === 'highlighter';
          const snappedShape: ShapeElement = {
            id: current.id,
            type: detected.type,
            color: current.color,
            size: current.size,
            opacity: isHl ? 0.32 : current.opacity,
            ...(isHl ? { isHighlight: true } : {}),
            x1: detected.x1,
            y1: detected.y1,
            x2: detected.x2,
            y2: detected.y2,
            ...(typeof detected.x3 === 'number' && typeof detected.y3 === 'number'
              ? { x3: detected.x3, y3: detected.y3 }
              : {}),
          };

          holdSnappedModeRef.current = detected.type === 'line' ? 'line' : 'shape';
          holdSnappedLabelRef.current = detected.label;
          draftElementRef.current = snappedShape;
          setLiveElement(snappedShape);
          onEmitLiveStroke(snappedShape, true);
        }, 380);
      }
      return;
    }

    if (
      draft.type === 'line' ||
      draft.type === 'arrow' ||
      draft.type === 'rect' ||
      draft.type === 'ellipse'
    ) {
      let x2 = roundCoord(pt.x);
      let y2 = roundCoord(pt.y);

      // Manual line tool: auto-lock horizontal/vertical within ±7.5° when length >= 16px
      if (draft.type === 'line') {
        const snappedEnd = snapLineEndpointAngle({ x: draft.x1, y: draft.y1 }, pt);
        x2 = snappedEnd.x;
        y2 = snappedEnd.y;
      }

      // Shift-constrain: perfect circle/square for ellipse/rect
      if (e.shiftKey && (draft.type === 'rect' || draft.type === 'ellipse')) {
        const dx = x2 - draft.x1;
        const dy = y2 - draft.y1;
        const side = Math.max(Math.abs(dx), Math.abs(dy));
        x2 = roundCoord(Math.max(0, Math.min(VIRTUAL_WIDTH, draft.x1 + Math.sign(dx || 1) * side)));
        y2 = roundCoord(Math.max(0, Math.min(VIRTUAL_HEIGHT, draft.y1 + Math.sign(dy || 1) * side)));
      }

      const updated: ShapeElement = {
        ...draft,
        x2,
        y2,
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

    // Finish object drag OR open inline editor on tap
    if (draggingObjectRef.current) {
      const drag = draggingObjectRef.current;
      draggingObjectRef.current = null;
      activePointerIdRef.current = null;
      setDraggingId(null);

      if (drag.moved && draftElementRef.current) {
        const moved = draftElementRef.current;
        draftElementRef.current = null;
        setLiveElement(null);
        onEmitLiveStroke(null, true);
        onUpdateElement(moved);
      } else if (drag.openEditorOnTap) {
        openEditorForElement(drag.original);
      }
      return;
    }

    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    activePointerIdRef.current = null;
    clearHoldSnapTimer();

    const snappedMode = holdSnappedModeRef.current;
    const snappedLabel = holdSnappedLabelRef.current;
    const rawBeforeSnap = rawPointsBeforeSnapRef.current;
    const origMeta = originalStrokeMetaRef.current;

    holdSnappedModeRef.current = 'none';
    holdSnappedLabelRef.current = null;
    rawPointsBeforeSnapRef.current = null;
    originalStrokeMetaRef.current = null;

    const draft = draftElementRef.current;
    draftElementRef.current = null;
    setLiveElement(null);
    onEmitLiveStroke(null, true);

    if (!draft) return;

    // 0. Ephemeral Laser Pointer: never commit to board elements or Undo history
    if (draft.type === 'laser') {
      return;
    }

    // 1. If already snapped via Hold-to-Snap, commit snapped shape & offer "Kembalikan Asli"
    if (snappedMode !== 'none') {
      onAddElement(draft);
      if (rawBeforeSnap && origMeta && snappedLabel) {
        const restoredPts = finalizeFreehandPoints(
          rawBeforeSnap,
          null,
          null,
          smoothWritingRef.current
        );
        const originalStroke: StrokeElement = {
          id: draft.id,
          type: origMeta.type,
          color: origMeta.color,
          size: origMeta.size,
          opacity: origMeta.opacity,
          points: restoredPts,
        };
        showSnapBanner(draft.id, snappedLabel, originalStroke);
      }
      return;
    }

    // 2. Freehand stroke (pen / highlighter): try Quick-Snap on pointerUp, else normal Opsi 1 smoothing
    if (draft.type === 'pen' || draft.type === 'highlighter') {
      const captureEnd = e.type === 'pointerup';
      const endPt = captureEnd ? toVirtualCoords(e.clientX, e.clientY) : null;
      const finalPoints = finalizeFreehandPoints(
        draft.points,
        endPt ? endPt.x : null,
        endPt ? endPt.y : null,
        smoothWriting
      );

      if (shapeSnapRef.current && captureEnd) {
        const quickDetected = detectAndSnapShape(finalPoints, false);
        if (quickDetected) {
          const isHl = draft.type === 'highlighter';
          const snappedShape: ShapeElement = {
            id: draft.id,
            type: quickDetected.type,
            color: draft.color,
            size: draft.size,
            opacity: isHl ? 0.32 : draft.opacity,
            ...(isHl ? { isHighlight: true } : {}),
            x1: quickDetected.x1,
            y1: quickDetected.y1,
            x2: quickDetected.x2,
            y2: quickDetected.y2,
            ...(typeof quickDetected.x3 === 'number' && typeof quickDetected.y3 === 'number'
              ? { x3: quickDetected.x3, y3: quickDetected.y3 }
              : {}),
          };
          const originalStroke: StrokeElement = {
            ...draft,
            points: finalPoints,
          };
          onAddElement(snappedShape);
          showSnapBanner(snappedShape.id, quickDetected.label, originalStroke);
          return;
        }
      }

      onAddElement({
        ...draft,
        points: finalPoints,
      });
      return;
    }

    if (
      draft.type === 'line' ||
      draft.type === 'arrow' ||
      draft.type === 'rect' ||
      draft.type === 'ellipse'
    ) {
      if (Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) < 6) {
        return; // Ignore accidental micro-clicks on shapes
      }
    }

    onAddElement(draft);
  };

  const selectedElement = useMemo(() => {
    if (!selectedId || activeTool !== 'select' || readOnly || draggingId) return null;
    return elements.find((el) => el.id === selectedId) || null;
  }, [selectedId, activeTool, readOnly, draggingId, elements]);

  const selectedBounds = useMemo(() => {
    if (!selectedElement) return null;
    const ctx = canvasRef.current?.getContext('2d') || null;
    return getElementBounds(selectedElement, ctx);
  }, [selectedElement]);

  const cursorClass = readOnly
    ? 'cursor-default'
    : activeTool === 'select'
    ? draggingId
      ? 'cursor-grabbing'
      : 'cursor-grab'
    : activeTool === 'text'
    ? 'cursor-text'
    : activeTool === 'sticky' || activeTool === 'eraser'
    ? 'cursor-pointer'
    : 'cursor-crosshair';

  const scaleX = displaySize.width / VIRTUAL_WIDTH;
  const scaleY = displaySize.height / VIRTUAL_HEIGHT;

  // Position floating action toolbar cleanly above (or below if near top) of selected element
  const selectionBarPos = useMemo(() => {
    if (!selectedBounds) return null;
    const centerX = ((selectedBounds.x + selectedBounds.width / 2) / VIRTUAL_WIDTH) * 100;
    const clampedX = Math.max(16, Math.min(84, centerX));
    const placeBelow = selectedBounds.y < 76;
    const topPct = placeBelow
      ? Math.min(92, ((selectedBounds.y + selectedBounds.height + 16) / VIRTUAL_HEIGHT) * 100)
      : Math.max(4, ((selectedBounds.y - 16) / VIRTUAL_HEIGHT) * 100);
    return { left: `${clampedX}%`, top: `${topPct}%`, placeBelow };
  }, [selectedBounds]);

  return (
    <div
      ref={containerRef}
      onDragOver={handleDragOverCanvas}
      onDragLeave={handleDragLeaveCanvas}
      onDrop={(e) => void handleDropOnCanvas(e)}
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

      {/* Drag-and-Drop Image Overlay */}
      {isDragOverImage && !readOnly && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-teal-950/35 backdrop-blur-[2px] border-4 border-dashed border-teal-400 rounded-xl">
          <div className="flex items-center gap-2.5 rounded-2xl bg-slate-900/95 text-white px-5 py-3 shadow-2xl border border-teal-400/50">
            <ImagePlus className="w-5 h-5 text-teal-400 shrink-0" />
            <span className="text-sm font-bold">
              Lepaskan gambar di sini untuk disisipkan ke papan
            </span>
          </div>
        </div>
      )}

      {/* Contextual Floating Action Bar for Selected Object (Select/Move Mode) */}
      {selectedElement && selectionBarPos && !textEditor && !stickyEditor && (
        <div
          style={{
            left: selectionBarPos.left,
            top: selectionBarPos.top,
            transform: selectionBarPos.placeBelow
              ? 'translate(-50%, 0)'
              : 'translate(-50%, -100%)',
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute z-20 flex items-center gap-1 rounded-xl bg-slate-900/95 text-white px-2 py-1.5 shadow-xl border border-slate-700"
        >
          {(selectedElement.type === 'text' || selectedElement.type === 'sticky') && (
            <button
              type="button"
              onClick={() => openEditorForElement(selectedElement)}
              title="Ubah isi teks"
              className="min-h-[34px] px-2 rounded-lg hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap"
            >
              <Pencil className="w-3.5 h-3.5 text-teal-400" />
              <span>Edit</span>
            </button>
          )}

          {selectedElement.type === 'sticky' && (
            <div className="flex items-center gap-1 px-1 border-x border-slate-700">
              {STICKY_COLORS.map((swatch) => {
                const active =
                  selectedElement.bgColor.toLowerCase() === swatch.bg.toLowerCase();
                return (
                  <button
                    key={swatch.id}
                    type="button"
                    onClick={() => handleRecolorSelectedSticky(swatch.bg)}
                    title={`Ganti warna ${swatch.label}`}
                    aria-label={`Warna sticky ${swatch.label}`}
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-transform ${
                      active ? 'ring-2 ring-white scale-105' : 'hover:scale-105'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-full block border border-black/15"
                      style={{ backgroundColor: swatch.bg }}
                    />
                  </button>
                );
              })}
            </div>
          )}

          {selectedElement.type === 'image' && (
            <div className="flex items-center gap-0.5 pr-1 border-r border-slate-700">
              <button
                type="button"
                onClick={() => handleResizeSelectedImage(0.84)}
                title="Perkecil gambar"
                className="min-h-[34px] px-2 rounded-lg hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap"
              >
                <ZoomOut className="w-3.5 h-3.5 text-teal-400" />
                <span className="hidden sm:inline">Kecilkan</span>
              </button>
              <button
                type="button"
                onClick={() => handleResizeSelectedImage(1.18)}
                title="Perbesar gambar"
                className="min-h-[34px] px-2 rounded-lg hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap"
              >
                <ZoomIn className="w-3.5 h-3.5 text-teal-400" />
                <span className="hidden sm:inline">Besarkan</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleDuplicateSelected}
            title="Duplikat objek"
            className="min-h-[34px] px-2 rounded-lg hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap"
          >
            <Copy className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Duplikat</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onRemoveElement(selectedElement.id);
              setSelectedId(null);
            }}
            title="Hapus objek (Del)"
            className="min-h-[34px] px-2 rounded-lg hover:bg-red-600/20 text-red-400 hover:text-red-300 text-xs font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Hapus</span>
          </button>
        </div>
      )}

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

      {/* Floating Inline Sticky Note Editor anchored strictly to virtual 1280x720 coordinates */}
      {stickyEditor && !readOnly && (
        <div
          style={{
            left: `${(stickyEditor.x / VIRTUAL_WIDTH) * 100}%`,
            top: `${(stickyEditor.y / VIRTUAL_HEIGHT) * 100}%`,
            width: `${Math.max(210, Math.round(stickyEditor.width * scaleX))}px`,
          }}
          className="absolute z-20 max-w-[88%]"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            style={{ backgroundColor: stickyEditor.bgColor }}
            className="rounded-xl border-2 border-slate-900/25 shadow-xl p-2.5"
          >
            {/* Quick Sticky Color Row */}
            <div className="flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-black/10">
              <div className="flex items-center gap-1">
                {STICKY_COLORS.map((swatch) => {
                  const active =
                    stickyEditor.bgColor.toLowerCase() === swatch.bg.toLowerCase();
                  return (
                    <button
                      key={swatch.id}
                      type="button"
                      onClick={() =>
                        setStickyEditor((prev) => (prev ? { ...prev, bgColor: swatch.bg } : null))
                      }
                      title={swatch.label}
                      className={`w-6 h-6 rounded-full flex items-center justify-center transition-transform ${
                        active ? 'ring-2 ring-slate-900 scale-105' : 'hover:scale-105'
                      }`}
                    >
                      <span
                        className="w-4 h-4 rounded-full block border border-black/20"
                        style={{ backgroundColor: swatch.bg }}
                      />
                    </button>
                  );
                })}
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-700/75">
                Catatan
              </span>
            </div>

            <textarea
              ref={stickyTextareaRef}
              value={stickyEditor.text}
              onChange={(e) =>
                setStickyEditor((prev) => (prev ? { ...prev, text: e.target.value } : null))
              }
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setStickyEditor(null);
                } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  commitStickyEditor();
                }
              }}
              placeholder="Tulis poin sticky note..."
              rows={3}
              className="w-full resize-none bg-transparent font-display text-base sm:text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-600/70 leading-snug"
            />

            <div className="mt-1.5 flex items-center justify-end gap-1 border-t border-black/10 pt-1.5">
              {stickyEditor.id && (
                <button
                  type="button"
                  onClick={() => {
                    onRemoveElement(stickyEditor.id!);
                    setStickyEditor(null);
                  }}
                  className="p-1.5 rounded-md text-red-700 hover:bg-red-500/15 transition-colors mr-auto"
                  title="Hapus Sticky Note"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setStickyEditor(null)}
                className="p-1.5 rounded-md text-slate-700 hover:bg-black/10 transition-colors"
                title="Batal"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={commitStickyEditor}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                Tempel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating 3.5s Smart Shape Snap Banner with 1-Click "Kembalikan Asli" */}
      {snapBanner && !readOnly && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          role="status"
          aria-live="polite"
          className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 max-w-[92%] flex items-center gap-2 rounded-xl bg-slate-900/95 text-white pl-3 pr-2 py-1.5 shadow-xl border border-slate-700/90"
        >
          <Shapes className="w-3.5 h-3.5 text-teal-400 shrink-0" />
          <span className="text-xs font-medium whitespace-nowrap">
            Dirapikan ke <strong className="font-bold text-teal-200">{snapBanner.label}</strong>
          </span>
          <button
            type="button"
            onClick={() => {
              const orig = snapBanner.originalStroke;
              dismissSnapBanner();
              onUpdateElement(orig);
            }}
            className="min-h-[30px] px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-3 h-3 shrink-0" />
            <span>Kembalikan Asli</span>
          </button>
        </div>
      )}
    </div>
  );
};
