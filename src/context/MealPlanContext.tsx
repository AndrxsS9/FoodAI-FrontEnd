/**
 * FoodAI - Estado y gestión del Plan de Comidas de 3 Días (Fase 3C).
 * Provee una capa desacoplada, reactiva y persistente que soporta:
 * 1. Generación de planes únicamente bajo acción explícita del usuario.
 * 2. Lectura en tiempo real de la despensa (PantryContext) y presupuesto (BudgetContext).
 * 3. Bloqueo seguro ante despensa vacía sin llamadas innecesarias al backend.
 * 4. Control de concurrencia y cancelación con AbortController.
 * 5. Protección contra condiciones de carrera y descarte de respuestas desactualizadas.
 * 6. Detección reactiva de obsolescencia ('isStale') ante cambios en la despensa o presupuesto.
 * 7. Persistencia local versionada con AsyncStorage y restauración transparente.
 * 8. Resolución determinista de recetas del plan por ID, slug o día ('getRecipeById').
 * 9. NO deduce ni modifica automáticamente las cantidades del inventario.
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
  ClientMealPlan,
  ClientRecipe,
  MealPlanGenerationSnapshot,
  generateRecipeSlug,
  mapPantryToMealPlanRequest,
  normalizeBackendMealPlan,
} from '../types/mealPlan';
import { useBudget } from './BudgetContext';
import { usePantrySafe } from './PantryContext';
import { useAuthSafe } from './AuthContext';
import { useLocale } from './LocaleContext';
import { DATA_NOT_READY_CODE } from './RecipeContext';
import {
  mealPlanApi as defaultMealPlanApi,
  MealPlanApiError,
} from '../services/api/mealPlanApi';
import {
  createMealPlanStorage,
  MealPlanStorageAdapter,
} from '../services/storage/mealPlanStorage';

/**
 * Motivo (no sensible) por el que el estado visible del plan no pudo sincronizarse con el
 * almacenamiento del dispositivo (Fase 28B).
 * - save_failed: el plan se generó, pero no quedó guardado (sigue disponible en memoria).
 * - completion_save_failed: el cambio de completado de un día no se guardó y NO se aplicó.
 * - clear_failed: el plan no se pudo eliminar del dispositivo y sigue guardado.
 */
export type MealPlanPersistenceWarningCode =
  | 'save_failed'
  | 'completion_save_failed'
  | 'clear_failed';

export const MEAL_PLAN_PERSISTENCE_WARNING_MESSAGES: Record<MealPlanPersistenceWarningCode, string> = {
  save_failed:
    'Tu plan se generó correctamente, pero no pudimos guardarlo en este dispositivo. Sigue disponible ahora, aunque podría no conservarse si cierras la app.',
  completion_save_failed:
    'No pudimos guardar el cambio en este dispositivo, así que el día conserva su estado anterior. Intenta de nuevo.',
  clear_failed:
    'No pudimos eliminar el plan de este dispositivo; sigue guardado. Intenta de nuevo.',
};

const DATA_NOT_READY_MESSAGE =
  'Todavía estamos cargando tu despensa y tu presupuesto. Intenta de nuevo en un momento.';

export interface MealPlanContextValue {
  plan: ClientMealPlan | null;
  isLoading: boolean;
  isGenerating: boolean;
  isRestoring: boolean;
  isStale: boolean;
  lastGeneratedAt: string | null;
  error: string | null;
  errorCode: string | null;
  /**
   * Aviso no bloqueante cuando el almacenamiento local falló. Nunca contiene detalles internos.
   * Se retira tras una escritura verificada del plan completo.
   */
  persistenceWarning: string | null;
  persistenceWarningCode: MealPlanPersistenceWarningCode | null;
  clearPersistenceWarning: () => void;
  generateMealPlan: (options?: { maxMinutes?: number }) => Promise<ClientMealPlan | null>;
  cancelGeneration: () => void;
  clearMealPlan: () => Promise<void>;
  clearError: () => void;
  getRecipeById: (idOrSlug: string) => ClientRecipe | undefined;
  toggleDayCompleted: (dayNumber: number, forceCompleted?: boolean) => Promise<void>;
  markRecipeCompleted: (recipeId: string) => Promise<void>;
  completedDaysCount: number;
}

const defaultMealPlanContextValue: MealPlanContextValue = {
  plan: null,
  isLoading: false,
  isGenerating: false,
  isRestoring: false,
  isStale: false,
  lastGeneratedAt: null,
  error: null,
  errorCode: null,
  persistenceWarning: null,
  persistenceWarningCode: null,
  clearPersistenceWarning: () => {},
  generateMealPlan: async () => null,
  cancelGeneration: () => {},
  clearMealPlan: async () => {},
  clearError: () => {},
  getRecipeById: () => undefined,
  toggleDayCompleted: async () => {},
  markRecipeCompleted: async () => {},
  completedDaysCount: 0,
};

const MealPlanContext = createContext<MealPlanContextValue | undefined>(undefined);

export interface MealPlanProviderProps {
  children: React.ReactNode;
  initialPlan?: ClientMealPlan | null;
  mealPlanApiClient?: typeof defaultMealPlanApi;
  storageAdapter?: MealPlanStorageAdapter;
  userId?: string | null;
}

export function MealPlanProvider({
  children,
  initialPlan = null,
  mealPlanApiClient = defaultMealPlanApi,
  storageAdapter,
  userId,
}: MealPlanProviderProps) {
  const auth = useAuthSafe();
  const effectiveUserId = userId !== undefined ? userId : auth?.user?.id ?? null;

  const activeStorage = useMemo(() => {
    if (storageAdapter) return storageAdapter;
    return createMealPlanStorage(effectiveUserId);
  }, [storageAdapter, effectiveUserId]);

  const { budget, servings, maxMinutes, isLoading: isBudgetLoading } = useBudget();
  // Idioma activo leído mediante ref: cambiar de idioma no altera la identidad de las acciones
  // ni dispara regeneraciones; solo se aplica a la siguiente solicitud iniciada por el usuario.
  const { locale } = useLocale();
  const localeRef = useRef(locale);
  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);
  const pantry = usePantrySafe();
  const ingredients = useMemo(() => pantry?.ingredients ?? [], [pantry?.ingredients]);
  const isPantryLoading = pantry?.isLoading ?? false;

  const [plan, setPlan] = useState<ClientMealPlan | null>(initialPlan);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(
    !initialPlan && (storageAdapter !== undefined || effectiveUserId !== null)
  );
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(
    initialPlan?.generatedAt ?? null
  );
  const [lastSnapshot, setLastSnapshot] = useState<MealPlanGenerationSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [persistenceWarningCode, setPersistenceWarningCode] =
    useState<MealPlanPersistenceWarningCode | null>(null);
  // Hidratación conjunta (plan restaurado + despensa + presupuesto). Concluye una sola vez por
  // usuario: hasta entonces no se puede evaluar la obsolescencia sin producir avisos falsos.
  const [hasHydrated, setHasHydrated] = useState<boolean>(false);

  // Referencias para control de concurrencia y cancelación
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const isGeneratingRef = useRef<boolean>(false);
  const operationVersionRef = useRef<number>(0);
  const activeUserIdRef = useRef<string | null>(effectiveUserId);
  // Último plan/snapshot aceptados (sin esperar al render). Los cambios de completado se calculan
  // sobre ellos dentro de una cola serializada para que dos cambios seguidos no se pisen.
  const latestPlanRef = useRef<ClientMealPlan | null>(initialPlan);
  const latestSnapshotRef = useRef<MealPlanGenerationSnapshot | null>(null);
  const completionQueueRef = useRef<Promise<void>>(Promise.resolve());

  // Ajuste de estado inmediato durante render al cambiar de usuario (evita intermediate renders y cascading effects)
  const [prevUserIdState, setPrevUserIdState] = useState<string | null>(effectiveUserId);
  if (effectiveUserId !== prevUserIdState) {
    setPrevUserIdState(effectiveUserId);
    setIsGenerating(false);
    setIsLoading(false);
    setPlan(null);
    setLastSnapshot(null);
    setLastGeneratedAt(null);
    setError(null);
    setErrorCode(null);
    setIsRestoring(Boolean(effectiveUserId));
    setPersistenceWarningCode(null);
    setHasHydrated(false);
  }

  if (!hasHydrated && !isRestoring && !isPantryLoading && !isBudgetLoading) {
    setHasHydrated(true);
  }

  // Sincroniza las referencias con el estado confirmado (p. ej. tras el reinicio por cambio de
  // usuario). Las operaciones que aceptan un plan nuevo también las actualizan de inmediato.
  useEffect(() => {
    latestPlanRef.current = plan;
    latestSnapshotRef.current = lastSnapshot;
  }, [plan, lastSnapshot]);

  /** Acepta un plan (y su snapshot) como estado actual en memoria y en las referencias. */
  const acceptPlanState = useCallback(
    (nextPlan: ClientMealPlan | null, nextSnapshot: MealPlanGenerationSnapshot | null) => {
      latestPlanRef.current = nextPlan;
      latestSnapshotRef.current = nextSnapshot;
      setPlan(nextPlan);
      setLastSnapshot(nextSnapshot);
      setLastGeneratedAt(nextSnapshot?.generatedAt ?? null);
    },
    []
  );

  // Huella digital reproducible de la despensa actual
  const currentPantryFingerprint = useMemo(() => {
    return (ingredients || [])
      .map((item) => `${item.id}:${item.name.toLowerCase()}:${item.quantity}:${item.unit}`)
      .sort()
      .join('|');
  }, [ingredients]);

  // Aislamiento reactivo ante cambio de usuario o logout (Fase 5)
  useEffect(() => {
    if (storageAdapter || initialPlan || !effectiveUserId) return;

    let isMounted = true;
    const currentVersion = ++operationVersionRef.current;
    activeUserIdRef.current = effectiveUserId;

    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
    isGeneratingRef.current = false;

    const syncMealPlan = async () => {
      try {
        const stored = await activeStorage.getStoredMealPlan();
        if (
          isMounted &&
          currentVersion === operationVersionRef.current &&
          effectiveUserId === activeUserIdRef.current &&
          stored
        ) {
          acceptPlanState(stored.plan, stored.snapshot);
        }
      } catch (err) {
        console.warn('[MealPlanContext] Error al restaurar plan de usuario:', err);
      } finally {
        if (isMounted && currentVersion === operationVersionRef.current) {
          setIsRestoring(false);
        }
      }
    };

    void syncMealPlan();

    return () => {
      isMounted = false;
    };
  }, [effectiveUserId, activeStorage, initialPlan, storageAdapter, acceptPlanState]);

  // Compatibilidad con pruebas unitarias que inyectan storageAdapter
  useEffect(() => {
    let isMounted = true;
    if (storageAdapter && !initialPlan) {
      const restorationVersion = operationVersionRef.current;
      activeStorage
        .getStoredMealPlan()
        .then((stored) => {
          if (stored && isMounted && restorationVersion === operationVersionRef.current) {
            acceptPlanState(stored.plan, stored.snapshot);
          }
        })
        .catch((err) => {
          console.warn('[MealPlanContext] No se pudo restaurar el plan guardado:', err);
        })
        .finally(() => {
          if (isMounted) {
            setIsRestoring(false);
          }
        });
    }
    return () => {
      isMounted = false;
    };
  }, [storageAdapter, initialPlan, activeStorage, acceptPlanState]);

  // Detección reactiva de obsolescencia
  const isStale = useMemo(() => {
    if (!lastSnapshot || !plan) {
      return false;
    }
    // Sin hidratación completa no se puede comparar: una despensa o un presupuesto que aún no se
    // han cargado tras el reinicio no significan que hayan cambiado.
    if (!hasHydrated) {
      return false;
    }

    const pantryChanged = lastSnapshot.pantryFingerprint !== currentPantryFingerprint;
    const budgetChanged = lastSnapshot.budget !== budget;
    const servingsChanged = lastSnapshot.servings !== servings;
    const maxMinutesChanged =
      (lastSnapshot.maxMinutes ?? undefined) !== (maxMinutes ?? undefined);

    return pantryChanged || budgetChanged || servingsChanged || maxMinutesChanged;
  }, [
    lastSnapshot,
    plan,
    hasHydrated,
    currentPantryFingerprint,
    budget,
    servings,
    maxMinutes,
  ]);

  /**
   * Resuelve una receta del plan activo por ID exacto, alias de día o slug.
   */
  const getRecipeById = useCallback(
    (idOrSlug: string): ClientRecipe | undefined => {
      if (!idOrSlug || !plan) return undefined;
      const clean = idOrSlug.trim().toLowerCase();

      // 1. Por alias de día numérico ("1", "2", "3") o "dia-1", "dia-2", "dia-3", "plan-dia-1"
      const dayMatch = clean.match(/^(?:plan-)?dia-(\d+)$/) || clean.match(/^(\d+)$/);
      if (dayMatch) {
        const dayNum = parseInt(dayMatch[1], 10);
        const foundDay = plan.days.find((d) => d.day === dayNum);
        if (foundDay) return foundDay.recipe;
      }

      // 2. Por ID exacto de la receta (ej: "plan-dia-1-arroz-con-pollo")
      const matchById = plan.days.find((d) => d.recipe.id.toLowerCase() === clean);
      if (matchById) return matchById.recipe;

      // 3. Por slug derivado del nombre de la receta
      const matchBySlug = plan.days.find((d) => {
        const slug = generateRecipeSlug(d.recipe.name).toLowerCase();
        return slug === clean || d.recipe.id.toLowerCase().endsWith(`-${clean}`);
      });
      if (matchBySlug) return matchBySlug.recipe;

      return undefined;
    },
    [plan]
  );

  const completedDaysCount = useMemo(() => {
    if (!plan?.days) return 0;
    return plan.days.filter((d) => Boolean(d.isCompleted)).length;
  }, [plan]);

  /**
   * Cambia el estado de completado de un día (Fase 28B: persistencia primero).
   * El cambio solo se muestra cuando el almacenamiento lo confirma; si la escritura falla, el día
   * conserva su estado anterior y se expone `completion_save_failed`. Así lo visible nunca diverge
   * de lo guardado. Los cambios se encadenan en una cola y cada uno parte del último plan aceptado,
   * por lo que dos cambios seguidos sobre días distintos no se pisan.
   */
  const toggleDayCompleted = useCallback(
    (dayNumber: number, forceCompleted?: boolean): Promise<void> => {
      const run = async (): Promise<void> => {
        const basePlan = latestPlanRef.current;
        if (!basePlan || !basePlan.days) return;
        const dayIndex = basePlan.days.findIndex((d) => d.day === dayNumber);
        if (dayIndex === -1) return;

        const currentDay = basePlan.days[dayIndex];
        const newCompleted = forceCompleted !== undefined ? forceCompleted : !currentDay.isCompleted;
        if (Boolean(currentDay.isCompleted) === newCompleted) return;
        const completedAt = newCompleted ? new Date().toISOString() : null;

        const updatedDays = basePlan.days.map((d) => {
          if (d.day === dayNumber) {
            return {
              ...d,
              isCompleted: newCompleted,
              completedAt,
            };
          }
          return d;
        });

        const newCompletedCount = updatedDays.filter((d) => Boolean(d.isCompleted)).length;
        const updatedPlan: ClientMealPlan = {
          ...basePlan,
          days: updatedDays,
          completedDaysCount: newCompletedCount,
        };

        const snapshot = latestSnapshotRef.current;
        if (!snapshot) {
          // Plan sin snapshot (inyectado solo en memoria): no existe persistencia que sincronizar.
          latestPlanRef.current = updatedPlan;
          setPlan(updatedPlan);
          return;
        }

        const requestUserId = activeUserIdRef.current;
        const isStillCurrent = () =>
          requestUserId === activeUserIdRef.current && latestPlanRef.current === basePlan;

        try {
          await activeStorage.saveMealPlan(updatedPlan, snapshot);
        } catch (err) {
          console.warn('[MealPlanContext] Error al guardar estado de completado:', err);
          if (isStillCurrent()) {
            setPersistenceWarningCode('completion_save_failed');
          }
          return;
        }

        // Un plan más reciente (regeneración, eliminación o cambio de usuario) prevalece.
        if (!isStillCurrent()) return;
        latestPlanRef.current = updatedPlan;
        setPlan(updatedPlan);
        // Escritura verificada del plan completo: memoria y almacenamiento coinciden.
        setPersistenceWarningCode(null);
      };

      const next = completionQueueRef.current.then(run, run);
      completionQueueRef.current = next.catch(() => {});
      return next;
    },
    [activeStorage]
  );

  const markRecipeCompleted = useCallback(
    async (recipeId: string): Promise<void> => {
      const currentPlan = latestPlanRef.current;
      if (!currentPlan || !currentPlan.days || !recipeId) return;
      const clean = recipeId.trim().toLowerCase();

      const foundDay = currentPlan.days.find((d) => {
        const recipeIdLower = d.recipe.id.toLowerCase();
        if (recipeIdLower === clean) return true;
        if (d.recipe.instanceId?.toLowerCase() === clean) return true;
        if (clean.startsWith(`${recipeIdLower}::`)) return true;
        const slug = generateRecipeSlug(d.recipe.name).toLowerCase();
        if (slug === clean || recipeIdLower.endsWith(`-${clean}`)) return true;
        return false;
      });

      if (foundDay) {
        await toggleDayCompleted(foundDay.day, true);
      }
    },
    [toggleDayCompleted]
  );

  const clearPersistenceWarning = useCallback(() => {
    setPersistenceWarningCode(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
    setErrorCode(null);
  }, []);

  const cancelGeneration = useCallback(() => {
    operationVersionRef.current++;
    isGeneratingRef.current = false;

    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }

    setIsGenerating(false);
    setIsLoading(false);
  }, []);

  /**
   * Operación principal: Generación del plan de 3 días con IA (Gemini vía backend).
   */
  const generateMealPlan = useCallback(
    async (options?: { maxMinutes?: number }): Promise<ClientMealPlan | null> => {
      // 1. Guard contra llamadas concurrentes duplicadas
      if (isGeneratingRef.current) {
        return plan;
      }

      // 1b. Hidratación (Fase 28B): una despensa aún cargando no es una despensa vacía y un
      //     presupuesto por defecto no es el del usuario. Se rechaza ANTES de cualquier efecto
      //     secundario (cancelaciones, versión, restauración) y nunca se llama al backend.
      if (isPantryLoading || isBudgetLoading) {
        setError(DATA_NOT_READY_MESSAGE);
        setErrorCode(DATA_NOT_READY_CODE);
        throw new MealPlanApiError(DATA_NOT_READY_MESSAGE, DATA_NOT_READY_CODE, 0);
      }

      // 2. Cancelar cualquier solicitud anterior pendiente
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
      }

      const abortController = new AbortController();
      activeAbortControllerRef.current = abortController;

      const requestUserId = effectiveUserId;
      const currentOpVersion = ++operationVersionRef.current;
      isGeneratingRef.current = true;
      setIsGenerating(true);
      setIsLoading(true);
      setIsRestoring(false);
      setError(null);
      setErrorCode(null);

      const targetMaxMinutes = options?.maxMinutes ?? maxMinutes;
      // Idioma fijado en el instante en que inicia esta solicitud
      const requestLocale = localeRef.current;

      try {
        // 3. Validación estricta de la despensa: Al menos un ingrediente
        if (!ingredients || ingredients.length === 0) {
          const emptyMsg =
            'Tu despensa está vacía. Agrega alimentos a tu despensa antes de generar tu plan.';
          setError(emptyMsg);
          setErrorCode('EMPTY_PANTRY');
          throw new MealPlanApiError(
            emptyMsg,
            'EMPTY_PANTRY',
            400,
            undefined,
            false,
            false,
            false,
            true
          );
        }

        // 4. Mapear datos al contrato del backend
        const requestPayload = mapPantryToMealPlanRequest(
          ingredients,
          budget,
          servings,
          targetMaxMinutes,
          requestLocale
        );

        // 5. Invocar al endpoint del backend
        const backendResponse = await mealPlanApiClient.generateMealPlan(requestPayload, {
          signal: abortController.signal,
        });

        // 6. Verificar si la operación sigue siendo la más reciente y del usuario activo
        if (
          currentOpVersion !== operationVersionRef.current ||
          requestUserId !== activeUserIdRef.current
        ) {
          return null;
        }

        // 7. Normalizar el plan al modelo de cliente con planId estable
        const generatedAt = new Date().toISOString();
        const planId = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const normalizedPlan = normalizeBackendMealPlan(backendResponse, servings, {
          planId,
          generatedAt,
        });

        const snapshot: MealPlanGenerationSnapshot = {
          pantryFingerprint: currentPantryFingerprint,
          budget,
          servings,
          maxMinutes: targetMaxMinutes,
          generatedAt,
        };

        acceptPlanState(normalizedPlan, snapshot);
        setError(null);
        setErrorCode(null);

        // 8. Persistir localmente. Un fallo NO invalida la generación (el plan sigue en memoria),
        //    pero tampoco se oculta: se expone un aviso explícito. Solo la operación vigente del
        //    usuario activo aplica el resultado (una generación cancelada o superada no avisa).
        const isCurrentOperation = () =>
          currentOpVersion === operationVersionRef.current &&
          requestUserId === activeUserIdRef.current;
        try {
          await activeStorage.saveMealPlan(normalizedPlan, snapshot);
          if (isCurrentOperation()) {
            setPersistenceWarningCode(null);
          }
        } catch (storageErr) {
          console.warn('[MealPlanContext] Advertencia: No se pudo persistir el plan localmente:', storageErr);
          if (isCurrentOperation()) {
            setPersistenceWarningCode('save_failed');
          }
        }

        return normalizedPlan;
      } catch (err) {
        // Si la operación fue superada o el usuario cambió, descartar completamente
        if (
          currentOpVersion !== operationVersionRef.current ||
          requestUserId !== activeUserIdRef.current
        ) {
          return null;
        }

        const msg =
          err instanceof Error
            ? err.message
            : 'Ocurrió un error inesperado al generar el plan de comidas.';

        const code = err instanceof MealPlanApiError ? err.code : 'PLAN_GENERATION_FAILED';

        setError(msg);
        setErrorCode(code);
        throw err;
      } finally {
        if (
          currentOpVersion === operationVersionRef.current &&
          requestUserId === activeUserIdRef.current
        ) {
          isGeneratingRef.current = false;
          setIsGenerating(false);
          setIsLoading(false);
          activeAbortControllerRef.current = null;
        }
      }
    },
    [
      plan,
      ingredients,
      isPantryLoading,
      isBudgetLoading,
      budget,
      servings,
      maxMinutes,
      currentPantryFingerprint,
      mealPlanApiClient,
      activeStorage,
      effectiveUserId,
      acceptPlanState,
    ]
  );

  /**
   * Elimina el plan (Fase 28B: persistencia primero). Solo se declara eliminado en memoria cuando
   * el almacenamiento confirma el borrado. Si falla, el plan sigue visible (resincronizado con lo
   * guardado si hace falta) y se expone `clear_failed`: nunca se afirma una eliminación que no ocurrió.
   */
  const clearMealPlan = useCallback(async (): Promise<void> => {
    operationVersionRef.current++;
    cancelGeneration();
    const clearVersion = operationVersionRef.current;
    const requestUserId = activeUserIdRef.current;
    const isStillCurrent = () =>
      clearVersion === operationVersionRef.current && requestUserId === activeUserIdRef.current;

    setIsRestoring(false);
    setError(null);
    setErrorCode(null);

    try {
      await activeStorage.clearMealPlan();
    } catch (err) {
      console.warn('[MealPlanContext] Error al limpiar el almacenamiento local del plan:', err);
      if (!isStillCurrent()) return;
      // Si una restauración en curso quedó invalidada, se vuelve a leer lo guardado para que lo
      // visible coincida con lo que sigue persistido.
      if (!latestPlanRef.current) {
        try {
          const stored = await activeStorage.getStoredMealPlan();
          if (stored && isStillCurrent()) {
            acceptPlanState(stored.plan, stored.snapshot);
          }
        } catch (readErr) {
          console.warn('[MealPlanContext] No se pudo releer el plan tras un borrado fallido:', readErr);
        }
      }
      if (isStillCurrent()) {
        setPersistenceWarningCode('clear_failed');
      }
      return;
    }

    if (!isStillCurrent()) return;
    acceptPlanState(null, null);
    setPersistenceWarningCode(null);
  }, [cancelGeneration, activeStorage, acceptPlanState]);

  // Un aviso de "datos aún cargando" deja de ser cierto en cuanto termina la hidratación:
  // se deja de exponer (derivado en render) para no mostrar un error obsoleto (igual que RecipeContext).
  const isResolvedDataNotReady =
    errorCode === DATA_NOT_READY_CODE && !isPantryLoading && !isBudgetLoading;
  const exposedError = isResolvedDataNotReady ? null : error;
  const exposedErrorCode = isResolvedDataNotReady ? null : errorCode;


  // Limpieza al desmontar
  useEffect(() => {
    const versionRef = operationVersionRef;
    const generatingRef = isGeneratingRef;
    const abortRef = activeAbortControllerRef;

    return () => {
      versionRef.current++;
      generatingRef.current = false;
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, []);

  const value = useMemo<MealPlanContextValue>(
    () => ({
      plan,
      isLoading,
      isGenerating,
      isRestoring,
      isStale,
      lastGeneratedAt,
      error: exposedError,
      errorCode: exposedErrorCode,
      persistenceWarning: persistenceWarningCode
        ? MEAL_PLAN_PERSISTENCE_WARNING_MESSAGES[persistenceWarningCode]
        : null,
      persistenceWarningCode,
      clearPersistenceWarning,
      generateMealPlan,
      cancelGeneration,
      clearMealPlan,
      clearError,
      getRecipeById,
      toggleDayCompleted,
      markRecipeCompleted,
      completedDaysCount,
    }),
    [
      plan,
      isLoading,
      isGenerating,
      isRestoring,
      isStale,
      lastGeneratedAt,
      exposedError,
      exposedErrorCode,
      persistenceWarningCode,
      clearPersistenceWarning,
      generateMealPlan,
      cancelGeneration,
      clearMealPlan,
      clearError,
      getRecipeById,
      toggleDayCompleted,
      markRecipeCompleted,
      completedDaysCount,
    ]
  );

  return (
    <MealPlanContext.Provider value={value}>{children}</MealPlanContext.Provider>
  );
}

export function useMealPlan(): MealPlanContextValue {
  const context = useContext(MealPlanContext);
  if (!context) {
    return defaultMealPlanContextValue;
  }
  return context;
}

export function useMealPlanSafe(): MealPlanContextValue | null {
  const context = useContext(MealPlanContext);
  return context ?? null;
}
