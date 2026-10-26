/**
 * FoodAI - Abstracción de fuente de datos y estado de recetas (Fase 3A).
 * Provee una capa desacoplada y reactiva que soporta:
 * 1. Modo demostración explícito (Phase 2C).
 * 2. Integración real con FoodAI-Backend y Gemini (Phase 3A) mediante POST /api/recipes/recommend.
 * 3. Operación explícita 'generateRecipes()' disparada por el usuario con validación estricta.
 * 4. Resolución determinista de recetas por identidad estable (ID o slug sin colisiones).
 * 5. Persistencia en memoria durante la sesión activa entre pantallas.
 * 6. Detección automática de recomendaciones obsoletas ('isStale') si la despensa o presupuesto cambian.
 * 7. Cancelación segura de peticiones en curso y protección contra invocaciones concurrentes.
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
  BackendRecipe,
  ClientRecipe,
  generateRecipeSlug,
  mapPantryToRecommendRequest,
  normalizeBackendRecipe,
} from '../types/recipe';
import {
  DEMO_RECIPES_META,
  getDemoRecipeById,
  getDemoRecipes,
} from '../fixtures/demoRecipes';
import { useBudget } from './BudgetContext';
import { usePantrySafe } from './PantryContext';
import { useAuthSafe } from './AuthContext';
import { recipeApi as defaultRecipeApi, RecipeApiError } from '../services/api/recipeApi';

export interface GenerationSnapshot {
  pantryFingerprint: string;
  budget: number;
  servings: number;
  maxMinutes?: number;
}

export interface RecipeContextValue {
  recipes: ClientRecipe[];
  isDemoMode: boolean;
  demoMeta: typeof DEMO_RECIPES_META;
  selectedRecipe: ClientRecipe | null;
  isLoading: boolean;
  isGenerating: boolean;
  isStale: boolean;
  lastGeneratedAt: string | null;
  error: string | null;
  errorCode: string | null;
  getRecipeById: (idOrSlug: string) => ClientRecipe | undefined;
  selectRecipe: (idOrRecipe: string | ClientRecipe) => ClientRecipe | undefined;
  clearSelectedRecipe: () => void;
  setRealRecipes: (backendRecipes: BackendRecipe[], customServings?: number) => void;
  setDemoMode: (enable: boolean) => void;
  refreshRecipes: () => Promise<void>;
  generateRecipes: (options?: { maxMinutes?: number }) => Promise<ClientRecipe[]>;
  clearError: () => void;
}

const defaultRecipeContextValue: RecipeContextValue = {
  recipes: [],
  isDemoMode: true,
  demoMeta: DEMO_RECIPES_META,
  selectedRecipe: null,
  isLoading: false,
  isGenerating: false,
  isStale: false,
  lastGeneratedAt: null,
  error: null,
  errorCode: null,
  getRecipeById: () => undefined,
  selectRecipe: () => undefined,
  clearSelectedRecipe: () => {},
  setRealRecipes: () => {},
  setDemoMode: () => {},
  refreshRecipes: async () => {},
  generateRecipes: async () => [],
  clearError: () => {},
};

const RecipeContext = createContext<RecipeContextValue | undefined>(undefined);

export interface RecipeProviderProps {
  children: React.ReactNode;
  initialRecipes?: ClientRecipe[];
  initialIsDemoMode?: boolean;
  recipeApiClient?: typeof defaultRecipeApi;
  userId?: string | null;
}

export function RecipeProvider({
  children,
  initialRecipes,
  initialIsDemoMode = true,
  recipeApiClient = defaultRecipeApi,
  userId,
}: RecipeProviderProps) {
  const auth = useAuthSafe();
  const effectiveUserId = userId !== undefined ? userId : auth?.user?.id ?? null;

  const { budget, servings, maxMinutes } = useBudget();
  const pantry = usePantrySafe();
  const ingredients = useMemo(() => pantry?.ingredients ?? [], [pantry?.ingredients]);

  const [isDemoMode, setIsDemoMode] = useState<boolean>(initialIsDemoMode);
  const [realRecipes, setRealRecipesState] = useState<ClientRecipe[]>(initialRecipes ?? []);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [customSelectedRecipe, setCustomSelectedRecipe] = useState<ClientRecipe | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // Snapshot de los datos utilizados en la última generación real exitosa
  const [lastSnapshot, setLastSnapshot] = useState<GenerationSnapshot | null>(null);

  // Referencias para control de concurrencia y cancelación de peticiones asíncronas
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const isGeneratingRef = useRef<boolean>(false);
  const operationVersionRef = useRef<number>(0);
  const activeUserIdRef = useRef<string | null>(effectiveUserId);

  // Ajuste de estado inmediato durante render al cambiar de usuario (evita intermediate renders y cascading effects)
  const [prevUserIdState, setPrevUserIdState] = useState<string | null>(effectiveUserId);
  if (effectiveUserId !== prevUserIdState) {
    setPrevUserIdState(effectiveUserId);
    setIsGenerating(false);
    setIsLoading(false);
    setSelectedRecipeId(null);
    setCustomSelectedRecipe(null);
    setLastSnapshot(null);
    setError(null);
    setErrorCode(null);
    if (!initialRecipes) {
      setRealRecipesState([]);
      setLastGeneratedAt(null);
    }
  }

  // Aislamiento reactivo de efectos externos ante cambio de sesión o logout (Fase 5)
  useEffect(() => {
    // 1. Invalidar cualquier operación asíncrona activa al cambiar de usuario
    operationVersionRef.current++;
    activeUserIdRef.current = effectiveUserId;

    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
    isGeneratingRef.current = false;
  }, [effectiveUserId]);

  // Huella digital reproducible de la despensa actual
  const currentPantryFingerprint = useMemo(() => {
    return (ingredients || [])
      .map((item) => `${item.id}:${item.name.toLowerCase()}:${item.quantity}:${item.unit}`)
      .sort()
      .join('|');
  }, [ingredients]);

  // Detección reactiva de obsolescencia (isStale)
  // Solo aplica cuando estamos en modo real (!isDemoMode) y ya se generaron recetas previas
  const isStale = useMemo(() => {
    if (isDemoMode || !lastSnapshot || realRecipes.length === 0) {
      return false;
    }

    const pantryChanged = lastSnapshot.pantryFingerprint !== currentPantryFingerprint;
    const budgetChanged = lastSnapshot.budget !== budget;
    const servingsChanged = lastSnapshot.servings !== servings;
    const maxMinutesChanged = (lastSnapshot.maxMinutes ?? undefined) !== (maxMinutes ?? undefined);

    return pantryChanged || budgetChanged || servingsChanged || maxMinutesChanged;
  }, [
    isDemoMode,
    lastSnapshot,
    realRecipes.length,
    currentPantryFingerprint,
    budget,
    servings,
    maxMinutes,
  ]);

  // Generar recetas actuales según el modo activo
  const recipes = useMemo<ClientRecipe[]>(() => {
    if (isDemoMode) {
      return getDemoRecipes(budget, servings);
    }
    return realRecipes;
  }, [isDemoMode, budget, servings, realRecipes]);

  // Derivar la receta seleccionada activa manteniéndola siempre sincronizada
  const selectedRecipe = useMemo<ClientRecipe | null>(() => {
    if (!selectedRecipeId) return null;
    const foundInActiveList = recipes.find((r) => r.id === selectedRecipeId);
    if (foundInActiveList) return foundInActiveList;

    if (customSelectedRecipe && customSelectedRecipe.id === selectedRecipeId) {
      if (isDemoMode && customSelectedRecipe.isDemoFixture) {
        return getDemoRecipeById(customSelectedRecipe.id, budget, servings) ?? customSelectedRecipe;
      }
      if (!isDemoMode && !customSelectedRecipe.isDemoFixture) {
        return customSelectedRecipe;
      }
    }
    return null;
  }, [selectedRecipeId, recipes, customSelectedRecipe, isDemoMode, budget, servings]);

  /**
   * Resuelve una receta con jerarquía estricta de prioridad:
   * 1. ID exacto de cliente en la colección actual.
   * 2. Slug derivado del nombre en la colección actual.
   * 3. Receta seleccionada en sesión.
   * 4. En modo demo, catálogo base adaptado.
   */
  const getRecipeById = useCallback(
    (idOrSlug: string): ClientRecipe | undefined => {
      if (!idOrSlug) return undefined;
      const clean = idOrSlug.trim().toLowerCase();

      // 1. Prioridad máxima: Búsqueda por ID exacto en la colección actual
      const matchById = recipes.find((r) => r.id.toLowerCase() === clean);
      if (matchById) {
        return matchById;
      }

      // 2. Búsqueda por slug generado del nombre en la colección actual
      const matchBySlug = recipes.find((r) => {
        const slug = generateRecipeSlug(r.name).toLowerCase();
        return slug === clean;
      });
      if (matchBySlug) {
        return matchBySlug;
      }

      // 3. Receta seleccionada en sesión
      if (selectedRecipe) {
        if (selectedRecipe.id.toLowerCase() === clean) {
          return selectedRecipe;
        }
        const activeSlug = generateRecipeSlug(selectedRecipe.name).toLowerCase();
        if (activeSlug === clean) {
          return selectedRecipe;
        }
      }

      // 4. Catálogo demo de respaldo
      if (isDemoMode) {
        return getDemoRecipeById(clean, budget, servings);
      }

      return undefined;
    },
    [recipes, selectedRecipe, isDemoMode, budget, servings]
  );

  const selectRecipe = useCallback(
    (idOrRecipe: string | ClientRecipe): ClientRecipe | undefined => {
      if (typeof idOrRecipe === 'string') {
        const resolved = getRecipeById(idOrRecipe);
        if (resolved) {
          setSelectedRecipeId(resolved.id);
          setCustomSelectedRecipe(resolved);
        }
        return resolved;
      }

      setSelectedRecipeId(idOrRecipe.id);
      setCustomSelectedRecipe(idOrRecipe);
      return idOrRecipe;
    },
    [getRecipeById]
  );

  const clearSelectedRecipe = useCallback(() => {
    setSelectedRecipeId(null);
    setCustomSelectedRecipe(null);
  }, []);

  /**
   * Inyecta recetas normalizadas en el estado local garantizando identificadores
   * únicos sin colisiones mediante un Set de slugs reservados.
   */
  const setRealRecipes = useCallback(
    (backendRecipes: BackendRecipe[], customServings?: number) => {
      const activeServings = customServings ?? servings;
      const reservedIds = new Set<string>();

      const normalized: ClientRecipe[] = backendRecipes.map((raw, idx) => {
        const baseNorm = normalizeBackendRecipe(raw, idx, activeServings);
        const baseSlug = generateRecipeSlug(baseNorm.name) || `receta-${idx + 1}`;

        let uniqueId = baseSlug;
        if (reservedIds.has(uniqueId)) {
          let counter = 2;
          let candidate = `${baseSlug}-${counter}`;
          while (reservedIds.has(candidate)) {
            counter++;
            candidate = `${baseSlug}-${counter}`;
          }
          uniqueId = candidate;
        }

        reservedIds.add(uniqueId);

        return {
          ...baseNorm,
          id: uniqueId,
        };
      });

      setRealRecipesState(normalized);
      setIsDemoMode(false);
      setError(null);
      setErrorCode(null);

      setSelectedRecipeId((prevId) => {
        if (!prevId) return null;
        const stillExists = normalized.some((r) => r.id === prevId);
        return stillExists ? prevId : null;
      });
      setCustomSelectedRecipe((prev) => {
        if (!prev) return null;
        const stillExists = normalized.find((r) => r.id === prev.id);
        return stillExists ?? null;
      });
    },
    [servings]
  );

  const setDemoMode = useCallback((enable: boolean) => {
    // 1. Invalidar cualquier operación asíncrona de generación en curso
    operationVersionRef.current++;
    isGeneratingRef.current = false;

    // 2. Abortar la petición activa en la capa de transporte
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }

    // 3. Resetear estados de carga y generación
    setIsGenerating(false);
    setIsLoading(false);

    // 4. Actualizar modo activo y limpiar selección y errores
    setIsDemoMode(enable);
    setSelectedRecipeId(null);
    setCustomSelectedRecipe(null);
    setError(null);
    setErrorCode(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
    setErrorCode(null);
  }, []);

  /**
   * Operación principal de la Fase 3A: Generación real de recetas con IA (Gemini vía backend).
   * Valida precondiciones locales, ejecuta la llamada con AbortController y actualiza el estado.
   */
  const generateRecipes = useCallback(
    async (options?: { maxMinutes?: number }): Promise<ClientRecipe[]> => {
      // 1. Guard contra llamadas concurrentes duplicadas
      if (isGeneratingRef.current) {
        return realRecipes;
      }

      // 2. Cancelar cualquier solicitud anterior aún pendiente
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
      setError(null);
      setErrorCode(null);

      const targetMaxMinutes = options?.maxMinutes ?? maxMinutes;

      try {
        // 3. Validación estricta de la despensa: Al menos un ingrediente
        if (!ingredients || ingredients.length === 0) {
          const emptyMsg =
            'Tu despensa está vacía. Registra al menos un alimento en Mi Despensa para generar recomendaciones.';
          setError(emptyMsg);
          setErrorCode('EMPTY_PANTRY');
          throw new RecipeApiError(emptyMsg, 'EMPTY_PANTRY', 400, undefined, false, false, false, true);
        }
        // 4. Mapear datos de la despensa al contrato del backend
        const requestPayload = mapPantryToRecommendRequest(
           ingredients,
          budget,
          servings,
          targetMaxMinutes
        );

        // 5. Invocar al backend real
        const backendRecipes = await recipeApiClient.recommendRecipes(requestPayload, {
          signal: abortController.signal,
        });

        // 6. Verificar si esta operación sigue siendo la más reciente y del usuario activo (evitar stale data)
        if (
          currentOpVersion !== operationVersionRef.current ||
          requestUserId !== activeUserIdRef.current
        ) {
          return [];
        }

        // 7. Normalizar y registrar recetas reales
        setRealRecipes(backendRecipes, servings);

        // 8. Actualizar snapshot de la generación para cálculo de obsolescencia
        setLastSnapshot({
          pantryFingerprint: currentPantryFingerprint,
          budget,
          servings,
          maxMinutes: targetMaxMinutes,
        });

        setLastGeneratedAt(new Date().toISOString());

        // Derivar y retornar el nuevo listado
        const reservedIds = new Set<string>();
        const finalNormalized = backendRecipes.map((raw, idx) => {
          const baseNorm = normalizeBackendRecipe(raw, idx, servings);
          const baseSlug = generateRecipeSlug(baseNorm.name) || `receta-${idx + 1}`;
          let uniqueId = baseSlug;
          if (reservedIds.has(uniqueId)) {
            let counter = 2;
            let candidate = `${baseSlug}-${counter}`;
            while (reservedIds.has(candidate)) {
              counter++;
              candidate = `${baseSlug}-${counter}`;
            }
            uniqueId = candidate;
          }
          reservedIds.add(uniqueId);
          return { ...baseNorm, id: uniqueId };
        });

        return finalNormalized;
      } catch (err) {
        // Si fue una versión superada por otra operación o el usuario cambió, descartar completamente
        if (
          currentOpVersion !== operationVersionRef.current ||
          requestUserId !== activeUserIdRef.current
        ) {
          return [];
        }

        const msg =
          err instanceof Error
            ? err.message
            : 'Ocurrió un error inesperado al generar las recetas con IA.';

        const code = err instanceof RecipeApiError ? err.code : 'AI_GENERATION_FAILED';

        // NUNCA hacer fallback silencioso a recetas de demostración ante fallo real
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
      realRecipes,
      ingredients,
      budget,
      servings,
      maxMinutes,
      currentPantryFingerprint,
      recipeApiClient,
      setRealRecipes,
      effectiveUserId,
    ]
  );

  const refreshRecipes = useCallback(async (): Promise<void> => {
    if (isDemoMode) {
      setIsLoading(true);
      setError(null);
      setErrorCode(null);
      // En modo demo, refresh local limpio
      setIsLoading(false);
      return;
    }

    // En modo real, regenerar con la despensa actual
    await generateRecipes();
  }, [isDemoMode, generateRecipes]);

  // Limpieza al desmontar el componente proveedor
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

  const value = useMemo<RecipeContextValue>(
    () => ({
      recipes,
      isDemoMode,
      demoMeta: DEMO_RECIPES_META,
      selectedRecipe,
      isLoading,
      isGenerating,
      isStale,
      lastGeneratedAt,
      error,
      errorCode,
      getRecipeById,
      selectRecipe,
      clearSelectedRecipe,
      setRealRecipes,
      setDemoMode,
      refreshRecipes,
      generateRecipes,
      clearError,
    }),
    [
      recipes,
      isDemoMode,
      selectedRecipe,
      isLoading,
      isGenerating,
      isStale,
      lastGeneratedAt,
      error,
      errorCode,
      getRecipeById,
      selectRecipe,
      clearSelectedRecipe,
      setRealRecipes,
      setDemoMode,
      refreshRecipes,
      generateRecipes,
      clearError,
    ]
  );

  return (
    <RecipeContext.Provider value={value}>{children}</RecipeContext.Provider>
  );
}

export function useRecipes(): RecipeContextValue {
  const context = useContext(RecipeContext);
  if (!context) {
    return defaultRecipeContextValue;
  }
  return context;
}
