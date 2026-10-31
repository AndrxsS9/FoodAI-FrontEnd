/**
 * FoodAI - Helper compartido de autenticación Bearer con Supabase (Fase 6C.2).
 *
 * Responsabilidades de seguridad:
 * 1. Obtiene dinámicamente el access_token de la sesión activa de Supabase justo antes de cada petición protegida.
 * 2. Opera en modo fail-closed si no existe sesión válida, el token es malformado o la sesión expiró sin poder renovarse.
 * 3. Previene condiciones de carrera de refresco (single-flight refresh por cliente) y evita refrescos innecesarios.
 * 4. NUNCA registra tokens en consola, NUNCA los persiste por separado y NUNCA los expone en mensajes de error ni query params.
 * 5. Traduce los contratos HTTP de autenticación del backend (401 y 503) a mensajes claros en español.
 */

import { supabase as defaultSupabase } from '../supabase/client';

export const MAX_BEARER_TOKEN_LENGTH = 8192;
export const SESSION_REFRESH_LEEWAY_SECONDS = 30;

export const AUTH_ERROR_CODES = {
  AUTH_TOKEN_REQUIRED: 'AUTH_TOKEN_REQUIRED',
  INVALID_AUTH_TOKEN: 'INVALID_AUTH_TOKEN',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_VERIFICATION_UNAVAILABLE: 'AUTH_VERIFICATION_UNAVAILABLE',
} as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  AUTH_TOKEN_REQUIRED:
    'Debes iniciar sesión para continuar. Tu sesión no está activa.',
  INVALID_AUTH_TOKEN:
    'Tu sesión no es válida o ha expirado. Por favor, inicia sesión nuevamente.',
  AUTH_TOKEN_EXPIRED:
    'Tu sesión ha expirado. Por favor, inicia sesión nuevamente.',
  AUTH_VERIFICATION_UNAVAILABLE:
    'No fue posible verificar tu sesión temporalmente. Por favor, intenta nuevamente en unos momentos.',
};

export interface SupabaseAuthSessionLike {
  access_token?: string | null;
  refresh_token?: string | null;
  expires_at?: number | null;
}

export interface SupabaseAuthErrorLike {
  message?: string;
  status?: number;
  code?: string;
}

export interface SupabaseAuthResponseLike {
  data: { session: SupabaseAuthSessionLike | null } | null;
  error: SupabaseAuthErrorLike | null;
}

export interface SupabaseAuthClientLike {
  auth: {
    getSession: () => Promise<SupabaseAuthResponseLike>;
    refreshSession?: () => Promise<SupabaseAuthResponseLike>;
  };
}

export interface GetAuthHeadersOptions {
  authClient?: SupabaseAuthClientLike;
  signal?: AbortSignal;
}

export interface ResolvedHttpAuthError {
  code: string;
  status: number;
  message: string;
  isAuthError: boolean;
}

export class ApiAuthError extends Error {
  constructor(
    message: string,
    public readonly code: AuthErrorCode,
    public readonly status: 401 | 503 = 401,
    public readonly isAuthError: boolean = status === 401
  ) {
    super(message);
    this.name = 'ApiAuthError';
    Object.setPrototypeOf(this, ApiAuthError.prototype);
  }
}

interface RefreshSingleFlightResult {
  session: SupabaseAuthSessionLike | null;
  hasError: boolean;
  isUnconfigured: boolean;
}

// Mapa débil por instancia de cliente Supabase para deduplicar refrescos concurrentes sin fugas de memoria
const inFlightRefreshByClient = new WeakMap<
  object,
  Promise<RefreshSingleFlightResult>
>();

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Decodificador puro Base64URL independiente del motor JS (Hermes, JSC, Web y Node).
 */
function decodeBase64UrlToString(segment: string): string | null {
  if (!segment || typeof segment !== 'string') {
    return null;
  }

  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const remainder = normalized.length % 4;
  if (remainder === 1) {
    return null;
  }

  const padded =
    remainder === 0 ? normalized : normalized + '='.repeat(4 - remainder);

  const bytes: number[] = [];

  for (let i = 0; i < padded.length; i += 4) {
    const c1 = BASE64_ALPHABET.indexOf(padded[i]);
    const c2 = BASE64_ALPHABET.indexOf(padded[i + 1]);
    const c3 = padded[i + 2] === '=' ? 0 : BASE64_ALPHABET.indexOf(padded[i + 2]);
    const c4 = padded[i + 3] === '=' ? 0 : BASE64_ALPHABET.indexOf(padded[i + 3]);

    if (c1 < 0 || c2 < 0 || c3 < 0 || c4 < 0) {
      return null;
    }

    const triplet = (c1 << 18) | (c2 << 12) | (c3 << 6) | c4;
    bytes.push((triplet >> 16) & 0xff);
    if (padded[i + 2] !== '=') {
      bytes.push((triplet >> 8) & 0xff);
    }
    if (padded[i + 3] !== '=') {
      bytes.push(triplet & 0xff);
    }
  }

  if (typeof TextDecoder !== 'undefined') {
    try {
      return new TextDecoder().decode(new Uint8Array(bytes));
    } catch {
      // Fallback a decodificación byte a byte
    }
  }

  let ascii = '';
  for (let i = 0; i < bytes.length; i += 1) {
    ascii += String.fromCharCode(bytes[i]);
  }
  return ascii;
}

/**
 * Extrae defensivamente la marca de expiración (exp en segundos Unix) de la sesión o del payload JWT.
 */
export function resolveSessionExpiresAtSeconds(
  session: SupabaseAuthSessionLike | null | undefined
): number | null {
  if (!session) {
    return null;
  }

  if (
    typeof session.expires_at === 'number' &&
    Number.isFinite(session.expires_at) &&
    session.expires_at > 0
  ) {
    return session.expires_at > 1e12
      ? Math.floor(session.expires_at / 1000)
      : Math.floor(session.expires_at);
  }

  if (typeof session.access_token === 'string') {
    const parts = session.access_token.trim().split('.');
    if (parts.length === 3 && parts[1]) {
      const decoded = decodeBase64UrlToString(parts[1]);
      if (decoded) {
        try {
          const payload = JSON.parse(decoded) as { exp?: unknown };
          if (
            typeof payload?.exp === 'number' &&
            Number.isFinite(payload.exp) &&
            payload.exp > 0
          ) {
            return Math.floor(payload.exp);
          }
        } catch {
          // Si es un token sintético de pruebas no-JSON, no inferir exp desde el segmento
        }
      }
    }
  }

  return null;
}

/**
 * Verifica que un token de acceso tenga un formato seguro para el encabezado HTTP Authorization.
 * Rechaza tokens vacíos, excesivamente largos o con espacios / caracteres de control.
 */
export function isValidBearerTokenFormat(token: unknown): token is string {
  if (typeof token !== 'string') {
    return false;
  }

  if (token.length === 0 || token.length > MAX_BEARER_TOKEN_LENGTH) {
    return false;
  }

  if (/\s/.test(token) || /[\u0000-\u001F\u007F]/.test(token)) {
    return false;
  }

  return true;
}

function isExpiredErrorHint(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const candidate = error as { code?: unknown; message?: unknown };
  const codeStr = typeof candidate.code === 'string' ? candidate.code.toLowerCase() : '';
  const msgStr =
    typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';

  return (
    codeStr.includes('expired') ||
    msgStr.includes('expired') ||
    msgStr.includes('refresh_token_not_found') ||
    msgStr.includes('invalid refresh token')
  );
}

/**
 * Ejecuta un único refreshSession compartido por instancia de cliente cuando múltiples
 * solicitudes protegidas coinciden ante una sesión vencida o próxima a vencer.
 */
function refreshSessionSingleFlight(
  client: SupabaseAuthClientLike
): Promise<RefreshSingleFlightResult> {
  const existing = inFlightRefreshByClient.get(client);
  if (existing) {
    return existing;
  }

  const refreshFn = client.auth.refreshSession;
  if (typeof refreshFn !== 'function') {
    return Promise.resolve({
      session: null,
      hasError: false,
      isUnconfigured: true,
    });
  }

  const refreshPromise = (async (): Promise<RefreshSingleFlightResult> => {
    try {
      const response = await refreshFn.call(client.auth);
      if (!response || typeof response !== 'object') {
        return {
          session: null,
          hasError: false,
          isUnconfigured: true,
        };
      }

      if (response.error) {
        return {
          session: null,
          hasError: true,
          isUnconfigured: false,
        };
      }

      return {
        session: response.data?.session ?? null,
        hasError: false,
        isUnconfigured: false,
      };
    } catch {
      return {
        session: null,
        hasError: true,
        isUnconfigured: false,
      };
    } finally {
      inFlightRefreshByClient.delete(client);
    }
  })();

  inFlightRefreshByClient.set(client, refreshPromise);
  return refreshPromise;
}

async function withAbortSignal<T>(
  promise: Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  if (!signal) {
    return promise;
  }

  if (signal.aborted) {
    const abortError = new Error('The operation was aborted.');
    abortError.name = 'AbortError';
    throw abortError;
  }

  let onAbort: (() => void) | undefined;
  const abortPromise = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      const abortError = new Error('The operation was aborted.');
      abortError.name = 'AbortError';
      reject(abortError);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });

  try {
    return await Promise.race([promise, abortPromise]);
  } finally {
    if (onAbort) {
      signal.removeEventListener('abort', onAbort);
    }
  }
}

async function acquireBearerToken(
  client: SupabaseAuthClientLike
): Promise<string> {
  if (!client || !client.auth || typeof client.auth.getSession !== 'function') {
    throw new ApiAuthError(
      AUTH_ERROR_MESSAGES.AUTH_TOKEN_REQUIRED,
      AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
      401
    );
  }

  let sessionResponse: SupabaseAuthResponseLike;
  try {
    sessionResponse = await client.auth.getSession();
  } catch (err) {
    const code = isExpiredErrorHint(err)
      ? AUTH_ERROR_CODES.AUTH_TOKEN_EXPIRED
      : AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED;
    throw new ApiAuthError(AUTH_ERROR_MESSAGES[code], code, 401);
  }

  if (!sessionResponse || sessionResponse.error) {
    const code = isExpiredErrorHint(sessionResponse?.error)
      ? AUTH_ERROR_CODES.AUTH_TOKEN_EXPIRED
      : AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED;
    throw new ApiAuthError(AUTH_ERROR_MESSAGES[code], code, 401);
  }

  const session = sessionResponse.data?.session ?? null;
  if (!session) {
    throw new ApiAuthError(
      AUTH_ERROR_MESSAGES.AUTH_TOKEN_REQUIRED,
      AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
      401
    );
  }

  if (typeof session.access_token !== 'string' || session.access_token.trim().length === 0) {
    throw new ApiAuthError(
      AUTH_ERROR_MESSAGES.AUTH_TOKEN_REQUIRED,
      AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
      401
    );
  }

  const trimmedToken = session.access_token.trim();
  if (!isValidBearerTokenFormat(trimmedToken)) {
    throw new ApiAuthError(
      AUTH_ERROR_MESSAGES.INVALID_AUTH_TOKEN,
      AUTH_ERROR_CODES.INVALID_AUTH_TOKEN,
      401
    );
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAtSeconds = resolveSessionExpiresAtSeconds(session);
  const isStrictlyExpired =
    expiresAtSeconds !== null && expiresAtSeconds <= nowSeconds;
  const isExpiringSoon =
    expiresAtSeconds !== null &&
    expiresAtSeconds <= nowSeconds + SESSION_REFRESH_LEEWAY_SECONDS;

  if (!isStrictlyExpired && !isExpiringSoon) {
    return trimmedToken;
  }

  // Sesión expirada o próxima a expirar: intentar refresco deduplicado (single-flight)
  const refreshOutcome = await refreshSessionSingleFlight(client);

  if (refreshOutcome.session) {
    const refreshedRaw =
      typeof refreshOutcome.session.access_token === 'string'
        ? refreshOutcome.session.access_token.trim()
        : '';

    if (!refreshedRaw) {
      throw new ApiAuthError(
        AUTH_ERROR_MESSAGES.AUTH_TOKEN_EXPIRED,
        AUTH_ERROR_CODES.AUTH_TOKEN_EXPIRED,
        401
      );
    }

    if (!isValidBearerTokenFormat(refreshedRaw)) {
      throw new ApiAuthError(
        AUTH_ERROR_MESSAGES.INVALID_AUTH_TOKEN,
        AUTH_ERROR_CODES.INVALID_AUTH_TOKEN,
        401
      );
    }

    const refreshedExpiresAt = resolveSessionExpiresAtSeconds(
      refreshOutcome.session
    );
    const nowAfterRefresh = Math.floor(Date.now() / 1000);

    if (refreshedExpiresAt !== null && refreshedExpiresAt <= nowAfterRefresh) {
      throw new ApiAuthError(
        AUTH_ERROR_MESSAGES.AUTH_TOKEN_EXPIRED,
        AUTH_ERROR_CODES.AUTH_TOKEN_EXPIRED,
        401
      );
    }

    return refreshedRaw;
  }

  // Si el token aún no ha expirado estrictamente y el cliente mock no implementó refreshSession,
  // se permite usar el token vigente; en cualquier otro caso, falla cerrado (fail-closed).
  const nowFallback = Math.floor(Date.now() / 1000);
  if (
    !isStrictlyExpired &&
    refreshOutcome.isUnconfigured &&
    !refreshOutcome.hasError &&
    expiresAtSeconds !== null &&
    expiresAtSeconds > nowFallback
  ) {
    return trimmedToken;
  }

  throw new ApiAuthError(
    AUTH_ERROR_MESSAGES.AUTH_TOKEN_EXPIRED,
    AUTH_ERROR_CODES.AUTH_TOKEN_EXPIRED,
    401
  );
}

/**
 * Construye el encabezado HTTP `Authorization: Bearer <access_token>` obteniendo la sesión
 * actual de Supabase inmediatamente antes de cada petición protegida.
 *
 * Falla en modo cerrado (lanza ApiAuthError) si no hay sesión activa o válida.
 */
export async function getSupabaseAuthHeaders(
  options?: GetAuthHeadersOptions
): Promise<{ Authorization: string }> {
  const client = options?.authClient ?? (defaultSupabase as unknown as SupabaseAuthClientLike);
  const accessToken = await withAbortSignal(
    acquireBearerToken(client),
    options?.signal
  );

  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

/**
 * Mapea respuestas HTTP de error de autenticación o verificación del backend (401 y 503)
 * a mensajes claros y accionables en español sin exponer detalles criptográficos ni tokens.
 */
export function resolveHttpAuthError(
  status: number,
  errorEnvelope?: { code?: string; message?: string } | null
): ResolvedHttpAuthError | null {
  const rawCode =
    typeof errorEnvelope?.code === 'string' && errorEnvelope.code.trim().length > 0
      ? errorEnvelope.code.trim()
      : undefined;

  if (
    rawCode === AUTH_ERROR_CODES.AUTH_VERIFICATION_UNAVAILABLE
  ) {
    return {
      code: AUTH_ERROR_CODES.AUTH_VERIFICATION_UNAVAILABLE,
      status: status > 0 ? status : 503,
      message: AUTH_ERROR_MESSAGES.AUTH_VERIFICATION_UNAVAILABLE,
      isAuthError: false,
    };
  }

  if (
    status === 401 ||
    rawCode === AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED ||
    rawCode === AUTH_ERROR_CODES.INVALID_AUTH_TOKEN ||
    rawCode === AUTH_ERROR_CODES.AUTH_TOKEN_EXPIRED
  ) {
    const resolvedCode = rawCode || AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED;

    let message: string;
    if (resolvedCode === AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED) {
      message = AUTH_ERROR_MESSAGES.AUTH_TOKEN_REQUIRED;
    } else if (resolvedCode === AUTH_ERROR_CODES.AUTH_TOKEN_EXPIRED) {
      message = AUTH_ERROR_MESSAGES.AUTH_TOKEN_EXPIRED;
    } else if (resolvedCode === AUTH_ERROR_CODES.INVALID_AUTH_TOKEN) {
      message = AUTH_ERROR_MESSAGES.INVALID_AUTH_TOKEN;
    } else {
      message =
        'Se requiere autenticación o tu sesión ha expirado. Por favor, inicia sesión nuevamente.';
    }

    return {
      code: resolvedCode,
      status: 401,
      message,
      isAuthError: true,
    };
  }

  return null;
}
