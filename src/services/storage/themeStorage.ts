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

  constructor(key: string = APPEARANCE_STORAGE_KEY) {
    this.key = key;
  }

  async getThemeMode(): Promise<ThemeMode> {
    try {
      const raw = await AsyncStorage.getItem(this.key);
      if (!raw) {
        return 'system';
      }

      const trimmed = raw.trim();

      // Compatibilidad con almacenamiento de valor de cadena directa
      if (isValidThemeMode(trimmed)) {
        return trimmed;
      }

      // Deserialización de sobre JSON versionado
      const parsed = JSON.parse(trimmed);
      if (
        parsed &&
        typeof parsed === 'object' &&
        isValidThemeMode(parsed.themeMode)
      ) {
        return parsed.themeMode;
      }

      console.warn(
        `[FoodAI:themeStorage] Valor de tema inválido o no reconocido: "${raw}". Usando 'system' como valor predeterminado.`
      );
      return 'system';
    } catch (error) {
      console.warn(
        '[FoodAI:themeStorage] Error al leer la preferencia de apariencia de AsyncStorage. Usando "system":',
        error
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
