/**
 * FoodAI - Fixture de recetas de demostración para evaluación visual (Fase 2C).
 * Inspirado en las especificaciones de Google Stitch:
 * - Pantalla 8: «Opciones Convenientes»
 * - Pantalla 9: «Detalle de Receta»
 * - Pantalla 10: «Modo Cocina»
 *
 * AVISO: Estos datos representan una simulación aislada y NO corresponden
 * a recomendaciones reales generadas por IA ni a consultas activas al backend.
 */
import { ClientRecipe } from '../types/recipe';

export const DEMO_RECIPES_META = {
  isDemonstrationData: true,
  badgeLabel: 'Vista de ejemplo',
  noticeText: 'Recetas de demostración para evaluación de interfaz y navegación. En la fase de integración se conectará con el backend real.',
};

export const DEMO_RECIPES: ClientRecipe[] = [
  {
    id: 'demo-rec-1',
    name: 'Arroz con pollo y verduras',
    description: 'Una preparación balanceada en sartén para aprovechar el pollo y vegetales de tu despensa con una compra mínima.',
    totalMinutes: 30,
    servings: 2,
    convenience: '94% conveniente',
    estimatedMissingCost: 5800,
    budgetRemaining: 14200,
    withinBudget: true,
    reason: 'Aprovecha alimentos urgentes: consume hoy el tomate, pollo y espinaca de tu despensa antes de que se dañen.',
    isDemoFixture: true,
    imageUrl: require('../../assets/images/recipe-pollo-verduras.jpg'),
    ingredients: [
      { name: 'Pollo', quantity: 300, unit: 'g' },
      { name: 'Cebolla', quantity: 1, unit: 'unidad' },
      { name: 'Zanahoria', quantity: 1, unit: 'unidad' },
      { name: 'Tomate', quantity: 2, unit: 'unidad', needsReview: true },
      { name: 'Aceite vegetal', quantity: 1, unit: 'cucharada' },
      { name: 'Sal y condimentos', quantity: null, unit: 'al gusto' },
      { name: 'Arroz', quantity: 200, unit: 'g' },
      { name: 'Pimentón rojo', quantity: 1, unit: 'unidad' },
    ],
    availableIngredients: [
      { name: 'Pollo', quantity: 300, unit: 'g' },
      { name: 'Cebolla', quantity: 1, unit: 'unidad' },
      { name: 'Zanahoria', quantity: 1, unit: 'unidad' },
      { name: 'Tomate', quantity: 2, unit: 'unidad', needsReview: true },
      { name: 'Aceite vegetal', quantity: 1, unit: 'cucharada' },
      { name: 'Sal y condimentos', quantity: null, unit: 'al gusto' },
    ],
    missingIngredients: [
      { name: 'Arroz', quantity: 200, unit: 'g', estimatedCost: 3200 },
      { name: 'Pimentón rojo', quantity: 1, unit: 'unidad', estimatedCost: 2600 },
    ],
    steps: [
      'Corta las verduras (cebolla, zanahoria, tomate y pimentón) en cubos medianos uniformes.',
      'Cocina el pollo en sartén caliente con el aceite vegetal hasta que quede bien sellado y dorado.',
      'Añade las verduras picadas y sofríe suavemente durante 5 minutos para concentrar sabores.',
      'Incorpora el arroz y el agua o caldo. Cocina a fuego medio-bajo tapado hasta reducir por completo.',
    ],
  },
  {
    id: 'demo-rec-2',
    name: 'Tortilla paisa con vegetales',
    description: 'Tortilla suave y dorada cargada de nutrientes, ideal para una cena rápida con lo que ya tienes en casa.',
    totalMinutes: 20,
    servings: 2,
    convenience: '88% conveniente',
    estimatedMissingCost: 2200,
    budgetRemaining: 17800,
    withinBudget: true,
    reason: 'Ya tienes casi todo: aprovechas huevos y tomate frescos de tu despensa y requieres una compra mínima.',
    isDemoFixture: true,
    ingredients: [
      { name: 'Huevos', quantity: 3, unit: 'unidad' },
      { name: 'Tomate', quantity: 1, unit: 'unidad' },
      { name: 'Cebolla', quantity: 1, unit: 'unidad' },
      { name: 'Sal', quantity: null, unit: 'al gusto' },
      { name: 'Queso campesino', quantity: 100, unit: 'g' },
    ],
    availableIngredients: [
      { name: 'Huevos', quantity: 3, unit: 'unidad' },
      { name: 'Tomate', quantity: 1, unit: 'unidad' },
      { name: 'Cebolla', quantity: 1, unit: 'unidad' },
      { name: 'Sal', quantity: null, unit: 'al gusto' },
    ],
    missingIngredients: [
      { name: 'Queso campesino', quantity: 100, unit: 'g', estimatedCost: 2200 },
    ],
    steps: [
      'Bate los huevos con una pizca de sal en un tazón hondo hasta integrar bien.',
      'Pica finamente la cebolla y el tomate en trozos pequeños homogéneos.',
      'Sofríe los vegetales en una sartén con una gota de aceite por 3 minutos.',
      'Vierte los huevos batidos, añade los cubos de queso campesino y cocina a fuego bajo con tapa por 5 minutos.',
    ],
  },
  {
    id: 'demo-rec-3',
    name: 'Sartén de verduras con arroz',
    description: 'Salteado ligero y crujiente de zanahoria, cebolla y arroz, con toques frescos de cilantro.',
    totalMinutes: 25,
    servings: 2,
    convenience: '82% conveniente',
    estimatedMissingCost: 1500,
    budgetRemaining: 18500,
    withinBudget: true,
    reason: 'Compra mínima: excelente opción de ahorro para aprovechar sobrantes de arroz y vegetales disponibles.',
    isDemoFixture: true,
    ingredients: [
      { name: 'Arroz cocido', quantity: 2, unit: 'taza' },
      { name: 'Zanahoria', quantity: 1, unit: 'unidad' },
      { name: 'Cebolla', quantity: 1, unit: 'unidad' },
      { name: 'Aceite vegetal', quantity: 1, unit: 'cucharada' },
      { name: 'Sal y pimienta', quantity: null, unit: 'al gusto' },
      { name: 'Cilantro fresco', quantity: 1, unit: 'unidad' },
    ],
    availableIngredients: [
      { name: 'Arroz cocido', quantity: 2, unit: 'taza' },
      { name: 'Zanahoria', quantity: 1, unit: 'unidad' },
      { name: 'Cebolla', quantity: 1, unit: 'unidad' },
      { name: 'Aceite vegetal', quantity: 1, unit: 'cucharada' },
      { name: 'Sal y pimienta', quantity: null, unit: 'al gusto' },
    ],
    missingIngredients: [
      { name: 'Cilantro fresco', quantity: 1, unit: 'unidad', estimatedCost: 1500 },
    ],
    steps: [
      'Corta la zanahoria y la cebolla en tiras delgadas (julianas uniformes).',
      'Saltea las verduras en un wok o sartén amplio a fuego alto por 4 minutos manteniendo su textura crujiente.',
      'Agrega el arroz cocido e integra todo suavemente con movimientos envolventes.',
      'Termina con cilantro fresco finamente picado, ajusta sal y retira de inmediato del fuego.',
    ],
  },
];

/**
 * Retorna las recetas de demostración adaptadas dinámicamente al presupuesto y porciones actuales.
 */
export function getDemoRecipes(currentBudget?: number, currentServings?: number): ClientRecipe[] {
  const budget = typeof currentBudget === 'number' && currentBudget >= 0 ? currentBudget : 20000;
  const servings = typeof currentServings === 'number' && currentServings > 0 ? currentServings : 2;

  return DEMO_RECIPES.map((recipe) => {
    // Escalar porciones proporcionalmente si difieren del base (2)
    const factor = servings / 2;
    const scaledMissingCost = Math.round(recipe.estimatedMissingCost * factor);
    const budgetRemaining = Math.round(budget - scaledMissingCost);
    const withinBudget = budgetRemaining >= 0;

    return {
      ...recipe,
      servings,
      estimatedMissingCost: scaledMissingCost,
      budgetRemaining,
      withinBudget,
    };
  });
}

/**
 * Busca una receta de demostración por su identificador único (ID o slug).
 */
export function getDemoRecipeById(
  idOrSlug: string,
  currentBudget?: number,
  currentServings?: number
): ClientRecipe | undefined {
  if (!idOrSlug) return undefined;
  const cleanQuery = idOrSlug.trim().toLowerCase();

  const all = getDemoRecipes(currentBudget, currentServings);
  return all.find((r) => {
    if (r.id.toLowerCase() === cleanQuery) return true;
    const slug = r.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug === cleanQuery;
  });
}
