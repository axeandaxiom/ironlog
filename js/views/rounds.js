// The round timer screen and its settings.

import { el, fmtClock, num, toast, buzz, numInput, parseNum } from '../util.js';
import * as store from '../store.js';
import { RoundTimer, DEFAULT_BOXING, bell, warnBeep, tick, primeAudio, audioState, stopAudio } from '../timer.js';
import { keepAwake } from '../sensors.js';
import { sheet } from '../app.js';

export function boxingConfig(db, overrides = {}) {
  return { ...DEFAULT_BOXING, ...(db.settings.boxing || {}), ...overrides };
}

/**
 * Full round timer.
 * `onDone(result)` receives { roundsCompleted, workMinutes } so a conditioning
 * block can fill itself in from what you actually did.
 */
export function openRoundTimer(ctx, { rounds, roundSec, restSec, onDone } = {}) {
  const db = store.get();
  const cfg = boxingConfig(db, {
    ...(rounds ? { rounds } : {}),
    ...(roundSec ? { roundSec } : {}),
    ...(restSec != null ? { restSec } : {}),
  });

  const timer = new RoundTimer(cfg);
  let lastTickSec = null;

  sheet('Round timer', (body, close) => {
    const clock = el('div', { class: 'round-clock' }, '0:00');
    const phase = el('div', { class: 'round-phase' }, 'Get ready');
    const counter = el('div', { class: 'round-counter' }, `Round 1 / ${cfg.rounds}`);
    const ring = el('div', { class: 'round-ring' }, el('i'));
    const startBtn = el('button', { class: 'btn-primary btn-block', style: { minHeight: '58px', fontSize: '18px' } }, 'Start');

    timer.onTick = (s) => {
      clock.textContent = fmtClock(s.remaining);
      phase.textContent = s.phaseLabel;
      counter.textContent = s.phase === 'done'
        ? `${s.rounds} rounds complete`
        : `Round ${s.round} / ${s.rounds}`;
      const pct = s.phaseLength ? (s.remaining / s.phaseLength) * 100 : 0;
      ring.firstChild.style.width = `${Math.max(0, Math.min(100, pct))}%`;
      body.dataset.phase = s.phase;
      startBtn.textContent = s.phase === 'done' ? 'Done' : (s.running ? 'Pause' : 'Start');

      // Audible countdown over the last five seconds of any phase.
      const whole = Math.ceil(s.remaining);
      if (s.running && whole <= 5 && whole > 0 && whole !== lastTickSec) {
        lastTickSec = whole;
        if (cfg.sound) tick();
      }
      if (whole > 5) lastTickSec = null;
    };

    timer.onEvent = (name) => {
      if (name === 'bell') {
        if (cfg.sound) bell(timer.phase === 'done' ? 3 : 1);
        if (cfg.vibrate) buzz([200, 80, 200]);
      } else if (name === 'warn') {
        if (cfg.sound) warnBeep(2, 760);
        if (cfg.vibrate) buzz([90, 60, 90]);
        toast(`${cfg.inRoundWarnSec} seconds left in the round`);
      } else if (name === 'endwarn') {
        if (cfg.sound) warnBeep(3, 980);
        if (cfg.vibrate) buzz([60, 40, 60, 40, 60]);
      } else if (name === 'restwarn') {
        if (cfg.sound) warnBeep(2, 620);
        if (cfg.vibrate) buzz([120]);
        toast('Seconds out');
      } else if (name === 'done') {
        if (cfg.sound) bell(3);
        if (cfg.vibrate) buzz([300, 120, 300]);
        keepAwake(false);
      }
    };

    const audioWarn = el('div', {});
    const showAudioState = () => {
      const a = audioState();
      audioWarn.replaceChildren();
      if (!cfg.sound) return;
      if (!a.running) {
        audioWarn.append(el('div', { class: 'note warn' },
          el('b', {}, 'No sound yet. '),
          'Tap Start — a browser will only begin playing audio from a real tap.'));
      } else if (!a.canBeatSilentSwitch) {
        audioWarn.append(el('div', { class: 'note warn' },
          el('b', {}, 'Check the ringer switch on the side of the phone. '),
          'On this iOS version the switch mutes web audio and nothing in the app can override it. '
          + 'Turn the ringer on, or plug in headphones.'));
      }
    };

    startBtn.addEventListener('click', async () => {
      // Both of these must happen inside a real tap: iOS will not start audio
      // or grant a wake lock from a timer callback.
      const ok = await primeAudio();
      keepAwake(true);
      showAudioState();
      if (!ok && cfg.sound) toast('Sound could not start — check the ringer switch', 'bad');
      timer.toggle();
    });

    const controls = el('div', { class: 'btn-row', style: { marginTop: '10px' } },
      el('button', { onclick: () => { timer.skip(); } }, 'Skip'),
      el('button', { onclick: () => { timer.stop(); timer.reset(); lastTickSec = null; } }, 'Reset'),
      el('button', { onclick: () => { close(); openRoundSettings(ctx, () => openRoundTimer(ctx, { rounds, roundSec, restSec, onDone })); } }, 'Settings'));

    body.append(
      el('div', { class: 'round-wrap' },
        counter, clock, phase, ring),
      startBtn,
      audioWarn,
      controls,
      el('div', { class: 'note' },
        `${cfg.rounds} × ${fmtClock(cfg.roundSec)} with ${fmtClock(cfg.restSec)} rest. `
        + `Warning at ${cfg.inRoundWarnSec} s left, again at ${cfg.endWarnSec} s, and ${cfg.restWarnSec} s before the next round. `
        + 'The clock reads from the system time on every frame, so it stays right even if the screen sleeps or you switch apps.'),
      el('button', { class: 'btn-block', style: { marginTop: '6px' }, onclick: () => {
        const s = timer.state;
        timer.stop();
        keepAwake(false);
        close();
        if (onDone) onDone({ roundsCompleted: s.roundsCompleted, workMinutes: Math.round(s.workSecondsDone / 60) });
      } }, 'Finish and log')
    );

    timer.onTick(timer.state);
    showAudioState();
  }, { onClose: () => { timer.stop(); keepAwake(false); stopAudio(); } });
}

export function openRoundSettings(ctx, after) {
  sheet('Timer settings', (body, close) => {
    const db = store.get();
    const cfg = boxingConfig(db);
    const f = {};

    const field = (key, label, help) => {
      const i = numInput({ decimal: false, value: String(cfg[key]) });
      f[key] = i;
      return el('div', { class: 'field' },
        el('label', {}, label), i,
        help ? el('div', { class: 'li-sub' }, help) : null);
    };

    body.append(
      el('div', { class: 'grid2' },
        field('rounds', 'Rounds'),
        field('roundSec', 'Round length (s)')),
      el('div', { class: 'grid2' },
        field('restSec', 'Rest between rounds (s)'),
        field('prepSec', 'Lead-in before round 1 (s)')),
      el('h3', {}, 'Warnings'),
      field('inRoundWarnSec', 'In-round warning (s before the bell)',
        'The clapper. Two beeps. Set to 0 to turn it off.'),
      field('endWarnSec', 'Round-end warning (s before the bell)',
        'Three sharper beeps right before the round ends.'),
      field('restWarnSec', 'Seconds out (s before the rest ends)',
        'Warns you to get back on the bag before the bell.'),
      toggleRow('Sound', cfg.sound, (v) => { cfg.sound = v; }),
      toggleRow('Vibrate', cfg.vibrate, (v) => { cfg.vibrate = v; }),
      el('div', { class: 'note' },
        'The last five seconds of every phase tick audibly regardless, so you always know where you are without looking.'),
      el('div', { class: 'btn-row', style: { marginTop: '12px' } },
        el('button', { onclick: async () => {
          const ok = await primeAudio();
          bell(1);
          toast(ok ? 'Bell played — if you heard nothing, check the ringer switch' : 'Audio could not start', ok ? 'good' : 'bad');
        } }, 'Test bell'),
        el('button', { onclick: async () => { await primeAudio(); warnBeep(2, 760); } }, 'Test warning')),
      audioNote(),
      el('button', { class: 'btn-primary btn-block', style: { marginTop: '12px' }, onclick: () => {
        const next = { ...cfg };
        for (const [k, inp] of Object.entries(f)) {
          const v = Math.round(parseNum(inp));
          if (!Number.isNaN(v) && v >= 0) next[k] = v;
        }
        if (!(next.rounds > 0)) { toast('At least one round', 'bad'); return; }
        if (!(next.roundSec > 0)) { toast('Rounds need a length', 'bad'); return; }
        if (next.inRoundWarnSec >= next.roundSec || next.endWarnSec >= next.roundSec) {
          toast('A warning has to fall inside the round', 'bad'); return;
        }
        store.update((d) => { d.settings.boxing = next; });
        close();
        toast('Timer settings saved', 'good');
        if (after) after();
        else ctx.refresh();
      } }, 'Save')
    );
  });
}

/** Say plainly what will and will not make a noise on this device. */
function audioNote() {
  const a = audioState();
  const lines = [];
  if (!a.canBeatSilentSwitch) {
    lines.push('The ringer switch on the side of the phone mutes web audio on this iOS version, and no app setting can override it. Turn the ringer on, or use headphones.');
  } else {
    lines.push('Sound is requested as playback audio, so the ringer switch should not mute it.');
  }
  if (!a.canVibrate) {
    lines.push('Vibration is not available in Safari on iOS, so the vibrate setting will do nothing on an iPhone. It works on Android.');
  }
  lines.push('Test the bell here before you rely on it in a session.');
  return el('div', { class: 'note warn' }, lines.join(' '));
}

function toggleRow(label, value, onChange) {
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

void num;
