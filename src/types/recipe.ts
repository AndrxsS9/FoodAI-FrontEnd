import type { ImageSourcePropType } from 'react-native';

/**
 * FoodAI - Modelos, contratos de API y tipos del dominio de recetas (Fase 2C).
 * Alineado estrictamente con el esquema del backend: POST /api/recipes/recommend
 * y los esquemas Zod en AndrxsS9/FoodAI-Backend:
 * - ingredientSchema (src/schemas/ingredient.schema.ts)
 * - recipeRecommendationRequestSchema & recommendedRecipeSchema (src/schemas/recipe.schema.ts)
 */

// ==========================================
// 1. CONTRATOS DEL BACKEND (POST /api/recipes/recommend)
// ==========================================

/**
 * Unidades admitidas por el validador del backend para la despensa (ingredientSchema.unit).
 * El backend solo acepta: 'unidad' | 'g' | 'kg' | 'ml' | 'l' | 'desconocida'
 */
export const BACKEND_PANTRY_UNITS = [
  'unidad',
  'g',
  'kg',
  'ml',
  'l',
  'desconocida',
] as const;

export type BackendPantryUnit = (typeof BACKEND_PANTRY_UNITS)[number];

/**
 * Representación de un ítem de despensa enviado al backend.
 * `needsReview` es OBLIGATORIO en el esquema del backend.
 */
export interface BackendPantryItem {
  name: string;
  quantity: number | null;
  unit: BackendPantryUnit;
  needsReview: boolean;
}

export interface RecommendRecipesRequest {
  pantry: BackendPantryItem[];
  budget: number; // Número no negativo en COP
  servings: number; // Entero de 1 a 12
  maxMinutes?: number; // Opcional, entero positivo hasta 240
}

/**
 * Unidades de recetas generadas por el backend (recipeIngredientSchema.unit).
 */
export const BACKEND_RECIPE_UNITS = [
  'unidad',
  'g',
  'kg',
  'ml',
  'l',
  'cucharada',
  'cucharadita',
  'taza',
  'desconocida',
] as const;

export type BackendRecipeUnit = (typeof BACKEND_RECIPE_UNITS)[number];

export interface StepDuration {
  stepIndex: number;
  minutes?: number;
  action?: string;
}

export interface BackendRecipeIngredient {
  name: string;
  quantity: number | null;
  unit: BackendRecipeUnit | string;
  estimatedCost?: number;
}

/**
 * Receta recomendada por el backend según recommendedRecipeSchema.
 * Notar: convenience es numérico (0 a 100).
 * availableIngredients y missingIngredients son arreglos estructurados de BackendRecipeIngredient.
 */
export interface BackendRecipe {
  name: string;
  description: string;
  totalMinutes: number;
  prepMinutes?: number;
  cookMinutes?: number;
  stepDurations?: StepDuration[];
  ingredients: BackendRecipeIngredient[];
  steps: string[];
  availableIngredients: BackendRecipeIngredient[];
  missingIngredients: BackendRecipeIngredient[];
  estimatedMissingCost: number;
  budgetRemaining: number; // Puede ser negativo si excede el presupuesto
  withinBudget: boolean;
  convenience: number; // 0 a 100
  reason: string;
  imageUrl?: string;
}

export interface BackendSuccessEnvelope<T> {
  success: true;
  data: T;
}

export interface BackendErrorDetails {
  code: string;
  message: string;
  details?: unknown;
}

export interface BackendErrorEnvelope {
  success: false;
  error: BackendErrorDetails;
}

export type BackendApiResponse<T> = BackendSuccessEnvelope<T> | BackendErrorEnvelope;

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

/**
 * Modelo de presentación en cliente.
 * Separa explícitamente los campos del contrato del backend de los metadatos de UI.
 */
export interface ClientRecipe {
  /** Identificador único cliente estable (slug o ID de fixture) */
  id: string;
  name: string;
  description: string;
  totalMinutes: number;
  prepMinutes?: number;
  cookMinutes?: number;
  stepDurations?: StepDuration[];
  servings: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  availableIngredients: RecipeIngredient[];
  missingIngredients: RecipeMissingIngredient[];
  estimatedMissingCost: number;
  budgetRemaining: number;
  withinBudget: boolean;
  /** En el cliente se formatea amigablemente (ej: "94% conveniente" o 94) */
  convenience: string | number;
  reason: string;
  /** Bandera explícita que distingue datos demostrativos de recomendaciones reales de IA */
  isDemoFixture: boolean;
  /** Identificador de preparación/instancia para distinguir preparaciones legítimas entre generaciones */
  instanceId?: string;
  generationId?: string;
  /** Imagen opcional de UI */
  imageUrl?: ImageSourcePropType | string | null;
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
 * Soporta de manera precisa valores negativos (ej: -5000 -> "-$5.000 COP").
 */
export function formatCopCurrency(amount: number, withSuffix: boolean = true): string {
  if (!Number.isFinite(amount) || isNaN(amount)) {
    return withSuffix ? '$0 COP' : '$0';
  }
  const isNegative = amount < 0;
  const absAmount = Math.abs(Math.round(amount));
  const formatted = absAmount.toLocaleString('es-CO');
  const sign = isNegative ? '-' : '';
  return withSuffix ? `${sign}$${formatted} COP` : `${sign}$${formatted}`;
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

  const displayQty = Number.isInteger(quantity)
    ? quantity.toString()
    : quantity.toLocaleString('es-CO', { maximumFractionDigits: 2 });

  if (!safeUnit || safeUnit.toLowerCase() === 'desconocida' || safeUnit.toLowerCase() === 's/u') {
    return displayQty;
  }

  return `${displayQty} ${safeUnit}`;
}

/**
 * Valida si una URL remota de imagen es segura.
 *
 * POLÍTICA DE SEGURIDAD ESTRICTA (Producción):
 * - Enforce HTTPS (https://): todas las imágenes remotas deben provenir de orígenes cifrados TLS
 *   con un hostname válido y estructura de URL correcta según el estándar WHATWG.
 * - Rechaza URLs malformadas, sin host, con triple barra o sin dominio válido.
 * - Rechaza HTTP inseguro (http://) para mitigar riesgos de Cleartext Traffic y MitM.
 * - Excepción de desarrollo: en entorno local de pruebas (__DEV__), se permite loopback local estricto
 *   (localhost / 127.0.0.1 / 10.0.2.2 en emulador Android / ::1), sin admitir hosts .local arbitrarios.
 */
export function isSecureRemoteImageUrl(url: unknown): boolean {
  if (typeof url !== 'string') {
    return false;
  }
  const trimmed = url.trim();
  if (!trimmed) {
    return false;
  }

  // Rechazar esquemas malformados con triple barra o caracteres de control
  if (trimmed.startsWith('https:///') || trimmed.startsWith('http:///')) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    const hostname = parsed.hostname.toLowerCase();

    if (!hostname || hostname.length === 0) {
      return false;
    }

    // 1. HTTPS estricto para producción
    if (protocol === 'https:') {
      // El host debe tener estructura válida (dominio con punto o localhost en TLS),
      // sin puntos dobles o caracteres ilegales
      const isValidRemoteHost =
        (hostname.includes('.') || hostname === 'localhost') &&
        !hostname.startsWith('.') &&
        !hostname.endsWith('.') &&
        !hostname.includes('..') &&
        /^[a-z0-9.-]+$/.test(hostname);

      return isValidRemoteHost;
    }

    // 2. HTTP inseguro en desarrollo únicamente para loopback local estricto
    if (typeof __DEV__ !== 'undefined' && __DEV__ && protocol === 'http:') {
      const isLoopback =
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '10.0.2.2' ||
        hostname === '::1' ||
        hostname === '[::1]';

      return isLoopback;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Normaliza un ingrediente recibido del backend.
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
    quantity:
      typeof item?.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0
        ? item.quantity
        : null,
    unit: item?.unit ? String(item.unit).trim() : '',
  };
}

/**
 * Normaliza un ingrediente faltante recibido del backend.
 */
export function normalizeRecipeMissingIngredient(
  item: BackendRecipeIngredient | string
): RecipeMissingIngredient {
  const base = normalizeRecipeIngredient(item);
  const rawCost =
    typeof item === 'object' && item !== null && 'estimatedCost' in item
      ? item.estimatedCost
      : undefined;

  return {
    ...base,
    estimatedCost: typeof rawCost === 'number' && Number.isFinite(rawCost) && rawCost >= 0
      ? Math.round(rawCost)
      : undefined,
  };
}

/**
 * Convierte una receta del backend a un modelo seguro de presentación del cliente (ClientRecipe).
 */
export function normalizeBackendRecipe(
  raw: BackendRecipe,
  index: number = 0,
  defaultServings: number = 2,
  generationId?: string
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

  const totalMinutes =
    typeof raw.totalMinutes === 'number' && raw.totalMinutes > 0
      ? Math.round(raw.totalMinutes)
      : 30;

  const prepMinutes =
    typeof raw.prepMinutes === 'number' && Number.isFinite(raw.prepMinutes) && raw.prepMinutes >= 0
      ? Math.round(raw.prepMinutes)
      : undefined;

  const cookMinutes =
    typeof raw.cookMinutes === 'number' && Number.isFinite(raw.cookMinutes) && raw.cookMinutes >= 0
      ? Math.round(raw.cookMinutes)
      : undefined;

  const stepDurations: StepDuration[] | undefined = Array.isArray(raw.stepDurations)
    ? raw.stepDurations
        .filter((sd) => sd && typeof sd === 'object' && typeof (sd as any).stepIndex === 'number')
        .map((sd) => ({
          stepIndex: sd.stepIndex,
          ...(typeof sd.minutes === 'number' && Number.isFinite(sd.minutes) && sd.minutes >= 0
            ? { minutes: Math.round(sd.minutes) }
            : {}),
          ...(typeof sd.action === 'string' && sd.action.trim() ? { action: sd.action.trim() } : {}),
        }))
    : undefined;

  const estimatedMissingCost =
    typeof raw.estimatedMissingCost === 'number' && raw.estimatedMissingCost >= 0
      ? Math.round(raw.estimatedMissingCost)
      : 0;

  const budgetRemaining =
    typeof raw.budgetRemaining === 'number' && Number.isFinite(raw.budgetRemaining)
      ? Math.round(raw.budgetRemaining)
      : 0;

  const withinBudget =
    typeof raw.withinBudget === 'boolean'
      ? raw.withinBudget
      : budgetRemaining >= 0;

  // Si convenience es un número (0-100), formatearlo como porcentaje amigable
  let convenienceDisplay: string | number = 'Óptima';
  if (typeof raw.convenience === 'number') {
    convenienceDisplay = `${Math.round(raw.convenience)}% conveniente`;
  } else if (raw.convenience) {
    convenienceDisplay = String(raw.convenience);
  }

  const rawImageUrl = (raw as any).imageUrl;
  const safeImageUrl: string | undefined =
    typeof rawImageUrl === 'string' && isSecureRemoteImageUrl(rawImageUrl)
      ? rawImageUrl.trim()
      : undefined;

  return {
    id: slug,
    instanceId: generationId ? `${slug}::${generationId}` : slug,
    generationId,
    name: safeName,
    description: raw.description ? String(raw.description).trim() : '',
    totalMinutes,
    prepMinutes,
    cookMinutes,
    stepDurations,
    servings: defaultServings,
    ingredients,
    steps,
    availableIngredients,
    missingIngredients,
    estimatedMissingCost,
    budgetRemaining,
    withinBudget,
    convenience: convenienceDisplay,
    reason: raw.reason ? String(raw.reason).trim() : '',
    imageUrl: safeImageUrl,
    isDemoFixture: false,
  };
}

/**
 * Extrae la clave autoritativa para el control de deducciones e idempotencia.
 * Prioriza instanceId (ligado a la generación/instancia) sobre el id estático (slug).
 */
export function getRecipeDeductionKey(recipe: { id: string; instanceId?: string }): string {
  return (recipe.instanceId || recipe.id).trim().toLowerCase();
}
// ==========================================
// 4. MAPEO EXPLICITO Y SEGURO DE DESPENSA A BACKEND
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

export interface FrontendPantryItemInput {
  name: string;
  quantity?: number | null;
  unit?: string;
  needsReview?: boolean;
}

/**
 * Mapea una unidad del frontend a las admitidas por el backend:
 * 'unidad' | 'g' | 'kg' | 'ml' | 'l' | 'desconocida'.
 *
 * REGLA ESTRICTA DE INTEGRIDAD:
 * Para unidades culinarias no soportadas por el backend ('taza', 'cucharada', 'cucharadita'),
 * NUNCA se asume 1 taza = 1 unidad ni se inventa una conversión arbitraria de densidad.
 * Se representan como 'desconocida', con cantidad nula y needsReview: true.
 */
export function mapFrontendPantryItemToBackend(
  item: FrontendPantryItemInput
): BackendPantryItem {
  const safeName = item?.name ? item.name.trim() : 'Ingrediente';
  const rawUnit = item?.unit ? item.unit.trim().toLowerCase() : '';
  const rawQuantity =
    typeof item?.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0
      ? item.quantity
      : null;

  switch (rawUnit) {
    case 'unidad':
    case 'g':
    case 'kg':
    case 'ml':
    case 'l':
      return {
        name: safeName,
        quantity: rawQuantity,
        unit: rawUnit as BackendPantryUnit,
        needsReview: item.needsReview ?? (rawQuantity === null),
      };

    case 'taza':
    case 'cucharada':
    case 'cucharadita':
    case 'desconocida':
    default:
      // Unidades no convertibles directamente sin densidad alimentaria
      return {
        name: safeName,
        quantity: null,
        unit: 'desconocida',
        needsReview: true,
      };
  }
}

/**
 * Mapea los ingredientes de la despensa de FoodAI al payload que requiere el endpoint backend.
 */
export function mapPantryToRecommendRequest(
  pantryItems: FrontendPantryItemInput[],
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
  if (maxMinutes !== undefined && maxMinutes !== null) {
    const maxMinutesValidation = validateMaxMinutesInput(maxMinutes);
    if (!maxMinutesValidation.isValid) {
      throw new Error(maxMinutesValidation.error);
    }
  }

  const pantry: BackendPantryItem[] = (pantryItems || []).map(mapFrontendPantryItemToBackend);

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
