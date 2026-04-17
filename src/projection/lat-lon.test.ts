import { describe, it, expect } from 'vitest';
import {
  autoFitBounds,
  latLonToPixel,
  solveSimilarity,
  applySimilarity,
  lonToTileX,
  latToTileY,
  latLonToWebMercatorPixel,
  TILE_SIZE,
} from './lat-lon';

describe('autoFitBounds', () => {
  it('returns the bounding box of the input points', () => {
    const b = autoFitBounds([
      { lat: 48.85, lon: 2.30 },
      { lat: 48.90, lon: 2.40 },
      { lat: 48.86, lon: 2.35 },
    ]);
    expect(b).toEqual({ latMin: 48.85, latMax: 48.90, lonMin: 2.30, lonMax: 2.40 });
  });

  it('returns null for an empty input', () => {
    expect(autoFitBounds([])).toBeNull();
  });
});

describe('latLonToPixel', () => {
  const bounds = { latMin: 0, latMax: 1, lonMin: 0, lonMax: 1 };

  it('maps the lon-axis linearly to x', () => {
    expect(latLonToPixel(0.5, 0.5, bounds, 100, 100).x).toBeCloseTo(50);
  });

  it('inverts the lat-axis (north-up images)', () => {
    // lat=1 (top of bbox) → y=0; lat=0 (bottom) → y=height
    expect(latLonToPixel(1, 0, bounds, 100, 100).y).toBeCloseTo(0);
    expect(latLonToPixel(0, 0, bounds, 100, 100).y).toBeCloseTo(100);
  });

  it('places corners correctly', () => {
    expect(latLonToPixel(1, 0, bounds, 100, 100)).toMatchObject({ x: 0, y: 0 });
    expect(latLonToPixel(0, 1, bounds, 100, 100)).toMatchObject({ x: 100, y: 100 });
  });
});

describe('solveSimilarity / applySimilarity', () => {
  it('exactly recovers the two anchors', () => {
    const a1 = { lon: -0.1, lat: 51.5, x: 200, y: 300 };
    const a2 = { lon: 0.05, lat: 51.6, x: 800, y: 100 };
    const t = solveSimilarity(a1, a2)!;
    expect(applySimilarity(t, a1.lon, a1.lat).x).toBeCloseTo(a1.x, 6);
    expect(applySimilarity(t, a1.lon, a1.lat).y).toBeCloseTo(a1.y, 6);
    expect(applySimilarity(t, a2.lon, a2.lat).x).toBeCloseTo(a2.x, 6);
    expect(applySimilarity(t, a2.lon, a2.lat).y).toBeCloseTo(a2.y, 6);
  });

  it('handles a north-up image with no rotation (b ≈ 0)', () => {
    // Two anchors aligned in lat: same y, different x. Implies pure lon→x scaling.
    const t = solveSimilarity(
      { lon: 0, lat: 0, x: 0, y: 0 },
      { lon: 1, lat: 0, x: 100, y: 0 },
    )!;
    expect(t.b).toBeCloseTo(0);
    // For some other lon at the same lat, x should be linearly interpolated.
    expect(applySimilarity(t, 0.5, 0).x).toBeCloseTo(50);
  });

  it('returns null when both anchors are at the same lat/lon', () => {
    expect(
      solveSimilarity(
        { lon: 0, lat: 0, x: 0, y: 0 },
        { lon: 0, lat: 0, x: 100, y: 100 },
      ),
    ).toBeNull();
  });
});

describe('Web Mercator tile helpers', () => {
  it('lon=0 sits halfway across the world (tileX = 2^z / 2)', () => {
    expect(lonToTileX(0, 0)).toBeCloseTo(0.5);
    expect(lonToTileX(0, 1)).toBeCloseTo(1);
    expect(lonToTileX(0, 12)).toBeCloseTo(2048);
  });

  it('lon=180 sits at the right edge (tileX = 2^z)', () => {
    expect(lonToTileX(180, 0)).toBeCloseTo(1);
    expect(lonToTileX(180, 12)).toBeCloseTo(4096);
  });

  it('lat=0 (equator) sits halfway down (tileY = 2^z / 2)', () => {
    expect(latToTileY(0, 0)).toBeCloseTo(0.5);
    expect(latToTileY(0, 12)).toBeCloseTo(2048);
  });

  it('higher latitudes have smaller tileY (north is up)', () => {
    expect(latToTileY(60, 12)).toBeLessThan(latToTileY(0, 12));
    expect(latToTileY(-60, 12)).toBeGreaterThan(latToTileY(0, 12));
  });

  it('latLonToWebMercatorPixel returns 0 when lat/lon == origin tile corner', () => {
    // Pick lat/lon that lands exactly on tile (2048, 1361) at zoom 12.
    // We construct it from the tile coords back to lat/lon.
    const z = 12;
    const tx = 2048, ty = 1361;
    // Inverse functions:
    const lon = (tx / Math.pow(2, z)) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * ty) / Math.pow(2, z);
    const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    const r = latLonToWebMercatorPixel(lat, lon, z, tx, ty);
    expect(r.x).toBeCloseTo(0, 5);
    expect(r.y).toBeCloseTo(0, 5);
  });

  it('latLonToWebMercatorPixel returns TILE_SIZE for a one-tile offset', () => {
    const z = 12;
    const tx = 2048, ty = 1361;
    // Lat/lon that lands exactly at tile (2049, 1362) — one tile right and down.
    const lon = ((tx + 1) / Math.pow(2, z)) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * (ty + 1)) / Math.pow(2, z);
    const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    const r = latLonToWebMercatorPixel(lat, lon, z, tx, ty);
    expect(r.x).toBeCloseTo(TILE_SIZE, 4);
    expect(r.y).toBeCloseTo(TILE_SIZE, 4);
  });
});
