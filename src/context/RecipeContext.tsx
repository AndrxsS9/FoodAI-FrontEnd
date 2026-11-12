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
import { useLocale } from './LocaleContext';
import { recipeApi as defaultRecipeApi, RecipeApiError } from '../services/api/recipeApi';
import {
  RecipeGenerationSnapshot,
  RecipeStorageAdapter,
  RecipeStorageWriteBlockReason,
  RecipeStorageWriteBlockedError,
  createRecipeStorage,
} from '../services/storage/recipeStorage';

export type GenerationSnapshot = RecipeGenerationSnapshot;

/** Motivo (no sensible) por el que una generación exitosa no quedó guardada en el dispositivo. */
export type PersistenceWarningCode = RecipeStorageWriteBlockReason | 'write_failed';

const PERSISTENCE_WARNING_MESSAGES: Record<PersistenceWarningCode, string> = {
  write_failed:
    'Tus recetas se generaron correctamente, pero no pudimos guardarlas en este dispositivo. Siguen disponibles ahora, aunque podrían no conservarse si cierras la app.',
  backup_failed:
    'Tus recetas se generaron correctamente, pero no pudimos guardarlas en este dispositivo. Siguen disponibles ahora, aunque podrían no conservarse si cierras la app.',
  invalid_collection:
    'Tus recetas se generaron correctamente, pero no pudimos guardarlas en este dispositivo. Siguen disponibles ahora, aunque podrían no conservarse si cierras la app.',
  unsupported_version:
    'Tus recetas se generaron correctamente, pero este dispositivo tiene recetas guardadas por una versión más reciente de FoodAI y no las sobrescribimos. Las actuales podrían no conservarse si cierras la app.',
};

/** Exportado para verificar la paridad con el catálogo de idioma (Fase 28C-A). */
export const RECIPE_PERSISTENCE_WARNING_MESSAGES: Readonly<Record<PersistenceWarningCode, string>> =
  PERSISTENCE_WARNING_MESSAGES;

export interface RecipeContextValue {
  recipes: ClientRecipe[];
  isDemoMode: boolean;
  demoMeta: typeof DEMO_RECIPES_META;
  selectedRecipe: ClientRecipe | null;
  isLoading: boolean;
  isGenerating: boolean;
  /**
   * Hidratación en frío pendiente para un usuario autenticado: la colección persistida aún no
   * se ha leído o la despensa/presupuesto aún no están listos para evaluar obsolescencia.
   * Mientras sea true, una colección vacía NO significa "sin recetas".
   */
  isRestoring: boolean;
  isStale: boolean;
  lastGeneratedAt: string | null;
  error: string | null;
  errorCode: string | null;
  /**
   * Aviso no bloqueante: la generación con IA fue exitosa pero no quedó guardada en el
   * dispositivo. Se limpia tras una escritura verificada. Nunca contiene detalles internos.
   */
  persistenceWarning: string | null;
  persistenceWarningCode: PersistenceWarningCode | null;
  clearPersistenceWarning: () => void;
  getRecipeById: (idOrSlug: string) => ClientRecipe | undefined;
  selectRecipe: (idOrRecipe: string | ClientRecipe) => ClientRecipe | undefined;
  clearSelectedRecipe: () => void;
  setRealRecipes: (backendRecipes: BackendRecipe[], customServings?: number, generationId?: string) => void;
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
  isRestoring: false,
  isStale: false,
  lastGeneratedAt: null,
  error: null,
  errorCode: null,
  persistenceWarning: null,
  persistenceWarningCode: null,
  clearPersistenceWarning: () => {},
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
  /**
   * Modo demo inicial explícito (herramientas de demostración y pruebas).
   * Si se omite, el modo demo solo aplica SIN usuario autenticado: una sesión real nunca
   * arranca con recetas de demostración (ver resolveDefaultDemoMode).
   */
  initialIsDemoMode?: boolean;
  recipeApiClient?: typeof defaultRecipeApi;
  userId?: string | null;
  /**
   * Adaptador de persistencia inyectable (pruebas). Solo se usa con un usuario autenticado y
   * sin `initialRecipes`; por defecto se crea uno aislado por usuario sobre AsyncStorage.
   */
  storageAdapter?: RecipeStorageAdapter;
}

/**
 * Modo demo por defecto según la sesión: los fixtures de demostración solo se muestran sin
 * usuario autenticado. Un usuario real arranca en modo real con cero recetas hasta que genera.
 */
export function resolveDefaultDemoMode(userId: string | null): boolean {
  return userId === null;
}

/** Mensaje y código cuando se intenta generar antes de hidratar despensa y presupuesto. */
export const DATA_NOT_READY_CODE = 'DATA_NOT_READY';
const DATA_NOT_READY_MESSAGE =
  'Todavía estamos cargando tu despensa y tu presupuesto. Intenta de nuevo en un momento.';

export function RecipeProvider({
  children,
  initialRecipes,
  initialIsDemoMode,
  recipeApiClient = defaultRecipeApi,
  userId,
  storageAdapter,
}: RecipeProviderProps) {
  const auth = useAuthSafe();
  const effectiveUserId = userId !== undefined ? userId : auth?.user?.id ?? null;

  // Persistencia solo para usuarios autenticados y sin colección inicial inyectada
  // (los fixtures/pruebas con initialRecipes conservan el comportamiento en memoria).
  const isPersistenceActive = initialRecipes === undefined && effectiveUserId !== null;
  const activeStorage = useMemo<RecipeStorageAdapter | null>(() => {
    if (!isPersistenceActive) return null;
    return storageAdapter ?? createRecipeStorage(effectiveUserId);
  }, [isPersistenceActive, storageAdapter, effectiveUserId]);

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

  const [isDemoMode, setIsDemoMode] = useState<boolean>(
    () => initialIsDemoMode ?? resolveDefaultDemoMode(effectiveUserId)
  );
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

  // Hidratación en frío: lectura del almacenamiento pendiente y, por separado, si ya se
  // completó la hidratación conjunta (almacenamiento + despensa + presupuesto).
  const [isStorageRestoring, setIsStorageRestoring] = useState<boolean>(isPersistenceActive);
  const [hasHydrated, setHasHydrated] = useState<boolean>(!isPersistenceActive);

  // Referencias para control de concurrencia y cancelación de peticiones asíncronas
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const isGeneratingRef = useRef<boolean>(false);
  const operationVersionRef = useRef<number>(0);
  const activeUserIdRef = useRef<string | null>(effectiveUserId);
  // Se incrementa cada vez que la colección real se reemplaza localmente (generación o
  // setRealRecipes). Una restauración iniciada antes nunca sobrescribe datos más recientes.
  const generationEpochRef = useRef<number>(0);

  // Resultado de la persistencia local, separado del éxito de la generación con IA.
  const [persistenceWarningCode, setPersistenceWarningCode] = useState<PersistenceWarningCode | null>(null);
  const latestSaveOrderRef = useRef<number>(0);
  const persistenceDiagnosticRef = useRef<{
    code: PersistenceWarningCode;
    error: unknown;
    at: string;
  } | null>(null);

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
    // El modo demo por defecto sigue a la sesión: nunca se arrastra entre usuarios.
    if (initialIsDemoMode === undefined) {
      setIsDemoMode(resolveDefaultDemoMode(effectiveUserId));
    }
    // La hidratación se reinicia para el nuevo usuario (o se desactiva al cerrar sesión).
    setIsStorageRestoring(isPersistenceActive);
    setHasHydrated(!isPersistenceActive);
    setPersistenceWarningCode(null);
  }

  // La hidratación conjunta concluye una sola vez por usuario: ni la recarga posterior de la
  // despensa ni la del presupuesto vuelven a ocultar la colección.
  if (!hasHydrated && !isStorageRestoring && !isPantryLoading && !isBudgetLoading) {
    setHasHydrated(true);
  }
  const isRestoring = isPersistenceActive && !hasHydrated;

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

  // Restauración en frío de la última colección real del usuario activo (Bloque 5).
  // Nunca invoca a Gemini; solo lee el almacenamiento aislado por usuario.
  useEffect(() => {
    if (!activeStorage) return;

    let cancelled = false;
    const restoreUserId = effectiveUserId;
    const epochAtStart = generationEpochRef.current;

    activeStorage
      .load()
      .then((result) => {
        if (cancelled || restoreUserId !== activeUserIdRef.current) return;
        // Una generación (o inyección) local más reciente prevalece sobre lo persistido.
        if (generationEpochRef.current !== epochAtStart) return;

        if (result.status === 'valid') {
          const { collection } = result;
          setRealRecipesState(collection.recipes);
          setLastSnapshot(collection.snapshot);
          setLastGeneratedAt(collection.generatedAt);
        } else if (result.status !== 'empty') {
          // Datos corruptos o de versión no soportada: no se muestran ni se modifican.
          console.warn(
            '[RecipeContext] Colección de recetas persistida no restaurable:',
            result.status === 'corrupt' ? result.error : `versión ${result.version}`
          );
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('[RecipeContext] Error al leer recetas persistidas:', err);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsStorageRestoring(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeStorage, effectiveUserId]);

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
    // Sin hidratación completa no se puede comparar: evita avisos falsos por una despensa
    // o un presupuesto que aún no se han cargado tras el reinicio.
    if (isRestoring) {
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
    isRestoring,
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
    (backendRecipes: BackendRecipe[], customServings?: number, generationId?: string) => {
      generationEpochRef.current++;
      const activeServings = customServings ?? servings;
      const activeGenId = generationId || `gen_${Date.now()}`;
      const reservedIds = new Set<string>();

      const normalized: ClientRecipe[] = backendRecipes.map((raw, idx) => {
        const baseNorm = normalizeBackendRecipe(raw, idx, activeServings, activeGenId);
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
          instanceId: `${uniqueId}::${activeGenId}`,
          generationId: activeGenId,
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

  /** Oculta el aviso visible; el diagnóstico interno se conserva hasta una escritura verificada. */
  const clearPersistenceWarning = useCallback(() => {
    setPersistenceWarningCode(null);
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
      // Idioma fijado en el instante en que inicia esta solicitud
      const requestLocale = localeRef.current;

      try {
        // 3. La despensa y el presupuesto deben estar hidratados: una despensa aún cargando no
        //    es una despensa vacía, y un presupuesto por defecto no es el del usuario. Generar
        //    antes enviaría datos incorrectos y crearía una instantánea inválida.
        if (isPantryLoading || isBudgetLoading) {
          setError(DATA_NOT_READY_MESSAGE);
          setErrorCode(DATA_NOT_READY_CODE);
          throw new RecipeApiError(DATA_NOT_READY_MESSAGE, DATA_NOT_READY_CODE, 0);
        }

        // 4. Validación estricta de la despensa: Al menos un ingrediente
        if (!ingredients || ingredients.length === 0) {
          const emptyMsg =
            'Tu despensa está vacía. Registra al menos un alimento en Mi Despensa para generar recomendaciones.';
          setError(emptyMsg);
          setErrorCode('EMPTY_PANTRY');
          throw new RecipeApiError(emptyMsg, 'EMPTY_PANTRY', 400, undefined, false, false, false, true);
        }
        // 5. Mapear datos de la despensa al contrato del backend
        const requestPayload = mapPantryToRecommendRequest(
           ingredients,
          budget,
          servings,
          targetMaxMinutes,
          requestLocale
        );

        // 6. Invocar al backend real
        const backendRecipes = await recipeApiClient.recommendRecipes(requestPayload, {
          signal: abortController.signal,
        });

        // 7. Verificar si esta operación sigue siendo la más reciente y del usuario activo (evitar stale data)
        if (
          currentOpVersion !== operationVersionRef.current ||
          requestUserId !== activeUserIdRef.current
        ) {
          return [];
        }

        // Orden lógico de persistencia reservado en el instante de aceptación de la generación
        // (independiente del reloj del dispositivo; ver recipeStorage.reserveWriteOrder).
        const writeOrder = activeStorage ? activeStorage.reserveWriteOrder() : 0;

        // 8. Normalizar y registrar recetas reales con ID de generación
        const generationId = `gen_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        setRealRecipes(backendRecipes, servings, generationId);

        // 9. Actualizar snapshot de la generación para cálculo de obsolescencia
        const snapshot: GenerationSnapshot = {
          pantryFingerprint: currentPantryFingerprint,
          budget,
          servings,
          maxMinutes: targetMaxMinutes,
        };
        setLastSnapshot(snapshot);

        const generatedAt = new Date().toISOString();
        setLastGeneratedAt(generatedAt);

        // Derivar y retornar el nuevo listado con identidades de instancia
        const reservedIds = new Set<string>();
        const finalNormalized = backendRecipes.map((raw, idx) => {
          const baseNorm = normalizeBackendRecipe(raw, idx, servings, generationId);
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
            instanceId: `${uniqueId}::${generationId}`,
            generationId,
          };
        });

        // 10. Persistir la colección real en el almacenamiento aislado del usuario que la
        //     solicitó. Un fallo de escritura no invalida la generación: queda en memoria.
        //     El resultado (aviso visible o su limpieza) solo lo aplica la escritura más reciente
        //     del usuario que sigue activo.
        if (activeStorage) {
          const { maxMinutes: snapshotMaxMinutes, ...snapshotBase } = snapshot;
          latestSaveOrderRef.current = writeOrder;
          const isCurrentSave = () =>
            requestUserId === activeUserIdRef.current && latestSaveOrderRef.current === writeOrder;

          activeStorage
            .save(
              {
                generationId,
                generatedAt,
                snapshot:
                  snapshotMaxMinutes != null
                    ? { ...snapshotBase, maxMinutes: snapshotMaxMinutes }
                    : snapshotBase,
                recipes: finalNormalized,
              },
              writeOrder
            )
            .then((saveResult) => {
              if (saveResult.status === 'saved' && isCurrentSave()) {
                // Persistencia verificada: se retira cualquier aviso previo.
                persistenceDiagnosticRef.current = null;
                setPersistenceWarningCode(null);
              }
            })
            .catch((persistErr) => {
              console.warn('[RecipeContext] No se pudieron persistir las recetas generadas:', persistErr);
              if (!isCurrentSave()) return;
              const code: PersistenceWarningCode =
                persistErr instanceof RecipeStorageWriteBlockedError
                  ? persistErr.reason
                  : 'write_failed';
              // El error original se conserva solo internamente para diagnóstico.
              persistenceDiagnosticRef.current = {
                code,
                error: persistErr,
                at: new Date().toISOString(),
              };
              setPersistenceWarningCode(code);
            });
        }

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
      isPantryLoading,
      isBudgetLoading,
      budget,
      servings,
      maxMinutes,
      currentPantryFingerprint,
      recipeApiClient,
      setRealRecipes,
      effectiveUserId,
      activeStorage,
    ]
  );

  // Un aviso de "datos aún cargando" deja de ser cierto en cuanto termina la hidratación:
  // se deja de exponer (derivado en render, sin efectos) para no mostrar un error obsoleto.
  const isResolvedDataNotReady =
    errorCode === DATA_NOT_READY_CODE && !isPantryLoading && !isBudgetLoading;
  const exposedError = isResolvedDataNotReady ? null : error;
  const exposedErrorCode = isResolvedDataNotReady ? null : errorCode;

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
      isRestoring,
      isStale,
      lastGeneratedAt,
      error: exposedError,
      errorCode: exposedErrorCode,
      persistenceWarning: persistenceWarningCode ? PERSISTENCE_WARNING_MESSAGES[persistenceWarningCode] : null,
      persistenceWarningCode,
      clearPersistenceWarning,
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
      isRestoring,
      isStale,
      lastGeneratedAt,
      exposedError,
      exposedErrorCode,
      persistenceWarningCode,
      clearPersistenceWarning,
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
