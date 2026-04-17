import type { Project } from '../types/project';
import { getImageBlob, putImageBlob } from './indexeddb';

type SerializedProject = {
  project: Project;
  images: { id: string; dataUrl: string }[];
};

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  return await res.blob();
}

export async function exportProjectFile(project: Project): Promise<Blob> {
  const images: SerializedProject['images'] = [];
  for (const side of ['schematic', 'geographic'] as const) {
    const id = project[side].imageId;
    if (!id) continue;
    const blob = await getImageBlob(id);
    if (!blob) continue;
    images.push({ id, dataUrl: await blobToDataUrl(blob) });
  }
  const payload: SerializedProject = { project, images };
  return new Blob([JSON.stringify(payload)], { type: 'application/json' });
}

export async function importProjectFile(file: Blob): Promise<Project> {
  const text = await file.text();
  const parsed = JSON.parse(text) as SerializedProject;
  if (!parsed?.project) throw new Error('Invalid project file');
  for (const img of parsed.images ?? []) {
    const blob = await dataUrlToBlob(img.dataUrl);
    await putImageBlob(img.id, blob);
  }
  return parsed.project;
}
