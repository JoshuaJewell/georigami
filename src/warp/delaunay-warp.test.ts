import { describe, it, expect } from 'vitest';
import { buildDelaunayWarp, applyDelaunayWarp, type DelaunayPair } from './delaunay-warp';

const pair = (sx: number, sy: number, tx: number, ty: number): DelaunayPair => ({
  source: { x: sx, y: sy },
  target: { x: tx, y: ty },
});

describe('Delaunay warp', () => {
  it('hits each control point exactly', () => {
    const pairs = [
      pair(0, 0, 100, 100),
      pair(10, 0, 200, 110),
      pair(0, 10, 110, 200),
      pair(10, 10, 220, 230),
      pair(5, 5, 160, 165),
    ];
    const warp = buildDelaunayWarp(pairs);
    for (const p of pairs) {
      const out = applyDelaunayWarp(warp, p.source.x, p.source.y);
      expect(out.x).toBeCloseTo(p.target.x, 4);
      expect(out.y).toBeCloseTo(p.target.y, 4);
    }
  });

  it('produces an identity warp when source == target', () => {
    const pairs = [
      pair(0, 0, 0, 0),
      pair(10, 0, 10, 0),
      pair(0, 10, 0, 10),
      pair(10, 10, 10, 10),
    ];
    const warp = buildDelaunayWarp(pairs);
    expect(applyDelaunayWarp(warp, 5, 5).x).toBeCloseTo(5, 6);
    expect(applyDelaunayWarp(warp, 5, 5).y).toBeCloseTo(5, 6);
    expect(applyDelaunayWarp(warp, 7, 3).x).toBeCloseTo(7, 6);
  });

  it('linearly interpolates inside a triangle', () => {
    // Single triangle: source = (0,0), (10,0), (0,10). Targets shifted by 100.
    // The centroid (10/3, 10/3) should map to the target centroid (100+10/3, 100+10/3).
    const pairs = [
      pair(0, 0, 100, 100),
      pair(10, 0, 110, 100),
      pair(0, 10, 100, 110),
    ];
    const warp = buildDelaunayWarp(pairs);
    const out = applyDelaunayWarp(warp, 10 / 3, 10 / 3);
    expect(out.x).toBeCloseTo(100 + 10 / 3, 4);
    expect(out.y).toBeCloseTo(100 + 10 / 3, 4);
  });

  it('is continuous across a shared triangle edge', () => {
    // Two triangles sharing the edge from (5, 0) to (5, 10).
    // Sample two points near the shared edge from each side; outputs should
    // be almost identical (continuity).
    const pairs = [
      pair(0, 0, 0, 0),
      pair(5, 0, 50, 0),
      pair(5, 10, 50, 100),
      pair(0, 10, 0, 100),
      pair(10, 0, 200, 0),
      pair(10, 10, 200, 100),
    ];
    const warp = buildDelaunayWarp(pairs);
    // Just to the left of x=5 (in left-side triangles)
    const left = applyDelaunayWarp(warp, 4.999, 5);
    // Just to the right of x=5 (in right-side triangles)
    const right = applyDelaunayWarp(warp, 5.001, 5);
    expect(Math.abs(left.x - right.x)).toBeLessThan(0.5);
    expect(Math.abs(left.y - right.y)).toBeLessThan(0.5);
  });

  it('returns the input point when given fewer than 3 pairs', () => {
    const warp = buildDelaunayWarp([pair(0, 0, 100, 100)]);
    expect(applyDelaunayWarp(warp, 5, 5)).toEqual({ x: 5, y: 5 });
  });
});
