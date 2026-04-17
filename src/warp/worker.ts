/// <reference lib="webworker" />
import { solveTPS, applyTPS } from './tps-solver';
import { applyMLS, type MLSPair, type MLSVariant } from './mls-solver';
import { applyIDW, type IDWPair } from './idw-solver';
import { buildDelaunayWarp, applyDelaunayWarp, type DelaunayPair } from './delaunay-warp';
import { renderWarp, type WarpEvaluator } from './warp-renderer';
import type { WorkerRequest, WorkerResponse } from './worker-protocol';

const cancelled = new Set<number>();

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  if (req.type === 'cancel') {
    cancelled.add(req.requestId);
    return;
  }
  const { requestId, pairs, sourceBitmap, outWidth, outHeight, inputFrameWidth, inputFrameHeight, warpStrength, outputFrame, method, alpha } = req;

  const post = (msg: WorkerResponse, transfer?: Transferable[]) =>
    (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer ?? []);

  try {
    // The TPS solver always takes pair.schematic → pair.geographic. When the
    // output frame is geographic, we want geographic → schematic, so swap
    // each pair's fields once here. Both algorithms use the swapped pairs
    // from this point.
    const oriented = outputFrame === 'geographic'
      ? pairs.map((p) => ({ label: p.label, schematic: p.geographic, geographic: p.schematic }))
      : pairs;

    // Build the per-pixel evaluator for the chosen method.
    let evaluator: WarpEvaluator;
    if (method.startsWith('mls-')) {
      const variant = method.substring(4) as MLSVariant; // 'rigid' | 'similarity' | 'affine'
      const mlsPairs: MLSPair[] = oriented.map((p) => ({ source: p.schematic, target: p.geographic }));
      const a = alpha ?? 1; // MLS default
      evaluator = (x, y) => applyMLS(mlsPairs, x, y, variant, a);
    } else if (method === 'idw') {
      const idwPairs: IDWPair[] = oriented.map((p) => ({ source: p.schematic, target: p.geographic }));
      const a = alpha ?? 0.5; // IDW default — gentler to reduce content folding
      evaluator = (x, y) => applyIDW(idwPairs, x, y, a);
    } else if (method === 'delaunay') {
      const dPairs: DelaunayPair[] = oriented.map((p) => ({ source: p.schematic, target: p.geographic }));
      const warp = buildDelaunayWarp(dPairs);
      evaluator = (x, y) => applyDelaunayWarp(warp, x, y);
    } else {
      const coefs = solveTPS(oriented);
      if (!coefs) {
        post({ type: 'error', requestId, message: 'TPS solve failed (need ≥3 non-collinear pairs)' });
        return;
      }
      evaluator = (x, y) => applyTPS(coefs, x, y);
    }

    // Draw bitmap to OffscreenCanvas to get ImageData.
    const canvas = new OffscreenCanvas(sourceBitmap.width, sourceBitmap.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(sourceBitmap, 0, 0);
    const sourceImageData = ctx.getImageData(0, 0, sourceBitmap.width, sourceBitmap.height);

    const out = renderWarp(
      sourceImageData,
      outWidth,
      outHeight,
      evaluator,
      warpStrength,
      inputFrameWidth,
      inputFrameHeight,
      (fraction) => post({ type: 'progress', requestId, fraction }),
      () => cancelled.has(requestId),
    );
    if (cancelled.has(requestId)) {
      cancelled.delete(requestId);
      return;
    }
    const outCanvas = new OffscreenCanvas(outWidth, outHeight);
    outCanvas.getContext('2d')!.putImageData(out, 0, 0);
    const bitmap = outCanvas.transferToImageBitmap();
    post({ type: 'result', requestId, bitmap }, [bitmap]);
  } catch (e) {
    post({ type: 'error', requestId, message: (e as Error).message });
  }
};
