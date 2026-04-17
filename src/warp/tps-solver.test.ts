import { describe, it, expect } from 'vitest';
import { solveTPS, applyTPS } from './tps-solver';
import type { Pair } from '../types/project';

const pair = (label: string, sx: number, sy: number, gx: number, gy: number): Pair => ({
  label,
  schematic: { x: sx, y: sy },
  geographic: { x: gx, y: gy },
});

describe('solveTPS', () => {
  it('returns null for fewer than 3 pairs', () => {
    expect(solveTPS([pair('a', 0, 0, 0, 0), pair('b', 1, 0, 1, 0)])).toBeNull();
  });

  it('returns null for collinear pairs', () => {
    const pairs = [
      pair('a', 0, 0, 0, 0),
      pair('b', 1, 0, 1, 0),
      pair('c', 2, 0, 2, 0),
    ];
    expect(solveTPS(pairs)).toBeNull();
  });

  it('produces an identity warp when schematic and geographic positions match', () => {
    const pairs = [
      pair('a', 0, 0, 0, 0),
      pair('b', 10, 0, 10, 0),
      pair('c', 0, 10, 0, 10),
      pair('d', 10, 10, 10, 10),
    ];
    const coefs = solveTPS(pairs);
    expect(coefs).not.toBeNull();
    expect(applyTPS(coefs!, 5, 5)).toMatchObject({ x: 5, y: 5 });
    expect(applyTPS(coefs!, 7, 3)).toMatchObject({ x: 7, y: 3 });
  });

  it('hits its control points exactly (interpolation property)', () => {
    const pairs = [
      pair('a', 0, 0, 100, 100),
      pair('b', 10, 0, 200, 110),
      pair('c', 0, 10, 110, 200),
      pair('d', 10, 10, 220, 230),
    ];
    const coefs = solveTPS(pairs)!;
    for (const p of pairs) {
      const out = applyTPS(coefs, p.schematic.x, p.schematic.y);
      expect(out.x).toBeCloseTo(p.geographic.x, 4);
      expect(out.y).toBeCloseTo(p.geographic.y, 4);
    }
  });
});
