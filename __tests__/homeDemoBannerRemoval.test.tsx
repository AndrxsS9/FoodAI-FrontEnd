/**
 * Corrección 3 (MVP) - Retiro del banner "Vista de ejemplo" de Inicio.
 *
 * Verifica que el banner y sus textos ya no se renderizan en ningún escenario (sesión real,
 * modo demo explícito, recomendación lista) sin alterar el resto de Inicio: estados de la
 * recomendación, resúmenes de despensa y presupuesto, navegación, ausencia de IA automática,
 * política de imágenes y el orden del contenido del ScrollView.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import HomeScreen from '../app/(tabs)/index';
import { ThemeProvider, TypographyProvider } from '../src/theme';
import { PantryProvider } from '../src/context/PantryContext';
import { BudgetProvider } from '../src/context/BudgetContext';
import { RecipeProvider, RecipeContextValue, useRecipes } from '../src/context/RecipeContext';
import { PantryStorageAdapter } from '../src/services/storage/pantryStorage';
import { Ingredient } from '../src/types/pantry';
import { BackendRecipe, ClientRecipe } from '../src/types/recipe';
import {
  RECIPE_IMAGE_APPROVALS,
  RECIPE_IMAGE_ASSET_RECORDS,
  RECIPE_IMAGE_DISPLAY_POLICY,
} from '../src/utils/recipeImageCatalog';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
}));

const BANNER_TEXTS = ['Vista de ejemplo', 'Datos de demostración para evaluación visual'];

const ingredient = (id: string, name: string, extra: Partial<Ingredient> = {}): Ingredient => ({
  id,
  name,
  quantity: 1,
  unit: 'unidad',
  category: 'Otros',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  ...extra,
});
const PANTRY = [ingredient('p-1', 'Arroz'), ingredient('p-2', 'Pollo'), ingredient('p-3', 'Cebolla')];

const realRecipe = (overrides: Partial<ClientRecipe> & { id: string; name: string }): ClientRecipe => ({
  description: 'Receta real',
  totalMinutes: 25,
  servings: 2,
  ingredients: [],
  steps: ['Cocinar'],
  availableIngredients: [{ name: 'Arroz', quantity: 1, unit: 'unidad' }, { name: 'Pollo', quantity: 1, unit: 'unidad' }],
  missingIngredients: [{ name: 'Zanahoria', quantity: 1, unit: 'unidad', estimatedCost: 2500 }],
  estimatedMissingCost: 2500,
  budgetRemaining: 30000,
  withinBudget: true,
  convenience: '61% conveniente',
  reason: '',
  isDemoFixture: false,
  ...overrides,
});
const REAL = realRecipe({ id: 'arroz-con-pollo', name: 'Arroz con pollo' });

function createApi(impl?: () => Promise<BackendRecipe[]>) {
  return {
    recommendRecipes: jest.fn(impl ?? (() => Promise.resolve([]))),
    checkBackendHealth: jest.fn(),
  } as any;
}

let recipeCtx: RecipeContextValue;
function Probe() {
  recipeCtx = useRecipes();
  return null;
}

type Options = {
  ingredients?: Ingredient[];
  pantryStorage?: PantryStorageAdapter;
  recipes?: ClientRecipe[];
  demo?: boolean;
  userId?: string | null;
  api?: ReturnType<typeof createApi>;
  budget?: number;
};

function tree(o: Options) {
  return (
    <SafeAreaProvider
      initialMetrics={{ insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 390, height: 844 } }}
    >
      <TypographyProvider usingFallback={true}>
        <ThemeProvider initialMode="light">
          <PantryProvider
            initialIngredients={o.pantryStorage ? undefined : o.ingredients ?? PANTRY}
            storageAdapter={o.pantryStorage}
          >
            <BudgetProvider initialPreferences={{ budget: o.budget ?? 35000, servings: 2 }}>
              <RecipeProvider
                initialRecipes={o.recipes}
                initialIsDemoMode={o.demo}
                userId={o.userId}
                recipeApiClient={o.api ?? createApi()}
              >
                <Probe />
                <HomeScreen />
              </RecipeProvider>
            </BudgetProvider>
          </PantryProvider>
        </ThemeProvider>
      </TypographyProvider>
    </SafeAreaProvider>
  );
}
const renderHome = async (o: Options = {}) => render(tree(o));

const expectNoBanner = (q: { queryByTestId: (id: string) => unknown; queryByText: (t: string) => unknown }) => {
  expect(q.queryByTestId('demo-data-banner')).toBeNull();
  for (const text of BANNER_TEXTS) expect(q.queryByText(text)).toBeNull();
};

let fetchSpy: jest.Mock;
const originalFetch = globalThis.fetch;

beforeEach(async () => {
  await cleanup();
  jest.clearAllMocks();
  await AsyncStorage.clear();
  fetchSpy = jest.fn(() => Promise.reject(new Error('Red no permitida en pruebas')));
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
});

afterEach(async () => {
  await cleanup();
  globalThis.fetch = originalFetch;
});

describe('El banner "Vista de ejemplo" ya no existe en Inicio', () => {
  it('usuario autenticado (modo real por defecto): sin banner ni sus textos', async () => {
    const q = await renderHome({ userId: 'usr-real-1' });
    expect(recipeCtx.isDemoMode).toBe(false);
    expectNoBanner(q);
  });

  it('modo demo explícito: sin banner, y la tarjeta demo sigue indicando que no hay recomendación personal', async () => {
    const q = await renderHome({ demo: true });
    expect(recipeCtx.isDemoMode).toBe(true);
    expectNoBanner(q);
    expect(q.getByTestId('home-recommendation-demo-state')).toBeTruthy();
    expect(q.getByText('Aún no tienes una recomendación personalizada')).toBeTruthy();
    expect(q.queryByTestId('home-recommended-recipe-card')).toBeNull();
    expect(q.queryByText('Arroz con pollo y verduras')).toBeNull();
    expect(q.queryByText(/conveniente/)).toBeNull();
  });

  it('sin sesión y sin configuración explícita (demo por defecto): sin banner', async () => {
    const q = await renderHome();
    expect(recipeCtx.isDemoMode).toBe(true);
    expectNoBanner(q);
  });

  it('con recomendación real lista: sin banner', async () => {
    const q = await renderHome({ demo: false, recipes: [REAL] });
    expectNoBanner(q);
    expect(q.getByTestId('home-recommended-recipe-card')).toBeTruthy();
  });
});

describe('El resto de Inicio no cambia', () => {
  it('la recomendación real sigue funcionando (nombre, costo, conveniencia real) y navega al detalle', async () => {
    const { getByTestId, getByText } = await renderHome({ demo: false, recipes: [REAL] });
    expect(getByText('Arroz con pollo')).toBeTruthy();
    expect(getByText('$2.500')).toBeTruthy();
    expect(getByText('61% conveniente')).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByTestId('home-view-recipe-button'));
    });
    expect(mockPush).toHaveBeenCalledWith('/recetas/arroz-con-pollo');
  });

  it('los resúmenes de despensa y presupuesto siguen siendo correctos', async () => {
    const { getByTestId, getByText, getByLabelText } = await renderHome({ userId: 'usr-real-1', budget: 35000 });
    expect(getByTestId('home-pantry-total-count').props.children.join('')).toBe('3 productos');
    expect(getByText(/3 en despensa/)).toBeTruthy();
    expect(getByLabelText('Presupuesto disponible: 35.000 pesos colombianos')).toBeTruthy();
  });

  it('estado vacío, de carga, sin recetas y de error se siguen mostrando', async () => {
    let q = await renderHome({ userId: 'usr-real-1', ingredients: [] });
    expect(q.getByTestId('home-recommendation-empty-pantry')).toBeTruthy();
    // RNTL 14: fireEvent es asíncrono; sin await su act() se solapa con el render siguiente
    await fireEvent.press(q.getByTestId('home-recommendation-go-pantry-button'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/despensa');
    await cleanup();

    const neverResolving = { getIngredients: () => new Promise(() => {}) } as unknown as PantryStorageAdapter;
    q = await renderHome({ userId: 'usr-real-1', pantryStorage: neverResolving });
    expect(q.getByTestId('home-recommendation-loading')).toBeTruthy();
    await cleanup();

    q = await renderHome({ userId: 'usr-real-1' });
    expect(q.getByTestId('home-empty-recipe-state')).toBeTruthy();
    await cleanup();

    const failing = createApi(() => Promise.reject(new Error('El servicio de IA no respondió.')));
    q = await renderHome({ userId: 'usr-real-1', api: failing });
    await act(async () => {
      await recipeCtx.generateRecipes().catch(() => {});
    });
    await waitFor(() => expect(q.getByTestId('home-recommendation-error-state')).toBeTruthy());
    expect(q.getByText('El servicio de IA no respondió.')).toBeTruthy();
    expectNoBanner(q);
  });

  it('el saludo es el primer contenido del ScrollView (sin hueco del banner retirado)', async () => {
    const { getByTestId } = await renderHome({ userId: 'usr-real-1' });
    const hero = getByTestId('home-greeting-hero');
    const container = hero.parent!;
    expect(container.children[0]).toBe(hero);
  });

  it('no se introduce ninguna llamada automática a la IA', async () => {
    const api = createApi();
    const { rerender } = await renderHome({ userId: 'usr-real-1', api });
    await act(async () => {
      rerender(tree({ userId: 'usr-real-1', api }));
    });
    await act(async () => {
      rerender(tree({ demo: true, api }));
    });
    expect(api.recommendRecipes).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('la política de imágenes y el catálogo de la Corrección 1 no cambian', async () => {
    expect(RECIPE_IMAGE_ASSET_RECORDS).toHaveLength(16);
    expect(RECIPE_IMAGE_APPROVALS).toEqual({});
    expect(RECIPE_IMAGE_DISPLAY_POLICY).toBe('production-approved-only'); // Jest sin variables de preview
    const { getByTestId } = await renderHome({ demo: false, recipes: [REAL] });
    expect(getByTestId('home-recipe-fallback-image')).toBeTruthy();
  });
});
