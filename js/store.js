// Stockage local : IndexedDB, avec repli sur localStorage.
const DB = 'prepa-marathon-2027', STORE = 'kv', KEY = 'state';

export const defaultState = () => ({
  v: 1,
  settings: { targetSec: 12000, startTime: '08:30', sessionsMode: 'auto', strength: true, carbsPerH: 60, gelCarbs: 25, reduceMotion: false },
  refs: [{ id: 'r0', date: null, distKm: 20, timeSec: 5460, label: '20 km de Tours' }],
  activeRef: 'r0',
  sess: {},       // { "12-1": { status, movedTo, doneDate, km, dur, rpe, hr, shoe, note } }
  weekScale: {},  // { 12: 0.8 }
  extras: [],     // sorties libres
  shoes: [],
  lastShoe: null,
  checklist: {},
});

const open = () => new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});

export async function load() {
  try {
    const db = await open();
    const v = await new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(KEY); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    if (v) return merge(v);
  } catch (e) { /* repli */ }
  try { const raw = localStorage.getItem(KEY); if (raw) return merge(JSON.parse(raw)); } catch (e) { /* ignore */ }
  return defaultState();
}

export const merge = v => { const d = defaultState(); return { ...d, ...v, settings: { ...d.settings, ...(v.settings || {}) } }; };

export async function save(state) {
  try {
    const db = await open();
    await new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(state, KEY); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  } catch (e) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e2) { console.warn('Sauvegarde impossible', e2); }
  }
}
export const persist = () => navigator.storage && navigator.storage.persist ? navigator.storage.persist().catch(() => false) : false;
