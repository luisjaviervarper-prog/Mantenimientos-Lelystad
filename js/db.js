// Almacenamiento local en IndexedDB: mantenimientos, fotos y ajustes (kv).
const DB_NAME = 'osmos-mantenimiento';
const DB_VER = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('mant')) db.createObjectStore('mant', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('fotos')) {
        const s = db.createObjectStore('fotos', { keyPath: 'id' });
        s.createIndex('mant', 'mant');
      }
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}

function req(r) {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

async function store(name, mode = 'readonly') {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

export const db = {
  async get(name, key) { return req((await store(name)).get(key)); },
  async put(name, val, key) { return req((await store(name, 'readwrite')).put(val, key)); },
  async del(name, key) { return req((await store(name, 'readwrite')).delete(key)); },
  async all(name) { return req((await store(name)).getAll()); },
  async clear(name) { return req((await store(name, 'readwrite')).clear()); },
  async byIndex(name, index, value) { return req((await store(name)).index(index).getAll(value)); },
  // atajos
  kvGet(k) { return this.get('kv', k); },
  kvSet(k, v) { return this.put('kv', v, k); },
};

export function uid(prefix = '') {
  const a = crypto.getRandomValues(new Uint8Array(8));
  return prefix + Date.now().toString(36) + Array.from(a, b => b.toString(16).padStart(2, '0')).join('').slice(0, 8);
}
