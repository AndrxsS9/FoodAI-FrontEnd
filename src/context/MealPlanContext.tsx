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
import {
  mealPlanApi as defaultMealPlanApi,
  MealPlanApiError,
} from '../services/api/mealPlanApi';
import {
  mealPlanStorage as defaultMealPlanStorage,
  MealPlanStorageAdapter,
} from '../services/storage/mealPlanStorage';

export interface MealPlanContextValue {
  plan: ClientMealPlan | null;
  isLoading: boolean;
  isGenerating: boolean;
  isRestoring: boolean;
  isStale: boolean;
  lastGeneratedAt: string | null;
  error: string | null;
  errorCode: string | null;
  generateMealPlan: (options?: { maxMinutes?: number }) => Promise<ClientMealPlan | null>;
  cancelGeneration: () => void;
  clearMealPlan: () => Promise<void>;
  clearError: () => void;
  getRecipeById: (idOrSlug: string) => ClientRecipe | undefined;
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
  generateMealPlan: async () => null,
  cancelGeneration: () => {},
  clearMealPlan: async () => {},
  clearError: () => {},
  getRecipeById: () => undefined,
};

const MealPlanContext = createContext<MealPlanContextValue | undefined>(undefined);

export interface MealPlanProviderProps {
  children: React.ReactNode;
  initialPlan?: ClientMealPlan | null;
  mealPlanApiClient?: typeof defaultMealPlanApi;
  storageAdapter?: MealPlanStorageAdapter;
}

export function MealPlanProvider({
  children,
  initialPlan = null,
  mealPlanApiClient = defaultMealPlanApi,
  storageAdapter = defaultMealPlanStorage,
}: MealPlanProviderProps) {
  const { budget, servings, maxMinutes } = useBudget();
  const pantry = usePantrySafe();
  const ingredients = useMemo(() => pantry?.ingredients ?? [], [pantry?.ingredients]);

  const [plan, setPlan] = useState<ClientMealPlan | null>(initialPlan);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(!initialPlan);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(
    initialPlan?.generatedAt ?? null
  );
  const [lastSnapshot, setLastSnapshot] = useState<MealPlanGenerationSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // Referencias para control de concurrencia y cancelación
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const isGeneratingRef = useRef<boolean>(false);
  const operationVersionRef = useRef<number>(0);

  // Huella digital reproducible de la despensa actual
  const currentPantryFingerprint = useMemo(() => {
    return (ingredients || [])
      .map((item) => `${item.id}:${item.name.toLowerCase()}:${item.quantity}:${item.unit}`)
      .sort()
      .join('|');
  }, [ingredients]);

  // Carga inicial transparente desde el almacenamiento local con protección de concurrencia
  useEffect(() => {
    let isMounted = true;
    const restorationVersion = operationVersionRef.current;

    if (initialPlan) {
      return () => {
        isMounted = false;
      };
    }

    (async () => {
      try {
        const stored = await storageAdapter.getStoredMealPlan();
        // Solo restauramos si el componente sigue montado y ninguna operación
        // posterior (generación o clearMealPlan) ha incrementado operationVersionRef
        if (stored && isMounted && restorationVersion === operationVersionRef.current) {
          setPlan(stored.plan);
          setLastSnapshot(stored.snapshot);
          setLastGeneratedAt(stored.snapshot.generatedAt);
        }
      } catch (err) {
        console.warn('[MealPlanContext] No se pudo restaurar el plan guardado:', err);
      } finally {
        if (isMounted) {
          setIsRestoring(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [initialPlan, storageAdapter]);

  // Detección reactiva de obsolescencia
  const isStale = useMemo(() => {
    if (!lastSnapshot || !plan) {
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

      // 2. Cancelar cualquier solicitud anterior pendiente
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
      }

      const abortController = new AbortController();
      activeAbortControllerRef.current = abortController;

      const currentOpVersion = ++operationVersionRef.current;
      isGeneratingRef.current = true;
      setIsGenerating(true);
      setIsLoading(true);
      setIsRestoring(false);
      setError(null);
      setErrorCode(null);

      const targetMaxMinutes = options?.maxMinutes ?? maxMinutes;

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
          targetMaxMinutes
        );

        // 5. Invocar al endpoint del backend
        const backendResponse = await mealPlanApiClient.generateMealPlan(requestPayload, {
          signal: abortController.signal,
        });

        // 6. Verificar si la operación sigue siendo la más reciente
        if (currentOpVersion < operationVersionRef.current) {
          return plan;
        }

        // 7. Normalizar el plan al modelo de cliente
        const normalizedPlan = normalizeBackendMealPlan(backendResponse, servings);

        const snapshot: MealPlanGenerationSnapshot = {
          pantryFingerprint: currentPantryFingerprint,
          budget,
          servings,
          maxMinutes: targetMaxMinutes,
          generatedAt: new Date().toISOString(),
        };

        setPlan(normalizedPlan);
        setLastSnapshot(snapshot);
        setLastGeneratedAt(snapshot.generatedAt);
        setError(null);
        setErrorCode(null);

        // 8. Persistir localmente de forma segura
        try {
          await storageAdapter.saveMealPlan(normalizedPlan, snapshot);
        } catch (storageErr) {
          console.warn('[MealPlanContext] Advertencia: No se pudo persistir el plan localmente:', storageErr);
        }

        return normalizedPlan;
      } catch (err) {
        // Si la operación fue superada por una posterior, ignorar
        if (currentOpVersion < operationVersionRef.current) {
          return plan;
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
        if (currentOpVersion === operationVersionRef.current) {
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
      budget,
      servings,
      maxMinutes,
      currentPantryFingerprint,
      mealPlanApiClient,
      storageAdapter,
    ]
  );

  const clearMealPlan = useCallback(async (): Promise<void> => {
    operationVersionRef.current++;
    cancelGeneration();
    setPlan(null);
    setLastSnapshot(null);
    setLastGeneratedAt(null);
    setIsRestoring(false);
    setError(null);
    setErrorCode(null);

    try {
      await storageAdapter.clearMealPlan();
    } catch (err) {
      console.warn('[MealPlanContext] Error al limpiar el almacenamiento local del plan:', err);
    }
  }, [cancelGeneration, storageAdapter]);

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
      error,
      errorCode,
      generateMealPlan,
      cancelGeneration,
      clearMealPlan,
      clearError,
      getRecipeById,
    }),
    [
      plan,
      isLoading,
      isGenerating,
      isRestoring,
      isStale,
      lastGeneratedAt,
      error,
      errorCode,
      generateMealPlan,
      cancelGeneration,
      clearMealPlan,
      clearError,
      getRecipeById,
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
