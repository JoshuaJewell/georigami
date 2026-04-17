<script lang="ts">
  import { store } from '../state/store.svelte';
  import { derivePairs, shiftPairsByOutputCrop } from '../domain/pairs';
  import { getImageBlob } from '../persistence/indexeddb';
  import type { WorkerRequest, WorkerResponse } from '../warp/worker-protocol';
  import type { Side } from '../types/project';
  import WarpWorker from '../warp/worker?worker';

  const PREVIEW_W = 400;
  const PREVIEW_H = 300;

  let canvas: HTMLCanvasElement;
  let busy = $state(false);
  let nextId = 0;
  let activeWorker: Worker | null = null;

  let derivedPairs = $derived(derivePairs(store.project));
  let outputFrame: Side = $derived(store.project.settings.outputFrame ?? 'schematic');
  let sourceSide: Side = $derived(outputFrame === 'schematic' ? 'geographic' : 'schematic');
  let canPreview = $derived(
    derivedPairs.pairs.length >= 3 &&
    store.project[sourceSide].imageId !== null &&
    store.project[outputFrame].width > 0,
  );

  // Re-render preview whenever any input changes.
  $effect(() => {
    void derivedPairs.pairs.length;
    void store.project.settings.warpStrength;
    void store.project.settings.outputFrame;
    void store.project.settings.warpMethod;
    void store.project.settings.warpAlpha;
    void store.project[sourceSide].imageId;
    void store.project[outputFrame].width;
    void store.project.schematic.crop;
    void store.project.geographic.crop;
    if (!canPreview) return;
    runPreview();
  });

  async function runPreview() {
    const id = ++nextId;
    busy = true;
    if (activeWorker) {
      activeWorker.postMessage({ type: 'cancel', requestId: id - 1 });
      activeWorker.terminate();
    }
    const sourceImageId = store.project[sourceSide].imageId!;
    const blob = await getImageBlob(sourceImageId);
    if (!blob || id !== nextId) { busy = false; return; }
    const sourceBitmap = await createImageBitmap(blob);
    const { pairs, inputFrameWidth, inputFrameHeight } = shiftPairsByOutputCrop(
      derivedPairs.pairs,
      outputFrame,
      store.project[outputFrame].crop,
      store.project[outputFrame].width,
      store.project[outputFrame].height,
    );
    const worker = new WarpWorker();
    activeWorker = worker;
    const req: WorkerRequest = {
      type: 'render',
      requestId: id,
      pairs,
      sourceBitmap,
      outWidth: PREVIEW_W,
      outHeight: PREVIEW_H,
      inputFrameWidth,
      inputFrameHeight,
      warpStrength: store.project.settings.warpStrength,
      outputFrame,
      method: store.project.settings.warpMethod ?? 'tps',
      alpha: store.project.settings.warpAlpha,
    };
    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const m = ev.data;
      if (m.requestId !== id) return;
      if (m.type === 'result') {
        if (canvas) {
          const ctx = canvas!.getContext('2d')!;
          canvas!.width = PREVIEW_W;
          canvas!.height = PREVIEW_H;
          ctx.drawImage(m.bitmap, 0, 0);
        }
        busy = false;
        worker.terminate();
        if (activeWorker === worker) activeWorker = null;
      } else if (m.type === 'error') {
        busy = false;
        worker.terminate();
        if (activeWorker === worker) activeWorker = null;
      }
    };
    worker.postMessage(req, [sourceBitmap]);
  }
</script>

<section>
  <h3>Preview</h3>
  {#if canPreview}
    <canvas bind:this={canvas}></canvas>
    {#if busy}<p class="hint">Rendering…</p>{/if}
  {:else}
    <p class="hint">Place at least 3 pairs and load both schematic and geographic images to see the preview.</p>
  {/if}
</section>

<style>
  section { padding: 0.5rem; border: 1px solid #333; border-radius: 4px; }
  canvas { width: 100%; height: auto; background: #111; border: 1px solid #444; }
  .hint { color: #888; font-size: 0.85rem; margin: 0.4rem 0 0 0; }
</style>
