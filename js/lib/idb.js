// Wrapper mínimo de IndexedDB com promessas.

const DB_NAME = 'rumo-sefaz';
const DB_VERSION = 1;

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('profiles', { keyPath: 'id' });
      for (const name of ['answers', 'reviews', 'simulados']) {
        // Chave composta: o mesmo evento pode existir em dois perfis (ex.: backup restaurado).
        const s = db.createObjectStore(name, { keyPath: ['profileId', 'id'] });
        s.createIndex('profileId', 'profileId');
      }
      db.createObjectStore('kv', { keyPath: ['profileId', 'key'] }).createIndex('profileId', 'profileId');
      db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true }).createIndex('profileId', 'profileId');
      db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('transação abortada'));
  });
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function get(store, key) {
  const db = await openDB();
  return wrap(db.transaction(store).objectStore(store).get(key));
}

export async function all(store) {
  const db = await openDB();
  return wrap(db.transaction(store).objectStore(store).getAll());
}

export async function byIndex(store, index, value) {
  const db = await openDB();
  return wrap(db.transaction(store).objectStore(store).index(index).getAll(value));
}

/** Executa `fn(tx)` numa transação de escrita sobre `stores` e espera concluir. */
export async function write(stores, fn) {
  const db = await openDB();
  const tx = db.transaction(stores, 'readwrite');
  const result = fn(tx);
  await done(tx);
  return result;
}

export async function put(store, value) {
  return write([store], tx => { tx.objectStore(store).put(value); });
}

export async function del(store, key) {
  return write([store], tx => { tx.objectStore(store).delete(key); });
}
