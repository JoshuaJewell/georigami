import type { Pair } from '../types/project';
import { solveLinear } from './linear-algebra';

export type TPSCoefficients = {
  /** Source (schematic) control points. */
  cx: number[];
  cy: number[];
  /** Spline weights (one per control point) for x and y. */
  wx: number[];
  wy: number[];
  /** Affine terms: a0,a1,a2 such that f(x,y) = a0 + a1·x + a2·y + Σ wi·U(r). */
  ax: [number, number, number];
  ay: [number, number, number];
};

/** Radial basis function for TPS. U(0) = 0 (handled). */
function U(r2: number): number {
  if (r2 <= 0) return 0;
  return r2 * Math.log(r2);
}

export function solveTPS(pairs: Pair[]): TPSCoefficients | null {
  const N = pairs.length;
  if (N < 3) return null;

  const cx = pairs.map((p) => p.schematic.x);
  const cy = pairs.map((p) => p.schematic.y);
  const tx = pairs.map((p) => p.geographic.x);
  const ty = pairs.map((p) => p.geographic.y);

  // Build (N+3) x (N+3) matrix L:
  // [ K  P ]
  // [ P' 0 ]
  // K[i,j] = U(|p_i - p_j|^2);   P[i] = [1, x_i, y_i]
  const M = N + 3;
  const L: number[][] = Array.from({ length: M }, () => Array(M).fill(0));

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const dx = cx[i]! - cx[j]!;
      const dy = cy[i]! - cy[j]!;
      L[i]![j] = U(dx * dx + dy * dy);
    }
    L[i]![N] = 1;
    L[i]![N + 1] = cx[i]!;
    L[i]![N + 2] = cy[i]!;
    L[N]![i] = 1;
    L[N + 1]![i] = cx[i]!;
    L[N + 2]![i] = cy[i]!;
  }
  // bottom-right 3x3 already zero

  // Right-hand sides: target x and target y, padded with three zeros
  const bx = [...tx, 0, 0, 0];
  const by = [...ty, 0, 0, 0];

  const sx = solveLinear(L.map((r) => [...r]), bx);
  const sy = solveLinear(L.map((r) => [...r]), by);
  if (sx === null || sy === null) return null;

  return {
    cx,
    cy,
    wx: sx.slice(0, N),
    wy: sy.slice(0, N),
    ax: [sx[N]!, sx[N + 1]!, sx[N + 2]!],
    ay: [sy[N]!, sy[N + 1]!, sy[N + 2]!],
  };
}

export function applyTPS(coefs: TPSCoefficients, x: number, y: number): { x: number; y: number } {
  let outX = coefs.ax[0] + coefs.ax[1] * x + coefs.ax[2] * y;
  let outY = coefs.ay[0] + coefs.ay[1] * x + coefs.ay[2] * y;
  for (let i = 0; i < coefs.cx.length; i++) {
    const dx = x - coefs.cx[i]!;
    const dy = y - coefs.cy[i]!;
    const u = U(dx * dx + dy * dy);
    outX += coefs.wx[i]! * u;
    outY += coefs.wy[i]! * u;
  }
  return { x: outX, y: outY };
}
