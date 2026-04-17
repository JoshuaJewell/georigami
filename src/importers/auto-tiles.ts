import { lonToTileX, latToTileY, TILE_SIZE, type Bounds } from '../projection/lat-lon';

/**
 * Descriptor for an XYZ tile source. All sources here are keyless; commercial
 * deployments using OSM/CARTO must respect the providers' attribution and
 * tile-usage policies.
 *
 * `urlTemplate` placeholders: `{z}`, `{x}`, `{y}`, optionally `{s}` for a
 * subdomain rotated from `subdomains`. `yBeforeX` swaps to Esri's
 * `tile/{z}/{y}/{x}` ordering.
 */
export type TileSource = {
  id: string;
  label: string;
  urlTemplate: string;
  attribution: string;
  maxZoom: number;
  yBeforeX?: boolean;
  subdomains?: string[];
};

export const TILE_SOURCES: TileSource[] = [
  {
    id: 'esri-imagery',
    label: 'Satellite (Esri)',
    urlTemplate:
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri',
    maxZoom: 19,
    yBeforeX: true,
  },
  {
    id: 'osm-standard',
    label: 'Street (OSM)',
    urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  },
  {
    id: 'carto-positron',
    label: 'Light (CARTO Positron)',
    urlTemplate: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors, © CARTO',
    maxZoom: 19,
    subdomains: ['a', 'b', 'c'],
  },
  {
    id: 'carto-dark',
    label: 'Dark (CARTO Dark Matter)',
    urlTemplate: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors, © CARTO',
    maxZoom: 19,
    subdomains: ['a', 'b', 'c'],
  },
  {
    id: 'opentopomap',
    label: 'Terrain (OpenTopoMap)',
    urlTemplate: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)',
    maxZoom: 17,
    subdomains: ['a', 'b', 'c'],
  },
];

export const DEFAULT_TILE_SOURCE_ID = 'esri-imagery';

export function getTileSource(id: string): TileSource {
  const found = TILE_SOURCES.find((s) => s.id === id);
  if (found) return found;
  const fallback = TILE_SOURCES.find((s) => s.id === DEFAULT_TILE_SOURCE_ID);
  if (fallback) return fallback;
  // TILE_SOURCES is a non-empty literal, so this branch is unreachable in practice.
  return TILE_SOURCES[0] as TileSource;
}

function buildTileUrl(source: TileSource, z: number, x: number, y: number): string {
  const path = source.yBeforeX
    ? source.urlTemplate.replace('{z}', String(z)).replace('{y}', String(y)).replace('{x}', String(x))
    : source.urlTemplate.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
  const subs = source.subdomains;
  if (subs && subs.length > 0) {
    const sub = subs[(x + y) % subs.length] ?? subs[0]!;
    return path.replace('{s}', sub);
  }
  return path;
}

/**
 * Load a single tile via an Image element with `crossorigin=anonymous`.
 * More resilient than `fetch()` against tracker-blocking heuristics in some
 * browsers; canvas is not tainted as long as the server returns CORS headers.
 */
function loadTileImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load tile: ${url}`));
    img.src = url;
  });
}

export type FetchedTiles = {
  blob: Blob;
  width: number;
  height: number;
  zoom: number;
  /** Top-left tile of the stitched image (integer tile coords at `zoom`). */
  originTileX: number;
  originTileY: number;
  source: TileSource;
};

/**
 * Pick a zoom level so the bbox occupies roughly `targetPixelWidth` pixels in
 * the stitched image. Clamped to the source's served range.
 */
export function pickZoom(bounds: Bounds, source: TileSource, targetPixelWidth = 3000): number {
  const lonWidth = bounds.lonMax - bounds.lonMin;
  if (lonWidth <= 0) return Math.min(12, source.maxZoom);
  const idealZoom = Math.log2((targetPixelWidth * 360) / (TILE_SIZE * lonWidth));
  return Math.max(1, Math.min(source.maxZoom, Math.round(idealZoom)));
}

/**
 * Fetch and stitch tiles covering the given bounding box. Returns the stitched
 * image as a JPEG Blob plus the metadata needed to project lat/lon coordinates
 * onto its pixel grid.
 *
 * Tiles are fetched in parallel; the browser will queue at ~6 concurrent
 * connections to a single origin, so 100+ tiles is fine in practice.
 * Sources with `subdomains` get higher effective parallelism.
 */
export async function fetchTilesForBounds(
  bounds: Bounds,
  source: TileSource,
  options: {
    zoom?: number;
    onProgress?: (loaded: number, total: number) => void;
  } = {},
): Promise<FetchedTiles> {
  const zoom = options.zoom ?? pickZoom(bounds, source);

  const xMin = Math.floor(lonToTileX(bounds.lonMin, zoom));
  const xMax = Math.ceil(lonToTileX(bounds.lonMax, zoom));
  const yMin = Math.floor(latToTileY(bounds.latMax, zoom));
  const yMax = Math.ceil(latToTileY(bounds.latMin, zoom));

  const numTilesX = Math.max(1, xMax - xMin);
  const numTilesY = Math.max(1, yMax - yMin);
  const total = numTilesX * numTilesY;

  const canvas = new OffscreenCanvas(numTilesX * TILE_SIZE, numTilesY * TILE_SIZE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create OffscreenCanvas 2D context');

  let loaded = 0;
  const tasks: Promise<void>[] = [];

  for (let ty = yMin; ty < yMin + numTilesY; ty++) {
    for (let tx = xMin; tx < xMin + numTilesX; tx++) {
      const url = buildTileUrl(source, zoom, tx, ty);
      const dx = (tx - xMin) * TILE_SIZE;
      const dy = (ty - yMin) * TILE_SIZE;
      tasks.push(
        loadTileImage(url).then((img) => {
          ctx.drawImage(img, dx, dy);
          loaded += 1;
          options.onProgress?.(loaded, total);
        }),
      );
    }
  }

  await Promise.all(tasks);

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  return {
    blob,
    width: canvas.width,
    height: canvas.height,
    zoom,
    originTileX: xMin,
    originTileY: yMin,
    source,
  };
}
