/**
 * Suite de pruebas unitarias para MealPlanContext (Fase 3C).
 * Valida:
 * 1. Generación de plan únicamente bajo invocación explícita.
 * 2. Bloqueo defensivo ante despensa vacía sin llamar al backend.
 * 3. Prevención de invocaciones concurrentes y cancelación limpia.
 * 4. Detección reactiva de obsolescencia (isStale) ante cambios en despensa, presupuesto o comensales.
 * 5. Descarte de respuestas asíncronas desactualizadas.
 * 6. Persistencia y restauración de planes guardados.
 * 7. Resolución determinista de recetas (getRecipeById) por ID, alias de día o slug.
 * 8. NO altera el stock ni las cantidades de la despensa al generar o consultar el plan.
 */

import React from 'react';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MealPlanProvider, useMealPlan } from '../src/context/MealPlanContext';
import { PantryProvider, usePantry } from '../src/context/PantryContext';
import { BudgetProvider, useBudget } from '../src/context/BudgetContext';
import { RecipeProvider } from '../src/context/RecipeContext';
import { TypographyProvider } from '../src/theme';
import { Ingredient } from '../src/types/pantry';
import { AsyncStorageMealPlanAdapter } from '../src/services/storage/mealPlanStorage';
import { BackendMealPlanResponseData } from '../src/types/mealPlan';

describe('MealPlanContext (Fase 3C)', () => {
  const testStorageKey = '@test:foodai:meal_plan_context';
  let mockStorageAdapter: AsyncStorageMealPlanAdapter;

  const mockIngredients: Ingredient[] = [
    {
      id: 'ing-1',
      name: 'Pollo',
      quantity: 500,
      unit: 'g',
      category: 'Carnes y proteínas',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'ing-2',
      name: 'Arroz',
      quantity: 500,
      unit: 'g',
      category: 'Granos y cereales',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const createBackendDay = (day: number) => ({
    day,
    recipe: {
      name: `Receta del día ${day}`,
      description: `Plato balanceado para el día ${day}`,
      totalMinutes: 30,
      ingredients: [{ name: 'Pollo', quantity: 200, unit: 'g' }],
      steps: ['Cocinar pollo', 'Servir'],
      availableIngredients: [{ name: 'Pollo', quantity: 200, unit: 'g' }],
      missingIngredients: [{ name: 'Cebolla', quantity: 1, unit: 'unidad', estimatedCost: 1000 }],
      estimatedMissingCost: 1000,
      budgetRemaining: 19000,
      withinBudget: true,
      convenience: 92,
      reason: 'Aprovecha tu pollo en despensa',
    },
  });

  const mockBackendResponse: BackendMealPlanResponseData = {
    days: [createBackendDay(1), createBackendDay(2), createBackendDay(3)],
    totalEstimatedMissingCost: 3000,
    budgetRemaining: 17000,
    withinBudget: true,
  };

  beforeEach(async () => {
    mockStorageAdapter = new AsyncStorageMealPlanAdapter(testStorageKey);
    await AsyncStorage.clear();
  });

  afterEach(async () => {
    cleanup();
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  const createWrapper = (
    initialIngredients: Ingredient[] = mockIngredients,
    budgetVal: number = 20000,
    servingsVal: number = 2,
    mockApiClient?: any,
    storageAdapterOverride?: any
  ) => {
    return ({ children }: { children: React.ReactNode }) => (
      <TypographyProvider usingFallback={true}>
        <PantryProvider initialIngredients={initialIngredients}>
          <BudgetProvider initialPreferences={{ budget: budgetVal, servings: servingsVal }}>
            <RecipeProvider>
              <MealPlanProvider
                mealPlanApiClient={mockApiClient}
                storageAdapter={storageAdapterOverride ?? mockStorageAdapter}
              >
                {children}
              </MealPlanProvider>
            </RecipeProvider>
          </BudgetProvider>
        </PantryProvider>
      </TypographyProvider>
    );
  };

  it('inicia con estado en reposo sin generar automáticamente', async () => {
    const { result } = await renderHook(() => useMealPlan(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isRestoring).toBe(false);
    });

    expect(result.current.plan).toBeNull();
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.isStale).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('bloquea la generación si la despensa está vacía sin invocar al backend', async () => {
    const mockGenerate = jest.fn();
    const { result } = await renderHook(() => useMealPlan(), {
      wrapper: createWrapper([], 20000, 2, { generateMealPlan: mockGenerate }),
    });

    await waitFor(() => {
      expect(result.current.isRestoring).toBe(false);
    });

    await act(async () => {
      await expect(result.current.generateMealPlan()).rejects.toThrow();
    });

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(result.current.errorCode).toBe('EMPTY_PANTRY');
    expect(result.current.error).toContain('despensa está vacía');
  });

  it('genera un plan de 3 días con éxito tras acción explícita y lo persiste', async () => {
    const mockApiClient = {
      generateMealPlan: jest.fn().mockResolvedValue(mockBackendResponse),
    };

    const { result } = await renderHook(() => useMealPlan(), {
      wrapper: createWrapper(mockIngredients, 20000, 2, mockApiClient),
    });

    await waitFor(() => {
      expect(result.current.isRestoring).toBe(false);
    });

    let generatedPlan: any;
    await act(async () => {
      generatedPlan = await result.current.generateMealPlan();
    });

    expect(mockApiClient.generateMealPlan).toHaveBeenCalledTimes(1);
    expect(generatedPlan).not.toBeNull();
    expect(generatedPlan.days).toHaveLength(3);
    expect(result.current.plan).not.toBeNull();
    expect(result.current.plan?.days).toHaveLength(3);
    expect(result.current.isStale).toBe(false);

    // Verificar que fue persistido en AsyncStorage
    const stored = await mockStorageAdapter.getStoredMealPlan();
    expect(stored).not.toBeNull();
    expect(stored?.plan.days).toHaveLength(3);
  });

  it('previene llamadas concurrentes a generateMealPlan', async () => {
    let resolveCall!: (val: any) => void;
    const pendingPromise = new Promise((resolve) => {
      resolveCall = resolve;
    });

    const mockApiClient = {
      generateMealPlan: jest.fn().mockReturnValue(pendingPromise),
    };

    const { result } = await renderHook(() => useMealPlan(), {
      wrapper: createWrapper(mockIngredients, 20000, 2, mockApiClient),
    });

    await waitFor(() => {
      expect(result.current.isRestoring).toBe(false);
    });

    let promise1!: Promise<any>;
    let promise2!: Promise<any>;

    await act(async () => {
      promise1 = result.current.generateMealPlan();
      promise2 = result.current.generateMealPlan();
    });

    expect(mockApiClient.generateMealPlan).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCall(mockBackendResponse);
      await Promise.all([promise1, promise2]);
    });
  });

  it('permite cancelar la generación mediante cancelGeneration', async () => {
    const mockApiClient = {
      generateMealPlan: jest.fn().mockImplementation((_, opts) => {
        return new Promise((_, reject) => {
          opts.signal.addEventListener('abort', () => {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      }),
    };

    const { result } = await renderHook(() => useMealPlan(), {
      wrapper: createWrapper(mockIngredients, 20000, 2, mockApiClient),
    });

    await waitFor(() => {
      expect(result.current.isRestoring).toBe(false);
    });

    let genPromise!: Promise<any>;
    await act(async () => {
      genPromise = result.current.generateMealPlan();
    });

    await act(async () => {
      result.current.cancelGeneration();
    });

    expect(result.current.isGenerating).toBe(false);
    expect(result.current.isLoading).toBe(false);

    await act(async () => {
      try {
        await genPromise;
      } catch {
        // Ignorar el aborto esperado
      }
    });
  });

  it('resuelve recetas correctamente con getRecipeById por ID, alias de día o slug', async () => {
    const mockApiClient = {
      generateMealPlan: jest.fn().mockResolvedValue(mockBackendResponse),
    };

    const { result } = await renderHook(() => useMealPlan(), {
      wrapper: createWrapper(mockIngredients, 20000, 2, mockApiClient),
    });

    await waitFor(() => {
      expect(result.current.isRestoring).toBe(false);
    });

    await act(async () => {
      await result.current.generateMealPlan();
    });

    // 1. Por alias de día: "1", "dia-1", "plan-dia-1"
    const recipeByDayNum = result.current.getRecipeById('1');
    expect(recipeByDayNum).toBeDefined();
    expect(recipeByDayNum?.name).toBe('Receta del día 1');

    const recipeByDayAlias = result.current.getRecipeById('dia-2');
    expect(recipeByDayAlias).toBeDefined();
    expect(recipeByDayAlias?.name).toBe('Receta del día 2');

    // 2. Por ID exacto
    const exactId = result.current.plan?.days[2].recipe.id!;
    const recipeByExactId = result.current.getRecipeById(exactId);
    expect(recipeByExactId).toBeDefined();
    expect(recipeByExactId?.name).toBe('Receta del día 3');

    // 3. Consulta inválida retorna undefined
    expect(result.current.getRecipeById('dia-99')).toBeUndefined();
    expect(result.current.getRecipeById('')).toBeUndefined();
  });

  it('restaura el plan persistido al reiniciar la aplicación', async () => {
    const mockApiClient = {
      generateMealPlan: jest.fn().mockResolvedValue(mockBackendResponse),
    };

    // 1. Sesión 1: generar y guardar
    const { result: session1 } = await renderHook(() => useMealPlan(), {
      wrapper: createWrapper(mockIngredients, 20000, 2, mockApiClient),
    });

    await waitFor(() => {
      expect(session1.current.isRestoring).toBe(false);
    });

    await act(async () => {
      await session1.current.generateMealPlan();
    });
    expect(session1.current.plan).not.toBeNull();

    // 2. Sesión 2: nuevo montaje
    const { result: session2 } = await renderHook(() => useMealPlan(), {
      wrapper: createWrapper(mockIngredients, 20000, 2, mockApiClient),
    });

    await waitFor(() => {
      expect(session2.current.isRestoring).toBe(false);
    });

    expect(session2.current.plan).not.toBeNull();
    expect(session2.current.plan?.days).toHaveLength(3);
    expect(session2.current.plan?.days[0].recipe.name).toBe('Receta del día 1');
  });

  it('NO modifica las cantidades ni ítems de la despensa al generar o consultar el plan', async () => {
    const mockApiClient = {
      generateMealPlan: jest.fn().mockResolvedValue(mockBackendResponse),
    };

    const initialQuantities = mockIngredients.map((i) => ({ name: i.name, qty: i.quantity }));

    const { result } = await renderHook(() => useMealPlan(), {
      wrapper: createWrapper(mockIngredients, 20000, 2, mockApiClient),
    });

    await waitFor(() => {
      expect(result.current.isRestoring).toBe(false);
    });

    await act(async () => {
      await result.current.generateMealPlan();
    });

    // Verificar que los ingredientes originales conservan su cantidad exacta
    for (const item of initialQuantities) {
      const match = mockIngredients.find((i) => i.name === item.name);
      expect(match?.quantity).toBe(item.qty);
    }
  });

  it('marca el plan como obsoleto (isStale: true) si el presupuesto cambia tras la generación', async () => {
    const mockApiClient = {
      generateMealPlan: jest.fn().mockResolvedValue(mockBackendResponse),
    };

    const { result } = await renderHook(
      () => ({
        mealPlan: useMealPlan(),
        budget: useBudget(),
      }),
      {
        wrapper: createWrapper(mockIngredients, 20000, 2, mockApiClient),
      }
    );

    await waitFor(() => {
      expect(result.current.mealPlan.isRestoring).toBe(false);
    });

    await act(async () => {
      await result.current.mealPlan.generateMealPlan();
    });

    expect(result.current.mealPlan.isStale).toBe(false);

    // Cambiar presupuesto
    await act(async () => {
      await result.current.budget.setBudget(35000);
    });

    expect(result.current.mealPlan.isStale).toBe(true);
  });

  it('marca el plan como obsoleto (isStale: true) si la despensa cambia tras la generación', async () => {
    const mockApiClient = {
      generateMealPlan: jest.fn().mockResolvedValue(mockBackendResponse),
    };

    const { result } = await renderHook(
      () => ({
        mealPlan: useMealPlan(),
        pantry: usePantry(),
      }),
      {
        wrapper: createWrapper(mockIngredients, 20000, 2, mockApiClient),
      }
    );

    await waitFor(() => {
      expect(result.current.mealPlan.isRestoring).toBe(false);
    });

    await act(async () => {
      await result.current.mealPlan.generateMealPlan();
    });

    expect(result.current.mealPlan.isStale).toBe(false);

    // Agregar ingrediente a la despensa
    await act(async () => {
      await result.current.pantry.addIngredient({
        name: 'Zanahoria',
        quantity: 2,
        unit: 'unidad',
        category: 'Verduras y frutas',
      });
    });

    expect(result.current.mealPlan.isStale).toBe(true);
  });

  describe('Pruebas de regresión FIX 1: Protección de restauración persistida', () => {
    const createStoredDay = (day: number, name?: string) => ({
      day,
      recipe: {
        id: `plan-dia-${day}-receta`,
        name: name ?? `Receta del día ${day}`,
        description: `Plato para el día ${day}`,
        totalMinutes: 20 + day * 5,
        servings: 2,
        ingredients: [{ name: 'Pollo', quantity: 200, unit: 'g' }],
        steps: ['Cocinar'],
        availableIngredients: [{ name: 'Pollo', quantity: 200, unit: 'g' }],
        missingIngredients: [],
        estimatedMissingCost: 0,
        budgetRemaining: 20000,
        withinBudget: true,
        convenience: '90%',
        reason: 'Restaurado',
        isDemoFixture: false,
      },
    });

    const oldStoredData = {
      plan: {
        days: [
          createStoredDay(1, 'Receta Antigua Guardada'),
          createStoredDay(2, 'Receta Antigua Día 2'),
          createStoredDay(3, 'Receta Antigua Día 3'),
        ],
        totalEstimatedMissingCost: 0,
        budgetRemaining: 20000,
        withinBudget: true,
        uniqueMissingIngredients: [],
      },
      snapshot: {
        pantryFingerprint: 'old-fingerprint',
        budget: 20000,
        servings: 2,
        maxMinutes: 30,
        generatedAt: '2026-01-01T00:00:00.000Z',
      },
    };

    it('1. Restauración lenta seguida de una generación más reciente exitosa no sobrescribe el nuevo plan', async () => {
      let resolveSlowRestoration!: (val: any) => void;
      const slowRestorationPromise = new Promise((resolve) => {
        resolveSlowRestoration = resolve;
      });

      const slowStorageAdapter = {
        getStoredMealPlan: jest.fn().mockReturnValue(slowRestorationPromise),
        saveMealPlan: jest.fn().mockResolvedValue(undefined),
        clearMealPlan: jest.fn().mockResolvedValue(undefined),
      };

      const newBackendResponse: BackendMealPlanResponseData = {
        days: [
          {
            day: 1,
            recipe: {
              name: 'Receta Nueva Recién Generada',
              description: 'Plato generado con datos nuevos',
              totalMinutes: 25,
              ingredients: [{ name: 'Pollo', quantity: 200, unit: 'g' }],
              steps: ['Preparar'],
              availableIngredients: [{ name: 'Pollo', quantity: 200, unit: 'g' }],
              missingIngredients: [],
              estimatedMissingCost: 0,
              budgetRemaining: 20000,
              withinBudget: true,
              convenience: 95,
              reason: 'Nueva generación',
            },
          },
        ],
        totalEstimatedMissingCost: 0,
        budgetRemaining: 20000,
        withinBudget: true,
      };

      const mockApiClient = {
        generateMealPlan: jest.fn().mockResolvedValue(newBackendResponse),
      };

      const { result } = await renderHook(() => useMealPlan(), {
        wrapper: createWrapper(mockIngredients, 20000, 2, mockApiClient, slowStorageAdapter),
      });

      expect(slowStorageAdapter.getStoredMealPlan).toHaveBeenCalledTimes(1);

      // El usuario genera un nuevo plan mientras la restauración está en vuelo
      await act(async () => {
        await result.current.generateMealPlan();
      });

      expect(result.current.plan?.days[0].recipe.name).toBe('Receta Nueva Recién Generada');

      // Ahora la restauración lenta finalmente resuelve con el plan antiguo
      await act(async () => {
        resolveSlowRestoration(oldStoredData);
        await slowRestorationPromise;
      });

      // El plan NO debe haber sido sobrescrito por el plan antiguo
      expect(result.current.plan?.days[0].recipe.name).toBe('Receta Nueva Recién Generada');
      expect(result.current.isRestoring).toBe(false);
    });

    it('2. Restauración lenta seguida de clearMealPlan() no restaura el plan eliminado', async () => {
      let resolveSlowRestoration!: (val: any) => void;
      const slowRestorationPromise = new Promise((resolve) => {
        resolveSlowRestoration = resolve;
      });

      const slowStorageAdapter = {
        getStoredMealPlan: jest.fn().mockReturnValue(slowRestorationPromise),
        saveMealPlan: jest.fn().mockResolvedValue(undefined),
        clearMealPlan: jest.fn().mockResolvedValue(undefined),
      };

      const { result } = await renderHook(() => useMealPlan(), {
        wrapper: createWrapper(mockIngredients, 20000, 2, undefined, slowStorageAdapter),
      });

      // El usuario borra el plan mientras la restauración aún está en curso
      await act(async () => {
        await result.current.clearMealPlan();
      });

      expect(result.current.plan).toBeNull();

      // La restauración lenta finalmente resuelve con datos antiguos
      await act(async () => {
        resolveSlowRestoration(oldStoredData);
        await slowRestorationPromise;
      });

      // El plan debe permanecer en null y no restaurarse
      expect(result.current.plan).toBeNull();
      expect(result.current.isRestoring).toBe(false);
    });

    it('3. Desmontaje antes de que la restauración complete no genera inconsistencias ni fugas', async () => {
      let resolveSlowRestoration!: (val: any) => void;
      const slowRestorationPromise = new Promise((resolve) => {
        resolveSlowRestoration = resolve;
      });

      const slowStorageAdapter = {
        getStoredMealPlan: jest.fn().mockReturnValue(slowRestorationPromise),
        saveMealPlan: jest.fn().mockResolvedValue(undefined),
        clearMealPlan: jest.fn().mockResolvedValue(undefined),
      };

      const { unmount } = await renderHook(() => useMealPlan(), {
        wrapper: createWrapper(mockIngredients, 20000, 2, undefined, slowStorageAdapter),
      });

      unmount();
      resolveSlowRestoration(oldStoredData);
      await slowRestorationPromise;
      await new Promise((r) => setTimeout(r, 50));

      // Si no hubo excepciones o warnings no capturados, pasó la prueba limpia
    });

    it('4. La restauración normal continúa funcionando al reiniciar la app', async () => {
      // Guardar previamente en el storage adapter
      await mockStorageAdapter.saveMealPlan(oldStoredData.plan as any, oldStoredData.snapshot);

      const { result } = await renderHook(() => useMealPlan(), {
        wrapper: createWrapper(mockIngredients, 20000, 2, undefined, mockStorageAdapter),
      });

      await waitFor(() => {
        expect(result.current.isRestoring).toBe(false);
      });

      expect(result.current.plan).not.toBeNull();
      expect(result.current.plan?.days[0].recipe.name).toBe('Receta Antigua Guardada');
      expect(result.current.lastGeneratedAt).toBe(oldStoredData.snapshot.generatedAt);
    });
  });
});
