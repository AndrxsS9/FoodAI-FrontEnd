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
 * Busca si un ingrediente detectado coincide con uno ya existente en la despensa.
 */
export function findDuplicateInPantry(
  name: string,
  pantryIngredients: Ingredient[]
): DuplicatePantryMatch | undefined {
  const normName = normalizeIngredientName(name);
  if (!normName) return undefined;

  const match = pantryIngredients.find((pantryItem) => {
    const pantryNorm = normalizeIngredientName(pantryItem.name);
    return pantryNorm === normName || pantryNorm.includes(normName) || normName.includes(pantryNorm);
  });

  if (!match) return undefined;

  return {
    id: match.id,
    name: match.name,
    currentQuantity: match.quantity,
    unit: match.unit,
    category: match.category,
  };
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
 * REGLA ESTRICTA: No inventar cantidades cuando Gemini devuelve null.
 */
export function mapDetectedToScannedItems(
  detected: BackendDetectedIngredient[],
  pantryIngredients: Ingredient[]
): ScannedIngredientItem[] {
  return detected.map((item, index) => {
    const duplicate = findDuplicateInPantry(item.name, pantryIngredients);
    const unit = mapBackendUnitToPantryUnit(item.unit);
    const category = duplicate ? duplicate.category : inferIngredientCategory(item.name);

    return {
      id: `scanned-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 6)}`,
      name: item.name.trim(),
      quantity: item.quantity, // null preservado deliberadamente
      unit,
      category,
      needsReview: item.needsReview || item.quantity === null || unit === 'desconocida',
      isSelected: true,
      duplicateMatch: duplicate,
      action: duplicate ? 'add_to_existing' : 'create',
    };
  });
}
