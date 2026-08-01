// Exercise catalog.
//
// `kind` drives how the app treats a movement:
//   main       - the five barbell lifts the program actually progresses
//   assistance - accessory work, logged but never auto-progressed
//   condition  - aerobic/anaerobic work, logged by time and intensity
//
// `cues` are coaching points from the Starting Strength model of each lift.
// `increment` is the default per-session jump in kg for programmed lifts.

export const MAIN_LIFTS = {
  squat: {
    id: 'squat',
    name: 'Low-Bar Back Squat',
    short: 'Squat',
    kind: 'main',
    bar: true,
    increment: 2.5,
    lateIncrement: 1.5,
    resetPct: 0.9,
    // Novices start light enough to fix form; this is a fraction of bodyweight
    // used only to seed a first-session suggestion.
    seedBwRatio: 0.5,
    defaultSets: 3,
    defaultReps: 5,
    cues: [
      'Bar on the rear delts, below the spine of the scapula — not on the traps.',
      'Stance shoulder-width, toes out ~30°. Knees track the toes.',
      'Hips back and down. Break at the hip first, not the knee.',
      'Below parallel: hip crease under the top of the kneecap. Every rep.',
      'Chest down, back rigid, eyes on the floor about 1.5 m ahead.',
      'Drive the hips straight up out of the bottom. Do not let the chest rise first.',
    ],
    warmup: 'full',
    setsReps: '3 × 5',
  },
  press: {
    id: 'press',
    name: 'Standing Press',
    short: 'Press',
    kind: 'main',
    bar: true,
    increment: 2.5,
    lateIncrement: 1.5,
    resetPct: 0.9,
    seedBwRatio: 0.25,
    defaultSets: 3,
    defaultReps: 5,
    cues: [
      'Grip just outside the shoulders, forearms vertical from the front.',
      'Bar on the heels of the palms, over the mid-foot, resting on the delts.',
      'Eyes straight ahead. Bar travels in a straight vertical line.',
      'Get the nose out of the way, then put the head back through as the bar passes.',
      'Hips forward, then back — one hip bounce, no knee bend. That is the press, not a push press.',
      'Lock out with the bar over the mid-foot, shoulders shrugged up.',
    ],
    warmup: 'full',
    setsReps: '3 × 5',
  },
  bench: {
    id: 'bench',
    name: 'Bench Press',
    short: 'Bench',
    kind: 'main',
    bar: true,
    increment: 2.5,
    lateIncrement: 1.5,
    resetPct: 0.9,
    seedBwRatio: 0.4,
    defaultSets: 3,
    defaultReps: 5,
    cues: [
      'Eyes under the bar. Grip so the forearms are vertical at the chest.',
      'Shoulder blades pinched and down, slight arch, feet planted.',
      'Touch the mid-chest at the bottom of the sternum — same spot every rep.',
      'Bar path is a slight arc back toward the face, finishing over the shoulders.',
      'No bounce off the chest. Touch and drive.',
      'Use a spotter or the pins for the last set. Never thumbless.',
    ],
    warmup: 'full',
    setsReps: '3 × 5',
  },
  deadlift: {
    id: 'deadlift',
    name: 'Deadlift',
    short: 'Deadlift',
    kind: 'main',
    bar: true,
    increment: 5,
    lateIncrement: 2.5,
    resetPct: 0.9,
    seedBwRatio: 0.6,
    defaultSets: 1,
    defaultReps: 5,
    cues: [
      'Bar over the mid-foot. Stance narrower than the squat, ~hip-width.',
      'Grip just outside the shins, arms vertical from the front and the side.',
      'Shins to the bar, then chest up — that squeezes the slack out.',
      'Back stays in extension. The bar does not move until the back is set.',
      'Drag the bar up the legs. It never travels forward.',
      'Lock out with the knees and hips — do not lean back or shrug at the top.',
      'One set of five. Reset each rep from the floor; no touch-and-go.',
    ],
    warmup: 'deadlift',
    setsReps: '1 × 5',
  },
  powerclean: {
    id: 'powerclean',
    name: 'Power Clean',
    short: 'Clean',
    kind: 'main',
    bar: true,
    increment: 2.5,
    lateIncrement: 1.5,
    resetPct: 0.9,
    seedBwRatio: 0.4,
    defaultSets: 5,
    defaultReps: 3,
    cues: [
      'Start position is the deadlift, with the back a little more horizontal.',
      'First pull off the floor is deliberate. The speed comes later.',
      'Bar brushes the thighs — jump when it reaches mid-thigh.',
      'Jump, shrug, then the elbows whip around. The arms do not pull the bar up.',
      'Rack it on the delts with the elbows up, in a quarter-squat.',
      'Five sets of three. If the bar slows down, the set is over.',
    ],
    warmup: 'clean',
    setsReps: '5 × 3',
  },
  rdl: {
    id: 'rdl',
    name: 'Romanian Deadlift',
    short: 'RDL',
    kind: 'main',
    bar: true,
    increment: 2.5,
    lateIncrement: 1.5,
    resetPct: 0.9,
    // Most people RDL somewhere around 60-70 % of their deadlift, and the
    // limiter is hamstring length long before it is back strength.
    seedBwRatio: 0.4,
    defaultSets: 3,
    defaultReps: 8,
    cues: [
      'Start standing, bar at the hips. This is a top-down lift — you do not pull it off the floor.',
      'Grip just outside the thighs, shoulders slightly ahead of the bar, chest up.',
      'Soft knees, then hold that knee angle. If the knees keep bending it becomes a bad deadlift.',
      'Push the hips back. The bar drags down the thighs and stays in contact with the legs.',
      'Go until the hamstrings stop you — usually mid-shin. The moment the lower back rounds, that is the end of the range, whatever the bar height.',
      'Drive the hips forward to stand up. Do not lean back at the top.',
      'Higher reps than the deadlift and considerably lighter. It is a hamstring exercise, not a max-effort pull.',
    ],
    warmup: 'rdl',
    setsReps: '3 × 8',
  },
  dip: {
    id: 'dip',
    name: 'Dip',
    short: 'Dips',
    kind: 'main',
    bar: false,
    bodyweight: true,
    // Added weight hangs off a belt — one stack, no symmetry — so the smallest
    // plate TV owns (0.75 kg) is the jump, early and late alike.
    increment: 0.75,
    lateIncrement: 0.75,
    resetPct: 0.9,
    defaultSets: 3,
    defaultReps: 0,
    cues: [
      'Bars just wider than the shoulders. Start locked out, shoulders down and back.',
      'Slight forward lean loads the chest; staying upright loads the triceps. Pick one and keep it.',
      'Descend until the upper arm is roughly parallel to the floor. Deeper than that is where shoulders get hurt.',
      'No bouncing out of the bottom. Control the descent, then drive.',
      'Once you can do 15 clean reps, hang weight from a belt and treat it as a pressing lift.',
    ],
    warmup: 'none',
    setsReps: '3 × max',
  },
  chinup: {
    id: 'chinup',
    name: 'Chin-up',
    short: 'Chins',
    kind: 'main',
    bar: false,
    bodyweight: true,
    increment: 0.75,
    lateIncrement: 0.75,
    resetPct: 0.9,
    defaultSets: 3,
    defaultReps: 0,
    cues: [
      'Supinated grip, shoulder-width. Hang from a full stretch.',
      'Chin clears the bar, controlled down to a straight-arm hang.',
      'Sets to failure once you can do them. Add weight when you clear 15.',
    ],
    warmup: 'none',
    setsReps: '3 × max',
  },
};

// ---------------------------------------------------------------------------
// Assistance work.
//
// Rippetoe's position, kept explicit here because the app should not quietly
// contradict the method it implements: assistance is optional and secondary.
// It comes AFTER the barbell work, never before, and it is the first thing to
// cut when recovery is the limiting factor. A novice adding this before the
// linear progression stalls is just spending recovery he needs for the squat.

export const ASSISTANCE = [
  // ---- dumbbell ----
  { id: 'db-bench', name: 'Dumbbell Bench Press', equip: 'dumbbell', target: 'chest', sets: '3 × 8–12', note: 'Bigger range of motion than the bar; useful when the bench stalls.' },
  { id: 'db-incline', name: 'Dumbbell Incline Press', equip: 'dumbbell', target: 'chest/front delt', sets: '3 × 8–12', note: 'Bridges the gap between bench and press.' },
  { id: 'db-row', name: 'One-Arm Dumbbell Row', equip: 'dumbbell', target: 'upper back', sets: '3 × 8–12', note: 'Braced on a bench. Pull to the hip, not the armpit.' },
  { id: 'db-ohp', name: 'Seated Dumbbell Press', equip: 'dumbbell', target: 'shoulders', sets: '3 × 8–12', note: 'No hip drive available — expect much lighter than the barbell press.' },
  { id: 'db-rdl', name: 'Dumbbell Romanian Deadlift', equip: 'dumbbell', target: 'hamstrings', sets: '3 × 8–10', note: 'Hips back, soft knees, bar-path along the legs. Stop at the stretch.' },
  { id: 'db-lunge', name: 'Dumbbell Walking Lunge', equip: 'dumbbell', target: 'legs', sets: '3 × 10/side', note: 'High recovery cost. Do not run these alongside a working squat progression.' },
  { id: 'db-split', name: 'Bulgarian Split Squat', equip: 'dumbbell', target: 'legs', sets: '3 × 8/side', note: 'Exposes left/right asymmetry the squat hides.' },
  { id: 'liu-raise', name: 'Liu Raise', equip: 'dumbbell', target: 'rear/side delt, shoulder health', sets: '3 × 12\u201320', note: 'The Chinese weightlifting shoulder-health raise. Face down on an incline bench, very light dumbbells hanging straight below you, thumbs up. Sweep the arms out and up in a wide arc to shoulder height, pause, lower under control. Light and strict \u2014 this is built for the overhead position, not for loading. If you press overhead regularly, this is the accessory that keeps the shoulder tolerating it.' },
  { id: 'db-lateral', name: 'Lateral Raise', equip: 'dumbbell', target: 'side delt', sets: '3 × 12–15', note: 'Pure hypertrophy work. Light, strict, no body English.' },
  { id: 'db-curl', name: 'Dumbbell Curl', equip: 'dumbbell', target: 'biceps', sets: '3 × 8–12', note: 'Chins do most of this already. Add only if you want the arm size.' },
  { id: 'db-skull', name: 'Dumbbell Skullcrusher', equip: 'dumbbell', target: 'triceps', sets: '3 × 10–12', note: 'Supports lockout on bench and press.' },
  { id: 'db-shrug', name: 'Dumbbell Shrug', equip: 'dumbbell', target: 'traps', sets: '3 × 10–15', note: 'Straight up and down. Rolling the shoulders does nothing.' },
  { id: 'db-farmer', name: 'Farmer\'s Walk', equip: 'dumbbell', target: 'grip/trunk', sets: '3 × 30–40 m', note: 'Grip, trunk and conditioning in one. Heavy, upright, controlled.' },

  // ---- kettlebell ----
  { id: 'kb-swing', name: 'Two-Hand Kettlebell Swing', equip: 'kettlebell', target: 'posterior chain', sets: '5 × 15–20', note: 'A hip snap, not a squat and not a front raise. The bell floats; you do not lift it.' },
  { id: 'kb-swing1', name: 'One-Hand Swing', equip: 'kettlebell', target: 'posterior chain/trunk', sets: '5 × 10/side', note: 'Adds an anti-rotation demand on the trunk.' },
  { id: 'kb-goblet', name: 'Goblet Squat', equip: 'kettlebell', target: 'legs', sets: '3 × 8–12', note: 'Best teaching tool for squat depth and an upright torso. Good warm-up.' },
  { id: 'kb-tgu', name: 'Turkish Get-Up', equip: 'kettlebell', target: 'full body', sets: '3 × 2/side', note: 'Shoulder stability and coordination. Slow. Never rush a get-up.' },
  { id: 'kb-cleanpress', name: 'Kettlebell Clean & Press', equip: 'kettlebell', target: 'full body', sets: '5 × 5/side', note: 'Clean it to the rack without banging the forearm, then strict press.' },
  { id: 'kb-snatch', name: 'Kettlebell Snatch', equip: 'kettlebell', target: 'full body/conditioning', sets: '10 × 10/side', note: 'Conditioning as much as strength. Punch the hand through at the top.' },
  { id: 'kb-frontsquat', name: 'Double Kettlebell Front Squat', equip: 'kettlebell', target: 'legs/trunk', sets: '3 × 6–8', note: 'The rack position limits the load long before the legs do.' },
  { id: 'kb-row', name: 'Kettlebell Row', equip: 'kettlebell', target: 'upper back', sets: '3 × 8–12', note: '' },
  { id: 'kb-windmill', name: 'Windmill', equip: 'kettlebell', target: 'trunk/hips', sets: '3 × 5/side', note: 'Loaded hip hinge with rotation. Start with no weight.' },
  { id: 'kb-carry', name: 'Front Rack Carry', equip: 'kettlebell', target: 'trunk', sets: '3 × 40 m', note: 'Ribs down, breathe. Harder than it looks.' },
  { id: 'kb-suitcase', name: 'Suitcase Carry', equip: 'kettlebell', target: 'trunk (anti-lateral flexion)', sets: '3 × 40 m/side', note: 'Stay square. Do not lean away from the bell.' },
  { id: 'kb-halo', name: 'Halo', equip: 'kettlebell', target: 'shoulders (mobility)', sets: '2 × 8/direction', note: 'Warm-up for the press and the rack position.' },

  // ---- calisthenics ----
  { id: 'ca-pullup', name: 'Pull-up', equip: 'bodyweight', target: 'back', sets: '3 × max', note: 'Pronated grip. Harder than chins; less biceps.' },
  { id: 'ca-dip', name: 'Dip', equip: 'bodyweight', target: 'chest/triceps', sets: '3 × max', note: 'Slight forward lean for chest, upright for triceps. Add weight when easy.' },
  { id: 'ca-pushup', name: 'Push-up', equip: 'bodyweight', target: 'chest', sets: '3 × max', note: 'Rigid trunk. When 25 reps is easy, the exercise has stopped being strength work.' },
  { id: 'ca-invrow', name: 'Inverted Row', equip: 'bodyweight', target: 'upper back', sets: '3 × 8–15', note: 'The horizontal pull most novices are missing.' },
  { id: 'ca-ringrow', name: 'Ring Row', equip: 'bodyweight', target: 'upper back', sets: '3 × 8–15', note: 'Scale difficulty by walking the feet forward.' },
  { id: 'ca-legraise', name: 'Hanging Leg Raise', equip: 'bodyweight', target: 'trunk', sets: '3 × 8–15', note: 'No swinging. If the hips do not curl under, it is a hip flexor exercise.' },
  { id: 'ca-abwheel', name: 'Ab Wheel Rollout', equip: 'bodyweight', target: 'trunk', sets: '3 × 8–12', note: 'From the knees first. Do not let the lower back extend.' },
  { id: 'ca-back-ext', name: 'Back Extension', equip: 'bodyweight', target: 'erectors/glutes', sets: '3 × 10–15', note: 'Standard light day filler in the Texas Method.' },
  { id: 'ca-ghr', name: 'Glute-Ham Raise', equip: 'bodyweight', target: 'hamstrings', sets: '3 × 5–10', note: 'Brutal if you have the equipment. Band-assist to start.' },
  { id: 'ca-nordic', name: 'Nordic Curl', equip: 'bodyweight', target: 'hamstrings (eccentric)', sets: '3 × 4–6', note: 'Very high eccentric load. Start with a tiny range.' },
  { id: 'ca-pistol', name: 'Pistol Squat', equip: 'bodyweight', target: 'legs/balance', sets: '3 × 5/side', note: 'More a balance and ankle-mobility test than a strength exercise.' },
  { id: 'ca-hspu', name: 'Handstand Push-up', equip: 'bodyweight', target: 'shoulders', sets: '3 × 3–8', note: 'Against a wall. Not a substitute for pressing a loaded bar.' },
  { id: 'ca-plank', name: 'Plank', equip: 'bodyweight', target: 'trunk', sets: '3 × 45–60 s', note: 'If you can hold two minutes, add load rather than time.' },
  { id: 'ca-hollow', name: 'Hollow Body Hold', equip: 'bodyweight', target: 'trunk', sets: '3 × 30–45 s', note: 'Lower back flat on the floor the whole time.' },
  { id: 'burpees', name: 'Burpees', equip: 'bodyweight', target: 'full body / conditioning', sets: '3 × 40', note: 'Counted in total reps rather than load. Squat thrust to a push-up, back up, jump. Conditioning that needs no equipment and no space — which is exactly why it survives travel.' },
  { id: 'ca-neck', name: 'Neck Harness / Isometrics', equip: 'bodyweight', target: 'neck', sets: '3 × 15–20', note: 'Relevant if you box. Build it slowly.' },
];

export const EQUIPMENT = ['dumbbell', 'kettlebell', 'bodyweight'];

// ---------------------------------------------------------------------------
// Conditioning.
//
// interference = how much this session costs the strength progression.
// A novice on linear progression should keep conditioning to low-interference
// work on non-lifting days. Long slow distance is the classic way to stall a
// squat progression without ever noticing why.

export const CONDITIONING = [
  // ---- boxing ----
  {
    id: 'box-shadow', sport: 'boxing', name: 'Shadowboxing Rounds',
    structure: '6 × 3 min rounds, 1 min rest', durationMin: 24, zone: 'Z2–Z3', rpe: '5–6',
    interference: 'low',
    detail: 'Round 1–2 technique only, hands relaxed. Rounds 3–4 add footwork and level changes. Rounds 5–6 full-speed combinations. Keep the guard up when you get tired — that is the point of the last two rounds.',
  },
  {
    id: 'box-bag-int', sport: 'boxing', name: 'Heavy Bag Intervals',
    structure: '8 × 2 min work / 1 min rest', durationMin: 24, zone: 'Z4', rpe: '8',
    interference: 'medium',
    detail: 'First 30 s of each round at 60 % output, last 30 s all-out. Punch through the bag, do not push it. Wrap your hands.',
  },
  {
    id: 'box-bag-power', sport: 'boxing', name: 'Heavy Bag Power Sets',
    structure: '10 × 15 s max effort / 45 s rest', durationMin: 10, zone: 'Alactic', rpe: '9',
    interference: 'low',
    detail: 'Short enough that it trains power, not lactate tolerance. Full recovery between efforts. This one pairs cleanly with lifting.',
  },
  {
    id: 'box-rope', sport: 'boxing', name: 'Skipping Rope',
    structure: '5 × 3 min rounds, 1 min rest', durationMin: 20, zone: 'Z2', rpe: '5',
    interference: 'low',
    detail: 'Basic bounce, alternate-foot, then double-unders in the last round. Cheap ankle and calf conditioning.',
  },
  {
    id: 'box-pads', sport: 'boxing', name: 'Pad Work',
    structure: '6 × 3 min rounds', durationMin: 24, zone: 'Z3', rpe: '7',
    interference: 'medium',
    detail: 'Needs a partner. Highest technical value per minute of anything on this list.',
  },
  {
    id: 'box-spar', sport: 'boxing', name: 'Sparring',
    structure: '4–8 × 3 min rounds', durationMin: 30, zone: 'Z4–Z5', rpe: '9',
    interference: 'high',
    detail: 'Do not schedule this the day before a heavy squat or deadlift. Recovery cost is far higher than the heart rate suggests.',
  },
  {
    id: 'box-road', sport: 'boxing', name: 'Roadwork',
    structure: '30–40 min easy + 6 × 20 s strides', durationMin: 40, zone: 'Z2', rpe: '4',
    interference: 'medium',
    detail: 'Traditional, and the single most common reason a boxer\'s squat stops going up. Keep it easy or cut it.',
  },

  // ---- bike ----
  {
    id: 'jj-class', sport: 'jiu-jitsu', name: 'Class (gi or no-gi)',
    structure: 'technique + drilling + rolling', durationMin: 75, zone: 'Z2–Z4', rpe: '6',
    interference: 'medium',
    detail: 'A normal academy class. Log the techniques covered and the rounds you rolled — the library keeps count from what you log here.',
  },
  {
    id: 'jj-drilling', sport: 'jiu-jitsu', name: 'Drilling / Technique Only',
    structure: 'reps of chosen techniques', durationMin: 45, zone: 'Z1–Z2', rpe: '4',
    interference: 'low',
    detail: 'Repetition without resistance. The cheapest volume in grappling — this is where the library grows fastest.',
  },
  {
    id: 'jj-positional', sport: 'jiu-jitsu', name: 'Positional Sparring',
    structure: '6 × 5 min from set positions', durationMin: 30, zone: 'Z3–Z4', rpe: '7',
    interference: 'medium',
    detail: 'Start from the position you are working, reset on escape or submission. More learning per minute than free rolling.',
  },
  {
    id: 'jj-rolling', sport: 'jiu-jitsu', name: 'Rolling',
    structure: '5–8 × 5 min rounds', durationMin: 35, zone: 'Z4', rpe: '8',
    interference: 'high',
    detail: 'Free sparring. Count submissions both ways honestly — the ones you concede are the curriculum.',
  },
  {
    id: 'jj-openmat', sport: 'jiu-jitsu', name: 'Open Mat',
    structure: 'unstructured', durationMin: 60, zone: 'varies', rpe: '7',
    interference: 'high',
    detail: 'Whatever happened, log it: rounds, submissions, and anything you drilled.',
  },
  {
    id: 'bike-z2', sport: 'bike', name: 'Zone 2 Steady',
    structure: '45–90 min continuous', durationMin: 60, zone: 'Z2', rpe: '3–4',
    interference: 'low',
    detail: 'Nose-breathing pace — you can hold a conversation. Builds the aerobic base with almost no cost to the legs if you stay honest about the intensity.',
  },
  {
    id: 'bike-tabata', sport: 'bike', name: 'Assault/Air Bike Tabata',
    structure: '8 × 20 s max / 10 s rest', durationMin: 4, zone: 'Z5', rpe: '10',
    interference: 'medium',
    detail: 'Four minutes, and it is genuinely all-out. Twice a week is plenty.',
  },
  {
    id: 'bike-sprints', sport: 'bike', name: 'Short Sprint Repeats',
    structure: '10 × 10 s max / 50 s easy', durationMin: 12, zone: 'Alactic', rpe: '9',
    interference: 'low',
    detail: 'Long rests keep it a power session rather than a lactate session. Low interference with the squat.',
  },
  {
    id: 'bike-threshold', sport: 'bike', name: 'Threshold Intervals',
    structure: '4 × 8 min @ threshold, 4 min easy', durationMin: 50, zone: 'Z4', rpe: '8',
    interference: 'high',
    detail: 'Hard, effective, and it will show up in your squat the next day. Intermediate lifters only.',
  },
  {
    id: 'bike-hills', sport: 'bike', name: 'Hill Repeats',
    structure: '6 × 3 min climb, spin down', durationMin: 40, zone: 'Z4', rpe: '8',
    interference: 'high',
    detail: 'Seated, high torque, low cadence. This is leg work — treat it as such in your weekly load.',
  },
  {
    id: 'bike-recovery', sport: 'bike', name: 'Recovery Spin',
    structure: '20–30 min very easy', durationMin: 25, zone: 'Z1', rpe: '2',
    interference: 'none',
    detail: 'Blood flow, nothing else. Good on the day after a heavy deadlift.',
  },

  // ---- running ----
  {
    id: 'run-easy', sport: 'running', name: 'Easy Aerobic Run',
    structure: '30–50 min conversational', durationMin: 40, zone: 'Z2', rpe: '3–4',
    interference: 'medium',
    detail: 'If you are running to support lifting, keep it here and keep it short.',
  },
  {
    id: 'run-400', sport: 'running', name: '400 m Repeats',
    structure: '8 × 400 m, 90 s rest', durationMin: 35, zone: 'Z4–Z5', rpe: '8–9',
    interference: 'high',
    detail: 'Classic and effective. Also the fastest route to sore hamstrings before a deadlift day.',
  },
  {
    id: 'run-tempo', sport: 'running', name: 'Tempo Run',
    structure: '20 min at comfortably hard', durationMin: 30, zone: 'Z3–Z4', rpe: '7',
    interference: 'medium',
    detail: 'A pace you could hold for about an hour in a race. Not a time trial.',
  },
  {
    id: 'run-hills', sport: 'running', name: 'Hill Sprints',
    structure: '8 × 15 s uphill, walk down', durationMin: 20, zone: 'Alactic', rpe: '9',
    interference: 'low',
    detail: 'The uphill angle limits stride length, which is why these are far safer than flat sprints for a heavy lifter.',
  },
  {
    id: 'run-fartlek', sport: 'running', name: 'Fartlek',
    structure: '35 min, 1 min hard / 2 min easy throughout', durationMin: 35, zone: 'Z3–Z4', rpe: '7',
    interference: 'medium',
    detail: 'Unstructured on purpose. Good when you cannot face a track.',
  },
  {
    id: 'run-long', sport: 'running', name: 'Long Run',
    structure: '60–90 min easy', durationMin: 75, zone: 'Z2', rpe: '4',
    interference: 'high',
    detail: 'Directly competes with a squat progression for recovery. Choose one or the other, honestly.',
  },

  // ---- sled / general ----
  {
    id: 'sled-prowler', sport: 'sled', name: 'Prowler Pushes',
    structure: '8 × 30 m, walk back', durationMin: 20, zone: 'Z4', rpe: '8',
    interference: 'low',
    detail: 'The conditioning tool of choice around a barbell program: all concentric, so it produces almost no soreness. Heavy and slow, or light and fast — both work.',
  },
  {
    id: 'sled-drag', sport: 'sled', name: 'Sled Drags',
    structure: '6 × 40 m forward + backward', durationMin: 20, zone: 'Z3', rpe: '6',
    interference: 'none',
    detail: 'Backward drags load the quads without eccentric damage. Useful for cranky knees.',
  },
  {
    id: 'row-int', sport: 'rowing', name: 'Rowing Intervals',
    structure: '6 × 500 m, 2 min rest', durationMin: 30, zone: 'Z4', rpe: '8',
    interference: 'medium',
    detail: 'Legs–hips–arms on the drive, reverse on the recovery. Hard on the lower back the day before deadlifts.',
  },
];

export const SPORTS = ['boxing', 'jiu-jitsu', 'bike', 'running', 'sled', 'rowing'];

export const INTERFERENCE_NOTE = {
  none: 'No meaningful cost to the strength programme.',
  low: 'Safe alongside a linear progression.',
  medium: 'Keep it on non-lifting days.',
  high: 'Competes directly with recovery. Cut it first if the squat stalls.',
};

// ---------------------------------------------------------------------------
// Your own movements.
//
// Custom exercises are merged into the catalogues above at boot rather than
// kept in a parallel list. That is deliberate: every downstream consumer —
// progression, warm-up ladders, plate maths, the "+ Lift" sheet, the history
// charts — then treats a movement you invented exactly like one that shipped
// with the app, with no special cases anywhere.
// ---------------------------------------------------------------------------

/** Sensible defaults so a half-filled custom exercise still behaves. */
export function normaliseCustom(ex) {
  const isMain = ex.kind === 'main';
  return {
    increment: 2.5,
    lateIncrement: 1.5,
    resetPct: 0.9,
    defaultSets: 3,
    defaultReps: isMain ? 5 : 10,
    warmup: ex.bar ? 'full' : 'none',
    cues: [],
    setsReps: `${ex.defaultSets ?? 3} × ${ex.defaultReps ?? (isMain ? 5 : 10)}`,
    target: '',
    equip: ex.bar ? 'barbell' : 'other',
    note: '',
    ...ex,
    kind: isMain ? 'main' : 'assistance',
    custom: true,
  };
}

let registered = [];

/**
 * Re-sync the catalogues with the user's own exercises.
 * Called at boot and after any edit. Previously registered entries are removed
 * first so a rename or a delete does not leave a ghost behind.
 */
export function registerCustomExercises(list = []) {
  for (const old of registered) {
    if (old.kind === 'main') delete MAIN_LIFTS[old.id];
    else {
      const i = ASSISTANCE.findIndex((a) => a.id === old.id);
      if (i >= 0) ASSISTANCE.splice(i, 1);
    }
  }
  registered = list.map(normaliseCustom);
  for (const ex of registered) {
    if (ex.kind === 'main') MAIN_LIFTS[ex.id] = ex;
    else ASSISTANCE.push(ex);
  }
  return registered.length;
}

/** Everything you could put in a workout, for pickers. */
export function allMovements() {
  return [
    ...Object.values(MAIN_LIFTS).map((m) => ({ ...m, group: m.custom ? 'Your lifts' : 'Main lifts' })),
    ...ASSISTANCE.map((a) => ({
      ...a,
      group: a.custom ? 'Your exercises' : `Assistance — ${a.equip}`,
    })),
  ];
}

/** Look up any movement by id across all three catalogs. */
export function findExercise(id) {
  return MAIN_LIFTS[id]
    || ASSISTANCE.find((a) => a.id === id)
    || CONDITIONING.find((c) => c.id === id)
    || null;
}

export function exerciseName(id) {
  const ex = findExercise(id);
  return ex ? (ex.short || ex.name) : id;
}
