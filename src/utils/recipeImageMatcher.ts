/**
 * FoodAI - Clasificación conservadora y determinista de recetas en categorías de
 * imagen de referencia (Bloque 3A).
 *
 * Principios:
 * - Módulo puro: sin red, sin almacenamiento, sin IA, sin aleatoriedad.
 * - Ante la duda devuelve `null` (la UI muestra el respaldo neutro). Es preferible
 *   no mostrar imagen a mostrar una imagen engañosa.
 * - Los nombres de platos en español son "núcleo primero" ("Sopa de lentejas",
 *   "Arroz con pollo"), así que la categoría se decide por la PRIMERA expresión
 *   del nombre (tras descartar artículos y adjetivos de relleno), nunca por una
 *   palabra suelta en cualquier posición ("Pollo en jugo de naranja" es pollo,
 *   no bebida).
 * - Frases inequívocas de postre (p. ej. "arroz con leche") se evalúan antes que
 *   cualquier núcleo salado, y se anulan si el nombre menciona proteínas saladas.
 * - Los ingredientes reales de la receta se usan solo como verificación adicional
 *   (arroz con señales dulces → null; "tortilla" solo es huevos si lleva huevo).
 *
 * Nombres en inglés (recetas generadas con el idioma EN):
 * - El inglés es "núcleo al final" ("Vegetable soup", "Grilled chicken", "Beef stew"),
 *   así que el núcleo es la ÚLTIMA expresión del tramo principal del nombre (antes de
 *   "with", "in", "on", "over", etc.). Los modificadores previos solo afinan o anulan
 *   la categoría ("Chicken soup" es sopa; "Fruit salad" y "Salmon mousse" quedan sin imagen).
 * - Cada matcher responde con una categoría, con `null` (decidió que no hay imagen fiable)
 *   o con `undefined` (no reconoce el nombre). Si el nombre lleva conectores españoles
 *   ("de", "con", "al"...) decide primero el matcher español; si no, el inglés. El otro
 *   solo se consulta cuando el primero no reconoce el nombre.
 */
import type { RecipeImageKey } from '../types/recipeImage';

export interface RecipeImageMatchInput {
  name?: unknown;
  ingredients?: readonly ({ name?: unknown } | null | undefined)[] | null;
}

/** Minúsculas, sin tildes, solo letras/dígitos separados por un espacio. */
export function normalizeDishText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const tokenize = (text: string): string[] => (text ? text.split(' ') : []);

const phrase = (text: string): string[] => tokenize(normalizeDishText(text));

function containsPhrase(tokens: readonly string[], target: readonly string[]): boolean {
  if (target.length === 0 || target.length > tokens.length) return false;
  for (let i = 0; i <= tokens.length - target.length; i++) {
    let ok = true;
    for (let j = 0; j < target.length; j++) {
      if (tokens[i + j] !== target[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

function startsWithPhrase(tokens: readonly string[], target: readonly string[]): boolean {
  if (target.length === 0 || target.length > tokens.length) return false;
  return target.every((t, i) => tokens[i] === t);
}

const hasAnyToken = (tokens: readonly string[], set: ReadonlySet<string>) =>
  tokens.some((t) => set.has(t));

// ------------------------------------------------------------------
// Vocabulario
// ------------------------------------------------------------------

/** Artículos y adjetivos de relleno que Gemini puede anteponer al núcleo del plato. */
const LEADING_FILLERS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'mi', 'nuestra', 'nuestro',
  'delicioso', 'deliciosa', 'deliciosos', 'deliciosas', 'rico', 'rica', 'ricos', 'ricas',
  'rapido', 'rapida', 'rapidos', 'rapidas', 'sencillo', 'sencilla', 'facil', 'faciles',
  'casero', 'casera', 'caseros', 'caseras', 'tradicional', 'tradicionales',
  'clasico', 'clasica', 'nutritivo', 'nutritiva', 'saludable', 'saludables',
  'ligero', 'ligera', 'exquisito', 'exquisita', 'mini', 'super', 'tipico', 'tipica',
]);

/** Proteínas o aromáticos salados: anulan cualquier clasificación como postre/bebida. */
const SAVORY_TOKENS = new Set([
  'pollo', 'carne', 'res', 'cerdo', 'pescado', 'salmon', 'atun', 'jamon', 'tocineta',
  'tocino', 'chorizo', 'camaron', 'camarones', 'mariscos', 'pavo', 'salchicha',
  'salchichas', 'ajo', 'cebolla', 'tilapia', 'trucha', 'mojarra',
]);

/** Señales dulces en el nombre: una "crema" o un "arroz" con ellas es ambiguo. */
const SWEET_NAME_TOKENS = new Set([
  'dulce', 'dulces', 'chocolate', 'vainilla', 'arequipe', 'caramelo', 'leche',
  'fresa', 'fresas', 'mora', 'moras', 'maracuya', 'mango', 'coco', 'cafe', 'azucar', 'panela',
]);

/** Señales dulces en los ingredientes (combinadas con leche delatan un arroz dulce). */
const SWEET_INGREDIENT_TOKENS = new Set([
  'azucar', 'panela', 'canela', 'condensada', 'arequipe', 'pasas', 'vainilla',
]);
const SWEET_INGREDIENT_TOKENS_EN = new Set([
  'sugar', 'cinnamon', 'condensed', 'raisins', 'vanilla', 'honey', 'syrup',
]);

/** Frases inequívocas de postre que pueden aparecer con núcleos salados ("arroz", "sopa", "crema"). */
const DESSERT_PHRASES = [
  'arroz con leche',
  'crema volteada',
  'crema catalana',
  'sopa borracha',
  'tres leches',
].map(phrase);

/** Frases que, sin esta regla, caerían en una categoría visualmente engañosa. */
const AMBIGUOUS_PHRASES = [
  'ensalada de frutas', // postre/merienda, no una ensalada de hojas
  'salpicon de frutas',
  'arroz dulce',
  'arroz con dulce',
  'fruit salad',
  'fruit cocktail',
].map(phrase);

const EGG_TOKENS = new Set(['huevo', 'huevos']);
const FISH_TOKENS = new Set([
  'pescado', 'tilapia', 'mojarra', 'salmon', 'atun', 'trucha', 'merluza', 'bagre',
  'sardina', 'sardinas', 'robalo', 'corvina', 'bocachico',
]);
const LEGUME_TOKENS = new Set([
  'lentejas', 'lenteja', 'frijoles', 'frijol', 'frisoles', 'garbanzos', 'arvejas', 'habas',
]);
const POTATO_TOKENS = new Set(['papa', 'papas', 'yuca', 'batata', 'camote', 'arracacha']);
const VEGETABLE_TOKENS = new Set(['verduras', 'vegetales']);
const BEEF_TOKENS = new Set(['carne', 'res', 'ternera']);
const CUT_HEADS = new Set(['tiras', 'trozos', 'cubos', 'cubitos', 'pedazos', 'bocados']);

interface MatchContext {
  /** Tokens del nombre tras descartar el relleno inicial. */
  head: readonly string[];
  /** Todos los tokens del nombre. */
  nameTokens: readonly string[];
  /** Tokens de todos los ingredientes reales de la receta. */
  ingredientTokens: ReadonlySet<string>;
}

interface HeadRule {
  key: RecipeImageKey;
  heads: readonly (readonly string[])[];
  /** Verificación adicional; si devuelve false la receta queda sin imagen (null). */
  verify?: (ctx: MatchContext) => boolean;
}

const heads = (...items: string[]) => items.map(phrase);

const noSavory = (ctx: MatchContext) => !hasAnyToken(ctx.nameTokens, SAVORY_TOKENS);
const noSweetName = (ctx: MatchContext) => !hasAnyToken(ctx.nameTokens, SWEET_NAME_TOKENS);
const hasEgg = (ctx: MatchContext) =>
  hasAnyToken(ctx.nameTokens, EGG_TOKENS) || hasAnyToken([...ctx.ingredientTokens], EGG_TOKENS);
/** Leche + endulzante entre los ingredientes reales (en español o en inglés). */
const hasSweetMilkIngredients = (ing: ReadonlySet<string>) => {
  const hasMilk = ing.has('leche') || ing.has('milk');
  const hasSweet = [...ing].some((t) => SWEET_INGREDIENT_TOKENS.has(t) || SWEET_INGREDIENT_TOKENS_EN.has(t));
  return hasMilk && hasSweet;
};
const notSweetRice = (ctx: MatchContext) => {
  if (hasAnyToken(ctx.nameTokens, SWEET_NAME_TOKENS)) return false;
  return !hasSweetMilkIngredients(ctx.ingredientTokens);
};

/** Reglas de núcleo, evaluadas en orden. La primera cuyo núcleo coincide decide. */
const HEAD_RULES: readonly HeadRule[] = [
  {
    key: 'beverage',
    heads: heads(
      'jugo', 'jugos', 'batido', 'batidos', 'limonada', 'smoothie', 'malteada', 'licuado',
      'refresco', 'aguapanela', 'agua de panela', 'chocolate caliente'
    ),
    verify: noSavory,
  },
  {
    key: 'dessert',
    heads: heads(
      'postre', 'flan', 'brownie', 'brownies', 'mousse', 'gelatina', 'natilla', 'helado',
      'pudin', 'budin', 'cheesecake', 'tiramisu', 'galleta', 'galletas', 'cocadas', 'merengon',
      'compota'
    ),
    verify: noSavory,
  },
  {
    key: 'soup',
    heads: heads('sopa', 'sopas', 'caldo', 'sancocho', 'ajiaco', 'consome', 'changua', 'cuchuco', 'mondongo'),
  },
  { key: 'cream-soup', heads: heads('crema', 'cremas'), verify: noSweetName },
  { key: 'salad', heads: heads('ensalada', 'ensaladas') },
  { key: 'rice-dish', heads: heads('arroz'), verify: notSweetRice },
  {
    key: 'pasta',
    heads: heads(
      'pasta', 'pastas', 'espagueti', 'espaguetis', 'spaghetti', 'macarrones', 'lasana',
      'fideos', 'tallarines', 'penne', 'fetuccini', 'fettuccine', 'fusilli', 'ravioles'
    ),
  },
  { key: 'eggs', heads: heads('huevo', 'huevos', 'omelette', 'omelet', 'perico') },
  { key: 'eggs', heads: heads('tortilla', 'revuelto'), verify: hasEgg },
  { key: 'chicken', heads: heads('pollo', 'pechuga', 'pechugas', 'muslos', 'alitas') },
  { key: 'beef-stew', heads: heads('carne guisada', 'carne sudada') },
  { key: 'fish', heads: heads(...FISH_TOKENS) },
  { key: 'legumes', heads: heads(...LEGUME_TOKENS) },
  { key: 'arepa', heads: heads('arepa', 'arepas') },
  {
    key: 'sandwich',
    heads: heads('sandwich', 'sandwiches', 'sanduche', 'sanduches', 'sanduiche', 'emparedado', 'emparedados'),
  },
  { key: 'potatoes', heads: heads(...POTATO_TOKENS) },
  {
    key: 'sauteed-vegetables',
    heads: heads('verduras salteadas', 'vegetales salteados', 'verduras al wok', 'vegetales al wok'),
  },
];

/** Respuesta de un matcher: categoría, `null` (sin imagen fiable) o `undefined` (no reconoce el nombre). */
type MatchOpinion = RecipeImageKey | null | undefined;

/**
 * Núcleos de preparación ("guiso de X", "salteado de X", "filete de X", "puré de X"):
 * la categoría la decide el primer complemento tras "de". Devuelve `undefined` si el
 * núcleo no es una preparación conocida.
 */
function matchPreparationHead(head: readonly string[]): MatchOpinion {
  if (head.length < 3 || head[1] !== 'de') return undefined;
  const prep = head[0];
  const main = head[2];

  if (['guiso', 'guisado', 'estofado', 'sudado'].includes(prep)) {
    if (main === 'pollo') return 'chicken';
    if (BEEF_TOKENS.has(main)) return 'beef-stew';
    if (FISH_TOKENS.has(main)) return 'fish';
    if (LEGUME_TOKENS.has(main)) return 'legumes';
    if (POTATO_TOKENS.has(main)) return 'potatoes';
    return null;
  }
  if (prep === 'salteado' || prep === 'wok') {
    if (VEGETABLE_TOKENS.has(main)) return 'sauteed-vegetables';
    if (main === 'pollo') return 'chicken';
    return null; // "salteado de carne" no es un guiso: sin imagen
  }
  if (prep === 'filete' || prep === 'filetes') {
    if (main === 'pollo') return 'chicken';
    if (FISH_TOKENS.has(main)) return 'fish';
    return null;
  }
  if (prep === 'pure') {
    return POTATO_TOKENS.has(main) ? 'potatoes' : null;
  }
  // Cortes de un ingrediente único ("tiras de pollo"): es ese ingrediente, no otro plato
  if (CUT_HEADS.has(prep)) {
    if (main === 'pollo') return 'chicken';
    if (FISH_TOKENS.has(main)) return 'fish';
    return null;
  }
  return undefined;
}

function ingredientTokenSet(ingredients: RecipeImageMatchInput['ingredients']): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(ingredients)) return out;
  for (const ing of ingredients) {
    for (const token of tokenize(normalizeDishText(ing?.name))) out.add(token);
  }
  return out;
}

/** Matcher español ("núcleo primero"): núcleo inicial y luego núcleos de preparación. */
function matchSpanishName(nameTokens: readonly string[], ingredientTokens: ReadonlySet<string>): MatchOpinion {
  const headStart = nameTokens.findIndex((t) => !LEADING_FILLERS.has(t));
  if (headStart < 0) return undefined; // nombre vacío o solo relleno

  const ctx: MatchContext = { head: nameTokens.slice(headStart), nameTokens, ingredientTokens };

  for (const rule of HEAD_RULES) {
    if (rule.heads.some((h) => startsWithPhrase(ctx.head, h))) {
      return !rule.verify || rule.verify(ctx) ? rule.key : null;
    }
  }
  return matchPreparationHead(ctx.head);
}

// ------------------------------------------------------------------
// Inglés: modificadores primero, núcleo al final
// ------------------------------------------------------------------

/** Conectores que delatan un nombre con estructura española ("Arroz con pollo", "Pollo al horno"). */
const SPANISH_MARKERS = new Set(['de', 'del', 'con', 'al', 'en', 'y', 'para', 'sin', 'la', 'las', 'los', 'el']);

/** Artículos iniciales que se descartan antes de buscar el tramo principal del nombre. */
const EN_LEADING_ARTICLES = new Set(['a', 'an', 'the', 'my', 'our']);

/**
 * Conectores que cierran el tramo principal: lo que sigue es acompañamiento
 * ("Grilled chicken WITH rice" es pollo). Incluye los españoles para que un nombre
 * español nunca se lea por su última palabra ("Hamburguesa de salmón" no es pescado).
 * "and" NO corta: une modificadores ("Chicken and vegetable soup" es sopa).
 */
const EN_SEGMENT_BREAKERS = new Set([
  'with', 'in', 'on', 'over', 'served', 'topped', 'plus', 'using', 'a',
  'de', 'del', 'con', 'en', 'al', 'y', 'para', 'sin',
]);

/** Palabras finales que no son el núcleo ("Vegetable soup recipe", "Lentil stew vegan"). */
const EN_TRAILING_FILLERS = new Set([
  'recipe', 'style', 'vegan', 'vegetarian', 'homemade', 'healthy', 'easy', 'quick', 'express',
]);

const SAVORY_TOKENS_EN = new Set([
  'chicken', 'beef', 'pork', 'meat', 'fish', 'salmon', 'tuna', 'tilapia', 'trout', 'cod', 'ham',
  'bacon', 'sausage', 'sausages', 'shrimp', 'prawns', 'crab', 'seafood', 'turkey', 'garlic',
  'onion', 'onions', 'anchovy', 'anchovies', 'sardines', 'chorizo', 'steak', 'lamb',
]);
const SAVORY_ANY = new Set([...SAVORY_TOKENS, ...SAVORY_TOKENS_EN]);

/** Sabores inequívocos de postre: anulan huevos, pescado o pasta ("Chocolate eggs"). */
const DESSERT_FLAVORS_EN = new Set([
  'chocolate', 'caramel', 'vanilla', 'cocoa', 'candy', 'fudge', 'nutella', 'marshmallow',
  'marshmallows', 'toffee', 'butterscotch',
]);
const SWEET_TOKENS_EN = new Set([
  ...DESSERT_FLAVORS_EN, 'sweet', 'sugar', 'honey', 'syrup', 'cinnamon', 'dulce', 'frosted', 'candied',
]);
const FRUIT_TOKENS_EN = new Set([
  'fruit', 'fruits', 'strawberry', 'strawberries', 'berry', 'berries', 'blueberry', 'blueberries',
  'raspberry', 'raspberries', 'blackberry', 'blackberries', 'mango', 'mangoes', 'banana', 'bananas',
  'apple', 'apples', 'pineapple', 'peach', 'peaches', 'cherry', 'cherries', 'passion', 'guava',
  'papaya', 'melon', 'watermelon', 'grape', 'grapes', 'kiwi', 'pear', 'pears', 'orange', 'plum',
]);

const CHICKEN_TOKENS_EN = new Set(['chicken', 'pollo']);
const BEEF_TOKENS_EN = new Set(['beef', 'meat', ...BEEF_TOKENS]);
const FISH_TOKENS_EN = new Set([
  'fish', 'salmon', 'tilapia', 'tuna', 'trout', 'cod', 'hake', 'catfish', 'snapper', 'mackerel',
  'sardines', 'seabass', 'haddock', 'halibut', ...FISH_TOKENS,
]);
const LEGUME_TOKENS_EN = new Set([
  'lentil', 'lentils', 'bean', 'beans', 'chickpea', 'chickpeas', 'garbanzo', 'garbanzos', ...LEGUME_TOKENS,
]);
/** "Green beans", "jelly beans", "coffee beans"... no son un plato de leguminosas. */
const NON_LEGUME_BEAN_MODIFIERS = new Set([
  'green', 'string', 'snap', 'runner', 'wax', 'french', 'jelly', 'coffee', 'vanilla', 'cocoa', 'cacao',
]);
const POTATO_TOKENS_EN = new Set(['potato', 'potatoes', 'cassava', ...POTATO_TOKENS]);
const VEGETABLE_TOKENS_EN = new Set(['vegetable', 'vegetables', 'veggie', 'veggies', ...VEGETABLE_TOKENS]);

interface EnglishContext {
  /** Tokens del tramo principal previos al núcleo. */
  modifiers: readonly string[];
  /** Todos los tokens del nombre. */
  nameTokens: readonly string[];
  ingredientTokens: ReadonlySet<string>;
}

interface EnglishRule {
  /** Núcleos que deben cerrar el tramo principal del nombre. */
  tails: readonly (readonly string[])[];
  resolve: (ctx: EnglishContext) => RecipeImageKey | null;
}

/** "sweet potato" es papa, no una señal dulce. */
function withoutSweetPotato(tokens: readonly string[]): string[] {
  return tokens.filter((t, i) => !(t === 'sweet' && (tokens[i + 1] === 'potato' || tokens[i + 1] === 'potatoes')));
}
const hasSweetSignalEn = (tokens: readonly string[]) =>
  hasAnyToken(withoutSweetPotato(tokens), SWEET_TOKENS_EN) || containsPhrase(tokens, ['ice', 'cream']);
const hasSweetOrFruitEn = (tokens: readonly string[]) =>
  hasSweetSignalEn(tokens) || hasAnyToken(tokens, FRUIT_TOKENS_EN);
const hasSavoryAny = (tokens: readonly string[]) => hasAnyToken(tokens, SAVORY_ANY);

/** Primera categoría que decide un modificador, recorriendo en el orden del nombre. */
function firstModifierMatch(
  modifiers: readonly string[],
  checks: readonly [ReadonlySet<string>, RecipeImageKey | null][]
): RecipeImageKey | null {
  for (let i = 0; i < modifiers.length; i++) {
    const token = modifiers[i];
    for (const [set, key] of checks) {
      if (!set.has(token)) continue;
      if (set === LEGUME_TOKENS_EN && NON_LEGUME_BEAN_MODIFIERS.has(modifiers[i - 1])) continue;
      return key;
    }
  }
  return null;
}

const SAUTE_CUES = [['sauteed'], ['saute'], ['wok'], ['stir', 'fried'], ['stir', 'fry'], ['stirfried'], ['pan', 'fried']];
const hasSauteCue = (modifiers: readonly string[]) => SAUTE_CUES.some((c) => containsPhrase(modifiers, c));

const tails = (...items: string[]) => items.map(phrase);
const always = (key: RecipeImageKey) => () => key;
const noImage = () => null;

/** Reglas de núcleo final en inglés. Gana el núcleo MÁS LARGO que cierre el tramo ("ice cream" antes que "cream"). */
const ENGLISH_RULES: readonly EnglishRule[] = [
  {
    tails: tails('soup', 'soups', 'broth', 'chowder', 'consomme', 'sancocho', 'ajiaco'),
    resolve: ({ modifiers, nameTokens }) => {
      if (hasSweetOrFruitEn(nameTokens)) return null;
      return hasAnyToken(modifiers, new Set(['cream', 'creamy'])) ? 'cream-soup' : 'soup';
    },
  },
  {
    tails: tails('bisque', 'bisques'),
    resolve: ({ nameTokens }) => (hasSweetOrFruitEn(nameTokens) ? null : 'cream-soup'),
  },
  {
    tails: tails('salad', 'salads'),
    resolve: ({ nameTokens }) =>
      hasSweetOrFruitEn(nameTokens) || hasAnyToken(nameTokens, new Set(['dessert', 'ambrosia'])) ? null : 'salad',
  },
  {
    tails: tails('rice'),
    resolve: ({ nameTokens, ingredientTokens }) =>
      hasSweetOrFruitEn(nameTokens) ||
      hasAnyToken(nameTokens, new Set(['milk', 'coconut'])) ||
      hasSweetMilkIngredients(ingredientTokens)
        ? null
        : 'rice-dish',
  },
  {
    tails: tails(
      'pasta', 'pastas', 'spaghetti', 'macaroni', 'lasagna', 'lasagne', 'noodles', 'penne',
      'fettuccine', 'fettuccini', 'fusilli', 'ravioli', 'linguine', 'rigatoni', 'tagliatelle',
      'tortellini', 'mac and cheese', 'macaroni and cheese', 'mac n cheese'
    ),
    resolve: ({ nameTokens }) => (hasAnyToken(nameTokens, DESSERT_FLAVORS_EN) ? null : 'pasta'),
  },
  {
    tails: tails('egg', 'eggs', 'omelette', 'omelettes', 'omelet', 'omelets', 'frittata'),
    resolve: ({ nameTokens }) =>
      hasAnyToken(nameTokens, DESSERT_FLAVORS_EN) || nameTokens.includes('easter') ? null : 'eggs',
  },
  { tails: tails('chicken'), resolve: always('chicken') },
  {
    // Cortes de una proteína: los decide la proteína ("Chicken breast", "Salmon fillet").
    tails: tails(
      'breast', 'breasts', 'thigh', 'thighs', 'wing', 'wings', 'drumstick', 'drumsticks', 'tenders',
      'strips', 'fillet', 'fillets', 'filet', 'filets', 'cutlet', 'cutlets', 'steak', 'steaks'
    ),
    resolve: ({ modifiers }) =>
      firstModifierMatch(modifiers, [
        [CHICKEN_TOKENS_EN, 'chicken'],
        [FISH_TOKENS_EN, 'fish'],
        [SAVORY_ANY, null],
      ]),
  },
  {
    // "Beef stew" es guiso de res; "Lentil stew" leguminosas; un guiso sin proteína clara, sin imagen.
    tails: tails('stew', 'stews'),
    resolve: ({ modifiers }) =>
      firstModifierMatch(modifiers, [
        [BEEF_TOKENS_EN, 'beef-stew'],
        [CHICKEN_TOKENS_EN, 'chicken'],
        [FISH_TOKENS_EN, 'fish'],
        [LEGUME_TOKENS_EN, 'legumes'],
        [POTATO_TOKENS_EN, 'potatoes'],
      ]),
  },
  {
    // "Grilled beef" NO es un guiso; solo "stewed/braised beef" lo es.
    tails: tails('beef', 'meat'),
    resolve: ({ modifiers }) => (hasAnyToken(modifiers, new Set(['stewed', 'braised'])) ? 'beef-stew' : null),
  },
  {
    tails: tails(
      'fish', 'salmon', 'tilapia', 'tuna', 'trout', 'cod', 'hake', 'catfish', 'snapper', 'mackerel',
      'sardines', 'sea bass', 'seabass', 'haddock', 'halibut', 'mojarra'
    ),
    resolve: ({ nameTokens }) => (hasAnyToken(nameTokens, DESSERT_FLAVORS_EN) ? null : 'fish'),
  },
  {
    tails: tails('lentils', 'lentil', 'beans', 'bean', 'chickpeas', 'garbanzos'),
    resolve: ({ modifiers, nameTokens }) => {
      const last = modifiers[modifiers.length - 1];
      if (NON_LEGUME_BEAN_MODIFIERS.has(last) || hasAnyToken(nameTokens, DESSERT_FLAVORS_EN)) return null;
      return 'legumes';
    },
  },
  { tails: tails('arepa', 'arepas'), resolve: always('arepa') },
  {
    tails: tails('sandwich', 'sandwiches'),
    resolve: ({ nameTokens }) =>
      hasSweetSignalEn(nameTokens) || hasAnyToken(nameTokens, new Set(['cookie', 'cookies'])) ? null : 'sandwich',
  },
  {
    tails: tails('potato', 'potatoes', 'hash browns', 'hash brown', 'yuca', 'cassava'),
    resolve: always('potatoes'),
  },
  {
    // "Mashed potatoes" ya cierra en "potatoes"; aquí "Potato wedges", "French fries"...
    tails: tails('fries', 'wedges', 'mash', 'puree', 'skins'),
    resolve: ({ modifiers }) => {
      if (hasAnyToken(modifiers, POTATO_TOKENS_EN)) return 'potatoes';
      // "Fries" sin otra hortaliza delante ("Zucchini fries" no es papa).
      return modifiers.length === 0 || (modifiers.length === 1 && modifiers[0] === 'french') ? 'potatoes' : null;
    },
  },
  {
    // "Vegetable stir fry" son verduras salteadas; "Chicken stir fry" es pollo; con otra proteína, sin imagen.
    tails: tails('stir fry', 'stirfry', 'stir fries'),
    resolve: ({ modifiers }) =>
      firstModifierMatch(modifiers, [
        [VEGETABLE_TOKENS_EN, 'sauteed-vegetables'],
        [CHICKEN_TOKENS_EN, 'chicken'],
        [SAVORY_ANY, null],
      ]),
  },
  {
    // Solo verduras SALTEADAS; "Roasted vegetables" no se presenta con esa imagen.
    tails: tails('vegetables', 'veggies'),
    resolve: ({ modifiers }) => (hasSauteCue(modifiers) ? 'sauteed-vegetables' : null),
  },
  {
    tails: tails(
      'flan', 'brownie', 'brownies', 'mousse', 'pudding', 'puddings', 'cheesecake', 'tiramisu',
      'cookie', 'cookies', 'custard', 'ice cream', 'gelatin', 'jello', 'parfait', 'panna cotta',
      'tres leches'
    ),
    resolve: ({ modifiers, nameTokens }) => {
      if (hasSavoryAny(nameTokens)) return null; // "Salmon mousse"
      if (hasAnyToken(modifiers, new Set(['yorkshire', 'black', 'blood', 'corn']))) return null; // pudines salados
      return 'dessert';
    },
  },
  {
    // Tortas, pies y tartas solo son postre con una señal dulce explícita ("Crab cakes" no).
    tails: tails('cake', 'cakes', 'pie', 'pies', 'tart', 'tarts', 'crumble', 'cobbler'),
    resolve: ({ modifiers, nameTokens }) => {
      if (hasSavoryAny(nameTokens)) return null;
      const sweet = hasSweetOrFruitEn(modifiers) || hasAnyToken(modifiers, new Set(['lemon', 'lime', 'coconut']));
      return sweet ? 'dessert' : null;
    },
  },
  {
    tails: tails(
      'smoothie', 'smoothies', 'juice', 'juices', 'lemonade', 'limeade', 'shake', 'shakes',
      'milkshake', 'milkshakes', 'hot chocolate', 'agua fresca', 'iced tea', 'frappe'
    ),
    resolve: ({ nameTokens }) => (hasSavoryAny(nameTokens) ? null : 'beverage'),
  },
  {
    // Platos reconocidos sin imagen de referencia en el catálogo: respaldo neutro explícito.
    tails: tails(
      'cream', 'creams', 'burger', 'burgers', 'hamburger', 'hamburgers', 'taco', 'tacos', 'burrito',
      'burritos', 'quesadilla', 'quesadillas', 'enchiladas', 'nachos', 'pizza', 'pizzas', 'wrap',
      'wraps', 'bowl', 'bowls', 'curry', 'curries', 'casserole', 'casseroles', 'kebab', 'kebabs',
      'skewers', 'nuggets', 'chips', 'waffles', 'pancakes', 'crepes', 'bread', 'toast', 'bites',
      'patties', 'croquettes', 'fritters', 'dumplings', 'rolls', 'pork', 'lamb', 'ribs', 'meatballs',
      'meatloaf', 'shrimp', 'prawns', 'turkey', 'ham', 'empanadas', 'chili', 'sushi', 'dip', 'sauce',
      'risotto', 'paella', 'quiche', 'gratin'
    ),
    resolve: noImage,
  },
];

const endsWithPhrase = (tokens: readonly string[], target: readonly string[]) =>
  target.length > 0 &&
  target.length <= tokens.length &&
  target.every((t, i) => tokens[tokens.length - target.length + i] === t);

/** Tramo principal del nombre: sin artículos iniciales, hasta el primer conector, sin relleno final. */
function englishMainSegment(nameTokens: readonly string[]): string[] {
  let start = 0;
  while (start < nameTokens.length && EN_LEADING_ARTICLES.has(nameTokens[start])) start++;
  let end = start;
  while (end < nameTokens.length && !EN_SEGMENT_BREAKERS.has(nameTokens[end])) end++;
  while (end > start && EN_TRAILING_FILLERS.has(nameTokens[end - 1])) end--;
  return nameTokens.slice(start, end);
}

/** Matcher inglés ("núcleo al final"). */
function matchEnglishName(nameTokens: readonly string[], ingredientTokens: ReadonlySet<string>): MatchOpinion {
  const segment = englishMainSegment(nameTokens);
  if (segment.length === 0) return undefined;

  let best: { rule: EnglishRule; length: number } | null = null;
  for (const rule of ENGLISH_RULES) {
    for (const tail of rule.tails) {
      if (endsWithPhrase(segment, tail) && (!best || tail.length > best.length)) {
        best = { rule, length: tail.length };
      }
    }
  }
  if (best) {
    const modifiers = segment.slice(0, segment.length - best.length);
    return best.rule.resolve({ modifiers, nameTokens, ingredientTokens });
  }

  // "Cream of mushroom" (sin "soup" al final) es una crema salada, salvo señales dulces.
  if (startsWithPhrase(segment, ['cream', 'of']) && segment.length > 2) {
    if (hasSweetOrFruitEn(nameTokens) || hasAnyToken(segment, new Set(['wheat', 'tartar']))) return null;
    return 'cream-soup';
  }
  return undefined;
}

/**
 * Devuelve la categoría de imagen de referencia de una receta, o `null` si no hay
 * una coincidencia fiable. Determinista: la misma entrada produce siempre la misma salida.
 */
export function resolveRecipeImageKey(recipe: RecipeImageMatchInput | null | undefined): RecipeImageKey | null {
  if (!recipe) return null;
  const nameTokens = tokenize(normalizeDishText(recipe.name));
  if (nameTokens.length === 0) return null;
  const ingredientTokens = ingredientTokenSet(recipe.ingredients);

  // 1. Postres inequívocos, salvo que el nombre mencione proteínas saladas.
  if (DESSERT_PHRASES.some((p) => containsPhrase(nameTokens, p))) {
    return hasAnyToken(nameTokens, SAVORY_TOKENS) ? null : 'dessert';
  }

  // 2. Frases conocidas por inducir una categoría engañosa.
  if (AMBIGUOUS_PHRASES.some((p) => containsPhrase(nameTokens, p))) return null;

  // 3. Núcleo del nombre: decide primero el idioma cuya estructura muestra el nombre.
  const spanishFirst = nameTokens.some((t) => SPANISH_MARKERS.has(t));
  const matchers = spanishFirst ? [matchSpanishName, matchEnglishName] : [matchEnglishName, matchSpanishName];
  for (const match of matchers) {
    const opinion = match(nameTokens, ingredientTokens);
    if (opinion !== undefined) return opinion;
  }
  return null;
}
