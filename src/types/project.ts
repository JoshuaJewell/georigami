export type Point = {
  id: string;
  label: string;
  x: number;
  y: number;
  /** Original GeoJSON longitude, kept so the point can be reprojected later. */
  lon?: number;
  /** Original GeoJSON latitude, kept so the point can be reprojected later. */
  lat?: number;
  /** True if the user has moved this point — recalibration uses pinned points
   *  as anchors and skips them when reprojecting the rest. */
  pinned?: boolean;
};

/** Axis-aligned crop in image-pixel coordinates. */
export type CropRect = { x: number; y: number; w: number; h: number };

export type WarpMethod = 'tps' | 'mls-rigid' | 'mls-similarity' | 'mls-affine' | 'idw' | 'delaunay';

export type Side = 'schematic' | 'geographic';

export type WarpDirection = 'geo-to-schem' | 'schem-to-geo';

export type ImageSide = {
  imageId: string | null;
  width: number;
  height: number;
  points: Point[];
  /** Optional crop. When set, only points inside the crop participate in
   *  warps, and (when the side is the output frame) the warped output covers
   *  just the crop region. */
  crop?: CropRect;
};

export type ProjectSettings = {
  warpStrength: number;
  outputResolution: { w: number; h: number };
  /**
   * Which frame the warped output occupies.
   * - 'schematic': the geographic image is warped to fit the schematic's geometry (default)
   * - 'geographic': the schematic image is warped to sit at the geographic positions
   * The TPS solver uses the same pairs in both cases, just with input/output swapped.
   */
  outputFrame?: 'schematic' | 'geographic';
  /**
   * Which warp algorithm.
   * - 'tps': thin-plate spline — smooth, globally fluid, can stretch local content.
   * - 'mls-rigid': MLS rigid — most feature-preserving, prone to tearing.
   * - 'mls-similarity': MLS with uniform scale — less tearing than rigid.
   * - 'mls-affine': MLS with full linear transform — smoothest, may shear.
   * - 'idw': inverse-distance displacement — smooth, never tears, no rotation/scale.
   * - 'delaunay': piecewise affine triangulation — continuous, visible creases.
   */
  warpMethod?: WarpMethod;
  /**
   * Falloff exponent for distance-weighted methods (MLS variants, IDW). Weight
   * = 1 / |p - v|^(2α). Higher = more local "stickiness" near control points
   * but sharper gradients between them. Lower = smoother but less localised.
   * Typical range 0.25–2; defaults applied per method when undefined.
   */
  warpAlpha?: number;
};

export type ProjectMeta = {
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type Project = {
  schematic: ImageSide;
  geographic: ImageSide;
  settings: ProjectSettings;
  meta: ProjectMeta;
};

export type Pair = {
  label: string;
  schematic: { x: number; y: number };
  geographic: { x: number; y: number };
};

export type DerivedPairs = {
  pairs: Pair[];
  schematicOrphans: Point[];
  geographicOrphans: Point[];
};
