/**
 * FoodAI - Helper compartido de autenticación Bearer con Supabase (Fase 6C.2 / Hardening concurrencia).
 *
 * Responsabilidades de seguridad:
 * 1. Obtiene dinámicamente el access_token de la sesión activa de Supabase justo antes de cada petición protegida.
 * 2. Opera en modo fail-closed si no existe sesión válida, la identidad de sesión no puede establecerse con seguridad,
 *    el token es malformado o la sesión expiró sin poder renovarse.
 * 3. Aísla estrictamente la deduplicación single-flight de refreshSession por cliente, generación (epoch) e identidad
 *    verificada de sesión, revalidando la titularidad activa tras operaciones asíncronas para impedir fugas entre cuentas.
 * 4. NUNCA decodifica claims JWT no verificados para inferir identidad de usuario, NUNCA registra tokens en consola,
 *    NUNCA los persiste por separado y NUNCA los expone en mensajes de error ni query params.
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

export interface SupabaseAuthUserLike {
  id?: string | null;
}

export interface SupabaseAuthSessionLike {
  access_token?: string | null;
  refresh_token?: string | null;
  expires_at?: number | null;
  user?: SupabaseAuthUserLike | null;
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

interface InFlightRefreshEntry {
  readonly epoch: number;
  readonly userId: string | null;
  readonly scopeKey: string;
  readonly promise: Promise<RefreshSingleFlightResult>;
}

interface ClientAuthTracker {
  epoch: number;
  activeUserId: string | null;
  isSigningOut: boolean;
  inFlightByScope: Map<string, InFlightRefreshEntry>;
}

type ResolvedSessionIdentity =
  | {
      readonly kind: 'verified';
      readonly userId: string;
      readonly refreshToken: string | null;
      readonly scopeKey: string;
    }
  | {
      readonly kind: 'legacy_mock';
      readonly userId: null;
      readonly refreshToken: string | null;
      readonly scopeKey: string;
    }
  | {
      readonly kind: 'invalid';
    };

// Estado débil por instancia de cliente Supabase para aislar generaciones de sesión y refrescos concurrentes sin fugas de memoria
const trackerByClient = new WeakMap<object, ClientAuthTracker>();

function getClientTracker(client: object): ClientAuthTracker {
  let tracker = trackerByClient.get(client);
  if (!tracker) {
    tracker = {
      epoch: 0,
      activeUserId: null,
      isSigningOut: false,
      inFlightByScope: new Map(),
    };
    trackerByClient.set(client, tracker);
  }
  return tracker;
}

function hasAuthLifecycleSupport(client: SupabaseAuthClientLike): boolean {
  const authCandidate = client.auth as { onAuthStateChange?: unknown };
  return typeof authCandidate.onAuthStateChange === 'function';
}

function extractVerifiedSessionUserId(
  session: SupabaseAuthSessionLike | null | undefined
): string | null {
  if (!session || typeof session !== 'object') {
    return null;
  }
  const userCandidate = session.user;
  if (!userCandidate || typeof userCandidate !== 'object') {
    return null;
  }
  if (typeof userCandidate.id !== 'string') {
    return null;
  }
  const trimmedId = userCandidate.id.trim();
  return trimmedId.length > 0 ? trimmedId : null;
}

/**
 * Notifica transiciones de ciclo de vida de sesión (signOut, cambio de usuario, restauración o login)
 * para invalidar de inmediato cualquier refresco en vuelo perteneciente a una sesión superada.
 *
 * Preserva intacta la rotación normal de tokens (TOKEN_REFRESHED del mismo user.id).
 */
export function notifyAuthSessionTransition(
  client?: SupabaseAuthClientLike | object | null,
  session?: SupabaseAuthSessionLike | null,
  options?: { signingOut?: boolean; forceInvalidate?: boolean }
): void {
  const target = (
    client && typeof client === 'object' ? client : defaultSupabase
  ) as object;
  const tracker = getClientTracker(target);

  if (typeof options?.signingOut === 'boolean') {
    tracker.isSigningOut = options.signingOut;
  }

  const nextUserId = extractVerifiedSessionUserId(session);
  const sessionCleared =
    (!session || nextUserId === null) &&
    (tracker.activeUserId !== null || tracker.inFlightByScope.size > 0);
  const userSwitched =
    nextUserId !== null &&
    tracker.activeUserId !== null &&
    nextUserId !== tracker.activeUserId;
  const enteredUserOverPending =
    nextUserId !== null &&
    tracker.activeUserId === null &&
    tracker.inFlightByScope.size > 0;

  if (
    options?.forceInvalidate === true ||
    sessionCleared ||
    userSwitched ||
    enteredUserOverPending
  ) {
    tracker.epoch += 1;
    tracker.inFlightByScope.clear();
  }

  tracker.activeUserId = session ? nextUserId : null;
}

/**
 * Limpia el indicador transitorio de cierre de sesión en progreso sin alterar la generación actual.
 */
export function clearAuthSigningOutState(
  client?: SupabaseAuthClientLike | object | null
): void {
  const target = (
    client && typeof client === 'object' ? client : defaultSupabase
  ) as object;
  const tracker = getClientTracker(target);
  tracker.isSigningOut = false;
}

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
 * IMPORTANTE: Solo se usa como respaldo de tiempo de expiración; NUNCA se usan claims JWT no verificados
 * para establecer la identidad del usuario autenticado.
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
 * Determina la identidad verificada de la sesión únicamente a partir del objeto `session.user.id`
 * entregado por Supabase Auth (nunca decodificando claims JWT sin verificar).
 */
function resolveSessionIdentity(
  session: SupabaseAuthSessionLike,
  trimmedAccessToken: string,
  requireVerifiedUser: boolean
): ResolvedSessionIdentity {
  const hasExplicitUserField =
    Object.prototype.hasOwnProperty.call(session, 'user') ||
    session.user !== undefined;

  const refreshToken =
    typeof session.refresh_token === 'string' &&
    session.refresh_token.trim().length > 0
      ? session.refresh_token.trim()
      : null;

  if (hasExplicitUserField) {
    const verifiedUserId = extractVerifiedSessionUserId(session);
    if (!verifiedUserId) {
      return { kind: 'invalid' };
    }

    const scopeKey = refreshToken
      ? `user:${verifiedUserId}::rt:${refreshToken}`
      : `user:${verifiedUserId}`;

    return {
      kind: 'verified',
      userId: verifiedUserId,
      refreshToken,
      scopeKey,
    };
  }

  if (requireVerifiedUser) {
    return { kind: 'invalid' };
  }

  const scopeKey = refreshToken
    ? `legacy-rt:${refreshToken}`
    : `legacy-at:${trimmedAccessToken}`;

  return {
    kind: 'legacy_mock',
    userId: null,
    refreshToken,
    scopeKey,
  };
}

function createAbortError(): Error {
  const abortError = new Error('The operation was aborted.');
  abortError.name = 'AbortError';
  return abortError;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

/**
 * Ejecuta un único refreshSession deduplicado exclusivamente dentro de la misma generación
 * e identidad lógica de sesión. Nunca reutiliza promesas en vuelo entre cuentas o sesiones distintas.
 */
function refreshSessionScoped(
  client: SupabaseAuthClientLike,
  tracker: ClientAuthTracker,
  expectedEpoch: number,
  identity: Exclude<ResolvedSessionIdentity, { kind: 'invalid' }>
): Promise<RefreshSingleFlightResult> {
  const compositeKey = `${expectedEpoch}::${identity.scopeKey}`;
  const existing = tracker.inFlightByScope.get(compositeKey);
  if (
    existing &&
    !tracker.isSigningOut &&
    existing.epoch === tracker.epoch &&
    existing.epoch === expectedEpoch &&
    existing.userId === identity.userId &&
    existing.scopeKey === identity.scopeKey
  ) {
    return existing.promise;
  }

  const refreshFn = client.auth.refreshSession;
  if (typeof refreshFn !== 'function') {
    return Promise.resolve({
      session: null,
      hasError: false,
      isUnconfigured: true,
    });
  }

  let currentEntry: InFlightRefreshEntry | null = null;
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
      if (
        currentEntry &&
        tracker.inFlightByScope.get(compositeKey) === currentEntry
      ) {
        tracker.inFlightByScope.delete(compositeKey);
      }
    }
  })();

  currentEntry = {
    epoch: expectedEpoch,
    userId: identity.userId,
    scopeKey: identity.scopeKey,
    promise: refreshPromise,
  };

  if (tracker.epoch === expectedEpoch && !tracker.isSigningOut) {
    tracker.inFlightByScope.set(compositeKey, currentEntry);
  }

  return refreshPromise;
}

async function withAbortSignal<T>(
  promise: Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  if (!signal) {
    return promise;
  }

  throwIfAborted(signal);

  let onAbort: (() => void) | undefined;
  const abortPromise = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      reject(createAbortError());
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
  client: SupabaseAuthClientLike,
  signal?: AbortSignal
): Promise<string> {
  if (!client || !client.auth || typeof client.auth.getSession !== 'function') {
    throw new ApiAuthError(
      AUTH_ERROR_MESSAGES.AUTH_TOKEN_REQUIRED,
      AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
      401
    );
  }

  throwIfAborted(signal);

  const tracker = getClientTracker(client);
  if (tracker.isSigningOut) {
    throw new ApiAuthError(
      AUTH_ERROR_MESSAGES.AUTH_TOKEN_REQUIRED,
      AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
      401
    );
  }

  const epochBeforeInitialRead = tracker.epoch;

  let sessionResponse: SupabaseAuthResponseLike;
  try {
    sessionResponse = await withAbortSignal(client.auth.getSession(), signal);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw err;
    }
    const code = isExpiredErrorHint(err)
      ? AUTH_ERROR_CODES.AUTH_TOKEN_EXPIRED
      : AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED;
    throw new ApiAuthError(AUTH_ERROR_MESSAGES[code], code, 401);
  }

  throwIfAborted(signal);

  if (!sessionResponse || sessionResponse.error) {
    const code = isExpiredErrorHint(sessionResponse?.error)
      ? AUTH_ERROR_CODES.AUTH_TOKEN_EXPIRED
      : AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED;
    throw new ApiAuthError(AUTH_ERROR_MESSAGES[code], code, 401);
  }

  const session = sessionResponse.data?.session ?? null;
  if (!session) {
    if (tracker.activeUserId !== null || tracker.inFlightByScope.size > 0) {
      tracker.epoch += 1;
      tracker.activeUserId = null;
      tracker.inFlightByScope.clear();
    }
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
  const needsRefresh = isStrictlyExpired || isExpiringSoon;

  const initialIdentity = resolveSessionIdentity(
    session,
    trimmedToken,
    needsRefresh && hasAuthLifecycleSupport(client)
  );

  if (initialIdentity.kind === 'invalid') {
    throw new ApiAuthError(
      AUTH_ERROR_MESSAGES.AUTH_TOKEN_REQUIRED,
      AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
      401
    );
  }

  if (tracker.isSigningOut) {
    throw new ApiAuthError(
      AUTH_ERROR_MESSAGES.AUTH_TOKEN_REQUIRED,
      AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
      401
    );
  }

  // Si ocurrió una transición de frontera (signOut o cambio de cuenta) durante getSession(),
  // solo se permite continuar si la frontera aterrizó exactamente en el usuario verificado actual.
  if (tracker.epoch !== epochBeforeInitialRead) {
    const settledOnSameVerifiedUser =
      initialIdentity.kind === 'verified' &&
      tracker.activeUserId !== null &&
      tracker.activeUserId === initialIdentity.userId;

    if (!settledOnSameVerifiedUser) {
      throw new ApiAuthError(
        AUTH_ERROR_MESSAGES.AUTH_TOKEN_REQUIRED,
        AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        401
      );
    }
  }

  // Detectar cambios directos de identidad en el cliente incluso sin eventos externos
  if (initialIdentity.kind === 'verified') {
    if (
      tracker.activeUserId !== null &&
      tracker.activeUserId !== initialIdentity.userId
    ) {
      tracker.epoch += 1;
      tracker.inFlightByScope.clear();
    }
    tracker.activeUserId = initialIdentity.userId;
  } else if (tracker.activeUserId !== null) {
    tracker.epoch += 1;
    tracker.activeUserId = null;
    tracker.inFlightByScope.clear();
  }

  const capturedEpoch = tracker.epoch;

  if (!needsRefresh) {
    return trimmedToken;
  }

  // Sesión expirada o próxima a expirar: intentar refresco deduplicado aislado por (epoch, identidad)
  const refreshOutcome = await withAbortSignal(
    refreshSessionScoped(client, tracker, capturedEpoch, initialIdentity),
    signal
  );

  throwIfAborted(signal);

  // 1. Verificar que la generación e identidad de sesión no hayan sido invalidadas durante el refresh
  if (
    tracker.isSigningOut ||
    tracker.epoch !== capturedEpoch ||
    (initialIdentity.kind === 'verified' &&
      tracker.activeUserId !== initialIdentity.userId)
  ) {
    throw new ApiAuthError(
      AUTH_ERROR_MESSAGES.AUTH_TOKEN_REQUIRED,
      AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
      401
    );
  }

  // 2. Revalidar titularidad de la sesión refrescada y de la sesión activa actual en el cliente
  if (initialIdentity.kind === 'verified') {
    if (refreshOutcome.session) {
      const refreshedUserId = extractVerifiedSessionUserId(
        refreshOutcome.session
      );
      if (!refreshedUserId || refreshedUserId !== initialIdentity.userId) {
        if (refreshedUserId && refreshedUserId !== initialIdentity.userId) {
          tracker.epoch += 1;
          tracker.activeUserId = refreshedUserId;
          tracker.inFlightByScope.clear();
        }
        throw new ApiAuthError(
          AUTH_ERROR_MESSAGES.AUTH_TOKEN_REQUIRED,
          AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
          401
        );
      }
    }

    let postRefreshResponse: SupabaseAuthResponseLike;
    try {
      postRefreshResponse = await withAbortSignal(
        client.auth.getSession(),
        signal
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }
      throw new ApiAuthError(
        AUTH_ERROR_MESSAGES.AUTH_TOKEN_REQUIRED,
        AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        401
      );
    }

    throwIfAborted(signal);

    if (
      tracker.isSigningOut ||
      tracker.epoch !== capturedEpoch ||
      tracker.activeUserId !== initialIdentity.userId
    ) {
      throw new ApiAuthError(
        AUTH_ERROR_MESSAGES.AUTH_TOKEN_REQUIRED,
        AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        401
      );
    }

    const postSession =
      !postRefreshResponse || postRefreshResponse.error
        ? null
        : (postRefreshResponse.data?.session ?? null);

    if (!postSession) {
      tracker.epoch += 1;
      tracker.activeUserId = null;
      tracker.inFlightByScope.clear();

      if (refreshOutcome.session || !refreshOutcome.hasError) {
        throw new ApiAuthError(
          AUTH_ERROR_MESSAGES.AUTH_TOKEN_REQUIRED,
          AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
          401
        );
      }
      throw new ApiAuthError(
        AUTH_ERROR_MESSAGES.AUTH_TOKEN_EXPIRED,
        AUTH_ERROR_CODES.AUTH_TOKEN_EXPIRED,
        401
      );
    }

    const postUserId = extractVerifiedSessionUserId(postSession);
    if (!postUserId || postUserId !== initialIdentity.userId) {
      tracker.epoch += 1;
      tracker.activeUserId = postUserId;
      tracker.inFlightByScope.clear();
      throw new ApiAuthError(
        AUTH_ERROR_MESSAGES.AUTH_TOKEN_REQUIRED,
        AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        401
      );
    }

    if (refreshOutcome.session) {
      const postRawToken =
        typeof postSession.access_token === 'string'
          ? postSession.access_token.trim()
          : '';
      const refreshedCandidateToken =
        typeof refreshOutcome.session.access_token === 'string'
          ? refreshOutcome.session.access_token.trim()
          : '';

      if (
        !postRawToken ||
        (refreshedCandidateToken.length > 0 &&
          postRawToken !== refreshedCandidateToken &&
          postRawToken !== trimmedToken)
      ) {
        tracker.epoch += 1;
        tracker.inFlightByScope.clear();
        throw new ApiAuthError(
          AUTH_ERROR_MESSAGES.AUTH_TOKEN_REQUIRED,
          AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
          401
        );
      }
    }
  } else if (
    refreshOutcome.session &&
    (Object.prototype.hasOwnProperty.call(refreshOutcome.session, 'user') ||
      refreshOutcome.session.user !== undefined)
  ) {
    throw new ApiAuthError(
      AUTH_ERROR_MESSAGES.AUTH_TOKEN_REQUIRED,
      AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
      401
    );
  }

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
  const accessToken = await acquireBearerToken(client, options?.signal);

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
