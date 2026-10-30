/**
 * FoodAI - Fase 6A: Auditoría de Seguridad Pre-Commit del Sistema de Consumo y Reconciliación
 *
 * Cubre exhaustivamente los 8 escenarios críticos requeridos:
 * 1. Preparación previamente completada no puede ser deducida dos veces.
 * 2. Preparación legítimamente nueva de la misma receta puede ser deducida independientemente.
 * 3. Dos recetas diferentes consumiendo el mismo ítem de despensa concurrentemente.
 * 4. Caída (crash) tras registrar la intención pendiente pero antes de persistir la despensa.
 * 5. Caída (crash) tras persistir la despensa pero antes de confirmar en el ledger.
 * 6. Reintento después de más de 60 segundos (nunca expira silenciosamente si la despensa cambió).
 * 7. Reinicio de aplicación y recuperación segura de una deducción pendiente.
 * 8. Fallo en el rollback: la receta se marca para revisión manual y bloquea doble deducción.
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  ClientRecipe,
  normalizeBackendRecipe,
  getRecipeDeductionKey,
} from '../src/types/recipe';
import {
  normalizeBackendMealPlan,
  BackendMealPlanResponseData,
} from '../src/types/mealPlan';
import {
  isRecipeDeducted,
  recordDeductionIntent,
  confirmDeduction,
  removeDeductionIntent,
  reconcileDeductionIntent,
  getConsumedRecipeRecords,
  ConsumedIngredientDeduction,
  RecipeConsumptionLedgerError,
  isValidConsumedRecipeRecord,
  isValidConsumedIngredientDeduction,
  isKeyConsistentWithRecipeId,
} from '../src/services/storage/recipeConsumptionStorage';
import {
  PantryProvider,
  usePantry,
  rollbackPantryDeductions,
  RollbackInconsistencyError,
} from '../src/context/PantryContext';
import { PantryStorageAdapter } from '../src/services/storage/pantryStorage';
import { Ingredient } from '../src/types/pantry';

function createMockPantryStorage(initial: Ingredient[] = []): PantryStorageAdapter & {
  data: Ingredient[];
  failOnSave: boolean;
  failOnSecondSave: boolean;
  saveCount: number;
} {
  const store = {
    data: initial.map((item) => ({ ...item })),
    failOnSave: false,
    failOnSecondSave: false,
    saveCount: 0,
    async getIngredients(): Promise<Ingredient[]> {
      return store.data.map((item) => ({ ...item }));
    },
    async saveIngredients(items: Ingredient[]): Promise<void> {
      store.saveCount++;
      if (store.failOnSave) {
        throw new Error('Disk write error in PantryStorage');
      }
      if (store.failOnSecondSave && store.saveCount >= 2) {
        throw new Error('Disk write error during rollback in PantryStorage');
      }
      store.data = items.map((item) => ({ ...item }));
    },
    async addIngredient(item: any): Promise<Ingredient> {
      store.data.push(item);
      return item;
    },
    async updateIngredient(item: any): Promise<Ingredient> {
      const idx = store.data.findIndex((i) => i.id === item.id);
      if (idx !== -1) {
        store.data[idx] = { ...store.data[idx], ...item };
        return store.data[idx];
      }
      return item;
    },
    async deleteIngredient(id: string): Promise<void> {
      store.data = store.data.filter((i) => i.id !== id);
    },
    async adjustQuantity(id: string, delta: number): Promise<Ingredient> {
      const idx = store.data.findIndex((i) => i.id === id);
      if (idx === -1) throw new Error('Not found');
      const item = store.data[idx];
      const newQty = Math.round((item.quantity + delta) * 100) / 100;
      store.data[idx] = { ...item, quantity: newQty };
      return store.data[idx];
    },
    async clearIngredients(): Promise<void> {
      store.data = [];
    },
  };
  return store;
}

const samplePantryIngredients: Ingredient[] = [
  {
    id: 'p-1',
    name: 'Arroz blanco',
    quantity: 1000,
    unit: 'g',
    category: 'Granos y cereales',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'p-2',
    name: 'Pechuga de pollo',
    quantity: 1000,
    unit: 'g',
    category: 'Carnes y proteínas',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

describe('FoodAI Fase 6A — Auditoría de Consistencia y Reconciliación Segura', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('1. Preparación previamente completada no puede ser deducida dos veces', async () => {
    const storage = createMockPantryStorage(samplePantryIngredients);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PantryProvider
        storageAdapter={storage}
        initialIngredients={samplePantryIngredients}
        userId="user-1"
      >
        {children}
      </PantryProvider>
    );

    const { result } = await renderHook(() => usePantry(), { wrapper });

    const recipe: ClientRecipe = {
      id: 'arroz-con-pollo',
      instanceId: 'arroz-con-pollo::gen_1',
      generationId: 'gen_1',
      name: 'Arroz con Pollo',
      description: 'Clásico colombiano',
      totalMinutes: 40,
      servings: 2,
      convenience: 90,
      estimatedMissingCost: 0,
      budgetRemaining: 20000,
      withinBudget: true,
      reason: 'Recomendado',
      isDemoFixture: false,
      steps: ['Cocinar arroz y pollo'],
      ingredients: [
        { name: 'Arroz blanco', quantity: 300, unit: 'g' },
        { name: 'Pechuga de pollo', quantity: 200, unit: 'g' },
      ],
      availableIngredients: [],
      missingIngredients: [],
    };

    // Primera confirmación
    let firstRes: any;
    await act(async () => {
      firstRes = await result.current.consumeRecipeIngredients(recipe);
    });
    expect(firstRes.success).toBe(true);
    expect(firstRes.alreadyDeducted).toBe(false);
    expect(firstRes.deductedCount).toBe(2);
    expect(result.current.ingredients.find((i) => i.id === 'p-1')?.quantity).toBe(700);

    // Segunda confirmación repetida
    let secondRes: any;
    await act(async () => {
      secondRes = await result.current.consumeRecipeIngredients(recipe);
    });
    expect(secondRes.success).toBe(false);
    expect(secondRes.alreadyDeducted).toBe(true);
    expect(secondRes.deductedCount).toBe(0);

    // Inventario permanece exactamente en 700g (sin doble deducción)
    expect(result.current.ingredients.find((i) => i.id === 'p-1')?.quantity).toBe(700);
  });

  it('2. Preparación legítimamente nueva de la misma receta puede ser deducida independientemente', async () => {
    const storage = createMockPantryStorage(samplePantryIngredients);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PantryProvider
        storageAdapter={storage}
        initialIngredients={samplePantryIngredients}
        userId="user-1"
      >
        {children}
      </PantryProvider>
    );

    const { result } = await renderHook(() => usePantry(), { wrapper });

    const rawBackendRecipe = {
      name: 'Arroz con Pollo',
      description: 'Clásico colombiano',
      totalMinutes: 40,
      budgetRemaining: 20000,
      withinBudget: true,
      convenience: 90,
      reason: 'Recomendado',
      estimatedMissingCost: 0,
      steps: ['Cocinar'],
      ingredients: [{ name: 'Arroz blanco', quantity: 300, unit: 'g' }],
      availableIngredients: [],
      missingIngredients: [],
    };

    // Generación 1
    const recipeGen1 = normalizeBackendRecipe(rawBackendRecipe, 0, 2, 'gen_lunes');
    expect(recipeGen1.instanceId).toBe('arroz-con-pollo-1::gen_lunes');
    let res1: any;
    await act(async () => {
      res1 = await result.current.consumeRecipeIngredients(recipeGen1);
    });
    expect(res1.success).toBe(true);
    expect(result.current.ingredients.find((i) => i.id === 'p-1')?.quantity).toBe(700);

    // Generación 2 (semana siguiente, nueva recomendación)
    const recipeGen2 = normalizeBackendRecipe(rawBackendRecipe, 0, 2, 'gen_viernes');
    expect(recipeGen2.instanceId).toBe('arroz-con-pollo-1::gen_viernes');
    expect(await result.current.checkIfRecipeDeducted(recipeGen2)).toBe(false);

    // Debe permitirse la nueva deducción legítima
    let res2: any;
    await act(async () => {
      res2 = await result.current.consumeRecipeIngredients(recipeGen2);
    });
    expect(res2.success).toBe(true);
    expect(res2.alreadyDeducted).toBe(false);
    expect(result.current.ingredients.find((i) => i.id === 'p-1')?.quantity).toBe(400);
  });

  it('3. Dos recetas diferentes consumiendo el mismo ítem de despensa concurrentemente', async () => {
    const storage = createMockPantryStorage(samplePantryIngredients);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PantryProvider
        storageAdapter={storage}
        initialIngredients={samplePantryIngredients}
        userId="user-concurrent"
      >
        {children}
      </PantryProvider>
    );

    const { result } = await renderHook(() => usePantry(), { wrapper });

    const recipeA: ClientRecipe = {
      id: 'receta-arroz-con-verduras',
      instanceId: 'receta-arroz-con-verduras::gen_a',
      name: 'Arroz con Verduras',
      description: '',
      totalMinutes: 20,
      servings: 2,
      convenience: 85,
      estimatedMissingCost: 0,
      budgetRemaining: 10000,
      withinBudget: true,
      reason: '',
      isDemoFixture: false,
      steps: ['Cocinar'],
      ingredients: [{ name: 'Arroz blanco', quantity: 200, unit: 'g' }],
      availableIngredients: [],
      missingIngredients: [],
    };

    const recipeB: ClientRecipe = {
      id: 'receta-sopa-de-arroz',
      instanceId: 'receta-sopa-de-arroz::gen_b',
      name: 'Sopa de Arroz',
      description: '',
      totalMinutes: 25,
      servings: 2,
      convenience: 85,
      estimatedMissingCost: 0,
      budgetRemaining: 10000,
      withinBudget: true,
      reason: '',
      isDemoFixture: false,
      steps: ['Cocinar'],
      ingredients: [{ name: 'Arroz blanco', quantity: 300, unit: 'g' }],
      availableIngredients: [],
      missingIngredients: [],
    };

    // Disparar ambas deducciones casi en el mismo instante
    let resA: any;
    let resB: any;
    await act(async () => {
      [resA, resB] = await Promise.all([
        result.current.consumeRecipeIngredients(recipeA),
        result.current.consumeRecipeIngredients(recipeB),
      ]);
    });

    expect(resA.success).toBe(true);
    expect(resB.success).toBe(true);

    // Ambas recetas deben descontar de manera atómica/serializada:
    // 1000g iniciales - 200g (receta A) - 300g (receta B) = exactamente 500g
    const arrozFinal = storage.data.find((i) => i.id === 'p-1');
    expect(arrozFinal?.quantity).toBe(500);
  });

  it('4. Caída tras registrar la intención pendiente pero antes de persistir la despensa', async () => {
    const userId = 'user-crash-before-pantry';
    const key = 'arroz-pollo::gen_crash_1';

    // Simular que el ledger guardó una intención pending: stockBefore: 1000, stockAfter: 700
    const deductions: ConsumedIngredientDeduction[] = [
      {
        ingredientId: 'p-1',
        ingredientName: 'Arroz blanco',
        deductedQuantity: 300,
        unit: 'g',
        stockBefore: 1000,
        stockAfter: 700,
      },
    ];

    await recordDeductionIntent(key, userId, {
      recipeName: 'Arroz con Pollo',
      instanceId: key,
      deductions,
    });

    // La despensa física nunca se modificó (sigue en 1000g)
    const storage = createMockPantryStorage(samplePantryIngredients);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PantryProvider
        storageAdapter={storage}
        initialIngredients={samplePantryIngredients}
        userId={userId}
      >
        {children}
      </PantryProvider>
    );

    const { result } = await renderHook(() => usePantry(), { wrapper });

    const recipe: ClientRecipe = {
      id: 'arroz-pollo',
      instanceId: key,
      name: 'Arroz con Pollo',
      description: '',
      totalMinutes: 30,
      servings: 2,
      convenience: 80,
      estimatedMissingCost: 0,
      budgetRemaining: 10000,
      withinBudget: true,
      reason: '',
      isDemoFixture: false,
      steps: ['Cocinar'],
      ingredients: [{ name: 'Arroz blanco', quantity: 300, unit: 'g' }],
      availableIngredients: [],
      missingIngredients: [],
    };

    // Reconciliación: como la despensa aún tiene stockBefore (1000g), la intención incompleta se descarta
    // y el reintento procede a deducir legítimamente por primera y única vez
    let retryRes: any;
    await act(async () => {
      retryRes = await result.current.consumeRecipeIngredients(recipe);
    });
    expect(retryRes.success).toBe(true);
    expect(retryRes.alreadyDeducted).toBe(false);

    // La despensa ahora tiene 1000 - 300 = 700g
    expect(storage.data.find((i) => i.id === 'p-1')?.quantity).toBe(700);

    // Y el registro quedó formalmente confirmado como 'completed'
    const records = await getConsumedRecipeRecords(userId);
    expect(records[key]?.status).toBe('completed');
  });

  it('5. Caída tras persistir la despensa pero antes de confirmar en el ledger', async () => {
    const userId = 'user-crash-after-pantry';
    const key = 'arroz-pollo::gen_crash_2';

    // Simular que el ledger quedó en 'pending'
    const deductions: ConsumedIngredientDeduction[] = [
      {
        ingredientId: 'p-1',
        ingredientName: 'Arroz blanco',
        deductedQuantity: 300,
        unit: 'g',
        stockBefore: 1000,
        stockAfter: 700,
      },
    ];

    await recordDeductionIntent(key, userId, {
      recipeName: 'Arroz con Pollo',
      instanceId: key,
      deductions,
    });

    // Pero la despensa ya había sido persistida en disco antes del crash (quedó en 700g)
    const crashedPantry: Ingredient[] = [
      { ...samplePantryIngredients[0], quantity: 700 },
      { ...samplePantryIngredients[1] },
    ];
    const storage = createMockPantryStorage(crashedPantry);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PantryProvider
        storageAdapter={storage}
        initialIngredients={crashedPantry}
        userId={userId}
      >
        {children}
      </PantryProvider>
    );

    const { result } = await renderHook(() => usePantry(), { wrapper });

    const recipe: ClientRecipe = {
      id: 'arroz-pollo',
      instanceId: key,
      name: 'Arroz con Pollo',
      description: '',
      totalMinutes: 30,
      servings: 2,
      convenience: 80,
      estimatedMissingCost: 0,
      budgetRemaining: 10000,
      withinBudget: true,
      reason: '',
      isDemoFixture: false,
      steps: ['Cocinar'],
      ingredients: [{ name: 'Arroz blanco', quantity: 300, unit: 'g' }],
      availableIngredients: [],
      missingIngredients: [],
    };

    // Reconciliación: la despensa tiene stockAfter (700g). El reintento detecta que ya se descontó,
    // auto-confirma el ledger y bloquea una segunda deducción
    let retryRes: any;
    await act(async () => {
      retryRes = await result.current.consumeRecipeIngredients(recipe);
    });
    expect(retryRes.alreadyDeducted).toBe(true);

    // La despensa NUNCA sufre una segunda deducción (sigue en 700g, no cae a 400g)
    expect(storage.data.find((i) => i.id === 'p-1')?.quantity).toBe(700);

    // El ledger ahora está formalmente 'completed'
    const records = await getConsumedRecipeRecords(userId);
    expect(records[key]?.status).toBe('completed');
  });

  it('6. Reintento después de más de 60 segundos nunca descuenta dos veces si la despensa ya cambió', async () => {
    const userId = 'user-timeout-safety';
    const key = 'arroz-pollo::gen_stale';

    // Intención pendiente registrada hace 10 minutos (600 segundos)
    const tenMinutesAgo = new Date(Date.now() - 600_000).toISOString();
    const deductions: ConsumedIngredientDeduction[] = [
      {
        ingredientId: 'p-1',
        ingredientName: 'Arroz blanco',
        deductedQuantity: 300,
        unit: 'g',
        stockBefore: 1000,
        stockAfter: 700,
      },
    ];

    const records = {
      [key]: {
        recipeId: key,
        consumedAt: tenMinutesAgo,
        status: 'pending' as const,
        instanceId: key,
        deductions,
      },
    };
    await AsyncStorage.setItem(
      `@foodai:${userId}:consumed_recipes_v1`,
      JSON.stringify({ version: 1, updatedAt: tenMinutesAgo, records })
    );

    // La despensa tiene 700g (la deducción física ocurrió)
    const pantryAt700: Ingredient[] = [
      { ...samplePantryIngredients[0], quantity: 700 },
      { ...samplePantryIngredients[1] },
    ];
    const storage = createMockPantryStorage(pantryAt700);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PantryProvider
        storageAdapter={storage}
        initialIngredients={pantryAt700}
        userId={userId}
      >
        {children}
      </PantryProvider>
    );

    const { result } = await renderHook(() => usePantry(), { wrapper });

    const recipe: ClientRecipe = {
      id: 'arroz-pollo',
      instanceId: key,
      name: 'Arroz con Pollo',
      description: '',
      totalMinutes: 30,
      servings: 2,
      convenience: 80,
      estimatedMissingCost: 0,
      budgetRemaining: 10000,
      withinBudget: true,
      reason: '',
      isDemoFixture: false,
      steps: ['Cocinar'],
      ingredients: [{ name: 'Arroz blanco', quantity: 300, unit: 'g' }],
      availableIngredients: [],
      missingIngredients: [],
    };

    // isRecipeDeducted no debe regresar false solo por pasar 60s
    expect(await isRecipeDeducted(key, userId)).toBe(true);

    // Al llamar a consumeRecipeIngredients, la reconciliación confirma la deducción previa y bloquea el reintento
    let retryRes: any;
    await act(async () => {
      retryRes = await result.current.consumeRecipeIngredients(recipe);
    });
    expect(retryRes.alreadyDeducted).toBe(true);
    expect(storage.data.find((i) => i.id === 'p-1')?.quantity).toBe(700);
  });

  it('7. Reinicio de aplicación y recuperación de una deducción pendiente ambigua', async () => {
    const userId = 'user-ambiguous-restart';
    const key = 'arroz-pollo::gen_ambiguous';

    // Despensa tiene 850g (ni 1000g antes, ni 700g después; por ejemplo el usuario editó manualmente)
    const ambiguousPantry: Ingredient[] = [
      { ...samplePantryIngredients[0], quantity: 850 },
      { ...samplePantryIngredients[1] },
    ];

    const deductions: ConsumedIngredientDeduction[] = [
      {
        ingredientId: 'p-1',
        ingredientName: 'Arroz blanco',
        deductedQuantity: 300,
        unit: 'g',
        stockBefore: 1000,
        stockAfter: 700,
      },
    ];

    await recordDeductionIntent(key, userId, {
      recipeName: 'Arroz con Pollo',
      instanceId: key,
      deductions,
    });

    const storage = createMockPantryStorage(ambiguousPantry);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PantryProvider
        storageAdapter={storage}
        initialIngredients={ambiguousPantry}
        userId={userId}
      >
        {children}
      </PantryProvider>
    );

    const { result } = await renderHook(() => usePantry(), { wrapper });

    const recipe: ClientRecipe = {
      id: 'arroz-pollo',
      instanceId: key,
      name: 'Arroz con Pollo',
      description: '',
      totalMinutes: 30,
      servings: 2,
      convenience: 80,
      estimatedMissingCost: 0,
      budgetRemaining: 10000,
      withinBudget: true,
      reason: '',
      isDemoFixture: false,
      steps: ['Cocinar'],
      ingredients: [{ name: 'Arroz blanco', quantity: 300, unit: 'g' }],
      availableIngredients: [],
      missingIngredients: [],
    };

    // La reconciliación marca el estado como requires_review y bloquea deducción automática
    let res: any;
    await act(async () => {
      res = await result.current.consumeRecipeIngredients(recipe);
    });
    expect(res.success).toBe(false);
    expect(res.alreadyDeducted).toBe(true);
    expect(res.error).toContain('revisión manual');

    // La despensa no fue alterada (permanece en 850g)
    expect(storage.data.find((i) => i.id === 'p-1')?.quantity).toBe(850);
  });

  it('8. Fallo en el rollback: la receta se marca para revisión manual y bloquea doble deducción', async () => {
    const storage = createMockPantryStorage(samplePantryIngredients);
    storage.failOnSecondSave = true; // El guardado inicial de despensa tiene éxito; el rollback de despensa falla
    const userId = 'user-rollback-fail';

    const baseSetItem = (AsyncStorage.setItem as jest.Mock).getMockImplementation()!;
    (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => {
      // Simular fallo en la confirmación del ledger (status completed)
      if (typeof value === 'string' && value.includes('"status":"completed"')) {
        throw new Error('AsyncStorage failure on ledger confirmation');
      }
      return baseSetItem(key, value);
    });

    try {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <PantryProvider
          storageAdapter={storage}
          initialIngredients={samplePantryIngredients}
          userId={userId}
        >
          {children}
        </PantryProvider>
      );

      const { result } = await renderHook(() => usePantry(), { wrapper });

      const recipe: ClientRecipe = {
        id: 'receta-rollback-fail',
        instanceId: 'receta-rollback-fail::gen_rf',
        name: 'Receta Rollback Fail',
        description: '',
        totalMinutes: 30,
        servings: 2,
        convenience: 80,
        estimatedMissingCost: 0,
        budgetRemaining: 10000,
        withinBudget: true,
        reason: '',
        isDemoFixture: false,
        steps: ['Cocinar'],
        ingredients: [{ name: 'Arroz blanco', quantity: 500, unit: 'g' }],
        availableIngredients: [],
        missingIngredients: [],
      };

      let callResult: any;
      await act(async () => {
        callResult = await result.current.consumeRecipeIngredients(recipe);
      });

      expect(callResult.success).toBe(false);
      expect(callResult.error).toContain('revisión manual');

      // El registro fue protegido con status 'requires_review'
      const records = await getConsumedRecipeRecords(userId);
      expect(records['receta-rollback-fail::gen_rf']?.status).toBe('requires_review');

      // Un intento posterior está estrictamente bloqueado
      expect(await result.current.checkIfRecipeDeducted(recipe)).toBe(true);
    } finally {
      (AsyncStorage.setItem as jest.Mock).mockImplementation(baseSetItem);
    }
  });

  it('9. Rollback selectivo no sobreescribe modificaciones concurrentes a otros ingredientes', async () => {
    const storage = createMockPantryStorage([
      ...samplePantryIngredients,
      {
        id: 'p-3',
        name: 'Huevos',
        quantity: 12,
        unit: 'unidad',
        category: 'Otros',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ]);

    const deductions: ConsumedIngredientDeduction[] = [
      {
        ingredientId: 'p-1',
        ingredientName: 'Arroz blanco',
        deductedQuantity: 300,
        unit: 'g',
        stockBefore: 1000,
        stockAfter: 700,
      },
    ];

    // Simular que entre la deducción y el rollback, otro ingrediente ('Huevos') fue modificado concurrentemente (de 12 a 10)
    storage.data = storage.data.map((item) =>
      item.id === 'p-1' ? { ...item, quantity: 700 } : item.id === 'p-3' ? { ...item, quantity: 10 } : item
    );

    // Ejecutar rollback selectivo para 'Arroz blanco'
    await rollbackPantryDeductions(storage, deductions);

    // Arroz blanco debe haber sido restaurado de 700g a 1000g (+300g)
    expect(storage.data.find((i) => i.id === 'p-1')?.quantity).toBe(1000);

    // Huevos debe conservar intacta la modificación concurrente (sigue en 10, no se sobreescribe con 12)
    expect(storage.data.find((i) => i.id === 'p-3')?.quantity).toBe(10);
  });

  it('10. Ledger ilegible por fallo temporal de almacenamiento: fail-closed y aborto seguro sin mutar despensa', async () => {
    const userId = 'user-unreadable-ledger';
    const storage = createMockPantryStorage(samplePantryIngredients);

    const baseGetItem = (AsyncStorage.getItem as jest.Mock).getMockImplementation()!;
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
      if (typeof key === 'string' && key.includes(userId)) {
        throw new Error('AsyncStorage I/O failure: SQLite disk unreadable');
      }
      return baseGetItem(key);
    });

    try {
      // 1. getConsumedRecipeRecords debe lanzar RecipeConsumptionLedgerError
      await expect(getConsumedRecipeRecords(userId)).rejects.toThrow(RecipeConsumptionLedgerError);

      // 2. isRecipeDeducted aplica FAIL-CLOSED devolviendo true para no permitir deducciones a ciegas
      expect(await isRecipeDeducted('receta-x', userId)).toBe(true);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <PantryProvider
          storageAdapter={storage}
          initialIngredients={samplePantryIngredients}
          userId={userId}
        >
          {children}
        </PantryProvider>
      );

      const { result } = await renderHook(() => usePantry(), { wrapper });

      const recipe: ClientRecipe = {
        id: 'receta-x',
        instanceId: 'receta-x::inst_1',
        name: 'Receta Test Falla',
        description: '',
        totalMinutes: 20,
        servings: 2,
        convenience: 80,
        estimatedMissingCost: 0,
        budgetRemaining: 10000,
        withinBudget: true,
        reason: '',
        isDemoFixture: false,
        steps: ['Cocinar'],
        ingredients: [{ name: 'Arroz blanco', quantity: 300, unit: 'g' }],
        availableIngredients: [],
        missingIngredients: [],
      };

      // 3. checkIfRecipeDeducted debe reportar true (fail-closed)
      expect(await result.current.checkIfRecipeDeducted(recipe)).toBe(true);

      // 4. consumeRecipeIngredients debe abortar de forma segura SIN mutar la despensa
      let res: any;
      await act(async () => {
        res = await result.current.consumeRecipeIngredients(recipe);
      });

      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
      expect(storage.saveCount).toBe(0); // activeStorage.saveIngredients NUNCA fue llamado
      expect(storage.data.find((i) => i.id === 'p-1')?.quantity).toBe(1000); // 1000g intactos
    } finally {
      (AsyncStorage.getItem as jest.Mock).mockImplementation(baseGetItem);
    }
  });

  it('11. Ledger con JSON corrupto o estructura malformada no se sobreescribe y aplica fail-closed', async () => {
    const userId = 'user-corrupted-ledger';
    const key = `@foodai:${userId}:consumed_recipes_v1`;
    const corruptPayload = '{"version": 1, "records": { malformed json syntax here';

    await AsyncStorage.setItem(key, corruptPayload);

    // 1. Lectura directa detecta corrupción y lanza RecipeConsumptionLedgerError
    await expect(getConsumedRecipeRecords(userId)).rejects.toThrow(RecipeConsumptionLedgerError);

    // 2. isRecipeDeducted aplica fail-closed (true)
    expect(await isRecipeDeducted('receta-corrupt', userId)).toBe(true);

    // 3. Registrar una nueva intención NO debe sobreescribir el ledger con un set vacío
    await expect(
      recordDeductionIntent('receta-corrupt', userId, {
        recipeName: 'Receta Corrupta',
      })
    ).rejects.toThrow(RecipeConsumptionLedgerError);

    // 4. El contenido en almacenamiento sigue siendo exactamente el original (no fue sobreescrito con {})
    const storedAfter = await AsyncStorage.getItem(key);
    expect(storedAfter).toBe(corruptPayload);
  });

  it('12. Estructuras de ledger inválidas lanzan RecipeConsumptionLedgerError', async () => {
    const userIdNullRecords = 'user-invalid-null';
    await AsyncStorage.setItem(
      `@foodai:${userIdNullRecords}:consumed_recipes_v1`,
      JSON.stringify({ version: 1, records: null })
    );
    await expect(getConsumedRecipeRecords(userIdNullRecords)).rejects.toThrow(RecipeConsumptionLedgerError);

    const userIdArrayRecords = 'user-invalid-array';
    await AsyncStorage.setItem(
      `@foodai:${userIdArrayRecords}:consumed_recipes_v1`,
      JSON.stringify({ version: 1, records: ['array', 'no-es-objeto'] })
    );
    await expect(getConsumedRecipeRecords(userIdArrayRecords)).rejects.toThrow(RecipeConsumptionLedgerError);
  });

  it('13. Distinción estricta de almacenamiento genuinamente ausente (AsyncStorage retorna null)', async () => {
    const freshUserId = 'user-brand-new-999';
    // Clave nunca escrita en AsyncStorage (getItem retorna explícitamente null)
    expect(await AsyncStorage.getItem(`@foodai:${freshUserId}:consumed_recipes_v1`)).toBeNull();
    const records = await getConsumedRecipeRecords(freshUserId);
    expect(records).toEqual({});
    expect(await isRecipeDeducted('receta-nueva', freshUserId)).toBe(false);
  });

  it('14. Rollback detecta inconsistencias en despensa (RollbackInconsistencyError) y requiere revisión manual', async () => {
    const storage = createMockPantryStorage(samplePantryIngredients);
    const userId = 'user-inconsistent-rollback';

    const deductions: ConsumedIngredientDeduction[] = [
      {
        ingredientId: 'p-1',
        ingredientName: 'Arroz blanco',
        deductedQuantity: 300,
        unit: 'g',
        stockBefore: 1000,
        stockAfter: 700,
      },
    ];

    // Simular que la despensa actual contiene 850g en lugar del stockAfter esperado (700g)
    storage.data = storage.data.map((item) =>
      item.id === 'p-1' ? { ...item, quantity: 850 } : item
    );

    // 1. rollbackPantryDeductions debe lanzar RollbackInconsistencyError directamente
    await expect(rollbackPantryDeductions(storage, deductions)).rejects.toThrow(
      RollbackInconsistencyError
    );

    // 2. La despensa NO debe ser modificada con adición ciega (permanece en 850g, no 1150g)
    expect(storage.data.find((i) => i.id === 'p-1')?.quantity).toBe(850);

    // 3. Probar el flujo integrado en consumeRecipeIngredients:
    // Si la confirmación del ledger falla y el rollback detecta inconsistencia en despensa
    const baseSetItem = (AsyncStorage.setItem as jest.Mock).getMockImplementation()!;
    (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => {
      if (typeof value === 'string' && value.includes('"status":"completed"')) {
        throw new Error('AsyncStorage ledger confirmation failed');
      }
      return baseSetItem(key, value);
    });

    try {
      // Resetear despensa a 1000g para el flujo normal
      storage.data = samplePantryIngredients.map((i) => ({ ...i }));
      storage.saveCount = 0;

      // Mockeamos que antes del rollback, la despensa sufra una modificación inesperada
      const originalSave = storage.saveIngredients.bind(storage);
      storage.saveIngredients = async (items: Ingredient[]) => {
        const saved = await originalSave(items);
        if (storage.saveCount === 1) {
          // Alterar arbitrariamente la cantidad para generar inconsistencia antes del rollback
          storage.data = storage.data.map((i) => (i.id === 'p-1' ? { ...i, quantity: 999 } : i));
        }
        return saved;
      };

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <PantryProvider
          storageAdapter={storage}
          initialIngredients={samplePantryIngredients}
          userId={userId}
        >
          {children}
        </PantryProvider>
      );

      const { result } = await renderHook(() => usePantry(), { wrapper });

      const recipe: ClientRecipe = {
        id: 'receta-inconsistent',
        instanceId: 'receta-inconsistent::inst',
        name: 'Receta Inconsistente',
        description: '',
        totalMinutes: 30,
        servings: 2,
        convenience: 80,
        estimatedMissingCost: 0,
        budgetRemaining: 10000,
        withinBudget: true,
        reason: '',
        isDemoFixture: false,
        steps: ['Cocinar'],
        ingredients: [{ name: 'Arroz blanco', quantity: 300, unit: 'g' }],
        availableIngredients: [],
        missingIngredients: [],
      };

      let callResult: any;
      await act(async () => {
        callResult = await result.current.consumeRecipeIngredients(recipe);
      });

      expect(callResult.success).toBe(false);
      expect(callResult.error).toContain('revisión manual');

      // Se registró status 'requires_review'
      const records = await getConsumedRecipeRecords(userId);
      expect(records['receta-inconsistent::inst']?.status).toBe('requires_review');
      expect(records['receta-inconsistent::inst']?.reviewReason).toContain('Inconsistencia en despensa durante rollback');

      // Un chequeo posterior bloquea la receta
      expect(await result.current.checkIfRecipeDeducted(recipe)).toBe(true);
    } finally {
      (AsyncStorage.setItem as jest.Mock).mockImplementation(baseSetItem);
    }
  });

  it('15. Validación estricta de ausencia: cadenas vacías, espacios en blanco y respuestas undefined lanzan RecipeConsumptionLedgerError', async () => {
    // Caso 1: Cadena vacía ""
    const emptyUserId = 'user-strict-empty';
    const emptyKey = `@foodai:${emptyUserId}:consumed_recipes_v1`;
    await AsyncStorage.setItem(emptyKey, '');

    // Nota: El mock por defecto de Jest en async-storage utiliza (storage[k] || null), convirtiendo '' en null.
    // Simulamos fielmente el comportamiento de AsyncStorage nativo donde '' se retorna tal cual.
    const baseGetItem = (AsyncStorage.getItem as jest.Mock).getMockImplementation()!;
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
      if (typeof key === 'string' && key.includes(emptyUserId)) {
        return '';
      }
      return baseGetItem(key);
    });

    try {
      await expect(getConsumedRecipeRecords(emptyUserId)).rejects.toThrow(RecipeConsumptionLedgerError);
      expect(await isRecipeDeducted('receta-1', emptyUserId)).toBe(true); // Fail-closed
      await expect(recordDeductionIntent('receta-1', emptyUserId)).rejects.toThrow(RecipeConsumptionLedgerError);
    } finally {
      (AsyncStorage.getItem as jest.Mock).mockImplementation(baseGetItem);
    }

    // Caso 2: Cadena de solo espacios en blanco "   \t \n"
    const whitespaceUserId = 'user-strict-whitespace';
    const wsKey = `@foodai:${whitespaceUserId}:consumed_recipes_v1`;
    await AsyncStorage.setItem(wsKey, '   \n \t  ');
    await expect(getConsumedRecipeRecords(whitespaceUserId)).rejects.toThrow(RecipeConsumptionLedgerError);
    expect(await isRecipeDeducted('receta-1', whitespaceUserId)).toBe(true); // Fail-closed
    await expect(recordDeductionIntent('receta-1', whitespaceUserId)).rejects.toThrow(RecipeConsumptionLedgerError);
    expect(await AsyncStorage.getItem(wsKey)).toBe('   \n \t  '); // No sobreescrito

    // Caso 3: Respuesta undefined inesperada del almacenamiento
    const undefinedUserId = 'user-strict-undefined';
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
      if (typeof key === 'string' && key.includes(undefinedUserId)) {
        return undefined as any;
      }
      return baseGetItem(key);
    });

    try {
      await expect(getConsumedRecipeRecords(undefinedUserId)).rejects.toThrow(RecipeConsumptionLedgerError);
      expect(await isRecipeDeducted('receta-1', undefinedUserId)).toBe(true); // Fail-closed
      await expect(recordDeductionIntent('receta-1', undefinedUserId)).rejects.toThrow(RecipeConsumptionLedgerError);
    } finally {
      (AsyncStorage.getItem as jest.Mock).mockImplementation(baseGetItem);
    }
  });

  it('16. Validación de registros individuales: rechazo de estados inválidos, nulos o no soportados', async () => {
    // Validador unitario de registros
    expect(isValidConsumedRecipeRecord(null)).toBe(false);
    expect(isValidConsumedRecipeRecord([])).toBe(false);
    expect(isValidConsumedRecipeRecord('string-primitivo')).toBe(false);
    expect(isValidConsumedRecipeRecord(12345)).toBe(false);

    // Status no soportado
    expect(
      isValidConsumedRecipeRecord({
        recipeId: 'rec-1',
        consumedAt: '2026-01-01T00:00:00Z',
        status: 'in_progress', // no soportado
      })
    ).toBe(false);

    // Status nulo
    expect(
      isValidConsumedRecipeRecord({
        recipeId: 'rec-1',
        consumedAt: '2026-01-01T00:00:00Z',
        status: null,
      })
    ).toBe(false);

    // Status numérico
    expect(
      isValidConsumedRecipeRecord({
        recipeId: 'rec-1',
        consumedAt: '2026-01-01T00:00:00Z',
        status: 1,
      })
    ).toBe(false);

    // Estados soportados válidos
    expect(
      isValidConsumedRecipeRecord({
        recipeId: 'rec-1',
        consumedAt: '2026-01-01T00:00:00Z',
        status: 'pending',
      })
    ).toBe(true);

    expect(
      isValidConsumedRecipeRecord({
        recipeId: 'rec-1',
        consumedAt: '2026-01-01T00:00:00Z',
        status: 'completed',
      })
    ).toBe(true);

    expect(
      isValidConsumedRecipeRecord({
        recipeId: 'rec-1',
        consumedAt: '2026-01-01T00:00:00Z',
        status: 'requires_review',
      })
    ).toBe(true);

    // Prueba integrada de almacenamiento con estado inválido
    const badStatusUser = 'user-bad-status';
    await AsyncStorage.setItem(
      `@foodai:${badStatusUser}:consumed_recipes_v1`,
      JSON.stringify({
        version: 1,
        records: {
          'rec-1': {
            recipeId: 'rec-1',
            consumedAt: '2026-01-01T00:00:00Z',
            status: 'unknown_and_invalid',
          },
        },
      })
    );

    await expect(getConsumedRecipeRecords(badStatusUser)).rejects.toThrow(RecipeConsumptionLedgerError);
    expect(await isRecipeDeducted('rec-1', badStatusUser)).toBe(true); // Fail-closed
  });

  it('17. Validación de registros individuales: rechazo de registros nulos, arreglos o con campos obligatorios faltantes', async () => {
    // Falta recipeId
    expect(isValidConsumedRecipeRecord({ consumedAt: '2026-01-01T00:00:00Z' })).toBe(false);
    expect(isValidConsumedRecipeRecord({ recipeId: '', consumedAt: '2026-01-01T00:00:00Z' })).toBe(false);
    expect(isValidConsumedRecipeRecord({ recipeId: '   ', consumedAt: '2026-01-01T00:00:00Z' })).toBe(false);

    // Falta consumedAt
    expect(isValidConsumedRecipeRecord({ recipeId: 'rec-1' })).toBe(false);
    expect(isValidConsumedRecipeRecord({ recipeId: 'rec-1', consumedAt: '' })).toBe(false);

    // mealPlanDay no finito
    expect(isValidConsumedRecipeRecord({ recipeId: 'rec-1', consumedAt: '2026-01-01', mealPlanDay: NaN })).toBe(false);
    expect(isValidConsumedRecipeRecord({ recipeId: 'rec-1', consumedAt: '2026-01-01', mealPlanDay: Infinity })).toBe(false);
    expect(isValidConsumedRecipeRecord({ recipeId: 'rec-1', consumedAt: '2026-01-01', mealPlanDay: '1' as any })).toBe(false);

    // Tipos inválidos en campos escalares opcionales
    expect(isValidConsumedRecipeRecord({ recipeId: 'rec-1', consumedAt: '2026-01-01', recipeName: 123 as any })).toBe(false);
    expect(isValidConsumedRecipeRecord({ recipeId: 'rec-1', consumedAt: '2026-01-01', instanceId: {} as any })).toBe(false);
    expect(isValidConsumedRecipeRecord({ recipeId: 'rec-1', consumedAt: '2026-01-01', reviewReason: [] as any })).toBe(false);

    // Prueba en ledger persistido con registro null interno
    const nullRecordUser = 'user-null-inner-record';
    await AsyncStorage.setItem(
      `@foodai:${nullRecordUser}:consumed_recipes_v1`,
      JSON.stringify({
        version: 1,
        records: {
          'rec-valid': { recipeId: 'rec-valid', consumedAt: '2026-01-01T00:00:00Z', status: 'completed' },
          'rec-null': null,
        },
      })
    );

    // Fallo cerrado total para todo el ledger (no carga parcial)
    await expect(getConsumedRecipeRecords(nullRecordUser)).rejects.toThrow(RecipeConsumptionLedgerError);
  });

  it('18. Validación de desgloses de deducción: rechazo de tipos inválidos, cantidades negativas o valores no finitos', async () => {
    // Validador unitario de deducciones
    expect(isValidConsumedIngredientDeduction(null)).toBe(false);
    expect(isValidConsumedIngredientDeduction([])).toBe(false);
    expect(isValidConsumedIngredientDeduction('texto')).toBe(false);

    const validDeduction = {
      ingredientId: 'p-1',
      ingredientName: 'Arroz',
      deductedQuantity: 200,
      unit: 'g',
      stockBefore: 500,
      stockAfter: 300,
    };
    expect(isValidConsumedIngredientDeduction(validDeduction)).toBe(true);

    // stockAfter = 0 es completamente válido (consumo total)
    expect(isValidConsumedIngredientDeduction({ ...validDeduction, stockAfter: 0 })).toBe(true);

    // deductedQuantity no finita o negativa
    expect(isValidConsumedIngredientDeduction({ ...validDeduction, deductedQuantity: NaN })).toBe(false);
    expect(isValidConsumedIngredientDeduction({ ...validDeduction, deductedQuantity: Infinity })).toBe(false);
    expect(isValidConsumedIngredientDeduction({ ...validDeduction, deductedQuantity: -10 })).toBe(false);
    expect(isValidConsumedIngredientDeduction({ ...validDeduction, deductedQuantity: '200' as any })).toBe(false);

    // stockBefore o stockAfter negativos o no finitos
    expect(isValidConsumedIngredientDeduction({ ...validDeduction, stockBefore: -1 })).toBe(false);
    expect(isValidConsumedIngredientDeduction({ ...validDeduction, stockAfter: -5 })).toBe(false);
    expect(isValidConsumedIngredientDeduction({ ...validDeduction, stockBefore: NaN })).toBe(false);
    expect(isValidConsumedIngredientDeduction({ ...validDeduction, stockAfter: Infinity })).toBe(false);

    // Cadenas vacías en identificadores o unidades
    expect(isValidConsumedIngredientDeduction({ ...validDeduction, ingredientId: '' })).toBe(false);
    expect(isValidConsumedIngredientDeduction({ ...validDeduction, ingredientName: '   ' })).toBe(false);
    expect(isValidConsumedIngredientDeduction({ ...validDeduction, unit: '' })).toBe(false);

    // deductions no es un arreglo en el registro
    expect(
      isValidConsumedRecipeRecord({
        recipeId: 'rec-1',
        consumedAt: '2026-01-01',
        deductions: 'not-an-array' as any,
      })
    ).toBe(false);

    // deductions contiene un elemento malformado
    expect(
      isValidConsumedRecipeRecord({
        recipeId: 'rec-1',
        consumedAt: '2026-01-01',
        deductions: [{ ...validDeduction, deductedQuantity: NaN }],
      })
    ).toBe(false);
  });

  it('19. Retrocompatibilidad con registros históricos legados sin status y protección integral de despensa', async () => {
    const legacyUserId = 'user-legacy-compatibility';
    const legacyKey = `@foodai:${legacyUserId}:consumed_recipes_v1`;

    // Registro legado histórico: contiene recipeId y consumedAt pero NO tiene status ni deductions
    const legacyPayload = {
      version: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      records: {
        'sancocho-pollo': {
          recipeId: 'sancocho-pollo',
          consumedAt: '2026-01-01T12:00:00Z',
          recipeName: 'Sancocho de Pollo Tradicional',
        },
      },
    };

    await AsyncStorage.setItem(legacyKey, JSON.stringify(legacyPayload));

    // 1. getConsumedRecipeRecords lee exitosamente los registros históricos
    const records = await getConsumedRecipeRecords(legacyUserId);
    expect(records['sancocho-pollo']).toBeDefined();
    expect(records['sancocho-pollo'].status).toBeUndefined();

    // 2. isRecipeDeducted reconoce la receta legada como ya deducida
    expect(await isRecipeDeducted('sancocho-pollo', legacyUserId)).toBe(true);

    // 3. Una receta nueva no consumida NO es bloqueada
    expect(await isRecipeDeducted('arepa-huevo', legacyUserId)).toBe(false);

    // 4. Integración con PantryProvider y protección contra mutaciones ante fallos
    const storage = createMockPantryStorage(samplePantryIngredients);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PantryProvider
        storageAdapter={storage}
        initialIngredients={samplePantryIngredients}
        userId={legacyUserId}
      >
        {children}
      </PantryProvider>
    );

    const { result } = await renderHook(() => usePantry(), { wrapper });

    const legacyRecipe: ClientRecipe = {
      id: 'sancocho-pollo',
      name: 'Sancocho de Pollo Tradicional',
      description: '',
      totalMinutes: 45,
      servings: 4,
      convenience: 85,
      estimatedMissingCost: 0,
      budgetRemaining: 15000,
      withinBudget: true,
      reason: '',
      isDemoFixture: false,
      steps: ['Cocinar'],
      ingredients: [{ name: 'Arroz blanco', quantity: 200, unit: 'g' }],
      availableIngredients: [],
      missingIngredients: [],
    };

    // checkIfRecipeDeducted bloquea la receta histórica
    expect(await result.current.checkIfRecipeDeducted(legacyRecipe)).toBe(true);

    // Intento de consumir receta legada reporta alreadyDeducted y no muta la despensa
    let res: any;
    await act(async () => {
      res = await result.current.consumeRecipeIngredients(legacyRecipe);
    });

    expect(res.alreadyDeducted).toBe(true);
    expect(res.success).toBe(false);
    expect(storage.saveCount).toBe(0); // Cero llamadas a saveIngredients
    expect(storage.data.find((i) => i.id === 'p-1')?.quantity).toBe(1000); // Intacto
  });

  it('20. Fallo ambiguo en saveIngredients (escribe con éxito pero rechaza después): preservación de WAL y prevención de doble deducción', async () => {
    const userId = 'user-ambiguous-write-success';
    const key = 'receta-ambiguous-write::gen_amb';
    const storage = createMockPantryStorage(samplePantryIngredients);

    // Simulamos que saveIngredients persiste físicamente el cambio en storage.data (1000g -> 700g),
    // pero posteriormente la promesa es rechazada (ej. fallo en gancho post-escritura o timeout)
    const originalSave = storage.saveIngredients.bind(storage);
    storage.saveIngredients = async (items: Ingredient[]) => {
      await originalSave(items); // La persistencia física ocurrió
      throw new Error('Error en el controlador de almacenamiento post-escritura');
    };

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PantryProvider
        storageAdapter={storage}
        initialIngredients={samplePantryIngredients}
        userId={userId}
      >
        {children}
      </PantryProvider>
    );

    const { result } = await renderHook(() => usePantry(), { wrapper });

    const recipe: ClientRecipe = {
      id: 'receta-ambiguous-write',
      instanceId: key,
      name: 'Receta Escritura Ambígua',
      description: '',
      totalMinutes: 30,
      servings: 2,
      convenience: 80,
      estimatedMissingCost: 0,
      budgetRemaining: 10000,
      withinBudget: true,
      reason: '',
      isDemoFixture: false,
      steps: ['Cocinar'],
      ingredients: [{ name: 'Arroz blanco', quantity: 300, unit: 'g' }],
      availableIngredients: [],
      missingIngredients: [],
    };

    // 1. La llamada inicial falla con el error de almacenamiento reportado
    let res1: any;
    await act(async () => {
      res1 = await result.current.consumeRecipeIngredients(recipe);
    });

    expect(res1.success).toBe(false);
    expect(res1.error).toContain('post-escritura');

    // 2. El WAL no fue eliminado ciegamente; la reconciliación detectó que la despensa sí tiene stockAfter (700g)
    // y confirmó automáticamente el ledger como 'completed'
    const records = await getConsumedRecipeRecords(userId);
    expect(records[key]?.status).toBe('completed');

    // 3. La despensa física está en 700g
    expect(storage.data.find((i) => i.id === 'p-1')?.quantity).toBe(700);

    // 4. checkIfRecipeDeducted reporta bloqueada la receta
    expect(await result.current.checkIfRecipeDeducted(recipe)).toBe(true);

    // 5. El usuario reintenta consumir la misma receta tras el error:
    // NUNCA debe descontar por segunda vez (700g -> 400g). Debe bloquearse inmediatamente.
    let res2: any;
    await act(async () => {
      res2 = await result.current.consumeRecipeIngredients(recipe);
    });

    expect(res2.alreadyDeducted).toBe(true);
    expect(res2.success).toBe(false);
    expect(storage.data.find((i) => i.id === 'p-1')?.quantity).toBe(700); // Sigue estrictamente en 700g
  });

  it('21. Fallo en saveIngredients antes de escribir: la intención pendiente se descarta y el reintento procede limpiamente', async () => {
    const userId = 'user-write-fail-before-persist';
    const key = 'receta-fail-before::gen_fb';
    const storage = createMockPantryStorage(samplePantryIngredients);

    // Simulamos fallo antes de mutar la despensa en la primera invocación
    let attempts = 0;
    const originalSave = storage.saveIngredients.bind(storage);
    storage.saveIngredients = async (items: Ingredient[]) => {
      attempts++;
      if (attempts === 1) {
        throw new Error('Fallo de E/S antes de persistir');
      }
      return originalSave(items);
    };

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PantryProvider
        storageAdapter={storage}
        initialIngredients={samplePantryIngredients}
        userId={userId}
      >
        {children}
      </PantryProvider>
    );

    const { result } = await renderHook(() => usePantry(), { wrapper });

    const recipe: ClientRecipe = {
      id: 'receta-fail-before',
      instanceId: key,
      name: 'Receta Falla Antes de Guardar',
      description: '',
      totalMinutes: 25,
      servings: 2,
      convenience: 80,
      estimatedMissingCost: 0,
      budgetRemaining: 10000,
      withinBudget: true,
      reason: '',
      isDemoFixture: false,
      steps: ['Cocinar'],
      ingredients: [{ name: 'Arroz blanco', quantity: 300, unit: 'g' }],
      availableIngredients: [],
      missingIngredients: [],
    };

    // 1. Primer intento falla
    let res1: any;
    await act(async () => {
      res1 = await result.current.consumeRecipeIngredients(recipe);
    });

    expect(res1.success).toBe(false);

    // 2. Como la despensa no cambió (permanece en 1000g = stockBefore), la intención se descarta de forma segura
    const records1 = await getConsumedRecipeRecords(userId);
    expect(records1[key]).toBeUndefined();
    expect(storage.data.find((i) => i.id === 'p-1')?.quantity).toBe(1000);

    // 3. El reintento posterior ahora procede y completa la deducción legítimamente
    let res2: any;
    await act(async () => {
      res2 = await result.current.consumeRecipeIngredients(recipe);
    });

    expect(res2.success).toBe(true);
    expect(res2.alreadyDeducted).toBe(false);
    expect(storage.data.find((i) => i.id === 'p-1')?.quantity).toBe(700);

    const records2 = await getConsumedRecipeRecords(userId);
    expect(records2[key]?.status).toBe('completed');
  });

  it('22. Inconsistencia entre clave del ledger y recipeId (Mismatched Keys): rechazo y fail-closed', async () => {
    // 1. Verificador unitario
    expect(isKeyConsistentWithRecipeId('receta-arroz', { recipeId: 'receta-frijoles' })).toBe(false);
    expect(isKeyConsistentWithRecipeId('rec-1', { recipeId: 'rec-2' })).toBe(false);
    expect(isKeyConsistentWithRecipeId('', { recipeId: 'rec-1' })).toBe(false);

    // isValidConsumedRecipeRecord con recordKey inconsistente
    expect(
      isValidConsumedRecipeRecord(
        { recipeId: 'receta-frijoles', consumedAt: '2026-01-01T00:00:00Z', status: 'completed' },
        'receta-arroz'
      )
    ).toBe(false);

    // 2. Comportamiento en almacenamiento persistido
    const userIdMismatch = 'user-key-mismatch';
    const key = `@foodai:${userIdMismatch}:consumed_recipes_v1`;
    const mismatchPayload = {
      version: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      records: {
        'clave-arroz': {
          recipeId: 'receta-frijoles', // Discrepancia espuria
          consumedAt: '2026-01-01T00:00:00Z',
          status: 'completed',
        },
      },
    };

    await AsyncStorage.setItem(key, JSON.stringify(mismatchPayload));

    // Lectura directa rechaza con RecipeConsumptionLedgerError
    await expect(getConsumedRecipeRecords(userIdMismatch)).rejects.toThrow(RecipeConsumptionLedgerError);

    // isRecipeDeducted aplica fail-closed tanto para la clave como para el recipeId
    expect(await isRecipeDeducted('clave-arroz', userIdMismatch)).toBe(true);
    expect(await isRecipeDeducted('receta-frijoles', userIdMismatch)).toBe(true);

    // Intento de escribir en el ledger no sobreescribe los datos
    await expect(recordDeductionIntent('nueva-receta', userIdMismatch)).rejects.toThrow(
      RecipeConsumptionLedgerError
    );

    // Integración con despensa: consumeRecipeIngredients aborta sin mutar
    const storage = createMockPantryStorage(samplePantryIngredients);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PantryProvider
        storageAdapter={storage}
        initialIngredients={samplePantryIngredients}
        userId={userIdMismatch}
      >
        {children}
      </PantryProvider>
    );

    const { result } = await renderHook(() => usePantry(), { wrapper });

    const testRecipe: ClientRecipe = {
      id: 'clave-arroz',
      name: 'Arroz',
      description: '',
      totalMinutes: 20,
      servings: 2,
      convenience: 80,
      estimatedMissingCost: 0,
      budgetRemaining: 10000,
      withinBudget: true,
      reason: '',
      isDemoFixture: false,
      steps: ['Cocinar'],
      ingredients: [{ name: 'Arroz blanco', quantity: 200, unit: 'g' }],
      availableIngredients: [],
      missingIngredients: [],
    };

    let callRes: any;
    await act(async () => {
      callRes = await result.current.consumeRecipeIngredients(testRecipe);
    });

    expect(callRes.success).toBe(false);
    expect(storage.saveCount).toBe(0); // Cero llamadas a saveIngredients
    expect(storage.data.find((i) => i.id === 'p-1')?.quantity).toBe(1000); // Intacto
  });

  it('23. Coherencia y compatibilidad de formatos históricos entre clave y recipeId', async () => {
    // 1. Coincidencia exacta
    expect(isKeyConsistentWithRecipeId('receta-1', { recipeId: 'receta-1' })).toBe(true);

    // 2. Insensibilidad a mayúsculas y espacios
    expect(isKeyConsistentWithRecipeId('  Receta-1  ', { recipeId: 'receta-1' })).toBe(true);
    expect(isKeyConsistentWithRecipeId('receta-1', { recipeId: 'RECETA-1' })).toBe(true);

    // 3. Clave con sufijo de generación / instanceId y recipeId base
    expect(isKeyConsistentWithRecipeId('receta-1::gen_123', { recipeId: 'receta-1' })).toBe(true);

    // 4. RecipeId con sufijo de generación y clave base
    expect(isKeyConsistentWithRecipeId('receta-1', { recipeId: 'receta-1::gen_123' })).toBe(true);

    // 5. instanceId explícito en el registro coincidente con la clave
    expect(
      isKeyConsistentWithRecipeId('receta-1::gen_custom', {
        recipeId: 'receta-1',
        instanceId: 'receta-1::gen_custom',
      })
    ).toBe(true);

    // 6. Prueba integrada de almacenamiento cargando registros históricos compatibles
    const userIdValidHistory = 'user-valid-history';
    const key = `@foodai:${userIdValidHistory}:consumed_recipes_v1`;
    const validHistoryPayload = {
      version: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      records: {
        'receta-1': {
          recipeId: 'receta-1',
          consumedAt: '2026-01-01T00:00:00Z',
        },
        'receta-2::gen_a': {
          recipeId: 'receta-2',
          consumedAt: '2026-01-01T00:00:00Z',
          instanceId: 'receta-2::gen_a',
        },
        'receta-3': {
          recipeId: 'RECETA-3',
          consumedAt: '2026-01-01T00:00:00Z',
        },
      },
    };

    await AsyncStorage.setItem(key, JSON.stringify(validHistoryPayload));

    const loadedRecords = await getConsumedRecipeRecords(userIdValidHistory);
    expect(Object.keys(loadedRecords)).toHaveLength(3);
    expect(await isRecipeDeducted('receta-1', userIdValidHistory)).toBe(true);
    expect(await isRecipeDeducted('receta-2::gen_a', userIdValidHistory)).toBe(true);
    expect(await isRecipeDeducted('receta-3', userIdValidHistory)).toBe(true);
  });
});
