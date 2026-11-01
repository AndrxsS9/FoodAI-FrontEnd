/**
 * FoodAI — Pruebas Deterministas de Concurrencia y Aislamiento de Refresco Bearer (Fase 6C.3).
 *
 * Verifica con promesas diferidas (Deferred Promises, cero temporizadores arbitrarios y cero llamadas reales
 * a Gemini o Supabase) que los refrescos concurrentes de sesión nunca crucen fronteras entre cuentas:
 *
 * 1. Refresco concurrente para el mismo usuario (deduplicación single-flight y rotación normal).
 * 2. Cierre de sesión (signOut) mientras un refresco está pendiente.
 * 3. Cambio de cuenta Usuario A -> Usuario B mientras el refresco de A está en curso.
 * 4. Resolución tardía del refresco antiguo de A después de que Usuario B inició sesión.
 * 5. Rechazo/error tardío del refresco antiguo de A después del cambio de cuenta a Usuario B.
 * 6. Cancelación de solicitud (AbortController) durante un refresco pendiente sin afectar peticiones hermanas.
 * 7. Garantía estricta de que jamás se envía un encabezado Authorization de un usuario anterior ni se filtran tokens en logs.
 * 8. Garantía fail-closed: no se envía ninguna petición de IA cuando la identidad de sesión no puede establecerse con seguridad
 *    (incluyendo tokens vigentes sin campo `user` en clientes Supabase reales/completos, sin confiar jamás en claims JWT no verificados).
 * 9. Rechazo determinista de sesiones obsoletas durante la lectura inicial `getSession()` tras transiciones invalidantes de epoch
 *    (signOut + re-login del mismo usuario o cambio de usuario), preservando eventos normales `TOKEN_REFRESHED` de la misma sesión.
 */

import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  AUTH_ERROR_CODES,
  AUTH_ERROR_MESSAGES,
  SupabaseAuthClientLike,
  SupabaseAuthResponseLike,
  SupabaseAuthSessionLike,
  getSupabaseAuthHeaders,
} from '../src/services/api/authHeaders';
import { recommendRecipes } from '../src/services/api/recipeApi';
import { analyzeIngredientsImage } from '../src/services/api/scannerApi';
import { generateMealPlan } from '../src/services/api/mealPlanApi';
import { supabase } from '../src/services/supabase/client';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { AuthSession, AuthUser } from '../src/types/auth';
import { RecommendRecipesRequest } from '../src/types/recipe';
import { MealPlanRequest } from '../src/types/mealPlan';
import { SelectedImage } from '../src/types/scanner';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // Evita falsos positivos de unhandledRejection cuando una promesa diferida se rechaza intencionalmente
  promise.catch(() => {});
  return { promise, resolve, reject };
}

async function flushMicrotasks(ticks = 6): Promise<void> {
  for (let i = 0; i < ticks; i += 1) {
    await Promise.resolve();
  }
}

const BASE64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function encodeBase64UrlJson(obj: Record<string, unknown>): string {
  const json = JSON.stringify(obj);
  const bytes =
    typeof TextEncoder !== 'undefined'
      ? new TextEncoder().encode(json)
      : Uint8Array.from(Array.from(json).map((ch) => ch.charCodeAt(0) & 0xff));

  let base64 = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b3 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triplet = (b1 << 16) | (b2 << 8) | b3;

    base64 += BASE64_CHARS[(triplet >> 18) & 0x3f];
    base64 += BASE64_CHARS[(triplet >> 12) & 0x3f];
    base64 += i + 1 < bytes.length ? BASE64_CHARS[(triplet >> 6) & 0x3f] : '=';
    base64 += i + 2 < bytes.length ? BASE64_CHARS[triplet & 0x3f] : '=';
  }

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function buildSyntheticJwt(
  payload: Record<string, unknown>,
  signature = 'sig_race_test'
): string {
  const header = encodeBase64UrlJson({ alg: 'ES256', typ: 'JWT' });
  const body = encodeBase64UrlJson(payload);
  return `${header}.${body}.${signature}`;
}

const USER_A: AuthUser = {
  id: 'usr-race-alice-a',
  email: 'alice@foodai.app',
  created_at: '2026-11-01T10:00:00.000Z',
  app_metadata: {},
  user_metadata: { name: 'Alice' },
  aud: 'authenticated',
};

const USER_B: AuthUser = {
  id: 'usr-race-bob-b',
  email: 'bob@foodai.app',
  created_at: '2026-11-01T11:00:00.000Z',
  app_metadata: {},
  user_metadata: { name: 'Bob' },
  aud: 'authenticated',
};

const VALID_RECIPE_REQUEST: RecommendRecipesRequest = {
  pantry: [
    { name: 'Pechuga de pollo', quantity: 500, unit: 'g', needsReview: false },
    { name: 'Arroz blanco', quantity: 300, unit: 'g', needsReview: false },
  ],
  budget: 25000,
  servings: 2,
  maxMinutes: 40,
};

const VALID_MEAL_PLAN_REQUEST: MealPlanRequest = {
  pantry: [
    { name: 'Pechuga de pollo', quantity: 500, unit: 'g', needsReview: false },
    { name: 'Arroz blanco', quantity: 400, unit: 'g', needsReview: false },
    { name: 'Huevo', quantity: 6, unit: 'unidad', needsReview: false },
  ],
  budget: 32000,
  servings: 2,
  maxMinutes: 45,
};

const VALID_IMAGE: SelectedImage = {
  uri: 'file:///alimentos/despensa.jpg',
  mimeType: 'image/jpeg',
  fileName: 'despensa.jpg',
};

const SAMPLE_BACKEND_RECIPE = {
  name: 'Arroz con pollo casero',
  description: 'Receta balanceada.',
  totalMinutes: 30,
  ingredients: [
    { name: 'Pechuga de pollo', quantity: 250, unit: 'g' },
    { name: 'Arroz blanco', quantity: 150, unit: 'g' },
  ],
  steps: ['Cocinar arroz', 'Dorar pollo y servir'],
  availableIngredients: [
    { name: 'Pechuga de pollo', quantity: 250, unit: 'g' },
    { name: 'Arroz blanco', quantity: 150, unit: 'g' },
  ],
  missingIngredients: [],
  estimatedMissingCost: 0,
  budgetRemaining: 25000,
  withinBudget: true,
  convenience: 95,
  reason: 'Usa ingredientes disponibles.',
};

const SAMPLE_RECIPES_RESPONSE = {
  success: true,
  data: { recipes: [SAMPLE_BACKEND_RECIPE] },
};

const SAMPLE_SCANNER_RESPONSE = {
  success: true,
  data: {
    ingredients: [
      { name: 'Aguacate', quantity: 2, unit: 'unidad', needsReview: false },
    ],
  },
};

const SAMPLE_MEAL_PLAN_RESPONSE = {
  success: true,
  data: {
    days: [
      { day: 1, recipe: { ...SAMPLE_BACKEND_RECIPE, name: 'Día 1' } },
      { day: 2, recipe: { ...SAMPLE_BACKEND_RECIPE, name: 'Día 2' } },
      { day: 3, recipe: { ...SAMPLE_BACKEND_RECIPE, name: 'Día 3' } },
    ],
    totalEstimatedMissingCost: 0,
    budgetRemaining: 32000,
    withinBudget: true,
  },
};

function createSuccessFetchMock(): jest.Mock {
  return jest.fn().mockImplementation((url: string) => {
    if (url.includes('/recipes/recommend')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => SAMPLE_RECIPES_RESPONSE,
      });
    }
    if (url.includes('/ingredients/analyze')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => SAMPLE_SCANNER_RESPONSE,
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => SAMPLE_MEAL_PLAN_RESPONSE,
    });
  });
}

function buildAuthSession(params: {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}): AuthSession {
  return {
    access_token: params.accessToken,
    refresh_token: params.refreshToken,
    expires_in: 3600,
    expires_at: params.expiresAt,
    token_type: 'bearer',
    user: params.user,
  };
}

describe('FoodAI — Aislamiento de Concurrencia en Refresco de Tokens Bearer (Supabase Auth)', () => {
  const originalFetch = globalThis.fetch;
  const originalApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.foodai.example.com';
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalApiBaseUrl === undefined) {
      delete process.env.EXPO_PUBLIC_API_BASE_URL;
    } else {
      process.env.EXPO_PUBLIC_API_BASE_URL = originalApiBaseUrl;
    }
    jest.restoreAllMocks();
  });

  describe('1. Refresco concurrente para el mismo usuario (Single-Flight y rotación normal)', () => {
    it('deduplica refrescos simultáneos de la misma sesión verificada y preserva TOKEN_REFRESHED del mismo usuario', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 45;
      const futureExp = Math.floor(Date.now() / 1000) + 3600;

      const tokenAExpired = buildSyntheticJwt(
        { sub: USER_A.id, exp: pastExp },
        'sig_a_expired'
      );
      const tokenARefreshed = buildSyntheticJwt(
        { sub: USER_A.id, exp: futureExp },
        'sig_a_refreshed_v2'
      );

      let currentSession: AuthSession | null = buildAuthSession({
        user: USER_A,
        accessToken: tokenAExpired,
        refreshToken: 'rt-secret-alice-v1',
        expiresAt: pastExp,
      });

      const refreshDeferred = createDeferred<SupabaseAuthResponseLike>();
      let authStateCallback:
        | ((event: string, session: AuthSession | null) => void)
        | null = null;

      const supabaseMock = {
        auth: {
          getSession: jest.fn(async () => ({
            data: { session: currentSession },
            error: null,
          })),
          refreshSession: jest.fn(() => refreshDeferred.promise),
          signInWithPassword: jest.fn(),
          signOut: jest.fn(),
          onAuthStateChange: jest.fn((cb) => {
            authStateCallback = cb;
            return { data: { subscription: { unsubscribe: jest.fn() } } };
          }),
        },
      } as unknown as SupabaseClient & SupabaseAuthClientLike;

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider initialSession={currentSession} supabaseClient={supabaseMock}>
          {children}
        </AuthProvider>
      );

      await renderHook(() => useAuth(), { wrapper });

      const fetchMock = createSuccessFetchMock();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      // Lanzar 3 solicitudes protegidas concurrentes para el mismo Usuario A
      const recipesPromise = recommendRecipes(VALID_RECIPE_REQUEST, {
        authClient: supabaseMock,
      });
      const scannerPromise = analyzeIngredientsImage(VALID_IMAGE, {
        authClient: supabaseMock,
      });
      const mealPlanPromise = generateMealPlan(VALID_MEAL_PLAN_REQUEST, {
        authClient: supabaseMock,
      });

      await flushMicrotasks();

      // Solo se disparó UN refreshSession compartido y ninguna llamada a fetch mientras está pendiente
      expect(supabaseMock.auth.refreshSession).toHaveBeenCalledTimes(1);
      expect(fetchMock).not.toHaveBeenCalled();

      // Simular comportamiento real de @supabase/supabase-js: emite TOKEN_REFRESHED antes de resolver refreshSession
      const rotatedSessionA = buildAuthSession({
        user: USER_A,
        accessToken: tokenARefreshed,
        refreshToken: 'rt-secret-alice-v2',
        expiresAt: futureExp,
      });
      currentSession = rotatedSessionA;

      await act(async () => {
        authStateCallback?.('TOKEN_REFRESHED', rotatedSessionA);
      });

      refreshDeferred.resolve({
        data: { session: rotatedSessionA },
        error: null,
      });

      const [recipes, scanned, mealPlan] = await Promise.all([
        recipesPromise,
        scannerPromise,
        mealPlanPromise,
      ]);

      expect(recipes).toHaveLength(1);
      expect(scanned).toHaveLength(1);
      expect(mealPlan.days).toHaveLength(3);
      expect(supabaseMock.auth.refreshSession).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(3);

      for (const [, init] of fetchMock.mock.calls) {
        expect(init.headers.Authorization).toBe(`Bearer ${tokenARefreshed}`);
      }
    });

    it('soporta múltiples ciclos secuenciales de rotación de tokens para el mismo usuario sin bloqueos', async () => {
      const now = Math.floor(Date.now() / 1000);
      const tokenV1 = buildSyntheticJwt({ sub: USER_A.id, exp: now - 30 }, 'sig_v1');
      const tokenV2 = buildSyntheticJwt({ sub: USER_A.id, exp: now + 10 }, 'sig_v2');
      const tokenV3 = buildSyntheticJwt({ sub: USER_A.id, exp: now + 3600 }, 'sig_v3');

      let activeSession: AuthSession = buildAuthSession({
        user: USER_A,
        accessToken: tokenV1,
        refreshToken: 'rt-alice-seq-1',
        expiresAt: now - 30,
      });

      let refreshCount = 0;
      const authClient: SupabaseAuthClientLike = {
        auth: {
          getSession: jest.fn(async () => ({
            data: { session: activeSession },
            error: null,
          })),
          refreshSession: jest.fn(async () => {
            refreshCount += 1;
            activeSession =
              refreshCount === 1
                ? buildAuthSession({
                    user: USER_A,
                    accessToken: tokenV2,
                    refreshToken: 'rt-alice-seq-2',
                    expiresAt: now + 10, // Dentro de leeway (30s): forzará una segunda rotación limpia en la siguiente llamada
                  })
                : buildAuthSession({
                    user: USER_A,
                    accessToken: tokenV3,
                    refreshToken: 'rt-alice-seq-3',
                    expiresAt: now + 3600,
                  });
            return { data: { session: activeSession }, error: null };
          }),
        },
      };

      const firstHeaders = await getSupabaseAuthHeaders({ authClient });
      expect(firstHeaders.Authorization).toBe(`Bearer ${tokenV2}`);

      const secondHeaders = await getSupabaseAuthHeaders({ authClient });
      expect(secondHeaders.Authorization).toBe(`Bearer ${tokenV3}`);

      // En la tercera llamada el tokenV3 ya está holgadamente vigente y no vuelve a refrescar
      const thirdHeaders = await getSupabaseAuthHeaders({ authClient });
      expect(thirdHeaders.Authorization).toBe(`Bearer ${tokenV3}`);
      expect(refreshCount).toBe(2);
    });
  });

  describe('2. Cierre de sesión (signOut) mientras un refresco está pendiente', () => {
    it('descarta el token refrescado y falla cerrado con 401 si el usuario cierra sesión durante el refresh', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 60;
      const futureExp = Math.floor(Date.now() / 1000) + 3600;

      const expiredTokenA = buildSyntheticJwt(
        { sub: USER_A.id, exp: pastExp },
        'sig_a_old'
      );
      const refreshedTokenA = buildSyntheticJwt(
        { sub: USER_A.id, exp: futureExp },
        'sig_a_late_after_logout'
      );

      let storedSession: AuthSession | null = buildAuthSession({
        user: USER_A,
        accessToken: expiredTokenA,
        refreshToken: 'rt-alice-logout',
        expiresAt: pastExp,
      });

      const refreshDeferredA = createDeferred<SupabaseAuthResponseLike>();
      let authListener:
        | ((event: string, session: AuthSession | null) => void)
        | null = null;

      const supabaseMock = {
        auth: {
          getSession: jest.fn(async () => ({
            data: { session: storedSession },
            error: null,
          })),
          refreshSession: jest.fn(() => refreshDeferredA.promise),
          signOut: jest.fn(async () => {
            storedSession = null;
            authListener?.('SIGNED_OUT', null);
            return { error: null };
          }),
          signInWithPassword: jest.fn(),
          onAuthStateChange: jest.fn((cb) => {
            authListener = cb;
            return { data: { subscription: { unsubscribe: jest.fn() } } };
          }),
        },
      } as unknown as SupabaseClient & SupabaseAuthClientLike;

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider initialSession={storedSession} supabaseClient={supabaseMock}>
          {children}
        </AuthProvider>
      );

      const { result } = await renderHook(() => useAuth(), { wrapper });

      const fetchMock = createSuccessFetchMock();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      // 1. Usuario A inicia petición protegida -> dispara refresh diferido
      const pendingRecipeRequest = recommendRecipes(VALID_RECIPE_REQUEST, {
        authClient: supabaseMock,
      });
      await flushMicrotasks();
      expect(supabaseMock.auth.refreshSession).toHaveBeenCalledTimes(1);

      // 2. Mientras refresh está en vuelo, Usuario A ejecuta signOut()
      await act(async () => {
        await result.current.signOut();
      });
      expect(result.current.isAuthenticated).toBe(false);

      // 3. El refresh antiguo resuelve tardíamente con un token válido de Usuario A
      refreshDeferredA.resolve({
        data: {
          session: buildAuthSession({
            user: USER_A,
            accessToken: refreshedTokenA,
            refreshToken: 'rt-alice-rotated-after-logout',
            expiresAt: futureExp,
          }),
        },
        error: null,
      });

      await expect(pendingRecipeRequest).rejects.toMatchObject({
        name: 'RecipeApiError',
        code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        status: 401,
        isAuthError: true,
        message: AUTH_ERROR_MESSAGES.AUTH_TOKEN_REQUIRED,
      });

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('falla cerrado incluso sin AuthProvider si getSession devuelve null al revalidar tras el refresh', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 30;
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const expiredTokenA = buildSyntheticJwt({ sub: USER_A.id, exp: pastExp }, 'sig_a1');
      const refreshedTokenA = buildSyntheticJwt(
        { sub: USER_A.id, exp: futureExp },
        'sig_a2'
      );

      let activeSession: SupabaseAuthSessionLike | null = buildAuthSession({
        user: USER_A,
        accessToken: expiredTokenA,
        refreshToken: 'rt-standalone-logout',
        expiresAt: pastExp,
      });

      const refreshDeferred = createDeferred<SupabaseAuthResponseLike>();
      const authClient: SupabaseAuthClientLike = {
        auth: {
          getSession: jest.fn(async () => ({
            data: { session: activeSession },
            error: null,
          })),
          refreshSession: jest.fn(() => refreshDeferred.promise),
        },
      };

      const fetchMock = createSuccessFetchMock();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const pendingScan = analyzeIngredientsImage(VALID_IMAGE, { authClient });
      await flushMicrotasks();

      // Sesión eliminada mientras el refresh seguía pendiente
      activeSession = null;

      refreshDeferred.resolve({
        data: {
          session: buildAuthSession({
            user: USER_A,
            accessToken: refreshedTokenA,
            refreshToken: 'rt-standalone-logout-2',
            expiresAt: futureExp,
          }),
        },
        error: null,
      });

      await expect(pendingScan).rejects.toMatchObject({
        name: 'ScannerApiError',
        code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        status: 401,
        isAuthError: true,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('3. Cambio de cuenta Usuario A -> Usuario B durante un refresco pendiente', () => {
    it('aísla single-flight cuando Usuario B también requiere refresh mientras el refresh de Usuario A sigue pendiente', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 90;
      const futureExp = Math.floor(Date.now() / 1000) + 3600;

      const tokenAExpired = buildSyntheticJwt(
        { sub: USER_A.id, exp: pastExp },
        'sig_alice_exp'
      );
      const tokenARefreshed = buildSyntheticJwt(
        { sub: USER_A.id, exp: futureExp },
        'sig_alice_refreshed'
      );
      const tokenBExpired = buildSyntheticJwt(
        { sub: USER_B.id, exp: pastExp },
        'sig_bob_exp'
      );
      const tokenBRefreshed = buildSyntheticJwt(
        { sub: USER_B.id, exp: futureExp },
        'sig_bob_refreshed'
      );

      const sessionAExpired = buildAuthSession({
        user: USER_A,
        accessToken: tokenAExpired,
        refreshToken: 'rt-alice-switch',
        expiresAt: pastExp,
      });
      const sessionBExpired = buildAuthSession({
        user: USER_B,
        accessToken: tokenBExpired,
        refreshToken: 'rt-bob-switch',
        expiresAt: pastExp,
      });
      const sessionBRefreshed = buildAuthSession({
        user: USER_B,
        accessToken: tokenBRefreshed,
        refreshToken: 'rt-bob-switch-v2',
        expiresAt: futureExp,
      });

      let currentSession: AuthSession | null = sessionAExpired;
      let authListener:
        | ((event: string, session: AuthSession | null) => void)
        | null = null;

      const refreshDeferredA = createDeferred<SupabaseAuthResponseLike>();
      const refreshDeferredB = createDeferred<SupabaseAuthResponseLike>();
      let refreshInvocation = 0;

      const supabaseMock = {
        auth: {
          getSession: jest.fn(async () => ({
            data: { session: currentSession },
            error: null,
          })),
          refreshSession: jest.fn(() => {
            refreshInvocation += 1;
            return refreshInvocation === 1
              ? refreshDeferredA.promise
              : refreshDeferredB.promise;
          }),
          signOut: jest.fn(async () => {
            currentSession = null;
            authListener?.('SIGNED_OUT', null);
            return { error: null };
          }),
          signInWithPassword: jest.fn(async () => {
            currentSession = sessionBExpired;
            authListener?.('SIGNED_IN', sessionBExpired);
            return {
              data: { user: USER_B, session: sessionBExpired },
              error: null,
            };
          }),
          onAuthStateChange: jest.fn((cb) => {
            authListener = cb;
            return { data: { subscription: { unsubscribe: jest.fn() } } };
          }),
        },
      } as unknown as SupabaseClient & SupabaseAuthClientLike;

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider initialSession={sessionAExpired} supabaseClient={supabaseMock}>
          {children}
        </AuthProvider>
      );

      const { result } = await renderHook(() => useAuth(), { wrapper });

      const fetchMock = createSuccessFetchMock();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      // Paso 1: Refresh de Usuario A comienza
      const requestUserA = recommendRecipes(VALID_RECIPE_REQUEST, {
        authClient: supabaseMock,
      });
      await flushMicrotasks();
      expect(supabaseMock.auth.refreshSession).toHaveBeenCalledTimes(1);

      // Paso 2: Usuario A cierra sesión
      await act(async () => {
        await result.current.signOut();
      });

      // Paso 3: Usuario B inicia sesión (con sesión que también necesita refresh)
      await act(async () => {
        await result.current.signIn('bob@foodai.app', 'claveSeguraBob123');
      });
      expect(result.current.user?.id).toBe(USER_B.id);

      // Paso 4: Usuario B realiza una petición protegida ANTES de que termine el refresh de Usuario A.
      // NUNCA debe reutilizar refreshDeferredA; debe abrir su propio refreshDeferredB.
      const requestUserB = generateMealPlan(VALID_MEAL_PLAN_REQUEST, {
        authClient: supabaseMock,
      });
      await flushMicrotasks();
      expect(supabaseMock.auth.refreshSession).toHaveBeenCalledTimes(2);

      // El refresh de Usuario B termina primero
      currentSession = sessionBRefreshed;
      refreshDeferredB.resolve({
        data: { session: sessionBRefreshed },
        error: null,
      });

      const planBob = await requestUserB;
      expect(planBob.days).toHaveLength(3);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
        `Bearer ${tokenBRefreshed}`
      );

      // Paso 5: El refresh antiguo de Usuario A termina DESPUÉS con el token de Usuario A
      refreshDeferredA.resolve({
        data: {
          session: buildAuthSession({
            user: USER_A,
            accessToken: tokenARefreshed,
            refreshToken: 'rt-alice-switch-v2',
            expiresAt: futureExp,
          }),
        },
        error: null,
      });

      await expect(requestUserA).rejects.toMatchObject({
        name: 'RecipeApiError',
        code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        status: 401,
        isAuthError: true,
      });

      // Ninguna petición adicional fue enviada al backend tras resolver el refresh obsoleto de A
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('4. El refresco antiguo resuelve después de que Usuario B inicia sesión', () => {
    it('impide que un refresh tardío de Usuario A contamine solicitudes actuales o posteriores de Usuario B', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 60;
      const futureExp = Math.floor(Date.now() / 1000) + 3600;

      const tokenAExpired = buildSyntheticJwt(
        { sub: USER_A.id, exp: pastExp },
        'sig_a_exp_4'
      );
      const tokenALate = buildSyntheticJwt(
        { sub: USER_A.id, exp: futureExp },
        'sig_a_late_4'
      );
      const tokenBFresh = buildSyntheticJwt(
        { sub: USER_B.id, exp: futureExp },
        'sig_b_fresh_4'
      );

      let activeSession: SupabaseAuthSessionLike | null = buildAuthSession({
        user: USER_A,
        accessToken: tokenAExpired,
        refreshToken: 'rt-a-4',
        expiresAt: pastExp,
      });

      const refreshDeferredA = createDeferred<SupabaseAuthResponseLike>();
      const authClient: SupabaseAuthClientLike = {
        auth: {
          getSession: jest.fn(async () => ({
            data: { session: activeSession },
            error: null,
          })),
          refreshSession: jest.fn(() => refreshDeferredA.promise),
        },
      };

      const fetchMock = createSuccessFetchMock();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      // 1. Petición de Usuario A entra en refresh
      const pendingRequestA = recommendRecipes(VALID_RECIPE_REQUEST, { authClient });
      await flushMicrotasks();

      // 2. Cambio de sesión directo en almacenamiento a Usuario B (token vigente)
      activeSession = buildAuthSession({
        user: USER_B,
        accessToken: tokenBFresh,
        refreshToken: 'rt-b-4',
        expiresAt: futureExp,
      });

      // 3. Usuario B realiza una petición protegida mientras el refresh de A sigue pendiente
      const bobResult1 = await generateMealPlan(VALID_MEAL_PLAN_REQUEST, {
        authClient,
      });
      expect(bobResult1.days).toHaveLength(3);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
        `Bearer ${tokenBFresh}`
      );

      // 4. El refresh antiguo de Usuario A resuelve después de que Usuario B ya operó
      refreshDeferredA.resolve({
        data: {
          session: buildAuthSession({
            user: USER_A,
            accessToken: tokenALate,
            refreshToken: 'rt-a-4-rotated',
            expiresAt: futureExp,
          }),
        },
        error: null,
      });

      await expect(pendingRequestA).rejects.toMatchObject({
        code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        status: 401,
      });

      // 5. Nuevas peticiones de Usuario B siguen usando exclusivamente el token de Usuario B
      await analyzeIngredientsImage(VALID_IMAGE, { authClient });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe(
        `Bearer ${tokenBFresh}`
      );
    });

    it('bloquea también la fuga inversa si refreshSession resuelve con la nueva sesión de Usuario B para una petición iniciada por Usuario A', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 45;
      const futureExp = Math.floor(Date.now() / 1000) + 3600;

      const tokenAExpired = buildSyntheticJwt({ sub: USER_A.id, exp: pastExp }, 'sig_a');
      const tokenBFresh = buildSyntheticJwt({ sub: USER_B.id, exp: futureExp }, 'sig_b');

      const sessionB = buildAuthSession({
        user: USER_B,
        accessToken: tokenBFresh,
        refreshToken: 'rt-b-hijack',
        expiresAt: futureExp,
      });

      let activeSession: SupabaseAuthSessionLike | null = buildAuthSession({
        user: USER_A,
        accessToken: tokenAExpired,
        refreshToken: 'rt-a-orig',
        expiresAt: pastExp,
      });

      const refreshDeferred = createDeferred<SupabaseAuthResponseLike>();
      const authClient: SupabaseAuthClientLike = {
        auth: {
          getSession: jest.fn(async () => ({
            data: { session: activeSession },
            error: null,
          })),
          refreshSession: jest.fn(() => refreshDeferred.promise),
        },
      };

      const fetchMock = createSuccessFetchMock();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      // Solicitud iniciada con el payload privado de Usuario A
      const requestUserA = recommendRecipes(VALID_RECIPE_REQUEST, { authClient });
      await flushMicrotasks();

      // El estado subyacente cambia a Usuario B y el refresh en vuelo resuelve erróneamente con sessionB
      activeSession = sessionB;
      refreshDeferred.resolve({
        data: { session: sessionB },
        error: null,
      });

      await expect(requestUserA).rejects.toMatchObject({
        code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        status: 401,
        isAuthError: true,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rechaza un token de una sesión superada incluso si el mismo Usuario A cerró sesión y volvió a iniciar sesión', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 60;
      const futureExp = Math.floor(Date.now() / 1000) + 3600;

      const tokenASession1Expired = buildSyntheticJwt(
        { sub: USER_A.id, exp: pastExp },
        'sig_a_s1_exp'
      );
      const tokenASession1Refreshed = buildSyntheticJwt(
        { sub: USER_A.id, exp: futureExp },
        'sig_a_s1_refreshed'
      );
      const tokenASession2Fresh = buildSyntheticJwt(
        { sub: USER_A.id, exp: futureExp },
        'sig_a_s2_fresh'
      );

      let activeSession: SupabaseAuthSessionLike | null = buildAuthSession({
        user: USER_A,
        accessToken: tokenASession1Expired,
        refreshToken: 'rt-alice-session-1',
        expiresAt: pastExp,
      });

      const refreshDeferredSession1 = createDeferred<SupabaseAuthResponseLike>();
      const authClient: SupabaseAuthClientLike = {
        auth: {
          getSession: jest.fn(async () => ({
            data: { session: activeSession },
            error: null,
          })),
          refreshSession: jest.fn(() => refreshDeferredSession1.promise),
        },
      };

      const fetchMock = createSuccessFetchMock();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const requestFromSession1 = recommendRecipes(VALID_RECIPE_REQUEST, {
        authClient,
      });
      await flushMicrotasks();

      // Usuario A cierra sesión y vuelve a iniciar una nueva sesión independiente (Session 2)
      activeSession = buildAuthSession({
        user: USER_A,
        accessToken: tokenASession2Fresh,
        refreshToken: 'rt-alice-session-2',
        expiresAt: futureExp,
      });

      // El refresh de la Sesión 1 resuelve tardíamente con un token de la Sesión 1 ya superada
      refreshDeferredSession1.resolve({
        data: {
          session: buildAuthSession({
            user: USER_A,
            accessToken: tokenASession1Refreshed,
            refreshToken: 'rt-alice-session-1-rotated',
            expiresAt: futureExp,
          }),
        },
        error: null,
      });

      await expect(requestFromSession1).rejects.toMatchObject({
        code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        status: 401,
      });
      expect(fetchMock).not.toHaveBeenCalled();

      // Una nueva petición legítima bajo la Sesión 2 utiliza el token de la Sesión 2
      await recommendRecipes(VALID_RECIPE_REQUEST, { authClient });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
        `Bearer ${tokenASession2Fresh}`
      );
    });
  });

  describe('5. El refresco antiguo rechaza después del cambio de cuenta', () => {
    it('no afecta la sesión activa ni el refresh concurrente de Usuario B cuando el refresh antiguo de Usuario A rechaza', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 50;
      const futureExp = Math.floor(Date.now() / 1000) + 3600;

      const secretRefreshTokenA = 'rt-ultra-secret-alice-do-not-log';
      const tokenAExpired = buildSyntheticJwt(
        { sub: USER_A.id, exp: pastExp },
        'sig_a_5'
      );
      const tokenBExpired = buildSyntheticJwt(
        { sub: USER_B.id, exp: pastExp },
        'sig_b_5_exp'
      );
      const tokenBRefreshed = buildSyntheticJwt(
        { sub: USER_B.id, exp: futureExp },
        'sig_b_5_new'
      );

      const sessionA = buildAuthSession({
        user: USER_A,
        accessToken: tokenAExpired,
        refreshToken: secretRefreshTokenA,
        expiresAt: pastExp,
      });
      const sessionBExpired = buildAuthSession({
        user: USER_B,
        accessToken: tokenBExpired,
        refreshToken: 'rt-bob-5',
        expiresAt: pastExp,
      });
      const sessionBRefreshed = buildAuthSession({
        user: USER_B,
        accessToken: tokenBRefreshed,
        refreshToken: 'rt-bob-5-rotated',
        expiresAt: futureExp,
      });

      let currentSession: AuthSession | null = sessionA;
      let authListener:
        | ((event: string, session: AuthSession | null) => void)
        | null = null;

      const refreshDeferredA = createDeferred<SupabaseAuthResponseLike>();
      const refreshDeferredB = createDeferred<SupabaseAuthResponseLike>();
      let callIndex = 0;

      const supabaseMock = {
        auth: {
          getSession: jest.fn(async () => ({
            data: { session: currentSession },
            error: null,
          })),
          refreshSession: jest.fn(() => {
            callIndex += 1;
            return callIndex === 1
              ? refreshDeferredA.promise
              : refreshDeferredB.promise;
          }),
          signOut: jest.fn(async () => {
            currentSession = null;
            authListener?.('SIGNED_OUT', null);
            return { error: null };
          }),
          signInWithPassword: jest.fn(async () => {
            currentSession = sessionBExpired;
            authListener?.('SIGNED_IN', sessionBExpired);
            return { data: { user: USER_B, session: sessionBExpired }, error: null };
          }),
          onAuthStateChange: jest.fn((cb) => {
            authListener = cb;
            return { data: { subscription: { unsubscribe: jest.fn() } } };
          }),
        },
      } as unknown as SupabaseClient & SupabaseAuthClientLike;

      const consoleSpies = [
        jest.spyOn(console, 'log').mockImplementation(() => {}),
        jest.spyOn(console, 'info').mockImplementation(() => {}),
        jest.spyOn(console, 'warn').mockImplementation(() => {}),
        jest.spyOn(console, 'error').mockImplementation(() => {}),
        jest.spyOn(console, 'debug').mockImplementation(() => {}),
      ];

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider initialSession={sessionA} supabaseClient={supabaseMock}>
          {children}
        </AuthProvider>
      );
      const { result } = await renderHook(() => useAuth(), { wrapper });

      const fetchMock = createSuccessFetchMock();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      // 1. Inicia refresh de Usuario A
      const staleRequestA = recommendRecipes(VALID_RECIPE_REQUEST, {
        authClient: supabaseMock,
      });
      await flushMicrotasks();

      // 2. Usuario A sale e ingresa Usuario B
      await act(async () => {
        await result.current.signOut();
      });
      await act(async () => {
        await result.current.signIn('bob@foodai.app', 'claveSeguraBob123');
      });

      // 3. Usuario B inicia su propio refresh
      const activeRequestB = generateMealPlan(VALID_MEAL_PLAN_REQUEST, {
        authClient: supabaseMock,
      });
      await flushMicrotasks();
      expect(supabaseMock.auth.refreshSession).toHaveBeenCalledTimes(2);

      // 4. El refresh antiguo de Usuario A RECHAZA con excepción después del cambio de cuenta
      refreshDeferredA.reject(
        new Error(`Refresh token revoked: ${secretRefreshTokenA}`)
      );

      let capturedErrorA: Error | null = null;
      try {
        await staleRequestA;
      } catch (err) {
        capturedErrorA = err as Error;
      }

      expect(capturedErrorA).toMatchObject({
        name: 'RecipeApiError',
        code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        status: 401,
        isAuthError: true,
      });
      expect(capturedErrorA?.message).not.toContain(secretRefreshTokenA);

      // 5. El refresh de Usuario B sigue intacto y completa exitosamente
      currentSession = sessionBRefreshed;
      refreshDeferredB.resolve({
        data: { session: sessionBRefreshed },
        error: null,
      });

      const bobPlan = await activeRequestB;
      expect(bobPlan.days).toHaveLength(3);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
        `Bearer ${tokenBRefreshed}`
      );

      for (const spy of consoleSpies) {
        expect( JSON.stringify(spy.mock.calls) ).not.toContain(secretRefreshTokenA);
      }
    });
  });

  describe('6. Cancelación de solicitud (AbortSignal) durante un refresco pendiente', () => {
    it('cancela de inmediato la petición abortada sin enviar fetch y sin interrumpir otra petición concurrente del mismo usuario', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 30;
      const futureExp = Math.floor(Date.now() / 1000) + 3600;

      const tokenAExpired = buildSyntheticJwt(
        { sub: USER_A.id, exp: pastExp },
        'sig_abort_exp'
      );
      const tokenARefreshed = buildSyntheticJwt(
        { sub: USER_A.id, exp: futureExp },
        'sig_abort_new'
      );

      let currentSession: AuthSession = buildAuthSession({
        user: USER_A,
        accessToken: tokenAExpired,
        refreshToken: 'rt-abort-shared',
        expiresAt: pastExp,
      });

      const refreshDeferred = createDeferred<SupabaseAuthResponseLike>();
      const authClient: SupabaseAuthClientLike = {
        auth: {
          getSession: jest.fn(async () => ({
            data: { session: currentSession },
            error: null,
          })),
          refreshSession: jest.fn(() => refreshDeferred.promise),
        },
      };

      const fetchMock = createSuccessFetchMock();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const abortController1 = new AbortController();
      const abortController2 = new AbortController();

      const cancelledRequest = recommendRecipes(VALID_RECIPE_REQUEST, {
        authClient,
        signal: abortController1.signal,
      });
      const survivingRequest = generateMealPlan(VALID_MEAL_PLAN_REQUEST, {
        authClient,
        signal: abortController2.signal,
      });

      await flushMicrotasks();
      expect(authClient.auth.refreshSession).toHaveBeenCalledTimes(1);

      // Cancelar la primera petición ANTES de que resuelva refreshDeferred
      abortController1.abort();

      await expect(cancelledRequest).rejects.toMatchObject({
        name: 'RecipeApiError',
        code: 'REQUEST_ABORTED',
      });
      expect(fetchMock).not.toHaveBeenCalled();

      // Ahora resuelve el refresh compartido: la segunda petición debe completarse normalmente
      currentSession = buildAuthSession({
        user: USER_A,
        accessToken: tokenARefreshed,
        refreshToken: 'rt-abort-shared-v2',
        expiresAt: futureExp,
      });
      refreshDeferred.resolve({
        data: { session: currentSession },
        error: null,
      });

      const survivingPlan = await survivingRequest;
      expect(survivingPlan.days).toHaveLength(3);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
        `Bearer ${tokenARefreshed}`
      );
    });
  });

  describe('7. Garantía integral: jamás se envía Authorization de un usuario anterior ni se exponen tokens', () => {
    it('garantiza cero encabezados de Usuario A en los tres clientes (incluyendo multipart FormData) tras cambio concurrente a Usuario B', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 60;
      const futureExp = Math.floor(Date.now() / 1000) + 3600;

      const tokenAExpired = buildSyntheticJwt(
        { sub: USER_A.id, exp: pastExp },
        'sig_a_never_send_1'
      );
      const tokenARefreshed = buildSyntheticJwt(
        { sub: USER_A.id, exp: futureExp },
        'sig_a_never_send_2'
      );
      const tokenBFresh = buildSyntheticJwt(
        { sub: USER_B.id, exp: futureExp },
        'sig_b_only_valid'
      );
      const secretRefreshA = 'rt-secret-alice-7';
      const secretRefreshB = 'rt-secret-bob-7';

      const sessionA = buildAuthSession({
        user: USER_A,
        accessToken: tokenAExpired,
        refreshToken: secretRefreshA,
        expiresAt: pastExp,
      });
      const sessionB = buildAuthSession({
        user: USER_B,
        accessToken: tokenBFresh,
        refreshToken: secretRefreshB,
        expiresAt: futureExp,
      });

      let currentSession: AuthSession | null = sessionA;
      let authListener:
        | ((event: string, session: AuthSession | null) => void)
        | null = null;
      const refreshDeferredA = createDeferred<SupabaseAuthResponseLike>();

      const supabaseMock = {
        auth: {
          getSession: jest.fn(async () => ({
            data: { session: currentSession },
            error: null,
          })),
          refreshSession: jest.fn(() => refreshDeferredA.promise),
          signOut: jest.fn(async () => {
            currentSession = null;
            authListener?.('SIGNED_OUT', null);
            return { error: null };
          }),
          signInWithPassword: jest.fn(async () => {
            currentSession = sessionB;
            authListener?.('SIGNED_IN', sessionB);
            return { data: { user: USER_B, session: sessionB }, error: null };
          }),
          onAuthStateChange: jest.fn((cb) => {
            authListener = cb;
            return { data: { subscription: { unsubscribe: jest.fn() } } };
          }),
        },
      } as unknown as SupabaseClient & SupabaseAuthClientLike;

      const consoleSpies = [
        jest.spyOn(console, 'log').mockImplementation(() => {}),
        jest.spyOn(console, 'info').mockImplementation(() => {}),
        jest.spyOn(console, 'warn').mockImplementation(() => {}),
        jest.spyOn(console, 'error').mockImplementation(() => {}),
        jest.spyOn(console, 'debug').mockImplementation(() => {}),
      ];

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider initialSession={sessionA} supabaseClient={supabaseMock}>
          {children}
        </AuthProvider>
      );
      const { result } = await renderHook(() => useAuth(), { wrapper });

      const fetchMock = createSuccessFetchMock();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      // Usuario A dispara simultáneamente los 3 endpoints protegidos mientras su sesión requiere refresh
      const aRecipes = recommendRecipes(VALID_RECIPE_REQUEST, {
        authClient: supabaseMock,
      });
      const aScanner = analyzeIngredientsImage(VALID_IMAGE, {
        authClient: supabaseMock,
      });
      const aMealPlan = generateMealPlan(VALID_MEAL_PLAN_REQUEST, {
        authClient: supabaseMock,
      });
      await flushMicrotasks();

      expect(supabaseMock.auth.refreshSession).toHaveBeenCalledTimes(1);
      expect(fetchMock).not.toHaveBeenCalled();

      // Cambio de cuenta concurrente: Usuario A -> signOut -> Usuario B -> signIn
      await act(async () => {
        await result.current.signOut();
      });
      await act(async () => {
        await result.current.signIn('bob@foodai.app', 'claveSeguraBob123');
      });

      // Usuario B invoca los 3 endpoints protegidos
      const [bRecipes, bScanner, bMealPlan] = await Promise.all([
        recommendRecipes(VALID_RECIPE_REQUEST, { authClient: supabaseMock }),
        analyzeIngredientsImage(VALID_IMAGE, { authClient: supabaseMock }),
        generateMealPlan(VALID_MEAL_PLAN_REQUEST, { authClient: supabaseMock }),
      ]);

      expect(bRecipes).toHaveLength(1);
      expect(bScanner).toHaveLength(1);
      expect(bMealPlan.days).toHaveLength(3);

      // Ahora finaliza tardíamente el refresh de Usuario A
      refreshDeferredA.resolve({
        data: {
          session: buildAuthSession({
            user: USER_A,
            accessToken: tokenARefreshed,
            refreshToken: 'rt-secret-alice-7-rotated',
            expiresAt: futureExp,
          }),
        },
        error: null,
      });

      const aOutcomes = await Promise.allSettled([aRecipes, aScanner, aMealPlan]);
      for (const outcome of aOutcomes) {
        expect(outcome.status).toBe('rejected');
        if (outcome.status === 'rejected') {
          expect(outcome.reason).toMatchObject({
            code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
            status: 401,
            isAuthError: true,
          });
        }
      }

      // Exactamente 3 llamadas a fetch (solo las de Usuario B); CERO encabezados con tokens de Usuario A
      expect(fetchMock).toHaveBeenCalledTimes(3);
      for (const [url, init] of fetchMock.mock.calls) {
        expect(init.headers.Authorization).toBe(`Bearer ${tokenBFresh}`);
        expect(init.headers.Authorization).not.toContain(tokenAExpired);
        expect(init.headers.Authorization).not.toContain(tokenARefreshed);
        expect(String(url)).not.toContain(tokenBFresh);

        if (String(url).includes('/ingredients/analyze')) {
          // Multipart FormData no define Content-Type manual para preservar boundary
          expect(init.headers['Content-Type']).toBeUndefined();
          expect(init.body).toBeInstanceOf(FormData);
        }
      }

      // Ningún refresh_token ni access_token aparece jamás en logs de consola
      const serializedLogs = consoleSpies
        .map((spy) => JSON.stringify(spy.mock.calls))
        .join(' ');
      expect(serializedLogs).not.toContain(secretRefreshA);
      expect(serializedLogs).not.toContain(secretRefreshB);
      expect(serializedLogs).not.toContain(tokenAExpired);
      expect(serializedLogs).not.toContain(tokenARefreshed);
      expect(serializedLogs).not.toContain(tokenBFresh);
    });
  });

  describe('8. Bloqueo fail-closed cuando la identidad de sesión no puede establecerse con seguridad', () => {
    it('no envía ninguna petición de IA ni confía en el claim JWT sub sin verificar si session.user falta o es inválido', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 45;
      const futureExp = Math.floor(Date.now() / 1000) + 3600;

      // Token con claim `sub` en el payload no verificado para demostrar que jamás se usa como fuente de identidad
      const jwtWithUnverifiedSub = buildSyntheticJwt(
        { sub: 'spoofed-unverified-jwt-sub', exp: futureExp },
        'sig_unverified'
      );
      const expiredJwtWithUnverifiedSub = buildSyntheticJwt(
        { sub: 'spoofed-unverified-jwt-sub', exp: pastExp },
        'sig_unverified_exp'
      );

      const fetchMock = createSuccessFetchMock();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const malformedSessions: SupabaseAuthSessionLike[] = [
        {
          access_token: jwtWithUnverifiedSub,
          expires_at: futureExp,
          user: null,
        },
        {
          access_token: jwtWithUnverifiedSub,
          expires_at: futureExp,
          user: {},
        },
        {
          access_token: jwtWithUnverifiedSub,
          expires_at: futureExp,
          user: { id: '' },
        },
        {
          access_token: jwtWithUnverifiedSub,
          expires_at: futureExp,
          user: { id: '   ' },
        },
      ];

      for (const invalidSession of malformedSessions) {
        const clientWithMalformedIdentity: SupabaseAuthClientLike = {
          auth: {
            getSession: jest.fn(async () => ({
              data: { session: invalidSession },
              error: null,
            })),
            refreshSession: jest.fn(),
          },
        };

        await expect(
          recommendRecipes(VALID_RECIPE_REQUEST, {
            authClient: clientWithMalformedIdentity,
          })
        ).rejects.toMatchObject({
          code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
          status: 401,
          isAuthError: true,
        });

        await expect(
          analyzeIngredientsImage(VALID_IMAGE, {
            authClient: clientWithMalformedIdentity,
          })
        ).rejects.toMatchObject({
          code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
          status: 401,
          isAuthError: true,
        });

        await expect(
          generateMealPlan(VALID_MEAL_PLAN_REQUEST, {
            authClient: clientWithMalformedIdentity,
          })
        ).rejects.toMatchObject({
          code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
          status: 401,
          isAuthError: true,
        });
      }

      // Cliente completo con ciclo de vida (onAuthStateChange) cuya sesión expirada carece de objeto `user`:
      // no puede establecerse la identidad para ejecutar refresh y debe fallar cerrado sin refrescar ni llamar a fetch.
      const refreshSpy = jest.fn();
      const fullClientMissingUserOnRefresh = {
        auth: {
          getSession: jest.fn(async () => ({
            data: {
              session: {
                access_token: expiredJwtWithUnverifiedSub,
                refresh_token: 'rt-orphan',
                expires_at: pastExp,
              },
            },
            error: null,
          })),
          refreshSession: refreshSpy,
          onAuthStateChange: jest.fn(() => ({
            data: { subscription: { unsubscribe: jest.fn() } },
          })),
        },
      } as unknown as SupabaseAuthClientLike;

      await expect(
        recommendRecipes(VALID_RECIPE_REQUEST, {
          authClient: fullClientMissingUserOnRefresh,
        })
      ).rejects.toMatchObject({
        code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        status: 401,
        isAuthError: true,
      });
      expect(refreshSpy).not.toHaveBeenCalled();

      // Sesión inicial con usuario verificado cuyo refresh devuelve una sesión sin identidad de usuario verificable
      const clientLosingIdentityOnRefresh: SupabaseAuthClientLike = {
        auth: {
          getSession: jest.fn(async () => ({
            data: {
              session: buildAuthSession({
                user: USER_A,
                accessToken: expiredJwtWithUnverifiedSub,
                refreshToken: 'rt-valid-start',
                expiresAt: pastExp,
              }),
            },
            error: null,
          })),
          refreshSession: jest.fn(async () => ({
            data: {
              session: {
                access_token: jwtWithUnverifiedSub,
                expires_at: futureExp,
                user: null,
              },
            },
            error: null,
          })),
        },
      };

      await expect(
        generateMealPlan(VALID_MEAL_PLAN_REQUEST, {
          authClient: clientLosingIdentityOnRefresh,
        })
      ).rejects.toMatchObject({
        code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        status: 401,
        isAuthError: true,
      });

      // Cero peticiones de IA enviadas en todos los escenarios sin identidad verificable
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rechaza con 401 y cero llamadas a fetch un access_token vigente (no expirado) sin campo user en un cliente tipo Supabase completo y en el cliente real de producción', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const nonExpiredJwtWithoutVerifiedUser = buildSyntheticJwt(
        { sub: 'unverified-jwt-sub-claim', role: 'authenticated', exp: futureExp },
        'sig_non_expired_no_user'
      );

      const fetchMock = createSuccessFetchMock();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      // 1. Cliente tipo Supabase completo (con ciclo de vida / métodos completos de Auth) cuya sesión vigente carece de `user`
      const fullClientRefreshSpy = jest.fn();
      const fullSupabaseLikeClient = {
        auth: {
          getSession: jest.fn(async () => ({
            data: {
              session: {
                access_token: nonExpiredJwtWithoutVerifiedUser,
                refresh_token: 'rt-full-client-no-user',
                expires_at: futureExp,
              },
            },
            error: null,
          })),
          refreshSession: fullClientRefreshSpy,
          onAuthStateChange: jest.fn(() => ({
            data: { subscription: { unsubscribe: jest.fn() } },
          })),
          signInWithPassword: jest.fn(),
          signOut: jest.fn(),
          getUser: jest.fn(),
        },
      } as unknown as SupabaseAuthClientLike;

      await expect(
        getSupabaseAuthHeaders({ authClient: fullSupabaseLikeClient })
      ).rejects.toMatchObject({
        code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        status: 401,
        isAuthError: true,
        message: AUTH_ERROR_MESSAGES.AUTH_TOKEN_REQUIRED,
      });

      await expect(
        recommendRecipes(VALID_RECIPE_REQUEST, { authClient: fullSupabaseLikeClient })
      ).rejects.toMatchObject({
        name: 'RecipeApiError',
        code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        status: 401,
        isAuthError: true,
      });

      await expect(
        analyzeIngredientsImage(VALID_IMAGE, { authClient: fullSupabaseLikeClient })
      ).rejects.toMatchObject({
        name: 'ScannerApiError',
        code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        status: 401,
        isAuthError: true,
      });

      await expect(
        generateMealPlan(VALID_MEAL_PLAN_REQUEST, { authClient: fullSupabaseLikeClient })
      ).rejects.toMatchObject({
        name: 'MealPlanApiError',
        code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        status: 401,
        isAuthError: true,
      });

      expect(fullClientRefreshSpy).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();

      // 2. Cliente Supabase real de producción (sin inyectar authClient) con token vigente y sin campo `user`
      jest.spyOn(supabase.auth, 'getSession').mockImplementation(
        async () =>
          ({
            data: {
              session: {
                access_token: nonExpiredJwtWithoutVerifiedUser,
                refresh_token: 'rt-prod-client-no-user',
                expires_at: futureExp,
              },
            },
            error: null,
          }) as any
      );

      await expect(getSupabaseAuthHeaders()).rejects.toMatchObject({
        code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        status: 401,
        isAuthError: true,
      });

      await expect(recommendRecipes(VALID_RECIPE_REQUEST)).rejects.toMatchObject({
        name: 'RecipeApiError',
        code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        status: 401,
        isAuthError: true,
      });

      await expect(analyzeIngredientsImage(VALID_IMAGE)).rejects.toMatchObject({
        name: 'ScannerApiError',
        code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        status: 401,
        isAuthError: true,
      });

      await expect(generateMealPlan(VALID_MEAL_PLAN_REQUEST)).rejects.toMatchObject({
        name: 'MealPlanApiError',
        code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        status: 401,
        isAuthError: true,
      });

      // Cero peticiones protegidas enviadas al backend
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('9. Sesiones obsoletas durante la lectura inicial getSession() (Transiciones de Epoch)', () => {
    it('rechaza con 401 y cero fetch obsoletos cuando el MISMO usuario cierra sesión y vuelve a iniciar sesión durante getSession() inicial', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;

      const tokenASession1Stale = buildSyntheticJwt(
        { sub: USER_A.id, jti: 'alice-session-1-old', exp: futureExp },
        'sig_alice_s1_old'
      );
      const tokenASession2Fresh = buildSyntheticJwt(
        { sub: USER_A.id, jti: 'alice-session-2-new', exp: futureExp },
        'sig_alice_s2_new'
      );

      const sessionA1 = buildAuthSession({
        user: USER_A,
        accessToken: tokenASession1Stale,
        refreshToken: 'rt-alice-initial-s1',
        expiresAt: futureExp,
      });
      const sessionA2 = buildAuthSession({
        user: USER_A,
        accessToken: tokenASession2Fresh,
        refreshToken: 'rt-alice-relogin-s2',
        expiresAt: futureExp,
      });

      let currentSession: AuthSession | null = sessionA1;
      let authListener:
        | ((event: string, session: AuthSession | null) => void)
        | null = null;

      const initialGetSessionDeferred1 = createDeferred<SupabaseAuthResponseLike>();
      const initialGetSessionDeferred2 = createDeferred<SupabaseAuthResponseLike>();
      const initialGetSessionDeferred3 = createDeferred<SupabaseAuthResponseLike>();
      let getSessionCallCount = 0;

      const supabaseMock = {
        auth: {
          getSession: jest.fn(() => {
            getSessionCallCount += 1;
            if (getSessionCallCount === 1) {
              return initialGetSessionDeferred1.promise;
            }
            if (getSessionCallCount === 2) {
              return initialGetSessionDeferred2.promise;
            }
            if (getSessionCallCount === 3) {
              return initialGetSessionDeferred3.promise;
            }
            return Promise.resolve({
              data: { session: currentSession },
              error: null,
            });
          }),
          refreshSession: jest.fn(),
          signOut: jest.fn(async () => {
            currentSession = null;
            authListener?.('SIGNED_OUT', null);
            return { error: null };
          }),
          signInWithPassword: jest.fn(async () => {
            currentSession = sessionA2;
            authListener?.('SIGNED_IN', sessionA2);
            return {
              data: { user: USER_A, session: sessionA2 },
              error: null,
            };
          }),
          onAuthStateChange: jest.fn((cb) => {
            authListener = cb;
            return { data: { subscription: { unsubscribe: jest.fn() } } };
          }),
        },
      } as unknown as SupabaseClient & SupabaseAuthClientLike;

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider initialSession={sessionA1} supabaseClient={supabaseMock}>
          {children}
        </AuthProvider>
      );

      const { result } = await renderHook(() => useAuth(), { wrapper });
      expect(result.current.user?.id).toBe(USER_A.id);

      const fetchMock = createSuccessFetchMock();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      // 1. Iniciar las 3 peticiones protegidas bajo la Sesión 1 de Alice: quedan bloqueadas en getSession()
      const staleRecipesPromise = recommendRecipes(VALID_RECIPE_REQUEST, {
        authClient: supabaseMock,
      });
      const staleScannerPromise = analyzeIngredientsImage(VALID_IMAGE, {
        authClient: supabaseMock,
      });
      const staleMealPlanPromise = generateMealPlan(VALID_MEAL_PLAN_REQUEST, {
        authClient: supabaseMock,
      });
      await flushMicrotasks();

      expect(getSessionCallCount).toBe(3);
      expect(fetchMock).not.toHaveBeenCalled();

      // 2. Mientras getSession() sigue pendiente, la MISMA usuaria Alice cierra sesión y vuelve a iniciar sesión
      await act(async () => {
        await result.current.signOut();
      });
      expect(result.current.isAuthenticated).toBe(false);

      await act(async () => {
        await result.current.signIn('alice@foodai.app', 'claveSeguraAlice123');
      });
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user?.id).toBe(USER_A.id);

      // 3. Ahora resuelven tardíamente las lecturas getSession() iniciadas antes de la transición con sessionA1
      initialGetSessionDeferred1.resolve({
        data: { session: sessionA1 },
        error: null,
      });
      initialGetSessionDeferred2.resolve({
        data: { session: sessionA1 },
        error: null,
      });
      initialGetSessionDeferred3.resolve({
        data: { session: sessionA1 },
        error: null,
      });

      await expect(staleRecipesPromise).rejects.toMatchObject({
        name: 'RecipeApiError',
        code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        status: 401,
        isAuthError: true,
        message: AUTH_ERROR_MESSAGES.AUTH_TOKEN_REQUIRED,
      });
      await expect(staleScannerPromise).rejects.toMatchObject({
        name: 'ScannerApiError',
        code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        status: 401,
        isAuthError: true,
        message: AUTH_ERROR_MESSAGES.AUTH_TOKEN_REQUIRED,
      });
      await expect(staleMealPlanPromise).rejects.toMatchObject({
        name: 'MealPlanApiError',
        code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        status: 401,
        isAuthError: true,
        message: AUTH_ERROR_MESSAGES.AUTH_TOKEN_REQUIRED,
      });

      // Ninguna petición obsoleta llegó jamás a fetch
      expect(fetchMock).not.toHaveBeenCalled();

      // 4. Una nueva petición iniciada legítimamente bajo la Sesión 2 de Alice sí se autoriza con tokenASession2Fresh
      const freshRecipes = await recommendRecipes(VALID_RECIPE_REQUEST, {
        authClient: supabaseMock,
      });
      expect(freshRecipes).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
        `Bearer ${tokenASession2Fresh}`
      );
      expect(fetchMock.mock.calls[0][1].headers.Authorization).not.toContain(
        tokenASession1Stale
      );
    });

    it('rechaza lecturas getSession() obsoletas tras signOut e inicio de sesión de un usuario diferente sin contaminar al nuevo usuario', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;

      const tokenAStale = buildSyntheticJwt(
        { sub: USER_A.id, jti: 'alice-pre-switch', exp: futureExp },
        'sig_alice_pre_switch'
      );
      const tokenBActive = buildSyntheticJwt(
        { sub: USER_B.id, jti: 'bob-post-switch', exp: futureExp },
        'sig_bob_post_switch'
      );

      const sessionA = buildAuthSession({
        user: USER_A,
        accessToken: tokenAStale,
        refreshToken: 'rt-alice-getsession-switch',
        expiresAt: futureExp,
      });
      const sessionB = buildAuthSession({
        user: USER_B,
        accessToken: tokenBActive,
        refreshToken: 'rt-bob-getsession-switch',
        expiresAt: futureExp,
      });

      let currentSession: AuthSession | null = sessionA;
      let authListener:
        | ((event: string, session: AuthSession | null) => void)
        | null = null;

      const deferredGetSessionUserA = createDeferred<SupabaseAuthResponseLike>();
      let callCount = 0;

      const supabaseMock = {
        auth: {
          getSession: jest.fn(() => {
            callCount += 1;
            if (callCount === 1) {
              return deferredGetSessionUserA.promise;
            }
            return Promise.resolve({
              data: { session: currentSession },
              error: null,
            });
          }),
          refreshSession: jest.fn(),
          signOut: jest.fn(async () => {
            currentSession = null;
            authListener?.('SIGNED_OUT', null);
            return { error: null };
          }),
          signInWithPassword: jest.fn(async () => {
            currentSession = sessionB;
            authListener?.('SIGNED_IN', sessionB);
            return {
              data: { user: USER_B, session: sessionB },
              error: null,
            };
          }),
          onAuthStateChange: jest.fn((cb) => {
            authListener = cb;
            return { data: { subscription: { unsubscribe: jest.fn() } } };
          }),
        },
      } as unknown as SupabaseClient & SupabaseAuthClientLike;

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider initialSession={sessionA} supabaseClient={supabaseMock}>
          {children}
        </AuthProvider>
      );

      const { result } = await renderHook(() => useAuth(), { wrapper });

      const fetchMock = createSuccessFetchMock();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      // 1. Petición de Usuario A queda pendiente en getSession()
      const staleRequestA = generateMealPlan(VALID_MEAL_PLAN_REQUEST, {
        authClient: supabaseMock,
      });
      await flushMicrotasks();
      expect(fetchMock).not.toHaveBeenCalled();

      // 2. Usuario A cierra sesión e inicia sesión Usuario B mientras getSession() de A sigue en vuelo
      await act(async () => {
        await result.current.signOut();
      });
      await act(async () => {
        await result.current.signIn('bob@foodai.app', 'claveSeguraBob123');
      });
      expect(result.current.user?.id).toBe(USER_B.id);

      // 3. Usuario B realiza una petición protegida concurrente antes de que resuelva el getSession() viejo de A
      const bobRecipes = await recommendRecipes(VALID_RECIPE_REQUEST, {
        authClient: supabaseMock,
      });
      expect(bobRecipes).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
        `Bearer ${tokenBActive}`
      );

      // 4. El getSession() obsoleto de Usuario A resuelve tardíamente con sessionA vigente
      deferredGetSessionUserA.resolve({
        data: { session: sessionA },
        error: null,
      });

      await expect(staleRequestA).rejects.toMatchObject({
        name: 'MealPlanApiError',
        code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        status: 401,
        isAuthError: true,
      });

      // 5. La sesión activa de Usuario B no fue alterada por la resolución tardía de A
      const bobScan = await analyzeIngredientsImage(VALID_IMAGE, {
        authClient: supabaseMock,
      });
      expect(bobScan).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe(
        `Bearer ${tokenBActive}`
      );

      for (const [, init] of fetchMock.mock.calls) {
        expect(init.headers.Authorization).toBe(`Bearer ${tokenBActive}`);
        expect(init.headers.Authorization).not.toContain(tokenAStale);
      }
    });

    it('preserva eventos normales TOKEN_REFRESHED de la misma sesión ininterrumpida durante getSession() y mantiene single-flight', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 20;
      const futureExp = Math.floor(Date.now() / 1000) + 3600;

      const tokenAV1Initial = buildSyntheticJwt(
        { sub: USER_A.id, jti: 'alice-uninterrupted-v1', exp: pastExp },
        'sig_alice_uninterrupted_v1'
      );
      const tokenAV2Refreshed = buildSyntheticJwt(
        { sub: USER_A.id, jti: 'alice-uninterrupted-v2', exp: futureExp },
        'sig_alice_uninterrupted_v2'
      );

      const sessionAV1 = buildAuthSession({
        user: USER_A,
        accessToken: tokenAV1Initial,
        refreshToken: 'rt-alice-uninterrupted-v1',
        expiresAt: pastExp,
      });
      const sessionAV2 = buildAuthSession({
        user: USER_A,
        accessToken: tokenAV2Refreshed,
        refreshToken: 'rt-alice-uninterrupted-v2',
        expiresAt: futureExp,
      });

      let currentSession: AuthSession | null = sessionAV1;
      let authListener:
        | ((event: string, session: AuthSession | null) => void)
        | null = null;

      const deferredInitialRead1 = createDeferred<SupabaseAuthResponseLike>();
      const deferredInitialRead2 = createDeferred<SupabaseAuthResponseLike>();
      const deferredInitialRead3 = createDeferred<SupabaseAuthResponseLike>();
      const deferredRefresh = createDeferred<SupabaseAuthResponseLike>();
      let getSessionCalls = 0;

      const supabaseMock = {
        auth: {
          getSession: jest.fn(() => {
            getSessionCalls += 1;
            if (getSessionCalls === 1) {
              return deferredInitialRead1.promise;
            }
            if (getSessionCalls === 2) {
              return deferredInitialRead2.promise;
            }
            if (getSessionCalls === 3) {
              return deferredInitialRead3.promise;
            }
            return Promise.resolve({
              data: { session: currentSession },
              error: null,
            });
          }),
          refreshSession: jest.fn(() => deferredRefresh.promise),
          signInWithPassword: jest.fn(),
          signOut: jest.fn(),
          onAuthStateChange: jest.fn((cb) => {
            authListener = cb;
            return { data: { subscription: { unsubscribe: jest.fn() } } };
          }),
        },
      } as unknown as SupabaseClient & SupabaseAuthClientLike;

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider initialSession={sessionAV1} supabaseClient={supabaseMock}>
          {children}
        </AuthProvider>
      );

      const { result } = await renderHook(() => useAuth(), { wrapper });
      expect(result.current.user?.id).toBe(USER_A.id);

      const fetchMock = createSuccessFetchMock();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      // 3 solicitudes concurrentes entran en su lectura inicial getSession()
      const recipesReq = recommendRecipes(VALID_RECIPE_REQUEST, {
        authClient: supabaseMock,
      });
      const scannerReq = analyzeIngredientsImage(VALID_IMAGE, {
        authClient: supabaseMock,
      });
      const mealPlanReq = generateMealPlan(VALID_MEAL_PLAN_REQUEST, {
        authClient: supabaseMock,
      });
      await flushMicrotasks();
      expect(getSessionCalls).toBe(3);

      // Rotación normal de la misma sesión ininterrumpida (TOKEN_REFRESHED) mientras getSession() está pendiente:
      // NO es una transición invalidante de epoch.
      currentSession = sessionAV2;
      await act(async () => {
        authListener?.('TOKEN_REFRESHED', sessionAV2);
      });

      // Caso A: La primera lectura getSession() ya recibe directamente la sesión rotada sessionAV2
      deferredInitialRead1.resolve({
        data: { session: sessionAV2 },
        error: null,
      });

      // Caso B: Las otras dos lecturas getSession() traían snapshot previo sessionAV1 y comparten single-flight refresh
      deferredInitialRead2.resolve({
        data: { session: sessionAV1 },
        error: null,
      });
      deferredInitialRead3.resolve({
        data: { session: sessionAV1 },
        error: null,
      });
      await flushMicrotasks();

      expect(supabaseMock.auth.refreshSession).toHaveBeenCalledTimes(1);

      deferredRefresh.resolve({
        data: { session: sessionAV2 },
        error: null,
      });

      const [recipes, scanned, mealPlan] = await Promise.all([
        recipesReq,
        scannerReq,
        mealPlanReq,
      ]);

      expect(recipes).toHaveLength(1);
      expect(scanned).toHaveLength(1);
      expect(mealPlan.days).toHaveLength(3);
      expect(supabaseMock.auth.refreshSession).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(3);

      // Todas las llamadas transmitieron exclusivamente el token fresco y jamás el token obsoleto
      for (const [, init] of fetchMock.mock.calls) {
        expect(init.headers.Authorization).toBe(`Bearer ${tokenAV2Refreshed}`);
        expect(init.headers.Authorization).not.toContain(tokenAV1Initial);
      }
    });

    it('garantiza que jamás se transmita ningún encabezado Authorization obsoleto ante múltiples transiciones superpuestas durante getSession()', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 30;
      const futureExp = Math.floor(Date.now() / 1000) + 3600;

      const staleTokenA1 = buildSyntheticJwt(
        { sub: USER_A.id, jti: 'stale-a1-never-transmit', exp: futureExp },
        'sig_stale_a1'
      );
      const staleTokenA1Expired = buildSyntheticJwt(
        { sub: USER_A.id, jti: 'stale-a1-exp-never-transmit', exp: pastExp },
        'sig_stale_a1_exp'
      );
      const staleTokenA2 = buildSyntheticJwt(
        { sub: USER_A.id, jti: 'stale-a2-never-transmit', exp: futureExp },
        'sig_stale_a2'
      );
      const finalActiveTokenA3 = buildSyntheticJwt(
        { sub: USER_A.id, jti: 'active-a3-only-allowed', exp: futureExp },
        'sig_active_a3'
      );

      const sessionA1 = buildAuthSession({
        user: USER_A,
        accessToken: staleTokenA1,
        refreshToken: 'rt-stale-a1',
        expiresAt: futureExp,
      });
      const sessionA1Expired = buildAuthSession({
        user: USER_A,
        accessToken: staleTokenA1Expired,
        refreshToken: 'rt-stale-a1-exp',
        expiresAt: pastExp,
      });
      const sessionA2 = buildAuthSession({
        user: USER_A,
        accessToken: staleTokenA2,
        refreshToken: 'rt-stale-a2',
        expiresAt: futureExp,
      });
      const sessionA3 = buildAuthSession({
        user: USER_A,
        accessToken: finalActiveTokenA3,
        refreshToken: 'rt-active-a3',
        expiresAt: futureExp,
      });

      let currentSession: AuthSession | null = sessionA1;
      let authListener:
        | ((event: string, session: AuthSession | null) => void)
        | null = null;

      const deferredReadA1 = createDeferred<SupabaseAuthResponseLike>();
      const deferredReadA1Exp = createDeferred<SupabaseAuthResponseLike>();
      const deferredReadA2 = createDeferred<SupabaseAuthResponseLike>();
      let readIndex = 0;

      const refreshSpy = jest.fn();

      const supabaseMock = {
        auth: {
          getSession: jest.fn(() => {
            readIndex += 1;
            if (readIndex === 1) {
              return deferredReadA1.promise;
            }
            if (readIndex === 2) {
              return deferredReadA1Exp.promise;
            }
            if (readIndex === 3) {
              return deferredReadA2.promise;
            }
            return Promise.resolve({
              data: { session: currentSession },
              error: null,
            });
          }),
          refreshSession: refreshSpy,
          signOut: jest.fn(async () => {
            currentSession = null;
            authListener?.('SIGNED_OUT', null);
            return { error: null };
          }),
          signInWithPassword: jest.fn(async () => {
            authListener?.('SIGNED_IN', currentSession);
            return {
              data: { user: USER_A, session: currentSession },
              error: null,
            };
          }),
          onAuthStateChange: jest.fn((cb) => {
            authListener = cb;
            return { data: { subscription: { unsubscribe: jest.fn() } } };
          }),
        },
      } as unknown as SupabaseClient & SupabaseAuthClientLike;

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider initialSession={sessionA1} supabaseClient={supabaseMock}>
          {children}
        </AuthProvider>
      );

      const { result } = await renderHook(() => useAuth(), { wrapper });

      const fetchMock = createSuccessFetchMock();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      // Generación 1: dos peticiones quedan bloqueadas en getSession() (una vigente y otra expirada)
      const gen1Recipes = recommendRecipes(VALID_RECIPE_REQUEST, {
        authClient: supabaseMock,
      });
      const gen1Scanner = analyzeIngredientsImage(VALID_IMAGE, {
        authClient: supabaseMock,
      });
      await flushMicrotasks();

      // Transición 1: Alice cierra sesión y reingresa con sessionA2
      await act(async () => {
        await result.current.signOut();
      });
      currentSession = sessionA2;
      await act(async () => {
        await result.current.signIn('alice@foodai.app', 'claveSeguraAlice123');
      });

      // Generación 2: una petición queda bloqueada en getSession()
      const gen2MealPlan = generateMealPlan(VALID_MEAL_PLAN_REQUEST, {
        authClient: supabaseMock,
      });
      await flushMicrotasks();

      // Transición 2: Alice vuelve a cerrar sesión y reingresa con sessionA3
      await act(async () => {
        await result.current.signOut();
      });
      currentSession = sessionA3;
      await act(async () => {
        await result.current.signIn('alice@foodai.app', 'claveSeguraAlice123');
      });

      // Generación 3 (activa): Alice lanza las 3 llamadas protegidas bajo sessionA3
      const activePromises = Promise.all([
        recommendRecipes(VALID_RECIPE_REQUEST, { authClient: supabaseMock }),
        analyzeIngredientsImage(VALID_IMAGE, { authClient: supabaseMock }),
        generateMealPlan(VALID_MEAL_PLAN_REQUEST, { authClient: supabaseMock }),
      ]);

      // Resuelven fuera de orden las tres lecturas getSession() obsoletas de generaciones anteriores
      deferredReadA2.resolve({ data: { session: sessionA2 }, error: null });
      deferredReadA1.resolve({ data: { session: sessionA1 }, error: null });
      deferredReadA1Exp.resolve({
        data: { session: sessionA1Expired },
        error: null,
      });

      const staleOutcomes = await Promise.allSettled([
        gen1Recipes,
        gen1Scanner,
        gen2MealPlan,
      ]);
      for (const outcome of staleOutcomes) {
        expect(outcome.status).toBe('rejected');
        if (outcome.status === 'rejected') {
          expect(outcome.reason).toMatchObject({
            code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
            status: 401,
            isAuthError: true,
          });
        }
      }

      // La sesión expirada obsoleta de Generación 1 ni siquiera intentó ejecutar refreshSession
      expect(refreshSpy).not.toHaveBeenCalled();

      const [activeRecipes, activeScanned, activePlan] = await activePromises;
      expect(activeRecipes).toHaveLength(1);
      expect(activeScanned).toHaveLength(1);
      expect(activePlan.days).toHaveLength(3);

      // Exactamente 3 peticiones HTTP reales (solo Generación 3) y CERO encabezados Authorization obsoletos
      expect(fetchMock).toHaveBeenCalledTimes(3);
      for (const [, init] of fetchMock.mock.calls) {
        expect(init.headers.Authorization).toBe(`Bearer ${finalActiveTokenA3}`);
        expect(init.headers.Authorization).not.toContain(staleTokenA1);
        expect(init.headers.Authorization).not.toContain(staleTokenA1Expired);
        expect(init.headers.Authorization).not.toContain(staleTokenA2);
      }
    });
  });
});
