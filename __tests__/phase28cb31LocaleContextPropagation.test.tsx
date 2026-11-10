/**
 * FoodAI - Fase 28C-B3.1: el idioma seleccionado llega a las solicitudes desde la interfaz.
 *
 * Verifica, con clientes de API simulados:
 * 1. El escáner envía el idioma activo (es / en) al iniciar el análisis, una sola vez.
 * 2. RecipeContext y MealPlanContext envían el idioma activo al iniciar cada solicitud,
 *    conservando pantry, presupuesto, comensales y maxMinutes.
 * 3. Cambiar de idioma NO regenera recetas ni planes, no los marca como obsoletos, no altera
 *    la despensa ni los datos guardados (solo se escribe la preferencia de idioma).
 * 4. El idioma se fija al inicio de la solicitud: cambiarlo en vuelo no la altera.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import ScannerScreen from '../app/escaner/index';
import { TypographyProvider } from '../src/theme';
import { LocaleProvider, useLocale } from '../src/context/LocaleContext';
import { PantryProvider, usePantry } from '../src/context/PantryContext';
import { BudgetProvider } from '../src/context/BudgetContext';
import { RecipeProvider, useRecipes } from '../src/context/RecipeContext';
import { MealPlanProvider, useMealPlan } from '../src/context/MealPlanContext';
import { AsyncStorageMealPlanAdapter } from '../src/services/storage/mealPlanStorage';
import {
  AsyncStorageLocaleStorageAdapter,
  LOCALE_STORAGE_KEY,
} from '../src/services/storage/localeStorage';
import { scannerApi } from '../src/services/api/scannerApi';
import { Ingredient } from '../src/types/pantry';
import { BackendMealPlanResponseData } from '../src/types/mealPlan';
import { BackendRecipe } from '../src/types/recipe';

jest.setTimeout(30000);

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn().mockImplementation((uri) =>
    Promise.resolve({ uri: `${uri}_optimized.jpg`, width: 1600, height: 1200 })
  ),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));

jest.mock('../src/services/api/scannerApi', () => {
  const actual = jest.requireActual('../src/services/api/scannerApi');
  return { ...actual, scannerApi: { analyzeIngredientsImage: jest.fn() } };
});

const INGREDIENTS: Ingredient[] = [
  {
    id: 'ing-1',
    name: 'Pollo',
    quantity: 500,
    unit: 'g',
    category: 'Carnes y proteínas',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
  },
  {
    id: 'ing-2',
    name: 'Arroz',
    quantity: 1,
    unit: 'kg',
    category: 'Granos y cereales',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
  },
];

const BUDGET = { budget: 25000, servings: 3, maxMinutes: 45 };

const backendRecipe = (name: string): BackendRecipe => ({
  name,
  description: 'Plato sencillo',
  totalMinutes: 30,
  ingredients: [{ name: 'Pollo', quantity: 200, unit: 'g' }],
  steps: ['Cocinar', 'Servir'],
  availableIngredients: [{ name: 'Pollo', quantity: 200, unit: 'g' }],
  missingIngredients: [],
  estimatedMissingCost: 0,
  budgetRemaining: 25000,
  withinBudget: true,
  convenience: 90,
  reason: 'Usa tu despensa',
});

const MEAL_PLAN_RESPONSE: BackendMealPlanResponseData = {
  days: [1, 2, 3].map((day) => ({ day, recipe: backendRecipe(`Receta del día ${day}`) })),
  totalEstimatedMissingCost: 0,
  budgetRemaining: 25000,
  withinBudget: true,
};

const EXPECTED_PANTRY = [
  { name: 'Pollo', quantity: 500, unit: 'g', needsReview: false },
  { name: 'Arroz', quantity: 1, unit: 'kg', needsReview: false },
];

async function snapshotStorage(): Promise<Record<string, string | null>> {
  const keys = await AsyncStorage.getAllKeys();
  const entries = await AsyncStorage.multiGet(keys);
  return Object.fromEntries(entries.filter(([key]) => key !== LOCALE_STORAGE_KEY));
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

afterEach(async () => {
  cleanup();
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('Escáner: idioma activo en el análisis', () => {
  beforeEach(() => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: true,
    });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///photo.jpg',
          mimeType: 'image/jpeg',
          fileName: 'photo.jpg',
          width: 1200,
          height: 900,
          fileSize: 1024 * 1024,
        },
      ],
    });
    (scannerApi.analyzeIngredientsImage as jest.Mock).mockResolvedValue([
      { name: 'Tomate', quantity: 2, unit: 'unidad', needsReview: false },
    ]);
  });

  it.each(['es', 'en'] as const)('envía locale=%s una sola vez al analizar', async (locale) => {
    const { getByTestId } = await render(
      <SafeAreaProvider
        initialMetrics={{
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
          frame: { x: 0, y: 0, width: 390, height: 844 },
        }}
      >
        <LocaleProvider initialLocale={locale}>
          <TypographyProvider usingFallback={true}>
            <PantryProvider initialIngredients={[]}>
              <ScannerScreen />
            </PantryProvider>
          </TypographyProvider>
        </LocaleProvider>
      </SafeAreaProvider>
    );

    await fireEvent.press(getByTestId('scanner-gallery-button'));
    await waitFor(() => expect(getByTestId('scanner-analyze-button')).toBeTruthy());
    await fireEvent.press(getByTestId('scanner-analyze-button'));

    await waitFor(() => expect(scannerApi.analyzeIngredientsImage).toHaveBeenCalledTimes(1));
    const [, options] = (scannerApi.analyzeIngredientsImage as jest.Mock).mock.calls[0];
    expect(options.locale).toBe(locale);
    expect(options.signal).toBeDefined();
  });
});

describe('RecipeContext: idioma en POST /api/recipes/recommend', () => {
  const createWrapper = (client: unknown) => {
    const localeAdapter = new AsyncStorageLocaleStorageAdapter();
    const RecipeWrapper = ({ children }: { children: React.ReactNode }) => (
      <LocaleProvider initialLocale="es" storageAdapter={localeAdapter}>
        <PantryProvider initialIngredients={INGREDIENTS}>
          <BudgetProvider initialPreferences={BUDGET}>
            <RecipeProvider recipeApiClient={client as any}>{children}</RecipeProvider>
          </BudgetProvider>
        </PantryProvider>
      </LocaleProvider>
    );
    return RecipeWrapper;
  };

  const useCombined = () => ({ recipes: useRecipes(), locale: useLocale(), pantry: usePantry() });

  it('envía el idioma activo y no regenera ni altera datos al cambiarlo', async () => {
    const recommendRecipes = jest
      .fn()
      .mockResolvedValueOnce([backendRecipe('Arroz con pollo')])
      .mockResolvedValueOnce([backendRecipe('Chicken and rice')]);
    const client = { recommendRecipes, checkBackendHealth: jest.fn() };

    const { result } = await renderHook(() => useCombined(), { wrapper: createWrapper(client) });

    await act(async () => {
      await result.current.recipes.generateRecipes();
    });

    expect(recommendRecipes).toHaveBeenCalledTimes(1);
    expect(recommendRecipes.mock.calls[0][0]).toEqual({
      pantry: EXPECTED_PANTRY,
      budget: 25000,
      servings: 3,
      maxMinutes: 45,
      locale: 'es',
    });

    const recipesBefore = result.current.recipes.recipes;
    const pantryBefore = result.current.pantry.ingredients;
    const storageBefore = await snapshotStorage();

    await act(async () => {
      await result.current.locale.setLocale('en');
    });

    expect(result.current.locale.locale).toBe('en');
    // Sin regeneración automática, sin obsolescencia y sin reescritura de datos existentes
    expect(recommendRecipes).toHaveBeenCalledTimes(1);
    expect(result.current.recipes.recipes).toBe(recipesBefore);
    expect(result.current.recipes.recipes[0].name).toBe('Arroz con pollo');
    expect(result.current.recipes.isStale).toBe(false);
    expect(result.current.pantry.ingredients).toEqual(pantryBefore);
    expect(result.current.pantry.ingredients.map((i) => i.quantity)).toEqual([500, 1]);
    expect(await snapshotStorage()).toEqual(storageBefore);
    expect(await AsyncStorage.getItem(LOCALE_STORAGE_KEY)).toContain('en');

    // La siguiente solicitud iniciada por el usuario usa el nuevo idioma
    await act(async () => {
      await result.current.recipes.generateRecipes();
    });
    expect(recommendRecipes).toHaveBeenCalledTimes(2);
    expect(recommendRecipes.mock.calls[1][0]).toEqual({
      pantry: EXPECTED_PANTRY,
      budget: 25000,
      servings: 3,
      maxMinutes: 45,
      locale: 'en',
    });
    expect(recommendRecipes.mock.calls[1][1].signal).toBeDefined();
  });

  it('fija el idioma al inicio: cambiarlo en vuelo no altera la solicitud ni la duplica', async () => {
    let resolveRequest: (value: BackendRecipe[]) => void = () => {};
    const recommendRecipes = jest.fn(
      () => new Promise<BackendRecipe[]>((resolve) => (resolveRequest = resolve))
    );
    const client = { recommendRecipes, checkBackendHealth: jest.fn() };

    const { result } = await renderHook(() => useCombined(), { wrapper: createWrapper(client) });

    let pending: Promise<unknown> = Promise.resolve();
    await act(async () => {
      pending = result.current.recipes.generateRecipes();
    });
    await act(async () => {
      await result.current.locale.setLocale('en');
    });
    await act(async () => {
      resolveRequest([backendRecipe('Arroz con pollo')]);
      await pending;
    });

    expect(recommendRecipes).toHaveBeenCalledTimes(1);
    expect((recommendRecipes.mock.calls[0] as unknown[])[0]).toMatchObject({ locale: 'es' });
    expect(result.current.recipes.recipes).toHaveLength(1);
    expect(result.current.recipes.isStale).toBe(false);
  });
});

describe('MealPlanContext: idioma en POST /api/meal-plans/generate', () => {
  const MEAL_PLAN_KEY = '@test:foodai:phase28cb31_meal_plan';

  const createWrapper = (client: unknown) => {
    const localeAdapter = new AsyncStorageLocaleStorageAdapter();
    const storageAdapter = new AsyncStorageMealPlanAdapter(MEAL_PLAN_KEY);
    const MealPlanWrapper = ({ children }: { children: React.ReactNode }) => (
      <LocaleProvider initialLocale="es" storageAdapter={localeAdapter}>
        <TypographyProvider usingFallback={true}>
          <PantryProvider initialIngredients={INGREDIENTS}>
            <BudgetProvider initialPreferences={BUDGET}>
              <RecipeProvider>
                <MealPlanProvider mealPlanApiClient={client as any} storageAdapter={storageAdapter}>
                  {children}
                </MealPlanProvider>
              </RecipeProvider>
            </BudgetProvider>
          </PantryProvider>
        </TypographyProvider>
      </LocaleProvider>
    );
    return MealPlanWrapper;
  };

  const useCombined = () => ({ plan: useMealPlan(), locale: useLocale(), pantry: usePantry() });

  it('envía el idioma activo y conserva plan, IDs, snapshot y despensa al cambiarlo', async () => {
    const generateMealPlan = jest.fn().mockResolvedValue(MEAL_PLAN_RESPONSE);
    const { result } = await renderHook(() => useCombined(), {
      wrapper: createWrapper({ generateMealPlan }),
    });

    await waitFor(() => expect(result.current.plan.isRestoring).toBe(false));

    await act(async () => {
      await result.current.plan.generateMealPlan();
    });

    expect(generateMealPlan).toHaveBeenCalledTimes(1);
    expect(generateMealPlan.mock.calls[0][0]).toEqual({
      pantry: EXPECTED_PANTRY,
      budget: 25000,
      servings: 3,
      maxMinutes: 45,
      locale: 'es',
    });
    expect(result.current.plan.plan?.days).toHaveLength(3);

    const planBefore = result.current.plan.plan;
    const dayIdsBefore = planBefore?.days.map((d) => d.recipe.id);
    const pantryBefore = result.current.pantry.ingredients;
    await waitFor(async () => expect(await AsyncStorage.getItem(MEAL_PLAN_KEY)).not.toBeNull());
    const storageBefore = await snapshotStorage();

    await act(async () => {
      await result.current.locale.setLocale('en');
    });

    expect(generateMealPlan).toHaveBeenCalledTimes(1);
    expect(result.current.plan.plan).toBe(planBefore);
    expect(result.current.plan.plan?.days.map((d) => d.recipe.id)).toEqual(dayIdsBefore);
    expect(result.current.plan.isStale).toBe(false);
    expect(result.current.pantry.ingredients).toEqual(pantryBefore);
    expect(await snapshotStorage()).toEqual(storageBefore);

    await act(async () => {
      await result.current.plan.generateMealPlan({ maxMinutes: 60 });
    });
    expect(generateMealPlan).toHaveBeenCalledTimes(2);
    expect(generateMealPlan.mock.calls[1][0]).toEqual({
      pantry: EXPECTED_PANTRY,
      budget: 25000,
      servings: 3,
      maxMinutes: 60,
      locale: 'en',
    });
    expect(result.current.plan.plan?.days).toHaveLength(3);
    expect(result.current.pantry.ingredients.map((i) => i.quantity)).toEqual([500, 1]);
  });
});
