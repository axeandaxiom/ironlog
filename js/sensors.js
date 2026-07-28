// Phone sensors for the Movement Lab.
//
// What this is and is not:
//
// This is a phone accelerometer sampled at roughly 60 Hz. It is not a force
// plate and it is not a 3D motion-capture rig. Three things are genuinely
// measurable this way and are implemented here; anything beyond them would be
// a number with no meaning behind it.
//
//   1. Flight time  -> jump height, via h = g·t²/8. In free fall the measured
//      acceleration collapses to ~0, which is an unambiguous signal. At 60 Hz
//      the timing resolution is ±16.7 ms, which for a 0.5 s flight works out
//      at roughly ±2 cm of jump height. Good enough to track a trend across
//      months; not good enough to argue about 1 cm.
//
//   2. Postural sway -> acceleration-domain sway metrics. These have good
//      relative validity (comparing you to you, and left to right) and no
//      absolute meaning. Do not compare them to a published norm from a
//      force plate.
//
//   3. Joint angle -> the phone as a gravity-referenced inclinometer, which is
//      accurate to about 2–3° and is the same physical principle as the
//      digital inclinometers used in clinic. Angles are measured against a
//      zeroed reference position, so the sign conventions and mounting
//      orientation cancel out.
//
// Camera-based pose estimation is deliberately absent. See README.

const G = 9.80665;

export const support = {
  motion: typeof DeviceMotionEvent !== 'undefined',
  needsPermission: typeof DeviceMotionEvent !== 'undefined'
    && typeof DeviceMotionEvent.requestPermission === 'function',
  secure: window.isSecureContext,
  wakeLock: 'wakeLock' in navigator,
};

let permissionState = 'unknown'; // unknown | granted | denied | unavailable

export function motionPermission() {
  return permissionState;
}

/**
 * iOS 13+ requires an explicit grant, and it must be triggered from a user
 * gesture. Call this straight out of a click handler or it silently fails.
 */
export async function requestMotion() {
  if (!support.motion) {
    permissionState = 'unavailable';
    return { ok: false, reason: 'This device or browser does not expose motion sensors.' };
  }
  if (!support.secure) {
    permissionState = 'denied';
    return { ok: false, reason: 'Motion sensors need HTTPS. Serve the app over https:// or localhost.' };
  }
  if (!support.needsPermission) {
    permissionState = 'granted';
    return { ok: true };
  }
  try {
    const res = await DeviceMotionEvent.requestPermission();
    permissionState = res === 'granted' ? 'granted' : 'denied';
    return res === 'granted'
      ? { ok: true }
      : { ok: false, reason: 'Motion access was declined. Reload the page to be asked again.' };
  } catch (err) {
    permissionState = 'denied';
    return { ok: false, reason: `Could not request motion access: ${err.message}` };
  }
}

/**
 * Buffered motion recorder.
 * Samples accelerationIncludingGravity (always present) and acceleration
 * (linear, absent on some Androids — we high-pass the former as a fallback).
 */
export class MotionRecorder {
  constructor({ maxSeconds = 60 } = {}) {
    this.samples = [];
    this.maxSamples = Math.ceil(maxSeconds * 100);
    this.running = false;
    this.t0 = 0;
    this._handler = this._onMotion.bind(this);
    this.onSample = null;
  }

  _onMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    const t = performance.now() - this.t0;
    const lin = e.acceleration && e.acceleration.x != null ? e.acceleration : null;
    const s = {
      t: t / 1000,
      gx: a.x, gy: a.y, gz: a.z,
      mag: Math.hypot(a.x, a.y, a.z),
      lx: lin ? lin.x : null, ly: lin ? lin.y : null, lz: lin ? lin.z : null,
    };
    this.samples.push(s);
    if (this.samples.length > this.maxSamples) this.samples.shift();
    if (this.onSample) this.onSample(s);
  }

  start() {
    if (this.running) return;
    this.samples = [];
    this.t0 = performance.now();
    this.running = true;
    window.addEventListener('devicemotion', this._handler);
  }

  stop() {
    if (!this.running) return this.samples;
    window.removeEventListener('devicemotion', this._handler);
    this.running = false;
    return this.samples;
  }

  /** Effective sample rate — worth showing, because it bounds the accuracy. */
  get hz() {
    if (this.samples.length < 2) return 0;
    const span = this.samples.at(-1).t - this.samples[0].t;
    return span > 0 ? this.samples.length / span : 0;
  }
}

// ---------------------------------------------------------------------------
// Jump analysis
// ---------------------------------------------------------------------------

/**
 * Find the flight phase and derive jump height.
 *
 * The signal we key on is free fall: once both feet leave the ground the
 * accelerometer measures close to zero, and the transitions in and out of that
 * state are sharp. Everything else in the trace — the countermovement dip, the
 * push-off spike — is used only to locate the right free-fall window when
 * there are several.
 */
export function analyseJump(samples, { minFlight = 0.15, maxFlight = 1.2 } = {}) {
  if (samples.length < 20) {
    return { ok: false, reason: 'Not enough data. Hold still, then jump once.' };
  }
  const hz = samples.length / (samples.at(-1).t - samples[0].t);
  if (hz < 25) {
    return { ok: false, reason: `Sample rate too low (${hz.toFixed(0)} Hz). Close other tabs and try again.` };
  }

  // Resting magnitude, taken from the quietest half-second in the trace.
  const baseline = restingMagnitude(samples);
  const freeFallThresh = baseline * 0.35;
  const impactThresh = baseline * 1.5;

  // Collect every candidate free-fall window.
  const windows = [];
  let start = null;
  for (let i = 0; i < samples.length; i++) {
    const below = samples[i].mag < freeFallThresh;
    if (below && start === null) start = i;
    if (!below && start !== null) {
      windows.push([start, i]);
      start = null;
    }
  }
  if (start !== null) windows.push([start, samples.length - 1]);

  const valid = windows
    .map(([a, b]) => ({ a, b, dur: samples[b].t - samples[a].t }))
    .filter((w) => w.dur >= minFlight && w.dur <= maxFlight);

  if (valid.length === 0) {
    return {
      ok: false,
      reason: 'No flight phase found. Keep the phone tight against your body, stand still for a second first, then jump.',
      hz,
    };
  }

  // The real jump is the longest free-fall window.
  const flight = valid.sort((x, y) => y.dur - x.dur)[0];
  const t = flight.dur;
  const height = (G * t * t) / 8;

  // Timing quantisation dominates the error budget at these rates.
  const dt = 1 / hz;
  const heightErr = (G * t * dt) / 4;

  // Contact time before takeoff, for drop jumps: the span between the landing
  // impact of the drop and the takeoff, i.e. the previous high-force window.
  let contactTime = null;
  let prevImpact = null;
  for (let i = flight.a - 1; i > 0; i--) {
    if (samples[i].mag > impactThresh) { prevImpact = i; break; }
  }
  if (prevImpact != null) {
    // Walk back to where the impact started.
    let s = prevImpact;
    while (s > 0 && samples[s].mag > baseline * 1.1) s--;
    contactTime = samples[flight.a].t - samples[s].t;
    if (contactTime > 1.5 || contactTime < 0.08) contactTime = null;
  }

  const peakAccel = Math.max(...samples.slice(Math.max(0, flight.a - 40), flight.a).map((s) => s.mag));

  return {
    ok: true,
    hz,
    flightTime: t,
    heightCm: height * 100,
    heightErrCm: heightErr * 100,
    contactTimeMs: contactTime != null ? contactTime * 1000 : null,
    // Reactive Strength Index — only meaningful for a drop jump, where the
    // contact time is a deliberate part of the test.
    rsi: contactTime != null ? height / contactTime : null,
    peakAccelG: peakAccel / G,
    windowCount: valid.length,
    trace: samples.map((s) => ({ t: s.t, m: s.mag })),
  };
}

function restingMagnitude(samples) {
  // Slide a half-second window and take the one with the least variation.
  const hz = samples.length / (samples.at(-1).t - samples[0].t);
  const w = Math.max(5, Math.round(hz * 0.5));
  let best = null;
  for (let i = 0; i + w < samples.length; i += Math.max(1, Math.floor(w / 4))) {
    const slice = samples.slice(i, i + w).map((s) => s.mag);
    const m = slice.reduce((a, b) => a + b, 0) / slice.length;
    const v = slice.reduce((a, b) => a + (b - m) ** 2, 0) / slice.length;
    if (best === null || v < best.v) best = { v, m };
  }
  // Fall back to standard gravity if the whole trace is noisy.
  return best && best.m > 5 && best.m < 15 ? best.m : G;
}

// ---------------------------------------------------------------------------
// Balance / postural sway
// ---------------------------------------------------------------------------

/**
 * Sway metrics from trunk-mounted acceleration.
 *
 * Hold the phone flat against the sternum, or tuck it into the waistband at
 * the small of the back. The vertical axis is found from gravity, and the two
 * remaining orthogonal axes are reported as the horizontal sway plane.
 *
 * All units are acceleration-domain. They compare you to you. They do not
 * compare to force-plate norms and the app never claims they do.
 */
export function analyseSway(samples, { trimSeconds = 1 } = {}) {
  const usable = samples.filter((s) => s.t >= trimSeconds);
  if (usable.length < 60) {
    return { ok: false, reason: 'Hold the position for at least a few seconds.' };
  }
  const duration = usable.at(-1).t - usable[0].t;
  const hz = usable.length / duration;

  // Mean gravity vector defines "up" for this trial.
  const gv = ['gx', 'gy', 'gz'].map((k) => usable.reduce((a, s) => a + s[k], 0) / usable.length);
  const gmag = Math.hypot(...gv) || G;
  const up = gv.map((v) => v / gmag);

  // Build two orthogonal horizontal axes from the vertical.
  const seed = Math.abs(up[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const h1 = normalise(cross(up, seed));
  const h2 = normalise(cross(up, h1));

  const proj = usable.map((s) => {
    const v = [s.gx, s.gy, s.gz];
    // Remove the gravity component; what is left is body acceleration.
    const vertical = dot(v, up);
    const resid = v.map((c, i) => c - vertical * up[i]);
    return { t: s.t, a: dot(resid, h1), b: dot(resid, h2) };
  });

  const ma = mean(proj.map((p) => p.a));
  const mb = mean(proj.map((p) => p.b));
  const ca = proj.map((p) => p.a - ma);
  const cb = proj.map((p) => p.b - mb);

  const rmsA = Math.sqrt(mean(ca.map((x) => x * x)));
  const rmsB = Math.sqrt(mean(cb.map((x) => x * x)));
  const rmsResultant = Math.sqrt(mean(ca.map((x, i) => x * x + cb[i] * cb[i])));

  // Normalised path length: total excursion in the acceleration plane per
  // second. Lower is steadier.
  let path = 0;
  for (let i = 1; i < proj.length; i++) {
    path += Math.hypot(ca[i] - ca[i - 1], cb[i] - cb[i - 1]);
  }
  const pathPerSec = path / duration;

  // 95 % confidence ellipse of the acceleration scatter (χ², 2 df).
  const vAA = mean(ca.map((x) => x * x));
  const vBB = mean(cb.map((x) => x * x));
  const vAB = mean(ca.map((x, i) => x * cb[i]));
  const det = Math.max(0, vAA * vBB - vAB * vAB);
  const ellipse = 5.991 * Math.PI * Math.sqrt(det);

  return {
    ok: true,
    hz,
    duration,
    rmsML: rmsA,
    rmsAP: rmsB,
    rmsResultant,
    pathPerSec,
    ellipseArea: ellipse,
    samples: proj.length,
  };
}

// ---------------------------------------------------------------------------
// Inclinometer / range of motion
// ---------------------------------------------------------------------------

/**
 * Live gravity-referenced angle reader.
 *
 * Zeroing is what makes this robust: browsers disagree about the sign and
 * axis order of accelerationIncludingGravity, so instead of trusting any
 * convention we capture a reference gravity vector in the starting position
 * and report the angle between that and the current one. That is exactly how
 * a clinical inclinometer is used — zero on the reference segment, then move.
 */
export class Inclinometer {
  constructor({ smoothing = 0.15 } = {}) {
    this.ref = null;
    this.current = null;
    this.smoothing = smoothing;
    this.peak = 0;
    this.onAngle = null;
    this.settled = false;
    this._handler = this._onMotion.bind(this);
    this._recent = [];
  }

  _onMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    const raw = [a.x, a.y, a.z];
    const mag = Math.hypot(...raw);
    if (mag < 5 || mag > 15) return;   // moving too fast to read an angle
    const unit = raw.map((v) => v / mag);

    this.current = this.current
      ? this.current.map((v, i) => v + (unit[i] - v) * (1 - this.smoothing))
      : unit;

    // "Settled" means the reading has been stable long enough to trust —
    // shown in the UI so you know when to record.
    this._recent.push(unit);
    if (this._recent.length > 15) this._recent.shift();
    if (this._recent.length === 15) {
      const spread = Math.max(...this._recent.map((u) => angleBetween(u, this.current)));
      this.settled = spread < 1.5;
    }

    if (this.ref) {
      const ang = angleBetween(this.ref, this.current);
      if (ang > this.peak) this.peak = ang;
      if (this.onAngle) this.onAngle(ang, this.settled);
    } else if (this.onAngle) {
      this.onAngle(null, this.settled);
    }
  }

  start() {
    window.addEventListener('devicemotion', this._handler);
  }

  stop() {
    window.removeEventListener('devicemotion', this._handler);
  }

  /** Capture the current orientation as 0°. */
  zero() {
    if (!this.current) return false;
    this.ref = [...this.current];
    this.peak = 0;
    return true;
  }

  get angle() {
    return this.ref && this.current ? angleBetween(this.ref, this.current) : null;
  }
}

function angleBetween(u, v) {
  const d = Math.min(1, Math.max(-1, dot(u, v)));
  return (Math.acos(d) * 180) / Math.PI;
}

// ---------------------------------------------------------------------------
// Screen wake lock — the app is useless mid-set if the screen sleeps.
// ---------------------------------------------------------------------------

let wakeLock = null;

export async function keepAwake(on) {
  if (!('wakeLock' in navigator)) return false;
  try {
    if (on && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
      // Re-acquire after the tab is backgrounded and comes back.
      document.addEventListener('visibilitychange', reacquire);
      return true;
    }
    if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
      document.removeEventListener('visibilitychange', reacquire);
    }
  } catch {
    return false;
  }
  return !!wakeLock;
}

async function reacquire() {
  if (document.visibilityState === 'visible' && !wakeLock) {
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalise = (v) => {
  const m = Math.hypot(...v) || 1;
  return v.map((x) => x / m);
};
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
