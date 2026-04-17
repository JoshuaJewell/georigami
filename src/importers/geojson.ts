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

/**
 * Normalize any valid GeoJSON root (RFC 7946 §3) into a flat list of
 * pseudo-features whose geometry is a single `Point`. Accepts:
 * `FeatureCollection`, `Feature`, bare `Point`, bare `MultiPoint`, and
 * `GeometryCollection` (recursed). Non-point geometries are dropped.
 */
function normalizeToPointFeatures(root: any): { properties: unknown; lon: number; lat: number }[] {
  if (!root || typeof root !== 'object') return [];
  const out: { properties: unknown; lon: number; lat: number }[] = [];

  const pushPoint = (coords: unknown, properties: unknown) => {
    if (!Array.isArray(coords) || coords.length < 2) return;
    const [lon, lat] = coords;
    if (typeof lon !== 'number' || typeof lat !== 'number') return;
    out.push({ properties, lon, lat });
  };

  const visitGeometry = (geom: any, properties: unknown) => {
    if (!geom || typeof geom !== 'object') return;
    if (geom.type === 'Point') {
      pushPoint(geom.coordinates, properties);
    } else if (geom.type === 'MultiPoint' && Array.isArray(geom.coordinates)) {
      for (const c of geom.coordinates) pushPoint(c, properties);
    } else if (geom.type === 'GeometryCollection' && Array.isArray(geom.geometries)) {
      for (const g of geom.geometries) visitGeometry(g, properties);
    }
  };

  if (root.type === 'FeatureCollection' && Array.isArray(root.features)) {
    for (const feat of root.features) visitGeometry(feat?.geometry, feat?.properties);
  } else if (root.type === 'Feature') {
    visitGeometry(root.geometry, root.properties);
  } else {
    // Bare geometry root (Point, MultiPoint, GeometryCollection, etc.).
    visitGeometry(root, undefined);
  }
  return out;
}

export function parseGeoJSON(text: string, imageWidth: number, imageHeight: number): ParsedGeoJSON {
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`GeoJSON parse error: ${(e as Error).message}`);
  }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
    throw new Error('GeoJSON root must be an object with a `type` field');
  }

  const warnings: string[] = [];
  const raw: { lat: number; lon: number; label: string }[] = [];
  let unnamedCount = 0;

  for (const f of normalizeToPointFeatures(parsed)) {
    const name = pickName(f.properties);
    let label: string;
    if (name !== null) {
      label = name;
    } else {
      unnamedCount += 1;
      label = `?-${unnamedCount}`;
      warnings.push(`Feature without a recognised name property assigned label ${label}`);
    }
    raw.push({ lat: f.lat, lon: f.lon, label });
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
