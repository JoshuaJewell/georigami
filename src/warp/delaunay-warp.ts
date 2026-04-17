import Delaunator from 'delaunator';

/**
 * Delaunay-triangulated piecewise affine warp.
 *
 * The source control points are Delaunay-triangulated. For each query point we
 * find the triangle whose source contains it, compute its barycentric
 * coordinates, and apply those same barycentric weights to the corresponding
 * target triangle. This guarantees mathematical continuity along every
 * triangle edge — no tearing, no islands. The trade-off is a piecewise-linear
 * deformation that has visible "creases" where two triangles meet at an angle.
 *
 * Outside the convex hull of source points we extrapolate via the triangle
 * with the *least-negative* barycentric coordinate (equivalent to "the
 * triangle nearest the query"). This keeps the output continuous across the
 * hull boundary at the cost of mild distortion in the extrapolation region.
 */

export type DelaunayPair = { source: { x: number; y: number }; target: { x: number; y: number } };

export type DelaunayWarp = {
  pairs: DelaunayPair[];
  /** Triangle vertex indices into `pairs`, packed as triples. */
  triangles: Uint32Array;
  /** Per-triangle source bounding box, packed as [minX, minY, maxX, maxY]
   *  for every triangle (so length = `triangles.length / 3 * 4`). Used to
   *  skip the barycentric test for triangles that obviously don't contain
   *  the query — a ~10× speedup for typical scattered control-point sets. */
  bboxes: Float64Array;
};

export function buildDelaunayWarp(pairs: DelaunayPair[]): DelaunayWarp {
  if (pairs.length < 3) {
    return { pairs, triangles: new Uint32Array(0), bboxes: new Float64Array(0) };
  }
  const flat = new Float64Array(pairs.length * 2);
  for (let i = 0; i < pairs.length; i++) {
    flat[i * 2] = pairs[i]!.source.x;
    flat[i * 2 + 1] = pairs[i]!.source.y;
  }
  // Delaunator uses a flat coords array (x0, y0, x1, y1, ...).
  const d = new Delaunator(flat);

  // Precompute per-triangle source-coord bounding boxes.
  const numTris = d.triangles.length / 3;
  const bboxes = new Float64Array(numTris * 4);
  for (let t = 0; t < numTris; t++) {
    const i0 = d.triangles[t * 3]!;
    const i1 = d.triangles[t * 3 + 1]!;
    const i2 = d.triangles[t * 3 + 2]!;
    const x0 = pairs[i0]!.source.x, y0 = pairs[i0]!.source.y;
    const x1 = pairs[i1]!.source.x, y1 = pairs[i1]!.source.y;
    const x2 = pairs[i2]!.source.x, y2 = pairs[i2]!.source.y;
    bboxes[t * 4] = Math.min(x0, x1, x2);
    bboxes[t * 4 + 1] = Math.min(y0, y1, y2);
    bboxes[t * 4 + 2] = Math.max(x0, x1, x2);
    bboxes[t * 4 + 3] = Math.max(y0, y1, y2);
  }

  return { pairs, triangles: d.triangles, bboxes };
}

export function applyDelaunayWarp(
  warp: DelaunayWarp,
  vx: number,
  vy: number,
): { x: number; y: number } {
  const { pairs, triangles, bboxes } = warp;
  if (triangles.length === 0) return { x: vx, y: vy };

  // For each triangle, compute (vx, vy)'s barycentric coords. Track the one
  // with the maximum minimum-coord — that's "the most-containing" triangle.
  // Inside the hull, exactly one triangle has all three coords ≥ 0 and we
  // pick it on the early-exit. Outside, we fall back to the least-negative
  // triangle for continuous extrapolation.
  let bestMinBary = -Infinity;
  let bestI0 = 0, bestI1 = 0, bestI2 = 0;
  let bestA = 0, bestB = 0, bestC = 0;

  // First pass: only consider triangles whose source bbox contains (vx, vy).
  // For points inside the convex hull this finds the containing triangle in
  // O(triangles_with_bbox_hit) — typically ~1 to ~5 — instead of O(N).
  const numTris = triangles.length / 3;
  for (let t = 0; t < numTris; t++) {
    const bx = t * 4;
    if (vx < bboxes[bx]! || vy < bboxes[bx + 1]! || vx > bboxes[bx + 2]! || vy > bboxes[bx + 3]!) continue;
    const i0 = triangles[t * 3]!;
    const i1 = triangles[t * 3 + 1]!;
    const i2 = triangles[t * 3 + 2]!;
    const p0 = pairs[i0]!.source;
    const p1 = pairs[i1]!.source;
    const p2 = pairs[i2]!.source;
    const denom = (p1.y - p2.y) * (p0.x - p2.x) + (p2.x - p1.x) * (p0.y - p2.y);
    if (Math.abs(denom) < 1e-12) continue;
    const a = ((p1.y - p2.y) * (vx - p2.x) + (p2.x - p1.x) * (vy - p2.y)) / denom;
    const b = ((p2.y - p0.y) * (vx - p2.x) + (p0.x - p2.x) * (vy - p2.y)) / denom;
    const c = 1 - a - b;
    const minBary = Math.min(a, b, c);
    if (minBary > bestMinBary) {
      bestMinBary = minBary;
      bestI0 = i0; bestI1 = i1; bestI2 = i2;
      bestA = a; bestB = b; bestC = c;
      if (minBary >= -1e-9) {
        // Containing triangle found.
        const t0 = pairs[bestI0]!.target;
        const t1 = pairs[bestI1]!.target;
        const t2 = pairs[bestI2]!.target;
        return {
          x: bestA * t0.x + bestB * t1.x + bestC * t2.x,
          y: bestA * t0.y + bestB * t1.y + bestC * t2.y,
        };
      }
    }
  }

  // Fallback: outside any triangle's bbox (i.e., outside the convex hull).
  // Scan ALL triangles to pick the one with the highest min-barycentric for
  // continuous extrapolation. This branch is hit only for hull-exterior pixels.
  for (let t = 0; t < numTris; t++) {
    const i0 = triangles[t * 3]!;
    const i1 = triangles[t * 3 + 1]!;
    const i2 = triangles[t * 3 + 2]!;
    const p0 = pairs[i0]!.source;
    const p1 = pairs[i1]!.source;
    const p2 = pairs[i2]!.source;
    const denom = (p1.y - p2.y) * (p0.x - p2.x) + (p2.x - p1.x) * (p0.y - p2.y);
    if (Math.abs(denom) < 1e-12) continue;
    const a = ((p1.y - p2.y) * (vx - p2.x) + (p2.x - p1.x) * (vy - p2.y)) / denom;
    const b = ((p2.y - p0.y) * (vx - p2.x) + (p0.x - p2.x) * (vy - p2.y)) / denom;
    const c = 1 - a - b;
    const minBary = Math.min(a, b, c);
    if (minBary > bestMinBary) {
      bestMinBary = minBary;
      bestI0 = i0; bestI1 = i1; bestI2 = i2;
      bestA = a; bestB = b; bestC = c;
    }
  }

  const t0 = pairs[bestI0]!.target;
  const t1 = pairs[bestI1]!.target;
  const t2 = pairs[bestI2]!.target;
  return {
    x: bestA * t0.x + bestB * t1.x + bestC * t2.x,
    y: bestA * t0.y + bestB * t1.y + bestC * t2.y,
  };
}
