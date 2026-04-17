/**
 * Inverse Distance Weighted (Shepard's) displacement field.
 *
 * Each output point is shifted by a weighted average of the per-control-point
 * displacement vectors. Weights are `1 / |p_i - v|^(2α)`. Smooth everywhere,
 * topologically cannot tear, exactly interpolates control points.
 *
 * **Caveat: "content folding".** The displacement field is C∞-smooth, but for
 * neighbouring control points with opposite displacement directions, the field
 * passes through zero between them — and source content in that "zero zone"
 * can map to overlapping output positions, mirroring the in-between content.
 * This is visually similar to tearing. Mitigations:
 *   - Use a smaller α (gentler falloff, wider transitions).
 *   - Switch to MLS-similarity/affine (model rotation locally so opposite
 *     pulls are absorbed by rotation rather than compression).
 *
 * α = 0.5 (weight = 1/d) is a smoother default than the textbook α = 1
 * (weight = 1/d²) — significantly less folding at the cost of slightly less
 * "stickiness" near each control point.
 */

export type IDWPair = { source: { x: number; y: number }; target: { x: number; y: number } };

const DEFAULT_ALPHA = 0.5;

export function applyIDW(
  pairs: IDWPair[],
  vx: number,
  vy: number,
  alpha: number = DEFAULT_ALPHA,
): { x: number; y: number } {
  const n = pairs.length;
  if (n === 0) return { x: vx, y: vy };

  let totalW = 0;
  let dxSum = 0;
  let dySum = 0;

  for (let i = 0; i < n; i++) {
    const p = pairs[i]!.source;
    const t = pairs[i]!.target;
    const dx = p.x - vx;
    const dy = p.y - vy;
    const distSq = dx * dx + dy * dy;
    if (distSq < 1e-10) {
      // Exact match — return the target directly to avoid 1/0.
      return { x: t.x, y: t.y };
    }
    const w = 1 / Math.pow(distSq, alpha);
    totalW += w;
    dxSum += w * (t.x - p.x);
    dySum += w * (t.y - p.y);
  }

  if (totalW === 0) return { x: vx, y: vy };
  return {
    x: vx + dxSum / totalW,
    y: vy + dySum / totalW,
  };
}
