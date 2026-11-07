/**
 * Corrección 2 (MVP) - Recomendación del día para usuarios autenticados reales y aislamiento
 * del estado demo.
 *
 * Usa un árbol de proveedores FIEL a app/_layout.tsx (AuthProvider real con cliente Supabase
 * simulado y proveedores de Despensa/Presupuesto/Recetas/Plan con `key` por usuario) y
 * almacenamiento AsyncStorage real (simulado). La única diferencia con la app es el cliente de
 * la API de recetas, inyectado para controlar las respuestas del backend.
 */
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';

import HomeScreen from '../app/(tabs)/index';
import RecipeDiscoveryScreen from '../app/recetas/index';
import RecipeDetailScreen from '../app/recetas/[id]';
import { ThemeProvider, TypographyProvider } from '../src/theme';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { PantryProvider, usePantry, PantryContextValue } from '../src/context/PantryContext';
import { BudgetProvider, useBudget, BudgetContextValue } from '../src/context/BudgetContext';
import { RecipeProvider, useRecipes, RecipeContextValue } from '../src/context/RecipeContext';
import { MealPlanProvider } from '../src/context/MealPlanContext';
import { createPantryStorage, PantryStorageAdapter } from '../src/services/storage/pantryStorage';
import { createBudgetStorage, BudgetStorageAdapter } from '../src/services/storage/budgetStorage';
import { AuthSession, AuthUser } from '../src/types/auth';
import { Ingredient } from '../src/types/pantry';
import { BackendRecipe } from '../src/types/recipe';
import { BASE_DEMO_RECIPES } from '../src/fixtures/demoRecipes';

const mockPush = jest.fn();
let mockSearchParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockSearchParams,
}));

// ---------------------------------------------------------------------------------------------
// Sesiones y datos
// ---------------------------------------------------------------------------------------------
const user = (id: string, email: string): AuthUser => ({
  id,
  email,
  created_at: '2026-11-01T00:00:00Z',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
});
const USER_A = user('usr-alice-111', 'alice@foodai.app');
const USER_B = user('usr-bob-222', 'bob@foodai.app');
const session = (u: AuthUser): AuthSession => ({
  access_token: `jwt-${u.id}`,
  refresh_token: `refresh-${u.id}`,
  expires_in: 3600,
  token_type: 'bearer',
  user: u,
});
const SESSION_A = session(USER_A);
const SESSION_B = session(USER_B);

function createSupabaseClient() {
  return {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signInWithPassword: jest.fn().mockImplementation(({ email }: { email: string }) => {
        const s = email.includes('alice') ? SESSION_A : SESSION_B;
        return Promise.resolve({ data: { user: s.user, session: s }, error: null });
      }),
      signUp: jest.fn(),
      signOut: jest.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
  } as unknown as SupabaseClient;
}

const ingredient = (id: string, name: string, quantity = 1, unit: Ingredient['unit'] = 'unidad'): Ingredient => ({
  id,
  name,
  quantity,
  unit,
  category: 'Otros',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
});
const PANTRY_A = [ingredient('a-1', 'Arroz', 500, 'g'), ingredient('a-2', 'Pollo', 300, 'g'), ingredient('a-3', 'Cebolla')];
const PANTRY_B = [ingredient('b-1', 'Lentejas', 400, 'g')];

const u = (name: string, estimatedCost?: number) => ({
  name,
  quantity: 1,
  unit: 'unidad',
  ...(estimatedCost !== undefined ? { estimatedCost } : {}),
});
const backendRecipe = (overrides: Partial<BackendRecipe> & { name: string }): BackendRecipe => ({
  description: 'Generada por el backend',
  totalMinutes: 30,
  ingredients: [],
  steps: ['Cocinar'],
  availableIngredients: [],
  missingIngredients: [],
  estimatedMissingCost: 0,
  budgetRemaining: 30000,
  withinBudget: true,
  convenience: 70,
  reason: 'Aprovecha tu despensa',
  ...overrides,
});

/** Receta REAL del backend con el MISMO nombre que el fixture demo, pero datos propios. */
const REAL_SAME_NAME = backendRecipe({
  name: 'Arroz con pollo y verduras',
  availableIngredients: [u('Arroz'), u('Pollo'), u('Cebolla')],
  missingIngredients: [u('Zanahoria', 2500)],
  estimatedMissingCost: 2500,
  budgetRemaining: 32500,
  convenience: 61,
});
const REAL_LOW_COVERAGE = backendRecipe({
  name: 'Sopa de verduras',
  availableIngredients: [u('Cebolla')],
  missingIngredients: [u('Papa', 3000), u('Zanahoria', 2500)],
  estimatedMissingCost: 5500,
  convenience: 90,
});

function createApi(impl?: () => Promise<BackendRecipe[]>) {
  return {
    recommendRecipes: jest.fn(impl ?? (() => Promise.resolve([REAL_LOW_COVERAGE, REAL_SAME_NAME]))),
    checkBackendHealth: jest.fn(),
  } as any;
}

// ---------------------------------------------------------------------------------------------
// Arnés fiel a app/_layout.tsx
// ---------------------------------------------------------------------------------------------
let authCtx: ReturnType<typeof useAuth>;
let recipeCtx: RecipeContextValue;
let pantryCtx: PantryContextValue;
let budgetCtx: BudgetContextValue;
let setScreen: (s: Screen) => void = () => {};
type Screen = 'home' | 'recipes' | 'detail';

function Probe() {
  authCtx = useAuth();
  recipeCtx = useRecipes();
  pantryCtx = usePantry();
  budgetCtx = useBudget();
  return null;
}

function ScreenSwitch({ initial }: { initial: Screen }) {
  const [screen, set] = useState<Screen>(initial);
  setScreen = (s: Screen) => set(s);
  if (screen === 'recipes') return <RecipeDiscoveryScreen />;
  if (screen === 'detail') return <RecipeDetailScreen />;
  return <HomeScreen />;
}

/** Réplica de AuthenticatedProviders (app/_layout.tsx): remonta los proveedores por usuario. */
function SessionProviders({
  children,
  api,
  pantryAdapter,
  budgetAdapter,
}: {
  children: React.ReactNode;
  api: ReturnType<typeof createApi>;
  pantryAdapter?: PantryStorageAdapter;
  budgetAdapter?: BudgetStorageAdapter;
}) {
  const { user: current } = useAuth();
  const sessionKey = current?.id ?? 'anonymous';
  return (
    <PantryProvider key={`pantry-${sessionKey}`} storageAdapter={pantryAdapter}>
      <BudgetProvider key={`budget-${sessionKey}`} storageAdapter={budgetAdapter}>
        <RecipeProvider key={`recipe-${sessionKey}`} recipeApiClient={api}>
          <MealPlanProvider key={`mealplan-${sessionKey}`}>{children}</MealPlanProvider>
        </RecipeProvider>
      </BudgetProvider>
    </PantryProvider>
  );
}

async function renderApp(options: {
  api: ReturnType<typeof createApi>;
  initial?: Screen;
  sessionToRestore?: AuthSession | null;
  pantryAdapter?: PantryStorageAdapter;
  budgetAdapter?: BudgetStorageAdapter;
}) {
  const client = createSupabaseClient();
  const utils = await render(
    <SafeAreaProvider
      initialMetrics={{ insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 390, height: 844 } }}
    >
      <TypographyProvider usingFallback={true}>
        <ThemeProvider initialMode="light">
          <AuthProvider
            initialSession={options.sessionToRestore === undefined ? SESSION_A : options.sessionToRestore}
            supabaseClient={client}
          >
            <SessionProviders api={options.api} pantryAdapter={options.pantryAdapter} budgetAdapter={options.budgetAdapter}>
              <Probe />
              <ScreenSwitch initial={options.initial ?? 'home'} />
            </SessionProviders>
          </AuthProvider>
        </ThemeProvider>
      </TypographyProvider>
    </SafeAreaProvider>
  );
  return { ...utils, client };
}

const waitForHydration = async () => {
  await waitFor(() => {
    expect(pantryCtx.isLoading).toBe(false);
    expect(budgetCtx.isLoading).toBe(false);
  });
};

const go = async (screen: Screen) => {
  await act(async () => {
    setScreen(screen);
  });
};

/** Generación iniciada por el usuario desde la pantalla de Recetas (flujo existente). */
const generateFromRecipesScreen = async (getByTestId: (id: string) => any) => {
  await go('recipes');
  await act(async () => {
    fireEvent.press(getByTestId('recipes-generate-ai-button'));
  });
  await waitFor(() => expect(recipeCtx.isGenerating).toBe(false));
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let fetchSpy: jest.Mock;
const originalFetch = globalThis.fetch;

beforeEach(async () => {
  await cleanup();
  jest.clearAllMocks();
  mockSearchParams = {};
  await AsyncStorage.clear();
  await createPantryStorage(USER_A.id).saveIngredients(PANTRY_A);
  await createBudgetStorage(USER_A.id).savePreferences({ budget: 35000, servings: 3 });
  await createPantryStorage(USER_B.id).saveIngredients(PANTRY_B);
  fetchSpy = jest.fn(() => Promise.reject(new Error('Red no permitida en pruebas')));
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
});

afterEach(async () => {
  await cleanup();
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------------------------
// 1. Estado inicial del usuario autenticado
// ---------------------------------------------------------------------------------------------
describe('Usuario autenticado sin recetas generadas', () => {
  it('Inicio muestra un estado vacío real (sin modo demo, sin fixtures, sin banner de ejemplo)', async () => {
    const api = createApi();
    const { getByTestId, queryByTestId, queryByText } = await renderApp({ api });
    await waitForHydration();

    expect(recipeCtx.isDemoMode).toBe(false);
    expect(recipeCtx.recipes).toEqual([]);
    expect(getByTestId('home-empty-recipe-state')).toBeTruthy();
    expect(queryByTestId('home-recommendation-demo-state')).toBeNull();
    expect(queryByTestId('demo-data-banner')).toBeNull();
    expect(queryByText('Arroz con pollo y verduras')).toBeNull();
    expect(queryByText(/conveniente/)).toBeNull();
    expect(api.recommendRecipes).not.toHaveBeenCalled();
  });

  it('la pantalla de Recetas no presenta los fixtures demo como recetas del usuario', async () => {
    const api = createApi();
    const { getByTestId, queryByTestId, queryByText } = await renderApp({ api, initial: 'recipes' });
    await waitForHydration();

    for (const demo of BASE_DEMO_RECIPES) {
      expect(queryByTestId(`recipe-card-${demo.id}`)).toBeNull();
      expect(queryByText(demo.name)).toBeNull();
    }
    expect(queryByTestId('recipes-demo-banner')).toBeNull();
    expect(queryByText(/94% conveniente/)).toBeNull();
    expect(getByTestId('recipes-no-generated-state')).toBeTruthy();
    expect(getByTestId('recipes-generate-ai-button').props.accessibilityState?.disabled).not.toBe(true);
  });

  it('un fixture demo no es accesible por ruta para el usuario autenticado', async () => {
    mockSearchParams = { id: BASE_DEMO_RECIPES[0].id };
    const { getByTestId } = await renderApp({ api: createApi(), initial: 'detail' });
    await waitForHydration();
    expect(recipeCtx.getRecipeById(BASE_DEMO_RECIPES[0].id)).toBeUndefined();
    expect(getByTestId('recipe-not-found-state')).toBeTruthy();
  });

  it('agregar ingredientes tras la hidratación no activa el modo demo ni llama a la IA', async () => {
    const api = createApi();
    const { getByTestId } = await renderApp({ api });
    await waitForHydration();
    await act(async () => {
      await pantryCtx.addIngredient({ name: 'Tomate', quantity: 2, unit: 'unidad', category: 'Verduras y frutas' });
    });
    expect(recipeCtx.isDemoMode).toBe(false);
    expect(getByTestId('home-empty-recipe-state')).toBeTruthy();
    expect(api.recommendRecipes).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
// 2. Generación real
// ---------------------------------------------------------------------------------------------
describe('Generación real iniciada por el usuario', () => {
  it('actualiza Inicio con la mejor receta REAL (ranking intacto) aunque comparta nombre con el fixture demo', async () => {
    const api = createApi();
    const { getByTestId, getByText, queryByText, queryByLabelText } = await renderApp({ api });
    await waitForHydration();

    await generateFromRecipesScreen(getByTestId);
    expect(api.recommendRecipes).toHaveBeenCalledTimes(1);
    // El payload usa el presupuesto y los comensales hidratados del usuario
    const payload = api.recommendRecipes.mock.calls[0][0];
    expect(payload.budget).toBe(35000);
    expect(payload.servings).toBe(3);
    expect(payload.pantry.map((p: { name: string }) => p.name).sort()).toEqual(['Arroz', 'Cebolla', 'Pollo']);

    await go('home');
    expect(getByTestId('home-recommended-recipe-card')).toBeTruthy();
    // Mayor cobertura de despensa gana sobre recipes[0] (ranking determinista)
    expect(getByText('Arroz con pollo y verduras')).toBeTruthy();
    expect(queryByText('Sopa de verduras')).toBeNull();
    expect(getByText(/Elegida entre tus 2 recetas generadas/)).toBeTruthy();
    // Sin filtración de identidad, puntaje, costo ni foto del fixture demo
    expect(getByText('61% conveniente')).toBeTruthy();
    expect(queryByText('94% conveniente')).toBeNull();
    expect(getByText('$2.500')).toBeTruthy();
    expect(queryByText('$5.800')).toBeNull();
    expect(recipeCtx.isDemoMode).toBe(false);
    for (const r of recipeCtx.recipes) {
      expect(r.isDemoFixture).toBe(false);
      expect(r.id.startsWith('demo-')).toBe(false);
    }
    expect(queryByLabelText(/Foto del plato de ejemplo/)).toBeNull();
    expect(getByTestId('home-recipe-fallback-image')).toBeTruthy(); // producción: sin aprobaciones
  });

  it('"Ver receta" navega al detalle real de la receta elegida', async () => {
    const api = createApi();
    const { getByTestId, getByText, queryByTestId } = await renderApp({ api });
    await waitForHydration();
    await generateFromRecipesScreen(getByTestId);
    await go('home');

    await act(async () => {
      fireEvent.press(getByTestId('home-view-recipe-button'));
    });
    expect(mockPush).toHaveBeenCalledWith('/recetas/arroz-con-pollo-y-verduras');
    expect(recipeCtx.selectedRecipe?.id).toBe('arroz-con-pollo-y-verduras');

    mockSearchParams = { id: 'arroz-con-pollo-y-verduras' };
    await go('detail');
    expect(getByTestId('recipe-detail-title')).toBeTruthy();
    expect(getByText('Arroz con pollo y verduras')).toBeTruthy();
    expect(queryByTestId('recipe-detail-demo-banner')).toBeNull();
  });

  it('si la primera generación falla, se muestra el error con reintento y nunca recetas demo', async () => {
    const api = createApi(() => Promise.reject(new Error('El servicio de IA no respondió.')));
    const { getByTestId, getByText, queryByTestId } = await renderApp({ api });
    await waitForHydration();

    await generateFromRecipesScreen(getByTestId);
    // Una sola tarjeta de error con un solo "Reintentar" (sin duplicados) y sin fixtures
    expect(getByTestId('recipes-api-error-card')).toBeTruthy();
    expect(getByText('El servicio de IA no respondió.')).toBeTruthy();
    expect(getByTestId('recipes-retry-button')).toBeTruthy(); // getBy falla si hay más de uno
    expect(getByTestId('recipes-no-generated-state')).toBeTruthy();
    for (const demo of BASE_DEMO_RECIPES) expect(queryByTestId(`recipe-card-${demo.id}`)).toBeNull();

    // Reintentar vuelve a llamar al backend (acción explícita del usuario)
    await act(async () => {
      fireEvent.press(getByTestId('recipes-retry-button'));
    });
    await waitFor(() => expect(recipeCtx.isGenerating).toBe(false));
    expect(api.recommendRecipes).toHaveBeenCalledTimes(2);

    await go('home');
    expect(getByTestId('home-recommendation-error-state')).toBeTruthy();
    expect(getByText('El servicio de IA no respondió.')).toBeTruthy();
    expect(recipeCtx.isDemoMode).toBe(false);
    expect(recipeCtx.recipes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// 3. Obsolescencia
// ---------------------------------------------------------------------------------------------
describe('Recomendación obsoleta tras cambios', () => {
  const change: [string, () => Promise<unknown>][] = [
    ['despensa', () => pantryCtx.addIngredient({ name: 'Zanahoria', quantity: 1, unit: 'unidad', category: 'Verduras y frutas' })],
    ['presupuesto', () => budgetCtx.setBudget(50000)],
    ['comensales', () => budgetCtx.setServings(4)],
    ['tiempo máximo', () => budgetCtx.setMaxMinutes(20)],
  ];

  it.each(change)('cambiar %s invalida la recomendación sin mostrar costos antiguos ni regenerar', async (_label, mutate) => {
    const api = createApi();
    const { getByTestId, queryByTestId, queryByText } = await renderApp({ api });
    await waitForHydration();
    await generateFromRecipesScreen(getByTestId);
    await go('home');
    expect(getByTestId('home-recommended-recipe-card')).toBeTruthy();

    await act(async () => {
      await mutate();
    });

    await waitFor(() => expect(getByTestId('home-recommendation-stale-state')).toBeTruthy());
    expect(queryByTestId('home-recommended-recipe-card')).toBeNull();
    expect(queryByText('$2.500')).toBeNull();
    expect(api.recommendRecipes).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------------------------
// 4. Sesiones
// ---------------------------------------------------------------------------------------------
describe('Aislamiento entre sesiones', () => {
  it('cerrar sesión e iniciar con otro usuario elimina las recetas del usuario anterior', async () => {
    const api = createApi();
    const { getByTestId, queryByText } = await renderApp({ api });
    await waitForHydration();
    await generateFromRecipesScreen(getByTestId);
    await go('home');
    expect(queryByText('Arroz con pollo y verduras')).toBeTruthy();

    await act(async () => {
      await authCtx.signOut();
    });
    await act(async () => {
      await authCtx.signIn('bob@foodai.app', 'secreto-123');
    });
    await waitFor(() => expect(authCtx.user?.id).toBe(USER_B.id));
    await waitForHydration();

    expect(recipeCtx.recipes).toEqual([]);
    expect(recipeCtx.isDemoMode).toBe(false);
    expect(pantryCtx.ingredients.map((i) => i.name)).toEqual(['Lentejas']);
    expect(getByTestId('home-empty-recipe-state')).toBeTruthy();
    expect(queryByText('Arroz con pollo y verduras')).toBeNull();
  });

  it('una respuesta tardía de la sesión anterior no sobrescribe la nueva sesión', async () => {
    const pending = deferred<BackendRecipe[]>();
    const api = createApi(() => pending.promise);
    const { getByTestId, queryByText } = await renderApp({ api });
    await waitForHydration();

    await go('recipes');
    await act(async () => {
      fireEvent.press(getByTestId('recipes-generate-ai-button'));
    });
    expect(api.recommendRecipes).toHaveBeenCalledTimes(1);

    await act(async () => {
      await authCtx.signOut();
    });
    await act(async () => {
      await authCtx.signIn('bob@foodai.app', 'secreto-123');
    });
    await waitFor(() => expect(authCtx.user?.id).toBe(USER_B.id));
    await waitForHydration();

    await act(async () => {
      pending.resolve([REAL_SAME_NAME]);
      await pending.promise;
    });

    await go('home');
    expect(recipeCtx.recipes).toEqual([]);
    expect(recipeCtx.isGenerating).toBe(false);
    expect(queryByText('Arroz con pollo y verduras')).toBeNull();
    expect(getByTestId('home-empty-recipe-state')).toBeTruthy();
  });
});

describe('Cambio de usuario sin remontar el proveedor (reinicio en render)', () => {
  function RecipeProbe() {
    recipeCtx = useRecipes();
    return null;
  }
  const tree = (uid: string | null, api: ReturnType<typeof createApi>) => (
    <PantryProvider initialIngredients={PANTRY_A}>
      <BudgetProvider initialPreferences={{ budget: 20000, servings: 2 }}>
        <RecipeProvider userId={uid} recipeApiClient={api}>
          <RecipeProbe />
        </RecipeProvider>
      </BudgetProvider>
    </PantryProvider>
  );

  it('el modo demo sigue a la sesión y las recetas no se arrastran entre usuarios', async () => {
    const api = createApi();
    const { rerender } = await render(tree(USER_A.id, api));
    expect(recipeCtx.isDemoMode).toBe(false);
    await act(async () => {
      await recipeCtx.generateRecipes();
    });
    expect(recipeCtx.recipes.length).toBe(2);

    await act(async () => {
      rerender(tree(null, api));
    });
    expect(recipeCtx.isDemoMode).toBe(true); // sin sesión: modo demo explícito de la herramienta
    expect(recipeCtx.recipes.every((r) => r.isDemoFixture)).toBe(true);

    await act(async () => {
      rerender(tree(USER_B.id, api));
    });
    expect(recipeCtx.isDemoMode).toBe(false);
    expect(recipeCtx.recipes).toEqual([]);
  });

  it('una respuesta tardía del usuario anterior no se aplica al nuevo usuario', async () => {
    const pending = deferred<BackendRecipe[]>();
    const api = createApi(() => pending.promise);
    const { rerender } = await render(tree(USER_A.id, api));
    let generation: Promise<unknown> = Promise.resolve();
    await act(async () => {
      generation = recipeCtx.generateRecipes();
    });
    await act(async () => {
      rerender(tree(USER_B.id, api));
    });
    await act(async () => {
      pending.resolve([REAL_SAME_NAME]);
      await generation;
    });
    expect(recipeCtx.recipes).toEqual([]);
    expect(recipeCtx.isGenerating).toBe(false);
    expect(recipeCtx.isDemoMode).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// 5. Hidratación de despensa y presupuesto
// ---------------------------------------------------------------------------------------------
describe('Carreras de hidratación', () => {
  const readyPantry = (): PantryStorageAdapter => createPantryStorage(USER_A.id);

  it('presupuesto aún cargando: no se genera con el presupuesto por defecto', async () => {
    const budgetLoad = deferred<{ budget: number; servings: number }>();
    const budgetAdapter = {
      getPreferences: () => budgetLoad.promise,
      savePreferences: jest.fn(),
      resetPreferences: jest.fn(),
    } as unknown as BudgetStorageAdapter;
    const api = createApi();
    await renderApp({ api, pantryAdapter: readyPantry(), budgetAdapter });
    await waitFor(() => expect(pantryCtx.isLoading).toBe(false));
    expect(budgetCtx.isLoading).toBe(true);

    let caught: any;
    await act(async () => {
      await recipeCtx.generateRecipes().catch((e) => {
        caught = e;
      });
    });
    expect(caught?.code).toBe('DATA_NOT_READY');
    expect(recipeCtx.errorCode).toBe('DATA_NOT_READY');
    expect(api.recommendRecipes).not.toHaveBeenCalled();

    await act(async () => {
      budgetLoad.resolve({ budget: 42000, servings: 2 });
      await budgetLoad.promise;
    });
    await waitFor(() => expect(budgetCtx.isLoading).toBe(false));
    // El aviso "aún cargando" deja de exponerse en cuanto termina la hidratación
    expect(recipeCtx.error).toBeNull();
    expect(recipeCtx.errorCode).toBeNull();
    await act(async () => {
      await recipeCtx.generateRecipes();
    });
    expect(api.recommendRecipes).toHaveBeenCalledTimes(1);
    expect(api.recommendRecipes.mock.calls[0][0].budget).toBe(42000);
    expect(recipeCtx.error).toBeNull();
  });

  it('despensa aún cargando: no se interpreta como despensa vacía ni como instantánea válida', async () => {
    const pantryLoad = deferred<Ingredient[]>();
    const pantryAdapter = {
      ...createPantryStorage(USER_A.id),
      getIngredients: () => pantryLoad.promise,
    } as unknown as PantryStorageAdapter;
    const api = createApi();
    const { getByTestId, queryByTestId } = await renderApp({ api, pantryAdapter });
    await waitFor(() => expect(budgetCtx.isLoading).toBe(false));
    expect(pantryCtx.isLoading).toBe(true);
    expect(getByTestId('home-recommendation-loading')).toBeTruthy();
    expect(queryByTestId('home-recommendation-empty-pantry')).toBeNull();

    let caught: any;
    await act(async () => {
      await recipeCtx.generateRecipes().catch((e) => {
        caught = e;
      });
    });
    expect(caught?.code).toBe('DATA_NOT_READY');
    expect(recipeCtx.errorCode).not.toBe('EMPTY_PANTRY');
    expect(api.recommendRecipes).not.toHaveBeenCalled();

    await act(async () => {
      pantryLoad.resolve(PANTRY_A);
      await pantryLoad.promise;
    });
    await waitFor(() => expect(pantryCtx.isLoading).toBe(false));
    expect(getByTestId('home-empty-recipe-state')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------------------------
// 6. Sin llamadas automáticas a la IA
// ---------------------------------------------------------------------------------------------
describe('Sin llamadas automáticas a Gemini', () => {
  it('montar, hidratar, navegar entre pantallas y cambiar de sesión no llama al backend', async () => {
    const api = createApi();
    await renderApp({ api });
    await waitForHydration();
    await go('recipes');
    await go('home');
    await go('recipes');
    await go('home');
    await act(async () => {
      await authCtx.signOut();
    });
    await act(async () => {
      await authCtx.signIn('bob@foodai.app', 'secreto-123');
    });
    await waitForHydration();
    await go('recipes');
    await go('home');

    expect(api.recommendRecipes).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
// 7. Compatibilidad del modo demo explícito
// ---------------------------------------------------------------------------------------------
describe('Modo demo explícito (herramientas y pruebas)', () => {
  function DemoProbe() {
    recipeCtx = useRecipes();
    return null;
  }

  it('sin sesión autenticada el proveedor conserva el modo demo por defecto', async () => {
    await render(
      <PantryProvider initialIngredients={PANTRY_A}>
        <BudgetProvider initialPreferences={{ budget: 20000, servings: 2 }}>
          <RecipeProvider>
            <DemoProbe />
          </RecipeProvider>
        </BudgetProvider>
      </PantryProvider>
    );
    expect(recipeCtx.isDemoMode).toBe(true);
    expect(recipeCtx.recipes.every((r) => r.isDemoFixture)).toBe(true);
  });

  it('initialIsDemoMode explícito se respeta aunque haya sesión', async () => {
    await render(
      <AuthProvider initialSession={SESSION_A} supabaseClient={createSupabaseClient()}>
        <PantryProvider initialIngredients={PANTRY_A}>
          <BudgetProvider initialPreferences={{ budget: 20000, servings: 2 }}>
            <RecipeProvider initialIsDemoMode={true}>
              <DemoProbe />
            </RecipeProvider>
          </BudgetProvider>
        </PantryProvider>
      </AuthProvider>
    );
    expect(recipeCtx.isDemoMode).toBe(true);
  });
});
