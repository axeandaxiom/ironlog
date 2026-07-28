// Movement Lab — test definitions, custom test schema, and result analysis.
//
// `mode` decides which measurement path a test uses:
//   jump    - MotionRecorder + analyseJump (flight time)
//   sway    - MotionRecorder + analyseSway (postural sway)
//   incline - Inclinometer (gravity-referenced joint angle)
//   manual  - you measure it with a tape, a dynamometer or your eyes, and type
//             the number in. Present because half the useful tests in this list
//             cannot honestly be done with an accelerometer, and a manual
//             number that is real beats a sensor number that is invented.
//
// `sides: 'unilateral'` makes the test record left and right separately and
// computes a limb symmetry index. That asymmetry number is the single most
// actionable output in this whole module.

export const TEST_MODES = {
  jump: { label: 'Jump (flight time)', sensor: true, icon: '↑' },
  sway: { label: 'Balance (sway)', sensor: true, icon: '⊙' },
  incline: { label: 'Range of motion (inclinometer)', sensor: true, icon: '∠' },
  manual: { label: 'Manual entry', sensor: false, icon: '✎' },
};

export const TEST_CATEGORIES = ['Jump & Power', 'Balance', 'Range of Motion', 'Strength & Field'];

// Standard metric shapes, reused across tests.
const M = {
  jumpHeight: { key: 'heightCm', label: 'Jump height', unit: 'cm', dp: 1, better: 'up' },
  flightTime: { key: 'flightTime', label: 'Flight time', unit: 's', dp: 3, better: 'up' },
  contact: { key: 'contactTimeMs', label: 'Ground contact', unit: 'ms', dp: 0, better: 'down' },
  rsi: { key: 'rsi', label: 'RSI', unit: 'm/s', dp: 2, better: 'up' },
  swayPath: { key: 'pathPerSec', label: 'Sway path', unit: 'm/s³', dp: 2, better: 'down' },
  swayRms: { key: 'rmsResultant', label: 'Sway RMS', unit: 'm/s²', dp: 3, better: 'down' },
  ellipse: { key: 'ellipseArea', label: '95 % ellipse', unit: '(m/s²)²', dp: 3, better: 'down' },
  angle: { key: 'angle', label: 'Angle', unit: '°', dp: 1, better: 'up' },
};

export const BUILTIN_TESTS = [
  // ---------------------------------------------------------------- jump
  {
    id: 't-cmj', name: 'Countermovement Jump', category: 'Jump & Power', mode: 'jump',
    sides: 'bilateral', reps: 3, durationSec: 12,
    setup: 'Phone tight in a waistband or a zipped front pocket at the hip. Loose in a pocket adds noise and eats the signal.',
    protocol: [
      'Stand still for two full seconds after tapping Start. The app uses this to find your resting baseline.',
      'Dip to roughly a quarter squat in one continuous movement and jump as high as you can.',
      'Arms on the hips throughout — arm swing adds 15–20 % and destroys comparability between sessions.',
      'Land on the same spot with straight-ish legs, then stand still.',
      'Three attempts, full recovery between. The best one counts.',
    ],
    metrics: [M.jumpHeight, M.flightTime],
    why: 'The general-purpose lower-body power test. Tracks what a squat progression is actually buying you, and drops measurably when you are under-recovered — a 5 % fall from your own baseline is a real signal to back off.',
  },
  {
    id: 't-sj', name: 'Squat Jump', category: 'Jump & Power', mode: 'jump',
    sides: 'bilateral', reps: 3, durationSec: 12,
    setup: 'Same phone placement as the countermovement jump.',
    protocol: [
      'Stand still, then sink to a quarter squat and hold it for three seconds.',
      'Jump from the held position with no dip at all. Any countermovement invalidates the test.',
      'Arms on hips. Three attempts.',
    ],
    metrics: [M.jumpHeight, M.flightTime],
    why: 'Concentric power with the stretch-shortening cycle removed. Paired with the countermovement jump it gives you the eccentric utilisation ratio — how much free power your tendons are returning.',
    pairsWith: 't-cmj',
  },
  {
    id: 't-dj', name: 'Drop Jump (RSI)', category: 'Jump & Power', mode: 'jump',
    sides: 'bilateral', reps: 3, durationSec: 12,
    setup: 'A 30 cm box. Phone at the hip.',
    protocol: [
      'Stand on the box, hands on hips.',
      'Step off — do not jump off, and do not drop deliberately. Just step.',
      'On landing, rebound as fast and as high as you can. Minimum ground contact is the point.',
      'Think "hot coals", not "jump high".',
    ],
    metrics: [M.jumpHeight, M.contact, M.rsi],
    why: 'Reactive strength: how well you use a stretch reflex. This is the quality boxing footwork and sprinting depend on, and it is largely independent of how much you squat.',
  },
  {
    id: 't-slcmj', name: 'Single-Leg Countermovement Jump', category: 'Jump & Power', mode: 'jump',
    sides: 'unilateral', reps: 3, durationSec: 12,
    setup: 'Phone at the hip. Test both legs in the same session.',
    protocol: [
      'Stand on one leg, hands on hips, other foot off the floor and not touching.',
      'Dip and jump. Land on the same leg under control.',
      'Three per side. Alternate sides to keep fatigue even.',
    ],
    metrics: [M.jumpHeight, M.flightTime],
    why: 'The bilateral squat hides a weak side completely. This finds it. Under 90 % symmetry is worth investigating; under 85 % is worth addressing before you keep adding weight to the bar.',
  },
  {
    id: 't-rj10', name: 'Repeated Jump — 10 s', category: 'Jump & Power', mode: 'jump',
    sides: 'bilateral', reps: 1, durationSec: 15,
    setup: 'Phone at the hip. Clear space.',
    protocol: [
      'Stand still for two seconds.',
      'Jump continuously for ten seconds — maximum height every rep, minimum contact time.',
      'Stop and stand still.',
      'The app reports the best jump found in the trace; log your own count in the notes.',
    ],
    metrics: [M.jumpHeight, M.contact],
    why: 'Anaerobic power endurance. Relevant if you box. Brutal, and not to be done the day before heavy squats.',
  },

  // ---------------------------------------------------------------- balance
  {
    id: 't-dl-eo', name: 'Double-Leg Stance, Eyes Open', category: 'Balance', mode: 'sway',
    sides: 'bilateral', durationSec: 30,
    setup: 'Phone flat against the sternum, held with both hands, or tucked firmly into the waistband at the small of your back. Same placement every time or the numbers mean nothing.',
    protocol: [
      'Feet together, shoes off, arms across the chest or holding the phone to the sternum.',
      'Eyes fixed on a point at eye level two metres away.',
      'Stand as still as you can for thirty seconds.',
    ],
    metrics: [M.swayPath, M.swayRms, M.ellipse],
    why: 'Your baseline. On its own it tells you very little — it exists so the eyes-closed and single-leg versions have something to be compared against.',
  },
  {
    id: 't-dl-ec', name: 'Romberg — Eyes Closed', category: 'Balance', mode: 'sway',
    sides: 'bilateral', durationSec: 30,
    setup: 'Same placement as eyes open. Have something to grab nearby.',
    protocol: [
      'Feet together, eyes closed, arms across the chest.',
      'Thirty seconds. If you have to open your eyes or step, note it and redo.',
    ],
    metrics: [M.swayPath, M.swayRms, M.ellipse],
    why: 'Removing vision forces you onto the vestibular and proprioceptive systems. The ratio of this to your eyes-open score is the Romberg quotient — a large jump means you are leaning heavily on your eyes to stay upright.',
    pairsWith: 't-dl-eo',
  },
  {
    id: 't-sl-eo', name: 'Single-Leg Stance, Eyes Open', category: 'Balance', mode: 'sway',
    sides: 'unilateral', durationSec: 30,
    setup: 'Phone against the sternum. Test both legs.',
    protocol: [
      'Stand on one leg, other foot lifted clear, not resting on the standing leg.',
      'Hands on the phone at the sternum, eyes on a fixed point.',
      'Thirty seconds per side.',
    ],
    metrics: [M.swayPath, M.swayRms, M.ellipse],
    why: 'The most useful balance asymmetry screen there is, and it costs nothing. A side that sways markedly more usually corresponds to the side that lags on the single-leg jump.',
  },
  {
    id: 't-sl-ec', name: 'Single-Leg Stance, Eyes Closed', category: 'Balance', mode: 'sway',
    sides: 'unilateral', durationSec: 20,
    setup: 'Phone against the sternum. Stand next to a wall.',
    protocol: [
      'Single-leg stance, eyes closed.',
      'Twenty seconds per side. Most people cannot do this. That is informative.',
    ],
    metrics: [M.swayPath, M.swayRms, M.ellipse],
    why: 'Hard version of the above. Very sensitive to ankle proprioception, which is why it shows up after ankle sprains.',
  },
  {
    id: 't-tandem', name: 'Tandem Stance', category: 'Balance', mode: 'sway',
    sides: 'unilateral', durationSec: 30,
    setup: 'Phone at the sternum. The named side is the front foot.',
    protocol: [
      'Heel of the front foot directly against the toe of the back foot, in a straight line.',
      'Arms crossed, eyes open, thirty seconds.',
      'Repeat with the other foot in front.',
    ],
    metrics: [M.swayPath, M.swayRms],
    why: 'Narrows the base of support in the frontal plane. Easier than single-leg, harder than feet together — useful when single-leg is out of reach.',
  },

  // ---------------------------------------------------------------- ROM
  {
    id: 't-ankle-df', name: 'Ankle Dorsiflexion — Weight-Bearing Lunge', category: 'Range of Motion', mode: 'incline',
    sides: 'unilateral', targetDeg: 38,
    setup: 'Phone strapped or held flat against the front of the shin, just below the knee. Zero it with the shin vertical.',
    protocol: [
      'Stand facing a wall in a half-kneeling lunge, test foot forward.',
      'Hold the phone flat against the shin. Stand the shin vertical and tap Zero.',
      'Drive the knee forward over the toes towards the wall, heel flat on the floor.',
      'The moment the heel lifts, stop. That is the end range.',
      'Three attempts per side; the app keeps the peak.',
    ],
    metrics: [{ ...M.angle, label: 'Dorsiflexion' }],
    why: 'The single most common mechanical reason a squat will not reach depth without the heels rising or the back rounding. Under about 35° and you will feel it in every squat. This is also the test where an inclinometer genuinely matches clinical practice.',
    interpret: [
      { max: 30, text: 'Restricted. Expect depth problems in the squat. Weightlifting shoes will mask it; calf and joint mobilisation will address it.' },
      { max: 38, text: 'Adequate for a low-bar squat, particularly in raised-heel shoes.' },
      { max: 999, text: 'Good. Ankles are not your limiting factor.' },
    ],
  },
  {
    id: 't-hip-flex', name: 'Hip Flexion — Supine', category: 'Range of Motion', mode: 'incline',
    sides: 'unilateral', targetDeg: 120,
    setup: 'Phone flat along the front of the thigh. Zero with the leg flat on the floor.',
    protocol: [
      'Lie on your back, both legs straight. Phone on the front of the test thigh.',
      'Tap Zero with the leg flat.',
      'Keeping the opposite leg pressed to the floor, pull the test knee towards your chest.',
      'Stop when the opposite leg starts to lift or the pelvis rolls back.',
    ],
    metrics: [{ ...M.angle, label: 'Hip flexion' }],
    why: 'Squat depth depends on this as much as on the ankle. A hard bony end-feel here is anatomy, not tightness, and no amount of stretching changes it — that is a stance-width problem to solve, not a mobility one.',
  },
  {
    id: 't-hip-ir', name: 'Hip Internal Rotation — Seated', category: 'Range of Motion', mode: 'incline',
    sides: 'unilateral', targetDeg: 35,
    setup: 'Phone flat along the shin. Zero with the shin vertical.',
    protocol: [
      'Sit on a bench, knees bent 90°, thighs level.',
      'Phone flat on the shin, shin vertical, tap Zero.',
      'Swing the foot outwards away from the midline — that rotates the hip inwards.',
      'Stop when the pelvis starts to lift off the bench.',
    ],
    metrics: [{ ...M.angle, label: 'Internal rotation' }],
    why: 'Asymmetric hip rotation shows up as a hip shift out of the bottom of the squat. Worth knowing about before it becomes a groove you have trained for a year.',
  },
  {
    id: 't-hip-er', name: 'Hip External Rotation — Seated', category: 'Range of Motion', mode: 'incline',
    sides: 'unilateral', targetDeg: 45,
    setup: 'Phone flat along the shin, zeroed vertical.',
    protocol: [
      'Same seated setup as internal rotation.',
      'Swing the foot inwards across the midline.',
      'Stop when the pelvis lifts.',
    ],
    metrics: [{ ...M.angle, label: 'External rotation' }],
    why: 'Determines how far out you can turn your toes and still track the knees correctly over the feet.',
  },
  {
    id: 't-shoulder-flex', name: 'Shoulder Flexion — Supine', category: 'Range of Motion', mode: 'incline',
    sides: 'unilateral', targetDeg: 170,
    setup: 'Phone flat along the back of the upper arm. Zero with the arm at your side.',
    protocol: [
      'Lie on your back, knees bent, lower back flat on the floor.',
      'Phone on the back of the upper arm, arm at your side, tap Zero.',
      'Raise the straight arm overhead, thumb leading.',
      'Stop the moment your lower back arches off the floor. That arch is how people fake this test.',
    ],
    metrics: [{ ...M.angle, label: 'Flexion' }],
    why: 'Overhead reach without a lumbar compensation. Directly relevant to the press lockout.',
  },
  {
    id: 't-shoulder-er', name: 'Shoulder External Rotation — 90/90', category: 'Range of Motion', mode: 'incline',
    sides: 'unilateral', targetDeg: 90,
    setup: 'Phone flat on the forearm. Zero with the forearm vertical.',
    protocol: [
      'Lie on your back. Upper arm out to the side at 90°, elbow bent 90°, forearm pointing at the ceiling.',
      'Phone flat on the forearm, tap Zero.',
      'Rotate the forearm back towards the floor above your head.',
      'Keep the shoulder blade down and the back flat.',
    ],
    metrics: [{ ...M.angle, label: 'External rotation' }],
    why: 'This is the movement that makes a low-bar squat rack position possible. Restricted here and the bar will sit on your traps instead, or your elbows and wrists will take the load.',
  },
  {
    id: 't-thoracic-rot', name: 'Thoracic Rotation — Seated', category: 'Range of Motion', mode: 'incline',
    sides: 'unilateral', targetDeg: 45,
    setup: 'Phone flat against the sternum. Zero facing forward.',
    protocol: [
      'Sit astride a bench so the pelvis cannot rotate. A dowel across the shoulders helps.',
      'Phone flat on the sternum, facing straight ahead, tap Zero.',
      'Rotate the upper body as far as you can without the hips moving.',
    ],
    metrics: [{ ...M.angle, label: 'Rotation' }],
    why: 'Rotational power in boxing comes from here. Asymmetry between sides is extremely common in anyone with a dominant stance.',
  },
  {
    id: 't-cervical-rot', name: 'Cervical Rotation', category: 'Range of Motion', mode: 'incline',
    sides: 'unilateral', targetDeg: 80,
    setup: 'Phone flat on the top of the head, or held level against the forehead. Zero facing forward.',
    protocol: [
      'Sit tall, look straight ahead, tap Zero.',
      'Turn the head as far as it goes without the shoulders following.',
    ],
    metrics: [{ ...M.angle, label: 'Rotation' }],
    why: 'Worth a baseline if you box. Also the first thing to change after a whiplash or a heavy sparring session.',
  },
  {
    id: 't-knee-flex', name: 'Knee Flexion — Prone', category: 'Range of Motion', mode: 'incline',
    sides: 'unilateral', targetDeg: 135,
    setup: 'Phone flat along the shin. Zero with the leg straight.',
    protocol: [
      'Lie face down, legs straight. Phone on the shin, tap Zero.',
      'Bend the knee, heel towards the backside, without the hip lifting.',
    ],
    metrics: [{ ...M.angle, label: 'Flexion' }],
    why: 'A quick check after any knee complaint, and a reasonable proxy for quadriceps length.',
  },
  {
    id: 't-lumbar-flex', name: 'Lumbar Flexion — Standing', category: 'Range of Motion', mode: 'incline',
    sides: 'bilateral', targetDeg: 60,
    setup: 'Phone flat against the lower back over L3, roughly at the level of the top of the pelvis. Zero standing upright.',
    protocol: [
      'Stand upright, phone held flat on the lower back, tap Zero.',
      'Bend forward with the knees straight.',
      'This measures the lumbar segment specifically, not the hips — which is the whole point.',
    ],
    metrics: [{ ...M.angle, label: 'Flexion' }],
    why: 'Useful as a before/after check around a back tweak. Not something to chase — a lifter does not need more lumbar flexion.',
  },

  // ---------------------------------------------------------------- manual
  {
    id: 't-vertical-manual', name: 'Vertical Jump — Reach & Mark', category: 'Strength & Field', mode: 'manual',
    sides: 'bilateral',
    setup: 'A wall, chalk on your fingers, a tape measure.',
    protocol: [
      'Stand side-on to the wall, reach up, mark your standing reach.',
      'Jump and mark the highest point.',
      'Difference between the two marks is your jump.',
    ],
    metrics: [{ key: 'heightCm', label: 'Jump height', unit: 'cm', dp: 1, better: 'up' }],
    why: 'The reference method. Slower than the phone, and more accurate — use it every few months to check that the accelerometer numbers have not drifted.',
  },
  {
    id: 't-broad', name: 'Standing Broad Jump', category: 'Strength & Field', mode: 'manual',
    sides: 'bilateral',
    setup: 'Tape measure and a floor you can mark.',
    protocol: [
      'Toes behind the line, feet shoulder-width.',
      'Countermovement and jump forward as far as you can. Arm swing allowed.',
      'Measure to the rearmost heel on landing. You must stick it — a stumble does not count.',
    ],
    metrics: [{ key: 'distanceCm', label: 'Distance', unit: 'cm', dp: 0, better: 'up' }],
    why: 'Horizontal power. Correlates well with the vertical jump but exposes different weaknesses.',
  },
  {
    id: 't-grip', name: 'Grip Strength — Dynamometer', category: 'Strength & Field', mode: 'manual',
    sides: 'unilateral',
    setup: 'A hand dynamometer.',
    protocol: [
      'Seated, elbow at 90°, upper arm against the ribs.',
      'Squeeze maximally for three seconds. Three attempts per hand, best counts.',
    ],
    metrics: [{ key: 'forceKg', label: 'Grip force', unit: 'kg', dp: 1, better: 'up' }],
    why: 'One of the better general markers of both training status and long-term health, and a direct read on your deadlift limiter.',
  },
  {
    id: 't-sitreach', name: 'Sit and Reach', category: 'Strength & Field', mode: 'manual',
    sides: 'bilateral',
    setup: 'A box and a ruler, or a marked wall.',
    protocol: [
      'Sit with legs straight and soles flat against the box.',
      'Reach forward slowly, hold two seconds, read the mark.',
      'Zero is fingertips level with the toes; past the toes is positive.',
    ],
    metrics: [{ key: 'reachCm', label: 'Reach', unit: 'cm', dp: 1, better: 'up' }],
    why: 'Crude, but it has been measured the same way for fifty years, which makes it comparable to almost anything.',
  },
  {
    id: 't-ybal', name: 'Y-Balance Reach', category: 'Strength & Field', mode: 'manual',
    sides: 'unilateral',
    setup: 'Tape three lines on the floor at 135° to each other. Tape measure.',
    protocol: [
      'Stand on one leg at the centre.',
      'Reach the free foot as far as possible along each line without shifting weight onto it.',
      'Record the anterior reach. Normalise by leg length if you want to compare with published data.',
    ],
    metrics: [
      { key: 'anteriorCm', label: 'Anterior reach', unit: 'cm', dp: 1, better: 'up' },
      { key: 'legLengthCm', label: 'Leg length', unit: 'cm', dp: 1, better: 'flat' },
    ],
    why: 'The best-validated field asymmetry screen. Over 4 cm difference side to side is the threshold most of the injury literature uses.',
  },
  {
    id: 't-fms-squat', name: 'Overhead Squat Screen', category: 'Strength & Field', mode: 'manual',
    sides: 'bilateral',
    setup: 'A dowel. A phone camera on a tripod if you want to review it.',
    protocol: [
      'Feet shoulder-width, dowel held overhead with straight arms.',
      'Squat as deep as you can, heels down, dowel staying over the mid-foot.',
      'Score 3 if you reach depth with the torso upright and the dowel overhead; 2 if you need to raise the heels; 1 if you cannot reach depth at all.',
    ],
    metrics: [{ key: 'score', label: 'Score', unit: '/3', dp: 0, better: 'up' }],
    why: 'A screen, not a diagnosis. Its value is that it makes you look at the movement instead of only the number on the bar.',
  },
];

// ---------------------------------------------------------------------------
// Custom tests
// ---------------------------------------------------------------------------

export function newCustomTest() {
  return {
    id: null,
    name: '',
    category: 'Strength & Field',
    mode: 'manual',
    sides: 'bilateral',
    durationSec: 30,
    reps: 1,
    setup: '',
    protocol: [''],
    metrics: [{ key: 'value', label: 'Result', unit: '', dp: 1, better: 'up' }],
    why: '',
    custom: true,
  };
}

export function allTests(db) {
  return [...BUILTIN_TESTS, ...(db.lab.customTests || [])];
}

export function findTest(db, id) {
  return allTests(db).find((t) => t.id === id) || null;
}

// ---------------------------------------------------------------------------
// Result analysis
// ---------------------------------------------------------------------------

/** Every result for a test, newest first. */
export function resultsFor(db, testId, side = null) {
  return db.lab.results
    .filter((r) => r.testId === testId && (side == null || r.side === side))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Best value ever recorded for one metric, respecting its direction. */
export function personalBest(db, testId, metric, side = null) {
  const vals = resultsFor(db, testId, side)
    .map((r) => ({ v: r.metrics[metric.key], date: r.date }))
    .filter((x) => typeof x.v === 'number' && !Number.isNaN(x.v));
  if (!vals.length) return null;
  return metric.better === 'down'
    ? vals.reduce((a, b) => (b.v < a.v ? b : a))
    : vals.reduce((a, b) => (b.v > a.v ? b : a));
}

/**
 * Left/right comparison for a unilateral test.
 * Uses the most recent result on each side, and only when both were recorded
 * within a fortnight of each other — comparing today's left to a right from
 * three months ago is not an asymmetry, it is a training effect.
 */
export function asymmetry(db, test, metric) {
  const l = resultsFor(db, test.id, 'left')[0];
  const r = resultsFor(db, test.id, 'right')[0];
  if (!l || !r) return null;
  const lv = l.metrics[metric.key];
  const rv = r.metrics[metric.key];
  if (typeof lv !== 'number' || typeof rv !== 'number') return null;

  const gapDays = Math.abs((new Date(l.date) - new Date(r.date)) / 86400000);
  const hi = Math.max(lv, rv);
  const lo = Math.min(lv, rv);
  if (!hi) return null;

  const lsi = (lo / hi) * 100;
  const weaker = lv < rv ? 'left' : 'right';
  // For a "lower is better" metric the weaker side is the one with the
  // larger number, so flip the label.
  const worse = metric.better === 'down' ? (lv > rv ? 'left' : 'right') : weaker;

  return {
    left: lv, right: rv, lsi, worseSide: worse, gapDays,
    stale: gapDays > 14,
    flag: lsi < 90 ? (lsi < 85 ? 'high' : 'moderate') : 'ok',
  };
}

export const ASYMMETRY_NOTE = {
  ok: 'Within normal variation. Nothing to act on.',
  moderate: '10–15 % difference. Worth watching, and worth some unilateral work.',
  high: 'Over 15 % difference. Address this before you keep loading the bilateral lift on top of it.',
};

/** Trend series for charting one metric of one test/side. */
export function series(db, testId, metricKey, side = null) {
  return resultsFor(db, testId, side)
    .filter((r) => typeof r.metrics[metricKey] === 'number')
    .map((r) => ({ x: r.date, y: r.metrics[metricKey] }))
    .reverse();
}

/**
 * Derived cross-test measures. These only appear when both source tests have
 * results, so the UI never shows an empty box.
 */
export function derived(db) {
  const out = [];

  const cmj = resultsFor(db, 't-cmj')[0];
  const sj = resultsFor(db, 't-sj')[0];
  if (cmj && sj && sj.metrics.heightCm > 0) {
    const eur = cmj.metrics.heightCm / sj.metrics.heightCm;
    out.push({
      key: 'eur',
      label: 'Eccentric utilisation ratio',
      value: eur.toFixed(2),
      note: eur < 1.0
        ? 'Below 1.0 means your countermovement jump is not beating your squat jump — usually a technique issue with the dip, not a physical one.'
        : eur < 1.1
          ? 'Low. You are getting little free energy back from the stretch-shortening cycle. Jump and plyometric work would help.'
          : 'Healthy elastic contribution.',
    });
  }

  const eo = resultsFor(db, 't-dl-eo')[0];
  const ec = resultsFor(db, 't-dl-ec')[0];
  if (eo && ec && eo.metrics.pathPerSec > 0) {
    const q = ec.metrics.pathPerSec / eo.metrics.pathPerSec;
    out.push({
      key: 'romberg',
      label: 'Romberg quotient',
      value: q.toFixed(2),
      note: q > 2.5
        ? 'You rely heavily on vision to stay upright. Barefoot single-leg work, eyes closed, is the cheap fix.'
        : 'Normal reliance on vision.',
    });
  }

  return out;
}
