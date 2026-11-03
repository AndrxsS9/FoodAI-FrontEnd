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
 * 7. Subida multipart nativa en Android con expo-file-system (UploadTask); fetch + FormData en iOS y Web.
 */
import { File as ExpoFile, UploadTask, UploadType } from 'expo-file-system';
import { Platform } from 'react-native';
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

/**
 * Etapa del flujo de análisis en la que ocurrió la falla:
 * - auth: obtención de la sesión de Supabase.
 * - prepare: construcción local del FormData con la imagen (nunca es un problema de red).
 * - upload: transporte HTTP (fetch) hasta recibir encabezados de respuesta.
 * - response: lectura y validación de la respuesta del backend.
 */
export type ScannerErrorStage = 'auth' | 'prepare' | 'upload' | 'response';

/**
 * Mecanismo de transporte usado para subir la imagen:
 * - expo-file-system: UploadTask nativo (solo Android).
 * - fetch: FormData de React Native / navegador (iOS y Web).
 */
export type ScannerUploadTransport = 'expo-file-system' | 'fetch';

/**
 * Categoría de una falla de transporte derivada del mensaje del error, sin conservarlo.
 */
export type ScannerUploadFailureKind =
  | 'rn_fetch_failed'
  | 'timeout'
  | 'tls'
  | 'dns'
  | 'stream'
  | 'connection'
  | 'file'
  | 'other';

/**
 * Diagnóstico seguro para soporte. NUNCA incluye tokens, encabezados, URIs de archivos,
 * bytes/base64 de la imagen ni mensajes nativos crudos (pueden contener rutas privadas).
 */
export interface ScannerErrorDiagnostic {
  stage: ScannerErrorStage;
  platform: string;
  transport?: ScannerUploadTransport;
  failureKind?: ScannerUploadFailureKind;
  nativeErrorCode?: string;
  errorName?: string;
  httpStatus?: number;
  mimeType?: string;
  imageSizeKb?: number;
}

export class ScannerApiError extends Error {
  public diagnostic?: ScannerErrorDiagnostic;

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
 * Categoriza la causa de una falla local o de transporte a partir del mensaje del error,
 * SIN conservarlo: el mensaje nativo puede incluir la URL o la ruta privada del archivo.
 */
export function classifyUploadFailure(error: unknown): ScannerUploadFailureKind | undefined {
  if (!(error instanceof Error) || error instanceof ScannerApiError || error instanceof ApiAuthError) {
    return undefined;
  }

  const message = error.message.toLowerCase();
  if (message.includes('network request failed')) return 'rn_fetch_failed';
  if (
    /does not exist|no such file|enoent|permission for accessing the file|could not retrieve file/.test(
      message
    )
  ) {
    return 'file';
  }
  if (/timed? ?out|timeout/.test(message)) return 'timeout';
  if (/ssl|tls|certificate|handshake/.test(message)) return 'tls';
  if (/unable to resolve host|unknownhost|no address associated/.test(message)) return 'dns';
  if (/unexpected end of stream|stream was reset|protocol/.test(message)) return 'stream';
  if (/failed to connect|connection (reset|refused|abort|closed)|broken pipe|software caused/.test(message)) {
    return 'connection';
  }
  return 'other';
}

function getNativeErrorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^ERR_[A-Z0-9_]+$/.test(code) ? code : undefined;
}

/**
 * Resume el diagnóstico para mostrarlo en pantalla, ej. "NETWORK_ERROR (upload · expo-file-system · tls)".
 */
export function formatScannerDiagnostic(error: ScannerApiError): string {
  const details = [
    error.diagnostic?.stage,
    error.diagnostic?.transport,
    error.diagnostic?.failureKind,
  ].filter(Boolean);
  return details.length > 0 ? `${error.code} (${details.join(' · ')})` : error.code;
}

function buildScannerDiagnostic(
  stage: ScannerErrorStage,
  transport: ScannerUploadTransport,
  image: SelectedImage,
  error: unknown,
  httpStatus?: number
): ScannerErrorDiagnostic {
  return {
    stage,
    platform: Platform.OS,
    transport,
    failureKind: classifyUploadFailure(error),
    nativeErrorCode: getNativeErrorCode(error),
    errorName: error instanceof Error ? error.name : typeof error,
    httpStatus: httpStatus && httpStatus > 0 ? httpStatus : undefined,
    mimeType: image.mimeType,
    imageSizeKb:
      typeof image.fileSize === 'number' ? Math.round(image.fileSize / 1024) : undefined,
  };
}

/**
 * Registra metadatos no sensibles de la falla (visibles en `adb logcat -s ReactNativeJS`).
 * Se usa console.info para no disparar LogBox en desarrollo ante errores HTTP esperados.
 */
function reportScannerFailure(error: ScannerApiError): void {
  console.info('[FoodAI:scanner] Falló el análisis de imagen', {
    code: error.code,
    status: error.status,
    ...error.diagnostic,
  });
}

/**
 * Respuesta HTTP mínima común a fetch y a la subida nativa de expo-file-system.
 */
interface ScannerHttpResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

/**
 * Referencia al archivo local optimizado para la subida nativa. Si ya no existe, es un problema
 * de preparación de la imagen y no de red.
 */
function resolveNativeUploadFile(image: SelectedImage): ExpoFile {
  const file = new ExpoFile(image.uri);
  if (!file.exists) {
    const error = new Error('El archivo de imagen preparado no está disponible.');
    error.name = 'ImageFileUnavailableError';
    throw error;
  }
  return file;
}

/**
 * Subida multipart nativa en Android con expo-file-system (UploadTask + OkHttp).
 * A diferencia de FormData + fetch de React Native, el cuerpo se relee desde el archivo en cada
 * escritura y los errores nativos conservan su causa. Una sola llamada a uploadAsync() por análisis:
 * no se agregan reintentos de aplicación que puedan duplicar solicitudes a Gemini.
 */
async function uploadWithExpoFileSystem(
  file: ExpoFile,
  url: string,
  image: SelectedImage,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<ScannerHttpResponse> {
  const task = new UploadTask(file, url, {
    httpMethod: 'POST',
    uploadType: UploadType.MULTIPART,
    fieldName: 'image',
    mimeType: image.mimeType || 'image/jpeg',
    headers,
    signal,
  });

  try {
    const result = await task.uploadAsync();
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      json: async () => JSON.parse(result.body),
    };
  } finally {
    task.release();
  }
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

  let stage: ScannerErrorStage = 'auth';
  // Solo Android usa la subida nativa; iOS y Web conservan fetch + FormData sin cambios
  const transport: ScannerUploadTransport = Platform.OS === 'android' ? 'expo-file-system' : 'fetch';

  const toScannerApiError = (error: unknown): ScannerApiError => {
    if (error instanceof ScannerApiError) {
      return error;
    }

    if (error instanceof ApiAuthError) {
      return new ScannerApiError(
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

      return new ScannerApiError(
        msg,
        isExternal ? 'REQUEST_ABORTED' : 'REQUEST_TIMEOUT',
        0,
        undefined,
        false,
        isTimeout
      );
    }

    // Un archivo local ilegible o inexistente es un problema de preparación aunque lo detecte el transporte nativo
    if (stage === 'prepare' || classifyUploadFailure(error) === 'file') {
      return new ScannerApiError(
        'No se pudo preparar la foto para enviarla al análisis. Vuelve a tomarla o selecciónala de nuevo desde la galería.',
        'IMAGE_PREPARATION_FAILED'
      );
    }

    // Rechazo del transporte (fetch "Network request failed" o UploadTask nativo): la subida no se completó
    return new ScannerApiError(
      'No se pudo enviar la foto al servidor FoodAI. Revisa tu conexión a internet e intenta nuevamente.',
      'NETWORK_ERROR',
      0,
      undefined,
      true
    );
  };

  try {
    const authHeaders = await getSupabaseAuthHeaders({
      authClient: options?.authClient,
      signal: controller.signal,
    });

    // NOTA CLAVE: No incluir 'Content-Type' manual; el transporte define el límite (boundary) multipart
    const requestHeaders: Record<string, string> = {
      Accept: 'application/json',
      ...authHeaders,
    };

    let response: ScannerHttpResponse;

    if (transport === 'expo-file-system') {
      // Un fallo al preparar la imagen localmente NUNCA debe reportarse como caída de red o del servidor
      stage = 'prepare';
      const file = resolveNativeUploadFile(image);

      stage = 'upload';
      response = await uploadWithExpoFileSystem(
        file,
        targetUrl,
        image,
        requestHeaders,
        controller.signal
      );
    } else {
      stage = 'prepare';
      const formData = await createAnalyzeFormData(image);

      stage = 'upload';
      response = await fetch(targetUrl, {
        method: 'POST',
        headers: requestHeaders,
        body: formData,
        signal: controller.signal,
      });
    }

    stage = 'response';
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

      if (response.ok) {
        throw new ScannerApiError(
          'El servidor respondió con un formato de datos no válido (no es JSON válido).',
          'MALFORMED_JSON',
          response.status,
          parseError
        );
      }

      // Cuerpo no JSON en una respuesta de error (ej. página HTML de un proxy 413/502/503/504):
      // se clasifica por código HTTP en lugar de reportarse como JSON inválido.
      rawJson = null;
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

    if (response.status === 413) {
      throw new ScannerApiError(
        'La imagen supera el tamaño máximo permitido de 8 MB. Toma la foto nuevamente o elige una imagen más liviana.',
        errorEnvelope?.code || 'IMAGE_TOO_LARGE',
        413,
        undefined,
        false,
        false,
        false,
        true
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
    const scannerError = toScannerApiError(error);

    // La cancelación deliberada del usuario no es una falla y no se registra
    if (scannerError.code !== 'REQUEST_ABORTED') {
      scannerError.diagnostic ??= buildScannerDiagnostic(
        stage,
        transport,
        image,
        error,
        scannerError.status
      );
      reportScannerFailure(scannerError);
    }

    throw scannerError;
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
