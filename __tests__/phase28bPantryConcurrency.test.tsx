/**
 * Fase 28B — Integridad de la despensa ante mutaciones concurrentes (D3) y fusión atómica de
 * cantidades del escáner (D4).
 *
 * D3: consumeRecipeIngredients lee la despensa, registra la intención en el ledger y luego escribe
 *     la lista completa. Una mutación individual que se colara entre la lectura y la escritura se
 *     perdía (en almacenamiento y en memoria). Todas las mutaciones deben serializarse.
 * D4: la suma de cantidades del escáner debe calcularse contra el estado persistido más reciente,
 *     dentro de una operación serializada, nunca contra una instantánea de React.
 */
import React from 'react';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PantryProvider, usePantry } from '../src/context/PantryContext';
import { AsyncStoragePantryAdapter } from '../src/services/storage/pantryStorage';
import { getConsumedRecipeRecords } from '../src/services/storage/recipeConsumptionStorage';
import { Ingredient } from '../src/types/pantry';
import { ClientRecipe } from '../src/types/recipe';

const now = '2026-01-01T00:00:00.000Z';

const basePantry = (): Ingredient[] => [
  { id: 'ing-pollo', name: 'Pollo', quantity: 500, unit: 'g', category: 'Carnes y proteínas', createdAt: now, updatedAt: now },
  { id: 'ing-arroz', name: 'Arroz', quantity: 1, unit: 'kg', category: 'Granos y cereales', createdAt: now, updatedAt: now },
  { id: 'ing-leche', name: 'Leche', quantity: 1, unit: 'l', category: 'Lácteos', createdAt: now, updatedAt: now },
];

const recipe = {
  id: 'pollo-salteado',
  instanceId: 'pollo-salteado::gen_28b',
  isDemoFixture: false,
  name: 'Pollo salteado',
  ingredients: [{ name: 'Pollo', quantity: 200, unit: 'g' }],
} as unknown as ClientRecipe;

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}
function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/**
 * Adaptador real (cola FIFO sobre AsyncStorage) con la posibilidad de ensanchar la ventana entre la
 * lectura que hace consumeRecipeIngredients y su escritura posterior.
 */
function createGatedAdapter(key: string) {
  const real = new AsyncStoragePantryAdapter(key);
  let armed = false;
  let gate: Deferred = deferred();
  let readSeen: Deferred = deferred();

  const adapter = {
    getIngredients: async () => {
      const list = await real.getIngredients();
      if (armed) {
        armed = false;
        readSeen.resolve();
        await gate.promise;
      }
      return list;
    },
    saveIngredients: (l: Ingredient[]) => real.saveIngredients(l),
    addIngredient: (i: any) => real.addIngredient(i),
    updateIngredient: (i: any) => real.updateIngredient(i),
    deleteIngredient: (id: string) => real.deleteIngredient(id),
    clearIngredients: () => real.clearIngredients(),
    adjustQuantity: (id: string, d: number) => real.adjustQuantity(id, d),
  };

  return {
    real,
    adapter,
    armNextRead: () => {
      gate = deferred();
      readSeen = deferred();
      armed = true;
      return { readSeen: readSeen.promise, release: () => gate.resolve() };
    },
  };
}

async function renderPantry(adapter: any) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <PantryProvider storageAdapter={adapter}>{children}</PantryProvider>
  );
  const hook = await renderHook(() => usePantry(), { wrapper });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

/** Indica si una promesa ya se resolvió, sin bloquear. */
async function isSettled(p: Promise<unknown>): Promise<boolean> {
  let settled = false;
  p.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    }
  );
  await new Promise((r) => setTimeout(r, 0));
  return settled;
}

afterEach(async () => {
  cleanup();
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe('D3 — mutaciones de despensa concurrentes con el consumo de recetas', () => {
  const runInterleaving = async (
    mutate: (ctx: ReturnType<typeof usePantry>) => Promise<unknown>,
    key: string
  ) => {
    const { real, adapter, armNextRead } = createGatedAdapter(key);
    await real.saveIngredients(basePantry());
    const { result } = await renderPantry(adapter);

    const { readSeen, release } = armNextRead();
    let consumeP!: Promise<any>;
    await act(async () => {
      consumeP = result.current.consumeRecipeIngredients(recipe);
    });
    await readSeen; // El consumo ya leyó la despensa y aún no escribe

    let mutationP!: Promise<unknown>;
    await act(async () => {
      mutationP = mutate(result.current);
    });

    // Serialización: la mutación no puede completarse mientras el consumo mantiene el candado
    expect(await isSettled(mutationP)).toBe(false);

    release();
    let consumeResult: any;
    await act(async () => {
      consumeResult = await consumeP;
      await mutationP;
    });

    expect(consumeResult.success).toBe(true);
    return { real, result };
  };

  it('no pierde un addIngredient que llega entre la lectura y la escritura del consumo', async () => {
    const { real, result } = await runInterleaving(
      (ctx) => ctx.addIngredient({ name: 'Huevos', quantity: 12, unit: 'unidad', category: 'Carnes y proteínas' }),
      '@test28b:pantry:add'
    );

    const stored = await real.getIngredients();
    expect(stored.find((i) => i.name === 'Huevos')?.quantity).toBe(12);
    expect(stored.find((i) => i.id === 'ing-pollo')?.quantity).toBe(300);

    // La memoria refleja ambas mutaciones (sin carreras entre React y el almacenamiento)
    expect(result.current.ingredients.find((i) => i.name === 'Huevos')?.quantity).toBe(12);
    expect(result.current.ingredients.find((i) => i.id === 'ing-pollo')?.quantity).toBe(300);
  });

  it('no pierde un updateIngredient concurrente sobre otro alimento', async () => {
    const { real, result } = await runInterleaving(
      (ctx) => ctx.updateIngredient({ id: 'ing-arroz', quantity: 3 }),
      '@test28b:pantry:update'
    );
    const stored = await real.getIngredients();
    expect(stored.find((i) => i.id === 'ing-arroz')?.quantity).toBe(3);
    expect(stored.find((i) => i.id === 'ing-pollo')?.quantity).toBe(300);
    expect(result.current.ingredients.find((i) => i.id === 'ing-arroz')?.quantity).toBe(3);
    expect(result.current.ingredients.find((i) => i.id === 'ing-pollo')?.quantity).toBe(300);
  });

  it('no resucita un alimento eliminado de forma concurrente', async () => {
    const { real, result } = await runInterleaving(
      (ctx) => ctx.deleteIngredient('ing-leche'),
      '@test28b:pantry:delete'
    );
    const stored = await real.getIngredients();
    expect(stored.some((i) => i.id === 'ing-leche')).toBe(false);
    expect(stored.find((i) => i.id === 'ing-pollo')?.quantity).toBe(300);
    expect(result.current.ingredients.some((i) => i.id === 'ing-leche')).toBe(false);
  });

  it('no pierde un adjustQuantity concurrente sobre el mismo alimento descontado', async () => {
    const { real, result } = await runInterleaving(
      (ctx) => ctx.adjustQuantity('ing-pollo', 100),
      '@test28b:pantry:adjust'
    );
    // 500 g - 200 g (consumo) + 100 g (ajuste) = 400 g
    const stored = await real.getIngredients();
    expect(stored.find((i) => i.id === 'ing-pollo')?.quantity).toBe(400);
    expect(result.current.ingredients.find((i) => i.id === 'ing-pollo')?.quantity).toBe(400);
  });

  it('confirma el consumo en el ledger una sola vez y conserva la idempotencia', async () => {
    const { result } = await runInterleaving(
      (ctx) => ctx.addIngredient({ name: 'Cebolla', quantity: 2, unit: 'unidad', category: 'Verduras y frutas' }),
      '@test28b:pantry:ledger'
    );
    const records = await getConsumedRecipeRecords(null);
    const record = records['pollo-salteado::gen_28b'];
    expect(record).toBeDefined();
    expect(record.status === undefined || record.status === 'completed').toBe(true);

    let second: any;
    await act(async () => {
      second = await result.current.consumeRecipeIngredients(recipe);
    });
    expect(second.success).toBe(false);
    expect(second.alreadyDeducted).toBe(true);
    expect(result.current.ingredients.find((i) => i.id === 'ing-pollo')?.quantity).toBe(300);
  });

  it('no produce bloqueos: una mutación fallida libera el candado para las siguientes', async () => {
    const real = new AsyncStoragePantryAdapter('@test28b:pantry:deadlock');
    await real.saveIngredients(basePantry());
    const { result } = await renderPantry(real);

    await act(async () => {
      await expect(result.current.updateIngredient({ id: 'no-existe', quantity: 2 })).rejects.toThrow();
    });
    await act(async () => {
      await result.current.addIngredient({ name: 'Tomate', quantity: 3, unit: 'unidad', category: 'Verduras y frutas' });
    });
    let consumeResult: any;
    await act(async () => {
      consumeResult = await result.current.consumeRecipeIngredients(recipe);
    });
    expect(consumeResult.success).toBe(true);
    const stored = await real.getIngredients();
    expect(stored.some((i) => i.name === 'Tomate')).toBe(true);
    expect(stored.find((i) => i.id === 'ing-pollo')?.quantity).toBe(300);
  });

  it('checkIfRecipeDeducted espera al consumo en curso y no reconcilia su intención a medias', async () => {
    const { real, adapter, armNextRead } = createGatedAdapter('@test28b:pantry:check');
    await real.saveIngredients(basePantry());
    const { result } = await renderPantry(adapter);

    const { readSeen, release } = armNextRead();
    let consumeP!: Promise<any>;
    await act(async () => {
      consumeP = result.current.consumeRecipeIngredients(recipe);
    });
    await readSeen;

    let checkP!: Promise<boolean>;
    await act(async () => {
      checkP = result.current.checkIfRecipeDeducted(recipe);
    });
    expect(await isSettled(checkP)).toBe(false);

    release();
    let consumeResult: any;
    let deducted = false;
    await act(async () => {
      consumeResult = await consumeP;
      deducted = await checkP;
    });
    expect(consumeResult.success).toBe(true);
    expect(deducted).toBe(true);
    expect((await real.getIngredients()).find((i) => i.id === 'ing-pollo')?.quantity).toBe(300);
  });
});

describe('D4 — fusión atómica de cantidades contra el estado persistido', () => {
  it('escenario obligatorio: 1 kg + incremento concurrente de 1 kg + 500 g del escáner = 2,5 kg', async () => {
    const real = new AsyncStoragePantryAdapter('@test28b:merge:required');
    await real.saveIngredients(basePantry());
    const { result } = await renderPantry(real);

    // La instantánea de React dice 1 kg; el almacenamiento recibe +1 kg por otra vía
    expect(result.current.ingredients.find((i) => i.id === 'ing-arroz')?.quantity).toBe(1);
    await real.adjustQuantity('ing-arroz', 1);

    let merge: any;
    await act(async () => {
      merge = await result.current.mergeIngredientQuantity('ing-arroz', 500, 'g');
    });

    expect(merge.status).toBe('merged');
    const arroz = (await real.getIngredients()).find((i) => i.id === 'ing-arroz');
    expect(arroz?.quantity).toBe(2.5);
    expect(arroz?.unit).toBe('kg');
    expect(result.current.ingredients.find((i) => i.id === 'ing-arroz')?.quantity).toBe(2.5);
  });

  it('serializa un incremento y una fusión lanzados a la vez sin perder ninguno', async () => {
    const real = new AsyncStoragePantryAdapter('@test28b:merge:parallel');
    await real.saveIngredients(basePantry());
    const { result } = await renderPantry(real);

    await act(async () => {
      await Promise.all([
        result.current.adjustQuantity('ing-arroz', 1),
        result.current.mergeIngredientQuantity('ing-arroz', 500, 'g'),
      ]);
    });

    expect((await real.getIngredients()).find((i) => i.id === 'ing-arroz')?.quantity).toBe(2.5);
    expect(result.current.ingredients.find((i) => i.id === 'ing-arroz')?.quantity).toBe(2.5);
  });

  it('acumula varias detecciones del mismo alimento en un lote (2 kg + 500 g + 1 kg = 3,5 kg)', async () => {
    const real = new AsyncStoragePantryAdapter('@test28b:merge:batch');
    await real.saveIngredients([{ ...basePantry()[1], quantity: 2 }]);
    const { result } = await renderPantry(real);

    await act(async () => {
      await result.current.mergeIngredientQuantity('ing-arroz', 500, 'g');
      await result.current.mergeIngredientQuantity('ing-arroz', 1, 'kg');
    });
    const stored = await real.getIngredients();
    expect(stored).toHaveLength(1);
    expect(stored[0].quantity).toBe(3.5);
    expect(stored[0].unit).toBe('kg');
  });

  it('convierte ml ↔ l conservando la unidad persistida', async () => {
    const real = new AsyncStoragePantryAdapter('@test28b:merge:volume');
    await real.saveIngredients(basePantry());
    const { result } = await renderPantry(real);

    let merge: any;
    await act(async () => {
      merge = await result.current.mergeIngredientQuantity('ing-leche', 250, 'ml');
    });
    expect(merge.status).toBe('merged');
    const leche = (await real.getIngredients()).find((i) => i.id === 'ing-leche');
    expect(leche?.quantity).toBe(1.25);
    expect(leche?.unit).toBe('l');
  });

  it.each([
    ['masa sobre volumen (g → l)', 'ing-leche', 500, 'g'],
    ['volumen sobre masa (ml → kg)', 'ing-arroz', 500, 'ml'],
    ['unidad sobre masa', 'ing-arroz', 2, 'unidad'],
    ['unidad desconocida', 'ing-arroz', 2, 'desconocida'],
    ['taza sobre masa', 'ing-arroz', 1, 'taza'],
  ])('nunca suma unidades incompatibles: %s', async (_label, id, qty, unit) => {
    const real = new AsyncStoragePantryAdapter(`@test28b:merge:incompat:${unit}`);
    await real.saveIngredients(basePantry());
    const { result } = await renderPantry(real);
    const before = (await real.getIngredients()).find((i) => i.id === id);

    let merge: any;
    await act(async () => {
      merge = await result.current.mergeIngredientQuantity(id as string, qty as number, unit as any);
    });

    expect(merge.status).toBe('incompatible_units');
    const after = (await real.getIngredients()).find((i) => i.id === id);
    expect(after?.quantity).toBe(before?.quantity);
    expect(after?.unit).toBe(before?.unit);
  });

  it('decide la compatibilidad con la unidad persistida actual, no con la de la instantánea', async () => {
    const real = new AsyncStoragePantryAdapter('@test28b:merge:unitchange');
    await real.saveIngredients(basePantry());
    const { result } = await renderPantry(real);

    // Otro flujo cambia la unidad del arroz a «unidad» tras la revisión del escáner
    await real.updateIngredient({ id: 'ing-arroz', quantity: 4, unit: 'unidad' });

    let merge: any;
    await act(async () => {
      merge = await result.current.mergeIngredientQuantity('ing-arroz', 500, 'g');
    });
    expect(merge.status).toBe('incompatible_units');
    const arroz = (await real.getIngredients()).find((i) => i.id === 'ing-arroz');
    expect(arroz?.quantity).toBe(4);
    expect(arroz?.unit).toBe('unidad');
  });

  it('informa not_found si el registro ya no existe en el almacenamiento', async () => {
    const real = new AsyncStoragePantryAdapter('@test28b:merge:missing');
    await real.saveIngredients(basePantry());
    const { result } = await renderPantry(real);
    await real.deleteIngredient('ing-arroz');

    let merge: any;
    await act(async () => {
      merge = await result.current.mergeIngredientQuantity('ing-arroz', 500, 'g');
    });
    expect(merge.status).toBe('not_found');
    expect((await real.getIngredients()).some((i) => i.id === 'ing-arroz')).toBe(false);
  });

  it('rechaza cantidades inválidas sin tocar el almacenamiento', async () => {
    const real = new AsyncStoragePantryAdapter('@test28b:merge:invalid');
    await real.saveIngredients(basePantry());
    const { result } = await renderPantry(real);

    await act(async () => {
      await expect(result.current.mergeIngredientQuantity('ing-arroz', 0, 'kg')).rejects.toThrow();
      await expect(result.current.mergeIngredientQuantity('ing-arroz', Number.NaN, 'kg')).rejects.toThrow();
    });
    expect((await real.getIngredients()).find((i) => i.id === 'ing-arroz')?.quantity).toBe(1);
  });
});
