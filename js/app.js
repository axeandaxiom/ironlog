// Boot, routing, and the two pieces of chrome that outlive any single view:
// the rest timer and the bottom sheet.

import { $, $$, el, fmtClock, buzz } from './util.js';
import * as store from './store.js';
import { bell, primeAudio } from './timer.js';
import { keepAwake } from './sensors.js';
import { registerCustomExercises } from './data/exercises.js';
import { registerCustomPrograms } from './programs.js';

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
let restIv = null;

export function startRest(seconds, label = 'Rest') {
  const bar = $('#rest-bar');
  // Rest starts from the tap that logged the set, and that tap is the one
  // moment iOS lets audio begin — primed here, the bell at the end can sound
  // from a timer tick with the screen dark.
  if (store.get().settings.soundOnRestEnd) primeAudio();
  restState = { target: seconds, start: Date.now(), label, alerted: false };
  bar.hidden = false;
  $('.rest-label', bar).textContent = label;
  // setInterval rather than requestAnimationFrame: rAF stops completely when
  // the page is hidden, so with the screen off the clock would freeze and the
  // end-of-rest alert would never fire. Each tick recomputes from the wall
  // clock, so a throttled tick is late, not wrong.
  clearInterval(restIv);
  restIv = setInterval(tickRest, 200);
  tickRest();
}

export function stopRest() {
  restState = null;
  clearInterval(restIv);
  restIv = null;
  $('#rest-bar').hidden = true;
}

function tickRest() {
  if (!restState) { clearInterval(restIv); restIv = null; return; }
  const elapsed = (Date.now() - restState.start) / 1000;
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
      if (store.get().settings.soundOnRestEnd) bell(1);
    }
  }
}

// Redraw the moment the app comes back to the foreground, so you never see a
// stale number while waiting for the next tick.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && restState) tickRest();
});

// The old local beep built a second AudioContext outside any user gesture;
// iOS starts those suspended, so on a phone it was silent. The round timer's
// bell, primed in startRest, replaces it.

// Guarded so importing this module outside the app shell (the test page) does
// not throw on a missing element.
$('#rest-bar')?.addEventListener('click', (e) => {
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

// Merge the user's own exercises and programmes into the built-in catalogues
// before anything renders, so every view sees one unified set.
export function syncCustom() {
  const db = store.get();
  registerCustomExercises(db.customExercises);
  registerCustomPrograms(db.customPrograms);
}
syncCustom();

$$('.nav-btn').forEach((b) => b.addEventListener('click', () => go(b.dataset.route)));

// The brand mark is the home button — tapping the IronLog logo from anywhere
// returns to the Train screen, the app's front door.
$('.brand')?.addEventListener('click', () => go('train'));

window.addEventListener('hashchange', () => {
  const r = location.hash.replace(/^#\/?/, '') || 'train';
  if (r !== current) go(r, { silent: true });
});

// Keep the screen on while a session is open — the single most common
// complaint about logging in a browser.
store.onChange((db) => {
  if (db.settings.keepAwake) keepAwake(!!db.activeSession);
});

// ---------------------------------------------------------------------------
// Updating
//
// An installed PWA has no pull-to-refresh and never navigates — it is a single
// page that stays open for weeks. Left alone it would keep running whatever
// build it was installed with, so the app has to check for itself and say so.
// ---------------------------------------------------------------------------

let swReg = null;
let updateReady = false;

export function updateState() {
  return { ready: updateReady, registered: !!swReg };
}

/** Ask the browser to re-fetch the worker. Returns true if a new one is waiting. */
export async function checkForUpdate() {
  if (!swReg) return false;
  try {
    await swReg.update();
  } catch { /* offline — nothing to check against */ }
  return !!(swReg.installing || swReg.waiting) || updateReady;
}

export function applyUpdate() {
  // The worker calls skipWaiting on install, so a plain reload is enough to
  // pick up the new one.
  location.reload();
}

function showUpdateBanner() {
  if ($('#update-banner')) return;
  const bar = el('div', { id: 'update-banner' },
    el('span', {}, 'A new version is ready.'),
    el('button', { class: 'btn-sm', onclick: applyUpdate }, 'Reload'),
    el('button', { class: 'btn-sm btn-ghost', 'aria-label': 'Dismiss',
      onclick: () => bar.remove() }, '✕'));
  document.body.append(bar);
}

if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', async () => {
    try {
      swReg = await navigator.serviceWorker.register('sw.js');

      swReg.addEventListener('updatefound', () => {
        const fresh = swReg.installing;
        if (!fresh) return;
        fresh.addEventListener('statechange', () => {
          // A worker reaching "installed" while one is already controlling the
          // page means there is genuinely a newer build sitting there.
          if (fresh.state === 'installed' && navigator.serviceWorker.controller) {
            updateReady = true;
            showUpdateBanner();
          }
        });
      });

      // Check on launch, and again whenever the app comes back to the front —
      // which for a home-screen app is the only moment it reliably gets.
      swReg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') swReg.update().catch(() => {});
      });
    } catch (err) {
      console.warn('SW registration failed', err);
    }
  });
}

// Only boot the router when the app shell is actually present. Importing a
// view from a test page must not try to render into a #view that is not there.
if ($('#view')) {
  go(location.hash.replace(/^#\/?/, '') || 'train', { silent: true });
}
