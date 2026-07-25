// @ts-check
/**
 * Thin IndexedDB wrapper — three object stores, all keyed for a future
 * cloud-sync layer that diffs by `updatedAt`:
 *   - `srs`     one record per deck entry (keyPath: entryId) — the card state.
 *   - `reviews` append-only rating log (autoIncrement) — stats, streaks, FSRS.
 *   - `chats`   conversation logs (keyPath: sessionId) — populated in Phase 2.
 *
 * Kept hand-rolled (no CDN/npm import) to preserve the no-third-party-scripts
 * security posture the browser-direct API key depends on.
 *
 * @typedef {import('../srs/scheduler.mjs').Card} Card
 * @typedef {{ id?: number, entryId: string, rating: string, ts: number, prevState: string, newState: string }} ReviewLog
 */

const DB_NAME = 'konus';
const DB_VERSION = 1;

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;

/** @returns {Promise<IDBDatabase>} */
function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('srs')) {
        db.createObjectStore('srs', { keyPath: 'entryId' });
      }
      if (!db.objectStoreNames.contains('reviews')) {
        const reviews = db.createObjectStore('reviews', { keyPath: 'id', autoIncrement: true });
        reviews.createIndex('ts', 'ts');
      }
      if (!db.objectStoreNames.contains('chats')) {
        db.createObjectStore('chats', { keyPath: 'sessionId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/**
 * @template T
 * @param {IDBRequest<T>} req
 * @returns {Promise<T>}
 */
function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * @param {IDBTransaction} tx
 * @returns {Promise<void>}
 */
function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * @param {'srs' | 'reviews' | 'chats'} store
 * @returns {Promise<any[]>}
 */
export async function getAll(store) {
  const db = await open();
  return wrap(db.transaction(store, 'readonly').objectStore(store).getAll());
}

/**
 * @param {'srs' | 'chats'} store
 * @param {IDBValidKey} key
 * @returns {Promise<any | undefined>}
 */
export async function get(store, key) {
  const db = await open();
  return wrap(db.transaction(store, 'readonly').objectStore(store).get(key));
}

/**
 * @param {'srs' | 'reviews' | 'chats'} store
 * @param {object} value
 * @returns {Promise<void>}
 */
export async function put(store, value) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  return done(tx);
}

/**
 * Write many records in a single transaction.
 * @param {'srs' | 'reviews' | 'chats'} store
 * @param {object[]} values
 * @returns {Promise<void>}
 */
export async function bulkPut(store, values) {
  if (!values.length) return;
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const value of values) os.put(value);
  return done(tx);
}

/**
 * @param {'srs' | 'chats'} store
 * @param {IDBValidKey} key
 * @returns {Promise<void>}
 */
export async function remove(store, key) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  return done(tx);
}

/** Convenience accessors -------------------------------------------------- */

/** @returns {Promise<Card[]>} */
export function allCards() {
  return getAll('srs');
}

/** @param {Card} card @returns {Promise<void>} */
export function saveCard(card) {
  return put('srs', card);
}

/** @param {Card[]} cards @returns {Promise<void>} */
export function saveCards(cards) {
  return bulkPut('srs', cards);
}

/** @param {ReviewLog} log @returns {Promise<void>} */
export function logReview(log) {
  return put('reviews', log);
}

/** @returns {Promise<ReviewLog[]>} */
export function allReviews() {
  return getAll('reviews');
}

/** @param {{ sessionId: string } & Record<string, any>} session @returns {Promise<void>} */
export function saveChat(session) {
  return put('chats', session);
}

/** @param {string} sessionId @returns {Promise<any | undefined>} */
export function getChat(sessionId) {
  return get('chats', sessionId);
}
