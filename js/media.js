// Media attached to individual sets: video, audio notes, photos.
//
// This does NOT live in localStorage. A single phone clip of a squat is
// several megabytes and localStorage is a ~5 MB string store — one video would
// take the whole training log down with it. Blobs go in IndexedDB, which has a
// far larger quota and stores binary natively, and only a small metadata
// record goes in the session alongside the set.

const DB_NAME = 'ironlog-media';
const STORE = 'blobs';
const VERSION = 1;

let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let req;
    try { req = fn(store); } catch (err) { reject(err); return; }
    // Resolve with the request's own result, which is `undefined` for a miss
    // and for a delete. Resolving with the request object instead would make
    // every existence check truthy.
    t.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('aborted'));
  }));
}

export const supported = typeof indexedDB !== 'undefined';

/**
 * True if a set carries a comment or any media — drives the dot on the set
 * row. Lives here rather than in the view so it can be imported (and tested)
 * without pulling in the DOM shell.
 */
export const hasAttachments = (set) =>
  !!(set.note?.trim() || (set.media && set.media.length));

export async function put(id, blob, meta = {}) {
  await tx('readwrite', (s) => s.put({
    id, blob, mime: blob.type, size: blob.size, ts: Date.now(), ...meta,
  }));
  return { id, mime: blob.type, size: blob.size, ts: Date.now(), ...meta };
}

export async function get(id) {
  return tx('readonly', (s) => s.get(id));
}

export async function remove(id) {
  return tx('readwrite', (s) => s.delete(id));
}

export async function listAll() {
  return tx('readonly', (s) => s.getAll());
}

/** Total bytes held, for the storage readout. */
export async function totalSize() {
  const all = await listAll();
  return all.reduce((a, r) => a + (r.size || 0), 0);
}

/** Delete anything no longer referenced by a session — media outlives its set otherwise. */
export async function prune(db) {
  const referenced = new Set();
  const scan = (s) => {
    for (const e of s.entries || []) {
      for (const set of [...(e.sets || []), ...(e.warmupSets || [])]) {
        for (const m of set.media || []) referenced.add(m.id);
      }
    }
  };
  db.sessions.forEach(scan);
  if (db.activeSession) scan(db.activeSession);

  const all = await listAll();
  const orphans = all.filter((r) => !referenced.has(r.id));
  for (const o of orphans) await remove(o.id);
  return { removed: orphans.length, freed: orphans.reduce((a, r) => a + (r.size || 0), 0) };
}

/** Object URLs must be revoked or the blob stays pinned in memory. */
const urls = new Map();

export async function objectURL(id) {
  if (urls.has(id)) return urls.get(id);
  const rec = await get(id);
  if (!rec) return null;
  const url = URL.createObjectURL(rec.blob);
  urls.set(id, url);
  return url;
}

export function releaseURL(id) {
  const u = urls.get(id);
  if (u) { URL.revokeObjectURL(u); urls.delete(id); }
}

export function releaseAll() {
  for (const [id] of urls) releaseURL(id);
}

export const fmtBytes = (b) => {
  if (!b) return '0 KB';
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

// ---------------------------------------------------------------------------
// Audio notes
//
// Recorded in-page with MediaRecorder rather than handed off to the system
// recorder. That matters here: leaving the app to record would suspend the
// page, and the round timer's bells would stop firing. Recording in-page keeps
// the timers alive and audible.
// ---------------------------------------------------------------------------

export class AudioNote {
  constructor() {
    this.recorder = null;
    this.chunks = [];
    this.stream = null;
    this.startedAt = 0;
  }

  static get supported() {
    return typeof MediaRecorder !== 'undefined'
      && !!navigator.mediaDevices?.getUserMedia;
  }

  /** Pick a container the browser will actually produce. Safari differs. */
  static pickMime() {
    const candidates = [
      'audio/mp4',
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
    ];
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported?.(c)) return c;
    }
    return '';
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = AudioNote.pickMime();
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    this.recorder.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.recorder.start();
    this.startedAt = Date.now();
  }

  get seconds() {
    return this.startedAt ? (Date.now() - this.startedAt) / 1000 : 0;
  }

  stop() {
    return new Promise((resolve, reject) => {
      if (!this.recorder) { reject(new Error('not recording')); return; }
      this.recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.recorder.mimeType || 'audio/webm' });
        this.stream.getTracks().forEach((t) => t.stop());
        this.stream = null;
        this.recorder = null;
        resolve(blob);
      };
      this.recorder.onerror = (e) => reject(e.error || new Error('recording failed'));
      this.recorder.stop();
    });
  }

  cancel() {
    try { this.recorder?.stop(); } catch { /* already stopped */ }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
  }
}
