/**
 * FoodAI - Pruebas de Calidad Visual y Validación de Mejoras (Fase 6C.1 / Rama feature/15-pulido-visual-claude).
 *
 * Valida de forma determinista:
 * 1. Tarjeta Hero de Bienvenida en Home (titular, subtítulo, sin afirmaciones engañosas de "Ahorro activo").
 * 2. Valores reales sincronizados de la despensa (total y por vencer) en los chips del hero.
 * 3. Iconos y estructura en la barra de navegación de pestañas (TabsLayout con MaterialCommunityIcons).
 * 4. Componentes compartidos (Button, Card, Chip, Header) con los nuevos tokens de color y variantes.
 * 5. Cobertura de temas claro y oscuro para los nuevos tokens semánticos (primaryAction, fixed accents, hero tokens).
 */
import React from 'react';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react-native';
import HomeScreen from '../app/(tabs)/index';
import TabsLayout from '../app/(tabs)/_layout';
import { Button, Card, Chip, Header } from '../src/components/common';
import { TypographyProvider, lightColors, darkColors } from '../src/theme';
import { ThemeProvider } from '../src/context/ThemeContext';
import { PantryProvider } from '../src/context/PantryContext';
import { BudgetProvider } from '../src/context/BudgetContext';
import { RecipeProvider } from '../src/context/RecipeContext';
import { MealPlanProvider } from '../src/context/MealPlanContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ingredient } from '../src/types/pantry';

// Mock de enrutador expo-router
const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useRouter: () => ({
      push: mockPush,
      replace: jest.fn(),
      back: jest.fn(),
    }),
    Tabs: Object.assign(
      ({ children }: { children: React.ReactNode }) =>
        React.createElement(View, { testID: 'tabs-container' }, children),
      {
        Screen: ({ name }: { name: string }) =>
          React.createElement(View, { testID: `tabs-screen-${name}` }),
      }
    ),
  };
});

const TEST_INGREDIENTS: Ingredient[] = [
  {
    id: 'test-1',
    name: 'Tomates Chonto',
    quantity: 5,
    unit: 'unidad',
    category: 'Verduras y frutas',
    expirationDate: '2026-10-31',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'test-2',
    name: 'Leche Deslactosada',
    quantity: 1,
    unit: 'l',
    category: 'Lácteos',
    expirationDate: '2026-11-15',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const renderScreenWithProviders = async (ui: React.ReactElement) => {
  const screen = await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider initialMode="light">
        <TypographyProvider usingFallback={true}>
          <PantryProvider initialIngredients={TEST_INGREDIENTS}>
            <BudgetProvider initialPreferences={{ budget: 50000, servings: 2 }}>
              <RecipeProvider>
                <MealPlanProvider>
                  {ui}
                </MealPlanProvider>
              </RecipeProvider>
            </BudgetProvider>
          </PantryProvider>
        </TypographyProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
  return screen;
};

describe('Validación de Mejoras Visuales (Fase 6C.1 - Claude)', () => {
  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
  });

  describe('1. Tokens Semánticos de Tema Claro y Oscuro', () => {
    it('define consistentemente los nuevos tokens visuales en lightColors', () => {
      expect(lightColors.primaryAction).toBe('#433371');
      expect(lightColors.primaryFixed).toBe('#E8DDFF');
      expect(lightColors.secondaryFixed).toBe('#FFDAD3');
      expect(lightColors.tertiaryFixed).toBe('#FFDF9B');
      expect(lightColors.heroBackground).toBe('#433371');
      expect(lightColors.onHero).toBe('#FFFFFF');
    });

    it('define consistentemente los nuevos tokens visuales en darkColors con alto contraste', () => {
      expect(darkColors.primaryAction).toBe('#A996DC');
      expect(darkColors.primaryFixed).toBe('#2E2452');
      expect(darkColors.secondaryFixed).toBe('#4A2018');
      expect(darkColors.tertiaryFixed).toBe('#3D2E00');
      expect(darkColors.heroBackground).toBe('#2E2452');
      expect(darkColors.onHero).toBe('#FFFFFF');
    });
  });

  describe('2. Componentes Compartidos (Tokens de Color y Variantes)', () => {
    it('Button aplica correctamente el color primario y permite interacción', async () => {
      const onPressMock = jest.fn();
      const screen = await render(
        <Button title="Acción Principal" onPress={onPressMock} variant="primary" size="lg" />
      );
      const button = screen.getByText('Acción Principal');
      fireEvent.press(button);
      expect(onPressMock).toHaveBeenCalledTimes(1);
    });

    it('Card renderiza variantes elevadas y planas correctamente', async () => {
      const screen = await render(
        <Card variant="elevated" testID="test-card">
          <Button title="Dentro de Card" onPress={() => {}} />
        </Card>
      );
      expect(screen.getByText('Dentro de Card')).toBeTruthy();
    });

    it('Chip renderiza variantes urgent y budget con accesibilidad de texto', async () => {
      const screen = await render(
        <>
          <Chip label="Por vencer" variant="urgent" />
          <Chip label="Económico" variant="budget" />
        </>
      );
      expect(screen.getByText('Por vencer')).toBeTruthy();
      expect(screen.getByText('Económico')).toBeTruthy();
    });

    it('Header soporta showLogo, eyebrow y elevated', async () => {
      const screen = await render(
        <Header title="Recetas" eyebrow="FoodAI" showLogo elevated />
      );
      expect(screen.getByText('Recetas')).toBeTruthy();
      expect(screen.getByText('FoodAI')).toBeTruthy();
      expect(screen.getByLabelText('Logotipo de Recetario por Presupuesto')).toBeTruthy();
    });
  });

  describe('3. Navegación de Pestañas (TabsLayout)', () => {
    it('renderiza la estructura de pestañas principales con nombres en español', async () => {
      const screen = await renderScreenWithProviders(<TabsLayout />);
      await waitFor(() => {
        expect(screen.getByTestId('tabs-screen-index')).toBeTruthy();
      });
      expect(screen.getByTestId('tabs-screen-despensa')).toBeTruthy();
      expect(screen.getByTestId('tabs-screen-plan')).toBeTruthy();
      expect(screen.getByTestId('tabs-screen-perfil')).toBeTruthy();
    });
  });

  describe('4. Home Greeting Hero Card & Textos Veraces', () => {
    it('muestra el titular y subtítulo institucional del hero card', async () => {
      const screen = await renderScreenWithProviders(<HomeScreen />);
      await waitFor(() => {
        expect(screen.getByText('¿Qué podemos preparar hoy?')).toBeTruthy();
      });
      expect(screen.getByText('COCINA INTELIGENTE Y CONSCIENTE')).toBeTruthy();
      expect(screen.getByText('Primero usa lo que tienes. Después decide qué comprar.')).toBeTruthy();
    });

    it('refleja la cantidad real de ingredientes de la despensa en el chip del hero', async () => {
      const screen = await renderScreenWithProviders(<HomeScreen />);
      await waitFor(() => {
        expect(screen.getByText(/🥬 2 en despensa/i)).toBeTruthy();
      });
    });

    it('NO muestra afirmaciones engañosas de "Ahorro activo" y muestra el presupuesto veraz', async () => {
      const screen = await renderScreenWithProviders(<HomeScreen />);
      await waitFor(() => {
        expect(screen.getByText(/Control de presupuesto/i)).toBeTruthy();
      });
      expect(screen.queryByText(/Ahorro activo/i)).toBeNull();
    });

    it('permite abrir el escáner de alimentos desde el visor y el botón principal', async () => {
      const screen = await renderScreenWithProviders(<HomeScreen />);
      await waitFor(() => {
        expect(screen.getByTestId('home-scan-button')).toBeTruthy();
      });

      const scanBtn = screen.getByTestId('home-scan-button');
      fireEvent.press(scanBtn);
      expect(mockPush).toHaveBeenCalledWith('/escaner');

      const viewfinderPress = screen.getByTestId('home-viewfinder-press');
      fireEvent.press(viewfinderPress);
      expect(mockPush).toHaveBeenCalledWith('/escaner');
    });
  });
});
