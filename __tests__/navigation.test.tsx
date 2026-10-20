import React from 'react';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react-native';
import WelcomeScreen from '../app/index';
import HomeScreen from '../app/(tabs)/index';
import DespensaScreen from '../app/(tabs)/despensa';
import PlanScreen from '../app/(tabs)/plan';
import PerfilScreen from '../app/(tabs)/perfil';
import TabsLayout from '../app/(tabs)/_layout';
import { TypographyProvider } from '../src/theme';

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

describe('Phase 2A: Navigation & Mobile Screens (Google Stitch)', () => {
  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
  });

  const renderWithProviders = async (ui: React.ReactElement) => {
    return await render(
      <SafeAreaProvider
        initialMetrics={{
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
          frame: { x: 0, y: 0, width: 390, height: 844 },
        }}
      >
        <TypographyProvider usingFallback={true}>
          {ui}
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

    it('navigates to main application tabs when pressing "Comenzar"', async () => {
      const { getByTestId } = await renderWithProviders(<WelcomeScreen />);

      const startButton = getByTestId('welcome-start-button');
      fireEvent.press(startButton);

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/(tabs)');
    });

    it('navigates to main application tabs when pressing "Omitir"', async () => {
      const { getByTestId } = await renderWithProviders(<WelcomeScreen />);

      const skipButton = getByTestId('welcome-skip-button');
      fireEvent.press(skipButton);

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/(tabs)');
    });
  });

  describe('Home Screen (2. Inicio - Stitch #7ca48a7c29fb4461b3d41c5eca804385)', () => {
    it('renders brand header, greeting, and all 4 Stitch dashboard sections', async () => {
      const { getByText } = await renderWithProviders(<HomeScreen />);

      // Top brand header
      expect(getByText('RECETARIO POR PRESUPUESTO')).toBeTruthy();
      expect(getByText('Inicio')).toBeTruthy();

      // Supportive prompt
      expect(getByText('COCINA INTELIGENTE Y CONSCIENTE')).toBeTruthy();
      expect(getByText('¿Qué podemos preparar hoy?')).toBeTruthy();
      expect(getByText('Primero usa lo que tienes. Después decide qué comprar.')).toBeTruthy();

      // Card 1: Scanner dominant action
      expect(getByText('Escanear alimentos')).toBeTruthy();
      expect(getByText('Muéstrame qué tienes')).toBeTruthy();
      expect(getByText('Tomar foto')).toBeTruthy();

      // Card 2: Pantry summary
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

      // Card 4: Daily recommendation
      expect(getByText('Recomendación del día')).toBeTruthy();
      expect(getByText('Optimizado a tu despensa')).toBeTruthy();
      expect(getByText('Pollo con verduras')).toBeTruthy();
      expect(getByText('92 % conveniente')).toBeTruthy();
      expect(getByText('25 min')).toBeTruthy();
      expect(getByText('2 personas')).toBeTruthy();
      expect(getByText(/Solo necesitas aproximadamente/)).toBeTruthy();
      expect(getByText(/Aprovechas/)).toBeTruthy();
      expect(getByText('Ver receta')).toBeTruthy();
    });

    it('navigates to profile when avatar is clicked', async () => {
      const { getByTestId } = await renderWithProviders(<HomeScreen />);

      const avatar = getByTestId('home-profile-avatar');
      fireEvent.press(avatar);

      expect(mockPush).toHaveBeenCalledWith('/(tabs)/perfil');
    });

    it('cycles budget amount when pressing "Ajustar"', async () => {
      const { getByText, queryByText } = await renderWithProviders(<HomeScreen />);

      expect(getByText(/20\.000/)).toBeTruthy();

      const adjustButton = getByText('Ajustar');
      await fireEvent.press(adjustButton);
      await waitFor(() => {
        expect(getByText(/25\.000/)).toBeTruthy();
      });
      expect(queryByText(/20\.000/)).toBeNull();

      await fireEvent.press(adjustButton);
      await waitFor(() => {
        expect(getByText(/30\.000/)).toBeTruthy();
      });
    });

    it('displays informative modal for nonfunctional future features without crash', async () => {
      const { getByText, queryByText } = await renderWithProviders(<HomeScreen />);

      const scanButton = getByText('Tomar foto');
      await fireEvent.press(scanButton);

      await waitFor(() => {
        expect(getByText('Captura de cámara en preparación')).toBeTruthy();
      });
      expect(getByText(/Fase 2B/)).toBeTruthy();

      // Close modal
      const closeButton = getByText('Entendido');
      await fireEvent.press(closeButton);

      await waitFor(() => {
        expect(queryByText('Captura de cámara en preparación')).toBeNull();
      });
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

  describe('Placeholder Screens (Despensa, Plan, Perfil)', () => {
    it('renders Mi Despensa placeholder with Phase 2B development status', async () => {
      const { getByText, getByTestId } = await renderWithProviders(<DespensaScreen />);

      expect(getByText('Mi Despensa')).toBeTruthy();
      expect(getByText('Fase 2B')).toBeTruthy();
      expect(getByText('Inventario de Despensa')).toBeTruthy();
      expect(getByText(/Fase 2B con persistencia/)).toBeTruthy();

      const backButton = getByTestId('despensa-back-home-button');
      fireEvent.press(backButton);
      expect(mockPush).toHaveBeenCalledWith('/(tabs)');
    });

    it('renders Plan Semanal placeholder with Phase 3 development status', async () => {
      const { getByText, getByTestId } = await renderWithProviders(<PlanScreen />);

      expect(getByText('Plan Semanal')).toBeTruthy();
      expect(getByText('Fase 3')).toBeTruthy();
      expect(getByText('Planificación de Comidas y Presupuesto')).toBeTruthy();

      const backButton = getByTestId('plan-back-home-button');
      fireEvent.press(backButton);
      expect(mockPush).toHaveBeenCalledWith('/(tabs)');
    });

    it('renders Perfil placeholder with Phase 4 development status and replay links', async () => {
      const { getByText, getByTestId } = await renderWithProviders(<PerfilScreen />);

      expect(getByText('Perfil de Usuario')).toBeTruthy();
      expect(getByText('Fase 4')).toBeTruthy();
      expect(getByText('Preferencias y Configuración')).toBeTruthy();

      // Test replay welcome
      const welcomeLink = getByTestId('perfil-welcome-button');
      fireEvent.press(welcomeLink);
      expect(mockPush).toHaveBeenCalledWith('/');

      // Test design system showcase link
      const dsLink = getByTestId('perfil-design-system-button');
      fireEvent.press(dsLink);
      expect(mockPush).toHaveBeenCalledWith('/design-system');

      // Test back to home
      const backHome = getByTestId('perfil-back-home-button');
      fireEvent.press(backHome);
      expect(mockPush).toHaveBeenCalledWith('/(tabs)');
    });
  });
});
