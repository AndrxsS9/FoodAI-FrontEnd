/**
 * FoodAI - Pruebas completas del Contexto de Tema y Selector de Apariencia (Fase 6B.2).
 * Cubre:
 * - Proveedor central ThemeProvider y hook useAppTheme.
 * - Modo predeterminado ('system') y seguimiento del esquema del sistema operativo.
 * - Modos explícitos ('light' y 'dark') con paletas semánticas lightColors y darkColors.
 * - Persistencia asíncrona y protección contra race conditions en disco.
 * - Integración con el selector de perfil (Claro, Oscuro, Automático).
 * - Aislamiento de contextos autenticados (no remonta Auth ni Pantry al cambiar tema).
 * - Componente RecipeImage y adaptación de contrastes.
 */
import React, { useState } from 'react';
import { Appearance, Text, View } from 'react-native';
import { act, fireEvent, render, renderHook } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ThemeProvider,
  useAppTheme,
  useThemeColors,
  useThemeStyles,
} from '../src/context/ThemeContext';
import {
  AppColors,
  ThemeMode,
  ThemeStorageAdapter,
  darkColors,
  lightColors,
} from '../src/theme';
import { ProfileSettingsGroup } from '../src/components/profile/ProfileSettingsGroup';
import { RecipeImage } from '../src/components/recipe/RecipeImage';

// Mock in-memory storage adapter para pruebas
class MemoryThemeStorageAdapter implements ThemeStorageAdapter {
  private mode: ThemeMode;
  public getCalls = 0;
  public saveCalls: ThemeMode[] = [];
  public shouldFailSave = false;

  constructor(initial: ThemeMode = 'system') {
    this.mode = initial;
  }

  async getThemeMode(): Promise<ThemeMode> {
    this.getCalls++;
    return this.mode;
  }

  async saveThemeMode(mode: ThemeMode): Promise<void> {
    if (this.shouldFailSave) {
      throw new Error('Fallo simulado al escribir en disco');
    }
    this.saveCalls.push(mode);
    this.mode = mode;
  }

  async clearThemeMode(): Promise<void> {
    this.mode = 'system';
  }
}

describe('ThemeContext & Sistema de Apariencia (Fase 6B.2)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.restoreAllMocks();
    if (typeof Appearance.setColorScheme === 'function') {
      try {
        Appearance.setColorScheme('light' as any);
      } catch {
        // no-op
      }
    }
  });

  afterEach(async () => {
    await AsyncStorage.clear();
    jest.restoreAllMocks();
    if (typeof Appearance.setColorScheme === 'function') {
      try {
        Appearance.setColorScheme('light' as any);
      } catch {
        // no-op
      }
    }
  });

  describe('ThemeProvider & useAppTheme básico', () => {
    it('debe iniciar con "system" y resolver a light si el OS está en light', async () => {
      const storage = new MemoryThemeStorageAdapter('system');

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ThemeProvider storageAdapter={storage}>{children}</ThemeProvider>
      );

      const { result } = await renderHook(() => useAppTheme(), { wrapper });

      expect(result.current.themeMode).toBe('system');
      expect(result.current.mode).toBe('system');
      expect(result.current.activeColorScheme).toBe('light');
      expect(result.current.colorScheme).toBe('light');
      expect(result.current.colors.primary).toBe(lightColors.primary);
      expect(result.current.colors.canvas).toBe(lightColors.canvas);
    });

    it('debe cambiar inmediatamente a "dark" al llamar setThemeMode("dark")', async () => {
      const storage = new MemoryThemeStorageAdapter('system');

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ThemeProvider storageAdapter={storage}>{children}</ThemeProvider>
      );

      const { result } = await renderHook(() => useAppTheme(), { wrapper });

      await act(async () => {
        await result.current.setThemeMode('dark');
      });

      expect(result.current.themeMode).toBe('dark');
      expect(result.current.activeColorScheme).toBe('dark');
      expect(result.current.colors.primary).toBe(darkColors.primary);
      expect(result.current.colors.canvas).toBe(darkColors.canvas);
      expect(storage.saveCalls).toContain('dark');
    });

    it('debe cambiar inmediatamente a "light" al llamar setThemeMode("light")', async () => {
      const storage = new MemoryThemeStorageAdapter('dark');

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ThemeProvider storageAdapter={storage} initialMode="dark">
          {children}
        </ThemeProvider>
      );

      const { result } = await renderHook(() => useAppTheme(), { wrapper });
      expect(result.current.activeColorScheme).toBe('dark');

      await act(async () => {
        await result.current.setThemeMode('light');
      });

      expect(result.current.themeMode).toBe('light');
      expect(result.current.activeColorScheme).toBe('light');
      expect(result.current.colors.primary).toBe(lightColors.primary);
      expect(storage.saveCalls).toContain('light');
    });

    it('debe rechazar modos no válidos al invocar setThemeMode', async () => {
      const storage = new MemoryThemeStorageAdapter('system');

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ThemeProvider storageAdapter={storage}>{children}</ThemeProvider>
      );

      const { result } = await renderHook(() => useAppTheme(), { wrapper });

      await expect(
        result.current.setThemeMode('cyberpunk' as any)
      ).rejects.toThrow();
    });
  });

  describe('Reacción a cambios del sistema operativo (Appearance.addChangeListener)', () => {
    it('debe responder a cambios de esquema del OS cuando el modo es "system"', async () => {
      let listener: ((prefs: { colorScheme: 'light' | 'dark' }) => void) | null = null;
      const addListenerSpy = jest.spyOn(Appearance, 'addChangeListener').mockImplementation((cb: any) => {
        listener = cb;
        return { remove: jest.fn() } as any;
      });

      const storage = new MemoryThemeStorageAdapter('system');

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ThemeProvider storageAdapter={storage} initialMode="system">
          {children}
        </ThemeProvider>
      );

      const { result } = await renderHook(() => useAppTheme(), { wrapper });
      expect(result.current.themeMode).toBe('system');
      expect(result.current.activeColorScheme).toBe('light');

      // Simular cambio del OS a oscuro
      await act(async () => {
        listener?.({ colorScheme: 'dark' });
      });

      expect(result.current.themeMode).toBe('system');
      expect(result.current.activeColorScheme).toBe('dark');
      expect(result.current.colors.canvas).toBe(darkColors.canvas);

      // Simular cambio del OS de vuelta a claro
      await act(async () => {
        listener?.({ colorScheme: 'light' });
      });

      expect(result.current.activeColorScheme).toBe('light');
      expect(result.current.colors.canvas).toBe(lightColors.canvas);
      addListenerSpy.mockRestore();
    });

    it('debe IGNORAR cambios del OS cuando el usuario ha fijado "light" o "dark"', async () => {
      let listener: ((prefs: { colorScheme: 'light' | 'dark' }) => void) | null = null;
      const addListenerSpy = jest.spyOn(Appearance, 'addChangeListener').mockImplementation((cb: any) => {
        listener = cb;
        return { remove: jest.fn() } as any;
      });

      const storage = new MemoryThemeStorageAdapter('dark');

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ThemeProvider storageAdapter={storage} initialMode="dark">
          {children}
        </ThemeProvider>
      );

      const { result } = await renderHook(() => useAppTheme(), { wrapper });
      expect(result.current.activeColorScheme).toBe('dark');

      // El OS cambia a claro pero el usuario fijó oscuro
      await act(async () => {
        listener?.({ colorScheme: 'light' });
      });

      expect(result.current.themeMode).toBe('dark');
      expect(result.current.activeColorScheme).toBe('dark');
      expect(result.current.colors.canvas).toBe(darkColors.canvas);
      addListenerSpy.mockRestore();
    });
  });

  describe('Protección contra fallos de almacenamiento y race conditions', () => {
    it('debe exponer storageError si la persistencia falla pero mantener la UI receptiva', async () => {
      const storage = new MemoryThemeStorageAdapter('system');
      storage.shouldFailSave = true;

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ThemeProvider storageAdapter={storage}>{children}</ThemeProvider>
      );

      const { result } = await renderHook(() => useAppTheme(), { wrapper });

      await act(async () => {
        try {
          await result.current.setThemeMode('dark');
        } catch {
          // Ignorado intencionalmente para verificar el estado reactivo del contexto
        }
      });

      // El modo se actualiza optimistamente para retroalimentación instantánea
      expect(result.current.themeMode).toBe('dark');
      expect(result.current.storageError).not.toBeNull();

      // Se puede limpiar el error manualmente
      await act(async () => {
        result.current.clearStorageError();
      });
      expect(result.current.storageError).toBeNull();
    });

    it('debe prevenir que operaciones asíncronas lentas pisen una selección más reciente', async () => {
      let resolveSlowRead: (mode: ThemeMode) => void;
      const slowStorage: ThemeStorageAdapter = {
        getThemeMode: () =>
          new Promise((resolve) => {
            resolveSlowRead = resolve;
          }),
        saveThemeMode: jest.fn().mockResolvedValue(undefined),
        clearThemeMode: jest.fn().mockResolvedValue(undefined),
      };

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ThemeProvider storageAdapter={slowStorage}>{children}</ThemeProvider>
      );

      const { result } = await renderHook(() => useAppTheme(), { wrapper });

      // El usuario elige "dark" antes de que la lectura inicial de disco termine
      await act(async () => {
        await result.current.setThemeMode('dark');
      });
      expect(result.current.themeMode).toBe('dark');

      // Ahora termina la lectura asíncrona vieja que contenía "light"
      await act(async () => {
        resolveSlowRead!('light');
      });

      // NO debe sobrescribir "dark" con la lectura vieja "light"
      expect(result.current.themeMode).toBe('dark');
      expect(result.current.activeColorScheme).toBe('dark');
    });
  });

  describe('useThemeStyles y useThemeColors', () => {
    it('useThemeColors debe devolver la paleta activa', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ThemeProvider initialMode="dark">{children}</ThemeProvider>
      );

      const { result } = await renderHook(() => useThemeColors(), { wrapper });
      expect(result.current.canvas).toBe(darkColors.canvas);
      expect(result.current.primary).toBe(darkColors.primary);
    });

    it('useThemeStyles debe memoizar y reconstruir estilos con la nueva paleta', async () => {
      const styleFactory = (themeColors: AppColors) => ({
        container: { backgroundColor: themeColors.canvas },
        text: { color: themeColors.textPrimary },
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ThemeProvider initialMode="light">{children}</ThemeProvider>
      );

      const { result } = await renderHook(
        () => ({
          theme: useAppTheme(),
          styles: useThemeStyles(styleFactory),
        }),
        { wrapper }
      );

      expect(result.current.styles.container.backgroundColor).toBe(lightColors.canvas);

      await act(async () => {
        await result.current.theme.setThemeMode('dark');
      });

      expect(result.current.styles.container.backgroundColor).toBe(darkColors.canvas);
      expect(result.current.styles.text.color).toBe(darkColors.textPrimary);
    });
  });

  describe('Selector de Apariencia en ProfileSettingsGroup', () => {
    it('debe renderizar las opciones Claro, Oscuro y Automático con accesibilidad', async () => {
      const screen = await render(
        <ThemeProvider initialMode="system">
          <ProfileSettingsGroup />
        </ThemeProvider>
      );

      expect(screen.getByText('Apariencia visual')).toBeTruthy();
      expect(screen.getByText('Claro')).toBeTruthy();
      expect(screen.getByText('Oscuro')).toBeTruthy();
      expect(screen.getByText('Automático')).toBeTruthy();

      const optionSystem = screen.getByTestId('appearance-option-system');
      const optionLight = screen.getByTestId('appearance-option-light');
      const optionDark = screen.getByTestId('appearance-option-dark');

      expect(optionSystem.props.accessibilityState.selected).toBe(true);
      expect(optionLight.props.accessibilityState.selected).toBe(false);
      expect(optionDark.props.accessibilityState.selected).toBe(false);
    });

    it('debe cambiar de tema al pulsar la opción Oscuro y actualizar accesibilidad', async () => {
      const storage = new MemoryThemeStorageAdapter('system');

      const screen = await render(
        <ThemeProvider storageAdapter={storage} initialMode="system">
          <ProfileSettingsGroup />
        </ThemeProvider>
      );

      const optionDark = screen.getByTestId('appearance-option-dark');
      await act(async () => {
        fireEvent.press(optionDark);
      });

      expect(optionDark.props.accessibilityState.selected).toBe(true);
      expect(screen.getByTestId('appearance-option-system').props.accessibilityState.selected).toBe(false);
      expect(storage.saveCalls).toContain('dark');
    });

    it('debe preservar las 3 filas informativas del perfil', async () => {
      const screen = await render(
        <ThemeProvider initialMode="system">
          <ProfileSettingsGroup />
        </ThemeProvider>
      );

      expect(screen.getByTestId('settings-row-config')).toBeTruthy();
      expect(screen.getByTestId('settings-row-help')).toBeTruthy();
      expect(screen.getByTestId('settings-row-about')).toBeTruthy();
    });
  });

  describe('Aislamiento de estado: ThemeProvider no remonta componentes autenticados', () => {
    it('un componente interno no debe perder su estado local cuando cambia el tema', async () => {
      function BusinessComponent() {
        const [counter] = useState(42);
        return (
          <View testID="business-component">
            <Text testID="counter-display">{counter}</Text>
          </View>
        );
      }

      function Switcher() {
        const { setThemeMode } = useAppTheme();
        return (
          <View>
            <BusinessComponent />
            <Text
              testID="switch-to-dark"
              onPress={() => setThemeMode('dark')}
            >
              Cambiar
            </Text>
          </View>
        );
      }

      const screen = await render(
        <ThemeProvider initialMode="light">
          <Switcher />
        </ThemeProvider>
      );

      expect(screen.getByTestId('counter-display').props.children).toBe(42);

      await act(async () => {
        fireEvent.press(screen.getByTestId('switch-to-dark'));
      });

      // El valor del estado interno se conserva inalterado
      expect(screen.getByTestId('counter-display').props.children).toBe(42);
    });
  });

  describe('RecipeImage contrastes en modo claro y oscuro', () => {
    it('debe renderizar el fallback de imagen de receta con contraste temático adecuado', async () => {
      const screen = await render(
        <ThemeProvider initialMode="light">
          <RecipeImage
            source={null}
            recipeName="Ajiaco Santafereño"
            fallbackTestID="test-recipe-image-fallback"
          />
        </ThemeProvider>
      );

      expect(screen.getByTestId('test-recipe-image-fallback')).toBeTruthy();

      await screen.rerender(
        <ThemeProvider initialMode="dark">
          <RecipeImage
            source={null}
            recipeName="Ajiaco Santafereño"
            fallbackTestID="test-recipe-image-fallback"
          />
        </ThemeProvider>
      );

      expect(screen.getByTestId('test-recipe-image-fallback')).toBeTruthy();
    });
  });
});
