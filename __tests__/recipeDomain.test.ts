/**
 * Pruebas unitarias para el modelo del dominio de recetas, contratos de API,
 * validaciones y adaptadores de formateo (Fase 2C).
 */
import {
  formatCopCurrency,
  formatIngredientQuantity,
  generateRecipeSlug,
  mapPantryToRecommendRequest,
  normalizeBackendRecipe,
  normalizeRecipeIngredient,
  normalizeRecipeMissingIngredient,
  validateBudgetInput,
  validateMaxMinutesInput,
  validateServingsInput,
  BackendRecipe,
} from '../src/types/recipe';
import {
  DEMO_RECIPES,
  DEMO_RECIPES_META,
  getDemoRecipeById,
  getDemoRecipes,
} from '../src/fixtures/demoRecipes';

describe('Recipe Domain Model & API Contracts (Fase 2C)', () => {
  describe('generateRecipeSlug', () => {
    it('genera un slug URL-safe a partir del nombre de la receta', () => {
      expect(generateRecipeSlug('Arroz con pollo y verduras')).toBe('arroz-con-pollo-y-verduras');
      expect(generateRecipeSlug('Sartén de verduras!')).toBe('sarten-de-verduras');
    });

    it('añade sufijo de índice cuando se especifica', () => {
      expect(generateRecipeSlug('Pollo', 0)).toBe('pollo-1');
      expect(generateRecipeSlug('Pollo', 2)).toBe('pollo-3');
    });

    it('maneja nombres vacíos o no válidos sin fallar', () => {
      expect(generateRecipeSlug('')).toBe('receta-desconocida');
      expect(generateRecipeSlug('', 1)).toBe('receta-2');
      expect(generateRecipeSlug(null as unknown as string)).toBe('receta-desconocida');
    });
  });

  describe('formatCopCurrency', () => {
    it('formatea montos en COP con separador de miles y sufijo opcional', () => {
      expect(formatCopCurrency(5800)).toBe('$5.800 COP');
      expect(formatCopCurrency(5800, false)).toBe('$5.800');
      expect(formatCopCurrency(20000)).toBe('$20.000 COP');
      expect(formatCopCurrency(0)).toBe('$0 COP');
    });

    it('maneja valores no numéricos o NaN de forma segura', () => {
      expect(formatCopCurrency(NaN)).toBe('$0 COP');
      expect(formatCopCurrency(Infinity)).toBe('$0 COP');
    });
  });

  describe('formatIngredientQuantity', () => {
    it('formatea cantidades enteras con unidad', () => {
      expect(formatIngredientQuantity(300, 'g')).toBe('300 g');
      expect(formatIngredientQuantity(2, 'unidad')).toBe('2 unidad');
      expect(formatIngredientQuantity(1, 'cda')).toBe('1 cda');
    });

    it('formatea cantidades decimales amigables', () => {
      expect(formatIngredientQuantity(0.5, 'kg')).toBe('0,5 kg');
    });

    it('NUNCA muestra una cantidad nula como cero', () => {
      const formattedNull = formatIngredientQuantity(null, 'al gusto');
      expect(formattedNull).not.toBe('0');
      expect(formattedNull).not.toBe('0 al gusto');
      expect(formattedNull).toContain('Por confirmar');

      const formattedUndefined = formatIngredientQuantity(undefined, '');
      expect(formattedUndefined).toBe('Por confirmar / Al gusto');
    });

    it('maneja unidades desconocidas o s/u adecuadamente', () => {
      expect(formatIngredientQuantity(2, 'desconocida')).toBe('2');
      expect(formatIngredientQuantity(3, 's/u')).toBe('3');
      expect(formatIngredientQuantity(null, 'desconocida')).toBe('Por confirmar / Al gusto');
    });
  });

  describe('Normalizadores de ingredientes', () => {
    it('normaliza strings planos como ingredientes con cantidad nula', () => {
      const result = normalizeRecipeIngredient('Cebolla picada');
      expect(result.name).toBe('Cebolla picada');
      expect(result.quantity).toBeNull();
      expect(result.unit).toBe('');
    });

    it('normaliza objetos de ingredientes preservando valores', () => {
      const result = normalizeRecipeIngredient({ name: 'Tomate', quantity: 2, unit: 'un' });
      expect(result.name).toBe('Tomate');
      expect(result.quantity).toBe(2);
      expect(result.unit).toBe('un');
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
      convenience: 'Óptima',
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
        convenience: '',
        reason: '',
      } as BackendRecipe;

      const client = normalizeBackendRecipe(incomplete, 3);
      expect(client.id).toBe('receta-4-4');
      expect(client.totalMinutes).toBe(30);
      expect(client.steps).toEqual([]);
    });
  });

  describe('Validaciones de entrada (Presupuesto, Comensales, Tiempo)', () => {
    it('valida presupuestos no negativos y finitos', () => {
      expect(validateBudgetInput(20000).isValid).toBe(true);
      expect(validateBudgetInput(0).isValid).toBe(true);
      expect(validateBudgetInput(' 35.000 ').isValid).toBe(true);

      expect(validateBudgetInput(-100).isValid).toBe(false);
      expect(validateBudgetInput('').isValid).toBe(false);
      expect(validateBudgetInput('abc').isValid).toBe(false);
      expect(validateBudgetInput(200000000).isValid).toBe(false);
    });

    it('valida número de comensales entre 1 y 12', () => {
      expect(validateServingsInput(1).isValid).toBe(true);
      expect(validateServingsInput(4).isValid).toBe(true);
      expect(validateServingsInput(12).isValid).toBe(true);

      expect(validateServingsInput(0).isValid).toBe(false);
      expect(validateServingsInput(13).isValid).toBe(false);
      expect(validateServingsInput(2.5).isValid).toBe(false);
      expect(validateServingsInput(null).isValid).toBe(false);
    });

    it('valida tiempo máximo entre 1 y 240 minutos', () => {
      expect(validateMaxMinutesInput(undefined).isValid).toBe(true);
      expect(validateMaxMinutesInput(30).isValid).toBe(true);
      expect(validateMaxMinutesInput(240).isValid).toBe(true);

      expect(validateMaxMinutesInput(0).isValid).toBe(false);
      expect(validateMaxMinutesInput(300).isValid).toBe(false);
      expect(validateMaxMinutesInput(25.5).isValid).toBe(false);
    });
  });

  describe('mapPantryToRecommendRequest', () => {
    it('transforma los alimentos de despensa al payload exacto del backend', () => {
      const pantry = [
        { name: 'Tomate', quantity: 2, unit: 'unidad' },
        { name: 'Pollo', quantity: 500, unit: 'g' },
      ];

      const request = mapPantryToRecommendRequest(pantry, 25000, 4, 45);

      expect(request).toEqual({
        pantry: [
          { name: 'Tomate', quantity: 2, unit: 'unidad', needsReview: false },
          { name: 'Pollo', quantity: 500, unit: 'g', needsReview: false },
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
      expect(DEMO_RECIPES_META.badgeLabel).toBe('Vista de ejemplo');
    });

    it('las recetas de demostración tienen bandera isDemoFixture activada', () => {
      DEMO_RECIPES.forEach((r) => {
        expect(r.isDemoFixture).toBe(true);
        expect(r.steps.length).toBeGreaterThan(0);
        expect(r.ingredients.length).toBeGreaterThan(0);
      });
    });

    it('escala dinámicamente el presupuesto y porciones con getDemoRecipes', () => {
      const recipes = getDemoRecipes(30000, 4);
      expect(recipes.length).toBe(3);
      recipes.forEach((r) => {
        expect(r.servings).toBe(4);
        expect(r.budgetRemaining).toBe(30000 - r.estimatedMissingCost);
      });
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
