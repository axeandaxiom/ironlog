# IronLog

A Starting Strength training log, health tracker, calorie planner, recipe book
and movement-testing lab. One offline web app that installs on an iPhone and a
Mac from the same code. No account, no server, no subscription — all data lives
on the device, and syncing is a file you move yourself.

---

## Run it

```bash
python3 ironlog/serve.py
```

Then open <http://localhost:8765>. That is enough for the Mac.

To install on the **iPhone**, you need TLS — iOS refuses service workers and
motion-sensor access over plain HTTP from anything but localhost:

```bash
python3 ironlog/serve.py --https
```

The script prints a `https://<your-lan-ip>:8765` address. Open it in Safari on
the phone (both devices on the same wifi), accept the self-signed certificate
warning once, then **Share → Add to Home Screen**.

On the Mac: Safari **File → Add to Dock**, or the install icon in Chrome's
address bar.

For something permanent, put the `ironlog/` folder on any static host —
GitHub Pages, Netlify and Cloudflare Pages are all free and give you a real
certificate, which removes the warning and the LAN requirement entirely.

### Tests

```bash
open http://localhost:8765/tests.html
```

125 assertions covering the progression engine, plate and warm-up maths,
nutrition calculations, recipe macros, jump and sway analysis on synthetic
sensor traces, asymmetry maths, and the export/import round trip. They run in
the browser because that is where the app runs; there is no build step and no
Node dependency.

---

## What's in it

### Training — Starting Strength

The novice linear progression in three phases, then the Texas Method, as
described in *Starting Strength: Basic Barbell Training* and *Practical
Programming for Strength Training*.

- **Phase 1** — Squat/Press/Deadlift alternating with Squat/Bench/Deadlift.
- **Phase 2** — power cleans alternate with the deadlift, chins added.
- **Phase 3** — light squat day midweek, press and bench alternating.
- **Texas Method** — volume Monday, recovery Wednesday, intensity Friday, one
  increase per lift per week.

Progression is deterministic. All reps made → the weight goes up by the
per-lift increment. Reps missed → repeat. Three consecutive misses → reset 10 %
and the small increment takes over. Light and percentage-derived days never
drive progression. The app never advances a phase on its own: it tells you when
the criteria are met and leaves the decision to you.

Warm-up ladders, plate breakdowns per side, and a warning when your plates
cannot actually make the prescribed number.

### Logging without stopping

The rule the session runner is built around: **one tap logs a set and nothing
moves.** No dialog, no navigation, no re-render. The tap writes straight to
storage, patches the DOM in place, starts the rest clock and keeps your scroll
position and open keyboard. The screen stays awake via the Wake Lock API. With
no signal it behaves identically — the whole app is precached.

What it deliberately does *not* do is log while the phone is locked or you are
in another app. That needs a native app; see below.

### Assistance and conditioning

Dumbbell, kettlebell and calisthenics work, and conditioning sessions for
boxing, bike, running, sled and rowing.

Each conditioning session carries an **interference rating** — how much it
costs your strength progression. This is the part most training apps leave out.
Roadwork and long runs are marked high-interference on purpose: they are the
most common reason a novice's squat stalls.

### Health tracking

Fourteen suggested metrics with real protocol notes, plus a custom metric
builder (name, unit, scale or number, direction). Nothing is tracked until you
add it. Bodyweight gets a seven-day average and a weekly rate computed from
calendar days, not from how often you happened to weigh in.

### Nutrition

Mifflin-St Jeor RMR, an activity multiplier, a goal offset, protein anchored to
bodyweight with a hard fat floor. It shows the ±10 % band rather than pretending
to a precision it does not have.

The useful part is the **reality check**: after a fortnight of bodyweight data
it compares what the equation predicted against what the scale did, and tells
you your actual maintenance. That number beats any formula.

### Kitchen

22 original recipes built on the high-volume, low-calorie-density method —
egg-white batters, protein powder for flour, cauliflower and konjac for rice and
pasta, fat-free dairy, powdered peanut butter, air fryer, microwave mug
technique. Every recipe carries swap suggestions, because adapting them is the
point.

**Macros are computed from the ingredient list at runtime**, never typed in, so
they cannot drift from what the recipe actually contains.

### Movement Lab

28 preloaded tests across jump and power, balance, range of motion, and field
tests, plus a custom test builder. Unilateral tests record left and right
separately and compute a limb symmetry index.

| Mode | Method | Honest accuracy |
|---|---|---|
| Jump | Flight time from the accelerometer, `h = g·t²/8` | ±2 cm at 60 Hz |
| Balance | Sway path, RMS, 95 % ellipse in the acceleration domain | Relative only — no absolute meaning |
| Range of motion | Phone as a gravity-referenced inclinometer, zeroed in the start position | ±2–3°, comparable to a clinical inclinometer |
| Manual | You measure, you type | As good as your tape measure |

Derived measures appear when their inputs exist: eccentric utilisation ratio
(countermovement vs. squat jump), Romberg quotient (eyes closed vs. open).

---

## What this is not

**Not a motion-capture system.** There is no camera-based 3D pose estimation,
and that is a decision rather than an omission. Monocular pose from a phone
camera produces joint-angle errors larger than the differences you would be
trying to detect, so a number from it would look precise and mean nothing. The
phone-as-inclinometer approach used instead is both more accurate and needs no
bundled model. Systems like VALD's HumanTrak use calibrated depth cameras;
nothing in a browser replaces one.

**Not a substitute for the books.** A progression engine is not coaching. Buy
*Starting Strength* — the technique chapters are the actual product, and this
app cannot watch your squat.

**Not affiliated with anyone.** Not with Mark Rippetoe, not with Greg Doucette,
not with VALD. The recipes are original: they use the same *techniques* the
high-volume approach popularised, which belong to everyone, but no recipe text,
ingredient list or headnote is copied from any book.

**Not medical advice.**

---

## Data and sync

Everything is in `localStorage` on the device. To sync:

1. **Export** on the device you just trained on → a JSON file.
2. Save it to Dropbox or iCloud Drive.
3. **Import** on the other device, choose **Merge**.

Merge de-duplicates by record id, so importing the same file twice does
nothing. Program state and personal bests take whichever side is further along.

**Export regularly.** Clearing browser data deletes everything, and iOS Safari
evicts site storage on its own after several weeks of disuse. The export file is
the only backup that exists.

---

## Layout

```
index.html            app shell
manifest.webmanifest  PWA manifest
sw.js                 service worker — network-first, cache fallback
serve.py              dev server (--https for phone install)
tests.html/.js        125-assertion browser test suite
css/app.css
js/
  app.js              router, rest timer, bottom sheet
  util.js             DOM, maths, plate loading, charts, number parsing
  store.js            persistence, export/import, migration
  programs.js         Starting Strength progression engine
  nutrition.js        RMR/TDEE/macros, food table
  sensors.js          accelerometer: jump, sway, inclinometer, wake lock
  movement.js         test definitions and result analysis
  data/exercises.js   lifts, assistance, conditioning
  data/recipes.js     recipes, macros computed from ingredients
  views/              train, log, lab, health, food, more
tools/make_icons.py   regenerates the PWA icon set
```

No framework, no build step, no dependencies. Edit a file, reload the page.

---

## Notes for future edits

- **Numeric inputs are `type="text"` with `inputmode`, never `type="number"`.**
  A native number input displays in the user's locale, so an Estonian keyboard
  offers a comma — and when a comma is entered, `.value` returns an empty
  string and the number is silently lost. Everything numeric goes through
  `parseNum()` in `util.js`, which accepts both separators. There is a
  regression test guarding this.
- **The service worker is network-first.** Cache-first loads marginally faster
  but keeps serving a fixed bug until the cache version is bumped, which for a
  training log is the worse trade. Offline still works fully: everything is
  precached on install.
- **Bump `CACHE` in `sw.js`** when you add or remove a file from `ASSETS`.
- The session runner never re-renders. If you add something to it, patch the
  DOM in place the way `refreshSummary()` does, or logging a set will throw the
  user back to the top of the page mid-workout.
