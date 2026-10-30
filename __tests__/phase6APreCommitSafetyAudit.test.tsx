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
} from '../src/services/storage/recipeConsumptionStorage';
import { PantryProvider, usePantry, rollbackPantryDeductions } from '../src/context/PantryContext';
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
});
