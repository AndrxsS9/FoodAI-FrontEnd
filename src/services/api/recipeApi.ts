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
  DEFAULT_API_TIMEOUT_MS,
  buildApiUrl,
} from './apiConfig';
import {
  BackendRecipe,
  RecommendRecipesRequest,
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
 * Realiza la llamada HTTP a POST /api/recipes/recommend usando la API fetch nativa.
 */
export async function recommendRecipes(
  request: RecommendRecipesRequest,
  options?: RecipeApiOptions
): Promise<BackendRecipe[]> {
  // 1. Validar precondiciones del cliente para no consumir cuota innecesariamente
  validateClientRequest(request);

  // 2. Construir URL destino
  const targetUrl = buildApiUrl(API_ENDPOINTS.RECIPES_RECOMMEND, options?.baseUrl);

  // 3. Configurar timeout y controlador de cancelación
  const timeoutMs = options?.timeoutMs ?? DEFAULT_API_TIMEOUT_MS;
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
        'La solicitud fue cancelada antes de enviarse.',
        'REQUEST_ABORTED',
        0,
        undefined,
        false,
        true
      );
    }
    externalSignal.addEventListener('abort', onExternalAbort);
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

    clearTimeout(timer);

    // 4. Parsear JSON defensivamente
    let rawJson: unknown;
    try {
      rawJson = await response.json();
    } catch {
      throw new RecipeApiError(
        'El servidor respondió con un formato de datos no válido (no es JSON válido).',
        'MALFORMED_JSON',
        response.status
      );
    }

    const payload = rawJson as Record<string, unknown> | null;

    // 5. Manejo de respuesta exitosa
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
      if (!Array.isArray(dataObj.recipes)) {
        throw new RecipeApiError(
          'La respuesta del backend no contiene una colección válida de recetas.',
          'INVALID_RECIPES_ARRAY',
          response.status,
          rawJson
        );
      }

      return dataObj.recipes as BackendRecipe[];
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
    clearTimeout(timer);

    if (error instanceof RecipeApiError) {
      throw error;
    }

    // Detección de Abort / Timeout
    const isAbort =
      (error instanceof Error && error.name === 'AbortError') ||
      isTimedOut ||
      Boolean(externalSignal?.aborted);

    if (isAbort) {
      const isExternal = Boolean(externalSignal?.aborted);
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
        true
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
    clearTimeout(timer);

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
    clearTimeout(timer);
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : 'Error de conexión',
    };
  }
}

export const recipeApi = {
  recommendRecipes,
  checkBackendHealth,
};
