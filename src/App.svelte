<script lang="ts">
  import ImagePane from './components/ImagePane.svelte';
  import PointList from './components/PointList.svelte';
  import ExportPanel from './components/ExportPanel.svelte';
  import FilePanel from './components/FilePanel.svelte';
  import PreviewCanvas from './components/PreviewCanvas.svelte';
</script>

<main>
  <h1>Metro-Warp</h1>
  <div class="layout">
    <div class="panes">
      <ImagePane side="schematic" title="Schematic map" />
      <ImagePane side="geographic" title="Geographic map" />
    </div>
    <aside>
      <FilePanel />
      <PointList />
      <PreviewCanvas />
      <ExportPanel />
    </aside>
  </div>
</main>

<style>
  main { padding: 1rem; }
  .layout { display: grid; grid-template-columns: 1fr 280px; gap: 1rem; }
  .panes { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  aside { display: flex; flex-direction: column; gap: 1rem; }
</style>
