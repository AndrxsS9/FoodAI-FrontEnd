/**
 * Cierre MVP — Ampliación de la traducción visible de alimentos en la despensa.
 *
 * Cubre: español → inglés e inglés → español de la cobertura ampliada, búsqueda en ambos
 * idiomas, alimentos desconocidos y ambiguos sin cambios, distinciones de compuestos,
 * edición con el nombre ORIGINAL, eliminación por id original, ausencia de reescrituras y
 * aislamiento total de la ampliación respecto a duplicados, escáner y consumo.
 */
import React, { useEffect } from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import DespensaScreen from '../app/(tabs)/despensa';
import { LocaleProvider, useLocale } from '../src/context/LocaleContext';
import { ThemeProvider } from '../src/context/ThemeContext';
import { PantryProvider } from '../src/context/PantryContext';
import { BudgetProvider } from '../src/context/BudgetContext';
import { RecipeProvider } from '../src/context/RecipeContext';
import { MealPlanProvider } from '../src/context/MealPlanContext';
import { TypographyProvider } from '../src/theme';
import { Locale, LocaleStorageAdapter } from '../src/services/storage/localeStorage';
import { PantryStorageAdapter } from '../src/services/storage/pantryStorage';
import { CreateIngredientInput, Ingredient, UpdateIngredientInput } from '../src/types/pantry';
import {
  findDuplicateInPantry,
  getBilingualFoodIdentity,
  getLocalizedIngredientName,
} from '../src/utils/ingredientMapper';
import { calculatePantryDeduction } from '../src/utils/pantryConsumption';

jest.setTimeout(30000);

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));

// ---------------------------------------------------------------------------
// 1. Cobertura ampliada (función pura)
// ---------------------------------------------------------------------------

/** [español guardado, etiqueta española, etiqueta inglesa] de toda la lista prioritaria. */
const PRIORITY_FOODS: [string, string, string][] = [
  ['salchicha', 'Salchicha', 'Sausage'],
  ['maíz', 'Maíz', 'Corn'],
  ['pimentón', 'Pimentón', 'Bell pepper'],
  ['huevo', 'Huevo', 'Egg'],
  ['queso', 'Queso', 'Cheese'],
  ['tomate', 'Tomate', 'Tomato'],
  ['cebolla', 'Cebolla', 'Onion'],
  ['cebolla larga', 'Cebolla larga', 'Green onion'],
  ['papa', 'Papa', 'Potato'],
  ['batata', 'Batata', 'Sweet potato'],
  ['zanahoria', 'Zanahoria', 'Carrot'],
  ['ajo', 'Ajo', 'Garlic'],
  ['brócoli', 'Brócoli', 'Broccoli'],
  ['coliflor', 'Coliflor', 'Cauliflower'],
  ['pepino', 'Pepino', 'Cucumber'],
  ['lechuga', 'Lechuga', 'Lettuce'],
  ['espinaca', 'Espinaca', 'Spinach'],
  ['arveja', 'Arveja', 'Pea'],
  ['lenteja', 'Lenteja', 'Lentil'],
  ['garbanzo', 'Garbanzo', 'Chickpea'],
  ['frijol', 'Frijol', 'Bean'],
  ['atún', 'Atún', 'Tuna'],
  ['carne de res', 'Carne de res', 'Beef'],
  ['cerdo', 'Cerdo', 'Pork'],
  ['jamón', 'Jamón', 'Ham'],
  ['mantequilla', 'Mantequilla', 'Butter'],
  ['azúcar', 'Azúcar', 'Sugar'],
  ['sal', 'Sal', 'Salt'],
  ['aceite', 'Aceite', 'Oil'],
  ['vinagre', 'Vinagre', 'Vinegar'],
  ['agua', 'Agua', 'Water'],
  ['café', 'Café', 'Coffee'],
  ['banano', 'Banano', 'Banana'],
  ['plátano', 'Plátano', 'Plantain'],
  ['manzana', 'Manzana', 'Apple'],
  ['pera', 'Pera', 'Pear'],
  ['uva', 'Uva', 'Grape'],
  ['fresa', 'Fresa', 'Strawberry'],
  ['sandía', 'Sandía', 'Watermelon'],
  ['melón', 'Melón', 'Melon'],
  ['piña', 'Piña', 'Pineapple'],
  ['limón', 'Limón', 'Lime'],
  ['naranja', 'Naranja', 'Orange'],
  ['maracuyá', 'Maracuyá', 'Passion fruit'],
  ['aguacate', 'Aguacate', 'Avocado'],
  ['calabacín', 'Calabacín', 'Zucchini'],
  ['champiñón', 'Champiñón', 'Mushroom'],
  ['camarón', 'Camarón', 'Shrimp'],
];

describe('Cobertura ampliada — español → inglés', () => {
  it.each(PRIORITY_FOODS)('«%s» se muestra como «%s» (es) / «%s» (en)', (stored, es, en) => {
    expect(getLocalizedIngredientName(stored, 'en')).toBe(en);
    // Guardado en español: se respeta tal cual en español
    expect(getLocalizedIngredientName(stored, 'es')).toBe(stored);
    // La etiqueta española aprobada también se traduce
    expect(getLocalizedIngredientName(es, 'en')).toBe(en);
  });

  it('traduce plurales españoles y nombres sin tilde de la ampliación', () => {
    expect(getLocalizedIngredientName('Salchichas', 'en')).toBe('Sausage');
    expect(getLocalizedIngredientName('maiz', 'en')).toBe('Corn');
    expect(getLocalizedIngredientName('Pimentones', 'en')).toBe('Bell pepper');
    expect(getLocalizedIngredientName('Cebollas largas', 'en')).toBe('Green onion');
    expect(getLocalizedIngredientName('Arvejas', 'en')).toBe('Pea');
    expect(getLocalizedIngredientName('Bananos', 'en')).toBe('Banana');
    expect(getLocalizedIngredientName('platanos', 'en')).toBe('Plantain');
    expect(getLocalizedIngredientName('Melones', 'en')).toBe('Melon');
    expect(getLocalizedIngredientName('Limones', 'en')).toBe('Lime');
    expect(getLocalizedIngredientName('Naranjas', 'en')).toBe('Orange');
    expect(getLocalizedIngredientName('maracuya', 'en')).toBe('Passion fruit');
    expect(getLocalizedIngredientName('Frijoles', 'en')).toBe('Bean');
  });
});

describe('Cobertura ampliada — inglés → español', () => {
  // «Melon» se escribe igual en ambos idiomas (ver prueba dedicada más abajo)
  const ENGLISH_DISTINCT = PRIORITY_FOODS.filter(([stored]) => stored !== 'melón');

  it.each(ENGLISH_DISTINCT)('«%s»: guardado en inglés se muestra «%s» (inglés «%s»)', (_stored, es, en) => {
    expect(getLocalizedIngredientName(en, 'es')).toBe(es);
    // Guardado en inglés: se respeta tal cual en inglés
    expect(getLocalizedIngredientName(en, 'en')).toBe(en);
  });

  it('«Melon» (idéntico en ambos idiomas) se conserva tal cual y «Melón» se muestra «Melon» en inglés', () => {
    expect(getLocalizedIngredientName('Melon', 'es')).toBe('Melon');
    expect(getLocalizedIngredientName('Melon', 'en')).toBe('Melon');
    expect(getLocalizedIngredientName('Melón', 'en')).toBe('Melon');
    expect(getLocalizedIngredientName('Melones', 'en')).toBe('Melon');
  });

  it('traduce plurales ingleses de la ampliación', () => {
    expect(getLocalizedIngredientName('Sausages', 'es')).toBe('Salchicha');
    expect(getLocalizedIngredientName('Bell peppers', 'es')).toBe('Pimentón');
    expect(getLocalizedIngredientName('Green onions', 'es')).toBe('Cebolla larga');
    expect(getLocalizedIngredientName('Peas', 'es')).toBe('Arveja');
    expect(getLocalizedIngredientName('Bananas', 'es')).toBe('Banano');
    expect(getLocalizedIngredientName('Plantains', 'es')).toBe('Plátano');
    expect(getLocalizedIngredientName('Limes', 'es')).toBe('Limón');
    expect(getLocalizedIngredientName('Oranges', 'es')).toBe('Naranja');
    expect(getLocalizedIngredientName('Passion fruits', 'es')).toBe('Maracuyá');
    expect(getLocalizedIngredientName('Passionfruit', 'es')).toBe('Maracuyá');
    expect(getLocalizedIngredientName('Beans', 'es')).toBe('Frijol');
  });
});

describe('Cobertura ampliada — distinciones y casos ambiguos', () => {
  it('preserva las distinciones entre productos', () => {
    expect(getLocalizedIngredientName('Green onion', 'es')).toBe('Cebolla larga');
    expect(getLocalizedIngredientName('Green onion', 'es')).not.toBe('Cebolla');
    expect(getLocalizedIngredientName('Cebolla larga', 'en')).not.toBe('Onion');
    expect(getLocalizedIngredientName('Bell pepper', 'es')).toBe('Pimentón');
    expect(getLocalizedIngredientName('Black pepper', 'es')).toBe('Black pepper');
    expect(getLocalizedIngredientName('Sweet potato', 'es')).toBe('Batata');
    expect(getLocalizedIngredientName('Potato', 'es')).toBe('Papa');
    expect(getLocalizedIngredientName('Almond milk', 'es')).toBe('Almond milk');
    expect(getLocalizedIngredientName('Milk', 'es')).toBe('Leche');
    expect(getLocalizedIngredientName('Banana', 'es')).toBe('Banano');
    expect(getLocalizedIngredientName('Plantain', 'es')).toBe('Plátano');
    expect(getLocalizedIngredientName('Watermelon', 'es')).toBe('Sandía');
    expect(getLocalizedIngredientName('Melon', 'es')).toBe('Melon');
    expect(getLocalizedIngredientName('Chickpeas', 'es')).toBe('Garbanzo');
    expect(getLocalizedIngredientName('Peas', 'es')).toBe('Arveja');
  });

  it.each([
    'Hogao',
    'Carne',
    'Carnes',
    'Meat',
    'Pepper',
    'Pimienta',
    'Black pepper',
    'Paprika',
    'Lemon',
    'Spring onion',
    'Onion powder',
    'Cebolla en polvo',
    'Sweet corn',
    'Harina de maíz',
    'Corn flour',
    'Green peas',
    'Jugo de naranja',
    'Orange juice',
    'Carne de cerdo',
    'Salchicha ranchera',
    'Banano maduro',
    'Plátano verde',
    'Arepa',
  ])('el nombre ambiguo, compuesto o sin equivalente «%s» se conserva en ambos idiomas', (stored) => {
    expect(getLocalizedIngredientName(stored, 'es')).toBe(stored);
    expect(getLocalizedIngredientName(stored, 'en')).toBe(stored);
  });

  it('la ampliación es solo visible: no altera la identidad usada para comparar', () => {
    for (const term of [
      'Sausage', 'Salchicha', 'Corn', 'Maíz', 'Bell pepper', 'Pimentón', 'Green onion',
      'Cebolla larga', 'Pea', 'Arveja', 'Beef', 'Carne de res', 'Banana', 'Banano', 'Plantain',
      'Plátano', 'Melon', 'Melón', 'Lime', 'Limón', 'Orange', 'Naranja', 'Passion fruit',
      'Maracuyá', 'Hogao',
    ]) {
      expect(getBilingualFoodIdentity(term)).toBeNull();
    }
    // Las identidades originales siguen intactas
    expect(getBilingualFoodIdentity('Onions')).toBe('cebolla');
    expect(getBilingualFoodIdentity('Beans')).toBe('frijol');
  });
});

// ---------------------------------------------------------------------------
// 2. Duplicados, escáner y consumo intactos
// ---------------------------------------------------------------------------

describe('Ampliación visible — duplicados y consumo sin cambios', () => {
  const item = (id: string, name: string): Ingredient => ({
    id,
    name,
    quantity: 1,
    unit: 'unidad',
    category: 'Verduras y frutas',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  });

  it('una traducción visible nunca crea una coincidencia de duplicado nueva', () => {
    expect(findDuplicateInPantry('Sausage', [item('p1', 'Salchicha')])).toBeUndefined();
    expect(findDuplicateInPantry('Corn', [item('p2', 'Maíz')])).toBeUndefined();
    expect(findDuplicateInPantry('Green onion', [item('p3', 'Cebolla larga')])).toBeUndefined();
    expect(findDuplicateInPantry('Green onion', [item('p4', 'Cebolla')])).toBeUndefined();
    expect(findDuplicateInPantry('Beef', [item('p5', 'Carne de res')])).toBeUndefined();
    expect(findDuplicateInPantry('Lime', [item('p6', 'Limón')])).toBeUndefined();
  });

  it('una receta en otro idioma no descuenta automáticamente un alimento de la ampliación', () => {
    const plan = calculatePantryDeduction(
      [item('p1', 'Salchicha'), item('p2', 'Plátano')],
      [
        { name: 'Sausage', quantity: 1, unit: 'unidad' },
        { name: 'Plantain', quantity: 1, unit: 'unidad' },
      ]
    );
    expect(plan.canDeductAny).toBe(false);
    expect(plan.deductibleItems).toHaveLength(0);
    expect(plan.items.map((i) => i.status)).toEqual([
      'requires_review_not_found',
      'requires_review_not_found',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 3. Pantalla de despensa
// ---------------------------------------------------------------------------

const stamp = '2026-11-01T00:00:00.000Z';
const PANTRY: Ingredient[] = [
  { id: 'p-sausage', name: 'Sausage', quantity: 6, unit: 'unidad', category: 'Carnes y proteínas', expirationDate: '2026-12-01', createdAt: stamp, updatedAt: stamp },
  { id: 'p-maiz', name: 'Maíz', quantity: 500, unit: 'g', category: 'Granos y cereales', createdAt: stamp, updatedAt: stamp },
  { id: 'p-green-onion', name: 'Green onion', quantity: 2, unit: 'unidad', category: 'Verduras y frutas', createdAt: stamp, updatedAt: stamp },
  { id: 'p-cebolla', name: 'Cebolla', quantity: 3, unit: 'unidad', category: 'Verduras y frutas', createdAt: stamp, updatedAt: stamp },
  { id: 'p-platano', name: 'Plátano', quantity: 4, unit: 'unidad', category: 'Verduras y frutas', createdAt: stamp, updatedAt: stamp },
  { id: 'p-hogao', name: 'Hogao', quantity: 1, unit: 'unidad', category: 'Otros', createdAt: stamp, updatedAt: stamp },
];
const STORED_NAMES = PANTRY.map((i) => i.name);

class SpyPantryAdapter implements PantryStorageAdapter {
  items: Ingredient[];
  updates: UpdateIngredientInput[] = [];
  deletes: string[] = [];
  saves = 0;
  constructor(initial: Ingredient[]) {
    this.items = initial.map((i) => ({ ...i }));
  }
  async getIngredients() {
    return this.items.map((i) => ({ ...i }));
  }
  async saveIngredients(next: Ingredient[]) {
    this.saves += 1;
    this.items = next.map((i) => ({ ...i }));
  }
  async addIngredient(input: CreateIngredientInput): Promise<Ingredient> {
    const created: Ingredient = {
      ...input,
      id: `new-${this.items.length}`,
      createdAt: '2026-11-10T00:00:00.000Z',
      updatedAt: '2026-11-10T00:00:00.000Z',
    };
    this.items.unshift(created);
    return { ...created };
  }
  async updateIngredient(input: UpdateIngredientInput): Promise<Ingredient> {
    this.updates.push({ ...input });
    const idx = this.items.findIndex((i) => i.id === input.id);
    const updated = {
      ...this.items[idx],
      ...input,
      expirationDate: input.expirationDate ?? undefined,
    } as Ingredient;
    this.items[idx] = updated;
    return { ...updated };
  }
  async deleteIngredient(id: string) {
    this.deletes.push(id);
    this.items = this.items.filter((i) => i.id !== id);
  }
  async clearIngredients() {
    this.items = [];
  }
}

class MemoryLocaleAdapter implements LocaleStorageAdapter {
  stored: Locale | null = null;
  async getLocale() {
    return this.stored;
  }
  async saveLocale(locale: Locale) {
    this.stored = locale;
  }
  async clearLocale() {
    this.stored = null;
  }
}

let localeControl: ReturnType<typeof useLocale> | null = null;
function LocaleControl() {
  const control = useLocale();
  useEffect(() => {
    localeControl = control;
  }, [control]);
  return null;
}

const METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

async function renderPantry(adapter: SpyPantryAdapter, locale: Locale = 'es') {
  const view = await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <TypographyProvider usingFallback>
        <LocaleProvider initialLocale={locale} storageAdapter={new MemoryLocaleAdapter()}>
          <ThemeProvider initialMode="light">
            <PantryProvider storageAdapter={adapter}>
              <BudgetProvider initialPreferences={{ budget: 20000, servings: 2 }}>
                <RecipeProvider initialIsDemoMode>
                  <MealPlanProvider>
                    <LocaleControl />
                    <DespensaScreen />
                  </MealPlanProvider>
                </RecipeProvider>
              </BudgetProvider>
            </PantryProvider>
          </ThemeProvider>
        </LocaleProvider>
      </TypographyProvider>
    </SafeAreaProvider>
  );
  await waitFor(() => expect(view.getByTestId('ingredient-card-p-sausage')).toBeTruthy());
  return view;
}

const switchLocale = async (next: Locale) => {
  await act(async () => {
    await localeControl!.setLocale(next).catch(() => {});
  });
};

const expectNoWrites = (adapter: SpyPantryAdapter) => {
  expect(adapter.updates).toEqual([]);
  expect(adapter.deletes).toEqual([]);
  expect(adapter.saves).toBe(0);
  expect(adapter.items).toEqual(PANTRY);
};

beforeEach(async () => {
  await AsyncStorage.clear();
  localeControl = null;
});

afterEach(() => {
  cleanup();
});

describe('Despensa — cobertura ampliada en pantalla', () => {
  it('muestra la ampliación en ambos idiomas y conserva lo desconocido, sin reescribir datos', async () => {
    const adapter = new SpyPantryAdapter(PANTRY);
    const view = await renderPantry(adapter, 'es');

    expect(view.getByText('Salchicha')).toBeTruthy();
    expect(view.getByText('Maíz')).toBeTruthy();
    expect(view.getByText('Cebolla larga')).toBeTruthy();
    expect(view.getByText('Cebolla')).toBeTruthy();
    expect(view.getByText('Plátano')).toBeTruthy();
    expect(view.getByText('Hogao')).toBeTruthy();
    expect(view.queryByText('Sausage')).toBeNull();
    expect(view.queryByText('Green onion')).toBeNull();

    await switchLocale('en');
    await waitFor(() => expect(view.getByText('Sausage')).toBeTruthy());
    expect(view.getByText('Corn')).toBeTruthy();
    expect(view.getByText('Green onion')).toBeTruthy();
    expect(view.getByText('Onion')).toBeTruthy();
    expect(view.getByText('Plantain')).toBeTruthy();
    expect(view.getByText('Hogao')).toBeTruthy();
    expect(view.queryByText('Salchicha')).toBeNull();
    expect(view.queryByText('Maíz')).toBeNull();

    expectNoWrites(adapter);
    expect(adapter.items.map((i) => i.name)).toEqual(STORED_NAMES);
  });

  it('la búsqueda encuentra la ampliación por nombre guardado, español e inglés', async () => {
    const adapter = new SpyPantryAdapter(PANTRY);
    const view = await renderPantry(adapter, 'es');
    const search = view.getByTestId('pantry-search-input');

    // Español (nombre visible traducido de «Sausage»)
    await fireEvent.changeText(search, 'salchicha');
    await waitFor(() => expect(view.getByTestId('ingredient-card-p-sausage')).toBeTruthy());
    expect(view.queryByTestId('ingredient-card-p-maiz')).toBeNull();

    // Inglés (nombre visible traducido de «Maíz») mientras la app está en español
    await fireEvent.changeText(search, 'corn');
    await waitFor(() => expect(view.getByTestId('ingredient-card-p-maiz')).toBeTruthy());
    expect(view.queryByTestId('ingredient-card-p-sausage')).toBeNull();

    // Inglés guardado y español visible sin tilde
    await fireEvent.changeText(search, 'platano');
    await waitFor(() => expect(view.getByTestId('ingredient-card-p-platano')).toBeTruthy());
    expect(view.queryByTestId('ingredient-card-p-hogao')).toBeNull();

    await switchLocale('en');

    await fireEvent.changeText(search, 'plantain');
    await waitFor(() => expect(view.getByTestId('ingredient-card-p-platano')).toBeTruthy());
    expect(view.queryByTestId('ingredient-card-p-sausage')).toBeNull();

    await fireEvent.changeText(search, 'cebolla larga');
    await waitFor(() => expect(view.getByTestId('ingredient-card-p-green-onion')).toBeTruthy());
    // «Cebolla» no contiene «cebolla larga»: no aparece
    expect(view.queryByTestId('ingredient-card-p-cebolla')).toBeNull();

    // Nombre guardado sin traducción
    await fireEvent.changeText(search, 'hogao');
    await waitFor(() => expect(view.getByTestId('ingredient-card-p-hogao')).toBeTruthy());
    expect(view.queryByTestId('ingredient-card-p-platano')).toBeNull();

    // Etiqueta de categoría
    await fireEvent.changeText(search, 'Carnes');
    await waitFor(() => expect(view.getByTestId('ingredient-card-p-sausage')).toBeTruthy());
    expect(view.queryByTestId('ingredient-card-p-maiz')).toBeNull();

    expectNoWrites(adapter);
  });

  it('el formulario de edición usa el nombre ORIGINAL y guardar sin cambios no lo reescribe', async () => {
    const adapter = new SpyPantryAdapter(PANTRY);
    const view = await renderPantry(adapter, 'es');

    await fireEvent.press(view.getByTestId('edit-ingredient-p-sausage'));
    await waitFor(() => expect(view.getByTestId('ingredient-name-input')).toBeTruthy());
    expect(view.getByTestId('ingredient-name-input').props.value).toBe('Sausage');

    await act(async () => {
      await fireEvent.press(view.getByTestId('submit-ingredient-form'));
    });
    await waitFor(() => expect(adapter.updates).toHaveLength(1));
    expect(adapter.updates[0]).toMatchObject({
      id: 'p-sausage',
      name: 'Sausage',
      quantity: 6,
      unit: 'unidad',
      category: 'Carnes y proteínas',
    });
    expect(adapter.items.find((i) => i.id === 'p-sausage')?.name).toBe('Sausage');
    await waitFor(() => expect(view.getByText('Salchicha')).toBeTruthy());
  });

  it('el formulario en inglés también conserva el nombre español guardado', async () => {
    const adapter = new SpyPantryAdapter(PANTRY);
    const view = await renderPantry(adapter, 'en');

    await fireEvent.press(view.getByTestId('edit-ingredient-p-maiz'));
    await waitFor(() => expect(view.getByTestId('ingredient-name-input')).toBeTruthy());
    expect(view.getByTestId('ingredient-name-input').props.value).toBe('Maíz');

    await fireEvent.press(view.getByTestId('cancel-ingredient-form'));
    await waitFor(() => expect(view.queryByTestId('ingredient-name-input')).toBeNull());
    expectNoWrites(adapter);
  });

  it('eliminar usa el id original y muestra el nombre localizado en la confirmación', async () => {
    const adapter = new SpyPantryAdapter(PANTRY);
    const view = await renderPantry(adapter, 'en');

    await fireEvent.press(view.getByTestId('delete-ingredient-p-platano'));
    await waitFor(() => expect(view.getByTestId('delete-confirm-button')).toBeTruthy());
    expect(view.getByText('«Plantain»')).toBeTruthy();

    await act(async () => {
      await fireEvent.press(view.getByTestId('delete-confirm-button'));
    });
    await waitFor(() => expect(view.queryByTestId('ingredient-card-p-platano')).toBeNull());
    expect(adapter.deletes).toEqual(['p-platano']);
    expect(adapter.updates).toEqual([]);
    expect(adapter.items.map((i) => i.name)).toEqual(
      STORED_NAMES.filter((name) => name !== 'Plátano')
    );
  });
});
