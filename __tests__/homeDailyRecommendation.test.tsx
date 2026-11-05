/**
 * Pruebas de regresión de la sección "Recomendación del día" en Inicio (Bloque 2 MVP final).
 * Usa los proveedores reales (Pantry, Budget, Recipe) y un cliente API simulado para
 * verificar estados vacío/demo/obsoleto/error, selección real, navegación e
 * independencia total de Inicio respecto a llamadas automáticas a Gemini.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import HomeScreen from '../app/(tabs)/index';
import { ThemeProvider, TypographyProvider } from '../src/theme';
import { PantryContextValue, PantryProvider, usePantry } from '../src/context/PantryContext';
import { BudgetProvider } from '../src/context/BudgetContext';
import { RecipeContextValue, RecipeProvider, useRecipes } from '../src/context/RecipeContext';
import { Ingredient } from '../src/types/pantry';
import { BackendRecipe, ClientRecipe } from '../src/types/recipe';
import { PantryStorageAdapter } from '../src/services/storage/pantryStorage';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({}),
}));

const PANTRY: Ingredient[] = [
  {
    id: 'p-1',
    name: 'Arroz',
    quantity: 500,
    unit: 'g',
    category: 'Granos y cereales',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 'p-2',
    name: 'Huevo',
    quantity: 6,
    unit: 'unidad',
    category: 'Carnes y proteínas',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  },
];

const backendRecipe = (overrides: Partial<BackendRecipe> & { name: string }): BackendRecipe => ({
  description: 'Generada por IA',
  totalMinutes: 25,
  ingredients: [],
  steps: ['Cocinar'],
  availableIngredients: [],
  missingIngredients: [],
  estimatedMissingCost: 0,
  budgetRemaining: 20000,
  withinBudget: true,
  convenience: 80,
  reason: '',
  ...overrides,
});

const clientRecipe = (overrides: Partial<ClientRecipe> & { id: string }): ClientRecipe => ({
  name: overrides.id,
  description: 'Receta real',
  totalMinutes: 25,
  servings: 2,
  ingredients: [],
  steps: ['Cocinar'],
  availableIngredients: [],
  missingIngredients: [],
  estimatedMissingCost: 0,
  budgetRemaining: 20000,
  withinBudget: true,
  convenience: '80% conveniente',
  reason: '',
  isDemoFixture: false,
  ...overrides,
});

const u = (name: string, estimatedCost?: number) => ({
  name,
  quantity: 1,
  unit: 'unidad',
  ...(estimatedCost !== undefined ? { estimatedCost } : {}),
});

let recipeCtx: RecipeContextValue;
let pantryCtx: PantryContextValue;
function ContextProbe() {
  recipeCtx = useRecipes();
  pantryCtx = usePantry();
  return null;
}

function createMockApi(recipes: BackendRecipe[] = []) {
  return {
    recommendRecipes: jest.fn().mockResolvedValue(recipes),
    checkBackendHealth: jest.fn(),
  } as any;
}

type RenderOptions = {
  ingredients?: Ingredient[];
  initialRecipes?: ClientRecipe[];
  initialIsDemoMode?: boolean;
  api?: ReturnType<typeof createMockApi>;
  pantryStorage?: PantryStorageAdapter;
};

function tree(options: RenderOptions) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
        frame: { x: 0, y: 0, width: 390, height: 844 },
      }}
    >
      <TypographyProvider usingFallback={true}>
        <ThemeProvider initialMode="light">
          <PantryProvider
            initialIngredients={options.pantryStorage ? undefined : options.ingredients ?? PANTRY}
            storageAdapter={options.pantryStorage}
          >
            <BudgetProvider initialPreferences={{ budget: 20000, servings: 2 }}>
              <RecipeProvider
                initialRecipes={options.initialRecipes}
                initialIsDemoMode={options.initialIsDemoMode}
                recipeApiClient={options.api}
              >
                <ContextProbe />
                <HomeScreen />
              </RecipeProvider>
            </BudgetProvider>
          </PantryProvider>
        </ThemeProvider>
      </TypographyProvider>
    </SafeAreaProvider>
  );
}

const renderHome = async (options: RenderOptions = {}) => {
  const utils = await render(tree(options));
  return { ...utils, rerenderHome: () => utils.rerender(tree(options)) };
};

describe('Inicio · Recomendación del día real y personalizada', () => {
  beforeEach(async () => {
    cleanup();
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  afterEach(async () => {
    cleanup();
    await AsyncStorage.clear();
  });

  describe('Estados sin recomendación', () => {
    it('despensa vacía: muestra estado vacío y navega a la despensa', async () => {
      const { getByTestId, queryByTestId } = await renderHome({ ingredients: [] });

      expect(getByTestId('home-recommendation-empty-pantry')).toBeTruthy();
      expect(queryByTestId('home-recommended-recipe-card')).toBeNull();

      fireEvent.press(getByTestId('home-recommendation-go-pantry-button'));
      expect(mockPush).toHaveBeenCalledWith('/(tabs)/despensa');
    });

    it('despensa vacía tiene prioridad aunque existan recetas reales previas', async () => {
      const { getByTestId, queryByTestId } = await renderHome({
        ingredients: [],
        initialIsDemoMode: false,
        initialRecipes: [clientRecipe({ id: 'previa' })],
      });
      expect(getByTestId('home-recommendation-empty-pantry')).toBeTruthy();
      expect(queryByTestId('home-view-recipe-button')).toBeNull();
    });

    it('modo demo: no presenta recetas de ejemplo como recomendación personalizada', async () => {
      const { getByTestId, queryByTestId, queryByText } = await renderHome();

      expect(getByTestId('home-recommendation-demo-state')).toBeTruthy();
      expect(queryByTestId('home-recommended-recipe-card')).toBeNull();
      expect(queryByText('Arroz con pollo y verduras')).toBeNull();
      expect(queryByText(/conveniente/)).toBeNull();
      expect(queryByText('Optimizado a tu despensa')).toBeNull();
      expect(queryByText('Según tu despensa y presupuesto actuales')).toBeNull();
      // El aviso global de datos de ejemplo se conserva
      expect(getByTestId('demo-data-banner')).toBeTruthy();

      fireEvent.press(getByTestId('home-recommendation-generate-button'));
      expect(mockPush).toHaveBeenCalledWith('/recetas');
    });

    it('sin recetas reales: muestra CTA hacia el flujo de generación existente', async () => {
      const { getByTestId, queryByTestId } = await renderHome({
        initialIsDemoMode: false,
        initialRecipes: [],
      });

      expect(getByTestId('home-empty-recipe-state')).toBeTruthy();
      expect(queryByTestId('home-recommended-recipe-card')).toBeNull();
      fireEvent.press(getByTestId('home-recommendation-generate-button'));
      expect(mockPush).toHaveBeenCalledWith('/recetas');
    });

    it('muestra un estado de carga mientras la despensa se hidrata, sin afirmar despensa vacía', async () => {
      const neverResolving: PantryStorageAdapter = {
        getIngredients: () => new Promise(() => {}),
      } as unknown as PantryStorageAdapter;

      const { getByTestId, queryByTestId } = await renderHome({ pantryStorage: neverResolving });
      expect(getByTestId('home-recommendation-loading')).toBeTruthy();
      expect(queryByTestId('home-recommendation-empty-pantry')).toBeNull();
    });
  });

  describe('Selección real', () => {
    it('una receta real: la muestra con cobertura y costo autoritativo', async () => {
      const { getByTestId, getByText, queryByTestId } = await renderHome({
        initialIsDemoMode: false,
        initialRecipes: [
          clientRecipe({
            id: 'arroz-con-huevo',
            name: 'Arroz con huevo',
            availableIngredients: [u('Arroz'), u('Huevo')],
            missingIngredients: [u('Cebolla', 1200)],
            estimatedMissingCost: 1200,
          }),
        ],
      });

      expect(getByTestId('home-recommended-recipe-card')).toBeTruthy();
      expect(getByText('Arroz con huevo')).toBeTruthy();
      expect(getByText('Según tu despensa y presupuesto actuales')).toBeTruthy();
      expect(getByText(/Ya tienes 2 de 3 ingredientes/)).toBeTruthy();
      expect(getByText('$1.200')).toBeTruthy();
      // Con una sola candidata no se muestra nota de ranking
      expect(queryByTestId('home-recommendation-rank-note')).toBeNull();
    });

    it('múltiples recetas: elige la de mayor cobertura aunque no sea recipes[0]', async () => {
      const recipes = [
        clientRecipe({
          id: 'poca-cobertura',
          name: 'Poca cobertura',
          availableIngredients: [u('Arroz')],
          missingIngredients: [u('Pollo', 7000), u('Pimentón', 1500)],
          estimatedMissingCost: 8500,
        }),
        clientRecipe({
          id: 'mucha-cobertura',
          name: 'Mucha cobertura',
          availableIngredients: [u('Arroz'), u('Huevo')],
          missingIngredients: [u('Cebolla', 1200)],
          estimatedMissingCost: 1200,
        }),
      ];
      const { getByText, queryByText, getByTestId } = await renderHome({
        initialIsDemoMode: false,
        initialRecipes: recipes,
      });

      expect(getByText('Mucha cobertura')).toBeTruthy();
      expect(queryByText('Poca cobertura')).toBeNull();
      expect(getByTestId('home-recommendation-rank-note')).toBeTruthy();
      expect(getByText(/Elegida entre tus 2 recetas generadas/)).toBeTruthy();
    });

    it('restricción de presupuesto: prefiere la receta asequible según el backend', async () => {
      const { getByText, queryByText } = await renderHome({
        initialIsDemoMode: false,
        initialRecipes: [
          clientRecipe({
            id: 'cara',
            name: 'Receta cara',
            availableIngredients: [u('Arroz'), u('Huevo')],
            missingIngredients: [u('Salmón', 45000)],
            estimatedMissingCost: 45000,
            budgetRemaining: -25000,
            withinBudget: false,
          }),
          clientRecipe({
            id: 'asequible',
            name: 'Receta asequible',
            availableIngredients: [u('Arroz')],
            missingIngredients: [u('Lenteja', 3000)],
            estimatedMissingCost: 3000,
          }),
        ],
      });

      expect(getByText('Receta asequible')).toBeTruthy();
      expect(queryByText('Receta cara')).toBeNull();
      expect(getByText(/Solo necesitas aproximadamente/)).toBeTruthy();
    });

    it('si la única receta excede el presupuesto, lo indica explícitamente', async () => {
      const { getByTestId, getByText, queryByText } = await renderHome({
        initialIsDemoMode: false,
        initialRecipes: [
          clientRecipe({
            id: 'excede',
            name: 'Receta que excede',
            availableIngredients: [u('Arroz')],
            missingIngredients: [u('Salmón', 45000)],
            estimatedMissingCost: 45000,
            budgetRemaining: -25000,
            withinBudget: false,
          }),
        ],
      });

      expect(getByTestId('home-recommendation-cost')).toBeTruthy();
      expect(getByText(/supera tu presupuesto/)).toBeTruthy();
      expect(queryByText(/Solo necesitas aproximadamente/)).toBeNull();
    });

    it('sin faltantes ni costo indica que no hay que comprar nada', async () => {
      const { getByText } = await renderHome({
        initialIsDemoMode: false,
        initialRecipes: [clientRecipe({ id: 'completa', availableIngredients: [u('Arroz'), u('Huevo')] })],
      });
      expect(getByText('No necesitas comprar ingredientes adicionales')).toBeTruthy();
    });

    it('no muestra un puntaje de conveniencia genérico que no provino del backend', async () => {
      const { queryByText, getByTestId } = await renderHome({
        initialIsDemoMode: false,
        initialRecipes: [clientRecipe({ id: 'sin-puntaje', convenience: 'Óptima' })],
      });
      expect(getByTestId('home-recommended-recipe-card')).toBeTruthy();
      expect(queryByText('Óptima')).toBeNull();
    });

    it('la selección es determinista entre re-renderizados', async () => {
      const recipes = [
        clientRecipe({ id: 'empate-1', name: 'Empate uno', availableIngredients: [u('Arroz')] }),
        clientRecipe({ id: 'empate-2', name: 'Empate dos', availableIngredients: [u('Arroz')] }),
      ];
      const { getByText, rerenderHome } = await renderHome({ initialIsDemoMode: false, initialRecipes: recipes });
      expect(getByText('Empate uno')).toBeTruthy();
      await rerenderHome();
      await rerenderHome();
      expect(getByText('Empate uno')).toBeTruthy();
    });
  });

  describe('Navegación a detalle', () => {
    it('Ver receta selecciona la receta elegida (identidad correcta) y navega a su id', async () => {
      const recipes = [
        clientRecipe({ id: 'primera', name: 'Primera', availableIngredients: [u('Arroz')], missingIngredients: [u('X', 5000)], estimatedMissingCost: 5000 }),
        clientRecipe({ id: 'mejor', name: 'Mejor', availableIngredients: [u('Arroz'), u('Huevo')] }),
      ];
      const { getByTestId } = await renderHome({ initialIsDemoMode: false, initialRecipes: recipes });

      await act(async () => {
        fireEvent.press(getByTestId('home-view-recipe-button'));
      });

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/recetas/mejor');
      expect(recipeCtx.selectedRecipe?.id).toBe('mejor');
      expect(recipeCtx.getRecipeById('mejor')?.name).toBe('Mejor');
    });
  });

  describe('Obsolescencia (isStale)', () => {
    const generated = [
      backendRecipe({
        name: 'Arroz con huevo',
        availableIngredients: [u('Arroz'), u('Huevo')],
        missingIngredients: [u('Cebolla', 1200)],
        estimatedMissingCost: 1200,
        budgetRemaining: 18800,
      }),
    ];

    const generateFromRecipesFlow = async () => {
      // Simula la acción explícita del usuario en /recetas (flujo existente)
      await act(async () => {
        await recipeCtx.generateRecipes();
      });
    };

    it('tras cambiar la despensa no presenta costos anteriores como vigentes', async () => {
      const api = createMockApi(generated);
      const { getByTestId, queryByText, queryByTestId } = await renderHome({ api });

      await generateFromRecipesFlow();
      await waitFor(() => expect(getByTestId('home-recommended-recipe-card')).toBeTruthy());
      expect(queryByText('$1.200')).toBeTruthy();

      await act(async () => {
        await pantryCtx.addIngredient({
          name: 'Cebolla',
          quantity: 1,
          unit: 'unidad',
          category: 'Verduras y frutas',
        });
      });

      await waitFor(() => expect(getByTestId('home-recommendation-stale-state')).toBeTruthy());
      expect(queryByTestId('home-recommended-recipe-card')).toBeNull();
      expect(queryByText('$1.200')).toBeNull();

      fireEvent.press(getByTestId('home-recommendation-refresh-button'));
      expect(mockPush).toHaveBeenCalledWith('/recetas');
      // Actualizar navega al flujo existente; Inicio no vuelve a llamar a la IA
      expect(api.recommendRecipes).toHaveBeenCalledTimes(1);
    });

    it('tras cambiar el presupuesto desde Inicio no presenta la recomendación anterior como vigente', async () => {
      const api = createMockApi(generated);
      const { getByTestId, queryByTestId } = await renderHome({ api });

      await generateFromRecipesFlow();
      await waitFor(() => expect(getByTestId('home-recommended-recipe-card')).toBeTruthy());

      fireEvent.press(getByTestId('home-adjust-budget-button'));
      await waitFor(() => expect(getByTestId('budget-modal-backdrop')).toBeTruthy());
      const input = getByTestId('budget-input-field');
      fireEvent.changeText(input, '50000');
      await waitFor(() => expect(input.props.value).toBe('50000'));
      await act(async () => {
        fireEvent.press(getByTestId('budget-confirm-button'));
      });

      await waitFor(() => expect(getByTestId('home-recommendation-stale-state')).toBeTruthy());
      expect(queryByTestId('home-view-recipe-button')).toBeNull();
      expect(api.recommendRecipes).toHaveBeenCalledTimes(1);
    });

    it('muestra estado de generación en curso sin afirmar resultados', async () => {
      let resolveRequest: (value: BackendRecipe[]) => void = () => {};
      const api = {
        recommendRecipes: jest.fn(
          () => new Promise<BackendRecipe[]>((resolve) => { resolveRequest = resolve; })
        ),
        checkBackendHealth: jest.fn(),
      } as any;
      const { getByTestId, queryByTestId } = await renderHome({ api });

      let pending: Promise<unknown> = Promise.resolve();
      await act(async () => {
        pending = recipeCtx.generateRecipes();
      });
      expect(getByTestId('home-recommendation-generating')).toBeTruthy();
      expect(queryByTestId('home-recommended-recipe-card')).toBeNull();

      await act(async () => {
        resolveRequest(generated);
        await pending;
      });
      await waitFor(() => expect(getByTestId('home-recommended-recipe-card')).toBeTruthy());
    });

    it('si la generación falla sin recetas previas, muestra el error y CTA a Recetas', async () => {
      const api = {
        recommendRecipes: jest.fn().mockRejectedValue(new Error('El servicio de IA no respondió.')),
        checkBackendHealth: jest.fn(),
      } as any;
      const { getByTestId, getByText } = await renderHome({ api, initialIsDemoMode: false, initialRecipes: [] });

      await act(async () => {
        await recipeCtx.generateRecipes().catch(() => {});
      });

      expect(getByTestId('home-recommendation-error-state')).toBeTruthy();
      expect(getByText('El servicio de IA no respondió.')).toBeTruthy();
      fireEvent.press(getByTestId('home-recommendation-generate-button'));
      expect(mockPush).toHaveBeenCalledWith('/recetas');
      expect(api.recommendRecipes).toHaveBeenCalledTimes(1);
    });
  });

  describe('Sin llamadas automáticas a Gemini desde Inicio', () => {
    const scenarios: { label: string; options: RenderOptions; ctaTestID: string }[] = [
      { label: 'modo demo', options: {}, ctaTestID: 'home-recommendation-generate-button' },
      { label: 'despensa vacía', options: { ingredients: [] }, ctaTestID: 'home-recommendation-go-pantry-button' },
      {
        label: 'sin recetas reales',
        options: { initialIsDemoMode: false, initialRecipes: [] },
        ctaTestID: 'home-recommendation-generate-button',
      },
      {
        label: 'recomendación lista',
        options: { initialIsDemoMode: false, initialRecipes: [clientRecipe({ id: 'lista' })] },
        ctaTestID: 'home-view-recipe-button',
      },
    ];

    it.each(scenarios)(
      'no llama al backend al montar, re-renderizar ni pulsar el CTA ($label)',
      async ({ options, ctaTestID }) => {
        const api = createMockApi([backendRecipe({ name: 'No debería generarse' })]);
        const { getByTestId, rerenderHome } = await renderHome({ ...options, api });

        await rerenderHome();
        await rerenderHome();
        await act(async () => {
          fireEvent.press(getByTestId(ctaTestID));
          await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(api.recommendRecipes).not.toHaveBeenCalled();
      }
    );
  });
});
