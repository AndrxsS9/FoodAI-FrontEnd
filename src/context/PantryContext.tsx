/**
 * Contexto global y proveedor de estado reactivo para la despensa (Fase 2B).
 * Mantiene sincronizados en tiempo real la pantalla de despensa y el resumen del inicio.
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
  CreateIngredientInput,
  Ingredient,
  IngredientCategory,
  PantrySummary,
  UpdateIngredientInput,
  getExpirationStatus,
} from '../types/pantry';
import {
  PantryStorageAdapter,
  pantryStorage as defaultPantryStorage,
} from '../services/storage/pantryStorage';

export interface PantryContextValue {
  ingredients: Ingredient[];
  isLoading: boolean;
  storageError: string | null;
  summary: PantrySummary;
  addIngredient: (input: CreateIngredientInput) => Promise<Ingredient>;
  updateIngredient: (input: UpdateIngredientInput) => Promise<Ingredient>;
  deleteIngredient: (id: string) => Promise<void>;
  adjustQuantity: (id: string, delta: number) => Promise<void>;
  refresh: () => Promise<void>;
  clearStorageError: () => void;
}

const PantryContext = createContext<PantryContextValue | undefined>(undefined);

export interface PantryProviderProps {
  children: React.ReactNode;
  storageAdapter?: PantryStorageAdapter;
  initialIngredients?: Ingredient[];
}

export function PantryProvider({
  children,
  storageAdapter = defaultPantryStorage,
  initialIngredients,
}: PantryProviderProps) {
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    initialIngredients ?? []
  );
  const [isLoading, setIsLoading] = useState<boolean>(!initialIngredients);
  const [storageError, setStorageError] = useState<string | null>(null);

  // Rastreador de operaciones de carga activas (hidratación inicial, refresh).
  // Permite desacoplar el ciclo de vida del indicador de carga (spinner)
  // de la validez de los datos recibidos, evitando que lecturas obsoletas
  // o superadas dejen a la interfaz permanentemente bloqueada en `isLoading = true`.
  const activeLoadsCountRef = React.useRef<number>(!initialIngredients ? 1 : 0);
  const lastAppliedVersionRef = React.useRef<number>(0);
  const nextOperationVersionRef = React.useRef<number>(0);

  const loadFromStorage = useCallback(async () => {
    const opVersion = ++nextOperationVersionRef.current;
    activeLoadsCountRef.current += 1;
    setIsLoading(true);
    setStorageError(null);
    try {
      const loaded = await storageAdapter.getIngredients();
      if (opVersion >= lastAppliedVersionRef.current) {
        lastAppliedVersionRef.current = opVersion;
        setIngredients(loaded);
      }
    } catch (error) {
      if (opVersion >= lastAppliedVersionRef.current) {
        const message =
          error instanceof Error
            ? error.message
            : 'Error inesperado al cargar la despensa.';
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
    if (!initialIngredients) {
      const opVersion = ++nextOperationVersionRef.current;
      storageAdapter
        .getIngredients()
        .then((loaded) => {
          if (!isMounted) return;
          if (opVersion >= lastAppliedVersionRef.current) {
            lastAppliedVersionRef.current = opVersion;
            setIngredients(loaded);
          }
        })
        .catch((error) => {
          if (!isMounted) return;
          if (opVersion >= lastAppliedVersionRef.current) {
            const message =
              error instanceof Error
                ? error.message
                : 'Error inesperado al cargar la despensa.';
            setStorageError(message);
          }
        })
        .finally(() => {
          if (isMounted) {
            activeLoadsCountRef.current = Math.max(
              0,
              activeLoadsCountRef.current - 1
            );
            if (activeLoadsCountRef.current === 0) {
              setIsLoading(false);
            }
          }
        });
    }
    return () => {
      isMounted = false;
    };
  }, [storageAdapter, initialIngredients]);

  const addIngredient = useCallback(
    async (input: CreateIngredientInput): Promise<Ingredient> => {
      const opVersion = ++nextOperationVersionRef.current;
      setStorageError(null);
      try {
        const created = await storageAdapter.addIngredient(input);
        if (opVersion >= lastAppliedVersionRef.current) {
          lastAppliedVersionRef.current = opVersion;
          setIngredients((prev) => [
            created,
            ...prev.filter((item) => item.id !== created.id),
          ]);
        }
        return created;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Error al agregar el alimento.';
        setStorageError(message);
        throw error;
      }
    },
    [storageAdapter]
  );

  const updateIngredient = useCallback(
    async (input: UpdateIngredientInput): Promise<Ingredient> => {
      const opVersion = ++nextOperationVersionRef.current;
      setStorageError(null);
      try {
        const updated = await storageAdapter.updateIngredient(input);
        if (opVersion >= lastAppliedVersionRef.current) {
          lastAppliedVersionRef.current = opVersion;
          setIngredients((prev) =>
            prev.map((item) => (item.id === updated.id ? updated : item))
          );
        }
        return updated;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Error al actualizar el alimento.';
        setStorageError(message);
        throw error;
      }
    },
    [storageAdapter]
  );

  const deleteIngredient = useCallback(
    async (id: string): Promise<void> => {
      const opVersion = ++nextOperationVersionRef.current;
      setStorageError(null);
      try {
        await storageAdapter.deleteIngredient(id);
        if (opVersion >= lastAppliedVersionRef.current) {
          lastAppliedVersionRef.current = opVersion;
          setIngredients((prev) => prev.filter((item) => item.id !== id));
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Error al eliminar el alimento.';
        setStorageError(message);
        throw error;
      }
    },
    [storageAdapter]
  );

  const ingredientsRef = React.useRef(ingredients);
  useEffect(() => {
    ingredientsRef.current = ingredients;
  }, [ingredients]);

  const adjustQuantity = useCallback(
    async (id: string, delta: number): Promise<void> => {
      const opVersion = ++nextOperationVersionRef.current;
      setStorageError(null);
      try {
        if (storageAdapter.adjustQuantity) {
          const updated = await storageAdapter.adjustQuantity(id, delta);
          if (opVersion >= lastAppliedVersionRef.current) {
            lastAppliedVersionRef.current = opVersion;
            setIngredients((prev) =>
              prev.map((item) => (item.id === updated.id ? updated : item))
            );
          }
        } else {
          // Adaptador sin adjustQuantity nativo: derivar del valor persistido confirmado
          // sin aplicar mutaciones optimistas especulativas antes de tiempo.
          const currentList = await storageAdapter.getIngredients();
          const target = currentList.find((item) => item.id === id);
          if (!target) return;

          const newQty = Math.round((target.quantity + delta) * 1000) / 1000;
          if (newQty <= 0) {
            return;
          }

          const updated = await storageAdapter.updateIngredient({
            id,
            quantity: newQty,
          });
          if (opVersion >= lastAppliedVersionRef.current) {
            lastAppliedVersionRef.current = opVersion;
            setIngredients((prev) =>
              prev.map((item) => (item.id === updated.id ? updated : item))
            );
          }
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Error al ajustar la cantidad del alimento.';
        setStorageError(message);
        throw error;
      }
    },
    [storageAdapter]
  );

  const clearStorageError = useCallback(() => {
    setStorageError(null);
  }, []);

  const summary = useMemo<PantrySummary>(() => {
    const urgentIngredients: Ingredient[] = [];
    const availableIngredients: Ingredient[] = [];
    const categoriesBreakdown: Record<IngredientCategory, number> = {
      'Verduras y frutas': 0,
      'Carnes y proteínas': 0,
      Lácteos: 0,
      'Granos y cereales': 0,
      Alacena: 0,
      Otros: 0,
    };

    ingredients.forEach((item) => {
      if (categoriesBreakdown[item.category] !== undefined) {
        categoriesBreakdown[item.category] += 1;
      }

      const status = getExpirationStatus(item.expirationDate);
      if (status.isUrgent) {
        urgentIngredients.push(item);
      } else {
        availableIngredients.push(item);
      }
    });

    return {
      totalCount: ingredients.length,
      urgentCount: urgentIngredients.length,
      urgentIngredients,
      availableIngredients,
      categoriesBreakdown,
    };
  }, [ingredients]);

  const value = useMemo<PantryContextValue>(
    () => ({
      ingredients,
      isLoading,
      storageError,
      summary,
      addIngredient,
      updateIngredient,
      deleteIngredient,
      adjustQuantity,
      refresh: loadFromStorage,
      clearStorageError,
    }),
    [
      ingredients,
      isLoading,
      storageError,
      summary,
      addIngredient,
      updateIngredient,
      deleteIngredient,
      adjustQuantity,
      loadFromStorage,
      clearStorageError,
    ]
  );

  return (
    <PantryContext.Provider value={value}>{children}</PantryContext.Provider>
  );
}

export function usePantry(): PantryContextValue {
  const context = useContext(PantryContext);
  if (!context) {
    throw new Error('usePantry debe ser utilizado dentro de un PantryProvider.');
  }
  return context;
}

export function usePantrySafe(): PantryContextValue | undefined {
  return useContext(PantryContext);
}
