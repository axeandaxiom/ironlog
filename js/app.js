// Boot, routing, and the two pieces of chrome that outlive any single view:
// the rest timer and the bottom sheet.

import { $, $$, el, fmtClock, buzz } from './util.js';
import * as store from './store.js';
import { keepAwake } from './sensors.js';

import { renderTrain } from './views/train.js';
import { renderLog } from './views/log.js';
import { renderLab } from './views/lab.js';
import { renderHealth } from './views/health.js';
import { renderFood } from './views/food.js';
import { renderMore } from './views/more.js';

const ROUTES = {
  train: { render: renderTrain, title: 'Train' },
  log: { render: renderLog, title: 'Log' },
  lab: { render: renderLab, title: 'Movement Lab' },
  health: { render: renderHealth, title: 'Health' },
  food: { render: renderFood, title: 'Food' },
  more: { render: renderMore, title: 'More' },
};

let current = 'train';

export function go(route, opts = {}) {
  if (!ROUTES[route]) route = 'train';
  current = route;
  if (!opts.silent) location.hash = `#/${route}`;
  render();
}

export function refresh() {
  render();
}

function render() {
  // A sheet is appended to <body>, so it survives a view swap unless it is
  // explicitly dismissed. Leaving one open across navigation also leaves
  // body.overflow locked and the page unscrollable.
  closeAllSheets();

  const view = $('#view');
  const slot = $('#topbar-slot');
  // Preserve scroll position on in-place refreshes so logging a set does not
  // throw you back to the top of the workout.
  const y = window.scrollY;
  const same = view.dataset.route === current;

  view.dataset.route = current;
  view.replaceChildren();
  slot.replaceChildren();

  $$('.nav-btn').forEach((b) => {
    const on = b.dataset.route === current;
    b.setAttribute('aria-current', on ? 'page' : 'false');
  });

  try {
    ROUTES[current].render(view, { slot, go, refresh });
  } catch (err) {
    console.error(err);
    view.append(
      el('div', { class: 'card' },
        el('h2', {}, 'Something broke'),
        el('p', { class: 'sub' }, String(err && err.message ? err.message : err)),
        el('p', { class: 'sub' }, 'Your data is untouched. Export it from More → Data if you want a backup before reloading.'),
        el('button', { class: 'btn-primary btn-block', onclick: () => location.reload() }, 'Reload')
      )
    );
  }

  if (same) window.scrollTo(0, y);
  else window.scrollTo(0, 0);
}

// ---------------------------------------------------------------------------
// Rest timer — lives outside the view so it survives navigation. Counting up
// past zero rather than stopping, because knowing you rested 6:20 instead of
// 3:00 matters more than the alarm.
// ---------------------------------------------------------------------------

let restState = null;
let restRAF = null;

export function startRest(seconds, label = 'Rest') {
  const bar = $('#rest-bar');
  restState = { target: seconds, start: performance.now(), label, alerted: false };
  bar.hidden = false;
  $('.rest-label', bar).textContent = label;
  tickRest();
}

export function stopRest() {
  restState = null;
  cancelAnimationFrame(restRAF);
  $('#rest-bar').hidden = true;
}

function tickRest() {
  if (!restState) return;
  const elapsed = (performance.now() - restState.start) / 1000;
  const remaining = restState.target - elapsed;
  const bar = $('#rest-bar');
  const clock = $('.rest-clock', bar);

  if (remaining >= 0) {
    clock.textContent = fmtClock(remaining);
    clock.classList.remove('over');
    $('.rest-fill', bar).style.width = `${Math.max(0, (remaining / restState.target) * 100)}%`;
  } else {
    clock.textContent = `+${fmtClock(-remaining)}`;
    clock.classList.add('over');
    $('.rest-fill', bar).style.width = '0%';
    if (!restState.alerted) {
      restState.alerted = true;
      buzz([90, 60, 90]);
      if (store.get().settings.soundOnRestEnd) beep();
    }
  }
  restRAF = requestAnimationFrame(tickRest);
}

let audioCtx = null;
function beep() {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = 660;
    g.gain.setValueAtTime(0.001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, audioCtx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.36);
  } catch { /* audio is a nicety, never a failure */ }
}

$('#rest-bar').addEventListener('click', (e) => {
  if (e.target.matches('.rest-skip')) stopRest();
  if (e.target.matches('.rest-add') && restState) restState.target += 30;
});

// ---------------------------------------------------------------------------
// Bottom sheet
// ---------------------------------------------------------------------------

/** Dismiss every open sheet, running each one's onClose so sensors stop. */
export function closeAllSheets() {
  $$('.sheet-backdrop').forEach((b) => b._close?.());
}

export function sheet(title, buildBody, { onClose } = {}) {
  const body = el('div');
  let closed = false;
  const close = () => {
    if (closed) return;      // closeAllSheets may race with a manual dismiss
    closed = true;
    backdrop.remove();
    // Only unlock scrolling once the last sheet is gone — sheets can stack.
    if (!$('.sheet-backdrop')) document.body.style.overflow = '';
    if (onClose) onClose();
  };
  const panel = el('div', { class: 'sheet' },
    el('div', { class: 'sheet-head' },
      el('h2', {}, title),
      el('button', { class: 'btn-sm btn-ghost', onclick: close, 'aria-label': 'Close' }, '✕')
    ),
    body
  );
  const backdrop = el('div', {
    class: 'sheet-backdrop',
    onclick: (e) => { if (e.target === backdrop) close(); },
  }, panel);

  backdrop._close = close;
  document.body.append(backdrop);
  document.body.style.overflow = 'hidden';
  buildBody(body, close);
  return close;
}

export function confirmSheet(title, message, confirmLabel = 'Confirm') {
  return new Promise((resolve) => {
    let answered = false;
    const close = sheet(title, (body, done) => {
      body.append(
        el('p', { class: 'sub' }, message),
        el('div', { class: 'btn-row' },
          el('button', { class: 'btn-ghost', onclick: () => { answered = true; done(); resolve(false); } }, 'Cancel'),
          el('button', { class: 'btn-danger', onclick: () => { answered = true; done(); resolve(true); } }, confirmLabel)
        )
      );
    }, { onClose: () => { if (!answered) resolve(false); } });
    void close;
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

store.load();

$$('.nav-btn').forEach((b) => b.addEventListener('click', () => go(b.dataset.route)));

window.addEventListener('hashchange', () => {
  const r = location.hash.replace(/^#\/?/, '') || 'train';
  if (r !== current) go(r, { silent: true });
});

// Keep the screen on while a session is open — the single most common
// complaint about logging in a browser.
store.onChange((db) => {
  if (db.settings.keepAwake) keepAwake(!!db.activeSession);
});

if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW registration failed', err));
  });
}

go(location.hash.replace(/^#\/?/, '') || 'train', { silent: true });
