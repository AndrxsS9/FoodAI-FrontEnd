/**
 * FoodAI — Bloque 5: Persistencia segura de recetas y recuperación en frío.
 *
 * Cubre el adaptador versionado (src/services/storage/recipeStorage.ts) y su integración en
 * RecipeContext con proveedores reales: guardado/restauración, aislamiento por usuario,
 * restauraciones tardías frente a cambios de sesión o generaciones nuevas, obsolescencia,
 * compatibilidad con el ledger de consumo, manejo de fallos y pantallas Inicio/Recetas.
 */

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  AsyncStorageRecipeAdapter,
  PersistedRecipeCollection,
  RECIPE_STORAGE_VERSION,
  RecipeStorageAdapter,
  RecipeStorageWriteBlockedError,
  createRecipeStorage,
  getRecipeStorageKey,
  parseRecipeStorageEnvelope,
} from '../src/services/storage/recipeStorage';
import { BackendRecipe, ClientRecipe, normalizeBackendRecipe } from '../src/types/recipe';
import { Ingredient } from '../src/types/pantry';
import { BudgetPreferences } from '../src/types/budget';
import { PantryStorageAdapter } from '../src/services/storage/pantryStorage';
import { BudgetStorageAdapter } from '../src/services/storage/budgetStorage';
import { getMealPlanStorageKey } from '../src/services/storage/mealPlanStorage';
import { getConsumedRecipesStorageKey } from '../src/services/storage/recipeConsumptionStorage';
import { getRecipeImageSource } from '../src/utils/recipeImageCatalog';
import { PantryProvider, usePantry, PantryContextValue } from '../src/context/PantryContext';
import { BudgetProvider, useBudget, BudgetContextValue } from '../src/context/BudgetContext';
import { RecipeProvider, useRecipes, RecipeContextValue } from '../src/context/RecipeContext';
import { ThemeProvider, TypographyProvider } from '../src/theme';
import HomeScreen from '../app/(tabs)/index';
import RecipeDiscoveryScreen from '../app/(tabs)/recetas';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
}));

// ---------------------------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------------------------

const UID_A = 'usr-alice-111';
const UID_B = 'usr-bob-222';

const ing = (id: string, name: string, quantity: number, unit: Ingredient['unit']): Ingredient => ({
  id,
  name,
  quantity,
  unit,
  category: 'Otros',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
});

const PANTRY: Ingredient[] = [
  ing('p-arroz', 'Arroz', 1000, 'g'),
  ing('p-pollo', 'Pollo', 1000, 'g'),
  ing('p-cebolla', 'Cebolla', 5, 'unidad'),
];

const backendRecipe = (name: string, overrides: Partial<BackendRecipe> = {}): BackendRecipe => ({
  name,
  description: 'Generada por el backend',
  totalMinutes: 30,
  ingredients: [
    { name: 'Arroz', quantity: 300, unit: 'g' },
    { name: 'Pollo', quantity: 200, unit: 'g' },
  ],
  steps: ['Cocinar el arroz', 'Agregar el pollo'],
  availableIngredients: [
    { name: 'Arroz', quantity: 300, unit: 'g' },
    { name: 'Pollo', quantity: 200, unit: 'g' },
  ],
  missingIngredients: [{ name: 'Zanahoria', quantity: 1, unit: 'unidad', estimatedCost: 1500 }],
  estimatedMissingCost: 1500,
  budgetRemaining: 18500,
  withinBudget: true,
  convenience: 88,
  reason: 'Aprovecha tu despensa',
  ...overrides,
});

const RECIPES_GEN_1 = [backendRecipe('Arroz con pollo'), backendRecipe('Pollo sudado')];
const RECIPES_GEN_2 = [backendRecipe('Sopa de arroz'), backendRecipe('Arroz frito')];

function createApi(...batches: BackendRecipe[][]) {
  const queue = batches.length > 0 ? [...batches] : [RECIPES_GEN_1];
  return {
    recommendRecipes: jest.fn(() => Promise.resolve(queue.length > 1 ? queue.shift()! : queue[0])),
    checkBackendHealth: jest.fn(),
  } as any;
}

function makeClientRecipe(name: string, generationId: string, extra: Record<string, unknown> = {}): ClientRecipe {
  const base = normalizeBackendRecipe(backendRecipe(name), 0, 2, generationId);
  const id = base.id.replace(/-1$/, '');
  return { ...base, id, instanceId: `${id}::${generationId}`, generationId, ...extra } as ClientRecipe;
}

function makeCollection(
  generationId = 'gen_1',
  generatedAt = '2026-11-07T10:00:00.000Z',
  recipes?: ClientRecipe[]
): PersistedRecipeCollection {
  return {
    generationId,
    generatedAt,
    snapshot: { pantryFingerprint: 'fp', budget: 20000, servings: 2, maxMinutes: 30 },
    recipes: recipes ?? [makeClientRecipe('Arroz con pollo', generationId), makeClientRecipe('Pollo sudado', generationId)],
  };
}

/** Misma huella que RecipeContext calcula para la despensa. */
const fingerprintOf = (items: Ingredient[]) =>
  items
    .map((item) => `${item.id}:${item.name.toLowerCase()}:${item.quantity}:${item.unit}`)
    .sort()
    .join('|');

/** Colección cuyo snapshot coincide con PANTRY y el presupuesto por defecto del arnés. */
const matchingCollection = (): PersistedRecipeCollection => ({
  ...makeCollection(),
  snapshot: { pantryFingerprint: fingerprintOf(PANTRY), budget: 20000, servings: 2, maxMinutes: 30 },
});

async function validEnvelopeObject(uid = UID_A): Promise<any> {
  await new AsyncStorageRecipeAdapter(uid).save(makeCollection());
  const raw = await AsyncStorage.getItem(getRecipeStorageKey(uid));
  await AsyncStorage.removeItem(getRecipeStorageKey(uid));
  return JSON.parse(raw!);
}

// ---------------------------------------------------------------------------------------------
// Adaptadores en memoria para despensa y presupuesto (con compuertas opcionales)
// ---------------------------------------------------------------------------------------------

function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

type MemoryPantry = PantryStorageAdapter & { data: Ingredient[]; loadGate?: Promise<void> };

function createMemoryPantry(initial: Ingredient[]): MemoryPantry {
  const store: MemoryPantry = {
    data: initial.map((i) => ({ ...i })),
    async getIngredients() {
      if (store.loadGate) await store.loadGate;
      return store.data.map((i) => ({ ...i }));
    },
    async saveIngredients(items: Ingredient[]) {
      store.data = items.map((i) => ({ ...i }));
    },
    async addIngredient(item: any) {
      store.data.push(item);
      return item;
    },
    async updateIngredient(item: any) {
      const idx = store.data.findIndex((i) => i.id === item.id);
      store.data[idx] = { ...store.data[idx], ...item };
      return store.data[idx];
    },
    async deleteIngredient(id: string) {
      store.data = store.data.filter((i) => i.id !== id);
    },
    async clearIngredients() {
      store.data = [];
    },
  };
  return store;
}

type MemoryBudget = BudgetStorageAdapter & { prefs: BudgetPreferences };

function createMemoryBudget(budget = 20000, servings = 2, maxMinutes: number | undefined = 30): MemoryBudget {
  const store: MemoryBudget = {
    prefs: { budget, servings, maxMinutes, updatedAt: '2026-11-01T00:00:00.000Z' },
    async getPreferences() {
      return { ...store.prefs };
    },
    async savePreferences(input) {
      store.prefs = { ...store.prefs, ...input, updatedAt: new Date().toISOString() } as BudgetPreferences;
      return { ...store.prefs };
    },
    async resetPreferences() {
      return { ...store.prefs };
    },
  };
  return store;
}

/** Restauración que lee de inmediato pero entrega el resultado tarde (lectura obsoleta). */
function delayedRecipeAdapter(uid: string) {
  const real = new AsyncStorageRecipeAdapter(uid);
  const g = gate();
  const adapter: RecipeStorageAdapter = {
    load: async () => {
      const result = await real.load();
      await g.promise;
      return result;
    },
    reserveWriteOrder: () => real.reserveWriteOrder(),
    save: (collection, order) => real.save(collection, order),
  };
  return { adapter, release: g.open };
}

// ---------------------------------------------------------------------------------------------
// Arnés de proveedores
// ---------------------------------------------------------------------------------------------

let recipeCtx: RecipeContextValue;
let pantryCtx: PantryContextValue;
let budgetCtx: BudgetContextValue;

function Probe() {
  recipeCtx = useRecipes();
  pantryCtx = usePantry();
  budgetCtx = useBudget();
  return null;
}

interface TreeProps {
  uid: string | null;
  api: any;
  pantry: MemoryPantry;
  budget: MemoryBudget;
  recipeStorage?: RecipeStorageAdapter;
  initialRecipes?: ClientRecipe[];
  children?: React.ReactNode;
}

function Providers({ uid, api, pantry, budget, recipeStorage, initialRecipes, children }: TreeProps) {
  return (
    <PantryProvider storageAdapter={pantry} userId={uid}>
      <BudgetProvider storageAdapter={budget} userId={uid}>
        <RecipeProvider
          userId={uid}
          recipeApiClient={api}
          storageAdapter={recipeStorage}
          initialRecipes={initialRecipes}
        >
          <Probe />
          {children}
        </RecipeProvider>
      </BudgetProvider>
    </PantryProvider>
  );
}

async function mount(props: TreeProps) {
  const utils = await render(<Providers {...props} />);
  return {
    ...utils,
    rerenderWith: (next: Partial<TreeProps>) => utils.rerender(<Providers {...props} {...next} />),
  };
}

const waitForHydration = () =>
  waitFor(() => {
    expect(pantryCtx.isLoading).toBe(false);
    expect(budgetCtx.isLoading).toBe(false);
    expect(recipeCtx.isRestoring).toBe(false);
  });

/** Espera a que las escrituras encoladas para el usuario terminen (la cola es por clave). */
const flushRecipeStorage = async (uid: string) => {
  await act(async () => {
    await new AsyncStorageRecipeAdapter(uid).load();
  });
};

async function generate() {
  let result!: ClientRecipe[];
  await act(async () => {
    result = await recipeCtx.generateRecipes();
  });
  return result;
}

async function readEnvelope(uid: string) {
  const raw = await AsyncStorage.getItem(getRecipeStorageKey(uid));
  return raw ? JSON.parse(raw) : null;
}

let warnSpy: jest.SpyInstance;

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// =============================================================================================
// 1. Adaptador de almacenamiento
// =============================================================================================

describe('Bloque 5 — Adaptador recipeStorage', () => {
  it('guarda y restaura recetas reales conservando id, instanceId, generationId y snapshot', async () => {
    const adapter = new AsyncStorageRecipeAdapter(UID_A);
    const collection = makeCollection('gen_abc');
    expect(await adapter.save(collection)).toEqual({ status: 'saved' });

    const result = await adapter.load();
    expect(result.status).toBe('valid');
    if (result.status !== 'valid') return;
    expect(result.collection.generationId).toBe('gen_abc');
    expect(result.collection.generatedAt).toBe(collection.generatedAt);
    expect(result.collection.snapshot).toEqual(collection.snapshot);
    expect(result.collection.recipes.map((r) => [r.id, r.instanceId, r.generationId])).toEqual([
      ['arroz-con-pollo', 'arroz-con-pollo::gen_abc', 'gen_abc'],
      ['pollo-sudado', 'pollo-sudado::gen_abc', 'gen_abc'],
    ]);
    expect(result.collection.recipes[0]).toEqual(collection.recipes[0]);
    expect(result.collection.recipes.every((r) => r.isDemoFixture === false)).toBe(true);
  });

  it('serializa por lista blanca: sin tokens, sesiones, campos ajenos ni fuentes de imagen empaquetadas', async () => {
    const tainted = makeClientRecipe('Arroz con pollo', 'gen_1', {
      accessToken: 'jwt-secreto',
      session: { refresh_token: 'refresh-secreto' },
      imageUrl: { testUri: '../../assets/images/recipe-pollo-verduras.jpg' },
    });
    await new AsyncStorageRecipeAdapter(UID_A).save(makeCollection('gen_1', undefined, [tainted]));

    const raw = (await AsyncStorage.getItem(getRecipeStorageKey(UID_A)))!;
    expect(raw).not.toMatch(/jwt-secreto|refresh-secreto|accessToken|session|testUri|refresh_token/);
    const envelope = JSON.parse(raw);
    expect(envelope.version).toBe(RECIPE_STORAGE_VERSION);
    expect(envelope.ownerUserId).toBe(UID_A);
    expect(envelope.recipes[0].imageUrl).toBeUndefined();
    expect(envelope.recipes[0].imageKey).toBe(tainted.imageKey);
  });

  it('conserva una URL remota HTTPS segura y la categoría de imagen del catálogo', async () => {
    const recipe = makeClientRecipe('Arroz con pollo', 'gen_1', { imageUrl: 'https://cdn.example.com/a.webp' });
    const adapter = new AsyncStorageRecipeAdapter(UID_A);
    await adapter.save(makeCollection('gen_1', undefined, [recipe]));
    const result = await adapter.load();
    if (result.status !== 'valid') throw new Error('esperado válido');
    const restored = result.collection.recipes[0];
    expect(restored.imageUrl).toBe('https://cdn.example.com/a.webp');
    expect(restored.imageKey).toBe(recipe.imageKey);
    expect(getRecipeImageSource(restored)).toEqual(getRecipeImageSource(recipe));
  });

  it('aísla por usuario: claves distintas, sin adaptador anónimo y propietario verificado', async () => {
    expect(getRecipeStorageKey(UID_A)).toBe(`@foodai:${UID_A}:recipes_v1`);
    expect(createRecipeStorage(null)).toBeNull();
    expect(createRecipeStorage(undefined)).toBeNull();
    expect(createRecipeStorage('  ')).toBeNull();
    expect(() => new AsyncStorageRecipeAdapter('')).toThrow();

    await new AsyncStorageRecipeAdapter(UID_A).save(makeCollection());
    expect(await new AsyncStorageRecipeAdapter(UID_B).load()).toEqual({ status: 'empty' });

    // Un sobre de A copiado bajo la clave de B no se acepta como datos de B
    const rawA = await AsyncStorage.getItem(getRecipeStorageKey(UID_A));
    await AsyncStorage.setItem(getRecipeStorageKey(UID_B), rawA!);
    const resB = await new AsyncStorageRecipeAdapter(UID_B).load();
    expect(resB.status).toBe('corrupt');
  });

  const corruptions: [string, (env: any) => any][] = [
    ['JSON inválido', () => '{no-es-json'],
    ['arreglo raíz', () => '[]'],
    ['sin versión', (e) => ({ ...e, version: undefined })],
    ['versión 0', (e) => ({ ...e, version: 0 })],
    ['sin metadatos de generación', (e) => ({ ...e, generation: undefined })],
    ['sin generationId', (e) => ({ ...e, generation: { ...e.generation, generationId: '' } })],
    ['generatedAt inválido', (e) => ({ ...e, generation: { ...e.generation, generatedAt: 'ayer' } })],
    ['snapshot inválido', (e) => ({ ...e, generation: { ...e.generation, snapshot: { budget: 'x' } } })],
    ['recetas no arreglo', (e) => ({ ...e, recipes: {} })],
    ['receta demo', (e) => ({ ...e, recipes: [{ ...e.recipes[0], isDemoFixture: true }, e.recipes[1]] })],
    ['receta sin bandera demo', (e) => {
      const r = { ...e.recipes[0] };
      delete r.isDemoFixture;
      return { ...e, recipes: [r] };
    }],
    ['instanceId incoherente', (e) => ({ ...e, recipes: [{ ...e.recipes[0], instanceId: 'otra::gen_1' }] })],
    ['generationId de receta distinto', (e) => ({ ...e, recipes: [{ ...e.recipes[0], generationId: 'gen_x' }] })],
    ['ids duplicados', (e) => ({ ...e, recipes: [e.recipes[0], e.recipes[0]] })],
    ['URL de imagen insegura', (e) => ({ ...e, recipes: [{ ...e.recipes[0], imageUrl: 'http://inseguro.com/a.jpg' }] })],
    ['imageKey no textual', (e) => ({ ...e, recipes: [{ ...e.recipes[0], imageKey: 7 }] })],
    ['totalMinutes no numérico', (e) => ({ ...e, recipes: [{ ...e.recipes[0], totalMinutes: '30' }] })],
    ['ingrediente malformado', (e) => ({ ...e, recipes: [{ ...e.recipes[0], ingredients: [{ name: 1 }] }] })],
  ];

  it.each(corruptions)('rechaza contenido corrupto (%s) sin modificarlo', async (_label, mutate) => {
    const env = await validEnvelopeObject();
    const mutated = mutate(env);
    const raw = typeof mutated === 'string' ? mutated : JSON.stringify(mutated);
    await AsyncStorage.setItem(getRecipeStorageKey(UID_A), raw);
    const keysBefore = await AsyncStorage.getAllKeys();

    const result = await new AsyncStorageRecipeAdapter(UID_A).load();
    expect(result.status).toBe('corrupt');
    expect(await AsyncStorage.getItem(getRecipeStorageKey(UID_A))).toBe(raw);
    expect(await AsyncStorage.getAllKeys()).toEqual(keysBefore);
  });

  it('el parser puro distingue ausencia real (null) de contenido vacío o en blanco', () => {
    // El mock de AsyncStorage devuelve null para '', por eso se valida el parser directamente.
    expect(parseRecipeStorageEnvelope(null, UID_A)).toEqual({ status: 'empty' });
    expect(parseRecipeStorageEnvelope('', UID_A).status).toBe('corrupt');
    expect(parseRecipeStorageEnvelope('   ', UID_A).status).toBe('corrupt');
  });

  it('versión de esquema futura: no se restaura y nunca se sobrescribe', async () => {
    const env = await validEnvelopeObject();
    const raw = JSON.stringify({ ...env, version: 2 });
    await AsyncStorage.setItem(getRecipeStorageKey(UID_A), raw);
    const adapter = new AsyncStorageRecipeAdapter(UID_A);

    expect(await adapter.load()).toEqual({ status: 'unsupported_version', version: 2 });
    await expect(adapter.save(makeCollection('gen_new', '2026-11-08T00:00:00.000Z'))).rejects.toBeInstanceOf(
      RecipeStorageWriteBlockedError
    );
    expect(await AsyncStorage.getItem(getRecipeStorageKey(UID_A))).toBe(raw);
  });

  it('antes de reemplazar datos corruptos crea un respaldo con el contenido original', async () => {
    await AsyncStorage.setItem(getRecipeStorageKey(UID_A), '{corrupto');
    const result = await new AsyncStorageRecipeAdapter(UID_A).save(makeCollection());

    expect(result.status).toBe('saved');
    const backupKey = (result as { backupKey?: string }).backupKey!;
    expect(backupKey).toMatch(new RegExp(`^@foodai:${UID_A}:recipes_v1_backup_\\d+$`));
    expect(await AsyncStorage.getItem(backupKey)).toBe('{corrupto');
    expect((await new AsyncStorageRecipeAdapter(UID_A).load()).status).toBe('valid');
  });

  it('si el respaldo falla, cancela la escritura y conserva el original', async () => {
    await AsyncStorage.setItem(getRecipeStorageKey(UID_A), '{corrupto');
    (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error('cuota')));

    await expect(new AsyncStorageRecipeAdapter(UID_A).save(makeCollection())).rejects.toBeInstanceOf(
      RecipeStorageWriteBlockedError
    );
    expect(await AsyncStorage.getItem(getRecipeStorageKey(UID_A))).toBe('{corrupto');
  });

  it('nunca persiste recetas demo ni colecciones sin metadatos de generación', async () => {
    const adapter = new AsyncStorageRecipeAdapter(UID_A);
    const demo = { ...makeClientRecipe('Arroz con pollo', 'gen_1'), isDemoFixture: true };
    await expect(adapter.save(makeCollection('gen_1', undefined, [demo]))).rejects.toBeInstanceOf(
      RecipeStorageWriteBlockedError
    );
    await expect(adapter.save({ ...makeCollection(), generationId: '' })).rejects.toBeInstanceOf(
      RecipeStorageWriteBlockedError
    );
    await expect(adapter.save({ ...makeCollection(), generatedAt: 'nunca' })).rejects.toBeInstanceOf(
      RecipeStorageWriteBlockedError
    );
    await expect(
      adapter.save({ ...makeCollection(), snapshot: { pantryFingerprint: 'fp', budget: -1, servings: 2 } })
    ).rejects.toBeInstanceOf(RecipeStorageWriteBlockedError);
    expect(await AsyncStorage.getItem(getRecipeStorageKey(UID_A))).toBeNull();
  });

  it('una generación más antigua nunca reemplaza a una más reciente (cola FIFO compartida)', async () => {
    const older = makeCollection('gen_old', '2026-11-07T10:00:00.000Z');
    const newer = makeCollection('gen_new', '2026-11-07T11:00:00.000Z');
    // Bloque 5B: "más antigua" se define por el orden lógico de aceptación, no por el reloj.
    const olderOrder = new AsyncStorageRecipeAdapter(UID_A).reserveWriteOrder();
    const newerOrder = new AsyncStorageRecipeAdapter(UID_A).reserveWriteOrder();

    // Dos instancias distintas (remontaje por sesión) comparten la cola de la misma clave
    const [r1, r2] = await Promise.all([
      new AsyncStorageRecipeAdapter(UID_A).save(newer, newerOrder),
      new AsyncStorageRecipeAdapter(UID_A).save(older, olderOrder),
    ]);
    expect(r1).toEqual({ status: 'saved' });
    expect(r2).toEqual({ status: 'skipped_older' });
    expect((await readEnvelope(UID_A)).generation.generationId).toBe('gen_new');

    await new AsyncStorageRecipeAdapter(UID_A).save(makeCollection('gen_newest', '2026-11-07T12:00:00.000Z'));
    expect((await readEnvelope(UID_A)).generation.generationId).toBe('gen_newest');
  });

  it('propaga fallos de lectura y escritura de AsyncStorage', async () => {
    const adapter = new AsyncStorageRecipeAdapter(UID_A);
    (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error('io-lectura')));
    await expect(adapter.load()).rejects.toThrow('io-lectura');

    (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error('io-escritura')));
    await expect(adapter.save(makeCollection())).rejects.toThrow('io-escritura');
    expect(await AsyncStorage.getItem(getRecipeStorageKey(UID_A))).toBeNull();
  });

  it('una categoría de imagen desconocida se degrada a null y el catálogo resuelve por nombre', async () => {
    const env = await validEnvelopeObject();
    env.recipes[0].imageKey = 'categoria-futura';
    await AsyncStorage.setItem(getRecipeStorageKey(UID_A), JSON.stringify(env));
    const result = await new AsyncStorageRecipeAdapter(UID_A).load();
    if (result.status !== 'valid') throw new Error('esperado válido');
    const restored = result.collection.recipes[0];
    expect(restored.imageKey).toBeNull();
    expect(getRecipeImageSource(restored).kind).toBe(
      getRecipeImageSource({ ...restored, imageKey: undefined }).kind
    );
  });
});

// =============================================================================================
// 2. Integración en RecipeContext
// =============================================================================================

describe('Bloque 5 — Persistencia y recuperación en frío en RecipeContext', () => {
  it('1/2/3/9/14. guarda, restaura tras reinicio sin invocar a Gemini y conserva identidad e imagen', async () => {
    const pantry = createMemoryPantry(PANTRY);
    const budget = createMemoryBudget();
    const api = createApi();

    const first = await mount({ uid: UID_A, api, pantry, budget });
    await waitForHydration();
    const generated = await generate();
    await flushRecipeStorage(UID_A);
    const generatedAt = recipeCtx.lastGeneratedAt;
    expect(api.recommendRecipes).toHaveBeenCalledTimes(1);
    await first.unmount();

    // Reinicio en frío
    const restartApi = createApi();
    await mount({ uid: UID_A, api: restartApi, pantry, budget });
    await waitForHydration();

    expect(restartApi.recommendRecipes).not.toHaveBeenCalled();
    expect(recipeCtx.isDemoMode).toBe(false);
    expect(recipeCtx.recipes).toEqual(generated);
    expect(recipeCtx.recipes.map((r) => r.instanceId)).toEqual(generated.map((r) => r.instanceId));
    expect(recipeCtx.lastGeneratedAt).toBe(generatedAt);
    expect(recipeCtx.isStale).toBe(false);
    expect(recipeCtx.error).toBeNull();
    recipeCtx.recipes.forEach((r, i) => {
      expect(getRecipeImageSource(r)).toEqual(getRecipeImageSource(generated[i]));
    });
  });

  it('2. una restauración pendiente no se presenta como colección vacía', async () => {
    const { adapter, release } = delayedRecipeAdapter(UID_A);
    await new AsyncStorageRecipeAdapter(UID_A).save(makeCollection());
    const api = createApi();

    await mount({ uid: UID_A, api, pantry: createMemoryPantry(PANTRY), budget: createMemoryBudget(), recipeStorage: adapter });
    await waitFor(() => expect(pantryCtx.isLoading).toBe(false));

    expect(recipeCtx.isRestoring).toBe(true);
    expect(recipeCtx.recipes).toEqual([]);
    expect(recipeCtx.isStale).toBe(false);

    await act(async () => release());
    await waitForHydration();
    expect(recipeCtx.recipes.map((r) => r.id)).toEqual(['arroz-con-pollo', 'pollo-sudado']);
    expect(api.recommendRecipes).not.toHaveBeenCalled();
  });

  it('4. aislamiento por usuario: B nunca ve las recetas de A y A las recupera al volver', async () => {
    const budget = createMemoryBudget();
    const api = createApi();
    const a1 = await mount({ uid: UID_A, api, pantry: createMemoryPantry(PANTRY), budget });
    await waitForHydration();
    const generatedA = await generate();
    await flushRecipeStorage(UID_A);
    await a1.unmount();

    const b = await mount({ uid: UID_B, api: createApi(), pantry: createMemoryPantry([]), budget });
    await waitForHydration();
    expect(recipeCtx.recipes).toEqual([]);
    expect(recipeCtx.isDemoMode).toBe(false);
    expect(await AsyncStorage.getItem(getRecipeStorageKey(UID_B))).toBeNull();
    await b.unmount();

    await mount({ uid: UID_A, api: createApi(), pantry: createMemoryPantry(PANTRY), budget });
    await waitForHydration();
    expect(recipeCtx.recipes).toEqual(generatedA);
  });

  it('5. cerrar sesión limpia el estado en memoria sin borrar lo persistido del usuario', async () => {
    const props = { uid: UID_A, api: createApi(), pantry: createMemoryPantry(PANTRY), budget: createMemoryBudget() };
    const app = await mount(props);
    await waitForHydration();
    await generate();
    await flushRecipeStorage(UID_A);
    const persisted = await AsyncStorage.getItem(getRecipeStorageKey(UID_A));

    await app.rerenderWith({ uid: null });

    expect(recipeCtx.isRestoring).toBe(false);
    expect(recipeCtx.isDemoMode).toBe(true);
    expect(recipeCtx.recipes.every((r) => r.isDemoFixture === true)).toBe(true);
    expect(recipeCtx.lastGeneratedAt).toBeNull();
    expect(await AsyncStorage.getItem(getRecipeStorageKey(UID_A))).toBe(persisted);
  });

  it('6. cambio de usuario durante la restauración: la lectura tardía de A no contamina a B', async () => {
    await new AsyncStorageRecipeAdapter(UID_A).save(makeCollection('gen_a'));
    const delayedA = delayedRecipeAdapter(UID_A);
    const api = createApi();
    const app = await mount({
      uid: UID_A,
      api,
      pantry: createMemoryPantry(PANTRY),
      budget: createMemoryBudget(),
      recipeStorage: delayedA.adapter,
    });
    expect(recipeCtx.isRestoring).toBe(true);

    // Un cambio de usuario real también cambia los almacenamientos de despensa y presupuesto
    await app.rerenderWith({
      uid: UID_B,
      recipeStorage: new AsyncStorageRecipeAdapter(UID_B),
      pantry: createMemoryPantry([]),
      budget: createMemoryBudget(),
    });
    await waitForHydration();
    await act(async () => delayedA.release());
    await flushRecipeStorage(UID_A);

    expect(recipeCtx.recipes).toEqual([]);
    expect(recipeCtx.lastGeneratedAt).toBeNull();
    expect(api.recommendRecipes).not.toHaveBeenCalled();
  });

  it('6b. cierre de sesión durante la restauración: la lectura tardía no se aplica', async () => {
    await new AsyncStorageRecipeAdapter(UID_A).save(makeCollection('gen_a'));
    const delayedA = delayedRecipeAdapter(UID_A);
    const app = await mount({
      uid: UID_A,
      api: createApi(),
      pantry: createMemoryPantry(PANTRY),
      budget: createMemoryBudget(),
      recipeStorage: delayedA.adapter,
    });

    await app.rerenderWith({ uid: null, recipeStorage: undefined });
    await act(async () => delayedA.release());
    await flushRecipeStorage(UID_A);

    expect(recipeCtx.isDemoMode).toBe(true);
    expect(recipeCtx.recipes.every((r) => r.isDemoFixture === true)).toBe(true);
    expect(recipeCtx.isRestoring).toBe(false);
  });

  it('7. una restauración tardía nunca sobrescribe una generación más reciente de la sesión', async () => {
    await new AsyncStorageRecipeAdapter(UID_A).save(makeCollection('gen_viejo', '2020-01-01T00:00:00.000Z'));
    const delayed = delayedRecipeAdapter(UID_A);
    const api = createApi(RECIPES_GEN_2);

    await mount({ uid: UID_A, api, pantry: createMemoryPantry(PANTRY), budget: createMemoryBudget(), recipeStorage: delayed.adapter });
    await waitFor(() => {
      expect(pantryCtx.isLoading).toBe(false);
      expect(budgetCtx.isLoading).toBe(false);
    });
    expect(recipeCtx.isRestoring).toBe(true);

    const fresh = await generate();
    await act(async () => delayed.release());
    await waitForHydration();
    await flushRecipeStorage(UID_A);

    expect(recipeCtx.recipes).toEqual(fresh);
    expect(recipeCtx.recipes.map((r) => r.id)).toEqual(['sopa-de-arroz', 'arroz-frito']);
    const stored = await readEnvelope(UID_A);
    expect(stored.generation.generationId).toBe(fresh[0].generationId);
  });

  it('14b. dos generaciones consecutivas: se persiste y restaura la última', async () => {
    const pantry = createMemoryPantry(PANTRY);
    const budget = createMemoryBudget();
    const app = await mount({ uid: UID_A, api: createApi(RECIPES_GEN_1, RECIPES_GEN_2), pantry, budget });
    await waitForHydration();
    await generate();
    const second = await generate();
    await flushRecipeStorage(UID_A);
    expect((await readEnvelope(UID_A)).generation.generationId).toBe(second[0].generationId);
    await app.unmount();

    await mount({ uid: UID_A, api: createApi(), pantry, budget });
    await waitForHydration();
    expect(recipeCtx.recipes).toEqual(second);
  });

  describe('8. Obsolescencia tras reinicio', () => {
    async function generateThenRestart(mutate: (p: MemoryPantry, b: MemoryBudget) => void) {
      const pantry = createMemoryPantry(PANTRY);
      const budget = createMemoryBudget();
      const first = await mount({ uid: UID_A, api: createApi(), pantry, budget });
      await waitForHydration();
      await generate();
      await flushRecipeStorage(UID_A);
      const storedBefore = await AsyncStorage.getItem(getRecipeStorageKey(UID_A));
      await first.unmount();

      mutate(pantry, budget);
      const restartApi = createApi();
      await mount({ uid: UID_A, api: restartApi, pantry, budget });
      await waitForHydration();
      return { restartApi, storedBefore };
    }

    it('sin cambios: la recomendación restaurada no es obsoleta', async () => {
      await generateThenRestart(() => {});
      expect(recipeCtx.recipes.length).toBe(2);
      expect(recipeCtx.isStale).toBe(false);
    });

    it('despensa modificada: se marca obsoleta sin actualizar el snapshot ni regenerar', async () => {
      const { restartApi, storedBefore } = await generateThenRestart((p) => {
        p.data = p.data.map((i) => (i.id === 'p-arroz' ? { ...i, quantity: 200 } : i));
      });
      expect(recipeCtx.isStale).toBe(true);
      expect(restartApi.recommendRecipes).not.toHaveBeenCalled();
      expect(await AsyncStorage.getItem(getRecipeStorageKey(UID_A))).toBe(storedBefore);
    });

    it('presupuesto, comensales o tiempo máximo modificados: obsoleta', async () => {
      await generateThenRestart((_p, b) => {
        b.prefs = { ...b.prefs, budget: 50000 };
      });
      expect(recipeCtx.isStale).toBe(true);
    });

    it('reinicio con despensa vacía: obsoleta y sin generación automática', async () => {
      const { restartApi } = await generateThenRestart((p) => {
        p.data = [];
      });
      expect(recipeCtx.recipes.length).toBe(2);
      expect(recipeCtx.isStale).toBe(true);
      expect(restartApi.recommendRecipes).not.toHaveBeenCalled();
    });

    it('sin avisos falsos mientras la despensa aún se hidrata', async () => {
      const pantry = createMemoryPantry(PANTRY);
      const budget = createMemoryBudget();
      const first = await mount({ uid: UID_A, api: createApi(), pantry, budget });
      await waitForHydration();
      await generate();
      await flushRecipeStorage(UID_A);
      await first.unmount();

      const pantryGate = gate();
      pantry.loadGate = pantryGate.promise;
      await mount({ uid: UID_A, api: createApi(), pantry, budget });
      await flushRecipeStorage(UID_A);

      expect(pantryCtx.isLoading).toBe(true);
      expect(recipeCtx.isRestoring).toBe(true);
      expect(recipeCtx.isStale).toBe(false);

      await act(async () => pantryGate.open());
      await waitForHydration();
      expect(recipeCtx.isStale).toBe(false);
      expect(recipeCtx.recipes.length).toBe(2);
    });
  });

  it('10. una receta restaurada ya consumida no admite una segunda deducción', async () => {
    const pantry = createMemoryPantry(PANTRY);
    const budget = createMemoryBudget();
    const first = await mount({ uid: UID_A, api: createApi(), pantry, budget });
    await waitForHydration();
    const [target] = await generate();
    await flushRecipeStorage(UID_A);

    let firstRes: any;
    await act(async () => {
      firstRes = await pantryCtx.consumeRecipeIngredients(target);
    });
    expect(firstRes.success).toBe(true);
    const afterFirst = pantry.data.map((i) => ({ ...i }));
    await first.unmount();

    await mount({ uid: UID_A, api: createApi(), pantry, budget });
    await waitForHydration();
    const restored = recipeCtx.recipes.find((r) => r.id === target.id)!;
    expect(restored.instanceId).toBe(target.instanceId);

    let deducted!: boolean;
    let secondRes: any;
    await act(async () => {
      deducted = await pantryCtx.checkIfRecipeDeducted(restored);
      secondRes = await pantryCtx.consumeRecipeIngredients(restored);
    });
    expect(deducted).toBe(true);
    expect(secondRes.success).toBe(false);
    expect(secondRes.alreadyDeducted).toBe(true);
    expect(pantry.data).toEqual(afterFirst);
  });

  it('11. almacenamiento corrupto: no muestra datos ni recurre a demo; la siguiente generación respalda el original', async () => {
    await AsyncStorage.setItem(getRecipeStorageKey(UID_A), '{corrupto');
    const api = createApi();
    await mount({ uid: UID_A, api, pantry: createMemoryPantry(PANTRY), budget: createMemoryBudget() });
    await waitForHydration();

    expect(recipeCtx.recipes).toEqual([]);
    expect(recipeCtx.isDemoMode).toBe(false);
    expect(api.recommendRecipes).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(getRecipeStorageKey(UID_A))).toBe('{corrupto');

    await generate();
    await flushRecipeStorage(UID_A);
    const keys = await AsyncStorage.getAllKeys();
    const backupKey = keys.find((k) => k.startsWith(`${getRecipeStorageKey(UID_A)}_backup_`))!;
    expect(await AsyncStorage.getItem(backupKey)).toBe('{corrupto');
    expect((await readEnvelope(UID_A)).version).toBe(RECIPE_STORAGE_VERSION);
  });

  it('11b. fallo de lectura: termina la restauración sin datos, sin demo y sin generar', async () => {
    const api = createApi();
    const failing: RecipeStorageAdapter = {
      load: () => Promise.reject(new Error('io-lectura')),
      reserveWriteOrder: () => new AsyncStorageRecipeAdapter(UID_A).reserveWriteOrder(),
      save: (c, order) => new AsyncStorageRecipeAdapter(UID_A).save(c, order),
    };
    await mount({ uid: UID_A, api, pantry: createMemoryPantry(PANTRY), budget: createMemoryBudget(), recipeStorage: failing });
    await waitForHydration();
    expect(recipeCtx.recipes).toEqual([]);
    expect(recipeCtx.isDemoMode).toBe(false);
    expect(recipeCtx.error).toBeNull();
    expect(api.recommendRecipes).not.toHaveBeenCalled();
  });

  it('12. fallo de escritura: la generación sigue siendo válida en memoria', async () => {
    await mount({ uid: UID_A, api: createApi(), pantry: createMemoryPantry(PANTRY), budget: createMemoryBudget() });
    await waitForHydration();
    (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error('disco lleno')));

    const result = await generate();
    await flushRecipeStorage(UID_A);

    expect(result.length).toBe(2);
    expect(recipeCtx.recipes).toEqual(result);
    expect(recipeCtx.error).toBeNull();
    expect(await AsyncStorage.getItem(getRecipeStorageKey(UID_A))).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      '[RecipeContext] No se pudieron persistir las recetas generadas:',
      expect.any(Error)
    );
  });

  it('13. colección contaminada con fixtures demo: se rechaza completa', async () => {
    const env = await validEnvelopeObject();
    env.recipes[1] = { ...env.recipes[1], isDemoFixture: true };
    const raw = JSON.stringify(env);
    await AsyncStorage.setItem(getRecipeStorageKey(UID_A), raw);

    await mount({ uid: UID_A, api: createApi(), pantry: createMemoryPantry(PANTRY), budget: createMemoryBudget() });
    await waitForHydration();
    expect(recipeCtx.recipes).toEqual([]);
    expect(recipeCtx.isDemoMode).toBe(false);
    expect(await AsyncStorage.getItem(getRecipeStorageKey(UID_A))).toBe(raw);
  });

  it('13b. usuario anónimo y colecciones inyectadas: comportamiento demo/en memoria intacto, sin persistencia', async () => {
    const getItemSpy = jest.spyOn(AsyncStorage, 'getItem');
    await mount({ uid: null, api: createApi(), pantry: createMemoryPantry(PANTRY), budget: createMemoryBudget() });
    expect(recipeCtx.isRestoring).toBe(false);
    expect(recipeCtx.isDemoMode).toBe(true);
    await generate();
    const keys = await AsyncStorage.getAllKeys();
    expect(keys.some((k) => k.includes('recipes_v1'))).toBe(false);

    const injected = [makeClientRecipe('Arroz con pollo', 'gen_inj')];
    await mount({
      uid: UID_A,
      api: createApi(),
      pantry: createMemoryPantry(PANTRY),
      budget: createMemoryBudget(),
      initialRecipes: injected,
    });
    expect(recipeCtx.isRestoring).toBe(false);
    expect(getItemSpy.mock.calls.some((c) => String(c[0]).includes('recipes_v1'))).toBe(false);
  });

  it('15. no modifica registros ajenos: plan de comidas, ledger y otras claves', async () => {
    const unrelated: [string, string][] = [
      [getMealPlanStorageKey(UID_A), '{"version":1,"plan":"intacto"}'],
      [getConsumedRecipesStorageKey(UID_A), '{"version":1,"records":{}}'],
      ['@foodai:otro:dato', 'valor'],
    ];
    await AsyncStorage.multiSet(unrelated);

    const pantry = createMemoryPantry(PANTRY);
    const budget = createMemoryBudget();
    const app = await mount({ uid: UID_A, api: createApi(), pantry, budget });
    await waitForHydration();
    await generate();
    await flushRecipeStorage(UID_A);
    await app.unmount();
    await mount({ uid: UID_A, api: createApi(), pantry, budget });
    await waitForHydration();

    for (const [key, value] of unrelated) {
      expect(await AsyncStorage.getItem(key)).toBe(value);
    }
  });
});

// =============================================================================================
// 3. Pantallas Inicio y Recetas durante la recuperación en frío
// =============================================================================================

describe('Bloque 5 — Inicio y Recetas durante la recuperación en frío', () => {
  function screenTree(Screen: React.ComponentType, recipeStorage: RecipeStorageAdapter) {
    return (
      <SafeAreaProvider
        initialMetrics={{ insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 390, height: 844 } }}
      >
        <TypographyProvider usingFallback={true}>
          <ThemeProvider initialMode="light">
            <Providers
              uid={UID_A}
              api={createApi()}
              pantry={createMemoryPantry(PANTRY)}
              budget={createMemoryBudget()}
              recipeStorage={recipeStorage}
            >
              <Screen />
            </Providers>
          </ThemeProvider>
        </TypographyProvider>
      </SafeAreaProvider>
    );
  }

  it('Inicio muestra carga durante la restauración y luego la recomendación restaurada', async () => {
    await new AsyncStorageRecipeAdapter(UID_A).save(matchingCollection());
    const delayed = delayedRecipeAdapter(UID_A);
    const screen = await render(screenTree(HomeScreen, delayed.adapter));
    await waitFor(() => expect(pantryCtx.isLoading).toBe(false));

    expect(screen.getByTestId('home-recommendation-loading')).toBeTruthy();
    expect(screen.queryByTestId('home-empty-recipe-state')).toBeNull();

    await act(async () => delayed.release());
    await waitFor(() => expect(screen.getByTestId('home-recommended-recipe-card')).toBeTruthy());
    expect(screen.queryByTestId('home-recommendation-stale-state')).toBeNull();
  });

  it('Recetas muestra carga durante la restauración en lugar de "Aún no has generado recetas"', async () => {
    await new AsyncStorageRecipeAdapter(UID_A).save(matchingCollection());
    const delayed = delayedRecipeAdapter(UID_A);
    const screen = await render(screenTree(RecipeDiscoveryScreen, delayed.adapter));
    await waitFor(() => expect(pantryCtx.isLoading).toBe(false));

    expect(screen.getByTestId('recipes-loading-state')).toBeTruthy();
    expect(screen.queryByTestId('recipes-no-generated-state')).toBeNull();

    await act(async () => delayed.release());
    await waitFor(() => expect(screen.queryByTestId('recipes-loading-state')).toBeNull());
    expect(screen.queryByTestId('recipes-no-generated-state')).toBeNull();
    expect(screen.queryByTestId('recipes-stale-banner')).toBeNull();
  });
});

// =============================================================================================
// 4. Bloque 5B — Orden lógico independiente del reloj y aviso visible de persistencia
// =============================================================================================

describe('Bloque 5B — Orden lógico de escritura independiente del reloj', () => {
  it('1. el reloj retrocede entre generaciones: se guarda la última generación aceptada', async () => {
    const adapter = new AsyncStorageRecipeAdapter(UID_A);
    const first = makeCollection('gen_primera', '2026-11-07T12:00:00.000Z');
    const second = makeCollection('gen_segunda', '2026-11-07T09:00:00.000Z'); // reloj retrocedió 3 h

    expect(await adapter.save(first, adapter.reserveWriteOrder())).toEqual({ status: 'saved' });
    expect(await adapter.save(second, adapter.reserveWriteOrder())).toEqual({ status: 'saved' });

    const stored = await readEnvelope(UID_A);
    expect(stored.generation.generationId).toBe('gen_segunda');
    // generatedAt original se conserva para presentación
    expect(stored.generation.generatedAt).toBe('2026-11-07T09:00:00.000Z');
  });

  it('1b. en RecipeContext, con Date retrocediendo, la segunda generación persiste y se restaura', async () => {
    jest.useFakeTimers({
      doNotFake: [
        'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame',
        'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate',
        'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
      ],
    });
    try {
      const pantry = createMemoryPantry(PANTRY);
      const budget = createMemoryBudget();
      const api = createApi(RECIPES_GEN_1, RECIPES_GEN_2);
      jest.setSystemTime(new Date('2026-11-07T12:00:00.000Z'));
      const app = await mount({ uid: UID_A, api, pantry, budget });
      await waitForHydration();
      await generate();

      jest.setSystemTime(new Date('2026-11-07T08:00:00.000Z')); // el reloj retrocede 4 h
      const second = await generate();
      await flushRecipeStorage(UID_A);
      expect(recipeCtx.lastGeneratedAt).toBe('2026-11-07T08:00:00.000Z');
      await app.unmount();

      await mount({ uid: UID_A, api: createApi(), pantry, budget });
      await waitForHydration();
      expect(recipeCtx.recipes).toEqual(second);
      expect(recipeCtx.recipes.map((r) => r.instanceId)).toEqual(second.map((r) => r.instanceId));
      expect(recipeCtx.lastGeneratedAt).toBe('2026-11-07T08:00:00.000Z');
      expect(recipeCtx.persistenceWarning).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('2. dos generaciones rápidas con la primera escritura lenta: no se sobrescriben incorrectamente', async () => {
    const original = (AsyncStorage.setItem as jest.Mock).getMockImplementation()!;
    (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(
      (k: string, v: string) => new Promise((resolve) => setTimeout(() => resolve(original(k, v)), 40))
    );
    const adapter = new AsyncStorageRecipeAdapter(UID_A);
    const [r1, r2] = await Promise.all([
      adapter.save(makeCollection('gen_rapida_1'), adapter.reserveWriteOrder()),
      adapter.save(makeCollection('gen_rapida_2'), adapter.reserveWriteOrder()),
    ]);
    expect(r1).toEqual({ status: 'saved' });
    expect(r2).toEqual({ status: 'saved' });
    expect((await readEnvelope(UID_A)).generation.generationId).toBe('gen_rapida_2');
  });

  it('3. una escritura retrasada de una generación anterior no la restaura, aunque la posterior haya fallado', async () => {
    const adapter = new AsyncStorageRecipeAdapter(UID_A);
    const olderOrder = adapter.reserveWriteOrder();
    const newerOrder = adapter.reserveWriteOrder();

    await adapter.save(makeCollection('gen_posterior'), newerOrder);
    expect(await adapter.save(makeCollection('gen_anterior'), olderOrder)).toEqual({ status: 'skipped_older' });
    expect((await readEnvelope(UID_A)).generation.generationId).toBe('gen_posterior');

    // La posterior falla al escribir: la anterior retrasada tampoco puede ocupar su lugar
    const o1 = adapter.reserveWriteOrder();
    const o2 = adapter.reserveWriteOrder();
    (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error('io')));
    await expect(adapter.save(makeCollection('gen_fallida'), o2)).rejects.toThrow('io');
    expect(await adapter.save(makeCollection('gen_retrasada'), o1)).toEqual({ status: 'skipped_older' });
    expect((await readEnvelope(UID_A)).generation.generationId).toBe('gen_posterior');
  });

  it('4/6. tras remontar el proveedor, una escritura tardía del montaje anterior no gana y se preservan los ids', async () => {
    const pantry = createMemoryPantry(PANTRY);
    const budget = createMemoryBudget();
    const staleAdapter = new AsyncStorageRecipeAdapter(UID_A);
    const staleOrder = staleAdapter.reserveWriteOrder(); // reservado por el montaje anterior

    const app = await mount({ uid: UID_A, api: createApi(RECIPES_GEN_2), pantry, budget });
    await waitForHydration();
    const fresh = await generate();
    await flushRecipeStorage(UID_A);

    expect(await staleAdapter.save(makeCollection('gen_montaje_anterior'), staleOrder)).toEqual({
      status: 'skipped_older',
    });
    await app.unmount();

    await mount({ uid: UID_A, api: createApi(), pantry, budget });
    await waitForHydration();
    expect(recipeCtx.recipes.map((r) => [r.id, r.instanceId, r.generationId])).toEqual(
      fresh.map((r) => [r.id, r.instanceId, r.generationId])
    );
  });

  it('5. los registros v1 existentes siguen siendo legibles y el esquema no cambia', async () => {
    const legacyV1 = {
      version: 1,
      ownerUserId: UID_A,
      savedAt: '2026-11-06T10:00:00.000Z',
      generation: {
        generationId: 'gen_legado',
        generatedAt: '2026-11-06T09:59:00.000Z',
        snapshot: { pantryFingerprint: fingerprintOf(PANTRY), budget: 20000, servings: 2, maxMinutes: 30 },
      },
      recipes: (await validEnvelopeObject()).recipes.map((r: any) => ({
        ...r,
        generationId: 'gen_legado',
        instanceId: `${r.id}::gen_legado`,
      })),
    };
    const raw = JSON.stringify(legacyV1);
    await AsyncStorage.setItem(getRecipeStorageKey(UID_A), raw);

    const api = createApi();
    await mount({ uid: UID_A, api, pantry: createMemoryPantry(PANTRY), budget: createMemoryBudget() });
    await waitForHydration();
    expect(recipeCtx.recipes.map((r) => r.instanceId)).toEqual([
      'arroz-con-pollo::gen_legado',
      'pollo-sudado::gen_legado',
    ]);
    expect(recipeCtx.isStale).toBe(false);
    expect(api.recommendRecipes).not.toHaveBeenCalled();
    // La lectura no migra ni reescribe el registro
    expect(await AsyncStorage.getItem(getRecipeStorageKey(UID_A))).toBe(raw);

    await generate();
    await flushRecipeStorage(UID_A);
    const rewritten = await readEnvelope(UID_A);
    expect(Object.keys(rewritten).sort()).toEqual(['generation', 'ownerUserId', 'recipes', 'savedAt', 'version']);
    expect(rewritten.version).toBe(1);
  });
});

describe('Bloque 5B — Aviso visible y no bloqueante de persistencia', () => {
  let api: any;
  function recipesScreen(uid: string | null, pantry: MemoryPantry, budget: MemoryBudget) {
    return (
      <SafeAreaProvider
        initialMetrics={{ insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 390, height: 844 } }}
      >
        <TypographyProvider usingFallback={true}>
          <ThemeProvider initialMode="light">
            <Providers uid={uid} api={api} pantry={pantry} budget={budget}>
              <RecipeDiscoveryScreen />
            </Providers>
          </ThemeProvider>
        </TypographyProvider>
      </SafeAreaProvider>
    );
  }

  it('7/8/10. fallo de escritura: aviso visible sin bloquear; un guardado verificado posterior lo retira', async () => {
    api = createApi(RECIPES_GEN_1, RECIPES_GEN_2);
    const screen = await render(recipesScreen(UID_A, createMemoryPantry(PANTRY), createMemoryBudget()));
    await waitForHydration();

    (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(() =>
      Promise.reject(new Error(`disco lleno en ${getRecipeStorageKey(UID_A)}`))
    );
    await generate();
    await flushRecipeStorage(UID_A);

    // La generación con IA fue exitosa y sus recetas siguen visibles
    const warning = await screen.findByTestId('recipes-persistence-warning');
    expect(warning).toBeTruthy();
    const live = screen.getByTestId('recipes-persistence-warning-live');
    expect(live.props.accessibilityRole).toBe('alert');
    expect(live.props.accessibilityLiveRegion).toBe('polite');
    expect(screen.getByText('Recetas no guardadas en este dispositivo')).toBeTruthy();
    expect(screen.getByText(/se generaron correctamente/)).toBeTruthy();
    expect(screen.getByText(/podrían no conservarse si cierras la app/)).toBeTruthy();
    expect(screen.getByTestId('recipe-card-arroz-con-pollo')).toBeTruthy();
    expect(screen.queryByTestId('recipes-api-error-card')).toBeNull();
    expect(recipeCtx.error).toBeNull();
    expect(recipeCtx.persistenceWarningCode).toBe('write_failed');
    // Sin detalles internos (mensaje del error ni clave de almacenamiento) en la interfaz
    expect(recipeCtx.persistenceWarning).not.toMatch(/disco lleno|@foodai|usr-/);
    expect(screen.queryByText(/disco lleno/)).toBeNull();
    // El error original se conserva para diagnóstico interno
    expect(warnSpy).toHaveBeenCalledWith(
      '[RecipeContext] No se pudieron persistir las recetas generadas:',
      expect.objectContaining({ message: expect.stringContaining('disco lleno') })
    );
    // Sin reintentos automáticos de Gemini; la generación sigue disponible
    expect(api.recommendRecipes).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('recipes-generate-ai-button').props.accessibilityState?.disabled).not.toBe(true);

    // Nueva generación explícita con guardado verificado: el aviso desaparece
    await generate();
    await flushRecipeStorage(UID_A);
    await waitFor(() => expect(screen.queryByTestId('recipes-persistence-warning')).toBeNull());
    expect(recipeCtx.persistenceWarningCode).toBeNull();
    expect(api.recommendRecipes).toHaveBeenCalledTimes(2);
  });

  it('el aviso puede descartarse sin afectar las recetas', async () => {
    api = createApi();
    const screen = await render(recipesScreen(UID_A, createMemoryPantry(PANTRY), createMemoryBudget()));
    await waitForHydration();
    (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error('io')));
    await generate();
    await flushRecipeStorage(UID_A);
    await screen.findByTestId('recipes-persistence-warning');

    await act(async () => {
      fireEvent.press(screen.getByTestId('recipes-dismiss-persistence-warning-button'));
    });
    expect(screen.queryByTestId('recipes-persistence-warning')).toBeNull();
    expect(recipeCtx.recipes.length).toBe(2);
  });

  it('9. versión de almacenamiento futura: no se sobrescribe y se avisa específicamente', async () => {
    const env = await validEnvelopeObject();
    const raw = JSON.stringify({ ...env, version: 2 });
    await AsyncStorage.setItem(getRecipeStorageKey(UID_A), raw);
    api = createApi();
    const screen = await render(recipesScreen(UID_A, createMemoryPantry(PANTRY), createMemoryBudget()));
    await waitForHydration();
    expect(recipeCtx.recipes).toEqual([]);

    await generate();
    await flushRecipeStorage(UID_A);

    expect(await screen.findByTestId('recipes-persistence-warning')).toBeTruthy();
    expect(recipeCtx.persistenceWarningCode).toBe('unsupported_version');
    expect(screen.getByText(/versión más reciente de FoodAI/)).toBeTruthy();
    expect(recipeCtx.recipes.length).toBe(2);
    expect(recipeCtx.recipes.every((r) => r.isDemoFixture === false)).toBe(true);
    expect(await AsyncStorage.getItem(getRecipeStorageKey(UID_A))).toBe(raw);
    expect(api.recommendRecipes).toHaveBeenCalledTimes(1);
  });

  it('11. el aviso no se traslada a otra cuenta y cada usuario conserva su propio registro', async () => {
    const app = await mount({ uid: UID_A, api: createApi(), pantry: createMemoryPantry(PANTRY), budget: createMemoryBudget() });
    await waitForHydration();
    (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error('io')));
    await generate();
    await flushRecipeStorage(UID_A);
    expect(recipeCtx.persistenceWarningCode).toBe('write_failed');

    await app.rerenderWith({
      uid: UID_B,
      pantry: createMemoryPantry(PANTRY),
      budget: createMemoryBudget(),
    });
    await waitForHydration();
    expect(recipeCtx.persistenceWarning).toBeNull();
    expect(recipeCtx.recipes).toEqual([]);

    await generate();
    await flushRecipeStorage(UID_B);
    expect(recipeCtx.persistenceWarning).toBeNull();
    expect((await readEnvelope(UID_B)).ownerUserId).toBe(UID_B);
    expect(await AsyncStorage.getItem(getRecipeStorageKey(UID_A))).toBeNull();
  });

  it('12. con persistencia fallida, el ledger mantiene la idempotencia y la guardia demo sigue activa', async () => {
    const pantry = createMemoryPantry(PANTRY);
    await mount({ uid: UID_A, api: createApi(), pantry, budget: createMemoryBudget() });
    await waitForHydration();
    (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error('io')));
    const [target] = await generate();
    await flushRecipeStorage(UID_A);
    expect(recipeCtx.persistenceWarningCode).toBe('write_failed');

    let first: any;
    let second: any;
    let demo: any;
    await act(async () => {
      first = await pantryCtx.consumeRecipeIngredients(target);
      second = await pantryCtx.consumeRecipeIngredients(target);
      demo = await pantryCtx.consumeRecipeIngredients({ ...target, isDemoFixture: true });
    });
    expect(first.success).toBe(true);
    expect(second.alreadyDeducted).toBe(true);
    expect(demo.success).toBe(false);
    expect(demo.alreadyDeducted).toBe(false);
    expect(pantry.data.find((i) => i.id === 'p-arroz')?.quantity).toBe(700);
  });
});
