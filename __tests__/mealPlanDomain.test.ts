/**
 * Suite de pruebas unitarias para el dominio y modelos del Plan de Comidas (Fase 3C).
 * Valida:
 * 1. Validación en tiempo de ejecución de días individuales y respuesta completa del backend.
 * 2. Deduplicación inteligente de ingredientes faltantes para la sección de compras.
 * 3. Normalización del plan con identificadores únicos sin colisiones.
 * 4. Mapeo seguro de despensa al payload de solicitud respetando unidades y valores nulos.
 */

import {
  deduplicateMissingIngredients,
  mapPantryToMealPlanRequest,
  normalizeBackendMealPlan,
  validateBackendMealPlanDay,
  validateBackendMealPlanResponse,
} from '../src/types/mealPlan';
import { BackendRecipe } from '../src/types/recipe';

describe('Dominio del Plan de Comidas (mealPlanDomain)', () => {
  const createMockRecipe = (name: string, missing: Array<{ name: string; quantity: number | null; unit: string; estimatedCost?: number }>): BackendRecipe => ({
    name,
    description: `Descripción de ${name}`,
    totalMinutes: 35,
    ingredients: [{ name: 'Ingrediente 1', quantity: 100, unit: 'g' }],
    steps: ['Paso 1', 'Paso 2'],
    availableIngredients: [{ name: 'Ingrediente 1', quantity: 100, unit: 'g' }],
    missingIngredients: missing,
    estimatedMissingCost: missing.reduce((sum, item) => sum + (item.estimatedCost || 0), 0),
    budgetRemaining: 10000,
    withinBudget: true,
    convenience: 85,
    reason: `Razón de conveniencia para ${name}`,
  });

  describe('1. validateBackendMealPlanDay', () => {
    it('valida exitosamente un día estructurado según el contrato', () => {
      const validDay = {
        day: 1,
        recipe: createMockRecipe('Pollo al horno', []),
      };

      const result = validateBackendMealPlanDay(validDay, 0);
      expect(result.day).toBe(1);
      expect(result.recipe.name).toBe('Pollo al horno');
    });

    it('rechaza objetos nulos o no objetos', () => {
      expect(() => validateBackendMealPlanDay(null, 0)).toThrow(/inválido o nulo/);
      expect(() => validateBackendMealPlanDay(undefined, 0)).toThrow(/inválido o nulo/);
    });

    it('rechaza días con número fuera del rango 1..3', () => {
      expect(() =>
        validateBackendMealPlanDay({ day: 0, recipe: createMockRecipe('X', []) }, 0)
      ).toThrow(/entero entre 1 y 3/);

      expect(() =>
        validateBackendMealPlanDay({ day: 4, recipe: createMockRecipe('X', []) }, 0)
      ).toThrow(/entero entre 1 y 3/);
    });

    it('rechaza días cuya receta no cumpla con el contrato', () => {
      expect(() =>
        validateBackendMealPlanDay({ day: 1, recipe: { name: '' } }, 0)
      ).toThrow();
    });
  });

  describe('2. validateBackendMealPlanResponse', () => {
    it('valida exitosamente una respuesta completa de 3 días', () => {
      const validResponse = {
        days: [
          { day: 1, recipe: createMockRecipe('Día 1', []) },
          { day: 2, recipe: createMockRecipe('Día 2', []) },
          { day: 3, recipe: createMockRecipe('Día 3', []) },
        ],
        totalEstimatedMissingCost: 8000,
        budgetRemaining: 12000,
        withinBudget: true,
      };

      const validated = validateBackendMealPlanResponse(validResponse);
      expect(validated.days).toHaveLength(3);
      expect(validated.totalEstimatedMissingCost).toBe(8000);
      expect(validated.budgetRemaining).toBe(12000);
      expect(validated.withinBudget).toBe(true);
    });

    it('rechaza si la propiedad days no es un arreglo o no tiene longitud 3', () => {
      expect(() =>
        validateBackendMealPlanResponse({ days: [] })
      ).toThrow(/exactamente 3 días/);

      expect(() =>
        validateBackendMealPlanResponse({
          days: [
            { day: 1, recipe: createMockRecipe('Día 1', []) },
            { day: 2, recipe: createMockRecipe('Día 2', []) },
          ],
        })
      ).toThrow(/exactamente 3 días/);
    });

    it('rechaza si los días no son correlativos del 1 al 3', () => {
      expect(() =>
        validateBackendMealPlanResponse({
          days: [
            { day: 1, recipe: createMockRecipe('Día 1', []) },
            { day: 1, recipe: createMockRecipe('Día 1 bis', []) },
            { day: 3, recipe: createMockRecipe('Día 3', []) },
          ],
          totalEstimatedMissingCost: 0,
          budgetRemaining: 10000,
          withinBudget: true,
        })
      ).toThrow(/días correlativos del 1 al 3/);
    });

    it('rechaza totalEstimatedMissingCost negativo o no numérico', () => {
      expect(() =>
        validateBackendMealPlanResponse({
          days: [
            { day: 1, recipe: createMockRecipe('Día 1', []) },
            { day: 2, recipe: createMockRecipe('Día 2', []) },
            { day: 3, recipe: createMockRecipe('Día 3', []) },
          ],
          totalEstimatedMissingCost: -100,
          budgetRemaining: 10000,
          withinBudget: true,
        })
      ).toThrow(/totalEstimatedMissingCost/);
    });

    it('rechaza withinBudget no booleano', () => {
      expect(() =>
        validateBackendMealPlanResponse({
          days: [
            { day: 1, recipe: createMockRecipe('Día 1', []) },
            { day: 2, recipe: createMockRecipe('Día 2', []) },
            { day: 3, recipe: createMockRecipe('Día 3', []) },
          ],
          totalEstimatedMissingCost: 5000,
          budgetRemaining: 5000,
          withinBudget: 'yes',
        })
      ).toThrow(/withinBudget/);
    });
  });

  describe('3. deduplicateMissingIngredients', () => {
    it('deduplica alimentos repetidos entre varios días lematizando plurales y singular', () => {
      const recipes = [
        createMockRecipe('Día 1', [
          { name: 'Cebolla', quantity: 1, unit: 'unidad', estimatedCost: 1000 },
          { name: 'Tomates', quantity: 2, unit: 'unidad', estimatedCost: 1500 },
        ]),
        createMockRecipe('Día 2', [
          { name: 'cebollas', quantity: 2, unit: 'unidad', estimatedCost: 1000 },
          { name: 'Cilantro', quantity: 1, unit: 'unidad', estimatedCost: 800 },
        ]),
        createMockRecipe('Día 3', [
          { name: 'Tomate', quantity: 1, unit: 'unidad', estimatedCost: 1500 },
        ]),
      ];

      const deduplicated = deduplicateMissingIngredients(recipes);

      // Debe contener cebolla, tomate y cilantro una sola vez cada uno
      expect(deduplicated).toHaveLength(3);
      const names = deduplicated.map((i) => i.name.toLowerCase());
      expect(names.some((n) => n.includes('cebolla'))).toBe(true);
      expect(names.some((n) => n.includes('tomate'))).toBe(true);
      expect(names.some((n) => n.includes('cilantro'))).toBe(true);
    });

    it('retorna arreglo vacío si ninguna receta tiene faltantes', () => {
      const recipes = [
        createMockRecipe('Día 1', []),
        createMockRecipe('Día 2', []),
        createMockRecipe('Día 3', []),
      ];

      expect(deduplicateMissingIngredients(recipes)).toEqual([]);
    });
  });

  describe('4. normalizeBackendMealPlan', () => {
    it('normaliza la respuesta y genera identificadores únicos con prefijo de día', () => {
      const raw = {
        days: [
          { day: 1, recipe: createMockRecipe('Arroz con verduras', []) },
          { day: 2, recipe: createMockRecipe('Arroz con verduras', []) }, // Mismo nombre intencional
          { day: 3, recipe: createMockRecipe('Sopa de pasta', []) },
        ],
        totalEstimatedMissingCost: 3500.8,
        budgetRemaining: 16499.2,
        withinBudget: true,
      };

      const normalized = normalizeBackendMealPlan(raw, 3);

      expect(normalized.days).toHaveLength(3);
      expect(normalized.totalEstimatedMissingCost).toBe(3501);
      expect(normalized.budgetRemaining).toBe(16499);
      expect(normalized.withinBudget).toBe(true);

      // Verificar IDs únicos sin colisión
      const idDay1 = normalized.days[0].recipe.id;
      const idDay2 = normalized.days[1].recipe.id;
      const idDay3 = normalized.days[2].recipe.id;

      expect(idDay1).toContain('plan-dia-1');
      expect(idDay2).toContain('plan-dia-2');
      expect(idDay3).toContain('plan-dia-3');
      expect(idDay1).not.toBe(idDay2);

      // Servings correctamente propagados
      expect(normalized.days[0].recipe.servings).toBe(3);
      expect(normalized.days[1].recipe.servings).toBe(3);
      expect(normalized.days[2].recipe.servings).toBe(3);
    });
  });

  describe('5. mapPantryToMealPlanRequest', () => {
    it('mapea correctamente los ingredientes y valida presupuesto y comensales', () => {
      const pantry = [
        { name: 'Arroz', quantity: 500, unit: 'g', needsReview: false },
        { name: 'Huevos', quantity: 6, unit: 'unidad', needsReview: false },
      ];

      const payload = mapPantryToMealPlanRequest(pantry, 25000, 4, 60);

      expect(payload.pantry).toHaveLength(2);
      expect(payload.budget).toBe(25000);
      expect(payload.servings).toBe(4);
      expect(payload.maxMinutes).toBe(60);
      expect(payload.pantry[0].unit).toBe('g');
      expect(payload.pantry[1].unit).toBe('unidad');
    });

    it('mapea unidades no soportadas a desconocida con cantidad null y needsReview: true', () => {
      const pantry = [
        { name: 'Harina', quantity: 2, unit: 'taza' },
        { name: 'Sal', quantity: 1, unit: 'cucharadita' },
      ];

      const payload = mapPantryToMealPlanRequest(pantry, 10000, 2);

      expect(payload.pantry[0].unit).toBe('desconocida');
      expect(payload.pantry[0].quantity).toBeNull();
      expect(payload.pantry[0].needsReview).toBe(true);

      expect(payload.pantry[1].unit).toBe('desconocida');
      expect(payload.pantry[1].quantity).toBeNull();
      expect(payload.pantry[1].needsReview).toBe(true);
    });

    it('no inventa cantidades ausentes preservando null', () => {
      const pantry = [{ name: 'Ajo', quantity: null, unit: 'unidad' }];
      const payload = mapPantryToMealPlanRequest(pantry, 10000, 2);

      expect(payload.pantry[0].quantity).toBeNull();
      expect(payload.pantry[0].needsReview).toBe(true);
    });

    it('lanza error de validación ante presupuesto negativo o comensales fuera de 1..12', () => {
      expect(() => mapPantryToMealPlanRequest([], -500, 2)).toThrow(/presupuesto no puede ser un valor negativo/);
      expect(() => mapPantryToMealPlanRequest([], 10000, 0)).toThrow(/entre 1 y 12/);
      expect(() => mapPantryToMealPlanRequest([], 10000, 15)).toThrow(/entre 1 y 12/);
    });
  });
});
