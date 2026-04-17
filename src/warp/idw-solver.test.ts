import { describe, it, expect } from 'vitest';
import { applyIDW, type IDWPair } from './idw-solver';

const pair = (sx: number, sy: number, tx: number, ty: number): IDWPair => ({
  source: { x: sx, y: sy },
  target: { x: tx, y: ty },
});

describe('applyIDW', () => {
  it('hits each control point exactly', () => {
    const pairs = [
      pair(0, 0, 100, 100),
      pair(10, 0, 200, 110),
      pair(0, 10, 110, 200),
      pair(10, 10, 220, 230),
    ];
    for (const p of pairs) {
      const out = applyIDW(pairs, p.source.x, p.source.y);
      expect(out.x).toBeCloseTo(p.target.x, 6);
      expect(out.y).toBeCloseTo(p.target.y, 6);
    }
  });

  it('produces an identity warp when source == target', () => {
    const pairs = [
      pair(0, 0, 0, 0),
      pair(10, 0, 10, 0),
      pair(0, 10, 0, 10),
      pair(10, 10, 10, 10),
    ];
    expect(applyIDW(pairs, 5, 5).x).toBeCloseTo(5, 6);
    expect(applyIDW(pairs, 5, 5).y).toBeCloseTo(5, 6);
  });

  it('applies a uniform translation when all pairs share one displacement', () => {
    const pairs = [
      pair(0, 0, 10, 5),
      pair(10, 0, 20, 5),
      pair(0, 10, 10, 15),
      pair(10, 10, 20, 15),
    ];
    const out = applyIDW(pairs, 5, 5);
    expect(out.x).toBeCloseTo(15, 4);
    expect(out.y).toBeCloseTo(10, 4);
  });

  it('returns the input when given an empty pairs array', () => {
    expect(applyIDW([], 7, 9)).toEqual({ x: 7, y: 9 });
  });
});
