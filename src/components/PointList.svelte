<script lang="ts">
  import { store } from '../state/store.svelte';
  import { derivePairs } from '../domain/pairs';
  import { parseGeoJSON } from '../importers/geojson';
  import { parseCSV } from '../importers/csv';
  import { fetchTilesForBounds, TILE_SOURCES, DEFAULT_TILE_SOURCE_ID, getTileSource } from '../importers/auto-tiles';
  import { autoFitBounds, latLonToWebMercatorPixel, type LatLon } from '../projection/lat-lon';
  import { putImageBlob } from '../persistence/indexeddb';

  let derivedPairs = $derived(derivePairs(store.project));
  let importWarnings = $state<string[]>([]);
  let recalibrateMessage = $state<string | null>(null);
  let autoFetchStatus = $state<string | null>(null);
  let tileSourceId = $state<string>(DEFAULT_TILE_SOURCE_ID);

  let geographicAnchorCount = $derived(
    store.project.geographic.points.filter((p) => p.pinned && p.lon !== undefined && p.lat !== undefined).length,
  );

  async function importFile(side: 'schematic' | 'geographic', ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const isGeoJSON = file.name.endsWith('.geojson') || file.name.endsWith('.json');
    if (isGeoJSON && store.project[side].width === 0) {
      importWarnings = [
        `Drop the ${side} map image first — GeoJSON points are projected onto its pixel grid, so we need its dimensions.`,
      ];
      input.value = '';
      return;
    }
    const text = await file.text();
    if (isGeoJSON) {
      const parsed = parseGeoJSON(text, store.project[side].width, store.project[side].height);
      for (const p of parsed.points) {
        store.addPoint(side, p.label, p.x, p.y, { lon: p.lon, lat: p.lat });
      }
      importWarnings = parsed.warnings;
    } else {
      const parsed = parseCSV(text);
      for (const p of parsed.points) store.addPoint(side, p.label, p.x, p.y);
      importWarnings = parsed.warnings;
    }
    input.value = '';
  }

  function recalibrate() {
    const result = store.recalibrate('geographic');
    if (result.ok) {
      recalibrateMessage = `Reprojected ${result.reprojected} point${result.reprojected === 1 ? '' : 's'} from your anchors.`;
    } else {
      recalibrateMessage = result.reason;
    }
  }

  function clearAllAnchors() {
    const count = store.clearAnchors('geographic');
    recalibrateMessage = count > 0
      ? `Cleared ${count} anchor${count === 1 ? '' : 's'} and snapped them back to auto-fit positions.`
      : 'No anchors to clear.';
  }

  /**
   * Import a GeoJSON and auto-fetch a tile-based backdrop sized to its bbox.
   * The fetched image is in Web Mercator at a known zoom, so we project each
   * point with closed-form math — no auto-fit, no calibration.
   */
  async function importGeoJSONWithSatellite(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.geojson') && !file.name.endsWith('.json')) {
      autoFetchStatus = 'Auto-fetch needs a GeoJSON file.';
      input.value = '';
      return;
    }
    try {
      autoFetchStatus = 'Reading GeoJSON…';
      const text = await file.text();
      // Parse with dummy dimensions; we only use the lat/lon and labels here.
      const parsed = parseGeoJSON(text, 1, 1);
      if (parsed.points.length === 0) {
        autoFetchStatus = 'No Point features found in this GeoJSON.';
        input.value = '';
        return;
      }
      const latLons: LatLon[] = parsed.points
        .filter((p): p is typeof p & { lat: number; lon: number } => p.lat !== undefined && p.lon !== undefined)
        .map((p) => ({ lat: p.lat, lon: p.lon }));
      const bounds = autoFitBounds(latLons);
      if (!bounds) {
        autoFetchStatus = 'GeoJSON has no usable lat/lon coordinates.';
        input.value = '';
        return;
      }

      const source = getTileSource(tileSourceId);
      autoFetchStatus = `Fetching ${source.label} tiles…`;
      const sat = await fetchTilesForBounds(bounds, source, {
        onProgress: (loaded, total) => {
          autoFetchStatus = `Fetching tiles ${loaded}/${total}…`;
        },
      });

      autoFetchStatus = 'Storing image and placing points…';
      const satFile = new File([sat.blob], `${source.id}-z${sat.zoom}.jpg`, { type: 'image/jpeg' });
      await store.loadImage('geographic', satFile);

      // store.loadImage uses createImageBitmap which can disagree slightly with
      // canvas.width/height in edge cases. Read back the actual dimensions
      // from the project state for safety.
      const imgW = store.project.geographic.width || sat.width;
      const imgH = store.project.geographic.height || sat.height;
      void imgW; void imgH; // we don't use these — projection is in tile-pixel space which equals the canvas size

      for (const p of parsed.points) {
        if (p.lat === undefined || p.lon === undefined) continue;
        const { x, y } = latLonToWebMercatorPixel(p.lat, p.lon, sat.zoom, sat.originTileX, sat.originTileY);
        store.addPoint('geographic', p.label, x, y, { lon: p.lon, lat: p.lat });
      }

      autoFetchStatus = `Imported ${parsed.points.length} points and a ${sat.width}×${sat.height} ${source.label} backdrop. Source: ${source.attribution}.`;
      if (parsed.warnings.length) importWarnings = parsed.warnings;
    } catch (e) {
      autoFetchStatus = `Auto-fetch failed: ${(e as Error).message}`;
    }
    input.value = '';
  }
</script>

<section>
  <details>
    <summary>Import points</summary>
    <label>Schematic <input type="file" accept=".csv,.json,.geojson" onchange={(e) => importFile('schematic', e)} /></label>
    <label>Geographic <input type="file" accept=".csv,.json,.geojson" onchange={(e) => importFile('geographic', e)} /></label>
    <label class="auto">
      <strong>Geographic + auto map fetch (GeoJSON only)</strong>
      <select bind:value={tileSourceId}>
        {#each TILE_SOURCES as src (src.id)}
          <option value={src.id}>{src.label}</option>
        {/each}
      </select>
      <input type="file" accept=".geojson,.json" onchange={importGeoJSONWithSatellite} />
    </label>
    {#if autoFetchStatus}<p class="status">{autoFetchStatus}</p>{/if}
    {#if importWarnings.length}
      <ul class="warnings">
        {#each importWarnings as w}<li>{w}</li>{/each}
      </ul>
    {/if}
  </details>

  {#if geographicAnchorCount > 0}
    <div class="calibrate">
      <button disabled={geographicAnchorCount < 2} onclick={recalibrate}>
        Recalibrate from {geographicAnchorCount} anchor{geographicAnchorCount === 1 ? '' : 's'}
        {#if geographicAnchorCount < 2}(need 2){/if}
      </button>
      <button class="secondary" onclick={clearAllAnchors}>Clear all anchors</button>
      {#if recalibrateMessage}<p class="msg">{recalibrateMessage}</p>{/if}
    </div>
  {/if}

  <h3>Points</h3>
  <h4>Paired ({derivedPairs.pairs.length})</h4>
  <ul>
    {#each derivedPairs.pairs as p (p.label)}
      {@const geoPoint = store.project.geographic.points.find((q) => q.label.trim().toLowerCase() === p.label.trim().toLowerCase())}
      <li>
        ✓ {p.label}
        {#if geoPoint?.pinned}
          <button class="unpin" title="Unpin this anchor (snap back to auto-fit position)" onclick={() => store.unpinPoint('geographic', geoPoint.id)}>📌</button>
        {/if}
      </li>
    {/each}
  </ul>

  <h4>Schematic only ({derivedPairs.schematicOrphans.length})</h4>
  <ul>
    {#each derivedPairs.schematicOrphans as p (p.id)}
      <li>
        ⚠ <input
          type="text"
          value={p.label}
          oninput={(e) => store.renamePoint('schematic', p.id, (e.target as HTMLInputElement).value)}
        />
        <button onclick={() => store.deletePoint('schematic', p.id)}>×</button>
      </li>
    {/each}
  </ul>

  <h4>Geographic only ({derivedPairs.geographicOrphans.length})</h4>
  <ul>
    {#each derivedPairs.geographicOrphans as p (p.id)}
      <li>
        {p.pinned ? '📌' : '⚠'}
        <input
          type="text"
          value={p.label}
          oninput={(e) => store.renamePoint('geographic', p.id, (e.target as HTMLInputElement).value)}
        />
        {#if p.pinned}
          <button class="unpin" title="Unpin this anchor" onclick={() => store.unpinPoint('geographic', p.id)}>↺</button>
        {/if}
        <button onclick={() => store.deletePoint('geographic', p.id)}>×</button>
      </li>
    {/each}
  </ul>
</section>

<style>
  section { padding: 0.5rem; border: 1px solid #333; border-radius: 4px; }
  h4 { margin: 0.6rem 0 0.2rem 0; font-size: 0.85rem; color: #aaa; }
  ul { list-style: none; padding: 0; margin: 0; font-size: 0.85rem; }
  li { display: flex; align-items: center; gap: 0.3rem; padding: 0.2rem 0; }
  input { background: #1a1a2e; color: #e5e7eb; border: 1px solid #444; padding: 0.15rem 0.3rem; flex: 1; }
  button { background: #444; color: #fff; border: none; padding: 0 0.5rem; cursor: pointer; }
  details { margin-bottom: 0.5rem; font-size: 0.85rem; }
  summary { cursor: pointer; padding: 0.2rem 0; }
  details label { display: block; padding: 0.2rem 0; }
  .warnings { color: #fbbf24; font-size: 0.8rem; }
  .auto { background: rgba(37, 99, 235, 0.12); padding: 0.4rem; border-radius: 4px; margin-top: 0.3rem; }
  .auto strong { display: block; font-size: 0.78rem; margin-bottom: 0.2rem; color: #93c5fd; }
  .auto select { background: #1a1a2e; color: #e5e7eb; border: 1px solid #444; padding: 0.15rem 0.3rem; margin-bottom: 0.3rem; width: 100%; }
  .status { font-size: 0.75rem; color: #9ca3af; margin: 0.3rem 0 0 0; }
  .calibrate { display: flex; flex-direction: column; gap: 0.3rem; padding: 0.4rem 0; }
  .calibrate button { background: #2563eb; padding: 0.35rem 0.6rem; }
  .calibrate button.secondary { background: #4b5563; }
  .calibrate button:disabled { background: #555; cursor: not-allowed; }
  .calibrate .msg { font-size: 0.75rem; color: #9ca3af; margin: 0; }
  .unpin { background: #4b5563; }
</style>
