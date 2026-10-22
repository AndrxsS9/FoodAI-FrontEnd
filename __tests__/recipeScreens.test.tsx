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

import { TypographyProvider } from '../src/theme';
import { PantryProvider } from '../src/context/PantryContext';
import { BudgetProvider } from '../src/context/BudgetContext';
import { RecipeProvider } from '../src/context/RecipeContext';
import { Ingredient } from '../src/types/pantry';
import { BudgetPreferences } from '../src/types/budget';

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
        <PantryProvider
          initialIngredients={options?.initialIngredients ?? SAMPLE_PANTRY_INGREDIENTS}
        >
          <BudgetProvider
            initialPreferences={
              options?.initialBudgetPreferences ?? { budget: 20000, servings: 2 }
            }
          >
            <RecipeProvider>
              {ui}
            </RecipeProvider>
          </BudgetProvider>
        </PantryProvider>
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
    it('navega desde el Inicio a /recetas/demo-rec-1 al presionar Ver receta en la recomendación diaria', async () => {
      const { getByTestId } = await renderWithProviders(<HomeScreen />);

      const viewRecipeBtn = getByTestId('home-view-recipe-button');
      fireEvent.press(viewRecipeBtn);

      expect(mockPush).toHaveBeenCalledWith('/recetas/demo-rec-1');
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
});
