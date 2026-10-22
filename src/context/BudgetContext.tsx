/**
 * FoodAI - Contexto global y proveedor de presupuesto compartido (Fase 2C).
 * Sincroniza el presupuesto disponible, número de comensales y tiempo preferido
 * entre el Inicio, la Despensa y el Descubrimiento de Recetas.
 *
 * Incluye protección contra condiciones de carrera, hidratación obsoleta,
 * serialización de mutaciones y propagación explícita de errores de almacenamiento.
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
  DEFAULT_BUDGET_COP,
  DEFAULT_SERVINGS,
  BudgetPreferences,
} from '../types/budget';
import {
  BudgetStorageAdapter,
  budgetStorage as defaultBudgetStorage,
  defaultBudgetPreferences,
} from '../services/storage/budgetStorage';
import {
  validateBudgetInput,
  validateMaxMinutesInput,
  validateServingsInput,
} from '../types/recipe';

export interface BudgetContextValue {
  budget: number;
  servings: number;
  maxMinutes?: number;
  isLoading: boolean;
  storageError: string | null;
  setBudget: (amount: number) => Promise<void>;
  setServings: (servings: number) => Promise<void>;
  setMaxMinutes: (minutes?: number | null) => Promise<void>;
  resetBudget: () => Promise<void>;
  clearStorageError: () => void;
  refresh: () => Promise<void>;
}

const defaultBudgetContextValue: BudgetContextValue = {
  budget: DEFAULT_BUDGET_COP,
  servings: DEFAULT_SERVINGS,
  maxMinutes: undefined,
  isLoading: false,
  storageError: null,
  setBudget: async () => {},
  setServings: async () => {},
  setMaxMinutes: async () => {},
  resetBudget: async () => {},
  clearStorageError: () => {},
  refresh: async () => {},
};

const BudgetContext = createContext<BudgetContextValue | undefined>(undefined);

export interface BudgetProviderProps {
  children: React.ReactNode;
  storageAdapter?: BudgetStorageAdapter;
  initialPreferences?: Partial<BudgetPreferences>;
}

export function BudgetProvider({
  children,
  storageAdapter = defaultBudgetStorage,
  initialPreferences,
}: BudgetProviderProps) {
  const [preferences, setPreferences] = useState<BudgetPreferences>(() => ({
    ...defaultBudgetPreferences,
    ...initialPreferences,
  }));
  const [isLoading, setIsLoading] = useState<boolean>(!initialPreferences);
  const [storageError, setStorageError] = useState<string | null>(null);

  // Rastreo de versión operacional para evitar que lecturas asíncronas
  // lentas sobreescriban mutaciones de usuario más recientes
  const activeLoadsCountRef = useRef<number>(!initialPreferences ? 1 : 0);
  const lastAppliedVersionRef = useRef<number>(0);
  const nextOperationVersionRef = useRef<number>(0);

  const loadFromStorage = useCallback(async () => {
    const opVersion = ++nextOperationVersionRef.current;
    activeLoadsCountRef.current += 1;
    setIsLoading(true);
    setStorageError(null);
    try {
      const loaded = await storageAdapter.getPreferences();
      if (opVersion >= lastAppliedVersionRef.current) {
        lastAppliedVersionRef.current = opVersion;
        setPreferences(loaded);
      }
    } catch (error) {
      if (opVersion >= lastAppliedVersionRef.current) {
        const message =
          error instanceof Error
            ? error.message
            : 'Error al cargar las preferencias de presupuesto.';
        setStorageError(message);
      }
    } finally {
      activeLoadsCountRef.current = Math.max(0, activeLoadsCountRef.current - 1);
      if (activeLoadsCountRef.current === 0) {
        setIsLoading(false);
      }
    }
  }, [storageAdapter]);

  useEffect(() => {
    let isMounted = true;
    if (!initialPreferences) {
      const opVersion = ++nextOperationVersionRef.current;
      storageAdapter
        .getPreferences()
        .then((loaded) => {
          if (!isMounted) return;
          if (opVersion >= lastAppliedVersionRef.current) {
            lastAppliedVersionRef.current = opVersion;
            setPreferences(loaded);
          }
        })
        .catch((error) => {
          if (!isMounted) return;
          if (opVersion >= lastAppliedVersionRef.current) {
            const message =
              error instanceof Error
                ? error.message
                : 'Error inesperado al cargar el presupuesto.';
            setStorageError(message);
          }
        })
        .finally(() => {
          if (isMounted) {
            activeLoadsCountRef.current = Math.max(0, activeLoadsCountRef.current - 1);
            if (activeLoadsCountRef.current === 0) {
              setIsLoading(false);
            }
          }
        });
    }
    return () => {
      isMounted = false;
    };
  }, [storageAdapter, initialPreferences]);

  const setBudget = useCallback(
    async (amount: number): Promise<void> => {
      const validation = validateBudgetInput(amount);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }
      const safeAmount = Math.round(amount);
      const opVersion = ++nextOperationVersionRef.current;
      setStorageError(null);

      try {
        const committed = await storageAdapter.savePreferences({ budget: safeAmount });
        if (opVersion >= lastAppliedVersionRef.current) {
          lastAppliedVersionRef.current = opVersion;
          setPreferences(committed);
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Error al persistir el nuevo presupuesto.';
        setStorageError(message);
        throw error;
      }
    },
    [storageAdapter]
  );

  const setServings = useCallback(
    async (servings: number): Promise<void> => {
      const validation = validateServingsInput(servings);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }
      const safeServings = Math.round(servings);
      const opVersion = ++nextOperationVersionRef.current;
      setStorageError(null);

      try {
        const committed = await storageAdapter.savePreferences({ servings: safeServings });
        if (opVersion >= lastAppliedVersionRef.current) {
          lastAppliedVersionRef.current = opVersion;
          setPreferences(committed);
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Error al persistir el número de comensales.';
        setStorageError(message);
        throw error;
      }
    },
    [storageAdapter]
  );

  const setMaxMinutes = useCallback(
    async (minutes?: number | null): Promise<void> => {
      if (minutes !== undefined && minutes !== null) {
        const validation = validateMaxMinutesInput(minutes);
        if (!validation.isValid) {
          throw new Error(validation.error);
        }
      }

      const opVersion = ++nextOperationVersionRef.current;
      setStorageError(null);

      try {
        const committed = await storageAdapter.savePreferences(
          minutes === null || minutes === undefined
            ? { resetMaxMinutes: true }
            : { maxMinutes: Math.round(minutes) }
        );
        if (opVersion >= lastAppliedVersionRef.current) {
          lastAppliedVersionRef.current = opVersion;
          setPreferences(committed);
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Error al persistir el tiempo máximo de preparación.';
        setStorageError(message);
        throw error;
      }
    },
    [storageAdapter]
  );

  const resetBudget = useCallback(async (): Promise<void> => {
    const opVersion = ++nextOperationVersionRef.current;
    setStorageError(null);
    try {
      const fresh = await storageAdapter.resetPreferences();
      if (opVersion >= lastAppliedVersionRef.current) {
        lastAppliedVersionRef.current = opVersion;
        setPreferences(fresh);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error al reiniciar las preferencias de presupuesto.';
      setStorageError(message);
      throw error;
      }
  }, [storageAdapter]);

  const clearStorageError = useCallback(() => {
    setStorageError(null);
  }, []);

  const value = useMemo<BudgetContextValue>(
    () => ({
      budget: preferences.budget,
      servings: preferences.servings,
      maxMinutes: preferences.maxMinutes,
      isLoading,
      storageError,
      setBudget,
      setServings,
      setMaxMinutes,
      resetBudget,
      clearStorageError,
      refresh: loadFromStorage,
    }),
    [
      preferences.budget,
      preferences.servings,
      preferences.maxMinutes,
      isLoading,
      storageError,
      setBudget,
      setServings,
      setMaxMinutes,
      resetBudget,
      clearStorageError,
      loadFromStorage,
    ]
  );

  return (
    <BudgetContext.Provider value={value}>{children}</BudgetContext.Provider>
  );
}

export function useBudget(): BudgetContextValue {
  const context = useContext(BudgetContext);
  if (!context) {
    return defaultBudgetContextValue;
  }
  return context;
}
