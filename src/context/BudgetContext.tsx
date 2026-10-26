/**
 * FoodAI - Contexto global y proveedor de presupuesto compartido (Fase 2C & Fase 4).
 * Sincroniza el presupuesto disponible, número de comensales y tiempo preferido
 * entre el Inicio, la Despensa y el Descubrimiento de Recetas.
 *
 * Incluye protección contra condiciones de carrera, hidratación obsoleta,
 * persistencia atómica multipropiedad, serialización de mutaciones y propagación
 * explícita de errores de almacenamiento.
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
  SaveBudgetPreferencesInput,
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
  updatePreferences: (input: SaveBudgetPreferencesInput) => Promise<BudgetPreferences>;
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
  updatePreferences: async () => defaultBudgetPreferences,
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

  /**
   * Operación atómica de actualización de preferencias de presupuesto.
   * Valida exhaustivamente todas las mutaciones antes de persistir,
   * despacha una sola transacción contra el adaptador y actualiza el
   * estado únicamente tras el éxito de la escritura.
   */
  const updatePreferences = useCallback(
    async (input: SaveBudgetPreferencesInput): Promise<BudgetPreferences> => {
      // 1. Validar exhaustivamente todas las entradas solicitadas antes de invocar almacenamiento
      if (input.budget !== undefined) {
        const validation = validateBudgetInput(input.budget);
        if (!validation.isValid) {
          throw new Error(validation.error);
        }
      }

      if (input.servings !== undefined) {
        const validation = validateServingsInput(input.servings);
        if (!validation.isValid) {
          throw new Error(validation.error);
        }
      }

      const isRemovingLimit = input.resetMaxMinutes === true || input.maxMinutes === null;
      if (!isRemovingLimit && input.maxMinutes !== undefined) {
        const validation = validateMaxMinutesInput(input.maxMinutes);
        if (!validation.isValid) {
          throw new Error(validation.error);
        }
      }

      // 2. Construir el parche atómico validado y sanitizado
      const patch: SaveBudgetPreferencesInput = {};
      if (input.budget !== undefined) {
        patch.budget = Math.round(input.budget);
      }
      if (input.servings !== undefined) {
        patch.servings = Math.round(input.servings);
      }
      if (isRemovingLimit) {
        patch.resetMaxMinutes = true;
        patch.maxMinutes = null;
      } else if (typeof input.maxMinutes === 'number') {
        patch.maxMinutes = Math.round(input.maxMinutes);
      }

      const opVersion = ++nextOperationVersionRef.current;
      setStorageError(null);

      try {
        const committed = await storageAdapter.savePreferences(patch);
        if (opVersion >= lastAppliedVersionRef.current) {
          lastAppliedVersionRef.current = opVersion;
          setPreferences(committed);
        }
        return committed;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Error al persistir las preferencias de presupuesto.';
        setStorageError(message);
        throw error;
      }
    },
    [storageAdapter]
  );

  const setBudget = useCallback(
    async (amount: number): Promise<void> => {
      await updatePreferences({ budget: amount });
    },
    [updatePreferences]
  );

  const setServings = useCallback(
    async (servings: number): Promise<void> => {
      await updatePreferences({ servings });
    },
    [updatePreferences]
  );

  const setMaxMinutes = useCallback(
    async (minutes?: number | null): Promise<void> => {
      await updatePreferences(
        minutes === null || minutes === undefined
          ? { resetMaxMinutes: true, maxMinutes: null }
          : { maxMinutes: minutes }
      );
    },
    [updatePreferences]
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
      updatePreferences,
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
      updatePreferences,
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
