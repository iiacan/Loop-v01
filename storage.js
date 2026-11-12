// Storage adapter. Everything else talks to this small interface
// (getAll / put / bulkPut / remove / replaceAll), so a future Loop Core
// backend can be added as another adapter without touching the UI.
export const STORES = ['loops', 'sectors', 'plans', 'meta'];
const DB = 'loop-db';
const VER = 1;

const req = (r) =>
  new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      STORES.forEach((s) => {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('The database is blocked by another open tab.'));
  });
}

function tx(db, stores, fn) {
  return new Promise((res, rej) => {
    const t = db.transaction(stores, 'readwrite');
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('Storage transaction aborted'));
    fn(t);
    // Commit straight away so a change survives even if the tab closes a moment later.
    try { t.commit?.(); } catch {}
  });
}

async function idbAdapter() {
  const db = await openDB();
  return {
    kind: 'indexeddb',
    label: 'IndexedDB — inside this browser, on this device only',
    getAll: (s) => req(db.transaction(s).objectStore(s).getAll()),
    put: (s, v) => tx(db, [s], (t) => t.objectStore(s).put(v)),
    bulkPut: (s, vs) => tx(db, [s], (t) => vs.forEach((v) => t.objectStore(s).put(v))),
    remove: (s, id) => tx(db, [s], (t) => t.objectStore(s).delete(id)),
    // Atomic: either every store is replaced or nothing changes.
    replaceAll: (data) =>
      tx(db, STORES, (t) =>
        STORES.forEach((s) => {
          const os = t.objectStore(s);
          os.clear();
          (data[s] || []).forEach((v) => os.put(v));
        })
      ),
  };
}

function memoryAdapter() {
  const m = Object.fromEntries(STORES.map((s) => [s, new Map()]));
  return {
    kind: 'memory',
    label: 'Temporary memory only — this browser is blocking IndexedDB, so nothing will survive a refresh',
    getAll: async (s) => [...m[s].values()],
    put: async (s, v) => void m[s].set(v.id, v),
    bulkPut: async (s, vs) => vs.forEach((v) => m[s].set(v.id, v)),
    remove: async (s, id) => void m[s].delete(id),
    replaceAll: async (data) =>
      STORES.forEach((s) => {
        m[s].clear();
        (data[s] || []).forEach((v) => m[s].set(v.id, v));
      }),
  };
}

export async function getAdapter() {
  try {
    if (!('indexedDB' in globalThis)) throw new Error('no indexedDB');
    return await idbAdapter();
  } catch (e) {
    console.warn('IndexedDB unavailable, using memory', e);
    return memoryAdapter();
  }
}
