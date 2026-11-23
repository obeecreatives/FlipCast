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

export type DetectedShapeType = 'line' | 'rect' | 'ellipse' | 'triangle';

export interface DetectedShapeResult {
  type: DetectedShapeType;
  label: 'Garis Lurus' | 'Kotak' | 'Lingkaran' | 'Elips' | 'Segitiga';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3?: number;
  y3?: number;
}

const ANGLE_SNAP_MIN_LEN = 16;
const ANGLE_SNAP_TOL_DEG = 7.5;
const TRIANGLE_EDGE_LEVEL_TOL_DEG = 9;

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

function pointToSegmentDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function cross2D(o: Point2D, a: Point2D, b: Point2D): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * Computes the 2D convex hull (Monotone Chain) of a flat coordinate array.
 */
function computeConvexHull(flatPoints: number[], n: number): Point2D[] {
  const pts: Point2D[] = new Array(n);
  for (let i = 0; i < n; i++) {
    pts[i] = { x: flatPoints[i * 2], y: flatPoints[i * 2 + 1] };
  }
  pts.sort((a, b) => (a.x !== b.x ? a.x - b.x : a.y - b.y));

  const lower: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    while (lower.length >= 2 && cross2D(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: Point2D[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross2D(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Finds the maximum-area inscribed triangle on a convex hull.
 * For any hand-drawn triangle (upright, inverted, rotated, or with slight corner overshoot),
 * this recovers its exact 3 vertices reliably regardless of where the stroke started.
 */
function findMaxAreaTriangle(hull: Point2D[]): {
  a: Point2D;
  b: Point2D;
  c: Point2D;
  area: number;
} | null {
  let pts = hull;
  if (pts.length < 3) return null;

  // Cap hull size to 28 evenly spaced vertices for guaranteed <0.05ms evaluation
  if (pts.length > 28) {
    const sampled: Point2D[] = [];
    const step = pts.length / 28;
    for (let i = 0; i < 28; i++) {
      sampled.push(pts[Math.floor(i * step)]);
    }
    pts = sampled;
  }

  const m = pts.length;
  let bestArea2 = 0;
  let bestI = 0;
  let bestJ = 1;
  let bestK = 2;

  for (let i = 0; i < m - 2; i++) {
    const pi = pts[i];
    for (let j = i + 1; j < m - 1; j++) {
      const pj = pts[j];
      for (let k = j + 1; k < m; k++) {
        const area2 = Math.abs(cross2D(pi, pj, pts[k]));
        if (area2 > bestArea2) {
          bestArea2 = area2;
          bestI = i;
          bestJ = j;
          bestK = k;
        }
      }
    }
  }

  if (bestArea2 <= 1) return null;
  return {
    a: { ...pts[bestI] },
    b: { ...pts[bestJ] },
    c: { ...pts[bestK] },
    area: bestArea2 * 0.5,
  };
}

/**
 * Levels near-horizontal/near-vertical edges of a snapped triangle and
 * centers the apex when it is nearly symmetric (isosceles upright, inverted, left, or right).
 */
function beautifyTriangleVertices(v0: Point2D, v1: Point2D, v2: Point2D): [Point2D, Point2D, Point2D] {
  const verts: [Point2D, Point2D, Point2D] = [
    { x: v0.x, y: v0.y },
    { x: v1.x, y: v1.y },
    { x: v2.x, y: v2.y },
  ];

  const pairs: [number, number, number][] = [
    [0, 1, 2],
    [1, 2, 0],
    [2, 0, 1],
  ];

  let leveledHorizontalBase: [number, number, number] | null = null;
  let leveledVerticalBase: [number, number, number] | null = null;

  for (const [i, j, opp] of pairs) {
    const a = verts[i];
    const b = verts[j];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 16) continue;

    const absDeg = (Math.abs(Math.atan2(dy, dx)) * 180) / Math.PI;
    if (absDeg <= TRIANGLE_EDGE_LEVEL_TOL_DEG || absDeg >= 180 - TRIANGLE_EDGE_LEVEL_TOL_DEG) {
      const avgY = (a.y + b.y) / 2;
      a.y = avgY;
      b.y = avgY;
      leveledHorizontalBase = [i, j, opp];
    } else if (Math.abs(absDeg - 90) <= TRIANGLE_EDGE_LEVEL_TOL_DEG) {
      const avgX = (a.x + b.x) / 2;
      a.x = avgX;
      b.x = avgX;
      leveledVerticalBase = [i, j, opp];
    }
  }

  // If NOT a right triangle (only 1 leveled base), snap apex to center when nearly symmetric
  if (leveledHorizontalBase && !leveledVerticalBase) {
    const [i, j, opp] = leveledHorizontalBase;
    const baseMidX = (verts[i].x + verts[j].x) / 2;
    const baseLen = Math.abs(verts[j].x - verts[i].x);
    if (baseLen > 0 && Math.abs(verts[opp].x - baseMidX) <= baseLen * 0.16) {
      verts[opp].x = baseMidX;
    }
  } else if (leveledVerticalBase && !leveledHorizontalBase) {
    const [i, j, opp] = leveledVerticalBase;
    const baseMidY = (verts[i].y + verts[j].y) / 2;
    const baseLen = Math.abs(verts[j].y - verts[i].y);
    if (baseLen > 0 && Math.abs(verts[opp].y - baseMidY) <= baseLen * 0.16) {
      verts[opp].y = baseMidY;
    }
  }

  return [
    { x: roundCoord(verts[0].x), y: roundCoord(verts[0].y) },
    { x: roundCoord(verts[1].x), y: roundCoord(verts[1].y) },
    { x: roundCoord(verts[2].x), y: roundCoord(verts[2].y) },
  ];
}

/**
 * Evaluates how closely the stroke fits a 3-sided triangle (any orientation:
 * upright, upside-down, right-angled, wide, or tilted).
 */
function evaluateTriangleFit(
  flatPoints: number[],
  n: number,
  w: number,
  h: number,
  diag: number
): { err: number; vertices: [Point2D, Point2D, Point2D] } | null {
  const hull = computeConvexHull(flatPoints, n);
  const maxTri = findMaxAreaTriangle(hull);
  if (!maxTri) return null;

  const { a, b, c, area } = maxTri;
  const boxArea = w * h;
  // Real triangles occupy ~32%–55% of their bounding box; slivers/open strokes are much smaller
  if (boxArea <= 0 || area < boxArea * 0.25) return null;

  const ab = Math.hypot(b.x - a.x, b.y - a.y);
  const bc = Math.hypot(c.x - b.x, c.y - b.y);
  const ca = Math.hypot(a.x - c.x, a.y - c.y);
  const minEdgeLen = Math.max(18, diag * 0.22);
  if (ab < minEdgeLen || bc < minEdgeLen || ca < minEdgeLen) return null;

  const avgRadius = (w + h) / 4;
  if (avgRadius <= 1) return null;

  let distSum = 0;
  let countAB = 0;
  let countBC = 0;
  let countCA = 0;

  for (let i = 0; i < n; i++) {
    const px = flatPoints[i * 2];
    const py = flatPoints[i * 2 + 1];
    const dAB = pointToSegmentDist(px, py, a.x, a.y, b.x, b.y);
    const dBC = pointToSegmentDist(px, py, b.x, b.y, c.x, c.y);
    const dCA = pointToSegmentDist(px, py, c.x, c.y, a.x, a.y);

    if (dAB <= dBC && dAB <= dCA) {
      distSum += dAB;
      countAB++;
    } else if (dBC <= dCA) {
      distSum += dBC;
      countBC++;
    } else {
      distSum += dCA;
      countCA++;
    }
  }

  // Ensure all 3 sides are genuinely drawn (prevents V-shapes or hooks from snapping to triangle)
  const minSidePts = Math.max(2, Math.floor(n * 0.08));
  if (countAB < minSidePts || countBC < minSidePts || countCA < minSidePts) {
    return null;
  }

  const err = distSum / n / avgRadius;
  const snappedVerts = beautifyTriangleVertices(a, b, c);
  return { err, vertices: snappedVerts };
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

  // 2. Check Closed Curve (Circle / Ellipse / Rectangle / Triangle)
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

    const triFit = evaluateTriangleFit(flatPoints, n, w, h, diag);
    const triErr = triFit ? triFit.err : Infinity;
    const triTol = isHoldSnap ? 0.24 : 0.175;

    // Pick Triangle when it fits clearly better than both Ellipse and Rectangle
    if (
      triFit &&
      triErr <= triTol &&
      triErr < ellipseErr * 0.92 &&
      triErr < rectErr * 0.92
    ) {
      const [v1, v2, v3] = triFit.vertices;
      return {
        type: 'triangle',
        label: 'Segitiga',
        x1: v1.x,
        y1: v1.y,
        x2: v2.x,
        y2: v2.y,
        x3: v3.x,
        y3: v3.y,
      };
    }

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
