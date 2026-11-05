/**
 * Pruebas unitarias del selector puro de "Recomendación del día" (Bloque 2 MVP final).
 * Verifica criterios de orden, desempates transparentes, exclusión de demos,
 * determinismo y la resolución de estados de la sección de Inicio.
 */
import {
  compareRecommendationScores,
  hasBackendConvenienceScore,
  normalizeIngredientName,
  resolveDailyRecommendationState,
  scoreRecipe,
  selectDailyRecommendation,
  DailyRecommendationInput,
} from '../src/utils/dailyRecommendation';
import { ClientRecipe } from '../src/types/recipe';
import { getDemoRecipes } from '../src/fixtures/demoRecipes';

const ing = (name: string, estimatedCost?: number) => ({
  name,
  quantity: 1,
  unit: 'unidad',
  ...(estimatedCost !== undefined ? { estimatedCost } : {}),
});

function makeRecipe(overrides: Partial<ClientRecipe> & { id: string }): ClientRecipe {
  return {
    name: overrides.id,
    description: '',
    totalMinutes: 30,
    servings: 2,
    ingredients: [],
    steps: ['Paso'],
    availableIngredients: [],
    missingIngredients: [],
    estimatedMissingCost: 0,
    budgetRemaining: 20000,
    withinBudget: true,
    convenience: '80% conveniente',
    reason: '',
    isDemoFixture: false,
    ...overrides,
  };
}

describe('selectDailyRecommendation', () => {
  it('devuelve null sin recetas', () => {
    expect(selectDailyRecommendation([])).toBeNull();
    expect(selectDailyRecommendation(null)).toBeNull();
    expect(selectDailyRecommendation(undefined)).toBeNull();
  });

  it('nunca selecciona recetas de demostración', () => {
    expect(selectDailyRecommendation(getDemoRecipes(20000, 2))).toBeNull();

    const real = makeRecipe({ id: 'real', availableIngredients: [ing('Arroz')] });
    const demo = { ...makeRecipe({ id: 'demo', availableIngredients: [ing('Pollo'), ing('Arroz')] }), isDemoFixture: true };
    const pick = selectDailyRecommendation([demo, real]);
    expect(pick?.recipe.id).toBe('real');
    expect(pick?.candidateCount).toBe(1);
  });

  it('descarta recetas sin id o nombre válidos', () => {
    const invalid = makeRecipe({ id: '  ', name: 'Sin id' });
    const noName = makeRecipe({ id: 'sin-nombre', name: '' });
    expect(selectDailyRecommendation([invalid, noName])).toBeNull();
  });

  it('con una sola receta real la devuelve con su puntaje', () => {
    const only = makeRecipe({
      id: 'unica',
      availableIngredients: [ing('Huevo'), ing('Tomate')],
      missingIngredients: [ing('Queso', 2500)],
      estimatedMissingCost: 2500,
    });
    const pick = selectDailyRecommendation([only]);
    expect(pick?.recipe).toBe(only);
    expect(pick?.candidateCount).toBe(1);
    expect(pick?.score).toMatchObject({
      withinBudget: true,
      availableCount: 2,
      missingCount: 1,
      estimatedMissingCost: 2500,
      originalIndex: 0,
    });
    expect(pick?.score.pantryCoverage).toBeCloseTo(2 / 3);
  });

  it('prioriza la receta con mayor cobertura de despensa sobre el orden del backend', () => {
    const lowCoverage = makeRecipe({
      id: 'baja',
      availableIngredients: [ing('Arroz')],
      missingIngredients: [ing('Pollo', 6000), ing('Pimentón', 1500)],
      estimatedMissingCost: 7500,
    });
    const highCoverage = makeRecipe({
      id: 'alta',
      availableIngredients: [ing('Arroz'), ing('Huevo'), ing('Cebolla')],
      missingIngredients: [ing('Queso', 3000)],
      estimatedMissingCost: 3000,
    });
    expect(selectDailyRecommendation([lowCoverage, highCoverage])?.recipe.id).toBe('alta');
  });

  it('prioriza recetas dentro del presupuesto aunque otra tenga más cobertura', () => {
    const overBudget = makeRecipe({
      id: 'excede',
      availableIngredients: [ing('Arroz'), ing('Huevo'), ing('Cebolla')],
      missingIngredients: [ing('Salmón', 45000)],
      estimatedMissingCost: 45000,
      budgetRemaining: -25000,
      withinBudget: false,
    });
    const affordable = makeRecipe({
      id: 'asequible',
      availableIngredients: [ing('Arroz')],
      missingIngredients: [ing('Lenteja', 3000)],
      estimatedMissingCost: 3000,
      withinBudget: true,
    });
    expect(selectDailyRecommendation([overBudget, affordable])?.recipe.id).toBe('asequible');
  });

  it('si todas exceden el presupuesto, igual elige la más útil sin ocultar que excede', () => {
    const a = makeRecipe({ id: 'a', withinBudget: false, availableIngredients: [ing('Arroz')], missingIngredients: [ing('X', 30000)], estimatedMissingCost: 30000 });
    const b = makeRecipe({ id: 'b', withinBudget: false, availableIngredients: [ing('Arroz'), ing('Huevo')], missingIngredients: [ing('X', 30000)], estimatedMissingCost: 30000 });
    const pick = selectDailyRecommendation([a, b]);
    expect(pick?.recipe.id).toBe('b');
    expect(pick?.score.withinBudget).toBe(false);
  });

  it('desempata por ingredientes urgentes aprovechados (coincidencia exacta normalizada)', () => {
    const usesUrgent = makeRecipe({ id: 'urgente', availableIngredients: [ing('Tomate'), ing('Arroz')] });
    const noUrgent = makeRecipe({ id: 'normal', availableIngredients: [ing('Papa'), ing('Arroz')] });
    expect(selectDailyRecommendation([noUrgent, usesUrgent])?.recipe.id).toBe('normal');
    expect(
      selectDailyRecommendation([noUrgent, usesUrgent], { urgentIngredientNames: ['  TOMÁTE '] })?.recipe.id
    ).toBe('urgente');
    // Coincidencia parcial NO cuenta (sin heurísticas difusas)
    expect(
      selectDailyRecommendation([noUrgent, usesUrgent], { urgentIngredientNames: ['Tomate chonto'] })?.recipe.id
    ).toBe('normal');
  });

  it('desempata por menos faltantes y luego por menor costo de faltantes', () => {
    // Misma cobertura (50%) pero distinto número de faltantes
    const twoMissing = makeRecipe({ id: 'dos', availableIngredients: [ing('A'), ing('B')], missingIngredients: [ing('C', 500), ing('D', 500)], estimatedMissingCost: 1000 });
    const oneMissing = makeRecipe({ id: 'uno', availableIngredients: [ing('A')], missingIngredients: [ing('C', 4000)], estimatedMissingCost: 4000 });
    expect(selectDailyRecommendation([twoMissing, oneMissing])?.recipe.id).toBe('uno');

    const cheap = makeRecipe({ id: 'barata', availableIngredients: [ing('A')], missingIngredients: [ing('C', 1000)], estimatedMissingCost: 1000 });
    const pricey = makeRecipe({ id: 'cara', availableIngredients: [ing('A')], missingIngredients: [ing('C', 4000)], estimatedMissingCost: 4000 });
    expect(selectDailyRecommendation([pricey, cheap])?.recipe.id).toBe('barata');
  });

  it('desempata por más ingredientes disponibles usados cuando la cobertura es completa', () => {
    const small = makeRecipe({ id: 'pequena', availableIngredients: [ing('A')] });
    const big = makeRecipe({ id: 'grande', availableIngredients: [ing('A'), ing('B'), ing('C')] });
    expect(selectDailyRecommendation([small, big])?.recipe.id).toBe('grande');
  });

  it('en empate total respeta el orden original del backend', () => {
    const first = makeRecipe({ id: 'primera', availableIngredients: [ing('A')] });
    const second = makeRecipe({ id: 'segunda', availableIngredients: [ing('A')] });
    expect(selectDailyRecommendation([first, second])?.recipe.id).toBe('primera');
    expect(selectDailyRecommendation([second, first])?.recipe.id).toBe('segunda');
  });

  it('un costo no finito se ordena al final, sin inventar un valor', () => {
    const unknown = makeRecipe({ id: 'desconocido', availableIngredients: [ing('A')], missingIngredients: [ing('B')], estimatedMissingCost: NaN });
    const known = makeRecipe({ id: 'conocido', availableIngredients: [ing('A')], missingIngredients: [ing('B', 9000)], estimatedMissingCost: 9000 });
    expect(selectDailyRecommendation([unknown, known])?.recipe.id).toBe('conocido');
  });

  it('es determinista y no muta la entrada', () => {
    const recipes = [
      makeRecipe({ id: 'r1', availableIngredients: [ing('A')], missingIngredients: [ing('B', 2000)], estimatedMissingCost: 2000 }),
      makeRecipe({ id: 'r2', availableIngredients: [ing('A'), ing('B')], missingIngredients: [ing('C', 2000)], estimatedMissingCost: 2000 }),
      makeRecipe({ id: 'r3', availableIngredients: [ing('A'), ing('B')], missingIngredients: [ing('C', 1500)], estimatedMissingCost: 1500 }),
    ];
    const snapshot = JSON.stringify(recipes);
    const ids = Array.from({ length: 20 }, () => selectDailyRecommendation(recipes)?.recipe.id);
    expect(new Set(ids)).toEqual(new Set(['r3']));
    expect(JSON.stringify(recipes)).toBe(snapshot);
  });

  it('el comparador es antisimétrico y coherente con el selector', () => {
    const urgent = new Set<string>();
    const a = scoreRecipe(makeRecipe({ id: 'a', availableIngredients: [ing('A')] }), 0, urgent);
    const b = scoreRecipe(makeRecipe({ id: 'b', withinBudget: false, availableIngredients: [ing('A')] }), 1, urgent);
    expect(compareRecommendationScores(a, b)).toBeLessThan(0);
    expect(compareRecommendationScores(b, a)).toBeGreaterThan(0);
    expect(compareRecommendationScores(a, a)).toBe(0);
  });
});

describe('helpers', () => {
  it('normalizeIngredientName elimina tildes, mayúsculas y espacios', () => {
    expect(normalizeIngredientName('  Plátano   Maduro ')).toBe('platano maduro');
    expect(normalizeIngredientName(undefined)).toBe('');
  });

  it('hasBackendConvenienceScore solo acepta puntajes numéricos reales', () => {
    expect(hasBackendConvenienceScore(92)).toBe(true);
    expect(hasBackendConvenienceScore('92% conveniente')).toBe(true);
    expect(hasBackendConvenienceScore('Óptima')).toBe(false);
    expect(hasBackendConvenienceScore(NaN)).toBe(false);
    expect(hasBackendConvenienceScore(undefined)).toBe(false);
  });
});

describe('resolveDailyRecommendationState', () => {
  const real = makeRecipe({ id: 'real', availableIngredients: [ing('Arroz')] });
  const base: DailyRecommendationInput = {
    isPantryLoading: false,
    pantryCount: 3,
    isDemoMode: false,
    isGenerating: false,
    isStale: false,
    recipes: [real],
    error: null,
  };

  it('muestra carga mientras la despensa se hidrata', () => {
    expect(resolveDailyRecommendationState({ ...base, isPantryLoading: true }).kind).toBe('loading-pantry');
  });

  it('muestra generación en curso antes que cualquier otra información', () => {
    expect(resolveDailyRecommendationState({ ...base, isGenerating: true, isStale: true }).kind).toBe('generating');
  });

  it('despensa vacía tiene prioridad sobre recetas existentes y demo', () => {
    expect(resolveDailyRecommendationState({ ...base, pantryCount: 0 }).kind).toBe('empty-pantry');
    expect(resolveDailyRecommendationState({ ...base, pantryCount: 0, isDemoMode: true }).kind).toBe('empty-pantry');
  });

  it('modo demo nunca produce una recomendación lista, aunque haya recetas', () => {
    const state = resolveDailyRecommendationState({
      ...base,
      isDemoMode: true,
      recipes: getDemoRecipes(20000, 2),
    });
    expect(state.kind).toBe('demo');
  });

  describe('primera generación fallida (modo demo + error)', () => {
    const demoWithError: DailyRecommendationInput = {
      ...base,
      isDemoMode: true,
      recipes: getDemoRecipes(20000, 2),
      error: 'El servicio de IA no respondió.',
    };

    it('muestra el error real en lugar del estado demo genérico', () => {
      expect(resolveDailyRecommendationState(demoWithError)).toEqual({
        kind: 'error',
        message: 'El servicio de IA no respondió.',
      });
    });

    it('nunca expone recetas como lista en modo demo, aunque el arreglo contenga recetas reales', () => {
      const state = resolveDailyRecommendationState({ ...demoWithError, recipes: [real] });
      expect(state.kind).toBe('error');
      expect(resolveDailyRecommendationState({ ...demoWithError, recipes: [real], error: null }).kind).toBe('demo');
    });

    it('conserva la prioridad de carga de despensa, generación en curso y despensa vacía', () => {
      expect(resolveDailyRecommendationState({ ...demoWithError, isPantryLoading: true }).kind).toBe('loading-pantry');
      expect(resolveDailyRecommendationState({ ...demoWithError, isGenerating: true }).kind).toBe('generating');
      expect(resolveDailyRecommendationState({ ...demoWithError, pantryCount: 0 }).kind).toBe('empty-pantry');
    });

    it('sin error el modo demo se mantiene', () => {
      expect(resolveDailyRecommendationState({ ...demoWithError, error: null }).kind).toBe('demo');
      expect(resolveDailyRecommendationState({ ...demoWithError, error: '' }).kind).toBe('demo');
    });
  });

  it('error con recetas reales obsoletas mantiene el estado obsoleto (sin costos antiguos)', () => {
    expect(resolveDailyRecommendationState({ ...base, isStale: true, error: 'Fallo' }).kind).toBe('stale');
  });

  it('recetas obsoletas no se presentan como vigentes', () => {
    expect(resolveDailyRecommendationState({ ...base, isStale: true }).kind).toBe('stale');
  });

  it('error sin recetas reales muestra estado de error', () => {
    const state = resolveDailyRecommendationState({ ...base, recipes: [], error: 'Fallo de red' });
    expect(state).toEqual({ kind: 'error', message: 'Fallo de red' });
  });

  it('error de una regeneración fallida no oculta recetas vigentes', () => {
    expect(resolveDailyRecommendationState({ ...base, error: 'Fallo' }).kind).toBe('ready');
  });

  it('sin recetas reales y sin error muestra CTA de generación', () => {
    expect(resolveDailyRecommendationState({ ...base, recipes: [] }).kind).toBe('no-recipes');
  });

  it('con recetas reales vigentes devuelve la selección', () => {
    const state = resolveDailyRecommendationState(base);
    expect(state.kind).toBe('ready');
    if (state.kind === 'ready') expect(state.pick.recipe.id).toBe('real');
  });
});
