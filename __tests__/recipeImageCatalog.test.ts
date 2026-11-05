/**
 * Bloque 3A - Integridad del catálogo local, resolución compartida de la imagen de
 * una receta y estabilidad de los planes de comidas persistidos.
 */
// El proyecto no incluye @types/node: se tipan solo las funciones de Node que usa esta prueba.
declare const __dirname: string;
const fs = require('fs') as {
  existsSync(p: string): boolean;
  readdirSync(p: string): string[];
  readFileSync(p: string, encoding: 'utf8'): string;
};
const path = require('path') as {
  resolve(...parts: string[]): string;
  join(...parts: string[]): string;
  basename(p: string): string;
};
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  APPROVED_RECIPE_IMAGE_ASSETS,
  ApprovedRecipeImageAsset,
  RECIPE_IMAGE_CATALOG,
  REMOTE_RECIPE_IMAGES_ENABLED,
  buildRecipeImageCatalog,
  getRecipeImageSource,
  isCompleteRecipeImageLicense,
} from '../src/utils/recipeImageCatalog';
import {
  RECIPE_IMAGE_CATEGORY_LABELS,
  RECIPE_IMAGE_KEYS,
  RecipeImageKey,
  isBundledImageSource,
  isBundledWebAssetSource,
  isRecipeImageKey,
  recipeImageAssetPath,
} from '../src/types/recipeImage';
import { BackendRecipe, ClientRecipe, normalizeBackendRecipe } from '../src/types/recipe';
import { normalizeBackendMealPlan } from '../src/types/mealPlan';
import { AsyncStorageMealPlanAdapter } from '../src/services/storage/mealPlanStorage';
import { BASE_DEMO_RECIPES, getDemoRecipes } from '../src/fixtures/demoRecipes';

const ROOT = path.resolve(__dirname, '..');

const LICENSE = {
  kind: 'original' as const,
  author: 'Estudio de pruebas',
  licenseName: 'Fixture de pruebas (no es un asset real)',
  sourceReference: 'TEST-ONLY',
  acquiredOn: '2026-11-05',
  approvedBy: 'Suite de pruebas',
  attributionRequired: false,
};

/** Asset simulado SOLO para pruebas: no existe ni se registra en la app. */
const fakeAsset = (key: RecipeImageKey, overrides: Partial<ApprovedRecipeImageAsset> = {}) => ({
  key,
  file: recipeImageAssetPath(key),
  source: { testUri: `test-only-${key}` } as any,
  license: LICENSE,
  ...overrides,
});

const realRecipe = (overrides: Partial<ClientRecipe> = {}): ClientRecipe => ({
  id: 'sopa-de-lentejas',
  name: 'Sopa de lentejas',
  description: 'Real',
  totalMinutes: 30,
  servings: 2,
  ingredients: [{ name: 'Lentejas', quantity: 200, unit: 'g' }],
  steps: ['Cocinar'],
  availableIngredients: [],
  missingIngredients: [],
  estimatedMissingCost: 0,
  budgetRemaining: 0,
  withinBudget: true,
  convenience: '80% conveniente',
  reason: '',
  isDemoFixture: false,
  ...overrides,
});

const backendRecipe = (name: string, ingredients: string[] = []): BackendRecipe => ({
  name,
  description: 'Generada',
  totalMinutes: 20,
  ingredients: ingredients.map((n) => ({ name: n, quantity: 1, unit: 'unidad' })),
  steps: ['Paso'],
  availableIngredients: [],
  missingIngredients: [],
  estimatedMissingCost: 0,
  budgetRemaining: 1000,
  withinBudget: true,
  convenience: 80,
  reason: 'Razón',
});

describe('Integridad de assets aprobados', () => {
  it('cada asset registrado existe en disco, es WebP, usa la ruta canónica y tiene licencia completa', () => {
    for (const asset of APPROVED_RECIPE_IMAGE_ASSETS) {
      expect(isRecipeImageKey(asset.key)).toBe(true);
      expect(asset.file).toBe(recipeImageAssetPath(asset.key));
      expect(asset.file.endsWith('.webp')).toBe(true);
      expect(fs.existsSync(path.join(ROOT, asset.file))).toBe(true);
      expect(isCompleteRecipeImageLicense(asset.license)).toBe(true);
    }
    // Todo asset registrado debe sobrevivir a la validación del catálogo
    expect(RECIPE_IMAGE_CATALOG.size).toBe(APPROVED_RECIPE_IMAGE_ASSETS.length);
  });

  it('no hay archivos de imagen sin registrar ni WebP huérfanos en assets/images/recipes', () => {
    const dir = path.join(ROOT, 'assets/images/recipes');
    const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    const images = files.filter((f: string) => /\.(webp|png|jpe?g|gif)$/i.test(f));
    const registered = new Set(APPROVED_RECIPE_IMAGE_ASSETS.map((a) => path.basename(a.file)));
    for (const img of images) expect(registered.has(img)).toBe(true);
  });

  it('el manifiesto documenta cada categoría con su archivo exacto', () => {
    const manifest = fs.readFileSync(path.join(ROOT, 'assets/images/recipes/MANIFEST.md'), 'utf8');
    for (const k of RECIPE_IMAGE_KEYS) {
      expect(manifest).toContain(`\`${k}\``);
      expect(manifest).toContain(`\`${k}.webp\``);
    }
    expect(manifest).toContain(`${APPROVED_RECIPE_IMAGE_ASSETS.length} de ${RECIPE_IMAGE_KEYS.length}`);
  });

  it('todas las categorías tienen etiqueta visible en español', () => {
    for (const k of RECIPE_IMAGE_KEYS) expect(RECIPE_IMAGE_CATEGORY_LABELS[k].trim().length).toBeGreaterThan(0);
  });

  it('el catálogo de producción no usa la fuente de la foto demo como imagen de referencia', () => {
    const demoSource = BASE_DEMO_RECIPES[0].imageUrl;
    for (const asset of RECIPE_IMAGE_CATALOG.values()) expect(asset.source).not.toBe(demoSource);
  });
});

describe('buildRecipeImageCatalog', () => {
  it('acepta registros válidos', () => {
    const catalog = buildRecipeImageCatalog([fakeAsset('soup')]);
    expect(catalog.get('soup')?.file).toBe('assets/images/recipes/soup.webp');
  });

  it('descarta claves desconocidas, rutas no canónicas, fuentes remotas, licencias incompletas y duplicados', () => {
    const catalog = buildRecipeImageCatalog([
      fakeAsset('soup', { key: 'pizza' as any }),
      fakeAsset('salad', { file: 'assets/images/recipes/otra.webp' }),
      fakeAsset('pasta', { source: { uri: 'https://cdn.example.com/pasta.webp' } }),
      fakeAsset('pasta', { source: 'https://cdn.example.com/pasta.webp' as any }),
      fakeAsset('eggs', { license: { ...LICENSE, approvedBy: '' } }),
      fakeAsset('fish', { license: { ...LICENSE, acquiredOn: 'ayer' } }),
      fakeAsset('arepa', { license: { ...LICENSE, attributionRequired: true } }),
      fakeAsset('chicken'),
      fakeAsset('chicken', { source: { testUri: 'duplicado' } as any }),
    ]);
    expect([...catalog.keys()]).toEqual(['chicken']);
    expect((catalog.get('chicken')!.source as any).testUri).toBe('test-only-chicken');
  });
});

describe('Fuentes empaquetadas vs remotas', () => {
  it('reconoce los formatos reales de require() en Android/iOS, Web y Jest', () => {
    expect(isBundledImageSource(12)).toBe(true);
    expect(isBundledImageSource({ uri: '/assets/assets/images/recipes/soup.abc.webp', width: 1600, height: 900 })).toBe(true);
    expect(isBundledImageSource({ testUri: 'x' })).toBe(true);
  });

  it('nunca trata URLs remotas o rutas sospechosas como empaquetadas', () => {
    for (const s of [
      'https://cdn.example.com/a.webp',
      { uri: 'https://cdn.example.com/a.webp', width: 1, height: 1 },
      { uri: '//evil.example.com/a.webp', width: 1, height: 1 },
      { uri: '/\\evil.example.com/a.webp', width: 1, height: 1 },
      { uri: '/assets/a.webp' },
      { uri: '/assets/a.webp', width: 0, height: 10 },
      { uri: 'file:///data/a.webp', width: 1, height: 1 },
      [{ testUri: 'x' }],
      0,
      -1,
      1.5,
      null,
      undefined,
      {},
    ]) {
      expect(isBundledImageSource(s)).toBe(false);
    }
    expect(isBundledWebAssetSource({ uri: 'https://x.com/a.webp', width: 1, height: 1 })).toBe(false);
  });
});

describe('getRecipeImageSource', () => {
  const catalog = buildRecipeImageCatalog([fakeAsset('soup'), fakeAsset('rice-dish'), fakeAsset('dessert')]);

  it('las imágenes remotas están desactivadas en el MVP', () => {
    expect(REMOTE_RECIPE_IMAGES_ENABLED).toBe(false);
  });

  it('receta real con categoría disponible → imagen de referencia etiquetada', () => {
    const result = getRecipeImageSource(realRecipe(), catalog);
    expect(result).toEqual({
      kind: 'reference',
      source: { testUri: 'test-only-soup' },
      imageKey: 'soup',
      referenceLabel: 'Sopa',
    });
  });

  it('"arroz con leche" recibe la imagen de postre, nunca la de arroz salado', () => {
    const result = getRecipeImageSource(realRecipe({ name: 'Arroz con leche' }), catalog);
    expect(result.imageKey).toBe('dessert');
    expect((result.source as any).testUri).toBe('test-only-dessert');
  });

  it('sin coincidencia fiable → respaldo neutro (source null)', () => {
    const result = getRecipeImageSource(realRecipe({ name: 'Plato especial del chef' }), catalog);
    expect(result).toEqual({ kind: 'none', source: null, imageKey: null, referenceLabel: null });
  });

  it('categoría conocida pero sin asset aprobado → respaldo neutro conservando la clave', () => {
    const result = getRecipeImageSource(realRecipe({ name: 'Pasta con tomate' }), catalog);
    expect(result).toEqual({ kind: 'none', source: null, imageKey: 'pasta', referenceLabel: null });
  });

  it('con el catálogo de producción actual (vacío) toda receta real usa el respaldo neutro', () => {
    expect(getRecipeImageSource(realRecipe()).source).toBeNull();
  });

  it('ignora URLs remotas de recetas reales aunque sean HTTPS', () => {
    const result = getRecipeImageSource(
      realRecipe({ name: 'Plato especial', imageUrl: 'https://images.example.com/plato.jpg' }),
      catalog
    );
    expect(result.source).toBeNull();
    const withCategory = getRecipeImageSource(
      realRecipe({ imageUrl: 'https://images.example.com/sopa.jpg' }),
      catalog
    );
    expect(withCategory.kind).toBe('reference');
    expect((withCategory.source as any).uri).toBeUndefined();
  });

  it('ignora identificadores numéricos de Metro en recetas reales (p. ej. persistidos por error)', () => {
    const result = getRecipeImageSource(realRecipe({ name: 'Plato especial', imageUrl: 7 as any }), catalog);
    expect(result.source).toBeNull();
  });

  it('conserva la foto empaquetada de las recetas demo sin marcarla como referencia', () => {
    const demo = getDemoRecipes(20000, 2).find((r) => r.imageUrl)!;
    const result = getRecipeImageSource(demo, catalog);
    expect(result.kind).toBe('demo-photo');
    expect(result.source).toBe(demo.imageUrl);
    expect(result.referenceLabel).toBeNull();
  });

  it('una receta demo con URL remota no la carga', () => {
    const result = getRecipeImageSource(
      { ...BASE_DEMO_RECIPES[0], name: 'Plato especial', imageUrl: 'https://x.example.com/a.jpg' },
      catalog
    );
    expect(result.source).toBeNull();
  });

  it('prioriza una clave persistida válida y recalcula si es desconocida', () => {
    expect(getRecipeImageSource(realRecipe({ imageKey: 'rice-dish' }), catalog).imageKey).toBe('rice-dish');
    expect(getRecipeImageSource(realRecipe({ imageKey: 'pizza' as any }), catalog).imageKey).toBe('soup');
    expect(getRecipeImageSource(realRecipe({ imageKey: null }), catalog).imageKey).toBe('soup');
  });

  it('entradas nulas devuelven el respaldo neutro', () => {
    expect(getRecipeImageSource(null, catalog).kind).toBe('none');
    expect(getRecipeImageSource(undefined, catalog).kind).toBe('none');
  });
});

describe('Normalización y persistencia estable', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('normalizeBackendRecipe guarda una clave de texto estable, nunca un número', () => {
    const recipe = normalizeBackendRecipe(backendRecipe('Arroz con leche', ['Arroz', 'Leche', 'Azúcar']), 0, 2, 'g1');
    expect(recipe.imageKey).toBe('dessert');
    const unknown = normalizeBackendRecipe(backendRecipe('Plato especial'), 1, 2, 'g1');
    expect(unknown.imageKey).toBeNull();
  });

  it('un plan de comidas persistido contiene solo claves de texto y se restaura con las mismas imágenes', async () => {
    const plan = normalizeBackendMealPlan(
      {
        days: [
          { day: 1, recipe: backendRecipe('Sopa de lentejas', ['Lentejas']) },
          { day: 2, recipe: backendRecipe('Tortilla de papa', ['Papa', 'Huevo']) },
          { day: 3, recipe: backendRecipe('Plato especial del chef') },
        ],
        totalEstimatedMissingCost: 0,
        budgetRemaining: 1000,
        withinBudget: true,
      },
      2,
      { planId: 'plan-test', generatedAt: '2026-11-05T00:00:00.000Z' }
    );

    expect(plan.days.map((d) => d.recipe.imageKey)).toEqual(['soup', 'eggs', null]);

    const storage = new AsyncStorageMealPlanAdapter('@foodai:test_plan_images');
    await storage.saveMealPlan(plan, {
      pantryFingerprint: 'fp',
      budget: 20000,
      servings: 2,
      generatedAt: '2026-11-05T00:00:00.000Z',
    });

    const raw = await AsyncStorage.getItem('@foodai:test_plan_images');
    const parsed = JSON.parse(raw!);
    for (const day of parsed.plan.days) {
      expect(typeof day.recipe.imageUrl === 'number').toBe(false);
      expect(day.recipe.imageKey === null || typeof day.recipe.imageKey === 'string').toBe(true);
    }

    const restored = await storage.getStoredMealPlan();
    expect(restored).not.toBeNull();
    const catalog = buildRecipeImageCatalog([fakeAsset('soup'), fakeAsset('eggs')]);
    const before = plan.days.map((d) => getRecipeImageSource(d.recipe, catalog));
    const after = restored!.plan.days.map((d) => getRecipeImageSource(d.recipe, catalog));
    expect(after).toEqual(before);
    expect(after.map((r) => r.kind)).toEqual(['reference', 'reference', 'none']);
  });

  it('planes persistidos antes del Bloque 3A (sin imageKey) siguen siendo válidos y obtienen la clave derivada', async () => {
    const plan = normalizeBackendMealPlan(
      {
        days: [1, 2, 3].map((day) => ({ day, recipe: backendRecipe('Sopa de lentejas', ['Lentejas']) })),
        totalEstimatedMissingCost: 0,
        budgetRemaining: 1000,
        withinBudget: true,
      },
      2,
      { planId: 'legacy' }
    );
    const legacy = JSON.parse(JSON.stringify(plan));
    for (const day of legacy.days) delete day.recipe.imageKey;

    const storage = new AsyncStorageMealPlanAdapter('@foodai:test_legacy_plan');
    await storage.saveMealPlan(legacy, {
      pantryFingerprint: 'fp',
      budget: 20000,
      servings: 2,
      generatedAt: '2026-11-05T00:00:00.000Z',
    });
    const restored = await storage.getStoredMealPlan();
    expect(restored).not.toBeNull();
    expect(getRecipeImageSource(restored!.plan.days[0].recipe).imageKey).toBe('soup');
  });
});
