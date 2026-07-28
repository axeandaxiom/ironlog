// Nutrition: the calorie plan, the daily log, and the cookbook.

import { el, uid, num, todayISO, toast, clamp, numInput, parseNum } from '../util.js';
import * as store from '../store.js';
import { plan, calibrate, dayTotals, searchFoods, scaleFood, ACTIVITY, GOALS, GOMAD_NOTE } from '../nutrition.js';
import { RECIPES, RECIPE_CATEGORIES, ALL_TAGS, computeMacros, ingredientLabel, filterRecipes } from '../data/recipes.js';
import { sheet, confirmSheet } from '../app.js';

let tab = 'today';

export function renderFood(view, ctx) {
  const db = store.get();

  const tabs = el('div', { class: 'chips', style: { marginBottom: '14px' } },
    [['today', 'Today'], ['plan', 'Plan'], ['kitchen', 'Kitchen']].map(([id, lbl]) => {
      const c = el('button', { class: 'chip', 'aria-pressed': String(tab === id) }, lbl);
      c.addEventListener('click', () => { tab = id; ctx.refresh(); });
      return c;
    }));

  view.append(el('h1', {}, 'Food'), tabs);

  if (tab === 'today') renderToday(view, ctx, db);
  else if (tab === 'plan') renderPlan(view, ctx, db);
  else renderKitchen(view, ctx, db);
}

// ---------------------------------------------------------------------------
// Today
// ---------------------------------------------------------------------------

function renderToday(view, ctx, db) {
  const t = db.nutrition.targets;
  const date = todayISO();
  const totals = dayTotals(db.nutrition.log, date);

  if (!t) {
    view.append(el('div', { class: 'note accent' },
      el('b', {}, 'No targets set. '),
      'Build a plan first so the numbers below mean something.'),
      el('button', { class: 'btn-primary btn-block', onclick: () => { tab = 'plan'; ctx.refresh(); } }, 'Build a plan'));
  } else {
    const pct = clamp((totals.kcal / t.kcal) * 100, 0, 100);
    view.append(el('div', { class: 'card' },
      el('div', { class: 'stat-grid' },
        stat(totals.kcal, 'kcal', totals.kcal > t.kcal * 1.1 ? 'warn' : null, `of ${t.kcal}`),
        stat(Math.round(totals.p), 'Protein g', totals.p >= t.protein ? 'good' : null, `of ${t.protein}`),
        stat(Math.round(totals.c), 'Carbs g', null, `of ${t.carbs}`),
        stat(Math.round(totals.f), 'Fat g', null, `of ${t.fat}`)),
      macroBar(totals),
      el('div', { class: 'note', style: { marginBottom: 0 } },
        totals.kcal === 0 ? 'Nothing logged today.'
          : totals.p < t.protein * 0.8
            ? `Protein is the one to hit. You are ${Math.round(t.protein - totals.p)} g short.`
            : totals.kcal < t.kcal * 0.8
              ? `${t.kcal - totals.kcal} kcal to go.`
              : `${Math.round(pct)} % of target calories, protein ${totals.p >= t.protein ? 'met' : 'short'}.`)
    ));
  }

  view.append(el('div', { class: 'btn-row' },
    el('button', { class: 'btn-primary', onclick: () => openAddFood(ctx, db, date) }, '+ Food'),
    el('button', { onclick: () => { tab = 'kitchen'; ctx.refresh(); } }, 'Recipes')));

  const items = db.nutrition.log.filter((i) => i.date === date);
  if (items.length) {
    view.append(el('h2', {}, 'Logged'));
    const list = el('div', { class: 'list' });
    for (const item of items) {
      list.append(el('div', { class: 'list-item' },
        el('div', { class: 'grow' },
          el('div', { class: 'li-title' }, item.name),
          el('div', { class: 'li-sub' }, `${num(item.qty)} ${item.unit} · ${item.p} P / ${item.c} C / ${item.f} F`)),
        el('div', { class: 'row', style: { gap: '8px' } },
          el('span', { class: 'li-right' }, `${item.kcal}`),
          el('button', { class: 'btn-sm btn-ghost', 'aria-label': 'Remove', onclick: () => {
            store.update((d) => { d.nutrition.log = d.nutrition.log.filter((x) => x.id !== item.id); });
            ctx.refresh();
          } }, '✕'))));
    }
    view.append(list);
  }

  // Recent days, so you can see whether the plan is being followed at all.
  const days = [...new Set(db.nutrition.log.map((i) => i.date))].sort().reverse().slice(0, 7);
  if (days.length > 1) {
    view.append(el('h2', {}, 'Last 7 days'));
    const list = el('div', { class: 'list' });
    for (const d of days) {
      const tt = dayTotals(db.nutrition.log, d);
      list.append(el('div', { class: 'list-item', style: { cursor: 'default' } },
        el('div', {},
          el('div', { class: 'li-title' }, d),
          el('div', { class: 'li-sub' }, `${Math.round(tt.p)} P / ${Math.round(tt.c)} C / ${Math.round(tt.f)} F`)),
        el('div', { class: 'li-right' }, `${tt.kcal} kcal`)));
    }
    view.append(list);
  }
}

function macroBar(t) {
  const total = t.p * 4 + t.c * 4 + t.f * 9 || 1;
  return el('div', {},
    el('div', { class: 'macro-bar' },
      el('i', { class: 'macro-p', style: { width: `${(t.p * 4 / total) * 100}%` } }),
      el('i', { class: 'macro-c', style: { width: `${(t.c * 4 / total) * 100}%` } }),
      el('i', { class: 'macro-f', style: { width: `${(t.f * 9 / total) * 100}%` } })),
    el('div', { class: 'macro-key' },
      el('span', { class: 'p' }, 'Protein'), el('span', { class: 'c' }, 'Carbs'), el('span', { class: 'f' }, 'Fat')));
}

const stat = (v, l, kind, sub) => el('div', { class: `stat ${kind || ''}` },
  el('div', { class: 'stat-val' }, String(v)),
  el('div', { class: 'stat-lbl' }, l),
  sub && el('div', { class: 'stat-sub' }, sub));

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

function renderPlan(view, ctx, db) {
  const p = db.profile;
  const inputs = {};

  const field = (key, label, opts = {}) => {
    const i = numInput({ value: p[key] ?? '' });
    void opts;
    inputs[key] = i;
    return el('div', { class: 'field' }, el('label', {}, label), i);
  };

  const sexSel = el('select', {}, el('option', { value: 'male' }, 'Male'), el('option', { value: 'female' }, 'Female'));
  sexSel.value = p.sex || 'male';
  const actSel = el('select', {}, Object.entries(ACTIVITY).map(([k, v]) => el('option', { value: k }, v.label)));
  actSel.value = p.activity || 'moderate';
  const goalSel = el('select', {}, Object.entries(GOALS).map(([k, v]) => el('option', { value: k }, v.label)));
  goalSel.value = p.goal || 'gain';

  const out = el('div');

  const recalc = () => {
    store.update((d) => {
      d.profile.sex = sexSel.value;
      d.profile.activity = actSel.value;
      d.profile.goal = goalSel.value;
      d.profile.age = parseNum(inputs.age) || null;
      d.profile.heightCm = parseNum(inputs.heightCm) || null;
      d.profile.bodyweightKg = parseNum(inputs.bodyweightKg) || null;
    });
    drawPlan(out, ctx, store.get());
  };

  [sexSel, actSel, goalSel].forEach((s) => s.addEventListener('change', recalc));

  view.append(
    el('div', { class: 'card' },
      el('div', { class: 'grid2' },
        el('div', { class: 'field' }, el('label', {}, 'Sex'), sexSel),
        field('age', 'Age')),
      el('div', { class: 'grid2' },
        field('heightCm', 'Height (cm)'),
        field('bodyweightKg', 'Bodyweight (kg)', { step: '0.1' })),
      el('div', { class: 'field' }, el('label', {}, 'Activity'), actSel),
      el('div', { class: 'field' }, el('label', {}, 'Goal'), goalSel),
      el('button', { class: 'btn-primary btn-block', onclick: recalc }, 'Calculate')
    ),
    out
  );

  Object.values(inputs).forEach((i) => i.addEventListener('change', recalc));
  drawPlan(out, ctx, db);
}

function drawPlan(out, ctx, db) {
  out.replaceChildren();
  const res = plan(db.profile);
  if (!res) {
    out.append(el('div', { class: 'note warn' }, 'Fill in age, height and bodyweight to get a plan.'));
    return;
  }

  out.append(
    el('div', { class: 'card' },
      el('div', { class: 'stat-grid' },
        stat(res.rmr, 'RMR', null, 'at rest'),
        stat(res.tdee, 'TDEE', null, res.activity.label.toLowerCase()),
        stat(res.kcal, 'Target', 'accent', `${res.goal.offset >= 0 ? '+' : ''}${res.goal.offset}`)),
      el('div', { class: 'grid3', style: { marginTop: '10px' } },
        stat(res.protein, 'Protein g'),
        stat(res.carbs, 'Carbs g'),
        stat(res.fat, 'Fat g')),
      el('div', { class: 'note' }, res.goal.note),
      el('div', { class: 'note warn' },
        `Realistic range: ${res.kcalRange[0]}–${res.kcalRange[1]} kcal. The Mifflin-St Jeor equation carries about ±10 %, and the activity multiplier carries more than that. Treat this as a starting hypothesis and let the scale correct it.`),
      el('button', { class: 'btn-primary btn-block', onclick: () => {
        store.update((d) => { d.nutrition.targets = res; });
        toast('Targets set', 'good');
        tab = 'today'; ctx.refresh();
      } }, 'Use these targets')
    )
  );

  // Calibration against real bodyweight data — the only non-guesswork here.
  const bw = store.metricSeries('m-bw', 30);
  const cal = calibrate(res.kcal, bw);
  out.append(el('h2', {}, 'Reality check'));
  if (!cal) {
    out.append(el('div', { class: 'note' },
      'Track bodyweight daily under Health. After a fortnight the app can compare what the equation predicted against what actually happened, and correct the target from your own data. That number beats any formula.'));
  } else {
    const off = cal.impliedDailyOffset;
    out.append(el('div', { class: 'card' },
      el('div', { class: 'stat-grid' },
        stat(`${cal.perWeek >= 0 ? '+' : ''}${num(cal.perWeek, 2)}`, 'kg / week'),
        stat(cal.impliedTDEE, 'Actual TDEE', 'accent'),
        stat(cal.readings, 'Readings', null, `${cal.days} days`)),
      el('div', { class: 'note' },
        `Your weight moved ${num(cal.deltaKg, 2)} kg over ${cal.days} days, which implies you have been running a ${off >= 0 ? 'surplus' : 'deficit'} of about ${Math.abs(off)} kcal a day. `
        + `That puts your real maintenance near ${cal.impliedTDEE} kcal, against the equation's estimate of ${res.tdee}. `
        + (Math.abs(cal.impliedTDEE - res.tdee) > 300
          ? 'That is a big enough gap to act on — adjust your target by the difference.'
          : 'Close enough to the estimate; no change needed.'))));
  }

  out.append(el('h2', {}, GOMAD_NOTE.title), el('div', { class: 'note warn' }, GOMAD_NOTE.body));
}

// ---------------------------------------------------------------------------
// Food logging
// ---------------------------------------------------------------------------

function openAddFood(ctx, db, date) {
  sheet('Add food', (body, close) => {
    const search = el('input', { placeholder: 'Search foods…', type: 'search' });
    const results = el('div', { class: 'list' });

    const draw = () => {
      results.replaceChildren();
      const found = searchFoods(search.value, db.nutrition.customFoods);
      if (!found.length) {
        results.append(el('p', { class: 'sub' }, 'Nothing matched. Add it as a custom food below.'));
      }
      for (const f of found) {
        results.append(el('button', { class: 'list-item', onclick: () => { close(); openQty(ctx, db, f, date); } },
          el('div', { class: 'grow' },
            el('div', { class: 'li-title' }, f.name),
            el('div', { class: 'li-sub' }, `per ${f.per} ${f.unit} · ${f.p} P / ${f.c} C / ${f.f} F`)),
          el('span', { class: 'li-right' }, `${f.kcal}`)));
      }
    };
    search.addEventListener('input', draw);
    draw();

    body.append(search, el('div', { style: { height: '10px' } }), results,
      el('button', { class: 'btn-block', style: { marginTop: '12px' },
        onclick: () => { close(); openCustomFood(ctx, date); } }, '+ Custom food'));
  });
}

function openQty(ctx, db, food, date) {
  sheet(food.name, (body, close) => {
    const qty = numInput({ value: String(food.per) });
    const out = el('div', { class: 'stat-grid' });
    const draw = () => {
      const m = scaleFood(food, parseNum(qty) || 0);
      out.replaceChildren(stat(m.kcal, 'kcal'), stat(m.p, 'P'), stat(m.c, 'C'), stat(m.f, 'F'));
    };
    qty.addEventListener('input', draw);
    draw();

    body.append(
      el('div', { class: 'field' }, el('label', {}, `Amount (${food.unit.replace(/\s*\(.*/, '')})`), qty),
      out,
      el('button', { class: 'btn-primary btn-block', style: { marginTop: '12px' }, onclick: () => {
        const q = parseNum(qty) || 0;
        const m = scaleFood(food, q);
        store.update((d) => d.nutrition.log.push({
          id: uid(), date, name: food.name, qty: q, unit: food.unit.replace(/\s*\(.*/, ''), ...m,
        }));
        close(); toast('Logged', 'good'); ctx.refresh();
      } }, 'Log it')
    );
  });
}

function openCustomFood(ctx, date) {
  sheet('Custom food', (body, close) => {
    const f = {};
    const mk = (k, label, step = '1') => {
      const i = k === 'name' || k === 'unit' ? el('input', { type: 'text' }) : numInput({});
      void step;
      f[k] = i;
      return el('div', { class: 'field' }, el('label', {}, label), i);
    };
    body.append(
      mk('name', 'Name'),
      el('div', { class: 'grid2' }, mk('per', 'Serving size', '1'), mk('unit', 'Unit (g, ml, piece)')),
      el('div', { class: 'grid2' }, mk('kcal', 'kcal'), mk('p', 'Protein g', '0.1')),
      el('div', { class: 'grid2' }, mk('c', 'Carbs g', '0.1'), mk('f', 'Fat g', '0.1')),
      el('div', { class: 'note' }, 'Saved to your own food list so you only type it once.'),
      el('button', { class: 'btn-primary btn-block', onclick: () => {
        if (!f.name.value.trim()) { toast('Name it', 'bad'); return; }
        const food = {
          id: uid(), name: f.name.value.trim(),
          per: parseNum(f.per) || 100, unit: f.unit.value || 'g',
          kcal: parseNum(f.kcal) || 0, p: parseNum(f.p) || 0,
          c: parseNum(f.c) || 0, f: parseNum(f.f) || 0, tags: ['custom'],
        };
        store.update((d) => d.nutrition.customFoods.push(food));
        close(); openQty(ctx, store.get(), food, date);
      } }, 'Save')
    );
  });
}

// ---------------------------------------------------------------------------
// Kitchen
// ---------------------------------------------------------------------------

let kitchenFilter = { category: null, tag: null };

/**
 * Hands-on time, then total. Overnight recipes are mostly waiting, and
 * "480 min" reads like a mistake rather than a soak.
 */
function fmtPrep(r) {
  const total = r.readyMin >= 120
    ? `${Math.round(r.readyMin / 60)} h`
    : `${r.readyMin} min`;
  return r.readyMin >= 120 ? `${r.prepMin} min hands-on, ${total}` : total;
}

function renderKitchen(view, ctx, db) {
  view.append(el('div', { class: 'note' },
    el('b', {}, 'High-volume cooking. '),
    'The principle behind every recipe here: make the plate physically bigger without making it more calorific. Water, fibre and lean protein do that; fat and sugar do the opposite. Swap suggestions are on every recipe — the point is that you adapt them rather than follow them.'));

  const catChips = el('div', { class: 'chips', style: { margin: '10px 0' } },
    [null, ...RECIPE_CATEGORIES].map((c) => {
      const b = el('button', { class: 'chip', 'aria-pressed': String(kitchenFilter.category === c) }, c || 'All');
      b.addEventListener('click', () => { kitchenFilter.category = c; ctx.refresh(); });
      return b;
    }));

  const tagChips = el('div', { class: 'chips', style: { margin: '0 0 14px' } },
    [null, ...ALL_TAGS].map((t) => {
      const b = el('button', { class: 'chip', 'aria-pressed': String(kitchenFilter.tag === t) }, t || 'any tag');
      b.addEventListener('click', () => { kitchenFilter.tag = t; ctx.refresh(); });
      return b;
    }));

  view.append(catChips, tagChips);

  const list = el('div', { class: 'list' });
  const found = filterRecipes(kitchenFilter);
  if (!found.length) list.append(el('p', { class: 'sub' }, 'No recipes match that combination.'));

  for (const r of found) {
    const m = computeMacros(r);
    list.append(el('button', { class: 'list-item', onclick: () => openRecipe(ctx, db, r) },
      el('div', { class: 'grow' },
        el('div', { class: 'li-title' }, r.name),
        el('div', { class: 'li-sub' }, `${r.category} · ${fmtPrep(r)} · ${m.p} g protein · ${m.proteinPct} % of calories from protein`)),
      el('div', { class: 'li-right', style: { fontSize: '15px', color: 'var(--text)' } }, `${m.kcal}`)));
  }
  view.append(list);
}

function openRecipe(ctx, db, r) {
  const m = computeMacros(r);
  sheet(r.name, (body, close) => {
    body.append(
      el('div', { class: 'row wrap', style: { gap: '6px', marginBottom: '10px' } },
        r.tags.map((t) => el('span', { class: 'pill' }, t))),
      el('div', { class: 'stat-grid' },
        stat(m.kcal, 'kcal', null, 'per serving'),
        stat(m.p, 'Protein g', 'good'),
        stat(m.c, 'Carbs g'),
        stat(m.f, 'Fat g')),
      m.density && el('div', { class: 'note' },
        `About ${m.density} kcal per 100 g of finished food, ${m.proteinPct} % of calories from protein. Calorie density is what decides whether a meal feels like enough — anything under roughly 120 kcal/100 g eats like a large meal.`),
      el('div', { class: 'note accent' }, el('b', {}, 'Why it works: '), r.technique),

      el('h3', {}, `Ingredients — ${r.servings} serving${r.servings === 1 ? '' : 's'}`),
      el('ul', { class: 'ing-list' }, r.ingredients.map((i) => el('li', {}, ingredientLabel(i)))),

      el('h3', {}, 'Method'),
      el('ol', { class: 'recipe-steps' }, r.steps.map((s) => el('li', {}, s))),

      el('h3', {}, 'Swaps'),
      el('ul', { class: 'recipe-steps' }, r.swaps.map((s) => el('li', {}, s))),
      el('div', { class: 'note warn' },
        'When you swap, swap for something with a similar job and similar calories, then recalculate. Replacing chicken breast with the same weight of thigh is not a like-for-like trade, and the macros above stop being true the moment you change something.'),

      el('button', { class: 'btn-primary btn-block', style: { marginTop: '12px' }, onclick: () => {
        store.update((d) => d.nutrition.log.push({
          id: uid(), date: todayISO(), name: r.name, qty: 1, unit: 'serving',
          kcal: m.kcal, p: m.p, c: m.c, f: m.f,
        }));
        close(); toast('Logged to today', 'good'); tab = 'today'; ctx.refresh();
      } }, 'Log one serving')
    );
  });
}
