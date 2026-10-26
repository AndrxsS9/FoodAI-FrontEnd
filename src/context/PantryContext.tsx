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
  createPantryStorage,
} from '../services/storage/pantryStorage';
import { useAuthSafe } from './AuthContext';

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
  userId?: string | null;
}


export function PantryProvider({
  children,
  storageAdapter,
  initialIngredients,
  userId,
}: PantryProviderProps) {
  const auth = useAuthSafe();
  const effectiveUserId = userId !== undefined ? userId : auth?.user?.id ?? null;

  const activeStorage = useMemo(() => {
    if (storageAdapter) return storageAdapter;
    return createPantryStorage(effectiveUserId);
  }, [storageAdapter, effectiveUserId]);

  const [ingredients, setIngredients] = useState<Ingredient[]>(
    initialIngredients ?? []
  );
  const [isLoading, setIsLoading] = useState<boolean>(
    !initialIngredients && (storageAdapter !== undefined || effectiveUserId !== null)
  );
  const [storageError, setStorageError] = useState<string | null>(null);

  // Rastreador de operaciones de carga activas (hidratación inicial, refresh).
  // Permite desacoplar el ciclo de vida del indicador de carga (spinner)
  // de la validez de los datos recibidos, evitando que lecturas obsoletas
  // o superadas dejen a la interfaz permanentemente bloqueada en `isLoading = true`.
  const activeLoadsCountRef = React.useRef<number>(
    !initialIngredients && (storageAdapter !== undefined || effectiveUserId !== null) ? 1 : 0
  );
  const lastAppliedVersionRef = React.useRef<number>(0);
  const nextOperationVersionRef = React.useRef<number>(0);

  const loadFromStorage = useCallback(async () => {
    const opVersion = ++nextOperationVersionRef.current;
    activeLoadsCountRef.current += 1;
    setIsLoading(true);
    setStorageError(null);
    try {
      const loaded = await activeStorage.getIngredients();
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
  }, [activeStorage]);

  // Ajuste de estado inmediato durante render al cambiar de usuario (evita intermediate renders y cascading effects)
  const [prevUserIdState, setPrevUserIdState] = useState<string | null>(effectiveUserId);
  if (effectiveUserId !== prevUserIdState) {
    setPrevUserIdState(effectiveUserId);
    setIngredients([]);
    setStorageError(null);
    setIsLoading(Boolean(effectiveUserId));
  }

  // Carga reactiva ante cambio de usuario o cierre de sesión (Fase 5 - Aislamiento estricto)
  useEffect(() => {
    if (storageAdapter || initialIngredients || !effectiveUserId) return;

    let isMounted = true;
    const opVersion = ++nextOperationVersionRef.current;
    lastAppliedVersionRef.current = opVersion;

    activeLoadsCountRef.current = 1;

    const syncUserData = async () => {
      try {
        const loaded = await activeStorage.getIngredients();
        if (isMounted && opVersion >= lastAppliedVersionRef.current) {
          lastAppliedVersionRef.current = opVersion;
          setIngredients(loaded);
        }
      } catch (error) {
        if (isMounted && opVersion >= lastAppliedVersionRef.current) {
          const message =
            error instanceof Error
              ? error.message
              : 'Error inesperado al cargar la despensa.';
          setStorageError(message);
        }
      } finally {
        if (isMounted) {
          activeLoadsCountRef.current = 0;
          setIsLoading(false);
        }
      }
    };

    void syncUserData();

    return () => {
      isMounted = false;
    };
  }, [effectiveUserId, activeStorage, initialIngredients, storageAdapter]);

  // Soporte para pruebas y entornos con storageAdapter explícito
  useEffect(() => {
    let isMounted = true;
    if (storageAdapter && !initialIngredients) {
      const opVersion = ++nextOperationVersionRef.current;
      activeStorage
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
  }, [storageAdapter, initialIngredients, activeStorage]);


  const addIngredient = useCallback(
    async (input: CreateIngredientInput): Promise<Ingredient> => {
      const opVersion = ++nextOperationVersionRef.current;
      setStorageError(null);
      try {
        const created = await activeStorage.addIngredient(input);
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
    [activeStorage]
  );

  const updateIngredient = useCallback(
    async (input: UpdateIngredientInput): Promise<Ingredient> => {
      const opVersion = ++nextOperationVersionRef.current;
      setStorageError(null);
      try {
        const updated = await activeStorage.updateIngredient(input);
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
    [activeStorage]
  );

  const deleteIngredient = useCallback(
    async (id: string): Promise<void> => {
      const opVersion = ++nextOperationVersionRef.current;
      setStorageError(null);
      try {
        await activeStorage.deleteIngredient(id);
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
    [activeStorage]
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
        if (activeStorage.adjustQuantity) {
          const updated = await activeStorage.adjustQuantity(id, delta);
          if (opVersion >= lastAppliedVersionRef.current) {
            lastAppliedVersionRef.current = opVersion;
            setIngredients((prev) =>
              prev.map((item) => (item.id === updated.id ? updated : item))
            );
          }
        } else {
          // Adaptador sin adjustQuantity nativo: derivar del valor persistido confirmado
          // sin aplicar mutaciones optimistas especulativas antes de tiempo.
          const currentList = await activeStorage.getIngredients();
          const target = currentList.find((item) => item.id === id);
          if (!target) return;

          const newQty = Math.round((target.quantity + delta) * 1000) / 1000;
          if (newQty <= 0) {
            return;
          }

          const updated = await activeStorage.updateIngredient({
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
    [activeStorage]
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
