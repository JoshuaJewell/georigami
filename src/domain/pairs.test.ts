import { describe, it, expect } from 'vitest';
import { derivePairs, normalizeLabel } from './pairs';
import { createInitialProject, addPoint } from '../state/project';

describe('normalizeLabel', () => {
  it('lowercases and trims whitespace', () => {
    expect(normalizeLabel('  Châtelet  ')).toBe('châtelet');
  });
  it('preserves diacritics', () => {
    expect(normalizeLabel('Châtelet')).not.toBe(normalizeLabel('Chatelet'));
  });
  it('returns empty for empty input', () => {
    expect(normalizeLabel('   ')).toBe('');
  });
});

describe('derivePairs', () => {
  it('matches points by normalised label', () => {
    let p = createInitialProject('t');
    p = addPoint(p, 'schematic', { label: 'Châtelet', x: 10, y: 20 });
    p = addPoint(p, 'geographic', { label: '  châtelet ', x: 100, y: 200 });
    const r = derivePairs(p);
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0]).toMatchObject({
      label: 'Châtelet',
      schematic: { x: 10, y: 20 },
      geographic: { x: 100, y: 200 },
    });
    expect(r.schematicOrphans).toHaveLength(0);
    expect(r.geographicOrphans).toHaveLength(0);
  });

  it('reports orphans on each side', () => {
    let p = createInitialProject('t');
    p = addPoint(p, 'schematic', { label: 'A', x: 0, y: 0 });
    p = addPoint(p, 'schematic', { label: 'B', x: 0, y: 0 });
    p = addPoint(p, 'geographic', { label: 'B', x: 0, y: 0 });
    p = addPoint(p, 'geographic', { label: 'C', x: 0, y: 0 });
    const r = derivePairs(p);
    expect(r.pairs.map((x) => x.label)).toEqual(['B']);
    expect(r.schematicOrphans.map((x) => x.label)).toEqual(['A']);
    expect(r.geographicOrphans.map((x) => x.label)).toEqual(['C']);
  });

  it('skips empty labels (treated as unmatched on both sides)', () => {
    let p = createInitialProject('t');
    p = addPoint(p, 'schematic', { label: '', x: 0, y: 0 });
    p = addPoint(p, 'geographic', { label: '', x: 0, y: 0 });
    const r = derivePairs(p);
    expect(r.pairs).toHaveLength(0);
    expect(r.schematicOrphans).toHaveLength(1);
    expect(r.geographicOrphans).toHaveLength(1);
  });

  it('on duplicate labels within a side, pairs the first and orphans the rest', () => {
    let p = createInitialProject('t');
    p = addPoint(p, 'schematic', { label: 'X', x: 1, y: 1 });
    p = addPoint(p, 'schematic', { label: 'X', x: 2, y: 2 });
    p = addPoint(p, 'geographic', { label: 'X', x: 10, y: 10 });
    const r = derivePairs(p);
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0]!.schematic).toEqual({ x: 1, y: 1 });
    expect(r.schematicOrphans).toHaveLength(1);
    expect(r.schematicOrphans[0]!).toMatchObject({ x: 2, y: 2 });
  });

  it('filters out pairs whose schematic point is outside the schematic crop', () => {
    let p = createInitialProject('t');
    p = addPoint(p, 'schematic', { label: 'inside', x: 50, y: 50 });
    p = addPoint(p, 'schematic', { label: 'outside', x: 500, y: 500 });
    p = addPoint(p, 'geographic', { label: 'inside', x: 100, y: 100 });
    p = addPoint(p, 'geographic', { label: 'outside', x: 200, y: 200 });
    p = { ...p, schematic: { ...p.schematic, crop: { x: 0, y: 0, w: 100, h: 100 } } };
    const r = derivePairs(p);
    expect(r.pairs.map((x) => x.label)).toEqual(['inside']);
  });

  it('filters out pairs whose geographic point is outside the geographic crop', () => {
    let p = createInitialProject('t');
    p = addPoint(p, 'schematic', { label: 'a', x: 0, y: 0 });
    p = addPoint(p, 'geographic', { label: 'a', x: 999, y: 999 });
    p = { ...p, geographic: { ...p.geographic, crop: { x: 0, y: 0, w: 100, h: 100 } } };
    expect(derivePairs(p).pairs).toHaveLength(0);
  });

  it('keeps pairs only when both points are inside their respective crops', () => {
    let p = createInitialProject('t');
    p = addPoint(p, 'schematic', { label: 'both', x: 50, y: 50 });
    p = addPoint(p, 'schematic', { label: 'sch-only', x: 50, y: 50 });
    p = addPoint(p, 'schematic', { label: 'geo-only', x: 999, y: 999 });
    p = addPoint(p, 'geographic', { label: 'both', x: 50, y: 50 });
    p = addPoint(p, 'geographic', { label: 'sch-only', x: 999, y: 999 });
    p = addPoint(p, 'geographic', { label: 'geo-only', x: 50, y: 50 });
    p = { ...p, schematic: { ...p.schematic, crop: { x: 0, y: 0, w: 100, h: 100 } } };
    p = { ...p, geographic: { ...p.geographic, crop: { x: 0, y: 0, w: 100, h: 100 } } };
    const r = derivePairs(p);
    expect(r.pairs.map((x) => x.label)).toEqual(['both']);
  });
});
