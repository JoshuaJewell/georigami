import { describe, it, expect } from 'vitest';
import { parseGeoJSON } from './geojson';

const FC = (features: any[]) => JSON.stringify({ type: 'FeatureCollection', features });

describe('parseGeoJSON', () => {
  it('extracts Point features with name properties and projects to pixels', () => {
    const json = FC([
      { type: 'Feature', geometry: { type: 'Point', coordinates: [2.30, 48.85] }, properties: { name: 'A' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [2.40, 48.90] }, properties: { name: 'B' } },
    ]);
    const r = parseGeoJSON(json, 1000, 1000);
    expect(r.points).toHaveLength(2);
    // bbox is [2.30..2.40, 48.85..48.90]; A is at (lon=2.30, lat=48.85) → (x=0, y=1000)
    expect(r.points[0]!).toMatchObject({ label: 'A', x: 0, y: 1000 });
    expect(r.points[1]!).toMatchObject({ label: 'B', x: 1000, y: 0 });
  });

  it('falls back to NAME / Name / FULL_NAME / station_name / label when name is absent', () => {
    const json = FC([
      { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { NAME: "St. Paul's" } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 0] }, properties: { Name: 'Mile End' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 1] }, properties: { FULL_NAME: 'Bank station' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 1] }, properties: { station_name: 'Embankment' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [0.5, 0.5] }, properties: { label: 'Aldgate' } },
    ]);
    const r = parseGeoJSON(json, 100, 100);
    expect(r.points.map((p) => p.label)).toEqual([
      "St. Paul's", 'Mile End', 'Bank station', 'Embankment', 'Aldgate',
    ]);
    expect(r.warnings).toEqual([]);
  });

  it('prefers `name` over `NAME` when both exist', () => {
    const json = FC([
      { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: { name: 'lower', NAME: 'UPPER' } },
    ]);
    const r = parseGeoJSON(json, 100, 100);
    expect(r.points[0]!.label).toBe('lower');
  });

  it('warns on missing name; assigns a placeholder label', () => {
    const json = FC([
      { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} },
    ]);
    const r = parseGeoJSON(json, 100, 100);
    expect(r.points).toHaveLength(1);
    expect(r.points[0]!.label).toMatch(/^\?-\d+$/);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('skips non-Point features', () => {
    const json = FC([
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: { name: 'L' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [0.5, 0.5] }, properties: { name: 'P' } },
    ]);
    const r = parseGeoJSON(json, 100, 100);
    expect(r.points).toHaveLength(1);
    expect(r.points[0]!.label).toBe('P');
  });

  it('throws on malformed JSON', () => {
    expect(() => parseGeoJSON('{not json}', 100, 100)).toThrow();
  });

  it('throws on a non-FeatureCollection root', () => {
    expect(() => parseGeoJSON(JSON.stringify({ type: 'Feature' }), 100, 100)).toThrow(/FeatureCollection/);
  });

  it('returns empty (not throws) for FeatureCollection with no Point features', () => {
    const r = parseGeoJSON(FC([]), 100, 100);
    expect(r.points).toEqual([]);
  });
});
