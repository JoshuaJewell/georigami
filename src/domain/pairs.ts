import type { Project, Point, Pair, DerivedPairs, CropRect, Side } from '../types/project';

export function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

/** Whether a point is inside the crop rectangle, or true if no crop is set. */
function inCrop(pt: { x: number; y: number }, crop: CropRect | undefined): boolean {
  if (!crop) return true;
  return pt.x >= crop.x && pt.x <= crop.x + crop.w && pt.y >= crop.y && pt.y <= crop.y + crop.h;
}

export function derivePairs(project: Project): DerivedPairs {
  const schematicByKey = new Map<string, Point>();
  const schematicOrphans: Point[] = [];
  for (const pt of project.schematic.points) {
    const key = normalizeLabel(pt.label);
    if (key === '' || schematicByKey.has(key)) {
      schematicOrphans.push(pt);
    } else {
      schematicByKey.set(key, pt);
    }
  }

  const pairs = [];
  const geographicOrphans: Point[] = [];
  const usedKeys = new Set<string>();
  for (const pt of project.geographic.points) {
    const key = normalizeLabel(pt.label);
    const match = key !== '' ? schematicByKey.get(key) : undefined;
    if (!match || usedKeys.has(key)) {
      geographicOrphans.push(pt);
      continue;
    }
    usedKeys.add(key);
    // Drop pairs that fall outside either side's crop. Note we don't add
    // these to either orphan list — they ARE properly paired, just outside
    // the user's region of interest.
    if (!inCrop(match, project.schematic.crop) || !inCrop(pt, project.geographic.crop)) continue;
    pairs.push({
      label: match.label,
      schematic: { x: match.x, y: match.y },
      geographic: { x: pt.x, y: pt.y },
    });
  }

  for (const [key, pt] of schematicByKey) {
    if (!usedKeys.has(key)) schematicOrphans.push(pt);
  }

  return { pairs, schematicOrphans, geographicOrphans };
}

/**
 * Prepare pairs and the input-frame dimensions for the warp worker, given
 * which side is the output frame and any crop on it.
 *
 * When the output side has a crop, the renderer treats the crop's top-left as
 * the origin and the crop's dimensions as the input frame. We achieve that by
 * pre-shifting just the output-side coords of each pair by `-(cropX, cropY)`,
 * leaving the renderer ignorant of cropping.
 */
export function shiftPairsByOutputCrop(
  pairs: Pair[],
  outputSide: Side,
  crop: CropRect | undefined,
  fullWidth: number,
  fullHeight: number,
): { pairs: Pair[]; inputFrameWidth: number; inputFrameHeight: number } {
  if (!crop) {
    return { pairs, inputFrameWidth: fullWidth, inputFrameHeight: fullHeight };
  }
  const shifted = pairs.map((p) => ({
    ...p,
    [outputSide]: { x: p[outputSide].x - crop.x, y: p[outputSide].y - crop.y },
  }));
  return { pairs: shifted, inputFrameWidth: crop.w, inputFrameHeight: crop.h };
}
