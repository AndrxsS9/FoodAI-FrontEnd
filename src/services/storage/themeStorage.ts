/**
 * FoodAI - Adaptador y persistencia de preferencias de apariencia (Fase 6B.2).
 * Almacena y recupera el modo de apariencia visual del usuario en el dispositivo.
 * Totalmente desacoplado de autenticación, despensa, presupuesto y recetas.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ColorScheme = 'light' | 'dark';

export const APPEARANCE_STORAGE_KEY = '@foodai:appearance_preference_v1';
export const APPEARANCE_STORAGE_VERSION = 1;

export interface AppearanceStorageEnvelope {
  version: number;
  updatedAt: string;
  themeMode: ThemeMode;
}

export class ThemeStorageError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ThemeStorageError';
  }
}

export function isValidThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

export interface ThemeStorageAdapter {
  getThemeMode(): Promise<ThemeMode>;
  saveThemeMode(mode: ThemeMode): Promise<void>;
  clearThemeMode(): Promise<void>;
  getPreference?(): Promise<ThemeMode>;
  savePreference?(mode: ThemeMode): Promise<void>;
}

export class AsyncStorageThemeStorageAdapter implements ThemeStorageAdapter {
  private readonly key: string;
  private writeQueue: Promise<void> = Promise.resolve();
  private scheduledCount = 0;

  constructor(key: string = APPEARANCE_STORAGE_KEY) {
    this.key = key;
  }

  async getThemeMode(): Promise<ThemeMode> {
    let raw: string | null = null;
    try {
      raw = await AsyncStorage.getItem(this.key);
    } catch (readError) {
      console.warn(
        '[FoodAI:themeStorage] Fallo de I/O al leer la preferencia de apariencia de AsyncStorage. Usando "system":',
        readError
      );
      return 'system';
    }

    if (!raw) {
      return 'system';
    }

    const trimmed = raw.trim();

    // Compatibilidad con almacenamiento de valor de cadena directa (formato legacy)
    if (isValidThemeMode(trimmed)) {
      return trimmed;
    }

    // Deserialización y validación estricta de sobre JSON versionado
    try {
      const parsed = JSON.parse(trimmed);

      // Debe ser un objeto plano válido (no null, no array, typeof === 'object')
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        console.warn(
          `[FoodAI:themeStorage] Estructura de sobre de apariencia inválida: "${raw}". Usando 'system' como valor predeterminado.`
        );
        return 'system';
      }

      // Validar versión exacta soportada (versión 1)
      if (parsed.version !== APPEARANCE_STORAGE_VERSION) {
        console.warn(
          `[FoodAI:themeStorage] Versión de sobre no soportada: ${parsed.version}. Versión esperada: ${APPEARANCE_STORAGE_VERSION}. Usando 'system' como valor predeterminado.`
        );
        return 'system';
      }

      // Validar themeMode
      if (isValidThemeMode(parsed.themeMode)) {
        return parsed.themeMode;
      }

      console.warn(
        `[FoodAI:themeStorage] themeMode inválido en sobre versionado: "${parsed.themeMode}". Usando 'system' como valor predeterminado.`
      );
      return 'system';
    } catch (parseError) {
      console.warn(
        `[FoodAI:themeStorage] Contenido corrupto no interpretable como JSON: "${raw}". Usando 'system' como valor predeterminado:`,
        parseError
      );
      return 'system';
    }
  }

  async saveThemeMode(mode: ThemeMode): Promise<void> {
    if (!isValidThemeMode(mode)) {
      throw new ThemeStorageError(
        `Modo de tema inválido: "${String(mode)}". Debe ser 'light', 'dark' o 'system'.`
      );
    }

    const version = ++this.scheduledCount;

    const performWrite = async () => {
      // Si una escritura más reciente fue encolada mientras esta esperaba en cola, saltarla
      if (version < this.scheduledCount) {
        return;
      }

      const envelope: AppearanceStorageEnvelope = {
        version: APPEARANCE_STORAGE_VERSION,
        updatedAt: new Date().toISOString(),
        themeMode: mode,
      };

      try {
        await AsyncStorage.setItem(this.key, JSON.stringify(envelope));
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Error al persistir la preferencia de apariencia en el dispositivo.';
        throw new ThemeStorageError(message, error);
      }
    };

    const queued = this.writeQueue.then(performWrite, performWrite);
    this.writeQueue = queued.catch(() => {});
    return queued;
  }

  async clearThemeMode(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.key);
    } catch (error) {
      throw new ThemeStorageError('Error al eliminar la preferencia de apariencia.', error);
    }
  }

  async getPreference(): Promise<ThemeMode> {
    return this.getThemeMode();
  }

  async savePreference(mode: ThemeMode): Promise<void> {
    return this.saveThemeMode(mode);
  }
}

export const defaultThemeStorageAdapter = new AsyncStorageThemeStorageAdapter();
