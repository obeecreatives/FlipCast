import {
  CanvasElement,
  PaperBackground,
  ShapeElement,
  StrokeElement,
  TextElement,
  VIRTUAL_HEIGHT,
  VIRTUAL_WIDTH,
} from '../types/whiteboard';

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
    for (let i = 2; i < pts.length - 2; i += 2) {
      const xc = (pts[i] + pts[i + 2]) / 2;
      const yc = (pts[i + 1] + pts[i + 3]) / 2;
      ctx.quadraticCurveTo(pts[i], pts[i + 1], xc, yc);
    }
    ctx.lineTo(pts[pts.length - 2], pts[pts.length - 1]);
  }

  ctx.stroke();
  ctx.restore();
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  el: ShapeElement,
  isHighlighted: boolean
) {
  ctx.save();
  ctx.strokeStyle = isHighlighted ? '#EF4444' : el.color;
  ctx.fillStyle = isHighlighted ? '#EF4444' : el.color;
  ctx.lineWidth = el.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = isHighlighted ? 0.55 : el.opacity;

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

export function renderBoardCanvas(
  ctx: CanvasRenderingContext2D,
  background: PaperBackground,
  elements: CanvasElement[],
  options?: {
    liveElement?: CanvasElement | null;
    remoteLiveElement?: CanvasElement | null;
    hoveredEraseId?: string | null;
    editingTextId?: string | null;
    showTextFrames?: boolean;
  }
) {
  drawPaperBackground(ctx, background);

  for (const el of elements) {
    if (options?.editingTextId && el.id === options.editingTextId) continue;
    const isHighlighted = options?.hoveredEraseId === el.id;
    if (el.type === 'pen' || el.type === 'highlighter') {
      drawStroke(ctx, el, background, isHighlighted);
    } else if (el.type === 'text') {
      drawTextElement(ctx, el, isHighlighted, Boolean(options?.showTextFrames));
    } else if (el.type === 'line' || el.type === 'arrow' || el.type === 'rect') {
      drawShape(ctx, el, isHighlighted);
    }
  }

  if (options?.remoteLiveElement) {
    const el = options.remoteLiveElement;
    if (el.type === 'pen' || el.type === 'highlighter') {
      drawStroke(ctx, el, background, false);
    } else if (el.type === 'text') {
      drawTextElement(ctx, el, false, false);
    } else if (el.type === 'line' || el.type === 'arrow' || el.type === 'rect') {
      drawShape(ctx, el, false);
    }
  }

  if (options?.liveElement) {
    const el = options.liveElement;
    if (el.type === 'pen' || el.type === 'highlighter') {
      drawStroke(ctx, el, background, false);
    } else if (el.type === 'text') {
      drawTextElement(ctx, el, false, false);
    } else if (el.type === 'line' || el.type === 'arrow' || el.type === 'rect') {
      drawShape(ctx, el, false);
    }
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
  onlyType?: CanvasElement['type']
): string | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (onlyType && el.type !== onlyType) continue;

    if (el.type === 'text') {
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
      const nearTop = distToSegment(vx, vy, rx1, ry1, rx2, ry1) <= hitRadius;
      const nearBottom = distToSegment(vx, vy, rx1, ry2, rx2, ry2) <= hitRadius;
      const nearLeft = distToSegment(vx, vy, rx1, ry1, rx1, ry2) <= hitRadius;
      const nearRight = distToSegment(vx, vy, rx2, ry1, rx2, ry2) <= hitRadius;
      if (nearTop || nearBottom || nearLeft || nearRight) {
        return el.id;
      }
    }
  }
  return null;
}
