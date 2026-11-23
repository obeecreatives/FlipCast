/**
 * Stroke Smoothing & Sub-pixel Coordinate Utilities
 *
 * Operates directly on the existing flat `points: number[]` format
 * `[x0, y0, x1, y1, ...]` so real-time WebRTC delta/snapshot sync,
 * Firestore persistence, and localStorage stay 100% compatible.
 */

/**
 * 1. Sub-pixel coordinate precision (0.1 px)
 * Prevents stair-stepping on small handwriting curves and digits.
 */
export function roundCoord(n: number): number {
  return Math.round(n * 10) / 10;
}

const SMOOTH_MIN_DIST_SQ = 4; // 2.0 px squared
const RAW_MIN_DIST_SQ = 6.25; // 2.5 px squared
const LIVE_EMA_ALPHA = 0.62;
const ENDPOINT_MIN_DIST_SQ = 1; // 1.0 px squared
const COMPACT_MIN_DIST_SQ = 5;

/**
 * 2. Live Anti-Tremor Stabilizer during pointerMove (0 ms delay)
 * Appends a new smoothed (or raw 0.1px) point into `pts` in-place when
 * pointer movement crosses the distance threshold.
 * Returns `true` if a new point was appended.
 */
export function appendFreehandPoint(
  pts: number[],
  rawX: number,
  rawY: number,
  smooth: boolean
): boolean {
  const len = pts.length;
  if (len < 2) {
    pts.push(roundCoord(rawX), roundCoord(rawY));
    return true;
  }

  const lastX = pts[len - 2];
  const lastY = pts[len - 1];

  if (smooth) {
    const dx = rawX - lastX;
    const dy = rawY - lastY;
    if (dx * dx + dy * dy < SMOOTH_MIN_DIST_SQ) {
      return false;
    }
    const sx = roundCoord(lastX + LIVE_EMA_ALPHA * dx);
    const sy = roundCoord(lastY + LIVE_EMA_ALPHA * dy);
    if (sx === lastX && sy === lastY) {
      return false;
    }
    pts.push(sx, sy);
    return true;
  }

  const rx = roundCoord(rawX);
  const ry = roundCoord(rawY);
  const dx = rx - lastX;
  const dy = ry - lastY;
  if (dx * dx + dy * dy < RAW_MIN_DIST_SQ) {
    return false;
  }
  pts.push(rx, ry);
  return true;
}

/**
 * 3. Corner-Preserving Post-Stroke Smoothing & Lightweight Compaction (pointerUp)
 * - Captures the final pointerUp position so stroke tails never feel clipped/short.
 * - Runs 1 pass of weighted smoothing (0.18 * prev + 0.64 * curr + 0.18 * next)
 *   keeping the first and last points strictly anchored.
 * - Compacts redundant points with `minDistSq = 5` while always preserving start & end.
 */
export function finalizeFreehandPoints(
  pts: number[],
  endRawX: number | null,
  endRawY: number | null,
  smooth: boolean
): number[] {
  const out = pts.slice();

  // Capture final pointer position on pointerUp so endings feel complete
  if (endRawX !== null && endRawY !== null && out.length >= 2) {
    const ex = roundCoord(endRawX);
    const ey = roundCoord(endRawY);
    const lastX = out[out.length - 2];
    const lastY = out[out.length - 1];
    const dx = ex - lastX;
    const dy = ey - lastY;
    if (dx * dx + dy * dy >= ENDPOINT_MIN_DIST_SQ) {
      out.push(ex, ey);
    }
  }

  if (!smooth || out.length < 6) {
    return out;
  }

  // Pass 1: Corner-preserving weighted smoothing (first & last points anchored)
  const len = out.length;
  const smoothed = new Array<number>(len);
  smoothed[0] = out[0];
  smoothed[1] = out[1];
  smoothed[len - 2] = out[len - 2];
  smoothed[len - 1] = out[len - 1];

  for (let i = 2; i <= len - 4; i += 2) {
    smoothed[i] = roundCoord(
      0.18 * out[i - 2] + 0.64 * out[i] + 0.18 * out[i + 2]
    );
    smoothed[i + 1] = roundCoord(
      0.18 * out[i - 1] + 0.64 * out[i + 1] + 0.18 * out[i + 3]
    );
  }

  // Pass 2: Lightweight point compaction (minDistSq = 5), keeping start & end exact
  const compacted: number[] = [smoothed[0], smoothed[1]];
  let keptX = smoothed[0];
  let keptY = smoothed[1];

  for (let i = 2; i <= len - 4; i += 2) {
    const x = smoothed[i];
    const y = smoothed[i + 1];
    const dx = x - keptX;
    const dy = y - keptY;
    if (dx * dx + dy * dy >= COMPACT_MIN_DIST_SQ) {
      compacted.push(x, y);
      keptX = x;
      keptY = y;
    }
  }

  const endX = smoothed[len - 2];
  const endY = smoothed[len - 1];
  if (endX !== keptX || endY !== keptY) {
    compacted.push(endX, endY);
  }

  return compacted;
}
