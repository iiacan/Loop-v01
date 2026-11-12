/* Loop — db.js: storage adapters.
   Every adapter exposes the same async interface, so a future Loop Core backend
   can be added as a third adapter without touching the rest of the app:
     init(), getAll(store), put(store, obj), del(store, id), clear(store), bulkPut(store, arr)
   Stores: loops, sectors, plans, meta. Every record has a string `id`. */
(function () {
  'use strict';
  const L = (window.Loop = window.Loop || {});
  const STORES = (L.STORES = ['loops', 'sectors', 'plans', 'meta']);
  const DB_NAME = 'loop-db', DB_VERSION = 1;

  function idbAdapter() {
    let db = null;
    const req2p = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const tx = (store, mode, fn) => new Promise((res, rej) => {
      const t = db.transaction(store, mode); const out = fn(t.objectStore(store));
      t.oncomplete = () => res(out && out.result !== undefined ? out.result : undefined);
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Transaction aborted'));
    });
    return {
      name: 'IndexedDB', label: 'Browser storage (IndexedDB) on this device', persistent: true,
      init() {
        return new Promise((res, rej) => {
          if (!('indexedDB' in window)) return rej(new Error('IndexedDB unavailable'));
          let r;
          try { r = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { return rej(e); }
          r.onupgradeneeded = () => { STORES.forEach((s) => { if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' }); }); };
          r.onsuccess = () => { db = r.result; db.onversionchange = () => db.close(); res(); };
          r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('Database blocked'));
        });
      },
      getAll: (store) => new Promise((res, rej) => { const t = db.transaction(store, 'readonly'); req2p(t.objectStore(store).getAll()).then(res, rej); }),
      put: (store, obj) => tx(store, 'readwrite', (os) => { os.put(obj); }),
      del: (store, id) => tx(store, 'readwrite', (os) => { os.delete(id); }),
      clear: (store) => tx(store, 'readwrite', (os) => { os.clear(); }),
      bulkPut: (store, arr) => tx(store, 'readwrite', (os) => { arr.forEach((o) => os.put(o)); })
    };
  }

  function memoryAdapter() {
    const data = {}; STORES.forEach((s) => (data[s] = new Map()));
    const ok = () => Promise.resolve();
    return {
      name: 'Memory', label: 'Temporary memory only — nothing is saved in this browser', persistent: false,
      init: ok,
      getAll: (s) => Promise.resolve(Array.from(data[s].values()).map((o) => JSON.parse(JSON.stringify(o)))),
      put: (s, o) => { data[s].set(o.id, JSON.parse(JSON.stringify(o))); return ok(); },
      del: (s, id) => { data[s].delete(id); return ok(); },
      clear: (s) => { data[s].clear(); return ok(); },
      bulkPut: (s, arr) => { arr.forEach((o) => data[s].set(o.id, JSON.parse(JSON.stringify(o)))); return ok(); }
    };
  }

  L.openStorage = async function () {
    const idb = idbAdapter();
    try { await idb.init(); await idb.getAll('meta'); return idb; }
    catch (e) { console.warn('Loop: IndexedDB unavailable, using memory.', e); const m = memoryAdapter(); await m.init(); return m; }
  };
})();
