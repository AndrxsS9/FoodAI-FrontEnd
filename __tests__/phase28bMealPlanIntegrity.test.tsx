/**
 * Fase 28B — Persistencia honesta del plan de comidas (D1) e hidratación segura (D2).
 *
 * D1: un fallo de almacenamiento nunca se convierte en un éxito silencioso. La generación conserva
 *     el plan en memoria con un aviso explícito; los cambios de completado no divergen del estado
 *     guardado; la eliminación nunca se declara si el plan sigue persistido.
 * D2: la generación se bloquea (DATA_NOT_READY, sin llamar al backend) hasta que la despensa y el
 *     presupuesto estén hidratados, y no hay avisos falsos de plan obsoleto durante la restauración.
 */
import React from 'react';
import { renderHook, render, act, waitFor, fireEvent, cleanup } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PlanScreen from '../app/(tabs)/plan';
import { MealPlanProvider, useMealPlan } from '../src/context/MealPlanContext';
import { PantryProvider } from '../src/context/PantryContext';
import { BudgetProvider, useBudget } from '../src/context/BudgetContext';
import { RecipeProvider, useRecipes, DATA_NOT_READY_CODE } from '../src/context/RecipeContext';
import { TypographyProvider } from '../src/theme';
import { AsyncStorageMealPlanAdapter, MealPlanStorageAdapter } from '../src/services/storage/mealPlanStorage';
import { PantryStorageAdapter } from '../src/services/storage/pantryStorage';
import { BudgetStorageAdapter } from '../src/services/storage/budgetStorage';
import { Ingredient } from '../src/types/pantry';
import { BudgetPreferences, DEFAULT_BUDGET_COP } from '../src/types/budget';
import {
  BackendMealPlanResponseData,
  MealPlanGenerationSnapshot,
  normalizeBackendMealPlan,
} from '../src/types/mealPlan';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

const now = '2026-01-01T00:00:00.000Z';
const pantryItems: Ingredient[] = [
  { id: 'ing-1', name: 'Pollo', quantity: 500, unit: 'g', category: 'Carnes y proteínas', createdAt: now, updatedAt: now },
  { id: 'ing-2', name: 'Arroz', quantity: 1, unit: 'kg', category: 'Granos y cereales', createdAt: now, updatedAt: now },
];
const fingerprint = (items: Ingredient[]) =>
  items
    .map((i) => `${i.id}:${i.name.toLowerCase()}:${i.quantity}:${i.unit}`)
    .sort()
    .join('|');

const day = (n: number, label = 'A') => ({
  day: n,
  recipe: {
    name: `Receta ${label} ${n}`,
    description: 'Plato balanceado',
    totalMinutes: 30,
    ingredients: [{ name: 'Pollo', quantity: 200, unit: 'g' }],
    steps: ['Cocinar', 'Servir'],
    availableIngredients: [{ name: 'Pollo', quantity: 200, unit: 'g' }],
    missingIngredients: [],
    estimatedMissingCost: 0,
    budgetRemaining: 20000,
    withinBudget: true,
    convenience: 90,
    reason: 'Aprovecha tu despensa',
  },
});
const backendPlan = (label = 'A'): BackendMealPlanResponseData => ({
  days: [day(1, label), day(2, label), day(3, label)],
  totalEstimatedMissingCost: 0,
  budgetRemaining: 20000,
  withinBudget: true,
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function pendingPantryAdapter(items: Ingredient[]) {
  const d = deferred<Ingredient[]>();
  const adapter: PantryStorageAdapter = {
    getIngredients: jest.fn(() => d.promise),
    saveIngredients: jest.fn(async () => {}),
    addIngredient: jest.fn(),
    updateIngredient: jest.fn(),
    deleteIngredient: jest.fn(async () => {}),
    clearIngredients: jest.fn(async () => {}),
  };
  return { adapter, resolve: () => d.resolve(items) };
}

function pendingBudgetAdapter(prefs: Partial<BudgetPreferences>) {
  const d = deferred<BudgetPreferences>();
  const adapter: BudgetStorageAdapter = {
    getPreferences: jest.fn(() => d.promise),
    savePreferences: jest.fn(),
    resetPreferences: jest.fn(),
  };
  return {
    adapter,
    resolve: () => d.resolve({ budget: 20000, servings: 2, updatedAt: now, ...prefs } as BudgetPreferences),
  };
}

interface TreeOptions {
  pantryAdapter?: PantryStorageAdapter;
  budgetAdapter?: BudgetStorageAdapter;
  mealStorage: MealPlanStorageAdapter;
  api: any;
  recipeApi?: any;
}

function Tree({ pantryAdapter, budgetAdapter, mealStorage, api, recipeApi, children }: TreeOptions & { children: React.ReactNode }) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
        frame: { x: 0, y: 0, width: 390, height: 844 },
      }}
    >
      <TypographyProvider usingFallback>
        <PantryProvider
          {...(pantryAdapter ? { storageAdapter: pantryAdapter } : { initialIngredients: pantryItems })}
        >
          <BudgetProvider
            {...(budgetAdapter
              ? { storageAdapter: budgetAdapter }
              : { initialPreferences: { budget: 50000, servings: 2 } })}
          >
            <RecipeProvider recipeApiClient={recipeApi ?? { recommendRecipes: jest.fn() }}>
              <MealPlanProvider storageAdapter={mealStorage} mealPlanApiClient={api}>
                {children}
              </MealPlanProvider>
            </RecipeProvider>
          </BudgetProvider>
        </PantryProvider>
      </TypographyProvider>
    </SafeAreaProvider>
  );
}

async function renderMealPlanHook(options: TreeOptions) {
  const wrapper = ({ children }: { children: React.ReactNode }) => <Tree {...options}>{children}</Tree>;
  return renderHook(() => ({ mp: useMealPlan(), budget: useBudget(), recipes: useRecipes() }), { wrapper });
}

const apiReturning = (...plans: BackendMealPlanResponseData[]) => {
  const fn = jest.fn();
  plans.forEach((p) => fn.mockResolvedValueOnce(p));
  fn.mockResolvedValue(plans[plans.length - 1] ?? backendPlan());
  return { generateMealPlan: fn };
};

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  cleanup();
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe('D1 — persistencia honesta del plan de comidas', () => {
  describe('Generación', () => {
    it('conserva el plan generado en memoria y expone un aviso explícito si no se pudo guardar', async () => {
      const storage = new AsyncStorageMealPlanAdapter('@test28b:mp:gen-fail');
      jest.spyOn(storage, 'saveMealPlan').mockRejectedValue(new Error('disk full'));
      const api = apiReturning(backendPlan());
      const { result } = await renderMealPlanHook({ mealStorage: storage, api });
      await waitFor(() => expect(result.current.mp.isRestoring).toBe(false));

      let returned: any;
      await act(async () => {
        returned = await result.current.mp.generateMealPlan();
      });

      expect(returned?.days).toHaveLength(3);
      expect(result.current.mp.plan?.days).toHaveLength(3);
      // La generación con IA no es un error…
      expect(result.current.mp.error).toBeNull();
      expect(result.current.mp.errorCode).toBeNull();
      // …pero la falta de guardado se comunica explícitamente
      expect(result.current.mp.persistenceWarningCode).toBe('save_failed');
      expect(result.current.mp.persistenceWarning).toMatch(/no pudimos guardarlo/i);
      expect(await AsyncStorage.getItem('@test28b:mp:gen-fail')).toBeNull();
    });

    it('al reiniciar tras un guardado fallido no aparece un plan fantasma', async () => {
      const key = '@test28b:mp:gen-restart';
      const failing = new AsyncStorageMealPlanAdapter(key);
      jest.spyOn(failing, 'saveMealPlan').mockRejectedValue(new Error('disk full'));
      const first = await renderMealPlanHook({ mealStorage: failing, api: apiReturning(backendPlan()) });
      await waitFor(() => expect(first.result.current.mp.isRestoring).toBe(false));
      await act(async () => {
        await first.result.current.mp.generateMealPlan();
      });
      await first.unmount();

      const second = await renderMealPlanHook({
        mealStorage: new AsyncStorageMealPlanAdapter(key),
        api: apiReturning(backendPlan()),
      });
      await waitFor(() => expect(second.result.current.mp.isRestoring).toBe(false));
      expect(second.result.current.mp.plan).toBeNull();
      expect(second.result.current.mp.persistenceWarningCode).toBeNull();
    });

    it('si falla el guardado de un plan nuevo, el reinicio restaura el último plan guardado y el aviso lo advierte', async () => {
      const key = '@test28b:mp:gen-previous';
      const storage = new AsyncStorageMealPlanAdapter(key);
      const api = apiReturning(backendPlan('A'), backendPlan('B'));
      const first = await renderMealPlanHook({ mealStorage: storage, api });
      await waitFor(() => expect(first.result.current.mp.isRestoring).toBe(false));
      await act(async () => {
        await first.result.current.mp.generateMealPlan();
      });
      expect(first.result.current.mp.persistenceWarningCode).toBeNull();

      jest.spyOn(storage, 'saveMealPlan').mockRejectedValueOnce(new Error('io'));
      await act(async () => {
        await first.result.current.mp.generateMealPlan();
      });
      expect(first.result.current.mp.plan?.days[0].recipe.name).toBe('Receta B 1');
      expect(first.result.current.mp.persistenceWarningCode).toBe('save_failed');
      await first.unmount();

      const second = await renderMealPlanHook({ mealStorage: new AsyncStorageMealPlanAdapter(key), api });
      await waitFor(() => expect(second.result.current.mp.plan).not.toBeNull());
      expect(second.result.current.mp.plan?.days[0].recipe.name).toBe('Receta A 1');
    });

    it('un guardado posterior verificado retira el aviso', async () => {
      const storage = new AsyncStorageMealPlanAdapter('@test28b:mp:gen-recover');
      const api = apiReturning(backendPlan('A'), backendPlan('B'));
      const { result } = await renderMealPlanHook({ mealStorage: storage, api });
      await waitFor(() => expect(result.current.mp.isRestoring).toBe(false));

      jest.spyOn(storage, 'saveMealPlan').mockRejectedValueOnce(new Error('io'));
      await act(async () => {
        await result.current.mp.generateMealPlan();
      });
      expect(result.current.mp.persistenceWarningCode).toBe('save_failed');

      await act(async () => {
        await result.current.mp.generateMealPlan();
      });
      expect(result.current.mp.persistenceWarningCode).toBeNull();
      expect(result.current.mp.persistenceWarning).toBeNull();
    });

    it('un guardado fallido de una generación cancelada no muestra avisos ni altera el estado', async () => {
      const save = deferred<void>();
      const storage: MealPlanStorageAdapter = {
        getStoredMealPlan: jest.fn(async () => null),
        saveMealPlan: jest.fn(() => save.promise.then(() => Promise.reject(new Error('io')))),
        clearMealPlan: jest.fn(async () => {}),
      };
      const { result } = await renderMealPlanHook({ mealStorage: storage, api: apiReturning(backendPlan()) });
      await waitFor(() => expect(result.current.mp.isRestoring).toBe(false));

      let genP!: Promise<any>;
      await act(async () => {
        genP = result.current.mp.generateMealPlan();
      });
      await waitFor(() => expect(storage.saveMealPlan).toHaveBeenCalled());
      await act(async () => {
        result.current.mp.cancelGeneration();
      });
      await act(async () => {
        save.resolve();
        await genP.catch(() => null);
      });
      expect(result.current.mp.persistenceWarningCode).toBeNull();
    });
  });

  describe('Completado de días', () => {
    const setupWithSavedPlan = async (key: string) => {
      const storage = new AsyncStorageMealPlanAdapter(key);
      const api = apiReturning(backendPlan());
      const hook = await renderMealPlanHook({ mealStorage: storage, api });
      await waitFor(() => expect(hook.result.current.mp.isRestoring).toBe(false));
      await act(async () => {
        await hook.result.current.mp.generateMealPlan();
      });
      return { storage, api, ...hook };
    };

    it('si el guardado falla, el estado visible no diverge del persistido y se avisa', async () => {
      const key = '@test28b:mp:toggle-fail';
      const { storage, result } = await setupWithSavedPlan(key);
      jest.spyOn(storage, 'saveMealPlan').mockRejectedValue(new Error('disk full'));

      await act(async () => {
        await result.current.mp.toggleDayCompleted(1);
      });

      expect(result.current.mp.completedDaysCount).toBe(0);
      expect(result.current.mp.plan?.days[0].isCompleted).toBe(false);
      expect(result.current.mp.persistenceWarningCode).toBe('completion_save_failed');
      expect(result.current.mp.persistenceWarning).toBeTruthy();
      const persisted = JSON.parse((await AsyncStorage.getItem(key))!);
      expect(persisted.plan.days[0].isCompleted).toBe(false);
    });

    it('al reiniciar tras un completado fallido se restaura exactamente lo que se veía', async () => {
      const key = '@test28b:mp:toggle-restart';
      const { storage, result, unmount, api } = await setupWithSavedPlan(key);
      jest.spyOn(storage, 'saveMealPlan').mockRejectedValue(new Error('disk full'));
      await act(async () => {
        await result.current.mp.toggleDayCompleted(2);
      });
      const visibleCompleted = result.current.mp.completedDaysCount;
      await unmount();

      const second = await renderMealPlanHook({ mealStorage: new AsyncStorageMealPlanAdapter(key), api });
      await waitFor(() => expect(second.result.current.mp.plan).not.toBeNull());
      expect(second.result.current.mp.completedDaysCount).toBe(visibleCompleted);
    });

    it('un completado exitoso se ve y se conserva tras reiniciar, y retira avisos previos', async () => {
      const key = '@test28b:mp:toggle-ok';
      const { storage, result, unmount, api } = await setupWithSavedPlan(key);
      jest.spyOn(storage, 'saveMealPlan').mockRejectedValueOnce(new Error('io'));
      await act(async () => {
        await result.current.mp.toggleDayCompleted(1);
      });
      expect(result.current.mp.persistenceWarningCode).toBe('completion_save_failed');

      await act(async () => {
        await result.current.mp.toggleDayCompleted(1);
      });
      expect(result.current.mp.completedDaysCount).toBe(1);
      expect(result.current.mp.persistenceWarningCode).toBeNull();
      await unmount();

      const second = await renderMealPlanHook({ mealStorage: new AsyncStorageMealPlanAdapter(key), api });
      await waitFor(() => expect(second.result.current.mp.plan).not.toBeNull());
      expect(second.result.current.mp.completedDaysCount).toBe(1);
      expect(second.result.current.mp.plan?.days[0].isCompleted).toBe(true);
    });

    it('dos completados seguidos sobre días distintos no se pisan entre sí', async () => {
      const key = '@test28b:mp:toggle-double';
      const { result } = await setupWithSavedPlan(key);
      await act(async () => {
        await Promise.all([result.current.mp.toggleDayCompleted(1), result.current.mp.toggleDayCompleted(3)]);
      });
      expect(result.current.mp.completedDaysCount).toBe(2);
      const persisted = JSON.parse((await AsyncStorage.getItem(key))!);
      expect(persisted.plan.days.map((d: any) => d.isCompleted)).toEqual([true, false, true]);
    });

    it('markRecipeCompleted también refleja el fallo sin marcar el día', async () => {
      const key = '@test28b:mp:mark-fail';
      const { storage, result } = await setupWithSavedPlan(key);
      jest.spyOn(storage, 'saveMealPlan').mockRejectedValue(new Error('io'));
      const recipeId = result.current.mp.plan!.days[1].recipe.id;
      await act(async () => {
        await result.current.mp.markRecipeCompleted(recipeId);
      });
      expect(result.current.mp.plan?.days[1].isCompleted).toBe(false);
      expect(result.current.mp.persistenceWarningCode).toBe('completion_save_failed');
    });
  });

  describe('Eliminación', () => {
    it('si el borrado falla, no declara la eliminación: el plan sigue visible y se avisa', async () => {
      const key = '@test28b:mp:clear-fail';
      const storage = new AsyncStorageMealPlanAdapter(key);
      const api = apiReturning(backendPlan());
      const { result, unmount } = await renderMealPlanHook({ mealStorage: storage, api });
      await waitFor(() => expect(result.current.mp.isRestoring).toBe(false));
      await act(async () => {
        await result.current.mp.generateMealPlan();
      });

      jest.spyOn(storage, 'clearMealPlan').mockRejectedValue(new Error('io'));
      await act(async () => {
        await result.current.mp.clearMealPlan();
      });

      expect(result.current.mp.plan).not.toBeNull();
      expect(result.current.mp.persistenceWarningCode).toBe('clear_failed');
      expect(result.current.mp.persistenceWarning).toMatch(/no pudimos eliminar/i);
      expect(await AsyncStorage.getItem(key)).not.toBeNull();
      await unmount();

      // Al reiniciar, lo restaurado coincide con lo que el usuario seguía viendo
      const second = await renderMealPlanHook({ mealStorage: new AsyncStorageMealPlanAdapter(key), api });
      await waitFor(() => expect(second.result.current.mp.plan).not.toBeNull());
    });

    it('un borrado exitoso elimina el plan en memoria y en el almacenamiento', async () => {
      const key = '@test28b:mp:clear-ok';
      const storage = new AsyncStorageMealPlanAdapter(key);
      const api = apiReturning(backendPlan());
      const { result, unmount } = await renderMealPlanHook({ mealStorage: storage, api });
      await waitFor(() => expect(result.current.mp.isRestoring).toBe(false));
      await act(async () => {
        await result.current.mp.generateMealPlan();
      });
      await act(async () => {
        await result.current.mp.clearMealPlan();
      });
      expect(result.current.mp.plan).toBeNull();
      expect(result.current.mp.persistenceWarningCode).toBeNull();
      expect(await AsyncStorage.getItem(key)).toBeNull();
      await unmount();

      const second = await renderMealPlanHook({ mealStorage: new AsyncStorageMealPlanAdapter(key), api });
      await waitFor(() => expect(second.result.current.mp.isRestoring).toBe(false));
      expect(second.result.current.mp.plan).toBeNull();
    });
  });
});

describe('D2 — hidratación segura antes de generar', () => {
  it('con el presupuesto aún cargando: DATA_NOT_READY, sin llamar al backend; luego usa el presupuesto persistido', async () => {
    const budget = pendingBudgetAdapter({ budget: 80000, servings: 3 });
    const api = apiReturning(backendPlan());
    const recipeApi = { recommendRecipes: jest.fn() };
    const { result } = await renderMealPlanHook({
      budgetAdapter: budget.adapter,
      mealStorage: new AsyncStorageMealPlanAdapter('@test28b:mp:budget-pending'),
      api,
      recipeApi,
    });
    await waitFor(() => expect(result.current.mp.isRestoring).toBe(false));
    expect(result.current.budget.isLoading).toBe(true);

    let code: string | undefined;
    await act(async () => {
      try {
        await result.current.mp.generateMealPlan();
      } catch (e: any) {
        code = e.code;
      }
    });
    expect(code).toBe(DATA_NOT_READY_CODE);
    expect(result.current.mp.errorCode).toBe(DATA_NOT_READY_CODE);
    expect(api.generateMealPlan).not.toHaveBeenCalled();
    expect(result.current.mp.plan).toBeNull();

    // RecipeContext conserva su comportamiento existente
    let recipeCode: string | undefined;
    await act(async () => {
      try {
        await result.current.recipes.generateRecipes();
      } catch (e: any) {
        recipeCode = e.code;
      }
    });
    expect(recipeCode).toBe(DATA_NOT_READY_CODE);
    expect(recipeApi.recommendRecipes).not.toHaveBeenCalled();

    await act(async () => {
      budget.resolve();
    });
    await waitFor(() => expect(result.current.budget.isLoading).toBe(false));
    // El aviso de "aún cargando" deja de mostrarse en cuanto termina la hidratación
    expect(result.current.mp.errorCode).toBeNull();
    expect(result.current.mp.error).toBeNull();

    await act(async () => {
      await result.current.mp.generateMealPlan();
    });
    expect(api.generateMealPlan).toHaveBeenCalledTimes(1);
    const payload = api.generateMealPlan.mock.calls[0][0];
    expect(payload.budget).toBe(80000);
    expect(payload.budget).not.toBe(DEFAULT_BUDGET_COP);
    expect(payload.servings).toBe(3);
  });

  it('con la despensa aún cargando: DATA_NOT_READY (no "despensa vacía") y sin llamar al backend', async () => {
    const pantry = pendingPantryAdapter(pantryItems);
    const api = apiReturning(backendPlan());
    const { result } = await renderMealPlanHook({
      pantryAdapter: pantry.adapter,
      mealStorage: new AsyncStorageMealPlanAdapter('@test28b:mp:pantry-pending'),
      api,
    });
    await waitFor(() => expect(result.current.mp.isRestoring).toBe(false));

    let code: string | undefined;
    await act(async () => {
      try {
        await result.current.mp.generateMealPlan();
      } catch (e: any) {
        code = e.code;
      }
    });
    expect(code).toBe(DATA_NOT_READY_CODE);
    expect(api.generateMealPlan).not.toHaveBeenCalled();

    await act(async () => {
      pantry.resolve();
    });
    await waitFor(() => expect(result.current.mp.errorCode).toBeNull());
    await act(async () => {
      await result.current.mp.generateMealPlan();
    });
    expect(api.generateMealPlan).toHaveBeenCalledTimes(1);
    expect(api.generateMealPlan.mock.calls[0][0].pantry).toHaveLength(2);
  });

  it('no marca como obsoleto un plan restaurado mientras la despensa aún se hidrata', async () => {
    const plan = normalizeBackendMealPlan(backendPlan(), 2, { planId: 'plan_restored', generatedAt: now });
    const snapshot: MealPlanGenerationSnapshot = {
      pantryFingerprint: fingerprint(pantryItems),
      budget: 20000,
      servings: 2,
      generatedAt: now,
    };
    const mealStorage: MealPlanStorageAdapter = {
      getStoredMealPlan: jest.fn(async () => ({ plan, snapshot })),
      saveMealPlan: jest.fn(async () => {}),
      clearMealPlan: jest.fn(async () => {}),
    };
    const pantry = pendingPantryAdapter(pantryItems);
    const budget = pendingBudgetAdapter({ budget: 20000, servings: 2 });
    const { result } = await renderMealPlanHook({
      pantryAdapter: pantry.adapter,
      budgetAdapter: budget.adapter,
      mealStorage,
      api: apiReturning(backendPlan()),
    });

    await waitFor(() => expect(result.current.mp.plan).not.toBeNull());
    expect(result.current.mp.isStale).toBe(false);

    await act(async () => {
      pantry.resolve();
    });
    expect(result.current.mp.isStale).toBe(false);

    await act(async () => {
      budget.resolve();
    });
    await waitFor(() => expect(result.current.budget.isLoading).toBe(false));
    expect(result.current.mp.isStale).toBe(false);
  });

  it('tras la hidratación sí detecta una despensa que cambió de verdad', async () => {
    const plan = normalizeBackendMealPlan(backendPlan(), 2, { planId: 'plan_restored', generatedAt: now });
    const snapshot: MealPlanGenerationSnapshot = {
      pantryFingerprint: fingerprint([pantryItems[0]]),
      budget: 20000,
      servings: 2,
      generatedAt: now,
    };
    const mealStorage: MealPlanStorageAdapter = {
      getStoredMealPlan: jest.fn(async () => ({ plan, snapshot })),
      saveMealPlan: jest.fn(async () => {}),
      clearMealPlan: jest.fn(async () => {}),
    };
    const pantry = pendingPantryAdapter(pantryItems);
    const budget = pendingBudgetAdapter({ budget: 20000, servings: 2 });
    const { result } = await renderMealPlanHook({
      pantryAdapter: pantry.adapter,
      budgetAdapter: budget.adapter,
      mealStorage,
      api: apiReturning(backendPlan()),
    });
    await waitFor(() => expect(result.current.mp.plan).not.toBeNull());
    expect(result.current.mp.isStale).toBe(false);

    await act(async () => {
      pantry.resolve();
      budget.resolve();
    });
    await waitFor(() => expect(result.current.mp.isStale).toBe(true));
  });
});

describe('Pantalla de Plan — avisos accesibles e hidratación (Fase 28B)', () => {
  it('muestra un aviso accesible cuando el plan generado no se pudo guardar, sin banner de error', async () => {
    const storage = new AsyncStorageMealPlanAdapter('@test28b:screen:save-fail');
    jest.spyOn(storage, 'saveMealPlan').mockRejectedValue(new Error('io'));
    const api = apiReturning(backendPlan());
    const screen = await render(
      <Tree mealStorage={storage} api={api}>
        <PlanScreen />
      </Tree>
    );

    await waitFor(() => expect(screen.getByTestId('generate-meal-plan-button')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('generate-meal-plan-button'));
    await waitFor(() => expect(screen.getByTestId('plan-results-section')).toBeTruthy());

    const banner = await screen.findByTestId('plan-persistence-warning');
    expect(banner.props.accessibilityRole).toBe('alert');
    expect(screen.getByText(/no pudimos guardarlo/i)).toBeTruthy();
    expect(screen.queryByTestId('plan-error-banner')).toBeNull();

    await fireEvent.press(screen.getByTestId('plan-persistence-warning-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('plan-persistence-warning')).toBeNull());
  });

  it('un completado que no se pudo guardar no muestra el día como completado y avisa', async () => {
    const storage = new AsyncStorageMealPlanAdapter('@test28b:screen:toggle-fail');
    const api = apiReturning(backendPlan());
    const screen = await render(
      <Tree mealStorage={storage} api={api}>
        <PlanScreen />
      </Tree>
    );
    await waitFor(() => expect(screen.getByTestId('generate-meal-plan-button')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('generate-meal-plan-button'));
    await waitFor(() => expect(screen.getByTestId('plan-day-complete-button-1')).toBeTruthy());

    jest.spyOn(storage, 'saveMealPlan').mockRejectedValue(new Error('io'));
    await fireEvent.press(screen.getByTestId('plan-day-complete-button-1'));

    await screen.findByTestId('plan-persistence-warning');
    expect(screen.queryByTestId('plan-day-completed-badge-1')).toBeNull();
  });

  it('mientras la despensa se hidrata no muestra "despensa vacía" ni permite generar', async () => {
    const pantry = pendingPantryAdapter(pantryItems);
    const api = apiReturning(backendPlan());
    const screen = await render(
      <Tree pantryAdapter={pantry.adapter} mealStorage={new AsyncStorageMealPlanAdapter('@test28b:screen:pantry')} api={api}>
        <PlanScreen />
      </Tree>
    );

    expect(await screen.findByTestId('plan-hydrating-state')).toBeTruthy();
    expect(screen.queryByTestId('plan-empty-pantry-card')).toBeNull();
    expect(screen.queryByTestId('generate-meal-plan-button')).toBeNull();

    await act(async () => {
      pantry.resolve();
    });
    await waitFor(() => expect(screen.getByTestId('plan-intro-card')).toBeTruthy());
    expect(screen.queryByTestId('plan-hydrating-state')).toBeNull();
  });

  it('mientras el presupuesto se hidrata no permite generar ni llama al backend', async () => {
    const budget = pendingBudgetAdapter({ budget: 80000 });
    const api = apiReturning(backendPlan());
    const screen = await render(
      <Tree budgetAdapter={budget.adapter} mealStorage={new AsyncStorageMealPlanAdapter('@test28b:screen:budget')} api={api}>
        <PlanScreen />
      </Tree>
    );

    expect(await screen.findByTestId('plan-hydrating-state')).toBeTruthy();
    expect(screen.queryByTestId('generate-meal-plan-button')).toBeNull();
    expect(api.generateMealPlan).not.toHaveBeenCalled();

    await act(async () => {
      budget.resolve();
    });
    await waitFor(() => expect(screen.getByTestId('generate-meal-plan-button')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('generate-meal-plan-button'));
    await waitFor(() => expect(api.generateMealPlan).toHaveBeenCalledTimes(1));
    expect(api.generateMealPlan.mock.calls[0][0].budget).toBe(80000);
  });
});
