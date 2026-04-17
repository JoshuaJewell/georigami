<script lang="ts">
  import { store } from '../state/store.svelte';
  import { exportProjectFile, importProjectFile } from '../persistence/project-file';
  import { saveProjectMeta, clearProjectMeta } from '../persistence/localstorage';
  import { clearAllImageBlobs } from '../persistence/indexeddb';
  import { createInitialProject } from '../state/project';

  async function save() {
    const blob = await exportProjectFile(store.project);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${store.project.meta.name}.metro-warp.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function load(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const project = await importProjectFile(file);
    store.project = project;
    saveProjectMeta(project);
    input.value = '';
  }

  function rename() {
    const newName = prompt('Project name?', store.project.meta.name);
    if (newName && newName.trim()) {
      store.project = { ...store.project, meta: { ...store.project.meta, name: newName.trim() } };
      saveProjectMeta(store.project);
    }
  }

  async function newProject() {
    if (!confirm('Discard current project? Images and points will be deleted from this browser. Save first if you want to keep them.')) return;
    await clearAllImageBlobs();
    clearProjectMeta();
    store.project = createInitialProject('untitled');
    saveProjectMeta(store.project);
  }
</script>

<section>
  <h3>Project</h3>
  <p class="name">
    <strong>{store.project.meta.name}</strong>
    <button onclick={rename}>rename</button>
  </p>
  <button onclick={save}>Save project file</button>
  <label class="loadbtn">
    Load project file
    <input type="file" accept=".json" onchange={load} />
  </label>
  <button class="danger" onclick={newProject}>New project (clear all)</button>
</section>

<style>
  section { padding: 0.5rem; border: 1px solid #333; border-radius: 4px; display: flex; flex-direction: column; gap: 0.4rem; }
  .name { display: flex; align-items: center; gap: 0.5rem; margin: 0; font-size: 0.9rem; }
  button, .loadbtn { background: #444; color: #fff; border: none; padding: 0.3rem 0.6rem; cursor: pointer; font-size: 0.85rem; text-align: left; }
  .loadbtn input { display: none; }
  .danger { background: #7f1d1d; }
  .danger:hover { background: #991b1b; }
</style>
