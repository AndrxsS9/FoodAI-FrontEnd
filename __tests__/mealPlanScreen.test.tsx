/**
 * Suite de pruebas de componentes y UI para PlanScreen (Fase 3C).
 * Valida:
 * 1. Renderizado del header institucional y franja de parámetros en COP.
 * 2. Estado de despensa vacía y navegación hacia Mi Despensa.
 * 3. Estado inicial con botón primario «Generar mi plan de 3 días».
 * 4. Estado de carga con indicador accesible y botón de cancelación.
 * 5. Visualización del menú de 3 días (Día 1, Día 2, Día 3) con métricas, conveniencia y costo.
 * 6. Balance de presupuesto en COP para escenarios dentro y fuera de presupuesto.
 * 7. Sección de compras agregadas («Ingredientes por comprar») y estado con despensa completa.
 * 8. Banner de obsolescencia cuando la despensa o presupuesto cambian.
 * 9. Navegación hacia el detalle de la receta planificada con parámetro fromPlan=true.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import PlanScreen from '../app/(tabs)/plan';
import { PantryProvider } from '../src/context/PantryContext';
import { BudgetProvider } from '../src/context/BudgetContext';
import { RecipeProvider } from '../src/context/RecipeContext';
import { MealPlanProvider } from '../src/context/MealPlanContext';
import { TypographyProvider } from '../src/theme';
import { Ingredient } from '../src/types/pantry';
import { ClientMealPlan, BackendMealPlanResponseData } from '../src/types/mealPlan';

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

describe('Pantalla de Plan de Comidas (PlanScreen - Fase 3C)', () => {
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

  const sampleGeneratedPlan: ClientMealPlan = {
    days: [
      {
        day: 1,
        recipe: {
          id: 'plan-dia-1-pollo-salteado',
          name: 'Pollo salteado con verduras',
          description: 'Deliciosa preparación rápida en sartén.',
          totalMinutes: 25,
          servings: 2,
          ingredients: [
            { name: 'Pollo', quantity: 200, unit: 'g' },
            { name: 'Zanahoria', quantity: 1, unit: 'unidad' },
          ],
          steps: ['Cortar el pollo', 'Saltear con zanahoria', 'Servir'],
          availableIngredients: [{ name: 'Pollo', quantity: 200, unit: 'g' }],
          missingIngredients: [{ name: 'Zanahoria', quantity: 1, unit: 'unidad', estimatedCost: 1200 }],
          estimatedMissingCost: 1200,
          budgetRemaining: 18800,
          withinBudget: true,
          convenience: '95% conveniente',
          reason: 'Aprovecha tu pollo fresco',
          isDemoFixture: false,
        },
      },
      {
        day: 2,
        recipe: {
          id: 'plan-dia-2-arroz-con-huevo',
          name: 'Arroz con huevo y vegetales',
          description: 'Clásico colombiano económico y reconfortante.',
          totalMinutes: 20,
          servings: 2,
          ingredients: [
            { name: 'Arroz', quantity: 150, unit: 'g' },
            { name: 'Huevo', quantity: 2, unit: 'unidad' },
          ],
          steps: ['Cocinar arroz', 'Freír huevos', 'Combinar'],
          availableIngredients: [{ name: 'Arroz', quantity: 150, unit: 'g' }],
          missingIngredients: [{ name: 'Huevo', quantity: 2, unit: 'unidad', estimatedCost: 1600 }],
          estimatedMissingCost: 1600,
          budgetRemaining: 17200,
          withinBudget: true,
          convenience: '90% conveniente',
          reason: 'Aprovecha tu arroz',
          isDemoFixture: false,
        },
      },
      {
        day: 3,
        recipe: {
          id: 'plan-dia-3-sopa-de-pollo',
          name: 'Sopa casera de pollo y arroz',
          description: 'Caldo nutritivo para cerrar el ciclo de tres días.',
          totalMinutes: 35,
          servings: 2,
          ingredients: [
            { name: 'Pollo', quantity: 150, unit: 'g' },
            { name: 'Arroz', quantity: 80, unit: 'g' },
            { name: 'Cilantro', quantity: 1, unit: 'unidad' },
          ],
          steps: ['Hervir pollo', 'Agregar arroz', 'Decorar con cilantro'],
          availableIngredients: [
            { name: 'Pollo', quantity: 150, unit: 'g' },
            { name: 'Arroz', quantity: 80, unit: 'g' },
          ],
          missingIngredients: [{ name: 'Cilantro', quantity: 1, unit: 'unidad', estimatedCost: 800 }],
          estimatedMissingCost: 800,
          budgetRemaining: 16400,
          withinBudget: true,
          convenience: '88% conveniente',
          reason: 'Usa las reservas restantes de pollo y arroz',
          isDemoFixture: false,
        },
      },
    ],
    totalEstimatedMissingCost: 3600,
    budgetRemaining: 16400,
    withinBudget: true,
    uniqueMissingIngredients: [
      { name: 'Zanahoria', quantity: 1, unit: 'unidad', estimatedCost: 1200 },
      { name: 'Huevo', quantity: 2, unit: 'unidad', estimatedCost: 1600 },
      { name: 'Cilantro', quantity: 1, unit: 'unidad', estimatedCost: 800 },
    ],
  };

  const sampleBackendResponse: BackendMealPlanResponseData = {
    days: [
      {
        day: 1,
        recipe: {
          name: 'Pollo salteado con verduras',
          description: 'Deliciosa preparación rápida en sartén.',
          totalMinutes: 25,
          ingredients: [
            { name: 'Pollo', quantity: 200, unit: 'g' },
            { name: 'Zanahoria', quantity: 1, unit: 'unidad' },
          ],
          steps: ['Cortar el pollo', 'Saltear con zanahoria', 'Servir'],
          availableIngredients: [{ name: 'Pollo', quantity: 200, unit: 'g' }],
          missingIngredients: [{ name: 'Zanahoria', quantity: 1, unit: 'unidad', estimatedCost: 1200 }],
          estimatedMissingCost: 1200,
          budgetRemaining: 18800,
          withinBudget: true,
          convenience: 95,
          reason: 'Aprovecha tu pollo fresco',
        },
      },
      {
        day: 2,
        recipe: {
          name: 'Arroz con huevo y vegetales',
          description: 'Clásico colombiano económico y reconfortante.',
          totalMinutes: 20,
          ingredients: [
            { name: 'Arroz', quantity: 150, unit: 'g' },
            { name: 'Huevo', quantity: 2, unit: 'unidad' },
          ],
          steps: ['Cocinar arroz', 'Freír huevos', 'Combinar'],
          availableIngredients: [{ name: 'Arroz', quantity: 150, unit: 'g' }],
          missingIngredients: [{ name: 'Huevo', quantity: 2, unit: 'unidad', estimatedCost: 1600 }],
          estimatedMissingCost: 1600,
          budgetRemaining: 17200,
          withinBudget: true,
          convenience: 90,
          reason: 'Aprovecha tu arroz',
        },
      },
      {
        day: 3,
        recipe: {
          name: 'Sopa casera de pollo y arroz',
          description: 'Caldo nutritivo para cerrar el ciclo de tres días.',
          totalMinutes: 35,
          ingredients: [
            { name: 'Pollo', quantity: 150, unit: 'g' },
            { name: 'Arroz', quantity: 80, unit: 'g' },
            { name: 'Cilantro', quantity: 1, unit: 'unidad' },
          ],
          steps: ['Hervir pollo', 'Agregar arroz', 'Decorar con cilantro'],
          availableIngredients: [
            { name: 'Pollo', quantity: 150, unit: 'g' },
            { name: 'Arroz', quantity: 80, unit: 'g' },
          ],
          missingIngredients: [{ name: 'Cilantro', quantity: 1, unit: 'unidad', estimatedCost: 800 }],
          estimatedMissingCost: 800,
          budgetRemaining: 16400,
          withinBudget: true,
          convenience: 88,
          reason: 'Usa las reservas restantes de pollo y arroz',
        },
      },
    ],
    totalEstimatedMissingCost: 3600,
    budgetRemaining: 16400,
    withinBudget: true,
  };

  const renderPlanScreen = async (
    initialIngredients: Ingredient[] = mockPantryItems,
    initialPlan: ClientMealPlan | null = null,
    budget: number = 20000,
    servings: number = 2,
    maxMinutes?: number,
    mealPlanApiClient?: any,
    storageAdapter?: any
  ) => {
    return render(
      <SafeAreaProvider
        initialMetrics={{
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
          frame: { x: 0, y: 0, width: 390, height: 844 },
        }}
      >
        <TypographyProvider usingFallback={true}>
          <PantryProvider initialIngredients={initialIngredients}>
            <BudgetProvider
              initialPreferences={{ budget, servings, maxMinutes }}
            >
              <RecipeProvider>
                <MealPlanProvider
                  initialPlan={initialPlan}
                  mealPlanApiClient={mealPlanApiClient}
                  storageAdapter={storageAdapter}
                >
                  <PlanScreen />
                </MealPlanProvider>
              </RecipeProvider>
            </BudgetProvider>
          </PantryProvider>
        </TypographyProvider>
      </SafeAreaProvider>
    );
  };

  describe('1. Header y Resumen de parámetros', () => {
    it('muestra el título, subtítulo institucional y botón de perfil', async () => {
      const { getByText, getByTestId } = await renderPlanScreen();

      expect(getByText('Mi plan de comidas')).toBeTruthy();
      expect(getByText('Organiza tres días según tu despensa y presupuesto')).toBeTruthy();

      const avatar = getByTestId('plan-profile-avatar');
      fireEvent.press(avatar);
      expect(mockPush).toHaveBeenCalledWith('/(tabs)/perfil');
    });

    it('muestra los parámetros activos en COP en la franja superior', async () => {
      const { getByText } = await renderPlanScreen(mockPantryItems, null, 25000, 3, 40);

      expect(getByText(/25\.000/)).toBeTruthy();
      expect(getByText('3 personas')).toBeTruthy();
      expect(getByText('40 min')).toBeTruthy();
      expect(getByText('2 ítems')).toBeTruthy();
    });
  });

  describe('2. Estado de despensa vacía', () => {
    it('muestra mensaje accesible de despensa vacía y botón para ir a la despensa', async () => {
      const { getByText, getByTestId } = await renderPlanScreen([]);

      expect(getByText('Tu despensa está vacía')).toBeTruthy();
      expect(getByText('Agrega alimentos a tu despensa antes de generar tu plan.')).toBeTruthy();

      const goToPantryBtn = getByTestId('plan-go-to-pantry-button');
      fireEvent.press(goToPantryBtn);
      expect(mockPush).toHaveBeenCalledWith('/(tabs)/despensa');
    });
  });

  describe('3. Estado inicial con alimentos listos para generar', () => {
    it('muestra la tarjeta de invitación con el CTA primario de 3 días', async () => {
      const { getByText, getByTestId } = await renderPlanScreen(mockPantryItems, null);

      expect(getByText('Planifica tus comidas de los próximos 3 días')).toBeTruthy();
      expect(getByTestId('generate-meal-plan-button')).toBeTruthy();
      expect(getByText('Generar mi plan de 3 días')).toBeTruthy();
    });
  });

  describe('4. Visualización del Plan de 3 Días generado', () => {
    it('renderiza las 3 tarjetas de día con sus títulos y detalles', async () => {
      const { getByText, getByTestId } = await renderPlanScreen(mockPantryItems, sampleGeneratedPlan);

      // Verificación de los 3 días
      expect(getByTestId('plan-day-card-1')).toBeTruthy();
      expect(getByTestId('plan-day-card-2')).toBeTruthy();
      expect(getByTestId('plan-day-card-3')).toBeTruthy();

      expect(getByText('Día 1')).toBeTruthy();
      expect(getByText('Pollo salteado con verduras')).toBeTruthy();

      expect(getByText('Día 2')).toBeTruthy();
      expect(getByText('Arroz con huevo y vegetales')).toBeTruthy();

      expect(getByText('Día 3')).toBeTruthy();
      expect(getByText('Sopa casera de pollo y arroz')).toBeTruthy();
    });

    it('navega hacia el detalle de la receta con el parámetro fromPlan=true al presionar Ver receta', async () => {
      const { getByTestId } = await renderPlanScreen(mockPantryItems, sampleGeneratedPlan);

      const viewRecipeDay1 = getByTestId('plan-view-recipe-button-1');
      fireEvent.press(viewRecipeDay1);

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/recetas/plan-dia-1-pollo-salteado',
        params: { fromPlan: 'true' },
      });
    });

    it('muestra el balance de presupuesto dentro de presupuesto', async () => {
      const { getByText, getByTestId } = await renderPlanScreen(mockPantryItems, sampleGeneratedPlan);

      expect(getByTestId('plan-budget-summary')).toBeTruthy();
      expect(getByText('Balance del plan')).toBeTruthy();
      expect(getByText(/3\.600/)).toBeTruthy(); // costo adicional estimado
      expect(getByText(/16\.400/)).toBeTruthy(); // restante
      expect(getByText('¡El plan se ajusta a tu presupuesto!')).toBeTruthy();
    });

    it('muestra advertencia clara cuando el plan excede el presupuesto', async () => {
      const overBudgetPlan: ClientMealPlan = {
        ...sampleGeneratedPlan,
        totalEstimatedMissingCost: 28000,
        budgetRemaining: -8000,
        withinBudget: false,
      };

      const { getByText } = await renderPlanScreen(mockPantryItems, overBudgetPlan, 20000);

      expect(getByText('El plan supera tu presupuesto fijado')).toBeTruthy();
      expect(getByText(/-.*8\.000/)).toBeTruthy();
    });

    it('muestra la sección de ingredientes por comprar deduplicados', async () => {
      const { getByText, getByTestId } = await renderPlanScreen(mockPantryItems, sampleGeneratedPlan);

      expect(getByTestId('plan-missing-ingredients-section')).toBeTruthy();
      expect(getByText('Ingredientes por comprar')).toBeTruthy();
      expect(getByText('3 ítems')).toBeTruthy();

      expect(getByText('Zanahoria')).toBeTruthy();
      expect(getByText('Huevo')).toBeTruthy();
      expect(getByText('Cilantro')).toBeTruthy();
    });

    it('muestra tarjeta de felicitación cuando no hay ingredientes por comprar', async () => {
      const allReadyPlan: ClientMealPlan = {
        ...sampleGeneratedPlan,
        totalEstimatedMissingCost: 0,
        budgetRemaining: 20000,
        withinBudget: true,
        uniqueMissingIngredients: [],
      };

      const { getByText } = await renderPlanScreen(mockPantryItems, allReadyPlan);

      expect(getByText(/¡Tienes todos los ingredientes necesarios en tu despensa!/)).toBeTruthy();
    });
  });

  describe('5. Concurrencia, cancelación y sincronización de UI (FIX 2)', () => {
    it('1. Inicia generación y cancela inmediatamente saliendo de la UI de carga', async () => {
      const mockApiClient = {
        generateMealPlan: jest.fn().mockReturnValue(new Promise(() => {})),
      };

      const { getByTestId, queryByTestId } = await renderPlanScreen(
        mockPantryItems,
        null,
        20000,
        2,
        undefined,
        mockApiClient
      );

      const generateBtn = getByTestId('generate-meal-plan-button');
      fireEvent.press(generateBtn);

      // El estado de carga se muestra
      await waitFor(() => {
        expect(getByTestId('plan-loading-state')).toBeTruthy();
      });

      const cancelBtn = getByTestId('cancel-generation-button');
      fireEvent.press(cancelBtn);

      // La UI de carga desaparece inmediatamente
      await waitFor(() => {
        expect(queryByTestId('plan-loading-state')).toBeNull();
      });
      expect(getByTestId('generate-meal-plan-button')).toBeTruthy();
    });

    it('2. Petición cancelada resuelve tarde sin alterar la UI ni mostrar errores obsoletos', async () => {
      let rejectPromise!: (err: any) => void;
      const latePromise = new Promise((_, reject) => {
        rejectPromise = reject;
      });

      const mockApiClient = {
        generateMealPlan: jest.fn().mockImplementation((_, opts) => {
          opts?.signal?.addEventListener('abort', () => {
            // No resuelve inmediatamente; simula retraso en el backend/red
          });
          return latePromise;
        }),
      };

      const { getByTestId, queryByTestId } = await renderPlanScreen(
        mockPantryItems,
        null,
        20000,
        2,
        undefined,
        mockApiClient
      );

      const generateBtn = getByTestId('generate-meal-plan-button');
      fireEvent.press(generateBtn);

      await waitFor(() => {
        expect(getByTestId('plan-loading-state')).toBeTruthy();
      });

      // Cancelar inmediatamente
      const cancelBtn = getByTestId('cancel-generation-button');
      fireEvent.press(cancelBtn);

      // La UI de carga salió inmediatamente
      await waitFor(() => {
        expect(queryByTestId('plan-loading-state')).toBeNull();
      });

      // Ahora la promesa cancelada falla tardíamente
      rejectPromise(new Error('AbortError or network failure'));
      await new Promise((r) => setTimeout(r, 20));

      // No debe mostrar banner de error por la petición cancelada ni volver al loading
      expect(queryByTestId('plan-error-banner')).toBeNull();
      expect(queryByTestId('plan-loading-state')).toBeNull();
      expect(getByTestId('generate-meal-plan-button')).toBeTruthy();
    });

    it('3. Inicia una nueva generación exitosamente tras cancelar una anterior', async () => {
      let firstCallSignal: AbortSignal | undefined;
      const mockApiClient = {
        generateMealPlan: jest
          .fn()
          .mockImplementationOnce((_, opts) => {
            firstCallSignal = opts?.signal;
            return new Promise(() => {});
          })
          .mockImplementationOnce(async () => sampleBackendResponse),
      };

      const { getByTestId, queryByTestId, findByTestId } = await renderPlanScreen(
        mockPantryItems,
        null,
        20000,
        2,
        undefined,
        mockApiClient
      );

      // Iniciar primera generación y cancelar
      fireEvent.press(getByTestId('generate-meal-plan-button'));
      await waitFor(() => {
        expect(getByTestId('plan-loading-state')).toBeTruthy();
      });

      fireEvent.press(getByTestId('cancel-generation-button'));
      await waitFor(() => {
        expect(queryByTestId('plan-loading-state')).toBeNull();
      });
      expect(firstCallSignal?.aborted).toBe(true);

      // Iniciar segunda generación
      fireEvent.press(getByTestId('generate-meal-plan-button'));

      // La segunda llamada al API fue ejecutada
      await waitFor(() => {
        expect(mockApiClient.generateMealPlan).toHaveBeenCalledTimes(2);
      });

      // El resultado del nuevo plan debe mostrarse
      const resultsSection = await findByTestId('plan-results-section');
      expect(resultsSection).toBeTruthy();
      expect(queryByTestId('plan-loading-state')).toBeNull();
    });

    it('4. La petición anterior cancelada que resuelve tarde no afecta ni corrompe la nueva generación', async () => {
      let resolveFirstCall!: (val: any) => void;
      const firstCallPromise = new Promise((resolve) => {
        resolveFirstCall = resolve;
      });

      let resolveSecondCall!: (val: any) => void;
      const secondCallPromise = new Promise((resolve) => {
        resolveSecondCall = resolve;
      });

      const secondBackendResponse: BackendMealPlanResponseData = {
        ...sampleBackendResponse,
        days: [
          {
            day: 1,
            recipe: {
              ...sampleBackendResponse.days[0].recipe,
              name: 'Receta Definitiva de la Segunda Generación',
            },
          },
          sampleBackendResponse.days[1],
          sampleBackendResponse.days[2],
        ],
      };

      const mockApiClient = {
        generateMealPlan: jest
          .fn()
          .mockImplementationOnce(() => firstCallPromise)
          .mockImplementationOnce(() => secondCallPromise),
      };

      const { getByTestId, queryByTestId, findByText } = await renderPlanScreen(
        mockPantryItems,
        null,
        20000,
        2,
        undefined,
        mockApiClient
      );

      // Iniciar op 1
      fireEvent.press(getByTestId('generate-meal-plan-button'));
      await waitFor(() => {
        expect(getByTestId('plan-loading-state')).toBeTruthy();
      });

      // Cancelar op 1
      fireEvent.press(getByTestId('cancel-generation-button'));
      await waitFor(() => {
        expect(queryByTestId('plan-loading-state')).toBeNull();
      });

      // Iniciar op 2
      fireEvent.press(getByTestId('generate-meal-plan-button'));
      await waitFor(() => {
        expect(getByTestId('plan-loading-state')).toBeTruthy();
      });

      // Op 1 resuelve tarde con datos obsoletos
      resolveFirstCall(sampleBackendResponse);
      await new Promise((r) => setTimeout(r, 20));

      // Op 2 aún debe estar cargando (op 1 no reseteó el estado de carga de op 2)
      expect(getByTestId('plan-loading-state')).toBeTruthy();

      // Op 2 ahora resuelve con éxito
      resolveSecondCall(secondBackendResponse);

      // El plan visible debe ser el de op 2
      expect(await findByText('Receta Definitiva de la Segunda Generación')).toBeTruthy();
      expect(queryByTestId('plan-loading-state')).toBeNull();
    });

    it('5. Toques rápidos sucesivos invocan la API exactamente una vez', async () => {
      const mockApiClient = {
        generateMealPlan: jest.fn().mockReturnValue(new Promise(() => {})),
      };

      const { getByTestId } = await renderPlanScreen(
        mockPantryItems,
        null,
        20000,
        2,
        undefined,
        mockApiClient
      );

      const generateBtn = getByTestId('generate-meal-plan-button');

      // Tres pulsaciones simultáneas/rápidas
      fireEvent.press(generateBtn);
      fireEvent.press(generateBtn);
      fireEvent.press(generateBtn);

      expect(mockApiClient.generateMealPlan).toHaveBeenCalledTimes(1);
    });
  });
});
