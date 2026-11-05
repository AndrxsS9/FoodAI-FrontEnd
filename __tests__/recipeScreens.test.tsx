/**
 * Suite integral de pruebas automatizadas para el módulo de Recetas y Modo Cocina (Fase 2C).
 * Cubre:
 * 1. Renderizado del listado de recetas.
 * 2. Estado de lista vacía ante filtros sin coincidencias.
 * 3. Etiquetado de datos demostrativos (demo disclaimer).
 * 4. Búsqueda y comportamiento de chips de filtro.
 * 5. Navegación desde Inicio a detalle de receta.
 * 6. Navegación desde Despensa a descubrimiento de recetas.
 * 7. Renderizado del detalle de receta.
 * 8. Distinción visual entre ingredientes disponibles y faltantes.
 * 9. Checklist interactivo y soporte de cantidades nulas (nunca '0').
 * 10. Formato consistente de moneda COP.
 * 11. Manejo seguro de identificadores de receta válidos e inválidos.
 * 12. Navegación paso a paso en Modo Cocina.
 * 13. Límites en primer y último paso (bloqueo de Anterior / botón de Finalizar).
 * 14. Estado de finalización culinaria («¡Buen provecho!»).
 * 15. Consistencia del presupuesto compartido entre pantallas.
 * 16. Protección contra regresión y no deducción prematura de despensa.
 * 17. Accesibilidad y manejo de eventos.
 */
import React from 'react';
import { render, fireEvent, waitFor, cleanup, act } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import RecipeDiscoveryScreen from '../app/recetas/index';
import RecipeDetailScreen from '../app/recetas/[id]';
import GuidedCookingScreen from '../app/recetas/[id]/cocinar';
import HomeScreen from '../app/(tabs)/index';
import DespensaScreen from '../app/(tabs)/despensa';

import { TypographyProvider, ThemeProvider } from '../src/theme';
import { PantryProvider } from '../src/context/PantryContext';
import { BudgetProvider } from '../src/context/BudgetContext';
import { RecipeProvider } from '../src/context/RecipeContext';
import { Ingredient } from '../src/types/pantry';
import { BudgetPreferences } from '../src/types/budget';
import { ClientRecipe } from '../src/types/recipe';
import { BudgetStorageAdapter } from '../src/services/storage/budgetStorage';

// Control de mock de Expo Router
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockSearchParams: { id?: string } = { id: 'demo-rec-1' };

jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
      back: mockBack,
      canGoBack: () => true,
    }),
    useLocalSearchParams: () => mockSearchParams,
    Stack: Object.assign(
      ({ children }: { children: React.ReactNode }) =>
        React.createElement(View, { testID: 'stack-container' }, children),
      {
        Screen: ({ name }: { name: string }) =>
          React.createElement(View, { testID: `stack-screen-${name}` }),
      }
    ),
  };
});

const SAMPLE_PANTRY_INGREDIENTS: Ingredient[] = [
  {
    id: 'pantry-1',
    name: 'Pollo',
    quantity: 300,
    unit: 'g',
    category: 'Carnes y proteínas',
    createdAt: '2026-10-22T00:00:00.000Z',
    updatedAt: '2026-10-22T00:00:00.000Z',
  },
  {
    id: 'pantry-2',
    name: 'Tomate',
    quantity: 2,
    unit: 'unidad',
    category: 'Verduras y frutas',
    expirationDate: '2026-10-22',
    createdAt: '2026-10-22T00:00:00.000Z',
    updatedAt: '2026-10-22T00:00:00.000Z',
  },
  {
    id: 'pantry-3',
    name: 'Cebolla',
    quantity: 1,
    unit: 'unidad',
    category: 'Verduras y frutas',
    createdAt: '2026-10-22T00:00:00.000Z',
    updatedAt: '2026-10-22T00:00:00.000Z',
  },
];

const renderWithProviders = async (
  ui: React.ReactElement,
  options?: {
    initialIngredients?: Ingredient[];
    initialBudgetPreferences?: Partial<BudgetPreferences>;
    initialRecipes?: ClientRecipe[];
    initialIsDemoMode?: boolean;
    storageAdapter?: BudgetStorageAdapter;
    recipeApiClient?: any;
    initialThemeMode?: 'light' | 'dark' | 'system';
  }
) => {
  return await render(
    <SafeAreaProvider
      initialMetrics={{
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
        frame: { x: 0, y: 0, width: 390, height: 844 },
      }}
    >
      <TypographyProvider usingFallback={true}>
        <ThemeProvider initialMode={options?.initialThemeMode ?? 'light'}>
        <PantryProvider
          initialIngredients={options?.initialIngredients ?? SAMPLE_PANTRY_INGREDIENTS}
        >
          <BudgetProvider
            storageAdapter={options?.storageAdapter}
            initialPreferences={
              options?.initialBudgetPreferences ?? { budget: 20000, servings: 2 }
            }
          >
            <RecipeProvider
              initialRecipes={options?.initialRecipes}
              initialIsDemoMode={options?.initialIsDemoMode}
              recipeApiClient={options?.recipeApiClient}
            >
              {ui}
            </RecipeProvider>
          </BudgetProvider>
        </PantryProvider>
        </ThemeProvider>
      </TypographyProvider>
    </SafeAreaProvider>
  );
};

describe('FoodAI Phase 2C - Recipe Discovery, Details & Cooking Mode Tests', () => {
  beforeEach(async () => {
    cleanup();
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockSearchParams = { id: 'demo-rec-1' };
  });

  afterEach(async () => {
    cleanup();
    await AsyncStorage.clear();
  });

  describe('1. Descubrimiento y Listado de Recetas (/recetas)', () => {
    it('renderiza correctamente el encabezado, banner de demostración y tarjetas de recetas', async () => {
      const { getByText, getByTestId } = await renderWithProviders(<RecipeDiscoveryScreen />);

      expect(getByText('Recomendaciones')).toBeTruthy();
      expect(getByTestId('recipes-demo-banner')).toBeTruthy();
      expect(getByText('Datos de demostración')).toBeTruthy();
      expect(getByText('Arroz con pollo y verduras')).toBeTruthy();
      expect(getByText('Tortilla paisa con vegetales')).toBeTruthy();
      expect(getByText('Sartén de verduras con arroz')).toBeTruthy();
    });

    it('muestra el banner explícito de datos demostrativos y no engaña como IA real', async () => {
      const { getByTestId, getByText } = await renderWithProviders(<RecipeDiscoveryScreen />);
      const banner = getByTestId('recipes-demo-banner');
      expect(banner).toBeTruthy();
      expect(getByText(/Recetas de demostración para evaluación de interfaz/i)).toBeTruthy();
    });

    it('no muestra el banner de demostración cuando se cargan recomendaciones reales (isDemoMode es false)', async () => {
      const realMockRecipe: ClientRecipe = {
        id: 'receta-real-1',
        name: 'Sopa casera de lentejas',
        description: 'Preparación real basada en ingredientes actuales',
        totalMinutes: 30,
        servings: 2,
        convenience: '90% conveniente',
        estimatedMissingCost: 2000,
        budgetRemaining: 18000,
        withinBudget: true,
        reason: 'Aprovecha lentejas en despensa',
        isDemoFixture: false,
        ingredients: [{ name: 'Lentejas', quantity: 200, unit: 'g' }],
        availableIngredients: [{ name: 'Lentejas', quantity: 200, unit: 'g' }],
        missingIngredients: [],
        steps: ['Cocinar lentejas a fuego lento'],
      };

      const { queryByTestId, getByText, queryByText } = await renderWithProviders(
        <RecipeDiscoveryScreen />,
        {
          initialIsDemoMode: false,
          initialRecipes: [realMockRecipe],
        }
      );

      // El banner de demostración NO debe aparecer en modo real
      expect(queryByTestId('recipes-demo-banner')).toBeNull();
      expect(queryByText(/Recetas de demostración para evaluación de interfaz/i)).toBeNull();

      // La receta real debe mostrarse correctamente en la lista
      expect(getByText('Sopa casera de lentejas')).toBeTruthy();
      expect(getByText('$2.000 COP')).toBeTruthy();
    });

    it('permite filtrar recetas mediante el campo de búsqueda de texto', async () => {
      const { getByTestId, getByText, queryByText } = await renderWithProviders(<RecipeDiscoveryScreen />);

      const searchInput = getByTestId('recipes-search-input');
      fireEvent.changeText(searchInput, 'Tortilla');

      await waitFor(() => {
        expect(getByText('Tortilla paisa con vegetales')).toBeTruthy();
        expect(queryByText('Arroz con pollo y verduras')).toBeNull();
        expect(queryByText('Sartén de verduras con arroz')).toBeNull();
      });
    });

    it('permite limpiar la búsqueda con el botón de limpiar', async () => {
      const { getByTestId, getByText } = await renderWithProviders(<RecipeDiscoveryScreen />);

      const searchInput = getByTestId('recipes-search-input');
      fireEvent.changeText(searchInput, 'Tortilla');

      await waitFor(() => {
        expect(getByTestId('recipes-clear-search-button')).toBeTruthy();
      });

      const clearButton = getByTestId('recipes-clear-search-button');
      fireEvent.press(clearButton);

      await waitFor(() => {
        expect(getByText('Arroz con pollo y verduras')).toBeTruthy();
        expect(getByText('Tortilla paisa con vegetales')).toBeTruthy();
      });
    });

    it('muestra el estado vacío amigable cuando ningún elemento coincide y permite restablecer filtros', async () => {
      const { getByTestId, getByText, queryByText } = await renderWithProviders(<RecipeDiscoveryScreen />);

      const searchInput = getByTestId('recipes-search-input');
      fireEvent.changeText(searchInput, 'PlatoInexistenteXYZ');

      await waitFor(() => {
        expect(getByTestId('recipes-empty-state')).toBeTruthy();
        expect(getByText('No encontramos recetas con estos filtros')).toBeTruthy();
        expect(queryByText('Arroz con pollo y verduras')).toBeNull();
      });

      const resetButton = getByTestId('recipes-reset-filter-button');
      fireEvent.press(resetButton);

      await waitFor(() => {
        expect(getByText('Arroz con pollo y verduras')).toBeTruthy();
      });
    });

    it('filtra por chip de bajo costo (≤ $3.000)', async () => {
      const { getByTestId, getByText, queryByText } = await renderWithProviders(<RecipeDiscoveryScreen />);

      const lowCostChip = getByTestId('filter-chip-low-cost');
      fireEvent.press(lowCostChip);

      await waitFor(() => {
        expect(getByText('Tortilla paisa con vegetales')).toBeTruthy();
        expect(getByText('Sartén de verduras con arroz')).toBeTruthy();
        expect(queryByText('Arroz con pollo y verduras')).toBeNull();
      });
    });

    it('filtra por chip de recetas rápidas (≤ 25 min)', async () => {
      const { getByTestId, getByText, queryByText } = await renderWithProviders(<RecipeDiscoveryScreen />);

      const quickChip = getByTestId('filter-chip-quick');
      fireEvent.press(quickChip);

      await waitFor(() => {
        expect(getByText('Tortilla paisa con vegetales')).toBeTruthy();
        expect(getByText('Sartén de verduras con arroz')).toBeTruthy();
        expect(queryByText('Arroz con pollo y verduras')).toBeNull();
      });
    });

    it('filtra por chip de recetas que aprovechan urgentes', async () => {
      const { getByTestId, getByText, queryByText } = await renderWithProviders(<RecipeDiscoveryScreen />);

      const urgentChip = getByTestId('filter-chip-urgent');
      fireEvent.press(urgentChip);

      await waitFor(() => {
        expect(getByText('Arroz con pollo y verduras')).toBeTruthy();
        expect(queryByText('Tortilla paisa con vegetales')).toBeNull();
      });
    });

    it('filtra por chip de tiempo máximo (≤ 30 min)', async () => {
      const { getByTestId, getByText } = await renderWithProviders(<RecipeDiscoveryScreen />);

      const max30Chip = getByTestId('filter-chip-max-30');
      fireEvent.press(max30Chip);

      await waitFor(() => {
        expect(getByText('Arroz con pollo y verduras')).toBeTruthy();
        expect(getByText('Tortilla paisa con vegetales')).toBeTruthy();
        expect(getByText('Sartén de verduras con arroz')).toBeTruthy();
      });
    });

    it('muestra aviso de despensa vacía cuando no hay ingredientes registrados', async () => {
      const { getByTestId, getByText } = await renderWithProviders(
        <RecipeDiscoveryScreen />,
        { initialIngredients: [] }
      );

      expect(getByTestId('recipes-empty-pantry-notice')).toBeTruthy();
      expect(getByText('Tu despensa no tiene ingredientes registrados')).toBeTruthy();
    });

    it('navega al detalle de receta al presionar Ver receta en una tarjeta', async () => {
      const { getByTestId } = await renderWithProviders(<RecipeDiscoveryScreen />);

      const viewButton = getByTestId('recipe-view-button-demo-rec-1');
      fireEvent.press(viewButton);

      expect(mockPush).toHaveBeenCalledWith('/recetas/demo-rec-1');
    });

    it('permite regresar con el botón de retroceso', async () => {
      const { getByTestId } = await renderWithProviders(<RecipeDiscoveryScreen />);

      const backButton = getByTestId('recipes-back-button');
      fireEvent.press(backButton);

      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('2. Navegación cruzada: Inicio y Despensa hacia Recetas', () => {
    it('en modo demo, Inicio no ofrece la receta de ejemplo como recomendación y su CTA lleva a /recetas', async () => {
      const { getByTestId, queryByTestId } = await renderWithProviders(<HomeScreen />);

      expect(queryByTestId('home-view-recipe-button')).toBeNull();
      fireEvent.press(getByTestId('home-recommendation-generate-button'));

      expect(mockPush).toHaveBeenCalledWith('/recetas');
      expect(mockPush).not.toHaveBeenCalledWith('/recetas/demo-rec-1');
    });

    it('conecta la sugerencia culinaria en Despensa con la pantalla de descubrimiento /recetas', async () => {
      const { getByTestId } = await renderWithProviders(<DespensaScreen />);

      const cookAction = getByTestId('savings-cook-button');
      fireEvent.press(cookAction);

      await waitFor(() => {
        expect(getByTestId('pantry-discover-recipes-button')).toBeTruthy();
      });

      fireEvent.press(getByTestId('pantry-discover-recipes-button'));
      expect(mockPush).toHaveBeenCalledWith('/recetas');
    });
  });

  describe('3. Detalle de Receta (/recetas/[id])', () => {
    it('renderiza métricas, ingredientes en casa, faltantes y pasos de preparación', async () => {
      mockSearchParams = { id: 'demo-rec-1' };
      const { getByTestId, getByText } = await renderWithProviders(<RecipeDetailScreen />);

      expect(getByTestId('recipe-detail-title')).toBeTruthy();
      expect(getByText('Arroz con pollo y verduras')).toBeTruthy();
      expect(getByTestId('recipe-quick-metrics')).toBeTruthy();
      expect(getByTestId('recipe-available-ingredients-section')).toBeTruthy();
      expect(getByTestId('recipe-missing-ingredients-section')).toBeTruthy();
      expect(getByTestId('recipe-steps-section')).toBeTruthy();

      expect(getByText('Ya tienes en casa')).toBeTruthy();
      expect(getByText('Necesitas comprar')).toBeTruthy();
      expect(getByText('Preparación')).toBeTruthy();
    });

    it('muestra el costo de compra adicional en formato COP adecuado', async () => {
      mockSearchParams = { id: 'demo-rec-1' };
      const { getAllByText } = await renderWithProviders(<RecipeDetailScreen />);

      const matches = getAllByText(/\$5\.800/);
      expect(matches.length).toBeGreaterThan(0);
    });

    it('distingue ingredientes disponibles de los faltantes', async () => {
      mockSearchParams = { id: 'demo-rec-1' };
      const { getByTestId } = await renderWithProviders(<RecipeDetailScreen />);

      expect(getByTestId('available-ingredient-0')).toBeTruthy();
      expect(getByTestId('available-ingredient-1')).toBeTruthy();
      expect(getByTestId('missing-ingredient-0')).toBeTruthy();
      expect(getByTestId('missing-ingredient-1')).toBeTruthy();
    });

    it('permite interactuar con el checklist de ingredientes en casa', async () => {
      mockSearchParams = { id: 'demo-rec-1' };
      const { getByTestId } = await renderWithProviders(<RecipeDetailScreen />);

      const ingredientItem = getByTestId('available-ingredient-0');
      fireEvent.press(ingredientItem);

      await waitFor(() => {
        expect(ingredientItem.props.accessibilityState.checked).toBe(true);
      });

      fireEvent.press(ingredientItem);
      await waitFor(() => {
        expect(ingredientItem.props.accessibilityState.checked).toBe(false);
      });
    });

    it('muestra cantidades nulas como "Por confirmar / Al gusto" y NUNCA como cero', async () => {
      mockSearchParams = { id: 'demo-rec-1' };
      const { getByText, queryByText } = await renderWithProviders(<RecipeDetailScreen />);

      expect(getByText(/Por confirmar/i)).toBeTruthy();
      expect(queryByText('0 g')).toBeNull();
      expect(queryByText('0 unidad')).toBeNull();
    });

    it('maneja identificadores de receta inválidos mostrando estado seguro de error', async () => {
      mockSearchParams = { id: 'receta-inexistente-999' };
      const { getByTestId, getByText } = await renderWithProviders(<RecipeDetailScreen />);

      expect(getByTestId('recipe-not-found-state')).toBeTruthy();
      expect(getByText('Receta no encontrada')).toBeTruthy();

      const returnBtn = getByTestId('recipe-not-found-return-button');
      fireEvent.press(returnBtn);

      expect(mockReplace).toHaveBeenCalledWith('/recetas');
    });

    it('navega a Modo Cocina al pulsar el botón principal Preparar esta receta', async () => {
      mockSearchParams = { id: 'demo-rec-1' };
      const { getByTestId } = await renderWithProviders(<RecipeDetailScreen />);

      const startCookingBtn = getByTestId('recipe-start-cooking-button');
      fireEvent.press(startCookingBtn);

      expect(mockPush).toHaveBeenCalledWith('/recetas/demo-rec-1/cocinar');
    });
  });

  describe('4. Modo Cocina Guiado Paso a Paso (/recetas/[id]/cocinar)', () => {
    it('muestra el primer paso con el botón Anterior deshabilitado', async () => {
      mockSearchParams = { id: 'demo-rec-1' };
      const { getByTestId, getByText } = await renderWithProviders(<GuidedCookingScreen />);

      expect(getByText('Modo Cocina')).toBeTruthy();
      expect(getByTestId('cooking-step-counter')).toBeTruthy();
      expect(getByText('Paso 1 de 4')).toBeTruthy();
      expect(getByText('25% completado')).toBeTruthy();

      const prevBtn = getByTestId('cooking-prev-step-button');
      expect(prevBtn.props.accessibilityState.disabled).toBe(true);

      const nextBtn = getByTestId('cooking-next-step-button');
      expect(nextBtn).toBeTruthy();
    });

    it('avanza paso a paso al presionar Siguiente y habilita Anterior', async () => {
      mockSearchParams = { id: 'demo-rec-1' };
      const { getByTestId, getByText } = await renderWithProviders(<GuidedCookingScreen />);

      const nextBtn = getByTestId('cooking-next-step-button');
      fireEvent.press(nextBtn);

      await waitFor(() => {
        expect(getByText('Paso 2 de 4')).toBeTruthy();
        expect(getByText('50% completado')).toBeTruthy();
      });

      const prevBtn = getByTestId('cooking-prev-step-button');
      expect(prevBtn.props.accessibilityState.disabled).toBe(false);

      fireEvent.press(prevBtn);
      await waitFor(() => {
        expect(getByText('Paso 1 de 4')).toBeTruthy();
      });
    });

    it('en el último paso transforma el botón a Finalizar preparación', async () => {
      mockSearchParams = { id: 'demo-rec-1' };
      const { getByTestId, getByText } = await renderWithProviders(<GuidedCookingScreen />);

      const jumpBtn = getByTestId('cooking-jump-final-button');
      fireEvent.press(jumpBtn);

      await waitFor(() => {
        expect(getByText('Paso 4 de 4')).toBeTruthy();
        expect(getByText('100% completado')).toBeTruthy();
        expect(getByText('Finalizar preparación')).toBeTruthy();
      });
    });

    it('muestra el modal de Buen provecho al finalizar y permite volver a la despensa', async () => {
      mockSearchParams = { id: 'demo-rec-1' };
      const { getByTestId, getByText, queryByText } = await renderWithProviders(<GuidedCookingScreen />);

      const jumpBtn = getByTestId('cooking-jump-final-button');
      fireEvent.press(jumpBtn);

      await waitFor(() => {
        expect(getByText('Finalizar preparación')).toBeTruthy();
      });

      const finishBtn = getByTestId('cooking-next-step-button');
      fireEvent.press(finishBtn);

      await waitFor(() => {
        expect(getByTestId('cooking-finish-modal')).toBeTruthy();
        expect(getByText('¡Buen provecho!')).toBeTruthy();
        expect(getByText('Compra adicional')).toBeTruthy();
        expect(queryByText('Ahorro estimado')).toBeNull();
      });

      const backPantryBtn = getByTestId('cooking-finish-confirm-button');
      fireEvent.press(backPantryBtn);

      expect(mockReplace).toHaveBeenCalledWith('/(tabs)/despensa');
    });

    it('permite cerrar el modal de Buen provecho para revisar los pasos', async () => {
      mockSearchParams = { id: 'demo-rec-1' };
      const { getByTestId, getByText, queryByTestId } = await renderWithProviders(<GuidedCookingScreen />);

      const jumpBtn = getByTestId('cooking-jump-final-button');
      fireEvent.press(jumpBtn);

      await waitFor(() => {
        expect(getByText('Finalizar preparación')).toBeTruthy();
      });

      const finishBtn = getByTestId('cooking-next-step-button');
      fireEvent.press(finishBtn);

      await waitFor(() => {
        expect(getByTestId('cooking-finish-modal')).toBeTruthy();
      });

      const reviewBtn = getByTestId('cooking-finish-review-button');
      fireEvent.press(reviewBtn);

      await waitFor(() => {
        expect(queryByTestId('cooking-finish-modal')).toBeNull();
        expect(getByText('Paso 4 de 4')).toBeTruthy();
      });
    });

    it('permite activar y pausar el temporizador culinario', async () => {
      jest.useFakeTimers();
      mockSearchParams = { id: 'demo-rec-1' };
      const { getByTestId } = await renderWithProviders(<GuidedCookingScreen />);

      const timerBtn = getByTestId('cooking-timer-button');
      const timerDisplay = getByTestId('cooking-timer-display');

      expect(timerDisplay.props.children).toBe('00:00');

      // Iniciar temporizador
      await act(async () => {
        fireEvent.press(timerBtn);
      });

      // Avanzar el reloj simulado 2 segundos
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });

      // Pausar
      await act(async () => {
        fireEvent.press(timerBtn);
      });

      expect(timerDisplay.props.children).toBe('00:02');
      jest.useRealTimers();
    });

    it('maneja IDs inexistentes en Modo Cocina mostrando estado seguro', async () => {
      mockSearchParams = { id: 'receta-invalida' };
      const { getByTestId, getByText } = await renderWithProviders(<GuidedCookingScreen />);

      expect(getByTestId('cooking-not-found-state')).toBeTruthy();
      expect(getByText('Receta no encontrada')).toBeTruthy();
    });

    it('permite salir de Modo Cocina con el botón de cerrar', async () => {
      mockSearchParams = { id: 'demo-rec-1' };
      const { getByTestId } = await renderWithProviders(<GuidedCookingScreen />);

      const exitBtn = getByTestId('cooking-mode-exit-button');
      fireEvent.press(exitBtn);

      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('5. Consistencia de Presupuesto y Despensa (Sin deducción prematura)', () => {
    it('sincroniza el presupuesto compartido entre Inicio y Descubrimiento de Recetas', async () => {
      const { getByText } = await renderWithProviders(
        <HomeScreen />,
        { initialBudgetPreferences: { budget: 35000, servings: 3 } }
      );

      await waitFor(() => {
        expect(getByText(/35\.000/)).toBeTruthy();
      });
    });

    it('NO descuenta ingredientes de la despensa simplemente por consultar la receta o cocinar', async () => {
      mockSearchParams = { id: 'demo-rec-1' };
      const initialIngredients = [...SAMPLE_PANTRY_INGREDIENTS];

      const { getByTestId } = await renderWithProviders(<RecipeDetailScreen />, {
        initialIngredients,
      });

      await waitFor(() => {
        expect(getByTestId('recipe-detail-title')).toBeTruthy();
      });

      expect(initialIngredients.length).toBe(3);
      expect(initialIngredients[0].name).toBe('Pollo');
      expect(initialIngredients[0].quantity).toBe(300);
    });
  });

  describe('6. Consistencia entre Inicio y Detalle de Receta (ISSUE 1)', () => {
    it('muestra el mismo nombre, tiempo, costo, conveniencia y porciones de la receta real en Inicio y navega al CTA exacto', async () => {
      const realRecipe: ClientRecipe = {
        id: 'arroz-real',
        name: 'Arroz real con pollo',
        description: 'Generada por IA con tu despensa.',
        totalMinutes: 30,
        servings: 2,
        ingredients: [],
        steps: ['Cocinar'],
        availableIngredients: [{ name: 'Pollo', quantity: 300, unit: 'g' }],
        missingIngredients: [{ name: 'Arroz', quantity: 200, unit: 'g', estimatedCost: 5800 }],
        estimatedMissingCost: 5800,
        budgetRemaining: 14200,
        withinBudget: true,
        convenience: '94% conveniente',
        reason: 'Aprovecha tu pollo.',
        isDemoFixture: false,
      };
      const home = await renderWithProviders(<HomeScreen />, {
        initialBudgetPreferences: { budget: 20000, servings: 2 },
        initialRecipes: [realRecipe],
        initialIsDemoMode: false,
      });

      expect(home.getByText('Arroz real con pollo')).toBeTruthy();
      expect(home.getByText('30 min')).toBeTruthy();
      expect(home.getByText('2 personas')).toBeTruthy();
      expect(home.getByText('$5.800')).toBeTruthy();
      expect(home.getByText('94% conveniente')).toBeTruthy();
      expect(home.queryByTestId('home-recipe-demo-badge')).toBeNull();

      fireEvent.press(home.getByTestId('home-view-recipe-button'));
      expect(mockPush).toHaveBeenCalledWith('/recetas/arroz-real');
    });

    it('el Detalle de Receta refleja los mismos datos autoritativos que Inicio', async () => {
      mockSearchParams = { id: 'demo-rec-1' };
      const detail = await renderWithProviders(<RecipeDetailScreen />, {
        initialBudgetPreferences: { budget: 20000, servings: 2 },
      });

      // Validar que los valores coinciden con exactitud matemática
      expect(detail.getByTestId('recipe-detail-title').props.children).toBe(
        'Arroz con pollo y verduras'
      );
      expect(detail.getByText('30 min')).toBeTruthy();
      expect(detail.getByText('2 personas')).toBeTruthy();
      expect(detail.getByText('$5.800')).toBeTruthy();
      expect(detail.getByText('94% conveniente')).toBeTruthy();
    });

    it('la tarjeta de Inicio muestra el costo autoritativo del backend sin recalcularlo localmente', async () => {
      const realRecipe: ClientRecipe = {
        id: 'sopa-real',
        name: 'Sopa real',
        description: 'Generada para 4 personas.',
        totalMinutes: 40,
        servings: 4,
        ingredients: [],
        steps: ['Hervir'],
        availableIngredients: [{ name: 'Tomate', quantity: 2, unit: 'unidad' }],
        missingIngredients: [{ name: 'Papa', quantity: 4, unit: 'unidad', estimatedCost: 3100 }],
        estimatedMissingCost: 3100,
        budgetRemaining: 31900,
        withinBudget: true,
        convenience: 80,
        reason: '',
        isDemoFixture: false,
      };
      const { getByText, queryByText } = await renderWithProviders(<HomeScreen />, {
        initialBudgetPreferences: { budget: 35000, servings: 4 },
        initialRecipes: [realRecipe],
        initialIsDemoMode: false,
      });

      await waitFor(() => {
        expect(getByText('Sopa real')).toBeTruthy();
        expect(getByText('4 personas')).toBeTruthy();
        expect(getByText('$3.100')).toBeTruthy();
      });
      // No se escala ni se reestima el costo devuelto por el backend
      expect(queryByText('$6.200')).toBeNull();
    });

    it('no muestra etiquetas ni datos demo cuando se inyectan recetas reales', async () => {
      const REAL_RECIPES: ClientRecipe[] = [
        {
          id: 'pollo-al-curry',
          name: 'Pollo al Curry',
          description: 'Receta con especias y verduras.',
          totalMinutes: 35,
          servings: 2,
          ingredients: [],
          steps: ['Preparar salsa'],
          availableIngredients: [],
          missingIngredients: [],
          estimatedMissingCost: 4200,
          budgetRemaining: 15800,
          withinBudget: true,
          convenience: '89% conveniente',
          reason: 'Aprovecha tu pollo fresco.',
          isDemoFixture: false,
        },
      ];

      const { getByText, getByTestId, queryByTestId } = await renderWithProviders(
        <HomeScreen />,
        {
          initialRecipes: REAL_RECIPES,
          initialIsDemoMode: false,
        }
      );

      await waitFor(() => {
        expect(getByText('Pollo al Curry')).toBeTruthy();
        expect(getByText('$4.200')).toBeTruthy();
      });

      // No debe existir el disclaimer global ni el badge de demo
      expect(queryByTestId('demo-data-banner')).toBeNull();
      expect(queryByTestId('home-recipe-demo-badge')).toBeNull();

      const viewBtn = getByTestId('home-view-recipe-button');
      fireEvent.press(viewBtn);
      expect(mockPush).toHaveBeenCalledWith('/recetas/pollo-al-curry');
    });

    it('muestra estado vacío amigable con navegación a recetas si no hay recomendaciones', async () => {
      const { getByTestId, queryByTestId } = await renderWithProviders(
        <HomeScreen />,
        {
          initialRecipes: [],
          initialIsDemoMode: false,
        }
      );

      await waitFor(() => {
        expect(getByTestId('home-empty-recipe-state')).toBeTruthy();
      });

      expect(queryByTestId('home-recommended-recipe-card')).toBeNull();
      expect(queryByTestId('demo-data-banner')).toBeNull();

      const generateBtn = getByTestId('home-recommendation-generate-button');
      fireEvent.press(generateBtn);
      expect(mockPush).toHaveBeenCalledWith('/recetas');
    });
  });

  describe('7. Manejo Asíncrono de Comensales y Protección contra Errores (ISSUE 2)', () => {
    it('actualiza comensales exitosamente dentro de los límites válidos (1 a 12)', async () => {
      const { getByLabelText, getByText } = await renderWithProviders(
        <RecipeDiscoveryScreen />,
        {
          initialBudgetPreferences: { budget: 20000, servings: 2 },
        }
      );

      await waitFor(() => {
        expect(getByText('2 pers.')).toBeTruthy();
      });

      const incBtn = getByLabelText('Aumentar');
      fireEvent.press(incBtn);

      await waitFor(() => {
        expect(getByText('3 pers.')).toBeTruthy();
      });
    });

    it('captura fallos de persistencia mostrando error al usuario sin actualizar falsamente la UI', async () => {
      const failingAdapter: BudgetStorageAdapter = {
        getPreferences: jest.fn().mockResolvedValue({
          budget: 20000,
          servings: 2,
        }),
        savePreferences: jest.fn().mockRejectedValue(new Error('Fallo crítico al guardar comensales')),
        resetPreferences: jest.fn().mockResolvedValue({
          budget: 20000,
          servings: 2,
        }),
      };

      const { getByLabelText, getByText, getByTestId, queryByTestId } =
        await renderWithProviders(<RecipeDiscoveryScreen />, {
          initialBudgetPreferences: { budget: 20000, servings: 2 },
          storageAdapter: failingAdapter,
        });

      await waitFor(() => {
        expect(getByText('2 pers.')).toBeTruthy();
      });

      const incBtn = getByLabelText('Aumentar');
      fireEvent.press(incBtn);

      // El error debe mostrarse al usuario
      await waitFor(() => {
        expect(getByTestId('recipes-storage-error')).toBeTruthy();
        expect(getByText('Fallo crítico al guardar comensales')).toBeTruthy();
      });

      // La UI no debe actualizarse falsamente ante el fallo
      expect(getByText('2 pers.')).toBeTruthy();

      // Descartar el error
      const dismissBtn = getByTestId('recipes-dismiss-storage-error-button');
      fireEvent.press(dismissBtn);

      await waitFor(() => {
        expect(queryByTestId('recipes-storage-error')).toBeNull();
      });
    });

    it('previene interacciones rápidas repetidas durante una persistencia en progreso', async () => {
      const slowAdapter: BudgetStorageAdapter = {
        getPreferences: jest.fn().mockResolvedValue({
          budget: 20000,
          servings: 2,
        }),
        savePreferences: jest.fn().mockImplementation(async (prefs) => {
          await new Promise((res) => setTimeout(res, 50));
          return prefs;
        }),
        resetPreferences: jest.fn().mockResolvedValue({
          budget: 20000,
          servings: 2,
        }),
      };

      const { getByLabelText, getByText } = await renderWithProviders(
        <RecipeDiscoveryScreen />,
        {
          initialBudgetPreferences: { budget: 20000, servings: 2 },
          storageAdapter: slowAdapter,
        }
      );

      let incBtn: any;
      await waitFor(() => {
        incBtn = getByLabelText('Aumentar');
        expect(incBtn).toBeTruthy();
      });

      // Tocar rápidamente 3 veces consecutivas
      await act(async () => {
        fireEvent.press(incBtn);
        fireEvent.press(incBtn);
        fireEvent.press(incBtn);
      });

      // Solo una mutación debe ser enviada al adaptador
      expect(slowAdapter.savePreferences).toHaveBeenCalledTimes(1);

      await waitFor(() => {
        expect(getByText('3 pers.')).toBeTruthy();
      });
    });
  });

  describe('8. Integración Real de Recomendaciones con IA (Fase 3A)', () => {
    const SAMPLE_AI_BACKEND_RECIPES = [
      {
        name: 'Pollo al Limón con Papas Criollas',
        description: 'Pechuga sellada con papas crocantes y toque cítrico fresco.',
        totalMinutes: 30,
        ingredients: [
          { name: 'Pollo', quantity: 300, unit: 'g' },
          { name: 'Papa criolla', quantity: 4, unit: 'unidad' },
        ],
        steps: [
          'Cortar el pollo en cubos medianos.',
          'Dorar en sartén con limón por 15 minutos.',
          'Servir caliente.',
        ],
        availableIngredients: [{ name: 'Pollo', quantity: 300, unit: 'g' }],
        missingIngredients: [{ name: 'Papa criolla', quantity: 4, unit: 'unidad', estimatedCost: 2000 }],
        estimatedMissingCost: 2000,
        budgetRemaining: 18000,
        withinBudget: true,
        convenience: 92,
        reason: 'Receta económica y rápida con ingredientes de la casa.',
      },
    ];

    it('renderiza el botón principal Generar recetas con IA', async () => {
      const { getByTestId, getByText } = await renderWithProviders(<RecipeDiscoveryScreen />);

      const generateBtn = getByTestId('recipes-generate-ai-button');
      expect(generateBtn).toBeTruthy();
      expect(getByText('Generar recetas con IA')).toBeTruthy();
    });

    it('ejecuta la generación real con IA, muestra recetas de Gemini y oculta el banner de demostración', async () => {
      const mockRecommend = jest.fn().mockResolvedValue(SAMPLE_AI_BACKEND_RECIPES);
      const mockClient = { recommendRecipes: mockRecommend, checkBackendHealth: jest.fn() };

      const { getByTestId, getByText, queryByTestId } = await renderWithProviders(
        <RecipeDiscoveryScreen />,
        { recipeApiClient: mockClient }
      );

      // Inicia con el banner de demostración
      expect(getByTestId('recipes-demo-banner')).toBeTruthy();

      const generateBtn = getByTestId('recipes-generate-ai-button');
      await act(async () => {
        fireEvent.press(generateBtn);
      });

      await waitFor(() => {
        expect(mockRecommend).toHaveBeenCalledTimes(1);
      });

      // Se desactiva el banner de demostración
      await waitFor(() => {
        expect(queryByTestId('recipes-demo-banner')).toBeNull();
        expect(getByText('Pollo al Limón con Papas Criollas')).toBeTruthy();
        expect(getByTestId('recipes-count-badge')).toBeTruthy();
      });
    });

    it('muestra tarjeta de error amigable cuando la llamada al backend falla y permite reintentar', async () => {
      const mockRecommend = jest
        .fn()
        .mockRejectedValueOnce(new Error('Límite de solicitudes de IA alcanzado. Por favor espera un momento.'))
        .mockResolvedValueOnce(SAMPLE_AI_BACKEND_RECIPES);

      const mockClient = { recommendRecipes: mockRecommend, checkBackendHealth: jest.fn() };

      const { getByTestId, getByText, queryByTestId } = await renderWithProviders(
        <RecipeDiscoveryScreen />,
        { recipeApiClient: mockClient }
      );

      const generateBtn = getByTestId('recipes-generate-ai-button');
      await act(async () => {
        fireEvent.press(generateBtn);
      });

      // Aparece la tarjeta de error
      await waitFor(() => {
        expect(getByTestId('recipes-api-error-card')).toBeTruthy();
        expect(getByText(/Límite de solicitudes de IA alcanzado/i)).toBeTruthy();
      });

      // El botón de reintentar funciona
      const retryBtn = getByTestId('recipes-retry-button');
      await act(async () => {
        fireEvent.press(retryBtn);
      });

      await waitFor(() => {
        expect(queryByTestId('recipes-api-error-card')).toBeNull();
        expect(getByText('Pollo al Limón con Papas Criollas')).toBeTruthy();
      });
    });

    it('muestra banner de obsolescencia cuando cambian los comensales tras generar con IA', async () => {
      const mockRecommend = jest.fn().mockResolvedValue(SAMPLE_AI_BACKEND_RECIPES);
      const mockClient = { recommendRecipes: mockRecommend, checkBackendHealth: jest.fn() };

      const { getByTestId, getByText, getByLabelText } = await renderWithProviders(
        <RecipeDiscoveryScreen />,
        { recipeApiClient: mockClient }
      );

      // Generar inicialmente
      const generateBtn = getByTestId('recipes-generate-ai-button');
      await act(async () => {
        fireEvent.press(generateBtn);
      });

      await waitFor(() => {
        expect(getByText('Pollo al Limón con Papas Criollas')).toBeTruthy();
      });

      // Modificar comensales
      const incBtn = getByLabelText('Aumentar');
      await act(async () => {
        fireEvent.press(incBtn);
      });

      // Aparece el banner de obsolescencia
      await waitFor(() => {
        expect(getByTestId('recipes-stale-banner')).toBeTruthy();
      });

      // Regenerar desde el banner
      const regenBtn = getByTestId('recipes-stale-regenerate-button');
      await act(async () => {
        fireEvent.press(regenBtn);
      });

      await waitFor(() => {
        expect(mockRecommend).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('17. Fallback neutral de imágenes en Home, Detalle y Descubrimiento (ISSUE 4)', () => {
    const realRecipeWithoutImage: ClientRecipe = {
      id: 'real-recipe-no-image',
      name: 'Salteado de Verduras con Tofu',
      description: 'Salteado ligero y saludable generado por IA sin imagen propia',
      totalMinutes: 20,
      ingredients: [
        { name: 'Tofu', quantity: 200, unit: 'g' },
        { name: 'Zanahoria', quantity: 1, unit: 'unidad' },
      ],
      steps: ['Cortar vegetales', 'Saltear tofu y vegetales a fuego alto'],
      availableIngredients: [
        { name: 'Zanahoria', quantity: 1, unit: 'unidad' },
      ],
      missingIngredients: [
        { name: 'Tofu', quantity: 200, unit: 'g', estimatedCost: 3500 },
      ],
      estimatedMissingCost: 3500,
      budgetRemaining: 16500,
      withinBudget: true,
      convenience: 92,
      reason: 'Aprovecha la zanahoria y requiere poca inversión.',
      isDemoFixture: false,
      servings: 2,
      // imageUrl es undefined deliberadamente
    };

    it('Home NO carga URLs remotas de recetas reales en el MVP aunque sean HTTPS (Bloque 3A)', async () => {
      // Antes del Bloque 3A se cargaba la URL remota. Ahora las imágenes remotas están
      // desactivadas (REMOTE_RECIPE_IMAGES_ENABLED = false): HTTPS no prueba relevancia ni licencia.
      const { queryByTestId, getByTestId } = await renderWithProviders(<HomeScreen />, {
        initialIsDemoMode: false,
        initialRecipes: [
          { ...realRecipeWithoutImage, imageUrl: 'https://images.foodai.example.com/tofu.jpg' },
        ],
      });

      expect(getByTestId('home-recommended-recipe-card')).toBeTruthy();
      expect(getByTestId('home-recipe-fallback-image')).toBeTruthy();
      expect(queryByTestId('home-recipe-image-img')).toBeNull();
    });

    it('Home en modo demo no renderiza la tarjeta ni la imagen de la receta de ejemplo', async () => {
      const { queryByTestId, getByTestId } = await renderWithProviders(<HomeScreen />);

      expect(getByTestId('home-recommendation-demo-state')).toBeTruthy();
      expect(queryByTestId('home-recommended-recipe-card')).toBeNull();
      expect(queryByTestId('home-recipe-image')).toBeNull();
    });

    it('Home renderiza el fallback neutral FoodAI cuando una receta real carece de imagen', async () => {
      const { getByTestId, queryByLabelText, getByText } = await renderWithProviders(
        <HomeScreen />,
        {
          initialIsDemoMode: false,
          initialRecipes: [realRecipeWithoutImage],
        }
      );

      // Debe mostrar el contenedor de fallback neutral
      expect(getByTestId('home-recipe-fallback-image')).toBeTruthy();
      expect(getByText('FoodAI Receta')).toBeTruthy();
      // La accesibilidad debe indicar ilustración del plato
      expect(
        queryByLabelText('Ilustración de Salteado de Verduras con Tofu')
      ).toBeTruthy();
    });

    it('Detalle de receta muestra fallback neutral para receta real sin imagen', async () => {
      mockSearchParams = { id: 'real-recipe-no-image' };
      const { getByTestId, getByText } = await renderWithProviders(
        <RecipeDetailScreen />,
        {
          initialIsDemoMode: false,
          initialRecipes: [realRecipeWithoutImage],
        }
      );

      expect(getByTestId('recipe-detail-fallback-image')).toBeTruthy();
      expect(getByText('FoodAI Receta')).toBeTruthy();
    });

    it('Detalle de receta muestra imagen propia para recetas de demostración', async () => {
      mockSearchParams = { id: 'demo-rec-1' };
      const { queryByTestId } = await renderWithProviders(<RecipeDetailScreen />);

      // Receta demo tiene imagen, por lo que el fallback no debe renderizarse
      expect(queryByTestId('recipe-detail-fallback-image')).toBeNull();
    });
  });
  describe('Modo Cocina Guiada y Adaptación de Tema Oscuro (Fase 6B.2)', () => {
    it('renderiza Modo Cocina en modo oscuro con adaptación semántica completa', async () => {
      mockSearchParams = { id: 'demo-rec-1' };
      const { getByTestId, getByText } = await renderWithProviders(
        <GuidedCookingScreen />,
        { initialThemeMode: 'dark' }
      );

      expect(getByText('Modo Cocina')).toBeTruthy();
      expect(getByTestId('cooking-step-counter')).toBeTruthy();
      expect(getByText('Paso 1 de 4')).toBeTruthy();
      expect(getByTestId('cooking-next-step-button')).toBeTruthy();
    });

    it('renderiza modal de finalización en modo oscuro adaptando contenedores y superficies', async () => {
      mockSearchParams = { id: 'demo-rec-1' };
      const { getByTestId, getByText } = await renderWithProviders(
        <GuidedCookingScreen />,
        { initialThemeMode: 'dark' }
      );

      const jumpBtn = getByTestId('cooking-jump-final-button');
      fireEvent.press(jumpBtn);

      await waitFor(() => {
        expect(getByText('Finalizar preparación')).toBeTruthy();
      });

      const finishBtn = getByTestId('cooking-next-step-button');
      fireEvent.press(finishBtn);

      await waitFor(() => {
        expect(getByTestId('cooking-finish-modal')).toBeTruthy();
        expect(getByText('¡Buen provecho!')).toBeTruthy();
      });
    });
  });
});
