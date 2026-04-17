const DB_NAME = 'metro-warp';
const STORE = 'images';
const VERSION = 1;

// Real browsers can structured-clone Blobs into IndexedDB directly. fake-indexeddb
// (our test shim) doesn't, so we round-trip through { type, ArrayBuffer } to keep
// the same code path in tests and production.
type StoredBlob = { type: string; data: ArrayBuffer };

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function putImageBlob(id: string, blob: Blob): Promise<void> {
  const stored: StoredBlob = { type: blob.type, data: await blob.arrayBuffer() };
  await tx('readwrite', (s) => s.put(stored, id));
}

export async function getImageBlob(id: string): Promise<Blob | null> {
  const result = await tx<StoredBlob | undefined>('readonly', (s) => s.get(id));
  if (!result) return null;
  return new Blob([result.data], { type: result.type });
}

export async function deleteImageBlob(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
}

export async function clearAllImageBlobs(): Promise<void> {
  await tx('readwrite', (s) => s.clear());
}
