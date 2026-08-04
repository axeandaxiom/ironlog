// The round timer screen and its settings.

import { el, fmtClock, num, toast, buzz, numInput, parseNum } from '../util.js';
import * as store from '../store.js';
import { RoundTimer, DEFAULT_BOXING, bell, warnBeep, tick, primeAudio, audioState, stopAudio,
         setAudioMode } from '../timer.js';
import { keepAwake } from '../sensors.js';
import { sheet } from '../app.js';

export function boxingConfig(db, overrides = {}) {
  const cfg = { ...DEFAULT_BOXING, ...(db.settings.boxing || {}), ...overrides };
  setAudioMode(cfg.audioMode);
  return cfg;
}

/**
 * Full round timer.
 * `onDone(result)` receives { roundsCompleted, workMinutes } so a conditioning
 * block can fill itself in from what you actually did.
 */
export function openRoundTimer(ctx, { rounds, roundSec, restSec, onDone, resume = null } = {}) {
  const db = store.get();
  const cfg = boxingConfig(db, {
    ...(rounds ? { rounds } : {}),
    ...(roundSec ? { roundSec } : {}),
    ...(restSec != null ? { restSec } : {}),
  });

  const timer = new RoundTimer(cfg);
  let lastTickSec = null;

  // Coming back from the settings sheet must not cost you your place. Round 9
  // of 12 has to still be round 9 — rebuilding the timer from scratch there
  // was throwing away the session you were in the middle of.
  if (resume) {
    timer.phase = resume.phase;
    // Shortening the rotation while standing in round 9 of 12 would otherwise
    // leave the counter past the end.
    timer.round = Math.min(resume.round, cfg.rounds);
    timer.elapsedInPhase = Math.min(resume.elapsedInPhase, timer.phaseLength);
    timer._emitTick();
  }

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
        toast(cfg.inRoundWarnMode === 'interval'
          ? `${cfg.inRoundWarnSec} s mark`
          : `${cfg.inRoundWarnSec} seconds left in the round`);
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
      // Reopened without the programme's rounds/length/rest overrides: you have
      // just set those by hand, and a prescription must not overwrite a choice.
      el('button', { onclick: () => {
        // Snapshot before closing: close() stops the timer, and a stopped
        // timer's elapsed reading is the one we want to come back to.
        timer.pause();
        const snap = {
          phase: timer.phase, round: timer.round,
          elapsedInPhase: timer.elapsedInPhase, running: false,
        };
        close();
        openRoundSettings(ctx, () => openRoundTimer(ctx, { onDone, resume: snap }));
      } }, 'Settings'));

    body.append(
      el('div', { class: 'round-wrap' },
        counter, clock, phase, ring),
      startBtn,
      audioWarn,
      controls,
      el('div', { class: 'note' }, describeConfig(cfg)
        + ' The clock reads from the system time on every tick, so it stays right even if the screen sleeps or you switch apps.'),
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

    // The in-round warning reads its number two different ways, so the mode
    // sits directly above the number and the help text below says which.
    let warnMode = cfg.inRoundWarnMode === 'interval' ? 'interval' : 'before-end';
    const warnHelp = el('div', { class: 'li-sub' });
    const sayWarn = () => {
      const n = Math.round(parseNum(f.inRoundWarnSec));
      const secs = Number.isNaN(n) ? cfg.inRoundWarnSec : n;
      warnHelp.textContent = !(secs > 0)
        ? 'Off — no in-round warning.'
        : warnMode === 'interval'
          ? `Two beeps every ${secs} s from the start of the round, so a 3:00 round calls out at `
            + markList(secs, cfg.roundSec) + '. Set to 0 to turn it off.'
          : `Two beeps once, ${secs} s before the bell — the clapper. Set to 0 to turn it off.`;
    };
    const warnModeField = () => {
      const fld = field('inRoundWarnSec', 'In-round warning (s)');
      f.inRoundWarnSec.addEventListener('input', sayWarn);
      const chips = el('div', { class: 'btn-row', style: { marginBottom: '6px' } });
      const opts = [['before-end', 'Before the bell'], ['interval', 'Every X seconds']];
      const btns = opts.map(([v, label]) => {
        const b = el('button', { class: 'chip', 'aria-pressed': String(warnMode === v) }, label);
        b.addEventListener('click', () => {
          warnMode = v;
          btns.forEach((o, i) => o.setAttribute('aria-pressed', String(opts[i][0] === v)));
          sayWarn();
        });
        return b;
      });
      chips.append(...btns);
      fld.insertBefore(chips, f.inRoundWarnSec);
      fld.append(warnHelp);
      sayWarn();
      return fld;
    };

    let audioMode = ({ mix: 'ambient', exclusive: 'playback' })[cfg.audioMode]
      || (['ambient', 'transient', 'playback'].includes(cfg.audioMode) ? cfg.audioMode : 'ambient');
    const audioHelp = el('div', { class: 'li-sub' });
    const audioModeField = () => {
      const wrap = el('div', { class: 'field' });
      const chips = el('div', { class: 'btn-row' });
      const opts = [
        ['ambient', 'Play over other apps'],
        ['transient', 'Interrupt briefly'],
        ['playback', 'Take over the sound'],
      ];
      const say = () => {
        audioHelp.textContent = {
          ambient: 'A podcast keeps playing at full volume and the bell sounds over it. '
            + 'The ringer switch can mute this mode.',
          transient: 'The bell interrupts other audio for as long as it lasts, then hands '
            + 'it back. Some iOS versions go silent under a podcast in this mode.',
          playback: 'The bell ignores the ringer switch, but iOS gives the audio to one '
            + 'app at a time — a podcast will stop.',
        }[audioMode] || '';
        audioHelp.textContent += ' Which of these behaves as described varies by iOS '
          + 'version — More → Sound check plays one of each so you can pick by ear.';
      };
      const btns = opts.map(([v, label]) => {
        const b = el('button', { class: 'chip', 'aria-pressed': String(audioMode === v) }, label);
        b.addEventListener('click', () => {
          audioMode = v;
          btns.forEach((o, i) => o.setAttribute('aria-pressed', String(opts[i][0] === v)));
          setAudioMode(v);        // rebuilds the context in the new category
          say();
        });
        return b;
      });
      chips.append(...btns);
      say();
      wrap.append(chips, audioHelp);
      return wrap;
    };

    // A test that says nothing is indistinguishable from a test that failed,
    // so both buttons report what the audio device actually did.
    const diag = el('div', { class: 'li-sub', style: { marginTop: '6px' } });
    const testTone = async (label, play) => {
      const ok = await primeAudio();
      play();
      const a = audioState();
      diag.textContent = `${label}: context ${a.state}, session ${a.sessionType}.`
        + (ok ? ' If you heard nothing, the ringer switch or volume is the cause.'
              : ' The browser refused to start audio.');
      toast(ok ? `${label} played` : 'Audio could not start', ok ? 'good' : 'bad');
    };

    body.append(
      el('div', { class: 'grid2' },
        field('rounds', 'Rounds'),
        field('roundSec', 'Round length (s)')),
      el('div', { class: 'grid2' },
        field('restSec', 'Rest between rounds (s)'),
        field('prepSec', 'Lead-in before round 1 (s)')),
      el('h3', {}, 'Warnings'),
      warnModeField(),
      field('endWarnSec', 'Round-end warning (s before the bell)',
        'Three sharper beeps right before the round ends.'),
      field('restWarnSec', 'Seconds out (s before the rest ends)',
        'Warns you to get back on the bag before the bell.'),
      el('h3', {}, 'Sound'),
      audioModeField(),
      toggleRow('Sound', cfg.sound, (v) => { cfg.sound = v; }),
      toggleRow('Vibrate', cfg.vibrate, (v) => { cfg.vibrate = v; }),
      el('div', { class: 'note' },
        'The last five seconds of every phase tick audibly regardless, so you always know where you are without looking.'),
      el('div', { class: 'btn-row', style: { marginTop: '12px' } },
        el('button', { onclick: () => testTone('Bell', () => bell(1)) }, 'Test bell'),
        el('button', { onclick: () => testTone('Warning', () => warnBeep(2, 760)) }, 'Test warning')),
      diag,
      audioNote(),
      el('button', { class: 'btn-primary btn-block', style: { marginTop: '12px' }, onclick: () => {
        const next = { ...cfg, inRoundWarnMode: warnMode, audioMode };
        for (const [k, inp] of Object.entries(f)) {
          const v = Math.round(parseNum(inp));
          if (!Number.isNaN(v) && v >= 0) next[k] = v;
        }
        if (!(next.rounds > 0)) { toast('At least one round', 'bad'); return; }
        if (!(next.roundSec > 0)) { toast('Rounds need a length', 'bad'); return; }
        if (next.endWarnSec >= next.roundSec) {
          toast('The round-end warning has to fall inside the round', 'bad'); return;
        }
        if (next.inRoundWarnSec >= next.roundSec) {
          toast(warnMode === 'interval'
            ? 'An interval that long never comes round inside a round'
            : 'The in-round warning has to fall inside the round', 'bad');
          return;
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

/** The marks an interval warning lands on, as a readable list. */
function markList(every, roundSec) {
  const out = [];
  for (let t = every; t < roundSec && out.length < 6; t += every) out.push(fmtClock(t));
  if (!out.length) return 'nowhere inside the round';
  const more = every * (out.length + 1) < roundSec ? ', …' : '';
  return out.join(', ') + more;
}

/** One sentence describing exactly what this timer will do. */
export function describeConfig(cfg) {
  const warn = !(cfg.inRoundWarnSec > 0) ? 'No in-round warning.'
    : cfg.inRoundWarnMode === 'interval'
      ? `Warning every ${cfg.inRoundWarnSec} s from the start of the round (${markList(cfg.inRoundWarnSec, cfg.roundSec)}).`
      : `Warning at ${cfg.inRoundWarnSec} s left.`;
  return `${cfg.rounds} × ${fmtClock(cfg.roundSec)} with ${fmtClock(cfg.restSec)} rest. `
    + `${warn} Round-end warning at ${cfg.endWarnSec} s, and ${cfg.restWarnSec} s before the next round.`;
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
