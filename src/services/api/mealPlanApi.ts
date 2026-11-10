/**
 * FoodAI - Cliente tipado para el API de Planes de Comida del Backend (Fase 3C).
 * Responsable de la comunicación segura con el endpoint:
 * POST /api/meal-plans/generate (AndrxsS9/FoodAI-Backend)
 *
 * Implementa:
 * 1. AbortController para control y cancelación de peticiones con soporte de señal externa.
 * 2. Tiempo de espera (timeout) configurable (por defecto 75 segundos).
 * 3. Validación y parseo seguro de respuestas JSON.
 * 4. Tipado estricto de errores de red, validación (400), rate limit (429) y servidor (500/502/503/504).
 * 5. Protección de privacidad (sin logging de datos personales ni secretos).
 * 6. Política anti-reintentos automáticos para no agotar cuota de Gemini.
 * 7. Validación rigurosa de contrato de 3 días con el backend.
 */

import {
  API_ENDPOINTS,
  DEFAULT_AI_MEAL_PLANS_TIMEOUT_MS,
  buildApiUrl,
  withNormalizedLocale,
} from './apiConfig';
import {
  ApiAuthError,
  SupabaseAuthClientLike,
  getSupabaseAuthHeaders,
  resolveHttpAuthError,
} from './authHeaders';
import {
  BackendMealPlanResponseData,
  MealPlanRequest,
  MealPlanValidationError,
  validateBackendMealPlanResponse,
} from '../../types/mealPlan';

export class MealPlanApiError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'UNKNOWN_API_ERROR',
    public readonly status: number = 0,
    public readonly details?: unknown,
    public readonly isNetworkError: boolean = false,
    public readonly isTimeout: boolean = false,
    public readonly isRateLimit: boolean = false,
    public readonly isValidationError: boolean = false,
    public readonly isAuthError: boolean = false
  ) {
    super(message);
    this.name = 'MealPlanApiError';
    Object.setPrototypeOf(this, MealPlanApiError.prototype);
  }
}

export interface MealPlanApiOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  baseUrl?: string;
  authClient?: SupabaseAuthClientLike;
}

/**
 * Valida defensivamente la estructura requerida antes de enviarla a la red.
 */
function validateClientRequest(request: MealPlanRequest): void {
  if (!request) {
    throw new MealPlanApiError(
      'La solicitud de plan de comidas no puede estar vacía.',
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
    throw new MealPlanApiError(
      'Debes tener al menos un ingrediente en la despensa para generar un plan de comidas.',
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
    throw new MealPlanApiError(
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
    throw new MealPlanApiError(
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
    throw new MealPlanApiError(
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

export async function generateMealPlan(
  request: MealPlanRequest,
  options?: MealPlanApiOptions
): Promise<BackendMealPlanResponseData> {
  // 1. Validar precondiciones del cliente
  validateClientRequest(request);

  // 2. Construir URL destino
  const targetUrl = buildApiUrl(API_ENDPOINTS.MEAL_PLANS_GENERATE, options?.baseUrl);

  // 3. Configurar timeout y controlador de cancelación
  const timeoutMs = options?.timeoutMs ?? DEFAULT_AI_MEAL_PLANS_TIMEOUT_MS;
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
      throw new MealPlanApiError(
        'La solicitud del plan de comidas fue cancelada.',
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
    const authHeaders = await getSupabaseAuthHeaders({
      authClient: options?.authClient,
      signal: controller.signal,
    });

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify(withNormalizedLocale(request)),
      signal: controller.signal,
    });

    // 4. Parsear JSON defensivamente manteniendo el timeout activo
    let rawJson: unknown;
    try {
      rawJson = await response.json();
    } catch (parseError) {
      const isInterrupted =
        controller.signal.aborted ||
        (parseError instanceof Error && parseError.name === 'AbortError') ||
        isTimedOut ||
        Boolean(externalSignal?.aborted);

      if (isInterrupted) {
        throw parseError;
      }

      if (response.status === 401) {
        const fallbackAuth = resolveHttpAuthError(401, null)!;
        throw new MealPlanApiError(
          fallbackAuth.message,
          fallbackAuth.code,
          fallbackAuth.status,
          undefined,
          false,
          false,
          false,
          false,
          fallbackAuth.isAuthError
        );
      }

      throw new MealPlanApiError(
        'El servidor respondió con un formato de datos no válido (no es JSON válido).',
        'MALFORMED_JSON',
        response.status,
        parseError
      );
    }

    const payload = rawJson as Record<string, unknown> | null;

    // 5. Manejo de respuesta exitosa con validación rigurosa de 3 días
    if (response.ok) {
      if (!payload || payload.success !== true || !payload.data || typeof payload.data !== 'object') {
        throw new MealPlanApiError(
          'La respuesta del servidor no tiene la estructura de datos exitosa esperada.',
          'INVALID_RESPONSE_SHAPE',
          response.status,
          rawJson
        );
      }

      try {
        return validateBackendMealPlanResponse(payload.data);
      } catch (validationError) {
        const msg =
          validationError instanceof MealPlanValidationError
            ? validationError.message
            : 'La estructura del plan de comidas no cumple con el contrato requerido.';

        throw new MealPlanApiError(
          msg,
          'INVALID_RESPONSE_SHAPE',
          response.status,
          payload.data
        );
      }
    }

    // 6. Manejo de respuestas de error HTTP del backend
    const errorEnvelope = payload?.error as { code?: string; message?: string; details?: unknown } | undefined;
    const errorCode = errorEnvelope?.code || `HTTP_${response.status}`;
    const serverMessage = errorEnvelope?.message;

    // Errores 401 y 503 de autenticación / verificación de sesión
    const authHttpError = resolveHttpAuthError(response.status, errorEnvelope);
    if (authHttpError) {
      throw new MealPlanApiError(
        authHttpError.message,
        authHttpError.code,
        authHttpError.status,
        undefined,
        false,
        false,
        false,
        false,
        authHttpError.isAuthError
      );
    }

    // Errores 400: Validación Zod del backend
    if (response.status === 400) {
      const detailsMsg =
        Array.isArray(errorEnvelope?.details) && errorEnvelope?.details.length > 0
          ? errorEnvelope.details
              .map((d: any) => `${d.field ? `${d.field}: ` : ''}${d.message || ''}`)
              .join(', ')
          : undefined;

      const finalMsg = serverMessage || detailsMsg || 'Los datos enviados para el plan no son válidos.';

      throw new MealPlanApiError(
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

    // Errores 429: Límite de tasa de Gemini
    if (response.status === 429) {
      throw new MealPlanApiError(
        serverMessage ||
          'Has superado el límite de solicitudes a la IA. Por favor, intenta de nuevo en unos momentos.',
        errorCode || 'GEMINI_RATE_LIMIT',
        429,
        undefined,
        false,
        false,
        true
      );
    }

    // Errores 502 específicos: INSUFFICIENT_RECIPES_FOR_PLAN o MEAL_PLAN_NOT_AVAILABLE
    if (response.status === 502) {
      const isInsufficient = errorCode === 'INSUFFICIENT_RECIPES_FOR_PLAN';
      const fallbackMsg = isInsufficient
        ? 'No se encontraron suficientes recetas viables para construir un plan completo de 3 días con tu despensa actual. Intenta agregando más ingredientes básicos.'
        : 'No fue posible combinar recetas para armar tu plan de 3 días con los parámetros seleccionados.';

      throw new MealPlanApiError(
        serverMessage || fallbackMsg,
        errorCode,
        502
      );
    }

    // Errores 503 / 504: Gemini indisponible o timeout en servidor
    if (response.status === 503 || response.status === 504) {
      const is504 = response.status === 504 || errorCode === 'GEMINI_TIMEOUT';
      const fallbackMsg = is504
        ? 'El servicio de IA tardó demasiado en responder en el servidor. Por favor, intenta nuevamente.'
        : 'El servicio de inteligencia artificial no está disponible temporalmente. Intenta más tarde.';

      throw new MealPlanApiError(
        serverMessage || fallbackMsg,
        errorCode || (is504 ? 'GEMINI_TIMEOUT' : 'GEMINI_UNAVAILABLE'),
        response.status
      );
    }

    // Otros errores 500+
    if (response.status >= 500) {
      throw new MealPlanApiError(
        serverMessage ||
          'Ocurrió un error en el servidor al generar el plan de comidas. Intenta nuevamente.',
        errorCode,
        response.status
      );
    }

    // Otros códigos de estado inesperados
    throw new MealPlanApiError(
      serverMessage || `El servidor respondió con código de estado HTTP ${response.status}.`,
      errorCode,
      response.status
    );
  } catch (error) {
    if (error instanceof MealPlanApiError) {
      throw error;
    }

    if (error instanceof ApiAuthError) {
      throw new MealPlanApiError(
        error.message,
        error.code,
        error.status,
        undefined,
        false,
        false,
        false,
        false,
        error.isAuthError
      );
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
        ? 'La solicitud del plan de comidas fue cancelada.'
        : `La generación del plan con IA excedió el tiempo límite de espera (${Math.round(
            timeoutMs / 1000
          )}s). Por favor, intenta de nuevo.`;

      throw new MealPlanApiError(
        msg,
        isExternal ? 'REQUEST_ABORTED' : 'REQUEST_TIMEOUT',
        0,
        undefined,
        false,
        isTimeout
      );
    }

    // Errores de red
    throw new MealPlanApiError(
      'No se pudo conectar con el servidor FoodAI. Verifica tu conexión de red o que el backend esté en ejecución.',
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

export const mealPlanApi = {
  generateMealPlan,
};
