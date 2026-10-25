/**
 * FoodAI - Pruebas de Regresión Deterministas: Secuencia Monótona de Request IDs (Fase 3C).
 *
 * Valida la corrección del Merge Blocker de Fase 3C:
 * 1. Cada nueva petición recibe un sequenceId y requestId estrictamente monótono incremental (1, 2, ...).
 * 2. La cancelación de una petición en curso limpia activeRequestIdRef sin resetear la secuencia monótona.
 * 3. Una petición cancelada que resuelve o rechaza tardíamente NUNCA puede satisfacer la verificación de
 *    igualdad en su bloque finally, protegiendo la titularidad (ownership) de peticiones activas posteriores.
 * 4. Mientras una petición está activa, pulsaciones rápidas adicionales no disparan llamadas redundantes a la API.
 * 5. Únicamente la petición activa correspondiente puede completar la limpieza del active request al finalizar.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import PlanScreen, { PlanScreenProps } from '../app/(tabs)/plan';
import { PantryProvider } from '../src/context/PantryContext';
import { BudgetProvider } from '../src/context/BudgetContext';
import { RecipeProvider } from '../src/context/RecipeContext';
import { MealPlanProvider } from '../src/context/MealPlanContext';
import { TypographyProvider } from '../src/theme';
import { Ingredient } from '../src/types/pantry';
import { BackendMealPlanResponseData } from '../src/types/mealPlan';

// Mock expo-router
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  }),
}));

describe('Regresión Fase 3C: Secuencia Monótona de Request IDs y Protección contra Reutilización', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  const mockPantryItems: Ingredient[] = [
    {
      id: 'item-1',
      name: 'Pollo',
      quantity: 500,
      unit: 'g',
      category: 'Carnes y proteínas',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'item-2',
      name: 'Arroz',
      quantity: 500,
      unit: 'g',
      category: 'Granos y cereales',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const createBackendDay = (day: number, name: string) => ({
    day,
    recipe: {
      name,
      description: `Descripción plato día ${day}`,
      totalMinutes: 30,
      ingredients: [{ name: 'Pollo', quantity: 200, unit: 'g' }],
      steps: ['Cocinar'],
      availableIngredients: [{ name: 'Pollo', quantity: 200, unit: 'g' }],
      missingIngredients: [{ name: 'Cebolla', quantity: 1, unit: 'unidad', estimatedCost: 1000 }],
      estimatedMissingCost: 1000,
      budgetRemaining: 19000,
      withinBudget: true,
      convenience: 90,
      reason: 'Aprovecha tu pollo',
    },
  });

  const sampleBackendResponseA: BackendMealPlanResponseData = {
    days: [
      createBackendDay(1, 'Receta Petición A (Cancelada)'),
      createBackendDay(2, 'Receta 2 A'),
      createBackendDay(3, 'Receta 3 A'),
    ],
    totalEstimatedMissingCost: 3000,
    budgetRemaining: 17000,
    withinBudget: true,
  };

  const sampleBackendResponseB: BackendMealPlanResponseData = {
    days: [
      createBackendDay(1, 'Receta Definitiva Petición B'),
      createBackendDay(2, 'Receta 2 B'),
      createBackendDay(3, 'Receta 3 B'),
    ],
    totalEstimatedMissingCost: 3000,
    budgetRemaining: 17000,
    withinBudget: true,
  };

  const createMockStorageAdapter = () => {
    let stored: any = null;
    return {
      getStoredMealPlan: jest.fn(async () => stored),
      saveMealPlan: jest.fn(async (plan: any, snapshot: any) => {
        stored = { plan, snapshot };
      }),
      clearMealPlan: jest.fn(async () => {
        stored = null;
      }),
    };
  };

  const renderPlanScreen = async (
    mockApiClient: any,
    planScreenProps?: PlanScreenProps
  ) => {
    return await render(
      <SafeAreaProvider
        initialMetrics={{
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
          frame: { x: 0, y: 0, width: 390, height: 844 },
        }}
      >
        <TypographyProvider usingFallback={true}>
          <PantryProvider initialIngredients={mockPantryItems}>
            <BudgetProvider initialPreferences={{ budget: 20000, servings: 2 }}>
              <RecipeProvider>
                <MealPlanProvider
                  initialPlan={null}
                  mealPlanApiClient={mockApiClient}
                  storageAdapter={createMockStorageAdapter()}
                >
                  <PlanScreen {...planScreenProps} />
                </MealPlanProvider>
              </RecipeProvider>
            </BudgetProvider>
          </PantryProvider>
        </TypographyProvider>
      </SafeAreaProvider>
    );
  };

  it('garantiza secuencia monótona estricta: petición A cancelada que resuelve tarde no puede robar ni resetear la titularidad de la petición B', async () => {
    const trackingEvents: Array<{
      requestId: number;
      activeRequestId: number | null;
      sequenceId: number;
      phase: 'start' | 'cancel' | 'settled';
    }> = [];

    let resolveFirstCall!: (val: any) => void;
    const firstCallPromise = new Promise((resolve) => {
      resolveFirstCall = resolve;
    });

    let resolveSecondCall!: (val: any) => void;
    const secondCallPromise = new Promise((resolve) => {
      resolveSecondCall = resolve;
    });

    const mockApiClient = {
      generateMealPlan: jest
        .fn()
        .mockImplementationOnce(() => firstCallPromise)
        .mockImplementationOnce(() => secondCallPromise),
    };

    const { getByTestId, queryByTestId, findByText } = await renderPlanScreen(
      mockApiClient,
      {
        onRequestTracked: (info) => {
          trackingEvents.push(info);
        },
      }
    );

    const generateBtn = getByTestId('generate-meal-plan-button');

    // 1. Iniciar petición A, con ID 1
    fireEvent.press(generateBtn);
    await waitFor(() => {
      expect(getByTestId('plan-loading-state')).toBeTruthy();
    });

    expect(trackingEvents.length).toBe(1);
    expect(trackingEvents[0]).toEqual({
      requestId: 1,
      activeRequestId: 1,
      sequenceId: 1,
      phase: 'start',
    });
    expect(mockApiClient.generateMealPlan).toHaveBeenCalledTimes(1);

    // 2. Cancelar petición A
    const cancelBtn = getByTestId('cancel-generation-button');
    fireEvent.press(cancelBtn);
    await waitFor(() => {
      expect(queryByTestId('plan-loading-state')).toBeNull();
    });

    expect(trackingEvents.length).toBe(2);
    expect(trackingEvents[1]).toEqual({
      requestId: 1,
      activeRequestId: null,
      sequenceId: 1,
      phase: 'cancel',
    });

    // 3. Iniciar petición B, con ID estrictamente monótono y distinto (ID 2)
    fireEvent.press(getByTestId('generate-meal-plan-button'));
    await waitFor(() => {
      expect(getByTestId('plan-loading-state')).toBeTruthy();
    });

    expect(trackingEvents.length).toBe(3);
    expect(trackingEvents[2]).toEqual({
      requestId: 2,
      activeRequestId: 2,
      sequenceId: 2,
      phase: 'start',
    });
    // Verificación crítica: el ID NO puede ser reutilizado (B debe ser 2, distinto de A que fue 1)
    expect(trackingEvents[2].requestId).not.toBe(trackingEvents[0].requestId);
    expect(trackingEvents[2].requestId).toBe(2);
    expect(mockApiClient.generateMealPlan).toHaveBeenCalledTimes(2);

    // 4. Mantener B pendiente y resolver petición A tardíamente
    await act(async () => {
      resolveFirstCall(sampleBackendResponseA);
      // Damos ciclos al event loop para que cualquier resolución diferida de A se ejecute
      await new Promise((r) => setTimeout(r, 40));
    });

    // 5. Verificar que B sigue siendo la petición activa y que A no reseteó la propiedad de B
    // Con la implementación errónea anterior:
    // A reutilizaba ID 1, y al resolver tarde ejecutaba `1 === 1` en su finally,
    // limpiando activeRequestIdRef y emitiendo un settled prematuro.
    const settledEventsBeforeB = trackingEvents.filter((e) => e.phase === 'settled');
    expect(settledEventsBeforeB.length).toBe(0);
    expect(getByTestId('plan-loading-state')).toBeTruthy();

    // 6. Verificar que pulsaciones rápidas adicionales NO disparan una tercera petición a la API
    // (Protección síncrona de doble toque activa y respetada a nivel de pantalla)
    const rapidTapButton = queryByTestId('generate-meal-plan-button');
    if (rapidTapButton) {
      fireEvent.press(rapidTapButton);
      fireEvent.press(rapidTapButton);
    }
    expect(mockApiClient.generateMealPlan).toHaveBeenCalledTimes(2);

    // 7. Resolver petición B
    await act(async () => {
      resolveSecondCall(sampleBackendResponseB);
    });

    // 8. Verificar que se muestra el plan correcto perteneciente a B
    expect(await findByText('Receta Definitiva Petición B')).toBeTruthy();
    expect(queryByTestId('plan-loading-state')).toBeNull();

    // 9. Verificar que solo la petición B completa la limpieza del active-request
    const settledEventsFinal = trackingEvents.filter((e) => e.phase === 'settled');
    expect(settledEventsFinal.length).toBe(1);
    expect(settledEventsFinal[0]).toEqual({
      requestId: 2,
      activeRequestId: null,
      sequenceId: 2,
      phase: 'settled',
    });
  });
});
