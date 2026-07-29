// Settings, data export/import, and the honest notes about what this is.

import { el, num, download, toast, toDisplayWeight, fromDisplayWeight, fmtDateLong, numInput, parseNum } from '../util.js';
import * as store from '../store.js';
import { PROGRAMS, programLifts, incrementFor } from '../programs.js';
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
      'How much the app adds after a successful session. The defaults follow the book: bigger jumps on the deadlift, smaller on the press, and everything drops to the smaller jump after your first reset. Override them if your plates or your progress say otherwise.'));
    for (const id of programLifts(db)) {
      const lift = MAIN_LIFTS[id];
      const cur = incrementFor(db.program, id);
      const inp = numInput({ value: num(toDisplayWeight(cur, unit)) });
      inputs[id] = inp;
      body.append(el('div', { class: 'field' },
        el('label', {}, `${lift.name} (${unit}) — default ${num(toDisplayWeight(lift.increment, unit))}, ${num(toDisplayWeight(lift.lateIncrement, unit))} after a reset`),
        inp));
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
