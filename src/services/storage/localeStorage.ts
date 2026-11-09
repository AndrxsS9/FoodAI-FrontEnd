/**
 * FoodAI - Persistencia de la preferencia de idioma de la interfaz (Fase 28C-A).
 *
 * - Almacena únicamente el código de idioma ('es' | 'en') en un sobre JSON versionado.
 * - Totalmente desacoplado de autenticación, despensa, presupuesto, recetas y tema.
 * - Las lecturas fallidas por I/O se reportan explícitamente (LocaleStorageError) para que
 *   el contexto decida el respaldo; los contenidos corruptos o desconocidos vuelven a 'es'.
 * - Las escrituras se serializan en una cola FIFO; una escritura que quedó obsoleta porque
 *   se encoló otra más reciente se omite, de modo que nunca sobrescribe una elección nueva.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export type Locale = 'es' | 'en';

export const SUPPORTED_LOCALES: readonly Locale[] = ['es', 'en'] as const;
export const DEFAULT_LOCALE: Locale = 'es';

export const LOCALE_STORAGE_KEY = '@foodai:locale_preference_v1';
export const LOCALE_STORAGE_VERSION = 1;

export interface LocaleStorageEnvelope {
  version: number;
  updatedAt: string;
  locale: Locale;
}

export type LocaleStorageErrorCode = 'load_failed' | 'save_failed' | 'clear_failed' | 'invalid_locale';

export class LocaleStorageError extends Error {
  constructor(
    public readonly code: LocaleStorageErrorCode,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'LocaleStorageError';
  }
}

export function isSupportedLocale(value: unknown): value is Locale {
  return value === 'es' || value === 'en';
}

export interface LocaleStorageAdapter {
  /**
   * Devuelve el idioma almacenado o `null` si no hay preferencia válida guardada.
   * Lanza `LocaleStorageError('load_failed')` si el almacenamiento no puede leerse.
   */
  getLocale(): Promise<Locale | null>;
  /** Persiste el idioma. Lanza `LocaleStorageError('save_failed')` si falla. */
  saveLocale(locale: Locale): Promise<void>;
  clearLocale(): Promise<void>;
}

/** Interpreta el contenido crudo almacenado; `null` si no es una preferencia válida. */
export function parseStoredLocale(raw: string | null | undefined): Locale | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();

  // Compatibilidad con un valor de cadena directo.
  if (isSupportedLocale(trimmed)) return trimmed;

  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (parsed.version !== LOCALE_STORAGE_VERSION) return null;
    return isSupportedLocale(parsed.locale) ? parsed.locale : null;
  } catch {
    return null;
  }
}

export class AsyncStorageLocaleStorageAdapter implements LocaleStorageAdapter {
  private readonly key: string;
  private writeQueue: Promise<void> = Promise.resolve();
  private scheduledCount = 0;

  constructor(key: string = LOCALE_STORAGE_KEY) {
    this.key = key;
  }

  async getLocale(): Promise<Locale | null> {
    let raw: string | null;
    try {
      raw = await AsyncStorage.getItem(this.key);
    } catch (error) {
      throw new LocaleStorageError(
        'load_failed',
        'No se pudo leer la preferencia de idioma almacenada.',
        error
      );
    }

    const parsed = parseStoredLocale(raw);
    if (raw && parsed === null && __DEV__) {
      console.warn('[FoodAI:localeStorage] Preferencia de idioma no válida; se usará el idioma predeterminado.');
    }
    return parsed;
  }

  async saveLocale(locale: Locale): Promise<void> {
    if (!isSupportedLocale(locale)) {
      throw new LocaleStorageError('invalid_locale', `Idioma no soportado: "${String(locale)}".`);
    }

    const version = ++this.scheduledCount;

    const performWrite = async () => {
      // Una escritura más reciente fue encolada mientras esta esperaba: omitirla.
      if (version < this.scheduledCount) return;

      const envelope: LocaleStorageEnvelope = {
        version: LOCALE_STORAGE_VERSION,
        updatedAt: new Date().toISOString(),
        locale,
      };

      try {
        await AsyncStorage.setItem(this.key, JSON.stringify(envelope));
      } catch (error) {
        throw new LocaleStorageError(
          'save_failed',
          'No se pudo guardar la preferencia de idioma en el dispositivo.',
          error
        );
      }
    };

    const queued = this.writeQueue.then(performWrite, performWrite);
    this.writeQueue = queued.catch(() => {});
    return queued;
  }

  async clearLocale(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.key);
    } catch (error) {
      throw new LocaleStorageError(
        'clear_failed',
        'No se pudo eliminar la preferencia de idioma.',
        error
      );
    }
  }
}

export const defaultLocaleStorageAdapter = new AsyncStorageLocaleStorageAdapter();
