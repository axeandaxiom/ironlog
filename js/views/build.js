// Builders for your own exercises and your own programmes.
//
// Both produce data in exactly the same shape as the built-ins, which is what
// keeps this honest: a programme you write here runs through the same
// progression engine, warm-up ladders and plate maths as the novice linear
// progression. There is no second-class "custom" code path.

import { el, uid, num, toast, numInput, parseNum, toDisplayWeight, fromDisplayWeight } from '../util.js';
import * as store from '../store.js';
import {
  MAIN_LIFTS, ASSISTANCE, CONDITIONING, EQUIPMENT, allMovements, findExercise, exerciseName,
} from '../data/exercises.js';
import {
  PROGRAMS, newCustomProgram, newProgramDay, newProgramItem, validateProgram,
} from '../programs.js';
import { sheet, confirmSheet, syncCustom } from '../app.js';

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

export function openExerciseManager(ctx) {
  sheet('Exercises', (body, close) => {
    const db = store.get();

    body.append(el('div', { class: 'note' },
      el('b', {}, 'Add anything you actually train. '),
      'A movement you define here behaves exactly like a built-in one: it appears in the "+ Lift" and assistance lists, it can go into a programme you build, and if you mark it as a main lift it gets a working weight, warm-up ladder and automatic progression.'));

    body.append(el('button', { class: 'btn-primary btn-block', onclick: () => {
      close(); openExerciseBuilder(ctx, null);
    } }, '+ New exercise'));

    if (db.customExercises.length) {
      body.append(el('h3', { style: { marginTop: '18px' } }, 'Yours'));
      const list = el('div', { class: 'list' });
      for (const ex of db.customExercises) {
        const used = db.sessions.reduce((a, s) =>
          a + (s.entries || []).filter((e) => e.exerciseId === ex.id).length, 0);
        list.append(el('button', { class: 'list-item', onclick: () => { close(); openExerciseBuilder(ctx, ex); } },
          el('div', { class: 'grow' },
            el('div', { class: 'li-title' }, ex.name),
            el('div', { class: 'li-sub' },
              `${ex.kind === 'main' ? 'Main lift — progressed' : 'Assistance — logged only'}`
              + ` · ${ex.defaultSets ?? 3} × ${ex.defaultReps ?? 5}`
              + (used ? ` · used ${used}×` : ''))),
          el('span', { class: 'li-right' }, '›')));
      }
      body.append(list);
    }

    body.append(el('h3', { style: { marginTop: '18px' } }, 'Built in'));
    body.append(el('p', { class: 'sub' },
      `${Object.keys(MAIN_LIFTS).length - db.customExercises.filter((e) => e.kind === 'main').length} main lifts and `
      + `${ASSISTANCE.length - db.customExercises.filter((e) => e.kind !== 'main').length} assistance movements, all available in any programme you build.`));
  });
}

export function openExerciseBuilder(ctx, existing) {
  sheet(existing ? existing.name : 'New exercise', (body, close) => {
    const ex = existing || {
      kind: 'assistance', bar: false, bodyweight: false,
      defaultSets: 3, defaultReps: 10, increment: 2.5, equip: 'dumbbell',
    };

    const name = el('input', { value: ex.name || '', placeholder: 'e.g. Trap Bar Deadlift' });

    const kind = el('select', {},
      el('option', { value: 'assistance' }, 'Assistance — logged only'),
      el('option', { value: 'main' }, 'Main lift — progressed automatically'));
    kind.value = ex.kind || 'assistance';

    const equip = el('select', {},
      ['barbell', ...EQUIPMENT, 'machine', 'cable', 'other'].map((e) => el('option', { value: e }, e)));
    equip.value = ex.bar ? 'barbell' : (ex.equip || 'dumbbell');

    const sets = numInput({ decimal: false, value: String(ex.defaultSets ?? 3) });
    const reps = numInput({ decimal: false, value: String(ex.defaultReps ?? 10) });
    const target = el('input', { value: ex.target || '', placeholder: 'e.g. hamstrings, upper back' });
    const cues = el('textarea', {
      value: (ex.cues || []).join('\n'),
      placeholder: 'One coaching cue per line. These show up under the exercise during a session.',
    });

    // Main-lift-only fields.
    const unit = store.get().settings.units;
    const increment = numInput({ value: num(toDisplayWeight(ex.increment ?? 2.5, unit)) });
    const warmup = el('select', {},
      el('option', { value: 'full' }, 'Standard — bar, 40 %, 60 %, 80 %'),
      el('option', { value: 'deadlift' }, 'Pull from the floor — 45 %, 65 %, 85 %'),
      el('option', { value: 'rdl' }, 'Higher rep — bar, 50 %, 70 %, 85 %'),
      el('option', { value: 'clean' }, 'Explosive — bar, 50 %, 70 %, 85 %'),
      el('option', { value: 'none' }, 'None'));
    warmup.value = ex.warmup || 'full';

    const mainOnly = el('div', {},
      el('div', { class: 'grid2' },
        el('div', { class: 'field' }, el('label', {}, `Increment per session (${unit})`), increment),
        el('div', { class: 'field' }, el('label', {}, 'Warm-up ladder'), warmup)),
      el('div', { class: 'note' },
        'A main lift gets a working weight that goes up when you make all the reps, repeats when you miss, and resets 10 % after three consecutive misses — the same rules the barbell lifts use.'));

    // Remember the ladder you picked, so toggling equipment away from barbell
    // and back does not silently leave the lift with no warm-up at all.
    let lastLadder = ex.warmup && ex.warmup !== 'none' ? ex.warmup : 'full';

    const syncKind = () => {
      mainOnly.style.display = kind.value === 'main' ? '' : 'none';
      // A barbell movement needs plate maths and a warm-up ladder.
      const isBar = equip.value === 'barbell';
      warmup.disabled = !isBar;
      if (isBar) {
        if (warmup.value === 'none') warmup.value = lastLadder;
      } else {
        if (warmup.value !== 'none') lastLadder = warmup.value;
        warmup.value = 'none';
      }
    };
    warmup.addEventListener('change', () => {
      if (warmup.value !== 'none') lastLadder = warmup.value;
    });
    kind.addEventListener('change', syncKind);
    equip.addEventListener('change', syncKind);

    body.append(
      el('div', { class: 'field' }, el('label', {}, 'Name'), name),
      el('div', { class: 'field' }, el('label', {}, 'Type'), kind),
      el('div', { class: 'grid2' },
        el('div', { class: 'field' }, el('label', {}, 'Equipment'), equip),
        el('div', { class: 'field' }, el('label', {}, 'Trains'), target)),
      el('div', { class: 'grid2' },
        el('div', { class: 'field' }, el('label', {}, 'Default sets'), sets),
        el('div', { class: 'field' }, el('label', {}, 'Default reps (0 = to failure)'), reps)),
      mainOnly,
      el('div', { class: 'field' }, el('label', {}, 'Cues'), cues)
    );
    syncKind();

    body.append(el('button', { class: 'btn-primary btn-block', onclick: () => {
      if (!name.value.trim()) { toast('Give it a name', 'bad'); return; }
      const isBar = equip.value === 'barbell';
      const record = {
        id: existing?.id || `x-${uid()}`,
        name: name.value.trim(),
        short: name.value.trim().split(/\s+/).slice(0, 2).join(' '),
        kind: kind.value,
        bar: isBar,
        bodyweight: equip.value === 'bodyweight',
        equip: isBar ? 'barbell' : equip.value,
        target: target.value.trim(),
        defaultSets: Math.max(1, Math.round(parseNum(sets)) || 3),
        defaultReps: Math.max(0, Math.round(parseNum(reps)) || 0),
        increment: fromDisplayWeight(parseNum(increment) || 2.5, unit),
        lateIncrement: fromDisplayWeight((parseNum(increment) || 2.5) / 2, unit),
        resetPct: 0.9,
        warmup: isBar ? warmup.value : 'none',
        cues: cues.value.split('\n').map((c) => c.trim()).filter(Boolean),
        custom: true,
      };
      record.setsReps = `${record.defaultSets} × ${record.defaultReps || 'max'}`;

      store.update((d) => {
        const i = d.customExercises.findIndex((x) => x.id === record.id);
        if (i >= 0) d.customExercises[i] = record;
        else d.customExercises.push(record);
      });
      syncCustom();
      close();
      toast(existing ? 'Exercise updated' : `${record.name} added`, 'good');
      ctx.refresh();
    } }, existing ? 'Save changes' : 'Add exercise'));

    if (existing) {
      body.append(el('button', { class: 'btn-danger btn-block', style: { marginTop: '10px' }, onclick: async () => {
        const ok = await confirmSheet('Delete exercise?',
          `"${existing.name}" is removed from the pickers and from any programme that uses it. Sessions you already logged keep their history.`, 'Delete');
        if (!ok) return;
        store.update((d) => {
          d.customExercises = d.customExercises.filter((x) => x.id !== existing.id);
          // Strip it out of any programme day that referenced it.
          for (const p of d.customPrograms) {
            for (const day of p.phases[1].rotation) {
              day.items = day.items.filter((it) => it.ex !== existing.id);
            }
          }
        });
        syncCustom();
        close(); toast('Deleted'); ctx.refresh();
      } }, 'Delete exercise'));
    }
  });
}

// ---------------------------------------------------------------------------
// Programmes
// ---------------------------------------------------------------------------

export function openProgramManager(ctx) {
  sheet('Programmes', (body, close) => {
    const db = store.get();

    body.append(el('div', { class: 'note' },
      el('b', {}, 'Build your own. '),
      'Define the days, the exercises on each day, and the sets and reps. The app then rotates through those days in order and applies the same progression rules the built-in programmes use.'));

    body.append(el('h3', {}, 'Active'));
    body.append(el('div', { class: 'card tight' },
      el('div', { class: 'li-title' }, PROGRAMS[db.program.id]?.name || db.program.id),
      el('div', { class: 'li-sub' }, PROGRAMS[db.program.id]?.frequency || '')));

    const list = el('div', { class: 'list' });
    for (const p of Object.values(PROGRAMS)) {
      const active = p.id === db.program.id;
      const days = p.phases[1]?.rotation?.length || 0;
      list.append(el('div', { class: 'list-item', style: { cursor: 'default' } },
        el('div', { class: 'grow' },
          el('div', { class: 'li-title' }, p.name,
            p.custom ? el('span', { class: 'pill', style: { marginLeft: '7px' } }, 'yours') : null),
          el('div', { class: 'li-sub' }, `${p.source} · ${days || Object.keys(p.phases).length} day${days === 1 ? '' : 's'}`)),
        el('div', { class: 'row', style: { gap: '6px' } },
          // Every programme is editable. A built-in forks into your own copy on
          // save rather than being overwritten, so the reference version stays
          // intact and you can always get back to it.
          el('button', { class: 'btn-sm btn-ghost', onclick: () => {
            close();
            if (p.custom) openProgramBuilder(ctx, p);
            else openProgramBuilder(ctx, null, p.id, { fork: true });
          } }, 'Edit'),
          !active && el('button', { class: 'btn-sm', onclick: async () => {
            const ok = await confirmSheet('Switch programme?',
              'Your working weights and history are kept. The rotation starts again at the first day.', 'Switch');
            if (!ok) return;
            store.update((d) => {
              d.program.id = p.id; d.program.phase = 1; d.program.cursor = 0; d.program.tmWeek = 0;
            });
            close(); toast(`Now running ${p.name}`, 'good'); ctx.refresh();
          } }, 'Use'),
          active && el('span', { class: 'pill accent' }, 'active'))));
    }
    body.append(el('h3', { style: { marginTop: '16px' } }, 'All programmes'), list);

    body.append(
      el('button', { class: 'btn-primary btn-block', style: { marginTop: '14px' },
        onclick: () => { close(); openProgramBuilder(ctx, null); } }, '+ Build a programme'),
      el('button', { class: 'btn-block', style: { marginTop: '8px' },
        onclick: () => { close(); openProgramBuilder(ctx, null, db.program.id); } }, 'Start from the active one')
    );
  });
}

export function openProgramBuilder(ctx, existing, copyFromId = null, { fork = false } = {}) {
  const source = copyFromId ? PROGRAMS[copyFromId] : null;
  const title = existing ? (existing.name || 'Programme')
    : fork && source ? `Edit ${source.name}`
      : source ? 'Copy programme' : 'New programme';

  sheet(title, (body, close) => {
    // Deep clone so an abandoned edit changes nothing.
    let prog;
    if (existing) {
      prog = JSON.parse(JSON.stringify(existing));
    } else if (source) {
      const src = JSON.parse(JSON.stringify(source));
      // A phase-based built-in flattens to the phase you are actually running,
      // because a programme you edit has one rotation, not three.
      const phase = src.phases[ctx.phase || 1] || src.phases[1];
      prog = {
        ...newCustomProgram(),
        // Forking keeps the name; an explicit copy marks itself as a duplicate.
        name: fork ? src.name : `${src.name} (my version)`,
        frequency: src.frequency,
        blurb: src.blurb,
        phases: { 1: { name: 'Standard', note: phase.note || '', rotation: phase.rotation, advanceWhen: '' } },
      };
    } else {
      prog = newCustomProgram();
    }

    if (fork && source) {
      body.append(el('div', { class: 'note accent' },
        el('b', {}, `This saves as your own copy of ${source.name}. `),
        `The original stays in the list untouched, so you can always go back to it. `
        + (Object.keys(source.phases).length > 1
          ? `It has ${Object.keys(source.phases).length} phases; you are editing the one you are currently on, and your copy will have a single rotation.`
          : '')));
    }

    const rotation = prog.phases[1].rotation;

    const name = el('input', { value: prog.name, placeholder: 'e.g. Upper / Lower 4×week' });
    const frequency = el('input', { value: prog.frequency, placeholder: 'e.g. 4 × / week, Mon Tue Thu Fri' });
    const blurb = el('textarea', { value: prog.blurb, placeholder: 'What this programme is for, and how to run it. Shown on the training screen.' });

    const daysBox = el('div');

    const drawDays = () => {
      daysBox.replaceChildren();
      if (!rotation.length) {
        daysBox.append(el('p', { class: 'sub' }, 'No days yet. Add one below.'));
      }
      rotation.forEach((day, di) => {
        const label = el('input', { value: day.label, placeholder: `Day ${di + 1} name, e.g. Upper A` });
        label.addEventListener('input', () => { day.label = label.value; });

        const items = el('div', { class: 'stack' });
        const drawItems = () => {
          items.replaceChildren();
          if (!day.items.length) items.append(el('p', { class: 'sub' }, 'No exercises on this day.'));
          day.items.forEach((it, ii) => {
            // A conditioning slot is rounds and minutes. Rendering it as an
            // exercise row would default its picker to a squat, and saving
            // would silently turn a bag day into a squat day.
            if (it.conditioningId) {
              items.append(conditioningRow(it, () => { day.items.splice(ii, 1); drawItems(); }));
              return;
            }
            const pick = movementSelect(it.ex);

            const sets = numInput({ decimal: false, value: String(it.sets) });
            sets.addEventListener('change', () => { it.sets = Math.max(1, Math.round(parseNum(sets)) || 1); });

            const reps = numInput({ decimal: false, value: String(it.reps) });
            reps.addEventListener('change', () => { it.reps = Math.max(0, Math.round(parseNum(reps)) || 0); });

            // The third field means different things for different movements,
            // so it changes rather than offering a number that cannot apply.
            // A percentage of your top set is meaningless on a chin-up; what
            // you want there is the weight hanging off the belt.
            const third = el('div');
            const drawThird = () => {
              const lift = MAIN_LIFTS[it.ex];
              const unit = store.get().settings.units;
              third.replaceChildren();

              if (lift && lift.bodyweight) {
                delete it.pctOfWorking; delete it.light;
                const add = numInput({
                  value: it.startWeight != null ? num(toDisplayWeight(it.startWeight, unit)) : '',
                  placeholder: '0',
                });
                add.addEventListener('change', () => {
                  const v = parseNum(add);
                  if (Number.isNaN(v)) delete it.startWeight;
                  else it.startWeight = fromDisplayWeight(Math.max(0, v), unit);
                });
                third.append(el('label', {}, `+${unit} start`), add);
              } else if (lift) {
                delete it.startWeight;
                const pct = numInput({
                  value: it.pctOfWorking ? String(Math.round(it.pctOfWorking * 100)) : '',
                  placeholder: '100',
                });
                pct.addEventListener('change', () => {
                  const v = parseNum(pct);
                  if (Number.isNaN(v) || v >= 100) { delete it.pctOfWorking; delete it.light; }
                  else { it.pctOfWorking = v / 100; it.light = v < 90; }
                });
                third.append(el('label', {}, '% of top'), pct);
              } else {
                // Accessory work has no progression, so the programme simply
                // states the weight.
                delete it.pctOfWorking; delete it.light; delete it.startWeight;
                const w = numInput({
                  value: it.weight != null ? num(toDisplayWeight(it.weight, unit)) : '',
                  placeholder: unit,
                });
                w.addEventListener('change', () => {
                  const v = parseNum(w);
                  if (Number.isNaN(v)) delete it.weight;
                  else it.weight = fromDisplayWeight(Math.max(0, v), unit);
                });
                third.append(el('label', {}, `Weight ${unit}`), w);
              }
            };
            drawThird();

            // Each lift names its own training logic. Accessories have none,
            // so the selector only exists for main lifts.
            const progWrap = el('div', { style: { marginTop: '8px' } });
            const drawProg = () => {
              progWrap.replaceChildren();
              if (!MAIN_LIFTS[it.ex]) { delete it.progression; return; }
              const sel = el('select', {},
                el('option', { value: 'session' }, 'Linear — every session (Starting Strength)'),
                el('option', { value: 'weekly' }, 'Linear — weekly (Texas cadence)'),
                el('option', { value: 'manual' }, 'Manual — the app never moves it'));
              sel.value = it.progression || 'session';
              sel.addEventListener('change', () => {
                if (sel.value === 'session') delete it.progression;
                else it.progression = sel.value;
              });
              progWrap.append(el('label', {}, 'Progression'), sel);
            };
            drawProg();

            pick.addEventListener('change', () => {
              it.ex = pick.value;
              // Swapping a squat for a chin-up must swap the field with it.
              drawThird();
              drawProg();
            });

            items.append(el('div', { class: 'card tight', style: { marginBottom: '0' } },
              el('div', { class: 'row', style: { gap: '8px', marginBottom: '8px' } },
                el('div', { class: 'grow' }, pick),
                el('button', { class: 'btn-sm btn-ghost', 'aria-label': 'Remove exercise',
                  onclick: () => { day.items.splice(ii, 1); drawItems(); } }, '✕')),
              el('div', { class: 'grid3' },
                el('div', {}, el('label', {}, 'Sets'), sets),
                el('div', {}, el('label', {}, 'Reps'), reps),
                third),
              progWrap));
          });
        };
        drawItems();

        daysBox.append(el('div', { class: 'card' },
          el('div', { class: 'row', style: { gap: '8px', marginBottom: '10px' } },
            el('div', { class: 'grow' }, label),
            di > 0 && el('button', { class: 'btn-sm btn-ghost', 'aria-label': 'Move up',
              onclick: () => { [rotation[di - 1], rotation[di]] = [rotation[di], rotation[di - 1]]; drawDays(); } }, '↑'),
            el('button', { class: 'btn-sm btn-ghost', 'aria-label': 'Remove day',
              onclick: () => { rotation.splice(di, 1); drawDays(); } }, '✕')),
          items,
          el('div', { class: 'btn-row', style: { marginTop: '9px' } },
            el('button', { class: 'btn-sm', onclick: () => {
              day.items.push(newProgramItem('squat', 3, 5));
              drawItems();
            } }, '+ Exercise'),
            el('button', { class: 'btn-sm', onclick: () => {
              day.items.push({ conditioningId: 'box-bag-int', rounds: 12, minutes: 3, restSec: 60 });
              drawItems();
            } }, '+ Conditioning'))));
      });
    };
    drawDays();

    body.append(
      el('div', { class: 'field' }, el('label', {}, 'Programme name'), name),
      el('div', { class: 'field' }, el('label', {}, 'Frequency'), frequency),
      el('div', { class: 'field' }, el('label', {}, 'Notes'), blurb),

      el('h3', {}, 'Training days'),
      el('div', { class: 'note' },
        'The app cycles through these in order, one per session. The last column changes with the movement: '
        + 'a loaded lift takes a percentage of your top set — blank for a normal working weight, 80 for a light day, 90 for a volume day, and anything under 90 is treated as light and does not drive the progression. '
        + 'A chin-up or dip takes the weight added to your bodyweight instead, which only seeds the lift the first time — after that the progression owns it. '
        + 'Accessory work has no progression, so its number is simply the weight prescribed every session.'),
      daysBox,
      el('button', { class: 'btn-block', style: { marginTop: '10px' }, onclick: () => {
        rotation.push(newProgramDay(`Day ${rotation.length + 1}`));
        drawDays();
      } }, '+ Training day')
    );

    const problems = el('div');
    body.append(problems);

    body.append(el('button', { class: 'btn-primary btn-block', style: { marginTop: '14px' }, onclick: () => {
      prog.name = name.value.trim();
      prog.frequency = frequency.value.trim() || 'Your own schedule';
      prog.blurb = blurb.value.trim() || 'A programme you built.';
      prog.id = prog.id || `p-${uid()}`;
      prog.source = 'Your own';
      prog.custom = true;
      prog.phases[1].rotation = rotation;

      const errs = validateProgram(prog);
      problems.replaceChildren();
      if (errs.length) {
        problems.append(el('div', { class: 'note bad' },
          el('b', {}, 'Not ready yet: '), errs.join(' ')));
        return;
      }

      store.update((d) => {
        const i = d.customPrograms.findIndex((x) => x.id === prog.id);
        if (i >= 0) d.customPrograms[i] = prog;
        else d.customPrograms.push(prog);
        // Editing the running programme can shorten the rotation under the
        // cursor, so keep the cursor inside it.
        if (d.program.id === prog.id) {
          d.program.cursor = d.program.cursor % prog.phases[1].rotation.length;
        }
      });
      syncCustom();
      close();
      toast(existing ? 'Programme saved' : `${prog.name} created`, 'good');

      const wasRunning = fork && copyFromId && store.get().program.id === copyFromId;
      if (wasRunning) {
        // You were running the programme you just edited — switch to the copy,
        // keeping your place in the rotation so the edit does not cost you a day.
        store.update((d) => {
          const cursor = d.program.cursor;
          d.program.id = prog.id;
          d.program.phase = 1;
          d.program.cursor = cursor % prog.phases[1].rotation.length;
        });
        toast(`Now running your version of ${prog.name}`, 'good');
        ctx.refresh();
      } else if (!existing) {
        sheet('Use it now?', (b2, close2) => {
          b2.append(
            el('p', { class: 'sub' }, `${prog.name} is saved. Switch to it now, or keep running ${PROGRAMS[store.get().program.id]?.name}.`),
            el('div', { class: 'btn-row' },
              el('button', { class: 'btn-ghost', onclick: () => { close2(); ctx.refresh(); } }, 'Later'),
              el('button', { class: 'btn-primary', onclick: () => {
                store.update((d) => {
                  d.program.id = prog.id; d.program.phase = 1; d.program.cursor = 0;
                });
                close2(); toast(`Now running ${prog.name}`, 'good'); ctx.refresh();
              } }, 'Switch to it')));
        });
      } else {
        ctx.refresh();
      }
    } }, existing ? 'Save programme' : 'Create programme'));

    if (existing) {
      body.append(el('button', { class: 'btn-danger btn-block', style: { marginTop: '10px' }, onclick: async () => {
        const ok = await confirmSheet('Delete programme?',
          `"${existing.name}" is removed. Your logged sessions and working weights are kept.`, 'Delete');
        if (!ok) return;
        store.update((d) => {
          d.customPrograms = d.customPrograms.filter((x) => x.id !== existing.id);
          if (d.program.id === existing.id) {
            d.program.id = 'ss-novice'; d.program.cursor = 0; d.program.phase = 1;
          }
        });
        syncCustom();
        close(); toast('Deleted'); ctx.refresh();
      } }, 'Delete programme'));
    }
  });
}

/** A rounds-and-minutes slot inside a programme day. */
function conditioningRow(it, onRemove) {
  const pick = el('select', {});
  for (const sport of [...new Set(CONDITIONING.map((c) => c.sport))]) {
    const og = el('optgroup', { label: sport });
    for (const c of CONDITIONING.filter((x) => x.sport === sport)) {
      og.append(el('option', { value: c.id }, c.name));
    }
    pick.append(og);
  }
  pick.value = it.conditioningId;
  pick.addEventListener('change', () => { it.conditioningId = pick.value; });

  const rounds = numInput({ decimal: false, value: String(it.rounds ?? 12) });
  rounds.addEventListener('change', () => { it.rounds = Math.max(1, Math.round(parseNum(rounds)) || 1); });

  const minutes = numInput({ decimal: false, value: String(it.minutes ?? 3) });
  minutes.addEventListener('change', () => { it.minutes = Math.max(1, Math.round(parseNum(minutes)) || 1); });

  const rest = numInput({ decimal: false, value: String(it.restSec ?? 60) });
  rest.addEventListener('change', () => { it.restSec = Math.max(0, Math.round(parseNum(rest)) || 0); });

  return el('div', { class: 'card tight', style: { marginBottom: '0' } },
    el('div', { class: 'row', style: { gap: '8px', marginBottom: '8px' } },
      el('div', { class: 'grow' }, pick),
      el('span', { class: 'pill info' }, 'rounds'),
      el('button', { class: 'btn-sm btn-ghost', 'aria-label': 'Remove', onclick: onRemove }, '✕')),
    el('div', { class: 'grid3' },
      el('div', {}, el('label', {}, 'Rounds'), rounds),
      el('div', {}, el('label', {}, 'Minutes'), minutes),
      el('div', {}, el('label', {}, 'Rest s'), rest)));
}

/** A <select> of every movement, grouped, for programme building. */
function movementSelect(selected) {
  const sel = el('select', {});
  const groups = {};
  for (const m of allMovements()) {
    (groups[m.group] ||= []).push(m);
  }
  // Your own first — if you defined it, you probably want it.
  const order = Object.keys(groups).sort((a, b) => {
    const mine = (g) => (g.startsWith('Your') ? 0 : g === 'Main lifts' ? 1 : 2);
    return mine(a) - mine(b) || a.localeCompare(b);
  });
  for (const g of order) {
    const og = el('optgroup', { label: g });
    for (const m of groups[g]) og.append(el('option', { value: m.id }, m.name));
    sel.append(og);
  }
  if (selected && findExercise(selected)) sel.value = selected;
  else if (sel.options.length) sel.selectedIndex = 0;
  void exerciseName;
  return sel;
}
