// Recipes.
//
// These are original. What they borrow is method, not content: the
// high-volume / low-calorie-density approach — egg-white batters, protein
// powder and cocoa in place of flour and sugar, cauliflower and konjac
// standing in for rice and pasta, fat-free dairy, powdered peanut butter,
// zero-calorie syrup, the air fryer and the microwave mug technique. Those are
// techniques, and techniques belong to everyone. The dishes, ratios, steps and
// wording below are mine.
//
// Macros are NOT hand-written. Every recipe declares its ingredients by weight
// and the app sums them from the food table at runtime, so the numbers cannot
// drift from the ingredient list. Treat them as ±10 %, like any label.

import { FOODS } from '../nutrition.js';

const FOOD_BY_ID = Object.fromEntries(FOODS.map((f) => [f.id, f]));

// Ingredients used in cooking that aren't worth a row in the main food table.
// Values are per the unit given in each recipe line.
const EXTRAS = {
  spice: { kcal: 0, p: 0, c: 0, f: 0 },                    // per portion, negligible
  vanilla: { per: 5, kcal: 12, p: 0, c: 0.5, f: 0 },       // per 5 ml
  bakingPowder: { per: 5, kcal: 2, p: 0, c: 1.3, f: 0 },
  cookingSpray: { per: 1, kcal: 2, p: 0, c: 0, f: 0.2 },   // per 1 s spray
  passata: { per: 100, kcal: 32, p: 1.5, c: 6, f: 0.2 },
  onion: { per: 100, kcal: 40, p: 1.1, c: 9.3, f: 0.1 },
  pepper: { per: 100, kcal: 31, p: 1, c: 6, f: 0.3 },
  mushroom: { per: 100, kcal: 22, p: 3.1, c: 3.3, f: 0.3 },
  greenBeans: { per: 100, kcal: 31, p: 1.8, c: 7, f: 0.2 },
  asparagus: { per: 100, kcal: 20, p: 2.2, c: 3.9, f: 0.1 },
  cucumber: { per: 100, kcal: 15, p: 0.7, c: 3.6, f: 0.1 },
  lemon: { per: 15, kcal: 4, p: 0, c: 1.3, f: 0 },
  soy: { per: 15, kcal: 8, p: 1.3, c: 0.8, f: 0 },
  mustard: { per: 10, kcal: 6, p: 0.4, c: 0.6, f: 0.3 },
  hotSauce: { per: 15, kcal: 5, p: 0.2, c: 1, f: 0.1 },
  gelatin: { per: 7, kcal: 23, p: 6, c: 0, f: 0 },
  psyllium: { per: 5, kcal: 15, p: 0.1, c: 4, f: 0.1 },
  xanthan: { per: 1, kcal: 3, p: 0, c: 0.8, f: 0 },
  coffee: { per: 240, kcal: 2, p: 0.3, c: 0, f: 0 },
  saltCal: { kcal: 0, p: 0, c: 0, f: 0 },
};

/** Resolve one ingredient line to its macro contribution. */
function lineMacros(ing) {
  if (ing.food) {
    const f = FOOD_BY_ID[ing.food];
    if (!f) return { kcal: 0, p: 0, c: 0, f: 0, missing: ing.food };
    const k = ing.qty / f.per;
    return { kcal: f.kcal * k, p: f.p * k, c: f.c * k, f: f.f * k };
  }
  if (ing.extra) {
    const e = EXTRAS[ing.extra];
    if (!e) return { kcal: 0, p: 0, c: 0, f: 0, missing: ing.extra };
    const k = e.per ? ing.qty / e.per : 1;
    return { kcal: e.kcal * k, p: e.p * k, c: e.c * k, f: e.f * k };
  }
  return { kcal: ing.kcal || 0, p: ing.p || 0, c: ing.c || 0, f: ing.f || 0 };
}

/** Per-serving macros, summed from the ingredient list. */
export function computeMacros(recipe) {
  const total = recipe.ingredients.reduce(
    (a, ing) => {
      const m = lineMacros(ing);
      return { kcal: a.kcal + m.kcal, p: a.p + m.p, c: a.c + m.c, f: a.f + m.f };
    },
    { kcal: 0, p: 0, c: 0, f: 0 }
  );
  const s = recipe.servings || 1;
  return {
    kcal: Math.round(total.kcal / s),
    p: Math.round((total.p / s) * 10) / 10,
    c: Math.round((total.c / s) * 10) / 10,
    f: Math.round((total.f / s) * 10) / 10,
    proteinPct: Math.round(((total.p * 4) / total.kcal) * 100),
    // Calories per 100 g of finished food — the number that actually decides
    // whether a meal feels like enough.
    density: recipe.weightG ? Math.round((total.kcal / recipe.weightG) * 100) : null,
  };
}

/** Human-readable ingredient line. */
export function ingredientLabel(ing) {
  if (ing.text) return ing.text;
  if (ing.food) {
    const f = FOOD_BY_ID[ing.food];
    const unit = f?.unit?.startsWith('ml') ? 'ml' : 'g';
    return `${ing.qty} ${unit} ${(f?.name || ing.food).toLowerCase()}`;
  }
  return `${ing.qty ?? ''} ${ing.label || ing.extra || ''}`.trim();
}

export const RECIPES = [
  // ------------------------------------------------------------------ breakfast
  {
    id: 'r-kohuke-oats',
    name: 'Curd & Berry Overnight Oats',
    category: 'Breakfast',
    tags: ['vegetarian', 'no-cook', 'meal-prep'],
    prepMin: 5, readyMin: 480, difficulty: 'easy', servings: 1, weightG: 400,
    technique: 'Fat-free quark carries the protein so the oats do not have to. Soaking overnight roughly doubles the finished volume for the same calories.',
    ingredients: [
      { food: 'f-oats', qty: 60 },
      { food: 'f-quark', qty: 200 },
      { food: 'f-berries', qty: 100 },
      { food: 'f-sweetener', qty: 8 },
      { extra: 'vanilla', qty: 5 },
      { text: 'Cinnamon, to taste' },
    ],
    steps: [
      'Stir the oats, quark, sweetener and vanilla together in a jar. It will look far too thick — that is correct.',
      'Fold the frozen berries straight in. They release water overnight and loosen the whole thing.',
      'Lid on, fridge, at least six hours.',
      'Stir before eating and add a splash of water if you want it looser.',
    ],
    swaps: [
      'No quark: 200 g skyr costs about 20 kcal more and works identically.',
      'Cutting: drop the oats to 40 g and add 100 g more berries — same volume, 75 fewer calories.',
      'Bulking: 30 g whey and 100 ml milk on top.',
    ],
  },
  {
    id: 'r-apple-bake',
    name: 'Cinnamon Apple Egg-White Bake',
    category: 'Breakfast',
    tags: ['vegetarian', 'meal-prep'],
    prepMin: 10, readyMin: 45, difficulty: 'easy', servings: 2, weightG: 700,
    technique: 'Bread soaked in seasoned egg white and baked rather than fried — the custard sets around the bread and the protein comes from the soak, not from the loaf.',
    ingredients: [
      { food: 'f-bread', qty: 120 },
      { food: 'f-eggwhite', qty: 360 },
      { food: 'f-apple', qty: 180 },
      { food: 'f-sweetener', qty: 16 },
      { extra: 'vanilla', qty: 5 },
      { extra: 'cookingSpray', qty: 2 },
      { text: '2 tsp cinnamon, pinch of salt' },
    ],
    steps: [
      'Heat the oven to 180 °C. Spray a small baking dish.',
      'Tear the bread into rough cubes — torn edges soak better than cut ones.',
      'Whisk the egg whites with sweetener, vanilla, cinnamon and salt until there is no clear liquid left at the bottom.',
      'Grate the apple coarsely, skin on, and fold it through the bread.',
      'Pour the egg mixture over, press the bread down and leave it ten minutes to absorb. Do not skip this.',
      'Bake 30–35 minutes until the centre is set and the top has browned.',
      'Portions keep four days in the fridge and reheat well.',
    ],
    swaps: [
      'Any bread works — heavier bread means more calories, so weigh it rather than counting slices.',
      'Swap the apple for 150 g frozen berries; add them frozen or they bleed through the custard.',
      'Zero-calorie syrup over the top adds nothing to the total.',
    ],
  },
  {
    id: 'r-cauli-pancakes',
    name: 'Cauliflower Protein Pancakes',
    category: 'Breakfast',
    tags: ['vegetarian', 'high-volume'],
    prepMin: 10, readyMin: 20, difficulty: 'medium', servings: 1, weightG: 420,
    technique: 'Riced cauliflower replaces roughly half the oat flour. It contributes water and bulk and almost no calories, so the stack gets visibly bigger while the total stays flat.',
    ingredients: [
      { food: 'f-caulirice', qty: 150 },
      { food: 'f-oats', qty: 40 },
      { food: 'f-eggwhite', qty: 150 },
      { food: 'f-whey', qty: 30 },
      { extra: 'bakingPowder', qty: 5 },
      { extra: 'cookingSpray', qty: 2 },
      { food: 'f-syrup0', qty: 30 },
      { text: 'Cinnamon and a pinch of salt' },
    ],
    steps: [
      'Microwave the cauliflower rice for two minutes, then squeeze it dry in a tea towel. Wet cauliflower makes a wet pancake — this step is the whole recipe.',
      'Blitz the oats to flour, then blend everything except the spray and syrup until smooth.',
      'Rest the batter five minutes so the oats hydrate and the baking powder starts working.',
      'Medium-low heat, sprayed pan. Two heaped spoons per pancake.',
      'Flip only when the edges are dry and bubbles hold open — protein batters tear if you rush them.',
      'Stack and pour over the zero-calorie syrup.',
    ],
    swaps: [
      'Casein in place of whey gives a thicker, cakier pancake. Whey alone runs thin.',
      'No cauliflower: 100 g grated courgette, squeezed just as dry.',
    ],
  },
  {
    id: 'r-savoury-scramble',
    name: 'Cottage Cheese Scramble with Spinach',
    category: 'Breakfast',
    tags: ['vegetarian', 'quick', 'low-carb'],
    prepMin: 5, readyMin: 10, difficulty: 'easy', servings: 1, weightG: 450,
    technique: 'Cottage cheese stirred into egg whites off the heat keeps them soft. Egg whites alone go rubbery within seconds of setting.',
    ingredients: [
      { food: 'f-eggwhite', qty: 240 },
      { food: 'f-egg', qty: 50 },
      { food: 'f-cottage', qty: 100 },
      { food: 'f-spinach', qty: 100 },
      { food: 'f-tomato', qty: 100 },
      { extra: 'cookingSpray', qty: 2 },
      { text: 'Black pepper, salt, chilli flakes' },
    ],
    steps: [
      'Wilt the spinach and tomato in a sprayed pan over high heat, then tip them out. Cooking them with the eggs waters the eggs down.',
      'Drop the heat to low. Add the egg whites and whole egg and stir constantly.',
      'The moment they are 80 % set, kill the heat and fold in the cottage cheese and the vegetables.',
      'Season hard. Egg whites need more salt than you think.',
    ],
    swaps: [
      'Whole eggs for whites: each swap of 50 g whites for one egg adds about 46 kcal, most of it fat.',
      'Any high-water vegetable works — mushrooms, courgette, peppers. Cook them separately regardless.',
    ],
  },

  // ------------------------------------------------------------------ mains
  {
    id: 'r-airfryer-chicken',
    name: 'Air-Fryer Paprika Chicken Bites',
    category: 'Main',
    tags: ['high-protein', 'meal-prep'],
    prepMin: 15, readyMin: 30, difficulty: 'easy', servings: 2, weightG: 600,
    technique: 'Egg white as the only binder, spices as the only coating. No flour, no breadcrumb, no oil — the air fryer does what the deep fryer would have done.',
    ingredients: [
      { food: 'f-chicken', qty: 400 },
      { food: 'f-eggwhite', qty: 60 },
      { extra: 'mustard', qty: 10 },
      { extra: 'hotSauce', qty: 15 },
      { extra: 'cookingSpray', qty: 3 },
      { text: '2 tsp smoked paprika, 1 tsp garlic powder, 1 tsp onion powder, ½ tsp cumin, salt' },
    ],
    steps: [
      'Cut the chicken into 3 cm pieces. Smaller than that and they dry out.',
      'Toss with the mustard and hot sauce and leave at least an hour — overnight is better.',
      'Drain, then coat in the egg white.',
      'Mix the spices in a bag, add the chicken, shake until every piece is covered.',
      'Air fryer at 200 °C for 12–14 minutes, shaking the basket at the halfway point. Do not crowd it — steamed chicken is not crisp chicken.',
    ],
    swaps: [
      'Turkey breast behaves the same. Chicken thigh does not: same weight, roughly 70 kcal more per 200 g.',
      'No air fryer: 220 °C oven on a wire rack, 18–20 minutes.',
    ],
  },
  {
    id: 'r-konjac-stirfry',
    name: 'Konjac Noodle Chicken Stir-Fry',
    category: 'Main',
    tags: ['high-volume', 'low-carb', 'quick'],
    prepMin: 10, readyMin: 20, difficulty: 'easy', servings: 1, weightG: 650,
    technique: 'Konjac noodles bring a full bowl for about 20 kcal. They need to be rinsed and dry-fried first or they taste of the packet.',
    ingredients: [
      { food: 'f-konjac', qty: 200 },
      { food: 'f-chicken', qty: 150 },
      { extra: 'pepper', qty: 100 },
      { extra: 'mushroom', qty: 100 },
      { food: 'f-broccoli', qty: 100 },
      { extra: 'soy', qty: 30 },
      { extra: 'hotSauce', qty: 15 },
      { extra: 'cookingSpray', qty: 2 },
      { text: 'Garlic, fresh ginger, spring onion' },
    ],
    steps: [
      'Rinse the noodles under cold water for a full minute, then dry-fry them in a hot pan for three minutes until they squeak. This is not optional.',
      'Set them aside. Sear the chicken hard in the sprayed pan and remove.',
      'Vegetables in next, on the highest heat you have, until they take colour but still snap.',
      'Everything back in the pan with the garlic, ginger, soy and hot sauce. Toss thirty seconds.',
      'Spring onion over the top off the heat.',
    ],
    swaps: [
      'Prawns instead of chicken: 150 g saves about 100 kcal.',
      'Real noodles: 100 g cooked pasta adds 158 kcal and turns this into a bulking meal.',
    ],
  },
  {
    id: 'r-courgette-lasagne',
    name: 'Courgette Sheet Lasagne',
    category: 'Main',
    tags: ['meal-prep', 'high-volume'],
    prepMin: 25, readyMin: 70, difficulty: 'medium', servings: 4, weightG: 1800,
    technique: 'Courgette planks in place of pasta sheets, quark in place of béchamel. The quark layer is what keeps it from tasting like a vegetable bake.',
    ingredients: [
      { food: 'f-courgette', qty: 600 },
      { food: 'f-beef95', qty: 500 },
      { extra: 'passata', qty: 400 },
      { extra: 'onion', qty: 150 },
      { extra: 'mushroom', qty: 200 },
      { food: 'f-quark', qty: 300 },
      { food: 'f-eggwhite', qty: 60 },
      { food: 'f-cheese0', qty: 84 },
      { extra: 'cookingSpray', qty: 3 },
      { text: 'Garlic, oregano, basil, salt, pepper' },
    ],
    steps: [
      'Slice the courgettes lengthways about 4 mm thick. Salt them and leave twenty minutes, then blot dry — otherwise the finished dish sits in a puddle.',
      'Brown the mince hard in a dry pan. Lean mince needs high heat to colour at all.',
      'Add onion, mushroom and garlic, cook down, then the passata and herbs. Simmer twenty minutes until thick.',
      'Beat the quark with the egg white and a good pinch of salt.',
      'Layer: meat, courgette, quark, repeat. Finish with meat and the fat-free cheese.',
      'Bake at 190 °C for 35 minutes, then rest fifteen minutes before cutting. Cutting it hot makes it collapse.',
    ],
    swaps: [
      'Actual pasta sheets: about 120 kcal per serving more.',
      'Turkey mince saves roughly 50 kcal per serving over 5 % beef.',
      'Vegetarian: 400 g of red lentils cooked into the sauce, and the protein lands within about 6 g per serving.',
    ],
  },
  {
    id: 'r-cod-dill',
    name: 'Baked Cod with Dill Potatoes',
    category: 'Main',
    tags: ['high-protein', 'quick'],
    prepMin: 10, readyMin: 30, difficulty: 'easy', servings: 1, weightG: 600,
    technique: 'Nothing clever here. White fish is the leanest protein per calorie in the shop, and this is what to do with it on a Tuesday.',
    ingredients: [
      { food: 'f-cod', qty: 200 },
      { food: 'f-potato', qty: 250 },
      { extra: 'asparagus', qty: 150 },
      { extra: 'lemon', qty: 15 },
      { food: 'f-oliveoil', qty: 7 },
      { text: 'Fresh dill, garlic, salt, pepper' },
    ],
    steps: [
      'Boil the potatoes until a knife goes through with slight resistance, then drain and crush them roughly.',
      'Toss the potatoes and asparagus with the oil, garlic, salt and pepper on a tray.',
      'Oven at 200 °C, 15 minutes.',
      'Lay the cod on top, lemon and dill over it, back in for 10–12 minutes until it flakes.',
      'The fish goes in late on purpose. Cod cooked for thirty minutes is a different and worse food.',
    ],
    swaps: [
      'Salmon instead of cod: same weight, about 200 kcal more, and worth it once or twice a week.',
      'Cutting: halve the potato and double the asparagus for 100 fewer calories at the same plate volume.',
    ],
  },
  {
    id: 'r-turkey-chilli',
    name: 'Turkey & Pumpkin Chilli',
    category: 'Main',
    tags: ['meal-prep', 'high-volume', 'freezer'],
    prepMin: 15, readyMin: 60, difficulty: 'easy', servings: 4, weightG: 2000,
    technique: 'Tinned pumpkin thickens the pot and adds body for almost nothing — it does the job that oil and flour do in most chilli recipes.',
    ingredients: [
      { food: 'f-turkey', qty: 600 },
      { extra: 'passata', qty: 400 },
      { food: 'f-pumpkin', qty: 400 },
      { extra: 'onion', qty: 200 },
      { extra: 'pepper', qty: 300 },
      { food: 'f-tomato', qty: 200 },
      { extra: 'cookingSpray', qty: 3 },
      { text: '2 tbsp chilli powder, 1 tbsp cumin, 2 tsp smoked paprika, garlic, bay, salt' },
    ],
    steps: [
      'Brown the turkey in a dry hot pot until it actually browns. Extra-lean mince will try to steam; keep the heat up and leave it alone.',
      'Onion, pepper and garlic in, cook until soft.',
      'Spices straight onto the dry pan for thirty seconds — this is where the flavour comes from.',
      'Passata, pumpkin, tomatoes, bay. Simmer 40 minutes uncovered.',
      'Season at the end, not the start.',
    ],
    swaps: [
      'A tin of drained kidney beans adds about 80 kcal and 5 g protein per serving.',
      '5 % beef instead of turkey: roughly 40 kcal more per serving.',
    ],
  },
  {
    id: 'r-cauli-pizza',
    name: 'Cauliflower Base Pizza',
    category: 'Main',
    tags: ['high-volume', 'low-carb'],
    prepMin: 20, readyMin: 45, difficulty: 'hard', servings: 1, weightG: 500,
    technique: 'The base is cauliflower bound with egg white and fat-free cheese. Every failed cauliflower crust in history failed for the same reason: not enough water squeezed out.',
    ingredients: [
      { food: 'f-caulirice', qty: 400 },
      { food: 'f-eggwhite', qty: 60 },
      { food: 'f-cheese0', qty: 56 },
      { extra: 'psyllium', qty: 5 },
      { extra: 'passata', qty: 80 },
      { food: 'f-turkey', qty: 100 },
      { extra: 'mushroom', qty: 60 },
      { text: 'Oregano, garlic powder, salt' },
    ],
    steps: [
      'Microwave the cauliflower rice five minutes, then let it cool enough to handle.',
      'Wrap it in a tea towel and wring it out until no more water comes. Then wring it again. You should be left with a surprisingly small ball.',
      'Mix with the egg white, half the cheese, the psyllium, oregano and salt.',
      'Press thin onto baking paper — 5 mm, no thicker, with a slightly raised rim.',
      'Bake at 220 °C for 20 minutes until the edges are properly browned. A pale base will never firm up.',
      'Sauce, turkey, mushrooms, remaining cheese. Back in for 10 minutes.',
    ],
    swaps: [
      'Psyllium can be swapped for 1 g xanthan gum. Both are there to bind; neither adds flavour.',
      'A shop-bought thin base is around 250 kcal more but takes twenty minutes less.',
    ],
  },
  {
    id: 'r-tuna-ricecakes',
    name: 'Open Tuna Rice Cakes',
    category: 'Main',
    tags: ['quick', 'no-cook', 'high-protein'],
    prepMin: 5, readyMin: 5, difficulty: 'easy', servings: 1, weightG: 300,
    technique: 'Quark instead of mayonnaise. Same texture job, about a tenth of the calories.',
    ingredients: [
      { food: 'f-tuna', qty: 150 },
      { food: 'f-quark', qty: 80 },
      { food: 'f-ricecake', qty: 36 },
      { extra: 'mustard', qty: 10 },
      { extra: 'cucumber', qty: 80 },
      { extra: 'lemon', qty: 15 },
      { text: 'Dill, black pepper, salt' },
    ],
    steps: [
      'Mash the tuna with the quark, mustard, lemon and dill.',
      'Season properly and pile onto four rice cakes.',
      'Cucumber on top. Eat immediately — rice cakes go soft within minutes.',
    ],
    swaps: [
      'Two slices of bread instead of rice cakes: about 20 kcal more and considerably more satisfying.',
      'Tinned salmon or leftover shredded chicken both work.',
    ],
  },

  // ------------------------------------------------------------------ sides
  {
    id: 'r-cauli-mash',
    name: 'Garlic Cauliflower Mash',
    category: 'Side',
    tags: ['vegetarian', 'high-volume', 'low-carb'],
    prepMin: 5, readyMin: 20, difficulty: 'easy', servings: 2, weightG: 700,
    technique: 'Steam, do not boil. Boiled cauliflower holds water and the mash goes soupy no matter how long you blend it.',
    ingredients: [
      { food: 'f-cauli', qty: 600 },
      { food: 'f-quark', qty: 100 },
      { food: 'f-cheese0', qty: 28 },
      { text: '4 garlic cloves, salt, white pepper, chives' },
    ],
    steps: [
      'Steam the florets with the whole garlic cloves for 15 minutes until completely soft.',
      'Drain and leave them in the hot pan for two minutes to dry out.',
      'Blend with the quark and cheese until smooth.',
      'Season heavily. Chives at the end.',
    ],
    swaps: [
      'Half cauliflower, half potato is the version most people actually keep making. It costs about 45 kcal per serving.',
    ],
  },
  {
    id: 'r-wedges',
    name: 'Air-Fryer Paprika Wedges',
    category: 'Side',
    tags: ['vegetarian', 'quick'],
    prepMin: 10, readyMin: 30, difficulty: 'easy', servings: 2, weightG: 500,
    technique: 'Parboil, rough up the surface, then air fry with a fraction of the oil. The crust comes from the damaged starch, not from fat.',
    ingredients: [
      { food: 'f-potato', qty: 500 },
      { food: 'f-oliveoil', qty: 7 },
      { text: '2 tsp smoked paprika, 1 tsp garlic powder, salt' },
    ],
    steps: [
      'Cut into wedges and boil six minutes. They should be barely tender.',
      'Drain, then shake them hard in the dry pan with the lid on until the outsides look scuffed.',
      'Toss with the oil and spices.',
      'Air fryer, 200 °C, 18–20 minutes, shaken twice.',
    ],
    swaps: [
      'Sweet potato works but will not crisp the same way — expect softer wedges.',
    ],
  },

  // ------------------------------------------------------------------ treats
  {
    id: 'r-mug-brownie',
    name: 'Two-Minute Chocolate Protein Brownie',
    category: 'Treat',
    tags: ['vegetarian', 'quick', 'single-serve'],
    prepMin: 3, readyMin: 5, difficulty: 'easy', servings: 1, weightG: 160,
    technique: 'Microwave mug method. The critical part is undercooking it — protein sets fast and thirty seconds too long turns it into an eraser.',
    ingredients: [
      { food: 'f-whey', qty: 30 },
      { food: 'f-cocoa', qty: 10 },
      { food: 'f-eggwhite', qty: 60 },
      { food: 'f-pumpkin', qty: 60 },
      { food: 'f-sweetener', qty: 12 },
      { extra: 'bakingPowder', qty: 2 },
      { extra: 'cookingSpray', qty: 1 },
      { text: 'Pinch of salt' },
    ],
    steps: [
      'Spray a wide mug or a small bowl. Wide beats tall — it cooks evenly.',
      'Stir everything together until there are no dry pockets.',
      'Microwave 40 seconds. Check. Then 10 seconds at a time.',
      'Stop while the middle is still visibly wet. It carries on setting out of the microwave.',
    ],
    swaps: [
      'The pumpkin is there for moisture. 60 g mashed banana does the same job for about 50 kcal more.',
      'Casein makes it fudgier; whey makes it spongier. Half and half is the best of both.',
    ],
  },
  {
    id: 'r-cheesecake-pots',
    name: 'No-Bake Vanilla Cheesecake Pots',
    category: 'Treat',
    tags: ['vegetarian', 'no-cook', 'meal-prep'],
    prepMin: 10, readyMin: 240, difficulty: 'easy', servings: 2, weightG: 600,
    technique: 'Gelatin sets a fat-free dairy base into something that genuinely holds a spoon shape. Without it you have flavoured quark in a glass.',
    ingredients: [
      { food: 'f-quark', qty: 300 },
      { food: 'f-skyr', qty: 200 },
      { food: 'f-casein', qty: 30 },
      { extra: 'gelatin', qty: 7 },
      { food: 'f-sweetener', qty: 16 },
      { extra: 'vanilla', qty: 10 },
      { food: 'f-berries', qty: 100 },
      { extra: 'lemon', qty: 15 },
    ],
    steps: [
      'Bloom the gelatin in three tablespoons of cold water for five minutes, then melt it gently — do not boil it or it stops setting.',
      'Beat the quark, skyr, casein, sweetener, vanilla and lemon until completely smooth.',
      'Whisk the warm gelatin in fast and thoroughly. Slow pouring gives you strands.',
      'Into glasses, fridge four hours.',
      'Berries crushed over the top just before serving.',
    ],
    swaps: [
      'Vegetarian setting agent: 4 g agar, boiled for one minute rather than merely melted.',
      'A crushed digestive at the bottom is about 70 kcal and turns it into a proper dessert.',
    ],
  },
  {
    id: 'r-protein-icecream',
    name: 'Blender Protein Ice Cream',
    category: 'Treat',
    tags: ['vegetarian', 'quick', 'high-volume'],
    prepMin: 5, readyMin: 5, difficulty: 'easy', servings: 1, weightG: 450,
    technique: 'Frozen fruit blended with a thickener and almost no liquid. Xanthan gum is what makes it scoopable instead of icy — a quarter teaspoon is the whole trick.',
    ingredients: [
      { food: 'f-berries', qty: 200 },
      { food: 'f-skyr', qty: 150 },
      { food: 'f-casein', qty: 30 },
      { food: 'f-sweetener', qty: 12 },
      { extra: 'xanthan', qty: 1 },
      { text: '50 ml cold water, only if the blender jams' },
    ],
    steps: [
      'Everything into a high-power blender or food processor.',
      'Blend in short bursts, scraping down. Add water a spoon at a time and only if it stalls — every extra millilitre costs you texture.',
      'It should climb the sides and hold peaks. Eat immediately.',
    ],
    swaps: [
      'A frozen banana instead of half the berries makes it creamier and adds about 50 kcal.',
      'Whey does not work here. It needs casein or the mix stays thin.',
    ],
  },
  {
    id: 'r-pb-fudge',
    name: 'Peanut Butter Protein Fudge Squares',
    category: 'Treat',
    tags: ['vegetarian', 'no-cook', 'meal-prep'],
    prepMin: 15, readyMin: 120, difficulty: 'easy', servings: 8, weightG: 480,
    technique: 'Powdered peanut butter gives the flavour at about a quarter of the fat. Real peanut butter goes in too, but only enough to carry the texture.',
    ingredients: [
      { food: 'f-pbpowder', qty: 60 },
      { food: 'f-pb', qty: 32 },
      { food: 'f-casein', qty: 60 },
      { food: 'f-oats', qty: 80 },
      { food: 'f-quark', qty: 150 },
      { food: 'f-sweetener', qty: 24 },
      { food: 'f-cocoa', qty: 10 },
      { text: 'Pinch of salt, splash of water as needed' },
    ],
    steps: [
      'Blitz the oats to a coarse flour.',
      'Mix everything into a stiff dough. Add water a teaspoon at a time — this should be firm, not sticky.',
      'Press hard into a lined 20 cm tin. Really press it; loose fudge crumbles when cut.',
      'Freeze two hours, then cut into eight squares.',
      'Keep them in the freezer and eat them straight from there.',
    ],
    swaps: [
      'All real peanut butter instead of powdered: roughly 90 kcal more per square.',
      'Whey makes these dry. Use casein.',
    ],
  },
  {
    id: 'r-proteinsicles',
    name: 'Berry Proteinsicles',
    category: 'Treat',
    tags: ['vegetarian', 'no-cook', 'low-calorie'],
    prepMin: 10, readyMin: 300, difficulty: 'easy', servings: 4, weightG: 600,
    technique: 'Protein in a frozen pop keeps it from being pure ice. Blend it properly or you get a protein layer at one end and water at the other.',
    ingredients: [
      { food: 'f-berries', qty: 250 },
      { food: 'f-skyr', qty: 200 },
      { food: 'f-whey', qty: 30 },
      { food: 'f-sweetener', qty: 12 },
      { extra: 'lemon', qty: 15 },
      { text: '100 ml water' },
    ],
    steps: [
      'Blend everything completely smooth — a full minute, not thirty seconds.',
      'Pour into moulds, leaving a centimetre at the top.',
      'Freeze at least five hours.',
      'Thirty seconds under a warm tap to release.',
    ],
    swaps: [
      'Any frozen fruit. Mango is the sweetest option and adds about 15 kcal per pop.',
    ],
  },
  {
    id: 'r-choc-pudding',
    name: 'Overnight Chocolate Protein Pudding',
    category: 'Treat',
    tags: ['vegetarian', 'no-cook', 'meal-prep'],
    prepMin: 5, readyMin: 480, difficulty: 'easy', servings: 1, weightG: 350,
    technique: 'Psyllium husk thickens overnight without heat and adds fibre. It keeps expanding, so use less than feels right.',
    ingredients: [
      { food: 'f-quark', qty: 200 },
      { food: 'f-casein', qty: 30 },
      { food: 'f-cocoa', qty: 10 },
      { extra: 'psyllium', qty: 5 },
      { food: 'f-sweetener', qty: 12 },
      { food: 'f-milkskim', qty: 100 },
      { text: 'Pinch of salt, splash of vanilla' },
    ],
    steps: [
      'Whisk everything until there are no lumps of cocoa left.',
      'It will be loose. That is correct — the psyllium does its work overnight.',
      'Fridge at least six hours.',
      'Stir before eating.',
    ],
    swaps: [
      'Chia seeds instead of psyllium: 10 g adds about 50 kcal and gives a different, seedier texture.',
    ],
  },
  {
    id: 'r-cinnamon-cakes',
    name: 'Cinnamon Protein Rice Cakes',
    category: 'Treat',
    tags: ['vegetarian', 'quick', 'single-serve'],
    prepMin: 5, readyMin: 5, difficulty: 'easy', servings: 1, weightG: 180,
    technique: 'A thick protein spread on a near-zero-calorie base. The whole point is that the topping is the food and the rice cake is just a plate.',
    ingredients: [
      { food: 'f-ricecake', qty: 27 },
      { food: 'f-quark', qty: 100 },
      { food: 'f-whey', qty: 15 },
      { food: 'f-pbpowder', qty: 12 },
      { food: 'f-sweetener', qty: 8 },
      { food: 'f-banana', qty: 60 },
      { text: 'Cinnamon' },
    ],
    steps: [
      'Beat the quark, whey, powdered peanut butter, sweetener and cinnamon into a thick spread.',
      'Spread thickly over three rice cakes.',
      'Sliced banana on top, more cinnamon over that.',
    ],
    swaps: [
      'Berries instead of banana: about 30 kcal less.',
    ],
  },

  // ------------------------------------------------------------------ shakes
  {
    id: 'r-recovery-shake',
    name: 'Post-Squat Recovery Shake',
    category: 'Shake',
    tags: ['quick', 'bulking'],
    prepMin: 3, readyMin: 3, difficulty: 'easy', servings: 1, weightG: 600,
    technique: 'Liquid calories exist for exactly this situation: you are running a linear progression, you are behind on food, and you cannot face another plate.',
    ingredients: [
      { food: 'f-milk', qty: 400 },
      { food: 'f-whey', qty: 30 },
      { food: 'f-oats', qty: 50 },
      { food: 'f-banana', qty: 120 },
      { food: 'f-pb', qty: 32 },
    ],
    steps: [
      'Blend until the oats are no longer gritty — about a minute.',
      'Drink within an hour of finishing the session.',
      'If it is too thick, add water rather than more milk.',
    ],
    swaps: [
      'Skimmed milk drops this by about 75 kcal. On a gaining phase that is the wrong direction.',
      'Leave out the peanut butter and the oats and it becomes a 350 kcal cutting shake.',
    ],
  },
  {
    id: 'r-green-shake',
    name: 'Low-Calorie Green Protein Shake',
    category: 'Shake',
    tags: ['quick', 'cutting', 'low-calorie'],
    prepMin: 3, readyMin: 3, difficulty: 'easy', servings: 1, weightG: 600,
    technique: 'Volume from frozen spinach and ice, protein from isolate, and almost nothing else. Fills a litre glass for under 250 kcal.',
    ingredients: [
      { food: 'f-whey', qty: 30 },
      { food: 'f-spinach', qty: 100 },
      { food: 'f-berries', qty: 100 },
      { food: 'f-skyr', qty: 100 },
      { extra: 'xanthan', qty: 1 },
      { text: '300 ml water, big handful of ice' },
    ],
    steps: [
      'Blend the spinach with the water first until there is no leaf texture at all.',
      'Add everything else and blend again with the ice.',
      'The xanthan keeps it from separating while you drink it.',
    ],
    swaps: [
      'Frozen spinach blends smoother than fresh and is cheaper.',
    ],
  },
];

export const RECIPE_CATEGORIES = ['Breakfast', 'Main', 'Side', 'Treat', 'Shake'];

export function filterRecipes({ category, tag, maxKcal, minProtein, query } = {}) {
  return RECIPES.filter((r) => {
    if (category && r.category !== category) return false;
    if (tag && !r.tags.includes(tag)) return false;
    if (query && !r.name.toLowerCase().includes(query.toLowerCase())) return false;
    const m = computeMacros(r);
    if (maxKcal && m.kcal > maxKcal) return false;
    if (minProtein && m.p < minProtein) return false;
    return true;
  });
}

export const ALL_TAGS = [...new Set(RECIPES.flatMap((r) => r.tags))].sort();
