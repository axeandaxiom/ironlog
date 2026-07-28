// Logic tests. Open tests.html in a browser; every assertion runs in the same
// environment the app runs in, which is the point — there is no build step and
// no Node, so the browser is the test runner.

import { platesFor, roundTo, symmetryIndex, e1rm, movingAverage, parseNum, numInput } from './js/util.js';
import { warmupSets, applySession, nextWorkout, PROGRAMS, incrementFor } from './js/programs.js';
import { plan, bmr, calibrate, scaleFood, dayTotals, FOODS } from './js/nutrition.js';
import { RECIPES, computeMacros } from './js/data/recipes.js';
import { analyseJump, analyseSway } from './js/sensors.js';
import { BUILTIN_TESTS, asymmetry, personalBest } from './js/movement.js';
import { MAIN_LIFTS, ASSISTANCE, CONDITIONING, findExercise } from './js/data/exercises.js';
import * as store from './js/store.js';

let pass = 0, fail = 0;
const out = document.getElementById('out');
let list = null;

const group = (name) => {
  out.append(Object.assign(document.createElement('div'), { className: 'grp', textContent: name }));
  list = document.createElement('ul');
  out.append(list);
};

function ok(cond, label, detail = '') {
  const li = document.createElement('li');
  li.className = cond ? 'pass' : 'fail';
  li.textContent = `${cond ? '✓' : '✗'} ${label}`;
  list.append(li);
  if (!cond && detail) {
    const d = document.createElement('div');
    d.className = 'detail';
    d.textContent = detail;
    list.append(d);
  }
  cond ? pass++ : fail++;
}

const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

/**
 * Energy plausibility check.
 *
 * Naive Atwater (4/4/9) does not reconcile for real foods, and that is food
 * science rather than a bug: fibre is counted as carbohydrate on a label but
 * yields little energy, and polyols yield almost none. Unsweetened cocoa is
 * roughly 58 % fibre by carbohydrate weight, so its true calories are barely
 * half of what 4/4/9 predicts.
 *
 * So the invariant is a band, not an equality:
 *   upper — stated energy may not EXCEED what the macros can physically
 *           supply (a small margin for rounding). This is the bound that
 *           actually catches typos and wrong serving sizes.
 *   lower — stated energy may not fall below half of Atwater, which no real
 *           whole food does, cocoa being the extreme case.
 */
function atwaterBand(kcal, p, c, f, { upper = 1.08, lower = 0.5 } = {}) {
  const at = p * 4 + c * 4 + f * 9;
  if (at === 0 && kcal === 0) return { ok: true, ratio: 1 };
  if (at === 0) return { ok: false, why: `${kcal} kcal from zero macros` };
  const ratio = kcal / at;
  if (ratio > upper) return { ok: false, ratio, why: `${Math.round(kcal)} kcal exceeds the ${Math.round(at)} kcal its macros can supply (${ratio.toFixed(2)}×)` };
  if (ratio < lower) return { ok: false, ratio, why: `${Math.round(kcal)} kcal is implausibly far below Atwater's ${Math.round(at)} (${ratio.toFixed(2)}×)` };
  return { ok: true, ratio };
}

const SETTINGS = { units: 'kg', barWeight: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] };

// ---------------------------------------------------------------- plate math
group('Plate maths');
{
  const r = platesFor(100, 20, SETTINGS.plates);
  ok(near(r.achieved, 100) && r.short === 0, '100 kg loads exactly',
     JSON.stringify(r));
  ok(JSON.stringify(r.perSide) === JSON.stringify([{ plate: 25, count: 1 }, { plate: 15, count: 1 }]),
     '100 kg = 25 + 15 per side', JSON.stringify(r.perSide));

  const bar = platesFor(20, 20, SETTINGS.plates);
  ok(bar.perSide.length === 0 && bar.short === 0, 'empty bar needs no plates');

  const odd = platesFor(21, 20, [25, 20, 10, 5, 2.5]);
  ok(odd.short > 0, 'unloadable weight is reported as short, not silently rounded',
     JSON.stringify(odd));

  ok(near(platesFor(62.5, 20, SETTINGS.plates).achieved, 62.5),
     '62.5 kg reachable with 1.25 plates');
  ok(roundTo(24, 2.5) === 25 && roundTo(23, 2.5) === 22.5, 'roundTo snaps to the loading step');
}

// ---------------------------------------------------------------- warm-ups
group('Warm-up ladders');
{
  const w = warmupSets(100, 'full', SETTINGS);
  ok(w.length === 5, 'full scheme gives 2 bar sets + 3 ramps', JSON.stringify(w));
  ok(w[0].weight === 20 && w[1].weight === 20, 'starts with two sets of the empty bar');
  ok(w.every((s) => s.weight < 100), 'no warm-up set reaches the work weight');
  ok(w.every((s, i) => i === 0 || s.weight >= w[i - 1].weight), 'ladder never goes backwards');
  ok(w.every((s) => near(s.weight % 2.5, 0) || near(s.weight % 2.5, 2.5)),
     'every warm-up weight is loadable', JSON.stringify(w.map((s) => s.weight)));

  const light = warmupSets(25, 'full', SETTINGS);
  ok(light.every((s) => s.weight <= 25), 'a near-empty bar does not generate heavier warm-ups',
     JSON.stringify(light));

  const dl = warmupSets(140, 'deadlift', SETTINGS);
  ok(!dl.some((s) => s.label === 'Bar'), 'deadlift scheme skips the empty bar');

  const atBar = warmupSets(20, 'full', SETTINGS);
  ok(atBar.length === 2 && atBar.every((s) => s.weight === 20), 'work weight = bar gives bar sets only');
}

// ---------------------------------------------------------------- progression
group('Novice linear progression');

function freshDB(overrides = {}) {
  return {
    settings: SETTINGS,
    profile: { bodyweightKg: 90 },
    program: {
      id: 'ss-novice', phase: 1, cursor: 0, tmWeek: 0,
      working: { squat: 100, press: 50, bench: 70, deadlift: 140, powerclean: 60, chinup: 0 },
      fails: {}, increments: {},
    },
    sessions: [],
    ...overrides,
  };
}

function sessionFor(db, results) {
  const wk = nextWorkout(db);
  return {
    label: wk.label, type: 'lift', programId: wk.programId,
    entries: wk.items.map((i) => ({
      exerciseId: i.exerciseId,
      prescribedSets: i.sets,
      prescribedReps: i.reps,
      toFailure: i.toFailure,
      light: i.light,
      sets: Array.from({ length: i.sets }, () => ({
        weight: i.weight,
        reps: results[i.exerciseId] ?? i.reps,
        done: true,
      })),
    })),
  };
}

{
  const db = freshDB();
  applySession(db, sessionFor(db, {}));
  ok(db.program.working.squat === 102.5, 'successful squat gains 2.5 kg', String(db.program.working.squat));
  ok(db.program.working.deadlift === 145, 'successful deadlift gains 5 kg', String(db.program.working.deadlift));
  ok(db.program.cursor === 1, 'rotation advances');

  const wk2 = nextWorkout(db);
  ok(wk2.label === 'B', 'A alternates to B');
  ok(wk2.items.some((i) => i.exerciseId === 'bench'), 'workout B presses the bench');
  ok(!wk2.items.some((i) => i.exerciseId === 'press'), 'workout B has no standing press');
}

{
  // Three consecutive misses must reset to 90 %, and only on the third.
  const db = freshDB();
  applySession(db, sessionFor(db, { squat: 4 }));
  ok(db.program.working.squat === 100 && db.program.fails.squat === 1,
     'first miss repeats the weight', JSON.stringify(db.program.fails));

  applySession(db, sessionFor(db, { squat: 4 }));
  ok(db.program.working.squat === 100 && db.program.fails.squat === 2, 'second miss still repeats');

  applySession(db, sessionFor(db, { squat: 3 }));
  ok(db.program.working.squat === 90, 'third miss resets to 90 %', String(db.program.working.squat));
  ok(db.program.fails.squat === 0, 'fail counter clears on reset');
  ok(db.program.fails['squat.resets'] === 1, 'reset is recorded');
  ok(incrementFor(db.program, 'squat') === MAIN_LIFTS.squat.lateIncrement,
     'increment drops to the small jump after a reset');
}

{
  // A success in between must clear the counter — misses have to be consecutive.
  const db = freshDB();
  applySession(db, sessionFor(db, { squat: 4 }));
  applySession(db, sessionFor(db, { squat: 4 }));
  applySession(db, sessionFor(db, {}));
  ok(db.program.fails.squat === 0, 'a good session clears the miss counter');
  applySession(db, sessionFor(db, { squat: 4 }));
  ok(db.program.working.squat > 90, 'no reset after only one fresh miss', String(db.program.working.squat));
}

{
  // Light days must not drive progression.
  const db = freshDB();
  db.program.phase = 3;
  const wk = nextWorkout(db);
  const lightSlot = PROGRAMS['ss-novice'].phases[3].rotation.findIndex((r) => r.label.includes('Light'));
  db.program.cursor = lightSlot;
  const lw = nextWorkout(db);
  const sq = lw.items.find((i) => i.exerciseId === 'squat');
  ok(sq.light === true, 'phase 3 has a light squat day');
  ok(near(sq.weight, roundTo(100 * 0.8, 2.5)), 'light squat is 80 % of the working weight', String(sq.weight));
  const before = db.program.working.squat;
  applySession(db, sessionFor(db, {}));
  ok(db.program.working.squat === before, 'a light day does not add weight', `${before} -> ${db.program.working.squat}`);
  void wk;
}

group('Texas Method');
{
  const db = freshDB();
  db.program.id = 'texas-method';
  db.program.cursor = 0;
  const vol = nextWorkout(db);
  ok(vol.label === 'Volume', 'week starts on the volume day');
  const volSquat = vol.items.find((i) => i.exerciseId === 'squat');
  ok(near(volSquat.weight, roundTo(100 * 0.9, 2.5)) && volSquat.sets === 5,
     'volume day is 5 × 5 at 90 %', JSON.stringify({ w: volSquat.weight, s: volSquat.sets }));

  const before = db.program.working.squat;
  applySession(db, sessionFor(db, {}));
  ok(db.program.working.squat === before, 'volume day does not progress the weight');

  db.program.cursor = 2;
  const int = nextWorkout(db);
  ok(int.label === 'Intensity' && int.items.find((i) => i.exerciseId === 'squat').sets === 1,
     'intensity day is a single set of five');
  applySession(db, sessionFor(db, {}));
  ok(db.program.working.squat === before + 2.5, 'intensity day progresses weekly',
     String(db.program.working.squat));
  ok(db.program.tmWeek === 1, 'week counter advances after the rotation completes');

  const nextVol = nextWorkout(db);
  ok(nextVol.items.some((i) => i.exerciseId === 'press'),
     'press and bench swap on the volume day in week 2',
     JSON.stringify(nextVol.items.map((i) => i.exerciseId)));
}

// ---------------------------------------------------------------- nutrition
group('Nutrition');
{
  // Mifflin-St Jeor, worked by hand: 10*90 + 6.25*185 - 5*40 + 5 = 1861.25
  const b = bmr({ sex: 'male', weightKg: 90, heightCm: 185, age: 40 });
  ok(near(b, 1861.25, 0.01), 'Mifflin-St Jeor matches the hand calculation', String(b));

  const p = plan({ sex: 'male', bodyweightKg: 90, heightCm: 185, age: 40, activity: 'moderate', goal: 'gain' });
  ok(p.tdee === Math.round(1861.25 * 1.55), 'TDEE applies the activity multiplier', String(p.tdee));
  ok(p.kcal === p.tdee + 400, 'gain goal adds a 400 kcal surplus');
  ok(p.protein === 180, 'protein is 2.0 g/kg on a gaining phase', String(p.protein));
  ok(p.fat >= Math.round(90 * 0.8), 'fat never drops below the 0.8 g/kg floor', String(p.fat));

  const back = p.protein * 4 + p.carbs * 4 + p.fat * 9;
  ok(Math.abs(back - p.kcal) <= 4, 'macros add back up to the calorie target',
     `${back} vs ${p.kcal}`);

  const cut = plan({ sex: 'male', bodyweightKg: 90, heightCm: 185, age: 40, activity: 'moderate', goal: 'cut' });
  ok(cut.protein > p.protein, 'protein goes up in a deficit, not down');
  ok(cut.kcal < p.kcal, 'a cut is fewer calories');

  // 14 daily readings span 13 days. Gaining exactly 1 kg across that span
  // implies 7700 / 13 ≈ 592 kcal/day of surplus.
  const series = Array.from({ length: 14 }, (_, i) => ({
    x: new Date(Date.now() - (13 - i) * 86400000).toISOString().slice(0, 10),
    y: 90 + i * (1 / 13),
  }));
  const expectedOffset = 7700 / 13;
  const cal = calibrate(3200, series);
  ok(cal && Math.abs(cal.impliedDailyOffset - expectedOffset) < 5,
     'bodyweight calibration recovers the daily surplus',
     `${cal?.impliedDailyOffset} vs expected ${expectedOffset.toFixed(0)}`);
  ok(cal && cal.days === 13, 'span is measured between first and last reading, not counted as readings',
     String(cal?.days));
  ok(cal.impliedTDEE === 3200 - cal.impliedDailyOffset, 'implied TDEE follows from the offset');

  const scaled = scaleFood(FOODS.find((f) => f.id === 'f-chicken'), 200);
  ok(scaled.kcal === 330 && near(scaled.p, 62, 0.05), '200 g chicken doubles the 100 g values',
     JSON.stringify(scaled));

  const totals = dayTotals([
    { date: '2026-01-01', kcal: 300, p: 30, c: 20, f: 5 },
    { date: '2026-01-01', kcal: 200, p: 10, c: 30, f: 2 },
    { date: '2026-01-02', kcal: 999, p: 99, c: 99, f: 99 },
  ], '2026-01-01');
  ok(totals.kcal === 500 && totals.p === 40 && totals.count === 2, 'day totals sum only that day',
     JSON.stringify(totals));
}

// ---------------------------------------------------------------- food table
group('Food table integrity');
{
  const ids = FOODS.map((f) => f.id);
  ok(new Set(ids).size === ids.length, `${ids.length} foods, ids unique`);
  ok(FOODS.every((f) => f.per > 0 && f.unit && f.name), 'every food has a serving size, unit and name');
  ok(FOODS.every((f) => [f.kcal, f.p, f.c, f.f].every((v) => typeof v === 'number' && v >= 0)),
     'no negative or missing macro values');

  const bad = FOODS
    .map((f) => ({ f, b: atwaterBand(f.kcal, f.p, f.c, f.f) }))
    .filter((x) => !x.b.ok)
    .map((x) => `${x.f.name}: ${x.b.why}`);
  ok(!bad.length, 'every food sits inside the plausible energy band', bad.join(' | '));

  // Surface the extremes so the fibre-heavy entries stay visible rather than
  // silently drifting.
  const ranked = FOODS
    .map((f) => ({ name: f.name, r: atwaterBand(f.kcal, f.p, f.c, f.f).ratio }))
    .filter((x) => Number.isFinite(x.r))
    .sort((a, b) => a.r - b.r);
  ok(true, `lowest energy ratio: ${ranked[0].name} at ${ranked[0].r.toFixed(2)}× (fibre), `
     + `highest: ${ranked.at(-1).name} at ${ranked.at(-1).r.toFixed(2)}×`);
}

// ---------------------------------------------------------------- recipes
group('Recipes');
{
  ok(RECIPES.length >= 20, `${RECIPES.length} recipes present`);
  const ids = new Set(RECIPES.map((r) => r.id));
  ok(ids.size === RECIPES.length, 'recipe ids are unique');

  let allResolve = true;
  const structural = [];
  const outOfBand = [];
  for (const r of RECIPES) {
    const m = computeMacros(r);
    // Every ingredient must resolve — an unresolved one silently contributes 0.
    for (const ing of r.ingredients) {
      if (!ing.food && !ing.extra && !ing.text && ing.kcal == null) allResolve = false;
    }
    if (m.kcal <= 0) structural.push(`${r.name}: non-positive calories`);
    if (!r.steps.length || !r.swaps.length) structural.push(`${r.name}: missing steps or swaps`);
    if (!r.servings || r.servings < 1) structural.push(`${r.name}: bad serving count`);
    const b = atwaterBand(m.kcal, m.p, m.c, m.f);
    if (!b.ok) outOfBand.push(`${r.name}: ${b.why}`);
  }
  ok(allResolve, 'every ingredient line resolves to a macro source');
  ok(!structural.length, 'every recipe is structurally complete', structural.join(' | '));
  ok(!outOfBand.length, 'every recipe sits inside the plausible energy band', outOfBand.join(' | '));

  const proteinRich = RECIPES.filter((r) => computeMacros(r).proteinPct >= 30);
  ok(proteinRich.length >= RECIPES.length * 0.6,
     `${proteinRich.length}/${RECIPES.length} recipes are ≥30 % protein by calories`);
}

// ---------------------------------------------------------------- sensors
group('Jump analysis (synthetic traces)');

/** Build a plausible 60 Hz trace: still, dip, push, free fall, landing, still. */
function jumpTrace(flightSec, hz = 60) {
  const s = [];
  const g = 9.81;
  const push = (t, m) => s.push({ t, mag: m });
  let t = 0;
  const step = 1 / hz;
  for (; t < 1.5; t += step) push(t, g + (Math.random() - 0.5) * 0.1);         // standing
  for (let i = 0; i < 12; i++, t += step) push(t, g * 0.6);                     // countermovement
  for (let i = 0; i < 10; i++, t += step) push(t, g * 2.2);                     // push-off
  for (let i = 0; i < Math.round(flightSec * hz); i++, t += step) push(t, 0.15);// flight
  for (let i = 0; i < 6; i++, t += step) push(t, g * 4);                        // landing
  for (let i = 0; i < 60; i++, t += step) push(t, g + (Math.random() - 0.5) * 0.1);
  return s;
}

{
  const res = analyseJump(jumpTrace(0.5));
  ok(res.ok, 'a clean jump trace analyses', res.reason || '');
  // h = g t^2 / 8 = 9.80665 * 0.25 / 8 = 0.3065 m
  ok(Math.abs(res.heightCm - 30.6) < 2.5, 'flight time converts to the right height',
     `${res.heightCm?.toFixed(1)} cm`);
  ok(Math.abs(res.flightTime - 0.5) < 0.04, 'flight time is recovered', String(res.flightTime));
  ok(res.heightErrCm > 0 && res.heightErrCm < 5, 'an uncertainty is reported', String(res.heightErrCm));

  const big = analyseJump(jumpTrace(0.7));
  ok(big.heightCm > res.heightCm, 'a longer flight gives a higher jump');

  const still = analyseJump(Array.from({ length: 200 }, (_, i) => ({ t: i / 60, mag: 9.81 })));
  ok(!still.ok, 'standing still is rejected rather than invented', JSON.stringify(still));

  const tooShort = analyseJump(jumpTrace(0.05));
  ok(!tooShort.ok, 'a stumble below the minimum flight time is rejected');

  const sparse = analyseJump(Array.from({ length: 30 }, (_, i) => ({ t: i / 5, mag: 9.81 })));
  ok(!sparse.ok, 'a too-low sample rate is refused rather than reported', JSON.stringify(sparse));
}

group('Sway analysis (synthetic traces)');
{
  const make = (amp, n = 1800) => Array.from({ length: n }, (_, i) => {
    const t = i / 60;
    return {
      t,
      gx: amp * Math.sin(t * 2.1),
      gy: 9.81 + amp * 0.2 * Math.sin(t * 1.3),
      gz: amp * Math.cos(t * 1.7),
      mag: 9.81,
    };
  });

  const steady = analyseSway(make(0.05));
  const wobbly = analyseSway(make(0.4));
  ok(steady.ok && wobbly.ok, 'sway traces analyse');
  ok(wobbly.rmsResultant > steady.rmsResultant, 'more movement gives a higher RMS',
     `${steady.rmsResultant?.toFixed(4)} vs ${wobbly.rmsResultant?.toFixed(4)}`);
  ok(wobbly.pathPerSec > steady.pathPerSec, 'more movement gives a longer sway path');
  ok(wobbly.ellipseArea > steady.ellipseArea, 'more movement gives a bigger 95 % ellipse');
  ok(steady.rmsResultant >= 0 && Number.isFinite(steady.ellipseArea), 'metrics are finite');

  const short = analyseSway(make(0.1, 30));
  ok(!short.ok, 'a too-short hold is rejected');
}

// ---------------------------------------------------------------- movement lab
group('Movement Lab');
{
  ok(BUILTIN_TESTS.length >= 25, `${BUILTIN_TESTS.length} built-in tests`);
  const ids = new Set(BUILTIN_TESTS.map((t) => t.id));
  ok(ids.size === BUILTIN_TESTS.length, 'test ids are unique');
  ok(BUILTIN_TESTS.every((t) => t.metrics?.length && t.protocol?.length && t.setup !== undefined),
     'every test has metrics, a protocol and a setup');
  ok(BUILTIN_TESTS.every((t) => ['jump', 'sway', 'incline', 'manual'].includes(t.mode)),
     'every test declares a known mode');
  ok(BUILTIN_TESTS.every((t) => t.metrics.every((m) => ['up', 'down', 'flat'].includes(m.better))),
     'every metric declares a direction');

  ok(near(symmetryIndex(90, 100), 90), 'symmetry index is weaker/stronger');
  ok(symmetryIndex(0, 0) === null, 'symmetry of nothing is null, not NaN');

  const test = BUILTIN_TESTS.find((t) => t.id === 't-slcmj');
  const db = {
    lab: {
      results: [
        { id: '1', testId: 't-slcmj', date: '2026-07-20', side: 'left', metrics: { heightCm: 25 } },
        { id: '2', testId: 't-slcmj', date: '2026-07-20', side: 'right', metrics: { heightCm: 30 } },
      ],
      customTests: [],
    },
  };
  const a = asymmetry(db, test, test.metrics[0]);
  ok(near(a.lsi, 83.333, 0.01), 'asymmetry computes the limb symmetry index', String(a.lsi));
  ok(a.worseSide === 'left', 'names the weaker side');
  ok(a.flag === 'high', 'flags a >15 % gap');
  ok(!a.stale, 'same-day measurements are not stale');

  db.lab.results[0].date = '2026-05-01';
  ok(asymmetry(db, test, test.metrics[0]).stale, 'measurements months apart are flagged stale');

  // "Lower is better" metrics must invert which side is called worse.
  const swayTest = BUILTIN_TESTS.find((t) => t.id === 't-sl-eo');
  const db2 = { lab: { results: [
    { id: '3', testId: 't-sl-eo', date: '2026-07-20', side: 'left', metrics: { pathPerSec: 9 } },
    { id: '4', testId: 't-sl-eo', date: '2026-07-20', side: 'right', metrics: { pathPerSec: 5 } },
  ], customTests: [] } };
  const a2 = asymmetry(db2, swayTest, swayTest.metrics[0]);
  ok(a2.worseSide === 'left', 'for a lower-is-better metric the larger value is the worse side');

  const pb = personalBest(db2, 't-sl-eo', swayTest.metrics[0]);
  ok(pb.v === 5, 'personal best on a lower-is-better metric is the minimum', JSON.stringify(pb));
}

// ---------------------------------------------------------------- catalogue
group('Exercise catalogue');
{
  const all = [...Object.values(MAIN_LIFTS), ...ASSISTANCE, ...CONDITIONING];
  const ids = all.map((e) => e.id);
  ok(new Set(ids).size === ids.length, `${ids.length} exercise ids, all unique`);
  ok(ids.every((id) => findExercise(id)), 'every id resolves through findExercise');
  ok(ASSISTANCE.filter((a) => a.equip === 'dumbbell').length >= 10, 'dumbbell work is covered');
  ok(ASSISTANCE.filter((a) => a.equip === 'kettlebell').length >= 10, 'kettlebell work is covered');
  ok(ASSISTANCE.filter((a) => a.equip === 'bodyweight').length >= 10, 'calisthenics are covered');
  for (const sport of ['boxing', 'bike', 'running']) {
    ok(CONDITIONING.filter((c) => c.sport === sport).length >= 5, `${sport} has real session variety`);
  }
  ok(CONDITIONING.every((c) => ['none', 'low', 'medium', 'high'].includes(c.interference)),
     'every conditioning session rates its interference cost');
  ok(Object.values(MAIN_LIFTS).every((l) => l.cues?.length >= 3), 'every main lift carries coaching cues');
}

// ---------------------------------------------------------------- input
group('Locale-tolerant number input');
{
  ok(parseNum('117,5') === 117.5, 'a comma decimal parses');
  ok(parseNum('117.5') === 117.5, 'a period decimal parses');
  ok(parseNum('1 234,5') === 1234.5, 'spaces are ignored');
  ok(Number.isNaN(parseNum('')), 'empty is NaN, not 0');
  ok(Number.isNaN(parseNum('abc')), 'nonsense is NaN, not 0');
  ok(parseNum('0') === 0, 'zero parses as zero');
  ok(parseNum({ value: '92,5' }) === 92.5, 'reads straight from an input element');
  ok(Number.isNaN(parseNum(null)), 'a missing element is NaN');

  const i = numInput({ value: '100' });
  ok(i.type === 'text', 'numeric fields are type=text so a comma is not discarded');
  ok(i.getAttribute('inputmode') === 'decimal', 'decimal keypad by default');
  ok(numInput({ decimal: false }).getAttribute('inputmode') === 'numeric', 'whole-number keypad on request');

  // The original bug: a native number input silently drops a comma value.
  const native = document.createElement('input');
  native.type = 'number';
  native.value = '117,5';
  ok(native.value === '' && parseNum(i.value) === 100,
     'regression guard: type=number really does discard a comma, ours does not',
     `native gave ${JSON.stringify(native.value)}`);
}

// ---------------------------------------------------------------- misc
group('Misc maths');
{
  ok(near(e1rm(100, 5), 100 * (1 + 5 / 30), 1e-9), 'Epley 1RM');
  ok(e1rm(100, 1) === 100, 'a single is its own 1RM');
  const ma = movingAverage([1, 2, 3, 4, 5], 3);
  ok(near(ma[4], 4) && near(ma[0], 1), 'moving average trails correctly', JSON.stringify(ma));
}

// ---------------------------------------------------------------- store
group('Export / import round trip');
{
  // This touches real localStorage, so the caller's data is saved and put
  // back afterwards regardless of outcome.
  const KEY = 'ironlog.db';
  const backup = localStorage.getItem(KEY);
  try {
    store.wipe();
    store.update((d) => {
      d.sessions.push({ id: 'A', type: 'lift', date: '2026-07-01', label: 'A', entries: [] });
      d.sessions.push({ id: 'B', type: 'lift', date: '2026-07-03', label: 'B', entries: [] });
      d.program.working.squat = 100;
      d.metrics.defs.push({ id: 'm-bw', label: 'Bodyweight', unit: 'kg', kind: 'number' });
      d.metrics.entries.push({ id: 'E1', metricId: 'm-bw', date: '2026-07-01', value: 90 });
      d.lab.results.push({ id: 'R1', testId: 't-cmj', date: '2026-07-01', side: null, metrics: { heightCm: 30 } });
    }, { immediate: true });

    const exported = store.exportJSON();
    ok(JSON.parse(exported).sessions.length === 2, 'export captures the sessions');

    // Simulate the phone: same two sessions plus one the Mac has not seen.
    const phone = JSON.parse(exported);
    phone.sessions.push({ id: 'C', type: 'lift', date: '2026-07-05', label: 'A', entries: [] });
    phone.metrics.entries.push({ id: 'E2', metricId: 'm-bw', date: '2026-07-05', value: 91 });
    phone.prs = { squat: { weight: 120, reps: 5, date: '2026-07-05', e1rm: 140 } };

    store.importJSON(JSON.stringify(phone), { mode: 'merge' });
    let db = store.get();
    ok(db.sessions.length === 3, 'merge adds only the unseen session', String(db.sessions.length));
    ok(db.metrics.entries.length === 2, 'merge adds only the unseen metric reading');
    ok(db.prs.squat?.e1rm === 140, 'merge takes the better personal best');

    // Importing the same file again must be a no-op.
    store.importJSON(JSON.stringify(phone), { mode: 'merge' });
    db = store.get();
    ok(db.sessions.length === 3, 'importing the same file twice changes nothing',
       String(db.sessions.length));
    ok(db.lab.results.length === 1, 'lab results de-duplicate by id too');
    ok(db.sessions.every((s, i, a) => i === 0 || a[i - 1].date <= s.date),
       'merged sessions come back in date order');

    store.importJSON(JSON.stringify({ schema: 3, sessions: [{ id: 'Z', date: '2026-01-01', entries: [] }] }),
                     { mode: 'replace' });
    ok(store.get().sessions.length === 1, 'replace discards what was there');

    // A file from an older build must not crash the migration.
    const old = store.importJSON(JSON.stringify({ sessions: [], profile: { age: 40 } }), { mode: 'replace' });
    ok(old && store.get().settings.plates.length > 0,
       'a file missing newer fields migrates to current defaults');
    ok(store.get().profile.age === 40, 'migration keeps the fields the old file did have');
  } finally {
    if (backup !== null) localStorage.setItem(KEY, backup);
    else localStorage.removeItem(KEY);
  }
}

// ---------------------------------------------------------------- summary
const s = document.getElementById('summary');
s.textContent = `${pass} passed, ${fail} failed`;
s.className = fail ? 'fail' : 'pass';
window.__results = { pass, fail };
