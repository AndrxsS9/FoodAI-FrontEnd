/**
 * FoodAI - Abstracción de fuente de datos y estado de recetas (Fase 2C).
 * Provee una capa desacoplada que soporta:
 * 1. Modo demostración explícito (Phase 2C).
 * 2. Colección futura de recetas normalizadas del backend real (Phase 3).
 * 3. Resolución segura de recetas por identidad estable (ID o slug).
 * 4. Persistencia de la receta seleccionada durante la sesión activa entre pantallas.
 * 5. Manejo de duplicados de nombres sin colisiones.
 * 6. Fallback resiliente ante identificadores inválidos o refrescos directos.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import {
  BackendRecipe,
  ClientRecipe,
  generateRecipeSlug,
  normalizeBackendRecipe,
} from '../types/recipe';
import {
  DEMO_RECIPES_META,
  getDemoRecipeById,
  getDemoRecipes,
} from '../fixtures/demoRecipes';
import { useBudget } from './BudgetContext';

export interface RecipeContextValue {
  recipes: ClientRecipe[];
  isDemoMode: boolean;
  demoMeta: typeof DEMO_RECIPES_META;
  selectedRecipe: ClientRecipe | null;
  isLoading: boolean;
  error: string | null;
  getRecipeById: (idOrSlug: string) => ClientRecipe | undefined;
  selectRecipe: (idOrRecipe: string | ClientRecipe) => ClientRecipe | undefined;
  clearSelectedRecipe: () => void;
  setRealRecipes: (backendRecipes: BackendRecipe[], customServings?: number) => void;
  setDemoMode: (enable: boolean) => void;
  refreshRecipes: () => Promise<void>;
}

const defaultRecipeContextValue: RecipeContextValue = {
  recipes: [],
  isDemoMode: true,
  demoMeta: DEMO_RECIPES_META,
  selectedRecipe: null,
  isLoading: false,
  error: null,
  getRecipeById: () => undefined,
  selectRecipe: () => undefined,
  clearSelectedRecipe: () => {},
  setRealRecipes: () => {},
  setDemoMode: () => {},
  refreshRecipes: async () => {},
};

const RecipeContext = createContext<RecipeContextValue | undefined>(undefined);

export interface RecipeProviderProps {
  children: React.ReactNode;
  initialRecipes?: ClientRecipe[];
  initialIsDemoMode?: boolean;
}

export function RecipeProvider({
  children,
  initialRecipes,
  initialIsDemoMode = true,
}: RecipeProviderProps) {
  const { budget, servings } = useBudget();

  const [isDemoMode, setIsDemoMode] = useState<boolean>(initialIsDemoMode);
  const [realRecipes, setRealRecipesState] = useState<ClientRecipe[]>(initialRecipes ?? []);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [customSelectedRecipe, setCustomSelectedRecipe] = useState<ClientRecipe | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Generar recetas actuales según el modo activo
  const recipes = useMemo<ClientRecipe[]>(() => {
    if (isDemoMode) {
      return getDemoRecipes(budget, servings);
    }
    return realRecipes;
  }, [isDemoMode, budget, servings, realRecipes]);

  // Derivar la receta seleccionada activa manteniéndola siempre sincronizada
  // con la colección actual, presupuesto y comensales
  const selectedRecipe = useMemo<ClientRecipe | null>(() => {
    if (!selectedRecipeId) return null;
    const foundInActiveList = recipes.find((r) => r.id === selectedRecipeId);
    if (foundInActiveList) return foundInActiveList;

    if (customSelectedRecipe && customSelectedRecipe.id === selectedRecipeId) {
      if (isDemoMode && customSelectedRecipe.isDemoFixture) {
        // En modo demo, mantener porciones sincronizadas
        return getDemoRecipeById(customSelectedRecipe.id, budget, servings) ?? customSelectedRecipe;
      }
      if (!isDemoMode && !customSelectedRecipe.isDemoFixture) {
        return customSelectedRecipe;
      }
    }
    return null;
  }, [selectedRecipeId, recipes, customSelectedRecipe, isDemoMode, budget, servings]);

  /**
   * Resuelve una receta con la siguiente jerarquía estricta:
   * 1. ID exacto de cliente en la colección actual (prioridad máxima).
   * 2. Slug derivado del nombre en la colección actual.
   * 3. Receta seleccionada en sesión (solo si coincide y no existe en colección activa).
   * 4. En modo demo, catálogo base escalado.
   * Esto previene que la receta seleccionada eclipse a una receta válida de la colección activa.
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

      // 3. Si no está en la colección activa pero coincide con la seleccionada en sesión
      if (selectedRecipe) {
        if (selectedRecipe.id.toLowerCase() === clean) {
          return selectedRecipe;
        }
        const activeSlug = generateRecipeSlug(selectedRecipe.name).toLowerCase();
        if (activeSlug === clean) {
          return selectedRecipe;
        }
      }

      // 4. Si estamos en modo demo, consultar el catálogo base adaptado
      if (isDemoMode) {
        return getDemoRecipeById(clean, budget, servings);
      }

      return undefined;
    },
    [recipes, selectedRecipe, isDemoMode, budget, servings]
  );

  /**
   * Selecciona una receta para mantenerla activa en la sesión entre pantallas.
   */
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
   * Permite inyectar recomendaciones reales del backend en la fase de integración (Phase 3).
   * Desambigua colisiones de identificadores usando un Set de IDs reservados para que nombres
   * idénticos o variantes de base slug (ej: "Arroz", "Arroz", "Arroz 2") siempre reciban IDs únicos.
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

      // Limpiar o actualizar la receta seleccionada si no pertenece a la nueva colección
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
    setIsDemoMode(enable);
    setSelectedRecipeId(null);
    setCustomSelectedRecipe(null);
  }, []);

  const refreshRecipes = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      // En Phase 2C (demostración), el refresco actualiza las recetas de demo
      // sin llamadas HTTP falsas
      if (isDemoMode) {
        // Simulación limpia de refresco local
        setIsLoading(false);
      } else {
        // Espacio para la llamada real del backend en Phase 3
        setIsLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar las recetas.');
      setIsLoading(false);
    }
  }, [isDemoMode]);

  const value = useMemo<RecipeContextValue>(
    () => ({
      recipes,
      isDemoMode,
      demoMeta: DEMO_RECIPES_META,
      selectedRecipe,
      isLoading,
      error,
      getRecipeById,
      selectRecipe,
      clearSelectedRecipe,
      setRealRecipes,
      setDemoMode,
      refreshRecipes,
    }),
    [
      recipes,
      isDemoMode,
      selectedRecipe,
      isLoading,
      error,
      getRecipeById,
      selectRecipe,
      clearSelectedRecipe,
      setRealRecipes,
      setDemoMode,
      refreshRecipes,
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
