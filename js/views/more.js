// Settings, data export/import, and the honest notes about what this is.

import { el, num, download, toast, toDisplayWeight, fromDisplayWeight, fmtDateLong, numInput, parseNum } from '../util.js';
import * as store from '../store.js';
import { PROGRAMS, programLifts, incrementFor, explainOffer, isLoadable } from '../programs.js';
import { MAIN_LIFTS } from '../data/exercises.js';
import { support } from '../sensors.js';
import { sheet, confirmSheet, checkForUpdate, applyUpdate } from '../app.js';
import { BUILD, BUILT } from '../version.js';
import * as media from '../media.js';
import { openProgramManager, openExerciseManager } from './build.js';

export function renderMore(view, ctx) {
  const db = store.get();
  const s = db.settings;

  view.append(el('h1', {}, 'More'));

  // ---- data ----
  view.append(el('h2', {}, 'Data'));
  view.append(el('div', { class: 'card' },
    el('p', { class: 'sub' },
      `Everything lives in this browser on this device. ${db.sessions.length} sessions, ${db.metrics.entries.length} health readings, ${db.lab.results.length} test results, ${db.nutrition.log.length} food entries.`),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn-primary', onclick: () => {
        download(store.exportFilename(), store.exportJSON());
        toast('Exported', 'good');
      } }, 'Export'),
      el('button', { onclick: () => openImport(ctx) }, 'Import')),
    el('button', { class: 'btn-sm btn-block', style: { marginTop: '8px' },
      onclick: () => openDiagnose(ctx) }, 'Why is it showing this weight?'),
    el('div', { class: 'note' },
      el('b', {}, 'How to sync phone and Mac: '),
      'Export on the device you just used, save the file into Dropbox or iCloud Drive, then Import it on the other device and choose Merge. Merge de-duplicates by record id, so importing the same file twice changes nothing.'),
    mediaRow(),
    el('div', { class: 'note warn' },
      el('b', {}, 'Clearing your browser data deletes this. '),
      'Safari on iOS will also evict site storage on its own if the app goes unused for several weeks. Export regularly — it is the only backup that exists.')
  ));

  // ---- programme ----
  const prog = PROGRAMS[db.program.id] || PROGRAMS['ss-novice'];
  const days = prog.phases[db.program.phase]?.rotation || prog.phases[1].rotation;

  view.append(el('h2', {}, 'Programme'));
  view.append(el('div', { class: 'card' },
    el('div', { class: 'row between' },
      el('div', { class: 'grow' },
        el('div', { class: 'li-title', style: { fontSize: '16px' } }, prog.name),
        el('div', { class: 'li-sub' }, `${prog.source} · ${prog.frequency}`)),
      prog.custom && el('span', { class: 'pill' }, 'yours')),
    el('div', { class: 'note' }, prog.blurb),
    el('div', { class: 'li-sub', style: { marginBottom: '10px' } },
      `${days.length} day rotation: ${days.map((d) => d.label).join(' → ')}`),
    el('div', { class: 'btn-row' },
      el('button', { class: 'btn-primary btn-sm', onclick: () => openProgramManager(ctx) }, 'Programmes'),
      el('button', { class: 'btn-sm', onclick: () => openExerciseManager(ctx) }, 'Exercises')),
    el('div', { class: 'btn-row', style: { marginTop: '8px' } },
      el('button', { class: 'btn-sm', onclick: () => openWorkingWeights(ctx, db) }, 'Working weights'),
      el('button', { class: 'btn-sm', onclick: () => openIncrements(ctx, db) }, 'Increments'))
  ));

  // ---- units and bar ----
  view.append(el('h2', {}, 'Bar & units'));
  const unitSel = el('select', {}, el('option', { value: 'kg' }, 'Kilograms'), el('option', { value: 'lb' }, 'Pounds'));
  unitSel.value = s.units;
  unitSel.addEventListener('change', () => {
    store.update((d) => { d.settings.units = unitSel.value; });
    toast(`Displaying ${unitSel.value}`); ctx.refresh();
  });

  const barInp = numInput({ value: num(toDisplayWeight(s.barWeight, s.units)) });
  barInp.addEventListener('change', () => {
    const v = parseNum(barInp);
    if (v > 0) { store.update((d) => { d.settings.barWeight = fromDisplayWeight(v, s.units); }); toast('Bar weight saved'); }
  });

  const platesInp = el('input', { value: s.plates.map((p) => num(toDisplayWeight(p, s.units))).join(', ') });
  platesInp.addEventListener('change', () => {
    // Split on commas or whitespace: a comma list is ambiguous in a locale
    // that also uses the comma as a decimal separator, so accept "25 20 15".
    const list = platesInp.value.split(/[,;\s]+/).map((x) => parseNum(x)).filter((x) => x > 0);
    if (!list.length) { toast('Need at least one plate size', 'bad'); return; }
    store.update((d) => { d.settings.plates = list.map((p) => fromDisplayWeight(p, s.units)).sort((a, b) => b - a); });
    toast('Plates saved', 'good'); ctx.refresh();
  });

  view.append(el('div', { class: 'card' },
    el('div', { class: 'field' }, el('label', {}, 'Units'), unitSel),
    el('div', { class: 'field' }, el('label', {}, `Bar weight (${s.units})`), barInp),
    el('div', { class: 'field' }, el('label', {}, `Plates available (${s.units}, comma separated)`), platesInp),
    el('div', { class: 'note' },
      'These drive the plate calculator and the rounding of every prescribed weight. The smallest pair of plates sets the smallest jump the app will ever ask you to make — if you only have 2.5 kg plates, it will never prescribe a 1.25 kg increase you cannot load.')
  ));

  // ---- session behaviour ----
  view.append(el('h2', {}, 'During a session'));
  const restCard = el('div', { class: 'card' });
  for (const [key, label, help] of [
    ['main', 'Main lifts', 'Rippetoe\'s guidance is to rest until you are ready, which for a novice is around three minutes and for anyone at a real weight is five or more.'],
    ['assistance', 'Assistance', ''],
  ]) {
    const i = numInput({ decimal: false, value: String(s.restSec[key]) });
    i.addEventListener('change', () => {
      const v = Math.round(parseNum(i));
      if (v > 0) { store.update((d) => { d.settings.restSec[key] = v; }); toast('Rest updated'); }
    });
    restCard.append(el('div', { class: 'field' }, el('label', {}, `${label} rest (seconds)`), i), help ? el('p', { class: 'sub' }, help) : null);
  }
  restCard.append(
    toggle('Start the rest clock automatically', s.autoRest, (v) => store.update((d) => { d.settings.autoRest = v; })),
    toggle('Keep the screen awake during a session', s.keepAwake, (v) => store.update((d) => { d.settings.keepAwake = v; })),
    toggle('Beep when rest is up', s.soundOnRestEnd, (v) => store.update((d) => { d.settings.soundOnRestEnd = v; }))
  );
  view.append(restCard);

  // ---- install / capability ----
  view.append(el('h2', {}, 'This device'));
  view.append(el('div', { class: 'card' },
    capRow('Motion sensors', support.motion, support.motion ? 'Jump, balance and angle tests available' : 'No accelerometer — manual entry only'),
    capRow('Secure context', support.secure, support.secure ? 'https or localhost' : 'Sensors and offline mode need https://'),
    capRow('Screen wake lock', support.wakeLock, support.wakeLock ? 'Screen stays on during sessions' : 'Screen may sleep mid-session'),
    capRow('Offline', 'serviceWorker' in navigator && !!navigator.serviceWorker.controller,
      navigator.serviceWorker?.controller ? 'Cached and ready to run with no signal' : 'Not cached yet — open once while online'),
    capRow('Version', true, `Build ${BUILD}, ${BUILT}`),
    updateRow(ctx),
    el('div', { class: 'note' },
      el('b', {}, 'To install: '),
      'On iPhone, open in Safari, tap Share, then Add to Home Screen. On the Mac in Safari, File → Add to Dock; in Chrome, the install icon in the address bar. Installed, it runs fullscreen with no browser chrome and works with no signal.'),
    el('div', { class: 'note warn' },
      el('b', {}, 'Installed apps have no pull-to-refresh. '),
      'That gesture only exists in the browser. This app checks for a new build every time you bring it to the front and shows a banner when one is ready, and the button above forces a check. If in doubt, compare the build number here against the one you were told to expect.')
  ));

  // ---- honesty ----
  view.append(el('h2', {}, 'What this app is'));
  view.append(
    el('div', { class: 'note' },
      el('b', {}, 'The programming is Starting Strength. '),
      'The novice linear progression and the Texas Method are implemented as described in Starting Strength: Basic Barbell Training and Practical Programming for Strength Training, by Mark Rippetoe. This app is not affiliated with or endorsed by him. Buy the books — a 200-line progression engine is not a substitute for the coaching in them, particularly on technique.'),
    el('div', { class: 'note' },
      el('b', {}, 'The recipes are original. '),
      'They use the high-volume, low-calorie-density method that Greg Doucette popularised — egg-white batters, protein powder for flour, cauliflower and konjac for rice and pasta, fat-free dairy, powdered peanut butter, air fryer, mug-cake microwave technique. Techniques are not owned by anyone. The dishes, ratios and wording here are not copied from his book or anyone else\'s. If you want his recipes, buy his book.'),
    el('div', { class: 'note warn' },
      el('b', {}, 'The Movement Lab is a phone, not a lab. '),
      'Jump height comes from flight time and is good to about ±2 cm. Sway metrics are relative only. Joint angles use the phone as a gravity inclinometer and are good to about 2–3°. There is no camera-based 3D pose estimation, because monocular pose from a phone camera has an error larger than the differences you would be trying to detect. Systems like VALD\'s HumanTrak use calibrated depth cameras and cost more than a car; nothing in a browser replaces one.'),
    el('div', { class: 'note bad' },
      el('b', {}, 'Not medical advice. '),
      'Nothing here diagnoses anything. If something hurts in a way that training does not explain, see someone qualified.')
  );

  view.append(el('button', { class: 'btn-danger btn-block', style: { marginTop: '18px' }, onclick: async () => {
    const ok = await confirmSheet('Erase everything?',
      'Every session, measurement, test result and food entry on this device will be deleted. Export first if you want any of it. This cannot be undone.', 'Erase everything');
    if (!ok) return;
    store.wipe(); toast('Erased'); ctx.go('train');
  } }, 'Erase all data'));

  view.append(el('p', { class: 'sub', style: { textAlign: 'center', marginTop: '20px' } },
    `IronLog · data created ${fmtDateLong(db.createdAt.slice(0, 10))}`));
}

/**
 * Where every prescribed weight comes from.
 * Turns "it is not carrying over" into a specific, checkable answer.
 */
function openDiagnose(ctx) {
  sheet('Where the weights come from', (body) => {
    const db = store.get();
    const unit = db.settings.units;
    const lifts = programLifts(db);

    const liftSessions = db.sessions.filter((s) => s.type === 'lift' || s.type === 'free');
    const withSets = liftSessions.filter((s) =>
      (s.entries || []).some((e) => (e.sets || []).length));

    body.append(el('div', { class: 'stat-grid' },
      st(db.sessions.length, 'Sessions'),
      st(withSets.length, 'With sets', withSets.length ? null : 'warn'),
      st(Object.keys(db.program.working).length, 'Weights set')));

    if (liftSessions.length && !withSets.length) {
      body.append(el('div', { class: 'note bad' },
        el('b', {}, 'Your sessions contain no sets. '),
        'They were finished without any set being ticked, and on a build before v9 those were discarded silently. '
        + 'That is why nothing carries forward — there is nothing in the log to carry. From v9 the app asks before dropping anything.'));
    }
    if (!db.sessions.length) {
      body.append(el('div', { class: 'note warn' },
        el('b', {}, 'Nothing is logged on this device at all. '),
        'If you trained on another device, import its export file first — training data does not travel by itself.'));
    }

    for (const id of lifts) {
      const x = explainOffer(db, id);
      body.append(el('div', { class: 'card tight' },
        el('div', { class: 'row between' },
          el('div', { class: 'grow' },
            el('div', { class: 'li-title' }, x.name),
            el('div', { class: 'li-sub' }, `Source: ${x.source} · logged ${x.sessions}×`)),
          el('div', { class: 'li-right', style: { fontSize: '15px', color: 'var(--text)' } },
            x.offered != null ? `${num(toDisplayWeight(x.offered, unit))} ${unit}` : '–')),
        el('div', { class: 'li-sub', style: { marginTop: '6px' } }, x.detail),
        x.working != null && x.last && Math.abs(x.working - x.last.weight) > 0.01
          && el('button', { class: 'btn-sm btn-block', style: { marginTop: '8px' }, onclick: () => {
            store.update((d) => { delete d.program.working[id]; });
            toast(`${x.name} now follows your log`, 'good');
            ctx.refresh();
          } }, `Use my logged ${num(toDisplayWeight(x.last.weight, unit))} ${unit} instead`)));
    }

    body.append(el('div', { class: 'note' },
      'A stored working weight always wins over your history, because it is the programme\'s own state — that is what lets you deload by hand. '
      + 'If one has drifted from what you are actually lifting, the button on it will drop it and let the log take over.'));
  });
}

/** Media lives in IndexedDB, not in the export file — say so, and show the size. */
function mediaRow() {
  const node = el('div', { class: 'note' }, 'Checking attached media…');
  media.totalSize().then(async (bytes) => {
    const all = await media.listAll();
    node.replaceChildren(
      el('b', {}, `${all.length} attachment${all.length === 1 ? '' : 's'}, ${media.fmtBytes(bytes)}. `),
      'Video and audio are stored separately from the training log, because they are far too large for the export file. Your comments and the record of what was attached do travel; the files themselves stay on this device.');
    if (all.length) {
      node.append(el('button', { class: 'btn-sm btn-block', style: { marginTop: '10px' }, onclick: async () => {
        const res = await media.prune(store.get());
        toast(res.removed
          ? `Removed ${res.removed} orphaned file${res.removed === 1 ? '' : 's'}, freed ${media.fmtBytes(res.freed)}`
          : 'Nothing orphaned', 'good');
      } }, 'Clean up orphaned files'));
    }
  }).catch(() => { node.textContent = 'Media storage is unavailable in this browser.'; });
  return node;
}

/** Force an update check, since an installed app cannot be pulled to refresh. */
function updateRow(ctx) {
  const btn = el('button', { class: 'btn-sm btn-block', style: { marginTop: '10px' } }, 'Check for updates');
  const status = el('div', { class: 'li-sub', style: { marginTop: '6px' } }, '');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    status.textContent = 'Checking…';
    const found = await checkForUpdate();
    btn.disabled = false;
    if (found) {
      status.replaceChildren(
        el('span', {}, 'A newer build is ready. '),
        el('button', { class: 'btn-sm', onclick: applyUpdate }, 'Reload now'));
    } else {
      status.textContent = navigator.onLine
        ? `You are on the latest build (${BUILD}).`
        : 'Offline — cannot check right now.';
    }
    void ctx;
  });
  return el('div', {}, btn, status);
}

const st = (v, l, kind) => el('div', { class: `stat ${kind || ''}` },
  el('div', { class: 'stat-val' }, String(v)),
  el('div', { class: 'stat-lbl' }, l));

function toggle(label, value, onChange) {
  const btn = el('button', { class: 'chip', 'aria-pressed': String(!!value) }, value ? 'On' : 'Off');
  btn.addEventListener('click', () => {
    const next = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(next));
    btn.textContent = next ? 'On' : 'Off';
    onChange(next);
  });
  return el('div', { class: 'row between', style: { padding: '8px 0' } },
    el('span', { style: { fontSize: '14px' } }, label), btn);
}

function capRow(label, ok, detail) {
  return el('div', { class: 'row between', style: { padding: '7px 0', borderBottom: '1px solid var(--line)' } },
    el('div', { class: 'grow' },
      el('div', { style: { fontSize: '14px', fontWeight: '600' } }, label),
      el('div', { class: 'li-sub' }, detail)),
    el('span', { class: `pill ${ok ? 'good' : 'warn'}` }, ok ? 'yes' : 'no'));
}

function openWorkingWeights(ctx, db) {
  sheet('Working weights', (body, close) => {
    const unit = db.settings.units;
    const inputs = {};
    body.append(el('p', { class: 'sub' },
      'The weight the next session will prescribe for each lift. Editing here is a manual override — use it after time off, or when the app has drifted from reality.'));
    for (const id of programLifts(db)) {
      const w = db.program.working[id] ?? 0;
      const fails = db.program.fails[id] || 0;
      const resets = db.program.fails[`${id}.resets`] || 0;
      const inp = numInput({ value: num(toDisplayWeight(w, unit)) });
      inputs[id] = inp;
      body.append(el('div', { class: 'field' },
        el('label', {}, `${MAIN_LIFTS[id].name} (${unit})${fails ? ` — ${fails} consecutive miss${fails === 1 ? '' : 'es'}` : ''}${resets ? `, ${resets} reset${resets === 1 ? '' : 's'}` : ''}`),
        inp));
    }
    body.append(el('button', { class: 'btn-primary btn-block', onclick: () => {
      store.update((d) => {
        for (const [id, inp] of Object.entries(inputs)) {
          const v = parseNum(inp);
          if (!Number.isNaN(v) && v >= 0) { d.program.working[id] = fromDisplayWeight(v, unit); d.program.fails[id] = 0; }
        }
      });
      close(); toast('Saved', 'good'); ctx.refresh();
    } }, 'Save'));
  });
}

function openIncrements(ctx, db) {
  sheet('Increments', (body, close) => {
    const unit = db.settings.units;
    const inputs = {};
    body.append(el('div', { class: 'note' },
      'How much the app adds after a successful session. The defaults follow the book: bigger jumps on the deadlift, smaller on the press, and everything drops to the smaller jump after your first reset. Override them if your plates or your progress say otherwise.'),
      el('div', { class: 'note warn' },
        el('b', {}, 'Micro-loading. '),
        'A barbell jump is split across two sides. With the 0.75 kg fractional plates the smallest '
        + 'jump a bar can make is 1.5 kg; a chin-up or dip belt takes a single plate, so 0.75 kg works there. '
        + 'Nothing is silently rounded away either way.'));
    // Common jumps, including micro-loading. Typing any other number works too.
    const PICKS = [0.75, 1.5, 2.5, 5];

    for (const id of programLifts(db)) {
      const lift = MAIN_LIFTS[id];
      const cur = incrementFor(db.program, id);
      const inp = numInput({ value: num(toDisplayWeight(cur, unit)) });
      inputs[id] = inp;

      const warn = el('div', { class: 'li-sub' });
      const checkLoadable = () => {
        const v = fromDisplayWeight(parseNum(inp), unit);
        warn.replaceChildren();
        if (Number.isNaN(v) || v <= 0) return;
        if (lift.bodyweight) {
          warn.append('Added weight hangs off a belt, so any increment you own works.');
          return;
        }
        // A barbell needs the jump split across two sides, and "loadable"
        // means the plate solver can build that side from the plates owned —
        // divisibility by the smallest plate is the wrong test: a 2.5 kg jump
        // is one 1.25 plate per side even though 1.25 / 0.75 is not whole.
        const perSide = v / 2;
        const ok = isLoadable(db.settings.barWeight + v, db.settings);
        warn.append(ok
          ? `Needs ${num(toDisplayWeight(perSide, unit))} ${unit} per side — you have that.`
          : `Needs ${num(toDisplayWeight(perSide, unit))} ${unit} per side, which your plates cannot make. `
            + 'The app will still use it, and the plate line will say what it cannot load.');
        warn.style.color = ok ? 'var(--muted)' : 'var(--warn)';
      };
      inp.addEventListener('change', checkLoadable);

      const picks = el('div', { class: 'chips', style: { marginTop: '6px' } },
        PICKS.map((v) => {
          const b = el('button', { class: 'chip' }, `${num(toDisplayWeight(v, unit))}`);
          b.addEventListener('click', () => {
            inp.value = num(toDisplayWeight(v, unit));
            checkLoadable();
          });
          return b;
        }));

      body.append(el('div', { class: 'field' },
        el('label', {}, `${lift.name} (${unit}) — default ${num(toDisplayWeight(lift.increment, unit))}, ${num(toDisplayWeight(lift.lateIncrement, unit))} after a reset`),
        inp, picks, warn));
      checkLoadable();
    }
    body.append(el('button', { class: 'btn-primary btn-block', onclick: () => {
      store.update((d) => {
        for (const [id, inp] of Object.entries(inputs)) {
          const v = parseNum(inp);
          if (!Number.isNaN(v) && v > 0) d.program.increments[id] = fromDisplayWeight(v, unit);
        }
      });
      close(); toast('Saved', 'good');
    } }, 'Save'));
  });
}

function openImport(ctx) {
  sheet('Import data', (body, close) => {
    const file = el('input', { type: 'file', accept: 'application/json,.json' });
    let mode = 'merge';
    const modeChips = el('div', { class: 'chips' },
      [['merge', 'Merge'], ['replace', 'Replace everything']].map(([m, lbl]) => {
        const c = el('button', { class: 'chip', 'aria-pressed': String(mode === m) }, lbl);
        c.addEventListener('click', () => {
          mode = m;
          [...modeChips.children].forEach((x, i) => x.setAttribute('aria-pressed', String(['merge', 'replace'][i] === m)));
        });
        return c;
      }));

    body.append(
      el('div', { class: 'field' }, el('label', {}, 'Export file'), file),
      el('div', { class: 'field' }, el('label', {}, 'Mode'), modeChips),
      el('div', { class: 'note' },
        el('b', {}, 'Merge '), 'keeps everything on both sides and de-duplicates by record id, so importing the same file twice is harmless. ',
        el('b', {}, 'Replace '), 'discards everything currently on this device first.'),
      el('button', { class: 'btn-primary btn-block', onclick: async () => {
        const f = file.files?.[0];
        if (!f) { toast('Choose a file', 'bad'); return; }
        if (mode === 'replace') {
          const ok = await confirmSheet('Replace all data?',
            'Everything currently on this device will be discarded and replaced by the contents of the file.', 'Replace');
          if (!ok) return;
        }
        try {
          const text = await f.text();
          const res = store.importJSON(text, { mode });
          close(); toast(`Imported — ${res.sessions} sessions`, 'good'); ctx.refresh();
        } catch (err) {
          toast(`Could not read that file: ${err.message}`, 'bad');
        }
      } }, 'Import')
    );
  });
}
