import { lonToTileX, latToTileY, TILE_SIZE, type Bounds } from '../projection/lat-lon';

/**
 * Esri World Imagery — free, no-auth XYZ tile service.
 * NB: Esri's URL template is /tile/{z}/{y}/{x} (y before x), unlike most others.
 * Personal/dev use is fine; commercial/published deployments need a Mapbox or
 * Esri AGOL account.
 */
const TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

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

export type FetchedSatellite = {
  blob: Blob;
  width: number;
  height: number;
  zoom: number;
  /** Top-left tile of the stitched image (integer tile coords at `zoom`). */
  originTileX: number;
  originTileY: number;
};

/**
 * Pick a zoom level so the bbox occupies roughly `targetPixelWidth` pixels in
 * the stitched image. Clamped to Esri's served range [1, 19].
 */
export function pickZoom(bounds: Bounds, targetPixelWidth = 3000): number {
  const lonWidth = bounds.lonMax - bounds.lonMin;
  if (lonWidth <= 0) return 12;
  const idealZoom = Math.log2((targetPixelWidth * 360) / (TILE_SIZE * lonWidth));
  return Math.max(1, Math.min(19, Math.round(idealZoom)));
}

/**
 * Fetch and stitch satellite tiles covering the given bounding box. Returns the
 * stitched image as a JPEG Blob plus the metadata needed to project lat/lon
 * coordinates onto its pixel grid.
 *
 * Tiles are fetched in parallel; the browser will queue at ~6 concurrent
 * connections to a single origin, so 100+ tiles is fine in practice.
 */
export async function fetchSatelliteForBounds(
  bounds: Bounds,
  options: {
    zoom?: number;
    onProgress?: (loaded: number, total: number) => void;
  } = {},
): Promise<FetchedSatellite> {
  const zoom = options.zoom ?? pickZoom(bounds);

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
      const url = TILE_URL.replace('{z}', String(zoom))
        .replace('{x}', String(tx))
        .replace('{y}', String(ty));
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
  };
}
