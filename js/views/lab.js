// Movement Lab — run tests, record results, look at asymmetry and trend.

import { el, uid, num, todayISO, fmtClock, lineChart, toast, buzz, numInput, parseNum } from '../util.js';
import * as store from '../store.js';
import {
  BUILTIN_TESTS, TEST_CATEGORIES, TEST_MODES, allTests, findTest, newCustomTest,
  resultsFor, personalBest, asymmetry, ASYMMETRY_NOTE, series, derived,
} from '../movement.js';
import {
  support, requestMotion, motionPermission, MotionRecorder, Inclinometer,
  analyseJump, analyseSway,
} from '../sensors.js';
import { sheet, confirmSheet } from '../app.js';

let cat = TEST_CATEGORIES[0];

export function renderLab(view, ctx) {
  const db = store.get();

  ctx.slot.append(el('button', { class: 'btn-sm btn-ghost', onclick: () => openBuilder(ctx, db) }, '+ Test'));

  view.append(
    el('h1', {}, 'Movement Lab'),
    el('p', { class: 'sub' }, 'Jump, balance and range-of-motion testing using the sensors in this phone, plus manual entry for everything that cannot honestly be measured that way.')
  );

  // Say up front what the instrument is. Anything else would be dishonest.
  view.append(
    el('details', { class: 'cues' },
      el('summary', {}, 'What this can and cannot measure'),
      el('div', { class: 'note' },
        el('b', {}, 'This is a phone accelerometer, not a force plate or a motion-capture rig. '),
        'Three things are genuinely measurable and are what the app implements: '
        + 'flight time, which gives jump height to about ±2 cm; postural sway, which is valid for comparing you to yourself and left to right but has no absolute meaning; '
        + 'and joint angle via gravity, which is the same physical principle as a clinical inclinometer and is accurate to roughly 2–3°. '
        + 'Camera-based 3D pose estimation is deliberately not included — monocular pose from a phone camera would produce joint angles with error far larger than the differences you are trying to detect, and dressing that up as motion capture would be worse than not having it.')
    )
  );

  if (!support.motion) {
    view.append(el('div', { class: 'note bad' },
      el('b', {}, 'No motion sensors on this device. '),
      'Sensor tests will not run here — this is normal on a desktop. Manual-entry tests work everywhere, and results sync to this device via export/import.'));
  } else if (!support.secure) {
    view.append(el('div', { class: 'note warn' },
      el('b', {}, 'Motion sensors need a secure context. '),
      'Serve the app over https:// or from localhost and they will work.'));
  } else if (motionPermission() !== 'granted' && support.needsPermission) {
    view.append(el('button', { class: 'btn-primary btn-block', onclick: async () => {
      const res = await requestMotion();
      toast(res.ok ? 'Motion access granted' : res.reason, res.ok ? 'good' : 'bad');
      ctx.refresh();
    } }, 'Enable motion sensors'));
  }

  // Derived cross-test measures.
  const d = derived(db);
  if (d.length) {
    view.append(el('h2', {}, 'Derived'));
    for (const x of d) {
      view.append(el('div', { class: 'card tight' },
        el('div', { class: 'row between' },
          el('div', { class: 'li-title' }, x.label),
          el('span', { class: 'pill accent' }, x.value)),
        el('div', { class: 'li-sub', style: { marginTop: '5px' } }, x.note)));
    }
  }

  // Category chips + test list.
  const chips = el('div', { class: 'chips', style: { margin: '16px 0 12px' } },
    TEST_CATEGORIES.map((c) => {
      const b = el('button', { class: 'chip', 'aria-pressed': String(cat === c) }, c);
      b.addEventListener('click', () => { cat = c; ctx.refresh(); });
      return b;
    }));
  view.append(chips);

  const tests = allTests(db).filter((t) => t.category === cat);
  const list = el('div', { class: 'list' });
  for (const t of tests) {
    const n = resultsFor(db, t.id).length;
    const best = t.metrics[0] ? personalBest(db, t.id, t.metrics[0]) : null;
    list.append(el('button', { class: 'list-item', onclick: () => openTest(ctx, db, t) },
      el('div', { class: 'grow' },
        el('div', { class: 'li-title' },
          t.name,
          t.custom ? el('span', { class: 'pill', style: { marginLeft: '7px' } }, 'custom') : null),
        el('div', { class: 'li-sub' },
          `${TEST_MODES[t.mode].icon} ${TEST_MODES[t.mode].label}${t.sides === 'unilateral' ? ' · left / right' : ''}`),
        n ? el('div', { class: 'li-sub dim' }, `${n} result${n === 1 ? '' : 's'}`) : null),
      best
        ? el('div', { class: 'li-right', style: { color: 'var(--accent)' } }, `${num(best.v, t.metrics[0].dp)} ${t.metrics[0].unit}`)
        : el('span', { class: 'li-right' }, '›')));
  }
  view.append(list);
}

// ---------------------------------------------------------------------------
// Test detail
// ---------------------------------------------------------------------------

function openTest(ctx, db, test) {
  sheet(test.name, (body, close) => {
    body.append(
      el('div', { class: 'row wrap', style: { gap: '6px', marginBottom: '10px' } },
        el('span', { class: 'pill info' }, TEST_MODES[test.mode].label),
        el('span', { class: 'pill' }, test.sides === 'unilateral' ? 'Left / right' : 'Bilateral')),
      test.why && el('div', { class: 'note accent' }, el('b', {}, 'Why it matters: '), test.why),
      test.setup && el('div', {}, el('h3', {}, 'Setup'), el('p', { class: 'sub' }, test.setup)),
      el('h3', {}, 'Protocol'),
      el('ol', { class: 'recipe-steps' }, (test.protocol || []).map((p) => el('li', {}, p)))
    );

    // Asymmetry, when there is something to compare.
    if (test.sides === 'unilateral') {
      const a = asymmetry(db, test, test.metrics[0]);
      if (a) {
        body.append(
          el('h3', {}, 'Asymmetry'),
          el('div', { class: 'card tight' },
            el('div', { class: 'stat-grid' },
              statBox(num(a.left, test.metrics[0].dp), 'Left'),
              statBox(num(a.right, test.metrics[0].dp), 'Right'),
              statBox(`${num(a.lsi, 0)}%`, 'Symmetry', a.flag === 'ok' ? 'good' : a.flag === 'high' ? 'bad' : 'warn')),
            el('div', { class: 'li-sub', style: { marginTop: '8px' } },
              `${ASYMMETRY_NOTE[a.flag]} Weaker side: ${a.worseSide}.`),
            a.stale && el('div', { class: 'note warn', style: { marginBottom: 0 } },
              `The two sides were measured ${Math.round(a.gapDays)} days apart. That gap is training, not asymmetry — retest both sides in one sitting.`))
        );
      }
    }

    // Trend.
    const metric = test.metrics[0];
    if (metric) {
      for (const side of test.sides === 'unilateral' ? ['left', 'right'] : [null]) {
        const pts = series(db, test.id, metric.key, side);
        if (pts.length >= 2) {
          body.append(
            el('h3', {}, `${metric.label}${side ? ` — ${side}` : ''}`),
            lineChart(pts, { unit: metric.unit, goodDirection: metric.better === 'down' ? 'down' : 'up' }));
        }
      }
    }

    // Run.
    body.append(el('div', { class: 'btn-row', style: { marginTop: '14px' } },
      test.sides === 'unilateral'
        ? [
          el('button', { class: 'btn-primary', onclick: () => { close(); runTest(ctx, db, test, 'left'); } }, 'Test left'),
          el('button', { class: 'btn-primary', onclick: () => { close(); runTest(ctx, db, test, 'right'); } }, 'Test right'),
        ]
        : el('button', { class: 'btn-primary', onclick: () => { close(); runTest(ctx, db, test, null); } }, 'Run test')));

    // History.
    const hist = resultsFor(db, test.id).slice(0, 12);
    if (hist.length) {
      body.append(el('h3', { style: { marginTop: '18px' } }, 'History'));
      const list = el('div', { class: 'list' });
      for (const r of hist) {
        list.append(el('div', { class: 'list-item', style: { cursor: 'default' } },
          el('div', { class: 'grow' },
            el('div', { class: 'li-title' }, `${r.date}${r.side ? ` · ${r.side}` : ''}`),
            el('div', { class: 'li-sub' },
              test.metrics.map((m) => `${m.label} ${num(r.metrics[m.key], m.dp)} ${m.unit}`).join(' · ')),
            r.notes && el('div', { class: 'li-sub dim' }, r.notes)),
          el('button', { class: 'btn-sm btn-ghost', onclick: () => {
            store.update((d) => { d.lab.results = d.lab.results.filter((x) => x.id !== r.id); });
            close(); ctx.refresh();
          } }, '✕')));
      }
      body.append(list);
    }

    if (test.custom) {
      body.append(el('button', { class: 'btn-danger btn-block', style: { marginTop: '14px' }, onclick: async () => {
        const ok = await confirmSheet('Delete test?', `Removes "${test.name}" and every result recorded against it.`, 'Delete');
        if (!ok) return;
        store.update((d) => {
          d.lab.customTests = d.lab.customTests.filter((t) => t.id !== test.id);
          d.lab.results = d.lab.results.filter((r) => r.testId !== test.id);
        });
        close(); ctx.refresh();
      } }, 'Delete test'));
    }
  });
}

const statBox = (v, l, kind) => el('div', { class: `stat ${kind || ''}` },
  el('div', { class: 'stat-val' }, String(v)),
  el('div', { class: 'stat-lbl' }, l));

// ---------------------------------------------------------------------------
// Runners
// ---------------------------------------------------------------------------

async function runTest(ctx, db, test, side) {
  if (test.mode !== 'manual') {
    if (!support.motion) { toast('No motion sensors on this device', 'bad'); return openManual(ctx, db, test, side, true); }
    const res = await requestMotion();
    if (!res.ok) { toast(res.reason, 'bad'); return; }
  }
  if (test.mode === 'jump') return runJump(ctx, db, test, side);
  if (test.mode === 'sway') return runSway(ctx, db, test, side);
  if (test.mode === 'incline') return runIncline(ctx, db, test, side);
  return openManual(ctx, db, test, side);
}

function titleFor(test, side) {
  return `${test.name}${side ? ` — ${side}` : ''}`;
}

// ---- jump ----
function runJump(ctx, db, test, side) {
  sheet(titleFor(test, side), (body, close) => {
    const status = el('div', { class: 'big-timer' }, 'Ready');
    const hint = el('p', { class: 'sub', style: { textAlign: 'center' } }, 'Stand still, tap Start, wait for the beep, then jump.');
    const traceBox = el('div');
    const rec = new MotionRecorder({ maxSeconds: 25 });
    let attempts = [];
    let running = false;
    let timer = null;

    const list = el('div', { class: 'list' });
    const redraw = () => {
      list.replaceChildren();
      attempts.forEach((a, i) => {
        list.append(el('div', { class: 'list-item', style: { cursor: 'default' } },
          el('div', { class: 'grow' },
            el('div', { class: 'li-title' }, `Attempt ${i + 1}`),
            el('div', { class: 'li-sub' },
              `flight ${num(a.flightTime, 3)} s${a.contactTimeMs ? ` · contact ${num(a.contactTimeMs, 0)} ms` : ''}${a.rsi ? ` · RSI ${num(a.rsi, 2)}` : ''}`)),
          el('div', { class: 'li-right', style: { fontSize: '17px', color: 'var(--accent)' } },
            `${num(a.heightCm, 1)} cm`)));
      });
      saveBtn.disabled = attempts.length === 0;
    };

    const startBtn = el('button', { class: 'btn-primary btn-block', style: { minHeight: '56px', fontSize: '17px' } }, 'Start');
    const saveBtn = el('button', { class: 'btn-primary btn-block', disabled: true }, 'Save best attempt');

    startBtn.addEventListener('click', () => {
      if (running) {
        finish();
        return;
      }
      running = true;
      attempts = attempts; // keep previous attempts across trials
      rec.start();
      startBtn.textContent = 'Stop & analyse';
      let t = test.durationSec || 12;
      status.textContent = String(t);
      hint.textContent = 'Recording. Stand still for two seconds, then jump.';
      timer = setInterval(() => {
        t -= 1;
        status.textContent = t > 0 ? String(t) : 'Analysing';
        if (t <= 0) finish();
      }, 1000);
    });

    function finish() {
      clearInterval(timer);
      running = false;
      const samples = rec.stop();
      startBtn.textContent = 'Record another attempt';
      const res = analyseJump(samples);
      if (!res.ok) {
        status.textContent = '—';
        hint.textContent = res.reason;
        toast(res.reason, 'bad');
        return;
      }
      buzz([60, 40, 60]);
      attempts.push(res);
      attempts.sort((a, b) => b.heightCm - a.heightCm);
      status.textContent = `${num(res.heightCm, 1)} cm`;
      hint.textContent = `Flight ${num(res.flightTime, 3)} s at ${num(res.hz, 0)} Hz — that sample rate puts the uncertainty at about ±${num(res.heightErrCm, 1)} cm.`;
      traceBox.replaceChildren(drawTrace(res.trace));
      redraw();
    }

    saveBtn.addEventListener('click', () => {
      const best = attempts[0];
      if (!best) return;
      saveResult(db, test, side, {
        heightCm: +best.heightCm.toFixed(1),
        flightTime: +best.flightTime.toFixed(3),
        contactTimeMs: best.contactTimeMs != null ? +best.contactTimeMs.toFixed(0) : null,
        rsi: best.rsi != null ? +best.rsi.toFixed(2) : null,
      }, `Best of ${attempts.length}, ${num(best.hz, 0)} Hz, ±${num(best.heightErrCm, 1)} cm`);
      close(); ctx.refresh();
    });

    body.append(
      el('div', { class: 'note' }, test.setup),
      status, hint, traceBox, startBtn,
      el('div', { style: { height: '10px' } }),
      list, saveBtn,
      el('div', { class: 'note warn' },
        'Jump height is derived from flight time. Tucking your legs on the way down lengthens the flight and inflates the number — land the way you took off.')
    );
  });
}

function drawTrace(trace) {
  if (!trace?.length) return el('div');
  const W = 320, H = 68;
  const t0 = trace[0].t, t1 = trace.at(-1).t;
  const maxM = Math.max(...trace.map((s) => s.m), 12);
  const sx = (t) => ((t - t0) / (t1 - t0 || 1)) * W;
  const sy = (m) => H - (m / maxM) * (H - 4) - 2;
  const path = trace.map((s, i) => `${i ? 'L' : 'M'}${sx(s.t).toFixed(1)},${sy(s.m).toFixed(1)}`).join(' ');
  return el('div', { html:
    `<svg viewBox="0 0 ${W} ${H}" class="trace" preserveAspectRatio="none" role="img" aria-label="Acceleration trace">
       <path d="${path}" class="trace-line"/>
     </svg>
     <div class="chart-tick" style="font-size:11px;color:var(--dim);text-align:center">Acceleration magnitude — the dip to zero is the flight phase</div>` });
}

// ---- sway ----
function runSway(ctx, db, test, side) {
  sheet(titleFor(test, side), (body, close) => {
    const dur = test.durationSec || 30;
    const status = el('div', { class: 'big-timer' }, fmtClock(dur));
    const hint = el('p', { class: 'sub', style: { textAlign: 'center' } }, 'Get into position, tap Start, then hold still.');
    const out = el('div');
    const rec = new MotionRecorder({ maxSeconds: dur + 10 });
    let timer = null;
    let result = null;

    const startBtn = el('button', { class: 'btn-primary btn-block', style: { minHeight: '56px', fontSize: '17px' } }, 'Start');
    const saveBtn = el('button', { class: 'btn-primary btn-block', disabled: true }, 'Save result');

    startBtn.addEventListener('click', () => {
      rec.start();
      startBtn.disabled = true;
      let t = dur;
      status.textContent = fmtClock(t);
      hint.textContent = 'Hold the position. The first second is discarded.';
      buzz(50);
      timer = setInterval(() => {
        t -= 1;
        status.textContent = fmtClock(t);
        if (t <= 0) {
          clearInterval(timer);
          buzz([80, 50, 80]);
          const samples = rec.stop();
          const res = analyseSway(samples);
          startBtn.disabled = false;
          startBtn.textContent = 'Retest';
          if (!res.ok) { hint.textContent = res.reason; toast(res.reason, 'bad'); return; }
          result = res;
          status.textContent = num(res.pathPerSec, 2);
          hint.textContent = `Sway path per second — lower is steadier. ${res.samples} samples at ${num(res.hz, 0)} Hz.`;
          out.replaceChildren(
            el('div', { class: 'stat-grid' },
              statBox(num(res.pathPerSec, 2), 'Path m/s³'),
              statBox(num(res.rmsResultant, 3), 'RMS m/s²'),
              statBox(num(res.ellipseArea, 3), '95 % ellipse')),
            el('div', { class: 'grid2', style: { marginTop: '8px' } },
              statBox(num(res.rmsML, 3), 'RMS side-to-side'),
              statBox(num(res.rmsAP, 3), 'RMS front-back')));
          saveBtn.disabled = false;
        }
      }, 1000);
    });

    saveBtn.addEventListener('click', () => {
      if (!result) return;
      saveResult(db, test, side, {
        pathPerSec: +result.pathPerSec.toFixed(3),
        rmsResultant: +result.rmsResultant.toFixed(4),
        rmsML: +result.rmsML.toFixed(4),
        rmsAP: +result.rmsAP.toFixed(4),
        ellipseArea: +result.ellipseArea.toFixed(4),
      }, `${num(result.duration, 0)} s at ${num(result.hz, 0)} Hz`);
      close(); ctx.refresh();
    });

    body.append(
      el('div', { class: 'note' }, test.setup),
      status, hint, startBtn, out,
      el('div', { style: { height: '10px' } }), saveBtn,
      el('div', { class: 'note warn' },
        'These units are acceleration-domain and have no absolute meaning. They are valid for comparing you to yourself and your left to your right, provided the phone is in the same place every time. Do not compare them to force-plate norms.')
    );
  });
}

// ---- inclinometer ----
function runIncline(ctx, db, test, side) {
  // Declared out here so the sheet's onClose handler can stop the sensor
  // however the sheet is dismissed — save, close button, or backdrop tap.
  let inc = null;

  sheet(titleFor(test, side), (body, close) => {
    inc = new Inclinometer();
    const readout = el('div', { class: 'angle-readout' }, '—');
    const peakOut = el('div', { class: 'angle-peak' }, 'Zero the phone in the start position first');
    let zeroed = false;

    inc.onAngle = (angle, settled) => {
      readout.classList.toggle('settled', !!settled);
      if (angle == null) {
        readout.textContent = settled ? 'Ready' : '…';
        return;
      }
      readout.textContent = `${num(angle, 1)}°`;
      peakOut.textContent = `Peak ${num(inc.peak, 1)}°${test.targetDeg ? ` · target ${test.targetDeg}°` : ''}`;
      saveBtn.disabled = inc.peak < 1;
    };
    inc.start();

    const zeroBtn = el('button', { class: 'btn-block', style: { minHeight: '52px' } }, 'Zero here');
    zeroBtn.addEventListener('click', () => {
      if (!inc.zero()) { toast('No sensor reading yet — hold still a moment', 'bad'); return; }
      zeroed = true;
      buzz(40);
      zeroBtn.textContent = 'Re-zero';
      peakOut.textContent = 'Zeroed. Now move to end range.';
      toast('Zeroed', 'good');
    });

    const saveBtn = el('button', { class: 'btn-primary btn-block', disabled: true }, 'Save peak angle');
    saveBtn.addEventListener('click', () => {
      const peak = inc.peak;
      inc.stop();
      const notes = test.interpret ? (test.interpret.find((i) => peak <= i.max)?.text || '') : '';
      saveResult(db, test, side, { angle: +peak.toFixed(1) }, notes);
      close(); ctx.refresh();
    });

    body.append(
      el('div', { class: 'note' }, test.setup),
      readout, peakOut,
      el('div', { class: 'btn-row', style: { marginTop: '12px' } },
        zeroBtn,
        el('button', { class: 'btn-ghost', onclick: () => { inc.peak = 0; peakOut.textContent = 'Peak reset'; saveBtn.disabled = true; } }, 'Reset peak')),
      el('div', { style: { height: '10px' } }),
      saveBtn,
      el('h3', {}, 'Protocol'),
      el('ol', { class: 'recipe-steps' }, (test.protocol || []).map((p) => el('li', {}, p))),
      test.interpret && el('div', {},
        el('h3', {}, 'How to read it'),
        el('ul', { class: 'recipe-steps' }, test.interpret.map((i) =>
          el('li', {}, el('b', {}, i.max > 900 ? 'Above that: ' : `Up to ${i.max}°: `), i.text)))),
      el('div', { class: 'note warn' },
        'The reading is the angle between the phone\'s current orientation and wherever you zeroed it. That makes it independent of how the phone is held — but it also means a sloppy zero is a wrong measurement. Zero carefully, in the exact start position, every time.')
    );
  }, { onClose: () => inc?.stop() });
}

// ---- manual ----
function openManual(ctx, db, test, side, forced = false) {
  sheet(titleFor(test, side), (body, close) => {
    const inputs = {};
    if (forced) {
      body.append(el('div', { class: 'note warn' },
        'This device has no motion sensors, so enter the measurement by hand. Anything you record here is treated exactly like a sensor result.'));
    }
    body.append(el('div', { class: 'note' }, test.setup || ''),
      el('h3', {}, 'Protocol'),
      el('ol', { class: 'recipe-steps' }, (test.protocol || []).map((p) => el('li', {}, p))));

    for (const m of test.metrics) {
      const i = numInput({ placeholder: m.unit });
      inputs[m.key] = i;
      body.append(el('div', { class: 'field' }, el('label', {}, `${m.label}${m.unit ? ` (${m.unit})` : ''}`), i));
    }
    const notes = el('textarea', { placeholder: 'Conditions, how it felt, anything that would change the number next time' });
    body.append(el('div', { class: 'field' }, el('label', {}, 'Notes'), notes));

    body.append(el('button', { class: 'btn-primary btn-block', onclick: () => {
      const metrics = {};
      let any = false;
      for (const [k, i] of Object.entries(inputs)) {
        const v = parseNum(i);
        if (!Number.isNaN(v)) { metrics[k] = v; any = true; }
      }
      if (!any) { toast('Enter at least one value', 'bad'); return; }
      saveResult(db, test, side, metrics, notes.value);
      close(); ctx.refresh();
    } }, 'Save result'));
  });
}

function saveResult(db, test, side, metrics, notes = '') {
  store.update((d) => d.lab.results.push({
    id: uid(), testId: test.id, date: todayISO(), side, metrics, notes,
  }));
  toast('Result saved', 'good');
}

// ---------------------------------------------------------------------------
// Custom test builder
// ---------------------------------------------------------------------------

function openBuilder(ctx, db) {
  sheet('New test', (body, close) => {
    const t = newCustomTest();

    const name = el('input', { placeholder: 'e.g. Left hook power on the bag' });
    const category = el('select', {}, TEST_CATEGORIES.map((c) => el('option', { value: c }, c)));
    const mode = el('select', {}, Object.entries(TEST_MODES).map(([k, v]) => el('option', { value: k }, v.label)));
    const sides = el('select', {},
      el('option', { value: 'bilateral' }, 'Single measurement'),
      el('option', { value: 'unilateral' }, 'Left and right separately'));
    const duration = numInput({ decimal: false, value: '30' });
    const setup = el('textarea', { placeholder: 'Equipment and exactly where the phone goes. Be specific — the numbers are only comparable if the setup is identical every time.' });
    const protocol = el('textarea', { placeholder: 'One step per line.' });
    const why = el('textarea', { placeholder: 'What this tells you, and what you would do about a bad result.' });

    const metricsBox = el('div');
    const metricRows = [];
    const addMetric = (m = { label: '', unit: '', better: 'up' }) => {
      const lbl = el('input', { placeholder: 'Metric', value: m.label });
      const un = el('input', { placeholder: 'unit', value: m.unit });
      const bet = el('select', {}, el('option', { value: 'up' }, '↑ better'), el('option', { value: 'down' }, '↓ better'));
      bet.value = m.better;
      const row = el('div', { class: 'metric-def' },
        el('div', {}, el('label', {}, 'Name'), lbl),
        el('div', {}, el('label', {}, 'Unit'), un),
        el('div', {}, el('label', {}, 'Dir'), bet));
      metricRows.push({ lbl, un, bet });
      metricsBox.append(row);
    };
    addMetric({ label: 'Result', unit: '', better: 'up' });

    const modeNote = el('div', { class: 'note' });
    const updNote = () => {
      modeNote.replaceChildren();
      const notes = {
        jump: 'Uses flight time from the accelerometer. Only valid for a test where both feet genuinely leave the ground. Metrics are filled in automatically — the ones you define below are ignored.',
        sway: 'Records postural sway for the duration you set. Metrics are filled in automatically.',
        incline: 'Gravity-referenced joint angle. You zero the phone in the start position and it records the peak excursion. Metrics are filled in automatically.',
        manual: 'You measure it and type the number. Define whatever metrics you want below.',
      };
      modeNote.append(notes[mode.value]);
    };
    mode.addEventListener('change', updNote);
    updNote();

    body.append(
      el('div', { class: 'field' }, el('label', {}, 'Test name'), name),
      el('div', { class: 'grid2' },
        el('div', { class: 'field' }, el('label', {}, 'Category'), category),
        el('div', { class: 'field' }, el('label', {}, 'Sides'), sides)),
      el('div', { class: 'field' }, el('label', {}, 'Measurement'), mode),
      modeNote,
      el('div', { class: 'field' }, el('label', {}, 'Duration (s) — sway tests'), duration),
      el('div', { class: 'field' }, el('label', {}, 'Setup'), setup),
      el('div', { class: 'field' }, el('label', {}, 'Protocol — one step per line'), protocol),
      el('div', { class: 'field' }, el('label', {}, 'Why it matters'), why),
      el('h3', {}, 'Metrics'),
      metricsBox,
      el('button', { class: 'btn-sm btn-block', onclick: () => addMetric() }, '+ Metric'),
      el('button', { class: 'btn-primary btn-block', style: { marginTop: '14px' }, onclick: () => {
        if (!name.value.trim()) { toast('Give the test a name', 'bad'); return; }

        const builtins = {
          jump: [
            { key: 'heightCm', label: 'Jump height', unit: 'cm', dp: 1, better: 'up' },
            { key: 'flightTime', label: 'Flight time', unit: 's', dp: 3, better: 'up' },
          ],
          sway: [
            { key: 'pathPerSec', label: 'Sway path', unit: 'm/s³', dp: 2, better: 'down' },
            { key: 'rmsResultant', label: 'Sway RMS', unit: 'm/s²', dp: 3, better: 'down' },
          ],
          incline: [{ key: 'angle', label: 'Angle', unit: '°', dp: 1, better: 'up' }],
        };

        const metrics = builtins[mode.value] || metricRows
          .filter((r) => r.lbl.value.trim())
          .map((r, i) => ({
            key: `m${i}`, label: r.lbl.value.trim(), unit: r.un.value.trim(),
            dp: 1, better: r.bet.value,
          }));

        if (!metrics.length) { toast('Define at least one metric', 'bad'); return; }

        store.update((d) => d.lab.customTests.push({
          ...t,
          id: uid(),
          name: name.value.trim(),
          category: category.value,
          mode: mode.value,
          sides: sides.value,
          durationSec: Math.round(parseNum(duration)) || 30,
          setup: setup.value.trim(),
          protocol: protocol.value.split('\n').map((s) => s.trim()).filter(Boolean),
          why: why.value.trim(),
          metrics,
        }));
        cat = category.value;
        close(); ctx.refresh(); toast('Test created', 'good');
      } }, 'Create test')
    );
  });
}
