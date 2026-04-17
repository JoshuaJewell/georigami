import { describe, it, expect } from 'vitest';
import { applyMLS, type MLSPair } from './mls-solver';

const applyMLSRigid = (pairs: MLSPair[], vx: number, vy: number) => applyMLS(pairs, vx, vy, 'rigid');

const pair = (sx: number, sy: number, tx: number, ty: number): MLSPair => ({
  source: { x: sx, y: sy },
  target: { x: tx, y: ty },
});

describe('applyMLSRigid', () => {
  it('hits each control point exactly', () => {
    const pairs = [
      pair(0, 0, 100, 100),
      pair(10, 0, 200, 110),
      pair(0, 10, 110, 200),
      pair(10, 10, 220, 230),
    ];
    for (const p of pairs) {
      const out = applyMLSRigid(pairs, p.source.x, p.source.y);
      expect(out.x).toBeCloseTo(p.target.x, 6);
      expect(out.y).toBeCloseTo(p.target.y, 6);
    }
  });

  it('produces an identity warp when source and target positions match', () => {
    const pairs = [
      pair(0, 0, 0, 0),
      pair(10, 0, 10, 0),
      pair(0, 10, 0, 10),
      pair(10, 10, 10, 10),
    ];
    expect(applyMLSRigid(pairs, 5, 5).x).toBeCloseTo(5, 6);
    expect(applyMLSRigid(pairs, 5, 5).y).toBeCloseTo(5, 6);
    expect(applyMLSRigid(pairs, 7, 3).x).toBeCloseTo(7, 6);
    expect(applyMLSRigid(pairs, 7, 3).y).toBeCloseTo(3, 6);
  });

  it('produces a pure translation when all targets are shifted by the same vector', () => {
    const pairs = [
      pair(0, 0, 100, 50),
      pair(10, 0, 110, 50),
      pair(0, 10, 100, 60),
      pair(10, 10, 110, 60),
    ];
    const out = applyMLSRigid(pairs, 5, 5);
    expect(out.x).toBeCloseTo(105, 4);
    expect(out.y).toBeCloseTo(55, 4);
  });

  it('produces a 90° rotation when targets are the source rotated 90° CCW', () => {
    // Source square (0,0)-(10,10) → target square rotated 90° CCW around centre.
    // Rotation around (5,5): (x,y) → (5 - (y-5), 5 + (x-5)) = (10-y, x)
    // Sources: (0,0) (10,0) (0,10) (10,10)
    // Targets: (10,0) (10,10) (0,0) (0,10)
    const pairs = [
      pair(0, 0, 10, 0),
      pair(10, 0, 10, 10),
      pair(0, 10, 0, 0),
      pair(10, 10, 0, 10),
    ];
    // Centre of square at source is (5,5). It should map to (5,5) (the rotation centre).
    const centre = applyMLSRigid(pairs, 5, 5);
    expect(centre.x).toBeCloseTo(5, 4);
    expect(centre.y).toBeCloseTo(5, 4);
    // A point off-centre (e.g. (5, 0)) should map to (10, 5) under 90° CCW around (5,5).
    const offcentre = applyMLSRigid(pairs, 5, 0);
    expect(offcentre.x).toBeCloseTo(10, 4);
    expect(offcentre.y).toBeCloseTo(5, 4);
  });

  it('returns the input point when given an empty pairs array', () => {
    expect(applyMLSRigid([], 42, 17)).toEqual({ x: 42, y: 17 });
  });
});

describe('applyMLS — similarity and affine variants', () => {
  // Pairs that need a uniform 2× scale to fit perfectly. Rigid can't do this
  // (it'll find a least-squares-best rotation, off the targets). Similarity
  // and affine should hit them exactly.
  const scaledPairs: MLSPair[] = [
    pair(0, 0, 0, 0),
    pair(10, 0, 20, 0),
    pair(0, 10, 0, 20),
    pair(10, 10, 20, 20),
  ];

  it('similarity hits control points exactly under uniform scale', () => {
    for (const p of scaledPairs) {
      const out = applyMLS(scaledPairs, p.source.x, p.source.y, 'similarity');
      expect(out.x).toBeCloseTo(p.target.x, 4);
      expect(out.y).toBeCloseTo(p.target.y, 4);
    }
  });

  it('similarity correctly applies uniform 2× scale at the centre', () => {
    // Centre of source square = (5, 5). Targets are 2× scaled around (10, 10)
    // (the centre of the target square), so the source centre maps to the
    // target centre, which is (10, 10).
    const out = applyMLS(scaledPairs, 5, 5, 'similarity');
    expect(out.x).toBeCloseTo(10, 3);
    expect(out.y).toBeCloseTo(10, 3);
  });

  it('affine hits control points exactly under arbitrary linear transform', () => {
    // Source square → parallelogram (shear). Affine should fit; rigid/similarity
    // cannot. Targets: shear by 0.5 in x, then scale.
    const shearedPairs: MLSPair[] = [
      pair(0, 0, 0, 0),
      pair(10, 0, 10, 0),
      pair(0, 10, 5, 10),
      pair(10, 10, 15, 10),
    ];
    for (const p of shearedPairs) {
      const out = applyMLS(shearedPairs, p.source.x, p.source.y, 'affine');
      expect(out.x).toBeCloseTo(p.target.x, 4);
      expect(out.y).toBeCloseTo(p.target.y, 4);
    }
  });

  it('all three variants agree on a pure translation', () => {
    const translatedPairs: MLSPair[] = [
      pair(0, 0, 100, 50),
      pair(10, 0, 110, 50),
      pair(0, 10, 100, 60),
      pair(10, 10, 110, 60),
    ];
    const r = applyMLS(translatedPairs, 5, 5, 'rigid');
    const s = applyMLS(translatedPairs, 5, 5, 'similarity');
    const a = applyMLS(translatedPairs, 5, 5, 'affine');
    expect(r.x).toBeCloseTo(105, 4);
    expect(s.x).toBeCloseTo(105, 4);
    expect(a.x).toBeCloseTo(105, 4);
    expect(r.y).toBeCloseTo(55, 4);
    expect(s.y).toBeCloseTo(55, 4);
    expect(a.y).toBeCloseTo(55, 4);
  });
});
