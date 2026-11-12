/**
 * FoodAI Theme System - Centralized Context & Providers
 * Manages reactive light, dark and system appearance states,
 * native Appearance integration, and AsyncStorage persistence.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Appearance, ColorSchemeName } from 'react-native';
import { AppColors, darkColors, lightColors } from '../theme/colors';
import {
  ColorScheme,
  ThemeMode,
  ThemeStorageAdapter,
  defaultThemeStorageAdapter,
  isValidThemeMode,
} from '../services/storage/themeStorage';

export type { ThemeMode, ColorScheme };

export interface ThemeContextValue {
  /** Preferencia seleccionada por el usuario ('light' | 'dark' | 'system') */
  themeMode: ThemeMode;
  /** Alias de conveniencia para themeMode */
  mode: ThemeMode;
  /** Esquema de color resuelto activo ('light' | 'dark') */
  activeColorScheme: ColorScheme;
  /** Alias de conveniencia para activeColorScheme */
  colorScheme: ColorScheme;
  /** Paleta de tokens de color semántica activa según el esquema */
  colors: AppColors;
  /** Si la preferencia almacenada ha finalizado su hidratación */
  isLoaded: boolean;
  /** Error reciente de persistencia en disco, si ocurrió */
  storageError: string | null;
  /** Actualiza y persiste la preferencia de apariencia */
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  /** Limpia el error de almacenamiento */
  clearStorageError: () => void;
}

const defaultThemeContextValue: ThemeContextValue = {
  themeMode: 'system',
  mode: 'system',
  activeColorScheme: 'light',
  colorScheme: 'light',
  colors: lightColors,
  isLoaded: true,
  storageError: null,
  setThemeMode: async () => {},
  clearStorageError: () => {},
};

export const ThemeContext = createContext<ThemeContextValue>(defaultThemeContextValue);

export interface ThemeProviderProps {
  children: React.ReactNode;
  /** Modo inicial opcional para entornos de prueba */
  initialMode?: ThemeMode;
  /** Adaptador de persistencia inyectable */
  storageAdapter?: ThemeStorageAdapter;
}

function resolveSystemScheme(nativeScheme?: ColorSchemeName | null): ColorScheme {
  return nativeScheme === 'dark' ? 'dark' : 'light';
}

/**
 * Sincroniza la apariencia nativa de la aplicación con React Native.
 * Según la documentación oficial de React Native 0.88+:
 * - 'light' fuerza el estilo claro.
 * - 'dark' fuerza el estilo oscuro.
 * - 'auto' elimina el override a nivel de app y restaura la preferencia del sistema operativo.
 */
export function syncNativeAppearance(mode: ThemeMode) {
  if (typeof Appearance.setColorScheme === 'function') {
    try {
      const targetScheme = mode === 'system' ? 'auto' : mode;
      Appearance.setColorScheme(targetScheme as any);
    } catch (err) {
      if (__DEV__) {
        console.warn('[FoodAI:ThemeContext] Appearance.setColorScheme failed:', err);
      }
    }
  }
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  initialMode,
  storageAdapter = defaultThemeStorageAdapter,
}) => {
  // 1. Esquema del sistema operativo detectado por React Native
  const [systemScheme, setSystemScheme] = useState<ColorScheme>(() =>
    resolveSystemScheme(Appearance.getColorScheme())
  );

  // 2. Modo seleccionado por el usuario
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => initialMode ?? 'system');
  const [isLoaded, setIsLoaded] = useState<boolean>(() => initialMode !== undefined);
  const [storageError, setStorageError] = useState<string | null>(null);

  // Referencias para control de condiciones de carrera y serialización FIFO
  const nextOperationVersionRef = useRef(0);
  const lastAppliedVersionRef = useRef(0);
  const lastPersistedVersionRef = useRef(0);
  const isMountedRef = useRef(true);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

  // 3. Suscripción a cambios del sistema operativo
  useEffect(() => {
    isMountedRef.current = true;

    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      if (isMountedRef.current) {
        setSystemScheme(resolveSystemScheme(colorScheme));
      }
    });

    return () => {
      isMountedRef.current = false;
      subscription?.remove?.();
    };
  }, []);

  // 4. Hidratación inicial desde almacenamiento persistente con timeout de seguridad
  useEffect(() => {
    if (initialMode !== undefined) {
      syncNativeAppearance(initialMode);
      return;
    }

    let isMounted = true;
    const version = ++nextOperationVersionRef.current;

    // Timeout de seguridad de 2500ms para evitar bloqueo indefinido en arranque
    const timeoutPromise = new Promise<ThemeMode>((resolve) => {
      setTimeout(() => resolve('system'), 2500);
    });

    void (async () => {
      try {
        const stored = await Promise.race([storageAdapter.getThemeMode(), timeoutPromise]);
        if (!isMounted) return;

        // Validar versión monótona para no pisar selecciones de usuario posteriores
        if (version >= lastAppliedVersionRef.current) {
          lastAppliedVersionRef.current = version;
          const resolved = stored ?? 'system';
          setThemeModeState(resolved);
          syncNativeAppearance(resolved);
        }
      } catch (err) {
        if (!isMounted) return;
        setStorageError(
          err instanceof Error
            ? err.message
            : 'No se pudo leer la preferencia de apariencia almacenada.'
        );
      } finally {
        if (isMounted) {
          setIsLoaded(true);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [initialMode, storageAdapter]);

  // 5. Cambio reactivo y persistencia segura de la preferencia (FIFO / Last-Write-Wins)
  const setThemeMode = useCallback(
    async (mode: ThemeMode) => {
      if (!isValidThemeMode(mode)) {
        throw new Error(`Modo de tema inválido: "${mode}". Se esperaba 'light', 'dark' o 'system'.`);
      }

      // 1. Asignar versión monótona para proteger contra race conditions de I/O
      const operationVersion = ++nextOperationVersionRef.current;
      lastAppliedVersionRef.current = operationVersion;

      // 2. Aplicar inmediatamente en memoria para retroalimentación instantánea (optimistic update)
      setThemeModeState(mode);
      if (isMountedRef.current) {
        setStorageError(null);
      }
      syncNativeAppearance(mode);

      // 3. Serializar la persistencia en cola de escritura FIFO / last-write-wins
      const writeTask = async () => {
        // Si el componente se desmontó o una selección más reciente ya fue encolada
        if (!isMountedRef.current || operationVersion < lastAppliedVersionRef.current) {
          return;
        }

        try {
          await storageAdapter.saveThemeMode(mode);
          if (operationVersion >= lastPersistedVersionRef.current) {
            lastPersistedVersionRef.current = operationVersion;
          }
        } catch (err) {
          // Solo reportar error en el estado si esta operación sigue siendo la última seleccionada
          if (operationVersion === lastAppliedVersionRef.current && isMountedRef.current) {
            setStorageError(
              err instanceof Error
                ? err.message
                : 'No se pudo guardar la preferencia de apariencia en el dispositivo.'
            );
          }
          // Propagar el error si esta sigue siendo la última operación
          if (operationVersion === lastAppliedVersionRef.current) {
            throw err;
          }
        }
      };

      const queued = writeQueueRef.current.then(writeTask, writeTask);
      writeQueueRef.current = queued.catch(() => {});
      return queued;
    },
    [storageAdapter]
  );

  const clearStorageError = useCallback(() => {
    setStorageError(null);
  }, []);

  // 6. Resuelve el esquema activo en función del modo seleccionado y el sistema operativo
  const activeColorScheme: ColorScheme = useMemo(() => {
    if (themeMode === 'system') {
      return systemScheme;
    }
    return themeMode;
  }, [themeMode, systemScheme]);

  const activeColors: AppColors = useMemo(() => {
    return activeColorScheme === 'dark' ? darkColors : lightColors;
  }, [activeColorScheme]);

  const contextValue = useMemo<ThemeContextValue>(() => {
    return {
      themeMode,
      mode: themeMode,
      activeColorScheme,
      colorScheme: activeColorScheme,
      colors: activeColors,
      isLoaded,
      storageError,
      setThemeMode,
      clearStorageError,
    };
  }, [
    themeMode,
    activeColorScheme,
    activeColors,
    isLoaded,
    storageError,
    setThemeMode,
    clearStorageError,
  ]);

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
};

/**
 * Hook principal para consumir el estado del tema de la aplicación.
 */
export function useAppTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  return context ?? defaultThemeContextValue;
}

/**
 * Hook abreviado para obtener la paleta de colores activa actual.
 */
export function useThemeColors(): AppColors {
  const { colors } = useAppTheme();
  return colors;
}

/**
 * Hook para generar y memorizar estilos dependientes del tema.
 * Recrea los estilos únicamente cuando cambia la paleta de colores activa.
 */
export function useThemeStyles<T>(factory: (colors: AppColors) => T): T {
  const { colors } = useAppTheme();
  return useMemo(() => factory(colors), [colors, factory]);
}
