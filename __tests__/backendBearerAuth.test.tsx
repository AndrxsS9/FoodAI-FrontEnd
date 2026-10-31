/**
 * FoodAI - Suite Integral de Pruebas de Regresión de Autenticación Bearer con Supabase (Fase 6C.2).
 *
 * Verifica de forma 100% determinista (sin llamadas reales a red ni Gemini):
 * 1. Envío válido de `Authorization: Bearer <token>` en los tres clientes de IA:
 *    - recommendRecipes (recipeApi.ts)
 *    - analyzeIngredientsImage (scannerApi.ts)
 *    - generateMealPlan (mealPlanApi.ts)
 * 2. Modo fail-closed: ninguna petición HTTP se envía sin sesión activa o con token inválido.
 * 3. Adquisición dinámica del access_token por cada solicitud (soporte de rotación sin caché obsoleto).
 * 4. Manejo seguro de sesiones expiradas o próximas a expirar y deduplicación single-flight de refreshSession.
 * 5. Mapeo exacto de errores HTTP 401 (AUTH_TOKEN_REQUIRED, INVALID_AUTH_TOKEN, AUTH_TOKEN_EXPIRED) al español, sin reintentos automáticos.
 * 6. Manejo de HTTP 503 AUTH_VERIFICATION_UNAVAILABLE sin cerrar sesión del usuario ni sobrescribir códigos 429/500/503/504 de Gemini.
 * 7. Compatibilidad multipart/form-data en subida de imágenes (sin Content-Type manual para preservar boundary).
 * 8. Cero exposición de tokens en console.*, mensajes de error, query params de URL o almacenamiento separado.
 * 9. Endpoint público GET /api/health sin requerir sesión ni enviar encabezado Authorization.
 * 10. Integración con el flujo existente de inicio y cierre de sesión (signIn / signOut) en AuthContext.
 * 11. Aislamiento cruzado estricto entre Usuario A y Usuario B (tokens y estados de IA).
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  AUTH_ERROR_CODES,
  AUTH_ERROR_MESSAGES,
  ApiAuthError,
  MAX_BEARER_TOKEN_LENGTH,
  SupabaseAuthClientLike,
  SupabaseAuthSessionLike,
  getSupabaseAuthHeaders,
  isValidBearerTokenFormat,
  resolveHttpAuthError,
  resolveSessionExpiresAtSeconds,
} from '../src/services/api/authHeaders';
import {
  RecipeApiError,
  checkBackendHealth,
  recipeApi,
  recommendRecipes,
} from '../src/services/api/recipeApi';
import {
  ScannerApiError,
  analyzeIngredientsImage,
} from '../src/services/api/scannerApi';
import {
  MealPlanApiError,
  generateMealPlan,
  mealPlanApi,
} from '../src/services/api/mealPlanApi';
import { supabase } from '../src/services/supabase/client';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { BudgetProvider } from '../src/context/BudgetContext';
import { PantryProvider, usePantry } from '../src/context/PantryContext';
import { RecipeProvider, useRecipes } from '../src/context/RecipeContext';
import { MealPlanProvider, useMealPlan } from '../src/context/MealPlanContext';
import { AuthSession, AuthUser } from '../src/types/auth';
import { RecommendRecipesRequest } from '../src/types/recipe';
import { MealPlanRequest } from '../src/types/mealPlan';
import { SelectedImage } from '../src/types/scanner';
import { Ingredient } from '../src/types/pantry';
import type { SupabaseClient } from '@supabase/supabase-js';

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

function buildSyntheticJwt(payload: Record<string, unknown>, signature = 'sig_test_es256'): string {
  const header = encodeBase64UrlJson({ alg: 'ES256', typ: 'JWT' });
  const body = encodeBase64UrlJson(payload);
  return `${header}.${body}.${signature}`;
}

const VALID_RECIPE_REQUEST: RecommendRecipesRequest = {
  pantry: [
    { name: 'Pollo', quantity: 500, unit: 'g', needsReview: false },
    { name: 'Arroz', quantity: 300, unit: 'g', needsReview: false },
  ],
  budget: 25000,
  servings: 2,
  maxMinutes: 45,
};

const VALID_MEAL_PLAN_REQUEST: MealPlanRequest = {
  pantry: [
    { name: 'Pollo', quantity: 500, unit: 'g', needsReview: false },
    { name: 'Arroz', quantity: 400, unit: 'g', needsReview: false },
    { name: 'Huevo', quantity: 6, unit: 'unidad', needsReview: false },
  ],
  budget: 30000,
  servings: 2,
  maxMinutes: 45,
};

const VALID_IMAGE: SelectedImage = {
  uri: 'file:///alimentos/nevera.jpg',
  mimeType: 'image/jpeg',
  fileName: 'nevera.jpg',
};

const SAMPLE_BACKEND_RECIPE = {
  name: 'Arroz salteado con pollo',
  description: 'Receta casera equilibrada.',
  totalMinutes: 30,
  ingredients: [
    { name: 'Pollo', quantity: 250, unit: 'g' },
    { name: 'Arroz', quantity: 150, unit: 'g' },
  ],
  steps: ['Cocinar arroz', 'Saltear pollo y mezclar'],
  availableIngredients: [
    { name: 'Pollo', quantity: 250, unit: 'g' },
    { name: 'Arroz', quantity: 150, unit: 'g' },
  ],
  missingIngredients: [],
  estimatedMissingCost: 0,
  budgetRemaining: 25000,
  withinBudget: true,
  convenience: 95,
  reason: 'Aprovecha ingredientes disponibles.',
};

const SAMPLE_RECIPES_SUCCESS_RESPONSE = {
  success: true,
  data: {
    recipes: [SAMPLE_BACKEND_RECIPE],
  },
};

const SAMPLE_SCANNER_SUCCESS_RESPONSE = {
  success: true,
  data: {
    ingredients: [
      {
        name: 'Tomate chonto',
        quantity: 3,
        unit: 'unidad',
        needsReview: false,
      },
    ],
  },
};

const SAMPLE_MEAL_PLAN_SUCCESS_RESPONSE = {
  success: true,
  data: {
    days: [
      { day: 1, recipe: { ...SAMPLE_BACKEND_RECIPE, name: 'Día 1 Pollo' } },
      { day: 2, recipe: { ...SAMPLE_BACKEND_RECIPE, name: 'Día 2 Arroz' } },
      { day: 3, recipe: { ...SAMPLE_BACKEND_RECIPE, name: 'Día 3 Cazuela' } },
    ],
    totalEstimatedMissingCost: 0,
    budgetRemaining: 30000,
    withinBudget: true,
  },
};

const SAMPLE_PANTRY_ITEMS: Ingredient[] = [
  {
    id: 'ing-1',
    name: 'Pollo',
    quantity: 500,
    unit: 'g',
    category: 'Carnes y proteínas',
    createdAt: '2026-10-30T10:00:00.000Z',
    updatedAt: '2026-10-30T10:00:00.000Z',
  },
  {
    id: 'ing-2',
    name: 'Arroz',
    quantity: 500,
    unit: 'g',
    category: 'Granos y cereales',
    createdAt: '2026-10-30T10:00:00.000Z',
    updatedAt: '2026-10-30T10:00:00.000Z',
  },
];

function createAuthClientMock(config?: {
  session?: SupabaseAuthSessionLike | null;
  getSessionImpl?: () => Promise<{
    data: { session: SupabaseAuthSessionLike | null } | null;
    error: { message?: string; code?: string } | null;
  }>;
  refreshSessionImpl?: () => Promise<{
    data: { session: SupabaseAuthSessionLike | null } | null;
    error: { message?: string; code?: string } | null;
  }>;
}): SupabaseAuthClientLike & {
  getSessionMock: jest.Mock;
  refreshSessionMock: jest.Mock;
} {
  const futureExp = Math.floor(Date.now() / 1000) + 3600;
  const defaultSession: SupabaseAuthSessionLike | null =
    config && 'session' in config
      ? config.session ?? null
      : {
          access_token: buildSyntheticJwt({ sub: 'user-default', exp: futureExp }),
          refresh_token: 'refresh-default',
          expires_at: futureExp,
        };

  const getSessionMock = jest.fn().mockImplementation(
    config?.getSessionImpl ??
      (async () => ({
        data: { session: defaultSession },
        error: null,
      }))
  );

  const refreshSessionMock = jest.fn().mockImplementation(
    config?.refreshSessionImpl ??
      (async () => ({
        data: { session: null },
        error: { message: 'Refresh token missing' },
      }))
  );

  return {
    auth: {
      getSession: getSessionMock,
      refreshSession: refreshSessionMock,
    },
    getSessionMock,
    refreshSessionMock,
  };
}

describe('Integración de Autenticación Bearer con Supabase en Clientes de IA (Fase 6C.2)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.foodai.example.com';
    await AsyncStorage.clear();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
    await AsyncStorage.clear();
  });

  describe('1. Validadores defensivos del helper compartido (authHeaders.ts)', () => {
    it('acepta tokens JWS compactos válidos y rechaza tokens vacíos, con espacios, caracteres de control o > 8192 bytes', () => {
      const validJwt = buildSyntheticJwt({ sub: 'usr-1', exp: Math.floor(Date.now() / 1000) + 600 });
      expect(isValidBearerTokenFormat(validJwt)).toBe(true);

      expect(isValidBearerTokenFormat('')).toBe(false);
      expect(isValidBearerTokenFormat(null)).toBe(false);
      expect(isValidBearerTokenFormat(undefined)).toBe(false);
      expect(isValidBearerTokenFormat('token con espacios')).toBe(false);
      expect(isValidBearerTokenFormat('token\r\nX-Injected: evil')).toBe(false);
      expect(isValidBearerTokenFormat('token\u0000nulo')).toBe(false);
      expect(isValidBearerTokenFormat('a'.repeat(MAX_BEARER_TOKEN_LENGTH + 1))).toBe(false);
    });

    it('extrae correctamente la marca de expiración desde expires_at (segundos o ms) o desde el claim exp del JWT', () => {
      const expSec = Math.floor(Date.now() / 1000) + 1800;
      expect(resolveSessionExpiresAtSeconds({ expires_at: expSec })).toBe(expSec);
      expect(resolveSessionExpiresAtSeconds({ expires_at: expSec * 1000 })).toBe(expSec);

      const jwtOnly = buildSyntheticJwt({ sub: 'usr-jwt-exp', exp: expSec });
      expect(resolveSessionExpiresAtSeconds({ access_token: jwtOnly, expires_at: null })).toBe(
        expSec
      );

      expect(resolveSessionExpiresAtSeconds(null)).toBeNull();
      expect(resolveSessionExpiresAtSeconds({ access_token: 'non-jwt-opaque-token' })).toBeNull();
    });
  });

  describe('2. Token Bearer válido en los tres clientes de IA y ausencia en URL query params', () => {
    it('envía Authorization: Bearer <token> en recommendRecipes, analyzeIngredientsImage y generateMealPlan', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const dynamicToken = buildSyntheticJwt({
        sub: 'user-verified-123',
        role: 'authenticated',
        exp: futureExp,
      });

      const authClient = createAuthClientMock({
        session: {
          access_token: dynamicToken,
          expires_at: futureExp,
        },
      });

      const mockFetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => SAMPLE_RECIPES_SUCCESS_RESPONSE,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => SAMPLE_SCANNER_SUCCESS_RESPONSE,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => SAMPLE_MEAL_PLAN_SUCCESS_RESPONSE,
        });

      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const recipes = await recommendRecipes(VALID_RECIPE_REQUEST, { authClient });
      const detected = await analyzeIngredientsImage(VALID_IMAGE, { authClient });
      const mealPlan = await generateMealPlan(VALID_MEAL_PLAN_REQUEST, { authClient });

      expect(recipes).toHaveLength(1);
      expect(detected).toHaveLength(1);
      expect(mealPlan.days).toHaveLength(3);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // 1) POST /api/recipes/recommend
      const [recipesUrl, recipesInit] = mockFetch.mock.calls[0];
      expect(recipesUrl).toBe('https://api.foodai.example.com/api/recipes/recommend');
      expect(recipesUrl).not.toContain(dynamicToken);
      expect(recipesUrl).not.toContain('?');
      expect(recipesInit.headers.Authorization).toBe(`Bearer ${dynamicToken}`);
      expect(recipesInit.headers['Content-Type']).toBe('application/json');
      expect(recipesInit.headers.Accept).toBe('application/json');

      // 2) POST /api/ingredients/analyze
      const [scannerUrl, scannerInit] = mockFetch.mock.calls[1];
      expect(scannerUrl).toBe('https://api.foodai.example.com/api/ingredients/analyze');
      expect(scannerUrl).not.toContain(dynamicToken);
      expect(scannerUrl).not.toContain('?');
      expect(scannerInit.headers.Authorization).toBe(`Bearer ${dynamicToken}`);
      expect(scannerInit.headers.Accept).toBe('application/json');
      expect(scannerInit.headers['Content-Type']).toBeUndefined();

      // 3) POST /api/meal-plans/generate
      const [planUrl, planInit] = mockFetch.mock.calls[2];
      expect(planUrl).toBe('https://api.foodai.example.com/api/meal-plans/generate');
      expect(planUrl).not.toContain(dynamicToken);
      expect(planUrl).not.toContain('?');
      expect(planInit.headers.Authorization).toBe(`Bearer ${dynamicToken}`);
      expect(planInit.headers['Content-Type']).toBe('application/json');
      expect(planInit.headers.Accept).toBe('application/json');
    });
  });

  describe('3. Modo Fail-Closed — Ninguna petición HTTP se envía sin sesión válida', () => {
    it('bloquea recommendRecipes, analyzeIngredientsImage y generateMealPlan cuando session es null sin llamar a fetch', async () => {
      const noSessionClient = createAuthClientMock({ session: null });
      const mockFetch = jest.fn();
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await expect(
        recommendRecipes(VALID_RECIPE_REQUEST, { authClient: noSessionClient })
      ).rejects.toMatchObject({
        name: 'RecipeApiError',
        code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        status: 401,
        isAuthError: true,
        message: AUTH_ERROR_MESSAGES.AUTH_TOKEN_REQUIRED,
      });

      await expect(
        analyzeIngredientsImage(VALID_IMAGE, { authClient: noSessionClient })
      ).rejects.toMatchObject({
        name: 'ScannerApiError',
        code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        status: 401,
        isAuthError: true,
        message: AUTH_ERROR_MESSAGES.AUTH_TOKEN_REQUIRED,
      });

      await expect(
        generateMealPlan(VALID_MEAL_PLAN_REQUEST, { authClient: noSessionClient })
      ).rejects.toMatchObject({
        name: 'MealPlanApiError',
        code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        status: 401,
        isAuthError: true,
        message: AUTH_ERROR_MESSAGES.AUTH_TOKEN_REQUIRED,
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('bloquea peticiones en modo fail-closed si access_token está vacío, malformado o getSession falla', async () => {
      const mockFetch = jest.fn();
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const emptyTokenClient = createAuthClientMock({
        session: { access_token: '   ', expires_at: Math.floor(Date.now() / 1000) + 3600 },
      });
      await expect(
        recommendRecipes(VALID_RECIPE_REQUEST, { authClient: emptyTokenClient })
      ).rejects.toMatchObject({
        code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        status: 401,
        isAuthError: true,
      });

      const malformedTokenClient = createAuthClientMock({
        session: {
          access_token: 'malformed token with spaces',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      });
      await expect(
        analyzeIngredientsImage(VALID_IMAGE, { authClient: malformedTokenClient })
      ).rejects.toMatchObject({
        code: AUTH_ERROR_CODES.INVALID_AUTH_TOKEN,
        status: 401,
        isAuthError: true,
      });

      const throwingSessionClient = createAuthClientMock({
        getSessionImpl: async () => {
          throw new Error('AsyncStorage corrupted');
        },
      });
      await expect(
        generateMealPlan(VALID_MEAL_PLAN_REQUEST, { authClient: throwingSessionClient })
      ).rejects.toMatchObject({
        code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        status: 401,
        isAuthError: true,
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('4. Adquisición de token por solicitud (sin caché estático ni valores quemados)', () => {
    it('obtiene el access_token actual de Supabase justo antes de cada petición reflejando rotaciones de token', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const token1 = buildSyntheticJwt({ sub: 'usr-rot', jti: 'req-1', exp: futureExp });
      const token2 = buildSyntheticJwt({ sub: 'usr-rot', jti: 'req-2', exp: futureExp });
      const token3 = buildSyntheticJwt({ sub: 'usr-rot', jti: 'req-3', exp: futureExp });

      let callIndex = 0;
      const tokens = [token1, token2, token3];

      const rotatingClient = createAuthClientMock({
        getSessionImpl: async () => {
          const current = tokens[callIndex] ?? token3;
          callIndex += 1;
          return {
            data: { session: { access_token: current, expires_at: futureExp } },
            error: null,
          };
        },
      });

      const mockFetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => SAMPLE_RECIPES_SUCCESS_RESPONSE,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => SAMPLE_SCANNER_SUCCESS_RESPONSE,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => SAMPLE_MEAL_PLAN_SUCCESS_RESPONSE,
        });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await recommendRecipes(VALID_RECIPE_REQUEST, { authClient: rotatingClient });
      await analyzeIngredientsImage(VALID_IMAGE, { authClient: rotatingClient });
      await generateMealPlan(VALID_MEAL_PLAN_REQUEST, { authClient: rotatingClient });

      expect(rotatingClient.getSessionMock).toHaveBeenCalledTimes(3);
      expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${token1}`);
      expect(mockFetch.mock.calls[1][1].headers.Authorization).toBe(`Bearer ${token2}`);
      expect(mockFetch.mock.calls[2][1].headers.Authorization).toBe(`Bearer ${token3}`);
    });
  });

  describe('5. Manejo de sesiones expiradas y prevención de carreras de refresco (Single-Flight)', () => {
    it('no invoca refreshSession innecesariamente cuando el token actual está vigente', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 1800;
      const validToken = buildSyntheticJwt({ sub: 'usr-fresh', exp: futureExp });
      const authClient = createAuthClientMock({
        session: { access_token: validToken, expires_at: futureExp },
      });

      const headers = await getSupabaseAuthHeaders({ authClient });
      expect(headers.Authorization).toBe(`Bearer ${validToken}`);
      expect(authClient.refreshSessionMock).not.toHaveBeenCalled();
    });

    it('renueva la sesión cuando expires_at o el claim exp del JWT expiró y usa el nuevo token', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 120;
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const expiredJwt = buildSyntheticJwt({ sub: 'usr-exp', exp: pastExp });
      const refreshedJwt = buildSyntheticJwt({ sub: 'usr-exp', exp: futureExp }, 'sig_refreshed');

      const authClient = createAuthClientMock({
        // expires_at omitido para probar detección directa desde el payload JWT
        session: { access_token: expiredJwt, expires_at: null },
        refreshSessionImpl: async () => ({
          data: {
            session: {
              access_token: refreshedJwt,
              expires_at: futureExp,
            },
          },
          error: null,
        }),
      });

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => SAMPLE_RECIPES_SUCCESS_RESPONSE,
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await recommendRecipes(VALID_RECIPE_REQUEST, { authClient });

      expect(authClient.refreshSessionMock).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${refreshedJwt}`);
    });

    it('deduplica llamadas concurrentes a refreshSession (single-flight) evitando carreras entre clientes', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 60;
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const expiredToken = buildSyntheticJwt({ sub: 'usr-race', exp: pastExp });
      const refreshedToken = buildSyntheticJwt(
        { sub: 'usr-race', exp: futureExp },
        'sig_single_flight'
      );

      let currentSession: SupabaseAuthSessionLike = {
        access_token: expiredToken,
        expires_at: pastExp,
      };

      const sharedClient = createAuthClientMock({
        getSessionImpl: async () => ({
          data: { session: currentSession },
          error: null,
        }),
        refreshSessionImpl: async () => {
          await new Promise((resolve) => setTimeout(resolve, 25));
          currentSession = {
            access_token: refreshedToken,
            expires_at: futureExp,
          };
          return {
            data: { session: currentSession },
            error: null,
          };
        },
      });

      globalThis.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('/recipes/recommend')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => SAMPLE_RECIPES_SUCCESS_RESPONSE,
          });
        }
        if (url.includes('/ingredients/analyze')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => SAMPLE_SCANNER_SUCCESS_RESPONSE,
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => SAMPLE_MEAL_PLAN_SUCCESS_RESPONSE,
        });
      }) as unknown as typeof fetch;

      await Promise.all([
        recommendRecipes(VALID_RECIPE_REQUEST, { authClient: sharedClient }),
        analyzeIngredientsImage(VALID_IMAGE, { authClient: sharedClient }),
        generateMealPlan(VALID_MEAL_PLAN_REQUEST, { authClient: sharedClient }),
      ]);

      // Las 3 peticiones consultaron getSession, pero solo se disparó UN refreshSession compartido
      expect(sharedClient.getSessionMock).toHaveBeenCalledTimes(3);
      expect(sharedClient.refreshSessionMock).toHaveBeenCalledTimes(1);

      const fetchMock = globalThis.fetch as jest.Mock;
      expect(fetchMock).toHaveBeenCalledTimes(3);
      for (const [, init] of fetchMock.mock.calls) {
        expect(init.headers.Authorization).toBe(`Bearer ${refreshedToken}`);
      }
    });

    it('falla en modo cerrado con 401 AUTH_TOKEN_EXPIRED si la sesión expiró y refreshSession falla, sin invocar fetch', async () => {
      const pastExp = Math.floor(Date.now() / 1000) - 300;
      const expiredToken = buildSyntheticJwt({ sub: 'usr-dead-session', exp: pastExp });

      const unrefreshableClient = createAuthClientMock({
        session: { access_token: expiredToken, expires_at: pastExp },
        refreshSessionImpl: async () => ({
          data: { session: null },
          error: { message: 'Invalid Refresh Token: Refresh Token Not Found' },
        }),
      });

      const mockFetch = jest.fn();
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      await expect(
        recommendRecipes(VALID_RECIPE_REQUEST, { authClient: unrefreshableClient })
      ).rejects.toMatchObject({
        name: 'RecipeApiError',
        code: AUTH_ERROR_CODES.AUTH_TOKEN_EXPIRED,
        status: 401,
        isAuthError: true,
        message: AUTH_ERROR_MESSAGES.AUTH_TOKEN_EXPIRED,
      });

      await expect(
        analyzeIngredientsImage(VALID_IMAGE, { authClient: unrefreshableClient })
      ).rejects.toMatchObject({
        name: 'ScannerApiError',
        code: AUTH_ERROR_CODES.AUTH_TOKEN_EXPIRED,
        status: 401,
        isAuthError: true,
        message: AUTH_ERROR_MESSAGES.AUTH_TOKEN_EXPIRED,
      });

      await expect(
        generateMealPlan(VALID_MEAL_PLAN_REQUEST, { authClient: unrefreshableClient })
      ).rejects.toMatchObject({
        name: 'MealPlanApiError',
        code: AUTH_ERROR_CODES.AUTH_TOKEN_EXPIRED,
        status: 401,
        isAuthError: true,
        message: AUTH_ERROR_MESSAGES.AUTH_TOKEN_EXPIRED,
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('6. Mapeo de errores HTTP 401 del backend y garantía anti-reintentos', () => {
    const auth401Cases = [
      {
        code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        backendMessage: 'Debes iniciar sesión para acceder a las funciones de IA.',
        expectedMessage: AUTH_ERROR_MESSAGES.AUTH_TOKEN_REQUIRED,
      },
      {
        code: AUTH_ERROR_CODES.INVALID_AUTH_TOKEN,
        backendMessage: 'El token de autenticación no es válido.',
        expectedMessage: AUTH_ERROR_MESSAGES.INVALID_AUTH_TOKEN,
      },
      {
        code: AUTH_ERROR_CODES.AUTH_TOKEN_EXPIRED,
        backendMessage: 'Tu sesión expiró. Inicia sesión nuevamente.',
        expectedMessage: AUTH_ERROR_MESSAGES.AUTH_TOKEN_EXPIRED,
      },
    ] as const;

    it.each(auth401Cases)(
      'mapea 401 $code en los tres clientes con feedback en español, sin reintentar llamadas de IA ni ejecutar signOut',
      async ({ code, backendMessage, expectedMessage }) => {
        const authClient = createAuthClientMock();
        const signOutSpy = jest.spyOn(supabase.auth, 'signOut');

        const make401Response = () => ({
          ok: false,
          status: 401,
          json: async () => ({
            success: false,
            error: {
              code,
              message: backendMessage,
            },
          }),
        });

        // 1) recipeApi
        const recipesFetch = jest.fn().mockResolvedValue(make401Response());
        globalThis.fetch = recipesFetch as unknown as typeof fetch;
        await expect(
          recommendRecipes(VALID_RECIPE_REQUEST, { authClient })
        ).rejects.toMatchObject({
          name: 'RecipeApiError',
          code,
          status: 401,
          isAuthError: true,
          message: expectedMessage,
        });
        expect(recipesFetch).toHaveBeenCalledTimes(1);

        // 2) scannerApi
        const scannerFetch = jest.fn().mockResolvedValue(make401Response());
        globalThis.fetch = scannerFetch as unknown as typeof fetch;
        await expect(
          analyzeIngredientsImage(VALID_IMAGE, { authClient })
        ).rejects.toMatchObject({
          name: 'ScannerApiError',
          code,
          status: 401,
          isAuthError: true,
          message: expectedMessage,
        });
        expect(scannerFetch).toHaveBeenCalledTimes(1);

        // 3) mealPlanApi
        const planFetch = jest.fn().mockResolvedValue(make401Response());
        globalThis.fetch = planFetch as unknown as typeof fetch;
        await expect(
          generateMealPlan(VALID_MEAL_PLAN_REQUEST, { authClient })
        ).rejects.toMatchObject({
          name: 'MealPlanApiError',
          code,
          status: 401,
          isAuthError: true,
          message: expectedMessage,
        });
        expect(planFetch).toHaveBeenCalledTimes(1);

        expect(signOutSpy).not.toHaveBeenCalled();
      }
    );

    it('propaga errores 401 hacia RecipeContext y MealPlanContext con código exacto y mensaje en español', async () => {
      const authClient = createAuthClientMock();
      jest
        .spyOn(supabase.auth, 'getSession')
        .mockImplementation(() => authClient.auth.getSession() as any);

      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: {
            code: 'AUTH_TOKEN_EXPIRED',
            message: 'Tu sesión expiró.',
          },
        }),
      }) as unknown as typeof fetch;

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <BudgetProvider>
          <PantryProvider initialIngredients={SAMPLE_PANTRY_ITEMS} userId="usr-ctx-401">
            <RecipeProvider initialIsDemoMode={false} userId="usr-ctx-401">
              <MealPlanProvider userId="usr-ctx-401">{children}</MealPlanProvider>
            </RecipeProvider>
          </PantryProvider>
        </BudgetProvider>
      );

      const { result } = await renderHook(
        () => ({
          recipesCtx: useRecipes(),
          mealPlanCtx: useMealPlan(),
        }),
        { wrapper }
      );

      await act(async () => {
        await expect(result.current.recipesCtx.generateRecipes()).rejects.toMatchObject({
          code: 'AUTH_TOKEN_EXPIRED',
          status: 401,
        });
      });

      expect(result.current.recipesCtx.errorCode).toBe('AUTH_TOKEN_EXPIRED');
      expect(result.current.recipesCtx.error).toBe(AUTH_ERROR_MESSAGES.AUTH_TOKEN_EXPIRED);
      expect(result.current.recipesCtx.isDemoMode).toBe(false);

      await act(async () => {
        await expect(result.current.mealPlanCtx.generateMealPlan()).rejects.toMatchObject({
          code: 'AUTH_TOKEN_EXPIRED',
          status: 401,
        });
      });

      expect(result.current.mealPlanCtx.errorCode).toBe('AUTH_TOKEN_EXPIRED');
      expect(result.current.mealPlanCtx.error).toBe(AUTH_ERROR_MESSAGES.AUTH_TOKEN_EXPIRED);
    });
  });

  describe('7. Manejo de 503 AUTH_VERIFICATION_UNAVAILABLE y preservación de 429, 500, 503 y 504', () => {
    it('mapea 503 AUTH_VERIFICATION_UNAVAILABLE en los tres clientes sin cerrar sesión ni reintentar', async () => {
      const authClient = createAuthClientMock();
      const signOutSpy = jest.spyOn(supabase.auth, 'signOut');

      const make503JwksResponse = () => ({
        ok: false,
        status: 503,
        json: async () => ({
          success: false,
          error: {
            code: 'AUTH_VERIFICATION_UNAVAILABLE',
            message: 'No se pudo verificar la sesión temporalmente. Intenta de nuevo.',
          },
        }),
      });

      // recipeApi
      const recipesFetch = jest.fn().mockResolvedValue(make503JwksResponse());
      globalThis.fetch = recipesFetch as unknown as typeof fetch;
      await expect(
        recommendRecipes(VALID_RECIPE_REQUEST, { authClient })
      ).rejects.toMatchObject({
        name: 'RecipeApiError',
        code: AUTH_ERROR_CODES.AUTH_VERIFICATION_UNAVAILABLE,
        status: 503,
        isAuthError: false,
        message: AUTH_ERROR_MESSAGES.AUTH_VERIFICATION_UNAVAILABLE,
      });
      expect(recipesFetch).toHaveBeenCalledTimes(1);

      // scannerApi (no debe sobrescribirse como GEMINI_UNAVAILABLE)
      const scannerFetch = jest.fn().mockResolvedValue(make503JwksResponse());
      globalThis.fetch = scannerFetch as unknown as typeof fetch;
      await expect(
        analyzeIngredientsImage(VALID_IMAGE, { authClient })
      ).rejects.toMatchObject({
        name: 'ScannerApiError',
        code: AUTH_ERROR_CODES.AUTH_VERIFICATION_UNAVAILABLE,
        status: 503,
        isAuthError: false,
        message: AUTH_ERROR_MESSAGES.AUTH_VERIFICATION_UNAVAILABLE,
      });
      expect(scannerFetch).toHaveBeenCalledTimes(1);

      // mealPlanApi (no debe sobrescribirse como GEMINI_UNAVAILABLE)
      const planFetch = jest.fn().mockResolvedValue(make503JwksResponse());
      globalThis.fetch = planFetch as unknown as typeof fetch;
      await expect(
        generateMealPlan(VALID_MEAL_PLAN_REQUEST, { authClient })
      ).rejects.toMatchObject({
        name: 'MealPlanApiError',
        code: AUTH_ERROR_CODES.AUTH_VERIFICATION_UNAVAILABLE,
        status: 503,
        isAuthError: false,
        message: AUTH_ERROR_MESSAGES.AUTH_VERIFICATION_UNAVAILABLE,
      });
      expect(planFetch).toHaveBeenCalledTimes(1);

      // Tampoco debe cerrar sesión ante errores temporales de red
      globalThis.fetch = jest
        .fn()
        .mockRejectedValue(new TypeError('Network request failed')) as unknown as typeof fetch;
      await expect(
        recommendRecipes(VALID_RECIPE_REQUEST, { authClient })
      ).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
        isNetworkError: true,
      });

      expect(signOutSpy).not.toHaveBeenCalled();
    });

    it('preserva intacto el manejo existente de errores 429, 500, 503 (GEMINI_UNAVAILABLE) y 504 (GEMINI_TIMEOUT)', async () => {
      const authClient = createAuthClientMock();

      // 429 Rate Limit
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({
          success: false,
          error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Límite de solicitudes excedido.' },
        }),
      }) as unknown as typeof fetch;
      await expect(
        recommendRecipes(VALID_RECIPE_REQUEST, { authClient })
      ).rejects.toMatchObject({
        code: 'RATE_LIMIT_EXCEEDED',
        status: 429,
        isRateLimit: true,
      });

      // 500 Internal Server Error
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Error interno.' },
        }),
      }) as unknown as typeof fetch;
      await expect(
        generateMealPlan(VALID_MEAL_PLAN_REQUEST, { authClient })
      ).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
        status: 500,
      });

      // 503 GEMINI_UNAVAILABLE
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({
          success: false,
          error: { code: 'GEMINI_UNAVAILABLE', message: 'IA temporalmente ocupada.' },
        }),
      }) as unknown as typeof fetch;
      await expect(
        analyzeIngredientsImage(VALID_IMAGE, { authClient })
      ).rejects.toMatchObject({
        code: 'GEMINI_UNAVAILABLE',
        status: 503,
      });

      // 504 GEMINI_TIMEOUT
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 504,
        json: async () => ({
          success: false,
          error: { code: 'GEMINI_TIMEOUT', message: 'Tiempo agotado en Gemini.' },
        }),
      }) as unknown as typeof fetch;
      await expect(
        analyzeIngredientsImage(VALID_IMAGE, { authClient })
      ).rejects.toMatchObject({
        code: 'GEMINI_TIMEOUT',
        status: 504,
        isTimeout: true,
      });
    });
  });

  describe('8. Compatibilidad Multipart FormData en subida de imágenes (scannerApi.ts)', () => {
    it('preserva FormData intacto con el campo image y omite cualquier encabezado Content-Type manual', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const multipartToken = buildSyntheticJwt({ sub: 'usr-scanner', exp: futureExp });
      const authClient = createAuthClientMock({
        session: { access_token: multipartToken, expires_at: futureExp },
      });

      let capturedHeaders: Record<string, string> = {};
      let capturedBody: unknown = null;

      globalThis.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
        capturedHeaders = (init.headers ?? {}) as Record<string, string>;
        capturedBody = init.body;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => SAMPLE_SCANNER_SUCCESS_RESPONSE,
        });
      }) as unknown as typeof fetch;

      const detected = await analyzeIngredientsImage(VALID_IMAGE, { authClient });

      expect(detected).toHaveLength(1);
      expect(capturedBody).toBeInstanceOf(FormData);
      expect(capturedHeaders.Authorization).toBe(`Bearer ${multipartToken}`);
      expect(capturedHeaders.Accept).toBe('application/json');

      const normalizedHeaderNames = Object.keys(capturedHeaders).map((h) => h.toLowerCase());
      expect(normalizedHeaderNames).not.toContain('content-type');
    });
  });

  describe('9. Confidencialidad — Cero exposición de tokens en logs, errores, URLs o AsyncStorage separado', () => {
    it('nunca expone el access_token en console.*, errores arrojados ni claves de AsyncStorage', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const canarySecretSegment = 'CANARY_SUPER_SECRET_TOKEN_9988776655';
      const canaryJwt = `${encodeBase64UrlJson({ alg: 'ES256' })}.${encodeBase64UrlJson({
        sub: 'usr-canary',
        marker: canarySecretSegment,
        exp: futureExp,
      })}.${canarySecretSegment}`;

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
      const setItemSpy = jest.spyOn(AsyncStorage, 'setItem');

      const authClient = createAuthClientMock({
        session: { access_token: canaryJwt, expires_at: futureExp },
      });

      // Caso A: Petición exitosa
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => SAMPLE_RECIPES_SUCCESS_RESPONSE,
      }) as unknown as typeof fetch;
      await recommendRecipes(VALID_RECIPE_REQUEST, { authClient });

      // Caso B: Respuesta 401 donde el servidor intenta eco de mensaje
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: {
            code: 'INVALID_AUTH_TOKEN',
            message: `Invalid token ${canaryJwt}`,
          },
        }),
      }) as unknown as typeof fetch;

      let caughtError: unknown = null;
      try {
        await generateMealPlan(VALID_MEAL_PLAN_REQUEST, { authClient });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(MealPlanApiError);
      expect((caughtError as Error).message).not.toContain(canarySecretSegment);
      expect((caughtError as Error).message).not.toContain(canaryJwt);
      expect(JSON.stringify(caughtError)).not.toContain(canarySecretSegment);

      // Ningún método de console recibió el token ni su segmento canario
      const allConsoleCalls = [
        ...logSpy.mock.calls,
        ...infoSpy.mock.calls,
        ...warnSpy.mock.calls,
        ...errorSpy.mock.calls,
        ...debugSpy.mock.calls,
      ];
      const serializedLogs = JSON.stringify(allConsoleCalls);
      expect(serializedLogs).not.toContain(canarySecretSegment);
      expect(serializedLogs).not.toContain(canaryJwt);

      // El helper de autenticación nunca persiste el token por separado en AsyncStorage
      expect(setItemSpy).not.toHaveBeenCalled();
    });
  });

  describe('10. Endpoint público GET /api/health sin autenticación', () => {
    it('ejecuta checkBackendHealth exitosamente sin sesión activa, sin consultar getSession y sin enviar Authorization', async () => {
      const getSessionSpy = jest
        .spyOn(supabase.auth, 'getSession')
        .mockResolvedValue({ data: { session: null }, error: null } as any);

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { status: 'ok', service: 'foodai-backend' },
        }),
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const health = await checkBackendHealth('https://api.foodai.example.com');

      expect(health.ok).toBe(true);
      expect(health.status).toBe(200);
      expect(getSessionSpy).not.toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.foodai.example.com/api/health');
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Accept: 'application/json' });
      expect(init.headers.Authorization).toBeUndefined();
    });
  });

  describe('11. Integración con ciclo de vida de Login y Logout de Supabase (AuthContext)', () => {
    it('bloquea antes de iniciar sesión, autoriza tras signIn y vuelve a bloquear inmediatamente tras signOut', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const loggedInToken = buildSyntheticJwt({ sub: 'usr-lifecycle', exp: futureExp });

      const user: AuthUser = {
        id: 'usr-lifecycle',
        email: 'chef@foodai.app',
        created_at: '2026-10-31T10:00:00Z',
        app_metadata: {},
        user_metadata: { name: 'Chef FoodAI' },
        aud: 'authenticated',
      };

      const activeSession: AuthSession = {
        access_token: loggedInToken,
        refresh_token: 'refresh-lifecycle',
        expires_in: 3600,
        expires_at: futureExp,
        token_type: 'bearer',
        user,
      };

      let storedSession: AuthSession | null = null;
      let authListener: ((event: string, session: AuthSession | null) => void) | null = null;

      const statefulSupabase = {
        auth: {
          getSession: jest.fn().mockImplementation(async () => ({
            data: { session: storedSession },
            error: null,
          })),
          refreshSession: jest.fn().mockImplementation(async () => ({
            data: { session: storedSession },
            error: storedSession ? null : { message: 'No session' },
          })),
          signInWithPassword: jest.fn().mockImplementation(async () => {
            storedSession = activeSession;
            authListener?.('SIGNED_IN', storedSession);
            return { data: { user, session: activeSession }, error: null };
          }),
          signOut: jest.fn().mockImplementation(async () => {
            storedSession = null;
            authListener?.('SIGNED_OUT', null);
            return { error: null };
          }),
          onAuthStateChange: jest.fn().mockImplementation((cb) => {
            authListener = cb;
            return {
              data: { subscription: { unsubscribe: jest.fn() } },
            };
          }),
        },
      } as unknown as SupabaseClient & SupabaseAuthClientLike;

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider initialSession={null} supabaseClient={statefulSupabase}>
          {children}
        </AuthProvider>
      );

      const { result } = await renderHook(() => useAuth(), { wrapper });
      expect(result.current.isAuthenticated).toBe(false);

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => SAMPLE_RECIPES_SUCCESS_RESPONSE,
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      // 1. Antes de signIn -> falla cerrado sin tocar la red
      await expect(
        recommendRecipes(VALID_RECIPE_REQUEST, { authClient: statefulSupabase })
      ).rejects.toMatchObject({
        code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        status: 401,
      });
      expect(mockFetch).not.toHaveBeenCalled();

      // 2. signIn -> sesión activa y petición autenticada con Bearer token
      await act(async () => {
        await result.current.signIn('chef@foodai.app', 'claveSegura123');
      });
      expect(result.current.isAuthenticated).toBe(true);

      const recipes = await recommendRecipes(VALID_RECIPE_REQUEST, {
        authClient: statefulSupabase,
      });
      expect(recipes).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${loggedInToken}`);

      // 3. signOut -> limpia sesión y bloquea nuevas peticiones protegidas
      await act(async () => {
        await result.current.signOut();
      });
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.session).toBeNull();

      await expect(
        recommendRecipes(VALID_RECIPE_REQUEST, { authClient: statefulSupabase })
      ).rejects.toMatchObject({
        code: AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        status: 401,
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('12. Aislamiento cruzado estricto entre Usuario A y Usuario B', () => {
    it('usa exclusivamente el Bearer token del usuario activo y limpia el estado de IA al cambiar de cuenta', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const tokenUserA = buildSyntheticJwt({ sub: 'usr-alice-a', exp: futureExp }, 'sig_alice');
      const tokenUserB = buildSyntheticJwt({ sub: 'usr-bob-b', exp: futureExp }, 'sig_bob');

      const userA: AuthUser = {
        id: 'usr-alice-a',
        email: 'alice@foodai.app',
        created_at: '2026-10-31T10:00:00Z',
        app_metadata: {},
        user_metadata: { name: 'Alice' },
        aud: 'authenticated',
      };
      const sessionA: AuthSession = {
        access_token: tokenUserA,
        refresh_token: 'refresh-a',
        expires_in: 3600,
        expires_at: futureExp,
        token_type: 'bearer',
        user: userA,
      };

      const userB: AuthUser = {
        id: 'usr-bob-b',
        email: 'bob@foodai.app',
        created_at: '2026-10-31T11:00:00Z',
        app_metadata: {},
        user_metadata: { name: 'Bob' },
        aud: 'authenticated',
      };
      const sessionB: AuthSession = {
        access_token: tokenUserB,
        refresh_token: 'refresh-b',
        expires_in: 3600,
        expires_at: futureExp,
        token_type: 'bearer',
        user: userB,
      };

      let activeSession: AuthSession | null = sessionA;
      let authListener: ((event: string, session: AuthSession | null) => void) | null = null;

      jest.spyOn(supabase.auth, 'getSession').mockImplementation(
        async () =>
          ({
            data: { session: activeSession },
            error: null,
          }) as any
      );

      const mockSupabase = {
        auth: {
          getSession: supabase.auth.getSession,
          signInWithPassword: jest.fn().mockImplementation(async ({ email }) => {
            activeSession = email.includes('alice') ? sessionA : sessionB;
            authListener?.('SIGNED_IN', activeSession);
            return { data: { user: activeSession.user, session: activeSession }, error: null };
          }),
          signOut: jest.fn().mockImplementation(async () => {
            activeSession = null;
            authListener?.('SIGNED_OUT', null);
            return { error: null };
          }),
          onAuthStateChange: jest.fn().mockImplementation((cb) => {
            authListener = cb;
            return { data: { subscription: { unsubscribe: jest.fn() } } };
          }),
        },
      } as unknown as SupabaseClient;

      const mockFetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              recipes: [{ ...SAMPLE_BACKEND_RECIPE, name: 'Receta Privada de Alice' }],
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => SAMPLE_MEAL_PLAN_SUCCESS_RESPONSE,
        });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <AuthProvider initialSession={sessionA} supabaseClient={mockSupabase}>
          <BudgetProvider>
            <PantryProvider>
              <RecipeProvider initialIsDemoMode={false} recipeApiClient={recipeApi}>
                <MealPlanProvider mealPlanApiClient={mealPlanApi}>{children}</MealPlanProvider>
              </RecipeProvider>
            </PantryProvider>
          </BudgetProvider>
        </AuthProvider>
      );

      const { result } = await renderHook(
        () => ({
          auth: useAuth(),
          pantry: usePantry(),
          recipes: useRecipes(),
          mealPlan: useMealPlan(),
        }),
        { wrapper }
      );

      // 1. Usuario A registra sus ingredientes y genera recetas con su propio Bearer token
      await act(async () => {
        await result.current.pantry.addIngredient({
          name: 'Pollo de Alice',
          quantity: 500,
          unit: 'g',
          category: 'Carnes y proteínas',
        });
      });

      await act(async () => {
        await result.current.recipes.generateRecipes();
      });

      expect(result.current.recipes.recipes).toHaveLength(1);
      expect(result.current.recipes.recipes[0].name).toBe('Receta Privada de Alice');
      expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${tokenUserA}`);

      // 2. Cambio de sesión: Usuario A cierra sesión e ingresa Usuario B
      await act(async () => {
        await result.current.auth.signOut();
      });
      expect(result.current.recipes.recipes).toEqual([]);
      expect(result.current.pantry.ingredients).toEqual([]);

      await act(async () => {
        await result.current.auth.signIn('bob@foodai.app', 'claveBob123');
      });
      expect(result.current.auth.user?.id).toBe('usr-bob-b');
      expect(result.current.recipes.recipes).toEqual([]);
      expect(result.current.pantry.ingredients).toEqual([]);

      // 3. Usuario B registra su propia despensa aislada y genera un plan con el Bearer token exclusivo de Bob
      await act(async () => {
        await result.current.pantry.addIngredient({
          name: 'Arroz de Bob',
          quantity: 600,
          unit: 'g',
          category: 'Granos y cereales',
        });
      });

      await act(async () => {
        await result.current.mealPlan.generateMealPlan();
      });

      expect(result.current.mealPlan.plan?.days).toHaveLength(3);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[1][1].headers.Authorization).toBe(`Bearer ${tokenUserB}`);
      expect(mockFetch.mock.calls[1][1].headers.Authorization).not.toContain(tokenUserA);

      const secondBody = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(secondBody.pantry).toEqual([
        expect.objectContaining({ name: 'Arroz de Bob' }),
      ]);
    });
  });

  describe('13. Unidades auxiliares de ApiAuthError y resolveHttpAuthError', () => {
    it('clasifica códigos 401 desconocidos con mensaje genérico en español y retorna null para errores no relacionados con auth', () => {
      const generic401 = resolveHttpAuthError(401, { code: 'CUSTOM_AUTH_DENIED' });
      expect(generic401).toEqual({
        code: 'CUSTOM_AUTH_DENIED',
        status: 401,
        message:
          'Se requiere autenticación o tu sesión ha expirado. Por favor, inicia sesión nuevamente.',
        isAuthError: true,
      });

      expect(resolveHttpAuthError(500, { code: 'INTERNAL_ERROR' })).toBeNull();
      expect(resolveHttpAuthError(503, { code: 'GEMINI_UNAVAILABLE' })).toBeNull();

      const err = new ApiAuthError(
        AUTH_ERROR_MESSAGES.AUTH_TOKEN_REQUIRED,
        AUTH_ERROR_CODES.AUTH_TOKEN_REQUIRED,
        401
      );
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(ApiAuthError);
      expect(err.isAuthError).toBe(true);
    });
  });
});
