/**
 * Corrección 1 (MVP) - Imágenes de referencia en un build de PREVIEW INTERNO.
 *
 * El módulo del catálogo se carga con la configuración real de un build de preview
 * (EXPO_PUBLIC_APP_VARIANT='preview', EXPO_PUBLIC_RECIPE_IMAGES_PREVIEW_ENABLED='true').
 * No se sustituye ninguna lógica: el mock solo fija las variables antes de cargar el módulo
 * real, de modo que la política, la selección del catálogo y las pantallas son las reales.
 * RECIPE_IMAGE_APPROVALS sigue vacío.
 */
import React from 'react';
import { act, cleanup, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import HomeScreen from '../app/(tabs)/index';
import RecipeDiscoveryScreen from '../app/recetas/index';
import RecipeDetailScreen from '../app/recetas/[id]';
import { ThemeProvider, TypographyProvider } from '../src/theme';
import { PantryProvider } from '../src/context/PantryContext';
import { BudgetProvider } from '../src/context/BudgetContext';
import { RecipeProvider } from '../src/context/RecipeContext';
import { Ingredient } from '../src/types/pantry';
import { ClientRecipe } from '../src/types/recipe';
import {
  ACTIVE_RECIPE_IMAGE_CATALOG,
  RECIPE_IMAGE_APPROVALS,
  RECIPE_IMAGE_ASSET_RECORDS,
  RECIPE_IMAGE_CATALOG,
  RECIPE_IMAGE_DISPLAY_POLICY,
} from '../src/utils/recipeImageCatalog';
import { RecipeImageKey } from '../src/types/recipeImage';

jest.mock('../src/utils/recipeImageCatalog', () => {
  const g = globalThis as unknown as { __previewEnvBackup?: Record<string, string | undefined> };
  g.__previewEnvBackup = {
    EXPO_PUBLIC_APP_VARIANT: process.env.EXPO_PUBLIC_APP_VARIANT,
    EXPO_PUBLIC_RECIPE_IMAGES_PREVIEW_ENABLED: process.env.EXPO_PUBLIC_RECIPE_IMAGES_PREVIEW_ENABLED,
  };
  process.env.EXPO_PUBLIC_APP_VARIANT = 'preview';
  process.env.EXPO_PUBLIC_RECIPE_IMAGES_PREVIEW_ENABLED = 'true';
  return jest.requireActual('../src/utils/recipeImageCatalog');
});

const mockPush = jest.fn();
let mockSearchParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockSearchParams,
}));

const PANTRY: Ingredient[] = [
  {
    id: 'p-1',
    name: 'Pasta',
    quantity: 500,
    unit: 'g',
    category: 'Granos y cereales',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  },
];

const recipe = (overrides: Partial<ClientRecipe> & { id: string; name: string }): ClientRecipe => ({
  description: 'Receta real',
  totalMinutes: 25,
  servings: 2,
  ingredients: [{ name: 'Pasta', quantity: 200, unit: 'g' }],
  steps: ['Cocinar'],
  availableIngredients: [{ name: 'Pasta', quantity: 200, unit: 'g' }],
  missingIngredients: [],
  estimatedMissingCost: 0,
  budgetRemaining: 20000,
  withinBudget: true,
  convenience: '80% conveniente',
  reason: 'Aprovecha tu despensa.',
  isDemoFixture: false,
  ...overrides,
});

const PASTA = recipe({ id: 'pasta-con-tomate', name: 'Pasta con tomate' });
const UNKNOWN = recipe({ id: 'plato-especial', name: 'Plato especial del chef' });
const srcOf = (key: RecipeImageKey) => RECIPE_IMAGE_ASSET_RECORDS.find((r) => r.key === key)!.source;
const PASTA_LABEL =
  'Imagen de referencia de la categoría Pasta para Pasta con tomate. No es una foto del plato generado.';

function tree(ui: React.ReactElement, recipes: ClientRecipe[]) {
  return (
    <SafeAreaProvider
      initialMetrics={{ insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 390, height: 844 } }}
    >
      <TypographyProvider usingFallback={true}>
        <ThemeProvider initialMode="light">
          <PantryProvider initialIngredients={PANTRY}>
            <BudgetProvider initialPreferences={{ budget: 20000, servings: 2 }}>
              <RecipeProvider initialRecipes={recipes} initialIsDemoMode={false}>
                {ui}
              </RecipeProvider>
            </BudgetProvider>
          </PantryProvider>
        </ThemeProvider>
      </TypographyProvider>
    </SafeAreaProvider>
  );
}

let fetchSpy: jest.Mock;
const originalFetch = globalThis.fetch;

beforeEach(async () => {
  await cleanup();
  jest.clearAllMocks();
  mockSearchParams = {};
  await AsyncStorage.clear();
  fetchSpy = jest.fn(() => Promise.reject(new Error('Red no permitida en pruebas')));
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
});

afterEach(async () => {
  await cleanup();
  globalThis.fetch = originalFetch;
});

afterAll(() => {
  const backup = (globalThis as unknown as { __previewEnvBackup?: Record<string, string | undefined> })
    .__previewEnvBackup ?? {};
  for (const [k, v] of Object.entries(backup)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('Build de preview interno (configuración real)', () => {
  it('resuelve la política de preview con las 16 imágenes y sin aprobaciones de producción', () => {
    expect(RECIPE_IMAGE_DISPLAY_POLICY).toBe('internal-preview-verified');
    expect(ACTIVE_RECIPE_IMAGE_CATALOG.size).toBe(16);
    expect(RECIPE_IMAGE_APPROVALS).toEqual({});
    expect(RECIPE_IMAGE_CATALOG.size).toBe(0);
  });

  it('la misma receta muestra la misma imagen local en Inicio, Recetas y Detalle, con insignia y etiqueta', async () => {
    const home = await render(tree(<HomeScreen />, [PASTA]));
    const homeImg = home.getByTestId('home-recipe-image-img');
    expect(homeImg.props.source).toEqual(srcOf('pasta'));
    expect(home.getByTestId('home-recipe-image-reference-badge', { includeHiddenElements: true })).toBeTruthy();
    expect(home.getByLabelText(PASTA_LABEL)).toBeTruthy();
    await cleanup();

    const list = await render(tree(<RecipeDiscoveryScreen />, [PASTA]));
    const listImg = list.getByTestId('recipe-image-pasta-con-tomate-img');
    expect(listImg.props.source).toEqual(srcOf('pasta'));
    expect(list.getByTestId('recipe-image-pasta-con-tomate-reference-badge', { includeHiddenElements: true })).toBeTruthy();
    await cleanup();

    mockSearchParams = { id: 'pasta-con-tomate' };
    const detail = await render(tree(<RecipeDetailScreen />, [PASTA]));
    const detailImg = detail.getByTestId('recipe-detail-image-img');
    expect(detailImg.props.source).toEqual(srcOf('pasta'));
    expect(detail.getByTestId('recipe-detail-image-reference-badge', { includeHiddenElements: true })).toBeTruthy();
    expect(detail.getByLabelText(PASTA_LABEL)).toBeTruthy();

    expect(homeImg.props.source).toEqual(listImg.props.source);
    expect(listImg.props.source).toEqual(detailImg.props.source);
  });

  it('una receta sin categoría fiable sigue mostrando el respaldo neutro', async () => {
    const { getByTestId, queryByTestId } = await render(tree(<HomeScreen />, [UNKNOWN]));
    expect(getByTestId('home-recipe-fallback-image')).toBeTruthy();
    expect(queryByTestId('home-recipe-image-img')).toBeNull();
  });

  it('las recetas demo conservan su foto empaquetada', async () => {
    mockSearchParams = { id: 'demo-rec-1' };
    const { getByTestId, queryByTestId, getByLabelText } = await render(
      <SafeAreaProvider
        initialMetrics={{ insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 390, height: 844 } }}
      >
        <TypographyProvider usingFallback={true}>
          <ThemeProvider initialMode="light">
            <PantryProvider initialIngredients={PANTRY}>
              <BudgetProvider initialPreferences={{ budget: 20000, servings: 2 }}>
                <RecipeProvider>
                  <RecipeDetailScreen />
                </RecipeProvider>
              </BudgetProvider>
            </PantryProvider>
          </ThemeProvider>
        </TypographyProvider>
      </SafeAreaProvider>
    );
    expect(getByTestId('recipe-detail-image-img')).toBeTruthy();
    expect(queryByTestId('recipe-detail-image-reference-badge', { includeHiddenElements: true })).toBeNull();
    expect(getByLabelText(/^Foto del plato de ejemplo: /)).toBeTruthy();
  });

  it('renderizar con imágenes de preview no hace peticiones de red', async () => {
    await render(tree(<RecipeDiscoveryScreen />, [PASTA, UNKNOWN]));
    await act(async () => {});
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
