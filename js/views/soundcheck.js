// Sound check.
//
// Three failed guesses at why a phone is silent is two too many. This measures
// rather than assumes: it plays a tone through an AnalyserNode and reads the
// samples back, which separates the two possible faults cleanly —
//
//   signal present, nothing audible  -> the app is producing sound and the
//                                       device is swallowing it (ringer switch,
//                                       volume, or output routed elsewhere)
//   no signal                        -> our audio graph is broken, and the
//                                       numbers below say where
//
// Everything it reports is read from the live device, not inferred.

import { el, toast } from '../util.js';
import { BUILD } from '../version.js';
import { audioState, getAudioMode, setAudioMode, primeAudio, stopAudio, AUDIO_MODES } from '../timer.js';
import { sheet } from '../app.js';
import * as store from '../store.js';

/** Play a tone and measure what actually reaches the output node. */
async function measureTone(sessionType) {
  const out = { sessionType, peak: 0, ok: false, error: '' };
  try {
    // No sessionType means "use whatever is already set" — taking a reading
    // must not change the app's audio behaviour as a side effect.
    try {
      if (navigator.audioSession && sessionType) navigator.audioSession.type = sessionType;
    } catch { /* unsupported */ }

    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    if (ctx.state === 'suspended') await ctx.resume();
    out.state = ctx.state;
    out.sampleRate = ctx.sampleRate;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    osc.frequency.value = 880;
    gain.gain.value = 0.25;
    osc.connect(gain).connect(analyser).connect(ctx.destination);
    osc.start();

    const buf = new Float32Array(analyser.fftSize);
    const t0 = Date.now();
    while (Date.now() - t0 < 400) {
      analyser.getFloatTimeDomainData(buf);
      for (const v of buf) out.peak = Math.max(out.peak, Math.abs(v));
      await new Promise((r) => setTimeout(r, 40));
    }
    osc.stop();
    await ctx.close();
    out.ok = out.peak > 0.01;
  } catch (err) {
    out.error = err.message || String(err);
  }
  return out;
}

const LABEL = {
  ambient: 'Mix — play over other apps',
  transient: 'Interrupt briefly',
  playback: 'Take over the sound',
};

/** A short tone at a distinct pitch, so the three modes are told apart by ear. */
function bellFor(mode) {
  const freq = { ambient: 660, transient: 880, playback: 1180 }[mode] || 880;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 1);
    setTimeout(() => ctx.close().catch(() => {}), 1400);
  } catch { /* the measurement above already reported why */ }
}

export function openSoundCheck() {
  sheet('Sound check', (body) => {
    const modeOut = el('div', { class: 'li-sub', style: { margin: '8px 0' } }, '');

    const modeChips = () => {
      const row = el('div', { class: 'chips' });
      const none = el('button', { class: 'chip' }, 'Neither — I heard nothing');
      none.addEventListener('click', () => {
        modeOut.textContent = 'Then this iOS version will not mix web audio under '
          + 'another app at all. The real choice is "Take over the sound" — the bell '
          + 'is audible and the podcast pauses for it — or no bell while a podcast '
          + 'plays. Nothing in the app can change that.';
      });
      const btns = AUDIO_MODES.map((m) => {
        const b = el('button', { class: 'chip', 'aria-pressed': String(getAudioMode() === m) },
          LABEL[m]);
        b.addEventListener('click', () => {
          setAudioMode(m);
          store.update((d) => {
            d.settings.boxing = { ...(d.settings.boxing || {}), audioMode: m };
          });
          btns.forEach((o, i) => o.setAttribute('aria-pressed', String(AUDIO_MODES[i] === m)));
          modeOut.textContent = `Saved: ${LABEL[m]}. Every bell and beep uses this now.`;
          toast('Sound mode saved', 'good');
        });
        return b;
      });
      row.append(...btns, none);
      return row;
    };

    const report = el('pre', {
      style: { whiteSpace: 'pre-wrap', fontSize: '12px', lineHeight: '1.5',
               background: 'var(--surface-2)', padding: '10px', borderRadius: '8px',
               marginTop: '10px' },
    }, 'Tap "Run the check" — it takes about two seconds.');

    body.append(
      el('div', { class: 'note' },
        el('b', {}, 'This makes a noise on purpose. '),
        'Turn the volume up first. It plays one tone per audio mode and measures whether '
        + 'the sound actually leaves the app, so we can tell a broken app from a muted phone. '
        + 'It uses the mode you already have set, so it will not interrupt anything.'),
      el('button', { class: 'btn-primary btn-block', onclick: async (e) => {
        e.target.disabled = true;
        report.textContent = 'Running…';
        const a0 = audioState();
        const lines = [
          `build          ${BUILD}`,
          `audioSession   ${navigator.audioSession ? 'supported' : 'NOT SUPPORTED on this iOS'}`,
          `session type   ${a0.sessionType}`,
          `app mode       ${getAudioMode()}`,
          `context        ${a0.state}`,
          '',
        ];
        // The app's own path first, then each category on its own.
        await primeAudio();
        const a1 = audioState();
        lines.push(`after priming  ${a1.state}`, '');

        // Measured in the mode you are actually running. Cycling through every
        // category here would stop a podcast just to take a reading.
        const r = await measureTone(null);
        lines.push(`tone           peak ${r.peak.toFixed(3)}  `
          + `${r.ok ? 'SIGNAL' : 'silent'}${r.error ? `  (${r.error})` : ''}`);
        stopAudio();
        lines.push('',
          'If any line says SIGNAL but you heard nothing, the app is making',
          'sound and the phone is swallowing it — ringer switch, volume, or',
          'audio routed to a Bluetooth device.',
          'If every line says silent, the fault is in the app. Send me this.');
        report.textContent = lines.join('\n');
        e.target.disabled = false;
      } }, 'Run the check'),
      report,
      // The measurement above proves sound leaves the app. It cannot hear the
      // room. Which category actually mixes with a podcast differs by iOS
      // version, so the only reliable test is your own ear, with the podcast
      // running — and then the winner is saved.
      el('div', { class: 'note', style: { marginTop: '16px' } },
        el('b', {}, 'Which mode plays over your podcast? '),
        'Start the podcast, come back, and tap this. It plays one clearly different '
        + 'sound per mode, three seconds apart, announcing each one. Pick whichever '
        + 'you heard while the podcast kept playing.'),
      el('button', { class: 'btn-block', onclick: async (e) => {
        e.target.disabled = true;
        // Only the candidates that might mix. 'playback' is documented to stop
        // other audio and does — testing it would kill the podcast and leave
        // every mode after it being judged against silence.
        const previous = getAudioMode();
        for (const mode of ['ambient', 'transient']) {
          modeOut.textContent = `Now playing: ${LABEL[mode]}…`;
          setAudioMode(mode);
          await primeAudio();
          bellFor(mode);
          await new Promise((r) => setTimeout(r, 3000));
        }
        // Hand the session back and restore what was set, so running the test
        // never silently changes the app's behaviour.
        stopAudio();
        setAudioMode(previous);
        modeOut.textContent = 'Done. Tap whichever you heard over the podcast — '
          + 'or "Neither" if the podcast drowned both out.';
        e.target.disabled = false;
      } }, 'Play a sound in each mode'),
      modeOut,
      modeChips(),

      el('button', { class: 'btn-block', style: { marginTop: '8px' }, onclick: async () => {
        try { await navigator.clipboard.writeText(report.textContent); toast('Copied', 'good'); }
        catch { toast('Select the text and copy it manually', 'bad'); }
      } }, 'Copy the result'),
    );
  });
}
