/**
 * FoodAI - Cliente tipado para el API de Recetas del Backend (Fase 3A).
 * Responsable de la comunicación segura con el endpoint:
 * POST /api/recipes/recommend (AndrxsS9/FoodAI-Backend)
 *
 * Implementa:
 * 1. AbortController para control y cancelación de peticiones.
 * 2. Tiempo de espera (timeout) configurable.
 * 3. Validación y parseo seguro de respuestas JSON.
 * 4. Tipado estricto de errores de red, validación (400), rate limit (429) y servidor (500).
 * 5. Protección de privacidad (sin logging de datos personales ni secretos).
 * 6. Política anti-reintentos silenciosos que consuman cuota inesperada de Gemini.
 */

import {
  API_ENDPOINTS,
  DEFAULT_AI_RECIPES_TIMEOUT_MS,
  buildApiUrl,
} from './apiConfig';
import {
  BACKEND_RECIPE_UNITS,
  BackendRecipe,
  BackendRecipeIngredient,
  BackendRecipeUnit,
  RecommendRecipesRequest,
  StepDuration,
} from '../../types/recipe';

export class RecipeApiError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'UNKNOWN_API_ERROR',
    public readonly status: number = 0,
    public readonly details?: unknown,
    public readonly isNetworkError: boolean = false,
    public readonly isTimeout: boolean = false,
    public readonly isRateLimit: boolean = false,
    public readonly isValidationError: boolean = false
  ) {
    super(message);
    this.name = 'RecipeApiError';
    Object.setPrototypeOf(this, RecipeApiError.prototype);
  }
}

export interface RecipeApiOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  baseUrl?: string;
}

export interface HealthCheckResult {
  ok: boolean;
  status: number;
  data?: unknown;
  error?: string;
}

/**
 * Valida defensivamente la estructura requerida para la petición antes de enviarla al backend.
 */
function validateClientRequest(request: RecommendRecipesRequest): void {
  if (!request) {
    throw new RecipeApiError(
      'La solicitud de recetas no puede estar vacía.',
      'VALIDATION_ERROR',
      400,
      undefined,
      false,
      false,
      false,
      true
    );
  }

  if (!Array.isArray(request.pantry) || request.pantry.length === 0) {
    throw new RecipeApiError(
      'Debes tener al menos un ingrediente en la despensa para generar recetas.',
      'EMPTY_PANTRY',
      400,
      undefined,
      false,
      false,
      false,
      true
    );
  }

  if (typeof request.budget !== 'number' || isNaN(request.budget) || request.budget < 0) {
    throw new RecipeApiError(
      'El presupuesto no puede ser un valor negativo.',
      'INVALID_BUDGET',
      400,
      undefined,
      false,
      false,
      false,
      true
    );
  }

  if (
    typeof request.servings !== 'number' ||
    !Number.isInteger(request.servings) ||
    request.servings < 1 ||
    request.servings > 12
  ) {
    throw new RecipeApiError(
      'El número de comensales debe ser un entero entre 1 y 12.',
      'INVALID_SERVINGS',
      400,
      undefined,
      false,
      false,
      false,
      true
    );
  }

  if (
    request.maxMinutes !== undefined &&
    request.maxMinutes !== null &&
    (typeof request.maxMinutes !== 'number' ||
      !Number.isInteger(request.maxMinutes) ||
      request.maxMinutes <= 0 ||
      request.maxMinutes > 240)
  ) {
    throw new RecipeApiError(
      'El tiempo máximo de preparación debe estar entre 1 y 240 minutos.',
      'INVALID_MAX_MINUTES',
      400,
      undefined,
      false,
      false,
      false,
      true
    );
  }
}

/**
 * Valida en tiempo de ejecución un ingrediente de receta según el contrato del backend.
 */
export function validateBackendIngredient(
  raw: unknown,
  recipeIndex: number,
  ingredientIndex: number,
  listType: 'ingredients' | 'availableIngredients' | 'missingIngredients'
): BackendRecipeIngredient {
  if (!raw || typeof raw !== 'object') {
    throw new RecipeApiError(
      `El ingrediente #${ingredientIndex + 1} de la receta #${recipeIndex + 1} (${listType}) es inválido o nulo.`,
      'INVALID_RESPONSE_SHAPE',
      200,
      raw
    );
  }

  const ing = raw as Record<string, unknown>;

  if (typeof ing.name !== 'string' || !ing.name.trim()) {
    throw new RecipeApiError(
      `El ingrediente #${ingredientIndex + 1} de la receta #${recipeIndex + 1} (${listType}) carece de un nombre válido.`,
      'INVALID_RESPONSE_SHAPE',
      200,
      raw
    );
  }

  if (
    ing.quantity !== null &&
    (typeof ing.quantity !== 'number' || !Number.isFinite(ing.quantity) || ing.quantity <= 0)
  ) {
    throw new RecipeApiError(
      `La cantidad del ingrediente "${ing.name}" en la receta #${recipeIndex + 1} debe ser un número positivo o null.`,
      'INVALID_RESPONSE_SHAPE',
      200,
      raw
    );
  }

  if (
    typeof ing.unit !== 'string' ||
    !BACKEND_RECIPE_UNITS.includes(ing.unit as any)
  ) {
    throw new RecipeApiError(
      `La unidad "${String(ing.unit)}" del ingrediente "${ing.name}" en la receta #${recipeIndex + 1} no está admitida por el backend.`,
      'INVALID_RESPONSE_SHAPE',
      200,
      raw
    );
  }

  if (
    ing.estimatedCost !== undefined &&
    ing.estimatedCost !== null &&
    (typeof ing.estimatedCost !== 'number' || !Number.isFinite(ing.estimatedCost) || ing.estimatedCost < 0)
  ) {
    throw new RecipeApiError(
      `El costo estimado del ingrediente "${ing.name}" en la receta #${recipeIndex + 1} debe ser un número finito no negativo.`,
      'INVALID_RESPONSE_SHAPE',
      200,
      raw
    );
  }

  return {
    name: ing.name.trim(),
    quantity: ing.quantity as number | null,
    unit: ing.unit as BackendRecipeUnit,
    estimatedCost:
      ing.estimatedCost !== undefined && ing.estimatedCost !== null
        ? Number(ing.estimatedCost)
        : undefined,
  };
}

/**
 * Valida exhaustivamente en tiempo de ejecución cada campo de una recomendación de receta.
 */
export function validateBackendRecipe(raw: unknown, index: number): BackendRecipe {
  if (!raw || typeof raw !== 'object') {
    throw new RecipeApiError(
      `La receta en la posición #${index + 1} es inválida o nula.`,
      'INVALID_RESPONSE_SHAPE',
      200,
      raw
    );
  }

  const r = raw as Record<string, unknown>;

  if (typeof r.name !== 'string' || !r.name.trim()) {
    throw new RecipeApiError(
      `La receta #${index + 1} carece de un nombre válido.`,
      'INVALID_RESPONSE_SHAPE',
      200,
      raw
    );
  }

  if (typeof r.description !== 'string' || !r.description.trim()) {
    throw new RecipeApiError(
      `La receta "${r.name}" carece de una descripción válida.`,
      'INVALID_RESPONSE_SHAPE',
      200,
      raw
    );
  }

  if (
    typeof r.totalMinutes !== 'number' ||
    !Number.isInteger(r.totalMinutes) ||
    r.totalMinutes <= 0
  ) {
    throw new RecipeApiError(
      `El tiempo total de la receta "${r.name}" debe ser un entero positivo en minutos.`,
      'INVALID_RESPONSE_SHAPE',
      200,
      raw
    );
  }

  let prepMinutes: number | undefined;
  if (r.prepMinutes !== undefined && r.prepMinutes !== null) {
    if (
      typeof r.prepMinutes !== 'number' ||
      !Number.isFinite(r.prepMinutes) ||
      r.prepMinutes < 0
    ) {
      throw new RecipeApiError(
        `El tiempo de preparación (prepMinutes) de la receta "${r.name}" debe ser un número finito no negativo.`,
        'INVALID_RESPONSE_SHAPE',
        200,
        raw
      );
    }
    prepMinutes = Math.round(r.prepMinutes);
  }

  let cookMinutes: number | undefined;
  if (r.cookMinutes !== undefined && r.cookMinutes !== null) {
    if (
      typeof r.cookMinutes !== 'number' ||
      !Number.isFinite(r.cookMinutes) ||
      r.cookMinutes < 0
    ) {
      throw new RecipeApiError(
        `El tiempo de cocción (cookMinutes) de la receta "${r.name}" debe ser un número finito no negativo.`,
        'INVALID_RESPONSE_SHAPE',
        200,
        raw
      );
    }
    cookMinutes = Math.round(r.cookMinutes);
  }

  let stepDurations: StepDuration[] | undefined;
  if (r.stepDurations !== undefined && r.stepDurations !== null) {
    if (!Array.isArray(r.stepDurations)) {
      throw new RecipeApiError(
        `La propiedad stepDurations de la receta "${r.name}" debe ser un arreglo.`,
        'INVALID_RESPONSE_SHAPE',
        200,
        raw
      );
    }
    stepDurations = r.stepDurations.map((sd, sIdx) => {
      if (!sd || typeof sd !== 'object') {
        throw new RecipeApiError(
          `El elemento #${sIdx + 1} de stepDurations en la receta "${r.name}" es inválido.`,
          'INVALID_RESPONSE_SHAPE',
          200,
          raw
        );
      }
      const sdObj = sd as Record<string, unknown>;
      if (
        typeof sdObj.stepIndex !== 'number' ||
        !Number.isInteger(sdObj.stepIndex) ||
        sdObj.stepIndex < 0
      ) {
        throw new RecipeApiError(
          `stepIndex en stepDurations de la receta "${r.name}" debe ser un entero no negativo.`,
          'INVALID_RESPONSE_SHAPE',
          200,
          raw
        );
      }
      let minutes: number | undefined;
      if (sdObj.minutes !== undefined && sdObj.minutes !== null) {
        if (
          typeof sdObj.minutes !== 'number' ||
          !Number.isFinite(sdObj.minutes) ||
          sdObj.minutes < 0
        ) {
          throw new RecipeApiError(
            `minutes en stepDurations de la receta "${r.name}" debe ser un número finito no negativo.`,
            'INVALID_RESPONSE_SHAPE',
            200,
            raw
          );
        }
        minutes = Math.round(sdObj.minutes);
      }
      const action =
        typeof sdObj.action === 'string' && sdObj.action.trim()
          ? sdObj.action.trim()
          : undefined;

      return {
        stepIndex: sdObj.stepIndex,
        ...(minutes !== undefined ? { minutes } : {}),
        ...(action !== undefined ? { action } : {}),
      };
    });
  }

  if (!Array.isArray(r.ingredients) || r.ingredients.length === 0) {
    throw new RecipeApiError(
      `La receta "${r.name}" debe contener al menos un ingrediente.`,
      'INVALID_RESPONSE_SHAPE',
      200,
      raw
    );
  }

  const ingredients = r.ingredients.map((ing, i) =>
    validateBackendIngredient(ing, index, i, 'ingredients')
  );

  if (
    !Array.isArray(r.steps) ||
    r.steps.length === 0 ||
    !r.steps.every((s) => typeof s === 'string' && s.trim().length > 0)
  ) {
    throw new RecipeApiError(
      `La receta "${r.name}" debe contener al menos un paso de preparación válido.`,
      'INVALID_RESPONSE_SHAPE',
      200,
      raw
    );
  }

  if (!Array.isArray(r.availableIngredients)) {
    throw new RecipeApiError(
      `La receta "${r.name}" debe contener un arreglo de ingredientes disponibles.`,
      'INVALID_RESPONSE_SHAPE',
      200,
      raw
    );
  }
  const availableIngredients = r.availableIngredients.map((ing, i) =>
    validateBackendIngredient(ing, index, i, 'availableIngredients')
  );

  if (!Array.isArray(r.missingIngredients)) {
    throw new RecipeApiError(
      `La receta "${r.name}" debe contener un arreglo de ingredientes faltantes.`,
      'INVALID_RESPONSE_SHAPE',
      200,
      raw
    );
  }
  const missingIngredients = r.missingIngredients.map((ing, i) =>
    validateBackendIngredient(ing, index, i, 'missingIngredients')
  );

  if (
    typeof r.estimatedMissingCost !== 'number' ||
    !Number.isFinite(r.estimatedMissingCost) ||
    r.estimatedMissingCost < 0
  ) {
    throw new RecipeApiError(
      `El costo adicional estimado de la receta "${r.name}" debe ser un número finito no negativo.`,
      'INVALID_RESPONSE_SHAPE',
      200,
      raw
    );
  }

  if (typeof r.budgetRemaining !== 'number' || !Number.isFinite(r.budgetRemaining)) {
    throw new RecipeApiError(
      `El presupuesto restante de la receta "${r.name}" debe ser un número finito.`,
      'INVALID_RESPONSE_SHAPE',
      200,
      raw
    );
  }

  if (typeof r.withinBudget !== 'boolean') {
    throw new RecipeApiError(
      `El indicador dentro de presupuesto (withinBudget) de la receta "${r.name}" debe ser un valor booleano.`,
      'INVALID_RESPONSE_SHAPE',
      200,
      raw
    );
  }

  if (
    typeof r.convenience !== 'number' ||
    !Number.isFinite(r.convenience) ||
    r.convenience < 0 ||
    r.convenience > 100
  ) {
    throw new RecipeApiError(
      `El índice de conveniencia de la receta "${r.name}" debe ser un número entre 0 y 100.`,
      'INVALID_RESPONSE_SHAPE',
      200,
      raw
    );
  }

  if (typeof r.reason !== 'string' || !r.reason.trim()) {
    throw new RecipeApiError(
      `La receta "${r.name}" carece de una razón de conveniencia válida.`,
      'INVALID_RESPONSE_SHAPE',
      200,
      raw
    );
  }

  return {
    name: r.name.trim(),
    description: r.description.trim(),
    totalMinutes: r.totalMinutes,
    ...(prepMinutes !== undefined ? { prepMinutes } : {}),
    ...(cookMinutes !== undefined ? { cookMinutes } : {}),
    ...(stepDurations !== undefined ? { stepDurations } : {}),
    ingredients,
    steps: r.steps.map((s) => (s as string).trim()),
    availableIngredients,
    missingIngredients,
    estimatedMissingCost: r.estimatedMissingCost,
    budgetRemaining: r.budgetRemaining,
    withinBudget: r.withinBudget,
    convenience: r.convenience,
    reason: r.reason.trim(),
  };
}

/**
 * Valida una colección completa de recetas del backend asegurando que cada una cumpla el contrato.
 * Preserva colecciones vacías válidas si el backend no encontró recetas.
 */
export function validateBackendRecipes(rawArray: unknown): BackendRecipe[] {
  if (!Array.isArray(rawArray)) {
    throw new RecipeApiError(
      'La respuesta del backend no contiene una colección válida de recetas.',
      'INVALID_RECIPES_ARRAY',
      200,
      rawArray
    );
  }

  return rawArray.map((item, idx) => validateBackendRecipe(item, idx));
}

export async function recommendRecipes(
  request: RecommendRecipesRequest,
  options?: RecipeApiOptions
): Promise<BackendRecipe[]> {
  // 1. Validar precondiciones del cliente para no consumir cuota innecesariamente
  validateClientRequest(request);

  // 2. Construir URL destino
  const targetUrl = buildApiUrl(API_ENDPOINTS.RECIPES_RECOMMEND, options?.baseUrl);

  // 3. Configurar timeout y controlador de cancelación
  const timeoutMs = options?.timeoutMs ?? DEFAULT_AI_RECIPES_TIMEOUT_MS;
  const controller = new AbortController();
  let isTimedOut = false;

  const timer = setTimeout(() => {
    isTimedOut = true;
    controller.abort();
  }, timeoutMs);

  // Conectar con señal externa si fue provista
  const externalSignal = options?.signal;
  const onExternalAbort = () => {
    controller.abort();
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timer);
      throw new RecipeApiError(
        'La solicitud de recetas fue cancelada.',
        'REQUEST_ABORTED',
        0,
        undefined,
        false,
        false
      );
    }
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    // 4. Parsear JSON defensivamente manteniendo el timeout activo durante la lectura del cuerpo
    let rawJson: unknown;
    try {
      rawJson = await response.json();
    } catch (parseError) {
      // Si la lectura del cuerpo fue interrumpida por timeout o cancelación externa,
      // no clasificar como MALFORMED_JSON sino propagar para clasificación exacta
      const isInterrupted =
        controller.signal.aborted ||
        (parseError instanceof Error && parseError.name === 'AbortError') ||
        isTimedOut ||
        Boolean(externalSignal?.aborted);

      if (isInterrupted) {
        throw parseError;
      }

      throw new RecipeApiError(
        'El servidor respondió con un formato de datos no válido (no es JSON válido).',
        'MALFORMED_JSON',
        response.status,
        parseError
      );
    }

    const payload = rawJson as Record<string, unknown> | null;

    // 5. Manejo de respuesta exitosa con validación estricta de cada receta
    if (response.ok) {
      if (!payload || payload.success !== true || !payload.data || typeof payload.data !== 'object') {
        throw new RecipeApiError(
          'La respuesta del servidor no tiene la estructura de datos exitosa esperada.',
          'INVALID_RESPONSE_SHAPE',
          response.status,
          rawJson
        );
      }

      const dataObj = payload.data as { recipes?: unknown };
      return validateBackendRecipes(dataObj.recipes);
    }

    // 6. Manejo de respuestas de error HTTP del backend
    const errorEnvelope = payload?.error as { code?: string; message?: string; details?: unknown } | undefined;
    const errorCode = errorEnvelope?.code || `HTTP_${response.status}`;
    const serverMessage = errorEnvelope?.message;

    // Errores 400: Validación Zod del backend
    if (response.status === 400) {
      const detailsMsg =
        Array.isArray(errorEnvelope?.details) && errorEnvelope?.details.length > 0
          ? errorEnvelope.details
              .map((d: any) => `${d.field ? `${d.field}: ` : ''}${d.message || ''}`)
              .join(', ')
          : undefined;

      const finalMsg = serverMessage || detailsMsg || 'Los datos enviados no son válidos.';

      throw new RecipeApiError(
        finalMsg,
        errorCode,
        400,
        errorEnvelope?.details,
        false,
        false,
        false,
        true
      );
    }

    // Errores 429: Límite de tasa de IA excedido
    if (response.status === 429) {
      throw new RecipeApiError(
        serverMessage ||
          'Has superado el límite de solicitudes a la IA. Por favor, intenta de nuevo más tarde.',
        'RATE_LIMIT_EXCEEDED',
        429,
        undefined,
        false,
        false,
        true
      );
    }

    // Errores 500, 502, 503, 504: Servidor o Gemini
    if (response.status >= 500) {
      throw new RecipeApiError(
        serverMessage ||
          'Ocurrió un error en el servidor o el servicio de IA no respondió a tiempo. Intenta nuevamente.',
        errorCode,
        response.status
      );
    }

    // Otros errores HTTP no contemplados
    throw new RecipeApiError(
      serverMessage || `El servidor respondió con código de estado HTTP ${response.status}.`,
      errorCode,
      response.status
    );
  } catch (error) {
    if (error instanceof RecipeApiError) {
      throw error;
    }

    // Detección de Abort / Timeout
    const isExternal = Boolean(externalSignal?.aborted);
    const isTimeout = isTimedOut && !isExternal;
    const isAbort =
      (error instanceof Error && error.name === 'AbortError') ||
      isTimedOut ||
      isExternal ||
      controller.signal.aborted;

    if (isAbort) {
      const msg = isExternal
        ? 'La solicitud de recetas fue cancelada.'
        : `La solicitud a la IA excedió el tiempo límite de espera (${Math.round(
            timeoutMs / 1000
          )}s). Verifica tu conexión o intenta nuevamente.`;

      throw new RecipeApiError(
        msg,
        isExternal ? 'REQUEST_ABORTED' : 'REQUEST_TIMEOUT',
        0,
        undefined,
        false,
        isTimeout
      );
    }

    // Errores de conectividad o red (TypeError / Network request failed)
    throw new RecipeApiError(
      'No se pudo conectar con el servidor FoodAI. Verifica que el backend esté ejecutándose y que la URL esté configurada correctamente.',
      'NETWORK_ERROR',
      0,
      undefined,
      true
    );
  } finally {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

/**
 * Realiza una comprobación de salud del backend llamando a GET /api/health.
 * Útil para pruebas de conectividad y diagnósticos en el cliente.
 */
export async function checkBackendHealth(baseUrl?: string): Promise<HealthCheckResult> {
  const targetUrl = buildApiUrl(API_ENDPOINTS.HEALTH, baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      // noop
    }

    return {
      ok: res.ok,
      status: res.status,
      data,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : 'Error de conexión',
    };
  } finally {
    clearTimeout(timer);
  }
}

export const recipeApi = {
  recommendRecipes,
  checkBackendHealth,
};
