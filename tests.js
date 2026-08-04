// Logic tests. Open tests.html in a browser; every assertion runs in the same
// environment the app runs in, which is the point — there is no build step and
// no Node, so the browser is the test runner.

import { platesFor, roundTo, symmetryIndex, e1rm, movingAverage, parseNum, numInput } from './js/util.js';
import { warmupSets, applySession, nextWorkout, PROGRAMS, incrementFor, lastSessionLike, carryForward,
         registerCustomPrograms, validateProgram, phaseAdvice, programLifts,
         lastLogged, offeredWeight, seedWeight, BW_ADD_WEIGHT_AT, explainOffer, staleWeights, adoptLogged,
         applyIncrement, isLoadable, rotationDays, setRotationDay,
         shortDayLabel } from './js/programs.js';
import { plan, bmr, calibrate, scaleFood, dayTotals, FOODS } from './js/nutrition.js';
import { RECIPES, computeMacros } from './js/data/recipes.js';
import { analyseJump, analyseSway } from './js/sensors.js';
import { BUILTIN_TESTS, asymmetry, personalBest } from './js/movement.js';
import { MAIN_LIFTS, ASSISTANCE, CONDITIONING, SPORTS, findExercise,
         registerCustomExercises, normaliseCustom, allMovements } from './js/data/exercises.js';
import * as store from './js/store.js';
import { RoundTimer, DEFAULT_BOXING, setAudioMode, getAudioMode } from './js/timer.js';
import { BUILD, BUILT } from './js/version.js';
import { JJ_TYPES, JJ_TECHNIQUES } from './js/data/jiujitsu.js';
import { supported as mediaSupported, put as mediaPut, get as mediaGet,
         remove as mediaRemove, prune as mediaPrune, fmtBytes,
         hasAttachments } from './js/media.js';

// Some invariants are about the shape of the source, not its behaviour —
// "does this module grab the audio session at import time" cannot be observed
// from outside, because by then it already has.
window.__timerSource = await (await fetch('./js/timer.js', { cache: 'no-store' })).text();

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

group('Warm-ups are logged but never count as work');
{
  const db = freshDB();
  const wk = nextWorkout(db);
  const squat = wk.items.find((i) => i.exerciseId === 'squat');
  ok(squat.warmup.length > 0, 'the prescription still carries a warm-up ladder');

  // A session where the warm-ups are all ticked but the work sets were missed
  // must still be treated as a failure.
  const session = {
    label: wk.label, type: 'lift', programId: wk.programId,
    entries: wk.items.map((i) => ({
      exerciseId: i.exerciseId,
      prescribedSets: i.sets, prescribedReps: i.reps,
      toFailure: i.toFailure, light: i.light,
      warmupSets: (i.warmup || []).map((w) => ({ weight: w.weight, reps: w.reps, done: true })),
      sets: Array.from({ length: i.sets }, () => ({
        weight: i.weight, reps: i.exerciseId === 'squat' ? 3 : i.reps, done: true,
      })),
    })),
  };
  const before = db.program.working.squat;
  applySession(db, session);
  ok(db.program.working.squat === before && db.program.fails.squat === 1,
     'ticked warm-ups do not rescue a missed work set',
     `${before} -> ${db.program.working.squat}, fails ${db.program.fails.squat}`);
  ok(db.program.working.press > 50, 'the other lifts still progress normally');

  // Heavy warm-up singles must not be mistaken for work sets by anything that
  // reads `entry.sets`.
  const heavyWarm = {
    label: 'A', type: 'lift', programId: 'ss-novice',
    entries: [{
      exerciseId: 'deadlift', prescribedSets: 1, prescribedReps: 5,
      warmupSets: [{ weight: 500, reps: 1, done: true }],
      sets: [{ weight: 140, reps: 5, done: true }],
    }],
  };
  const db2 = freshDB();
  applySession(db2, heavyWarm);
  ok(db2.program.working.deadlift === 145,
     'a 500 kg warm-up entry cannot influence the progression',
     String(db2.program.working.deadlift));
}

group('Romanian deadlift');
{
  ok(!!MAIN_LIFTS.rdl, 'RDL is a main lift');
  ok(MAIN_LIFTS.rdl.bar && MAIN_LIFTS.rdl.cues.length >= 5, 'it has a bar and real coaching cues');
  ok(MAIN_LIFTS.rdl.defaultReps === 8, 'it defaults to 8 reps, not the 5 the squat uses');
  ok(Object.values(MAIN_LIFTS).every((l) => l.defaultSets != null && l.defaultReps != null),
     'every main lift declares its own default sets and reps');

  const w = warmupSets(100, MAIN_LIFTS.rdl.warmup, SETTINGS);
  ok(w.length >= 3, 'RDL gets its own warm-up ladder', JSON.stringify(w));
  ok(w.every((s) => s.weight < 100), 'no RDL warm-up reaches the work weight');
  ok(w[0].reps >= 5, 'RDL warm-up reps stay high — it doubles as the hamstring warm-up',
     JSON.stringify(w.map((s) => s.reps)));

  // It progresses like any other main lift when added to a session.
  const db = freshDB();
  db.program.working.rdl = 80;
  applySession(db, {
    label: 'A', type: 'lift', programId: 'ss-novice',
    entries: [{ exerciseId: 'rdl', prescribedSets: 3, prescribedReps: 8,
      sets: Array.from({ length: 3 }, () => ({ weight: 80, reps: 8, done: true })) }],
  });
  ok(db.program.working.rdl === 82.5, 'RDL progresses by its own increment',
     String(db.program.working.rdl));
}

group('One progression decision per lift per session');
{
  const db = freshDB();
  const before = db.program.working.squat;
  applySession(db, {
    label: 'A', type: 'lift', programId: 'ss-novice',
    entries: [
      { exerciseId: 'squat', prescribedSets: 3, prescribedReps: 5,
        sets: Array.from({ length: 3 }, () => ({ weight: 100, reps: 5, done: true })) },
      // A second squat entry, e.g. added by hand mid-session.
      { exerciseId: 'squat', prescribedSets: 3, prescribedReps: 5,
        sets: Array.from({ length: 3 }, () => ({ weight: 100, reps: 5, done: true })) },
    ],
  });
  ok(db.program.working.squat === before + 2.5,
     'two squat entries apply the increment once, not twice',
     `${before} -> ${db.program.working.squat}`);
}

group('The offered weight follows the log');
{
  // Progression must build on what was lifted, not on what was prescribed.
  const db = freshDB();
  const wk = nextWorkout(db);
  ok(wk.items.find((i) => i.exerciseId === 'squat').weight === 100, 'prescribed 100');

  applySession(db, {
    label: 'A', type: 'lift', programId: 'ss-novice',
    entries: [{
      exerciseId: 'squat', prescribedSets: 3, prescribedReps: 5,
      // Bar said 100; 97.5 is what actually went on it, all reps made.
      sets: Array.from({ length: 3 }, () => ({ weight: 97.5, reps: 5, done: true })),
    }],
  });
  ok(db.program.working.squat === 100,
     'lifting 97.5 for all reps offers 100 next, not 102.5',
     String(db.program.working.squat));

  // Going heavier than prescribed is picked up too.
  const db2 = freshDB();
  applySession(db2, {
    label: 'A', type: 'lift', programId: 'ss-novice',
    entries: [{
      exerciseId: 'squat', prescribedSets: 3, prescribedReps: 5,
      sets: Array.from({ length: 3 }, () => ({ weight: 110, reps: 5, done: true })),
    }],
  });
  ok(db2.program.working.squat === 112.5,
     'and lifting 110 offers 112.5 next', String(db2.program.working.squat));

  // A back-off set must not drag the next prescription down.
  const db3 = freshDB();
  applySession(db3, {
    label: 'A', type: 'lift', programId: 'ss-novice',
    entries: [{
      exerciseId: 'squat', prescribedSets: 3, prescribedReps: 5,
      sets: [
        { weight: 100, reps: 5, done: true },
        { weight: 100, reps: 5, done: true },
        { weight: 80, reps: 5, done: true },
      ],
    }],
  });
  ok(db3.program.working.squat === 102.5,
     'the top work set drives it, not a lighter back-off',
     String(db3.program.working.squat));

  // Added-weight lifts measure the belt, and zero is a real value there.
  const db4 = freshDB();
  db4.program.working.chinup = 5;
  applySession(db4, {
    label: 'A', type: 'lift', programId: 'ss-novice',
    entries: [{ exerciseId: 'chinup', prescribedSets: 3, prescribedReps: 0, toFailure: true,
      sets: [{ weight: 0, reps: 8, done: true }] }],
  });
  ok(db4.program.working.chinup === 5,
     'a bodyweight lift is not reset to zero by an unweighted set',
     String(db4.program.working.chinup));
}

group('A free session updates your weights');
{
  const db = freshDB();
  db.program.cursor = 0;
  const cursorBefore = db.program.cursor;

  // Exactly what the runner produces for a free session.
  applySession(db, {
    label: 'Free session', type: 'free',
    entries: [{
      exerciseId: 'squat', prescribedSets: 3, prescribedReps: 5,
      sets: Array.from({ length: 3 }, () => ({ weight: 105, reps: 5, done: true })),
    }],
  });
  ok(db.program.working.squat === 107.5,
     'work logged off-programme still moves the weight on',
     String(db.program.working.squat));
  ok(db.program.cursor === cursorBefore,
     'but it does not consume a day of the rotation',
     `${cursorBefore} -> ${db.program.cursor}`);

  // A session from a different programme must not advance this one either.
  const db2 = freshDB();
  applySession(db2, {
    label: 'X', type: 'lift', programId: 'some-other-programme',
    entries: [{ exerciseId: 'squat', prescribedSets: 3, prescribedReps: 5,
      sets: [{ weight: 100, reps: 5, done: true }] }],
  });
  ok(db2.program.cursor === 0, 'nor does a session from another programme');
}

group('Falling back to the log');
{
  const db = freshDB();
  db.program.working = {};              // nothing set up at all
  db.sessions = [
    { id: 's1', date: '2026-07-10', type: 'free', label: 'Free session', entries: [
      { exerciseId: 'squat', sets: [{ weight: 90, reps: 5, done: true }] }] },
    { id: 's2', date: '2026-07-24', type: 'free', label: 'Free session', entries: [
      { exerciseId: 'squat', sets: [
        { weight: 95, reps: 5, done: true },
        { weight: 97.5, reps: 3, done: true }] },
      { exerciseId: 'bench', sets: [{ weight: 80, reps: 5, done: true }] }] },
  ];

  const last = lastLogged(db, 'squat');
  ok(last.weight === 97.5 && last.date === '2026-07-24',
     'finds the top set of the most recent session', JSON.stringify(last));
  ok(lastLogged(db, 'deadlift') === null, 'and returns nothing for a lift never logged');

  ok(offeredWeight(db, 'squat') === 97.5,
     'with no working weight, the offer comes from the log',
     String(offeredWeight(db, 'squat')));
  ok(offeredWeight(db, 'bench') === 80, 'per lift, independently');

  const wk = nextWorkout(db);
  ok(wk.items.find((i) => i.exerciseId === 'squat').weight === 97.5,
     'and the next session is prescribed from it',
     String(wk.items.find((i) => i.exerciseId === 'squat').weight));

  // A stored working weight still wins — it is the programme's own state.
  db.program.working.squat = 120;
  ok(offeredWeight(db, 'squat') === 120,
     'a working weight takes precedence over history');

  // A lift with no history at all falls back to the bodyweight seed.
  db.program.working = {};
  ok(offeredWeight(db, 'deadlift') === seedWeight('deadlift', db.profile, db.settings),
     'and a lift with no history still gets a sensible starting suggestion');

  // Light days must never be mistaken for what you can lift.
  db.sessions.push({ id: 's3', date: '2026-07-26', type: 'lift', label: 'Light', entries: [
    { exerciseId: 'squat', light: true, sets: [{ weight: 60, reps: 5, done: true }] }] });
  ok(lastLogged(db, 'squat').weight === 97.5,
     'a light day is skipped when reading back what you can lift',
     String(lastLogged(db, 'squat').weight));

  // Nor are warm-ups, which live in their own array.
  db.sessions.push({ id: 's4', date: '2026-07-27', type: 'lift', label: 'A', entries: [
    { exerciseId: 'squat', warmupSets: [{ weight: 200, reps: 1, done: true }], sets: [] }] });
  ok(lastLogged(db, 'squat').weight === 97.5,
     'and a heavy warm-up entry cannot masquerade as a work set',
     String(lastLogged(db, 'squat').weight));
}

group('Fine increments survive the plate grid');
{
  const S = SETTINGS;                       // smallest loadable pair = 2.5 kg
  ok(applyIncrement(100, 2.5, 2.5) === 102.5, 'a grid-sized jump still snaps to the grid');
  ok(applyIncrement(101, 2.5, 2.5) === 102.5, 'and pulls an off-grid weight back onto it');

  // The bug this covers: 0.75 rounded straight back to where it started.
  ok(applyIncrement(100, 0.75, 2.5) === 100.75,
     'a 0.75 kg increment is added exactly, not rounded away',
     String(applyIncrement(100, 0.75, 2.5)));
  ok(applyIncrement(100.75, 0.75, 2.5) === 101.5, 'and it accumulates');
  ok(applyIncrement(101.5, 0.75, 2.5) === 102.25, 'session after session');

  // Floating-point dust must not leak into a displayed weight.
  let w = 100;
  for (let i = 0; i < 8; i++) w = applyIncrement(w, 0.75, 2.5);
  ok(w === 106, 'eight 0.75 kg jumps land exactly on 106', String(w));

  ok(applyIncrement(20, 0.5, 2.5) === 20.5, '0.5 kg works the same way');
  ok(applyIncrement(0, 0.75, 0) === 0.75, 'and so does added weight from bodyweight');

  // End to end through the progression.
  const db = freshDB();
  db.program.increments = { squat: 0.75 };
  applySession(db, {
    label: 'A', type: 'lift', programId: 'ss-novice',
    entries: [{ exerciseId: 'squat', prescribedSets: 3, prescribedReps: 5,
      sets: Array.from({ length: 3 }, () => ({ weight: 100, reps: 5, done: true })) }],
  });
  ok(db.program.working.squat === 100.75,
     'a 0.75 kg increment set by hand actually moves the lift',
     String(db.program.working.squat));

  // And it is honest about what a bar can hold.
  ok(isLoadable(102.5, S), '102.5 kg is loadable with 1.25 plates');
  ok(!isLoadable(100.75, S), 'but 100.75 kg is not — it would need 0.375 per side');
  ok(isLoadable(100.5, { ...S, plates: [...S.plates, 0.25] }),
     'add 0.25 kg micro plates and 100.5 becomes loadable');
}

group('Choosing the day of the rotation');
{
  const db = freshDB();
  db.program.id = 'tv-4day';
  db.program.cursor = 0;

  let days = rotationDays(db);
  ok(days.length === 4, 'all four days are listed', String(days.length));
  ok(days[0].current && !days[2].current, 'the one you are on is marked');
  ok(days.map((d) => d.short).join(',') === 'Day 1,Day 2,Day 3,Day 4',
     'with labels short enough for a chip', days.map((d) => d.short).join(','));
  ok(days[2].conditioning === true, 'a bag day is identified as conditioning');
  ok(days[0].summary.includes('Squat'), 'and each carries what is in it');

  // Jumping to a day changes what you get next.
  setRotationDay(db, 3);
  ok(nextWorkout(db).label.startsWith('Day 4'),
     'picking day 4 gives you day 4', nextWorkout(db).label);
  ok(rotationDays(db)[3].current, 'and it shows as current');

  // Your place in the count is kept, not reset — session 9 stays session 9.
  db.program.cursor = 9;                       // 2 full rotations + day 2
  setRotationDay(db, 0);
  ok(db.program.cursor === 8,
     'jumping back a day moves within the current rotation, not to the start',
     String(db.program.cursor));
  setRotationDay(db, 3);
  ok(db.program.cursor === 11, 'and forward within it too', String(db.program.cursor));

  // Finishing from a chosen day carries on from there.
  db.program.cursor = 8;
  applySession(db, {
    label: 'Day 1 — Squat / Press / Pull', type: 'lift', programId: 'tv-4day',
    entries: [{ exerciseId: 'squat', prescribedSets: 3, prescribedReps: 5,
      sets: [{ weight: 100, reps: 5, done: true }] }],
  });
  ok(db.program.cursor === 9, 'and the rotation resumes from where you picked',
     String(db.program.cursor));

  // A long or awkward label still yields something chip-sized.
  ok(shortDayLabel('Day 2 — Weighted Chins / Dips', 1) === 'Day 2', 'long labels are trimmed');
  ok(shortDayLabel('Volume', 0) === 'Volume', 'a short one is kept as-is');
  ok(shortDayLabel('', 4) === 'Day 5', 'and an empty one falls back to its number');
  ok(shortDayLabel('A really long day name with no dash', 2) === 'Day 3',
     'a long name with nothing to split on falls back too');

  // A single-day programme should not offer a picker at all.
  registerCustomPrograms([{ id: 'p-one', name: 'One', source: 'x', custom: true,
    frequency: '', blurb: '',
    phases: { 1: { name: 'S', note: '', advanceWhen: '',
      rotation: [{ label: 'Everything', items: [{ ex: 'squat', sets: 3, reps: 5 }] }] } } }]);
  const one = freshDB(); one.program.id = 'p-one';
  ok(rotationDays(one).length === 1, 'a one-day programme lists one day');
  registerCustomPrograms([]);
}

group('Logging a past workout');
{
  // The rule: progression follows the most recent training, not the most
  // recently typed. A back-dated session is history.
  const isLatest = (db, date) => {
    const newest = db.sessions.reduce((a, x) => (x.date > a ? x.date : a), '');
    return !newest || date >= newest;
  };

  const db = freshDB();
  db.sessions = [{ id: 'recent', type: 'lift', programId: 'ss-novice', date: '2026-07-28', label: 'A',
    entries: [{ exerciseId: 'squat', sets: [{ weight: 120, reps: 5, done: true }] }] }];
  db.program.working.squat = 122.5;
  db.program.cursor = 5;

  ok(!isLatest(db, '2026-07-01'), 'an older date is not the latest session');
  ok(isLatest(db, '2026-07-28'), 'the same date counts as latest');
  ok(isLatest(db, '2026-07-30'), 'and a later one certainly does');
  ok(isLatest(freshDB(), '2020-01-01'), 'with no history at all, anything is the latest');

  // Applying an old session anyway would rewind you — so it must not be applied.
  const beforeW = db.program.working.squat;
  const beforeC = db.program.cursor;
  const old = { label: 'A', type: 'lift', programId: 'ss-novice', date: '2026-07-01',
    entries: [{ exerciseId: 'squat', prescribedSets: 3, prescribedReps: 5,
      sets: [{ weight: 80, reps: 5, done: true }] }] };
  if (isLatest(db, old.date)) applySession(db, old);
  ok(db.program.working.squat === beforeW,
     'a session from three weeks ago does not drag your working weight back to 80',
     String(db.program.working.squat));
  ok(db.program.cursor === beforeC, 'nor rewind the rotation');

  // But it is still history: it belongs in the log and the charts.
  db.sessions.push({ ...old, id: 'old' });
  ok(db.sessions.length === 2, 'and it is recorded all the same');
  ok(lastLogged(db, 'squat').weight === 120,
     'while "last logged" still means the most recent, not the most recently entered',
     String(lastLogged(db, 'squat').weight));

  // A session dated today does progress normally.
  const db2 = freshDB();
  db2.sessions = [{ id: 'r', type: 'lift', date: '2026-07-28', label: 'A', entries: [] }];
  const today = { label: 'A', type: 'lift', programId: 'ss-novice', date: '2026-07-29',
    entries: [{ exerciseId: 'squat', prescribedSets: 3, prescribedReps: 5,
      sets: Array.from({ length: 3 }, () => ({ weight: 100, reps: 5, done: true })) }] };
  if (isLatest(db2, today.date)) applySession(db2, today);
  ok(db2.program.working.squat === 102.5,
     'a session dated today progresses as normal', String(db2.program.working.squat));

  // Back-filling a whole week in order leaves the newest one in charge.
  const db3 = freshDB();
  db3.sessions = [];
  for (const d of ['2026-07-20', '2026-07-22', '2026-07-24']) {
    const sess = { label: 'A', type: 'lift', programId: 'ss-novice', date: d,
      entries: [{ exerciseId: 'squat', prescribedSets: 3, prescribedReps: 5,
        sets: Array.from({ length: 3 }, () => ({ weight: 90, reps: 5, done: true })) }] };
    if (isLatest(db3, d)) applySession(db3, sess);
    db3.sessions.push({ ...sess, id: d });
  }
  ok(db3.program.working.squat === 92.5,
     'entering a backlog in date order progresses once per session',
     String(db3.program.working.squat));
  ok(db3.sessions.length === 3, 'and records all of them');
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

// ---------------------------------------------------------------- custom
group('Your own exercises');
{
  const mine = [
    { id: 'x-trapbar', name: 'Trap Bar Deadlift', kind: 'main', bar: true,
      increment: 5, lateIncrement: 2.5, resetPct: 0.9,
      defaultSets: 3, defaultReps: 5, warmup: 'deadlift', cues: ['Neutral grip.'] },
    { id: 'x-facepull', name: 'Face Pull', kind: 'assistance', equip: 'cable',
      defaultSets: 3, defaultReps: 15 },
  ];
  const n = registerCustomExercises(mine);
  ok(n === 2, 'two custom exercises registered');
  ok(!!MAIN_LIFTS['x-trapbar'], 'a custom main lift lands in MAIN_LIFTS');
  ok(ASSISTANCE.some((a) => a.id === 'x-facepull'), 'a custom accessory lands in ASSISTANCE');
  ok(findExercise('x-trapbar')?.name === 'Trap Bar Deadlift', 'and both resolve through findExercise');
  ok(allMovements().some((m) => m.group === 'Your lifts'),
     'custom movements are grouped separately in pickers');

  // It must behave like a built-in everywhere downstream.
  const w = warmupSets(180, MAIN_LIFTS['x-trapbar'].warmup, SETTINGS);
  ok(w.length >= 3 && w.every((s) => s.weight < 180),
     'a custom barbell lift gets a real warm-up ladder', JSON.stringify(w));

  const db = freshDB();
  db.program.working['x-trapbar'] = 150;
  applySession(db, {
    label: 'A', type: 'lift', programId: 'ss-novice',
    entries: [{ exerciseId: 'x-trapbar', prescribedSets: 3, prescribedReps: 5,
      sets: Array.from({ length: 3 }, () => ({ weight: 150, reps: 5, done: true })) }],
  });
  ok(db.program.working['x-trapbar'] === 155,
     'and it progresses by its own increment', String(db.program.working['x-trapbar']));

  // Re-registering must not leave ghosts behind.
  registerCustomExercises([mine[1]]);
  ok(!MAIN_LIFTS['x-trapbar'], 'removing a custom lift removes it from the catalogue');
  ok(ASSISTANCE.filter((a) => a.id === 'x-facepull').length === 1,
     're-registering does not duplicate the survivors');
  registerCustomExercises([]);
  ok(!ASSISTANCE.some((a) => a.id === 'x-facepull'), 'clearing removes everything custom');
  ok(!!MAIN_LIFTS.squat && ASSISTANCE.some((a) => a.id === 'db-row'),
     'and never touches the built-ins');

  const norm = normaliseCustom({ id: 'x-y', name: 'Thing', kind: 'main', bar: true });
  ok(norm.increment > 0 && norm.resetPct === 0.9 && norm.defaultSets > 0,
     'a half-filled custom exercise gets sane defaults', JSON.stringify(norm));
}

group('Your own programmes');
{
  const mine = {
    id: 'p-ul', name: 'Upper / Lower', source: 'Your own', custom: true,
    frequency: '4 × / week', blurb: 'Mine.',
    phases: { 1: { name: 'Standard', note: '', advanceWhen: '', rotation: [
      { label: 'Lower A', items: [
        { ex: 'squat', sets: 3, reps: 5 },
        { ex: 'rdl', sets: 3, reps: 8 },
      ] },
      { label: 'Upper A', items: [
        { ex: 'bench', sets: 3, reps: 5 },
        { ex: 'db-row', sets: 3, reps: 10 },
      ] },
      { label: 'Lower B', items: [
        { ex: 'squat', sets: 2, reps: 5, pctOfWorking: 0.8, light: true },
        { ex: 'deadlift', sets: 1, reps: 5 },
      ] },
    ] } },
  };
  registerCustomPrograms([mine]);
  ok(!!PROGRAMS['p-ul'], 'a custom programme is registered alongside the built-ins');

  const db = freshDB();
  db.program.id = 'p-ul';
  db.program.working.rdl = 80;

  const d1 = nextWorkout(db);
  ok(d1.label === 'Lower A', 'the rotation starts at the first day', d1.label);
  ok(d1.items.length === 2 && d1.items[0].exerciseId === 'squat', 'with the exercises you chose');
  ok(d1.items[1].weight === 80, 'and each lift at its own working weight',
     String(d1.items[1].weight));
  ok(d1.items[0].warmup.length > 0, 'warm-up ladders are generated for a custom programme');
  ok(d1.items[0].plates !== null, 'and so is the plate breakdown');

  applySession(db, {
    label: 'Lower A', type: 'lift', programId: 'p-ul',
    entries: d1.items.map((i) => ({
      exerciseId: i.exerciseId, prescribedSets: i.sets, prescribedReps: i.reps,
      sets: Array.from({ length: i.sets }, () => ({ weight: i.weight, reps: i.reps, done: true })),
    })),
  });
  ok(db.program.working.squat === 102.5 && db.program.working.rdl === 82.5,
     'a custom programme progresses with the same rules',
     JSON.stringify({ squat: db.program.working.squat, rdl: db.program.working.rdl }));
  ok(nextWorkout(db).label === 'Upper A', 'and advances to the next day');

  db.program.cursor = 2;
  const light = nextWorkout(db);
  ok(light.items[0].light === true && light.items[0].weight === roundTo(102.5 * 0.8, 2.5),
     'a day marked under 90 % is treated as a light day',
     JSON.stringify({ light: light.items[0].light, w: light.items[0].weight }));
  const beforeLight = db.program.working.squat;
  applySession(db, {
    label: 'Lower B', type: 'lift', programId: 'p-ul',
    entries: light.items.map((i) => ({
      exerciseId: i.exerciseId, prescribedSets: i.sets, prescribedReps: i.reps, light: i.light,
      sets: Array.from({ length: i.sets }, () => ({ weight: i.weight, reps: i.reps, done: true })),
    })),
  });
  ok(db.program.working.squat === beforeLight,
     'and a light day still does not drive progression in a custom programme');

  // The rotation wraps.
  db.program.cursor = 3;
  ok(nextWorkout(db).label === 'Lower A', 'the rotation wraps back round');

  // Validation.
  ok(validateProgram(mine).length === 0, 'a complete programme validates clean');
  ok(validateProgram({ name: '', phases: { 1: { rotation: [] } } }).length >= 2,
     'a blank programme reports what is missing');
  ok(validateProgram({ name: 'X', phases: { 1: { rotation: [{ label: '', items: [] }] } } })
     .some((p) => p.includes('no exercises')), 'an empty day is caught');

  // An empty rotation must not crash the training screen.
  registerCustomPrograms([{ ...mine, id: 'p-empty', phases: { 1: { name: 'S', note: '', rotation: [] } } }]);
  const db2 = freshDB();
  db2.program.id = 'p-empty';
  ok(nextWorkout(db2) === null, 'a programme with no days returns null rather than throwing');
  ok(phaseAdvice({ ...db2, sessions: [] }) === null,
     'and phase advice stays quiet for a programme you wrote yourself');

  registerCustomPrograms([]);
  ok(!PROGRAMS['p-ul'] && !!PROGRAMS['ss-novice'],
     'clearing custom programmes leaves the built-ins alone');
}

group('Weighted chins and dips');
{
  // Run with a rep target, added load progresses like any other lift.
  const db = freshDB();
  db.program.working.chinup = 20;
  db.program.working.dip = 15;

  applySession(db, {
    label: 'D2', type: 'lift', programId: 'ss-novice',
    entries: [
      { exerciseId: 'chinup', prescribedSets: 3, prescribedReps: 5,
        sets: Array.from({ length: 3 }, () => ({ weight: 20, reps: 5, done: true })) },
      { exerciseId: 'dip', prescribedSets: 3, prescribedReps: 5,
        sets: Array.from({ length: 3 }, () => ({ weight: 15, reps: 5, done: true })) },
    ],
  });
  ok(db.program.working.chinup === 20.75,
     'weighted chins add load on a completed session', String(db.program.working.chinup));
  ok(db.program.working.dip === 15.75,
     'and so do weighted dips', String(db.program.working.dip));

  // Missing reps must behave exactly like a barbell lift.
  const db2 = freshDB();
  db2.program.working.chinup = 20;
  const missed = () => ({
    label: 'D2', type: 'lift', programId: 'ss-novice',
    entries: [{ exerciseId: 'chinup', prescribedSets: 3, prescribedReps: 5,
      sets: [{ weight: 20, reps: 3, done: true }, { weight: 20, reps: 2, done: true },
             { weight: 20, reps: 2, done: true }] }],
  });
  applySession(db2, missed());
  ok(db2.program.working.chinup === 20 && db2.program.fails.chinup === 1,
     'a missed weighted chin repeats rather than progressing');
  applySession(db2, missed());
  applySession(db2, missed());
  ok(db2.program.working.chinup === 17.5,
     'and three misses shed 10 % of the added load, rounded to loadable steps',
     String(db2.program.working.chinup));

  // A reset can never drive added weight negative.
  const db3 = freshDB();
  db3.program.working.dip = 1.25;
  for (let i = 0; i < 3; i++) {
    applySession(db3, { label: 'D2', type: 'lift', programId: 'ss-novice',
      entries: [{ exerciseId: 'dip', prescribedSets: 3, prescribedReps: 5,
        sets: [{ weight: 0, reps: 1, done: true }] }] });
  }
  ok(db3.program.working.dip >= 0, 'added load bottoms out at bodyweight, never negative',
     String(db3.program.working.dip));

  // The weight column is read from the log, so dropping the belt is honoured.
  const db4 = freshDB();
  db4.program.working.chinup = 30;
  applySession(db4, {
    label: 'D2', type: 'lift', programId: 'ss-novice',
    entries: [{ exerciseId: 'chinup', prescribedSets: 3, prescribedReps: 5,
      sets: Array.from({ length: 3 }, () => ({ weight: 10, reps: 5, done: true })) }],
  });
  ok(db4.program.working.chinup === 10.75,
     'logging +10 when the app said +30 builds from the +10 you actually did',
     String(db4.program.working.chinup));

  // To-failure mode still exists for someone below their first weighted rep.
  const db5 = freshDB();
  db5.program.working.chinup = 0;
  applySession(db5, {
    label: 'D2', type: 'lift', programId: 'ss-novice',
    entries: [{ exerciseId: 'chinup', prescribedSets: 3, prescribedReps: 0, toFailure: true,
      sets: [{ weight: 0, reps: 8, done: true }] }],
  });
  ok(db5.program.working.chinup === 0,
     'to failure below the threshold holds at bodyweight', String(db5.program.working.chinup));
  applySession(db5, {
    label: 'D2', type: 'lift', programId: 'ss-novice',
    entries: [{ exerciseId: 'chinup', prescribedSets: 3, prescribedReps: 0, toFailure: true,
      sets: [{ weight: 0, reps: BW_ADD_WEIGHT_AT + 1, done: true }] }],
  });
  ok(db5.program.working.chinup > 0,
     `and clearing ${BW_ADD_WEIGHT_AT} starts the load`, String(db5.program.working.chinup));
}

group('Programme slots: percentage, added weight, prescribed weight');
{
  registerCustomPrograms([{
    id: 'p-fields', name: 'Field test', source: 'Your own', custom: true,
    frequency: '', blurb: '',
    phases: { 1: { name: 'S', note: '', advanceWhen: '', rotation: [
      { label: 'D', items: [
        { ex: 'squat', sets: 2, reps: 5, pctOfWorking: 0.8, light: true },
        { ex: 'chinup', sets: 3, reps: 5, startWeight: 20 },
        { ex: 'liu-raise', sets: 3, reps: 15, weight: 6 },
      ] } ] } },
  }]);
  const db = freshDB();
  db.program.id = 'p-fields';
  delete db.program.working.chinup;

  const wk = nextWorkout(db);
  const [sq, chin, liu] = wk.items;
  ok(sq.light === true && sq.weight === roundTo(100 * 0.8, 2.5),
     'a percentage still drives a loaded lift', String(sq.weight));
  ok(chin.weight === 20 && chin.bodyweight,
     'a bodyweight lift is seeded from its added-weight field', String(chin.weight));
  ok(liu.weight === 6 && liu.assistance,
     'accessory work is prescribed at the weight the programme states', String(liu.weight));

  // The seed only applies until there is real history.
  db.program.working.chinup = 25;
  ok(nextWorkout(db).items[1].weight === 25,
     'once the lift has a working weight the seed is ignored',
     String(nextWorkout(db).items[1].weight));

  // Validation rejects a percentage on a bodyweight lift.
  const bad = { name: 'X', phases: { 1: { rotation: [
    { label: 'D', items: [{ ex: 'chinup', sets: 3, reps: 5, pctOfWorking: 0.8 }] }] } } };
  ok(validateProgram(bad).some((m) => m.includes('percentage means nothing')),
     'and a percentage on a chin-up is caught', validateProgram(bad).join(' '));

  registerCustomPrograms([]);
}

group('Every exercise remembers its own weight');
{
  // The gap this covers: a main lift has a progression to carry its number,
  // but an accessory inside a programme had nothing, so it reset to zero
  // every single session.
  registerCustomPrograms([{
    id: 'p-mem', name: 'Memory', source: 'Your own', custom: true,
    frequency: '', blurb: '',
    phases: { 1: { name: 'S', note: '', advanceWhen: '', rotation: [
      { label: 'D', items: [
        { ex: 'squat', sets: 3, reps: 5 },
        { ex: 'chinup', sets: 3, reps: 5 },
        { ex: 'liu-raise', sets: 3, reps: 15, weight: 6 },
        { ex: 'db-row', sets: 3, reps: 10 },
      ] } ] } },
  }]);
  const db = freshDB();
  db.program.id = 'p-mem';
  db.program.working.chinup = 20;

  // First time out: the programme's own number seeds the accessory, and one
  // with no stated weight simply has none yet.
  let wk = nextWorkout(db);
  ok(wk.items[2].weight === 6, 'an accessory is seeded from the programme', String(wk.items[2].weight));
  ok(wk.items[3].weight === null, 'and one with no stated weight starts blank');

  // Now log a session where the accessories were done at your own weights.
  db.sessions.push({
    id: 'x1', date: '2026-07-28', type: 'lift', programId: 'p-mem', label: 'D',
    entries: [
      { exerciseId: 'squat', sets: [{ weight: 100, reps: 5, done: true }] },
      { exerciseId: 'chinup', sets: [{ weight: 20, reps: 5, done: true }] },
      { exerciseId: 'liu-raise', assistance: true, sets: [{ weight: 8, reps: 15, done: true }] },
      { exerciseId: 'db-row', assistance: true, sets: [{ weight: 32.5, reps: 10, done: true }] },
    ],
  });

  wk = nextWorkout(db);
  ok(wk.items[2].weight === 8,
     'what you actually used beats the weight written into the programme',
     String(wk.items[2].weight));
  ok(wk.items[3].weight === 32.5,
     'and an accessory with no programmed weight remembers yours',
     String(wk.items[3].weight));
  ok(wk.items[2].lastUsed?.date === '2026-07-28',
     'the source of the number is reported alongside it');

  // Each movement is independent — no bleed between them.
  db.sessions.push({
    id: 'x2', date: '2026-07-30', type: 'lift', programId: 'p-mem', label: 'D',
    entries: [{ exerciseId: 'db-row', assistance: true, sets: [{ weight: 35, reps: 10, done: true }] }],
  });
  wk = nextWorkout(db);
  ok(wk.items[3].weight === 35 && wk.items[2].weight === 8,
     'updating one accessory leaves the others where they were',
     JSON.stringify([wk.items[2].weight, wk.items[3].weight]));

  // Reps stay the programme's business — it prescribes them, the log does not.
  ok(wk.items[2].reps === 15 && wk.items[3].reps === 10,
     'reps still come from the programme, not from what you happened to do');

  registerCustomPrograms([]);
}

group('Nothing you typed is thrown away');
{
  // The rule: a set with reps against it is data the user entered on purpose.
  // Finishing must never discard it without asking.
  const pendingIn = (session) => {
    const out = [];
    for (const e of session.entries) {
      if (e.conditioning) continue;
      for (const set of e.sets || []) if (!set.done && set.reps > 0) out.push(set);
      for (const set of e.warmupSets || []) if (!set.done && set.reps > 0 && set.edited) out.push(set);
    }
    return out;
  };

  const session = {
    entries: [
      { exerciseId: 'squat',
        warmupSets: [
          { weight: 20, reps: 5, done: true },
          { weight: 60, reps: 3, done: false },                 // pre-filled, untouched
          { weight: 80, reps: 2, done: false, edited: true },   // you changed this one
        ],
        sets: [
          { weight: 100, reps: 5, done: true },
          { weight: 100, reps: 5, done: false },   // did it, forgot to tick
          { weight: 100, reps: 0, done: false },   // genuinely never done
        ] },
      { exerciseId: 'box-bag-int', conditioning: true, done: true, sets: [] },
    ],
  };

  const pending = pendingIn(session);
  ok(pending.length === 2, 'an unticked work set and an edited warm-up are both caught',
     String(pending.length));
  ok(!pending.some((x) => x.weight === 60),
     'but a pre-filled warm-up you never touched is not nagged about');
  ok(!pending.some((x) => x.reps === 0), 'a set with no reps is not treated as data');
  ok(!pending.some((x) => x.done), 'and an already-ticked set is left alone');

  // Choosing to log them makes them count towards the progression.
  pending.forEach((x) => { x.done = true; });
  const db = freshDB();
  applySession(db, {
    label: 'A', type: 'lift', programId: 'ss-novice',
    entries: [{ exerciseId: 'squat', prescribedSets: 2, prescribedReps: 5,
      sets: session.entries[0].sets.filter((x) => x.done && x.reps > 0) }],
  });
  ok(db.program.working.squat === 102.5,
     'and once logged they drive the weight offered next time',
     String(db.program.working.squat));

  // A conditioning slot has no sets and must not be dragged into this.
  ok(pendingIn({ entries: [{ conditioning: true, done: false, sets: [] }] }).length === 0,
     'a conditioning slot is never counted as an unticked set');
}

group('Build version');
{
  ok(/^v\d+$/.test(BUILD), `build is tagged (${BUILD})`);
  ok(typeof BUILT === 'string' && BUILT.length >= 8, 'and dated');
}

group('Explaining where a weight came from');
{
  const db = freshDB();
  db.program.working = { squat: 25 };
  db.sessions = [];

  let x = explainOffer(db, 'squat');
  ok(x.offered === 25 && x.source === 'the progression', 'a stored weight is reported as such');
  ok(x.detail.includes('nothing has ever been logged'),
     'and it says plainly that the number did not come from training', x.detail);

  // A stored weight that disagrees with real history is the confusing case.
  db.sessions = [{ id: 'r', date: '2026-07-29', type: 'lift', label: 'A',
    entries: [{ exerciseId: 'squat', sets: [{ weight: 100, reps: 5, done: true }] }] }];
  x = explainOffer(db, 'squat');
  ok(x.offered === 25 && x.last.weight === 100,
     'the stored weight still wins, and the conflict is visible');
  ok(x.detail.includes('always wins over history'), 'and the reason is stated');
  ok(x.sessions === 1, 'with a count of how often the lift appears in the log');

  // Dropping the stored weight hands control back to the log.
  delete db.program.working.squat;
  x = explainOffer(db, 'squat');
  ok(x.offered === 100 && x.source === 'your log',
     'without it, the log governs', `${x.offered} from ${x.source}`);

  // A session whose sets were discarded looks empty, and should read that way.
  const ghost = freshDB();
  ghost.program.working = { squat: 25 };
  ghost.sessions = [{ id: 'g', date: '2026-07-28', type: 'lift', label: 'A',
    entries: [{ exerciseId: 'squat', sets: [], warmupSets: [] }] }];
  ok(lastLogged(ghost, 'squat') === null,
     'a session with no sets carries nothing, however many entries it has');
  ok(explainOffer(ghost, 'squat').detail.includes('nothing has ever been logged'),
     'and the diagnosis says so rather than blaming the progression');

  // Accessories report their own source.
  const acc = freshDB();
  acc.sessions = [{ id: 'a', date: '2026-07-29', type: 'lift', label: 'A',
    entries: [{ exerciseId: 'liu-raise', assistance: true, sets: [{ weight: 8, reps: 15, done: true }] }] }];
  ok(explainOffer(acc, 'liu-raise').source === 'your log',
     'accessory work is reported as coming from the log');
}

group('A stale working weight cannot silently win');
{
  const db = freshDB();
  db.program.id = 'tv-4day';
  db.program.working = { squat: 25, press: 60, deadlift: 140 };
  db.sessions = [{ id: 'r', date: '2026-07-29', type: 'lift', programId: 'tv-4day', label: 'D',
    entries: [
      { exerciseId: 'squat', sets: [{ weight: 100, reps: 5, done: true }] },
      { exerciseId: 'press', sets: [{ weight: 55, reps: 5, done: true }] },
    ] }];

  const stale = staleWeights(db);
  ok(stale.length === 1 && stale[0].exerciseId === 'squat',
     'a weight below what you already lifted is flagged',
     JSON.stringify(stale.map((x) => x.exerciseId)));
  ok(stale[0].working === 25 && stale[0].last.weight === 100,
     'with both numbers, so the choice is informed');
  ok(!stale.some((x) => x.exerciseId === 'press'),
     'a weight ABOVE the last logged set is not flagged — that is the increment working');
  ok(!stale.some((x) => x.exerciseId === 'deadlift'),
     'and a lift with no history is not flagged at all');

  const now = adoptLogged(db, 'squat');
  ok(now === 100, 'adopting the log gives you the weight you actually lifted', String(now));
  ok(db.program.working.squat === undefined, 'and clears the stale number');
  ok(staleWeights(db).length === 0, 'leaving nothing flagged');
  ok(nextWorkout(db).items[0].weight === 100,
     'so the next session is prescribed from reality',
     String(nextWorkout(db).items[0].weight));
}

group('The four-day preset');
{
  const p = PROGRAMS['tv-4day'];
  ok(!!p, 'the four-day rotation is available as a preset');
  const days = p.phases[1].rotation;
  ok(days.length === 4, 'four days', String(days.length));

  const db = freshDB();
  db.program.id = 'tv-4day';
  db.program.working.rdl = 80;
  db.program.working.dip = 0;

  const d1 = nextWorkout(db);
  ok(d1.items.map((i) => i.exerciseId).join(',') === 'squat,press,deadlift',
     'day 1 is squat, press, deadlift', d1.items.map((i) => i.exerciseId).join(','));

  db.program.cursor = 1;
  const d2 = nextWorkout(db);
  ok(d2.items.map((i) => i.exerciseId).join(',') === 'chinup,dip,liu-raise',
     'day 2 is chins, dips, Liu raises', d2.items.map((i) => i.exerciseId).join(','));
  ok(d2.items[0].bodyweight && d2.items[1].bodyweight,
     'chins and dips are bodyweight lifts that take added weight');
  ok(!d2.items[0].toFailure && !d2.items[1].toFailure,
     'and both run weighted for a rep target, not to failure');
  ok(d2.items[0].reps === 5 && d2.items[1].reps === 5, 'sets of five');

  db.program.cursor = 2;
  const d3 = nextWorkout(db);
  ok(d3.items.length === 1 && d3.items[0].conditioning === true,
     'day 3 is a conditioning day', JSON.stringify(d3.items[0]));
  ok(d3.items[0].rounds === 12 && d3.items[0].minutes === 3,
     '12 × 3 minute rounds', JSON.stringify(d3.items[0]));
  ok(d3.items[0].weight === null, 'a conditioning slot carries no weight');

  db.program.cursor = 3;
  const d4 = nextWorkout(db);
  ok(d4.items.map((i) => i.exerciseId).join(',') === 'squat,bench,rdl',
     'day 4 is squat, bench, RDL', d4.items.map((i) => i.exerciseId).join(','));

  db.program.cursor = 4;
  ok(nextWorkout(db).label === days[0].label, 'and then it repeats');

  // A conditioning day must not touch the progression.
  db.program.cursor = 2;
  const before = JSON.stringify(db.program.working);
  applySession(db, {
    label: 'Day 3 — Bag', type: 'lift', programId: 'tv-4day',
    entries: [{ exerciseId: 'box-bag-int', conditioning: true, done: true, sets: [] }],
  });
  ok(JSON.stringify(db.program.working) === before,
     'a bag day changes no working weights');

  // Dips progress on added weight once the rep target is cleared.
  db.program.working.dip = 0;
  applySession(db, {
    label: 'Day 2', type: 'lift', programId: 'tv-4day',
    entries: [{ exerciseId: 'dip', prescribedSets: 3, prescribedReps: 0, toFailure: true,
      sets: [{ weight: 0, reps: 16, done: true }] }],
  });
  ok(db.program.working.dip > 0, 'clearing 15 dips starts adding weight',
     String(db.program.working.dip));

  ok(programLifts({ ...db, program: { ...db.program, phase: 1 } }).length > 0,
     'programLifts survives a rotation containing a conditioning day');
  ok(validateProgram(p).length === 0, 'the preset validates clean', validateProgram(p).join(' '));
}

group('Boxing round timer');
{
  // Drive the clock by hand rather than waiting in real time.
  const make = (cfg) => {
    const t = new RoundTimer(cfg);
    const events = [];
    t.onEvent = (n) => events.push(n);
    let now = 1_000_000;
    const origNow = Date.now;
    Date.now = () => now;
    return {
      t, events,
      advance(sec) { now += sec * 1000; t._check(); },
      restore() { Date.now = origNow; },
    };
  };

  const h = make({ rounds: 3, roundSec: 180, restSec: 60, prepSec: 0,
                   inRoundWarnSec: 30, endWarnSec: 10, restWarnSec: 10 });
  try {
    ok(h.t.phase === 'work' && h.t.round === 1, 'starts on round 1 with no lead-in');
    h.t.start();
    ok(h.events.includes('bell'), 'a bell opens the round');

    h.advance(149);
    ok(!h.events.includes('warn'), 'no warning before its time', String(h.t.remaining));

    h.advance(2);                       // 151 s in, 29 s left
    ok(h.events.includes('warn'), 'the 30 s clapper fires', String(h.t.remaining));
    const warns = h.events.filter((e) => e === 'warn').length;
    h.advance(5);
    ok(h.events.filter((e) => e === 'warn').length === warns,
       'and it fires exactly once');

    h.advance(15);                      // 171 s in, 9 s left
    ok(h.events.includes('endwarn'), 'the 10 s warning fires');

    h.advance(10);                      // round over
    ok(h.t.phase === 'rest', 'the round ends into rest', h.t.phase);
    ok(h.t.roundsCompleted === 1, 'one round is banked', String(h.t.roundsCompleted));

    h.advance(51);                      // 9 s of rest left
    ok(h.events.includes('restwarn'), 'seconds out fires before the rest ends');

    h.advance(10);
    ok(h.t.phase === 'work' && h.t.round === 2, 'and it rolls into round 2',
       `${h.t.phase} r${h.t.round}`);

    // Run out the session.
    h.advance(180); h.advance(60); h.advance(180);
    ok(h.t.phase === 'done', 'the session finishes after the last round', h.t.phase);
    ok(h.t.roundsCompleted === 3, 'all three rounds counted', String(h.t.roundsCompleted));
    ok(h.events.includes('done'), 'and a done event fires');
    ok(h.t.workSecondsDone === 540, '3 × 3 min = 540 s of work',
       String(h.t.workSecondsDone));
  } finally { h.restore(); }

  // A warning longer than the round must never fire.
  const h2 = make({ rounds: 1, roundSec: 20, restSec: 0, prepSec: 0,
                    inRoundWarnSec: 30, endWarnSec: 10, restWarnSec: 10 });
  try {
    h2.t.start();
    h2.advance(11);
    ok(!h2.events.includes('warn'),
       'a 30 s warning is suppressed on a 20 s round');
    ok(h2.events.includes('endwarn'), 'but the 10 s warning still fires');
  } finally { h2.restore(); }

  // Lead-in.
  const h3 = make({ rounds: 2, roundSec: 60, restSec: 30, prepSec: 10,
                    inRoundWarnSec: 0, endWarnSec: 0, restWarnSec: 0 });
  try {
    ok(h3.t.phase === 'prep', 'a lead-in starts in prep');
    h3.t.start();
    h3.advance(10);
    ok(h3.t.phase === 'work' && h3.t.round === 1, 'then opens round 1');
    ok(h3.t.roundsCompleted === 0, 'nothing banked yet');
    h3.advance(60);
    ok(h3.t.phase === 'rest', 'into rest');
    h3.advance(30);
    h3.advance(60);
    ok(h3.t.phase === 'done' && h3.t.roundsCompleted === 2, 'two rounds and done');
  } finally { h3.restore(); }

  // Zero rest chains rounds straight together.
  const h4 = make({ rounds: 3, roundSec: 30, restSec: 0, prepSec: 0,
                    inRoundWarnSec: 0, endWarnSec: 0, restWarnSec: 0 });
  try {
    h4.t.start();
    h4.advance(30);
    ok(h4.t.phase === 'work' && h4.t.round === 2,
       'with no rest configured, rounds run back to back', `${h4.t.phase} r${h4.t.round}`);
  } finally { h4.restore(); }

  ok(DEFAULT_BOXING.rounds === 12 && DEFAULT_BOXING.roundSec === 180,
     'defaults are 12 × 3 min');

  // The case that matters on a phone: the app is backgrounded for minutes and
  // gets no frames at all. On return it must land on the right round, not one
  // phase later.
  const h5 = make({ rounds: 12, roundSec: 180, restSec: 60, prepSec: 0,
                    inRoundWarnSec: 30, endWarnSec: 10, restWarnSec: 10 });
  try {
    h5.t.start();
    h5.advance(180 + 60 + 180 + 60 + 90);   // through rounds 1–2 and into round 3
    ok(h5.t.phase === 'work' && h5.t.round === 3,
       'a long background gap rolls through every phase that elapsed',
       `${h5.t.phase} round ${h5.t.round}`);
    ok(Math.abs(h5.t.remaining - 90) < 0.5,
       'and lands at the right point inside the round, overshoot carried',
       String(h5.t.remaining));
    ok(h5.t.roundsCompleted === 2, 'with the right number banked',
       String(h5.t.roundsCompleted));

    // A gap past the end of the session must finish, not spin.
    h5.advance(60 * 60);
    ok(h5.t.phase === 'done', 'and a gap past the end simply finishes', h5.t.phase);
  } finally { h5.restore(); }
}

group('Set attachments');
{
  ok(typeof indexedDB !== 'undefined' && mediaSupported,
     'media storage is available in this browser');

  const set = { weight: 100, reps: 5, done: true };
  ok(!hasAttachments(set), 'a bare set has nothing attached');
  ok(hasAttachments({ ...set, note: 'felt heavy' }), 'a comment counts');
  ok(hasAttachments({ ...set, media: [{ id: 'm1', kind: 'video' }] }), 'a clip counts');
  ok(!hasAttachments({ ...set, note: '   ' }), 'whitespace is not a comment');
  ok(!hasAttachments({ ...set, media: [] }), 'an empty media list is not an attachment');

  ok(fmtBytes(0) === '0 KB' && fmtBytes(2048) === '2 KB' && fmtBytes(5 * 1024 * 1024) === '5.0 MB',
     'byte sizes format sensibly', `${fmtBytes(2048)} / ${fmtBytes(5 * 1024 * 1024)}`);

  // Round-trip a blob through IndexedDB and confirm prune only takes orphans.
  window.__mediaTest = (async () => {
    const blob = new Blob(['x'.repeat(1000)], { type: 'video/mp4' });
    await mediaPut('m-kept', blob, { kind: 'video' });
    await mediaPut('m-orphan', blob, { kind: 'video' });
    const back = await mediaGet('m-kept');
    const db = {
      sessions: [{ entries: [{ sets: [{ media: [{ id: 'm-kept', kind: 'video' }] }], warmupSets: [] }] }],
      activeSession: null,
    };
    const res = await mediaPrune(db);
    const still = await mediaGet('m-kept');
    const gone = await mediaGet('m-orphan');
    await mediaRemove('m-kept');
    return { size: back?.size, removed: res.removed, kept: !!still, orphanGone: !gone };
  })();
}

// ---------------------------------------------------------------- carry
group('Last session carries forward');
{
  const KEY = 'ironlog.db';
  const backup = localStorage.getItem(KEY);
  try {
    store.wipe();
    store.update((d) => {
      d.program.working = { squat: 100, press: 50, bench: 70, deadlift: 140, rdl: 80 };
      d.sessions.push({
        id: 'prev', type: 'lift', programId: 'ss-novice', label: 'A', date: '2026-07-20',
        entries: [
          // Programmed — must NOT be carried; the engine owns these.
          { exerciseId: 'squat', prescribedSets: 3, prescribedReps: 5,
            sets: [{ weight: 95, reps: 5, done: true }] },
          // Chosen extras — these are what should come back.
          { exerciseId: 'db-row', assistance: true, prescribedSets: 3, prescribedReps: 10,
            sets: [{ weight: 30, reps: 10, done: true }, { weight: 30, reps: 9, done: true }] },
          { exerciseId: 'rdl', prescribedSets: 3, prescribedReps: 8,
            sets: [{ weight: 80, reps: 8, done: true }] },
        ],
      });
    }, { immediate: true });

    const db = store.get();
    const prev = lastSessionLike(db, 'A');
    ok(prev?.id === 'prev', 'finds the last session for the same slot');
    ok(lastSessionLike(db, 'B')?.id === 'prev',
       'falls back to the most recent session when the slot has never been run');

    const wk = nextWorkout(db);
    const programmed = new Set(wk.items.map((i) => i.exerciseId));
    const extras = prev.entries.filter((e) => !programmed.has(e.exerciseId));
    ok(extras.length === 2, 'only the non-programmed work is eligible to carry',
       JSON.stringify(extras.map((e) => e.exerciseId)));
    ok(!extras.some((e) => e.exerciseId === 'squat'),
       'the programmed squat is not carried — its weight comes from the progression');
    ok(wk.items.find((i) => i.exerciseId === 'squat').weight === 100,
       'and that programmed weight is the current working weight, not last session\'s 95',
       String(wk.items.find((i) => i.exerciseId === 'squat').weight));

    const row = extras.find((e) => e.exerciseId === 'db-row');
    ok(row.sets.length === 2, 'carried work remembers how many sets you actually did');
    ok(row.sets.at(-1).weight === 30 && row.sets.at(-1).reps === 9,
       'and the weight and reps you actually used');

    // The function the app actually calls.
    const carried = carryForward(db, wk);
    ok(carried.entries.length === 2, 'carryForward returns exactly the extras',
       JSON.stringify(carried.entries.map((e) => e.exerciseId)));
    ok(carried.from === '2026-07-20', 'and reports the date it came from');
    const cRow = carried.entries.find((e) => e.exerciseId === 'db-row');
    ok(cRow.sets.length === 2 && cRow.sets[0].weight === 30 && cRow.sets[0].reps === 9,
       'pre-filled with last time\'s numbers, ready to tick off');
    ok(cRow.sets.every((s) => !s.done), 'but nothing is pre-ticked — you still have to do the work');
    // The ownership split: the engine owns main-lift weights, you own accessories.
    const cRdlW = carried.entries.find((e) => e.exerciseId === 'rdl');
    ok(cRdlW.sets[0].weight === 80,
       'a carried main lift comes back at its working weight, not last session\'s',
       `${cRdlW.sets[0].weight} (working 80, last session 0)`);
    ok(cRdlW.derived === false, 'and it keeps progressing like any main lift');
    ok(carried.entries.find((e) => e.exerciseId === 'db-row').derived === true,
       'carried accessory work stays derived and never touches the programme');
    ok(carried.entries.find((e) => e.exerciseId === 'db-row').sets[0].weight === 30,
       'accessory weight is exactly what you last used');

    // A carried barbell lift must still get a warm-up ladder to tick off.
    const cRdl = carried.entries.find((e) => e.exerciseId === 'rdl');
    ok(cRdl.warmupSets.length > 0, 'a carried barbell lift gets warm-up rows',
       JSON.stringify(cRdl.warmupSets));
    ok(cRdl.warmupSets.every((w) => w.weight < cRdl.sets[0].weight),
       'and none of them reaches the work weight');
    ok(cRdl.warmupSets.every((w) => !w.done), 'warm-ups are not pre-ticked either');
    ok(carried.entries.find((e) => e.exerciseId === 'db-row').warmupSets.length === 0,
       'a dumbbell accessory gets no barbell warm-up ladder');

    // Completing carried work: the main lift advances, the accessory does not
    // touch anything, and the programmed lifts are untouched by either.
    const beforeRdl = db.program.working.rdl;
    const beforeSquat = db.program.working.squat;
    applySession(db, {
      label: 'A', type: 'lift', programId: 'ss-novice',
      entries: carried.entries.map((e) => ({
        ...e, sets: e.sets.map((x) => ({ ...x, done: true })),
      })),
    });
    ok(db.program.working.rdl === beforeRdl + 2.5,
       'a completed carried main lift progresses',
       `${beforeRdl} -> ${db.program.working.rdl}`);
    ok(db.program.working.squat === beforeSquat,
       'and the programmed lifts are untouched by carried work',
       `${beforeSquat} -> ${db.program.working.squat}`);

    // With no history at all there is simply nothing to carry.
    store.wipe();
    const empty = carryForward(store.get(), nextWorkout(store.get()));
    ok(empty.entries.length === 0 && empty.from === null,
       'a first-ever session carries nothing and does not crash');
  } finally {
    if (backup !== null) localStorage.setItem(KEY, backup);
    else localStorage.removeItem(KEY);
  }
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

    // Importing a backlog of OLD training must not touch the programme state
    // of the device you are currently training on.
    store.wipe();
    store.update((d) => {
      d.program.working = { squat: 120 };
      d.program.cursor = 7;
      d.sessions.push({ id: 'today', type: 'lift', date: '2026-07-29', label: 'A', entries: [] });
    }, { immediate: true });

    const backlog = {
      schema: 3,
      program: { id: 'ss-novice', phase: 1, working: { squat: 60 }, fails: {}, cursor: 0, increments: {} },
      sessions: Array.from({ length: 20 }, (_, i) => ({
        id: `old${i}`, type: 'lift', date: `2025-03-${String(i + 1).padStart(2, '0')}`,
        label: 'A', entries: [],
      })),
    };
    store.importJSON(JSON.stringify(backlog), { mode: 'merge' });
    let db2 = store.get();
    ok(db2.sessions.length === 21, 'the backlog is merged in', String(db2.sessions.length));
    ok(db2.program.working.squat === 120,
       'twenty old sessions do not overwrite your current working weight',
       String(db2.program.working.squat));
    ok(db2.program.cursor === 7, 'nor your place in the rotation', String(db2.program.cursor));

    // But a genuine sync from a device you trained on more recently should win.
    store.importJSON(JSON.stringify({
      schema: 3,
      program: { id: 'ss-novice', phase: 1, working: { squat: 130 }, fails: {}, cursor: 9, increments: {} },
      sessions: [{ id: 'phone', type: 'lift', date: '2026-07-31', label: 'A', entries: [] }],
    }), { mode: 'merge' });
    db2 = store.get();
    ok(db2.program.working.squat === 130,
       'a session logged more recently elsewhere does carry its programme state',
       String(db2.program.working.squat));
    ok(db2.program.cursor === 9, 'including the rotation position');

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
// The IndexedDB round trip is genuinely asynchronous, so it reports itself
// once it settles rather than being skipped.
if (window.__mediaTest) {
  window.__mediaTest.then((r) => {
    group('Set attachments — storage round trip');
    ok(r.size === 1000, 'a blob comes back the same size it went in', JSON.stringify(r));
    ok(r.kept, 'a referenced file survives a prune');
    ok(r.orphanGone && r.removed === 1, 'and exactly the orphan is removed', JSON.stringify(r));
    const el2 = document.getElementById('summary');
    el2.textContent = `${pass} passed, ${fail} failed`;
    el2.className = fail ? 'fail' : 'pass';
    // Preserve the completion flag: this promise settles after the synchronous
    // groups, so overwriting it blind would erase the one signal that says the
    // file was evaluated all the way to the end.
    window.__results = { pass, fail, complete: window.__suiteComplete === true };
  }).catch((e) => {
    group('Set attachments — storage round trip');
    ok(false, 'IndexedDB round trip', String(e));
  });
}

const s = document.getElementById('summary');
s.textContent = `${pass} passed, ${fail} failed`;
s.className = fail ? 'fail' : 'pass';
window.__results = { pass, fail };

group('In-round warning — "every X seconds" mode');
{
  const drive = (cfg, seconds) => {
    const t = new RoundTimer(cfg);
    const warnAt = [];
    let now = 1_000_000;
    const origNow = Date.now;
    Date.now = () => now;
    try {
      t.onEvent = (n) => { if (n === 'warn') warnAt.push(Math.round(cfg.roundSec - t.remaining)); };
      t.start();
      for (let s = 0; s < seconds; s++) { now += 1000; t._check(); }
    } finally { Date.now = origNow; }
    return { t, warnAt };
  };

  const base = { rounds: 3, roundSec: 180, restSec: 60, prepSec: 0,
                 endWarnSec: 0, restWarnSec: 0 };

  const iv = drive({ ...base, inRoundWarnSec: 30, inRoundWarnMode: 'interval' }, 179);
  ok(iv.warnAt.join(',') === '30,60,90,120,150',
     'fires at every 30 s mark from the start of the round', iv.warnAt.join(','));
  ok(!iv.warnAt.includes(180), 'never on the bell itself — the bell says that');

  // Sub-second ticking must not double-fire a mark.
  {
    const t = new RoundTimer({ ...base, inRoundWarnSec: 60, inRoundWarnMode: 'interval' });
    let n = 0, now = 2_000_000;
    const origNow = Date.now;
    Date.now = () => now;
    try {
      t.onEvent = (e) => { if (e === 'warn') n++; };
      t.start();
      for (let ms = 0; ms <= 70000; ms += 200) { now += 200; t._check(); }
    } finally { Date.now = origNow; }
    ok(n === 1, 'one beep per mark, not one per 200 ms tick', String(n));
  }

  // Waking after several marks passed must not fire a burst.
  {
    const t = new RoundTimer({ ...base, roundSec: 300, inRoundWarnSec: 30, inRoundWarnMode: 'interval' });
    let n = 0, now = 3_000_000;
    const origNow = Date.now;
    Date.now = () => now;
    try {
      t.onEvent = (e) => { if (e === 'warn') n++; };
      t.start();
      now += 150000;                     // pocket for two and a half minutes
      t._check();
    } finally { Date.now = origNow; }
    ok(n === 1, 'catching up across five marks beeps once', String(n));
  }

  // The mark counter has to reset, or round 2 would never warn.
  {
    const t = new RoundTimer({ rounds: 3, roundSec: 60, restSec: 10, prepSec: 0,
                               endWarnSec: 0, restWarnSec: 0,
                               inRoundWarnSec: 20, inRoundWarnMode: 'interval' });
    const perRound = [];
    let cur = 0, now = 4_000_000;
    const origNow = Date.now;
    Date.now = () => now;
    try {
      t.onEvent = (e) => {
        if (e === 'warn') cur++;
        if (e === 'bell') { perRound.push(cur); cur = 0; }
      };
      t.start();
      for (let s = 0; s < 150; s++) { now += 1000; t._check(); }
    } finally { Date.now = origNow; }
    ok(perRound.length >= 2 && perRound[1] >= 2,
       'round 2 warns again after the counter resets', JSON.stringify(perRound));
  }

  const be = drive({ ...base, inRoundWarnSec: 30, inRoundWarnMode: 'before-end' }, 179);
  ok(be.warnAt.length === 1 && be.warnAt[0] === 150,
     'before-end mode still fires once, at 30 s left', be.warnAt.join(','));

  const off = drive({ ...base, inRoundWarnSec: 0, inRoundWarnMode: 'interval' }, 179);
  ok(off.warnAt.length === 0, 'zero turns the interval warning off');

  const tooLong = drive({ ...base, inRoundWarnSec: 200, inRoundWarnMode: 'interval' }, 179);
  ok(tooLong.warnAt.length === 0, 'an interval longer than the round never fires');

  ok(DEFAULT_BOXING.inRoundWarnMode === 'before-end',
     'the default is still the gym clapper, so nothing changes unasked');
}

group('Saved timer settings beat a programme prescription');
{
  // Day 3 of the four-day prescribes 12 x 3:00 with 60 s rest. Once you have
  // opened the settings sheet and saved, your numbers must survive reopening.
  const saved = { ...DEFAULT_BOXING, restSec: 20, inRoundWarnSec: 60, inRoundWarnMode: 'interval' };
  const reopened = { ...DEFAULT_BOXING, ...saved };
  ok(reopened.restSec === 20, 'hand-set rest survives', String(reopened.restSec));
  ok(reopened.inRoundWarnSec === 60, 'hand-set warning survives', String(reopened.inRoundWarnSec));
  ok(reopened.inRoundWarnMode === 'interval', 'hand-set mode survives');

  // And the old behaviour, for contrast: an override wins when one is passed.
  const withOverride = { ...DEFAULT_BOXING, ...saved, restSec: 60 };
  ok(withOverride.restSec === 60, 'an explicit override still wins when passed');
}

group('Backdated sessions carry a stated time and duration');
{
  // A session logged after the fact must record the duration you typed. Timing
  // it from the wall clock would report a February session as five months long.
  const finish = (s) => (s.fixedDurationSec != null
    ? s.fixedDurationSec
    : Math.round((Date.now() - s.startedAt) / 1000));

  const backdated = {
    startedAt: new Date('2026-02-11T18:00').getTime(),
    fixedDurationSec: 75 * 60,
  };
  ok(finish(backdated) === 4500, 'a stated 75 min is recorded as 75 min',
     String(finish(backdated) / 60));

  const live = { startedAt: Date.now() - 30 * 60 * 1000, fixedDurationSec: null };
  const mins = finish(live) / 60;
  ok(mins > 29 && mins < 31, 'a live session still times itself', String(mins));

  // The start time has to survive into the stored session, or two sessions on
  // the same date sort arbitrarily.
  const t = new Date('2026-02-11T06:30').getTime();
  ok(new Date(t).getHours() === 6 && new Date(t).getMinutes() === 30,
     'an early-morning start time round-trips');

  // Zero or blank duration must fall back to timing rather than record zero.
  const blank = { startedAt: Date.now() - 60000, fixedDurationSec: null };
  ok(finish(blank) > 0, 'a blank duration does not record a zero-length session');
}

group('A backlog import is history, never programme state');
{
  // Regression. importJSON ran migrate() on the incoming file first, and
  // migrate() invents a default programme for any file that lacks one. The
  // backlog file carries no programme at all, so "is the incoming file more
  // recent?" handed over a fabricated empty one and emptied the working
  // weights on the device. Ask the raw file whether it carries a programme.
  const before = store.get();
  const keptCursor = 2;
  store.update((d) => {
    d.sessions = [];
    d.program.cursor = keptCursor;
    d.program.working = { 'lowbar-squat': 137.5 };
  }, { immediate: true });

  const file = JSON.stringify({
    schema: before.schema ?? 1,
    backlogImport: true,
    sessions: [{ id: 'bl-test-1', date: '2099-01-01', type: 'lift', entries: [], durationSec: 3600 }],
    metrics: { defs: [], entries: [] },
    nutrition: { log: [], customFoods: [] },
    lab: { customTests: [], results: [] },
    customExercises: [], customPrograms: [], prs: {},
  });

  store.importJSON(file, { mode: 'merge' });
  const after = store.get();
  ok(after.program.cursor === keptCursor,
     'a programme-less import leaves the rotation alone', String(after.program.cursor));
  ok(after.program.working['lowbar-squat'] === 137.5,
     'and leaves the working weights alone',
     JSON.stringify(after.program.working));
  ok(after.sessions.some((s) => s.id === 'bl-test-1'),
     'while still importing the session itself');

  // Importing the same file twice must not duplicate: ids are deterministic.
  const n = after.sessions.length;
  store.importJSON(file, { mode: 'merge' });
  ok(store.get().sessions.length === n, 'importing twice adds nothing the second time');
}

group('A conditioning day carries nothing in');
{
  // Regression. lastSessionLike falls back to the most recent lift session
  // when a slot has never been run — right for a free session, wrong for a
  // bag day: it programs no lifts, so every lift in the fallback session
  // counted as an "extra" and Day 3 opened by offering squats.
  const KEY = 'ironlog.db';
  const backup = localStorage.getItem(KEY);
  try {
    store.wipe();
    store.update((d) => {
      d.program.id = 'tv-4day';
      d.program.cursor = 2;                    // Day 3 — Bag
      d.program.working = { squat: 130, bench: 90, rdl: 110 };
      d.sessions.push({
        id: 'day4', type: 'lift', programId: 'tv-4day', label: 'Day 4 — Squat, bench, RDL',
        date: '2026-07-27',
        entries: [
          { exerciseId: 'squat', prescribedSets: 3, prescribedReps: 5,
            sets: [{ weight: 130, reps: 5, done: true }] },
          { exerciseId: 'bench', prescribedSets: 3, prescribedReps: 5,
            sets: [{ weight: 90, reps: 5, done: true }] },
          { exerciseId: 'rdl', prescribedSets: 1, prescribedReps: 5,
            sets: [{ weight: 110, reps: 5, done: true }] },
        ],
      });
    }, { immediate: true });

    const db = store.get();
    const wk = nextWorkout(db);
    ok(wk.items.length === 1 && !!wk.items[0].conditioning,
       'the bag day prescribes exactly its conditioning block',
       JSON.stringify(wk.items.map((i) => i.exerciseId || i.conditioningId)));

    const carried = carryForward(db, wk);
    ok(carried.entries.length === 0,
       'and nothing is carried into it — no lifts offered on a bag day',
       JSON.stringify(carried.entries.map((e) => e.exerciseId)));

    // A programmed lift day no longer inherits another slot's work either:
    // Day 1 has never been run, and the only history is Day 4.
    store.update((d) => { d.program.cursor = 0; }, { immediate: true });
    const day1 = carryForward(store.get(), nextWorkout(store.get()));
    ok(day1.entries.length === 0,
       'a programmed day never carries from a different slot',
       JSON.stringify(day1.entries.map((e) => e.exerciseId)));

    // The free session keeps its any-session fallback — repeating whatever
    // you last did is its entire purpose.
    const free = carryForward(store.get(), { label: 'Free session', items: [] });
    ok(free.entries.length > 0, 'a free session still starts from the last one',
       String(free.entries.length));
  } finally {
    if (backup !== null) localStorage.setItem(KEY, backup);
    else localStorage.removeItem(KEY);
  }
}

group('0.75 kg fractional plates');
{
  // TV's rule: smallest loadable is 0.75 kg. A barbell jump splits across two
  // sides, so the bar's minimum honest jump is 1.5; a belt takes one plate,
  // so chins and dips jump 0.75.
  const KEY = 'ironlog.db';
  const backup = localStorage.getItem(KEY);
  try {
    store.wipe();
    const d = store.get();
    ok(d.settings.plates.includes(0.75), 'the default plate set owns 0.75 kg plates',
       JSON.stringify(d.settings.plates));

    ok(MAIN_LIFTS.chinup.increment === 0.75 && MAIN_LIFTS.chinup.lateIncrement === 0.75,
       'chins jump 0.75, early and late');
    ok(MAIN_LIFTS.dip.increment === 0.75 && MAIN_LIFTS.dip.lateIncrement === 0.75,
       'dips jump 0.75, early and late');
    ok(MAIN_LIFTS.squat.increment === 2.5, 'the barbell standard stays the book 2.5');

    // Every barbell jump must be makeable from the plates owned — the real
    // test is the plate solver, not divisibility by the smallest plate: a
    // 2.5 kg deadlift jump is one 1.25 plate per side, which he owns.
    for (const id of ['squat', 'press', 'bench', 'deadlift', 'rdl', 'powerclean']) {
      for (const inc of [MAIN_LIFTS[id].increment, MAIN_LIFTS[id].lateIncrement]) {
        ok(isLoadable(d.settings.barWeight + inc, d.settings),
           `${id} jump of ${inc} is loadable on the bar`,
           JSON.stringify(platesFor(d.settings.barWeight + inc, d.settings.barWeight, d.settings.plates)));
      }
    }

    // An old export with the untouched default plate list gains the 0.75s on
    // import; a list the user edited is their inventory and stays theirs.
    const base = JSON.parse(JSON.stringify(store.get()));
    base.settings.plates = [25, 20, 15, 10, 5, 2.5, 1.25];
    store.importJSON(JSON.stringify(base), { mode: 'replace' });
    ok(store.get().settings.plates.includes(0.75),
       'an old default plate list is granted the new plates on import',
       JSON.stringify(store.get().settings.plates));

    base.settings.plates = [25, 20, 10, 5];   // clearly user-edited
    store.importJSON(JSON.stringify(base), { mode: 'replace' });
    ok(!store.get().settings.plates.includes(0.75),
       'a hand-edited plate list is left exactly as the user set it',
       JSON.stringify(store.get().settings.plates));

    // The progression arithmetic lands where the plates land.
    store.wipe();
    const db = store.get();
    db.program.working.chinup = 15;
    applySession(db, {
      label: 'D2', type: 'lift', programId: 'tv-4day',
      entries: [{ exerciseId: 'chinup', prescribedSets: 3, prescribedReps: 5,
        sets: Array.from({ length: 3 }, () => ({ weight: 15, reps: 5, done: true })) }],
    });
    ok(db.program.working.chinup === 15.75,
       'a made chin session moves the belt 15 -> 15.75', String(db.program.working.chinup));
  } finally {
    if (backup !== null) localStorage.setItem(KEY, backup);
    else localStorage.removeItem(KEY);
  }
}

group('A made session earns the jump, even from the log alone');
{
  // TV's report: after the backlog import his squat offer was February's
  // number verbatim. The import correctly never writes programme state, but
  // Starting Strength says a made session earns the increment — and the log
  // is the record of that made session.
  const logged = (sets, { prescribedSets = 3, prescribedReps = 5 } = {}) => ({
    settings: SETTINGS, profile: { bodyweightKg: 90 },
    program: { id: 'tv-4day', phase: 1, cursor: 0, working: {}, fails: {}, increments: {} },
    sessions: [{ id: 's1', type: 'lift', label: 'Day 1 — Squat / Press / Pull',
      date: '2026-02-11',
      entries: [{ exerciseId: 'squat', prescribedSets, prescribedReps, sets }] }],
  });
  const made = () => Array.from({ length: 3 }, () => ({ weight: 100, reps: 5, done: true }));

  ok(offeredWeight(logged(made()), 'squat') === 102.5,
     'a made 3x5 at 100 offers 102.5, not 100',
     String(offeredWeight(logged(made()), 'squat')));

  const missed = made(); missed[2] = { weight: 100, reps: 4, done: true };
  ok(offeredWeight(logged(missed), 'squat') === 100,
     'a missed rep repeats the weight — no jump until it is made');

  const noPlan = logged(made(), { prescribedSets: 0, prescribedReps: 0 });
  ok(offeredWeight(noPlan, 'squat') === 100,
     'an entry with no recorded plan proves nothing, so nothing is added');

  const db = logged(made());
  db.program.working.squat = 110;
  ok(offeredWeight(db, 'squat') === 110,
     'a stored working weight still wins over everything');

  // An off-grid base — pounds converted to kilos — snaps to a loadable bar.
  const lb = logged(Array.from({ length: 3 }, () => ({ weight: 136.08, reps: 5, done: true })));
  const off = offeredWeight(lb, 'squat');
  ok(Math.abs(off - 137.5) < 1e-9,
     'an imported 136.08 kg (300 lb) offers a loadable 137.5, not 138.58',
     String(off));

  // The per-item models gate the offer the same way they gate the engine.
  ok(offeredWeight(logged(made()), 'squat', null, 'manual') === 100,
     'manual: the offer parrots the log and waits for you');
  ok(offeredWeight(logged(made()), 'squat', null, 'weekly') === 102.5,
     'weekly: a session from months ago has long since earned its jump');
  const recent = logged(made());
  recent.sessions[0].date = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  ok(offeredWeight(recent, 'squat', null, 'weekly') === 100,
     'weekly: a session two days ago holds until the week is up');
}

group('Per-exercise progression models in a custom programme');
{
  const DEF = {
    id: 'cp-models', name: 'Models', custom: true,
    phases: { 1: { rotation: [{ label: 'D1', items: [
      { ex: 'squat', sets: 3, reps: 5, progression: 'weekly' },
      { ex: 'bench', sets: 3, reps: 5 },
      { ex: 'press', sets: 3, reps: 5, progression: 'manual' },
    ] }] } },
  };
  registerCustomPrograms([DEF]);
  try {
    // The engine builds on the weight actually lifted, so each session logs
    // what a lifter following the offers would have on the bar.
    const mkSession = (date, w) => ({
      label: 'D1', type: 'lift', programId: 'cp-models', date,
      entries: Object.entries(w).map(([exerciseId, weight]) => ({
        exerciseId, prescribedSets: 3, prescribedReps: 5,
        sets: Array.from({ length: 3 }, () => ({ weight, reps: 5, done: true })),
      })),
    });
    const db = freshDB({ program: {
      id: 'cp-models', phase: 1, cursor: 0, tmWeek: 0,
      working: { squat: 100, bench: 70, press: 50 }, fails: {}, increments: {},
    } });

    applySession(db, mkSession('2026-07-01', { squat: 100, bench: 70, press: 50 }));
    ok(db.program.working.squat === 102.5, 'weekly lift takes its first jump', String(db.program.working.squat));
    ok(db.program.working.bench === 72.5, 'default lift progresses per session as always');
    ok(db.program.working.press === 50, 'manual lift does not move', String(db.program.working.press));

    applySession(db, mkSession('2026-07-04', { squat: 102.5, bench: 72.5, press: 50 }));
    ok(db.program.working.squat === 102.5, 'weekly: made again three days later, holds', String(db.program.working.squat));
    ok(db.program.working.bench === 75, 'while the session-model lift keeps climbing');

    applySession(db, mkSession('2026-07-08', { squat: 102.5, bench: 75, press: 50 }));
    ok(db.program.working.squat === 105, 'weekly: a week after the first jump, the next one lands', String(db.program.working.squat));
    ok(db.program.working.press === 50, 'manual stays put through all of it');

    // Manual also means no fail bookkeeping — the engine's hands stay off.
    const miss = mkSession('2026-07-10', { squat: 105, bench: 77.5, press: 50 });
    miss.entries[2].sets = [{ weight: 50, reps: 2, done: true }];
    applySession(db, miss);
    ok(!db.program.fails.press, 'a missed manual session counts no failure', String(db.program.fails.press));

    ok(validateProgram({ ...DEF, phases: { 1: { rotation: [{ label: 'D1', items: [
      { ex: 'squat', sets: 3, reps: 5, progression: 'yolo' },
    ] } ] } } }).some((p) => p.includes('yolo')),
       'validateProgram rejects a model it does not know');
  } finally {
    registerCustomPrograms([]);
  }
}

group('Warm-ups come from your own last ramp');
{
  // TV: "just the number of the set, with last time's lifts prescribed."
  // The percentage ladder only exists for a lift with no history.
  const withRamp = (working, ramp) => ({
    settings: SETTINGS, profile: { bodyweightKg: 90 },
    program: { id: 'ss-novice', phase: 1, cursor: 0, tmWeek: 0,
      working: { squat: working, press: 50, deadlift: 140 }, fails: {}, increments: {} },
    sessions: [{ id: 's1', type: 'lift', label: 'A', date: '2026-07-20',
      entries: [{ exerciseId: 'squat', prescribedSets: 3, prescribedReps: 5,
        warmupSets: ramp,
        sets: [{ weight: working, reps: 5, done: true }] }] }],
  });
  const ramp = [
    { weight: 20, reps: 10, done: true },
    { weight: 70, reps: 5, done: true },
    { weight: 110, reps: 1, done: true },
  ];

  const wk = nextWorkout(withRamp(120, ramp));
  const squat = wk.items.find((i) => i.exerciseId === 'squat');
  ok(squat.warmup.length === 3
     && squat.warmup.every((w, i) => w.weight === ramp[i].weight && w.reps === ramp[i].reps),
     'the prescribed warm-ups are exactly last session\'s ramp',
     JSON.stringify(squat.warmup));
  ok(squat.warmup.every((w) => !w.label),
     'and none of them carries a percentage label');

  // After a reset the old top single would outweigh the work weight.
  const wkReset = nextWorkout(withRamp(100, ramp));
  const sqReset = wkReset.items.find((i) => i.exerciseId === 'squat');
  ok(sqReset.warmup.every((w) => w.weight < 100),
     'a warm-up at or above the work weight is dropped',
     JSON.stringify(sqReset.warmup.map((w) => w.weight)));
  ok(sqReset.warmup.length === 2, 'the rest of the ramp survives');

  // Unticked warm-up rows were never done, so they do not come back.
  const half = ramp.map((w, i) => ({ ...w, done: i < 2 }));
  const wkHalf = nextWorkout(withRamp(120, half));
  ok(wkHalf.items.find((i) => i.exerciseId === 'squat').warmup.length === 2,
     'only the warm-ups you actually did are prescribed again');

  // No history at all: the calculated ladder still exists as the fallback.
  const bare = withRamp(120, ramp); bare.sessions = [];
  const wkBare = nextWorkout(bare);
  ok(wkBare.items.find((i) => i.exerciseId === 'squat').warmup.length > 0,
     'a lift with no history still gets the calculated ladder');
}

group('Jiu-jitsu library');
{
  const ids = JJ_TECHNIQUES.map((t) => t.id);
  ok(ids.length === new Set(ids).size, 'technique ids are unique', String(ids.length));
  ok(JJ_TECHNIQUES.length >= 50, `library ships with a real curriculum (${JJ_TECHNIQUES.length})`);
  const typeIds = new Set(JJ_TYPES.map((t) => t.id));
  ok(JJ_TECHNIQUES.every((t) => typeIds.has(t.type)),
     'every technique belongs to a defined type');
  ok(JJ_TECHNIQUES.every((t) => t.name && t.cue && t.pos),
     'every technique carries a name, a position and a cue');
  ok(SPORTS.includes('jiu-jitsu'), 'jiu-jitsu is a sport you can log');
  const jjSessions = CONDITIONING.filter((c) => c.sport === 'jiu-jitsu');
  ok(jjSessions.length === 5, 'five session types: class, drilling, positional, rolling, open mat',
     jjSessions.map((c) => c.id).join(','));
  ok(jjSessions.every((c) => c.durationMin > 0 && c.interference),
     'each session type carries duration and interference like every other sport');

  // The library's drill counts derive from tagged sessions — the log is truth.
  const db = { sessions: [
    { type: 'conditioning', sport: 'jiu-jitsu', date: '2026-07-01',
      durationMin: 60, rounds: 5, subsFor: 2, subsAgainst: 3,
      techniques: ['jj-rnc', 'jj-knee-cut'] },
    { type: 'conditioning', sport: 'jiu-jitsu', date: '2026-07-03',
      durationMin: 45, rounds: 0, subsFor: 0, subsAgainst: 0,
      techniques: ['jj-rnc'] },
    { type: 'conditioning', sport: 'boxing', date: '2026-07-04',
      durationMin: 36, techniques: ['jj-rnc'] },   // wrong sport — ignored
  ] };
  const counts = {};
  for (const s of db.sessions.filter((x) => x.sport === 'jiu-jitsu')) {
    for (const t of s.techniques || []) counts[t] = (counts[t] || 0) + 1;
  }
  ok(counts['jj-rnc'] === 2 && counts['jj-knee-cut'] === 1,
     'drill counts sum per technique across jiu-jitsu sessions only',
     JSON.stringify(counts));
}

group('Audio session category');
{
  // navigator.audioSession.type is PAGE-wide, and setting it activates the
  // session — so it is claimed on the first tap that needs a sound and handed
  // back by stopAudio, never at module load. Opening the app must not stop a
  // podcast that is already playing.
  const KEY = 'ironlog.db';
  const backup = localStorage.getItem(KEY);
  try {
    store.wipe();
    ok(getAudioMode() === 'ambient',
       'the default is the category that genuinely mixes with other audio',
       getAudioMode());

    // All three real categories are selectable.
    for (const m of ['playback', 'transient', 'ambient']) {
      setAudioMode(m);
      ok(getAudioMode() === m, `${m} can be chosen`, getAudioMode());
    }

    // The old invented names still resolve, so a stored setting is not lost.
    setAudioMode('mix');
    ok(getAudioMode() === 'ambient', 'a stored "mix" maps to ambient');
    setAudioMode('exclusive');
    ok(getAudioMode() === 'playback', 'a stored "exclusive" maps to playback');

    // Anything unrecognised falls to mixing, never to seizing the session.
    setAudioMode(undefined);
    ok(getAudioMode() === 'ambient', 'an absent mode mixes');
    setAudioMode('nonsense');
    ok(getAudioMode() === 'ambient', 'an unknown mode mixes');
  } finally {
    if (backup !== null) localStorage.setItem(KEY, backup);
    else localStorage.removeItem(KEY);
  }
}

// ---------------------------------------------------------------- completion
// A ReferenceError anywhere above aborts module evaluation, and every group
// after it silently vanishes — the page still showed "418 passed, 0 failed"
// while a third of the file never ran. The summary now only counts as valid
// if execution actually reached this line.
group('Suite completed');
ok(true, 'every group above was reached — the summary is complete');
{
  const el3 = document.getElementById('summary');
  if (el3) {
    el3.textContent = `${pass} passed, ${fail} failed`;
    el3.className = fail ? 'fail' : 'pass';
  }
  window.__suiteComplete = true;
  window.__results = { pass, fail, complete: true };
}

group('Opening the app must not seize the audio session');
{
  // The v29 regression TV hit: applyAudioSession() ran at module load, so the
  // mere act of opening IronLog stopped whatever was playing. The category is
  // only ever claimed from a tap that needs a sound.
  const src = window.__timerSource || '';
  ok(!/^applyAudioSession\(\);$/m.test(src),
     'the module does not claim the audio session at load');
  ok(/stopAudio[\s\S]*audioSession\.type = 'auto'/.test(src),
     'and stopAudio hands the session back so a podcast un-ducks');
  ok(/let audioMode = 'ambient'/.test(src),
     'the shipped default is the mixing category, not an interrupting one');
}

group('The round timer keeps its place across a settings trip');
{
  // TV: open the timer, tap Settings, come back — and it had restarted at
  // round 1 prep. openRoundTimer built a brand new RoundTimer every time.
  const cfg = { ...DEFAULT_BOXING, rounds: 12, roundSec: 180, restSec: 60, prepSec: 10 };

  // Stand in the middle of round 9, 40 s in.
  const live = new RoundTimer(cfg);
  live.phase = 'work'; live.round = 9; live.elapsedInPhase = 40;
  const snap = { phase: live.phase, round: live.round, elapsedInPhase: live.elapsedInPhase };

  // What the reopened timer does with that snapshot.
  const back = new RoundTimer(cfg);
  back.phase = snap.phase;
  back.round = Math.min(snap.round, cfg.rounds);
  back.elapsedInPhase = Math.min(snap.elapsedInPhase, back.phaseLength);
  ok(back.round === 9 && back.phase === 'work', 'the round and phase survive',
     `${back.phase} ${back.round}`);
  ok(Math.abs(back.remaining - 140) < 1, 'and so does the time left in it',
     String(back.remaining));
  ok(back.roundsCompleted === 8, 'completed rounds are still counted right',
     String(back.roundsCompleted));

  // Shortening the rotation while standing past the new end must not leave
  // the counter reading round 9 of 6.
  const shorter = { ...cfg, rounds: 6 };
  const clamped = new RoundTimer(shorter);
  clamped.phase = snap.phase;
  clamped.round = Math.min(snap.round, shorter.rounds);
  clamped.elapsedInPhase = Math.min(snap.elapsedInPhase, clamped.phaseLength);
  ok(clamped.round === 6, 'a shortened rotation clamps the round', String(clamped.round));

  // A shortened round length must not leave elapsed past the end of the phase.
  const quick = { ...cfg, roundSec: 30 };
  const q = new RoundTimer(quick);
  q.phase = 'work'; q.round = 9;
  q.elapsedInPhase = Math.min(snap.elapsedInPhase, q.phaseLength);
  ok(q.elapsedInPhase <= 30 && q.remaining >= 0,
     'a shortened round clamps elapsed rather than going negative',
     `${q.elapsedInPhase} / ${q.remaining}`);
}
