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
    ],
    category: VEG,
    presentation: 'piece',
    preferredUnit: 'unidad',
  },

  // --- Carnes y proteínas ---
  { terms: ['huevo'], category: PROTEIN, presentation: 'unit', preferredUnit: 'unidad', altCategories: [DAIRY] },
  {
    terms: ['pollo', 'carne', 'res', 'cerdo', 'pescado', 'costilla', 'lomo', 'pavo', 'molida', 'sobrebarriga'],
    category: PROTEIN,
    presentation: 'solid',
    preferredUnit: 'kg',
  },
  {
    terms: ['jamon', 'tocineta', 'tocino', 'camaron', 'salmon', 'tofu'],
    category: PROTEIN,
    presentation: 'solid',
    preferredUnit: 'g',
  },
  { terms: ['atun', 'sardina'], category: PROTEIN, presentation: 'solid', preferredUnit: 'g', altCategories: [PANTRY] },
  {
    terms: [
      'pechuga', 'muslo', 'contramuslo', 'ala', 'alita', 'chuleta', 'filete', 'salchicha',
      'chorizo', 'hamburguesa', 'tilapia', 'mojarra',
    ],
    category: PROTEIN,
    presentation: 'piece',
    preferredUnit: 'unidad',
  },

  // --- Lácteos ---
  { terms: ['leche', 'kumis', 'kefir'], category: DAIRY, presentation: 'liquid', preferredUnit: 'l', altCategories: [PANTRY] },
  {
    terms: ['queso', 'mantequilla', 'margarina', 'cuajada', 'parmesano', 'mozzarella', 'requeson', 'arequipe'],
    category: DAIRY,
    presentation: 'solid',
    preferredUnit: 'g',
    altCategories: [PANTRY],
  },
  {
    terms: ['yogur', 'yogurt', 'yogures', 'crema', 'suero'],
    category: DAIRY,
    presentation: 'variable',
    variableUnits: ['ml', 'l', 'g', 'kg', 'unidad'],
  },

  // --- Granos y cereales ---
  { terms: ['arroz'], category: GRAINS, presentation: 'solid', preferredUnit: 'kg', altCategories: [PANTRY] },
  {
    terms: ['frijol', 'lenteja', 'garbanzo'],
    category: GRAINS,
    presentation: 'solid',
    preferredUnit: 'g',
    altCategories: [PANTRY, PROTEIN],
  },
  {
    terms: [
      'avena', 'pasta', 'espagueti', 'espaguetis', 'spaghetti', 'macarron', 'fideo', 'maiz',
      'cereal', 'granola', 'quinoa', 'quinua', 'trigo', 'cuscus',
    ],
    category: GRAINS,
    presentation: 'solid',
    preferredUnit: 'g',
    altCategories: [PANTRY],
  },
  { terms: ['harina', 'maizena', 'fecula'], category: GRAINS, presentation: 'powder', preferredUnit: 'g', altCategories: [PANTRY] },
  { terms: ['pan', 'tostada', 'arepa', 'tortilla'], category: GRAINS, presentation: 'piece', preferredUnit: 'unidad', altCategories: [PANTRY] },

  // --- Alacena ---
  { terms: ['aceite'], category: PANTRY, presentation: 'liquid', preferredUnit: 'l' },
  { terms: ['vinagre', 'esencia', 'vainilla'], category: PANTRY, presentation: 'liquid', preferredUnit: 'ml' },
  { terms: ['sal', 'azucar'], category: PANTRY, presentation: 'powder', preferredUnit: 'g' },
  {
    terms: [
      'pimienta', 'especia', 'especias', 'comino', 'oregano', 'canela', 'paprika', 'curry',
      'color', 'achiote', 'levadura', 'bicarbonato', 'gelatina', 'laurel', 'tomillo',
    ],
    category: PANTRY,
    presentation: 'powder',
    preferredUnit: 'g',
  },
  { terms: ['cafe'], category: PANTRY, presentation: 'solid', preferredUnit: 'g' },
  { terms: ['mermelada'], category: PANTRY, presentation: 'solid', preferredUnit: 'g' },
  { terms: ['panela', 'chocolate'], category: PANTRY, presentation: 'piece', preferredUnit: 'unidad' },
  {
    terms: ['salsa', 'mayonesa', 'mostaza', 'ketchup', 'miel', 'caldo', 'te', 'aceituna'],
    category: PANTRY,
    presentation: 'variable',
    variableUnits: ['ml', 'l', 'g', 'unidad'],
  },

  // --- Bebidas: presentación líquida clara, categoría genérica ---
  {
    terms: ['agua', 'jugo', 'zumo', 'gaseosa', 'refresco', 'bebida', 'vino', 'cerveza'],
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
  { words: ['liquido', 'liquida', 'bebible'], presentation: 'liquid' },
  { words: ['polvo'], presentation: 'powder' },
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
    .map(stemSpanishWord);
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
      modifiers.set(stemSpanishWord(word), {
        presentation: group.presentation,
        appliesTo: group.appliesTo,
      });
    }
  }

  compiledKnowledge = {
    terms,
    skipWords: new Set(LEADING_SKIP_WORDS.map(stemSpanishWord)),
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

  if (best.position !== 0) {
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
 * Divide un nombre en tokens léxicos normalizados y lematizados.
 */
export function tokenizeName(name: string): string[] {
  return normalizeIngredientName(name)
    .split(/\s+/)
    .filter(Boolean)
    .map(stemSpanishWord);
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

    // 2. Coincidencia calificada de palabras completas (ej: "tomate" vs "tomate chonto")
    // Se requiere que TODAS las palabras del término más corto existan como tokens independientes
    // en el término más largo. De esta forma:
    // - "sal" jamás coincide con "salsa" ("sal" !== "salsa").
    // - "res" jamás coincide con "fresa" ("res" !== "fresa").
    const isDetectedSubset =
      detectedTokens.length < pantryTokens.length &&
      detectedTokens.every((t) => pantryTokens.includes(t));
    const isPantrySubset =
      pantryTokens.length < detectedTokens.length &&
      pantryTokens.every((t) => detectedTokens.includes(t));

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
