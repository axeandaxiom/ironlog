// The training view: today's prescription, and the session runner.
//
// The runner is built around one rule — logging a set must never move you off
// the screen. No dialogs, no navigation, no page reload. One tap on the tick,
// the set is written to storage, the rest clock starts, and the DOM is patched
// in place rather than re-rendered so you never lose your scroll position or
// the keyboard you had open.

import { el, $, uid, todayISO, num, fmtClock, buzz, toast, platesFor, e1rm, toDisplayWeight, fromDisplayWeight, numInput, parseNum } from '../util.js';
import * as store from '../store.js';
import { MAIN_LIFTS, ASSISTANCE, CONDITIONING, INTERFERENCE_NOTE, findExercise, exerciseName, EQUIPMENT, SPORTS } from '../data/exercises.js';
import { PROGRAMS, nextWorkout, applySession, phaseAdvice, seedWeight, warmupSets, carryForward,
         lastLogged, offeredWeight, programLifts } from '../programs.js';
import { startRest, stopRest, sheet, confirmSheet } from '../app.js';
import { openProgramManager, openExerciseManager, openProgramBuilder } from './build.js';
import { openRoundTimer, openRoundSettings } from './rounds.js';
import { openAttachments, hasAttachments } from './attach.js';

export function renderTrain(view, ctx) {
  const db = store.get();
  if (db.activeSession) renderRunner(view, ctx, db);
  else renderPlan(view, ctx, db);
}

// ---------------------------------------------------------------------------
// Plan — what today looks like before you start
// ---------------------------------------------------------------------------

function renderPlan(view, ctx, db) {
  const wk = nextWorkout(db);
  const prog = PROGRAMS[db.program.id] || PROGRAMS['ss-novice'];
  const unit = db.settings.units;

  view.append(el('h1', {}, 'Next session'));

  // A programme you built but have not put any days into yet.
  if (!wk) {
    view.append(
      el('div', { class: 'note warn' },
        el('b', {}, `${prog.name} has no training days yet. `),
        'Add at least one day with some exercises on it, and it will show up here.'),
      el('button', { class: 'btn-primary btn-block', onclick: () => openProgramBuilder(ctx, prog) }, 'Add training days'),
      el('button', { class: 'btn-block', style: { marginTop: '8px' }, onclick: () => openProgramManager(ctx) }, 'Switch programme'),
      el('div', { class: 'btn-row', style: { marginTop: '14px' } },
        el('button', { onclick: () => startFreeSession(ctx, db) }, 'Free session'),
        el('button', { onclick: () => openConditioning(ctx, db) }, 'Conditioning'))
    );
    renderRecent(view, db);
    return;
  }

  if (!hasWeights(db)) {
    view.append(
      el('div', { class: 'note accent' },
        el('b', {}, 'Set your starting weights first. '),
        'The app will suggest light numbers from your bodyweight, but the real rule is: start at a weight where every rep is technically perfect, and let the linear progression do the work. Starting too heavy costs you weeks.'),
      el('button', { class: 'btn-primary btn-block', onclick: () => openWeightSetup(ctx, db) }, 'Set starting weights')
    );
  }

  view.append(
    el('div', { class: 'workout-head' },
      el('div', { class: 'row between' },
        el('div', {},
          el('p', { class: 'workout-title' }, `${prog.name} — ${wk.label}`),
          el('div', { class: 'muted', style: { fontSize: '13px', marginTop: '2px' } }, `${wk.phaseName} · session ${db.program.cursor + 1}`)
        ),
        el('span', { class: 'pill accent' }, prog.frequency.split(',')[0])
      ),
      el('div', { class: 'note', style: { marginBottom: '0' } }, wk.phaseNote)
    )
  );

  for (const item of wk.items) {
    const ex = findExercise(item.exerciseId);
    const target = item.conditioning
      ? `${item.rounds} × ${item.minutes} min`
      : item.bodyweight
        ? `${item.weight ? `BW + ${num(toDisplayWeight(item.weight, unit))} ${unit}` : 'BW'}`
          + ` × ${item.sets} × ${item.toFailure || !item.reps ? 'max' : item.reps}`
        // Assistance carries no working weight, so showing "– kg" would just
        // look broken. Sets and reps are the whole prescription.
        : item.weight == null
          ? `${item.sets} × ${item.reps}`
          : `${num(toDisplayWeight(item.weight, unit))} ${unit} × ${item.sets} × ${item.reps}`;
    // Ground every prescription in what you actually did, so the number on
    // screen is never a mystery.
    const last = item.conditioning ? null : lastLogged(db, item.exerciseId);
    const lastLine = last && last.weight > 0
      ? `Last: ${num(toDisplayWeight(last.weight, unit))} ${unit} × ${last.reps} on ${last.date}`
      : last ? `Last: ${last.sets} × ${last.reps} on ${last.date}` : null;

    view.append(
      el('div', { class: 'card tight' },
        el('div', { class: 'row between' },
          el('div', { class: 'grow' },
            el('div', { class: 'li-title' }, ex?.name || item.exerciseId),
            lastLine && el('div', { class: 'li-sub' }, lastLine),
            item.light && el('span', { class: 'pill info', style: { marginTop: '4px' } }, 'Light day — 80 %')
          ),
          el('div', { class: 'li-right', style: { fontSize: '15px', color: 'var(--text)' } }, target)
        )
      )
    );
  }

  view.append(
    el('button', { class: 'btn-primary btn-block', style: { marginTop: '14px', minHeight: '56px', fontSize: '17px' },
      onclick: () => startSession(ctx, db, wk) }, 'Start session')
  );

  // Phase guidance — advice only, never automatic.
  const advice = phaseAdvice(db);
  if (advice) {
    view.append(
      el('h2', {}, 'Where you are in the programme'),
      el('div', { class: 'card' },
        el('div', { class: 'stat-grid' },
          stat(advice.weeks, 'Weeks'),
          stat(db.sessions.filter((s) => s.type === 'lift').length, 'Sessions'),
          stat(advice.resets, 'Resets', advice.resets > 2 ? 'warn' : null)
        ),
        el('div', { class: advice.ready ? 'note accent' : 'note' },
          advice.ready
            ? el('span', {}, el('b', {}, 'Ready to advance. '), advice.reason)
            : el('span', {}, el('b', {}, 'Advance when: '), advice.criteria)
        ),
        advice.ready && el('button', { class: 'btn-block', onclick: () => advancePhase(ctx, db) }, 'Advance a phase')
      )
    );
  }

  view.append(
    el('h2', {}, 'Off-programme'),
    el('div', { class: 'btn-row' },
      el('button', { onclick: () => startFreeSession(ctx, db) }, 'Free session'),
      el('button', { onclick: () => openConditioning(ctx, db) }, 'Conditioning')
    ),
    el('h2', {}, 'Make it yours'),
    el('div', { class: 'btn-row' },
      el('button', { onclick: () => openProgramManager(ctx) }, 'Programmes'),
      el('button', { onclick: () => openExerciseManager(ctx) }, 'Exercises')
    ),
    el('div', { class: 'note' },
      'Not running Starting Strength? Build your own programme — your days, your exercises, your sets and reps — and the app will progress it with the same rules. Add movements it does not know about under Exercises.')
  );

  renderRecent(view, db);
}

function hasWeights(db) {
  return Object.keys(db.program.working || {}).length > 0;
}

function stat(val, lbl, kind = null, sub = null) {
  return el('div', { class: `stat ${kind || ''}` },
    el('div', { class: 'stat-val' }, String(val)),
    el('div', { class: 'stat-lbl' }, lbl),
    sub && el('div', { class: 'stat-sub' }, sub)
  );
}

function openWeightSetup(ctx, db) {
  sheet('Starting weights', (body, close) => {
    const unit = db.settings.units;
    // Whatever the running programme actually uses — not a fixed list of five
    // barbell lifts, or chins and dips could never be given a starting load.
    const lifts = programLifts(db);
    const inputs = {};

    body.append(el('p', { class: 'sub' },
      'These are work-set weights, not maxima. If in doubt go lighter — you will pass any number you start below within three weeks, and you cannot buy back bad technique later.'));

    if (db.profile.bodyweightKg) {
      body.append(el('div', { class: 'note' },
        `Suggestions below are scaled from your bodyweight of ${num(db.profile.bodyweightKg)} kg. They are a starting point, not a prescription.`));
    }

    for (const id of lifts) {
      const lift = MAIN_LIFTS[id];
      const seed = offeredWeight(db, id);
      const last = lastLogged(db, id);
      const inp = numInput({ value: num(toDisplayWeight(seed, unit)) });
      inputs[id] = inp;
      body.append(el('div', { class: 'field' },
        el('label', {}, lift.bodyweight
          ? `${lift.name} — weight ADDED to bodyweight (${unit}), 0 for none`
          : `${lift.name} (${unit})`
          + (last && last.weight > 0
            ? ` — last logged ${num(toDisplayWeight(last.weight, unit))} × ${last.reps} on ${last.date}`
            : '')),
        inp));
    }

    body.append(el('button', { class: 'btn-primary btn-block', onclick: () => {
      store.update((d) => {
        for (const [id, inp] of Object.entries(inputs)) {
          const v = parseNum(inp);
          if (!Number.isNaN(v) && v > 0) d.program.working[id] = fromDisplayWeight(v, unit);
        }
        if (d.program.working.chinup == null) d.program.working.chinup = 0;
      });
      close();
      toast('Starting weights saved', 'good');
      ctx.refresh();
    } }, 'Save'));
  });
}

async function advancePhase(ctx, db) {
  const prog = PROGRAMS[db.program.id];
  const next = db.program.phase + 1;
  if (!prog.phases[next]) {
    if (db.program.id === 'ss-novice') {
      const ok = await confirmSheet('Move to the Texas Method?',
        'This ends the novice progression. Your working weights carry over as intensity-day five-rep maxima, and increases become weekly instead of per session.', 'Switch');
      if (!ok) return;
      store.update((d) => { d.program.id = 'texas-method'; d.program.phase = 1; d.program.cursor = 0; d.program.tmWeek = 0; });
      toast('Switched to the Texas Method', 'good');
    }
  } else {
    store.update((d) => { d.program.phase = next; d.program.cursor = 0; });
    toast(`Advanced to ${prog.phases[next].name}`, 'good');
  }
  ctx.refresh();
}

// ---------------------------------------------------------------------------
// Session start
// ---------------------------------------------------------------------------

function startSession(ctx, db, wk) {
  const entries = wk.items.map((item) => (item.conditioning ? {
    id: uid(),
    exerciseId: item.exerciseId,
    conditioning: true,
    rounds: item.rounds,
    minutes: item.minutes,
    roundsDone: null,
    rpe: null,
    done: false,
    warmup: [], warmupSets: [], sets: [],
  } : {
    id: uid(),
    exerciseId: item.exerciseId,
    prescribedSets: item.sets,
    prescribedReps: item.reps,
    toFailure: item.toFailure,
    light: item.light,
    bodyweight: item.bodyweight,
    warmup: item.warmup,
    // Warm-ups are seeded from the calculated ladder but are yours to edit and
    // tick off. They are kept apart from `sets` so they can never be mistaken
    // for work sets when the progression is decided.
    warmupSets: (item.warmup || []).map((w) => ({
      weight: w.weight, reps: w.reps, label: w.label, done: false, ts: null,
    })),
    sets: Array.from({ length: item.sets }, () => ({
      weight: item.weight, reps: item.reps, done: false, ts: null,
    })),
  }));

  const carried = carryForward(db, wk);

  store.update((d) => {
    d.activeSession = {
      id: uid(), type: 'lift', date: todayISO(), startedAt: Date.now(),
      programId: wk.programId, phase: wk.phase, label: wk.label, cursor: wk.cursor,
      entries: [...entries, ...carried.entries],
      carriedFrom: carried.from, carriedLabel: carried.fromLabel,
      carriedSameSlot: carried.sameSlot, notes: '',
    };
  }, { immediate: true });

  if (carried.names.length) {
    toast(`Carried forward from ${carried.from}: ${carried.names.join(', ')}`);
  }
  ctx.refresh();
}

function startFreeSession(ctx, db) {
  // Nothing is programmed, so everything from last time carries — main lifts at
  // their current working weight, accessories at exactly what you used.
  const carried = carryForward(db, { label: 'Free session', items: [] });

  store.update((d) => {
    d.activeSession = {
      id: uid(), type: 'free', date: todayISO(), startedAt: Date.now(),
      label: 'Free session', entries: carried.entries,
      carriedFrom: carried.from, carriedLabel: carried.fromLabel,
      carriedSameSlot: carried.sameSlot, notes: '',
    };
  }, { immediate: true });

  if (carried.names.length) toast(`Starting from ${carried.from}`);
  ctx.refresh();
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function renderRunner(view, ctx, db) {
  const s = db.activeSession;
  const unit = db.settings.units;

  ctx.slot.append(
    el('button', { class: 'btn-sm btn-ghost', onclick: () => finishSession(ctx) }, 'Finish')
  );

  const elapsed = el('span', { class: 'li-right' }, '');
  const tick = () => { elapsed.textContent = fmtClock((Date.now() - s.startedAt) / 1000); };
  tick();
  const timer = setInterval(tick, 1000);
  // The interval belongs to this render pass; drop it when the node goes away.
  new MutationObserver((_, obs) => {
    if (!document.contains(elapsed)) { clearInterval(timer); obs.disconnect(); }
  }).observe(document.body, { childList: true, subtree: true });

  view.append(
    el('div', { class: 'workout-head' },
      el('div', { class: 'row between' },
        el('div', {},
          el('p', { class: 'workout-title' }, s.label),
          el('div', { class: 'muted', dataset: { sessionSummary: '1' }, style: { fontSize: '13px' } },
            summaryText(s))
        ),
        elapsed
      )
    )
  );

  if (s.carriedFrom) {
    const carried = s.entries.filter((e) => e.carriedFrom);
    if (carried.length) {
      view.append(el('div', { class: 'note' },
        el('b', {}, s.carriedSameSlot === false
          ? `Carried forward from workout ${s.carriedLabel} on ${s.carriedFrom}. `
          : 'Carried forward from your last session. '),
        `${carried.map((e) => exerciseName(e.exerciseId)).join(', ')} — the same weights and reps you used`
        + `${s.carriedSameSlot === false ? '' : ` on ${s.carriedFrom}`}. `
        + 'The programmed lifts above come from the progression, not from last time. Remove anything you are not doing today with the ✕.'));
    }
  }

  for (const entry of s.entries) {
    view.append(entry.conditioning
      ? conditioningBlock(entry, db, ctx)
      : exerciseBlock(entry, db, ctx));
  }

  view.append(
    el('h2', {}, 'Add to this session'),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn-sm', onclick: () => openAddLift(ctx, db) }, '+ Lift'),
      el('button', { class: 'btn-sm', onclick: () => openAddAssistance(ctx, db) }, '+ Assistance'),
      el('button', { class: 'btn-sm', onclick: () => openConditioning(ctx, db, true) }, '+ Conditioning')
    )
  );

  const notes = el('textarea', { placeholder: 'How did it feel? Sleep, technique, anything worth remembering.', value: s.notes || '' });
  notes.addEventListener('change', () => store.update((d) => { d.activeSession.notes = notes.value; }));
  view.append(el('h2', {}, 'Notes'), notes);

  view.append(
    el('div', { class: 'btn-row', style: { marginTop: '16px' } },
      el('button', { class: 'btn-danger', onclick: () => abandonSession(ctx) }, 'Discard'),
      el('button', { class: 'btn-primary', onclick: () => finishSession(ctx) }, 'Finish session')
    )
  );
}

const countDone = (s) => s.entries.reduce((a, e) => a + (e.sets || []).filter((x) => x.done).length, 0);
const countWarm = (s) => s.entries.reduce((a, e) => a + (e.warmupSets || []).filter((x) => x.done).length, 0);
const countCond = (s) => s.entries.filter((e) => e.conditioning && e.done).length;

const summaryText = (s) => {
  const warm = countWarm(s);
  const cond = countCond(s);
  const parts = [`${s.entries.length} exercise${s.entries.length === 1 ? '' : 's'}`];
  if (countDone(s) || !cond) parts.push(`${countDone(s)} work set${countDone(s) === 1 ? '' : 's'}`);
  if (warm) parts.push(`${warm} warm-up`);
  if (cond) parts.push(`${cond} conditioning`);
  return parts.join(' · ');
};

/** Patch the session header in place — the runner never re-renders. */
function refreshSummary() {
  const node = $('[data-session-summary]');
  const s = store.get().activeSession;
  if (node && s) node.textContent = summaryText(s);
}

function exerciseBlock(entry, db, ctx) {
  const unit = db.settings.units;
  const ex = findExercise(entry.exerciseId);
  const isMain = !!MAIN_LIFTS[entry.exerciseId];
  const body = el('div', { class: 'ex-body' });
  const counter = el('span', { class: 'ex-target' });

  const updateCounter = () => {
    const done = entry.sets.filter((x) => x.done).length;
    const warm = (entry.warmupSets || []).filter((x) => x.done).length;
    const base = entry.toFailure
      ? `${done}/${entry.prescribedSets} sets`
      : `${done}/${entry.prescribedSets} × ${entry.prescribedReps}`;
    counter.textContent = warm ? `${base}  ·  ${warm}w` : base;
  };
  updateCounter();

  // Warm-ups are logged the same way work sets are, but live in their own
  // array so they can never be counted as work when the progression is
  // decided or a personal best is checked.
  entry.warmupSets ||= (entry.warmup || []).map((w) => ({
    weight: w.weight, reps: w.reps, label: w.label, done: false, ts: null,
  }));

  if (entry.warmupSets.length || (MAIN_LIFTS[entry.exerciseId] && !entry.bodyweight)) {
    const wGrid = el('div', { class: 'set-grid warmup-grid' });
    entry.warmupSets.forEach((set, i) =>
      wGrid.append(setRow(entry, set, i, db, ctx, updateCounter, { warmup: true })));

    const addWarm = el('button', { class: 'btn-sm btn-ghost', onclick: (e) => {
      const last = entry.warmupSets.at(-1) || { weight: db.settings.barWeight, reps: 5 };
      entry.warmupSets.push({ weight: last.weight, reps: last.reps, label: '', done: false, ts: null });
      store.save();
      wGrid.append(setRow(entry, entry.warmupSets.at(-1), entry.warmupSets.length - 1,
        db, ctx, updateCounter, { warmup: true }));
      updateCounter();
      e.target.blur();
    } }, '+ Warm-up set');

    body.append(
      el('h3', { style: { margin: '0 0 6px' } }, 'Warm-up'),
      wGrid,
      el('div', { style: { marginTop: '7px', marginBottom: '4px' } }, addWarm)
    );
  }

  const grid = el('div', { class: 'set-grid' });
  entry.sets.forEach((set, i) => grid.append(setRow(entry, set, i, db, ctx, updateCounter)));
  body.append(el('h3', { style: { margin: '12px 0 6px' } }, 'Work sets'), grid);

  body.append(
    el('div', { class: 'btn-row', style: { marginTop: '9px' } },
      el('button', { class: 'btn-sm btn-ghost', onclick: (e) => {
        const last = entry.sets.at(-1);
        entry.sets.push({ weight: last?.weight ?? 0, reps: last?.reps ?? entry.prescribedReps, done: false, ts: null });
        store.save();
        grid.append(setRow(entry, entry.sets.at(-1), entry.sets.length - 1, db, ctx, updateCounter));
        updateCounter();
        e.target.blur();
      } }, '+ Set'),
      isMain && el('button', { class: 'btn-sm btn-ghost', onclick: () => openPlateCalc(entry, db) }, 'Plates')
    )
  );

  // Live plate breakdown for the current work weight.
  if (isMain && MAIN_LIFTS[entry.exerciseId].bar) {
    body.append(plateLine(entry.sets[0]?.weight ?? 0, db));
  }

  if (ex?.cues?.length) {
    body.append(
      el('details', { class: 'cues' },
        el('summary', {}, 'Cues'),
        el('ul', {}, ex.cues.map((c) => el('li', {}, c)))
      )
    );
  }

  const block = el('div', { class: 'ex-block' },
    el('div', { class: 'ex-head' },
      el('div', { class: 'grow' },
        el('span', { class: 'ex-name' }, ex?.name || entry.exerciseId),
        entry.light && el('span', { class: 'pill info', style: { marginLeft: '7px' } }, 'Light'),
        entry.carriedFrom && el('span', { class: 'pill', style: { marginLeft: '7px' } }, 'carried')
      ),
      el('div', { class: 'row', style: { gap: '8px' } },
        counter,
        el('button', {
          class: 'btn-sm btn-ghost', 'aria-label': `Remove ${ex?.name || entry.exerciseId}`,
          onclick: () => {
            store.update((d) => {
              d.activeSession.entries = d.activeSession.entries.filter((x) => x.id !== entry.id);
            });
            ctx.refresh();
          },
        }, '✕'))
    ),
    body
  );
  return block;
}

/**
 * A conditioning day inside a programme — rounds and minutes, not sets and
 * reps. Logged in place like everything else, and it never touches the
 * progression because it is not a lift.
 */
function conditioningBlock(entry, db, ctx) {
  const c = findExercise(entry.exerciseId);
  const counter = el('span', { class: 'ex-target' });
  const update = () => { counter.textContent = entry.done ? 'logged' : `${entry.rounds} × ${entry.minutes} min`; };
  update();

  const rounds = numInput({ decimal: false, value: String(entry.roundsDone ?? entry.rounds ?? ''), placeholder: 'rounds' });
  const rpe = numInput({ decimal: false, value: entry.rpe != null ? String(entry.rpe) : '', placeholder: 'RPE 1–10' });

  const commit = () => {
    const r = parseNum(rounds);
    entry.roundsDone = Number.isNaN(r) ? null : Math.round(r);
    const e = parseNum(rpe);
    entry.rpe = Number.isNaN(e) ? null : Math.round(e);
    store.save();
  };
  rounds.addEventListener('change', commit);
  rpe.addEventListener('change', commit);

  const doneBtn = el('button', { class: 'btn-primary btn-block', 'aria-pressed': String(!!entry.done) },
    entry.done ? '✓ Logged' : 'Log this session');
  doneBtn.addEventListener('click', () => {
    commit();
    entry.done = !entry.done;
    doneBtn.textContent = entry.done ? '✓ Logged' : 'Log this session';
    doneBtn.setAttribute('aria-pressed', String(entry.done));
    store.save();
    update(); refreshSummary(); buzz(entry.done ? 35 : 15);
  });

  // A proper round timer — rounds, rest, warnings and bells — rather than the
  // single-interval rest clock the lifting days use.
  const openTimer = () => openRoundTimer(ctx, {
    rounds: entry.rounds,
    roundSec: (entry.minutes || 3) * 60,
    restSec: entry.restSec ?? 60,
    onDone: ({ roundsCompleted, workMinutes }) => {
      if (roundsCompleted > 0) {
        rounds.value = String(roundsCompleted);
        entry.roundsDone = roundsCompleted;
        store.save();
        update();
        toast(`${roundsCompleted} rounds, ${workMinutes} min of work`, 'good');
      }
    },
  });
  const startRound = el('button', { class: 'btn-primary btn-sm btn-block', onclick: openTimer },
    `Round timer — ${entry.rounds} × ${entry.minutes} min`);
  const startRestBtn = el('button', { class: 'btn-sm btn-block', onclick: () => openRoundSettings(ctx) },
    'Timer settings');

  return el('div', { class: 'ex-block' },
    el('div', { class: 'ex-head' },
      el('div', { class: 'grow' },
        el('span', { class: 'ex-name' }, c?.name || entry.exerciseId),
        el('span', { class: 'pill info', style: { marginLeft: '7px' } }, 'conditioning')),
      counter),
    el('div', { class: 'ex-body' },
      c?.detail && el('div', { class: 'note', style: { marginTop: 0 } }, c.detail),
      el('div', { class: 'btn-row', style: { marginBottom: '12px' } }, startRound, startRestBtn),
      el('div', { class: 'grid2' },
        el('div', { class: 'field' }, el('label', {}, 'Rounds completed'), rounds),
        el('div', { class: 'field' }, el('label', {}, 'RPE'), rpe)),
      doneBtn));
}

function setRow(entry, set, i, db, ctx, updateCounter, { warmup = false } = {}) {
  const unit = db.settings.units;

  const wInput = numInput({
    class: 'set-input', 'aria-label': `Set ${i + 1} weight`,
    // Zero is a real, meaningful value on a bodyweight lift — it means
    // bodyweight only — so it is shown rather than left blank.
    value: num(toDisplayWeight(set.weight || 0, unit)),
    placeholder: entry.bodyweight ? `+${unit}` : unit,
  });
  const rInput = numInput({
    decimal: false, class: 'set-input', 'aria-label': `Set ${i + 1} reps`,
    value: set.reps || '', placeholder: entry.toFailure ? 'max' : 'reps',
  });

  const commit = () => {
    const w = parseNum(wInput);
    set.weight = Number.isNaN(w) ? 0 : fromDisplayWeight(w, unit);
    const r = parseNum(rInput);
    set.reps = Number.isNaN(r) ? 0 : Math.round(r);
    store.save();
    if (row.classList.contains('logged')) refreshPlateLine(row, set, db);
  };
  wInput.addEventListener('change', commit);
  rInput.addEventListener('change', commit);

  const doneBtn = el('button', {
    class: 'set-done', 'aria-pressed': String(!!set.done),
    'aria-label': `Mark set ${i + 1} complete`,
  }, set.done ? '✓' : '○');

  // The set index doubles as the attachment button. It keeps the grid at four
  // columns — a fifth would squeeze the number fields, which are the things
  // you actually have to hit with cold hands.
  const idx = el('button', {
    class: `set-idx ${hasAttachments(set) ? 'has-media' : ''}`,
    'aria-label': `Notes and media for set ${i + 1}`,
  }, warmup ? (set.label || '·') : String(i + 1));

  idx.addEventListener('click', () => {
    openAttachments(ctx, entry, set, i, {
      warmup,
      onChange: () => idx.classList.toggle('has-media', hasAttachments(set)),
    });
  });

  const row = el('div', { class: `set-row ${warmup ? 'warm' : ''} ${set.done ? 'logged' : ''}` },
    idx, wInput, rInput, doneBtn);

  doneBtn.addEventListener('click', () => {
    commit();
    set.done = !set.done;
    set.ts = set.done ? Date.now() : null;
    doneBtn.setAttribute('aria-pressed', String(set.done));
    doneBtn.textContent = set.done ? '✓' : '○';
    row.classList.toggle('logged', set.done);
    store.save();          // written to storage on the tap, not on finish
    updateCounter();
    refreshSummary();
    buzz(set.done ? 35 : 15);

    // Warm-ups get a short rest, or none. Kicking off a four-minute clock
    // after the empty bar would be actively unhelpful.
    if (set.done && db.settings.autoRest && !warmup) {
      const kind = MAIN_LIFTS[entry.exerciseId] ? 'main' : 'assistance';
      startRest(db.settings.restSec[kind], `Rest — ${exerciseName(entry.exerciseId)}`);
    }
    // A personal best can only come from a work set. A warm-up single at a
    // heavy weight is not a record, and nor is a submaximal ramp.
    if (set.done && !warmup && !entry.bodyweight && set.reps > 0 && set.weight > 0) {
      const est = e1rm(set.weight, set.reps);
      if (store.recordPR(entry.exerciseId, set.weight, set.reps, todayISO(), est)) {
        toast(`PR — ${exerciseName(entry.exerciseId)} ${num(toDisplayWeight(set.weight, unit))} × ${set.reps}`, 'good');
      }
    }
  });

  return row;
}

function plateLine(weight, db) {
  const node = el('div', { class: 'plates' });
  fillPlateLine(node, weight, db);
  return node;
}

function refreshPlateLine(row, set, db) {
  const block = row.closest('.ex-body');
  const node = block && block.querySelector('.plates');
  if (node) fillPlateLine(node, set.weight, db);
}

function fillPlateLine(node, weight, db) {
  const { barWeight, plates, units } = db.settings;
  const res = platesFor(weight, barWeight, plates);
  node.replaceChildren();
  if (weight <= barWeight) {
    node.append(el('span', {}, 'Empty bar'));
    return;
  }
  node.append(el('span', {}, 'Per side: '));
  if (!res.perSide.length) node.append(el('b', {}, 'nothing — bar only'));
  res.perSide.forEach((p, i) => {
    node.append(el('b', {}, `${num(toDisplayWeight(p.plate, units))}${p.count > 1 ? `×${p.count}` : ''}`));
    if (i < res.perSide.length - 1) node.append(el('span', {}, ' + '));
  });
  if (res.short > 0.01) {
    node.append(el('span', { class: 'short' }, ` — ${num(toDisplayWeight(res.short, units))} ${units} short of ${num(toDisplayWeight(weight, units))}. Your plates cannot make this number.`));
  }
}

function openPlateCalc(entry, db) {
  sheet('Plate calculator', (body) => {
    const unit = db.settings.units;
    const inp = numInput({ value: num(toDisplayWeight(entry.sets[0]?.weight ?? db.settings.barWeight, unit)) });
    const out = el('div', { class: 'plates', style: { marginTop: '12px', fontSize: '14px' } });
    const upd = () => fillPlateLine(out, fromDisplayWeight(parseNum(inp) || 0, unit), db);
    inp.addEventListener('input', upd);
    upd();
    body.append(
      el('div', { class: 'field' }, el('label', {}, `Target weight (${unit})`), inp),
      out,
      el('div', { class: 'note' }, `Bar ${num(toDisplayWeight(db.settings.barWeight, unit))} ${unit}. Plates available: ${db.settings.plates.map((p) => num(toDisplayWeight(p, unit))).join(', ')}. Change these in More → Settings.`)
    );
  });
}

// ---------------------------------------------------------------------------
// Adding work mid-session
// ---------------------------------------------------------------------------

function openAddLift(ctx, db) {
  sheet('Add a lift', (body, close) => {
    body.append(el('div', { class: 'list' },
      Object.values(MAIN_LIFTS).map((lift) =>
        el('button', { class: 'list-item', onclick: () => {
          const w = offeredWeight(db, lift.id);
          const sets = lift.defaultSets ?? 3;
          const reps = lift.defaultReps ?? 5;
          // Already in today's session? Then this is an extra and must not
          // drive the progression a second time.
          const already = db.activeSession.entries.some((e) => e.exerciseId === lift.id);
          const warm = lift.bodyweight ? [] : warmupSets(w, lift.warmup, db.settings);
          store.update((d) => {
            d.activeSession.entries.push({
              id: uid(), exerciseId: lift.id, prescribedSets: sets, prescribedReps: reps,
              toFailure: reps === 0,
              bodyweight: !!lift.bodyweight, derived: already,
              warmup: warm,
              warmupSets: warm.map((x) => ({ weight: x.weight, reps: x.reps, label: x.label, done: false, ts: null })),
              sets: Array.from({ length: sets }, () => ({ weight: w, reps, done: false, ts: null })),
            });
          });
          close(); ctx.refresh();
        } },
          el('div', { class: 'grow' },
            el('div', { class: 'li-title' }, lift.name),
            el('div', { class: 'li-sub' }, `${lift.setsReps}${offeredWeight(db, lift.id) ? ` · ${num(toDisplayWeight(offeredWeight(db, lift.id), db.settings.units))} ${db.settings.units}` : ''}`)),
          el('span', { class: 'li-right' }, '+')
        ))
    ));
    body.append(el('div', { class: 'note', style: { marginTop: '12px' } },
      'A lift added here is tracked and progressed like any other — the next session will prescribe the heavier weight. '
      + 'The exception is a lift already in today\'s session: a second entry for it is logged but does not apply the increment twice.'));
    body.append(el('button', { class: 'btn-sm btn-block', onclick: () => { close(); openExerciseManager(ctx); } },
      '+ Define your own lift'));
  });
}

function openAddAssistance(ctx, db) {
  sheet('Assistance', (body, close) => {
    body.append(el('div', { class: 'note warn' },
      el('b', {}, 'Assistance comes after the barbell work, never before. '),
      'It is optional, it is secondary, and it is the first thing to cut when the squat stalls. A novice who adds this before the linear progression runs out is spending recovery he needs.'));

    let equip = 'dumbbell';
    const list = el('div', { class: 'list' });
    const groups = [...new Set(ASSISTANCE.map((a) => a.equip))];
    const draw = () => {
      list.replaceChildren();
      ASSISTANCE.filter((a) => (equip === 'all' ? true : a.equip === equip)).forEach((a) => {
        list.append(el('button', { class: 'list-item', onclick: () => {
          // Start from whatever you last used for this movement, sets and reps
          // included — an accessory has no progression to fall back on.
          const prev = lastLogged(db, a.id);
          const sets = prev?.sets || 3;
          const reps = prev?.reps || 10;
          const weight = prev?.weight || 0;
          store.update((d) => {
            d.activeSession.entries.push({
              id: uid(), exerciseId: a.id, prescribedSets: sets, prescribedReps: reps,
              assistance: true, derived: true, warmup: [], warmupSets: [],
              sets: Array.from({ length: sets }, () => ({ weight, reps, done: false, ts: null })),
            });
          });
          close(); ctx.refresh();
        } },
          el('div', { class: 'grow' },
            el('div', { class: 'li-title' }, a.name),
            el('div', { class: 'li-sub' }, (() => {
              const prev = lastLogged(db, a.id);
              return prev
                ? `Last: ${prev.weight > 0 ? `${num(toDisplayWeight(prev.weight, db.settings.units))} ${db.settings.units} × ` : ''}${prev.reps} on ${prev.date}`
                : `${a.target} · ${a.sets}`;
            })()),
            a.note && el('div', { class: 'li-sub dim' }, a.note)),
          el('span', { class: 'li-right' }, '+')
        ));
      });
    };

    const chips = el('div', { class: 'chips', style: { margin: '12px 0' } },
      ['all', ...groups].map((e) => {
        const c = el('button', { class: 'chip', 'aria-pressed': String(e === equip) }, e);
        c.addEventListener('click', () => {
          equip = e;
          [...chips.children].forEach((x) => x.setAttribute('aria-pressed', String(x.textContent === e)));
          draw();
        });
        return c;
      }));
    body.append(chips, list);
    body.append(el('button', { class: 'btn-sm btn-block', style: { marginTop: '12px' },
      onclick: () => { close(); openExerciseManager(ctx); } }, '+ Define your own exercise'));
    draw();
    void EQUIPMENT;
  });
}

function openConditioning(ctx, db, intoSession = false) {
  sheet('Conditioning', (body, close) => {
    body.append(el('div', { class: 'note' },
      el('b', {}, 'Conditioning is a distant second to strength while the linear progression is still running. '),
      'Keep it on non-lifting days and keep it short. The interference rating on each session is how much it costs your squat.'));

    let sport = 'boxing';
    const list = el('div', { class: 'list' });
    const draw = () => {
      list.replaceChildren();
      CONDITIONING.filter((c) => c.sport === sport).forEach((c) => {
        list.append(el('button', { class: 'list-item', onclick: () => logConditioning(ctx, db, c, intoSession, close) },
          el('div', { class: 'grow' },
            el('div', { class: 'li-title' }, c.name),
            el('div', { class: 'li-sub' }, `${c.structure} · ${c.zone} · RPE ${c.rpe}`),
            el('div', { class: 'li-sub dim' }, c.detail),
            el('span', { class: `pill ${c.interference === 'high' ? 'bad' : c.interference === 'medium' ? 'warn' : 'good'}`, style: { marginTop: '6px' } },
              `${c.interference} interference`)),
          el('span', { class: 'li-right' }, `${c.durationMin}′`)
        ));
      });
    };

    const chips = el('div', { class: 'chips', style: { margin: '12px 0' } },
      SPORTS.map((s) => {
        const c = el('button', { class: 'chip', 'aria-pressed': String(s === sport) }, s);
        c.addEventListener('click', () => {
          sport = s;
          [...chips.children].forEach((x) => x.setAttribute('aria-pressed', String(x.textContent === s)));
          draw();
        });
        return c;
      }));
    body.append(chips, list);
    draw();
  });
}

function logConditioning(ctx, db, c, intoSession, close) {
  close();
  sheet(c.name, (body, done) => {
    const dur = numInput({ decimal: false, value: String(c.durationMin) });
    const rpe = numInput({ decimal: false, value: String(parseInt(c.rpe, 10) || 6) });
    const notes = el('textarea', { placeholder: 'Rounds completed, pace, how it went' });

    // Anything structured as rounds gets the round timer, parsed straight off
    // the session's own structure string.
    const m = c.structure.match(/(\d+)\s*[×x]\s*(\d+)\s*(min|s)\b/i);
    const timerBtn = m ? el('button', { class: 'btn-primary btn-block', style: { marginBottom: '12px' }, onclick: () => {
      openRoundTimer(ctx, {
        rounds: parseInt(m[1], 10),
        roundSec: m[3].toLowerCase() === 'min' ? parseInt(m[2], 10) * 60 : parseInt(m[2], 10),
        onDone: ({ roundsCompleted, workMinutes }) => {
          if (workMinutes > 0) { dur.value = String(workMinutes); toast(`${roundsCompleted} rounds logged`, 'good'); }
        },
      });
    } }, `Round timer — ${m[1]} × ${m[2]} ${m[3]}`) : null;

    body.append(
      el('div', { class: 'note' }, c.detail),
      timerBtn,
      el('div', { class: 'grid2' },
        el('div', { class: 'field' }, el('label', {}, 'Minutes'), dur),
        el('div', { class: 'field' }, el('label', {}, 'RPE 1–10'), rpe)),
      el('div', { class: 'field' }, el('label', {}, 'Notes'), notes),
      el('div', { class: 'note warn' }, INTERFERENCE_NOTE[c.interference]),
      el('button', { class: 'btn-primary btn-block', onclick: () => {
        const record = {
          id: uid(), type: 'conditioning', date: todayISO(),
          label: c.name, sport: c.sport, conditioningId: c.id,
          durationMin: Math.round(parseNum(dur)) || c.durationMin,
          rpe: Math.round(parseNum(rpe)) || null,
          interference: c.interference,
          notes: notes.value, entries: [],
        };
        store.update((d) => {
          if (intoSession && d.activeSession) {
            d.activeSession.conditioning = [...(d.activeSession.conditioning || []), record];
          } else {
            d.sessions.push(record);
          }
        });
        done(); toast('Conditioning logged', 'good'); ctx.refresh();
      } }, 'Log it')
    );
  });
}

// ---------------------------------------------------------------------------
// Finishing
// ---------------------------------------------------------------------------

async function finishSession(ctx) {
  const db = store.get();
  const s = db.activeSession;
  if (!s) return;

  const done = countDone(s) + countWarm(s) + countCond(s);
  if (done === 0) {
    const ok = await confirmSheet('Nothing logged', 'No sets were marked complete. Discard this session?', 'Discard');
    if (ok) { store.update((d) => { d.activeSession = null; }); stopRest(); ctx.refresh(); }
    return;
  }

  s.durationSec = Math.round((Date.now() - s.startedAt) / 1000);
  // Drop sets that were never touched so the history reflects what happened.
  // Warm-ups are kept separately and an exercise survives on warm-ups alone —
  // if you only got through the ramp, that is still what occurred.
  // A conditioning slot inside a programme becomes a proper conditioning
  // record, so it shows up in the conditioning stats rather than as a lift
  // with no sets.
  const condRecords = s.entries.filter((e) => e.conditioning && e.done).map((e) => {
    const c = findExercise(e.exerciseId);
    return {
      id: uid(), type: 'conditioning', date: s.date,
      label: c?.name || e.exerciseId, sport: c?.sport || 'other',
      conditioningId: e.exerciseId,
      durationMin: Math.round((e.roundsDone ?? e.rounds ?? 0) * (e.minutes || 0)),
      rounds: e.roundsDone ?? e.rounds ?? null,
      rpe: e.rpe ?? null, interference: c?.interference || 'medium',
      notes: '', entries: [],
    };
  });

  s.entries = s.entries.filter((e) => !e.conditioning);
  s.entries.forEach((e) => {
    e.sets = e.sets.filter((x) => x.done);
    e.warmupSets = (e.warmupSets || []).filter((x) => x.done);
  });
  s.entries = s.entries.filter((e) => e.sets.length > 0 || e.warmupSets.length > 0);

  // A free session updates your weights too. Anything you logged is real work
  // and the next session should start from it — that is the whole point of the
  // log. The rotation guard inside applySession stops it consuming a
  // programme day.
  const changes = (s.type === 'lift' || s.type === 'free') ? applySession(db, s) : [];

  store.update((d) => {
    // A day that was only conditioning leaves no lifting session behind.
    if (s.entries.length) d.sessions.push(s);
    if (s.conditioning) d.sessions.push(...s.conditioning);
    d.sessions.push(...condRecords);
    d.activeSession = null;
  }, { immediate: true });

  stopRest();
  showSummary(ctx, s, changes, db.settings.units, condRecords);
}

function showSummary(ctx, s, changes, unit, condRecords = []) {
  sheet('Session complete', (body, close) => {
    const sets = s.entries.reduce((a, e) => a + e.sets.length, 0);
    const warm = s.entries.reduce((a, e) => a + (e.warmupSets || []).length, 0);
    void countCond;
    const tonnage = (arr) => arr.reduce((x, st) => x + st.weight * st.reps, 0);
    // Warm-up tonnage is real work and counts towards volume, but it is shown
    // separately from the work-set count so the two are never conflated.
    const volume = s.entries.reduce((a, e) => a + tonnage(e.sets) + tonnage(e.warmupSets || []), 0);

    body.append(
      el('div', { class: 'stat-grid' },
        stat(fmtClock(s.durationSec), 'Duration'),
        stat(sets, 'Work sets', null, warm ? `+${warm} warm-up` : null),
        stat(`${Math.round(toDisplayWeight(volume, unit))}`, `Volume ${unit}`)
      )
    );

    for (const c of condRecords) {
      body.append(el('div', { class: 'card tight' },
        el('div', { class: 'row between' },
          el('div', { class: 'li-title' }, c.label),
          el('span', { class: 'pill info' }, `${c.rounds ?? '–'} rounds`)),
        el('div', { class: 'li-sub', style: { marginTop: '5px' } },
          `${c.durationMin} min of work${c.rpe ? ` at RPE ${c.rpe}` : ''}. Logged as conditioning.`)));
    }

    if (changes.length) {
      body.append(el('h3', {}, 'What this does to your programme'));
      for (const c of changes) {
        const kind = c.type === 'up' ? 'good' : c.type === 'reset' ? 'bad' : c.type === 'repeat' ? 'warn' : '';
        body.append(
          el('div', { class: 'card tight' },
            el('div', { class: 'row between' },
              el('div', { class: 'li-title' }, exerciseName(c.ex)),
              c.from != null && c.to != null && c.from !== c.to
                ? el('span', { class: `pill ${kind}` }, `${num(toDisplayWeight(c.from, unit))} → ${num(toDisplayWeight(c.to, unit))} ${unit}`)
                : el('span', { class: `pill ${kind}` }, c.type)),
            el('div', { class: 'li-sub', style: { marginTop: '5px' } }, c.why))
        );
      }
    }

    body.append(el('button', { class: 'btn-primary btn-block', style: { marginTop: '12px' },
      onclick: () => { close(); ctx.refresh(); } }, 'Done'));
  }, { onClose: () => ctx.refresh() });
}

async function abandonSession(ctx) {
  const ok = await confirmSheet('Discard session?',
    'Every set you logged in this session will be deleted. Your programme state does not change.', 'Discard');
  if (!ok) return;
  store.update((d) => { d.activeSession = null; });
  stopRest();
  toast('Session discarded');
  ctx.refresh();
}

// ---------------------------------------------------------------------------

function renderRecent(view, db) {
  const recent = [...db.sessions].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);
  if (!recent.length) return;
  view.append(el('h2', {}, 'Recent'));
  const list = el('div', { class: 'list' });
  for (const s of recent) {
    const sets = (s.entries || []).reduce((a, e) => a + e.sets.length, 0);
    list.append(el('div', { class: 'list-item', style: { cursor: 'default' } },
      el('div', {},
        el('div', { class: 'li-title' }, s.label),
        el('div', { class: 'li-sub' }, s.type === 'conditioning' ? `${s.durationMin} min · RPE ${s.rpe ?? '–'}` : `${sets} sets`)),
      el('div', { class: 'li-right' }, s.date)));
  }
  view.append(list);
}
