/**
 * FoodAI - Selección de la "Recomendación del día" (Bloque 2 MVP final).
 *
 * Módulo puro y determinista: no realiza peticiones, no lee almacenamiento ni
 * depende de la fecha/hora. Solo ordena recetas REALES ya generadas por el
 * backend (POST /api/recipes/recommend) usando los metadatos autoritativos que
 * el backend devolvió (ingredientes disponibles/faltantes, costo estimado de
 * faltantes y bandera `withinBudget`). Nunca recalcula costos ni inventa
 * puntajes de Gemini.
 *
 * Criterios de orden (lexicográficos; el primero que difiere decide):
 *  1. `withinBudget === true` primero (asequible según el backend).
 *  2. Mayor cobertura de despensa: disponibles / (disponibles + faltantes).
 *  3. Más ingredientes urgentes de la despensa aprovechados (coincidencia exacta
 *     de nombre normalizado; sin coincidencias difusas).
 *  4. Menos ingredientes faltantes.
 *  5. Menor `estimatedMissingCost` (costo no finito se ordena al final).
 *  6. Más ingredientes disponibles usados (en valor absoluto).
 *  7. Orden original entregado por el backend (desempate final estable).
 */
import type { ClientRecipe } from '../types/recipe';

export interface DailyRecommendationScore {
  withinBudget: boolean;
  availableCount: number;
  missingCount: number;
  /** Cobertura 0..1 de los ingredientes de la receta que ya están en la despensa. */
  pantryCoverage: number;
  urgentMatches: number;
  estimatedMissingCost: number;
  originalIndex: number;
}

export interface DailyRecommendationPick {
  recipe: ClientRecipe;
  score: DailyRecommendationScore;
  /** Cantidad de recetas reales válidas que compitieron en la selección. */
  candidateCount: number;
}

export interface SelectDailyRecommendationOptions {
  /** Nombres de ingredientes urgentes de la despensa actual (PantryContext.summary). */
  urgentIngredientNames?: readonly string[];
}

/** Normaliza un nombre para comparación exacta: minúsculas, sin tildes, espacios colapsados. */
export function normalizeIngredientName(name: unknown): string {
  if (typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isEligibleRecipe(recipe: ClientRecipe | null | undefined): recipe is ClientRecipe {
  return (
    !!recipe &&
    recipe.isDemoFixture === false &&
    typeof recipe.id === 'string' &&
    recipe.id.trim().length > 0 &&
    typeof recipe.name === 'string' &&
    recipe.name.trim().length > 0
  );
}

export function scoreRecipe(
  recipe: ClientRecipe,
  originalIndex: number,
  urgentNames: ReadonlySet<string>
): DailyRecommendationScore {
  const available = Array.isArray(recipe.availableIngredients) ? recipe.availableIngredients : [];
  const missing = Array.isArray(recipe.missingIngredients) ? recipe.missingIngredients : [];
  const availableCount = available.length;
  const missingCount = missing.length;
  const total = availableCount + missingCount;

  let urgentMatches = 0;
  if (urgentNames.size > 0) {
    const seen = new Set<string>();
    for (const ing of available) {
      const key = normalizeIngredientName(ing?.name);
      if (key && urgentNames.has(key) && !seen.has(key)) {
        seen.add(key);
        urgentMatches++;
      }
    }
  }

  const cost = recipe.estimatedMissingCost;

  return {
    withinBudget: recipe.withinBudget === true,
    availableCount,
    missingCount,
    pantryCoverage: total === 0 ? 0 : availableCount / total,
    urgentMatches,
    estimatedMissingCost: typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? cost : Infinity,
    originalIndex,
  };
}

/**
 * Comparador total y determinista. Negativo => `a` es mejor recomendación que `b`.
 */
export function compareRecommendationScores(
  a: DailyRecommendationScore,
  b: DailyRecommendationScore
): number {
  if (a.withinBudget !== b.withinBudget) return a.withinBudget ? -1 : 1;
  if (a.pantryCoverage !== b.pantryCoverage) return b.pantryCoverage - a.pantryCoverage;
  if (a.urgentMatches !== b.urgentMatches) return b.urgentMatches - a.urgentMatches;
  if (a.missingCount !== b.missingCount) return a.missingCount - b.missingCount;
  if (a.estimatedMissingCost !== b.estimatedMissingCost) {
    return a.estimatedMissingCost < b.estimatedMissingCost ? -1 : 1;
  }
  if (a.availableCount !== b.availableCount) return b.availableCount - a.availableCount;
  return a.originalIndex - b.originalIndex;
}

/**
 * Elige la mejor receta REAL para mostrar en Inicio. Devuelve `null` si no hay
 * candidatas reales válidas (las recetas de demostración se excluyen siempre).
 * No muta el arreglo recibido.
 */
export function selectDailyRecommendation(
  recipes: readonly ClientRecipe[] | null | undefined,
  options: SelectDailyRecommendationOptions = {}
): DailyRecommendationPick | null {
  if (!Array.isArray(recipes) || recipes.length === 0) return null;

  const urgentNames = new Set(
    (options.urgentIngredientNames ?? []).map(normalizeIngredientName).filter(Boolean)
  );

  let bestRecipe: ClientRecipe | null = null;
  let bestScore: DailyRecommendationScore | null = null;
  let candidateCount = 0;

  for (let index = 0; index < recipes.length; index++) {
    const recipe = recipes[index];
    if (!isEligibleRecipe(recipe)) continue;
    candidateCount++;
    const score = scoreRecipe(recipe, index, urgentNames);
    if (!bestScore || compareRecommendationScores(score, bestScore) < 0) {
      bestRecipe = recipe;
      bestScore = score;
    }
  }

  if (!bestRecipe || !bestScore) return null;
  return { recipe: bestRecipe, score: bestScore, candidateCount };
}

/**
 * Indica si `convenience` proviene de un puntaje numérico real del backend
 * (p. ej. 92 o "92% conveniente"). Etiquetas genéricas de respaldo como
 * "Óptima" (asignadas por el cliente cuando el backend no envía puntaje) no
 * deben mostrarse como si fueran un puntaje calculado por IA.
 */
export function hasBackendConvenienceScore(convenience: unknown): boolean {
  if (typeof convenience === 'number') return Number.isFinite(convenience);
  return typeof convenience === 'string' && /\d/.test(convenience);
}

// ==========================================
// Estado de la sección "Recomendación del día"
// ==========================================

export type DailyRecommendationState =
  | { kind: 'loading-pantry' }
  | { kind: 'generating' }
  | { kind: 'empty-pantry' }
  | { kind: 'demo' }
  | { kind: 'stale' }
  | { kind: 'error'; message: string }
  | { kind: 'no-recipes' }
  | { kind: 'ready'; pick: DailyRecommendationPick };

export interface DailyRecommendationInput {
  isPantryLoading: boolean;
  pantryCount: number;
  isDemoMode: boolean;
  isGenerating: boolean;
  isStale: boolean;
  recipes: readonly ClientRecipe[];
  error: string | null;
  urgentIngredientNames?: readonly string[];
}

/**
 * Resuelve qué debe mostrar la sección. Prioridad:
 * cargando despensa → generando → despensa vacía → demo (error si la generación falló)
 * → obsoleta → lista → error → sin recetas.
 *
 * En modo demo nunca hay recetas reales que recomendar. Si la primera generación
 * real falla, RecipeContext conserva `isDemoMode === true` y expone `error`; en ese
 * caso se muestra el error real en lugar del estado demo genérico.
 * Nunca dispara generaciones: solo describe el estado actual.
 */
export function resolveDailyRecommendationState(
  input: DailyRecommendationInput
): DailyRecommendationState {
  if (input.isPantryLoading) return { kind: 'loading-pantry' };
  if (input.isGenerating) return { kind: 'generating' };
  if (input.pantryCount <= 0) return { kind: 'empty-pantry' };
  if (input.isDemoMode) {
    return input.error ? { kind: 'error', message: input.error } : { kind: 'demo' };
  }

  const pick = selectDailyRecommendation(input.recipes, {
    urgentIngredientNames: input.urgentIngredientNames,
  });

  if (pick && input.isStale) return { kind: 'stale' };
  if (pick) return { kind: 'ready', pick };
  if (input.error) return { kind: 'error', message: input.error };
  return { kind: 'no-recipes' };
}
