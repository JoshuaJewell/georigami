import type { Project } from '../types/project';

const KEY = 'metro-warp:project';

export function saveProjectMeta(project: Project): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(project));
  } catch {
    // Quota or blocked; silently degrade — caller surfaces this elsewhere
  }
}

export function loadProjectMeta(): Project | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return null;
    const project = JSON.parse(raw) as Project;
    // Back-fill fields added after the file was saved so older projects keep
    // working without a migration step.
    if (project.settings && project.settings.outputFrame === undefined) {
      project.settings.outputFrame = 'schematic';
    }
    if (project.settings && project.settings.warpMethod === undefined) {
      project.settings.warpMethod = 'tps';
    }
    // warpAlpha intentionally left undefined for old projects — the worker
    // applies a method-specific default when not set.
    return project;
  } catch {
    return null;
  }
}

export function clearProjectMeta(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
