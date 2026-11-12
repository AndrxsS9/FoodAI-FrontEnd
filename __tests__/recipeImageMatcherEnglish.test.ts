/**
 * Cierre MVP - Imágenes de referencia para recetas generadas en inglés.
 *
 * Causa raíz: resolveRecipeImageKey() solo reconocía el núcleo del plato al INICIO del
 * nombre (estructura española "Sopa de…"). Los nombres en inglés llevan el núcleo al
 * FINAL ("Vegetable soup"), así que la clave quedaba en null y la UI mostraba el
 * respaldo neutro. Estas pruebas cubren el matcher bilingüe y su integración con
 * normalizeBackendRecipe, getRecipeImageSource, planes de 3 días y recetas restauradas.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { resolveRecipeImageKey } from '../src/utils/recipeImageMatcher';
import {
  RECIPE_IMAGE_APPROVALS,
  RECIPE_IMAGE_ASSET_RECORDS,
  RECIPE_IMAGE_CATALOG,
  REMOTE_RECIPE_IMAGES_ENABLED,
  buildRecipeImageCatalog,
  buildRecipeImagePreviewCatalog,
  getRecipeImageSource,
} from '../src/utils/recipeImageCatalog';
import { RECIPE_IMAGE_CATEGORY_LABELS, RECIPE_IMAGE_KEYS, RecipeImageKey } from '../src/types/recipeImage';
import { BackendRecipe, ClientRecipe, normalizeBackendRecipe } from '../src/types/recipe';
import { normalizeBackendMealPlan } from '../src/types/mealPlan';
import { AsyncStorageMealPlanAdapter } from '../src/services/storage/mealPlanStorage';

const ing = (...names: string[]) => names.map((name) => ({ name }));
const key = (name: string, ingredients: { name: string }[] = []) => resolveRecipeImageKey({ name, ingredients });

const recordOf = (k: RecipeImageKey) => RECIPE_IMAGE_ASSET_RECORDS.find((r) => r.key === k)!;
/** Catálogo de preview interno (16 imágenes verificadas, sin aprobaciones fabricadas). */
const previewCatalog = buildRecipeImagePreviewCatalog(RECIPE_IMAGE_ASSET_RECORDS);

const backendRecipe = (name: string, ingredients: string[] = []): BackendRecipe => ({
  name,
  description: 'Generated',
  totalMinutes: 20,
  ingredients: ingredients.map((n) => ({ name: n, quantity: 1, unit: 'unidad' })),
  steps: ['Step'],
  availableIngredients: [],
  missingIngredients: [],
  estimatedMissingCost: 0,
  budgetRemaining: 1000,
  withinBudget: true,
  convenience: 80,
  reason: 'Reason',
});

/** Ejemplos exigidos por el reporte del defecto (uno o más por categoría). */
const REQUIRED_ENGLISH: [string, RecipeImageKey][] = [
  ['Vegetable soup', 'soup'],
  ['Chicken soup', 'soup'],
  ['Cream of mushroom soup', 'cream-soup'],
  ['Fresh garden salad', 'salad'],
  ['Chicken and rice', 'rice-dish'],
  ['Fried rice', 'rice-dish'],
  ['Pasta with tomato sauce', 'pasta'],
  ['Scrambled eggs', 'eggs'],
  ['Baked chicken', 'chicken'],
  ['Grilled chicken', 'chicken'],
  ['Beef stew', 'beef-stew'],
  ['Grilled fish', 'fish'],
  ['Lentil stew', 'legumes'],
  ['Arepa with cheese', 'arepa'],
  ['Chicken sandwich', 'sandwich'],
  ['Baked potatoes', 'potatoes'],
  ['Stir-fried vegetables', 'sauteed-vegetables'],
  ['Caramel flan', 'dessert'],
  ['Strawberry smoothie', 'beverage'],
];

describe('Matcher en inglés — ejemplos exigidos', () => {
  it.each(REQUIRED_ENGLISH)('"%s" → %s', (name, expected) => {
    expect(key(name)).toBe(expected);
  });

  it('cubre las 16 categorías del catálogo con nombres en inglés', () => {
    const covered = new Set(REQUIRED_ENGLISH.map(([, k]) => k));
    expect(RECIPE_IMAGE_KEYS).toHaveLength(16);
    for (const k of RECIPE_IMAGE_KEYS) expect(covered.has(k)).toBe(true);
  });
});

describe('Matcher en inglés — variantes naturales por categoría', () => {
  const cases: [string, RecipeImageKey][] = [
    ['Homemade tomato soup', 'soup'],
    ['Chicken noodle soup', 'soup'],
    ['Chicken and vegetable soup', 'soup'],
    ['Lentil soup with spinach', 'soup'],
    ['Colombian ajiaco', 'soup'],
    ['Creamy pumpkin soup', 'cream-soup'],
    ['Cream of mushroom', 'cream-soup'],
    ['Pumpkin bisque', 'cream-soup'],
    ['Tuna salad', 'salad'],
    ['Cucumber and tomato salad', 'salad'],
    ['Mexican rice', 'rice-dish'],
    ['Rice with chicken and vegetables', 'rice-dish'],
    ['Creamy chicken pasta', 'pasta'],
    ['Spaghetti with meatballs', 'pasta'],
    ['Mac and cheese', 'pasta'],
    ['Egg noodles', 'pasta'],
    ['Fried eggs', 'eggs'],
    ['Spinach omelette', 'eggs'],
    ['Eggs on toast', 'eggs'],
    ['Lemon garlic chicken', 'chicken'],
    ['Grilled chicken with rice', 'chicken'],
    ['Chicken breast', 'chicken'],
    ['Baked chicken thighs', 'chicken'],
    ['Chicken in tomato sauce', 'chicken'],
    ['Hearty beef and potato stew', 'beef-stew'],
    ['Braised beef', 'beef-stew'],
    ['Chicken stew', 'chicken'],
    ['Baked salmon', 'fish'],
    ['Pan-seared tilapia', 'fish'],
    ['Salmon fillet', 'fish'],
    ['Fish stew', 'fish'],
    ['Black beans', 'legumes'],
    ['Refried beans', 'legumes'],
    ['Chickpea and potato stew', 'legumes'],
    ['Cheese arepas', 'arepa'],
    ['Grilled cheese sandwich', 'sandwich'],
    ['Tuna sandwiches', 'sandwich'],
    ['Mashed potatoes', 'potatoes'],
    ['Roasted sweet potatoes', 'potatoes'],
    ['Potato wedges', 'potatoes'],
    ['French fries', 'potatoes'],
    ['Sautéed vegetables', 'sauteed-vegetables'],
    ['Vegetable stir fry', 'sauteed-vegetables'],
    ['Chocolate mousse', 'dessert'],
    ['Rice pudding', 'dessert'],
    ['Vanilla ice cream', 'dessert'],
    ['Chocolate cake', 'dessert'],
    ['Apple pie', 'dessert'],
    ['Banana smoothie', 'beverage'],
    ['Fresh orange juice', 'beverage'],
    ['Hot chocolate', 'beverage'],
    ['Lemonade', 'beverage'],
  ];

  it.each(cases)('"%s" → %s', (name, expected) => {
    expect(key(name)).toBe(expected);
  });

  it('admite prefijos de preparación y artículos/relleno al inicio o al final', () => {
    expect(key('A simple vegetable soup')).toBe('soup');
    expect(key('The best grilled chicken')).toBe('chicken');
    expect(key('Easy baked potatoes')).toBe('potatoes');
    expect(key('Lentil stew recipe')).toBe('legumes');
    expect(key('Vegetable soup (vegan)')).toBe('soup');
    expect(key('STIR-FRIED VEGETABLES')).toBe('sauteed-vegetables');
  });
});

describe('Matcher en inglés — evita imágenes engañosas', () => {
  it('casos negativos exigidos', () => {
    expect(key('Fruit salad')).not.toBe('salad');
    expect(key('Fruit salad')).toBeNull();
    expect(key('Rice pudding')).not.toBe('rice-dish');
    expect(key('Chicken soup')).not.toBe('chicken');
    expect(key('Chocolate cream')).not.toBe('soup');
    expect(key('Chocolate cream')).not.toBe('cream-soup');
    expect(key('Chocolate cream')).toBeNull();
    expect(key('Grilled beef')).not.toBe('beef-stew');
    expect(key('Grilled beef')).toBeNull();
    expect(key('Salmon mousse')).not.toBe('dessert');
    expect(key('Salmon mousse')).toBeNull();
    expect(key('Chicken smoothie')).not.toBe('beverage');
    expect(key('Chicken smoothie')).toBeNull();
  });

  it.each([
    'Tropical fruit salad',
    'Strawberry spinach salad',
    'Sweet coconut rice',
    'Rice with milk',
    'Chocolate eggs',
    'Green beans',
    'Jelly beans',
    'Roasted vegetables',
    'Beef stir fry',
    'Crab cakes',
    'Fish cakes',
    'Chicken pot pie',
    'Yorkshire pudding',
    'Strawberry soup',
    'Cream of wheat',
    'Ice cream sandwich',
    'Zucchini fries',
    'Vegetable stew',
    'Beef steak',
    'Pork chops',
  ])('"%s" → null', (name) => {
    expect(key(name)).toBeNull();
  });

  it('un ingrediente fuera del núcleo no decide la categoría', () => {
    expect(key('Fish tacos')).toBeNull();
    expect(key('Salmon burger')).toBeNull();
    expect(key('Tilapia tacos')).toBeNull();
    expect(key('Chicken curry')).toBeNull();
    expect(key('Chicken burrito bowl')).toBeNull();
    expect(key('Potato chips')).toBeNull();
    expect(key('Shrimp with rice')).toBeNull();
    expect(key('Orange juice chicken')).toBe('chicken');
    expect(key('Potato salad')).toBe('salad');
    expect(key('Tomato soup with grilled cheese')).toBe('soup');
  });

  it('arroz con ingredientes dulces y leche (en inglés) no recibe imagen de arroz salado', () => {
    expect(key('Baked rice', ing('Rice', 'Milk', 'Sugar', 'Cinnamon'))).toBeNull();
    expect(key('Creamy rice', ing('Rice', 'Milk', 'Chicken'))).toBe('rice-dish');
  });

  it('platos desconocidos en inglés quedan con el respaldo neutro', () => {
    for (const name of ['Shepherd special', 'Chef surprise', 'Leftover remix', 'Recipe 1', 'Quinoa power']) {
      expect(key(name)).toBeNull();
    }
  });
});

describe('Regresión en español (sin cambios de comportamiento)', () => {
  const cases: [string, RecipeImageKey | null][] = [
    ['Sopa de lentejas', 'soup'],
    ['Sopa de pasta', 'soup'],
    ['Crema de ahuyama', 'cream-soup'],
    ['Ensalada de pasta', 'salad'],
    ['Arroz con pollo', 'rice-dish'],
    ['Pasta con tomate', 'pasta'],
    ['Huevos pericos', 'eggs'],
    ['Pollo al horno', 'chicken'],
    ['Pollo al curry', 'chicken'],
    ['Carne guisada', 'beef-stew'],
    ['Tilapia al horno', 'fish'],
    ['Lentejas guisadas', 'legumes'],
    ['Arepa con queso', 'arepa'],
    ['Sándwich de pollo', 'sandwich'],
    ['Papas al horno', 'potatoes'],
    ['Verduras salteadas', 'sauteed-vegetables'],
    ['Flan de caramelo', 'dessert'],
    ['Jugo de mora', 'beverage'],
    ['Natilla', 'dessert'],
    ['Arroz con leche', 'dessert'],
    ['Ensalada de frutas', null],
    ['Crema de chocolate', null],
    ['Mousse de salmón', null],
    ['Batido de pollo', null],
    ['Salteado de carne', null],
    ['Hamburguesa de salmón', null],
    ['Tacos de tilapia', null],
    ['Wrap con salmón', null],
    ['Pastel de pollo', null],
    ['Plato especial del chef', null],
  ];

  it.each(cases)('"%s" → %s', (name, expected) => {
    expect(key(name)).toBe(expected);
  });

  it('las verificaciones por ingredientes siguen igual', () => {
    expect(key('Tortilla de papa', ing('Papa', 'Huevo'))).toBe('eggs');
    expect(key('Tortillas de maíz con frijoles', ing('Harina de maíz', 'Frijoles'))).toBeNull();
    expect(key('Arroz de coco', ing('Arroz', 'Leche', 'Azúcar'))).toBeNull();
    expect(key('Arroz cremoso con pollo', ing('Arroz', 'Pollo', 'Leche'))).toBe('rice-dish');
  });
});

describe('Integración: normalizeBackendRecipe + getRecipeImageSource', () => {
  it.each(REQUIRED_ENGLISH)('receta generada en inglés "%s" muestra la imagen de referencia %s', (name, expected) => {
    const recipe = normalizeBackendRecipe(backendRecipe(name), 0, 2, 'gen-en');
    expect(recipe.imageKey).toBe(expected);
    expect(recipe.name).toBe(name); // no se traduce ni se reescribe

    const image = getRecipeImageSource(recipe, previewCatalog);
    expect(image.kind).toBe('reference');
    expect(image.imageKey).toBe(expected);
    expect(image.source).toBe(recordOf(expected).source);
    expect(image.referenceLabel).toBe(RECIPE_IMAGE_CATEGORY_LABELS[expected]);
  });

  it('una receta generada en español conserva su imagen', () => {
    const recipe = normalizeBackendRecipe(backendRecipe('Sopa de lentejas', ['Lentejas']), 0, 2, 'gen-es');
    expect(recipe.imageKey).toBe('soup');
    expect(getRecipeImageSource(recipe, previewCatalog).kind).toBe('reference');
  });

  it('una receta en inglés ambigua usa el respaldo neutro', () => {
    const recipe = normalizeBackendRecipe(backendRecipe('Fruit salad', ['Apple', 'Banana']), 0, 2, 'gen-en');
    expect(recipe.imageKey).toBeNull();
    expect(getRecipeImageSource(recipe, previewCatalog)).toEqual({
      kind: 'none',
      source: null,
      imageKey: null,
      referenceLabel: null,
    });
  });
});

describe('Recetas restauradas y persistidas', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('receta restaurada en inglés con imageKey = null obtiene la clave derivada del nombre', () => {
    const restored: ClientRecipe = { ...normalizeBackendRecipe(backendRecipe('Grilled chicken'), 0, 2, 'g'), imageKey: null };
    const image = getRecipeImageSource(restored, previewCatalog);
    expect(image.kind).toBe('reference');
    expect(image.imageKey).toBe('chicken');
  });

  it('receta restaurada en inglés sin imageKey (datos antiguos) obtiene la clave derivada', () => {
    const restored = { ...normalizeBackendRecipe(backendRecipe('Beef stew'), 0, 2, 'g') } as Partial<ClientRecipe>;
    delete restored.imageKey;
    expect(getRecipeImageSource(restored as ClientRecipe, previewCatalog).imageKey).toBe('beef-stew');
  });

  it('una imageKey persistida válida se respeta sobre el nombre', () => {
    const persisted: ClientRecipe = {
      ...normalizeBackendRecipe(backendRecipe('Chef surprise'), 0, 2, 'g'),
      imageKey: 'pasta',
    };
    const image = getRecipeImageSource(persisted, previewCatalog);
    expect(image.kind).toBe('reference');
    expect(image.imageKey).toBe('pasta');
  });

  it('un plan de 3 días en inglés resuelve, persiste y restaura las mismas imágenes', async () => {
    const plan = normalizeBackendMealPlan(
      {
        days: [
          { day: 1, recipe: backendRecipe('Vegetable soup', ['Carrot', 'Potato']) },
          { day: 2, recipe: backendRecipe('Grilled chicken with rice', ['Chicken', 'Rice']) },
          { day: 3, recipe: backendRecipe('Fruit salad', ['Apple']) },
        ],
        totalEstimatedMissingCost: 0,
        budgetRemaining: 1000,
        withinBudget: true,
      },
      2,
      { planId: 'plan-en', generatedAt: '2026-11-10T00:00:00.000Z' }
    );
    expect(plan.days.map((d) => d.recipe.imageKey)).toEqual(['soup', 'chicken', null]);
    expect(plan.days.map((d) => d.recipe.id)).toEqual([
      'plan-dia-1-vegetable-soup-1',
      'plan-dia-2-grilled-chicken-with-rice-2',
      'plan-dia-3-fruit-salad-3',
    ]);

    const legacy = JSON.parse(JSON.stringify(plan));
    for (const day of legacy.days) day.recipe.imageKey = null;

    const storage = new AsyncStorageMealPlanAdapter('@foodai:test_plan_en_images');
    await storage.saveMealPlan(legacy, {
      pantryFingerprint: 'fp',
      budget: 20000,
      servings: 2,
      generatedAt: '2026-11-10T00:00:00.000Z',
    });
    const restored = await storage.getStoredMealPlan();
    expect(restored).not.toBeNull();
    const kinds = restored!.plan.days.map((d) => getRecipeImageSource(d.recipe, previewCatalog));
    expect(kinds.map((r) => r.kind)).toEqual(['reference', 'reference', 'none']);
    expect(kinds.map((r) => r.imageKey)).toEqual(['soup', 'chicken', null]);
    expect(restored!.plan.days.map((d) => d.recipe.name)).toEqual([
      'Vegetable soup',
      'Grilled chicken with rice',
      'Fruit salad',
    ]);
  });
});

describe('Política de imágenes intacta', () => {
  it('las imágenes remotas siguen desactivadas: una receta en inglés con URL HTTPS usa la referencia local', () => {
    expect(REMOTE_RECIPE_IMAGES_ENABLED).toBe(false);
    const recipe = {
      ...normalizeBackendRecipe(backendRecipe('Vegetable soup'), 0, 2, 'g'),
      imageUrl: 'https://example.com/soup.jpg',
    };
    const image = getRecipeImageSource(recipe, previewCatalog);
    expect(image.kind).toBe('reference');
    expect(image.source).toBe(recordOf('soup').source);
  });

  it('en producción solo se muestra la imagen si su categoría está aprobada (falla en cerrado)', () => {
    const production = buildRecipeImageCatalog(RECIPE_IMAGE_ASSET_RECORDS, RECIPE_IMAGE_APPROVALS);
    expect([...production.keys()]).toEqual([...RECIPE_IMAGE_CATALOG.keys()]);
    for (const [name, expected] of REQUIRED_ENGLISH) {
      const image = getRecipeImageSource({ name, ingredients: [], isDemoFixture: false }, production);
      expect(image.imageKey).toBe(expected);
      expect(image.kind).toBe(production.has(expected) ? 'reference' : 'none');
    }
  });

  it('el preview interno expone exactamente las 16 imágenes verificadas, todas como referencia', () => {
    expect(previewCatalog.size).toBe(16);
    for (const k of RECIPE_IMAGE_KEYS) {
      const image = getRecipeImageSource({ name: 'x', imageKey: k, isDemoFixture: false }, previewCatalog);
      expect(image.kind).toBe('reference');
      expect(image.referenceLabel).toBe(RECIPE_IMAGE_CATEGORY_LABELS[k]);
    }
  });
});

describe('Determinismo', () => {
  it('la misma entrada en inglés produce siempre la misma clave y no muta la entrada', () => {
    const recipe = { name: 'Stir-fried vegetables', ingredients: ing('Carrot', 'Broccoli') };
    const snapshot = JSON.stringify(recipe);
    const results = Array.from({ length: 5 }, () => resolveRecipeImageKey(recipe));
    expect(new Set(results)).toEqual(new Set(['sauteed-vegetables']));
    expect(JSON.stringify(recipe)).toBe(snapshot);
  });
});
