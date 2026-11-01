/**
 * FoodAI - Cliente tipado para el API de Análisis de Ingredientes por Imagen (Fase 3B).
 * Responsable de la comunicación segura con el endpoint:
 * POST /api/ingredients/analyze (AndrxsS9/FoodAI-Backend)
 *
 * Implementa:
 * 1. AbortController para control y cancelación de peticiones de escaneo.
 * 2. Tiempo de espera (timeout) configurable acorde a los reintentos internos de Gemini en backend.
 * 3. Validación y parseo estricto en tiempo de ejecución de cada ingrediente detectado.
 * 4. Tipado estricto de errores: red, validación (400), rate limit (429), timeouts y servidor (500-504).
 * 5. Protección de privacidad (sin logging de imágenes ni datos sensibles).
 * 6. Política anti-reintentos automáticos silenciosos para proteger la cuota de IA.
 */
import {
  API_ENDPOINTS,
  DEFAULT_AI_SCANNER_TIMEOUT_MS,
  buildApiUrl,
} from './apiConfig';
import {
  ApiAuthError,
  SupabaseAuthClientLike,
  getSupabaseAuthHeaders,
  resolveHttpAuthError,
} from './authHeaders';
import {
  BackendDetectedIngredient,
  BackendIngredientUnit,
  SelectedImage,
} from '../../types/scanner';
import { createAnalyzeFormData } from '../../utils/imageUtils';

export const ALLOWED_BACKEND_UNITS: BackendIngredientUnit[] = [
  'unidad',
  'g',
  'kg',
  'ml',
  'l',
  'desconocida',
];

export class ScannerApiError extends Error {
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
    this.name = 'ScannerApiError';
    Object.setPrototypeOf(this, ScannerApiError.prototype);
  }
}

export interface ScannerApiOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  baseUrl?: string;
  authClient?: SupabaseAuthClientLike;
}

/**
 * Valida en tiempo de ejecución un ingrediente detectado según el contrato de FoodAI-Backend.
 */
export function validateBackendDetectedIngredient(
  raw: unknown,
  index: number
): BackendDetectedIngredient {
  if (!raw || typeof raw !== 'object') {
    throw new ScannerApiError(
      `El ingrediente detectado #${index + 1} no tiene un formato válido.`,
      'INVALID_RESPONSE_SHAPE',
      200,
      raw
    );
  }

  const item = raw as Record<string, unknown>;

  if (typeof item.name !== 'string' || !item.name.trim()) {
    throw new ScannerApiError(
      `El ingrediente detectado #${index + 1} carece de un nombre válido.`,
      'INVALID_RESPONSE_SHAPE',
      200,
      raw
    );
  }

  if (
    item.quantity !== null &&
    (typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) || item.quantity <= 0)
  ) {
    throw new ScannerApiError(
      `La cantidad del ingrediente "${item.name}" debe ser un número positivo o null.`,
      'INVALID_RESPONSE_SHAPE',
      200,
      raw
    );
  }

  if (
    typeof item.unit !== 'string' ||
    !ALLOWED_BACKEND_UNITS.includes(item.unit as BackendIngredientUnit)
  ) {
    throw new ScannerApiError(
      `La unidad "${String(item.unit)}" del ingrediente "${item.name}" no está reconocida.`,
      'INVALID_RESPONSE_SHAPE',
      200,
      raw
    );
  }

  if (typeof item.needsReview !== 'boolean') {
    throw new ScannerApiError(
      `El indicador needsReview del ingrediente "${item.name}" debe ser booleano.`,
      'INVALID_RESPONSE_SHAPE',
      200,
      raw
    );
  }

  return {
    name: item.name.trim(),
    quantity: item.quantity as number | null,
    unit: item.unit as BackendIngredientUnit,
    needsReview: item.needsReview,
  };
}

/**
 * Valida la colección completa de ingredientes detectados devuelta por el backend.
 */
export function validateDetectedIngredientsResponse(rawArray: unknown): BackendDetectedIngredient[] {
  if (!Array.isArray(rawArray)) {
    throw new ScannerApiError(
      'La respuesta del servidor no contiene una lista de ingredientes válida.',
      'INVALID_RESPONSE_SHAPE',
      200,
      rawArray
    );
  }

  return rawArray.map((item, idx) => validateBackendDetectedIngredient(item, idx));
}

/**
 * Envía una imagen al backend para ser analizada por Gemini y retorna los ingredientes detectados.
 */
export async function analyzeIngredientsImage(
  image: SelectedImage,
  options?: ScannerApiOptions
): Promise<BackendDetectedIngredient[]> {
  if (!image || !image.uri) {
    throw new ScannerApiError(
      'Debes proporcionar una imagen para analizar.',
      'IMAGE_REQUIRED',
      400,
      undefined,
      false,
      false,
      false,
      true
    );
  }

  const targetUrl = buildApiUrl(API_ENDPOINTS.INGREDIENTS_ANALYZE, options?.baseUrl);
  const timeoutMs = options?.timeoutMs ?? DEFAULT_AI_SCANNER_TIMEOUT_MS;

  const controller = new AbortController();
  let isTimedOut = false;

  const timer = setTimeout(() => {
    isTimedOut = true;
    controller.abort();
  }, timeoutMs);

  const externalSignal = options?.signal;
  const onExternalAbort = () => {
    controller.abort();
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timer);
      throw new ScannerApiError(
        'El análisis de imagen fue cancelado.',
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

    const formData = await createAnalyzeFormData(image);

    // NOTA CLAVE: No incluir 'Content-Type' manual para permitir que fetch configure el límite (boundary) multipart
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        ...authHeaders,
      },
      body: formData,
      signal: controller.signal,
    });

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
        throw new ScannerApiError(
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

      throw new ScannerApiError(
        'El servidor respondió con un formato de datos no válido (no es JSON válido).',
        'MALFORMED_JSON',
        response.status,
        parseError
      );
    }

    const payload = rawJson as Record<string, unknown> | null;

    if (response.ok) {
      if (!payload || payload.success !== true || !payload.data || typeof payload.data !== 'object') {
        throw new ScannerApiError(
          'La respuesta del servidor no tiene la estructura esperada.',
          'INVALID_RESPONSE_SHAPE',
          response.status,
          rawJson
        );
      }

      const dataObj = payload.data as { ingredients?: unknown };
      return validateDetectedIngredientsResponse(dataObj.ingredients);
    }

    // Manejo de códigos de error HTTP estructurados
    const errorEnvelope = payload?.error as { code?: string; message?: string } | undefined;
    const errorCode = errorEnvelope?.code || `HTTP_${response.status}`;
    const serverMessage = errorEnvelope?.message;

    // Errores 401 y 503 de autenticación / verificación de sesión
    const authHttpError = resolveHttpAuthError(response.status, errorEnvelope);
    if (authHttpError) {
      throw new ScannerApiError(
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

    if (response.status === 400) {
      let finalMessage = serverMessage || 'La imagen enviada no es válida.';
      if (errorCode === 'IMAGE_REQUIRED') {
        finalMessage = 'Debes enviar una imagen válida para analizar.';
      } else if (errorCode === 'INVALID_IMAGE_FORMAT') {
        finalMessage = 'Formato de imagen no permitido. Usa JPG, PNG o WEBP.';
      }

      throw new ScannerApiError(
        finalMessage,
        errorCode,
        400,
        undefined,
        false,
        false,
        false,
        true
      );
    }

    if (response.status === 429 || errorCode === 'GEMINI_RATE_LIMIT') {
      throw new ScannerApiError(
        serverMessage ||
          'Has alcanzado el límite de solicitudes de análisis de alimentos. Intenta de nuevo más tarde.',
        errorEnvelope?.code || 'GEMINI_RATE_LIMIT',
        429,
        undefined,
        false,
        false,
        true
      );
    }

    if (response.status === 504 || errorCode === 'GEMINI_TIMEOUT') {
      throw new ScannerApiError(
        serverMessage ||
          'El servicio de análisis con IA tardó demasiado en responder. Por favor intenta nuevamente.',
        'GEMINI_TIMEOUT',
        504,
        undefined,
        false,
        true
      );
    }

    if (response.status === 503 || errorCode === 'GEMINI_UNAVAILABLE') {
      throw new ScannerApiError(
        serverMessage ||
          'El servicio de inteligencia artificial está temporalmente ocupado. Por favor intenta en unos minutos.',
        errorEnvelope?.code || 'GEMINI_UNAVAILABLE',
        503
      );
    }

    if (response.status >= 500) {
      throw new ScannerApiError(
        serverMessage ||
          'Ocurrió un error en el servidor al analizar la imagen. Intenta nuevamente.',
        errorCode,
        response.status
      );
    }

    throw new ScannerApiError(
      serverMessage || `El servidor respondió con código de estado HTTP ${response.status}.`,
      errorCode,
      response.status
    );
  } catch (error) {
    if (error instanceof ScannerApiError) {
      throw error;
    }

    if (error instanceof ApiAuthError) {
      throw new ScannerApiError(
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

    const isExternal = Boolean(externalSignal?.aborted);
    const isTimeout = isTimedOut && !isExternal;
    const isAbort =
      (error instanceof Error && error.name === 'AbortError') ||
      isTimedOut ||
      isExternal ||
      controller.signal.aborted;

    if (isAbort) {
      const msg = isExternal
        ? 'El análisis de imagen fue cancelado.'
        : `El análisis de la imagen superó el tiempo límite de espera (${Math.round(
            timeoutMs / 1000
          )}s). Verifica tu conexión o intenta nuevamente.`;

      throw new ScannerApiError(
        msg,
        isExternal ? 'REQUEST_ABORTED' : 'REQUEST_TIMEOUT',
        0,
        undefined,
        false,
        isTimeout
      );
    }

    throw new ScannerApiError(
      'No se pudo conectar con el servidor FoodAI. Verifica que el backend esté ejecutándose y que la red funcione correctamente.',
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

export const scannerApi = {
  analyzeIngredientsImage,
};
