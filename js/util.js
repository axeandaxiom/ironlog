// Small DOM + math helpers. No framework, no build step.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/**
 * Parse a number from an input, tolerating both decimal separators.
 *
 * `<input type="number">` looks like the obvious choice and is a trap: it
 * displays in the user's locale, so an Estonian keyboard offers a comma — and
 * when a comma is entered, `.value` returns an empty string rather than the
 * text. The number is silently discarded. Everything numeric in this app
 * therefore uses type="text" with inputmode="decimal" (which still brings up
 * the numeric keypad on iOS) and comes through here.
 */
export function parseNum(source) {
  const raw = typeof source === 'string' ? source : (source?.value ?? '');
  const cleaned = String(raw).replace(/\s/g, '').replace(',', '.');
  if (cleaned === '') return NaN;
  const v = parseFloat(cleaned);
  return Number.isFinite(v) ? v : NaN;
}

/**
 * A numeric field that survives a comma keyboard.
 * `decimal: false` gives a whole-number keypad for reps and counts.
 */
export function numInput(props = {}) {
  const { decimal = true, ...rest } = props;
  return el('input', {
    type: 'text',
    inputmode: decimal ? 'decimal' : 'numeric',
    autocomplete: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    ...rest,
  });
}

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Round to the nearest achievable loading step (e.g. 2.5 kg jumps). */
export function roundTo(value, step) {
  if (!step) return value;
  return Math.round(value / step) * step;
}

/** Trim float noise: 62.5 -> "62.5", 60 -> "60". */
export function num(n, dp = 2) {
  if (n == null || Number.isNaN(n)) return '–';
  return String(parseFloat(Number(n).toFixed(dp)));
}

export const KG_PER_LB = 0.45359237;
export const toDisplayWeight = (kg, units) => (units === 'lb' ? kg / KG_PER_LB : kg);
export const fromDisplayWeight = (v, units) => (units === 'lb' ? v * KG_PER_LB : v);

/** Epley 1RM estimate. Only meaningful for reps <= ~10. */
export const e1rm = (weight, reps) => (reps <= 1 ? weight : weight * (1 + reps / 30));

// ---------- dates ----------
export const todayISO = () => new Date().toISOString().slice(0, 10);

export function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function fmtDate(iso) {
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function fmtDateLong(iso) {
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtClock(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

// ---------- plate math ----------
/**
 * Plates per side for a target barbell weight.
 * Returns { perSide:[{plate,count}], achieved, short } — `short` is the
 * unloadable remainder, so the UI can tell you the bar won't make the number.
 */
export function platesFor(target, barWeight, plateSet) {
  let remaining = (target - barWeight) / 2;
  const perSide = [];
  if (remaining < 0) return { perSide, achieved: barWeight, short: target - barWeight };
  for (const plate of [...plateSet].sort((a, b) => b - a)) {
    const count = Math.floor((remaining + 1e-9) / plate);
    if (count > 0) {
      perSide.push({ plate, count });
      remaining -= count * plate;
    }
  }
  const achieved = target - remaining * 2;
  return { perSide, achieved, short: remaining * 2 };
}

// ---------- stats ----------
export const sum = (a) => a.reduce((x, y) => x + y, 0);
export const mean = (a) => (a.length ? sum(a) / a.length : 0);

export function stdev(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1));
}

/**
 * Limb symmetry index, the convention used in return-to-play testing:
 * 100 * (weaker / stronger), so 100 % is perfect symmetry.
 */
export function symmetryIndex(left, right) {
  const hi = Math.max(left, right);
  const lo = Math.min(left, right);
  if (!hi) return null;
  return (lo / hi) * 100;
}

/** Simple moving average, used to smooth bodyweight against daily water noise. */
export function movingAverage(values, window = 7) {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1);
    return mean(slice);
  });
}

// ---------- chart ----------
/**
 * Minimal single-series SVG line chart. points = [{x:isoDate, y:number}].
 * Deliberately plain: one series, direct min/max labels, no gridline clutter.
 */
export function lineChart(points, opts = {}) {
  const { height = 140, unit = '', trend = null, goodDirection = 'up' } = opts;
  const W = 320;
  const H = height;
  const pad = { t: 14, r: 8, b: 18, l: 34 };

  if (points.length === 0) {
    return el('div', { class: 'chart-empty' }, 'No data yet');
  }
  if (points.length === 1) {
    return el('div', { class: 'chart-empty' }, `Single reading: ${num(points[0].y)} ${unit}`);
  }

  const ys = points.map((p) => p.y);
  let lo = Math.min(...ys);
  let hi = Math.max(...ys);
  if (hi === lo) { hi += 1; lo -= 1; }
  const span = hi - lo;
  lo -= span * 0.1;
  hi += span * 0.1;

  const xs = points.map((p) => new Date(p.x).getTime());
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const sx = (t) => pad.l + ((t - x0) / (x1 - x0 || 1)) * (W - pad.l - pad.r);
  const sy = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${sx(xs[i]).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  const area = `${path} L${sx(xs.at(-1)).toFixed(1)},${H - pad.b} L${sx(xs[0]).toFixed(1)},${H - pad.b} Z`;

  const first = ys[0];
  const last = ys.at(-1);
  const delta = last - first;
  const improving = goodDirection === 'up' ? delta > 0 : delta < 0;

  const svg = `
    <svg viewBox="0 0 ${W} ${H}" class="chart" preserveAspectRatio="none" role="img"
         aria-label="Trend from ${num(first)} to ${num(last)} ${unit}">
      <path d="${area}" class="chart-area"/>
      <path d="${path}" class="chart-line"/>
      ${points.map((p, i) => `<circle cx="${sx(xs[i]).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="2.2" class="chart-dot"/>`).join('')}
      <text x="2" y="${sy(Math.max(...ys)).toFixed(1)}" class="chart-tick">${num(Math.max(...ys), 1)}</text>
      <text x="2" y="${sy(Math.min(...ys)).toFixed(1)}" class="chart-tick">${num(Math.min(...ys), 1)}</text>
      <text x="${pad.l}" y="${H - 5}" class="chart-tick">${fmtDate(points[0].x)}</text>
      <text x="${W - pad.r}" y="${H - 5}" class="chart-tick" text-anchor="end">${fmtDate(points.at(-1).x)}</text>
    </svg>`;

  const wrap = el('div', { class: 'chart-wrap', html: svg });
  if (trend !== false) {
    wrap.append(
      el('div', { class: `chart-delta ${improving ? 'good' : 'bad'}` },
        `${delta >= 0 ? '+' : ''}${num(delta, 1)} ${unit} over ${points.length} readings`)
    );
  }
  return wrap;
}

// ---------- misc ----------
export function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function download(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let toastTimer;
export function toast(msg, kind = 'info') {
  let t = $('#toast');
  if (!t) {
    t = el('div', { id: 'toast' });
    document.body.append(t);
  }
  t.textContent = msg;
  t.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ''), 2600);
}

/** Vibrate if the device supports it — used for set logged / rest over. */
export function buzz(pattern = 30) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}
