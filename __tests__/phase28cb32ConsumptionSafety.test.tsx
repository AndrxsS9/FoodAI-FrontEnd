/**
 * Fase 28C-B3.2 — Corrección crítica de seguridad del consumo de recetas.
 *
 * Solo una coincidencia EXACTA (incluida la identidad bilingüe explícita) puede descontar
 * inventario. Una coincidencia POSIBLE se reporta para revisión manual, conserva el registro
 * de despensa como contexto y jamás modifica el stock ni el stock remanente del cálculo.
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Ingredient } from '../src/types/pantry';
import { ClientRecipe, RecipeIngredient } from '../src/types/recipe';
import {
  POSSIBLE_MATCH_REVIEW_MESSAGE,
  applyPantryDeduction,
  calculatePantryDeduction,
} from '../src/utils/pantryConsumption';
import { getConsumedRecipeRecords } from '../src/services/storage/recipeConsumptionStorage';
import { PantryStorageAdapter } from '../src/services/storage/pantryStorage';
import { PantryProvider, usePantry, ConsumeRecipeResult } from '../src/context/PantryContext';
import { localizeMessage } from '../src/locales/messages';

function pantryItem(
  id: string,
  name: string,
  quantity: number,
  unit: Ingredient['unit'],
  category: Ingredient['category'] = 'Verduras y frutas'
): Ingredient {
  return {
    id,
    name,
    quantity,
    unit,
    category,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function ing(name: string, quantity: number | null, unit: string): RecipeIngredient {
  return { name, quantity, unit } as RecipeIngredient;
}

// ---------------------------------------------------------------------------
// 1-2. Coincidencias exactas: se pueden descontar
// ---------------------------------------------------------------------------

describe('Consumo — coincidencias exactas descuentan', () => {
  it('1. coincidencia exacta en español («Cebollas» vs «Cebolla»)', () => {
    const pantry = [pantryItem('p-cebolla', 'Cebolla', 4, 'unidad')];
    const plan = calculatePantryDeduction(pantry, [ing('Cebollas', 1, 'unidad')]);

    expect(plan.items[0].status).toBe('deductible_full');
    expect(plan.items[0].deductQuantity).toBe(1);
    expect(plan.items[0].stockAfter).toBe(3);
    expect(plan.canDeductAny).toBe(true);
  });

  it('2. coincidencia exacta inglés-español («Onions» vs «Cebolla», «Milk» ml vs «Leche» l)', () => {
    const pantry = [
      pantryItem('p-cebolla', 'Cebolla', 4, 'unidad'),
      pantryItem('p-leche', 'Leche', 1, 'l', 'Lácteos'),
    ];
    const plan = calculatePantryDeduction(pantry, [
      ing('Onions', 2, 'unidad'),
      ing('Milk', 250, 'ml'),
    ]);

    expect(plan.items[0]).toMatchObject({ status: 'deductible_full', deductQuantity: 2, stockAfter: 2 });
    expect(plan.items[0].matchedPantryItem?.id).toBe('p-cebolla');
    expect(plan.items[1]).toMatchObject({ status: 'deductible_full', deductQuantity: 0.25, stockAfter: 0.75 });
    expect(plan.items[1].matchedPantryItem?.id).toBe('p-leche');
    expect(plan.deductibleItems).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 3-5. Coincidencias posibles: nunca descuentan
// ---------------------------------------------------------------------------

describe('Consumo — coincidencias posibles requieren revisión y no descuentan', () => {
  function expectReviewOnly(
    pantry: Ingredient[],
    recipeName: string,
    quantity: number,
    unit: string,
    expectedPantryId: string
  ) {
    const plan = calculatePantryDeduction(pantry, [ing(recipeName, quantity, unit)]);
    const item = plan.items[0];
    const stored = pantry.find((p) => p.id === expectedPantryId)!;

    expect(item.status).toBe('requires_review_possible_match');
    expect(item.requiresReview).toBe(true);
    expect(item.deductQuantity).toBe(0);
    expect(item.stockBefore).toBe(stored.quantity);
    expect(item.stockAfter).toBe(stored.quantity);
    // Se conserva el registro como contexto para la revisión manual
    expect(item.matchedPantryItem?.id).toBe(expectedPantryId);
    expect(item.pantryUnit).toBe(stored.unit);
    expect(item.message).toBe(POSSIBLE_MATCH_REVIEW_MESSAGE);
    expect(plan.deductibleItems).toHaveLength(0);
    expect(plan.reviewItems).toHaveLength(1);
    expect(plan.canDeductAny).toBe(false);

    const { updatedPantry, deductedCount } = applyPantryDeduction(pantry, plan);
    expect(deductedCount).toBe(0);
    expect(updatedPantry).toEqual(pantry);
  }

  it('3. coincidencia posible en inglés («White rice» vs «Rice», «Chicken thigh» vs «Chicken»)', () => {
    expectReviewOnly([pantryItem('p-rice', 'Rice', 2, 'kg', 'Granos y cereales')], 'White rice', 500, 'g', 'p-rice');
    expectReviewOnly(
      [pantryItem('p-chicken', 'Chicken', 1000, 'g', 'Carnes y proteínas')],
      'Chicken thigh',
      300,
      'g',
      'p-chicken'
    );
  });

  it('4. coincidencia posible en español («Tomate chonto», «Arroz blanco», «Leche» vs «Leche entera»)', () => {
    expectReviewOnly([pantryItem('p-tomate', 'Tomate', 6, 'unidad')], 'Tomate chonto', 2, 'unidad', 'p-tomate');
    expectReviewOnly([pantryItem('p-arroz', 'Arroz', 1, 'kg', 'Granos y cereales')], 'Arroz blanco', 200, 'g', 'p-arroz');
    expectReviewOnly([pantryItem('p-leche', 'Leche entera', 500, 'ml', 'Lácteos')], 'Leche', 0.2, 'l', 'p-leche');
  });

  it('5. «Red onion» vs «Onion» no descuenta automáticamente (en ningún sentido)', () => {
    expectReviewOnly([pantryItem('p-onion', 'Onion', 5, 'unidad')], 'Red onion', 1, 'unidad', 'p-onion');
    expectReviewOnly([pantryItem('p-red', 'Red onion', 5, 'unidad')], 'Onion', 1, 'unidad', 'p-red');
  });

  it('5b. «Red onion» no tiene identidad bilingüe con «Cebolla»: no se encuentra ni descuenta', () => {
    const pantry = [pantryItem('p-cebolla', 'Cebolla', 5, 'unidad')];
    const plan = calculatePantryDeduction(pantry, [ing('Red onion', 1, 'unidad')]);
    expect(plan.items[0].status).toBe('requires_review_not_found');
    expect(plan.items[0].deductQuantity).toBe(0);
    expect(plan.canDeductAny).toBe(false);
  });

  it('la coincidencia posible se revisa aunque la cantidad sea nula, sin inventar stock', () => {
    const pantry = [pantryItem('p-tomate', 'Tomate', 6, 'unidad')];
    const plan = calculatePantryDeduction(pantry, [ing('Tomate chonto', null, 'unidad')]);
    expect(plan.items[0].status).toBe('requires_review_possible_match');
    expect(plan.items[0].deductQuantity).toBe(0);
    expect(plan.items[0].stockAfter).toBe(6);
  });

  it('el mensaje de revisión se localiza al inglés', () => {
    expect(localizeMessage(POSSIBLE_MATCH_REVIEW_MESSAGE, 'es')).toBe(POSSIBLE_MATCH_REVIEW_MESSAGE);
    expect(localizeMessage(POSSIBLE_MATCH_REVIEW_MESSAGE, 'en')).toBe(
      'Possible match in your pantry; it requires manual review and was not deducted automatically.'
    );
  });
});

// ---------------------------------------------------------------------------
// 6. Variantes de alimentos distintos
// ---------------------------------------------------------------------------

describe('Consumo — variantes de alimentos distintos nunca descuentan', () => {
  const pantry = [
    pantryItem('p-cebolla', 'Cebolla', 5, 'unidad'),
    pantryItem('p-onion', 'Onion', 5, 'unidad'),
    pantryItem('p-ajo', 'Garlic', 5, 'unidad'),
    pantryItem('p-tomate', 'Tomato', 5, 'unidad'),
    pantryItem('p-leche', 'Milk', 1, 'l', 'Lácteos'),
    pantryItem('p-papa', 'Potato', 5, 'unidad'),
    pantryItem('p-huevo', 'Egg', 12, 'unidad', 'Carnes y proteínas'),
    pantryItem('p-pimienta', 'Black pepper', 50, 'g', 'Alacena'),
  ];

  it.each([
    ['Green onion', 1, 'unidad'],
    ['Cebolla larga', 1, 'unidad'],
    ['Onion powder', 10, 'g'],
    ['Garlic powder', 10, 'g'],
    ['Tomato sauce', 1, 'unidad'],
    ['Tomato paste', 1, 'unidad'],
    ['Almond milk', 0.2, 'l'],
    ['Leche de almendras', 0.2, 'l'],
    ['Sweet potato', 1, 'unidad'],
    ['Batata', 1, 'unidad'],
    ['Eggplant', 1, 'unidad'],
    ['Bell pepper', 1, 'unidad'],
  ])('«%s» no descuenta inventario', (name, quantity, unit) => {
    const plan = calculatePantryDeduction(pantry, [ing(name, quantity, unit)]);
    expect(plan.items[0].deductQuantity).toBe(0);
    expect(plan.items[0].requiresReview).toBe(true);
    expect(plan.items[0].status).not.toMatch(/^deductible/);
    expect(plan.deductibleItems).toHaveLength(0);
    expect(applyPantryDeduction(pantry, plan).updatedPantry).toEqual(pantry);
  });
});

// ---------------------------------------------------------------------------
// 7-9. Bloqueos existentes y stock remanente
// ---------------------------------------------------------------------------

describe('Consumo — bloqueos existentes y stock remanente', () => {
  it('7. unidades incompatibles siguen bloqueadas en coincidencias exactas', () => {
    const pantry = [pantryItem('p-cebolla', 'Cebolla', 5, 'unidad')];
    const plan = calculatePantryDeduction(pantry, [ing('Onion', 100, 'g')]);
    expect(plan.items[0].status).toBe('requires_review_unit');
    expect(plan.items[0].deductQuantity).toBe(0);
    expect(plan.items[0].stockAfter).toBe(5);
  });

  it('8. cantidades nulas siguen bloqueadas en coincidencias exactas', () => {
    const pantry = [pantryItem('p-cebolla', 'Cebolla', 5, 'unidad')];
    const plan = calculatePantryDeduction(pantry, [ing('Onion', null, 'unidad')]);
    expect(plan.items[0].status).toBe('requires_review_quantity');
    expect(plan.items[0].deductQuantity).toBe(0);
    expect(plan.items[0].stockAfter).toBe(5);
  });

  it('9. una coincidencia posible no consume stock remanente de una exacta posterior', () => {
    const pantry = [pantryItem('p-tomate', 'Tomate', 3, 'unidad')];
    const plan = calculatePantryDeduction(pantry, [
      ing('Tomate chonto', 2, 'unidad'),
      ing('Tomate', 1, 'unidad'),
    ]);

    expect(plan.items[0]).toMatchObject({
      status: 'requires_review_possible_match',
      deductQuantity: 0,
      stockBefore: 3,
      stockAfter: 3,
    });
    expect(plan.items[1]).toMatchObject({
      status: 'deductible_full',
      deductQuantity: 1,
      stockBefore: 3,
      stockAfter: 2,
    });
    expect(applyPantryDeduction(pantry, plan).updatedPantry[0].quantity).toBe(2);
  });

  it('se conserva el manejo de ingredientes duplicados en la misma receta (exactos bilingües)', () => {
    const pantry = [pantryItem('p-cebolla', 'Cebolla', 3, 'unidad')];
    const plan = calculatePantryDeduction(pantry, [
      ing('Onion', 2, 'unidad'),
      ing('Cebolla', 2, 'unidad'),
    ]);

    expect(plan.items[0]).toMatchObject({ status: 'deductible_full', stockBefore: 3, stockAfter: 1 });
    expect(plan.items[1]).toMatchObject({
      status: 'deductible_partial',
      deductQuantity: 1,
      stockBefore: 1,
      stockAfter: 0,
    });
    expect(plan.items.every((i) => i.stockAfter >= 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 10. Ledger de consumo (PantryContext real + AsyncStorage)
// ---------------------------------------------------------------------------

function createMemoryStorage(initial: Ingredient[]) {
  const store: PantryStorageAdapter & { data: Ingredient[]; saves: number } = {
    data: initial.map((i) => ({ ...i })),
    saves: 0,
    async getIngredients() {
      return store.data.map((i) => ({ ...i }));
    },
    async saveIngredients(items: Ingredient[]) {
      store.saves += 1;
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

function makeRecipe(instanceId: string, ingredients: RecipeIngredient[]): ClientRecipe {
  return {
    id: 'receta-real',
    instanceId,
    generationId: 'gen_1',
    name: 'Receta real',
    description: 'Receta real generada',
    totalMinutes: 30,
    servings: 2,
    convenience: 90,
    estimatedMissingCost: 0,
    budgetRemaining: 20000,
    withinBudget: true,
    reason: 'Recomendada',
    isDemoFixture: false,
    steps: ['Cocinar todo'],
    ingredients,
    availableIngredients: [],
    missingIngredients: [],
  } as ClientRecipe;
}

async function renderPantryHook(storage: PantryStorageAdapter & { data: Ingredient[] }) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <PantryProvider storageAdapter={storage} initialIngredients={storage.data} userId="user-1">
      {children}
    </PantryProvider>
  );
  return renderHook(() => usePantry(), { wrapper });
}

describe('Consumo — seguridad del ledger con coincidencias posibles', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('10. el ledger solo registra la deducción exacta; la posible no toca stock ni desglose', async () => {
    const storage = createMemoryStorage([
      pantryItem('p-cebolla', 'Cebolla', 5, 'unidad'),
      pantryItem('p-pollo', 'Pollo', 1000, 'g', 'Carnes y proteínas'),
    ]);
    const { result } = await renderPantryHook(storage);
    const recipe = makeRecipe('receta-real::mixta', [
      ing('Onions', 2, 'unidad'),
      ing('Pollo deshuesado', 300, 'g'),
    ]);

    let res!: ConsumeRecipeResult;
    await act(async () => {
      res = await result.current.consumeRecipeIngredients(recipe);
    });

    expect(res.success).toBe(true);
    expect(res.deductedCount).toBe(1);
    expect(res.plan.reviewItems.map((i) => i.status)).toEqual(['requires_review_possible_match']);
    expect(storage.data.find((i) => i.id === 'p-cebolla')!.quantity).toBe(3);
    expect(storage.data.find((i) => i.id === 'p-cebolla')!.name).toBe('Cebolla');
    expect(storage.data.find((i) => i.id === 'p-pollo')!.quantity).toBe(1000);

    const record = (await getConsumedRecipeRecords('user-1'))['receta-real::mixta'];
    expect(record.status).toBe('completed');
    expect(record.deductions?.map((d) => d.ingredientId)).toEqual(['p-cebolla']);
    expect(record.deductions?.[0]).toMatchObject({ deductedQuantity: 2, stockBefore: 5, stockAfter: 3 });
  });

  it('10b. una receta con solo coincidencias posibles no modifica la despensa y no permite doble consumo', async () => {
    const pantry = [pantryItem('p-onion', 'Onion', 5, 'unidad')];
    const storage = createMemoryStorage(pantry);
    const { result } = await renderPantryHook(storage);
    const recipe = makeRecipe('receta-real::posible', [ing('Red onion', 2, 'unidad')]);

    let first!: ConsumeRecipeResult;
    let second!: ConsumeRecipeResult;
    await act(async () => {
      first = await result.current.consumeRecipeIngredients(recipe);
    });
    await act(async () => {
      second = await result.current.consumeRecipeIngredients(recipe);
    });

    expect(first.deductedCount).toBe(0);
    expect(first.plan.canDeductAny).toBe(false);
    expect(first.plan.reviewItems[0].matchedPantryItem?.id).toBe('p-onion');
    expect(storage.saves).toBe(0);
    expect(storage.data).toEqual(pantry);
    expect(second.success).toBe(false);
    expect(second.alreadyDeducted).toBe(true);

    const record = (await getConsumedRecipeRecords('user-1'))['receta-real::posible'];
    expect(record.status).toBe('completed');
    expect(record.deductions ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Compatibilidad con los alias B2.4 del backend (sin copiarlos a ciegas)
// ---------------------------------------------------------------------------

describe('Consumo — distinciones de los alias B2.4 del backend', () => {
  it.each([
    ['Onion', 'Cebolla'],
    ['Tomato', 'Tomate'],
    ['Milk', 'Leche'],
    ['Sweet potato', 'Batata'],
  ])('«%s» y «%s» son el mismo alimento y descuentan', (recipeName, pantryName) => {
    const pantry = [pantryItem('p', pantryName, 5, 'unidad')];
    const plan = calculatePantryDeduction(pantry, [ing(recipeName, 1, 'unidad')]);
    expect(plan.items[0].status).toBe('deductible_full');
    expect(plan.items[0].matchedPantryItem?.id).toBe('p');
  });

  it.each([
    ['Green onion', 'Cebolla'],
    ['Cebolla larga', 'Onion'],
    ['Almond milk', 'Leche'],
    ['Leche de almendras', 'Milk'],
    ['Sweet potato', 'Papa'],
    ['Batata', 'Potato'],
  ])('«%s» nunca descuenta de «%s»', (recipeName, pantryName) => {
    const pantry = [pantryItem('p', pantryName, 5, 'unidad')];
    const plan = calculatePantryDeduction(pantry, [ing(recipeName, 1, 'unidad')]);
    expect(plan.items[0].deductQuantity).toBe(0);
    expect(plan.deductibleItems).toHaveLength(0);
  });

  it('la equivalencia de precios del backend no autoriza fusiones: «Green onion» vs «Cebolla larga» se mantiene conservador', () => {
    const pantry = [pantryItem('p', 'Cebolla larga', 5, 'unidad')];
    const plan = calculatePantryDeduction(pantry, [ing('Green onion', 1, 'unidad')]);
    expect(plan.items[0].deductQuantity).toBe(0);
    expect(plan.items[0].requiresReview).toBe(true);
  });
});
