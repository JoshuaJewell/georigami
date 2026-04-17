import { describe, it, expect, beforeEach } from 'vitest';
import { putImageBlob, getImageBlob, deleteImageBlob } from './indexeddb';

beforeEach(async () => {
  // fake-indexeddb in tests/setup.ts gives a fresh DB per test run; clear the store
  await deleteImageBlob('test-id');
});

describe('IndexedDB image store', () => {
  it('round-trips a blob by id', async () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    await putImageBlob('test-id', blob);
    const out = await getImageBlob('test-id');
    expect(out).not.toBeNull();
    expect(await out!.text()).toBe('hello');
  });

  it('returns null for an unknown id', async () => {
    expect(await getImageBlob('does-not-exist')).toBeNull();
  });

  it('deletes a blob', async () => {
    await putImageBlob('test-id', new Blob(['x']));
    await deleteImageBlob('test-id');
    expect(await getImageBlob('test-id')).toBeNull();
  });
});
