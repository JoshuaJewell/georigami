/**
 * Moving Least Squares (Schaefer, McPhail & Warren 2006) deformation, three
 * variants. All share weights, centroids, and cross-covariance computation;
 * they differ only in how the per-pixel deformation matrix is assembled.
 *
 *   - **rigid**: only rotation + translation. Most feature-preserving but
 *     prone to tearing ("islands") when neighbouring control points want very
 *     different local rotations.
 *   - **similarity**: rotation + translation + uniform scale. Lets the local
 *     image scale to absorb rotational mismatches → much less tearing.
 *   - **affine**: full 2×2 linear transform + translation. Smoothest, can
 *     introduce shear of local content but rarely tears.
 *
 * All three interpolate the control points exactly. Pick based on how
 * faithful you need local pixels vs. how smooth you need transitions.
 */

export type MLSPair = { source: { x: number; y: number }; target: { x: number; y: number } };
export type MLSVariant = 'rigid' | 'similarity' | 'affine';

const DEFAULT_ALPHA = 1;

export function applyMLS(
  pairs: MLSPair[],
  vx: number,
  vy: number,
  variant: MLSVariant = 'rigid',
  alpha: number = DEFAULT_ALPHA,
): { x: number; y: number } {
  const n = pairs.length;
  if (n === 0) return { x: vx, y: vy };

  // Weights: w_i = 1 / |p_i - v|^(2α). Special-case exact-match to avoid 1/0
  // (which is mathematically the correct limit but produces NaN).
  const weights = new Float64Array(n);
  let totalW = 0;
  for (let i = 0; i < n; i++) {
    const p = pairs[i]!.source;
    const dx0 = p.x - vx;
    const dy0 = p.y - vy;
    const distSq = dx0 * dx0 + dy0 * dy0;
    if (distSq < 1e-10) {
      const t = pairs[i]!.target;
      return { x: t.x, y: t.y };
    }
    const w = 1 / Math.pow(distSq, alpha);
    weights[i] = w;
    totalW += w;
  }
  if (totalW === 0) return { x: vx, y: vy };

  // Weighted centroids of source (p*) and target (q*).
  let psx = 0, psy = 0, ptx = 0, pty = 0;
  for (let i = 0; i < n; i++) {
    const w = weights[i]!;
    psx += w * pairs[i]!.source.x;
    psy += w * pairs[i]!.source.y;
    ptx += w * pairs[i]!.target.x;
    pty += w * pairs[i]!.target.y;
  }
  psx /= totalW; psy /= totalW;
  ptx /= totalW; pty /= totalW;

  const dx = vx - psx;
  const dy = vy - psy;

  if (variant === 'affine') {
    // Solve weighted least-squares affine: M = (Σ w p̂ q̂ᵀ) (Σ w p̂ p̂ᵀ)⁻¹.
    // Working in 2D the normal-equation matrix is symmetric 2×2.
    let A = 0, B = 0, C = 0;        // Σ w · [px², px·py, py²]
    let D = 0, E = 0, F = 0, G = 0; // Σ w · [qx·px, qx·py, qy·px, qy·py]
    for (let i = 0; i < n; i++) {
      const w = weights[i]!;
      const px = pairs[i]!.source.x - psx;
      const py = pairs[i]!.source.y - psy;
      const qx = pairs[i]!.target.x - ptx;
      const qy = pairs[i]!.target.y - pty;
      A += w * px * px;
      B += w * px * py;
      C += w * py * py;
      D += w * qx * px;
      E += w * qx * py;
      F += w * qy * px;
      G += w * qy * py;
    }
    const det = A * C - B * B;
    if (Math.abs(det) < 1e-12) {
      // Source control points are collinear — affine solve is undetermined.
      // Fall back to pure translation by the (q* - p*) shift, which is what
      // we already have at this point.
      return { x: dx + ptx, y: dy + pty };
    }
    // Closed-form 2×2 inverse-then-multiply.
    const m00 = (D * C - E * B) / det;
    const m01 = (E * A - D * B) / det;
    const m10 = (F * C - G * B) / det;
    const m11 = (G * A - F * B) / det;
    return {
      x: m00 * dx + m01 * dy + ptx,
      y: m10 * dx + m11 * dy + pty,
    };
  }

  // Both rigid and similarity build the same 2-parameter (a, b) similarity
  // matrix M_s = [[a, -b], [b, a]], differing only in whether we normalise it.
  let aSum = 0, bSum = 0, mu = 0;
  for (let i = 0; i < n; i++) {
    const w = weights[i]!;
    const px = pairs[i]!.source.x - psx;
    const py = pairs[i]!.source.y - psy;
    const qx = pairs[i]!.target.x - ptx;
    const qy = pairs[i]!.target.y - pty;
    aSum += w * (px * qx + py * qy); // Σ w (p̂ · q̂)
    bSum += w * (px * qy - py * qx); // Σ w (p̂ × q̂)
    mu += w * (px * px + py * py);   // Σ w |p̂|²
  }
  if (mu === 0) return { x: ptx, y: pty };

  let a = aSum / mu;
  let b = bSum / mu;

  if (variant === 'rigid') {
    // Project (a, b) onto the unit circle to remove the scale component,
    // leaving only the optimal rotation.
    const norm = Math.sqrt(a * a + b * b);
    if (norm > 0) {
      a /= norm;
      b /= norm;
    } else {
      a = 1; b = 0;
    }
  }

  // f(v) = [[a, -b], [b, a]] (v - p*) + q*
  return {
    x: a * dx - b * dy + ptx,
    y: b * dx + a * dy + pty,
  };
}

