<script lang="ts">
  import { store } from '../state/store.svelte';
  import { derivePairs } from '../domain/pairs';
  import { getImageBlob } from '../persistence/indexeddb';
  import { downloadCanvasAsPNG } from '../exporters/png';
  import type { WorkerRequest, WorkerResponse } from '../warp/worker-protocol';
  import { usesAlpha as methodUsesAlpha, defaultAlpha as methodDefaultAlpha } from '../warp/method-config';
  import { shiftPairsByOutputCrop } from '../domain/pairs';
  import type { Side, WarpMethod } from '../types/project';
  import WarpWorker from '../warp/worker?worker';

  let progress = $state(0);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let nextId = 0;

  let derivedPairs = $derived(derivePairs(store.project));
  let currentMethod: WarpMethod = $derived(store.project.settings.warpMethod ?? 'tps');
  let showsAlpha = $derived(methodUsesAlpha(currentMethod));
  let effectiveAlpha = $derived(
    store.project.settings.warpAlpha ?? methodDefaultAlpha(currentMethod),
  );
  let outputFrame: Side = $derived(store.project.settings.outputFrame ?? 'schematic');
  // The image being warped is the OPPOSITE side from the output frame.
  let sourceSide: Side = $derived(outputFrame === 'schematic' ? 'geographic' : 'schematic');
  let canExport = $derived(
    derivedPairs.pairs.length >= 3 &&
    store.project[sourceSide].imageId !== null &&
    // input-frame dimensions must be known too
    store.project[outputFrame].width > 0,
  );

  async function exportPNG() {
    if (!canExport) return;
    busy = true;
    progress = 0;
    error = null;
    const id = ++nextId;
    const sourceImageId = store.project[sourceSide].imageId!;
    const blob = await getImageBlob(sourceImageId);
    if (!blob) { error = `${sourceSide} image missing`; busy = false; return; }
    const sourceBitmap = await createImageBitmap(blob);

    const { pairs, inputFrameWidth, inputFrameHeight } = shiftPairsByOutputCrop(
      derivedPairs.pairs,
      outputFrame,
      store.project[outputFrame].crop,
      store.project[outputFrame].width,
      store.project[outputFrame].height,
    );

    const worker = new WarpWorker();
    const req: WorkerRequest = {
      type: 'render',
      requestId: id,
      pairs,
      sourceBitmap,
      outWidth: store.project.settings.outputResolution.w,
      outHeight: store.project.settings.outputResolution.h,
      inputFrameWidth,
      inputFrameHeight,
      warpStrength: store.project.settings.warpStrength,
      outputFrame,
      method: currentMethod,
      alpha: store.project.settings.warpAlpha,
    };

    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const m = ev.data;
      if (m.requestId !== id) return;
      if (m.type === 'progress') progress = m.fraction;
      else if (m.type === 'error') { error = m.message; busy = false; worker.terminate(); }
      else if (m.type === 'result') {
        const canvas = document.createElement('canvas');
        canvas.width = m.bitmap.width;
        canvas.height = m.bitmap.height;
        canvas.getContext('2d')!.drawImage(m.bitmap, 0, 0);
        downloadCanvasAsPNG(canvas, `${store.project.meta.name}-warped.png`);
        busy = false;
        worker.terminate();
      }
    };

    worker.postMessage(req, [sourceBitmap]);
  }
</script>

<section>
  <h3>Export</h3>
  <label>
    Direction
    <select
      value={outputFrame}
      onchange={(e) => store.setOutputFrame((e.target as HTMLSelectElement).value as 'schematic' | 'geographic')}
    >
      <option value="schematic">Geographic warped to map shape</option>
      <option value="geographic">Schematic warped to real positions</option>
    </select>
  </label>
  <label>
    Method
    <select
      value={store.project.settings.warpMethod ?? 'tps'}
      onchange={(e) => store.setWarpMethod((e.target as HTMLSelectElement).value as WarpMethod)}
    >
      <option value="tps">TPS — smooth, globally fluid</option>
      <option value="mls-rigid">MLS rigid — feature-preserving (may tear)</option>
      <option value="mls-similarity">MLS similarity — local scale, less tearing</option>
      <option value="mls-affine">MLS affine — smoothest MLS, may shear locally</option>
      <option value="idw">IDW — smooth translation only, never tears</option>
      <option value="delaunay">Delaunay — guaranteed continuous, visible creases</option>
    </select>
  </label>
  {#if showsAlpha}
    <label>
      Falloff α
      <input
        type="range"
        min="0.1"
        max="2"
        step="0.05"
        value={effectiveAlpha}
        oninput={(e) => store.setWarpAlpha(parseFloat((e.target as HTMLInputElement).value))}
      />
      {effectiveAlpha.toFixed(2)}
    </label>
  {/if}
  <label>
    Warp strength
    <input
      type="range"
      min="0"
      max="1"
      step="0.01"
      value={store.project.settings.warpStrength}
      oninput={(e) => store.setWarpStrength(parseFloat((e.target as HTMLInputElement).value))}
    />
    {store.project.settings.warpStrength.toFixed(2)}
  </label>
  <label>
    Output width
    <input
      type="number"
      value={store.project.settings.outputResolution.w}
      onchange={(e) => store.setOutputResolution(parseInt((e.target as HTMLInputElement).value, 10), store.project.settings.outputResolution.h)}
    />
  </label>
  <label>
    Output height
    <input
      type="number"
      value={store.project.settings.outputResolution.h}
      onchange={(e) => store.setOutputResolution(store.project.settings.outputResolution.w, parseInt((e.target as HTMLInputElement).value, 10))}
    />
  </label>

  <button disabled={!canExport || busy} onclick={exportPNG}>
    {busy ? `Warping… ${(progress * 100).toFixed(0)}%` : 'Export PNG'}
  </button>
  {#if !canExport}
    <p class="hint">Need ≥3 paired points, plus both schematic and geographic images loaded.</p>
  {/if}
  {#if error}<p class="error">{error}</p>{/if}
</section>

<style>
  section { padding: 0.5rem; border: 1px solid #333; border-radius: 4px; display: flex; flex-direction: column; gap: 0.4rem; }
  label { display: flex; gap: 0.4rem; align-items: center; font-size: 0.85rem; }
  input[type='number'] { width: 80px; background: #1a1a2e; color: #e5e7eb; border: 1px solid #444; padding: 0.15rem; }
  select { background: #1a1a2e; color: #e5e7eb; border: 1px solid #444; padding: 0.15rem 0.3rem; flex: 1; font-size: 0.85rem; }
  button { background: #34d399; color: #000; border: none; padding: 0.4rem 0.8rem; cursor: pointer; font-weight: bold; }
  button:disabled { background: #555; color: #999; cursor: not-allowed; }
  .hint { color: #888; font-size: 0.8rem; }
  .error { color: #f87171; font-size: 0.85rem; }
</style>
