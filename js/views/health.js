// Health tracking. A small set of sensible defaults, plus the ability to
// define any metric you want — which is what "add health tracking tools"
// actually means in practice.

import { el, uid, num, todayISO, lineChart, movingAverage, daysBetween, toast, numInput, parseNum } from '../util.js';
import * as store from '../store.js';
import { sheet, confirmSheet } from '../app.js';

// Suggested metrics. None of these exist until you add them — an app full of
// empty charts for things you do not measure is worse than an empty one.
const SUGGESTED = [
  { id: 'm-bw', label: 'Bodyweight', unit: 'kg', kind: 'number', dp: 1, better: 'flat', core: true,
    note: 'The single most useful number here. Weigh yourself at the same time every day, ideally first thing, and read the seven-day average rather than any individual reading.' },
  { id: 'm-rhr', label: 'Resting heart rate', unit: 'bpm', kind: 'number', dp: 0, better: 'down',
    note: 'Measured on waking, before getting up. A jump of 5+ bpm over your own baseline usually means you are under-recovered, ill, or both.' },
  { id: 'm-sleep', label: 'Sleep', unit: 'h', kind: 'number', dp: 1, better: 'up',
    note: 'The recovery variable you have most control over and are most likely to ignore.' },
  { id: 'm-sleepq', label: 'Sleep quality', unit: '/5', kind: 'scale5', better: 'up' },
  { id: 'm-hrv', label: 'HRV (rMSSD)', unit: 'ms', kind: 'number', dp: 0, better: 'up',
    note: 'Only meaningful against your own rolling baseline, measured the same way every morning. Single readings are noise.' },
  { id: 'm-bp-sys', label: 'Blood pressure — systolic', unit: 'mmHg', kind: 'number', dp: 0, better: 'down' },
  { id: 'm-bp-dia', label: 'Blood pressure — diastolic', unit: 'mmHg', kind: 'number', dp: 0, better: 'down' },
  { id: 'm-waist', label: 'Waist', unit: 'cm', kind: 'number', dp: 1, better: 'down',
    note: 'Measured at the navel, relaxed, at the end of a normal exhale. Paired with bodyweight it tells you what the surplus is actually building.' },
  { id: 'm-bf', label: 'Body fat', unit: '%', kind: 'number', dp: 1, better: 'down',
    note: 'Every consumer method for this is imprecise. Use it for direction, never for the absolute number.' },
  { id: 'm-soreness', label: 'Soreness', unit: '/5', kind: 'scale5', better: 'down' },
  { id: 'm-mood', label: 'Mood / motivation', unit: '/5', kind: 'scale5', better: 'up' },
  { id: 'm-stress', label: 'Stress', unit: '/5', kind: 'scale5', better: 'down' },
  { id: 'm-steps', label: 'Steps', unit: '', kind: 'number', dp: 0, better: 'up' },
  { id: 'm-water', label: 'Water', unit: 'l', kind: 'number', dp: 1, better: 'up' },
];

let healthRange = null;

export function renderHealth(view, ctx) {
  const db = store.get();
  const defs = db.metrics.defs;

  ctx.slot.append(el('button', { class: 'btn-sm btn-ghost', onclick: () => openManage(ctx, db) }, 'Metrics'));
  view.append(el('h1', {}, 'Health'));

  if (!defs.length) {
    view.append(
      el('div', { class: 'empty' },
        el('b', {}, 'No metrics yet'),
        'Pick what you actually intend to measure. Two you record daily beat ten you record once.'),
      el('button', { class: 'btn-primary btn-block', onclick: () => openManage(ctx, db) }, 'Add metrics')
    );
    return;
  }

  // ---- today's entry
  view.append(el('h2', {}, `Today — ${todayISO()}`));
  const today = el('div', { class: 'card' });
  for (const def of defs) {
    today.append(entryRow(def, db, ctx));
  }
  view.append(today);

  // ---- charts
  //
  // The window used to be a hardcoded 180 days, which made an imported backlog
  // invisible: four years of readings, none of them in the last six months,
  // and a Health tab that looked empty. The range is now chosen, and it
  // defaults to the shortest one that actually contains your data.
  const RANGES = [
    { key: '3m', label: '3 months', days: 92 },
    { key: '1y', label: 'Year', days: 366 },
    { key: 'all', label: 'All', days: 100000 },
  ];
  const oldest = db.metrics.entries.reduce((a, e) => (a && a < e.date ? a : e.date), null);
  const spanDays = oldest ? Math.max(1, daysBetween(oldest, todayISO())) : 0;
  if (!healthRange) {
    healthRange = (RANGES.find((r) => r.days >= spanDays) || RANGES.at(-1)).key;
  }
  const range = RANGES.find((r) => r.key === healthRange) || RANGES[0];

  view.append(el('div', { class: 'row between', style: { margin: '22px 0 8px' } },
    el('h2', { style: { margin: 0 } }, 'Trends'),
    el('div', { class: 'chips' }, RANGES.map((r) => {
      const c = el('button', { class: 'chip', 'aria-pressed': String(r.key === range.key) }, r.label);
      c.addEventListener('click', () => { healthRange = r.key; ctx.refresh(); });
      return c;
    }))));

  for (const def of defs) {
    const pts = store.metricSeries(def.id, range.days);
    if (!pts.length) {
      const total = store.metricSeries(def.id, 100000).length;
      if (total) {
        view.append(el('div', { class: 'card tight' },
          el('div', { class: 'li-title' }, def.label),
          el('div', { class: 'li-sub' },
            `${total} reading${total === 1 ? '' : 's'}, none in the last ${range.label.toLowerCase()}. Switch the range to see them.`)));
      }
      continue;
    }

    const card = el('div', { class: 'card' },
      el('div', { class: 'card-head' },
        el('h3', {}, def.label),
        el('span', { class: 'li-right' }, pts.length ? `${num(pts.at(-1).y, def.dp ?? 1)} ${def.unit}` : '')),
      lineChart(pts, { unit: def.unit, goodDirection: def.better === 'down' ? 'down' : 'up' })
    );

    // Bodyweight gets a smoothed line too — daily readings are mostly water.
    if (def.id === 'm-bw' && pts.length >= 7) {
      const smooth = movingAverage(pts.map((p) => p.y), 7);
      const i = Math.max(0, smooth.length - 8);
      const last7 = smooth.at(-1);
      const prev7 = smooth[i];
      // Rate must come from the calendar gap, not the number of readings —
      // weighing in every other day would otherwise double the reported rate.
      const spanDays = Math.max(1, daysBetween(pts[i].x, pts.at(-1).x));
      const rate = ((last7 - prev7) / spanDays) * 7;
      card.append(
        el('div', { class: 'note' },
          `Seven-day average ${num(last7, 1)} ${def.unit}, moving ${rate >= 0 ? '+' : ''}${num(rate, 2)} ${def.unit} per week over the last ${spanDays} days. `,
          Math.abs(rate) < 0.1
            ? 'Effectively flat — you are at maintenance.'
            : rate > 0.6
              ? 'Faster than a novice needs. Most of that is fat; trim the surplus.'
              : rate > 0
                ? 'A reasonable gaining rate.'
                : 'Losing weight. A linear progression will not survive this for long.')
      );
    }
    view.append(card);
  }
}

function entryRow(def, db, ctx) {
  const existing = db.metrics.entries.find((e) => e.metricId === def.id && e.date === todayISO());

  if (def.kind === 'scale5' || def.kind === 'scale10') {
    const max = def.kind === 'scale5' ? 5 : 10;
    const chips = el('div', { class: 'chips' });
    for (let i = 1; i <= max; i++) {
      const c = el('button', { class: 'chip', 'aria-pressed': String(existing?.value === i) }, String(i));
      c.addEventListener('click', () => {
        store.addMetricEntry(def.id, i);
        [...chips.children].forEach((x, idx) => x.setAttribute('aria-pressed', String(idx + 1 === i)));
        ctx.refresh();
      });
      chips.append(c);
    }
    return el('div', { class: 'field' }, el('label', {}, `${def.label} ${def.unit}`), chips);
  }

  const inp = numInput({
    value: existing != null ? String(existing.value) : '',
    placeholder: def.unit || 'value',
  });
  inp.addEventListener('change', () => {
    const v = parseNum(inp);
    if (Number.isNaN(v)) return;
    store.addMetricEntry(def.id, v);
    toast(`${def.label} saved`, 'good');
    ctx.refresh();
  });
  return el('div', { class: 'field' },
    el('label', {}, `${def.label}${def.unit ? ` (${def.unit})` : ''}`), inp);
}

function openManage(ctx, db) {
  sheet('Metrics', (body, close) => {
    const active = new Set(db.metrics.defs.map((d) => d.id));

    body.append(el('h3', {}, 'Tracking'));
    const activeList = el('div', { class: 'list' });
    if (!db.metrics.defs.length) {
      activeList.append(el('p', { class: 'sub' }, 'Nothing yet.'));
    }
    for (const def of db.metrics.defs) {
      const count = db.metrics.entries.filter((e) => e.metricId === def.id).length;
      activeList.append(el('div', { class: 'list-item', style: { cursor: 'default' } },
        el('div', { class: 'grow' },
          el('div', { class: 'li-title' }, def.label),
          el('div', { class: 'li-sub' }, `${count} reading${count === 1 ? '' : 's'}${def.unit ? ` · ${def.unit}` : ''}`)),
        el('button', { class: 'btn-sm btn-danger', onclick: async () => {
          const ok = await confirmSheet('Stop tracking?',
            `This removes ${def.label} and all ${count} of its readings. It cannot be undone.`, 'Remove');
          if (!ok) return;
          store.update((d) => {
            d.metrics.defs = d.metrics.defs.filter((x) => x.id !== def.id);
            d.metrics.entries = d.metrics.entries.filter((e) => e.metricId !== def.id);
          });
          close(); ctx.refresh();
        } }, 'Remove')));
    }
    body.append(activeList);

    body.append(el('h3', { style: { marginTop: '18px' } }, 'Add'));
    const addList = el('div', { class: 'list' });
    for (const s of SUGGESTED.filter((x) => !active.has(x.id))) {
      addList.append(el('button', { class: 'list-item', onclick: () => {
        store.update((d) => d.metrics.defs.push({ ...s }));
        close(); ctx.refresh(); toast(`Tracking ${s.label}`, 'good');
      } },
        el('div', { class: 'grow' },
          el('div', { class: 'li-title' }, s.label),
          s.note && el('div', { class: 'li-sub' }, s.note)),
        el('span', { class: 'li-right' }, '+')));
    }
    body.append(addList);

    body.append(el('button', { class: 'btn-block', style: { marginTop: '12px' },
      onclick: () => { close(); openCustom(ctx); } }, '+ Custom metric'));
  });
}

function openCustom(ctx) {
  sheet('Custom metric', (body, close) => {
    const label = el('input', { placeholder: 'e.g. Grip pain, left elbow' });
    const unit = el('input', { placeholder: 'e.g. /10, cm, mmol/L' });
    const kind = el('select', {},
      el('option', { value: 'number' }, 'Number'),
      el('option', { value: 'scale5' }, 'Scale 1–5'),
      el('option', { value: 'scale10' }, 'Scale 1–10'));
    const better = el('select', {},
      el('option', { value: 'up' }, 'Higher is better'),
      el('option', { value: 'down' }, 'Lower is better'),
      el('option', { value: 'flat' }, 'Neither — just track it'));
    const note = el('textarea', { placeholder: 'How you measure it. Worth writing down — consistency of method matters more than the number.' });

    body.append(
      el('div', { class: 'field' }, el('label', {}, 'Name'), label),
      el('div', { class: 'grid2' },
        el('div', { class: 'field' }, el('label', {}, 'Unit'), unit),
        el('div', { class: 'field' }, el('label', {}, 'Type'), kind)),
      el('div', { class: 'field' }, el('label', {}, 'Direction'), better),
      el('div', { class: 'field' }, el('label', {}, 'Protocol note'), note),
      el('button', { class: 'btn-primary btn-block', onclick: () => {
        if (!label.value.trim()) { toast('Give it a name', 'bad'); return; }
        store.update((d) => d.metrics.defs.push({
          id: uid(), label: label.value.trim(), unit: unit.value.trim(),
          kind: kind.value, better: better.value, dp: 1, note: note.value.trim(), custom: true,
        }));
        close(); ctx.refresh(); toast('Metric added', 'good');
      } }, 'Add metric')
    );
  });
}
