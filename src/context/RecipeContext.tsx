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
  const [selectedRecipe, setSelectedRecipe] = useState<ClientRecipe | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Generar recetas actuales según el modo activo
  const recipes = useMemo<ClientRecipe[]>(() => {
    if (isDemoMode) {
      return getDemoRecipes(budget, servings);
    }
    return realRecipes;
  }, [isDemoMode, budget, servings, realRecipes]);

  /**
   * Resuelve una receta por ID explícito o slug generado.
   * Si la receta actualmente seleccionada en sesión coincide, la retorna con prioridad.
   */
  const getRecipeById = useCallback(
    (idOrSlug: string): ClientRecipe | undefined => {
      if (!idOrSlug) return undefined;
      const clean = idOrSlug.trim().toLowerCase();

      // 1. Revisar si la receta activa en sesión coincide
      if (selectedRecipe) {
        if (selectedRecipe.id.toLowerCase() === clean) {
          return selectedRecipe;
        }
        const activeSlug = generateRecipeSlug(selectedRecipe.name).toLowerCase();
        if (activeSlug === clean) {
          return selectedRecipe;
        }
      }

      // 2. Buscar en la colección actual de recetas en memoria
      const foundInList = recipes.find((r) => {
        if (r.id.toLowerCase() === clean) return true;
        const slug = generateRecipeSlug(r.name).toLowerCase();
        return slug === clean;
      });
      if (foundInList) {
        return foundInList;
      }

      // 3. Si estamos en modo demo, consultar el catálogo base adaptado
      if (isDemoMode) {
        return getDemoRecipeById(clean, budget, servings);
      }

      return undefined;
    },
    [selectedRecipe, recipes, isDemoMode, budget, servings]
  );

  /**
   * Selecciona una receta para mantenerla activa en la sesión entre pantallas.
   */
  const selectRecipe = useCallback(
    (idOrRecipe: string | ClientRecipe): ClientRecipe | undefined => {
      if (typeof idOrRecipe === 'string') {
        const resolved = getRecipeById(idOrRecipe);
        if (resolved) {
          setSelectedRecipe(resolved);
        }
        return resolved;
      }

      setSelectedRecipe(idOrRecipe);
      return idOrRecipe;
    },
    [getRecipeById]
  );

  const clearSelectedRecipe = useCallback(() => {
    setSelectedRecipe(null);
  }, []);

  /**
   * Permite inyectar recomendaciones reales del backend en la fase de integración (Phase 3).
   * Normaliza las recetas y asegura identidades únicas estables incluso con nombres duplicados.
   */
  const setRealRecipes = useCallback(
    (backendRecipes: BackendRecipe[], customServings?: number) => {
      const activeServings = customServings ?? servings;
      const seenSlugs = new Map<string, number>();

      const normalized: ClientRecipe[] = backendRecipes.map((raw, idx) => {
        const baseNorm = normalizeBackendRecipe(raw, idx, activeServings);
        const baseSlug = generateRecipeSlug(baseNorm.name);

        // Desambiguar colisiones en nombres duplicados
        let uniqueId = baseSlug;
        const occurrences = (seenSlugs.get(baseSlug) ?? 0) + 1;
        seenSlugs.set(baseSlug, occurrences);

        if (occurrences > 1) {
          uniqueId = `${baseSlug}-${occurrences}`;
        }

        return {
          ...baseNorm,
          id: uniqueId,
        };
      });

      setRealRecipesState(normalized);
      setIsDemoMode(false);
      setError(null);
    },
    [servings]
  );

  const setDemoMode = useCallback((enable: boolean) => {
    setIsDemoMode(enable);
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
