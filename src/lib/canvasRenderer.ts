import {
  CanvasElement,
  PaperBackground,
  ShapeElement,
  STICKY_COLORS,
  StickyNoteElement,
  StrokeElement,
  TextElement,
  VIRTUAL_HEIGHT,
  VIRTUAL_WIDTH,
} from '../types/whiteboard';
import { roundCoord } from './strokeSmoothing';

export function drawPaperBackground(
  ctx: CanvasRenderingContext2D,
  background: PaperBackground
) {
  ctx.save();

  if (background === 'chalkboard') {
    const grad = ctx.createLinearGradient(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    grad.addColorStop(0, '#163830');
    grad.addColorStop(0.5, '#122E27');
    grad.addColorStop(1, '#0F2620');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);

    // Subtle chalk-board inner margin line
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.08)';
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 18, VIRTUAL_WIDTH - 36, VIRTUAL_HEIGHT - 36);
    ctx.restore();
    return;
  }

  // White / Grid / Lined paper base
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);

  if (background === 'grid') {
    const step = 32;
    ctx.beginPath();
    for (let x = step; x < VIRTUAL_WIDTH; x += step) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, VIRTUAL_HEIGHT);
    }
    for (let y = step; y < VIRTUAL_HEIGHT; y += step) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(VIRTUAL_WIDTH, y + 0.5);
    }
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Accent major grid lines every 4 cells (128px)
    const major = step * 4;
    ctx.beginPath();
    for (let x = major; x < VIRTUAL_WIDTH; x += major) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, VIRTUAL_HEIGHT);
    }
    for (let y = major; y < VIRTUAL_HEIGHT; y += major) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(VIRTUAL_WIDTH, y + 0.5);
    }
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  } else if (background === 'lined') {
    const rowStep = 44;
    ctx.beginPath();
    for (let y = 76; y < VIRTUAL_HEIGHT; y += rowStep) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(VIRTUAL_WIDTH, y + 0.5);
    }
    ctx.strokeStyle = '#DBEAFE';
    ctx.lineWidth = 1.25;
    ctx.stroke();

    // Vertical left margin rule
    ctx.beginPath();
    ctx.moveTo(84.5, 0);
    ctx.lineTo(84.5, VIRTUAL_HEIGHT);
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.restore();
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  el: StrokeElement,
  background: PaperBackground,
  isHighlighted: boolean
) {
  const pts = el.points;
  if (!pts || pts.length < 2) return;

  ctx.save();
  ctx.strokeStyle = isHighlighted ? '#EF4444' : el.color;
  ctx.fillStyle = isHighlighted ? '#EF4444' : el.color;
  ctx.lineWidth = el.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (el.type === 'highlighter') {
    ctx.globalAlpha = isHighlighted ? 0.55 : el.opacity;
    ctx.globalCompositeOperation = background === 'chalkboard' ? 'screen' : 'multiply';
    ctx.lineCap = 'butt';
  } else {
    ctx.globalAlpha = isHighlighted ? 0.55 : el.opacity;
  }

  if (pts.length === 2) {
    ctx.beginPath();
    ctx.arc(pts[0], pts[1], Math.max(1.5, el.size / 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);

  if (pts.length === 4) {
    ctx.lineTo(pts[2], pts[3]);
  } else {
    // Catmull-Rom spline converted to Cubic Bezier segments passing smoothly through every control point
    const pointCount = Math.floor(pts.length / 2);
    for (let i = 0; i < pointCount - 1; i++) {
      const pPrevIdx = Math.max(0, i - 1) * 2;
      const p0Idx = i * 2;
      const p1Idx = (i + 1) * 2;
      const pNextIdx = Math.min(pointCount - 1, i + 2) * 2;

      const pPrevX = pts[pPrevIdx];
      const pPrevY = pts[pPrevIdx + 1];
      const p0X = pts[p0Idx];
      const p0Y = pts[p0Idx + 1];
      const p1X = pts[p1Idx];
      const p1Y = pts[p1Idx + 1];
      const pNextX = pts[pNextIdx];
      const pNextY = pts[pNextIdx + 1];

      const cp1x = p0X + (p1X - pPrevX) / 6;
      const cp1y = p0Y + (p1Y - pPrevY) / 6;
      const cp2x = p1X - (pNextX - p0X) / 6;
      const cp2y = p1Y - (pNextY - p0Y) / 6;

      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p1X, p1Y);
    }
  }

  ctx.stroke();
  ctx.restore();
}

function getTriangleVertices(
  el: ShapeElement
): [[number, number], [number, number], [number, number]] {
  if (typeof el.x3 === 'number' && typeof el.y3 === 'number') {
    return [
      [el.x1, el.y1],
      [el.x2, el.y2],
      [el.x3, el.y3],
    ];
  }
  return [
    [(el.x1 + el.x2) / 2, el.y1],
    [el.x2, el.y2],
    [el.x1, el.y2],
  ];
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  el: ShapeElement,
  background: PaperBackground,
  isHighlighted: boolean
) {
  ctx.save();
  const isHighlightStroke = Boolean(el.isHighlight);
  ctx.strokeStyle = isHighlighted ? '#EF4444' : el.color;
  ctx.fillStyle = isHighlighted ? '#EF4444' : el.color;
  ctx.lineWidth = el.size;
  ctx.lineCap = isHighlightStroke && el.type === 'line' ? 'butt' : 'round';
  ctx.lineJoin = 'round';
  if (isHighlightStroke) {
    ctx.globalAlpha = isHighlighted ? 0.55 : Math.min(el.opacity || 0.32, 0.36);
    ctx.globalCompositeOperation = background === 'chalkboard' ? 'screen' : 'multiply';
  } else {
    ctx.globalAlpha = isHighlighted ? 0.55 : el.opacity;
  }

  if (el.type === 'line') {
    ctx.beginPath();
    ctx.moveTo(el.x1, el.y1);
    ctx.lineTo(el.x2, el.y2);
    ctx.stroke();
  } else if (el.type === 'arrow') {
    const dx = el.x2 - el.x1;
    const dy = el.y2 - el.y1;
    const len = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const headLen = Math.min(Math.max(16, el.size * 3.8), Math.max(16, len * 0.45));
    const headAngle = Math.PI / 6.5;

    // Stop shaft slightly before tip so round cap doesn't poke past point
    const shaftEndX = len > headLen ? el.x2 - Math.cos(angle) * (headLen * 0.65) : el.x2;
    const shaftEndY = len > headLen ? el.y2 - Math.sin(angle) * (headLen * 0.65) : el.y2;

    ctx.beginPath();
    ctx.moveTo(el.x1, el.y1);
    ctx.lineTo(shaftEndX, shaftEndY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(el.x2, el.y2);
    ctx.lineTo(
      el.x2 - headLen * Math.cos(angle - headAngle),
      el.y2 - headLen * Math.sin(angle - headAngle)
    );
    ctx.lineTo(
      el.x2 - headLen * Math.cos(angle + headAngle),
      el.y2 - headLen * Math.sin(angle + headAngle)
    );
    ctx.closePath();
    ctx.fill();
  } else if (el.type === 'rect') {
    const rx = Math.min(el.x1, el.x2);
    const ry = Math.min(el.y1, el.y2);
    const rw = Math.abs(el.x2 - el.x1);
    const rh = Math.abs(el.y2 - el.y1);
    const radius = Math.min(10, rw / 6, rh / 6);

    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(rx, ry, rw, rh, radius);
    } else {
      ctx.rect(rx, ry, rw, rh);
    }
    ctx.stroke();
  } else if (el.type === 'ellipse') {
    const cx = (el.x1 + el.x2) / 2;
    const cy = (el.y1 + el.y2) / 2;
    const rx = Math.max(1, Math.abs(el.x2 - el.x1) / 2);
    const ry = Math.max(1, Math.abs(el.y2 - el.y1) / 2);

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (el.type === 'triangle') {
    const [[ax, ay], [bx, by], [cx, cy]] = getTriangleVertices(el);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(cx, cy);
    ctx.closePath();
    ctx.stroke();
  }

  ctx.restore();
}

export function measureTextElementBox(
  ctx: CanvasRenderingContext2D,
  el: TextElement
): { x: number; y: number; width: number; height: number } {
  ctx.save();
  ctx.font = `600 ${el.fontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
  const lines = el.text.split('\n');
  let maxW = 60;
  for (const line of lines) {
    const w = ctx.measureText(line).width;
    if (w > maxW) maxW = w;
  }
  const lineHeight = el.fontSize * 1.28;
  ctx.restore();
  return {
    x: el.x,
    y: el.y,
    width: maxW,
    height: Math.max(lineHeight, lines.length * lineHeight),
  };
}

function drawTextElement(
  ctx: CanvasRenderingContext2D,
  el: TextElement,
  isHighlighted: boolean,
  showEditFrame: boolean
) {
  ctx.save();
  ctx.font = `600 ${el.fontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
  ctx.fillStyle = isHighlighted ? '#EF4444' : el.color;
  ctx.textBaseline = 'top';
  ctx.globalAlpha = isHighlighted ? 0.55 : el.opacity;

  const lines = el.text.split('\n');
  const lineHeight = el.fontSize * 1.28;
  lines.forEach((line, idx) => {
    ctx.fillText(line, el.x, el.y + idx * lineHeight);
  });

  if (showEditFrame || isHighlighted) {
    const box = measureTextElementBox(ctx, el);
    ctx.strokeStyle = isHighlighted ? '#EF4444' : 'rgba(13, 148, 136, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(box.x - 8, box.y - 6, box.width + 16, box.height + 10);
  }

  ctx.restore();
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const result: string[] = [];
  const paragraphs = text.split('\n');
  for (const para of paragraphs) {
    if (!para.trim()) {
      result.push('');
      continue;
    }
    const words = para.split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        if (current) result.push(current);
        // Handle single very long word gracefully
        if (ctx.measureText(word).width > maxWidth) {
          let chunk = '';
          for (const ch of word) {
            if (ctx.measureText(chunk + ch).width > maxWidth && chunk) {
              result.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          current = chunk;
        } else {
          current = word;
        }
      }
    }
    if (current) result.push(current);
  }
  return result.length > 0 ? result : [''];
}

function drawStickyNote(
  ctx: CanvasRenderingContext2D,
  el: StickyNoteElement,
  isHighlighted: boolean
) {
  const palette = STICKY_COLORS.find((c) => c.bg.toLowerCase() === el.bgColor.toLowerCase());
  const borderColor = isHighlighted ? '#EF4444' : palette?.border || '#CA8A04';
  const textColor = isHighlighted ? '#991B1B' : el.color || palette?.text || '#0F172A';

  ctx.save();
  ctx.globalAlpha = isHighlighted ? 0.72 : el.opacity;

  // Soft realistic paper elevation shadow
  ctx.shadowColor = 'rgba(15, 23, 42, 0.16)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 6;

  // Sticky card body
  ctx.fillStyle = el.bgColor || '#FEF08A';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(el.x, el.y, el.width, el.height, 12);
  } else {
    ctx.rect(el.x, el.y, el.width, el.height);
  }
  ctx.fill();

  // Turn off shadow for crisp inner details & text
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Top accent strip
  ctx.save();
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(el.x, el.y, el.width, el.height, 12);
  } else {
    ctx.rect(el.x, el.y, el.width, el.height);
  }
  ctx.clip();

  ctx.fillStyle = borderColor;
  ctx.globalAlpha = isHighlighted ? 0.65 : 0.24;
  ctx.fillRect(el.x, el.y, el.width, 10);

  // Subtle folded corner accent at bottom-right
  const fold = 18;
  ctx.beginPath();
  ctx.moveTo(el.x + el.width - fold, el.y + el.height);
  ctx.lineTo(el.x + el.width, el.y + el.height - fold);
  ctx.lineTo(el.x + el.width, el.y + el.height);
  ctx.closePath();
  ctx.fillStyle = borderColor;
  ctx.globalAlpha = 0.22;
  ctx.fill();
  ctx.restore();

  // Crisp card outline
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = isHighlighted ? 3 : 1.75;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(el.x, el.y, el.width, el.height, 12);
  } else {
    ctx.rect(el.x, el.y, el.width, el.height);
  }
  ctx.stroke();

  // Word-wrapped note text clipped cleanly inside card
  ctx.save();
  const padX = 16;
  const padTop = 22;
  const padBottom = 14;
  ctx.beginPath();
  ctx.rect(el.x + padX - 2, el.y + padTop - 2, el.width - padX * 2 + 4, el.height - padTop - padBottom + 4);
  ctx.clip();

  ctx.font = `600 ${el.fontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
  ctx.fillStyle = textColor;
  ctx.textBaseline = 'top';

  const lines = wrapTextLines(ctx, el.text, el.width - padX * 2);
  const lineHeight = el.fontSize * 1.32;
  lines.forEach((line, idx) => {
    ctx.fillText(line, el.x + padX, el.y + padTop + idx * lineHeight);
  });
  ctx.restore();

  ctx.restore();
}

export interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getElementBounds(
  el: CanvasElement,
  ctx: CanvasRenderingContext2D | null
): ElementBounds {
  if (el.type === 'sticky') {
    return { x: el.x, y: el.y, width: el.width, height: el.height };
  }
  if (el.type === 'text') {
    if (ctx) return measureTextElementBox(ctx, el);
    return {
      x: el.x,
      y: el.y,
      width: Math.max(80, el.text.length * el.fontSize * 0.56),
      height: Math.max(el.fontSize * 1.3, el.text.split('\n').length * el.fontSize * 1.3),
    };
  }
  if (el.type === 'pen' || el.type === 'highlighter') {
    const pts = el.points;
    if (!pts || pts.length < 2) return { x: 0, y: 0, width: 20, height: 20 };
    let minX = pts[0];
    let maxX = pts[0];
    let minY = pts[1];
    let maxY = pts[1];
    for (let i = 2; i < pts.length; i += 2) {
      if (pts[i] < minX) minX = pts[i];
      if (pts[i] > maxX) maxX = pts[i];
      if (pts[i + 1] < minY) minY = pts[i + 1];
      if (pts[i + 1] > maxY) maxY = pts[i + 1];
    }
    const pad = Math.max(6, el.size / 2);
    return {
      x: minX - pad,
      y: minY - pad,
      width: Math.max(16, maxX - minX + pad * 2),
      height: Math.max(16, maxY - minY + pad * 2),
    };
  }
  if (el.type === 'triangle') {
    const [[ax, ay], [bx, by], [cx, cy]] = getTriangleVertices(el);
    const minX = Math.min(ax, bx, cx);
    const maxX = Math.max(ax, bx, cx);
    const minY = Math.min(ay, by, cy);
    const maxY = Math.max(ay, by, cy);
    const pad = Math.max(4, el.size / 2);
    return {
      x: minX - pad,
      y: minY - pad,
      width: Math.max(16, maxX - minX + pad * 2),
      height: Math.max(16, maxY - minY + pad * 2),
    };
  }
  if (
    el.type === 'line' ||
    el.type === 'arrow' ||
    el.type === 'rect' ||
    el.type === 'ellipse'
  ) {
    const minX = Math.min(el.x1, el.x2);
    const maxX = Math.max(el.x1, el.x2);
    const minY = Math.min(el.y1, el.y2);
    const maxY = Math.max(el.y1, el.y2);
    const pad = Math.max(4, el.size / 2);
    return {
      x: minX - pad,
      y: minY - pad,
      width: Math.max(16, maxX - minX + pad * 2),
      height: Math.max(16, maxY - minY + pad * 2),
    };
  }
  return { x: 0, y: 0, width: 20, height: 20 };
}

export function translateElement(
  el: CanvasElement,
  dx: number,
  dy: number,
  ctx: CanvasRenderingContext2D | null
): CanvasElement {
  const bounds = getElementBounds(el, ctx);
  // Clamp translation so object always remains reachable within the 1280x720 board
  const minDx = 8 - bounds.x;
  const maxDx = VIRTUAL_WIDTH - 8 - (bounds.x + bounds.width);
  const minDy = 8 - bounds.y;
  const maxDy = VIRTUAL_HEIGHT - 8 - (bounds.y + bounds.height);

  const clampedDx = Math.round(
    minDx <= maxDx ? Math.max(minDx, Math.min(maxDx, dx)) : dx
  );
  const clampedDy = Math.round(
    minDy <= maxDy ? Math.max(minDy, Math.min(maxDy, dy)) : dy
  );

  if (el.type === 'pen' || el.type === 'highlighter') {
    const nextPts = new Array<number>(el.points.length);
    for (let i = 0; i < el.points.length; i += 2) {
      nextPts[i] = roundCoord(el.points[i] + clampedDx);
      nextPts[i + 1] = roundCoord(el.points[i + 1] + clampedDy);
    }
    return { ...el, points: nextPts };
  }
  if (el.type === 'text' || el.type === 'sticky') {
    return {
      ...el,
      x: Math.round(el.x + clampedDx),
      y: Math.round(el.y + clampedDy),
    };
  }
  if (
    el.type === 'line' ||
    el.type === 'arrow' ||
    el.type === 'rect' ||
    el.type === 'ellipse' ||
    el.type === 'triangle'
  ) {
    return {
      ...el,
      x1: roundCoord(el.x1 + clampedDx),
      y1: roundCoord(el.y1 + clampedDy),
      x2: roundCoord(el.x2 + clampedDx),
      y2: roundCoord(el.y2 + clampedDy),
      ...(typeof el.x3 === 'number' && typeof el.y3 === 'number'
        ? {
            x3: roundCoord(el.x3 + clampedDx),
            y3: roundCoord(el.y3 + clampedDy),
          }
        : {}),
    };
  }
  return el;
}

function drawSelectionOverlay(ctx: CanvasRenderingContext2D, bounds: ElementBounds) {
  const pad = 8;
  const x = bounds.x - pad;
  const y = bounds.y - pad;
  const w = bounds.width + pad * 2;
  const h = bounds.height + pad * 2;

  ctx.save();
  ctx.strokeStyle = '#0D9488';
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);

  // Crisp corner indicators
  const corners = [
    [x, y],
    [x + w, y],
    [x, y + h],
    [x + w, y + h],
  ];
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#0D9488';
  ctx.lineWidth = 2;
  for (const [cx, cy] of corners) {
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawSingleElement(
  ctx: CanvasRenderingContext2D,
  el: CanvasElement,
  background: PaperBackground,
  isHighlighted: boolean,
  showTextFrames: boolean
) {
  if (el.type === 'pen' || el.type === 'highlighter') {
    drawStroke(ctx, el, background, isHighlighted);
  } else if (el.type === 'text') {
    drawTextElement(ctx, el, isHighlighted, showTextFrames);
  } else if (el.type === 'sticky') {
    drawStickyNote(ctx, el, isHighlighted);
  } else if (
    el.type === 'line' ||
    el.type === 'arrow' ||
    el.type === 'rect' ||
    el.type === 'ellipse' ||
    el.type === 'triangle'
  ) {
    drawShape(ctx, el, background, isHighlighted);
  }
}

export function renderBoardCanvas(
  ctx: CanvasRenderingContext2D,
  background: PaperBackground,
  elements: CanvasElement[],
  options?: {
    liveElement?: CanvasElement | null;
    remoteLiveElement?: CanvasElement | null;
    hoveredEraseId?: string | null;
    editingTextId?: string | null;
    selectedElementId?: string | null;
    hiddenElementId?: string | null;
    showTextFrames?: boolean;
  }
) {
  drawPaperBackground(ctx, background);

  let selectedElementForOverlay: CanvasElement | null = null;

  for (const el of elements) {
    if (options?.editingTextId && el.id === options.editingTextId) continue;
    if (options?.hiddenElementId && el.id === options.hiddenElementId) continue;
    const isHighlighted = options?.hoveredEraseId === el.id;
    drawSingleElement(ctx, el, background, isHighlighted, Boolean(options?.showTextFrames));
    if (options?.selectedElementId && el.id === options.selectedElementId) {
      selectedElementForOverlay = el;
    }
  }

  if (options?.remoteLiveElement) {
    drawSingleElement(ctx, options.remoteLiveElement, background, false, false);
  }

  if (options?.liveElement) {
    drawSingleElement(ctx, options.liveElement, background, false, false);
    if (options?.selectedElementId && options.liveElement.id === options.selectedElementId) {
      selectedElementForOverlay = options.liveElement;
    }
  }

  if (selectedElementForOverlay) {
    drawSelectionOverlay(ctx, getElementBounds(selectedElementForOverlay, ctx));
  }
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function findHitElementId(
  elements: CanvasElement[],
  vx: number,
  vy: number,
  ctx: CanvasRenderingContext2D | null,
  tolerance = 16,
  onlyType?: CanvasElement['type'],
  allowInteriorHit = false
): string | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (onlyType && el.type !== onlyType) continue;

    if (el.type === 'sticky') {
      if (
        vx >= el.x - 6 &&
        vx <= el.x + el.width + 6 &&
        vy >= el.y - 6 &&
        vy <= el.y + el.height + 6
      ) {
        return el.id;
      }
    } else if (el.type === 'text') {
      const box = ctx
        ? measureTextElementBox(ctx, el)
        : {
            x: el.x,
            y: el.y,
            width: Math.max(80, el.text.length * el.fontSize * 0.56),
            height: el.text.split('\n').length * el.fontSize * 1.3,
          };
      if (
        vx >= box.x - 10 &&
        vx <= box.x + box.width + 10 &&
        vy >= box.y - 8 &&
        vy <= box.y + box.height + 8
      ) {
        return el.id;
      }
    } else if (el.type === 'pen' || el.type === 'highlighter') {
      const pts = el.points;
      const hitRadius = Math.max(tolerance, el.size * 0.65);
      if (pts.length === 2) {
        if (Math.hypot(vx - pts[0], vy - pts[1]) <= hitRadius) return el.id;
      } else {
        for (let j = 0; j < pts.length - 2; j += 2) {
          if (distToSegment(vx, vy, pts[j], pts[j + 1], pts[j + 2], pts[j + 3]) <= hitRadius) {
            return el.id;
          }
        }
      }
    } else if (el.type === 'line' || el.type === 'arrow') {
      const hitRadius = Math.max(tolerance, el.size + 8);
      if (distToSegment(vx, vy, el.x1, el.y1, el.x2, el.y2) <= hitRadius) {
        return el.id;
      }
    } else if (el.type === 'rect') {
      const rx1 = Math.min(el.x1, el.x2);
      const rx2 = Math.max(el.x1, el.x2);
      const ry1 = Math.min(el.y1, el.y2);
      const ry2 = Math.max(el.y1, el.y2);
      const hitRadius = Math.max(tolerance, el.size + 8);
      if (
        allowInteriorHit &&
        vx >= rx1 - hitRadius &&
        vx <= rx2 + hitRadius &&
        vy >= ry1 - hitRadius &&
        vy <= ry2 + hitRadius
      ) {
        return el.id;
      }
      const nearTop = distToSegment(vx, vy, rx1, ry1, rx2, ry1) <= hitRadius;
      const nearBottom = distToSegment(vx, vy, rx1, ry2, rx2, ry2) <= hitRadius;
      const nearLeft = distToSegment(vx, vy, rx1, ry1, rx1, ry2) <= hitRadius;
      const nearRight = distToSegment(vx, vy, rx2, ry1, rx2, ry2) <= hitRadius;
      if (nearTop || nearBottom || nearLeft || nearRight) {
        return el.id;
      }
    } else if (el.type === 'ellipse') {
      const cx = (el.x1 + el.x2) / 2;
      const cy = (el.y1 + el.y2) / 2;
      const rx = Math.max(4, Math.abs(el.x2 - el.x1) / 2);
      const ry = Math.max(4, Math.abs(el.y2 - el.y1) / 2);
      const hitRadius = Math.max(tolerance, el.size + 8);
      const dx = vx - cx;
      const dy = vy - cy;
      const normDist = Math.hypot(dx / rx, dy / ry);
      if (allowInteriorHit && normDist <= 1 + hitRadius / Math.min(rx, ry)) {
        return el.id;
      }
      // Approximate distance to ellipse boundary along radial direction
      const angle = Math.atan2(dy / ry, dx / rx);
      const edgeX = cx + rx * Math.cos(angle);
      const edgeY = cy + ry * Math.sin(angle);
      if (Math.hypot(vx - edgeX, vy - edgeY) <= hitRadius) {
        return el.id;
      }
    } else if (el.type === 'triangle') {
      const [[ax, ay], [bx, by], [cx, cy]] = getTriangleVertices(el);
      const hitRadius = Math.max(tolerance, el.size + 8);
      if (
        distToSegment(vx, vy, ax, ay, bx, by) <= hitRadius ||
        distToSegment(vx, vy, bx, by, cx, cy) <= hitRadius ||
        distToSegment(vx, vy, cx, cy, ax, ay) <= hitRadius
      ) {
        return el.id;
      }
      if (allowInteriorHit) {
        const d1 = (vx - bx) * (ay - by) - (ax - bx) * (vy - by);
        const d2 = (vx - cx) * (by - cy) - (bx - cx) * (vy - cy);
        const d3 = (vx - ax) * (cy - ay) - (cx - ax) * (vy - ay);
        const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
        const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
        if (!(hasNeg && hasPos)) {
          return el.id;
        }
      }
    }
  }
  return null;
}
