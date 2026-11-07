/**
 * Bloques 3A/3C - Integridad del catálogo local (16 assets reales), compuerta de
 * aprobación humana, resolución compartida de la imagen de una receta y estabilidad
 * de los planes de comidas persistidos.
 *
 * Las aprobaciones que aparecen en este archivo son SIMULACIONES de prueba para
 * verificar el camino de activación; nunca se registran en el código de la app.
 */
// El proyecto no incluye @types/node: se tipan solo las funciones de Node que usa esta prueba.
declare const __dirname: string;
const fs = require('fs') as {
  existsSync(p: string): boolean;
  readdirSync(p: string): string[];
  readFileSync(p: string, encoding?: 'utf8'): any;
};
const path = require('path') as {
  resolve(...parts: string[]): string;
  join(...parts: string[]): string;
  basename(p: string): string;
};
const crypto = require('crypto') as {
  createHash(alg: string): { update(data: unknown): { digest(enc: 'hex'): string } };
};
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  RECIPE_IMAGE_APPROVALS,
  RECIPE_IMAGE_ASSET_RECORDS,
  RECIPE_IMAGE_CATALOG,
  REMOTE_RECIPE_IMAGES_ENABLED,
  RecipeImageApproval,
  RecipeImageAssetRecord,
  buildRecipeImageCatalog,
  getRecipeImageSource,
  isCompleteRecipeImageApproval,
  isValidRecipeImageAssetRecord,
} from '../src/utils/recipeImageCatalog';
import {
  RECIPE_IMAGE_CATEGORY_LABELS,
  RECIPE_IMAGE_KEYS,
  RecipeImageKey,
  isBundledImageSource,
  isBundledWebAssetSource,
  recipeImageAssetPath,
} from '../src/types/recipeImage';
import { BackendRecipe, ClientRecipe, normalizeBackendRecipe } from '../src/types/recipe';
import { normalizeBackendMealPlan } from '../src/types/mealPlan';
import { AsyncStorageMealPlanAdapter } from '../src/services/storage/mealPlanStorage';
import { BASE_DEMO_RECIPES, getDemoRecipes } from '../src/fixtures/demoRecipes';

const ROOT = path.resolve(__dirname, '..');
const MAX_BYTES = 150 * 1024;

const recordOf = (key: RecipeImageKey): RecipeImageAssetRecord => {
  const record = RECIPE_IMAGE_ASSET_RECORDS.find((r) => r.key === key);
  if (!record) throw new Error(`Sin registro para ${key}`);
  return record;
};

/** Aprobación SIMULADA (solo pruebas) ligada al SHA-256 real del registro. */
const SIMULATED_APPROVER = 'SIMULACIÓN DE PRUEBA (no es una aprobación real)';
const simulatedApprovals = (keys: readonly RecipeImageKey[]) =>
  Object.fromEntries(
    keys.map((k) => [k, { approvedBy: SIMULATED_APPROVER, approvedOn: '2026-11-05', sha256: recordOf(k).sha256 }])
  ) as Partial<Record<RecipeImageKey, RecipeImageApproval>>;
const realCatalog = (keys: readonly RecipeImageKey[]) =>
  buildRecipeImageCatalog(RECIPE_IMAGE_ASSET_RECORDS, simulatedApprovals(keys));

/** Lee cabecera WebP (RIFF/WEBP + 'VP8 ') y devuelve dimensiones del bitstream con pérdida. */
function readWebpInfo(bytes: Uint8Array) {
  const ascii = (a: number, b: number) => String.fromCharCode(...Array.from(bytes.slice(a, b)));
  const chunk = ascii(12, 16);
  const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
  const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
  return { riff: ascii(0, 4), webp: ascii(8, 12), chunk, width, height };
}

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

/** Un nombre de receta real por categoría (todas las claves del catálogo). */
const SAMPLE_NAME_BY_KEY: Record<RecipeImageKey, string> = {
  soup: 'Sopa de lentejas',
  'cream-soup': 'Crema de ahuyama',
  salad: 'Ensalada de atún',
  'rice-dish': 'Arroz con pollo',
  pasta: 'Pasta con tomate',
  eggs: 'Huevos pericos',
  chicken: 'Pollo al horno',
  'beef-stew': 'Carne guisada',
  fish: 'Tilapia al horno',
  legumes: 'Lentejas guisadas',
  arepa: 'Arepa con queso',
  sandwich: 'Sándwich de pollo',
  potatoes: 'Papas al horno',
  'sauteed-vegetables': 'Verduras salteadas',
  dessert: 'Arroz con leche',
  beverage: 'Jugo de mora',
};

describe('Integridad de los 16 assets registrados', () => {
  it('existe exactamente un registro por cada una de las 16 claves', () => {
    const keys = RECIPE_IMAGE_ASSET_RECORDS.map((r) => r.key);
    expect(keys).toHaveLength(RECIPE_IMAGE_KEYS.length);
    expect(new Set(keys)).toEqual(new Set(RECIPE_IMAGE_KEYS));
  });

  it.each(RECIPE_IMAGE_KEYS.map((k) => [k]))('%s: archivo real, WebP 1600x900 sin alfa, <= 150 KiB y SHA-256 verificado', (key) => {
    const record = recordOf(key as RecipeImageKey);
    expect(isValidRecipeImageAssetRecord(record)).toBe(true);
    expect(record.file).toBe(recipeImageAssetPath(record.key));

    const abs = path.join(ROOT, record.file);
    expect(fs.existsSync(abs)).toBe(true);
    const bytes: Uint8Array = fs.readFileSync(abs);
    const info = readWebpInfo(bytes);
    expect(info.riff).toBe('RIFF');
    expect(info.webp).toBe('WEBP');
    expect(info.chunk).toBe('VP8 '); // con pérdida simple: sin canal alfa
    expect([info.width, info.height]).toEqual([1600, 900]);
    expect(bytes.length).toBeLessThanOrEqual(MAX_BYTES);
    expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(record.sha256);
  });

  it('cada registro resuelve a su asset local empaquetado (require estático), nunca remoto', () => {
    for (const record of RECIPE_IMAGE_ASSET_RECORDS) {
      expect(isBundledImageSource(record.source)).toBe(true);
      expect(JSON.stringify(record.source)).toContain(`recipes/${record.key}.webp`);
      expect(JSON.stringify(record.source)).not.toMatch(/https?:/);
    }
  });

  it('no hay imágenes sin registrar en assets/images/recipes', () => {
    const files = fs.readdirSync(path.join(ROOT, 'assets/images/recipes'));
    const images = files.filter((f: string) => /\.(webp|png|jpe?g|gif|avif)$/i.test(f));
    const registered = new Set(RECIPE_IMAGE_ASSET_RECORDS.map((r) => path.basename(r.file)));
    for (const img of images) expect(registered.has(img)).toBe(true);
  });

  it('la procedencia documentada coincide con el origen real de cada archivo', () => {
    // Origen real de cada archivo (Bloques 3A–3E).
    const gemini = ['soup', 'cream-soup', 'salad'];
    const collageBorderCorrected = [
      'rice-dish', 'beef-stew', 'legumes', 'arepa', 'potatoes', 'sauteed-vegetables', 'dessert', 'beverage',
    ];
    const individualChatGpt = ['pasta', 'eggs', 'chicken', 'fish', 'sandwich'];
    expect([...gemini, ...collageBorderCorrected, ...individualChatGpt].sort()).toEqual([...RECIPE_IMAGE_KEYS].sort());

    for (const record of RECIPE_IMAGE_ASSET_RECORDS) {
      expect(record.provenance.kind).toBe('ai-generated');
      if (record.provenance.kind !== 'ai-generated') continue;
      const { provider, workflow } = record.provenance;
      if (gemini.includes(record.key)) {
        expect(provider).toMatch(/Google Gemini/);
        expect(workflow).not.toMatch(/collage|ChatGPT/);
      } else if (collageBorderCorrected.includes(record.key)) {
        expect(provider).toMatch(/OpenAI/);
        expect(workflow).toMatch(/collage/);
        expect(workflow).toMatch(/Corrección técnica \(Bloque 3D\)/);
      } else {
        expect(individualChatGpt).toContain(record.key);
        expect(provider).toMatch(/OpenAI/);
        expect(workflow).toMatch(/individualmente/);
        expect(workflow).not.toMatch(/una única composición|recortada/);
      }
    }
  });

  it('todas las categorías tienen etiqueta visible en español', () => {
    for (const k of RECIPE_IMAGE_KEYS) expect(RECIPE_IMAGE_CATEGORY_LABELS[k].trim().length).toBeGreaterThan(0);
  });

  it('ningún asset del catálogo reutiliza la foto de la receta demo', () => {
    const demoSource = JSON.stringify(BASE_DEMO_RECIPES[0].imageUrl);
    for (const record of RECIPE_IMAGE_ASSET_RECORDS) expect(JSON.stringify(record.source)).not.toBe(demoSource);
  });
});

describe('Compuerta de aprobación humana', () => {
  it('toda aprobación registrada es completa, real (sin marcadores) y coincide con el archivo actual', () => {
    for (const [key, approval] of Object.entries(RECIPE_IMAGE_APPROVALS)) {
      const record = recordOf(key as RecipeImageKey);
      expect(isCompleteRecipeImageApproval(approval, record.sha256)).toBe(true);
      expect(approval!.approvedBy).not.toMatch(/simul|prueba|test|placeholder|tbd|pendiente|equipo|team|<|>/i);
    }
  });

  it('el catálogo de producción contiene exactamente las imágenes aprobadas (ninguna aprobación se descarta en silencio)', () => {
    expect([...RECIPE_IMAGE_CATALOG.keys()].sort()).toEqual(Object.keys(RECIPE_IMAGE_APPROVALS).sort());
  });

  it('sin aprobación, una receta real usa el respaldo neutro aunque su archivo exista', () => {
    const key = 'soup' as const;
    if (RECIPE_IMAGE_APPROVALS[key]) return; // ya aprobada: cubierto por la prueba anterior
    expect(fs.existsSync(path.join(ROOT, recordOf(key).file))).toBe(true);
    expect(getRecipeImageSource(realRecipe())).toEqual({
      kind: 'none',
      source: null,
      imageKey: 'soup',
      referenceLabel: null,
    });
  });

  it('el manifiesto refleja el estado real: archivos presentes y aprobados', () => {
    const manifest: string = fs.readFileSync(path.join(ROOT, 'assets/images/recipes/MANIFEST.md'), 'utf8');
    for (const k of RECIPE_IMAGE_KEYS) {
      expect(manifest).toContain(`\`${k}\``);
      expect(manifest).toContain(`\`${k}.webp\``);
    }
    const present = RECIPE_IMAGE_ASSET_RECORDS.filter((r) => fs.existsSync(path.join(ROOT, r.file))).length;
    expect(manifest).toContain(`Archivos presentes y verificados técnicamente: ${present} de ${RECIPE_IMAGE_KEYS.length}`);
    expect(manifest).toContain(
      `Aprobados para producción: ${RECIPE_IMAGE_CATALOG.size} de ${RECIPE_IMAGE_KEYS.length}`
    );
  });
});

describe('buildRecipeImageCatalog', () => {
  const VALID_PROVENANCE = recordOf('soup').provenance;
  const fakeRecord = (key: RecipeImageKey, overrides: Partial<RecipeImageAssetRecord> = {}) =>
    ({
      key,
      file: recipeImageAssetPath(key),
      source: { testUri: `test-only-${key}` } as any,
      sha256: 'a'.repeat(64),
      provenance: VALID_PROVENANCE,
      ...overrides,
    }) as RecipeImageAssetRecord;
  const approval = (sha = 'a'.repeat(64), extra: Partial<RecipeImageApproval> = {}) => ({
    approvedBy: SIMULATED_APPROVER,
    approvedOn: '2026-11-05',
    sha256: sha,
    ...extra,
  });

  it('con aprobación (simulada) para las 16 claves activa los 16 assets reales', () => {
    const catalog = realCatalog(RECIPE_IMAGE_KEYS);
    expect(catalog.size).toBe(16);
    for (const k of RECIPE_IMAGE_KEYS) expect(catalog.get(k)!.source).toBe(recordOf(k).source);
  });

  it('sin aprobaciones el catálogo queda vacío', () => {
    expect(buildRecipeImageCatalog(RECIPE_IMAGE_ASSET_RECORDS, {}).size).toBe(0);
  });

  it('una aprobación de un archivo distinto (SHA-256 desactualizado) no activa la imagen', () => {
    const catalog = buildRecipeImageCatalog(RECIPE_IMAGE_ASSET_RECORDS, {
      soup: approval('b'.repeat(64)),
    });
    expect(catalog.size).toBe(0);
  });

  it('descarta aprobaciones incompletas', () => {
    const records = [fakeRecord('soup'), fakeRecord('salad'), fakeRecord('pasta'), fakeRecord('eggs')];
    const catalog = buildRecipeImageCatalog(records, {
      soup: approval(undefined, { approvedBy: '   ' }),
      salad: approval(undefined, { approvedOn: 'ayer' }),
      pasta: approval('no-es-un-hash'),
      eggs: approval(),
    });
    expect([...catalog.keys()]).toEqual(['eggs']);
  });

  it('descarta registros inválidos: clave, ruta, fuente remota, procedencia incompleta y duplicados', () => {
    const all = Object.fromEntries(RECIPE_IMAGE_KEYS.map((k) => [k, approval()]));
    const catalog = buildRecipeImageCatalog(
      [
        fakeRecord('soup', { key: 'pizza' as any }),
        fakeRecord('salad', { file: 'assets/images/recipes/otra.webp' }),
        fakeRecord('pasta', { source: { uri: 'https://cdn.example.com/pasta.webp' } }),
        fakeRecord('rice-dish', { source: 'https://cdn.example.com/arroz.webp' as any }),
        fakeRecord('eggs', { provenance: { ...VALID_PROVENANCE, termsReference: 'http://inseguro.example.com' } as any }),
        fakeRecord('fish', { provenance: { ...VALID_PROVENANCE, provider: '' } as any }),
        fakeRecord('arepa', { provenance: { ...VALID_PROVENANCE, attributionRequired: true } as any }),
        fakeRecord('legumes', {
          provenance: { kind: 'licensed', author: 'X', licenseName: '', sourceReference: 'Y', attributionRequired: false },
        }),
        fakeRecord('beverage', { sha256: 'corto' }),
        fakeRecord('chicken'),
        fakeRecord('chicken', { source: { testUri: 'duplicado' } as any }),
      ],
      all
    );
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
  const catalog = realCatalog(['soup', 'rice-dish', 'dessert']);

  it('las imágenes remotas están desactivadas en el MVP', () => {
    expect(REMOTE_RECIPE_IMAGES_ENABLED).toBe(false);
  });

  it('cada una de las 16 categorías resuelve su asset local real cuando está aprobada', () => {
    const full = realCatalog(RECIPE_IMAGE_KEYS);
    for (const key of RECIPE_IMAGE_KEYS) {
      const result = getRecipeImageSource(realRecipe({ name: SAMPLE_NAME_BY_KEY[key], ingredients: [] }), full);
      expect(result).toEqual({
        kind: 'reference',
        source: recordOf(key).source,
        imageKey: key,
        referenceLabel: RECIPE_IMAGE_CATEGORY_LABELS[key],
      });
    }
  });

  it('receta real con categoría aprobada → imagen de referencia etiquetada', () => {
    expect(getRecipeImageSource(realRecipe(), catalog)).toEqual({
      kind: 'reference',
      source: recordOf('soup').source,
      imageKey: 'soup',
      referenceLabel: 'Sopa',
    });
  });

  it('"arroz con leche" recibe la imagen de postre, nunca la de arroz salado', () => {
    const result = getRecipeImageSource(realRecipe({ name: 'Arroz con leche' }), catalog);
    expect(result.imageKey).toBe('dessert');
    expect(result.source).toBe(recordOf('dessert').source);
    expect(result.source).not.toBe(recordOf('rice-dish').source);
  });

  it('sin coincidencia fiable → respaldo neutro (source null)', () => {
    const result = getRecipeImageSource(realRecipe({ name: 'Plato especial del chef' }), catalog);
    expect(result).toEqual({ kind: 'none', source: null, imageKey: null, referenceLabel: null });
  });

  it('categoría conocida pero sin aprobación → respaldo neutro conservando la clave', () => {
    const result = getRecipeImageSource(realRecipe({ name: 'Pasta con tomate' }), catalog);
    expect(result).toEqual({ kind: 'none', source: null, imageKey: 'pasta', referenceLabel: null });
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
    expect(withCategory.source).toBe(recordOf('soup').source);
  });

  it('ignora identificadores numéricos de Metro en recetas reales (p. ej. persistidos por error)', () => {
    const result = getRecipeImageSource(realRecipe({ name: 'Plato especial', imageUrl: 7 as any }), catalog);
    expect(result.source).toBeNull();
  });

  it('conserva la foto empaquetada de las recetas demo sin marcarla como referencia', () => {
    const demo = getDemoRecipes(20000, 2).find((r) => r.imageUrl)!;
    const result = getRecipeImageSource(demo, realCatalog(RECIPE_IMAGE_KEYS));
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
    // El JSON persistido nunca contiene fuentes de assets ni rutas de imágenes del catálogo
    expect(raw).not.toMatch(/recipes\/[a-z-]+\.webp|testUri/);

    const restored = await storage.getStoredMealPlan();
    expect(restored).not.toBeNull();
    const catalog = realCatalog(['soup', 'eggs']);
    const before = plan.days.map((d) => getRecipeImageSource(d.recipe, catalog));
    const after = restored!.plan.days.map((d) => getRecipeImageSource(d.recipe, catalog));
    expect(after).toEqual(before);
    expect(after.map((r) => r.kind)).toEqual(['reference', 'reference', 'none']);
    expect(after[0].source).toBe(recordOf('soup').source);
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
