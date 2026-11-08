/**
 * FoodAI — Bloque 4: Bloqueo de consumo de despensa para recetas de demostración.
 *
 * Verifica que la guardia fail-closed de `consumeRecipeIngredients()` impide que una receta
 * demo (o con bandera `isDemoFixture` ausente/inválida) produzca cualquier efecto secundario
 * persistente sobre la despensa real o el ledger de consumo, y que el flujo legítimo de
 * recetas reales (`isDemoFixture === false`) permanece intacto.
 *
 * Se usan proveedores reales, un adaptador de despensa en memoria con contadores de llamadas
 * y el mock oficial de AsyncStorage, sin ocultar efectos de persistencia.
 */

import React from 'react';
import { render, renderHook, fireEvent, waitFor, act } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ClientRecipe } from '../src/types/recipe';
import { ClientMealPlan } from '../src/types/mealPlan';
import { Ingredient } from '../src/types/pantry';
import { BASE_DEMO_RECIPES } from '../src/fixtures/demoRecipes';
import {
  DEMO_RECIPE_CONSUMPTION_ERROR,
  INVALID_RECIPE_CONSUMPTION_ERROR,
  createEmptyPantryDeductionPlan,
  evaluateRecipeConsumptionEligibility,
} from '../src/utils/pantryConsumption';
import {
  getConsumedRecipeRecords,
  getConsumedRecipesStorageKey,
  isRecipeDeducted,
  recordDeductionIntent,
} from '../src/services/storage/recipeConsumptionStorage';
import {
  PantryStorageAdapter,
  createPantryStorage,
  getPantryStorageKey,
} from '../src/services/storage/pantryStorage';
import { PantryProvider, usePantry, ConsumeRecipeResult } from '../src/context/PantryContext';
import { MealPlanProvider, useMealPlan } from '../src/context/MealPlanContext';
import { RecipeProvider } from '../src/context/RecipeContext';
import { TypographyProvider } from '../src/theme';
import GuidedCookingScreen from '../app/recetas/[id]/cocinar';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: { id?: string; fromPlan?: string } = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => mockParams,
}));

const safeMetrics = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

// ------------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------------

type TrackedStorage = PantryStorageAdapter & {
  data: Ingredient[];
  calls: { get: number; save: number; update: number; adjust: number };
};

function createTrackedPantryStorage(initial: Ingredient[]): TrackedStorage {
  const store: TrackedStorage = {
    data: initial.map((i) => ({ ...i })),
    calls: { get: 0, save: 0, update: 0, adjust: 0 },
    async getIngredients() {
      store.calls.get++;
      return store.data.map((i) => ({ ...i }));
    },
    async saveIngredients(items: Ingredient[]) {
      store.calls.save++;
      store.data = items.map((i) => ({ ...i }));
    },
    async addIngredient(item: any) {
      store.data.push(item);
      return item;
    },
    async updateIngredient(item: any) {
      store.calls.update++;
      const idx = store.data.findIndex((i) => i.id === item.id);
      store.data[idx] = { ...store.data[idx], ...item };
      return store.data[idx];
    },
    async deleteIngredient(id: string) {
      store.data = store.data.filter((i) => i.id !== id);
    },
    async adjustQuantity(id: string, delta: number) {
      store.calls.adjust++;
      const idx = store.data.findIndex((i) => i.id === id);
      store.data[idx] = { ...store.data[idx], quantity: store.data[idx].quantity + delta };
      return store.data[idx];
    },
    async clearIngredients() {
      store.data = [];
    },
  };
  return store;
}

function pantryItem(id: string, name: string, quantity: number, unit: Ingredient['unit']): Ingredient {
  return {
    id,
    name,
    quantity,
    unit,
    category: 'Otros',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

/** Despensa que coincide con los ingredientes de la receta demo «Arroz con pollo y verduras». */
const matchingPantry: Ingredient[] = [
  pantryItem('p-pollo', 'Pollo', 1000, 'g'),
  pantryItem('p-cebolla', 'Cebolla', 5, 'unidad'),
  pantryItem('p-zanahoria', 'Zanahoria', 5, 'unidad'),
  pantryItem('p-arroz', 'Arroz', 1000, 'g'),
];

const demoRecipe: ClientRecipe = BASE_DEMO_RECIPES[0];

function makeRealRecipe(partial: Partial<ClientRecipe> = {}): ClientRecipe {
  return {
    id: 'arroz-con-pollo-real',
    instanceId: 'arroz-con-pollo-real::gen_1',
    generationId: 'gen_1',
    name: 'Arroz con pollo y verduras',
    description: 'Receta real generada',
    totalMinutes: 30,
    servings: 2,
    convenience: 90,
    estimatedMissingCost: 0,
    budgetRemaining: 20000,
    withinBudget: true,
    reason: 'Recomendada',
    isDemoFixture: false,
    steps: ['Cocinar todo'],
    ingredients: [
      { name: 'Pollo', quantity: 300, unit: 'g' },
      { name: 'Cebolla', quantity: 1, unit: 'unidad' },
    ],
    availableIngredients: [],
    missingIngredients: [],
    ...partial,
  };
}

function qty(list: Ingredient[], id: string): number | undefined {
  return list.find((i) => i.id === id)?.quantity;
}

async function renderPantryHook(storage: TrackedStorage, userId: string | null = 'user-1') {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <PantryProvider storageAdapter={storage} initialIngredients={storage.data} userId={userId}>
      {children}
    </PantryProvider>
  );
  return renderHook(() => usePantry(), { wrapper });
}

async function snapshotAsyncStorage(): Promise<Record<string, string | null>> {
  const keys = await AsyncStorage.getAllKeys();
  const entries = await AsyncStorage.multiGet(keys);
  return Object.fromEntries(entries);
}

function expectRejected(res: ConsumeRecipeResult, error: string) {
  expect(res.success).toBe(false);
  expect(res.alreadyDeducted).toBe(false);
  expect(res.deductedCount).toBe(0);
  expect(res.error).toBe(error);
  expect(res.plan).toEqual(createEmptyPantryDeductionPlan());
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  mockParams = {};
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ------------------------------------------------------------------
// Guardia pura
// ------------------------------------------------------------------

describe('Bloque 4 — evaluateRecipeConsumptionEligibility (fail-closed)', () => {
  it('solo acepta recetas válidas con isDemoFixture === false', () => {
    expect(evaluateRecipeConsumptionEligibility(makeRealRecipe())).toEqual({ eligible: true });
    expect(
      evaluateRecipeConsumptionEligibility(makeRealRecipe({ instanceId: undefined }))
    ).toEqual({ eligible: true });
  });

  it('rechaza fixtures demo con motivo demo_fixture', () => {
    const res = evaluateRecipeConsumptionEligibility(demoRecipe);
    expect(res).toEqual({ eligible: false, reason: 'demo_fixture', error: DEMO_RECIPE_CONSUMPTION_ERROR });
    BASE_DEMO_RECIPES.forEach((r) => {
      expect(evaluateRecipeConsumptionEligibility(r).eligible).toBe(false);
    });
  });

  it.each([
    ['ausente', undefined],
    ['null', null],
    ['string "false"', 'false'],
    ['string "true"', 'true'],
    ['número 0', 0],
    ['número 1', 1],
    ['objeto', {}],
  ])('rechaza bandera isDemoFixture %s como receta inválida', (_label, flag) => {
    const recipe: any = { ...makeRealRecipe(), isDemoFixture: flag };
    if (flag === undefined) delete recipe.isDemoFixture;
    expect(evaluateRecipeConsumptionEligibility(recipe)).toEqual({
      eligible: false,
      reason: 'invalid_recipe',
      error: INVALID_RECIPE_CONSUMPTION_ERROR,
    });
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['arreglo', []],
    ['string', 'demo-rec-1'],
    ['sin id', { ...makeRealRecipe(), id: undefined }],
    ['id vacío', { ...makeRealRecipe(), id: '   ' }],
    ['instanceId no textual', { ...makeRealRecipe(), instanceId: 42 }],
    ['instanceId solo espacios', { ...makeRealRecipe(), instanceId: '   ' }],
    ['ingredientes no arreglo', { ...makeRealRecipe(), ingredients: null }],
  ])('rechaza estructura inválida: %s', (_label, input) => {
    const res = evaluateRecipeConsumptionEligibility(input);
    expect(res.eligible).toBe(false);
  });

  it('no infiere legitimidad por id, nombre o ruta de apariencia real', () => {
    const disguised = { ...makeRealRecipe({ id: 'receta-real-backend', name: 'Receta Real' }), isDemoFixture: true };
    expect(evaluateRecipeConsumptionEligibility(disguised).eligible).toBe(false);
  });
});

// ------------------------------------------------------------------
// Protección demo en el límite real de mutación (PantryProvider)
// ------------------------------------------------------------------

describe('Bloque 4 — Protección de despensa ante recetas demo', () => {
  it('1/9. receta demo no descuenta ingredientes aunque la despensa tenga coincidencias', async () => {
    const storage = createTrackedPantryStorage(matchingPantry);
    const { result } = await renderPantryHook(storage);

    let res!: ConsumeRecipeResult;
    await act(async () => {
      res = await result.current.consumeRecipeIngredients(demoRecipe);
    });

    expectRejected(res, DEMO_RECIPE_CONSUMPTION_ERROR);
    expect(storage.data).toEqual(matchingPantry);
    expect(result.current.ingredients).toEqual(matchingPantry);
    // La guardia corta antes incluso de leer la despensa persistida
    expect(storage.calls).toEqual({ get: 0, save: 0, update: 0, adjust: 0 });
    expect(result.current.storageError).toBeNull();
  });

  it('2/3. receta demo no crea intención pendiente ni registro completado en el ledger', async () => {
    const storage = createTrackedPantryStorage(matchingPantry);
    const { result } = await renderPantryHook(storage);
    const setItemSpy = jest.spyOn(AsyncStorage, 'setItem');
    const getItemSpy = jest.spyOn(AsyncStorage, 'getItem');

    await act(async () => {
      await result.current.consumeRecipeIngredients(demoRecipe, { mealPlanDay: 1 });
    });

    // Solo se consideran claves de FoodAI (el cliente Supabase lee su propio token en segundo plano)
    const foodaiKeys = (spy: jest.SpyInstance) =>
      spy.mock.calls.map((c) => String(c[0])).filter((k) => k.startsWith('@foodai'));
    expect(foodaiKeys(setItemSpy)).toEqual([]);
    expect(foodaiKeys(getItemSpy)).toEqual([]);

    expect(await AsyncStorage.getItem(getConsumedRecipesStorageKey('user-1'))).toBeNull();
    expect(await getConsumedRecipeRecords('user-1')).toEqual({});
    expect(await isRecipeDeducted('demo-rec-1', 'user-1')).toBe(false);
  });

  it('2b. receta demo no dispara reconciliación sobre un registro pendiente preexistente con su clave', async () => {
    await recordDeductionIntent('demo-rec-1', 'user-1', {
      recipeName: demoRecipe.name,
      deductions: [
        {
          ingredientId: 'p-pollo',
          ingredientName: 'Pollo',
          deductedQuantity: 300,
          unit: 'g',
          stockBefore: 1000,
          stockAfter: 700,
        },
      ],
    });
    const ledgerBefore = await AsyncStorage.getItem(getConsumedRecipesStorageKey('user-1'));

    const storage = createTrackedPantryStorage(matchingPantry);
    const { result } = await renderPantryHook(storage);

    let res!: ConsumeRecipeResult;
    await act(async () => {
      res = await result.current.consumeRecipeIngredients(demoRecipe);
    });

    expectRejected(res, DEMO_RECIPE_CONSUMPTION_ERROR);
    expect(await AsyncStorage.getItem(getConsumedRecipesStorageKey('user-1'))).toBe(ledgerBefore);
    expect(storage.data).toEqual(matchingPantry);
    expect(storage.calls.save).toBe(0);
  });

  it('4. receta demo no modifica los datos de despensa persistidos en AsyncStorage', async () => {
    const userId = 'user-async';
    await createPantryStorage(userId).saveIngredients(matchingPantry);
    const before = await snapshotAsyncStorage();
    expect(before[getPantryStorageKey(userId)]).toBeTruthy();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PantryProvider userId={userId}>{children}</PantryProvider>
    );
    const { result } = await renderHook(() => usePantry(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(qty(result.current.ingredients, 'p-pollo')).toBe(1000);

    let res!: ConsumeRecipeResult;
    await act(async () => {
      res = await result.current.consumeRecipeIngredients(demoRecipe);
    });

    expectRejected(res, DEMO_RECIPE_CONSUMPTION_ERROR);
    expect(await snapshotAsyncStorage()).toEqual(before);
    expect(qty(result.current.ingredients, 'p-pollo')).toBe(1000);
  });

  it('6. el rechazo devuelve un mensaje en español y no se clasifica como ya descontada', async () => {
    const storage = createTrackedPantryStorage(matchingPantry);
    const { result } = await renderPantryHook(storage);

    let res!: ConsumeRecipeResult;
    await act(async () => {
      res = await result.current.consumeRecipeIngredients(demoRecipe);
    });

    expect(res.error).toMatch(/demostración/);
    expect(res.alreadyDeducted).toBe(false);
    expect(res.error).not.toBe('Esta receta ya fue descontada de tu despensa.');
  });

  it.each([
    ['ausente', undefined],
    ['null', null],
    ['string "false"', 'false'],
    ['número 0', 0],
  ])('7. bandera isDemoFixture %s falla cerrado sin efectos secundarios', async (_label, flag) => {
    const storage = createTrackedPantryStorage(matchingPantry);
    const { result } = await renderPantryHook(storage);
    const recipe: any = { ...makeRealRecipe(), isDemoFixture: flag };
    if (flag === undefined) delete recipe.isDemoFixture;

    let res!: ConsumeRecipeResult;
    await act(async () => {
      res = await result.current.consumeRecipeIngredients(recipe);
    });

    expectRejected(res, INVALID_RECIPE_CONSUMPTION_ERROR);
    expect(storage.data).toEqual(matchingPantry);
    expect(storage.calls.save).toBe(0);
    expect(await getConsumedRecipeRecords('user-1')).toEqual({});
  });

  it('7b. entradas estructuralmente inválidas no lanzan excepción ni modifican estado', async () => {
    const storage = createTrackedPantryStorage(matchingPantry);
    const { result } = await renderPantryHook(storage);

    for (const input of [null, undefined, [], { ...makeRealRecipe(), id: undefined }]) {
      let res!: ConsumeRecipeResult;
      await act(async () => {
        res = await result.current.consumeRecipeIngredients(input as any);
      });
      expectRejected(res, INVALID_RECIPE_CONSUMPTION_ERROR);
    }

    expect(storage.data).toEqual(matchingPantry);
    expect(storage.calls.get).toBe(0);
    expect(await getConsumedRecipeRecords('user-1')).toEqual({});
  });

  it('8. un intento rechazado no bloquea una receta real legítima posterior (incluso con la misma clave)', async () => {
    const storage = createTrackedPantryStorage(matchingPantry);
    const { result } = await renderPantryHook(storage);

    // Intento con bandera ausente sobre la misma identidad que luego se consumirá legítimamente
    const realRecipe = makeRealRecipe();
    const flagless: any = { ...realRecipe };
    delete flagless.isDemoFixture;

    await act(async () => {
      await result.current.consumeRecipeIngredients(demoRecipe);
      await result.current.consumeRecipeIngredients(flagless);
    });

    let res!: ConsumeRecipeResult;
    await act(async () => {
      res = await result.current.consumeRecipeIngredients(realRecipe);
    });

    expect(res.success).toBe(true);
    expect(res.alreadyDeducted).toBe(false);
    expect(res.deductedCount).toBe(2);
    expect(qty(storage.data, 'p-pollo')).toBe(700);
    expect(qty(storage.data, 'p-cebolla')).toBe(4);
    expect(await isRecipeDeducted('arroz-con-pollo-real::gen_1', 'user-1')).toBe(true);
    expect(Object.keys(await getConsumedRecipeRecords('user-1'))).toEqual(['arroz-con-pollo-real::gen_1']);
  });

  it('9b. demo y real concurrentes: solo la real descuenta, una única vez', async () => {
    const storage = createTrackedPantryStorage(matchingPantry);
    const { result } = await renderPantryHook(storage);

    let demoRes!: ConsumeRecipeResult;
    let realRes!: ConsumeRecipeResult;
    await act(async () => {
      [demoRes, realRes] = await Promise.all([
        result.current.consumeRecipeIngredients(demoRecipe),
        result.current.consumeRecipeIngredients(makeRealRecipe()),
      ]);
    });

    expectRejected(demoRes, DEMO_RECIPE_CONSUMPTION_ERROR);
    expect(realRes.success).toBe(true);
    expect(qty(storage.data, 'p-pollo')).toBe(700);
    expect(qty(storage.data, 'p-arroz')).toBe(1000);
    expect(qty(storage.data, 'p-zanahoria')).toBe(5);
  });
});

// ------------------------------------------------------------------
// Compatibilidad con recetas reales
// ------------------------------------------------------------------

describe('Bloque 4 — Compatibilidad de consumo de recetas reales', () => {
  it('10/11. receta real descuenta normalmente y no permite doble deducción', async () => {
    const storage = createTrackedPantryStorage(matchingPantry);
    const { result } = await renderPantryHook(storage);
    const recipe = makeRealRecipe();

    let first!: ConsumeRecipeResult;
    let second!: ConsumeRecipeResult;
    await act(async () => {
      first = await result.current.consumeRecipeIngredients(recipe, { mealPlanDay: 2 });
    });
    await act(async () => {
      second = await result.current.consumeRecipeIngredients(recipe);
    });

    expect(first.success).toBe(true);
    expect(first.deductedCount).toBe(2);
    expect(second.success).toBe(false);
    expect(second.alreadyDeducted).toBe(true);
    expect(qty(storage.data, 'p-pollo')).toBe(700);
    expect(qty(result.current.ingredients, 'p-pollo')).toBe(700);

    const records = await getConsumedRecipeRecords('user-1');
    expect(records['arroz-con-pollo-real::gen_1'].status).toBe('completed');
    expect(records['arroz-con-pollo-real::gen_1'].mealPlanDay).toBe(2);
  });

  it('12. dos preparaciones con distinta identidad de instancia se consumen de forma independiente', async () => {
    const storage = createTrackedPantryStorage(matchingPantry);
    const { result } = await renderPantryHook(storage);

    let a!: ConsumeRecipeResult;
    let b!: ConsumeRecipeResult;
    await act(async () => {
      a = await result.current.consumeRecipeIngredients(makeRealRecipe());
    });
    await act(async () => {
      b = await result.current.consumeRecipeIngredients(
        makeRealRecipe({ instanceId: 'arroz-con-pollo-real::gen_2', generationId: 'gen_2' })
      );
    });

    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
    expect(qty(storage.data, 'p-pollo')).toBe(400);
  });

  it('13. consumo real concurrente de la misma preparación se serializa sin doble descuento', async () => {
    const storage = createTrackedPantryStorage(matchingPantry);
    const { result } = await renderPantryHook(storage);
    const recipe = makeRealRecipe();

    let results!: ConsumeRecipeResult[];
    await act(async () => {
      results = await Promise.all([
        result.current.consumeRecipeIngredients(recipe),
        result.current.consumeRecipeIngredients(recipe),
      ]);
    });

    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(qty(storage.data, 'p-pollo')).toBe(700);
  });

  it('13b. consumo real concurrente de recetas distintas se serializa sobre el mismo ítem', async () => {
    const storage = createTrackedPantryStorage(matchingPantry);
    const { result } = await renderPantryHook(storage);

    let results!: ConsumeRecipeResult[];
    await act(async () => {
      results = await Promise.all([
        result.current.consumeRecipeIngredients(makeRealRecipe()),
        result.current.consumeRecipeIngredients(
          makeRealRecipe({ id: 'pollo-sudado', instanceId: 'pollo-sudado::gen_1', name: 'Pollo sudado' })
        ),
      ]);
    });

    expect(results.every((r) => r.success)).toBe(true);
    expect(qty(storage.data, 'p-pollo')).toBe(400);
    expect(qty(storage.data, 'p-cebolla')).toBe(3);
  });

  it('16. el ledger permanece aislado por usuario', async () => {
    const storage = createTrackedPantryStorage(matchingPantry);
    const { result } = await renderPantryHook(storage, 'user-a');

    await act(async () => {
      await result.current.consumeRecipeIngredients(makeRealRecipe());
    });

    expect(await isRecipeDeducted('arroz-con-pollo-real::gen_1', 'user-a')).toBe(true);
    expect(await isRecipeDeducted('arroz-con-pollo-real::gen_1', 'user-b')).toBe(false);
  });

  it('17. ledger corrupto mantiene el comportamiento fail-closed para recetas reales', async () => {
    await AsyncStorage.setItem(getConsumedRecipesStorageKey('user-1'), '{corrupto');
    const storage = createTrackedPantryStorage(matchingPantry);
    const { result } = await renderPantryHook(storage);

    let res!: ConsumeRecipeResult;
    await act(async () => {
      res = await result.current.consumeRecipeIngredients(makeRealRecipe());
    });

    expect(res.success).toBe(false);
    expect(storage.calls.save).toBe(0);
    expect(storage.data).toEqual(matchingPantry);
    expect(await AsyncStorage.getItem(getConsumedRecipesStorageKey('user-1'))).toBe('{corrupto');
  });
});

// ------------------------------------------------------------------
// Flujo de cocina (pantalla real)
// ------------------------------------------------------------------

describe('Bloque 4 — Modo Cocina con recetas demo y reales desde el plan', () => {
  function buildPlan(recipe: ClientRecipe): ClientMealPlan {
    return {
      days: [{ day: 1, isCompleted: false, completedAt: null, recipe }],
      totalEstimatedMissingCost: 0,
      budgetRemaining: 40000,
      withinBudget: true,
      uniqueMissingIngredients: [],
      completedDaysCount: 0,
    };
  }

  let probe: { plan: ClientMealPlan | null; ingredients: Ingredient[] } = { plan: null, ingredients: [] };
  function Probe() {
    const mealPlan = useMealPlan();
    const pantry = usePantry();
    probe = { plan: mealPlan.plan, ingredients: pantry.ingredients };
    return null;
  }

  async function renderCookingFromPlan(recipe: ClientRecipe) {
    mockParams = { id: recipe.id, fromPlan: 'true' };
    // La deducción lee la despensa fresca del almacenamiento persistido real del usuario
    await createPantryStorage('cook-user').saveIngredients(matchingPantry);
    const rendered = await render(
      <SafeAreaProvider initialMetrics={safeMetrics}>
        <TypographyProvider usingFallback={true}>
          <RecipeProvider initialRecipes={[]} initialIsDemoMode={false}>
            <PantryProvider initialIngredients={matchingPantry} userId="cook-user">
              <MealPlanProvider initialPlan={buildPlan(recipe)} userId="cook-user">
                <GuidedCookingScreen />
                <Probe />
              </MealPlanProvider>
            </PantryProvider>
          </RecipeProvider>
        </TypographyProvider>
      </SafeAreaProvider>
    );

    const nextBtn = rendered.getByTestId('cooking-next-step-button');
    for (let i = 0; i < recipe.steps.length; i++) {
      await act(async () => {
        fireEvent.press(nextBtn);
      });
    }
    expect(rendered.getByTestId('cooking-finish-modal')).toBeTruthy();
    return rendered;
  }

  it('5. receta demo: confirmación deshabilitada con explicación; no marca consumida ni completa el día', async () => {
    const demoForPlan: ClientRecipe = { ...demoRecipe, steps: ['Paso único'] };
    const rendered = await renderCookingFromPlan(demoForPlan);
    const storedPantryBefore = await AsyncStorage.getItem(getPantryStorageKey('cook-user'));

    expect(rendered.getByTestId('cooking-demo-deduction-notice')).toBeTruthy();
    // No se muestra una vista previa engañosa de descuentos para la receta demo
    expect(rendered.queryByTestId('cooking-deductible-list')).toBeNull();
    const confirmBtn = rendered.getByTestId('cooking-confirm-deduction-button');
    expect(confirmBtn.props.accessibilityState?.disabled).toBe(true);

    await act(async () => {
      fireEvent.press(confirmBtn);
    });

    expect(rendered.queryByTestId('cooking-deduction-success')).toBeNull();
    expect(rendered.queryByText(/¡Descuento exitoso!/)).toBeNull();
    expect(rendered.queryByTestId('cooking-already-deducted-badge')).toBeNull();

    expect(probe.plan?.days[0].isCompleted).toBe(false);
    expect(probe.ingredients).toEqual(matchingPantry);
    expect(await getConsumedRecipeRecords('cook-user')).toEqual({});
    expect(await AsyncStorage.getItem(getPantryStorageKey('cook-user'))).toBe(storedPantryBefore);
  });

  it('5b. receta con bandera inválida: el rechazo se muestra como error, nunca como éxito', async () => {
    const flagless: any = { ...makeRealRecipe({ id: 'plan-sin-bandera', instanceId: 'plan-sin-bandera::p1' }) };
    delete flagless.isDemoFixture;
    const rendered = await renderCookingFromPlan(flagless);
    const storedPantryBefore = await AsyncStorage.getItem(getPantryStorageKey('cook-user'));

    // No es demo explícita: la UI no puede saberlo, la guardia de PantryContext decide
    expect(rendered.queryByTestId('cooking-demo-deduction-notice')).toBeNull();

    await act(async () => {
      fireEvent.press(rendered.getByTestId('cooking-confirm-deduction-button'));
    });

    await waitFor(() => {
      expect(rendered.getByTestId('cooking-deduction-error')).toBeTruthy();
    });
    const errorBadge = rendered.getByTestId('cooking-deduction-error');
    expect(errorBadge.props.accessibilityRole).toBe('alert');
    expect(rendered.getByText(INVALID_RECIPE_CONSUMPTION_ERROR)).toBeTruthy();
    expect(rendered.getByTestId('icon-error-outline')).toBeTruthy();
    expect(rendered.queryByTestId('cooking-deduction-success')).toBeNull();
    expect(rendered.queryByTestId('icon-task-alt')).toBeNull();
    expect(rendered.queryByTestId('cooking-already-deducted-badge')).toBeNull();

    expect(probe.plan?.days[0].isCompleted).toBe(false);
    expect(probe.ingredients).toEqual(matchingPantry);
    expect(await getConsumedRecipeRecords('cook-user')).toEqual({});
    expect(await AsyncStorage.getItem(getPantryStorageKey('cook-user'))).toBe(storedPantryBefore);
  });

  it('control: receta real desde el plan descuenta, muestra éxito y completa el día normalmente', async () => {
    const real = makeRealRecipe({ id: 'plan-real-1', instanceId: 'plan-real-1::plan_1' });
    const rendered = await renderCookingFromPlan(real);

    expect(rendered.queryByTestId('cooking-demo-deduction-notice')).toBeNull();
    await act(async () => {
      fireEvent.press(rendered.getByTestId('cooking-confirm-deduction-button'));
    });

    await waitFor(() => {
      expect(rendered.getByText(/¡Descuento exitoso! Se descontaron 2 ingredientes\./)).toBeTruthy();
    });
    expect(rendered.getByTestId('cooking-deduction-success')).toBeTruthy();
    expect(rendered.getByTestId('icon-task-alt')).toBeTruthy();
    expect(rendered.queryByTestId('cooking-deduction-error')).toBeNull();
    await waitFor(() => expect(probe.plan?.days[0].isCompleted).toBe(true));
    expect(qty(probe.ingredients, 'p-pollo')).toBe(700);
    expect(rendered.getByTestId('cooking-already-deducted-badge')).toBeTruthy();
    expect(await isRecipeDeducted('plan-real-1::plan_1', 'cook-user')).toBe(true);
  });
});

// ------------------------------------------------------------------
// Consulta de estado (checkIfRecipeDeducted) sin efectos secundarios para demo
// ------------------------------------------------------------------

describe('Bloque 4B — checkIfRecipeDeducted no reconcilia recetas demo', () => {
  const pendingDeduction = {
    ingredientId: 'p-pollo',
    ingredientName: 'Pollo',
    deductedQuantity: 300,
    unit: 'g',
    stockBefore: 1000,
    stockAfter: 700,
  };

  it('receta demo explícita: devuelve false sin leer ni escribir y conserva el pendiente heredado', async () => {
    // Pantry coincide con stockBefore: sin la guardia, la reconciliación descartaría la intención
    await recordDeductionIntent('demo-rec-1', 'user-1', {
      recipeName: demoRecipe.name,
      deductions: [pendingDeduction],
    });
    const ledgerBefore = await AsyncStorage.getItem(getConsumedRecipesStorageKey('user-1'));

    const storage = createTrackedPantryStorage(matchingPantry);
    const { result } = await renderPantryHook(storage);
    const setItemSpy = jest.spyOn(AsyncStorage, 'setItem');
    const getItemSpy = jest.spyOn(AsyncStorage, 'getItem');
    const foodaiKeys = (spy: jest.SpyInstance) =>
      spy.mock.calls.map((c) => String(c[0])).filter((k) => k.startsWith('@foodai'));
    // El mock de AsyncStorage ya es jest.fn: limpiar las llamadas de la preparación del escenario
    setItemSpy.mockClear();
    getItemSpy.mockClear();

    let deducted!: boolean;
    await act(async () => {
      deducted = await result.current.checkIfRecipeDeducted(demoRecipe);
    });

    expect(deducted).toBe(false);
    expect(foodaiKeys(setItemSpy)).toEqual([]);
    expect(foodaiKeys(getItemSpy)).toEqual([]);
    expect(storage.calls.get).toBe(0);
    expect(await AsyncStorage.getItem(getConsumedRecipesStorageKey('user-1'))).toBe(ledgerBefore);
    expect((await getConsumedRecipeRecords('user-1'))['demo-rec-1'].status).toBe('pending');
  });

  it('receta real con pendiente ya persistido en despensa: se recupera y confirma (completed)', async () => {
    const key = 'arroz-con-pollo-real::gen_1';
    await recordDeductionIntent(key, 'user-1', { deductions: [pendingDeduction] });
    const pantryAfter = matchingPantry.map((i) => (i.id === 'p-pollo' ? { ...i, quantity: 700 } : i));
    const storage = createTrackedPantryStorage(pantryAfter);
    const { result } = await renderPantryHook(storage);

    let deducted!: boolean;
    await act(async () => {
      deducted = await result.current.checkIfRecipeDeducted(makeRealRecipe());
    });

    expect(deducted).toBe(true);
    expect((await getConsumedRecipeRecords('user-1'))[key].status).toBe('completed');
    expect(qty(storage.data, 'p-pollo')).toBe(700);
  });

  it('receta real con pendiente no aplicado: se descarta la intención y permite consumo único posterior', async () => {
    const key = 'arroz-con-pollo-real::gen_1';
    await recordDeductionIntent(key, 'user-1', { deductions: [pendingDeduction] });
    const storage = createTrackedPantryStorage(matchingPantry);
    const { result } = await renderPantryHook(storage);

    let deducted!: boolean;
    await act(async () => {
      deducted = await result.current.checkIfRecipeDeducted(makeRealRecipe());
    });
    expect(deducted).toBe(false);
    expect((await getConsumedRecipeRecords('user-1'))[key]).toBeUndefined();

    let res!: ConsumeRecipeResult;
    await act(async () => {
      res = await result.current.consumeRecipeIngredients(makeRealRecipe());
    });
    expect(res.success).toBe(true);
    expect(qty(storage.data, 'p-pollo')).toBe(700);
  });

  it('receta real con despensa ambigua: marca revisión manual y bloquea', async () => {
    const key = 'arroz-con-pollo-real::gen_1';
    await recordDeductionIntent(key, 'user-1', { deductions: [pendingDeduction] });
    const ambiguous = matchingPantry.map((i) => (i.id === 'p-pollo' ? { ...i, quantity: 850 } : i));
    const storage = createTrackedPantryStorage(ambiguous);
    const { result } = await renderPantryHook(storage);

    let deducted!: boolean;
    await act(async () => {
      deducted = await result.current.checkIfRecipeDeducted(makeRealRecipe());
    });
    expect(deducted).toBe(true);
    expect((await getConsumedRecipeRecords('user-1'))[key].status).toBe('requires_review');
  });

  it('compatibilidad: claves textuales y objetos sin bandera conservan la reconciliación existente', async () => {
    const key = 'arroz-con-pollo-real::gen_1';
    await recordDeductionIntent(key, 'user-1', { deductions: [pendingDeduction] });
    const pantryAfter = matchingPantry.map((i) => (i.id === 'p-pollo' ? { ...i, quantity: 700 } : i));
    const storage = createTrackedPantryStorage(pantryAfter);
    const { result } = await renderPantryHook(storage);

    let byString!: boolean;
    let byObject!: boolean;
    await act(async () => {
      byString = await result.current.checkIfRecipeDeducted(key);
      byObject = await result.current.checkIfRecipeDeducted({ id: 'arroz-con-pollo-real', instanceId: key });
    });
    expect(byString).toBe(true);
    expect(byObject).toBe(true);
    expect((await getConsumedRecipeRecords('user-1'))[key].status).toBe('completed');
  });

  it('ledger corrupto: recetas reales mantienen fail-closed (true) sin sobrescribir el ledger', async () => {
    await AsyncStorage.setItem(getConsumedRecipesStorageKey('user-1'), '{corrupto');
    const storage = createTrackedPantryStorage(matchingPantry);
    const { result } = await renderPantryHook(storage);

    let deducted!: boolean;
    await act(async () => {
      deducted = await result.current.checkIfRecipeDeducted(makeRealRecipe());
    });
    expect(deducted).toBe(true);
    expect(await AsyncStorage.getItem(getConsumedRecipesStorageKey('user-1'))).toBe('{corrupto');
  });
});
