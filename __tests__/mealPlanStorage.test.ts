/**
 * Suite de pruebas unitarias para el almacenamiento local del Plan de Comidas (Fase 3C).
 * Valida:
 * 1. Parseo y validación estricta de sobres de almacenamiento (empty, valid, corrupt, unsupported_future_version).
 * 2. Persistencia y recuperación exitosa con AsyncStorage.
 * 3. Limpieza del plan de comidas persistido.
 * 4. Detección y respaldo ante corrupción de datos.
 * 5. Rechazo ante versiones futuras del esquema.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AsyncStorageMealPlanAdapter,
  MEAL_PLAN_STORAGE_KEY,
  MEAL_PLAN_STORAGE_VERSION,
  MealPlanStorageCorruptionError,
  MealPlanStorageVersionError,
  parseStoredMealPlanEnvelope,
} from '../src/services/storage/mealPlanStorage';
import { ClientMealPlan, MealPlanGenerationSnapshot } from '../src/types/mealPlan';

describe('Almacenamiento Local del Plan de Comidas (mealPlanStorage)', () => {
  const testStorageKey = '@test:foodai:meal_plan_v1';
  let adapter: AsyncStorageMealPlanAdapter;

  const validPlan: ClientMealPlan = {
    days: [
      {
        day: 1,
        recipe: {
          id: 'plan-dia-1-receta-1',
          name: 'Receta 1',
          description: 'Desc 1',
          totalMinutes: 30,
          servings: 2,
          ingredients: [{ name: 'Pollo', quantity: 200, unit: 'g' }],
          steps: ['Paso 1'],
          availableIngredients: [],
          missingIngredients: [],
          estimatedMissingCost: 0,
          budgetRemaining: 15000,
          withinBudget: true,
          convenience: '90%',
          reason: 'Razón 1',
          isDemoFixture: false,
        },
      },
      {
        day: 2,
        recipe: {
          id: 'plan-dia-2-receta-2',
          name: 'Receta 2',
          description: 'Desc 2',
          totalMinutes: 25,
          servings: 2,
          ingredients: [{ name: 'Arroz', quantity: 200, unit: 'g' }],
          steps: ['Paso 1'],
          availableIngredients: [],
          missingIngredients: [],
          estimatedMissingCost: 0,
          budgetRemaining: 15000,
          withinBudget: true,
          convenience: '85%',
          reason: 'Razón 2',
          isDemoFixture: false,
        },
      },
      {
        day: 3,
        recipe: {
          id: 'plan-dia-3-receta-3',
          name: 'Receta 3',
          description: 'Desc 3',
          totalMinutes: 35,
          servings: 2,
          ingredients: [{ name: 'Pasta', quantity: 200, unit: 'g' }],
          steps: ['Paso 1'],
          availableIngredients: [],
          missingIngredients: [],
          estimatedMissingCost: 0,
          budgetRemaining: 15000,
          withinBudget: true,
          convenience: '88%',
          reason: 'Razón 3',
          isDemoFixture: false,
        },
      },
    ],
    totalEstimatedMissingCost: 0,
    budgetRemaining: 15000,
    withinBudget: true,
    uniqueMissingIngredients: [],
  };

  const validSnapshot: MealPlanGenerationSnapshot = {
    pantryFingerprint: 'pollo:200:g|arroz:500:g',
    budget: 15000,
    servings: 2,
    maxMinutes: 45,
    generatedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    adapter = new AsyncStorageMealPlanAdapter(testStorageKey);
    await AsyncStorage.clear();
  });

  afterEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  describe('1. parseStoredMealPlanEnvelope', () => {
    it('retorna empty cuando el string es nulo, indefinido o vacío', () => {
      expect(parseStoredMealPlanEnvelope(null)).toEqual({ status: 'empty' });
      expect(parseStoredMealPlanEnvelope('')).toEqual({ status: 'empty' });
      expect(parseStoredMealPlanEnvelope('   ')).toEqual({ status: 'empty' });
    });

    it('retorna valid ante un sobre completo y bien estructurado', () => {
      const envelope = {
        version: MEAL_PLAN_STORAGE_VERSION,
        updatedAt: new Date().toISOString(),
        plan: validPlan,
        snapshot: validSnapshot,
      };

      const result = parseStoredMealPlanEnvelope(JSON.stringify(envelope));
      expect(result.status).toBe('valid');
      if (result.status === 'valid') {
        expect(result.plan.days).toHaveLength(3);
        expect(result.snapshot.budget).toBe(15000);
      }
    });

    it('retorna corrupt ante JSON inválido o malformado', () => {
      const result = parseStoredMealPlanEnvelope('{ invalid json');
      expect(result.status).toBe('corrupt');
    });

    it('retorna unsupported_future_version si la versión es mayor a la soportada', () => {
      const futureEnvelope = {
        version: MEAL_PLAN_STORAGE_VERSION + 1,
        updatedAt: new Date().toISOString(),
        plan: validPlan,
        snapshot: validSnapshot,
      };

      const result = parseStoredMealPlanEnvelope(JSON.stringify(futureEnvelope));
      expect(result.status).toBe('unsupported_future_version');
    });

    it('retorna corrupt si el plan no contiene exactamente 3 días', () => {
      const invalidPlanEnvelope = {
        version: MEAL_PLAN_STORAGE_VERSION,
        updatedAt: new Date().toISOString(),
        plan: { ...validPlan, days: [validPlan.days[0]] },
        snapshot: validSnapshot,
      };

      const result = parseStoredMealPlanEnvelope(JSON.stringify(invalidPlanEnvelope));
      expect(result.status).toBe('corrupt');
    });
  });

  describe('2. AsyncStorageMealPlanAdapter', () => {
    it('retorna null cuando no hay ningún plan guardado', async () => {
      const stored = await adapter.getStoredMealPlan();
      expect(stored).toBeNull();
    });

    it('guarda y recupera exitosamente un plan de 3 días con su snapshot', async () => {
      await adapter.saveMealPlan(validPlan, validSnapshot);

      const stored = await adapter.getStoredMealPlan();
      expect(stored).not.toBeNull();
      expect(stored?.plan.days).toHaveLength(3);
      expect(stored?.plan.days[0].recipe.name).toBe('Receta 1');
      expect(stored?.snapshot.budget).toBe(15000);
    });

    it('limpia el almacenamiento local al llamar a clearMealPlan', async () => {
      await adapter.saveMealPlan(validPlan, validSnapshot);
      await adapter.clearMealPlan();

      const stored = await adapter.getStoredMealPlan();
      expect(stored).toBeNull();
    });

    it('lanza MealPlanStorageVersionError ante versiones futuras almacenadas', async () => {
      const futureEnvelope = {
        version: 99,
        updatedAt: new Date().toISOString(),
        plan: validPlan,
        snapshot: validSnapshot,
      };
      await AsyncStorage.setItem(testStorageKey, JSON.stringify(futureEnvelope));

      await expect(adapter.getStoredMealPlan()).rejects.toThrow(MealPlanStorageVersionError);
    });

    it('crea una copia de respaldo ante payload corrupto y lanza MealPlanStorageCorruptionError', async () => {
      await AsyncStorage.setItem(testStorageKey, '{ corrupted payload data');

      await expect(adapter.getStoredMealPlan()).rejects.toThrow(MealPlanStorageCorruptionError);

      const keys = await AsyncStorage.getAllKeys();
      const backupKey = keys.find((k) => k.startsWith(`${testStorageKey}_backup_`));
      expect(backupKey).toBeDefined();

      const backupContent = await AsyncStorage.getItem(backupKey!);
      expect(backupContent).toBe('{ corrupted payload data');
    });
  });
});
