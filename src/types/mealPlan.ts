/**
 * FoodAI - Modelos, contratos de API y tipos del dominio del Plan de Comidas de 3 Días (Fase 3C).
 * Alineado estrictamente con el backend: POST /api/meal-plans/generate
 * y los esquemas Zod en AndrxsS9/FoodAI-Backend:
 * - mealPlanRequestSchema, mealPlanDaySchema, mealPlanResponseSchema (src/schemas/mealPlan.schema.ts)
 * - recommendedRecipeSchema (src/schemas/recipe.schema.ts)
 */

import {
  BackendPantryItem,
  BackendRecipe,
  ClientRecipe,
  FrontendPantryItemInput,
  RecipeIngredient,
  RecipeMissingIngredient,
  generateRecipeSlug,
  mapFrontendPantryItemToBackend,
  normalizeBackendRecipe,
  validateBudgetInput,
  validateMaxMinutesInput,
  validateServingsInput,
} from './recipe';
import { normalizeIngredientName, stemSpanishWord } from '../utils/ingredientMapper';
import { validateBackendRecipe } from '../services/api/recipeApi';
import { ApiLocale, normalizeApiLocale } from '../services/api/apiConfig';

export type {
  ClientRecipe,
  BackendRecipe,
  RecipeIngredient,
  RecipeMissingIngredient,
};
export { generateRecipeSlug };

// ==========================================
// 1. CONTRATOS DEL BACKEND (POST /api/meal-plans/generate)
// ==========================================

export interface MealPlanRequest {
  pantry: BackendPantryItem[];
  budget: number; // Número no negativo en COP
  servings: number; // Entero de 1 a 12
  maxMinutes?: number; // Opcional, entero positivo hasta 240
  locale?: ApiLocale; // Opcional: idioma del contenido generado ('es' predeterminado en backend)
}

export interface BackendMealPlanDay {
  day: number; // 1, 2 o 3
  recipe: BackendRecipe;
}

export interface BackendMealPlanResponseData {
  days: BackendMealPlanDay[]; // Exactamente 3 días
  totalEstimatedMissingCost: number; // No negativo
  budgetRemaining: number; // Puede ser negativo si el plan excede el presupuesto
  withinBudget: boolean;
}

// ==========================================
// 2. MODELOS DE PRESENTACIÓN DEL CLIENTE
// ==========================================

export interface ClientMealPlanDay {
  day: number; // 1, 2 o 3
  recipe: ClientRecipe;
  isCompleted?: boolean;
  completedAt?: string | null;
}

export interface ClientMealPlan {
  id?: string;
  days: ClientMealPlanDay[];
  totalEstimatedMissingCost: number;
  budgetRemaining: number;
  withinBudget: boolean;
  uniqueMissingIngredients: RecipeMissingIngredient[];
  generatedAt?: string;
  completedDaysCount?: number;
}

export interface MealPlanGenerationSnapshot {
  pantryFingerprint: string;
  budget: number;
  servings: number;
  maxMinutes?: number;
  generatedAt: string;
}

// ==========================================
// 3. VALIDACIÓN EN TIEMPO DE EJECUCIÓN
// ==========================================

export class MealPlanValidationError extends Error {
  constructor(message: string, public readonly raw?: unknown) {
    super(message);
    this.name = 'MealPlanValidationError';
    Object.setPrototypeOf(this, MealPlanValidationError.prototype);
  }
}

/**
 * Valida un día individual del plan de comidas según el contrato del backend.
 */
export function validateBackendMealPlanDay(raw: unknown, expectedIndex: number): BackendMealPlanDay {
  if (!raw || typeof raw !== 'object') {
    throw new MealPlanValidationError(
      `El día en la posición #${expectedIndex + 1} del plan de comidas es inválido o nulo.`,
      raw
    );
  }

  const d = raw as Record<string, unknown>;

  if (
    typeof d.day !== 'number' ||
    !Number.isInteger(d.day) ||
    d.day < 1 ||
    d.day > 3
  ) {
    throw new MealPlanValidationError(
      `El identificador del día #${expectedIndex + 1} debe ser un entero entre 1 y 3.`,
      raw
    );
  }

  if (!d.recipe || typeof d.recipe !== 'object') {
    throw new MealPlanValidationError(
      `El día ${d.day} del plan no contiene un objeto de receta válido.`,
      raw
    );
  }

  const validatedRecipe = validateBackendRecipe(d.recipe, expectedIndex);

  return {
    day: d.day,
    recipe: validatedRecipe,
  };
}

/**
 * Valida exhaustivamente en tiempo de ejecución la respuesta completa de generación del plan.
 * Garantiza:
 * - Exactamente 3 días.
 * - Días con identificadores 1, 2 y 3.
 * - Objetos de recetas válidos según recommendedRecipeSchema.
 * - totalEstimatedMissingCost no negativo.
 * - budgetRemaining finito.
 * - withinBudget booleano.
 */
export function validateBackendMealPlanResponse(rawData: unknown): BackendMealPlanResponseData {
  if (!rawData || typeof rawData !== 'object') {
    throw new MealPlanValidationError(
      'La respuesta del servidor no contiene datos de plan de comidas válidos.',
      rawData
    );
  }

  const data = rawData as Record<string, unknown>;

  if (!Array.isArray(data.days)) {
    throw new MealPlanValidationError(
      'La propiedad "days" debe ser un arreglo con los días del plan de comidas.',
      rawData
    );
  }

  if (data.days.length !== 3) {
    throw new MealPlanValidationError(
      `El plan de comidas debe contener exactamente 3 días, pero se recibieron ${data.days.length}.`,
      rawData
    );
  }

  const validatedDays = data.days.map((dayItem, idx) =>
    validateBackendMealPlanDay(dayItem, idx)
  );

  // Verificar que contenga los días 1, 2 y 3 sin duplicados ni omisiones
  const dayNumbers = validatedDays.map((d) => d.day).sort((a, b) => a - b);
  if (dayNumbers[0] !== 1 || dayNumbers[1] !== 2 || dayNumbers[2] !== 3) {
    throw new MealPlanValidationError(
      'El plan de comidas debe incluir días correlativos del 1 al 3.',
      rawData
    );
  }

  if (
    typeof data.totalEstimatedMissingCost !== 'number' ||
    !Number.isFinite(data.totalEstimatedMissingCost) ||
    data.totalEstimatedMissingCost < 0
  ) {
    throw new MealPlanValidationError(
      'El costo total estimado de faltantes (totalEstimatedMissingCost) debe ser un número finito no negativo.',
      rawData
    );
  }

  if (
    typeof data.budgetRemaining !== 'number' ||
    !Number.isFinite(data.budgetRemaining)
  ) {
    throw new MealPlanValidationError(
      'El presupuesto restante (budgetRemaining) debe ser un número finito.',
      rawData
    );
  }

  if (typeof data.withinBudget !== 'boolean') {
    throw new MealPlanValidationError(
      'La propiedad withinBudget debe ser un valor booleano.',
      rawData
    );
  }

  return {
    days: validatedDays,
    totalEstimatedMissingCost: data.totalEstimatedMissingCost,
    budgetRemaining: data.budgetRemaining,
    withinBudget: data.withinBudget,
  };
}

// ==========================================
// 4. MAPEO Y NORMALIZACIÓN DEL DOMINIO
// ==========================================

/**
 * Deduplica cuidadosamente los ingredientes faltantes de las recetas del plan de 3 días.
 * Utiliza lematización y normalización en español para identificar alimentos equivalentes
 * (ej: "cebolla", "cebollas cabezonas" o "tomate" vs "tomates").
 *
 * NOTA DE DISEÑO HONESTO:
 * No inventa cantidades consolidadas ficticias entre días ya que el backend deduplica
 * principalmente por identidad y no calcula sumas complejas de unidades mixtas.
 */
export function deduplicateMissingIngredients(
  recipes: (BackendRecipe | ClientRecipe)[]
): RecipeMissingIngredient[] {
  const missingMap = new Map<string, RecipeMissingIngredient>();

  for (const recipe of recipes) {
    const missing = recipe.missingIngredients || [];
    for (const item of missing) {
      if (!item || !item.name) continue;

      const norm = normalizeIngredientName(item.name);
      const stemmed = norm
        .split(/\s+/)
        .map(stemSpanishWord)
        .join(' ');
      const identityKey = stemmed || norm;

      if (!missingMap.has(identityKey)) {
        missingMap.set(identityKey, {
          name: item.name.trim(),
          quantity: item.quantity,
          unit: item.unit || '',
          estimatedCost: item.estimatedCost,
        });
      }
    }
  }

  return Array.from(missingMap.values());
}

/**
 * Normaliza los datos validados del backend a la estructura de cliente.
 * Garantiza IDs estables y únicos para cada receta del plan:
 * `plan-dia-${day}-${slug}` para evitar cualquier colisión entre días o con recetas del catálogo.
 */
export function normalizeBackendMealPlan(
  raw: BackendMealPlanResponseData,
  servings: number = 2,
  options?: { planId?: string; generatedAt?: string }
): ClientMealPlan {
  const generatedAt = options?.generatedAt || new Date().toISOString();
  const planId = options?.planId || `plan_${Date.now()}`;

  const clientDays: ClientMealPlanDay[] = raw.days.map((dayItem, index) => {
    const rawRecipe = dayItem.recipe;
    const baseNormalized = normalizeBackendRecipe(rawRecipe, index, servings, planId);
    const baseSlug = generateRecipeSlug(baseNormalized.name, index) || `receta-dia-${dayItem.day}`;

    // ID explícito y único para la receta dentro del plan
    const uniquePlanRecipeId = `plan-dia-${dayItem.day}-${baseSlug}`;
    const instanceId = `${uniquePlanRecipeId}::${planId}`;

    const clientRecipe: ClientRecipe = {
      ...baseNormalized,
      id: uniquePlanRecipeId,
      instanceId,
      generationId: planId,
      servings,
    };

    return {
      day: dayItem.day,
      recipe: clientRecipe,
      isCompleted: false,
      completedAt: null,
    };
  });

  const uniqueMissing = deduplicateMissingIngredients(clientDays.map((d) => d.recipe));

  return {
    id: planId,
    days: clientDays,
    totalEstimatedMissingCost: Math.round(raw.totalEstimatedMissingCost),
    budgetRemaining: Math.round(raw.budgetRemaining),
    withinBudget: raw.withinBudget,
    uniqueMissingIngredients: uniqueMissing,
    completedDaysCount: 0,
    generatedAt,
  };
}

/**
 * Mapea los datos de despensa y presupuesto del frontend al payload de solicitud del plan de comidas.
 * Reutiliza las reglas estrictas de mapeo seguro:
 * - Unidades no admitidas se mapean a 'desconocida', cantidad null, needsReview: true.
 * - No inventa cantidades faltantes.
 * - Valida presupuesto >= 0, comensales 1..12, maxMinutes 1..240.
 */
export function mapPantryToMealPlanRequest(
  pantryItems: FrontendPantryItemInput[],
  budget: number,
  servings: number = 2,
  maxMinutes?: number,
  locale?: ApiLocale
): MealPlanRequest {
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

  const payload: MealPlanRequest = {
    pantry,
    budget: Math.round(budget),
    servings: Math.round(servings),
  };

  if (maxMinutes !== undefined && maxMinutes !== null) {
    payload.maxMinutes = Math.round(maxMinutes);
  }

  // El idioma solo se agrega si el llamador lo indica: los llamadores existentes conservan su payload
  const normalizedLocale = normalizeApiLocale(locale);
  if (normalizedLocale !== undefined) {
    payload.locale = normalizedLocale;
  }

  return payload;
}
