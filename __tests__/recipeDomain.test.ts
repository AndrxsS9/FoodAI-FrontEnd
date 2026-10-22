/**
 * Pruebas unitarias para los modelos, validadores y formateadores del dominio de recetas (Fase 2C).
 * Cubre compatibilidad con el backend Zod, mapeo estricto de unidades culinarias,
 * formateo monetario en COP (incluyendo negativos), consistencia de escalado de porciones
 * y resiliencia de normalización.
 */
import {
  BACKEND_PANTRY_UNITS,
  BackendRecipe,
  formatCopCurrency,
  formatIngredientQuantity,
  generateRecipeSlug,
  mapFrontendPantryItemToBackend,
  mapPantryToRecommendRequest,
  normalizeBackendRecipe,
  normalizeRecipeIngredient,
  normalizeRecipeMissingIngredient,
  validateBudgetInput,
  validateMaxMinutesInput,
  validateServingsInput,
} from '../src/types/recipe';
import {
  DEMO_RECIPES,
  DEMO_RECIPES_META,
  getDemoRecipeById,
  getDemoRecipes,
} from '../src/fixtures/demoRecipes';
import { INGREDIENT_UNITS, IngredientUnit } from '../src/types/pantry';

describe('Recipe Domain & Backend Alignment (Fase 2C)', () => {
  describe('Validadores de entrada', () => {
    it('valida montos de presupuesto en rango permitido (0 a 100M COP)', () => {
      expect(validateBudgetInput(20000).isValid).toBe(true);
      expect(validateBudgetInput(0).isValid).toBe(true);
      expect(validateBudgetInput('50.000').isValid).toBe(true);
      expect(validateBudgetInput(-1).isValid).toBe(false);
      expect(validateBudgetInput(-1).error).toBe('El presupuesto no puede ser un valor negativo.');
      expect(validateBudgetInput(100000001).isValid).toBe(false);
      expect(validateBudgetInput('invalido').isValid).toBe(false);
      expect(validateBudgetInput('').isValid).toBe(false);
    });

    it('valida número de comensales (1 a 12)', () => {
      expect(validateServingsInput(1).isValid).toBe(true);
      expect(validateServingsInput(12).isValid).toBe(true);
      expect(validateServingsInput(4).isValid).toBe(true);
      expect(validateServingsInput(0).isValid).toBe(false);
      expect(validateServingsInput(13).isValid).toBe(false);
      expect(validateServingsInput(2.5).isValid).toBe(false);
      expect(validateServingsInput('').isValid).toBe(false);
    });

    it('valida tiempo máximo de preparación (opcional, 1 a 240 minutos)', () => {
      expect(validateMaxMinutesInput(undefined).isValid).toBe(true);
      expect(validateMaxMinutesInput(null).isValid).toBe(true);
      expect(validateMaxMinutesInput('').isValid).toBe(true);
      expect(validateMaxMinutesInput(30).isValid).toBe(true);
      expect(validateMaxMinutesInput(240).isValid).toBe(true);
      expect(validateMaxMinutesInput(0).isValid).toBe(false);
      expect(validateMaxMinutesInput(250).isValid).toBe(false);
      expect(validateMaxMinutesInput(15.5).isValid).toBe(false);
    });
  });

  describe('Formateadores de moneda y cantidades', () => {
    it('formatea moneda COP estándar y con sufijo', () => {
      expect(formatCopCurrency(20000)).toBe('$20.000 COP');
      expect(formatCopCurrency(5800, false)).toBe('$5.800');
      expect(formatCopCurrency(0)).toBe('$0 COP');
      expect(formatCopCurrency(NaN)).toBe('$0 COP');
    });

    it('formatea valores negativos de presupuesto restante de forma explícita y precisa', () => {
      expect(formatCopCurrency(-5800)).toBe('-$5.800 COP');
      expect(formatCopCurrency(-1500, false)).toBe('-$1.500');
    });

    it('formatea cantidades enteras y decimales', () => {
      expect(formatIngredientQuantity(2, 'unidad')).toBe('2 unidad');
      expect(formatIngredientQuantity(500, 'g')).toBe('500 g');
      expect(formatIngredientQuantity(1.5, 'kg')).toBe('1,5 kg');
    });

    it('preserva cantidades nulas o indefinidas sin mostrar jamás 0', () => {
      expect(formatIngredientQuantity(null, 'cucharada')).toBe('Por confirmar (cucharada)');
      expect(formatIngredientQuantity(undefined, 'taza')).toBe('Por confirmar (taza)');
      expect(formatIngredientQuantity(null, 'desconocida')).toBe('Por confirmar / Al gusto');
      expect(formatIngredientQuantity(null)).toBe('Por confirmar / Al gusto');
    });

    it('formatea cantidades menores o iguales a cero como "Al gusto"', () => {
      expect(formatIngredientQuantity(0, 'pizca')).toBe('Al gusto');
      expect(formatIngredientQuantity(-5)).toBe('Al gusto');
    });
  });

  describe('Generación de slugs para Expo Router', () => {
    it('convierte nombres con tildes y caracteres especiales en slugs seguros', () => {
      expect(generateRecipeSlug('Arroz con Pollo & Verduras')).toBe('arroz-con-pollo-verduras');
      expect(generateRecipeSlug('Sartén de Champiñones')).toBe('sarten-de-champinones');
      expect(generateRecipeSlug('¡Tortilla Paisa!')).toBe('tortilla-paisa');
    });

    it('añade sufijo de índice cuando se especifica para evitar colisiones entre duplicados', () => {
      expect(generateRecipeSlug('Arroz con Pollo', 0)).toBe('arroz-con-pollo-1');
      expect(generateRecipeSlug('Arroz con Pollo', 1)).toBe('arroz-con-pollo-2');
    });

    it('maneja nombres vacíos o inválidos con identificadores de respaldo', () => {
      expect(generateRecipeSlug('', 0)).toBe('receta-1');
      expect(generateRecipeSlug('')).toBe('receta-desconocida');
    });
  });

  describe('Normalización de ingredientes', () => {
    it('normaliza strings planos a objetos RecipeIngredient seguros', () => {
      const result = normalizeRecipeIngredient('Sal al gusto');
      expect(result.name).toBe('Sal al gusto');
      expect(result.quantity).toBeNull();
      expect(result.unit).toBe('');
    });

    it('normaliza objetos BackendRecipeIngredient preservando cantidades válidas', () => {
      const result = normalizeRecipeIngredient({
        name: 'Pollo',
        quantity: 300,
        unit: 'g',
      });
      expect(result.name).toBe('Pollo');
      expect(result.quantity).toBe(300);
      expect(result.unit).toBe('g');
    });

    it('normaliza ingredientes faltantes con costo estimado', () => {
      const result = normalizeRecipeMissingIngredient({
        name: 'Arroz',
        quantity: 200,
        unit: 'g',
        estimatedCost: 3200,
      });
      expect(result.name).toBe('Arroz');
      expect(result.quantity).toBe(200);
      expect(result.estimatedCost).toBe(3200);
    });
  });

  describe('normalizeBackendRecipe', () => {
    const sampleBackendRecipe: BackendRecipe = {
      name: 'Pollo salteado',
      description: 'Salteado rápido de pollo',
      totalMinutes: 25,
      ingredients: [
        { name: 'Pollo', quantity: 300, unit: 'g' },
        { name: 'Cebolla', quantity: 1, unit: 'unidad' },
      ],
      steps: ['Cortar el pollo', 'Cocinar en sartén'],
      availableIngredients: [{ name: 'Pollo', quantity: 300, unit: 'g' }],
      missingIngredients: [{ name: 'Cebolla', quantity: 1, unit: 'unidad', estimatedCost: 1000 }],
      estimatedMissingCost: 1000,
      budgetRemaining: 19000,
      withinBudget: true,
      convenience: 92,
      reason: 'Aprovecha tu despensa',
    };

    it('convierte un BackendRecipe a un ClientRecipe consistente', () => {
      const client = normalizeBackendRecipe(sampleBackendRecipe, 0, 2);
      expect(client.id).toBe('pollo-salteado-1');
      expect(client.name).toBe('Pollo salteado');
      expect(client.servings).toBe(2);
      expect(client.totalMinutes).toBe(25);
      expect(client.availableIngredients.length).toBe(1);
      expect(client.missingIngredients.length).toBe(1);
      expect(client.convenience).toBe('92% conveniente');
      expect(client.isDemoFixture).toBe(false);
    });

    it('asigna valores por defecto seguros ante campos incompletos', () => {
      const incomplete = {
        name: '',
        description: '',
        totalMinutes: 0,
        ingredients: [],
        steps: [],
        availableIngredients: [],
        missingIngredients: [],
        estimatedMissingCost: 0,
        budgetRemaining: 0,
        withinBudget: true,
        convenience: 0,
        reason: '',
      } as BackendRecipe;

      const client = normalizeBackendRecipe(incomplete, 3);
      expect(client.id).toBe('receta-4-4');
      expect(client.totalMinutes).toBe(30);
      expect(client.steps).toEqual([]);
    });
  });

  describe('Mapeo de Unidades y Compatibilidad Estricta de Backend (Zod)', () => {
    it('todas las unidades soportadas en el frontend producen un ítem compatible con el backend', () => {
      const allUnits: IngredientUnit[] = [...INGREDIENT_UNITS];

      allUnits.forEach((unit) => {
        const mapped = mapFrontendPantryItemToBackend({
          name: 'Alimento de prueba',
          quantity: 2,
          unit,
        });

        // 1. La unidad mapeada debe estar en la lista permitida por el backend Zod
        expect(BACKEND_PANTRY_UNITS).toContain(mapped.unit);

        // 2. needsReview siempre debe ser booleano obligatorio
        expect(typeof mapped.needsReview).toBe('boolean');

        // 3. Unidades culinarias no convertibles directamente ('taza', 'cucharada', 'cucharadita')
        // jamás deben asumirse como 'unidad' ni inventar cantidades arbitrarias
        if (unit === 'taza' || unit === 'cucharada' || unit === 'cucharadita') {
          expect(mapped.unit).toBe('desconocida');
          expect(mapped.quantity).toBeNull();
          expect(mapped.needsReview).toBe(true);
        } else if (unit === 'desconocida') {
          expect(mapped.unit).toBe('desconocida');
          expect(mapped.quantity).toBeNull();
          expect(mapped.needsReview).toBe(true);
        } else {
          // Unidades directas compatibles ('unidad', 'g', 'kg', 'ml', 'l')
          expect(mapped.unit).toBe(unit);
          expect(mapped.quantity).toBe(2);
          expect(mapped.needsReview).toBe(false);
        }
      });
    });

    it('transforma los alimentos de despensa al payload exacto del backend con needsReview obligatorio', () => {
      const pantry = [
        { name: 'Tomate', quantity: 2, unit: 'unidad' },
        { name: 'Pollo', quantity: 500, unit: 'g' },
        { name: 'Harina', quantity: 1, unit: 'taza' },
      ];

      const request = mapPantryToRecommendRequest(pantry, 25000, 4, 45);

      expect(request).toEqual({
        pantry: [
          { name: 'Tomate', quantity: 2, unit: 'unidad', needsReview: false },
          { name: 'Pollo', quantity: 500, unit: 'g', needsReview: false },
          { name: 'Harina', quantity: null, unit: 'desconocida', needsReview: true },
        ],
        budget: 25000,
        servings: 4,
        maxMinutes: 45,
      });
    });

    it('lanza excepción con mensaje amigable si el presupuesto es inválido', () => {
      expect(() => {
        mapPantryToRecommendRequest([], -50, 2);
      }).toThrow('El presupuesto no puede ser un valor negativo.');
    });

    it('lanza excepción si el número de porciones excede el rango', () => {
      expect(() => {
        mapPantryToRecommendRequest([], 20000, 15);
      }).toThrow('El número de personas debe estar entre 1 y 12.');
    });
  });

  describe('Fixture de Demostración (demoRecipes)', () => {
    it('contiene metadatos explícitos de evaluación visual', () => {
      expect(DEMO_RECIPES_META.isDemonstrationData).toBe(true);
      expect(DEMO_RECIPES_META.badgeLabel).toBe('Datos de demostración');
    });

    it('las recetas de demostración tienen bandera isDemoFixture activada', () => {
      DEMO_RECIPES.forEach((r) => {
        expect(r.isDemoFixture).toBe(true);
        expect(r.steps.length).toBeGreaterThan(0);
        expect(r.ingredients.length).toBeGreaterThan(0);
      });
    });

    it('escala consistentemente tanto los costos como las cantidades de ingredientes según las porciones', () => {
      // Receta base: 2 porciones -> Pollo: 300g, estimatedMissingCost: 5800
      const baseRecipes = getDemoRecipes(20000, 2);
      const recipe2 = baseRecipes[0];
      const pollo2 = recipe2.ingredients.find((i) => i.name === 'Pollo');
      expect(pollo2?.quantity).toBe(300);
      expect(recipe2.estimatedMissingCost).toBe(5800);

      // 4 porciones (factor 2) -> Pollo debe ser 600g, missingCost debe ser 11600
      const scaledRecipes = getDemoRecipes(20000, 4);
      const recipe4 = scaledRecipes[0];
      const pollo4 = recipe4.ingredients.find((i) => i.name === 'Pollo');
      expect(pollo4?.quantity).toBe(600);
      expect(recipe4.estimatedMissingCost).toBe(11600);
      expect(recipe4.budgetRemaining).toBe(20000 - 11600);
    });

    it('maneja presupuesto cero e insuficiente marcando withinBudget = false y presupuesto restante negativo', () => {
      // Presupuesto 1000 con costo faltante 5800
      const recipes = getDemoRecipes(1000, 2);
      const recipe = recipes[0];
      expect(recipe.withinBudget).toBe(false);
      expect(recipe.budgetRemaining).toBe(-4800);
      expect(formatCopCurrency(recipe.budgetRemaining)).toBe('-$4.800 COP');
    });

    it('encuentra recetas por ID o por slug con getDemoRecipeById', () => {
      const byId = getDemoRecipeById('demo-rec-1');
      expect(byId).toBeDefined();
      expect(byId?.name).toBe('Arroz con pollo y verduras');

      const bySlug = getDemoRecipeById('tortilla-paisa-con-vegetales');
      expect(bySlug).toBeDefined();
      expect(bySlug?.id).toBe('demo-rec-2');

      const nonExistent = getDemoRecipeById('receta-inexistente-xyz');
      expect(nonExistent).toBeUndefined();
    });
  });
});
