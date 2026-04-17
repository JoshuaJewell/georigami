import type { Project, Point, ImageSide } from '../types/project';
import {
  solveSimilarity,
  applySimilarity,
  autoFitBounds,
  latLonToPixel,
  type Anchor,
  type LatLon,
} from '../projection/lat-lon';

type Side = 'schematic' | 'geographic';

const emptySide = (): ImageSide => ({
  imageId: null,
  width: 0,
  height: 0,
  points: [],
});

export function createInitialProject(name: string): Project {
  const now = Date.now();
  return {
    schematic: emptySide(),
    geographic: emptySide(),
    settings: {
      warpStrength: 1,
      outputResolution: { w: 1024, h: 768 },
      outputFrame: 'schematic',
      warpMethod: 'tps',
    },
    meta: { name, createdAt: now, updatedAt: now },
  };
}

function uuid(): string {
  return crypto.randomUUID();
}

export function addPoint(
  project: Project,
  side: Side,
  point: Omit<Point, 'id'>,
): Project {
  const newPoint: Point = { ...point, id: uuid() };
  return {
    ...project,
    [side]: {
      ...project[side],
      points: [...project[side].points, newPoint],
    },
    meta: { ...project.meta, updatedAt: Date.now() },
  };
}

function updatePoint(
  project: Project,
  side: Side,
  id: string,
  patch: Partial<Point>,
): Project {
  const points = project[side].points;
  const idx = points.findIndex((p) => p.id === id);
  if (idx === -1) return project;
  const existing = points[idx];
  if (!existing) return project;
  const newPoints = [...points];
  newPoints[idx] = { ...existing, ...patch };
  return {
    ...project,
    [side]: { ...project[side], points: newPoints },
    meta: { ...project.meta, updatedAt: Date.now() },
  };
}

export function renamePoint(p: Project, side: Side, id: string, label: string): Project {
  return updatePoint(p, side, id, { label });
}

export function movePoint(p: Project, side: Side, id: string, x: number, y: number): Project {
  return updatePoint(p, side, id, { x, y, pinned: true });
}

export function deletePoint(project: Project, side: Side, id: string): Project {
  const points = project[side].points.filter((p) => p.id !== id);
  if (points.length === project[side].points.length) return project;
  return {
    ...project,
    [side]: { ...project[side], points },
    meta: { ...project.meta, updatedAt: Date.now() },
  };
}

export function setImage(
  project: Project,
  side: Side,
  imageId: string,
  width: number,
  height: number,
): Project {
  return {
    ...project,
    [side]: { ...project[side], imageId, width, height, crop: undefined },
    meta: { ...project.meta, updatedAt: Date.now() },
  };
}

export function setCrop(
  project: Project,
  side: Side,
  crop: { x: number; y: number; w: number; h: number },
): Project {
  return {
    ...project,
    [side]: { ...project[side], crop },
    meta: { ...project.meta, updatedAt: Date.now() },
  };
}

export function clearCrop(project: Project, side: Side): Project {
  if (project[side].crop === undefined) return project;
  const { crop: _crop, ...rest } = project[side];
  return {
    ...project,
    [side]: rest,
    meta: { ...project.meta, updatedAt: Date.now() },
  };
}

export type RecalibrateResult =
  | { ok: true; reprojected: number }
  | { ok: false; reason: string };

/**
 * Recalibrate lat/lon-bearing points on a side using user-corrected anchors.
 * Pinned points (those the user has dragged) are taken as ground truth; their
 * (lon, lat) → (x, y) pairs solve a similarity transform that re-projects all
 * unpinned points carrying lat/lon. Pinned points are not modified.
 *
 * Needs at least 2 pinned points with lat/lon. Uses the first 2 in encounter
 * order — extra anchors are ignored for now (a least-squares fit could use
 * them all if accuracy ever needs it).
 */
export function recalibrateFromAnchors(
  project: Project,
  side: Side,
): { project: Project; result: RecalibrateResult } {
  const points = project[side].points;
  const anchors: Anchor[] = [];
  for (const p of points) {
    if (p.pinned && p.lon !== undefined && p.lat !== undefined) {
      anchors.push({ lon: p.lon, lat: p.lat, x: p.x, y: p.y });
      if (anchors.length === 2) break;
    }
  }
  if (anchors.length < 2) {
    return {
      project,
      result: { ok: false, reason: `Need 2 anchors, found ${anchors.length}. Drag two GeoJSON-imported points to their correct positions.` },
    };
  }
  const transform = solveSimilarity(anchors[0]!, anchors[1]!);
  if (!transform) {
    return { project, result: { ok: false, reason: 'Anchors are at the same lat/lon — pick two different stations.' } };
  }

  let reprojected = 0;
  const newPoints = points.map((p) => {
    if (p.pinned) return p;
    if (p.lon === undefined || p.lat === undefined) return p;
    const { x, y } = applySimilarity(transform, p.lon, p.lat);
    reprojected += 1;
    return { ...p, x, y };
  });

  return {
    project: {
      ...project,
      [side]: { ...project[side], points: newPoints },
      meta: { ...project.meta, updatedAt: Date.now() },
    },
    result: { ok: true, reprojected },
  };
}

/** Compute the auto-fit bounding box from all lat/lon-bearing points on a side. */
function autoFitFromSide(points: Point[]): ReturnType<typeof autoFitBounds> {
  const latLons: LatLon[] = points
    .filter((p): p is Point & { lat: number; lon: number } => p.lat !== undefined && p.lon !== undefined)
    .map((p) => ({ lat: p.lat, lon: p.lon }));
  return autoFitBounds(latLons);
}

/**
 * Unpin a single point and snap it back to its auto-fit projected position.
 * Auto-fit uses the bbox of all lat/lon-bearing points on the same side. Returns
 * the project unchanged if the point isn't pinned, has no lat/lon, or the side
 * has no image dimensions yet.
 */
export function unpinPoint(project: Project, side: Side, id: string): Project {
  const sideData = project[side];
  const points = sideData.points;
  const idx = points.findIndex((p) => p.id === id);
  if (idx === -1) return project;
  const target = points[idx]!;
  if (!target.pinned || target.lon === undefined || target.lat === undefined) return project;
  const bounds = autoFitFromSide(points);
  if (!bounds || sideData.width === 0 || sideData.height === 0) return project;
  const { x, y } = latLonToPixel(target.lat, target.lon, bounds, sideData.width, sideData.height);
  return updatePoint(project, side, id, { x, y, pinned: false });
}

/**
 * Clear all pinned anchors on a side and re-project them via auto-fit.
 * Returns { project, count } where count is how many points were unpinned.
 */
export function clearAnchors(project: Project, side: Side): { project: Project; count: number } {
  const sideData = project[side];
  const points = sideData.points;
  const bounds = autoFitFromSide(points);
  if (!bounds || sideData.width === 0 || sideData.height === 0) return { project, count: 0 };
  let count = 0;
  const newPoints = points.map((p) => {
    if (!p.pinned) return p;
    if (p.lon === undefined || p.lat === undefined) {
      // Still un-pin, even if we can't reproject (no source coords).
      count += 1;
      return { ...p, pinned: false };
    }
    const { x, y } = latLonToPixel(p.lat, p.lon, bounds, sideData.width, sideData.height);
    count += 1;
    return { ...p, x, y, pinned: false };
  });
  if (count === 0) return { project, count: 0 };
  return {
    project: {
      ...project,
      [side]: { ...sideData, points: newPoints },
      meta: { ...project.meta, updatedAt: Date.now() },
    },
    count,
  };
}
