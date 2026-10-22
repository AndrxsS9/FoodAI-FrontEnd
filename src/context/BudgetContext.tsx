/**
 * FoodAI - Contexto global y proveedor de presupuesto compartido (Fase 2C).
 * Sincroniza el presupuesto disponible, número de comensales y tiempo preferido
 * entre el Inicio, la Despensa y el Descubrimiento de Recetas.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  setBudget: (amount: number) => Promise<void>;
  setServings: (servings: number) => Promise<void>;
  setMaxMinutes: (minutes?: number) => Promise<void>;
  resetBudget: () => Promise<void>;
}

const defaultBudgetContextValue: BudgetContextValue = {
  budget: DEFAULT_BUDGET_COP,
  servings: DEFAULT_SERVINGS,
  maxMinutes: undefined,
  isLoading: false,
  setBudget: async () => {},
  setServings: async () => {},
  setMaxMinutes: async () => {},
  resetBudget: async () => {},
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

  useEffect(() => {
    let isMounted = true;
    if (!initialPreferences) {
      storageAdapter
        .getPreferences()
        .then((loaded) => {
          if (isMounted) {
            setPreferences(loaded);
          }
        })
        .catch(() => {
          // Si falla lectura, se mantiene el valor por defecto seguro
        })
        .finally(() => {
          if (isMounted) {
            setIsLoading(false);
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
      setPreferences((prev) => ({ ...prev, budget: safeAmount }));
      try {
        await storageAdapter.savePreferences({ budget: safeAmount });
      } catch {
        // En caso de fallo de guardado en disco, se preserva el estado en memoria para la sesión activa
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
      setPreferences((prev) => ({ ...prev, servings: safeServings }));
      try {
        await storageAdapter.savePreferences({ servings: safeServings });
      } catch {
        // Preserva el estado en memoria
      }
    },
    [storageAdapter]
  );

  const setMaxMinutes = useCallback(
    async (minutes?: number): Promise<void> => {
      if (minutes !== undefined) {
        const validation = validateMaxMinutesInput(minutes);
        if (!validation.isValid) {
          throw new Error(validation.error);
        }
      }
      const safeMinutes = minutes !== undefined ? Math.round(minutes) : undefined;
      setPreferences((prev) => ({ ...prev, maxMinutes: safeMinutes }));
      try {
        await storageAdapter.savePreferences({ maxMinutes: safeMinutes });
      } catch {
        // Preserva en memoria
      }
    },
    [storageAdapter]
  );

  const resetBudget = useCallback(async (): Promise<void> => {
    setPreferences(defaultBudgetPreferences);
    try {
      await storageAdapter.resetPreferences();
    } catch {
      // Preserva en memoria
    }
  }, [storageAdapter]);

  const contextValue = useMemo<BudgetContextValue>(
    () => ({
      budget: preferences.budget,
      servings: preferences.servings,
      maxMinutes: preferences.maxMinutes,
      isLoading,
      setBudget,
      setServings,
      setMaxMinutes,
      resetBudget,
    }),
    [preferences, isLoading, setBudget, setServings, setMaxMinutes, resetBudget]
  );

  return (
    <BudgetContext.Provider value={contextValue}>
      {children}
    </BudgetContext.Provider>
  );
}

/**
 * Hook de acceso al presupuesto y preferencias compartidas.
 * Si se invoca fuera de un BudgetProvider, retorna valores por defecto seguros sin generar excepciones.
 */
export function useBudget(): BudgetContextValue {
  const context = useContext(BudgetContext);
  return context ?? defaultBudgetContextValue;
}
