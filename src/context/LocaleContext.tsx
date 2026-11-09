/**
 * FoodAI - Contexto reactivo de idioma de la interfaz (Fase 28C-A).
 *
 * - Idiomas soportados: 'es' (predeterminado) y 'en'.
 * - El cambio de idioma es inmediato y reactivo: solo vuelven a renderizarse los consumidores;
 *   no se remonta ningún proveedor, por lo que no cierra sesión ni reinicia la navegación.
 * - La preferencia se persiste localmente con escrituras serializadas: una escritura obsoleta
 *   nunca sobrescribe una elección más reciente, y la hidratación inicial nunca pisa una
 *   selección hecha por el usuario mientras se leía el almacenamiento.
 * - Los fallos de persistencia se exponen como códigos estables (`storageError`), nunca como
 *   mensajes internos crudos.
 * - Sin proveedor, los consumidores reciben el español predeterminado (compatibilidad total).
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
import {
  DEFAULT_LOCALE,
  Locale,
  LocaleStorageAdapter,
  LocaleStorageError,
  LocaleStorageErrorCode,
  defaultLocaleStorageAdapter,
  isSupportedLocale,
} from '../services/storage/localeStorage';
import { Translator, getTranslator } from '../locales';
import { LocaleFormatters, getFormatters } from '../locales/format';

export type { Locale };

export interface LocaleContextValue extends Translator {
  /** Formateadores de fechas, números y moneda (COP) para el idioma activo. */
  format: LocaleFormatters;
  /** Si la preferencia almacenada terminó de hidratarse. */
  isLoaded: boolean;
  /** Código del último fallo de persistencia, si ocurrió. */
  storageError: LocaleStorageErrorCode | null;
  /** Aplica el idioma de inmediato y lo persiste. Rechaza si la persistencia falla. */
  setLocale: (locale: Locale) => Promise<void>;
  clearStorageError: () => void;
}

function buildValue(
  locale: Locale,
  isLoaded: boolean,
  storageError: LocaleStorageErrorCode | null,
  setLocale: LocaleContextValue['setLocale'],
  clearStorageError: () => void
): LocaleContextValue {
  return {
    ...getTranslator(locale),
    format: getFormatters(locale),
    isLoaded,
    storageError,
    setLocale,
    clearStorageError,
  };
}

const defaultLocaleContextValue: LocaleContextValue = buildValue(
  DEFAULT_LOCALE,
  true,
  null,
  async () => {},
  () => {}
);

export const LocaleContext = createContext<LocaleContextValue>(defaultLocaleContextValue);

/** Tiempo máximo de espera para la lectura inicial antes de continuar con el español. */
export const LOCALE_HYDRATION_TIMEOUT_MS = 2500;

export interface LocaleProviderProps {
  children: React.ReactNode;
  /** Idioma inicial fijo (pruebas); omite la hidratación desde almacenamiento. */
  initialLocale?: Locale;
  /** Adaptador de persistencia inyectable. */
  storageAdapter?: LocaleStorageAdapter;
}

function toErrorCode(error: unknown, fallback: LocaleStorageErrorCode): LocaleStorageErrorCode {
  return error instanceof LocaleStorageError ? error.code : fallback;
}

export const LocaleProvider: React.FC<LocaleProviderProps> = ({
  children,
  initialLocale,
  storageAdapter = defaultLocaleStorageAdapter,
}) => {
  const [locale, setLocaleState] = useState<Locale>(() =>
    initialLocale && isSupportedLocale(initialLocale) ? initialLocale : DEFAULT_LOCALE
  );
  const [isLoaded, setIsLoaded] = useState<boolean>(() => initialLocale !== undefined);
  const [storageError, setStorageError] = useState<LocaleStorageErrorCode | null>(null);

  // Versión monótona de operaciones: la hidratación y cada selección toman una versión.
  const nextVersionRef = useRef(0);
  const lastAppliedVersionRef = useRef(0);
  const isMountedRef = useRef(true);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Hidratación inicial con tiempo límite de seguridad.
  useEffect(() => {
    if (initialLocale !== undefined) return;

    let active = true;
    const version = ++nextVersionRef.current;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const timeout = new Promise<'timeout'>((resolve) => {
      timeoutHandle = setTimeout(() => resolve('timeout'), LOCALE_HYDRATION_TIMEOUT_MS);
    });

    void (async () => {
      try {
        const stored = await Promise.race([storageAdapter.getLocale(), timeout]);
        if (!active) return;
        // Solo aplicar si ninguna selección del usuario ocurrió mientras se leía.
        if (version >= lastAppliedVersionRef.current && stored !== 'timeout') {
          lastAppliedVersionRef.current = version;
          setLocaleState(stored ?? DEFAULT_LOCALE);
        }
      } catch (error) {
        if (!active) return;
        setStorageError(toErrorCode(error, 'load_failed'));
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (active) setIsLoaded(true);
      }
    })();

    return () => {
      active = false;
      if (timeoutHandle) clearTimeout(timeoutHandle);
    };
  }, [initialLocale, storageAdapter]);

  const setLocale = useCallback(
    async (next: Locale) => {
      if (!isSupportedLocale(next)) {
        throw new LocaleStorageError('invalid_locale', `Idioma no soportado: "${String(next)}".`);
      }

      const operationVersion = ++nextVersionRef.current;
      lastAppliedVersionRef.current = operationVersion;

      // Aplicación inmediata en memoria: los consumidores se actualizan sin reinicio.
      setLocaleState(next);
      if (isMountedRef.current) setStorageError(null);

      const writeTask = async () => {
        // Una selección más reciente ya fue aplicada: esta escritura quedó obsoleta.
        if (!isMountedRef.current || operationVersion < lastAppliedVersionRef.current) return;

        try {
          await storageAdapter.saveLocale(next);
        } catch (error) {
          if (operationVersion === lastAppliedVersionRef.current) {
            if (isMountedRef.current) setStorageError(toErrorCode(error, 'save_failed'));
            throw error instanceof LocaleStorageError
              ? error
              : new LocaleStorageError('save_failed', 'No se pudo guardar la preferencia de idioma.', error);
          }
        }
      };

      const queued = writeQueueRef.current.then(writeTask, writeTask);
      writeQueueRef.current = queued.catch(() => {});
      return queued;
    },
    [storageAdapter]
  );

  const clearStorageError = useCallback(() => setStorageError(null), []);

  const value = useMemo<LocaleContextValue>(
    () => ({
      ...getTranslator(locale),
      format: getFormatters(locale),
      isLoaded,
      storageError,
      setLocale,
      clearStorageError,
    }),
    [locale, isLoaded, storageError, setLocale, clearStorageError]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
};

/** Hook principal: idioma activo, traductores, formateadores y selección. */
export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext) ?? defaultLocaleContextValue;
}

/** Alias abreviado para componentes que solo necesitan traducir. */
export function useTranslation(): LocaleContextValue {
  return useLocale();
}
