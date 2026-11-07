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
const notSweetRice = (ctx: MatchContext) => {
  if (hasAnyToken(ctx.nameTokens, SWEET_NAME_TOKENS)) return false;
  const ing = ctx.ingredientTokens;
  const hasMilk = ing.has('leche');
  const hasSweet = [...ing].some((t) => SWEET_INGREDIENT_TOKENS.has(t));
  return !(hasMilk && hasSweet);
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

/**
 * Núcleos de preparación ("guiso de X", "salteado de X", "filete de X", "puré de X"):
 * la categoría la decide el primer complemento tras "de".
 */
function matchPreparationHead(head: readonly string[]): RecipeImageKey | null {
  if (head.length < 3 || head[1] !== 'de') return null;
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
  return null;
}

function ingredientTokenSet(ingredients: RecipeImageMatchInput['ingredients']): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(ingredients)) return out;
  for (const ing of ingredients) {
    for (const token of tokenize(normalizeDishText(ing?.name))) out.add(token);
  }
  return out;
}

/**
 * Devuelve la categoría de imagen de referencia de una receta, o `null` si no hay
 * una coincidencia fiable. Determinista: la misma entrada produce siempre la misma salida.
 */
export function resolveRecipeImageKey(recipe: RecipeImageMatchInput | null | undefined): RecipeImageKey | null {
  if (!recipe) return null;
  const nameTokens = tokenize(normalizeDishText(recipe.name));
  const headStart = nameTokens.findIndex((t) => !LEADING_FILLERS.has(t));
  if (headStart < 0) return null; // nombre vacío o solo relleno

  const ctx: MatchContext = {
    head: nameTokens.slice(headStart),
    nameTokens,
    ingredientTokens: ingredientTokenSet(recipe.ingredients),
  };

  // 1. Postres inequívocos, salvo que el nombre mencione proteínas saladas.
  if (DESSERT_PHRASES.some((p) => containsPhrase(nameTokens, p))) {
    return noSavory(ctx) ? 'dessert' : null;
  }

  // 2. Frases conocidas por inducir una categoría engañosa.
  if (AMBIGUOUS_PHRASES.some((p) => containsPhrase(nameTokens, p))) return null;

  // 3. Núcleo del nombre.
  for (const rule of HEAD_RULES) {
    if (rule.heads.some((h) => startsWithPhrase(ctx.head, h))) {
      return !rule.verify || rule.verify(ctx) ? rule.key : null;
    }
  }

  // 4. Núcleos de preparación ("guiso de", "salteado de", ...).
  return matchPreparationHead(ctx.head);
}
