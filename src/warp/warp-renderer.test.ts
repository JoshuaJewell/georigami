import { describe, it, expect } from 'vitest';
import { renderWarp } from './warp-renderer';
import { solveTPS, applyTPS, type TPSCoefficients } from './tps-solver';
import type { Pair } from '../types/project';
import golden from '../../tests/fixtures/checkerboard-warp-golden.json';

/** Wrap a TPS coef set in the evaluator interface used by `renderWarp`. */
const tpsEval = (coefs: TPSCoefficients) => (x: number, y: number) => applyTPS(coefs, x, y);

function makeCheckerboard(w: number, h: number, cell: number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const on = ((Math.floor(x / cell) + Math.floor(y / cell)) % 2) === 0;
      const v = on ? 255 : 0;
      const idx = (y * w + x) * 4;
      data[idx] = data[idx + 1] = data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }
  return new ImageData(data, w, h);
}

describe('renderWarp', () => {
  it('returns the source unchanged when warpStrength = 0', () => {
    const src = makeCheckerboard(32, 32, 8);
    const pairs: Pair[] = [
      { label: 'a', schematic: { x: 0, y: 0 }, geographic: { x: 0, y: 0 } },
      { label: 'b', schematic: { x: 31, y: 0 }, geographic: { x: 31, y: 0 } },
      { label: 'c', schematic: { x: 0, y: 31 }, geographic: { x: 0, y: 31 } },
      { label: 'd', schematic: { x: 31, y: 31 }, geographic: { x: 31, y: 31 } },
    ];
    const coefs = solveTPS(pairs)!;
    const out = renderWarp(src, 32, 32, tpsEval(coefs), 0, 32, 32);
    expect(out.data.length).toBe(src.data.length);
    for (let i = 0; i < src.data.length; i++) {
      expect(Math.abs(out.data[i]! - src.data[i]!)).toBeLessThanOrEqual(1);
    }
  });

  it('matches the golden fixture for a known 9-point grid warp on a chequerboard', () => {
    const src = makeCheckerboard(32, 32, 8);
    const pts = [0, 16, 31];
    const pairs: Pair[] = [];
    for (const sy of pts) for (const sx of pts) {
      const cx = 16, cy = 16;
      const tx = sx + (cx - sx) * 0.3;
      const ty = sy + (cy - sy) * 0.3;
      pairs.push({ label: `${sx}-${sy}`, schematic: { x: sx, y: sy }, geographic: { x: tx, y: ty } });
    }
    const coefs = solveTPS(pairs)!;
    const out = renderWarp(src, 32, 32, tpsEval(coefs), 1, 32, 32);

    const goldenArr = new Uint8ClampedArray(golden.data as number[]);
    expect(out.data.length).toBe(goldenArr.length);
    let diffs = 0;
    for (let i = 0; i < goldenArr.length; i++) {
      if (Math.abs(out.data[i]! - goldenArr[i]!) > 2) diffs++;
    }
    expect(diffs).toBeLessThan(out.data.length * 0.001);
  });

  it('reports progress via the optional callback', () => {
    const src = makeCheckerboard(16, 16, 4);
    const pairs: Pair[] = [
      { label: 'a', schematic: { x: 0, y: 0 }, geographic: { x: 0, y: 0 } },
      { label: 'b', schematic: { x: 15, y: 0 }, geographic: { x: 15, y: 0 } },
      { label: 'c', schematic: { x: 0, y: 15 }, geographic: { x: 0, y: 15 } },
    ];
    const coefs = solveTPS(pairs)!;
    const fractions: number[] = [];
    renderWarp(src, 16, 16, tpsEval(coefs), 1, 16, 16, (f) => fractions.push(f));
    expect(fractions[fractions.length - 1]!).toBeCloseTo(1);
    expect(fractions.length).toBeGreaterThan(1);
  });

  it('fills the full output canvas when schematic and source dimensions differ (regression)', () => {
    // The pre-fix renderer used source.width as the schematic-frame scale,
    // which caused output pixels beyond `outWidth * schemW / sourceW` to
    // extrapolate the warp out of the source image (returning black).
    // After the fix, every output pixel maps to a meaningful schematic coord.
    const src = makeCheckerboard(64, 64, 8); // bigger "geographic" image
    // Identity pairs at the corners of a smaller schematic frame (32×32):
    const pairs: Pair[] = [
      { label: 'a', schematic: { x: 0, y: 0 }, geographic: { x: 0, y: 0 } },
      { label: 'b', schematic: { x: 31, y: 0 }, geographic: { x: 63, y: 0 } },
      { label: 'c', schematic: { x: 0, y: 31 }, geographic: { x: 0, y: 63 } },
      { label: 'd', schematic: { x: 31, y: 31 }, geographic: { x: 63, y: 63 } },
    ];
    const coefs = solveTPS(pairs)!;
    // Render into a 32×32 canvas while the schematic frame is also 32×32.
    const out = renderWarp(src, 32, 32, tpsEval(coefs), 1, 32, 32);
    // Every row should have at least some non-zero alpha (no all-black bands).
    // If the bug were present, the bottom-right ~half of rows would be black.
    let blackPixels = 0;
    for (let i = 3; i < out.data.length; i += 4) {
      if (out.data[i] === 0) blackPixels += 1;
    }
    expect(blackPixels).toBe(0);
  });
});
