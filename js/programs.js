// Starting Strength programming.
//
// The novice linear progression and the Texas Method as described in
// Starting Strength: Basic Barbell Training and Practical Programming.
// Everything here is deterministic: given the program state and the result of
// the last session, the next session is fully computed. No coaching judgment
// is faked — phase advancement is a decision the lifter makes, and the app
// only tells you when the criteria are met.

import { MAIN_LIFTS } from './data/exercises.js';
import { roundTo, platesFor } from './util.js';

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
// Warm-ups
// ---------------------------------------------------------------------------

// Percentage of the work weight, and reps. The empty bar sets are added
// separately because the bar is a fixed weight, not a percentage.
const WARMUP_SCHEMES = {
  full: { emptyBarSets: 2, steps: [[0.4, 5], [0.6, 3], [0.8, 2]] },
  deadlift: { emptyBarSets: 0, steps: [[0.45, 5], [0.65, 3], [0.85, 2]] },
  clean: { emptyBarSets: 2, steps: [[0.5, 3], [0.7, 3], [0.85, 2]] },
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
  const slot = rotation[prog.cursor % rotation.length];

  // Texas Method swaps press and bench on a weekly cycle.
  const swapPress = def.id === 'texas-method' && prog.tmWeek % 2 === 1;
  // Friday's pull alternates deadlift / power clean week to week.
  const useClean = def.id === 'texas-method' && prog.tmWeek % 2 === 1;

  const items = slot.items.map((item) => {
    let exId = item.ex;
    if (swapPress && item.alternates) exId = item.alternates;
    if (useClean && item.alternatesWeekly) exId = item.alternatesWeekly;

    const lift = MAIN_LIFTS[exId];
    if (!lift) {
      // Programmed assistance (back extensions on Texas volume day).
      return {
        exerciseId: exId, sets: item.sets, reps: item.reps,
        weight: null, assistance: true, warmup: [],
      };
    }

    const working = prog.working[exId] ?? seedWeight(exId, db.profile, db.settings);
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
      weight: lift.bodyweight ? (prog.working[exId] || 0) : weight,
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

  for (const entry of session.entries) {
    const lift = MAIN_LIFTS[entry.exerciseId];
    if (!lift) continue;

    // Light and percentage-derived work never drives progression: it is a
    // consequence of the heavy day, not an input to it.
    if (entry.light || entry.derived) continue;

    const done = entry.sets.filter((s) => s.done);
    if (done.length === 0) continue;

    const prescribedReps = entry.prescribedReps;
    const success = entry.toFailure
      ? true // chins are taken to failure — there is nothing to miss
      : done.length >= entry.prescribedSets && done.every((s) => s.reps >= prescribedReps);

    const current = prog.working[entry.exerciseId] ?? entry.sets[0].weight;
    const inc = incrementFor(prog, entry.exerciseId);

    if (success) {
      prog.fails[entry.exerciseId] = 0;
      if (lift.bodyweight) {
        // Chins: progress by added load only once the rep target is cleared.
        const best = Math.max(...done.map((s) => s.reps));
        if (best >= 15) {
          prog.working[entry.exerciseId] = roundTo(current + inc, 1.25);
          changes.push({ ex: entry.exerciseId, type: 'up', from: current, to: prog.working[entry.exerciseId],
            why: `${best} reps clears 15 — start adding weight.` });
        } else {
          changes.push({ ex: entry.exerciseId, type: 'hold', why: `${best} reps. Add weight at 15.` });
        }
      } else if (def.id === 'texas-method') {
        // Weekly, and only off the intensity day.
        if (session.label === 'Intensity') {
          prog.working[entry.exerciseId] = roundTo(current + inc, smallest);
          changes.push({ ex: entry.exerciseId, type: 'up', from: current, to: prog.working[entry.exerciseId],
            why: `New 5RM. Next week +${inc} kg.` });
        } else {
          changes.push({ ex: entry.exerciseId, type: 'hold', why: 'Volume/recovery day — no change.' });
        }
      } else {
        prog.working[entry.exerciseId] = roundTo(current + inc, smallest);
        changes.push({ ex: entry.exerciseId, type: 'up', from: current, to: prog.working[entry.exerciseId],
          why: `All reps made. +${inc} kg.` });
      }
    } else {
      const fails = (prog.fails[entry.exerciseId] || 0) + 1;
      prog.fails[entry.exerciseId] = fails;
      const missed = entry.prescribedSets * prescribedReps - done.reduce((a, s) => a + s.reps, 0);

      if (fails >= 3) {
        // Three misses at the same weight is the standard reset trigger.
        const reset = roundTo(current * lift.resetPct, smallest);
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

  prog.cursor = (prog.cursor || 0) + 1;
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
  const phase = def.phases[prog.phase];
  if (!phase) return null;

  const sessions = db.sessions.filter((s) => s.type === 'lift' && s.programId === prog.id);
  const weeks = sessions.length / 3;
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
  const def = PROGRAMS[db.program.id];
  const phase = def.phases[db.program.phase] || def.phases[1];
  const ids = new Set();
  for (const slot of phase.rotation) {
    for (const item of slot.items) {
      if (MAIN_LIFTS[item.ex]) ids.add(item.ex);
      if (item.alternates) ids.add(item.alternates);
      if (item.alternatesWeekly) ids.add(item.alternatesWeekly);
    }
  }
  return [...ids];
}
