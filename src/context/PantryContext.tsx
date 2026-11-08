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
import { ClientRecipe, getRecipeDeductionKey } from '../types/recipe';
import {
  PantryDeductionPlan,
  applyPantryDeduction,
  calculatePantryDeduction,
  createEmptyPantryDeductionPlan,
  evaluateRecipeConsumptionEligibility,
} from '../utils/pantryConsumption';
import {
  isRecipeDeducted,
  recordDeductionIntent,
  confirmDeduction,
  removeDeductionIntent,
  markRequiresReview,
  reconcileDeductionIntent,
  getConsumedRecipeRecords,
  ConsumedIngredientDeduction,
  RecipeConsumptionLedgerError,
} from '../services/storage/recipeConsumptionStorage';

export { RecipeConsumptionLedgerError };

export class RollbackInconsistencyError extends Error {
  public readonly ingredientId: string;
  public readonly expectedStockAfter: number;
  public readonly actualStock: number;

  constructor(
    ingredientId: string,
    expectedStockAfter: number,
    actualStock: number,
    message?: string
  ) {
    super(
      message ||
        `Inconsistencia detectada durante rollback para el ingrediente '${ingredientId}': se esperaba stockAfter ${expectedStockAfter} pero se encontró ${actualStock}.`
    );
    this.name = 'RollbackInconsistencyError';
    this.ingredientId = ingredientId;
    this.expectedStockAfter = expectedStockAfter;
    this.actualStock = actualStock;
    Object.setPrototypeOf(this, RollbackInconsistencyError.prototype);
  }
}

/**
 * Revierte selectivamente las cantidades descontadas de los ingredientes afectados por una receta,
 * verificando primero que el estado actual de cada ingrediente coincida con el estado post-descuento
 * esperado (stockAfter). Si se detecta cualquier discrepancia o modificación divergente, aborta
 * el rollback para evitar corromper la despensa y requiere revisión manual.
 */
export async function rollbackPantryDeductions(
  storage: PantryStorageAdapter,
  deductions: ConsumedIngredientDeduction[]
): Promise<Ingredient[]> {
  const currentItems = await storage.getIngredients();
  const currentMap = new Map(currentItems.map((i) => [i.id, i]));

  // 1. Verificación de consistencia previa: ningún ingrediente afectado debe haber divergido de stockAfter
  for (const d of deductions) {
    const existing = currentMap.get(d.ingredientId);
    const actualQuantity = existing ? existing.quantity : 0;

    const matchesStockAfter = Math.abs(actualQuantity - d.stockAfter) < 0.001;
    if (!matchesStockAfter) {
      throw new RollbackInconsistencyError(
        d.ingredientId,
        d.stockAfter,
        actualQuantity,
        `El ingrediente '${d.ingredientName}' tiene cantidad actual ${actualQuantity} que no coincide con el estado esperado post-descuento (${d.stockAfter}).`
      );
    }
  }

  // 2. Si todos los ingredientes son consistentes, aplicar la restauración de las cantidades deducidas
  for (const d of deductions) {
    const existing = currentMap.get(d.ingredientId);
    if (existing) {
      existing.quantity = Math.round((existing.quantity + d.deductedQuantity) * 1000) / 1000;
      existing.updatedAt = new Date().toISOString();
    } else {
      currentItems.push({
        id: d.ingredientId,
        name: d.ingredientName,
        quantity: d.deductedQuantity,
        unit: (d.unit as any) || 'unidad',
        category: 'Otros',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  await storage.saveIngredients(currentItems);
  return currentItems;
}

export interface ConsumeRecipeResult {
  success: boolean;
  alreadyDeducted: boolean;
  plan: PantryDeductionPlan;
  deductedCount: number;
  error?: string;
}

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
  consumeRecipeIngredients: (
    recipe: ClientRecipe,
    options?: { mealPlanDay?: number }
  ) => Promise<ConsumeRecipeResult>;
  checkIfRecipeDeducted: (recipeOrKey: RecipeDeductionLookup) => Promise<boolean>;
}

/**
 * Identidad aceptada por checkIfRecipeDeducted. Una clave textual no transporta la
 * bandera demo; solo un objeto con `isDemoFixture === true` se identifica como demo.
 */
export type RecipeDeductionLookup =
  | string
  | { id: string; instanceId?: string; isDemoFixture?: boolean };

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
  const inFlightDeductionsRef = React.useRef<Set<string>>(new Set());
  const pantryMutationLockRef = React.useRef<Promise<any>>(Promise.resolve());

  const executePantryMutation = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    const prevLock = pantryMutationLockRef.current;
    let releaseLock: () => void = () => {};
    const newLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    pantryMutationLockRef.current = newLock;

    try {
      await prevLock.catch(() => {});
      return await action();
    } finally {
      releaseLock();
    }
  }, []);

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


  const checkIfRecipeDeducted = useCallback(
    async (recipeOrKey: RecipeDeductionLookup): Promise<boolean> => {
      // Una receta explícitamente demo nunca puede haber descontado la despensa real
      // (consumeRecipeIngredients la rechaza). Se responde sin tocar el ledger para que
      // la consulta no dispare reconciliaciones ni escrituras; los registros heredados
      // con esa clave se conservan intactos.
      if (typeof recipeOrKey === 'object' && recipeOrKey !== null && recipeOrKey.isDemoFixture === true) {
        return false;
      }

      const targetKey =
        typeof recipeOrKey === 'string'
          ? recipeOrKey
          : getRecipeDeductionKey(recipeOrKey);

      try {
        const records = await getConsumedRecipeRecords(effectiveUserId);
        const rec = records[targetKey];
        if (rec && rec.status === 'pending') {
          const currentPantry = await activeStorage.getIngredients();
          const reconciliation = await reconcileDeductionIntent(targetKey, currentPantry, effectiveUserId);
          if (reconciliation.status === 'aborted') {
            return false;
          }
          return true;
        }

        return await isRecipeDeducted(targetKey, effectiveUserId);
      } catch (err) {
        console.warn('[PantryContext] Error en checkIfRecipeDeducted; aplicando fail-closed (true):', err);
        // Fail-closed: si el ledger no está disponible o está corrupto, se asume deducida para prevenir duplicados
        return true;
      }
    },
    [effectiveUserId, activeStorage]
  );

  const consumeRecipeIngredients = useCallback(
    async (
      recipe: ClientRecipe,
      options?: { mealPlanDay?: number }
    ): Promise<ConsumeRecipeResult> => {
      // 0. Guardia de autorización fail-closed: debe ejecutarse antes de derivar la clave,
      // adquirir el mutex o tocar ledger/despensa. Recetas demo o inválidas no generan
      // ningún efecto secundario persistente ni se clasifican como ya descontadas.
      const eligibility = evaluateRecipeConsumptionEligibility(recipe);
      if (!eligibility.eligible) {
        return {
          success: false,
          alreadyDeducted: false,
          plan: createEmptyPantryDeductionPlan(),
          deductedCount: 0,
          error: eligibility.error,
        };
      }

      const targetKey = getRecipeDeductionKey(recipe);

      // 1. Candado de concurrencia en memoria (in-flight mutex) por preparación activa
      if (inFlightDeductionsRef.current.has(targetKey)) {
        const plan = calculatePantryDeduction(ingredients, recipe.ingredients);
        return {
          success: false,
          alreadyDeducted: true,
          plan,
          deductedCount: 0,
          error: 'La deducción para esta receta ya se encuentra en proceso.',
        };
      }

      inFlightDeductionsRef.current.add(targetKey);

      try {
        // 2. Serializar mutaciones de despensa para evitar condiciones de carrera entre recetas concurrentes
        return await executePantryMutation(async () => {
          // Leer despensa fresca del almacenamiento
          const currentPantry = await activeStorage.getIngredients();

          // Comprobar estado previo en el ledger persistido
          const records = await getConsumedRecipeRecords(effectiveUserId);
          const existingRecord = records[targetKey];

          if (existingRecord) {
            if (!existingRecord.status || existingRecord.status === 'completed') {
              const plan = calculatePantryDeduction(currentPantry, recipe.ingredients);
              return {
                success: false,
                alreadyDeducted: true,
                plan,
                deductedCount: 0,
                error: 'Esta receta ya fue descontada de tu despensa.',
              };
            }

            if (existingRecord.status === 'requires_review') {
              const plan = calculatePantryDeduction(currentPantry, recipe.ingredients);
              return {
                success: false,
                alreadyDeducted: true,
                plan,
                deductedCount: 0,
                error: existingRecord.reviewReason || 'Esta preparación requiere revisión manual antes de modificar la despensa.',
              };
            }

            if (existingRecord.status === 'pending') {
              // Reconciliación conservadora segura
              const reconciliation = await reconcileDeductionIntent(targetKey, currentPantry, effectiveUserId);
              if (reconciliation.status === 'completed') {
                const plan = calculatePantryDeduction(currentPantry, recipe.ingredients);
                return {
                  success: false,
                  alreadyDeducted: true,
                  plan,
                  deductedCount: 0,
                  error: 'Esta receta ya fue descontada de tu despensa.',
                };
              }
              if (reconciliation.status === 'requires_review') {
                const plan = calculatePantryDeduction(currentPantry, recipe.ingredients);
                return {
                  success: false,
                  alreadyDeducted: true,
                  plan,
                  deductedCount: 0,
                  error: reconciliation.message || 'Se requiere revisión manual.',
                };
              }
              // Si fue 'aborted', la despensa nunca cambió; continúa limpiamente a la deducción
            }
          }

          const plan = calculatePantryDeduction(currentPantry, recipe.ingredients);

          // Si no hay nada que deducir físicamente, confirmamos en el ledger directamente
          if (!plan.canDeductAny) {
            await confirmDeduction(targetKey, effectiveUserId, {
              mealPlanDay: options?.mealPlanDay,
              recipeName: recipe.name,
              instanceId: recipe.instanceId,
            });
            return {
              success: true,
              alreadyDeducted: false,
              plan,
              deductedCount: 0,
            };
          }

          // Preparar detalle exacto para el WAL
          const deductions: ConsumedIngredientDeduction[] = plan.deductibleItems.map((item) => ({
            ingredientId: item.matchedPantryItem?.id || item.recipeIngredientName,
            ingredientName: item.matchedPantryItem?.name || item.recipeIngredientName,
            deductedQuantity: item.deductQuantity,
            unit: item.pantryUnit || (item.matchedPantryItem?.unit as any) || 'unidad',
            stockBefore: item.stockBefore,
            stockAfter: item.stockAfter,
          }));

          // 3. Registrar INTENCIÓN previa en el ledger (WAL / Write-Ahead Intent) con desglose
          await recordDeductionIntent(targetKey, effectiveUserId, {
            mealPlanDay: options?.mealPlanDay,
            recipeName: recipe.name,
            instanceId: recipe.instanceId,
            deductions,
          });

          const { updatedPantry, deductedCount } = applyPantryDeduction(currentPantry, plan);
          const opVersion = ++nextOperationVersionRef.current;
          setStorageError(null);

          // 4. Persistir modificación de la despensa
          try {
            await activeStorage.saveIngredients(updatedPantry);
          } catch (pantryError) {
            console.warn(
              '[PantryContext] Fallo o rechazo en activeStorage.saveIngredients; evaluando consistencia mediante reconciliación:',
              pantryError
            );
            try {
              // Leer el estado real de la despensa en almacenamiento tras el fallo
              const freshPantry = await activeStorage.getIngredients();
              const reconciliation = await reconcileDeductionIntent(
                targetKey,
                freshPantry,
                effectiveUserId
              );

              // Si los ítems coinciden con stockAfter, la deducción sí se persistió físicamente
              // antes del rechazo. reconcileDeductionIntent ya confirmó el ledger ('completed').
              // Sincronizamos el estado reactivo en memoria con el inventario real.
              if (reconciliation.status === 'completed') {
                if (opVersion >= lastAppliedVersionRef.current) {
                  lastAppliedVersionRef.current = opVersion;
                  setIngredients(freshPantry);
                }
              }
              // Si coincidió con stockBefore, reconcileDeductionIntent ya descartó la intención de forma segura.
              // Si el estado es ambiguo, reconcileDeductionIntent ya marcó el registro como 'requires_review'.
            } catch (reconcileErr) {
              console.error(
                '[PantryContext] Error al intentar reconciliar tras fallo de guardado en despensa:',
                reconcileErr
              );
              // Si no fue posible reconciliar, se PRESERVA la intención y se marca para revisión manual
              // para evitar que un reintento aplique una doble deducción accidental.
              await markRequiresReview(
                targetKey,
                effectiveUserId,
                'Fallo ambiguo al persistir en despensa y no fue posible reconciliar automáticamente.'
              ).catch(() => {});
            }
            throw pantryError;
          }

          // 5. Confirmar formalmente en el ledger de consumo
          try {
            await confirmDeduction(targetKey, effectiveUserId, {
              mealPlanDay: options?.mealPlanDay,
              recipeName: recipe.name,
              instanceId: recipe.instanceId,
              deductions,
            });
          } catch (ledgerError) {
            // ROLLBACK SELECTIVO: solo revertir las cantidades de los ítems de esta receta,
            // sin sobreescribir modificaciones concurrentes en otros alimentos
            console.warn('[PantryContext] Error confirmando ledger, ejecutando rollback selectivo:', ledgerError);
            try {
              const rolledBackPantry = await rollbackPantryDeductions(activeStorage, deductions);
              await removeDeductionIntent(targetKey, effectiveUserId).catch(() => {});
              if (opVersion >= lastAppliedVersionRef.current) {
                lastAppliedVersionRef.current = opVersion;
                setIngredients(rolledBackPantry);
              }
            } catch (rollbackErr) {
              console.error('[PantryContext] Fallo crítico al ejecutar rollback de despensa:', rollbackErr);
              const reason =
                rollbackErr instanceof RollbackInconsistencyError
                  ? `Inconsistencia en despensa durante rollback: ${rollbackErr.message}`
                  : 'Fallo durante rollback de despensa';
              await markRequiresReview(targetKey, effectiveUserId, reason).catch(() => {});
              throw new Error(
                `Fallo crítico al confirmar consumo y no se pudo revertir la despensa (${reason}). Se marcó para revisión manual.`
              );
            }
            throw new Error('Fallo al registrar confirmación en ledger. Despensa revertida para evitar inconsistencias.');
          }

          if (opVersion >= lastAppliedVersionRef.current) {
            lastAppliedVersionRef.current = opVersion;
            setIngredients(updatedPantry);
          }

          return {
            success: true,
            alreadyDeducted: false,
            plan,
            deductedCount,
          };
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Error al persistir el descuento en la despensa.';
        setStorageError(message);
        const plan = calculatePantryDeduction(ingredients, recipe.ingredients);
        return {
          success: false,
          alreadyDeducted: false,
          plan,
          deductedCount: 0,
          error: message,
        };
      } finally {
        inFlightDeductionsRef.current.delete(targetKey);
      }
    },
    [ingredients, effectiveUserId, activeStorage, executePantryMutation]
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
      consumeRecipeIngredients,
      checkIfRecipeDeducted,
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
      consumeRecipeIngredients,
      checkIfRecipeDeducted,
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
