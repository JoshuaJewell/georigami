import { autoFitBounds, latLonToPixel, type LatLon } from '../projection/lat-lon';

export type ParsedGeoJSON = {
  points: { label: string; x: number; y: number; lon: number; lat: number }[];
  warnings: string[];
};

// Common property keys for station/place names across data sources:
// `name`/`Name` (OSM, geojson.io), `NAME`/`FULL_NAME` (TfL, ESRI shapefiles),
// `station_name` (some transit datasets), `label` (Mapbox).
const NAME_KEYS = ['name', 'Name', 'NAME', 'FULL_NAME', 'station_name', 'label'];

function pickName(properties: unknown): string | null {
  if (!properties || typeof properties !== 'object') return null;
  const props = properties as Record<string, unknown>;
  for (const key of NAME_KEYS) {
    const v = props[key];
    if (typeof v === 'string' && v.trim().length > 0) return v;
  }
  return null;
}

export function parseGeoJSON(text: string, imageWidth: number, imageHeight: number): ParsedGeoJSON {
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`GeoJSON parse error: ${(e as Error).message}`);
  }
  if (!parsed || parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
    throw new Error('GeoJSON must be a FeatureCollection');
  }

  const warnings: string[] = [];
  const raw: { lat: number; lon: number; label: string }[] = [];
  let unnamedCount = 0;

  for (const feat of parsed.features) {
    const geom = feat?.geometry;
    if (!geom || geom.type !== 'Point') continue;
    const coords = geom.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const [lon, lat] = coords;
    if (typeof lon !== 'number' || typeof lat !== 'number') continue;
    const name = pickName(feat?.properties);
    let label: string;
    if (name !== null) {
      label = name;
    } else {
      unnamedCount += 1;
      label = `?-${unnamedCount}`;
      warnings.push(`Feature without a recognised name property assigned label ${label}`);
    }
    raw.push({ lat, lon, label });
  }

  const points: ParsedGeoJSON['points'] = [];
  if (raw.length === 0) return { points, warnings };

  const bounds = autoFitBounds(raw as LatLon[])!;
  for (const r of raw) {
    const { x, y } = latLonToPixel(r.lat, r.lon, bounds, imageWidth, imageHeight);
    points.push({ label: r.label, x, y, lon: r.lon, lat: r.lat });
  }
  return { points, warnings };
}
