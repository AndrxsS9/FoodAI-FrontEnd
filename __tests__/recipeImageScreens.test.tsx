/**
 * Bloque 3A - Integración de imágenes de referencia en Inicio, Recetas y Detalle:
 * renderizado seguro, etiquetas visibles y accesibles, respaldo neutro, recetas demo,
 * ausencia de llamadas de red y regresión de navegación.
 *
 * El catálogo de producción está vacío hasta que exista aprobación humana. Aquí se
 * activan los 16 assets REALES (require() estáticos) con una aprobación SIMULADA
 * exclusiva de pruebas, para verificar el camino de activación de extremo a extremo.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, within } from '@testing-library/react-native';
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
import { RECIPE_IMAGE_ASSET_RECORDS } from '../src/utils/recipeImageCatalog';
import { RECIPE_IMAGE_CATEGORY_LABELS, RECIPE_IMAGE_KEYS, RecipeImageKey } from '../src/types/recipeImage';

jest.mock('../src/utils/recipeImageCatalog', () => {
  const actual = jest.requireActual('../src/utils/recipeImageCatalog');
  // Aprobación SIMULADA (solo pruebas) de los 16 registros reales, ligada a su SHA-256.
  const simulatedApprovals = Object.fromEntries(
    actual.RECIPE_IMAGE_ASSET_RECORDS.map((r: { key: string; sha256: string }) => [
      r.key,
      { approvedBy: 'SIMULACIÓN DE PRUEBA (no es una aprobación real)', approvedOn: '2026-11-05', sha256: r.sha256 },
    ])
  );
  const testCatalog = actual.buildRecipeImageCatalog(actual.RECIPE_IMAGE_ASSET_RECORDS, simulatedApprovals);
  return {
    ...actual,
    RECIPE_IMAGE_CATALOG: testCatalog,
    getRecipeImageSource: (recipe: unknown, catalog = testCatalog) =>
      actual.getRecipeImageSource(recipe, catalog),
  };
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
    name: 'Lentejas',
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
  ingredients: [{ name: 'Lentejas', quantity: 200, unit: 'g' }],
  steps: ['Cocinar'],
  availableIngredients: [{ name: 'Lentejas', quantity: 200, unit: 'g' }],
  missingIngredients: [],
  estimatedMissingCost: 0,
  budgetRemaining: 20000,
  withinBudget: true,
  convenience: '80% conveniente',
  reason: 'Aprovecha tu despensa.',
  isDemoFixture: false,
  ...overrides,
});

const SOUP = recipe({ id: 'sopa-de-lentejas', name: 'Sopa de lentejas' });
const UNKNOWN = recipe({ id: 'plato-especial', name: 'Plato especial del chef' });
const SWEET_RICE = recipe({
  id: 'arroz-con-leche',
  name: 'Arroz con leche',
  ingredients: [{ name: 'Arroz', quantity: 100, unit: 'g' }, { name: 'Leche', quantity: 1, unit: 'l' }],
});
const REMOTE = recipe({
  id: 'remota',
  name: 'Plato con URL remota',
  imageUrl: 'https://images.example.com/remota.jpg',
});

const srcOf = (key: RecipeImageKey) => RECIPE_IMAGE_ASSET_RECORDS.find((r) => r.key === key)!.source;

const SOUP_LABEL =
  'Imagen de referencia de la categoría Sopa para Sopa de lentejas. No es una foto del plato generado.';

function tree(ui: React.ReactElement, recipes?: ClientRecipe[]) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
        frame: { x: 0, y: 0, width: 390, height: 844 },
      }}
    >
      <TypographyProvider usingFallback={true}>
        <ThemeProvider initialMode="light">
          <PantryProvider initialIngredients={PANTRY}>
            <BudgetProvider initialPreferences={{ budget: 20000, servings: 2 }}>
              <RecipeProvider
                initialRecipes={recipes}
                initialIsDemoMode={recipes ? false : undefined}
              >
                {ui}
              </RecipeProvider>
            </BudgetProvider>
          </PantryProvider>
        </ThemeProvider>
      </TypographyProvider>
    </SafeAreaProvider>
  );
}

const renderScreen = async (ui: React.ReactElement, recipes?: ClientRecipe[]) => render(tree(ui, recipes));

let fetchSpy: jest.Mock;
const originalFetch = globalThis.fetch;

beforeEach(async () => {
  cleanup();
  jest.clearAllMocks();
  mockSearchParams = {};
  await AsyncStorage.clear();
  fetchSpy = jest.fn(() => Promise.reject(new Error('Red no permitida en pruebas')));
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

describe('Inicio', () => {
  it('muestra la imagen de referencia con insignia visible y etiqueta accesible honesta', async () => {
    const { getByTestId, getByLabelText, queryByLabelText, getByText } = await renderScreen(<HomeScreen />, [SOUP]);

    const img = getByTestId('home-recipe-image-img');
    expect(img.props.source).toEqual(srcOf('soup'));
    expect(getByLabelText(SOUP_LABEL)).toBeTruthy();
    expect(queryByLabelText(/Foto del plato/)).toBeNull();
    expect(getByTestId('home-recipe-image-reference-badge', { includeHiddenElements: true })).toBeTruthy();
    expect(getByText('Imagen de referencia', { includeHiddenElements: true })).toBeTruthy();
  });

  it('sin categoría fiable usa el respaldo neutro sin insignia de referencia', async () => {
    const { getByTestId, queryByTestId, queryByText } = await renderScreen(<HomeScreen />, [UNKNOWN]);
    expect(getByTestId('home-recipe-fallback-image')).toBeTruthy();
    expect(queryByTestId('home-recipe-image-reference-badge', { includeHiddenElements: true })).toBeNull();
    expect(queryByText('Imagen de referencia', { includeHiddenElements: true })).toBeNull();
  });

  it('"Ver receta" sigue navegando al detalle de la receta elegida', async () => {
    const { getByTestId } = await renderScreen(<HomeScreen />, [SOUP]);
    await act(async () => {
      fireEvent.press(getByTestId('home-view-recipe-button'));
    });
    expect(mockPush).toHaveBeenCalledWith('/recetas/sopa-de-lentejas');
  });
});

describe('Recetas (descubrimiento)', () => {
  it('cada tarjeta resuelve su propia categoría y "arroz con leche" recibe postre', async () => {
    const { getByTestId, queryByTestId } = await renderScreen(<RecipeDiscoveryScreen />, [
      SOUP,
      SWEET_RICE,
      UNKNOWN,
    ]);

    expect(getByTestId('recipe-image-sopa-de-lentejas-img').props.source).toEqual(srcOf('soup'));
    expect(getByTestId('recipe-image-arroz-con-leche-img').props.source).toEqual(srcOf('dessert'));
    expect(getByTestId('recipe-image-arroz-con-leche-img').props.source).not.toEqual(srcOf('rice-dish'));
    expect(getByTestId('recipe-image-arroz-con-leche-img').props.accessibilityLabel).toContain('categoría Postre');
    expect(queryByTestId('recipe-image-plato-especial-img')).toBeNull();
    expect(getByTestId('recipe-fallback-image-plato-especial')).toBeTruthy();
  });

  it('las 16 categorías muestran su asset local real con insignia y etiqueta de referencia', async () => {
    const NAMES: Record<RecipeImageKey, string> = {
      soup: 'Sopa de lentejas',
      'cream-soup': 'Crema de ahuyama',
      salad: 'Ensalada de atún',
      'rice-dish': 'Arroz con pollo',
      pasta: 'Pasta con tomate',
      eggs: 'Huevos pericos',
      chicken: 'Pollo al horno',
      'beef-stew': 'Carne guisada',
      fish: 'Tilapia al horno',
      legumes: 'Lentejas guisadas',
      arepa: 'Arepa con queso',
      sandwich: 'Sándwich de pollo',
      potatoes: 'Papas al horno',
      'sauteed-vegetables': 'Verduras salteadas',
      dessert: 'Flan de caramelo',
      beverage: 'Jugo de mora',
    };
    const recipes = RECIPE_IMAGE_KEYS.map((key) => recipe({ id: `r-${key}`, name: NAMES[key], ingredients: [] }));
    const { getByTestId } = await renderScreen(<RecipeDiscoveryScreen />, recipes);

    for (const key of RECIPE_IMAGE_KEYS) {
      const img = getByTestId(`recipe-image-r-${key}-img`);
      expect(img.props.source).toEqual(srcOf(key));
      expect(img.props.accessibilityLabel).toBe(
        `Imagen de referencia de la categoría ${RECIPE_IMAGE_CATEGORY_LABELS[key]} para ${NAMES[key]}. No es una foto del plato generado.`
      );
      expect(getByTestId(`recipe-image-r-${key}-reference-badge`, { includeHiddenElements: true })).toBeTruthy();
    }
  });

  it('la tarjeta conserva la navegación al detalle', async () => {
    const { getByTestId } = await renderScreen(<RecipeDiscoveryScreen />, [SOUP]);
    const card = getByTestId('recipe-card-sopa-de-lentejas');
    const button = within(card).getAllByRole('button').pop()!;
    await act(async () => {
      fireEvent.press(button);
    });
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('sopa-de-lentejas'));
  });
});

describe('Detalle', () => {
  it('muestra la imagen de referencia con insignia y conserva el título superpuesto', async () => {
    mockSearchParams = { id: 'sopa-de-lentejas' };
    const { getByTestId, getByLabelText } = await renderScreen(<RecipeDetailScreen />, [SOUP]);
    expect(getByTestId('recipe-detail-image-img').props.source).toEqual(srcOf('soup'));
    expect(getByTestId('recipe-detail-image-reference-badge', { includeHiddenElements: true })).toBeTruthy();
    expect(getByLabelText(SOUP_LABEL)).toBeTruthy();
    expect(getByTestId('recipe-detail-title')).toBeTruthy();
  });

  it('las recetas demo conservan su foto empaquetada, sin insignia de referencia', async () => {
    mockSearchParams = { id: 'demo-rec-1' };
    const { getByTestId, queryByTestId, getByLabelText } = await renderScreen(<RecipeDetailScreen />);
    expect(getByTestId('recipe-detail-image-img')).toBeTruthy();
    expect(queryByTestId('recipe-detail-image-reference-badge', { includeHiddenElements: true })).toBeNull();
    expect(getByLabelText(/^Foto del plato de ejemplo: /)).toBeTruthy();
  });

  it('no carga URLs remotas de recetas reales', async () => {
    mockSearchParams = { id: 'remota' };
    const { getByTestId, queryByTestId } = await renderScreen(<RecipeDetailScreen />, [REMOTE]);
    expect(getByTestId('recipe-detail-fallback-image')).toBeTruthy();
    expect(queryByTestId('recipe-detail-image-img')).toBeNull();
  });
});

describe('Sin llamadas de red', () => {
  it('renderizar las tres pantallas con imágenes de referencia no hace peticiones', async () => {
    await renderScreen(<HomeScreen />, [SOUP, REMOTE]);
    cleanup();
    await renderScreen(<RecipeDiscoveryScreen />, [SOUP, SWEET_RICE, UNKNOWN, REMOTE]);
    cleanup();
    mockSearchParams = { id: 'sopa-de-lentejas' };
    await renderScreen(<RecipeDetailScreen />, [SOUP]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
