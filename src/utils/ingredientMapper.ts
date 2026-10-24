/**
 * FoodAI - Mapeo de ingredientes detectados a categorías, unidades y detección de duplicados en la despensa (Fase 3B).
 */
import {
  Ingredient,
  IngredientCategory,
  IngredientUnit,
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

function matchesKeyword(text: string, kw: string): boolean {
  if (kw.length <= 3) {
    const regex = new RegExp(`(^|\\s)${kw}(\\s|$)`, 'i');
    return regex.test(text);
  }
  return text.includes(kw);
}

/**
 * Infiere de manera heurística la categoría más adecuada para un ingrediente en español.
 */
export function inferIngredientCategory(name: string): IngredientCategory {
  const norm = normalizeIngredientName(name);

  // Verduras y frutas
  const veggiesAndFruits = [
    'tomate', 'cebolla', 'papa', 'zanahoria', 'ajo', 'limon', 'aguacate', 'platano',
    'manzana', 'lechuga', 'espinaca', 'cilantro', 'perejil', 'pimenton', 'pepino',
    'calabacin', 'champiñon', 'champiñon', 'fresa', 'naranja', 'banano', 'pera',
    'mango', 'pina', 'piña', 'uvas', 'brocoli', 'coliflor', 'apio', 'guayaba', 'maracuya',
  ];
  if (veggiesAndFruits.some((kw) => matchesKeyword(norm, kw))) {
    return 'Verduras y frutas';
  }

  // Carnes y proteínas
  const proteins = [
    'pollo', 'carne', 'res', 'cerdo', 'pescado', 'atun', 'huevo', 'jamon', 'salchicha',
    'tocineta', 'tocino', 'pechuga', 'muslo', 'costilla', 'molida', 'camaron', 'lomo',
    'chuleta', 'pavo', 'salmon', 'tilapia',
  ];
  if (proteins.some((kw) => matchesKeyword(norm, kw))) {
    return 'Carnes y proteínas';
  }

  // Lácteos
  const dairy = [
    'leche', 'queso', 'mantequilla', 'yogur', 'yogurt', 'crema', 'cuajada', 'suero',
    'parmesano', 'mozzarella', 'arequipe',
  ];
  if (dairy.some((kw) => matchesKeyword(norm, kw))) {
    return 'Lácteos';
  }

  // Granos y cereales
  const grains = [
    'arroz', 'frijol', 'lenteja', 'garbanzo', 'avena', 'pasta', 'espagueti', 'maiz',
    'harina', 'cereal', 'quinoa', 'pan', 'tostada', 'arepa', 'trigo',
  ];
  if (grains.some((kw) => matchesKeyword(norm, kw))) {
    return 'Granos y cereales';
  }

  // Alacena
  const pantryKeywords = [
    'aceite', 'sal', 'azucar', 'pimienta', 'vinagre', 'salsa', 'cafe', 'te', 'especias',
    'comino', 'oregano', 'canela', 'mayonesa', 'mostaza', 'color', 'caldo', 'miel',
  ];
  if (pantryKeywords.some((kw) => matchesKeyword(norm, kw))) {
    return 'Alacena';
  }

  return 'Otros';
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
 * Lematiza sufijos comunes de plurales en español para comparación consistente.
 */
export function stemSpanishWord(word: string): string {
  const clean = word.toLowerCase().trim();
  if (clean.length > 4 && clean.endsWith('es')) {
    const root = clean.slice(0, -2);
    // Consonante + es (ej: frijoles -> frijol, limones -> limon)
    if (/[bcdfghjklmnñpqrstvwxyz]$/.test(root)) {
      return root;
    }
    // Vocal + es (ej: tomates -> tomate)
    return clean.slice(0, -1);
  }
  if (clean.length > 3 && clean.endsWith('s') && !clean.endsWith('is') && !clean.endsWith('us')) {
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
