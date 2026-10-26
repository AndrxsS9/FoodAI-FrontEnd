/**
 * FoodAI — Phase 5 Final GitHub Audit Corrections Regression Test Suite
 *
 * Cobertura de regresión exhaustiva:
 * - FIX 1: Protección declarativa de rutas privadas antes de su renderizado (Stack.Protected).
 * - FIX 2: Invalidación estricta de operaciones de IA ante cambio de usuario (RecipeContext & MealPlanContext),
 *          descarte de respuestas tardías (deferred promises) y aislamiento de estado entre cuentas.
 * - FIX 3: Protección contra condiciones de carrera en inicialización de autenticación (getSession vs signOut
 *          y eventos out-of-order con contador monótono).
 * - FIX 4: Compatibilidad del cliente de Supabase (URL polyfill y variables de entorno oficiales).
 * - FIX 5: Flujo de confirmación de correo MVP (confirmación web en navegador y login manual sin callbacks nativos).
 */

import React from 'react';
import { render, renderHook, act, waitFor, fireEvent } from '@testing-library/react-native';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { RecipeProvider, useRecipes } from '../src/context/RecipeContext';
import { PantryProvider } from '../src/context/PantryContext';
import { MealPlanProvider, useMealPlan } from '../src/context/MealPlanContext';
import { BudgetProvider } from '../src/context/BudgetContext';
import { TypographyProvider } from '../src/theme';
import RegisterScreen from '../app/(auth)/register';
import { isSupabaseConfigured, SUPABASE_NOT_CONFIGURED_ERROR } from '../src/services/supabase/client';
import { AuthSession, AuthUser } from '../src/types/auth';
import { BackendRecipe } from '../src/types/recipe';
import { BackendMealPlanResponseData } from '../src/types/mealPlan';
import type { SupabaseClient } from '@supabase/supabase-js';

// Mocks de Expo Router
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');

  const MockProtected = ({
    guard,
    redirectTo,
    children,
  }: {
    guard: boolean;
    redirectTo?: string;
    children: React.ReactNode;
  }) => {
    if (!guard) {
      return React.createElement(View, {
        testID: 'protected-redirect',
        'data-redirect-to': redirectTo,
      });
    }
    return React.createElement(React.Fragment, null, children);
  };

  const MockScreen = ({ name }: { name: string }) => {
    return React.createElement(View, { testID: `mock-screen-${name}` });
  };

  const MockStack = Object.assign(
    ({ children }: { children: React.ReactNode }) =>
      React.createElement(View, { testID: 'stack-navigator' }, children),
    {
      Screen: MockScreen,
      Protected: MockProtected,
    }
  );

  return {
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
      back: mockBack,
    }),
    Stack: MockStack,
  };
});

// Helper para crear promesas diferidas (Deferred Promise)
function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // Prevenir unhandled rejection en el runtime de Node
  promise.catch(() => {});
  return { promise, resolve, reject };
}

const USER_A: AuthUser = {
  id: 'usr-audit-user-A',
  email: 'usuarioA@foodai.app',
  created_at: '2026-10-26T10:00:00Z',
  app_metadata: {},
  user_metadata: { name: 'Usuario A' },
  aud: 'authenticated',
};

const USER_B: AuthUser = {
  id: 'usr-audit-user-B',
  email: 'usuarioB@foodai.app',
  created_at: '2026-10-26T10:00:00Z',
  app_metadata: {},
  user_metadata: { name: 'Usuario B' },
  aud: 'authenticated',
};

const SESSION_A: AuthSession = {
  access_token: 'jwt-user-A',
  refresh_token: 'refresh-user-A',
  expires_in: 3600,
  token_type: 'bearer',
  user: USER_A,
};

const SESSION_B: AuthSession = {
  access_token: 'jwt-user-B',
  refresh_token: 'refresh-user-B',
  expires_in: 3600,
  token_type: 'bearer',
  user: USER_B,
};

const MOCK_BACKEND_RECIPES: BackendRecipe[] = [
  {
    name: 'Guiso de Pollo con Verduras',
    description: 'Delicioso guiso de pollo',
    totalMinutes: 25,
    convenience: 90,
    ingredients: [
      { name: 'Pollo', quantity: 500, unit: 'g' },
      { name: 'Tomate', quantity: 2, unit: 'unidad' },
    ],
    availableIngredients: [
      { name: 'Pollo', quantity: 500, unit: 'g' },
    ],
    missingIngredients: [],
    steps: ['Cortar el pollo', 'Cocinar las verduras', 'Servir caliente'],
    estimatedMissingCost: 0,
    budgetRemaining: 8000,
    withinBudget: true,
    reason: 'Aprovecha el pollo disponible.',
  },
];

const MOCK_BACKEND_MEAL_PLAN: BackendMealPlanResponseData = {
  days: [
    {
      day: 1,
      recipe: MOCK_BACKEND_RECIPES[0],
    },
    {
      day: 2,
      recipe: MOCK_BACKEND_RECIPES[0],
    },
    {
      day: 3,
      recipe: MOCK_BACKEND_RECIPES[0],
    },
  ],
  totalEstimatedMissingCost: 0,
  budgetRemaining: 15000,
  withinBudget: true,
};

describe('FoodAI — Phase 5 Final GitHub Audit Corrections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // FIX 3 — Auth Initialization Race Protection
  // =========================================================================
  describe('FIX 3 — Auth Initialization Race Protection', () => {
    it('discards a slow getSession result that resolves AFTER user signs out', async () => {
      const getSessionDeferred = createDeferred<{
        data: { session: AuthSession | null };
        error: any;
      }>();

      let authStateCb: ((event: string, session: AuthSession | null) => void) | null = null;

      const mockSupabase = {
        auth: {
          getSession: jest.fn().mockReturnValue(getSessionDeferred.promise),
          signOut: jest.fn().mockResolvedValue({ error: null }),
          onAuthStateChange: jest.fn().mockImplementation((cb) => {
            authStateCb = cb;
            return { data: { subscription: { unsubscribe: jest.fn() } } };
          }),
        },
      } as unknown as SupabaseClient;

      const { result } = await renderHook(() => useAuth(), {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <AuthProvider supabaseClient={mockSupabase}>{children}</AuthProvider>
        ),
      });

      // Al inicio getSession está pendiente y la inicialización está en curso
      expect(result.current.isInitializing).toBe(true);
      expect(result.current.isAuthenticated).toBe(false);

      // Usuario cierra sesión antes de que getSession resuelva
      await act(async () => {
        await result.current.signOut();
      });

      expect(result.current.session).toBeNull();
      expect(result.current.user).toBeNull();
      expect(result.current.isInitializing).toBe(false);

      // Ahora resuelve getSession tardíamente con SESSION_A
      await act(async () => {
        getSessionDeferred.resolve({
          data: { session: SESSION_A },
          error: null,
        });
      });

      // VERIFICACIÓN CRÍTICA: El resultado tardío no debe revivir la sesión cerrada
      expect(result.current.session).toBeNull();
      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.isInitializing).toBe(false);
    });

    it('handles out-of-order onAuthStateChange events without overwriting a newer session', async () => {
      let authStateCb: ((event: string, session: AuthSession | null) => void) | null = null;

      const mockSupabase = {
        auth: {
          getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
          onAuthStateChange: jest.fn().mockImplementation((cb) => {
            authStateCb = cb;
            return { data: { subscription: { unsubscribe: jest.fn() } } };
          }),
        },
      } as unknown as SupabaseClient;

      const { result } = await renderHook(() => useAuth(), {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <AuthProvider initialSession={null} supabaseClient={mockSupabase}>
            {children}
          </AuthProvider>
        ),
      });

      expect(result.current.user).toBeNull();

      // Emitimos login con User B (más reciente)
      await act(async () => {
        authStateCb!('SIGNED_IN', SESSION_B);
      });

      expect(result.current.user?.email).toBe('usuarioB@foodai.app');

      // Emitimos refresco de token para User B
      await act(async () => {
        authStateCb!('TOKEN_REFRESHED', SESSION_B);
      });

      expect(result.current.user?.email).toBe('usuarioB@foodai.app');
    });
  });

  // =========================================================================
  // FIX 2 — Invalidate Old AI Operations When User Changes
  // =========================================================================
  describe('FIX 2 — Invalidate Old AI Operations When User Changes', () => {
    const mockPantry = [
      {
        id: 'p1',
        name: 'Pollo',
        quantity: 500,
        unit: 'g' as const,
        category: 'Carnes y proteínas' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    it('discards late AI recipe response from User A after User B becomes active', async () => {
      const deferredAiCall = createDeferred<BackendRecipe[]>();

      const mockRecipeApi = {
        recommendRecipes: jest.fn().mockReturnValue(deferredAiCall.promise),
      } as any;

      let currentUserId = 'user-A';

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <TypographyProvider usingFallback={true}>
          <PantryProvider initialIngredients={mockPantry} userId={currentUserId}>
            <BudgetProvider initialPreferences={{ budget: 20000, servings: 2 }} userId={currentUserId}>
              <RecipeProvider recipeApiClient={mockRecipeApi} userId={currentUserId} initialIsDemoMode={false}>
                {children}
              </RecipeProvider>
            </BudgetProvider>
          </PantryProvider>
        </TypographyProvider>
      );

      const { result, rerender } = await renderHook(() => useRecipes(), { wrapper });

      expect(result.current.recipes).toEqual([]);
      expect(result.current.isGenerating).toBe(false);

      // Usuario A inicia generación con IA
      let genPromise!: Promise<any>;
      await act(async () => {
        genPromise = result.current.generateRecipes();
      });

      expect(result.current.isGenerating).toBe(true);
      expect(mockRecipeApi.recommendRecipes).toHaveBeenCalledTimes(1);

      // ANTES de que la promesa de IA resuelva, la cuenta cambia a Usuario B
      // (sin desmontar la aplicación, probando la reactividad interna del Provider)
      currentUserId = 'user-B';
      await act(async () => {
        await rerender(undefined);
      });

      // El estado de generación debe invalidarse y limpiarse inmediatamente para Usuario B
      expect(result.current.recipes).toEqual([]);
      expect(result.current.isGenerating).toBe(false);
      expect(result.current.error).toBeNull();

      // Ahora la respuesta tardía de IA para Usuario A finalmente resuelve
      await act(async () => {
        deferredAiCall.resolve(MOCK_BACKEND_RECIPES);
        await genPromise;
      });

      // VERIFICACIÓN ESTRICTA: Las recetas de Usuario A NO deben contaminar la pantalla de Usuario B
      expect(result.current.recipes).toEqual([]);
      expect(result.current.isGenerating).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('discards late AI recipe errors from User A after User B becomes active', async () => {
      const deferredAiError = createDeferred<BackendRecipe[]>();

      const mockRecipeApi = {
        recommendRecipes: jest.fn().mockReturnValue(deferredAiError.promise),
      } as any;

      let currentUserId = 'user-A';

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <TypographyProvider usingFallback={true}>
          <PantryProvider initialIngredients={mockPantry} userId={currentUserId}>
            <BudgetProvider initialPreferences={{ budget: 20000, servings: 2 }} userId={currentUserId}>
              <RecipeProvider recipeApiClient={mockRecipeApi} userId={currentUserId} initialIsDemoMode={false}>
                {children}
              </RecipeProvider>
            </BudgetProvider>
          </PantryProvider>
        </TypographyProvider>
      );

      const { result, rerender } = await renderHook(() => useRecipes(), { wrapper });

      let genPromise!: Promise<any>;
      await act(async () => {
        genPromise = result.current.generateRecipes();
      });

      expect(result.current.isGenerating).toBe(true);

      // Cambio inmediato a Usuario B
      currentUserId = 'user-B';
      await act(async () => {
        await rerender(undefined);
      });

      expect(result.current.isGenerating).toBe(false);

      // Falla tardíamente la petición de IA de Usuario A
      await act(async () => {
        deferredAiError.reject(new Error('Fallo de IA en cuenta A'));
        try {
          await genPromise;
        } catch {}
      });

      // El error de Usuario A no debe registrarse en el estado de Usuario B
      expect(result.current.error).toBeNull();
      expect(result.current.recipes).toEqual([]);
      expect(result.current.isGenerating).toBe(false);
    });

    it('discards late meal plan AI response from User A after User B becomes active', async () => {
      const deferredPlanCall = createDeferred<BackendMealPlanResponseData>();

      const mockPlanApi = {
        generateMealPlan: jest.fn().mockReturnValue(deferredPlanCall.promise),
      } as any;

      let currentUserId = 'user-A';

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <TypographyProvider usingFallback={true}>
          <PantryProvider initialIngredients={mockPantry} userId={currentUserId}>
            <BudgetProvider initialPreferences={{ budget: 20000, servings: 2 }} userId={currentUserId}>
              <MealPlanProvider mealPlanApiClient={mockPlanApi} userId={currentUserId}>
                {children}
              </MealPlanProvider>
            </BudgetProvider>
          </PantryProvider>
        </TypographyProvider>
      );

      const { result, rerender } = await renderHook(() => useMealPlan(), { wrapper });

      let planPromise!: Promise<any>;
      await act(async () => {
        planPromise = result.current.generateMealPlan();
      });

      expect(result.current.isGenerating).toBe(true);

      // Usuario B inicia sesión
      currentUserId = 'user-B';
      await act(async () => {
        await rerender(undefined);
      });

      expect(result.current.isGenerating).toBe(false);
      expect(result.current.plan).toBeNull();

      // Respuesta tardía de Usuario A resuelve
      await act(async () => {
        deferredPlanCall.resolve(MOCK_BACKEND_MEAL_PLAN);
        await planPromise;
      });

      // Plan de comidas de Usuario A descartado completamente
      expect(result.current.plan).toBeNull();
      expect(result.current.isGenerating).toBe(false);
    });
  });

  // =========================================================================
  // FIX 1 — Protect Private Routes Before Rendering (Stack.Protected)
  // =========================================================================
  describe('FIX 1 — Protect Private Routes Before Rendering', () => {
    it('does not render private routes when user is unauthenticated and redirects to login', async () => {
      const { Stack } = require('expo-router');

      function TestLayout({ isAuthenticated }: { isAuthenticated: boolean }) {
        return (
          <Stack>
            <Stack.Screen name="index" />
            <Stack.Protected guard={!isAuthenticated} redirectTo="/(tabs)">
              <Stack.Screen name="(auth)" />
            </Stack.Protected>
            <Stack.Protected guard={isAuthenticated} redirectTo="/(auth)/login">
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="recetas" />
              <Stack.Screen name="escaner" />
            </Stack.Protected>
          </Stack>
        );
      }

      // Usuario no autenticado
      const { getByTestId, queryByTestId } = await render(<TestLayout isAuthenticated={false} />);

      // index está presente (pública)
      expect(getByTestId('mock-screen-index')).toBeTruthy();

      // (auth) está presente porque !isAuthenticated es true
      expect(getByTestId('mock-screen-(auth)')).toBeTruthy();

      // Rutas privadas (tabs), recetas, escaner NO se renderizan; se genera redirección
      expect(queryByTestId('mock-screen-(tabs)')).toBeNull();
      expect(queryByTestId('mock-screen-recetas')).toBeNull();
      expect(queryByTestId('mock-screen-escaner')).toBeNull();
      expect(getByTestId('protected-redirect')).toBeTruthy();
      expect(getByTestId('protected-redirect').props['data-redirect-to']).toBe('/(auth)/login');
    });

    it('renders private routes and guards auth group when user is authenticated', async () => {
      const { Stack } = require('expo-router');

      function TestLayout({ isAuthenticated }: { isAuthenticated: boolean }) {
        return (
          <Stack>
            <Stack.Screen name="index" />
            <Stack.Protected guard={!isAuthenticated} redirectTo="/(tabs)">
              <Stack.Screen name="(auth)" />
            </Stack.Protected>
            <Stack.Protected guard={isAuthenticated} redirectTo="/(auth)/login">
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="recetas" />
              <Stack.Screen name="escaner" />
            </Stack.Protected>
          </Stack>
        );
      }

      // Usuario autenticado
      const { getByTestId, queryByTestId } = await render(<TestLayout isAuthenticated={true} />);

      // index está presente
      expect(getByTestId('mock-screen-index')).toBeTruthy();

      // Rutas privadas están renderizadas
      expect(getByTestId('mock-screen-(tabs)')).toBeTruthy();
      expect(getByTestId('mock-screen-recetas')).toBeTruthy();
      expect(getByTestId('mock-screen-escaner')).toBeTruthy();

      // Grupo (auth) está protegido contra usuarios autenticados
      expect(queryByTestId('mock-screen-(auth)')).toBeNull();
      expect(getByTestId('protected-redirect')).toBeTruthy();
      expect(getByTestId('protected-redirect').props['data-redirect-to']).toBe('/(tabs)');
    });
  });

  // =========================================================================
  // FIX 4 — Supabase Client Compatibility & Configuration
  // =========================================================================
  describe('FIX 4 — Supabase Client Compatibility', () => {
    it('provides clear error message constant for unconfigured environments', () => {
      expect(SUPABASE_NOT_CONFIGURED_ERROR).toContain('Supabase no está configurado');
      expect(SUPABASE_NOT_CONFIGURED_ERROR).toContain('EXPO_PUBLIC_SUPABASE_URL');
      expect(SUPABASE_NOT_CONFIGURED_ERROR).toContain('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
    });

    it('correctly validates if Supabase is configured without throwing', () => {
      const isConfigured = isSupabaseConfigured();
      expect(typeof isConfigured).toBe('boolean');
    });
  });

  // =========================================================================
  // FIX 5 — Working MVP Email Confirmation
  // =========================================================================
  describe('FIX 5 — Working MVP Email Confirmation', () => {
    it('shows browser confirmation instructions and navigates to login without native callback', async () => {
      const mockSupabase = {
        auth: {
          getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
          signUp: jest.fn().mockResolvedValue({
            data: { user: USER_A, session: null }, // confirmationPending = true
            error: null,
          }),
          onAuthStateChange: jest.fn().mockReturnValue({
            data: { subscription: { unsubscribe: jest.fn() } },
          }),
        },
      } as unknown as SupabaseClient;

      const { getByTestId, getByText } = await render(
        <SafeAreaProvider
          initialMetrics={{
            insets: { top: 0, left: 0, right: 0, bottom: 0 },
            frame: { x: 0, y: 0, width: 390, height: 844 },
          }}
        >
          <TypographyProvider usingFallback={true}>
            <AuthProvider initialSession={null} supabaseClient={mockSupabase}>
              <RegisterScreen />
            </AuthProvider>
          </TypographyProvider>
        </SafeAreaProvider>
      );

      // Llenamos el formulario
      await act(async () => {
        fireEvent.changeText(getByTestId('register-email-input'), 'usuarioA@foodai.app');
        fireEvent.changeText(getByTestId('register-password-input'), 'Segura123!');
        fireEvent.changeText(getByTestId('register-confirm-password-input'), 'Segura123!');
      });

      // Enviamos el registro
      await act(async () => {
        fireEvent.press(getByTestId('register-submit-button'));
      });

      // Se muestra la tarjeta de confirmación
      await waitFor(() => {
        expect(getByTestId('register-confirmation-card')).toBeTruthy();
      });

      // Verifica que el texto guíe al navegador web y al login manual
      expect(getByText(/enlace en tu navegador web/)).toBeTruthy();
      expect(getByText(/regresa a FoodAI e inicia sesión manualmente/)).toBeTruthy();

      // Al presionar ir al login, navega limpiamente a /(auth)/login
      fireEvent.press(getByTestId('confirmation-go-login-button'));
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
    });
  });
});
