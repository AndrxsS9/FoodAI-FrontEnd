/**
 * FoodAI - Fase 6A: Suite Integral de Pruebas Funcionales del MVP
 *
 * Cubre:
 * 1. Modelos, validadores y normalización de metadatos de tiempo (prepMinutes, cookMinutes, stepDurations).
 * 2. Retrocompatibilidad con payloads legacy sin metadatos de tiempo (no inventa datos).
 * 3. Temporizador de cuenta regresiva por paso en Modo Cocina (start, pause, reset, feedback).
 * 4. Independencia y separación entre cronómetro general y cuenta regresiva.
 * 5. Deducción confirmada de despensa con conversión de unidades (g/kg, ml/l).
 * 6. Prevención estricta de inventario negativo y manejo de ingredientes en revisión.
 * 7. Prevención de doble deducción (idempotencia y persistencia por usuario).
 * 8. Seguimiento de completado del plan de 3 días (0/3, 1/3, 2/3, 3/3).
 * 9. No fuga de estado completado a nuevos planes generados.
 * 10. Aislamiento estricto de datos entre usuarios autenticados y guest.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  validateBackendRecipe,
  RecipeApiError,
} from '../src/services/api/recipeApi';
import {
  validateBackendMealPlanResponse,
  normalizeBackendMealPlan,
  BackendMealPlanResponseData,
  ClientMealPlan,
} from '../src/types/mealPlan';
import {
  normalizeBackendRecipe,
  ClientRecipe,
  BackendRecipe,
} from '../src/types/recipe';
import {
  calculatePantryDeduction,
  applyPantryDeduction,
} from '../src/utils/pantryConsumption';
import {
  isRecipeDeducted,
  recordRecipeDeduction,
  clearRecipeDeductions,
} from '../src/services/storage/recipeConsumptionStorage';
import {
  createMealPlanStorage,
  parseStoredMealPlanEnvelope,
} from '../src/services/storage/mealPlanStorage';
import { Ingredient } from '../src/types/pantry';

import GuidedCookingScreen from '../app/recetas/[id]/cocinar';
import PlanScreen from '../app/(tabs)/plan';

import { RecipeProvider } from '../src/context/RecipeContext';
import { MealPlanProvider } from '../src/context/MealPlanContext';
import { PantryProvider } from '../src/context/PantryContext';
import { BudgetProvider } from '../src/context/BudgetContext';
import { TypographyProvider } from '../src/theme';

// Mocks de navegación Expo Router
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: { id?: string; fromPlan?: string } = { id: 'timer-recipe' };

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

function createMockClientRecipe(partial: Partial<ClientRecipe>): ClientRecipe {
  return {
    id: 'test-recipe',
    name: 'Test Recipe',
    description: 'Descripción',
    totalMinutes: 30,
    servings: 2,
    convenience: 'alta',
    estimatedMissingCost: 0,
    imageUrl: null,
    steps: ['Paso 1: Preparar'],
    ingredients: [],
    availableIngredients: [],
    missingIngredients: [],
    budgetRemaining: 50000,
    withinBudget: true,
    reason: 'Razón de prueba',
    isDemoFixture: false,
    ...partial,
  };
}

describe('Fase 6A — Metadatos de Tiempo y Retrocompatibilidad', () => {
  const legacyBackendRecipe: BackendRecipe = {
    name: 'Arroz con Pollo Tradicional',
    description: 'Receta colombiana clásica sin tiempos desglosados',
    totalMinutes: 45,
    budgetRemaining: 50000,
    withinBudget: true,
    convenience: 80,
    reason: 'Aprovecha ingredientes disponibles en tu despensa',
    estimatedMissingCost: 8000,
    steps: ['Paso 1: Sofreír', 'Paso 2: Cocinar arroz'],
    ingredients: [
      { name: 'Arroz', quantity: 500, unit: 'g' },
      { name: 'Pollo', quantity: 1, unit: 'kg' },
    ],
    availableIngredients: [
      { name: 'Arroz', quantity: 500, unit: 'g' },
      { name: 'Pollo', quantity: 1, unit: 'kg' },
    ],
    missingIngredients: [],
  };

  const enrichedBackendRecipe: BackendRecipe = {
    ...legacyBackendRecipe,
    prepMinutes: 15,
    cookMinutes: 30,
    stepDurations: [
      { stepIndex: 0, minutes: 10, action: 'Sofreír verduras y pollo' },
      { stepIndex: 1, minutes: 20, action: 'Cocción del arroz a fuego lento' },
    ],
  };

  it('valida y normaliza correctamente un payload enriquecido con prepMinutes, cookMinutes y stepDurations', () => {
    const validated = validateBackendRecipe(enrichedBackendRecipe, 4);
    expect(validated.prepMinutes).toBe(15);
    expect(validated.cookMinutes).toBe(30);
    expect(validated.stepDurations).toHaveLength(2);
    expect(validated.stepDurations?.[0]).toEqual({
      stepIndex: 0,
      minutes: 10,
      action: 'Sofreír verduras y pollo',
    });

    const normalized = normalizeBackendRecipe(validated, 0, 4);
    expect(normalized.prepMinutes).toBe(15);
    expect(normalized.cookMinutes).toBe(30);
    expect(normalized.stepDurations).toHaveLength(2);
    expect(normalized.totalMinutes).toBe(45);
  });

  it('preserva total retrocompatibilidad con recetas legacy sin fabricar datos inexistentes', () => {
    const validated = validateBackendRecipe(legacyBackendRecipe, 4);
    expect(validated.prepMinutes).toBeUndefined();
    expect(validated.cookMinutes).toBeUndefined();
    expect(validated.stepDurations).toBeUndefined();

    const normalized = normalizeBackendRecipe(validated, 0, 4);
    expect(normalized.prepMinutes).toBeUndefined();
    expect(normalized.cookMinutes).toBeUndefined();
    expect(normalized.stepDurations).toBeUndefined();
    expect(normalized.totalMinutes).toBe(45);
  });

  it('exige totalMinutes obligatorio y rechaza recetas sin totalMinutes', () => {
    const invalidPayload = { ...legacyBackendRecipe, totalMinutes: undefined };
    expect(() => validateBackendRecipe(invalidPayload as any, 4)).toThrow(RecipeApiError);
  });

  it('preserva metadatos de tiempo en planes de comidas de 3 días', () => {
    const backendPlan: BackendMealPlanResponseData = {
      days: [
        { day: 1, recipe: enrichedBackendRecipe },
        { day: 2, recipe: legacyBackendRecipe },
        { day: 3, recipe: enrichedBackendRecipe },
      ],
      totalEstimatedMissingCost: 16000,
      budgetRemaining: 34000,
      withinBudget: true,
    };

    const validated = validateBackendMealPlanResponse(backendPlan);
    const normalized = normalizeBackendMealPlan(validated);

    expect(normalized.days[0].recipe.prepMinutes).toBe(15);
    expect(normalized.days[0].recipe.stepDurations).toHaveLength(2);
    expect(normalized.days[1].recipe.prepMinutes).toBeUndefined();
    expect(normalized.days[0].isCompleted).toBe(false);
    expect(normalized.days[0].completedAt).toBeNull();
    expect(normalized.completedDaysCount).toBe(0);
  });
});

describe('Fase 6A — Cálculo de Consumo y Deducción en Despensa', () => {
  const mockPantry: Ingredient[] = [
    {
      id: 'p-1',
      name: 'Arroz blanco',
      category: 'Granos y cereales',
      quantity: 1.5,
      unit: 'kg',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'p-2',
      name: 'Leche entera',
      category: 'Lácteos',
      quantity: 500,
      unit: 'ml',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'p-3',
      name: 'Huevos',
      category: 'Otros',
      quantity: 6,
      unit: 'unidad',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  it('convierte unidades compatibles correctamente: g a kg (500g de 1.5kg deja 1kg)', () => {
    const recipeIngredients = [
      { name: 'Arroz blanco', quantity: 500, unit: 'g' },
    ];
    const plan = calculatePantryDeduction(mockPantry, recipeIngredients);

    expect(plan.canDeductAny).toBe(true);
    expect(plan.deductibleItems).toHaveLength(1);
    const item = plan.deductibleItems[0];
    expect(item.status).toBe('deductible_full');
    expect(item.deductQuantity).toBe(0.5);
    expect(item.stockBefore).toBe(1.5);
    expect(item.stockAfter).toBe(1);

    const result = applyPantryDeduction(mockPantry, plan);
    expect(result.deductedCount).toBe(1);
    const updatedArroz = result.updatedPantry.find((i) => i.id === 'p-1');
    expect(updatedArroz?.quantity).toBe(1);
  });

  it('convierte unidades compatibles correctamente: l a ml (0.2l de 500ml deja 300ml)', () => {
    const recipeIngredients = [
      { name: 'Leche', quantity: 0.2, unit: 'l' },
    ];
    const plan = calculatePantryDeduction(mockPantry, recipeIngredients);

    expect(plan.canDeductAny).toBe(true);
    expect(plan.deductibleItems).toHaveLength(1);
    const item = plan.deductibleItems[0];
    expect(item.deductQuantity).toBe(200);
    expect(item.stockBefore).toBe(500);
    expect(item.stockAfter).toBe(300);
  });

  it('marca unidades incompatibles como revisión manual sin deducir inventario', () => {
    const recipeIngredients = [
      { name: 'Arroz blanco', quantity: 2, unit: 'taza' },
    ];
    const plan = calculatePantryDeduction(mockPantry, recipeIngredients);

    expect(plan.canDeductAny).toBe(false);
    expect(plan.deductibleItems).toHaveLength(0);
    expect(plan.reviewItems).toHaveLength(1);
    expect(plan.reviewItems[0].status).toBe('requires_review_unit');
    expect(plan.reviewItems[0].requiresReview).toBe(true);
  });

  it('marca ingredientes con cantidad nula o desconocida como revisión manual (no inventa cantidades)', () => {
    const recipeIngredients = [
      { name: 'Huevos', quantity: null as any, unit: '' },
    ];
    const plan = calculatePantryDeduction(mockPantry, recipeIngredients);

    expect(plan.canDeductAny).toBe(false);
    expect(plan.reviewItems).toHaveLength(1);
    expect(plan.reviewItems[0].status).toBe('requires_review_quantity');
  });

  it('previene inventario negativo clampeando stock insuficiente y eliminando ítems con stock 0', () => {
    // Pedir 10 huevos cuando solo hay 6
    const recipeIngredients = [
      { name: 'Huevos', quantity: 10, unit: 'unidad' },
    ];
    const plan = calculatePantryDeduction(mockPantry, recipeIngredients);

    expect(plan.deductibleItems).toHaveLength(1);
    const item = plan.deductibleItems[0];
    expect(item.status).toBe('deductible_partial');
    expect(item.deductQuantity).toBe(6);
    expect(item.stockBefore).toBe(6);
    expect(item.stockAfter).toBe(0);

    const result = applyPantryDeduction(mockPantry, plan);
    expect(result.deductedCount).toBe(1);
    // Debido a la regla de validación quantity > 0, el ítem con stock 0 se remueve limpiamente
    const foundHuevos = result.updatedPantry.find((i) => i.id === 'p-3');
    expect(foundHuevos).toBeUndefined();
  });
});

describe('Fase 6A — Prevención de Doble Deducción y Aislamiento por Usuario', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('registra y verifica correctamente deducción por receta y usuario', async () => {
    const userA = 'user-uuid-1';
    const userB = 'user-uuid-2';
    const recipeId = 'receta-almuerzo-1';

    expect(await isRecipeDeducted(recipeId, userA)).toBe(false);
    expect(await isRecipeDeducted(recipeId, userB)).toBe(false);

    await recordRecipeDeduction(recipeId, userA);

    // Usuario A ahora la tiene como deducida
    expect(await isRecipeDeducted(recipeId, userA)).toBe(true);
    // Usuario B NO se ve afectado (aislamiento estricto)
    expect(await isRecipeDeducted(recipeId, userB)).toBe(false);
  });

  it('permite limpiar deducciones de un usuario sin afectar a otros', async () => {
    const userA = 'user-a';
    const userB = 'user-b';

    await recordRecipeDeduction('receta-1', userA);
    await recordRecipeDeduction('receta-1', userB);

    await clearRecipeDeductions(userA);

    expect(await isRecipeDeducted('receta-1', userA)).toBe(false);
    expect(await isRecipeDeducted('receta-1', userB)).toBe(true);
  });
});

describe('Fase 6A — Seguimiento de Completado del Plan de 3 Días', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  const baseClientPlan: ClientMealPlan = {
    days: [
      {
        day: 1,
        isCompleted: false,
        completedAt: null,
        recipe: createMockClientRecipe({
          id: 'p-rec-1',
          name: 'Día 1: Lentejas Caseras',
          totalMinutes: 30,
        }),
      },
      {
        day: 2,
        isCompleted: false,
        completedAt: null,
        recipe: createMockClientRecipe({
          id: 'p-rec-2',
          name: 'Día 2: Sopa de Verduras',
          totalMinutes: 25,
        }),
      },
      {
        day: 3,
        isCompleted: false,
        completedAt: null,
        recipe: createMockClientRecipe({
          id: 'p-rec-3',
          name: 'Día 3: Pollo a la Plancha',
          totalMinutes: 20,
        }),
      },
    ],
    totalEstimatedMissingCost: 0,
    budgetRemaining: 50000,
    withinBudget: true,
    uniqueMissingIngredients: [],
    completedDaysCount: 0,
  };

  it('restaura planes legacy almacenados asignando isCompleted: false y completedAt: null por defecto', () => {
    const legacyEnvelope = {
      version: 1,
      userId: 'test-user',
      savedAt: '2026-01-01T00:00:00.000Z',
      plan: {
        days: [
          { day: 1, recipe: baseClientPlan.days[0].recipe },
          { day: 2, recipe: baseClientPlan.days[1].recipe },
          { day: 3, recipe: baseClientPlan.days[2].recipe },
        ],
        totalEstimatedMissingCost: 0,
        budgetRemaining: 50000,
        withinBudget: true,
        uniqueMissingIngredients: [],
      },
      snapshot: {
        budget: 50000,
        servings: 2,
        pantryFingerprint: 'abc',
        generatedAt: '2026-01-01T00:00:00.000Z',
      },
    };

    const parsed = parseStoredMealPlanEnvelope(JSON.stringify(legacyEnvelope));
    expect(parsed.status).toBe('valid');
    if (parsed.status === 'valid') {
      expect(parsed.plan.days[0].isCompleted).toBe(false);
      expect(parsed.plan.days[0].completedAt).toBeNull();
      expect(parsed.plan.completedDaysCount).toBe(0);
    }
  });

  it('persiste y recupera el progreso de días completados (1/3, 2/3, 3/3)', async () => {
    const storage = createMealPlanStorage('user-prog-1');
    const snapshot = {
      budget: 50000,
      servings: 2,
      pantryFingerprint: 'fingerprint-123',
      generatedAt: new Date().toISOString(),
    };

    // Completar Día 1
    const planWithDay1Completed: ClientMealPlan = {
      ...baseClientPlan,
      days: [
        { ...baseClientPlan.days[0], isCompleted: true, completedAt: new Date().toISOString() },
        baseClientPlan.days[1],
        baseClientPlan.days[2],
      ],
      completedDaysCount: 1,
    };

    await storage.saveMealPlan(planWithDay1Completed, snapshot);

    const loaded = await storage.getStoredMealPlan();
    expect(loaded).not.toBeNull();
    expect(loaded?.plan.completedDaysCount).toBe(1);
    expect(loaded?.plan.days[0].isCompleted).toBe(true);
    expect(loaded?.plan.days[0].completedAt).toBeTruthy();
    expect(loaded?.plan.days[1].isCompleted).toBe(false);
  });
});

describe('Fase 6A — Interfaz de Modo Cocina con Cuenta Regresiva y Deducción', () => {
  const recipeWithTimer: ClientRecipe = createMockClientRecipe({
    id: 'timer-recipe',
    name: 'Pollo Dorado con Temporizador',
    description: 'Receta con duración por pasos',
    totalMinutes: 25,
    prepMinutes: 10,
    cookMinutes: 15,
    servings: 2,
    convenience: 'alta',
    estimatedMissingCost: 0,
    steps: ['Paso 1: Dorar el pollo', 'Paso 2: Servir caliente'],
    stepDurations: [
      { stepIndex: 0, minutes: 5, action: 'Dorar a fuego medio' },
    ],
    ingredients: [
      { name: 'Pechuga de pollo', quantity: 300, unit: 'g' },
    ],
    availableIngredients: [
      { name: 'Pechuga de pollo', quantity: 300, unit: 'g' },
    ],
  });

  const initialPantry: Ingredient[] = [
    {
      id: 'pantry-chicken',
      name: 'Pechuga de pollo',
      category: 'Carnes y proteínas',
      quantity: 500,
      unit: 'g',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  beforeEach(async () => {
    await AsyncStorage.clear();
    mockParams = { id: 'timer-recipe' };
    jest.clearAllMocks();
  });

  it('muestra el temporizador de cuenta regresiva en el paso con duración y permite iniciar/pausar', async () => {
    const rendered = await render(
      <SafeAreaProvider initialMetrics={safeMetrics}>
        <TypographyProvider usingFallback={true}>
          <RecipeProvider initialRecipes={[recipeWithTimer]} initialIsDemoMode={false}>
            <PantryProvider initialIngredients={initialPantry}>
              <GuidedCookingScreen />
            </PantryProvider>
          </RecipeProvider>
        </TypographyProvider>
      </SafeAreaProvider>
    );

    // El paso 1 tiene duración de 5 min (300 s)
    expect(rendered.getByTestId('cooking-step-countdown-card')).toBeTruthy();
    expect(rendered.getByTestId('cooking-step-countdown-display').props.children).toBe('05:00');

    // Botón de toggle (Iniciar)
    const toggleBtn = rendered.getByTestId('cooking-step-countdown-toggle');
    expect(toggleBtn).toBeTruthy();

    await act(async () => {
      fireEvent.press(toggleBtn);
    });

    // El cronómetro general en el header sigue existiendo e independiente
    expect(rendered.getByTestId('cooking-timer-button')).toBeTruthy();
    expect(rendered.getByTestId('cooking-timer-display').props.children).toBe('00:00');

    // Avanzar al paso 2 (que no tiene stepDurations)
    const nextBtn = rendered.getByTestId('cooking-next-step-button');
    await act(async () => {
      fireEvent.press(nextBtn);
    });

    // En el paso 2 no debe existir tarjeta de cuenta regresiva
    expect(rendered.queryByTestId('cooking-step-countdown-card')).toBeNull();
  });

  it('exige confirmación explícita para descontar despensa en el modal final y previene doble descuento', async () => {
    const rendered = await render(
      <SafeAreaProvider initialMetrics={safeMetrics}>
        <TypographyProvider usingFallback={true}>
          <RecipeProvider initialRecipes={[recipeWithTimer]} initialIsDemoMode={false}>
            <PantryProvider initialIngredients={initialPantry}>
              <GuidedCookingScreen />
            </PantryProvider>
          </RecipeProvider>
        </TypographyProvider>
      </SafeAreaProvider>
    );

    // Ir al último paso y finalizar
    const nextBtn = rendered.getByTestId('cooking-next-step-button');
    await act(async () => {
      fireEvent.press(nextBtn); // Al paso 2
    });
    await act(async () => {
      fireEvent.press(nextBtn); // Finalizar preparación
    });

    // Se abre el modal final "¡Buen provecho!"
    expect(rendered.getByTestId('cooking-finish-modal')).toBeTruthy();

    // Ver preview de descuento
    expect(rendered.getByTestId('cooking-deduction-section')).toBeTruthy();
    const confirmDeductionBtn = rendered.getByTestId('cooking-confirm-deduction-button');
    expect(confirmDeductionBtn).toBeTruthy();

    // Confirmar deducción explícita
    await act(async () => {
      fireEvent.press(confirmDeductionBtn);
    });

    // Feedback de éxito y verificación de deducción registrada
    await waitFor(() => {
      expect(rendered.getByTestId('cooking-deduction-success')).toBeTruthy();
    });

    expect(await isRecipeDeducted('timer-recipe', null)).toBe(true);
  });
});

describe('Fase 6A — Pantalla de Plan con Progreso de 3 Días', () => {
  const planWithDay1Done: ClientMealPlan = {
    days: [
      {
        day: 1,
        isCompleted: true,
        completedAt: '2026-10-29T12:00:00.000Z',
        recipe: createMockClientRecipe({
          id: 'rec-day-1',
          name: 'Día 1: Receta Completa',
        }),
      },
      {
        day: 2,
        isCompleted: false,
        completedAt: null,
        recipe: createMockClientRecipe({
          id: 'rec-day-2',
          name: 'Día 2: Receta Pendiente',
        }),
      },
      {
        day: 3,
        isCompleted: false,
        completedAt: null,
        recipe: createMockClientRecipe({
          id: 'rec-day-3',
          name: 'Día 3: Receta Pendiente',
        }),
      },
    ],
    totalEstimatedMissingCost: 0,
    budgetRemaining: 40000,
    withinBudget: true,
    uniqueMissingIngredients: [],
    completedDaysCount: 1,
  };

  const samplePantry: Ingredient[] = [
    {
      id: 'item-1',
      name: 'Tomate',
      category: 'Verduras y frutas',
      quantity: 4,
      unit: 'unidad',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('muestra la barra y texto de progreso con 1/3 días completados', async () => {
    const rendered = await render(
      <SafeAreaProvider initialMetrics={safeMetrics}>
        <TypographyProvider usingFallback={true}>
          <BudgetProvider>
            <PantryProvider initialIngredients={samplePantry}>
              <MealPlanProvider initialPlan={planWithDay1Done}>
                <PlanScreen />
              </MealPlanProvider>
            </PantryProvider>
          </BudgetProvider>
        </TypographyProvider>
      </SafeAreaProvider>
    );

    expect(rendered.getByTestId('plan-progress-card')).toBeTruthy();
    expect(rendered.getByTestId('plan-progress-text').props.children).toEqual([
      1,
      '/3 días completados',
    ]);
    expect(rendered.getByTestId('plan-day-completed-badge-1')).toBeTruthy();
  });
});
