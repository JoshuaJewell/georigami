export type LatLon = { lat: number; lon: number };
export type Bounds = { latMin: number; latMax: number; lonMin: number; lonMax: number };

export function autoFitBounds(points: LatLon[]): Bounds | null {
  if (points.length === 0) return null;
  let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity;
  for (const p of points) {
    if (p.lat < latMin) latMin = p.lat;
    if (p.lat > latMax) latMax = p.lat;
    if (p.lon < lonMin) lonMin = p.lon;
    if (p.lon > lonMax) lonMax = p.lon;
  }
  return { latMin, latMax, lonMin, lonMax };
}

export function latLonToPixel(
  lat: number,
  lon: number,
  bounds: Bounds,
  imageWidth: number,
  imageHeight: number,
): { x: number; y: number } {
  const x = ((lon - bounds.lonMin) / (bounds.lonMax - bounds.lonMin)) * imageWidth;
  const y = ((bounds.latMax - lat) / (bounds.latMax - bounds.latMin)) * imageHeight;
  return { x, y };
}

/**
 * A 2D similarity transform: uniform scale + rotation + translation.
 *   x' = a·lon − b·lat + dx
 *   y' = b·lon + a·lat + dy
 * Four parameters; two anchor pairs are exactly determined.
 */
export type Similarity = { a: number; b: number; dx: number; dy: number };

export type Anchor = { lon: number; lat: number; x: number; y: number };

/**
 * Solve a similarity transform from two anchors. Returns null if the anchors
 * are coincident in lat/lon space (the transform would be underdetermined).
 */
export function solveSimilarity(p1: Anchor, p2: Anchor): Similarity | null {
  const du = p1.lon - p2.lon;
  const dv = p1.lat - p2.lat;
  const det = du * du + dv * dv;
  if (det < 1e-18) return null;
  const dxPx = p1.x - p2.x;
  const dyPx = p1.y - p2.y;
  const a = (dxPx * du + dyPx * dv) / det;
  const b = (dyPx * du - dxPx * dv) / det;
  const dx = p1.x - a * p1.lon + b * p1.lat;
  const dy = p1.y - b * p1.lon - a * p1.lat;
  return { a, b, dx, dy };
}

export function applySimilarity(s: Similarity, lon: number, lat: number): { x: number; y: number } {
  return {
    x: s.a * lon - s.b * lat + s.dx,
    y: s.b * lon + s.a * lat + s.dy,
  };
}

/**
 * Web Mercator tile-coordinate helpers for slippy-map (XYZ) tile schemes.
 * Tiles are 256×256 px. At zoom z, the world is `2^z × 2^z` tiles, or
 * `256 · 2^z` pixels per side.
 */
export const TILE_SIZE = 256;

export function lonToTileX(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * Math.pow(2, zoom);
}

export function latToTileY(lat: number, zoom: number): number {
  const latRad = (lat * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
    Math.pow(2, zoom)
  );
}

/**
 * Project a lat/lon onto a stitched Web-Mercator-tiled image whose top-left
 * corresponds to integer tile (originTileX, originTileY) at the given zoom.
 * Returns pixel coordinates in the stitched image (y grows downward).
 */
export function latLonToWebMercatorPixel(
  lat: number,
  lon: number,
  zoom: number,
  originTileX: number,
  originTileY: number,
): { x: number; y: number } {
  return {
    x: (lonToTileX(lon, zoom) - originTileX) * TILE_SIZE,
    y: (latToTileY(lat, zoom) - originTileY) * TILE_SIZE,
  };
}
