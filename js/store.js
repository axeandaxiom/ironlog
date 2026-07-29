// Persistence. Everything lives in localStorage on this device; sync is an
// explicit file export/import so there is no server and no account.

import { uid, todayISO } from './util.js';

const KEY = 'ironlog.db';
const SCHEMA = 3;

function defaultDB() {
  return {
    schema: SCHEMA,
    createdAt: new Date().toISOString(),
    settings: {
      units: 'kg',
      barWeight: 20,
      // Typical Estonian commercial-gym set, kg per plate.
      plates: [25, 20, 15, 10, 5, 2.5, 1.25],
      restSec: { main: 240, assistance: 120, conditioning: 60 },
      autoRest: true,
      keepAwake: true,
      soundOnRestEnd: true,
    },
    profile: {
      name: '',
      sex: 'male',
      age: null,
      heightCm: null,
      bodyweightKg: null,
      activity: 'moderate',
      goal: 'gain',
      experience: 'novice',
    },
    // Active program state. `working` holds the next prescribed top-set weight
    // in kg for each lift; `fails` counts consecutive missed sessions per lift.
    program: {
      id: 'ss-novice',
      phase: 1,
      startedAt: todayISO(),
      working: {},
      fails: {},
      cursor: 0,          // index into the program's rotation
      increments: {},     // per-lift override of the default jump
      tmWeek: 0,          // Texas Method: which press variant this week
    },
    sessions: [],         // completed + in-progress training sessions
    activeSession: null,  // the one currently being run, if any
    metrics: {
      defs: [],           // health metric definitions
      entries: [],
    },
    nutrition: {
      targets: null,      // {kcal, protein, carbs, fat, basis:{...}}
      log: [],            // {id, date, meal, name, qty, unit, kcal, p, c, f}
      customFoods: [],
    },
    lab: {
      customTests: [],    // user-defined movement tests
      results: [],        // {id, testId, date, side, metrics:{}, raw?, notes}
    },
    // Your own movements and your own programmes. Both are registered into the
    // built-in catalogues at boot, so everything downstream — progression,
    // warm-ups, plate maths, charts — treats them identically to the built-ins.
    customExercises: [],
    customPrograms: [],
    prs: {},              // {exerciseId: {weight, reps, date, e1rm}}
  };
}

let db = null;
const listeners = new Set();

export function load() {
  if (db) return db;
  try {
    const raw = localStorage.getItem(KEY);
    db = raw ? migrate(JSON.parse(raw)) : defaultDB();
  } catch (err) {
    console.error('DB load failed, starting fresh', err);
    db = defaultDB();
  }
  return db;
}

function migrate(data) {
  const fresh = defaultDB();
  if (!data || typeof data !== 'object') return fresh;

  // Deep-merge onto the current defaults so a file written by an older build
  // gains new fields instead of crashing on a missing key.
  const merged = { ...fresh, ...data, schema: SCHEMA };
  merged.settings = { ...fresh.settings, ...(data.settings || {}) };
  merged.settings.restSec = { ...fresh.settings.restSec, ...(data.settings?.restSec || {}) };
  merged.profile = { ...fresh.profile, ...(data.profile || {}) };
  merged.program = { ...fresh.program, ...(data.program || {}) };
  merged.metrics = { ...fresh.metrics, ...(data.metrics || {}) };
  merged.nutrition = { ...fresh.nutrition, ...(data.nutrition || {}) };
  merged.lab = { ...fresh.lab, ...(data.lab || {}) };
  merged.customExercises = data.customExercises || [];
  merged.customPrograms = data.customPrograms || [];
  merged.sessions = data.sessions || [];
  merged.prs = data.prs || {};
  return merged;
}

let saveTimer = null;
export function save({ immediate = false } = {}) {
  const write = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (err) {
      // Quota is the realistic failure here — a few years of sessions is well
      // under 5 MB, but raw sensor traces are not, so they get trimmed on write.
      console.error('Save failed', err);
      alert('Could not save to this device. Export your data now — storage may be full.');
    }
    listeners.forEach((fn) => fn(db));
  };
  clearTimeout(saveTimer);
  if (immediate) write();
  else saveTimer = setTimeout(write, 120);
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const get = () => db || load();

/** Mutate then persist: update(d => { d.profile.age = 40 }) */
export function update(fn, opts) {
  fn(get());
  save(opts);
  return db;
}

// ---------- export / import ----------
export function exportJSON() {
  return JSON.stringify({ ...get(), exportedAt: new Date().toISOString() }, null, 2);
}

export function exportFilename() {
  return `ironlog-${todayISO()}.json`;
}

/**
 * Replace-or-merge an imported file.
 * merge keeps both sides' records, de-duplicated by id, and prefers the
 * incoming copy when ids collide — the assumption being you export from the
 * device you just trained on.
 */
export function importJSON(text, { mode = 'merge' } = {}) {
  const raw = JSON.parse(text);
  const incoming = migrate(raw);
  // migrate() fills in a default programme for any file that lacks one, so
  // `incoming.program` is never absent — only ever real or fabricated. Ask the
  // raw file instead, or an import that carries no programme at all would hand
  // over an empty one and wipe the working weights on this device.
  const carriesProgram = Object.prototype.hasOwnProperty.call(raw, 'program');
  if (mode === 'replace') {
    db = incoming;
    save({ immediate: true });
    return { sessions: db.sessions.length, mode };
  }

  const byId = (a = [], b = []) => {
    const map = new Map(a.map((x) => [x.id, x]));
    b.forEach((x) => map.set(x.id, x));
    return [...map.values()];
  };

  const cur = get();
  // Captured before the merge: afterwards cur.sessions contains the incoming
  // ones too, and comparing the two would always be a tie.
  const newest = (arr) => (arr || []).reduce((a, s) => (s.date > a ? s.date : a), '');
  const localNewest = newest(cur.sessions);
  const incomingNewest = newest(incoming.sessions);

  cur.sessions = byId(cur.sessions, incoming.sessions).sort((a, b) => (a.date < b.date ? -1 : 1));
  cur.metrics.defs = byId(cur.metrics.defs, incoming.metrics.defs);
  cur.metrics.entries = byId(cur.metrics.entries, incoming.metrics.entries);
  // Readings for a metric nobody has set up would otherwise import as data
  // with nothing to display it. Give any orphan a definition so it charts.
  const defined = new Set(cur.metrics.defs.map((d) => d.id));
  for (const e of cur.metrics.entries) {
    if (defined.has(e.metricId)) continue;
    defined.add(e.metricId);
    cur.metrics.defs.push({
      id: e.metricId, label: e.metricId, unit: '', kind: 'number',
      dp: 1, better: 'flat', recovered: true,
    });
  }
  cur.nutrition.log = byId(cur.nutrition.log, incoming.nutrition.log);
  cur.nutrition.customFoods = byId(cur.nutrition.customFoods, incoming.nutrition.customFoods);
  cur.lab.customTests = byId(cur.lab.customTests, incoming.lab.customTests);
  cur.lab.results = byId(cur.lab.results, incoming.lab.results);
  cur.customExercises = byId(cur.customExercises, incoming.customExercises);
  cur.customPrograms = byId(cur.customPrograms, incoming.customPrograms);

  // Program state is single-valued, so one side has to win — and it must be
  // decided by recency, not by session count.
  //
  // Counting was wrong in exactly the case that matters most: importing a
  // backlog of old training. Twenty sessions from last year would outnumber
  // the two on this device and replace your current working weights and your
  // place in the rotation with whatever the file happened to carry.
  //
  // The device that trained most recently is the one whose programme state is
  // current, whatever the volume of history behind it.
  // A backlog of transcribed paper sessions is history by definition: it says
  // what you did, never where you are now. It must not move the rotation or
  // the working weights however recent its newest entry looks.
  if (carriesProgram && !raw.backlogImport && incomingNewest > localNewest) {
    cur.program = incoming.program;
  }
  for (const [ex, pr] of Object.entries(incoming.prs || {})) {
    if (!cur.prs[ex] || pr.e1rm > cur.prs[ex].e1rm) cur.prs[ex] = pr;
  }

  save({ immediate: true });
  return { sessions: cur.sessions.length, mode };
}

export function wipe() {
  localStorage.removeItem(KEY);
  db = defaultDB();
  save({ immediate: true });
}

// ---------- record helpers ----------
export function addMetricEntry(metricId, value, date = todayISO(), note = '') {
  update((d) => {
    // One reading per metric per day: a re-entry corrects rather than duplicates.
    const existing = d.metrics.entries.find((e) => e.metricId === metricId && e.date === date);
    if (existing) Object.assign(existing, { value, note });
    else d.metrics.entries.push({ id: uid(), metricId, date, value, note });
  });
}

export function metricSeries(metricId, days = 365) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return get().metrics.entries
    .filter((e) => e.metricId === metricId && e.date >= cutoff && typeof e.value === 'number')
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((e) => ({ x: e.date, y: e.value }));
}

/** Update the all-time best for a lift if this set beats it on estimated 1RM. */
export function recordPR(exerciseId, weight, reps, date, est) {
  const d = get();
  const cur = d.prs[exerciseId];
  if (!cur || est > cur.e1rm + 1e-6) {
    d.prs[exerciseId] = { weight, reps, date, e1rm: est };
    return true;
  }
  return false;
}
