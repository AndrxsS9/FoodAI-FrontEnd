/**
 * Fase 28C-B3.2 — Identidad bilingüe (español ↔ inglés) de alimentos en la despensa y el escáner.
 *
 * Cubre: equivalencias explícitas ES/EN, plurales ingleses, clasificación de nombres en inglés,
 * prevención de falsos duplicados, recálculo de coincidencias al renombrar en el escáner,
 * integridad de cantidades/unidades, comportamiento español existente, persistencia de la
 * despensa y regresión del cálculo de consumo.
 */
import React from 'react';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import ScannerScreen from '../app/escaner/index';
import { TypographyProvider } from '../src/theme';
import { PantryProvider } from '../src/context/PantryContext';
import { PantryStorageAdapter } from '../src/services/storage/pantryStorage';
import { CreateIngredientInput, Ingredient, UpdateIngredientInput } from '../src/types/pantry';
import { ScannedIngredientItem } from '../src/types/scanner';
import { scannerApi } from '../src/services/api/scannerApi';
import {
  canMergeScannedItem,
  classifyIngredient,
  findDuplicateInPantry,
  getBilingualFoodIdentity,
  inferIngredientCategory,
  mapDetectedToScannedItems,
  rematchScannedItemAfterRename,
  suggestIngredientMeasurement,
} from '../src/utils/ingredientMapper';
import { detectIngredientSemanticWarnings } from '../src/utils/pantryValidation';
import { calculatePantryDeduction } from '../src/utils/pantryConsumption';

jest.setTimeout(30000);

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn().mockImplementation((uri) =>
    Promise.resolve({ uri: `${uri}_optimized.jpg`, width: 1600, height: 1200 })
  ),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));

jest.mock('../src/services/api/scannerApi', () => {
  const actual = jest.requireActual('../src/services/api/scannerApi');
  return { ...actual, scannerApi: { analyzeIngredientsImage: jest.fn() } };
});

function pantryItem(
  id: string,
  name: string,
  quantity: number,
  unit: Ingredient['unit'],
  category: Ingredient['category']
): Ingredient {
  return {
    id,
    name,
    quantity,
    unit,
    category,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

const VEG = 'Verduras y frutas' as const;

// ---------------------------------------------------------------------------
// 1. Equivalencias explícitas y plurales
// ---------------------------------------------------------------------------

describe('Identidad bilingüe — equivalencias ES/EN', () => {
  it.each([
    ['onion', 'cebolla'],
    ['tomato', 'tomate'],
    ['egg', 'huevo'],
    ['garlic', 'ajo'],
    ['rice', 'arroz'],
    ['chicken', 'pollo'],
    ['carrot', 'zanahoria'],
    ['potato', 'papa'],
    ['milk', 'leche'],
    ['cheese', 'queso'],
    ['salt', 'sal'],
  ])('«%s» equivale a «%s»', (english, spanish) => {
    expect(getBilingualFoodIdentity(english)).toBe(spanish);
    expect(getBilingualFoodIdentity(spanish)).toBe(spanish);
  });

  it.each([
    ['Onions', 'cebolla'],
    ['Tomatoes', 'tomate'],
    ['Potatoes', 'papa'],
    ['Eggs', 'huevo'],
    ['Carrots', 'zanahoria'],
    ['Cheeses', 'queso'],
    ['Strawberries', 'fresa'],
    ['Cebollas', 'cebolla'],
    ['Tomates', 'tomate'],
    ['Huevos', 'huevo'],
    ['Papas', 'papa'],
  ])('reconoce el plural «%s» → «%s»', (name, canonical) => {
    expect(getBilingualFoodIdentity(name)).toBe(canonical);
  });

  it('es insensible a mayúsculas, tildes y espacios extra', () => {
    expect(getBilingualFoodIdentity('  ONION  ')).toBe('cebolla');
    expect(getBilingualFoodIdentity('Champiñón')).toBe('champinon');
  });

  it.each([
    'Green onion',
    'Onion powder',
    'Garlic powder',
    'Tomato sauce',
    'Tomato paste',
    'Almond milk',
    'Eggplant',
    'Black pepper',
    'Bell pepper',
    'Pepper',
    'Lemon',
    'Bacon',
    'Unknown thing',
    '',
  ])('«%s» no tiene identidad de cebolla/ajo/tomate/leche/huevo/papa', (name) => {
    const identity = getBilingualFoodIdentity(name);
    expect(['cebolla', 'ajo', 'tomate', 'leche', 'huevo', 'papa']).not.toContain(identity);
  });

  it('«sweet potato» es batata, nunca papa', () => {
    expect(getBilingualFoodIdentity('Sweet potato')).toBe('batata');
    expect(getBilingualFoodIdentity('Sweet potatoes')).toBe('batata');
    expect(getBilingualFoodIdentity('Batata')).toBe('batata');
  });

  it('«eggplant» es berenjena, nunca huevo', () => {
    expect(getBilingualFoodIdentity('Eggplant')).toBe('berenjena');
  });
});

// ---------------------------------------------------------------------------
// 2. Detección de duplicados bilingüe
// ---------------------------------------------------------------------------

describe('findDuplicateInPantry — coincidencias bilingües seguras', () => {
  const pantry: Ingredient[] = [
    pantryItem('p-cebolla', 'Cebolla', 2, 'unidad', VEG),
    pantryItem('p-tomate', 'Tomates', 4, 'unidad', VEG),
    pantryItem('p-huevo', 'Huevos', 12, 'unidad', 'Carnes y proteínas'),
    pantryItem('p-ajo', 'Ajo', 3, 'unidad', VEG),
    pantryItem('p-arroz', 'Arroz', 1, 'kg', 'Granos y cereales'),
    pantryItem('p-pollo', 'Pollo', 1, 'kg', 'Carnes y proteínas'),
    pantryItem('p-zanahoria', 'Zanahoria', 5, 'unidad', VEG),
    pantryItem('p-papa', 'Papa', 2, 'kg', VEG),
    pantryItem('p-leche', 'Leche', 1, 'l', 'Lácteos'),
    pantryItem('p-queso', 'Queso', 250, 'g', 'Lácteos'),
    pantryItem('p-sal', 'Sal', 500, 'g', 'Alacena'),
    pantryItem('p-pimienta-negra', 'Black pepper', 50, 'g', 'Alacena'),
  ];

  it.each([
    ['Onion', 'p-cebolla'],
    ['Onions', 'p-cebolla'],
    ['Tomato', 'p-tomate'],
    ['Tomatoes', 'p-tomate'],
    ['Egg', 'p-huevo'],
    ['Eggs', 'p-huevo'],
    ['Garlic', 'p-ajo'],
    ['Rice', 'p-arroz'],
    ['Chicken', 'p-pollo'],
    ['Carrots', 'p-zanahoria'],
    ['Potatoes', 'p-papa'],
    ['Milk', 'p-leche'],
    ['Cheese', 'p-queso'],
    ['Salt', 'p-sal'],
  ])('«%s» coincide exactamente con el registro %s existente', (name, expectedId) => {
    const match = findDuplicateInPantry(name, pantry);
    expect(match?.id).toBe(expectedId);
    expect(match?.matchType).toBe('exact');
  });

  it('conserva el ID, nombre, cantidad, unidad y categoría del registro guardado', () => {
    const match = findDuplicateInPantry('Onions', pantry);
    expect(match).toEqual({
      id: 'p-cebolla',
      name: 'Cebolla',
      currentQuantity: 2,
      unit: 'unidad',
      category: VEG,
      matchType: 'exact',
    });
  });

  it('funciona en sentido inverso: nombre español contra registro inglés', () => {
    const englishPantry = [pantryItem('p-onion', 'Onions', 3, 'unidad', VEG)];
    const match = findDuplicateInPantry('Cebolla', englishPantry);
    expect(match?.id).toBe('p-onion');
    expect(match?.name).toBe('Onions');
    expect(match?.matchType).toBe('exact');
  });

  it.each([
    'Green onion',
    'Onion powder',
    'Garlic powder',
    'Tomato sauce',
    'Tomato paste',
    'Almond milk',
    'Eggplant',
    'Sweet potato',
    'Bell pepper',
  ])('«%s» NO coincide con ningún registro de la despensa', (name) => {
    expect(findDuplicateInPantry(name, pantry)).toBeUndefined();
  });

  it.each([
    ['onion', 'green onion'],
    ['onion', 'onion powder'],
    ['garlic', 'garlic powder'],
    ['tomato', 'tomato sauce'],
    ['tomato', 'tomato paste'],
    ['milk', 'almond milk'],
    ['egg', 'eggplant'],
    ['potato', 'sweet potato'],
    ['black pepper', 'bell pepper'],
    ['pepper', 'black pepper'],
    ['pepper', 'bell pepper'],
  ])('mismo idioma: «%s» y «%s» nunca coinciden (en ningún sentido)', (a, b) => {
    expect(findDuplicateInPantry(a, [pantryItem('x', b, 1, 'unidad', VEG)])).toBeUndefined();
    expect(findDuplicateInPantry(b, [pantryItem('x', a, 1, 'unidad', VEG)])).toBeUndefined();
  });

  it.each([
    ['Ajo', 'Ajo en polvo'],
    ['Cebolla', 'Cebolla larga'],
    ['Leche', 'Leche de almendras'],
    ['Leche', 'Crema de leche'],
    ['Tomate', 'Pasta de tomate'],
  ])('español: «%s» y «%s» nunca coinciden', (a, b) => {
    expect(findDuplicateInPantry(a, [pantryItem('x', b, 1, 'unidad', VEG)])).toBeUndefined();
    expect(findDuplicateInPantry(b, [pantryItem('x', a, 1, 'unidad', VEG)])).toBeUndefined();
  });

  it('no infiere identidad por palabras parciales entre idiomas', () => {
    // «onion» está dentro de «green onion», pero eso no lo convierte en cebolla
    expect(findDuplicateInPantry('Green onions', pantry)).toBeUndefined();
    expect(findDuplicateInPantry('Cebolla', [pantryItem('x', 'Green onion', 1, 'unidad', VEG)])).toBeUndefined();
    expect(findDuplicateInPantry('Ajo', [pantryItem('x', 'Garlic powder', 1, 'g', 'Alacena')])).toBeUndefined();
  });

  it('conserva el comportamiento español existente (sal ≠ salsa, res ≠ fresa, posibles)', () => {
    const spanish = [
      pantryItem('s1', 'Tomate', 3, 'unidad', VEG),
      pantryItem('s2', 'Salsa de tomate', 1, 'unidad', 'Alacena'),
      pantryItem('s3', 'Fresas', 500, 'g', VEG),
      pantryItem('s4', 'Arroz', 2, 'kg', 'Granos y cereales'),
    ];
    expect(findDuplicateInPantry('sal', spanish)).toBeUndefined();
    expect(findDuplicateInPantry('res', spanish)).toBeUndefined();
    expect(findDuplicateInPantry('Tomate chonto', spanish)?.matchType).toBe('possible');
    expect(findDuplicateInPantry('Arroz blanco', spanish)?.matchType).toBe('possible');
    expect(findDuplicateInPantry('tomates', spanish)).toMatchObject({ id: 's1', matchType: 'exact' });
  });

  it('las variantes calificadas en inglés siguen siendo solo coincidencias posibles', () => {
    const english = [pantryItem('e1', 'Rice', 1, 'kg', 'Granos y cereales')];
    expect(findDuplicateInPantry('White rice', english)?.matchType).toBe('possible');
    expect(findDuplicateInPantry('Red onion', [pantryItem('e2', 'Onion', 1, 'unidad', VEG)])?.matchType).toBe(
      'possible'
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Clasificación de nombres en inglés
// ---------------------------------------------------------------------------

describe('Clasificación — nombres comunes en inglés', () => {
  it.each([
    ['Onion', VEG],
    ['Tomatoes', VEG],
    ['Potatoes', VEG],
    ['Carrots', VEG],
    ['Garlic', VEG],
    ['Strawberries', VEG],
    ['Eggplant', VEG],
    ['Sweet potato', VEG],
    ['Eggs', 'Carnes y proteínas'],
    ['Chicken', 'Carnes y proteínas'],
    ['Chicken breast', 'Carnes y proteínas'],
    ['Milk', 'Lácteos'],
    ['Cheese', 'Lácteos'],
    ['Butter', 'Lácteos'],
    ['Rice', 'Granos y cereales'],
    ['Flour', 'Granos y cereales'],
    ['Bread', 'Granos y cereales'],
    ['Beans', 'Granos y cereales'],
    ['Salt', 'Alacena'],
    ['Sugar', 'Alacena'],
    ['Olive oil', 'Alacena'],
    ['Tomato sauce', 'Alacena'],
    ['Tomato paste', 'Alacena'],
    ['Onion powder', 'Alacena'],
    ['Garlic powder', 'Alacena'],
    ['Black pepper', 'Alacena'],
    ['Peanut butter', 'Alacena'],
    ['Almond milk', 'Otros'],
    ['Water', 'Otros'],
  ])('«%s» → %s', (name, category) => {
    expect(inferIngredientCategory(name)).toBe(category);
  });

  it('las categorías siguen siendo los identificadores internos en español', () => {
    const c = classifyIngredient('Milk');
    expect(c.category).toBe('Lácteos');
    expect(c.acceptableCategories).toEqual(expect.arrayContaining(['Lácteos', 'Otros']));
  });

  it('los compuestos ambiguos al estilo inglés no inventan categoría', () => {
    // «orange juice»: naranja + jugo; no se asume «Verduras y frutas»
    expect(classifyIngredient('Orange juice').confidence).toBe('low');
    expect(inferIngredientCategory('Orange juice')).toBe('Otros');
    expect(inferIngredientCategory('Egg noodles')).toBe('Otros');
    // «pepper» solo es ambiguo (pimienta vs pimentón)
    expect(classifyIngredient('Pepper').confidence).toBe('none');
  });

  it('sugiere unidades coherentes para nombres en inglés', () => {
    expect(suggestIngredientMeasurement('Milk').preferredUnit).toBe('l');
    expect(suggestIngredientMeasurement('Eggs').preferredUnit).toBe('unidad');
    expect(suggestIngredientMeasurement('Rice').preferredUnit).toBe('kg');
    expect(suggestIngredientMeasurement('Milk powder').presentation).toBe('powder');
  });

  it('las advertencias semánticas aplican también a nombres en inglés', () => {
    const warnings = detectIngredientSemanticWarnings({ name: 'Eggs', unit: 'l', category: 'Carnes y proteínas' });
    expect(warnings.map((w) => w.code)).toContain('countable_measured_by_volume');
    expect(detectIngredientSemanticWarnings({ name: 'Milk', unit: 'l', category: 'Lácteos' })).toEqual([]);
  });

  it('conserva la clasificación española existente', () => {
    expect(inferIngredientCategory('Pechuga de pollo')).toBe('Carnes y proteínas');
    expect(inferIngredientCategory('Salsa de tomate')).toBe('Alacena');
    expect(inferIngredientCategory('Leche de almendras')).toBe('Otros');
    expect(inferIngredientCategory('Carne molida')).toBe('Carnes y proteínas');
    expect(inferIngredientCategory('Sal')).toBe('Alacena');
    expect(inferIngredientCategory('Salsa')).toBe('Alacena');
  });
});

// ---------------------------------------------------------------------------
// 4. Mapeo del escáner: cantidades, unidades y acciones
// ---------------------------------------------------------------------------

describe('mapDetectedToScannedItems — integridad bilingüe', () => {
  const pantry = [
    pantryItem('p-cebolla', 'Cebolla', 2, 'unidad', VEG),
    pantryItem('p-arroz', 'Arroz', 1, 'kg', 'Granos y cereales'),
    pantryItem('p-leche', 'Leche', 1, 'l', 'Lácteos'),
  ];

  it('suma a la cebolla existente cuando se detecta «Onions» con unidad compatible', () => {
    const [item] = mapDetectedToScannedItems(
      [{ name: 'Onions', quantity: 3, unit: 'unidad', needsReview: false }],
      pantry
    );
    expect(item.duplicateMatch?.id).toBe('p-cebolla');
    expect(item.action).toBe('add_to_existing');
    expect(item.category).toBe(VEG);
    expect(item.name).toBe('Onions');
  });

  it('nunca suma unidades incompatibles («Rice» en unidades vs arroz en kg)', () => {
    const [item] = mapDetectedToScannedItems(
      [{ name: 'Rice', quantity: 2, unit: 'unidad', needsReview: false }],
      pantry
    );
    expect(item.duplicateMatch?.id).toBe('p-arroz');
    expect(item.action).toBe('create');
    expect(item.needsReview).toBe(true);
  });

  it('conserva cantidades nulas sin inventar valores', () => {
    const [item] = mapDetectedToScannedItems(
      [{ name: 'Milk', quantity: null, unit: 'ml', needsReview: true }],
      pantry
    );
    expect(item.quantity).toBeNull();
    expect(item.needsReview).toBe(true);
    expect(item.duplicateMatch?.id).toBe('p-leche');
  });

  it('«Almond milk» se crea como alimento nuevo, sin destino de suma', () => {
    const [item] = mapDetectedToScannedItems(
      [{ name: 'Almond milk', quantity: 1, unit: 'l', needsReview: false }],
      pantry
    );
    expect(item.duplicateMatch).toBeUndefined();
    expect(item.action).toBe('create');
    expect(item.category).toBe('Otros');
  });
});

// ---------------------------------------------------------------------------
// 5. Renombrado manual en el escáner (lógica pura)
// ---------------------------------------------------------------------------

describe('rematchScannedItemAfterRename', () => {
  const pantry = [
    pantryItem('p-cebolla', 'Cebolla', 2, 'unidad', VEG),
    pantryItem('p-ajo', 'Ajo', 1, 'unidad', VEG),
    pantryItem('p-arroz', 'Arroz', 1, 'kg', 'Granos y cereales'),
  ];

  function scannedOnion(): ScannedIngredientItem {
    return mapDetectedToScannedItems(
      [{ name: 'Onion', quantity: 3, unit: 'unidad', needsReview: false }],
      pantry
    )[0];
  }

  it('punto de partida: «Onion» se suma a «Cebolla»', () => {
    const item = scannedOnion();
    expect(item.action).toBe('add_to_existing');
    expect(item.duplicateMatch?.id).toBe('p-cebolla');
  });

  it('renombrar a otro alimento existente invalida el destino y NO suma automáticamente', () => {
    const renamed = rematchScannedItemAfterRename(scannedOnion(), 'Garlic', pantry);
    expect(renamed.name).toBe('Garlic');
    expect(renamed.duplicateMatch?.id).toBe('p-ajo');
    expect(renamed.action).toBe('create');
  });

  it('renombrar a un alimento sin coincidencia elimina el destino obsoleto', () => {
    const renamed = rematchScannedItemAfterRename(scannedOnion(), 'Onion powder', pantry);
    expect(renamed.duplicateMatch).toBeUndefined();
    expect(renamed.action).toBe('create');
  });

  it('un nombre vacío durante la edición elimina el destino', () => {
    const renamed = rematchScannedItemAfterRename(scannedOnion(), '', pantry);
    expect(renamed.duplicateMatch).toBeUndefined();
    expect(renamed.action).toBe('create');
  });

  it('cambiar a un sinónimo del MISMO registro conserva la suma elegida', () => {
    const renamed = rematchScannedItemAfterRename(scannedOnion(), 'Cebollas', pantry);
    expect(renamed.duplicateMatch?.id).toBe('p-cebolla');
    expect(renamed.action).toBe('add_to_existing');
  });

  it('una coincidencia que pasa a ser solo posible exige revisión y no suma', () => {
    const renamed = rematchScannedItemAfterRename(scannedOnion(), 'Cebolla roja', pantry);
    expect(renamed.duplicateMatch?.matchType).toBe('possible');
    expect(renamed.action).toBe('create');
    expect(renamed.needsReview).toBe(true);
  });

  it('nuevo destino con unidades incompatibles exige revisión', () => {
    const renamed = rematchScannedItemAfterRename(scannedOnion(), 'Rice', pantry);
    expect(renamed.duplicateMatch?.id).toBe('p-arroz');
    expect(renamed.action).toBe('create');
    expect(renamed.needsReview).toBe(true);
    expect(canMergeScannedItem(renamed)).toBe(false);
  });

  it('no modifica cantidad, unidad, categoría ni ID del ítem', () => {
    const original = { ...scannedOnion(), quantity: null };
    const renamed = rematchScannedItemAfterRename(original, 'Garlic', pantry);
    expect(renamed.id).toBe(original.id);
    expect(renamed.quantity).toBeNull();
    expect(renamed.unit).toBe('unidad');
    expect(renamed.category).toBe(original.category);
    expect(renamed.needsReview).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Regresión del cálculo de consumo (ledger)
// ---------------------------------------------------------------------------

describe('calculatePantryDeduction — regresión con nombres bilingües', () => {
  const pantry = [
    pantryItem('p-cebolla', 'Cebolla', 4, 'unidad', VEG),
    pantryItem('p-ajo', 'Ajo', 5, 'unidad', VEG),
    pantryItem('p-leche', 'Leche', 1, 'l', 'Lácteos'),
    pantryItem('p-tomate', 'Tomate', 6, 'unidad', VEG),
  ];

  it('descuenta «Onions» de la cebolla guardada sin renombrarla', () => {
    const plan = calculatePantryDeduction(pantry, [
      { name: 'Onions', quantity: 2, unit: 'unidad' } as any,
    ]);
    expect(plan.items[0].status).toBe('deductible_full');
    expect(plan.items[0].matchedPantryItem?.id).toBe('p-cebolla');
    expect(plan.items[0].matchedPantryItem?.name).toBe('Cebolla');
    expect(plan.items[0].stockAfter).toBe(2);
  });

  it('convierte ml → l con identidad bilingüe («Milk» 250 ml de 1 l)', () => {
    const plan = calculatePantryDeduction(pantry, [{ name: 'Milk', quantity: 250, unit: 'ml' } as any]);
    expect(plan.items[0].matchedPantryItem?.id).toBe('p-leche');
    expect(plan.items[0].stockAfter).toBe(0.75);
  });

  it.each(['Garlic powder', 'Onion powder', 'Green onion', 'Tomato sauce', 'Almond milk'])(
    '«%s» nunca descuenta del alimento base',
    (name) => {
      const plan = calculatePantryDeduction(pantry, [{ name, quantity: 1, unit: 'unidad' } as any]);
      expect(plan.items[0].status).toBe('requires_review_not_found');
      expect(plan.deductibleItems).toHaveLength(0);
    }
  );

  it('unidades incompatibles siguen requiriendo revisión', () => {
    const plan = calculatePantryDeduction(pantry, [{ name: 'Garlic', quantity: 10, unit: 'g' } as any]);
    expect(plan.items[0].status).toBe('requires_review_unit');
    expect(plan.items[0].deductQuantity).toBe(0);
  });

  it('cantidades nulas siguen sin inventarse', () => {
    const plan = calculatePantryDeduction(pantry, [{ name: 'Tomatoes', quantity: null, unit: 'unidad' } as any]);
    expect(plan.items[0].status).toBe('requires_review_quantity');
    expect(plan.items[0].stockAfter).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// 7. Integración renderizada del escáner + persistencia de la despensa
// ---------------------------------------------------------------------------

class MemoryPantryAdapter implements PantryStorageAdapter {
  items: Ingredient[];

  constructor(initial: Ingredient[]) {
    this.items = initial.map((i) => ({ ...i }));
  }

  async getIngredients(): Promise<Ingredient[]> {
    return this.items.map((i) => ({ ...i }));
  }

  async saveIngredients(ingredients: Ingredient[]): Promise<void> {
    this.items = ingredients.map((i) => ({ ...i }));
  }

  async addIngredient(input: CreateIngredientInput): Promise<Ingredient> {
    const created: Ingredient = {
      id: `mem-${this.items.length + 1}`,
      name: input.name,
      quantity: input.quantity,
      unit: input.unit,
      category: input.category,
      expirationDate: input.expirationDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.items.unshift(created);
    return { ...created };
  }

  async updateIngredient(input: UpdateIngredientInput): Promise<Ingredient> {
    const idx = this.items.findIndex((i) => i.id === input.id);
    if (idx === -1) throw new Error('Not found');
    const existing = this.items[idx];
    const updated: Ingredient = {
      ...existing,
      name: input.name ?? existing.name,
      quantity: input.quantity ?? existing.quantity,
      unit: input.unit ?? existing.unit,
      category: input.category ?? existing.category,
      updatedAt: new Date().toISOString(),
    };
    this.items[idx] = updated;
    return { ...updated };
  }

  async deleteIngredient(id: string): Promise<void> {
    this.items = this.items.filter((i) => i.id !== id);
  }

  async clearIngredients(): Promise<void> {
    this.items = [];
  }
}

async function renderScanner(adapter: MemoryPantryAdapter) {
  const initial = adapter.items.map((i) => ({ ...i }));
  return render(
    <SafeAreaProvider
      initialMetrics={{
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
        frame: { x: 0, y: 0, width: 390, height: 844 },
      }}
    >
      <TypographyProvider usingFallback={true}>
        <PantryProvider storageAdapter={adapter} initialIngredients={initial}>
          <ScannerScreen />
        </PantryProvider>
      </TypographyProvider>
    </SafeAreaProvider>
  );
}

type Screen = Awaited<ReturnType<typeof renderScanner>>;

async function advanceToReview(screen: Screen) {
  await fireEvent.press(screen.getByTestId('scanner-gallery-button'));
  await waitFor(() => expect(screen.getByTestId('scanner-preview-state')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('scanner-analyze-button'));
  await waitFor(() => expect(screen.getByTestId('scanner-review-state')).toBeTruthy());
}

async function saveAndWait(screen: Screen) {
  await fireEvent.press(screen.getByTestId('scanner-confirm-save-button'));
  await waitFor(() => expect(screen.getByTestId('scanner-completed-state')).toBeTruthy());
}

/** ID dinámico del único ítem detectado en revisión. */
function onlyItemId(screen: Screen): string {
  const inputs = screen.getAllByTestId(/^detected-name-input-/);
  expect(inputs).toHaveLength(1);
  return String(inputs[0].props.testID).replace('detected-name-input-', '');
}

describe('Escáner renderizado — identidad bilingüe y renombrado (Fase 28C-B3.2)', () => {
  const cebolla = pantryItem('p-cebolla', 'Cebolla', 2, 'unidad', VEG);
  const ajo = pantryItem('p-ajo', 'Ajo', 1, 'unidad', VEG);

  beforeEach(() => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///photo.jpg',
          mimeType: 'image/jpeg',
          fileName: 'photo.jpg',
          width: 1200,
          height: 900,
          fileSize: 1024 * 1024,
        },
      ],
    });
  });

  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
  });

  it('«Onions» detectadas se suman a «Cebolla» y el nombre guardado no cambia', async () => {
    (scannerApi.analyzeIngredientsImage as jest.Mock).mockResolvedValueOnce([
      { name: 'Onions', quantity: 3, unit: 'unidad', needsReview: false },
    ]);
    const adapter = new MemoryPantryAdapter([cebolla, ajo]);
    const screen = await renderScanner(adapter);
    await advanceToReview(screen);
    await saveAndWait(screen);

    expect(adapter.items).toHaveLength(2);
    const stored = adapter.items.find((i) => i.id === 'p-cebolla')!;
    expect(stored.name).toBe('Cebolla');
    expect(stored.quantity).toBe(5);
    expect(stored.unit).toBe('unidad');
    expect(adapter.items.find((i) => i.id === 'p-ajo')!.quantity).toBe(1);
  });

  it('renombrar «Onion» a «Garlic» no suma a la cebolla ni al ajo automáticamente', async () => {
    (scannerApi.analyzeIngredientsImage as jest.Mock).mockResolvedValueOnce([
      { name: 'Onion', quantity: 3, unit: 'unidad', needsReview: false },
    ]);
    const adapter = new MemoryPantryAdapter([cebolla, ajo]);
    const screen = await renderScanner(adapter);
    await advanceToReview(screen);

    const id = onlyItemId(screen);
    await fireEvent.changeText(screen.getByTestId(`detected-name-input-${id}`), 'Garlic');
    await waitFor(() =>
      expect(screen.getByTestId(`detected-action-create-${id}`).props.accessibilityState.checked).toBe(true)
    );
    await saveAndWait(screen);

    expect(adapter.items).toHaveLength(3);
    expect(adapter.items.find((i) => i.id === 'p-cebolla')!.quantity).toBe(2);
    expect(adapter.items.find((i) => i.id === 'p-ajo')!.quantity).toBe(1);
    const created = adapter.items.find((i) => i.name === 'Garlic')!;
    expect(created.quantity).toBe(3);
    expect(created.unit).toBe('unidad');
  });

  it('renombrar a «Onion powder» elimina la coincidencia con «Cebolla»', async () => {
    (scannerApi.analyzeIngredientsImage as jest.Mock).mockResolvedValueOnce([
      { name: 'Onion', quantity: 100, unit: 'g', needsReview: false },
    ]);
    const adapter = new MemoryPantryAdapter([pantryItem('p-cebolla-g', 'Cebolla', 500, 'g', VEG)]);
    const screen = await renderScanner(adapter);
    await advanceToReview(screen);

    const id = onlyItemId(screen);
    expect(screen.getByTestId(`detected-duplicate-box-${id}`)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId(`detected-name-input-${id}`), 'Onion powder');
    await waitFor(() => expect(screen.queryByTestId(`detected-duplicate-box-${id}`)).toBeNull());

    // La categoría heredada (Verduras y frutas) no encaja con un polvo: se confirma explícitamente
    const confirm = screen.queryByTestId(`detected-semantic-confirm-${id}`);
    if (confirm) await fireEvent.press(confirm);
    await saveAndWait(screen);

    expect(adapter.items).toHaveLength(2);
    expect(adapter.items.find((i) => i.id === 'p-cebolla-g')!.quantity).toBe(500);
    expect(adapter.items.find((i) => i.name === 'Onion powder')!.quantity).toBe(100);
  });

  it('volver al nombre original exige elegir de nuevo la suma explícitamente', async () => {
    (scannerApi.analyzeIngredientsImage as jest.Mock).mockResolvedValueOnce([
      { name: 'Onion', quantity: 3, unit: 'unidad', needsReview: false },
    ]);
    const adapter = new MemoryPantryAdapter([cebolla, ajo]);
    const screen = await renderScanner(adapter);
    await advanceToReview(screen);

    const id = onlyItemId(screen);
    const input = screen.getByTestId(`detected-name-input-${id}`);
    await fireEvent.changeText(input, 'Garlic');
    await fireEvent.changeText(screen.getByTestId(`detected-name-input-${id}`), 'Onion');
    await waitFor(() =>
      expect(screen.getByTestId(`detected-action-create-${id}`).props.accessibilityState.checked).toBe(true)
    );

    await fireEvent.press(screen.getByTestId(`detected-action-add-${id}`));
    await waitFor(() =>
      expect(screen.getByTestId(`detected-action-add-${id}`).props.accessibilityState.checked).toBe(true)
    );
    await saveAndWait(screen);

    expect(adapter.items).toHaveLength(2);
    expect(adapter.items.find((i) => i.id === 'p-cebolla')!.quantity).toBe(5);
    expect(adapter.items.find((i) => i.id === 'p-ajo')!.quantity).toBe(1);
  });
});
