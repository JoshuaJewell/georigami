import { describe, it, expect, beforeEach } from 'vitest';
import { exportProjectFile, importProjectFile } from './project-file';
import { putImageBlob, getImageBlob, deleteImageBlob } from './indexeddb';
import { createInitialProject, setImage } from '../state/project';

beforeEach(async () => {
  await deleteImageBlob('img-a');
  await deleteImageBlob('img-b');
});

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

describe('exportProjectFile / importProjectFile', () => {
  it('round-trips a project (no images)', async () => {
    const p = createInitialProject('test');
    const file = await exportProjectFile(p);
    expect(file.type).toMatch(/json/);
    const loaded = await importProjectFile(file);
    expect(loaded.meta.name).toBe('test');
  });

  it('round-trips a project with one image (writes blob to IndexedDB on import)', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])]);
    await putImageBlob('img-a', blob);
    let p = createInitialProject('test');
    p = setImage(p, 'schematic', 'img-a', 100, 100);

    const file = await exportProjectFile(p);
    await deleteImageBlob('img-a');

    const loaded = await importProjectFile(file);
    expect(loaded.schematic.imageId).toBe('img-a');
    const restored = await getImageBlob('img-a');
    expect(restored).not.toBeNull();
    expect(await blobBytes(restored!)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });
});
