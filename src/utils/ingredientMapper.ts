/**
 * FoodAI - Mapeo de ingredientes detectados a categorías, unidades y detección de duplicados en la despensa (Fase 3B).
 */
import {
  Ingredient,
  IngredientCategory,
  IngredientUnit,
  INGREDIENT_CATEGORIES,
  INGREDIENT_UNITS,
} from '../types/pantry';
import {
  BackendDetectedIngredient,
  DuplicatePantryMatch,
  ScannedIngredientItem,
} from '../types/scanner';
import type { Locale } from '../services/storage/localeStorage';

/**
 * Normaliza una cadena para comparación insensible a mayúsculas, tildes y espacios extra.
 */
export function normalizeIngredientName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// ---------------------------------------------------------------------------
// Clasificación inteligente de alimentos (Fase 28A)
// ---------------------------------------------------------------------------
//
// Una ÚNICA base de conocimiento describe, para cada término reconocido:
// - su categoría de despensa (identificadores internos existentes),
// - su presentación física habitual (líquido, sólido, polvo, unidad, pieza o variable),
// - la unidad preferida para esa presentación y categorías alternativas legítimas.
//
// `inferIngredientCategory()` y las sugerencias de medida se derivan de esta misma
// tabla, por lo que no existe un segundo sistema de clasificación.
//
// La coincidencia se hace por TOKENS completos (con lematización de plurales),
// nunca por subcadenas, para evitar falsos positivos como «pina» dentro de
// «espinaca», «sal» dentro de «salsa» o «res» dentro de «fresa».

/**
 * Presentación física de un alimento:
 * - `liquid`: se mide en volumen (ml, l).
 * - `solid` / `powder`: se mide en masa (g, kg).
 * - `unit`: se cuenta exclusivamente por unidades (p. ej. huevos).
 * - `piece`: se cuenta por unidades o se pesa (frutas, verduras, panes).
 * - `variable`: la presentación depende del producto concreto; no se sugiere unidad.
 */
export type FoodPresentation =
  | 'liquid'
  | 'solid'
  | 'powder'
  | 'unit'
  | 'piece'
  | 'variable';

/** Nivel de certeza de una clasificación. */
export type ClassificationConfidence = 'high' | 'low' | 'none';

interface FoodRule {
  terms: string[];
  category: IngredientCategory;
  presentation: FoodPresentation;
  /** Unidad preferida cuando el alimento conserva su presentación habitual. */
  preferredUnit?: IngredientUnit;
  /** Unidades compatibles cuando la presentación es `variable`. */
  variableUnits?: IngredientUnit[];
  /** Categorías alternativas legítimas (además de «Otros», siempre aceptada). */
  altCategories?: IngredientCategory[];
}

const VEG: IngredientCategory = 'Verduras y frutas';
const PROTEIN: IngredientCategory = 'Carnes y proteínas';
const DAIRY: IngredientCategory = 'Lácteos';
const GRAINS: IngredientCategory = 'Granos y cereales';
const PANTRY: IngredientCategory = 'Alacena';
const OTHER: IngredientCategory = 'Otros';

const FOOD_RULES: FoodRule[] = [
  // --- Frases compuestas cuyo núcleo engañaría a la regla de una sola palabra ---
  { terms: ['pasta de tomate', 'pure de tomate'], category: PANTRY, presentation: 'solid', preferredUnit: 'g' },
  { terms: ['salsa de soya', 'salsa de soja', 'salsa inglesa'], category: PANTRY, presentation: 'liquid', preferredUnit: 'ml' },
  { terms: ['mantequilla de mani', 'crema de mani'], category: PANTRY, presentation: 'solid', preferredUnit: 'g' },
  // Bebidas vegetales y leches no lácteas: no son lácteos animales
  {
    terms: [
      'leche de almendra',
      'leche de almendras',
      'leche de avena',
      'leche de soya',
      'leche de soja',
      'bebida vegetal',
      'bebidas vegetales',
      'bebida de almendra',
      'bebida de almendras',
      'bebida de avena',
      'bebida de soya',
      'bebida de soja',
      'bebida de coco',
      'leche vegetal',
    ],
    category: OTHER,
    presentation: 'liquid',
    preferredUnit: 'l',
    altCategories: [PANTRY],
  },
  {
    terms: ['leche de coco'],
    category: PANTRY,
    presentation: 'liquid',
    preferredUnit: 'ml',
    altCategories: [OTHER],
  },
  { terms: ['polvo de hornear', 'polvo para hornear'], category: PANTRY, presentation: 'powder', preferredUnit: 'g' },
  { terms: ['tomate de arbol'], category: VEG, presentation: 'piece', preferredUnit: 'unidad' },

  // --- Frases compuestas en inglés (Fase 28C-B3.2) ---
  // En inglés el modificador precede al núcleo («tomato sauce»), por lo que estas frases
  // deben reconocerse completas antes que la regla de una sola palabra («tomato»).
  { terms: ['tomato sauce', 'tomato paste', 'tomato puree'], category: PANTRY, presentation: 'solid', preferredUnit: 'g' },
  { terms: ['soy sauce'], category: PANTRY, presentation: 'liquid', preferredUnit: 'ml' },
  { terms: ['peanut butter'], category: PANTRY, presentation: 'solid', preferredUnit: 'g' },
  {
    terms: ['onion powder', 'garlic powder', 'black pepper', 'baking powder'],
    category: PANTRY,
    presentation: 'powder',
    preferredUnit: 'g',
  },
  {
    terms: ['chicken broth', 'chicken stock', 'beef broth', 'beef stock', 'vegetable broth'],
    category: PANTRY,
    presentation: 'variable',
    variableUnits: ['ml', 'l', 'g', 'unidad'],
  },
  {
    terms: ['almond milk', 'oat milk', 'soy milk', 'rice milk', 'plant milk'],
    category: OTHER,
    presentation: 'liquid',
    preferredUnit: 'l',
    altCategories: [PANTRY],
  },
  { terms: ['coconut milk'], category: PANTRY, presentation: 'liquid', preferredUnit: 'ml', altCategories: [OTHER] },
  {
    terms: ['sweet potato', 'green onion', 'spring onion', 'bell pepper'],
    category: VEG,
    presentation: 'piece',
    preferredUnit: 'unidad',
  },

  // --- Verduras y frutas ---
  {
    terms: [
      'tomate', 'cebolla', 'cebollin', 'papa', 'zanahoria', 'ajo', 'limon', 'aguacate',
      'platano', 'manzana', 'lechuga', 'espinaca', 'cilantro', 'perejil', 'pimenton',
      'pimiento', 'pepino', 'calabacin', 'calabaza', 'ahuyama', 'champinon', 'hongo',
      'fresa', 'naranja', 'mandarina', 'banano', 'banana', 'pera', 'mango', 'pina', 'uva',
      'brocoli', 'coliflor', 'apio', 'guayaba', 'maracuya', 'papaya', 'melon', 'sandia',
      'patilla', 'kiwi', 'durazno', 'cereza', 'mora', 'arandano', 'coco', 'remolacha',
      'berenjena', 'repollo', 'rabano', 'yuca', 'batata', 'mazorca', 'lulo', 'uchuva',
      'granadilla', 'puerro', 'jengibre', 'albahaca', 'hierbabuena', 'arveja', 'habichuela',
      // Nombres comunes en inglés (Fase 28C-B3.2)
      'tomato', 'onion', 'potato', 'carrot', 'garlic', 'lemon', 'lime', 'avocado', 'apple',
      'lettuce', 'spinach', 'parsley', 'cucumber', 'zucchini', 'pumpkin', 'mushroom',
      'strawberry', 'orange', 'pear', 'pineapple', 'grape', 'broccoli', 'cauliflower', 'celery',
      'watermelon', 'peach', 'cherry', 'blueberry', 'beet', 'eggplant', 'cabbage', 'radish',
      'cassava', 'ginger', 'basil', 'pea', 'scallion', 'peaches', 'radishes',
    ],
    category: VEG,
    presentation: 'piece',
    preferredUnit: 'unidad',
  },

  // --- Carnes y proteínas ---
  { terms: ['huevo', 'egg'], category: PROTEIN, presentation: 'unit', preferredUnit: 'unidad', altCategories: [DAIRY] },
  {
    terms: [
      'pollo', 'carne', 'res', 'cerdo', 'pescado', 'costilla', 'lomo', 'pavo', 'molida', 'sobrebarriga',
      'chicken', 'beef', 'pork', 'fish', 'turkey', 'meat',
    ],
    category: PROTEIN,
    presentation: 'solid',
    preferredUnit: 'kg',
  },
  {
    terms: ['jamon', 'tocineta', 'tocino', 'camaron', 'salmon', 'tofu', 'ham', 'bacon', 'shrimp'],
    category: PROTEIN,
    presentation: 'solid',
    preferredUnit: 'g',
  },
  { terms: ['atun', 'sardina', 'tuna', 'sardine'], category: PROTEIN, presentation: 'solid', preferredUnit: 'g', altCategories: [PANTRY] },
  {
    terms: [
      'pechuga', 'muslo', 'contramuslo', 'ala', 'alita', 'chuleta', 'filete', 'salchicha',
      'chorizo', 'hamburguesa', 'tilapia', 'mojarra', 'sausage',
    ],
    category: PROTEIN,
    presentation: 'piece',
    preferredUnit: 'unidad',
  },

  // --- Lácteos ---
  { terms: ['leche', 'kumis', 'kefir', 'milk'], category: DAIRY, presentation: 'liquid', preferredUnit: 'l', altCategories: [PANTRY] },
  {
    terms: [
      'queso', 'mantequilla', 'margarina', 'cuajada', 'parmesano', 'mozzarella', 'requeson', 'arequipe',
      'cheese', 'butter',
    ],
    category: DAIRY,
    presentation: 'solid',
    preferredUnit: 'g',
    altCategories: [PANTRY],
  },
  {
    terms: ['yogur', 'yogurt', 'yogures', 'crema', 'suero', 'cream'],
    category: DAIRY,
    presentation: 'variable',
    variableUnits: ['ml', 'l', 'g', 'kg', 'unidad'],
  },

  // --- Granos y cereales ---
  { terms: ['arroz', 'rice'], category: GRAINS, presentation: 'solid', preferredUnit: 'kg', altCategories: [PANTRY] },
  {
    terms: ['frijol', 'lenteja', 'garbanzo', 'bean', 'lentil', 'chickpea'],
    category: GRAINS,
    presentation: 'solid',
    preferredUnit: 'g',
    altCategories: [PANTRY, PROTEIN],
  },
  {
    terms: [
      'avena', 'pasta', 'espagueti', 'espaguetis', 'spaghetti', 'macarron', 'fideo', 'maiz',
      'cereal', 'granola', 'quinoa', 'quinua', 'trigo', 'cuscus',
      'oat', 'oats', 'noodle', 'corn', 'wheat',
    ],
    category: GRAINS,
    presentation: 'solid',
    preferredUnit: 'g',
    altCategories: [PANTRY],
  },
  { terms: ['harina', 'maizena', 'fecula', 'flour'], category: GRAINS, presentation: 'powder', preferredUnit: 'g', altCategories: [PANTRY] },
  { terms: ['pan', 'tostada', 'arepa', 'tortilla', 'bread'], category: GRAINS, presentation: 'piece', preferredUnit: 'unidad', altCategories: [PANTRY] },

  // --- Alacena ---
  { terms: ['aceite', 'oil', 'olive oil'], category: PANTRY, presentation: 'liquid', preferredUnit: 'l' },
  { terms: ['vinagre', 'esencia', 'vainilla', 'vinegar', 'vanilla'], category: PANTRY, presentation: 'liquid', preferredUnit: 'ml' },
  { terms: ['sal', 'azucar', 'salt', 'sugar'], category: PANTRY, presentation: 'powder', preferredUnit: 'g' },
  {
    terms: [
      'pimienta', 'especia', 'especias', 'comino', 'oregano', 'canela', 'paprika', 'curry',
      'color', 'achiote', 'levadura', 'bicarbonato', 'gelatina', 'laurel', 'tomillo',
      'cumin', 'cinnamon', 'yeast', 'thyme',
    ],
    category: PANTRY,
    presentation: 'powder',
    preferredUnit: 'g',
  },
  { terms: ['cafe', 'coffee'], category: PANTRY, presentation: 'solid', preferredUnit: 'g' },
  { terms: ['mermelada', 'jam'], category: PANTRY, presentation: 'solid', preferredUnit: 'g' },
  { terms: ['panela', 'chocolate'], category: PANTRY, presentation: 'piece', preferredUnit: 'unidad' },
  {
    terms: [
      'salsa', 'mayonesa', 'mostaza', 'ketchup', 'miel', 'caldo', 'te', 'aceituna',
      'sauce', 'mayonnaise', 'mustard', 'honey', 'broth', 'tea', 'olive',
    ],
    category: PANTRY,
    presentation: 'variable',
    variableUnits: ['ml', 'l', 'g', 'unidad'],
  },

  // --- Bebidas: presentación líquida clara, categoría genérica ---
  {
    terms: [
      'agua', 'jugo', 'zumo', 'gaseosa', 'refresco', 'bebida', 'vino', 'cerveza',
      'water', 'juice', 'soda', 'wine', 'beer',
    ],
    category: OTHER,
    presentation: 'liquid',
    preferredUnit: 'l',
  },
];

/**
 * Palabras que pueden preceder al nombre real del alimento sin ser el alimento:
 * envases, porciones, cantidades, conectores y descriptores frecuentes.
 * Solo se omiten al INICIO del nombre (p. ej. «Bolsa de leche», «Media docena de huevos»).
 */
const LEADING_SKIP_WORDS = [
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'con', 'en', 'y',
  'bolsa', 'bolsita', 'paquete', 'lata', 'caja', 'botella', 'carton', 'frasco', 'tarro',
  'sobre', 'envase', 'galon', 'garrafa', 'libra', 'media', 'medio', 'cuarto', 'kilo',
  'litro', 'gramo', 'docena', 'unidad', 'porcion', 'racion', 'tajada', 'rebanada', 'trozo',
  'manojo', 'atado', 'racimo', 'cabeza', 'diente', 'taza', 'cucharada', 'pizca',
  'g', 'gr', 'grs', 'kg', 'kgs', 'ml', 'l', 'lt', 'lts', 'cc', 'lb', 'lbs', 'oz', 'und',
  'mini', 'baby', 'fresco', 'fresca', 'organico', 'organica',
  // Equivalentes en inglés (Fase 28C-B3.2)
  'of', 'a', 'an', 'the', 'bag', 'can', 'box', 'bottle', 'jar', 'pack', 'package', 'fresh', 'organic',
];

/**
 * Modificadores que aclaran la presentación física cuando aparecen tras el alimento.
 * `appliesTo` limita el modificador a las presentaciones donde cambia el significado
 * (ej. «griego» vuelve sólido un yogur, pero «Pan tajado» sigue contándose por unidades).
 */
const PRESENTATION_MODIFIERS: {
  words: string[];
  presentation: FoodPresentation;
  appliesTo?: FoodPresentation[];
}[] = [
  { words: ['liquido', 'liquida', 'bebible', 'liquid'], presentation: 'liquid' },
  { words: ['polvo', 'powder', 'powdered'], presentation: 'powder' },
  {
    words: ['solido', 'solida', 'griego', 'griega', 'cremoso', 'cremosa'],
    presentation: 'solid',
    appliesTo: ['liquid', 'variable'],
  },
  {
    words: ['condensada', 'condensado', 'evaporada', 'evaporado'],
    presentation: 'variable',
    appliesTo: ['liquid'],
  },
];

const PRESENTATION_UNITS: Record<Exclude<FoodPresentation, 'variable'>, IngredientUnit[]> = {
  liquid: ['ml', 'l'],
  solid: ['g', 'kg'],
  powder: ['g', 'kg'],
  unit: ['unidad'],
  piece: ['unidad', 'g', 'kg'],
};

const PRESENTATION_DEFAULT_UNIT: Record<Exclude<FoodPresentation, 'variable'>, IngredientUnit> = {
  liquid: 'l',
  solid: 'g',
  powder: 'g',
  unit: 'unidad',
  piece: 'unidad',
};

/** Unidades compatibles cuando la presentación es ambigua (líquida o sólida). */
const VARIABLE_FALLBACK_UNITS: IngredientUnit[] = ['ml', 'l', 'g', 'kg'];

interface CompiledFoodTerm {
  tokens: string[];
  label: string;
  rule: FoodRule;
}

interface CompiledModifier {
  presentation: FoodPresentation;
  appliesTo?: FoodPresentation[];
}

interface CompiledKnowledge {
  terms: CompiledFoodTerm[];
  skipWords: Set<string>;
  modifiers: Map<string, CompiledModifier>;
}

let compiledKnowledge: CompiledKnowledge | null = null;

/**
 * Tokeniza un texto para clasificación: minúsculas, sin tildes, separando por
 * cualquier carácter no alfanumérico (espacios extra, comas, paréntesis…) y
 * lematizando plurales comunes.
 */
function classificationTokens(text: string): string[] {
  return normalizeIngredientName(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(singularizeFoodWord);
}

/** Indica si algún término conocido empieza exactamente en la posición `pos`. */
function findTermAt(
  terms: CompiledFoodTerm[],
  tokens: string[],
  pos: number
): CompiledFoodTerm | null {
  for (const term of terms) {
    const len = term.tokens.length;
    if (pos + len > tokens.length) continue;
    let matches = true;
    for (let k = 0; k < len; k += 1) {
      if (tokens[pos + k] !== term.tokens[k]) {
        matches = false;
        break;
      }
    }
    if (matches) return term;
  }
  return null;
}

function getCompiledKnowledge(): CompiledKnowledge {
  if (compiledKnowledge) return compiledKnowledge;

  const terms: CompiledFoodTerm[] = [];
  for (const rule of FOOD_RULES) {
    for (const term of rule.terms) {
      terms.push({ tokens: classificationTokens(term), label: term, rule });
    }
  }

  const modifiers = new Map<string, CompiledModifier>();
  for (const group of PRESENTATION_MODIFIERS) {
    for (const word of group.words) {
      modifiers.set(singularizeFoodWord(word), {
        presentation: group.presentation,
        appliesTo: group.appliesTo,
      });
    }
  }

  compiledKnowledge = {
    terms,
    skipWords: new Set(LEADING_SKIP_WORDS.map(singularizeFoodWord)),
    modifiers,
  };
  return compiledKnowledge;
}

/** Resultado detallado de la clasificación de un alimento por su nombre. */
export interface IngredientClassification {
  /** Categoría sugerida; solo existe con confianza alta. */
  category: IngredientCategory | null;
  /** Categoría detectada en un término secundario (confianza baja); nunca se aplica automáticamente. */
  possibleCategory: IngredientCategory | null;
  confidence: ClassificationConfidence;
  /** Presentación física; solo existe con confianza alta. */
  presentation: FoodPresentation | null;
  /** Unidad preferida de la regla para su presentación habitual. */
  preferredUnit: IngredientUnit | null;
  /** Unidades compatibles para presentaciones variables. */
  variableUnits: IngredientUnit[];
  /** Categorías que se consideran legítimas para este alimento. */
  acceptableCategories: IngredientCategory[];
  /** Término reconocido (útil para depuración y mensajes). */
  matchedTerm: string | null;
}

const UNKNOWN_CLASSIFICATION: IngredientClassification = {
  category: null,
  possibleCategory: null,
  confidence: 'none',
  presentation: null,
  preferredUnit: null,
  variableUnits: [],
  acceptableCategories: [],
  matchedTerm: null,
};

/**
 * Clasifica un alimento a partir de su nombre en español.
 *
 * Reglas de confianza:
 * - `high`: el núcleo del nombre (primera palabra significativa) es un alimento conocido.
 *   Ej.: «Leche en polvo», «Pechuga de pollo», «Aceite de oliva», «Bolsa de leche».
 * - `low`: solo se reconoce un término secundario (ej. «Sopa de pollo», «Galletas de avena»).
 *   No se asigna categoría ni presentación para no inventar certeza.
 * - `none`: nombre desconocido.
 */
export function classifyIngredient(name: string): IngredientClassification {
  if (typeof name !== 'string') return UNKNOWN_CLASSIFICATION;

  const knowledge = getCompiledKnowledge();
  const allTokens = classificationTokens(name);

  // Omitir envases, cantidades y conectores iniciales para encontrar el núcleo del nombre
  let start = 0;
  while (
    start < allTokens.length &&
    (knowledge.skipWords.has(allTokens[start]) || /^\d/.test(allTokens[start]))
  ) {
    start += 1;
  }
  const tokens = allTokens.slice(start);
  if (tokens.length === 0) return UNKNOWN_CLASSIFICATION;

  // Buscar la coincidencia más temprana; ante empate, la frase más larga
  let best: { term: CompiledFoodTerm; position: number } | null = null;
  for (const term of knowledge.terms) {
    const len = term.tokens.length;
    for (let pos = 0; pos + len <= tokens.length; pos += 1) {
      let matches = true;
      for (let k = 0; k < len; k += 1) {
        if (tokens[pos + k] !== term.tokens[k]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        if (
          !best ||
          pos < best.position ||
          (pos === best.position && len > best.term.tokens.length)
        ) {
          best = { term, position: pos };
        }
        break;
      }
    }
  }

  if (!best) return UNKNOWN_CLASSIFICATION;

  const { rule } = best.term;

  // Compuesto al estilo inglés («orange juice», «egg noodles»): el núcleo va al final y es
  // otro alimento de distinta categoría. No se inventa certeza sobre cuál de los dos es.
  const adjacentTerm =
    best.position === 0
      ? findTermAt(knowledge.terms, tokens, best.term.tokens.length)
      : null;
  const isAmbiguousCompound = !!adjacentTerm && adjacentTerm.rule.category !== rule.category;

  if (best.position !== 0 || isAmbiguousCompound) {
    return {
      ...UNKNOWN_CLASSIFICATION,
      confidence: 'low',
      possibleCategory: rule.category,
      matchedTerm: best.term.label,
    };
  }

  // Modificadores de presentación posteriores al término reconocido
  const modifierPresentations = new Set<FoodPresentation>();
  for (let i = best.term.tokens.length; i < tokens.length; i += 1) {
    const modifier = knowledge.modifiers.get(tokens[i]);
    if (modifier && (!modifier.appliesTo || modifier.appliesTo.includes(rule.presentation))) {
      modifierPresentations.add(modifier.presentation);
    }
  }

  let presentation: FoodPresentation = rule.presentation;
  if (modifierPresentations.size === 1) {
    presentation = [...modifierPresentations][0];
  } else if (modifierPresentations.size > 1) {
    // Modificadores contradictorios (ej. «líquido» y «en polvo»): no inventar certeza
    presentation = 'variable';
  }

  const acceptable = new Set<IngredientCategory>([rule.category, OTHER, ...(rule.altCategories ?? [])]);
  // Un alimento genérico («Otros») sin categorías alternativas explícitas no impone categoría
  if (rule.category === OTHER && !rule.altCategories) {
    INGREDIENT_CATEGORIES.forEach((c) => acceptable.add(c));
  }
  if (presentation === 'powder') acceptable.add(PANTRY);

  return {
    category: rule.category,
    possibleCategory: rule.category,
    confidence: 'high',
    presentation,
    preferredUnit:
      presentation === rule.presentation && rule.preferredUnit
        ? rule.preferredUnit
        : presentation === 'variable'
          ? null
          : PRESENTATION_DEFAULT_UNIT[presentation],
    variableUnits:
      presentation === 'variable'
        ? rule.presentation === 'variable' && rule.variableUnits
          ? [...rule.variableUnits]
          : [...VARIABLE_FALLBACK_UNITS]
        : [],
    acceptableCategories: INGREDIENT_CATEGORIES.filter((c) => acceptable.has(c)),
    matchedTerm: best.term.label,
  };
}

/**
 * Infiere de manera heurística la categoría más adecuada para un ingrediente en español.
 * Solo asigna una categoría concreta cuando el núcleo del nombre es un alimento reconocido;
 * los nombres desconocidos o ambiguos retornan «Otros» para no inducir a error.
 */
export function inferIngredientCategory(name: string): IngredientCategory {
  const classification = classifyIngredient(name);
  return classification.confidence === 'high' && classification.category
    ? classification.category
    : OTHER;
}

/** Dimensión física de una unidad de medida. */
export type UnitDimension = 'mass' | 'volume' | 'count' | 'kitchen' | 'unknown';

/** Clasifica una unidad por la magnitud que mide. */
export function getUnitDimension(unit: IngredientUnit): UnitDimension {
  switch (unit) {
    case 'g':
    case 'kg':
      return 'mass';
    case 'ml':
    case 'l':
      return 'volume';
    case 'unidad':
      return 'count';
    case 'cucharada':
    case 'cucharadita':
    case 'taza':
      return 'kitchen';
    default:
      return 'unknown';
  }
}

/** Sugerencia determinista de medida para un alimento. */
export interface MeasurementSuggestion {
  presentation: FoodPresentation | null;
  /** Unidades recomendadas y compatibles (vacío si el alimento es desconocido). */
  suggestedUnits: IngredientUnit[];
  /** Unidad a preseleccionar; solo existe con confianza alta y presentación clara. */
  preferredUnit: IngredientUnit | null;
  /**
   * - `high`: presentación clara; se puede preseleccionar `preferredUnit`.
   * - `low`: alimento reconocido pero presentación variable; solo se muestran opciones.
   * - `none`: desconocido o ambiguo; se conserva la selección manual.
   */
  confidence: ClassificationConfidence;
}

/**
 * Recomienda unidades compatibles según el tipo de alimento y su presentación física.
 * Nunca propone convertir masa en volumen: las unidades sugeridas son siempre de una
 * misma magnitud física salvo en presentaciones explícitamente variables.
 */
export function suggestIngredientMeasurement(name: string): MeasurementSuggestion {
  const classification = classifyIngredient(name);
  if (classification.confidence !== 'high' || !classification.presentation) {
    return { presentation: null, suggestedUnits: [], preferredUnit: null, confidence: 'none' };
  }

  if (classification.presentation === 'variable') {
    return {
      presentation: 'variable',
      suggestedUnits: classification.variableUnits,
      preferredUnit: null,
      confidence: 'low',
    };
  }

  const suggestedUnits = [...PRESENTATION_UNITS[classification.presentation]];
  const preferredUnit =
    classification.preferredUnit && suggestedUnits.includes(classification.preferredUnit)
      ? classification.preferredUnit
      : suggestedUnits[0];

  return {
    presentation: classification.presentation,
    // La unidad preferida encabeza la lista de sugerencias
    suggestedUnits: [preferredUnit, ...suggestedUnits.filter((u) => u !== preferredUnit)],
    preferredUnit,
    confidence: 'high',
  };
}

/**
 * Describe el efecto de cambiar manualmente de unidad sobre una cantidad ya ingresada.
 * - `same`: misma unidad.
 * - `convertible`: misma magnitud (g↔kg, ml↔l); la cantidad NO se convierte sola, pero
 *   puede ofrecerse la conversión explícita mediante `convertQuantity()`.
 * - `different_meaning`: magnitudes distintas (ej. l → kg); la cantidad debe reconfirmarse.
 */
export type UnitChangeImpact = 'same' | 'convertible' | 'different_meaning';

export function getUnitChangeImpact(
  fromUnit: IngredientUnit,
  toUnit: IngredientUnit
): UnitChangeImpact {
  if (fromUnit === toUnit) return 'same';
  return convertQuantity(1, fromUnit, toUnit) !== null ? 'convertible' : 'different_meaning';
}

/**
 * Determina si dos unidades son compatibles para suma de inventario.
 */
export function areUnitsCompatibleForAddition(
  unitA: IngredientUnit,
  unitB: IngredientUnit
): boolean {
  if (unitA === 'desconocida' || unitB === 'desconocida') return false;
  if (unitA === unitB) return true;

  // Masa: g <-> kg
  if ((unitA === 'g' && unitB === 'kg') || (unitA === 'kg' && unitB === 'g')) {
    return true;
  }

  // Volumen: ml <-> l
  if ((unitA === 'ml' && unitB === 'l') || (unitA === 'l' && unitB === 'ml')) {
    return true;
  }

  return false;
}

/**
 * Convierte un valor de una unidad a otra compatible.
 * Retorna null si las unidades no son directamente convertibles.
 */
export function convertQuantity(
  quantity: number,
  fromUnit: IngredientUnit,
  toUnit: IngredientUnit
): number | null {
  if (fromUnit === toUnit) return quantity;

  // g -> kg
  if (fromUnit === 'g' && toUnit === 'kg') {
    return quantity / 1000;
  }
  // kg -> g
  if (fromUnit === 'kg' && toUnit === 'g') {
    return quantity * 1000;
  }

  // ml -> l
  if (fromUnit === 'ml' && toUnit === 'l') {
    return quantity / 1000;
  }
  // l -> ml
  if (fromUnit === 'l' && toUnit === 'ml') {
    return quantity * 1000;
  }

  return null;
}

export interface CombineQuantityResult {
  success: boolean;
  newQuantity: number;
  unit: IngredientUnit;
  error?: string;
}

/**
 * Suma de forma segura dos cantidades de ingredientes respetando la unidad base.
 * Si las unidades no son compatibles, retorna success: false sin sumar silenciosamente.
 */
export function combineIngredientQuantities(
  baseQty: number,
  baseUnit: IngredientUnit,
  addedQty: number,
  addedUnit: IngredientUnit
): CombineQuantityResult {
  if (!areUnitsCompatibleForAddition(baseUnit, addedUnit)) {
    return {
      success: false,
      newQuantity: baseQty,
      unit: baseUnit,
      error: `Las unidades "${baseUnit}" y "${addedUnit}" son incompatibles para suma automática.`,
    };
  }

  const convertedAdded = convertQuantity(addedQty, addedUnit, baseUnit);
  if (convertedAdded === null) {
    return {
      success: false,
      newQuantity: baseQty,
      unit: baseUnit,
      error: `No se pudo convertir de "${addedUnit}" a "${baseUnit}".`,
    };
  }

  const rawSum = baseQty + convertedAdded;
  // Redondeo de precisión hasta 4 decimales para evitar artefactos IEEE 754
  const newQuantity = Math.round(rawSum * 10000) / 10000;

  return {
    success: true,
    newQuantity,
    unit: baseUnit,
  };
}

/**
 * Lematiza sufijos comunes de plurales en español para comparación consistente
 * de ingredientes (ej: tomates -> tomate, huevos -> huevo, limones -> limon, frijoles -> frijol).
 * Conserva estrictamente raíces cortas y palabras distintas para evitar falsos positivos
 * (ej: sal vs salsa, res vs fresas).
 */
export function stemSpanishWord(word: string): string {
  const clean = word.toLowerCase().trim();
  // Palabras cortas (<= 3 caracteres) se conservan intactas (ej: "sal", "res", "pan", "ajo")
  if (clean.length <= 3) {
    return clean;
  }

  // Plurales en -ces de palabras terminadas en -z (ej: arroces -> arroz, nueces -> nuez)
  if (clean.length > 4 && clean.endsWith('ces')) {
    return clean.slice(0, -3) + 'z';
  }

  // Plurales en -es de palabras terminadas en consonantes comunes:
  // -ones -> -on (limones -> limon, champinones -> champinon, melones -> melon)
  // -oles -> -ol (frijoles -> frijol)
  // -ales -> -al (tamales -> tamal, cereales -> cereal)
  // -anes -> -an (panes -> pan)
  // -unes -> -un (atunes -> atun)
  // -ares -> -ar (calamares -> calamar)
  // -ores -> -or (sabores -> sabor)
  if (
    clean.length > 4 &&
    (clean.endsWith('ones') ||
      clean.endsWith('oles') ||
      clean.endsWith('ales') ||
      clean.endsWith('anes') ||
      clean.endsWith('unes') ||
      clean.endsWith('ares') ||
      clean.endsWith('ores'))
  ) {
    return clean.slice(0, -2);
  }

  // Plurales regulares que terminan en -s:
  // - Para palabras terminadas en vocal + s (incluyendo -tes como tomates -> tomate,
  //   -vos como huevos -> huevo, -nes como carnes -> carne, -ches como leches -> leche),
  //   se retira únicamente la 's' final para preservar la vocal singular 'e', 'a', 'o'.
  if (
    clean.length > 3 &&
    clean.endsWith('s') &&
    !clean.endsWith('is') &&
    !clean.endsWith('us')
  ) {
    return clean.slice(0, -1);
  }

  return clean;
}

/**
 * Singulariza una palabra de alimento en español o inglés de forma conservadora.
 * Antes de las reglas españolas se aplican SOLO dos plurales ingleses inequívocos:
 * `-oes` → `-o` (tomatoes → tomato, potatoes → potato) e `-ies` → `-y`
 * (cherries → cherry). Plurales como `-ches` no se tocan para no romper «leches».
 */
export function singularizeFoodWord(word: string): string {
  const clean = word.toLowerCase().trim();
  if (clean.length > 4 && clean.endsWith('oes')) return clean.slice(0, -2);
  if (clean.length > 4 && clean.endsWith('ies')) return clean.slice(0, -3) + 'y';
  return stemSpanishWord(clean);
}

/**
 * Divide un nombre en tokens léxicos normalizados y lematizados.
 */
export function tokenizeName(name: string): string[] {
  return normalizeIngredientName(name)
    .split(/\s+/)
    .filter(Boolean)
    .map(singularizeFoodWord);
}

// ---------------------------------------------------------------------------
// Identidad bilingüe de alimentos (Fase 28C-B3.2)
// ---------------------------------------------------------------------------
//
// Lista BLANCA explícita de equivalencias español ↔ inglés. Solo se aplica al nombre
// COMPLETO (tras normalizar y singularizar), nunca a palabras sueltas dentro de un nombre
// más largo: «onion» = «cebolla», pero «green onion» u «onion powder» no tienen identidad
// bilingüe y por lo tanto jamás coinciden con «cebolla».
//
// La clave canónica es el nombre español. Los nombres guardados NO se reescriben: la
// identidad solo se calcula para comparar.
//
// Se omiten deliberadamente equivalencias ambiguas (pepper ↔ pimienta/pimentón,
// lemon/lime ↔ limón, bacon ↔ tocino/tocineta, banana ↔ banano/plátano, meat ↔ carne).

const BILINGUAL_FOOD_IDENTITIES = {
  cebolla: ['onion'],
  tomate: ['tomato'],
  huevo: ['egg'],
  ajo: ['garlic'],
  arroz: ['rice'],
  pollo: ['chicken'],
  zanahoria: ['carrot'],
  papa: ['potato'],
  batata: ['sweet potato'],
  leche: ['milk'],
  queso: ['cheese'],
  sal: ['salt'],
  azucar: ['sugar'],
  mantequilla: ['butter'],
  harina: ['flour'],
  pan: ['bread'],
  aceite: ['oil'],
  frijol: ['bean'],
  lenteja: ['lentil'],
  garbanzo: ['chickpea'],
  avena: ['oat', 'oats'],
  lechuga: ['lettuce'],
  espinaca: ['spinach'],
  pepino: ['cucumber'],
  brocoli: ['broccoli'],
  coliflor: ['cauliflower'],
  aguacate: ['avocado'],
  manzana: ['apple'],
  pera: ['pear'],
  fresa: ['strawberry'],
  pina: ['pineapple'],
  uva: ['grape'],
  sandia: ['watermelon'],
  berenjena: ['eggplant'],
  calabacin: ['zucchini'],
  champinon: ['mushroom'],
  apio: ['celery'],
  repollo: ['cabbage'],
  jengibre: ['ginger'],
  perejil: ['parsley'],
  albahaca: ['basil'],
  cerdo: ['pork'],
  pavo: ['turkey'],
  pescado: ['fish'],
  atun: ['tuna'],
  camaron: ['shrimp'],
  jamon: ['ham'],
  yogur: ['yogurt', 'yoghurt'],
  vinagre: ['vinegar'],
  miel: ['honey'],
  cafe: ['coffee'],
  agua: ['water'],
  canela: ['cinnamon'],
  comino: ['cumin'],
} satisfies Record<string, string[]>;

type BilingualFoodIdentityKey = keyof typeof BILINGUAL_FOOD_IDENTITIES;

/**
 * Etiquetas visibles (con tildes correctas) de cada identidad bilingüe aprobada. Solo se
 * usan para MOSTRAR el nombre en el idioma activo; nunca se guardan. El tipo obliga a que
 * cada identidad de la lista blanca tenga su etiqueta en ambos idiomas.
 */
const BILINGUAL_FOOD_LABELS: Record<BilingualFoodIdentityKey, Record<Locale, string>> = {
  cebolla: { es: 'Cebolla', en: 'Onion' },
  tomate: { es: 'Tomate', en: 'Tomato' },
  huevo: { es: 'Huevo', en: 'Egg' },
  ajo: { es: 'Ajo', en: 'Garlic' },
  arroz: { es: 'Arroz', en: 'Rice' },
  pollo: { es: 'Pollo', en: 'Chicken' },
  zanahoria: { es: 'Zanahoria', en: 'Carrot' },
  papa: { es: 'Papa', en: 'Potato' },
  batata: { es: 'Batata', en: 'Sweet potato' },
  leche: { es: 'Leche', en: 'Milk' },
  queso: { es: 'Queso', en: 'Cheese' },
  sal: { es: 'Sal', en: 'Salt' },
  azucar: { es: 'Azúcar', en: 'Sugar' },
  mantequilla: { es: 'Mantequilla', en: 'Butter' },
  harina: { es: 'Harina', en: 'Flour' },
  pan: { es: 'Pan', en: 'Bread' },
  aceite: { es: 'Aceite', en: 'Oil' },
  frijol: { es: 'Frijol', en: 'Bean' },
  lenteja: { es: 'Lenteja', en: 'Lentil' },
  garbanzo: { es: 'Garbanzo', en: 'Chickpea' },
  avena: { es: 'Avena', en: 'Oats' },
  lechuga: { es: 'Lechuga', en: 'Lettuce' },
  espinaca: { es: 'Espinaca', en: 'Spinach' },
  pepino: { es: 'Pepino', en: 'Cucumber' },
  brocoli: { es: 'Brócoli', en: 'Broccoli' },
  coliflor: { es: 'Coliflor', en: 'Cauliflower' },
  aguacate: { es: 'Aguacate', en: 'Avocado' },
  manzana: { es: 'Manzana', en: 'Apple' },
  pera: { es: 'Pera', en: 'Pear' },
  fresa: { es: 'Fresa', en: 'Strawberry' },
  pina: { es: 'Piña', en: 'Pineapple' },
  uva: { es: 'Uva', en: 'Grape' },
  sandia: { es: 'Sandía', en: 'Watermelon' },
  berenjena: { es: 'Berenjena', en: 'Eggplant' },
  calabacin: { es: 'Calabacín', en: 'Zucchini' },
  champinon: { es: 'Champiñón', en: 'Mushroom' },
  apio: { es: 'Apio', en: 'Celery' },
  repollo: { es: 'Repollo', en: 'Cabbage' },
  jengibre: { es: 'Jengibre', en: 'Ginger' },
  perejil: { es: 'Perejil', en: 'Parsley' },
  albahaca: { es: 'Albahaca', en: 'Basil' },
  cerdo: { es: 'Cerdo', en: 'Pork' },
  pavo: { es: 'Pavo', en: 'Turkey' },
  pescado: { es: 'Pescado', en: 'Fish' },
  atun: { es: 'Atún', en: 'Tuna' },
  camaron: { es: 'Camarón', en: 'Shrimp' },
  jamon: { es: 'Jamón', en: 'Ham' },
  yogur: { es: 'Yogur', en: 'Yogurt' },
  vinagre: { es: 'Vinagre', en: 'Vinegar' },
  miel: { es: 'Miel', en: 'Honey' },
  cafe: { es: 'Café', en: 'Coffee' },
  agua: { es: 'Agua', en: 'Water' },
  canela: { es: 'Canela', en: 'Cinnamon' },
  comino: { es: 'Comino', en: 'Cumin' },
};

/** Forma de comparación de un nombre completo: tokens singularizados unidos por espacio. */
function identityPhrase(name: string): string {
  return normalizeIngredientName(name)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(singularizeFoodWord)
    .join(' ');
}

let bilingualIdentityIndex: Map<string, string> | null = null;

function getBilingualIdentityIndex(): Map<string, string> {
  if (bilingualIdentityIndex) return bilingualIdentityIndex;
  const index = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(BILINGUAL_FOOD_IDENTITIES)) {
    for (const term of [canonical, ...aliases]) {
      const phrase = identityPhrase(term);
      // La primera equivalencia registrada gana; nunca se sobrescribe una identidad
      if (phrase && !index.has(phrase)) index.set(phrase, canonical);
    }
  }
  bilingualIdentityIndex = index;
  return index;
}

/**
 * Identidad canónica (español) de un nombre de alimento, o `null` si el nombre completo no
 * está en la lista blanca bilingüe. Ej.: «Onions» → «cebolla», «Tomatoes» → «tomate»,
 * «Onion powder» → null.
 */
export function getBilingualFoodIdentity(name: string): string | null {
  if (typeof name !== 'string') return null;
  const phrase = identityPhrase(name);
  if (!phrase) return null;
  return getBilingualIdentityIndex().get(phrase) ?? null;
}

/**
 * Nombre VISIBLE de un ingrediente en el idioma activo (solo presentación, Fase 28C-B3.4).
 *
 * - Reutiliza `getBilingualFoodIdentity()`: solo se traduce un nombre COMPLETO que esté en la
 *   lista blanca bilingüe. «Green onion», «Almond milk» u «Onion powder» no tienen identidad y
 *   se muestran tal cual en ambos idiomas.
 * - Si el nombre guardado ya está escrito en el idioma solicitado, se devuelve sin cambios
 *   (respeta plurales y mayúsculas del usuario). Si está en el otro idioma, se devuelve la
 *   etiqueta aprobada con tildes correctas («Sugar» → «Azúcar»).
 * - Función pura y determinista: no llama a servicios externos y nunca modifica el dato guardado.
 */
export function getLocalizedIngredientName(name: string, locale: Locale): string {
  if (typeof name !== 'string') return name;
  const identity = getBilingualFoodIdentity(name) as BilingualFoodIdentityKey | null;
  if (!identity) return name;
  const labels = BILINGUAL_FOOD_LABELS[identity];
  if (!labels || (locale !== 'es' && locale !== 'en')) return name;
  const isWrittenInSpanish = identityPhrase(name) === identityPhrase(identity);
  const storedLocale: Locale = isWrittenInSpanish ? 'es' : 'en';
  return storedLocale === locale ? name : labels[locale];
}

/**
 * Calificadores que convierten un alimento en OTRO producto distinto. Si la diferencia
 * entre dos nombres incluye alguno de ellos, no se reporta ni siquiera una coincidencia
 * posible (ej. «ajo» vs «ajo en polvo», «milk» vs «almond milk», «potato» vs «sweet potato»).
 * Se comparan en su forma singularizada.
 */
const DISTINCT_FOOD_QUALIFIERS = new Set(
  [
    // Español
    'polvo', 'salsa', 'pasta', 'pure', 'almendra', 'avena', 'soya', 'soja', 'coco', 'vegetal',
    'jugo', 'zumo', 'aceite', 'caldo', 'harina', 'dulce', 'larga', 'largo', 'condensada',
    'evaporada', 'crema', 'sopa', 'mani', 'mantequilla', 'leche',
    // Inglés
    'powder', 'powdered', 'sauce', 'paste', 'puree', 'green', 'spring', 'sweet', 'almond',
    'oat', 'soy', 'coconut', 'plant', 'juice', 'oil', 'broth', 'stock', 'flour', 'bell',
    'black', 'condensed', 'evaporated', 'cream', 'soup', 'peanut', 'butter', 'milk', 'chip',
  ].map(singularizeFoodWord)
);

function hasDistinctFoodQualifier(longer: string[], shorter: string[]): boolean {
  return longer.some((t) => !shorter.includes(t) && DISTINCT_FOOD_QUALIFIERS.has(t));
}

/**
 * Busca si un ingrediente detectado coincide con uno ya existente en la despensa
 * aplicando matching conservador para evitar falsos positivos (ej: sal vs salsa, res vs fresa).
 */
export function findDuplicateInPantry(
  name: string,
  pantryIngredients: Ingredient[]
): DuplicatePantryMatch | undefined {
  const normName = normalizeIngredientName(name);
  if (!normName) return undefined;

  const detectedTokens = tokenizeName(name);
  if (detectedTokens.length === 0) return undefined;

  const detectedIdentity = getBilingualFoodIdentity(name);

  let bestMatch: { ingredient: Ingredient; matchType: 'exact' | 'possible' } | undefined;

  for (const pantryItem of pantryIngredients) {
    const pantryNorm = normalizeIngredientName(pantryItem.name);
    if (!pantryNorm) continue;

    // 1. Coincidencia exacta de cadena normalizada
    if (pantryNorm === normName) {
      return {
        id: pantryItem.id,
        name: pantryItem.name,
        currentQuantity: pantryItem.quantity,
        unit: pantryItem.unit,
        category: pantryItem.category,
        matchType: 'exact',
      };
    }

    const pantryTokens = tokenizeName(pantryItem.name);

    // Comparación token a token para lematización plural/singular exacta
    if (
      pantryTokens.length === detectedTokens.length &&
      pantryTokens.every((token, idx) => token === detectedTokens[idx])
    ) {
      return {
        id: pantryItem.id,
        name: pantryItem.name,
        currentQuantity: pantryItem.quantity,
        unit: pantryItem.unit,
        category: pantryItem.category,
        matchType: 'exact',
      };
    }

    // Identidad bilingüe explícita del nombre COMPLETO (ej: "Onions" vs "Cebolla").
    // Nunca se deduce por palabras parciales: "Green onion" no tiene identidad bilingüe.
    if (detectedIdentity && detectedIdentity === getBilingualFoodIdentity(pantryItem.name)) {
      return {
        id: pantryItem.id,
        name: pantryItem.name,
        currentQuantity: pantryItem.quantity,
        unit: pantryItem.unit,
        category: pantryItem.category,
        matchType: 'exact',
      };
    }

    // 2. Coincidencia calificada de palabras completas (ej: "tomate" vs "tomate chonto")
    // Se requiere que TODAS las palabras del término más corto existan como tokens independientes
    // en el término más largo. De esta forma:
    // - "sal" jamás coincide con "salsa" ("sal" !== "salsa").
    // - "res" jamás coincide con "fresa" ("res" !== "fresa").
    // Además, si la diferencia incluye un calificador que cambia el producto
    // ("ajo en polvo", "almond milk", "sweet potato"), no se reporta coincidencia alguna.
    const isDetectedSubset =
      detectedTokens.length < pantryTokens.length &&
      detectedTokens.every((t) => pantryTokens.includes(t)) &&
      !hasDistinctFoodQualifier(pantryTokens, detectedTokens);
    const isPantrySubset =
      pantryTokens.length < detectedTokens.length &&
      pantryTokens.every((t) => detectedTokens.includes(t)) &&
      !hasDistinctFoodQualifier(detectedTokens, pantryTokens);

    if (isDetectedSubset || isPantrySubset) {
      if (!bestMatch) {
        bestMatch = {
          ingredient: pantryItem,
          matchType: 'possible',
        };
      }
    }
  }

  if (bestMatch) {
    return {
      id: bestMatch.ingredient.id,
      name: bestMatch.ingredient.name,
      currentQuantity: bestMatch.ingredient.quantity,
      unit: bestMatch.ingredient.unit,
      category: bestMatch.ingredient.category,
      matchType: bestMatch.matchType,
    };
  }

  return undefined;
}

/**
 * Mapea una unidad del backend a una unidad de la despensa de FoodAI.
 */
export function mapBackendUnitToPantryUnit(rawUnit: string): IngredientUnit {
  const clean = rawUnit.trim().toLowerCase();
  if (INGREDIENT_UNITS.includes(clean as IngredientUnit)) {
    return clean as IngredientUnit;
  }
  return 'desconocida';
}

/**
 * Convierte los ingredientes devueltos por el backend en el modelo de revisión interactiva.
 * REGLA ESTRICTA:
 * 1. No inventar cantidades cuando Gemini devuelve null.
 * 2. Las coincidencias ambiguas o con unidades incompatibles NUNCA defaultean a add_to_existing.
 */
export function mapDetectedToScannedItems(
  detected: BackendDetectedIngredient[],
  pantryIngredients: Ingredient[]
): ScannedIngredientItem[] {
  return detected.map((item, index) => {
    const duplicate = findDuplicateInPantry(item.name, pantryIngredients);
    const unit = mapBackendUnitToPantryUnit(item.unit);
    const category = duplicate ? duplicate.category : inferIngredientCategory(item.name);

    let action: 'create' | 'add_to_existing' = 'create';
    let needsReview = item.needsReview || item.quantity === null || unit === 'desconocida';

    if (duplicate) {
      if (duplicate.matchType === 'exact') {
        const unitsCompatible = areUnitsCompatibleForAddition(duplicate.unit, unit);
        if (unitsCompatible) {
          action = 'add_to_existing';
        } else {
          // Unidades incompatibles: no asumir suma automática
          action = 'create';
          needsReview = true;
        }
      } else {
        // Coincidencia calificada/ambigua (ej: "tomate" vs "tomate chonto"):
        // Obliga a confirmación explícita del usuario y parte por defecto como 'create'
        action = 'create';
        needsReview = true;
      }
    }

    return {
      id: `scanned-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 6)}`,
      name: item.name.trim(),
      quantity: item.quantity, // null preservado deliberadamente
      unit,
      category,
      needsReview,
      isSelected: true,
      duplicateMatch: duplicate,
      action,
    };
  });
}

/**
 * Recalcula la coincidencia con la despensa cuando el usuario renombra un alimento detectado
 * (Fase 28C-B3.2). Nunca conserva un destino obsoleto:
 * - Sin coincidencia para el nuevo nombre → se elimina `duplicateMatch` y la acción es `create`.
 * - `add_to_existing` solo se conserva si el destino es EL MISMO registro, con el mismo tipo de
 *   coincidencia y unidades compatibles. Un destino nuevo NUNCA se selecciona automáticamente,
 *   para no fusionar por accidente el alimento con otro tras el cambio de nombre.
 * - Las coincidencias posibles o con unidades incompatibles exigen revisión explícita.
 * La cantidad (incluido `null`), la unidad y la categoría elegidas no se modifican.
 */
export function rematchScannedItemAfterRename(
  item: ScannedIngredientItem,
  name: string,
  pantryIngredients: Ingredient[]
): ScannedIngredientItem {
  const duplicate = name.trim()
    ? findDuplicateInPantry(name, pantryIngredients || [])
    : undefined;

  const baseNeedsReview = item.quantity === null || item.unit === 'desconocida';

  if (!duplicate) {
    return {
      ...item,
      name,
      duplicateMatch: undefined,
      action: 'create',
      needsReview: baseNeedsReview,
    };
  }

  const unitsCompatible = areUnitsCompatibleForAddition(duplicate.unit, item.unit);
  const previous = item.duplicateMatch;
  const sameTarget =
    !!previous && previous.id === duplicate.id && previous.matchType === duplicate.matchType;
  const keepMerge = item.action === 'add_to_existing' && sameTarget && unitsCompatible;

  return {
    ...item,
    name,
    duplicateMatch: duplicate,
    action: keepMerge ? 'add_to_existing' : 'create',
    needsReview:
      baseNeedsReview || duplicate.matchType !== 'exact' || !unitsCompatible,
  };
}

/**
 * Indica si un alimento detectado puede sumarse de forma segura a su coincidencia actual.
 */
export function canMergeScannedItem(item: ScannedIngredientItem): boolean {
  return (
    !!item.duplicateMatch &&
    areUnitsCompatibleForAddition(item.duplicateMatch.unit, item.unit)
  );
}
