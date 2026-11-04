// Stockage local (IndexedDB) des analyses.
// Une "analyse" = { id, title, createdAt, updatedAt, videoRef, annotations[], boards[] }.
// Plus tard, la même interface sera branchée sur Firebase pour le partage.

const DB_NAME = 'analyse-video';
const DB_VERSION = 1;
let dbp;

function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const req = fn(s);
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const projects = {
  list: async () => (await tx('projects', 'readonly', (s) => s.getAll())).sort((a, b) => b.updatedAt - a.updatedAt),
  get: (id) => tx('projects', 'readonly', (s) => s.get(id)),
  put: (p) => tx('projects', 'readwrite', (s) => s.put({ ...p, updatedAt: Date.now() })),
  remove: (id) => tx('projects', 'readwrite', (s) => s.delete(id)),
};

export const blobs = {
  get: (key) => tx('blobs', 'readonly', (s) => s.get(key)),
  put: (key, blob) => tx('blobs', 'readwrite', (s) => s.put(blob, key)),
  remove: (key) => tx('blobs', 'readwrite', (s) => s.delete(key)),
};

export const newId = () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
