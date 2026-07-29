// Starting Strength programming.
//
// The novice linear progression and the Texas Method as described in
// Starting Strength: Basic Barbell Training and Practical Programming.
// Everything here is deterministic: given the program state and the result of
// the last session, the next session is fully computed. No coaching judgment
// is faked — phase advancement is a decision the lifter makes, and the app
// only tells you when the criteria are met.

import { MAIN_LIFTS, exerciseName } from './data/exercises.js';

/** Reps at bodyweight that earn you the right to start adding load. */
export const BW_ADD_WEIGHT_AT = 15;
import { roundTo, platesFor, uid } from './util.js';

// ---------------------------------------------------------------------------
// Program definitions
// ---------------------------------------------------------------------------

export const PROGRAMS = {
  'ss-novice': {
    id: 'ss-novice',
    name: 'Novice Linear Progression',
    source: 'Starting Strength, 3rd ed.',
    frequency: '3 × / week, non-consecutive days',
    blurb:
      'Add weight every single session. This is the fastest way to get strong that exists, and it works exactly once. Do not get clever with it and do not add anything until it stops working.',
    phases: {
      1: {
        name: 'Phase 1',
        note: 'Deadlift every session. Run this for roughly the first two to three weeks, until the deadlift starts outrunning your recovery.',
        rotation: [
          { label: 'A', items: [
            { ex: 'squat', sets: 3, reps: 5 },
            { ex: 'press', sets: 3, reps: 5 },
            { ex: 'deadlift', sets: 1, reps: 5 },
          ] },
          { label: 'B', items: [
            { ex: 'squat', sets: 3, reps: 5 },
            { ex: 'bench', sets: 3, reps: 5 },
            { ex: 'deadlift', sets: 1, reps: 5 },
          ] },
        ],
        advanceWhen:
          'Deadlift is climbing faster than everything else and starting to interfere with squat recovery — typically 2–3 weeks in.',
      },
      2: {
        name: 'Phase 2',
        note: 'Power cleans replace the deadlift on alternate sessions, and chins go in. Deadlift now runs about once a week.',
        rotation: [
          { label: 'A', items: [
            { ex: 'squat', sets: 3, reps: 5 },
            { ex: 'press', sets: 3, reps: 5 },
            { ex: 'deadlift', sets: 1, reps: 5 },
            { ex: 'chinup', sets: 3, reps: 0, toFailure: true },
          ] },
          { label: 'B', items: [
            { ex: 'squat', sets: 3, reps: 5 },
            { ex: 'bench', sets: 3, reps: 5 },
            { ex: 'powerclean', sets: 5, reps: 3 },
            { ex: 'chinup', sets: 3, reps: 0, toFailure: true },
          ] },
        ],
        advanceWhen:
          'You have reset the squat at least once and a third heavy squat session per week has become the thing you dread. Usually 2–4 months in.',
      },
      3: {
        name: 'Phase 3 — Advanced Novice',
        note:
          'A light squat day on Wednesday buys back the recovery you no longer have. Press and bench now alternate every session rather than every week.',
        rotation: [
          { label: '1 — Heavy', items: [
            { ex: 'squat', sets: 3, reps: 5 },
            { ex: 'press', sets: 3, reps: 5 },
            { ex: 'chinup', sets: 3, reps: 0, toFailure: true },
          ] },
          { label: '2 — Light', items: [
            { ex: 'squat', sets: 2, reps: 5, pctOfWorking: 0.8, light: true },
            { ex: 'bench', sets: 3, reps: 5 },
            { ex: 'deadlift', sets: 1, reps: 5 },
          ] },
          { label: '3 — Heavy', items: [
            { ex: 'squat', sets: 3, reps: 5 },
            { ex: 'press', sets: 3, reps: 5 },
            { ex: 'powerclean', sets: 5, reps: 3 },
          ] },
          { label: '4 — Heavy', items: [
            { ex: 'squat', sets: 3, reps: 5 },
            { ex: 'bench', sets: 3, reps: 5 },
            { ex: 'chinup', sets: 3, reps: 0, toFailure: true },
          ] },
          { label: '5 — Light', items: [
            { ex: 'squat', sets: 2, reps: 5, pctOfWorking: 0.8, light: true },
            { ex: 'press', sets: 3, reps: 5 },
            { ex: 'deadlift', sets: 1, reps: 5 },
          ] },
          { label: '6 — Heavy', items: [
            { ex: 'squat', sets: 3, reps: 5 },
            { ex: 'bench', sets: 3, reps: 5 },
            { ex: 'powerclean', sets: 5, reps: 3 },
          ] },
        ],
        advanceWhen:
          'You can no longer add weight from session to session even with the light day in place. That is the end of the novice phase — move to the Texas Method.',
      },
    },
  },

  'tv-4day': {
    id: 'tv-4day',
    name: 'Four-Day Barbell + Bag',
    source: 'Your default',
    frequency: '4 days, then repeat',
    blurb:
      'Two barbell days built on the Starting Strength lifts, a bodyweight pressing and pulling day, and a bag day. The rotation repeats: day 4 is followed by day 1 again, so it drifts through the week rather than locking to fixed weekdays.',
    phases: {
      1: {
        name: 'Standard',
        note:
          'Squat twice per rotation, pull heavy once and light once. Chins and dips run weighted for sets of five and progress on added load exactly like a barbell lift — a belt, a dip chain, or a dumbbell between the feet. If you cannot yet make five weighted reps, set the added weight to zero and change the target to 0 reps to run them to failure instead, and the app will start adding load once you clear fifteen.',
        rotation: [
          { label: 'Day 1 — Squat / Press / Pull', items: [
            { ex: 'squat', sets: 3, reps: 5 },
            { ex: 'press', sets: 3, reps: 5 },
            { ex: 'deadlift', sets: 1, reps: 5 },
          ] },
          { label: 'Day 2 — Weighted Chins / Dips', items: [
            { ex: 'chinup', sets: 3, reps: 5 },
            { ex: 'dip', sets: 3, reps: 5 },
            { ex: 'liu-raise', sets: 3, reps: 15 },
          ] },
          { label: 'Day 3 — Bag', items: [
            { conditioningId: 'box-bag-int', rounds: 12, minutes: 3, restSec: 60 },
          ] },
          { label: 'Day 4 — Squat / Bench / RDL', items: [
            { ex: 'squat', sets: 3, reps: 5 },
            { ex: 'bench', sets: 3, reps: 5 },
            { ex: 'rdl', sets: 3, reps: 8 },
          ] },
        ],
        advanceWhen:
          'You stop adding weight session to session on the squat. At that point the four-day rotation is still fine — it is the jump size that needs to shrink first, then the progression model.',
      },
    },
  },

  'texas-method': {
    id: 'texas-method',
    name: 'Texas Method',
    source: 'Practical Programming for Strength Training',
    frequency: '3 × / week — volume, recovery, intensity',
    blurb:
      'The weekly progression that follows the novice phase. Monday buys the adaptation with volume, Wednesday stays out of the way, Friday collects it as a new five-rep max. One increase per week, per lift.',
    phases: {
      1: {
        name: 'Standard',
        note:
          'Volume day is 90 % of your last successful intensity single-set-of-five. Press and bench swap places every week.',
        rotation: [
          { label: 'Volume', items: [
            { ex: 'squat', sets: 5, reps: 5, pctOfWorking: 0.9 },
            { ex: 'bench', sets: 5, reps: 5, pctOfWorking: 0.9, alternates: 'press' },
            { ex: 'ca-back-ext', sets: 3, reps: 10, assistance: true },
          ] },
          { label: 'Recovery', items: [
            { ex: 'squat', sets: 2, reps: 5, pctOfWorking: 0.8, light: true },
            { ex: 'press', sets: 3, reps: 5, pctOfWorking: 0.9, alternates: 'bench' },
            { ex: 'chinup', sets: 3, reps: 0, toFailure: true },
          ] },
          { label: 'Intensity', items: [
            { ex: 'squat', sets: 1, reps: 5 },
            { ex: 'bench', sets: 1, reps: 5, alternates: 'press' },
            { ex: 'deadlift', sets: 1, reps: 5, alternatesWeekly: 'powerclean' },
          ] },
        ],
        advanceWhen:
          'Weekly increases stop landing. At that point you need a longer cycle than this app programs — go and read Practical Programming.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Your own programmes.
//
// A custom programme is the same data shape as the two above, merged into
// PROGRAMS at boot. The engine does not know or care which is which, so a
// programme you build gets the same progression, resets, warm-ups and plate
// maths as the built-ins.
// ---------------------------------------------------------------------------

let registeredPrograms = [];

export function registerCustomPrograms(list = []) {
  for (const old of registeredPrograms) delete PROGRAMS[old.id];
  registeredPrograms = list;
  for (const p of list) PROGRAMS[p.id] = p;
  return list.length;
}

/** A blank programme, shaped exactly like the built-in ones. */
export function newCustomProgram() {
  return {
    id: null,
    name: '',
    source: 'Your own',
    frequency: '',
    blurb: '',
    custom: true,
    phases: {
      1: {
        name: 'Standard',
        note: '',
        rotation: [],
        advanceWhen: '',
      },
    },
  };
}

/** A blank day, ready for exercises. */
export const newProgramDay = (label = '') => ({ label, items: [] });

/**
 * One exercise slot within a day.
 * `pctOfWorking` derives the weight from the working weight (a light day, or
 * a volume day at 90 %); `light` additionally excludes it from progression.
 */
export const newProgramItem = (ex, sets = 3, reps = 5) => ({ ex, sets, reps });

/** Validation — returns a list of problems, empty when the programme is sound. */
export function validateProgram(p) {
  const problems = [];
  if (!p.name?.trim()) problems.push('Give the programme a name.');
  const rotation = p.phases?.[1]?.rotation || [];
  if (!rotation.length) problems.push('Add at least one training day.');
  rotation.forEach((day, i) => {
    if (!day.label?.trim()) problems.push(`Day ${i + 1} needs a name.`);
    if (!day.items.length) problems.push(`"${day.label || `Day ${i + 1}`}" has no exercises.`);
    day.items.forEach((it) => {
      if (it.conditioningId) {
        if (!(it.rounds > 0)) problems.push(`"${day.label}": rounds must be at least 1.`);
        return;
      }
      if (!it.ex) problems.push(`"${day.label}" has an empty exercise slot.`);
      if (it.pctOfWorking && MAIN_LIFTS[it.ex]?.bodyweight) {
        problems.push(`"${day.label}": a percentage means nothing on ${exerciseName(it.ex)} — use added weight instead.`);
      }
      if (!(it.sets > 0)) problems.push(`"${day.label}": sets must be at least 1.`);
      if (it.reps < 0) problems.push(`"${day.label}": reps cannot be negative.`);
    });
  });
  return problems;
}

// ---------------------------------------------------------------------------
// Warm-ups
// ---------------------------------------------------------------------------

// Percentage of the work weight, and reps. The empty bar sets are added
// separately because the bar is a fixed weight, not a percentage.
const WARMUP_SCHEMES = {
  full: { emptyBarSets: 2, steps: [[0.4, 5], [0.6, 3], [0.8, 2]] },
  deadlift: { emptyBarSets: 0, steps: [[0.45, 5], [0.65, 3], [0.85, 2]] },
  clean: { emptyBarSets: 2, steps: [[0.5, 3], [0.7, 3], [0.85, 2]] },
  // The RDL is a lighter, higher-rep lift and the warm-up doubles as the
  // hamstring warm-up, so the reps stay higher than a deadlift ramp.
  rdl: { emptyBarSets: 1, steps: [[0.5, 8], [0.7, 5], [0.85, 5]] },
  none: { emptyBarSets: 0, steps: [] },
};

/**
 * Warm-up ladder for a work weight.
 * Sets that would land at or below the empty bar are dropped, and duplicates
 * after rounding to the available plates are collapsed — so a 45 kg squat
 * gives you a sane three-step ladder rather than four sets of "the bar".
 */
export function warmupSets(workWeight, scheme, settings) {
  const cfg = WARMUP_SCHEMES[scheme] || WARMUP_SCHEMES.full;
  const bar = settings.barWeight;
  const smallest = Math.min(...settings.plates) * 2;
  const out = [];

  if (workWeight <= bar) {
    return [{ weight: bar, reps: 5, label: 'Bar' }, { weight: bar, reps: 5, label: 'Bar' }];
  }
  for (let i = 0; i < cfg.emptyBarSets; i++) {
    out.push({ weight: bar, reps: 5, label: 'Bar' });
  }
  for (const [pct, reps] of cfg.steps) {
    const raw = workWeight * pct;
    const w = Math.max(bar, roundTo(raw, smallest));
    if (w <= bar && cfg.emptyBarSets) continue;      // already covered by the bar sets
    if (out.some((s) => Math.abs(s.weight - w) < 1e-6)) continue;
    if (w >= workWeight) continue;
    out.push({ weight: w, reps, label: `${Math.round(pct * 100)} %` });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Session generation
// ---------------------------------------------------------------------------

const incrementFor = (program, exId) => {
  const lift = MAIN_LIFTS[exId];
  if (!lift) return 2.5;
  const override = program.increments?.[exId];
  if (override != null) return override;
  // Once a lift has been reset, the early jumps no longer stick.
  return (program.fails?.[`${exId}.resets`] || 0) > 0 ? lift.lateIncrement : lift.increment;
};

export { incrementFor };

/**
 * Build the next workout from program state.
 * Returns { label, phaseName, items:[{exerciseId, sets, reps, weight, warmup, ...}] }
 */
export function nextWorkout(db) {
  const prog = db.program;
  const def = PROGRAMS[prog.id];
  if (!def) return null;
  const phase = def.phases[prog.phase] || def.phases[1];
  const rotation = phase.rotation;
  if (!rotation.length) return null;   // a programme with no days yet
  const slot = rotation[prog.cursor % rotation.length];

  // Texas Method swaps press and bench on a weekly cycle.
  const swapPress = def.id === 'texas-method' && prog.tmWeek % 2 === 1;
  // Friday's pull alternates deadlift / power clean week to week.
  const useClean = def.id === 'texas-method' && prog.tmWeek % 2 === 1;

  const items = slot.items.map((item) => {
    // A conditioning slot is time and rounds, not sets and reps. It is logged
    // as a conditioning session, and it never touches the progression.
    if (item.conditioningId) {
      return {
        exerciseId: item.conditioningId,
        conditioning: true,
        rounds: item.rounds ?? null,
        minutes: item.minutes ?? null,
        restSec: item.restSec ?? 60,
        sets: 0, reps: 0, weight: null, warmup: [],
      };
    }
    let exId = item.ex;
    if (swapPress && item.alternates) exId = item.alternates;
    if (useClean && item.alternatesWeekly) exId = item.alternatesWeekly;

    const lift = MAIN_LIFTS[exId];
    if (!lift) {
      // Programmed assistance. There is no progression to own the number, so
      // the log does: whatever you last used is what comes back. The weight in
      // the programme is only a seed for the first time you ever do it.
      //
      // Without this an accessory resets to nothing every session, which is
      // the one place in the app where your own history was being ignored.
      const prev = lastLogged(db, exId);
      return {
        exerciseId: exId, sets: item.sets, reps: item.reps,
        weight: (prev && prev.weight > 0 ? prev.weight : item.weight) ?? null,
        lastUsed: prev || null,
        assistance: true, warmup: [],
      };
    }

    const working = offeredWeight(db, exId, item.startWeight);
    let weight = working;
    if (item.pctOfWorking) {
      const smallest = Math.min(...db.settings.plates) * 2;
      weight = Math.max(db.settings.barWeight, roundTo(working * item.pctOfWorking, smallest));
    }

    return {
      exerciseId: exId,
      sets: item.sets,
      reps: item.reps,
      toFailure: !!item.toFailure,
      light: !!item.light,
      // Bodyweight lifts go through offeredWeight like everything else, or a
      // programme's starting added weight and the log fallback would never
      // reach them.
      weight: lift.bodyweight ? working : weight,
      bodyweight: !!lift.bodyweight,
      increment: incrementFor(prog, exId),
      warmup: lift.bodyweight || item.light ? [] : warmupSets(weight, lift.warmup, db.settings),
      plates: lift.bar ? platesFor(weight, db.settings.barWeight, db.settings.plates) : null,
    };
  });

  return {
    programId: def.id,
    programName: def.name,
    phase: prog.phase,
    phaseName: phase.name,
    phaseNote: phase.note,
    label: slot.label,
    cursor: prog.cursor,
    items,
  };
}

/** First-session suggestion, deliberately light. Form before load. */
export function seedWeight(exId, profile, settings) {
  const lift = MAIN_LIFTS[exId];
  if (!lift) return 0;
  if (lift.bodyweight) return 0;
  const bw = profile.bodyweightKg;
  const smallest = Math.min(...settings.plates) * 2;
  if (!bw || !lift.seedBwRatio) return settings.barWeight;
  return Math.max(settings.barWeight, roundTo(bw * lift.seedBwRatio, smallest));
}

// ---------------------------------------------------------------------------
// Carrying the last session forward
// ---------------------------------------------------------------------------

/**
 * The session to base the next one on.
 *
 * Same workout slot first, because that is where your accessory choices for
 * this day live. Failing that, the most recent lifting session at all — the
 * first time you run a new slot there is still a sensible answer, and the
 * accessories most people repeat (rows, ab work, carries) are the same
 * whichever day it is. Anything wrong can be removed with one tap.
 */
export function lastSessionLike(db, label) {
  const lifts = (db.sessions || [])
    .filter((s) => (s.type === 'lift' || s.type === 'free') && (s.entries || []).length)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  return lifts.find((s) => s.label === label) || lifts[0] || null;
}

/**
 * Everything you did last time that the programme did not prescribe.
 *
 * The programmed lifts always come from the progression engine — that is the
 * whole point, the weight is supposed to go up. What gets carried forward is
 * the work you chose to add: assistance, extra lifts, anything the template
 * does not know about, at the weights and reps you actually used.
 */
export function carryForward(db, wk) {
  const prev = lastSessionLike(db, wk.label);
  if (!prev) return { entries: [], from: null, names: [] };

  const programmed = new Set(wk.items.map((i) => i.exerciseId));
  const extras = (prev.entries || [])
    .filter((e) => !programmed.has(e.exerciseId) && !e.conditioning);

  const entries = extras.map((e) => {
    const lift = MAIN_LIFTS[e.exerciseId];
    const last = e.sets.at(-1) || { weight: 0, reps: e.prescribedReps || 10 };
    const count = Math.max(1, e.sets.length);

    // Who owns the weight decides what gets carried.
    //
    // A main lift has a working weight and a progression: the engine owns it,
    // so it comes back at the new heavier number and it keeps progressing.
    // Carrying last session's weight for a main lift would freeze it forever.
    //
    // Accessory work has neither, so it comes back exactly as you last did it
    // and never touches the programme.
    const isMain = !!lift;
    const working = isMain ? db.program.working[e.exerciseId] : null;
    const weight = isMain && working != null ? working : last.weight;
    const reps = last.reps || e.prescribedReps || 10;
    // A carried barbell lift needs its warm-up ladder built too, otherwise the
    // one thing you cannot do is warm up for the lift you actually repeat.
    // Prefer the warm-ups you logged last time; fall back to the calculated
    // ladder for the weight you are about to use.
    // Warm-ups: reuse the ones you logged last time if the weight has not
    // moved, otherwise rebuild the ladder for the new work weight.
    const priorWarm = (e.warmupSets || []).filter((w) => w.weight > 0);
    const weightMoved = Math.abs(weight - last.weight) > 1e-6;
    const ladder = priorWarm.length && !weightMoved
      ? priorWarm.map((w) => ({ weight: w.weight, reps: w.reps, label: w.label || '' }))
      : (lift && lift.bar ? warmupSets(weight, lift.warmup, db.settings) : []);

    return {
      id: uid(),
      exerciseId: e.exerciseId,
      prescribedSets: count,
      prescribedReps: reps,
      toFailure: e.toFailure,
      bodyweight: e.bodyweight,
      assistance: e.assistance,
      // Accessory work never drives the programme. A main lift does — it has
      // its own working weight, and the duplicate guard in applySession stops
      // anything already in today's session from progressing twice.
      derived: !isMain,
      carriedFrom: prev.date,
      warmup: ladder,
      warmupSets: ladder.map((w) => ({
        weight: w.weight, reps: w.reps, label: w.label, done: false, ts: null,
      })),
      sets: Array.from({ length: count }, () => ({
        weight, reps, done: false, ts: null,
      })),
    };
  });

  return {
    entries,
    from: prev.date,
    // Flagged when the source was a different workout slot, so the UI can say
    // so rather than implying you did this exact session before.
    fromLabel: prev.label,
    sameSlot: prev.label === wk.label,
    names: extras.map((e) => exerciseName(e.exerciseId)),
  };
}

/**
 * What you actually last lifted for a movement.
 *
 * The log is the source of truth for where you are. A working weight can drift
 * from reality — you deload by hand, you take three weeks off, you log in a
 * free session the programme never saw — and when it does, the log is right
 * and the stored number is wrong.
 *
 * Returns the top completed work set, most recent session first. Warm-ups and
 * light days are excluded: neither tells you what you can lift.
 */
export function lastLogged(db, exerciseId) {
  const sessions = [...(db.sessions || [])].sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const s of sessions) {
    for (const e of s.entries || []) {
      if (e.exerciseId !== exerciseId || e.light) continue;
      const done = (e.sets || []).filter((x) => x.done !== false);
      if (!done.length) continue;
      const top = Math.max(...done.map((x) => x.weight || 0));
      const topSet = done.find((x) => (x.weight || 0) === top) || done[0];
      return { weight: top, reps: topSet.reps, date: s.date, sets: done.length, label: s.label };
    }
  }
  return null;
}

/**
 * The weight to offer next for a lift, in order of trustworthiness:
 * the programme's working weight, then what you last actually lifted, then a
 * bodyweight-scaled guess for a lift with no history at all.
 */
export function offeredWeight(db, exId, startWeight = null) {
  const working = db.program.working[exId];
  if (working != null) return working;
  const last = lastLogged(db, exId);
  if (last && last.weight > 0) return last.weight;
  // A programme can seed a lift it has never seen — but only as a starting
  // point. Once you have logged anything, the log and the progression own it.
  if (startWeight != null) return startWeight;
  return seedWeight(exId, db.profile, db.settings);
}

/**
 * Why is this the weight on offer?
 *
 * Every rule that can decide a prescribed weight, reported with the one that
 * actually fired. "It is not carrying over" is otherwise unanswerable without
 * reading someone's storage by hand.
 */
export function explainOffer(db, exId) {
  const lift = MAIN_LIFTS[exId];
  const working = db.program.working[exId];
  const last = lastLogged(db, exId);
  const sessions = (db.sessions || []).filter((s) =>
    (s.entries || []).some((e) => e.exerciseId === exId)).length;

  let source, detail;
  if (!lift) {
    source = last ? 'your log' : 'the programme';
    detail = last
      ? `Accessory work has no progression, so it comes back at the ${last.weight} kg you used on ${last.date}.`
      : 'Accessory work has no progression and nothing logged yet, so the programme decides.';
  } else if (working != null) {
    source = 'the progression';
    detail = last
      ? `A working weight of ${working} kg is stored, and a stored working weight always wins over history. Your last logged set was ${last.weight} kg × ${last.reps} on ${last.date}.`
      : `A working weight of ${working} kg is stored, but nothing has ever been logged for this lift — so this number came from setup, not from training.`;
  } else if (last && last.weight > 0) {
    source = 'your log';
    detail = `No working weight is stored, so it falls back to the ${last.weight} kg × ${last.reps} you logged on ${last.date}.`;
  } else {
    source = 'a bodyweight estimate';
    detail = 'Nothing logged and no working weight, so this is only a starting suggestion.';
  }

  return {
    exerciseId: exId,
    name: exerciseName(exId),
    offered: lift ? offeredWeight(db, exId) : (last?.weight ?? null),
    working: working ?? null,
    last,
    sessions,
    source,
    detail,
  };
}

/**
 * Working weights that have fallen behind the log.
 *
 * The working weight is a cache: applySession derives it from what you
 * actually lifted. So it should never be BELOW your last logged set — that can
 * only mean it went stale, and a stale cache silently outranking its own
 * source is how a real session gets ignored.
 *
 * Only the unambiguous direction is reported. A working weight above the last
 * logged set is normal — that is the increment doing its job.
 */
export function staleWeights(db) {
  const out = [];
  for (const id of programLifts(db)) {
    const working = db.program.working[id];
    const last = lastLogged(db, id);
    if (working == null || !last || !(last.weight > 0)) continue;
    if (working < last.weight - 1e-6) {
      out.push({ exerciseId: id, name: exerciseName(id), working, last });
    }
  }
  return out;
}

/** Drop a stale working weight so the log takes over again. */
export function adoptLogged(db, exId) {
  delete db.program.working[exId];
  if (db.program.fails) delete db.program.fails[exId];
  return offeredWeight(db, exId);
}

/**
 * Add an increment without the plate grid eating it.
 *
 * Snapping every result to the smallest loadable pair is right when the
 * increment is a multiple of it — it keeps 2.5 kg jumps landing on round
 * numbers. It is wrong the moment you micro-load: with 1.25 kg plates the grid
 * is 2.5 kg, so a 0.75 kg increment would round straight back to where it
 * started and the lift would never move.
 *
 * So: snap only when the increment fits the grid. Otherwise take the user at
 * their word — they know what they can hang on the bar, and the plate line
 * says plainly when a number cannot be loaded.
 */
export function applyIncrement(current, inc, smallest) {
  const fitsGrid = smallest > 0 && Math.abs(inc / smallest - Math.round(inc / smallest)) < 1e-9;
  const next = current + inc;
  // Trim binary floating-point dust either way: 100 + 0.75 must be 100.75.
  return fitsGrid ? roundTo(next, smallest) : Math.round(next * 1000) / 1000;
}

/** Can this weight actually be loaded, given the bar and plates? */
export function isLoadable(weight, settings) {
  if (weight <= settings.barWeight) return weight === settings.barWeight;
  const res = platesFor(weight, settings.barWeight, settings.plates);
  return Math.abs(res.short) < 1e-6;
}

// ---------------------------------------------------------------------------
// Progression
// ---------------------------------------------------------------------------

/**
 * Decide what a completed session does to the program.
 * Returns a list of human-readable changes so the UI can show exactly what
 * happened and why, rather than silently moving numbers.
 */
export function applySession(db, session) {
  const prog = db.program;
  const def = PROGRAMS[prog.id];
  const changes = [];
  const smallest = Math.min(...db.settings.plates) * 2;
  const seen = new Set();

  for (const entry of session.entries) {
    const lift = MAIN_LIFTS[entry.exerciseId];
    if (!lift) continue;

    // Light and percentage-derived work never drives progression: it is a
    // consequence of the heavy day, not an input to it.
    if (entry.light || entry.derived) continue;

    // One progression decision per lift per session. Without this, adding a
    // second squat entry to a session would apply the increment twice.
    if (seen.has(entry.exerciseId)) continue;
    seen.add(entry.exerciseId);

    const done = entry.sets.filter((s) => s.done);
    if (done.length === 0) continue;

    const prescribedReps = entry.prescribedReps;
    const success = entry.toFailure
      ? true // chins are taken to failure — there is nothing to miss
      : done.length >= entry.prescribedSets && done.every((s) => s.reps >= prescribedReps);

    // Build on the weight actually moved, not the weight that was prescribed.
    // If the bar said 100 and you did 97.5 for all your reps, the next session
    // is 100 — not 102.5. The set you logged is the fact; the prescription was
    // only a plan. Added-weight lifts are the exception: their `weight` is the
    // load hanging off a belt, which is legitimately zero.
    const topDone = Math.max(0, ...done.map((x) => x.weight || 0));
    // For a bodyweight lift the weight column is the load hanging off a belt,
    // and zero is a legitimate value there — so when it is being run as a
    // weighted lift, read it straight from the log like any other. Only the
    // to-failure mode falls back to the stored number, because a set taken to
    // failure carries no target to compare against.
    const current = lift.bodyweight
      ? (entry.toFailure ? (prog.working[entry.exerciseId] ?? 0) : topDone)
      : (topDone > 0 ? topDone : (prog.working[entry.exerciseId] ?? entry.sets[0].weight));
    const inc = incrementFor(prog, entry.exerciseId);

    if (success) {
      prog.fails[entry.exerciseId] = 0;
      if (lift.bodyweight && entry.toFailure) {
        // Sets to failure: there is no rep target to hit, so the trigger for
        // adding load is clearing the threshold. This is the mode for someone
        // still building towards their first weighted rep.
        const best = Math.max(...done.map((s) => s.reps));
        if (best >= BW_ADD_WEIGHT_AT) {
          prog.working[entry.exerciseId] = applyIncrement(current, inc, 0);
          changes.push({ ex: entry.exerciseId, type: 'up', from: current, to: prog.working[entry.exerciseId],
            why: `${best} reps clears ${BW_ADD_WEIGHT_AT} — start adding weight.` });
        } else {
          changes.push({ ex: entry.exerciseId, type: 'hold',
            why: `${best} reps. Weight goes on at ${BW_ADD_WEIGHT_AT}.` });
        }
      } else if (lift.bodyweight) {
        // Run with a rep target, a chin-up or a dip is just a pressing or
        // pulling lift whose bar happens to be your own body. The added load
        // progresses on exactly the same rules as a barbell lift.
        // Added weight hangs off a belt: no symmetry to satisfy, so any
        // increment you own is loadable and none of it is snapped away.
        prog.working[entry.exerciseId] = applyIncrement(current, inc, 0);
        changes.push({ ex: entry.exerciseId, type: 'up', from: current, to: prog.working[entry.exerciseId],
          why: `All reps at ${current > 0 ? `+${current} kg` : 'bodyweight'}. +${inc} kg added.` });
      } else if (def.id === 'texas-method') {
        // Weekly, and only off the intensity day.
        if (session.label === 'Intensity') {
          prog.working[entry.exerciseId] = applyIncrement(current, inc, smallest);
          changes.push({ ex: entry.exerciseId, type: 'up', from: current, to: prog.working[entry.exerciseId],
            why: `New 5RM. Next week +${inc} kg.` });
        } else {
          changes.push({ ex: entry.exerciseId, type: 'hold', why: 'Volume/recovery day — no change.' });
        }
      } else {
        prog.working[entry.exerciseId] = applyIncrement(current, inc, smallest);
        changes.push({ ex: entry.exerciseId, type: 'up', from: current, to: prog.working[entry.exerciseId],
          why: `All reps made. +${inc} kg.` });
      }
    } else {
      const fails = (prog.fails[entry.exerciseId] || 0) + 1;
      prog.fails[entry.exerciseId] = fails;
      const missed = entry.prescribedSets * prescribedReps - done.reduce((a, s) => a + s.reps, 0);

      if (fails >= 3) {
        // Three misses at the same weight is the standard reset trigger. On a
        // bodyweight lift that means shedding added load, and it bottoms out
        // at bodyweight rather than going negative.
        const reset = lift.bodyweight
          ? Math.max(0, roundTo(current * lift.resetPct, 1.25))
          : roundTo(current * lift.resetPct, smallest);
        prog.working[entry.exerciseId] = reset;
        prog.fails[entry.exerciseId] = 0;
        prog.fails[`${entry.exerciseId}.resets`] = (prog.fails[`${entry.exerciseId}.resets`] || 0) + 1;
        changes.push({ ex: entry.exerciseId, type: 'reset', from: current, to: reset,
          why: `Third miss at ${current} kg. Reset 10 % and work back up — the smaller jumps start now.` });
      } else {
        changes.push({ ex: entry.exerciseId, type: 'repeat', from: current, to: current,
          why: `Missed ${missed} rep${missed === 1 ? '' : 's'}. Attempt ${fails} of 3 — repeat this weight.` });
      }
    }
  }

  // A free or off-programme session updates your weights but must not consume
  // a slot in the rotation — otherwise logging an extra squat day silently
  // skips the day you were meant to do next.
  if (session.programId && session.programId === prog.id) {
    prog.cursor = (prog.cursor || 0) + 1;
  }
  const rotLen = (def.phases[prog.phase] || def.phases[1]).rotation.length;
  if (def.id === 'texas-method' && prog.cursor % rotLen === 0) {
    prog.tmWeek = (prog.tmWeek || 0) + 1;
  }
  return changes;
}

/**
 * Should the lifter move on? Returns advice, never acts on its own — phase
 * changes are a judgment call and the app has no business making it silently.
 */
export function phaseAdvice(db) {
  const prog = db.program;
  const def = PROGRAMS[prog.id];
  if (!def || def.custom) return null;   // your own programme, your own call
  const phase = def.phases[prog.phase];
  if (!phase) return null;

  const sessions = db.sessions.filter((s) => s.type === 'lift' && s.programId === prog.id);
  // Sessions per week comes from the rotation, not a hardcoded three — a
  // four-day rotation would otherwise report a third more weeks than elapsed.
  const perWeek = Math.max(1, (def.phases[prog.phase] || def.phases[1]).rotation.length);
  const weeks = sessions.length / perWeek;
  const resets = Object.entries(prog.fails)
    .filter(([k]) => k.endsWith('.resets'))
    .reduce((a, [, v]) => a + v, 0);

  let ready = false;
  let reason = '';

  if (def.id === 'ss-novice') {
    if (prog.phase === 1 && weeks >= 2.5) {
      ready = true;
      reason = `${Math.floor(weeks)} weeks in. The deadlift is almost certainly ahead of everything else by now.`;
    } else if (prog.phase === 2 && resets >= 1 && weeks >= 8) {
      ready = true;
      reason = `${resets} reset${resets === 1 ? '' : 's'} and ${Math.floor(weeks)} weeks in. Time for the light squat day.`;
    } else if (prog.phase === 3 && resets >= 3) {
      ready = true;
      reason = `${resets} resets. Session-to-session progress is done. Move to the Texas Method.`;
    }
  }
  return { ready, reason, criteria: phase.advanceWhen, weeks: Math.floor(weeks), resets };
}

/** Everything the current program touches, for the settings screen. */
export function programLifts(db) {
  const def = PROGRAMS[db.program.id] || PROGRAMS['ss-novice'];
  const phase = def.phases[db.program.phase] || def.phases[1];
  const ids = new Set();
  for (const slot of phase.rotation) {
    for (const item of slot.items) {
      if (item.conditioningId) continue;
      if (MAIN_LIFTS[item.ex]) ids.add(item.ex);
      if (item.alternates) ids.add(item.alternates);
      if (item.alternatesWeekly) ids.add(item.alternatesWeekly);
    }
  }
  return [...ids];
}
