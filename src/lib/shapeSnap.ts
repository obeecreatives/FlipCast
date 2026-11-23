import { roundCoord } from './strokeSmoothing';

export interface Point2D {
  x: number;
  y: number;
}

export type SnappedAxis = 'none' | 'horizontal' | 'vertical';

export interface SnappedEndpointResult {
  x: number;
  y: number;
  snappedAxis: SnappedAxis;
}

export type DetectedShapeType = 'line' | 'rect' | 'ellipse';

export interface DetectedShapeResult {
  type: DetectedShapeType;
  label: 'Garis Lurus' | 'Kotak' | 'Lingkaran' | 'Elips';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const ANGLE_SNAP_MIN_LEN = 16;
const ANGLE_SNAP_TOL_DEG = 7.5;

/**
 * Locks a line endpoint to perfect horizontal (0°/180°) or vertical (90°)
 * when length >= 16px and angle is within ±7.5° of an axis.
 */
export function snapLineEndpointAngle(
  p0: Point2D,
  p1: Point2D
): SnappedEndpointResult {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy);

  if (len < ANGLE_SNAP_MIN_LEN) {
    return {
      x: roundCoord(p1.x),
      y: roundCoord(p1.y),
      snappedAxis: 'none',
    };
  }

  const absDeg = (Math.abs(Math.atan2(dy, dx)) * 180) / Math.PI;

  if (absDeg <= ANGLE_SNAP_TOL_DEG || absDeg >= 180 - ANGLE_SNAP_TOL_DEG) {
    return {
      x: roundCoord(p1.x),
      y: roundCoord(p0.y),
      snappedAxis: 'horizontal',
    };
  }

  if (Math.abs(absDeg - 90) <= ANGLE_SNAP_TOL_DEG) {
    return {
      x: roundCoord(p0.x),
      y: roundCoord(p1.y),
      snappedAxis: 'vertical',
    };
  }

  return {
    x: roundCoord(p1.x),
    y: roundCoord(p1.y),
    snappedAxis: 'none',
  };
}

/**
 * Pure geometric Smart Shape Snap detector (0 ms latency, runs locally on Canvas points).
 * Operates directly on flat `points: number[]` (`[x0, y0, x1, y1, ...]`).
 *
 * - `isHoldSnap = true`: Relaxed thresholds when user holds pen still for 380ms.
 * - `isHoldSnap = false`: Stricter Quick-Snap thresholds on pointerUp so normal
 *   fast handwriting letters/digits (`O`, `0`, `l`, `1`) are never falsely snapped.
 */
export function detectAndSnapShape(
  flatPoints: number[],
  isHoldSnap: boolean
): DetectedShapeResult | null {
  const n = Math.floor(flatPoints.length / 2);
  if (n < 2) return null;

  let minX = flatPoints[0];
  let maxX = flatPoints[0];
  let minY = flatPoints[1];
  let maxY = flatPoints[1];
  let sumX = flatPoints[0];
  let sumY = flatPoints[1];
  let pathLen = 0;

  for (let i = 1; i < n; i++) {
    const x = flatPoints[i * 2];
    const y = flatPoints[i * 2 + 1];
    const prevX = flatPoints[(i - 1) * 2];
    const prevY = flatPoints[(i - 1) * 2 + 1];

    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    sumX += x;
    sumY += y;
    pathLen += Math.hypot(x - prevX, y - prevY);
  }

  const start: Point2D = { x: flatPoints[0], y: flatPoints[1] };
  const end: Point2D = {
    x: flatPoints[(n - 1) * 2],
    y: flatPoints[(n - 1) * 2 + 1],
  };

  const w = maxX - minX;
  const h = maxY - minY;
  const diag = Math.hypot(w, h);
  const directDist = Math.hypot(end.x - start.x, end.y - start.y);

  // 1. Check Straight Line ('line')
  const minLineLen = isHoldSnap ? 32 : 115;
  const minEfficiency = isHoldSnap ? 0.88 : 0.94;

  if (
    directDist >= minLineLen &&
    pathLen > 0 &&
    directDist / pathLen >= minEfficiency
  ) {
    const maxDevLimit = Math.max(
      isHoldSnap ? 14 : 8,
      directDist * (isHoldSnap ? 0.085 : 0.045)
    );
    const dyLine = end.y - start.y;
    const dxLine = end.x - start.x;
    const crossConst = end.x * start.y - end.y * start.x;

    let maxPerpDev = 0;
    for (let i = 1; i < n - 1; i++) {
      const px = flatPoints[i * 2];
      const py = flatPoints[i * 2 + 1];
      const dev =
        Math.abs(dyLine * px - dxLine * py + crossConst) / directDist;
      if (dev > maxPerpDev) {
        maxPerpDev = dev;
        if (maxPerpDev > maxDevLimit) break;
      }
    }

    if (maxPerpDev <= maxDevLimit) {
      const snappedEnd = snapLineEndpointAngle(start, end);
      let x1 = roundCoord(start.x);
      let y1 = roundCoord(start.y);
      let x2 = snappedEnd.x;
      let y2 = snappedEnd.y;

      if (snappedEnd.snappedAxis === 'horizontal') {
        const avgY = roundCoord(sumY / n);
        y1 = avgY;
        y2 = avgY;
      } else if (snappedEnd.snappedAxis === 'vertical') {
        const avgX = roundCoord(sumX / n);
        x1 = avgX;
        x2 = avgX;
      }

      return {
        type: 'line',
        label: 'Garis Lurus',
        x1,
        y1,
        x2,
        y2,
      };
    }
  }

  // 2. Check Closed Curve (Circle / Ellipse / Rectangle)
  const minLoopBox = isHoldSnap ? 28 : 60;
  const minDiag = isHoldSnap ? 42 : 85;
  const maxClosureDist = Math.max(36, diag * (isHoldSnap ? 0.44 : 0.28));
  const minPerimeter = 2 * (w + h) * 0.55;

  if (
    n >= 8 &&
    Math.max(w, h) >= minLoopBox &&
    Math.min(w, h) >= 16 &&
    diag >= minDiag &&
    directDist <= maxClosureDist &&
    pathLen >= minPerimeter
  ) {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const rx = w / 2;
    const ry = h / 2;

    let ellipseErrSum = 0;
    let rectErrSum = 0;

    for (let i = 0; i < n; i++) {
      const nx = Math.abs(flatPoints[i * 2] - cx) / rx;
      const ny = Math.abs(flatPoints[i * 2 + 1] - cy) / ry;
      ellipseErrSum += Math.abs(Math.hypot(nx, ny) - 1);
      rectErrSum += Math.abs(Math.max(nx, ny) - 1);
    }

    const ellipseErr = ellipseErrSum / n;
    const rectErr = rectErrSum / n;
    const tol = isHoldSnap ? 0.23 : 0.145;

    if (Math.min(ellipseErr, rectErr) <= tol) {
      if (ellipseErr <= rectErr) {
        const aspectRatio = Math.min(w, h) / Math.max(w, h);
        if (aspectRatio >= 0.85) {
          const radius = (w + h) / 4;
          return {
            type: 'ellipse',
            label: 'Lingkaran',
            x1: roundCoord(cx - radius),
            y1: roundCoord(cy - radius),
            x2: roundCoord(cx + radius),
            y2: roundCoord(cy + radius),
          };
        }
        return {
          type: 'ellipse',
          label: 'Elips',
          x1: roundCoord(minX),
          y1: roundCoord(minY),
          x2: roundCoord(maxX),
          y2: roundCoord(maxY),
        };
      }

      return {
        type: 'rect',
        label: 'Kotak',
        x1: roundCoord(minX),
        y1: roundCoord(minY),
        x2: roundCoord(maxX),
        y2: roundCoord(maxY),
      };
    }
  }

  return null;
}
