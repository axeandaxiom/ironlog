// Boxing round timer.
//
// Deliberately separate from the rest clock in app.js: a rest clock counts one
// interval, a round timer runs a whole session of work/rest phases with
// warnings inside them, and it has to stay accurate while the screen is off
// and the phone is in your pocket.
//
// Timing is taken from Date.now() at every tick rather than accumulated from
// rAF deltas. Browsers throttle timers in a backgrounded tab, so anything that
// adds up deltas drifts — sometimes by minutes over a twelve-round session.
// Reading the wall clock means a throttled tab is merely displayed late, never
// wrong.

export const DEFAULT_BOXING = {
  rounds: 12,
  roundSec: 180,
  restSec: 60,
  prepSec: 10,
  // Seconds before the end of the round for the first warning — the clapper
  // most gyms give you at the 30-second mark.
  inRoundWarnSec: 30,
  // 'before-end' reads inRoundWarnSec as seconds before the bell and fires
  // once. 'interval' reads it as a period and fires every that-many seconds
  // from the start of the round — a change-of-technique call rather than a
  // clapper. The bell owns the last moment either way.
  inRoundWarnMode: 'before-end',
  // Second warning, right before the bell.
  endWarnSec: 10,
  // Warning before the rest ends, so you are back on the bag for the bell.
  restWarnSec: 10,
  sound: true,
  vibrate: true,
};

export const PHASES = { prep: 'Get ready', work: 'Work', rest: 'Rest', done: 'Done' };

export class RoundTimer {
  constructor(cfg = {}) {
    this.cfg = { ...DEFAULT_BOXING, ...cfg };
    this.onTick = null;      // (state) => void
    this.onEvent = null;     // (name, state) => void
    this.reset();
  }

  reset() {
    this.phase = this.cfg.prepSec > 0 ? 'prep' : 'work';
    this.round = 1;
    this.running = false;
    this.phaseStart = 0;
    this.elapsedInPhase = 0;
    this._fired = new Set();
    this._warnMark = 0;
    this._iv = null;
    this._emitTick();
  }

  get phaseLength() {
    if (this.phase === 'prep') return this.cfg.prepSec;
    if (this.phase === 'work') return this.cfg.roundSec;
    if (this.phase === 'rest') return this.cfg.restSec;
    return 0;
  }

  get remaining() {
    return Math.max(0, this.phaseLength - this._elapsed());
  }

  _elapsed() {
    if (!this.running) return this.elapsedInPhase;
    return this.elapsedInPhase + (Date.now() - this.phaseStart) / 1000;
  }

  /** Total work time completed so far, for the log. */
  get workSecondsDone() {
    // Once finished, every round is complete — deriving from `round` here
    // would report the last round as unfinished.
    if (this.phase === 'done') return this.cfg.rounds * this.cfg.roundSec;
    const full = (this.round - 1) * this.cfg.roundSec;
    const current = this.phase === 'work'
      ? Math.min(this._elapsed(), this.cfg.roundSec)
      : this.phase === 'rest' ? this.cfg.roundSec : 0;
    return Math.round(full + current);
  }

  get roundsCompleted() {
    if (this.phase === 'done') return this.cfg.rounds;
    // A round counts once you are past it — resting after round 3 means 3 done.
    return this.phase === 'rest' ? this.round : this.round - 1;
  }

  start() {
    if (this.running || this.phase === 'done') return;
    this.running = true;
    this.phaseStart = Date.now();
    this._emit('start');
    if (this.phase === 'work' && this._elapsed() < 0.5) this._emit('bell');
    this._loop();
  }

  pause() {
    if (!this.running) return;
    this.elapsedInPhase = this._elapsed();
    this.running = false;
    this._clear();
    this._emitTick();
    this._emit('pause');
  }

  toggle() {
    this.running ? this.pause() : this.start();
  }

  /** Jump straight to the next phase — a skipped round or a cut rest. */
  skip() {
    this._advance();
  }

  stop() {
    this.running = false;
    this._clear();
    document.removeEventListener('visibilitychange', this._onVisible);
  }

  _clear() {
    clearInterval(this._iv);
    this._iv = null;
  }

  /**
   * Driven by setInterval, deliberately not by requestAnimationFrame.
   *
   * rAF delivers exactly zero frames while the page is hidden — screen off,
   * app switched away, phone in your pocket — which would stop the bells dead
   * in the middle of a round. setInterval is throttled in the background but
   * it keeps firing, and because every tick recomputes from the wall clock,
   * a throttled tick is merely late, never wrong.
   */
  _loop() {
    this._clear();
    this._onVisible = () => {
      // Catch up the instant we are visible again, rather than waiting for
      // the next scheduled tick.
      if (document.visibilityState === 'visible' && this.running) {
        this._check();
        this._emitTick();
      }
    };
    document.addEventListener('visibilitychange', this._onVisible);
    this._iv = setInterval(() => {
      if (!this.running) { this._clear(); return; }
      this._check();
      this._emitTick();
    }, 200);
    this._check();
    this._emitTick();
  }

  _check() {
    const left = this.remaining;

    if (this.phase === 'work') {
      // Warnings fire once each, and only when they are actually inside the
      // round — a 30-second warning on a 20-second round would be noise.
      const { inRoundWarnSec, endWarnSec, inRoundWarnMode } = this.cfg;
      if (inRoundWarnSec > 0 && inRoundWarnSec < this.cfg.roundSec) {
        if (inRoundWarnMode === 'interval') {
          // Count marks from the start of the round rather than a single
          // trigger near the end. If the phone was asleep across several
          // marks we fire once on waking, not a burst of catch-up beeps.
          const mark = Math.floor((this.cfg.roundSec - left) / inRoundWarnSec + 1e-6);
          // Skip a mark that lands on the bell — the bell already says that.
          if (mark > this._warnMark && left > 0.75) {
            this._warnMark = mark;
            this._emit('warn');
          }
        } else if (left <= inRoundWarnSec && !this._fired.has('warn')) {
          this._fired.add('warn');
          this._emit('warn');
        }
      }
      if (endWarnSec > 0 && endWarnSec < this.cfg.roundSec
          && left <= endWarnSec && !this._fired.has('endwarn')) {
        this._fired.add('endwarn');
        this._emit('endwarn');
      }
    }

    if (this.phase === 'rest' || this.phase === 'prep') {
      const w = this.phase === 'rest' ? this.cfg.restWarnSec : this.cfg.prepSec;
      if (w > 0 && left <= w && !this._fired.has('restwarn')) {
        this._fired.add('restwarn');
        if (this.phase === 'rest') this._emit('restwarn');
      }
    }

    // Catch up across however many phases actually elapsed. A backgrounded tab
    // stops getting frames, so returning after three minutes must roll through
    // every round that passed rather than advancing a single phase and being
    // permanently behind. The cap stops a pathological gap from spinning.
    let guard = 0;
    while (this.remaining <= 0 && this.phase !== 'done' && guard++ < 200) {
      this._advance();
    }
  }

  _advance() {
    // Carry the overshoot into the next phase instead of discarding it, or
    // every catch-up step would silently add a fraction of a second.
    const over = Math.max(0, this._elapsed() - this.phaseLength);
    this._fired.clear();
    this._warnMark = 0;
    this.elapsedInPhase = over;
    this.phaseStart = Date.now();

    if (this.phase === 'prep') {
      this.phase = 'work';
      this._emit('bell');
    } else if (this.phase === 'work') {
      this._emit('bell');
      if (this.round >= this.cfg.rounds) {
        this.phase = 'done';
        this.running = false;
        this._clear();
        this._emit('done');
      } else {
        this.phase = this.cfg.restSec > 0 ? 'rest' : 'work';
        if (this.phase === 'work') this.round += 1;
      }
    } else if (this.phase === 'rest') {
      this.round += 1;
      this.phase = 'work';
      this._emit('bell');
    }
    this._emitTick();
  }

  get state() {
    return {
      phase: this.phase,
      phaseLabel: PHASES[this.phase],
      round: Math.min(this.round, this.cfg.rounds),
      rounds: this.cfg.rounds,
      remaining: this.remaining,
      phaseLength: this.phaseLength,
      running: this.running,
      roundsCompleted: this.roundsCompleted,
      workSecondsDone: this.workSecondsDone,
    };
  }

  _emitTick() { if (this.onTick) this.onTick(this.state); }
  _emit(name) { if (this.onEvent) this.onEvent(name, this.state); }
}

// ---------------------------------------------------------------------------
// Sound
//
// Synthesised rather than sampled: no audio files to cache, no licensing, and
// it works offline by construction. The bell is a struck-metal approximation —
// a few inharmonic partials with a long decay.
// ---------------------------------------------------------------------------

let ctx = null;
let keepAlive = null;

/**
 * Getting sound out of an iPhone is three separate fights, not one.
 *
 *  1. The context starts suspended and only a real user gesture may resume it.
 *  2. Web Audio defaults to the "ambient" audio session, which the hardware
 *     ringer switch mutes. iOS 16.4+ exposes navigator.audioSession, so we ask
 *     for "playback" and the switch stops mattering. Below that version it
 *     genuinely cannot be worked around — the switch wins, and the UI says so.
 *  3. An idle context gets suspended by the system. A three-minute round is a
 *     long idle gap, so a silent looping source holds the session open; without
 *     it the bell at the end of round one plays and nothing after it does.
 */
// 'mix' lets other apps keep playing and ducks them for the bell; 'exclusive'
// beats the ringer switch but takes the audio session away from them. Changing
// it rebuilds the context, because the category is fixed at construction.
// 'exclusive' is the default and the safe one. The audio session type is set
// on the PAGE, not on our AudioContext, so choosing 'mix' ('transient') put
// every sound the app can make — bells, rest beeps, and the audio track of a
// video you attached to a set — into a category the iOS ringer switch mutes.
// Silence everywhere is a far worse failure than a podcast pausing.
let audioMode = 'exclusive';

/** Apply the category to the page. Safe to call before any context exists. */
function applyAudioSession() {
  try {
    if (navigator.audioSession) {
      navigator.audioSession.type = audioMode === 'mix' ? 'transient' : 'playback';
    }
  } catch { /* not supported; the ringer switch will win */ }
}

// Set at load, so video attached to a set has a sane category even if no
// timer has ever been started in this session.
applyAudioSession();

export function setAudioMode(mode) {
  const next = mode === 'mix' ? 'mix' : 'exclusive';
  if (next === audioMode) return;
  audioMode = next;
  applyAudioSession();
  try { keepAlive?.stop(); } catch { /* already stopped */ }
  keepAlive = null;
  const old = ctx;
  ctx = null;                      // primeAudio builds a fresh one on the next tap
  try { old?.close(); } catch { /* nothing to close */ }
}

export function getAudioMode() { return audioMode; }

export async function primeAudio() {
  try {
    // Order matters: the audio session category is fixed when the context is
    // constructed, so asking for a category afterwards leaves an already-built
    // context in the one it was born with.
    //
    // The two categories are a genuine either/or on iOS and you have to pick:
    //   'playback'  ignores the ringer switch but takes the session
    //               exclusively, which is what stops a podcast dead. Default.
    //   'transient' ducks other apps instead of stopping them — but the
    //               ringer switch mutes it, and it mutes video audio too.
    applyAudioSession();
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') await ctx.resume();
    // A phone call, a podcast starting, or Siri suspends the context out from
    // under us and every bell after that point is silent. Resume the moment it
    // happens rather than waiting for the next user tap, which may never come
    // in the middle of a twelve-round session.
    if (!ctx._ilWatched) {
      ctx._ilWatched = true;
      ctx.addEventListener('statechange', () => {
        if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
          ctx.resume().catch(() => {});
        }
      });
    }
    startKeepAlive();
    return ctx.state === 'running';
  } catch {
    return false;
  }
}

function startKeepAlive() {
  if (keepAlive || !ctx) return;
  try {
    const buf = ctx.createBuffer(1, Math.round(ctx.sampleRate), ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = 0.0001;          // inaudible, but output all the same
    src.connect(g).connect(ctx.destination);
    src.start();
    keepAlive = src;
  } catch { /* best effort */ }
}

export function stopAudio() {
  try { keepAlive?.stop(); } catch { /* already stopped */ }
  keepAlive = null;
}

/** What the UI needs to tell you honestly whether you will hear anything. */
export function audioState() {
  return {
    started: !!ctx,
    running: ctx?.state === 'running',
    // Surfaced in the settings sheet so a silent phone can be diagnosed from
    // what the device actually reports rather than guessed at.
    state: ctx ? ctx.state : 'not created',
    sessionType: (typeof navigator !== 'undefined' && navigator.audioSession)
      ? (navigator.audioSession.type || 'unset') : 'unavailable',
    // Below iOS 16.4 the ringer switch mutes Web Audio and nothing can change it.
    canBeatSilentSwitch: typeof navigator !== 'undefined' && !!navigator.audioSession,
    // Vibration is not implemented in Safari on iOS at all.
    canVibrate: typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function',
  };
}

// The system suspends the context whenever the app goes to the background.
// Resume the moment it comes back, or every remaining bell is silent.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ctx?.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  });
}

function tone(freq, start, dur, gain = 0.25, type = 'sine') {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(start);
  o.stop(start + dur + 0.02);
}

/** A boxing bell: inharmonic partials, long ring. */
export function bell(strikes = 1) {
  // Never awaited: a bell is fired from a timer tick, and by then the context
  // was already primed by the tap on Start.
  if (!ctx || ctx.state !== 'running') { primeAudio(); if (!ctx) return; }
  const base = ctx.currentTime;
  for (let s = 0; s < strikes; s++) {
    const t = base + s * 0.42;
    // Ratios chosen to sound struck rather than musical.
    [1, 2.76, 5.4, 8.9].forEach((r, i) => {
      tone(520 * r, t, 1.6 - i * 0.28, 0.3 / (i + 1.4), 'sine');
    });
  }
}

/** Warning: a short, hard double beep that cuts through a gym. */
export function warnBeep(count = 2, freq = 880) {
  if (!ctx || ctx.state !== 'running') { primeAudio(); if (!ctx) return; }
  const base = ctx.currentTime;
  for (let i = 0; i < count; i++) {
    tone(freq, base + i * 0.18, 0.12, 0.3, 'square');
  }
}

/** A single tick, for the last few seconds. */
export function tick(freq = 1200) {
  if (!ctx || ctx.state !== 'running') return;
  tone(freq, ctx.currentTime, 0.05, 0.18, 'square');
}
