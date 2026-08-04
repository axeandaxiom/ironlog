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
import { audioState, getAudioMode, primeAudio } from '../timer.js';
import { sheet } from '../app.js';

/** Play a tone and measure what actually reaches the output node. */
async function measureTone(sessionType) {
  const out = { sessionType, peak: 0, ok: false, error: '' };
  try {
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

export function openSoundCheck() {
  sheet('Sound check', (body) => {
    const report = el('pre', {
      style: { whiteSpace: 'pre-wrap', fontSize: '12px', lineHeight: '1.5',
               background: 'var(--surface-2)', padding: '10px', borderRadius: '8px',
               marginTop: '10px' },
    }, 'Tap "Run the check" — it takes about two seconds.');

    body.append(
      el('div', { class: 'note' },
        el('b', {}, 'This makes a noise on purpose. '),
        'Turn the volume up first. It plays one tone per audio mode and measures whether '
        + 'the sound actually leaves the app, so we can tell a broken app from a muted phone.'),
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

        for (const type of ['playback', 'transient', 'ambient', null]) {
          const r = await measureTone(type);
          lines.push(
            `${(type || 'default').padEnd(14)} peak ${r.peak.toFixed(3)}  `
            + `${r.ok ? 'SIGNAL' : 'silent'}${r.error ? `  (${r.error})` : ''}`);
        }
        lines.push('',
          'If any line says SIGNAL but you heard nothing, the app is making',
          'sound and the phone is swallowing it — ringer switch, volume, or',
          'audio routed to a Bluetooth device.',
          'If every line says silent, the fault is in the app. Send me this.');
        report.textContent = lines.join('\n');
        e.target.disabled = false;
      } }, 'Run the check'),
      report,
      el('button', { class: 'btn-block', style: { marginTop: '8px' }, onclick: async () => {
        try { await navigator.clipboard.writeText(report.textContent); toast('Copied', 'good'); }
        catch { toast('Select the text and copy it manually', 'bad'); }
      } }, 'Copy the result'),
    );
  });
}
