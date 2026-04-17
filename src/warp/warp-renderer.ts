/**
 * A warp evaluator maps a point in the input frame to its corresponding point
 * in the source (output) frame. The renderer is agnostic to the underlying
 * algorithm — TPS, MLS-rigid, or anything else can produce one of these.
 */
export type WarpEvaluator = (x: number, y: number) => { x: number; y: number };

/**
 * Bilinear sample of a source ImageData at fractional coordinates. Out-of-bounds
 * by more than half a pixel → transparent black. Sub-pixel slop at the edges is
 * tolerated by clamping x0/x1/y0/y1 — this matters because TPS produces
 * floating-point coords that can land exactly on the boundary (e.g. `w - 1 + ε`
 * due to rounding) and the strict check would erroneously make those samples black.
 */
function sample(src: ImageData, x: number, y: number, out: number[]): void {
  const w = src.width, h = src.height;
  if (x < -0.5 || y < -0.5 || x > w - 0.5 || y > h - 0.5) {
    out[0] = out[1] = out[2] = out[3] = 0;
    return;
  }
  const x0 = Math.max(0, Math.min(w - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(h - 1, Math.floor(y)));
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const fx = Math.max(0, Math.min(1, x - x0));
  const fy = Math.max(0, Math.min(1, y - y0));
  const data = src.data;
  for (let c = 0; c < 4; c++) {
    const a = data[(y0 * w + x0) * 4 + c]!;
    const b = data[(y0 * w + x1) * 4 + c]!;
    const cc = data[(y1 * w + x0) * 4 + c]!;
    const d = data[(y1 * w + x1) * 4 + c]!;
    out[c] = (a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + d * fx) * fy;
  }
}

/**
 * Render a TPS warp. Direction-agnostic: TPS maps `inputFrame → sourceFrame`,
 * so for each output pixel we scale it into TPS's input frame, ask the spline
 * where that point lives in the source, and bilinear-sample.
 *
 * - For the **geographic → schematic** direction: TPS solved with schematic
 *   coords as input, geographic as output. `inputFrameWidth/Height` are the
 *   schematic image's dims; `source` is the geographic image.
 * - For the **schematic → geographic** direction: TPS solved with the *swapped*
 *   pairs. `inputFrameWidth/Height` are the geographic image's dims; `source`
 *   is the schematic image.
 *
 * `warpStrength` blends the sampling position between the unwarped natural
 * coord (output pixel scaled to source dims) and the TPS-mapped coord. At s=0
 * you get the source image scaled to fit; at s=1 you get the full warp.
 */
export function renderWarp(
  source: ImageData,
  outWidth: number,
  outHeight: number,
  evaluator: WarpEvaluator,
  warpStrength: number,
  inputFrameWidth: number,
  inputFrameHeight: number,
  onProgress?: (fraction: number) => void,
  shouldCancel?: () => boolean,
): ImageData {
  const out = new ImageData(outWidth, outHeight);
  const scratch = [0, 0, 0, 0];
  const inScaleX = inputFrameWidth / outWidth;
  const inScaleY = inputFrameHeight / outHeight;
  const srcScaleX = source.width / outWidth;
  const srcScaleY = source.height / outHeight;

  for (let y = 0; y < outHeight; y++) {
    if (shouldCancel?.()) break;
    for (let x = 0; x < outWidth; x++) {
      // Output pixel (x,y) interpreted as TPS-input-frame coords.
      const inX = x * inScaleX;
      const inY = y * inScaleY;
      // Unwarped source coord (output → source linear scale).
      const naturalX = x * srcScaleX;
      const naturalY = y * srcScaleY;
      // Warp-mapped source coord.
      const target = evaluator(inX, inY);
      // Blend in source-coord space.
      const srcX = naturalX + (target.x - naturalX) * warpStrength;
      const srcY = naturalY + (target.y - naturalY) * warpStrength;
      sample(source, srcX, srcY, scratch);
      const idx = (y * outWidth + x) * 4;
      out.data[idx] = scratch[0]!;
      out.data[idx + 1] = scratch[1]!;
      out.data[idx + 2] = scratch[2]!;
      out.data[idx + 3] = scratch[3]!;
    }
    if (onProgress && (y % 8 === 0 || y === outHeight - 1)) {
      onProgress((y + 1) / outHeight);
    }
  }
  return out;
}
