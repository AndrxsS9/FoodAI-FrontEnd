import React from 'react';
import { render, fireEvent, cleanup, waitFor, act } from '@testing-library/react-native';
import WelcomeScreen from '../app/index';
import HomeScreen from '../app/(tabs)/index';
import DespensaScreen from '../app/(tabs)/despensa';
import PlanScreen from '../app/(tabs)/plan';
import PerfilScreen from '../app/(tabs)/perfil';
import TabsLayout from '../app/(tabs)/_layout';
import { TypographyProvider } from '../src/theme';
import { PantryProvider } from '../src/context/PantryContext';
import { BudgetProvider } from '../src/context/BudgetContext';
import { RecipeProvider } from '../src/context/RecipeContext';
import { MealPlanProvider } from '../src/context/MealPlanContext';
import { Ingredient } from '../src/types/pantry';

import { SafeAreaProvider } from 'react-native-safe-area-context';

// Mock expo-router
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
      back: mockBack,
    }),
    Tabs: Object.assign(
      ({ children }: { children: React.ReactNode }) => React.createElement(View, { testID: 'tabs-container' }, children),
      {
        Screen: ({ name }: { name: string }) => React.createElement(View, { testID: `tabs-screen-${name}` }),
      }
    ),
    Stack: Object.assign(
      ({ children }: { children: React.ReactNode }) => React.createElement(View, { testID: 'stack-container' }, children),
      {
        Screen: ({ name }: { name: string }) => React.createElement(View, { testID: `stack-screen-${name}` }),
      }
    ),
  };
});

const TEST_INITIAL_INGREDIENTS: Ingredient[] = [
  {
    id: 'demo-1',
    name: 'Tomate',
    quantity: 4,
    unit: 'unidad',
    category: 'Verduras y frutas',
    expirationDate: '2026-10-22',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo-2',
    name: 'Pollo',
    quantity: 1,
    unit: 'unidad',
    category: 'Carnes y proteínas',
    expirationDate: '2026-10-22',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'demo-3',
    name: 'Espinaca',
    quantity: 200,
    unit: 'g',
    category: 'Verduras y frutas',
    expirationDate: '2026-10-22',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  ...Array.from({ length: 11 }, (_, i) => ({
    id: `item-${i + 4}`,
    name: `Ingrediente ${i + 4}`,
    quantity: 1,
    unit: 'unidad' as const,
    category: 'Alacena' as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })),
];

describe('Phase 2A: Navigation & Mobile Screens (Google Stitch)', () => {
  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
  });

  const renderWithProviders = (
    ui: React.ReactElement,
    initialIngredients: Ingredient[] = TEST_INITIAL_INGREDIENTS
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
            <BudgetProvider initialPreferences={{ budget: 20000, servings: 2 }}>
              <RecipeProvider>
                <MealPlanProvider>
                  {ui}
                </MealPlanProvider>
              </RecipeProvider>
            </BudgetProvider>
          </PantryProvider>
        </TypographyProvider>
      </SafeAreaProvider>
    );
  };

  describe('Welcome Screen (1. Bienvenida - Stitch #a194e6d6ab90439e819b12bb481310a7)', () => {
    it('renders header badge, value proposition and 3 feature steps correctly', async () => {
      const { getByText, getByTestId, getByAccessibilityHint } = await renderWithProviders(<WelcomeScreen />);

      // Top bar
      expect(getByText('HOGAR INTELIGENTE')).toBeTruthy();
      expect(getByText('Omitir')).toBeTruthy();

      // Value proposition
      expect(getByText('Menos desperdicio. Más aprovechamiento.')).toBeTruthy();
      expect(getByText('Aprovecha lo que ya tienes.')).toBeTruthy();
      expect(getByText('Muéstranos tus alimentos y descubre qué puedes preparar sin gastar de más.')).toBeTruthy();

      // Hero illustration card
      expect(getByTestId('welcome-hero-card')).toBeTruthy();
      expect(getByText('Aprovecha mejor tu despensa')).toBeTruthy();

      // 3 feature steps
      expect(getByTestId('step-1')).toBeTruthy();
      expect(getByText('1. Escanea')).toBeTruthy();
      expect(getByText('Tus alimentos')).toBeTruthy();

      expect(getByTestId('step-2')).toBeTruthy();
      expect(getByText('2. Elige')).toBeTruthy();
      expect(getByText('Tu presupuesto')).toBeTruthy();

      expect(getByTestId('step-3')).toBeTruthy();
      expect(getByText('3. Cocina')).toBeTruthy();
      expect(getByText('Aprovecha lo que tienes')).toBeTruthy();

      // Primary CTA
      expect(getByText('Comenzar')).toBeTruthy();
      expect(getByAccessibilityHint('Navega a la pantalla principal de la aplicación')).toBeTruthy();
    });

    it('navigates to main application tabs using replace when pressing "Comenzar"', async () => {
      const { getByTestId } = await renderWithProviders(<WelcomeScreen />);

      const startButton = getByTestId('welcome-start-button');
      fireEvent.press(startButton);

      expect(mockReplace).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    });

    it('navigates to main application tabs using replace when pressing "Omitir"', async () => {
      const { getByTestId } = await renderWithProviders(<WelcomeScreen />);

      const skipButton = getByTestId('welcome-skip-button');
      fireEvent.press(skipButton);

      expect(mockReplace).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    });
  });

  describe('Home Screen (2. Inicio - Stitch #7ca48a7c29fb4461b3d41c5eca804385)', () => {
    it('renders brand header, demo notice, greeting, and all 4 Stitch dashboard sections', async () => {
      const { getByText, getByTestId } = await renderWithProviders(<HomeScreen />);

      // Top brand header
      expect(getByText('RECETARIO POR PRESUPUESTO')).toBeTruthy();
      expect(getByText('Inicio')).toBeTruthy();

      // Demo data banner
      expect(getByTestId('demo-data-banner')).toBeTruthy();
      expect(getByText('Vista de ejemplo')).toBeTruthy();
      expect(getByText('Datos de demostración para evaluación visual')).toBeTruthy();

      // Supportive prompt
      expect(getByText('COCINA INTELIGENTE Y CONSCIENTE')).toBeTruthy();
      expect(getByText('¿Qué podemos preparar hoy?')).toBeTruthy();
      expect(getByText('Primero usa lo que tienes. Después decide qué comprar.')).toBeTruthy();

      // Card 1: Scanner dominant action
      expect(getByText('Escanear alimentos')).toBeTruthy();
      expect(getByText('Muéstrame qué tienes')).toBeTruthy();
      expect(getByText('Tomar foto')).toBeTruthy();

      // Card 2: Pantry summary with demo data
      expect(getByText('Tu despensa')).toBeTruthy();
      expect(getByText('14 productos')).toBeTruthy();
      expect(getByText('3 consumir pronto')).toBeTruthy();
      expect(getByText('Prioritarios')).toBeTruthy();
      expect(getByText('Tomate')).toBeTruthy();
      expect(getByText('Pollo')).toBeTruthy();
      expect(getByText('Espinaca')).toBeTruthy();

      // Card 3: Available budget
      expect(getByText('PRESUPUESTO DISPONIBLE')).toBeTruthy();
      expect(getByText(/20\.000/)).toBeTruthy();
      expect(getByText('Ajustar')).toBeTruthy();

      // Card 4: Daily recommendation (Autoritativo desde RecipeContext)
      expect(getByText('Recomendación del día')).toBeTruthy();
      expect(getByText('Optimizado a tu despensa')).toBeTruthy();
      expect(getByText('Arroz con pollo y verduras')).toBeTruthy();
      expect(getByText('94% conveniente')).toBeTruthy();
      expect(getByText('30 min')).toBeTruthy();
      expect(getByText('2 personas')).toBeTruthy();
      expect(getByText(/Solo necesitas aproximadamente/)).toBeTruthy();
      expect(getByText(/Aprovecha alimentos urgentes/)).toBeTruthy();
      expect(getByText('Ver receta')).toBeTruthy();
    });

    it('navigates to profile when avatar is clicked', async () => {
      const { getByTestId } = await renderWithProviders(<HomeScreen />);

      const avatar = getByTestId('home-profile-avatar');
      fireEvent.press(avatar);

      expect(mockPush).toHaveBeenCalledWith('/(tabs)/perfil');
    });

    it('opens budget adjustment modal and updates budget upon confirmation with valid input', async () => {
      const { getByText, getByTestId, queryByTestId } = await renderWithProviders(<HomeScreen />);

      expect(getByText(/20\.000/)).toBeTruthy();

      // Open budget modal
      const adjustButton = getByTestId('home-adjust-budget-button');
      fireEvent.press(adjustButton);

      await waitFor(() => {
        expect(getByTestId('budget-modal-backdrop')).toBeTruthy();
      });
      expect(getByText('Ajustar presupuesto')).toBeTruthy();

      // Change input value to 35000
      const inputField = getByTestId('budget-input-field');
      fireEvent.changeText(inputField, '35000');

      await waitFor(() => {
        expect(inputField.props.value).toBe('35000');
      });

      // Confirm
      const confirmButton = getByTestId('budget-confirm-button');
      await act(async () => {
        fireEvent.press(confirmButton);
      });

      // Verify modal is closed and budget is updated
      await waitFor(() => {
        expect(queryByTestId('budget-modal-backdrop')).toBeNull();
        expect(getByText(/35\.000/)).toBeTruthy();
      });
    });

    it('cancels budget adjustment without changing the existing budget', async () => {
      const { getByText, getByTestId, queryByTestId } = await renderWithProviders(<HomeScreen />);

      expect(getByText(/20\.000/)).toBeTruthy();

      const adjustButton = getByTestId('home-adjust-budget-button');
      fireEvent.press(adjustButton);

      await waitFor(() => {
        expect(getByTestId('budget-modal-backdrop')).toBeTruthy();
      });

      const inputField = getByTestId('budget-input-field');
      fireEvent.changeText(inputField, '99999');

      await waitFor(() => {
        expect(inputField.props.value).toBe('99999');
      });

      // Cancel
      const cancelButton = getByTestId('budget-cancel-button');
      fireEvent.press(cancelButton);

      // Modal is closed and original budget remains
      await waitFor(() => {
        expect(queryByTestId('budget-modal-backdrop')).toBeNull();
        expect(getByText(/20\.000/)).toBeTruthy();
      });
    });

    it('displays error validation when entering invalid or empty budget input', async () => {
      const { getByText, getByTestId } = await renderWithProviders(<HomeScreen />);

      const adjustButton = getByTestId('home-adjust-budget-button');
      fireEvent.press(adjustButton);

      await waitFor(() => {
        expect(getByTestId('budget-modal-backdrop')).toBeTruthy();
      });

      const inputField = getByTestId('budget-input-field');
      const confirmButton = getByTestId('budget-confirm-button');

      // Test empty input
      fireEvent.changeText(inputField, '   ');
      await waitFor(() => {
        expect(inputField.props.value).toBe('   ');
      });
      fireEvent.press(confirmButton);
      await waitFor(() => {
        expect(getByText('Por favor ingresa un monto de presupuesto.')).toBeTruthy();
      });

      // Test invalid non-numeric input
      fireEvent.changeText(inputField, 'abc');
      await waitFor(() => {
        expect(inputField.props.value).toBe('abc');
      });
      fireEvent.press(confirmButton);
      await waitFor(() => {
        expect(getByText('Por favor ingresa un número válido.')).toBeTruthy();
      });

      // Test negative value
      fireEvent.changeText(inputField, '-5000');
      await waitFor(() => {
        expect(inputField.props.value).toBe('-5000');
      });
      fireEvent.press(confirmButton);
      await waitFor(() => {
        expect(getByText('El presupuesto no puede ser un valor negativo.')).toBeTruthy();
      });
    });

    it('navigates to scanner flow when pressing Tomar foto on home', async () => {
      const { getByText } = await renderWithProviders(<HomeScreen />);

      const scanButton = getByText('Tomar foto');
      fireEvent.press(scanButton);

      expect(mockPush).toHaveBeenCalledWith('/escaner');
    });

    it('navigates to despensa tab when tapping urgent pantry items', async () => {
      const { getByText } = await renderWithProviders(<HomeScreen />);

      const tomateChip = getByText('Tomate');
      fireEvent.press(tomateChip);

      expect(mockPush).toHaveBeenCalledWith('/(tabs)/despensa');
    });
  });

  describe('Bottom-tab Navigation Layout', () => {
    it('renders Tabs container and registers all 4 primary navigation routes', async () => {
      const { getByTestId } = await renderWithProviders(<TabsLayout />);

      expect(getByTestId('tabs-container')).toBeTruthy();
      expect(getByTestId('tabs-screen-index')).toBeTruthy();
      expect(getByTestId('tabs-screen-despensa')).toBeTruthy();
      expect(getByTestId('tabs-screen-plan')).toBeTruthy();
      expect(getByTestId('tabs-screen-perfil')).toBeTruthy();
    });
  });

  describe('Tabs Screens (Despensa, Plan, Perfil)', () => {
    it('renders Despensa screen with functional inventory header and controls', async () => {
      const { getByText, getByTestId, getByPlaceholderText } = await renderWithProviders(<DespensaScreen />);

      expect(getByText('RECETARIO POR PRESUPUESTO')).toBeTruthy();
      expect(getByText('Despensa')).toBeTruthy();
      expect(getByPlaceholderText('Buscar en mi despensa...')).toBeTruthy();
      expect(getByTestId('pantry-add-ingredient-button')).toBeTruthy();
      expect(getByTestId('pantry-scan-placeholder-button')).toBeTruthy();
    });

    it('renders Plan screen with 3-day meal planning header, parameters summary and CTA', async () => {
      const { getByText, getByTestId } = await renderWithProviders(<PlanScreen />);

      expect(getByText('Mi plan de comidas')).toBeTruthy();
      expect(getByText('Organiza tres días según tu despensa y presupuesto')).toBeTruthy();
      expect(getByText('Planifica tus comidas de los próximos 3 días')).toBeTruthy();
      expect(getByTestId('generate-meal-plan-button')).toBeTruthy();

      const profileAvatar = getByTestId('plan-profile-avatar');
      fireEvent.press(profileAvatar);
      expect(mockPush).toHaveBeenCalledWith('/(tabs)/perfil');
    });

    it('renders Perfil placeholder with Phase 4 development status and replay links', async () => {
      const { getByText, getByTestId } = await renderWithProviders(<PerfilScreen />);

      expect(getByText('Perfil de Usuario')).toBeTruthy();
      expect(getByText('Fase 4')).toBeTruthy();
      expect(getByText('Preferencias y Configuración')).toBeTruthy();

      // Test replay welcome
      const welcomeLink = getByTestId('perfil-welcome-button');
      await fireEvent.press(welcomeLink);
      expect(mockPush).toHaveBeenCalledWith('/');

      // Test design system showcase link
      const dsLink = getByTestId('perfil-design-system-button');
      await fireEvent.press(dsLink);
      expect(mockPush).toHaveBeenCalledWith('/design-system');

      // Test back to home
      const backHome = getByTestId('perfil-back-home-button');
      await fireEvent.press(backHome);
      expect(mockPush).toHaveBeenCalledWith('/(tabs)');
    });
  });
});
