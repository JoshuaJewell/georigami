<script lang="ts">
  import { store } from '../state/store.svelte';
  import { getImageBlob } from '../persistence/indexeddb';

  type Props = {
    side: 'schematic' | 'geographic';
    title: string;
  };
  let { side, title }: Props = $props();

  let canvas: HTMLCanvasElement;
  let viewport: HTMLDivElement;
  let imageBitmap: ImageBitmap | null = $state(null);

  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);

  type DragMode = 'none' | 'pan' | 'point';
  let dragMode: DragMode = 'none';
  let dragMoved = false;
  let dragStart = { mouseX: 0, mouseY: 0, panX: 0, panY: 0 };
  let dragPointId: string | null = null;
  let dragPointStart = { x: 0, y: 0 };

  let imageSide = $derived(store.project[side]);

  $effect(() => {
    const id = imageSide.imageId;
    if (!id) { imageBitmap = null; return; }
    let cancelled = false;
    getImageBlob(id).then((blob) => {
      if (!blob || cancelled) return;
      return createImageBitmap(blob);
    }).then((b) => { if (!cancelled && b) imageBitmap = b; });
    return () => { cancelled = true; };
  });

  $effect(() => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    canvas.width = imageSide.width || 400;
    canvas.height = imageSide.height || 300;
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (imageBitmap) ctx.drawImage(imageBitmap, 0, 0);
    for (const p of imageSide.points) {
      // Pinned anchors are gold; everything else is red. Adds a subtle white
      // outline so they read against any background.
      const isAnchor = p.pinned === true;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = isAnchor ? '#fbbf24' : '#f87171';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      if (p.label) {
        ctx.fillStyle = '#fff';
        ctx.font = '12px sans-serif';
        ctx.fillText(p.label, p.x + 8, p.y - 8);
      }
    }
    // Crop overlay: dim everything outside the crop and outline the crop region.
    const crop = imageSide.crop;
    if (crop) {
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      // Four rectangles around the crop region.
      ctx.fillRect(0, 0, canvas.width, crop.y);                                              // top
      ctx.fillRect(0, crop.y, crop.x, crop.h);                                               // left
      ctx.fillRect(crop.x + crop.w, crop.y, canvas.width - (crop.x + crop.w), crop.h);       // right
      ctx.fillRect(0, crop.y + crop.h, canvas.width, canvas.height - (crop.y + crop.h));     // bottom
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(crop.x, crop.y, crop.w, crop.h);
      ctx.restore();
    }
  });

  /** Convert a viewport mouse event to canvas-buffer (image-pixel) coordinates. */
  function eventToImageCoord(ev: MouseEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - rect.left) / rect.width) * canvas.width,
      y: ((ev.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  /** Find the topmost point within hit radius of (x, y) in image-pixel coords. */
  function pickPointAt(x: number, y: number): string | null {
    // Hit radius is ~10 screen pixels translated into image-pixel space.
    // The screen→image factor accounts for both zoom AND the CSS-scale that
    // shrinks the canvas to fit the viewport width.
    const rect = canvas.getBoundingClientRect();
    const imagePxPerScreenPx = rect.width === 0 ? 1 : canvas.width / rect.width;
    const r = 10 * imagePxPerScreenPx;
    // Iterate in reverse so the most-recently-added point wins on overlap.
    const points = imageSide.points;
    for (let i = points.length - 1; i >= 0; i--) {
      const p = points[i]!;
      const dx = p.x - x;
      const dy = p.y - y;
      if (dx * dx + dy * dy <= r * r) return p.id;
    }
    return null;
  }

  async function onDrop(ev: DragEvent) {
    ev.preventDefault();
    const f = ev.dataTransfer?.files?.[0];
    if (!f) return;
    await store.loadImage(side, f);
    resetView();
  }

  function onWheel(ev: WheelEvent) {
    if (!imageBitmap) return;
    ev.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    const imgX = (mx - panX) / zoom;
    const imgY = (my - panY) / zoom;
    const factor = ev.deltaY > 0 ? 1 / 1.2 : 1.2;
    const newZoom = Math.max(0.2, Math.min(40, zoom * factor));
    panX = mx - imgX * newZoom;
    panY = my - imgY * newZoom;
    zoom = newZoom;
  }

  function onMouseDown(ev: MouseEvent) {
    if (ev.button !== 0 || !imageBitmap) return;
    dragMoved = false;
    const { x, y } = eventToImageCoord(ev);
    const hitId = pickPointAt(x, y);
    if (hitId !== null) {
      dragMode = 'point';
      dragPointId = hitId;
      const p = imageSide.points.find((pt) => pt.id === hitId)!;
      dragPointStart = { x: p.x, y: p.y };
      dragStart = { mouseX: ev.clientX, mouseY: ev.clientY, panX, panY };
    } else {
      dragMode = 'pan';
      dragStart = { mouseX: ev.clientX, mouseY: ev.clientY, panX, panY };
    }
  }

  function onMouseMove(ev: MouseEvent) {
    if (dragMode === 'none') return;
    const dxScreen = ev.clientX - dragStart.mouseX;
    const dyScreen = ev.clientY - dragStart.mouseY;
    if (Math.abs(dxScreen) > 3 || Math.abs(dyScreen) > 3) dragMoved = true;
    if (!dragMoved) return;
    if (dragMode === 'pan') {
      panX = dragStart.panX + dxScreen;
      panY = dragStart.panY + dyScreen;
    } else if (dragMode === 'point' && dragPointId !== null) {
      // Convert screen-pixel delta into image-pixel delta.
      const rect = canvas.getBoundingClientRect();
      const scale = canvas.width / rect.width;
      const newX = dragPointStart.x + dxScreen * scale;
      const newY = dragPointStart.y + dyScreen * scale;
      store.movePoint(side, dragPointId, newX, newY);
    }
  }

  function onMouseUp(ev: MouseEvent) {
    if (dragMode === 'none') return;
    const wasDrag = dragMoved;
    const mode = dragMode;
    dragMode = 'none';
    dragPointId = null;
    if (wasDrag || !imageBitmap) return;
    if (mode === 'point') {
      // A pure click on an existing point: do nothing (keep it selected? no UX yet).
      return;
    }
    // Pure click on empty canvas: add a new point.
    const { x, y } = eventToImageCoord(ev);
    if (x < 0 || y < 0 || x > canvas.width || y > canvas.height) return;
    const label = prompt('Label for this point?') ?? '';
    store.addPoint(side, label.trim(), x, y);
  }

  function onMouseLeave() {
    dragMode = 'none';
    dragPointId = null;
  }

  function resetView() {
    zoom = 1;
    panX = 0;
    panY = 0;
  }

  /**
   * Set the crop to the canvas-buffer rectangle currently visible in the viewport.
   * Reuses the existing zoom/pan state — the user zooms to the area of interest,
   * clicks the button, and that region becomes the crop.
   */
  function setCropFromView() {
    if (!imageBitmap || !canvas || !viewport) return;
    const vpW = viewport.clientWidth;
    const vpH = viewport.clientHeight;
    if (vpW <= 0 || vpH <= 0) return;
    // CSS scale of the (un-transformed) canvas. Because canvas is `width: 100%`
    // and `height: auto`, the css size matches viewport width and a proportional
    // height — so the same factor works for both axes.
    const factor = canvas.width / vpW;
    // Visible viewport rectangle in canvas-buffer coords. Clamp to canvas extents.
    const tlX = Math.max(0, ((-panX) / zoom) * factor);
    const tlY = Math.max(0, ((-panY) / zoom) * factor);
    const brX = Math.min(canvas.width, ((vpW - panX) / zoom) * factor);
    const brY = Math.min(canvas.height, ((vpH - panY) / zoom) * factor);
    const w = brX - tlX;
    const h = brY - tlY;
    if (w < 4 || h < 4) return; // ignore degenerate crops
    store.setCrop(side, { x: tlX, y: tlY, w, h });
  }

  function clearCrop() {
    store.clearCrop(side);
  }
</script>

<section ondrop={onDrop} ondragover={(e) => e.preventDefault()}>
  <h3>
    {title}
    {#if imageBitmap}
      <span class="zoom">{(zoom * 100).toFixed(0)}%</span>
      <button class="reset" onclick={resetView}>reset</button>
      <button class="crop" onclick={setCropFromView} title="Set crop to currently visible region">crop to view</button>
      {#if imageSide.crop}
        <button class="reset" onclick={clearCrop} title="Remove the crop">clear crop</button>
      {/if}
    {/if}
  </h3>
  <div
    class="viewport"
    bind:this={viewport}
    onwheel={onWheel}
    onmousedown={onMouseDown}
    onmousemove={onMouseMove}
    onmouseup={onMouseUp}
    onmouseleave={onMouseLeave}
  >
    <canvas
      bind:this={canvas}
      style:transform="translate({panX}px, {panY}px) scale({zoom})"
    ></canvas>
  </div>
  {#if !imageBitmap}
    <p class="hint">
      {#if side === 'schematic'}
        Drop the metro map image here.
      {:else}
        Drop a geographic image here (satellite, street map, or other map of the city). The GeoJSON only provides station coordinates — it doesn't include a map background, so you'll need to supply one.
      {/if}
    </p>
  {:else}
    <p class="hint">Wheel to zoom · drag empty area to pan · drag a point to move it · click empty area to add a point</p>
  {/if}
</section>

<style>
  section { display: flex; flex-direction: column; gap: 0.5rem; }
  h3 { display: flex; align-items: center; gap: 0.6rem; margin: 0; }
  .zoom { font-size: 0.75rem; color: #9ca3af; font-weight: normal; }
  .reset { background: #444; color: #fff; border: none; padding: 0.15rem 0.5rem; cursor: pointer; font-size: 0.75rem; }
  .crop { background: #1d4ed8; color: #fff; border: none; padding: 0.15rem 0.5rem; cursor: pointer; font-size: 0.75rem; }
  .viewport {
    overflow: hidden;
    background: #111;
    border: 1px solid #444;
    cursor: grab;
    position: relative;
  }
  .viewport:active { cursor: grabbing; }
  canvas {
    display: block;
    width: 100%;
    height: auto;
    transform-origin: 0 0;
    cursor: crosshair;
  }
  .hint { color: #888; font-size: 0.8rem; margin: 0; }
</style>
