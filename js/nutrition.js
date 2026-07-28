// Calorie and macro planning.
//
// Mifflin-St Jeor for resting metabolic rate, an activity multiplier for total
// expenditure, then a goal offset. Every number the app shows is an estimate
// with real error bars — the planner says so rather than pretending otherwise.

export const ACTIVITY = {
  sedentary: { mult: 1.2, label: 'Sedentary', note: 'Desk job, no training.' },
  light: { mult: 1.375, label: 'Light', note: 'Lifting 3 ×/week, otherwise seated.' },
  moderate: { mult: 1.55, label: 'Moderate', note: 'Lifting 3 ×/week plus conditioning, on your feet some of the day.' },
  active: { mult: 1.725, label: 'Active', note: 'Daily training or physical work.' },
  veryActive: { mult: 1.9, label: 'Very active', note: 'Two sessions a day, or hard manual labour.' },
};

export const GOALS = {
  gain: {
    label: 'Gain — running a linear progression',
    offset: 400,
    proteinPerKg: 2.0,
    note: 'A novice adding weight to the bar every session needs the surplus. Expect roughly 0.25–0.5 kg per week; faster than that is mostly fat.',
  },
  leanGain: {
    label: 'Lean gain',
    offset: 200,
    proteinPerKg: 2.2,
    note: 'Slower, and it will slow your progression too. Choose this only if the mirror matters more than the bar right now.',
  },
  maintain: {
    label: 'Maintain',
    offset: 0,
    proteinPerKg: 2.0,
    note: 'Strength still goes up on maintenance, just not as fast. Reasonable for an intermediate.',
  },
  cut: {
    label: 'Cut',
    offset: -500,
    proteinPerKg: 2.4,
    note: 'Protein goes up, not down. Expect to hold strength at best — a linear progression will not survive a deficit.',
  },
  aggressiveCut: {
    label: 'Aggressive cut',
    offset: -750,
    proteinPerKg: 2.6,
    note: 'Roughly 0.75 kg per week. Sustainable for a block, not a lifestyle. Strength will drop.',
  },
};

/** Mifflin-St Jeor. Accurate to roughly ±10 % for most people. */
export function bmr({ sex, weightKg, heightCm, age }) {
  if (!weightKg || !heightCm || !age) return null;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'female' ? base - 161 : base + 5;
}

/**
 * Full plan. Protein is anchored to bodyweight, fat gets a hormonal floor of
 * 0.8 g/kg, and carbohydrate takes whatever is left — which is the right way
 * round for someone whose job is moving a barbell.
 */
export function plan(profile) {
  const { sex, bodyweightKg: weightKg, heightCm, age, activity, goal } = profile;
  const rmr = bmr({ sex, weightKg, heightCm, age });
  if (!rmr) return null;

  const act = ACTIVITY[activity] || ACTIVITY.moderate;
  const g = GOALS[goal] || GOALS.maintain;
  const tdee = Math.round(rmr * act.mult);
  const kcal = Math.round(tdee + g.offset);

  const protein = Math.round(weightKg * g.proteinPerKg);
  const fatFloor = Math.round(weightKg * 0.8);
  // Keep fat near 25 % of intake, but never below the floor.
  const fat = Math.max(fatFloor, Math.round((kcal * 0.25) / 9));
  const carbKcal = kcal - protein * 4 - fat * 9;
  const carbs = Math.max(0, Math.round(carbKcal / 4));

  return {
    rmr: Math.round(rmr),
    tdee,
    kcal,
    protein,
    fat,
    carbs,
    goal: g,
    activity: act,
    // Honest uncertainty: the equation itself carries roughly ±10 %, and the
    // activity multiplier is a bigger source of error than the equation.
    kcalRange: [Math.round(kcal * 0.9), Math.round(kcal * 1.1)],
    basis: { equation: 'Mifflin-St Jeor', activity, goal, weightKg },
  };
}

/**
 * Compare planned intake against measured bodyweight change and correct.
 * This is the only part of calorie planning that is not guesswork: after two
 * weeks of real data, the scale beats any equation.
 */
export function calibrate(kcalTarget, weightSeries, days = 14) {
  if (weightSeries.length < 4) return null;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const recent = weightSeries.filter((p) => p.x >= cutoff);
  if (recent.length < 4) return null;

  const spanDays = Math.max(1, (new Date(recent.at(-1).x) - new Date(recent[0].x)) / 86400000);
  const deltaKg = recent.at(-1).y - recent[0].y;
  const perWeek = (deltaKg / spanDays) * 7;
  // ~7700 kcal per kg of body mass.
  const impliedDailyOffset = Math.round((deltaKg * 7700) / spanDays);

  return {
    days: Math.round(spanDays),
    deltaKg,
    perWeek,
    impliedDailyOffset,
    impliedTDEE: kcalTarget - impliedDailyOffset,
    readings: recent.length,
  };
}

export const kcalOf = (p, c, f) => p * 4 + c * 4 + f * 9;

/** Sum a day's food log. */
export function dayTotals(log, date) {
  const items = log.filter((i) => i.date === date);
  return items.reduce(
    (a, i) => ({
      kcal: a.kcal + (i.kcal || 0),
      p: a.p + (i.p || 0),
      c: a.c + (i.c || 0),
      f: a.f + (i.f || 0),
      count: a.count + 1,
    }),
    { kcal: 0, p: 0, c: 0, f: 0, count: 0 }
  );
}

// ---------------------------------------------------------------------------
// GOMAD, because it will come up.
// ---------------------------------------------------------------------------
export const GOMAD_NOTE = {
  title: 'A note on GOMAD',
  body:
    'A gallon of whole milk a day is about 3.8 litres, 2 400 kcal and 128 g of protein on top of what you already eat. It exists for one specific case: an underweight teenage male, on a novice progression, who genuinely cannot eat enough solid food. It is not general advice, it is not for a 40-year-old, and it will make a lean adult fat while doing very little for the bar. If you are not that teenager, add 400 kcal of food and move on.',
  litresPerGallon: 3.785,
  kcalPerLitre: 640,
  proteinPerLitre: 33,
};

// ---------------------------------------------------------------------------
// Base food table.
// Values per 100 g unless the unit says otherwise. Rounded from standard
// composition tables; treat them as ±10 %, like every nutrition label.
// ---------------------------------------------------------------------------
export const FOODS = [
  // protein
  { id: 'f-chicken', name: 'Chicken breast, cooked', per: 100, unit: 'g', kcal: 165, p: 31, c: 0, f: 3.6, tags: ['protein'] },
  { id: 'f-turkey', name: 'Extra-lean ground turkey, cooked', per: 100, unit: 'g', kcal: 150, p: 30, c: 0, f: 3, tags: ['protein'] },
  { id: 'f-beef95', name: 'Lean beef mince 5 % fat, cooked', per: 100, unit: 'g', kcal: 175, p: 27, c: 0, f: 7, tags: ['protein'] },
  { id: 'f-beef80', name: 'Beef mince 20 % fat, cooked', per: 100, unit: 'g', kcal: 272, p: 25, c: 0, f: 19, tags: ['protein'] },
  { id: 'f-salmon', name: 'Salmon, cooked', per: 100, unit: 'g', kcal: 208, p: 22, c: 0, f: 13, tags: ['protein'] },
  { id: 'f-cod', name: 'White fish (cod), cooked', per: 100, unit: 'g', kcal: 105, p: 23, c: 0, f: 1, tags: ['protein'] },
  { id: 'f-tuna', name: 'Tuna in water, drained', per: 100, unit: 'g', kcal: 116, p: 26, c: 0, f: 1, tags: ['protein'] },
  { id: 'f-shrimp', name: 'Prawns, cooked', per: 100, unit: 'g', kcal: 99, p: 24, c: 0, f: 0.3, tags: ['protein'] },
  { id: 'f-eggwhite', name: 'Egg whites', per: 100, unit: 'g', kcal: 52, p: 11, c: 0.7, f: 0.2, tags: ['protein', 'staple'] },
  { id: 'f-egg', name: 'Whole egg', per: 50, unit: 'g (1 egg)', kcal: 72, p: 6.3, c: 0.4, f: 5, tags: ['protein'] },
  { id: 'f-quark', name: 'Quark, fat-free', per: 100, unit: 'g', kcal: 68, p: 12, c: 4, f: 0.2, tags: ['protein', 'staple'] },
  { id: 'f-skyr', name: 'Skyr / 0 % Greek yoghurt', per: 100, unit: 'g', kcal: 57, p: 10, c: 4, f: 0.2, tags: ['protein', 'staple'] },
  { id: 'f-cottage', name: 'Cottage cheese, low fat', per: 100, unit: 'g', kcal: 72, p: 12, c: 3, f: 1, tags: ['protein'] },
  { id: 'f-whey', name: 'Whey protein isolate', per: 30, unit: 'g (1 scoop)', kcal: 113, p: 25, c: 1.5, f: 0.5, tags: ['protein', 'supplement'] },
  { id: 'f-casein', name: 'Micellar casein', per: 30, unit: 'g (1 scoop)', kcal: 110, p: 24, c: 2, f: 0.7, tags: ['protein', 'supplement'] },
  { id: 'f-milk', name: 'Whole milk', per: 250, unit: 'ml (1 cup)', kcal: 155, p: 8, c: 12, f: 8, tags: ['protein'] },
  { id: 'f-milkskim', name: 'Skimmed milk', per: 250, unit: 'ml (1 cup)', kcal: 85, p: 8, c: 12, f: 0.2, tags: ['protein'] },

  // carbs
  { id: 'f-rice', name: 'White rice, cooked', per: 100, unit: 'g', kcal: 130, p: 2.7, c: 28, f: 0.3, tags: ['carb'] },
  { id: 'f-oats', name: 'Rolled oats, dry', per: 100, unit: 'g', kcal: 379, p: 13, c: 67, f: 7, tags: ['carb', 'staple'] },
  { id: 'f-potato', name: 'Potato, boiled', per: 100, unit: 'g', kcal: 87, p: 2, c: 20, f: 0.1, tags: ['carb'] },
  { id: 'f-sweetpot', name: 'Sweet potato, baked', per: 100, unit: 'g', kcal: 90, p: 2, c: 21, f: 0.2, tags: ['carb'] },
  { id: 'f-pasta', name: 'Pasta, cooked', per: 100, unit: 'g', kcal: 158, p: 6, c: 31, f: 0.9, tags: ['carb'] },
  { id: 'f-bread', name: 'White bread', per: 30, unit: 'g (1 slice)', kcal: 80, p: 2.7, c: 15, f: 1, tags: ['carb'] },
  { id: 'f-ricecake', name: 'Rice cake', per: 9, unit: 'g (1 cake)', kcal: 35, p: 0.7, c: 7.3, f: 0.3, tags: ['carb'] },
  { id: 'f-tortilla', name: 'Low-carb tortilla', per: 42, unit: 'g (1 wrap)', kcal: 70, p: 5, c: 16, f: 2, tags: ['carb'] },

  // fruit / veg
  { id: 'f-banana', name: 'Banana', per: 120, unit: 'g (1 medium)', kcal: 105, p: 1.3, c: 27, f: 0.4, tags: ['fruit'] },
  { id: 'f-berries', name: 'Mixed berries, frozen', per: 100, unit: 'g', kcal: 50, p: 0.8, c: 11, f: 0.4, tags: ['fruit'] },
  { id: 'f-apple', name: 'Apple', per: 180, unit: 'g (1 medium)', kcal: 95, p: 0.5, c: 25, f: 0.3, tags: ['fruit'] },
  { id: 'f-broccoli', name: 'Broccoli, raw', per: 100, unit: 'g', kcal: 34, p: 2.8, c: 7, f: 0.4, tags: ['veg'] },
  { id: 'f-spinach', name: 'Spinach, raw', per: 100, unit: 'g', kcal: 23, p: 2.9, c: 3.6, f: 0.4, tags: ['veg'] },
  { id: 'f-cauli', name: 'Cauliflower, raw', per: 100, unit: 'g', kcal: 25, p: 1.9, c: 5, f: 0.3, tags: ['veg', 'staple'] },
  { id: 'f-caulirice', name: 'Cauliflower rice', per: 100, unit: 'g', kcal: 25, p: 1.9, c: 5, f: 0.3, tags: ['veg', 'staple'] },
  { id: 'f-courgette', name: 'Courgette', per: 100, unit: 'g', kcal: 17, p: 1.2, c: 3.1, f: 0.3, tags: ['veg'] },
  { id: 'f-tomato', name: 'Tomato', per: 100, unit: 'g', kcal: 18, p: 0.9, c: 3.9, f: 0.2, tags: ['veg'] },
  { id: 'f-pumpkin', name: 'Pumpkin purée, tinned', per: 100, unit: 'g', kcal: 34, p: 1.1, c: 8, f: 0.3, tags: ['veg', 'staple'] },

  // fats & extras
  { id: 'f-oliveoil', name: 'Olive oil', per: 14, unit: 'g (1 tbsp)', kcal: 119, p: 0, c: 0, f: 13.5, tags: ['fat'] },
  { id: 'f-pb', name: 'Peanut butter', per: 32, unit: 'g (2 tbsp)', kcal: 190, p: 8, c: 6, f: 16, tags: ['fat'] },
  { id: 'f-pbpowder', name: 'Powdered peanut butter', per: 12, unit: 'g (2 tbsp)', kcal: 45, p: 5, c: 4, f: 1.5, tags: ['fat', 'staple'] },
  { id: 'f-almonds', name: 'Almonds', per: 28, unit: 'g (1 oz)', kcal: 164, p: 6, c: 6, f: 14, tags: ['fat'] },
  { id: 'f-avocado', name: 'Avocado', per: 100, unit: 'g', kcal: 160, p: 2, c: 9, f: 15, tags: ['fat'] },
  { id: 'f-cheese0', name: 'Fat-free grated cheese', per: 28, unit: 'g', kcal: 40, p: 9, c: 1, f: 0, tags: ['staple'] },
  { id: 'f-cheese', name: 'Cheddar', per: 28, unit: 'g', kcal: 113, p: 7, c: 0.4, f: 9, tags: ['fat'] },
  { id: 'f-cocoa', name: 'Cocoa powder, unsweetened', per: 5, unit: 'g (1 tbsp)', kcal: 12, p: 1, c: 3, f: 0.7, tags: ['staple'] },
  { id: 'f-syrup0', name: 'Zero-calorie syrup', per: 30, unit: 'ml (2 tbsp)', kcal: 0, p: 0, c: 0, f: 0, tags: ['staple'] },
  // Erythritol is a polyol: a label may declare it as carbohydrate, but it is
  // essentially unmetabolised, so it is counted as zero here. Declaring the
  // grams as carbs while declaring zero calories would break every macro
  // total it appears in.
  { id: 'f-sweetener', name: 'Granulated sweetener (erythritol)', per: 8, unit: 'g (1 tbsp)', kcal: 0, p: 0, c: 0, f: 0, tags: ['staple'] },
  { id: 'f-konjac', name: 'Konjac noodles, drained', per: 200, unit: 'g (1 pack)', kcal: 20, p: 0, c: 6, f: 0, tags: ['staple'] },
];

export function searchFoods(query, customFoods = []) {
  const all = [...FOODS, ...customFoods];
  if (!query) return all.slice(0, 40);
  const q = query.toLowerCase();
  return all
    .filter((f) => f.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q))
    .slice(0, 40);
}

/** Scale a food entry to an arbitrary quantity of its own unit. */
export function scaleFood(food, qty) {
  const k = qty / food.per;
  return {
    kcal: Math.round(food.kcal * k),
    p: +(food.p * k).toFixed(1),
    c: +(food.c * k).toFixed(1),
    f: +(food.f * k).toFixed(1),
  };
}
