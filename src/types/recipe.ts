/**
 * FoodAI - Modelos, contratos de API y tipos del dominio de recetas (Fase 2C).
 * Alineado con el esquema del backend: POST /api/recipes/recommend
 */

// ==========================================
// 1. CONTRATOS DEL BACKEND (POST /api/recipes/recommend)
// ==========================================

export interface BackendPantryItem {
  name: string;
  quantity: number | null;
  unit: string;
  needsReview?: boolean;
}

export interface RecommendRecipesRequest {
  pantry: BackendPantryItem[];
  budget: number; // Número no negativo en COP
  servings: number; // Entero de 1 a 12
  maxMinutes?: number; // Opcional, entero positivo hasta 240
}

export interface BackendRecipeIngredient {
  name: string;
  quantity: number | null;
  unit: string;
}

export interface BackendRecipeMissingIngredient extends BackendRecipeIngredient {
  estimatedCost?: number;
}

export interface BackendRecipe {
  name: string;
  description: string;
  totalMinutes: number;
  ingredients: BackendRecipeIngredient[];
  steps: string[];
  availableIngredients: BackendRecipeIngredient[] | string[];
  missingIngredients: BackendRecipeMissingIngredient[] | string[];
  estimatedMissingCost: number;
  budgetRemaining: number;
  withinBudget: boolean;
  convenience: string | number;
  reason: string;
}

export interface BackendResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

export interface RecommendRecipesResponseData {
  recipes: BackendRecipe[];
}

// ==========================================
// 2. MODELOS DE PRESENTACIÓN DEL CLIENTE (FRONTEND)
// ==========================================

export interface RecipeIngredient {
  name: string;
  quantity: number | null;
  unit: string;
  needsReview?: boolean;
}

export interface RecipeMissingIngredient extends RecipeIngredient {
  estimatedCost?: number;
}

export interface ClientRecipe {
  /** Identificador único seguro en el cliente (slug URL-friendly o ID explícito de fixture) */
  id: string;
  name: string;
  description: string;
  totalMinutes: number;
  servings: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  availableIngredients: RecipeIngredient[];
  missingIngredients: RecipeMissingIngredient[];
  estimatedMissingCost: number;
  budgetRemaining: number;
  withinBudget: boolean;
  convenience: string | number;
  reason: string;
  /** Bandera explícita que distingue datos demostrativos de recomendaciones reales de IA */
  isDemoFixture: boolean;
  /** Imagen opcional (solo provista por fixture o backend si llega a existir) */
  imageUrl?: any;
}

// ==========================================
// 3. UTILIDADES Y FORMATEADORES DEL DOMINIO
// ==========================================

/**
 * Genera un slug o ID seguro para la navegación por URL en Expo Router.
 */
export function generateRecipeSlug(name: string, index?: number): string {
  if (!name || typeof name !== 'string') {
    return typeof index === 'number' ? `receta-${index + 1}` : 'receta-desconocida';
  }
  const clean = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar tildes
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!clean) {
    return typeof index === 'number' ? `receta-${index + 1}` : 'receta-desconocida';
  }
  return typeof index === 'number' ? `${clean}-${index + 1}` : clean;
}

/**
 * Formatea un valor monetario en pesos colombianos (COP).
 * Ejemplo: 5800 -> "$5.800 COP"
 */
export function formatCopCurrency(amount: number, withSuffix: boolean = true): string {
  if (!Number.isFinite(amount) || isNaN(amount)) {
    return withSuffix ? '$0 COP' : '$0';
  }
  const rounded = Math.round(amount);
  const formatted = rounded.toLocaleString('es-CO');
  return withSuffix ? `$${formatted} COP` : `$${formatted}`;
}

/**
 * Formatea una cantidad de ingrediente preservando valores nulos y unidades desconocidas.
 * NUNCA muestra una cantidad nula como cero.
 */
export function formatIngredientQuantity(quantity: number | null | undefined, unit?: string): string {
  const safeUnit = unit ? unit.trim() : '';

  if (quantity === null || quantity === undefined) {
    if (safeUnit && safeUnit.toLowerCase() !== 'desconocida' && safeUnit.toLowerCase() !== 's/u') {
      return `Por confirmar (${safeUnit})`;
    }
    return 'Por confirmar / Al gusto';
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return 'Al gusto';
  }

  // Formatear decimales amigables (ej: 0.5 -> 1/2 o 0.5)
  const displayQty = Number.isInteger(quantity)
    ? quantity.toString()
    : quantity.toLocaleString('es-CO', { maximumFractionDigits: 2 });

  if (!safeUnit || safeUnit.toLowerCase() === 'desconocida' || safeUnit.toLowerCase() === 's/u') {
    return displayQty;
  }

  return `${displayQty} ${safeUnit}`;
}

/**
 * Normaliza un ingrediente recibido del backend (pudiendo ser string o objeto)
 * a un objeto RecipeIngredient consistente.
 */
export function normalizeRecipeIngredient(
  item: BackendRecipeIngredient | string
): RecipeIngredient {
  if (typeof item === 'string') {
    return {
      name: item.trim(),
      quantity: null,
      unit: '',
    };
  }
  return {
    name: item?.name ? String(item.name).trim() : 'Ingrediente',
    quantity: typeof item?.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : null,
    unit: item?.unit ? String(item.unit).trim() : '',
  };
}

/**
 * Normaliza un ingrediente faltante recibido del backend.
 */
export function normalizeRecipeMissingIngredient(
  item: BackendRecipeMissingIngredient | string
): RecipeMissingIngredient {
  if (typeof item === 'string') {
    return {
      name: item.trim(),
      quantity: null,
      unit: '',
    };
  }
  return {
    name: item?.name ? String(item.name).trim() : 'Ingrediente',
    quantity: typeof item?.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : null,
    unit: item?.unit ? String(item.unit).trim() : '',
    estimatedCost: typeof item?.estimatedCost === 'number' && Number.isFinite(item.estimatedCost) ? item.estimatedCost : undefined,
  };
}

/**
 * Convierte una receta del backend a un modelo seguro de presentación del cliente (ClientRecipe).
 */
export function normalizeBackendRecipe(
  raw: BackendRecipe,
  index: number = 0,
  defaultServings: number = 2
): ClientRecipe {
  const safeName = raw.name ? String(raw.name).trim() : `Receta ${index + 1}`;
  const slug = generateRecipeSlug(safeName, index);

  const rawIngredients = Array.isArray(raw.ingredients) ? raw.ingredients : [];
  const ingredients = rawIngredients.map((ing) => normalizeRecipeIngredient(ing));

  const rawAvailable = Array.isArray(raw.availableIngredients) ? raw.availableIngredients : [];
  const availableIngredients = rawAvailable.map((ing) => normalizeRecipeIngredient(ing));

  const rawMissing = Array.isArray(raw.missingIngredients) ? raw.missingIngredients : [];
  const missingIngredients = rawMissing.map((ing) => normalizeRecipeMissingIngredient(ing));

  const steps = Array.isArray(raw.steps)
    ? raw.steps.map((s) => String(s).trim()).filter(Boolean)
    : [];

  const totalMinutes = typeof raw.totalMinutes === 'number' && raw.totalMinutes > 0
    ? Math.round(raw.totalMinutes)
    : 30;

  const estimatedMissingCost = typeof raw.estimatedMissingCost === 'number' && raw.estimatedMissingCost >= 0
    ? Math.round(raw.estimatedMissingCost)
    : 0;

  const budgetRemaining = typeof raw.budgetRemaining === 'number'
    ? Math.round(raw.budgetRemaining)
    : 0;

  const withinBudget = typeof raw.withinBudget === 'boolean'
    ? raw.withinBudget
    : budgetRemaining >= 0;

  return {
    id: slug,
    name: safeName,
    description: raw.description ? String(raw.description).trim() : '',
    totalMinutes,
    servings: defaultServings,
    ingredients,
    steps,
    availableIngredients,
    missingIngredients,
    estimatedMissingCost,
    budgetRemaining,
    withinBudget,
    convenience: raw.convenience ?? 'Óptima',
    reason: raw.reason ? String(raw.reason).trim() : '',
    isDemoFixture: false,
  };
}

// ==========================================
// 4. VALIDACIONES Y MAPEO DE DESPENSA A BACKEND
// ==========================================

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export function validateBudgetInput(value: unknown): ValidationResult {
  if (value === null || value === undefined || value === '') {
    return { isValid: false, error: 'Por favor ingresa un monto de presupuesto.' };
  }
  const num = typeof value === 'number' ? value : Number(String(value).trim().replace(/[.,\s]/g, ''));
  if (isNaN(num) || !isFinite(num)) {
    return { isValid: false, error: 'Por favor ingresa un número válido para el presupuesto.' };
  }
  if (num < 0) {
    return { isValid: false, error: 'El presupuesto no puede ser un valor negativo.' };
  }
  if (num > 100000000) {
    return { isValid: false, error: 'El presupuesto supera el monto razonable permitido.' };
  }
  return { isValid: true };
}

export function validateServingsInput(value: unknown): ValidationResult {
  if (value === null || value === undefined || value === '') {
    return { isValid: false, error: 'Por favor indica el número de personas.' };
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num) || !Number.isInteger(num)) {
    return { isValid: false, error: 'El número de personas debe ser un entero.' };
  }
  if (num < 1 || num > 12) {
    return { isValid: false, error: 'El número de personas debe estar entre 1 y 12.' };
  }
  return { isValid: true };
}

export function validateMaxMinutesInput(value: unknown): ValidationResult {
  if (value === undefined || value === null || value === '') {
    return { isValid: true };
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num) || !Number.isInteger(num)) {
    return { isValid: false, error: 'El tiempo máximo debe ser un número entero en minutos.' };
  }
  if (num <= 0 || num > 240) {
    return { isValid: false, error: 'El tiempo máximo debe estar entre 1 y 240 minutos.' };
  }
  return { isValid: true };
}

/**
 * Mapea los ingredientes de la despensa de FoodAI al payload que requiere el endpoint backend.
 */
export function mapPantryToRecommendRequest(
  pantryItems: { name: string; quantity: number | null; unit: string }[],
  budget: number,
  servings: number = 2,
  maxMinutes?: number
): RecommendRecipesRequest {
  const budgetValidation = validateBudgetInput(budget);
  if (!budgetValidation.isValid) {
    throw new Error(budgetValidation.error);
  }
  const servingsValidation = validateServingsInput(servings);
  if (!servingsValidation.isValid) {
    throw new Error(servingsValidation.error);
  }
  if (maxMinutes !== undefined) {
    const maxMinutesValidation = validateMaxMinutesInput(maxMinutes);
    if (!maxMinutesValidation.isValid) {
      throw new Error(maxMinutesValidation.error);
    }
  }

  const pantry: BackendPantryItem[] = (pantryItems || []).map((item) => ({
    name: item.name.trim(),
    quantity: typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : null,
    unit: item.unit ? item.unit.trim() : 'unidad',
    needsReview: false,
  }));

  const payload: RecommendRecipesRequest = {
    pantry,
    budget: Math.round(budget),
    servings: Math.round(servings),
  };

  if (maxMinutes !== undefined && maxMinutes !== null) {
    payload.maxMinutes = Math.round(maxMinutes);
  }

  return payload;
}
