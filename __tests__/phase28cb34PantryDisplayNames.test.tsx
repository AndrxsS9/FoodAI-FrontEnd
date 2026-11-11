/**
 * Fase 28C-B3.4 — Nombres visibles bilingües de ingredientes en la despensa (solo presentación).
 *
 * Cubre: traducción visible inglés → español y español → inglés, nombres desconocidos y
 * ambiguos sin cambios, tildes correctas, cambio de idioma reactivo, búsqueda bilingüe,
 * edición con el nombre ORIGINAL guardado, eliminación por id original, ajustes de cantidad
 * intactos, persistencia sin reescrituras y seguridad de la detección de duplicados.
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
// 1. Función pura getLocalizedIngredientName
// ---------------------------------------------------------------------------

describe('getLocalizedIngredientName — traducción visible', () => {
  it.each([
    ['Chicken', 'Pollo', 'Chicken'],
    ['Cebolla', 'Cebolla', 'Onion'],
    ['Tomato', 'Tomate', 'Tomato'],
    ['Queso', 'Queso', 'Cheese'],
    ['Eggplant', 'Berenjena', 'Eggplant'],
  ])('«%s» → es «%s», en «%s»', (stored, es, en) => {
    expect(getLocalizedIngredientName(stored, 'es')).toBe(es);
    expect(getLocalizedIngredientName(stored, 'en')).toBe(en);
  });

  it('traduce inglés → español, incluidos plurales ingleses', () => {
    expect(getLocalizedIngredientName('Onions', 'es')).toBe('Cebolla');
    expect(getLocalizedIngredientName('Tomatoes', 'es')).toBe('Tomate');
    expect(getLocalizedIngredientName('Strawberries', 'es')).toBe('Fresa');
    expect(getLocalizedIngredientName('sweet potato', 'es')).toBe('Batata');
    expect(getLocalizedIngredientName('Potato', 'es')).toBe('Papa');
  });

  it('traduce español → inglés, incluidos plurales y nombres sin tilde', () => {
    expect(getLocalizedIngredientName('Huevos', 'en')).toBe('Egg');
    expect(getLocalizedIngredientName('papas', 'en')).toBe('Potato');
    expect(getLocalizedIngredientName('Batata', 'en')).toBe('Sweet potato');
    expect(getLocalizedIngredientName('champinon', 'en')).toBe('Mushroom');
    expect(getLocalizedIngredientName('Azúcar', 'en')).toBe('Sugar');
  });

  it('muestra las tildes españolas correctas', () => {
    expect(getLocalizedIngredientName('Sugar', 'es')).toBe('Azúcar');
    expect(getLocalizedIngredientName('Broccoli', 'es')).toBe('Brócoli');
    expect(getLocalizedIngredientName('Pineapple', 'es')).toBe('Piña');
    expect(getLocalizedIngredientName('Watermelon', 'es')).toBe('Sandía');
    expect(getLocalizedIngredientName('Zucchini', 'es')).toBe('Calabacín');
    expect(getLocalizedIngredientName('Mushrooms', 'es')).toBe('Champiñón');
    expect(getLocalizedIngredientName('Tuna', 'es')).toBe('Atún');
    expect(getLocalizedIngredientName('Shrimp', 'es')).toBe('Camarón');
    expect(getLocalizedIngredientName('Ham', 'es')).toBe('Jamón');
    expect(getLocalizedIngredientName('Coffee', 'es')).toBe('Café');
  });

  it('conserva el texto original cuando ya está en el idioma solicitado', () => {
    expect(getLocalizedIngredientName('Cebollas moradas', 'es')).toBe('Cebollas moradas');
    expect(getLocalizedIngredientName('Tomates', 'es')).toBe('Tomates');
    expect(getLocalizedIngredientName('azucar', 'es')).toBe('azucar');
    expect(getLocalizedIngredientName('Tomatoes', 'en')).toBe('Tomatoes');
    expect(getLocalizedIngredientName('  chicken ', 'en')).toBe('  chicken ');
  });

  it.each([
    'Quinoa roja',
    'Salsa de la abuela',
    'Arepa',
    'Leche entera',
    'Tomate chonto',
    'Pechuga de pollo',
  ])('un nombre desconocido «%s» se conserva en ambos idiomas', (stored) => {
    expect(getLocalizedIngredientName(stored, 'es')).toBe(stored);
    expect(getLocalizedIngredientName(stored, 'en')).toBe(stored);
  });

  it.each([
    'Green onion',
    'Spring onion',
    'Almond milk',
    'Leche de almendra',
    'Onion powder',
    'Ajo en polvo',
    'Peanut butter',
    'Pepper',
    'Lemon',
    'Lime',
    'Bacon',
    'Banana',
    'Meat',
    'Carne',
  ])('un nombre ambiguo o compuesto «%s» se conserva en ambos idiomas', (stored) => {
    expect(getLocalizedIngredientName(stored, 'es')).toBe(stored);
    expect(getLocalizedIngredientName(stored, 'en')).toBe(stored);
  });

  it('nunca confunde batata con papa', () => {
    expect(getLocalizedIngredientName('Sweet potato', 'es')).toBe('Batata');
    expect(getLocalizedIngredientName('Sweet potatoes', 'es')).toBe('Batata');
    expect(getLocalizedIngredientName('Potatoes', 'es')).toBe('Papa');
    expect(getLocalizedIngredientName('Batata', 'en')).not.toBe('Potato');
  });

  it('cadenas vacías o con solo espacios se devuelven tal cual', () => {
    expect(getLocalizedIngredientName('', 'es')).toBe('');
    expect(getLocalizedIngredientName('   ', 'en')).toBe('   ');
  });

  it('es determinista y no altera la identidad bilingüe existente', () => {
    for (let i = 0; i < 3; i += 1) {
      expect(getLocalizedIngredientName('Chicken', 'es')).toBe('Pollo');
    }
    expect(getBilingualFoodIdentity('Chicken')).toBe('pollo');
    expect(getBilingualFoodIdentity('Green onion')).toBeNull();
    expect(getBilingualFoodIdentity('Almond milk')).toBeNull();
  });

  it('tiene etiqueta en ambos idiomas para cada identidad reconocida', () => {
    const englishTerms = [
      'onion', 'tomato', 'egg', 'garlic', 'rice', 'chicken', 'carrot', 'potato', 'sweet potato',
      'milk', 'cheese', 'salt', 'sugar', 'butter', 'flour', 'bread', 'oil', 'bean', 'lentil',
      'chickpea', 'oats', 'lettuce', 'spinach', 'cucumber', 'broccoli', 'cauliflower', 'avocado',
      'apple', 'pear', 'strawberry', 'pineapple', 'grape', 'watermelon', 'eggplant', 'zucchini',
      'mushroom', 'celery', 'cabbage', 'ginger', 'parsley', 'basil', 'pork', 'turkey', 'fish',
      'tuna', 'shrimp', 'ham', 'yogurt', 'vinegar', 'honey', 'coffee', 'water', 'cinnamon', 'cumin',
    ];
    for (const term of englishTerms) {
      const es = getLocalizedIngredientName(term, 'es');
      expect(es).not.toBe(term);
      expect(getBilingualFoodIdentity(es)).toBe(getBilingualFoodIdentity(term));
      // Ida y vuelta: la etiqueta española se muestra en inglés con la misma identidad
      expect(getBilingualFoodIdentity(getLocalizedIngredientName(es, 'en'))).toBe(
        getBilingualFoodIdentity(term)
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Detección de duplicados intacta
// ---------------------------------------------------------------------------

describe('Detección de duplicados — comportamiento seguro intacto', () => {
  const item = (id: string, name: string): Ingredient => ({
    id,
    name,
    quantity: 1,
    unit: 'unidad',
    category: 'Verduras y frutas',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  });

  it('sigue emparejando por identidad completa y devuelve el nombre guardado original', () => {
    const match = findDuplicateInPantry('Onions', [item('p1', 'Cebolla')]);
    expect(match).toMatchObject({ id: 'p1', name: 'Cebolla', matchType: 'exact' });
  });

  it('nunca empareja nombres compuestos o ambiguos', () => {
    expect(findDuplicateInPantry('Green onion', [item('p1', 'Cebolla')])).toBeUndefined();
    expect(findDuplicateInPantry('Almond milk', [item('p2', 'Leche')])).toBeUndefined();
    expect(findDuplicateInPantry('Onion powder', [item('p3', 'Cebolla')])).toBeUndefined();
    expect(findDuplicateInPantry('Sweet potato', [item('p4', 'Papa')])).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Pantalla de despensa
// ---------------------------------------------------------------------------

const PANTRY: Ingredient[] = [
  {
    id: 'p-chicken',
    name: 'Chicken',
    quantity: 500,
    unit: 'g',
    category: 'Carnes y proteínas',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 'p-cebolla',
    name: 'Cebolla',
    quantity: 3,
    unit: 'unidad',
    category: 'Verduras y frutas',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 'p-sugar',
    name: 'Sugar',
    quantity: 1,
    unit: 'kg',
    category: 'Granos y cereales',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 'p-green-onion',
    name: 'Green onion',
    quantity: 2,
    unit: 'unidad',
    category: 'Verduras y frutas',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
];

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
  await waitFor(() => expect(view.getByTestId('ingredient-card-p-chicken')).toBeTruthy());
  return view;
}

const switchLocale = async (next: Locale) => {
  await act(async () => {
    await localeControl!.setLocale(next).catch(() => {});
  });
};

beforeEach(async () => {
  await AsyncStorage.clear();
  localeControl = null;
});

afterEach(() => {
  cleanup();
});

describe('Despensa — nombres visibles en el idioma activo', () => {
  it('muestra los nombres conocidos en español y conserva los desconocidos', async () => {
    const adapter = new SpyPantryAdapter(PANTRY);
    const view = await renderPantry(adapter, 'es');

    expect(view.getByText('Pollo')).toBeTruthy();
    expect(view.getByText('Cebolla')).toBeTruthy();
    expect(view.getByText('Azúcar')).toBeTruthy();
    expect(view.getByText('Green onion')).toBeTruthy();
    expect(view.queryByText('Chicken')).toBeNull();
    expect(view.queryByText('Sugar')).toBeNull();
  });

  it('cambia los nombres de forma reactiva al alternar el idioma, sin reescribir datos', async () => {
    const adapter = new SpyPantryAdapter(PANTRY);
    const view = await renderPantry(adapter, 'es');
    expect(view.getByText('Pollo')).toBeTruthy();

    await switchLocale('en');
    await waitFor(() => expect(view.getByText('Chicken')).toBeTruthy());
    expect(view.getByText('Onion')).toBeTruthy();
    expect(view.getByText('Sugar')).toBeTruthy();
    expect(view.getByText('Green onion')).toBeTruthy();
    expect(view.queryByText('Pollo')).toBeNull();

    await switchLocale('es');
    await waitFor(() => expect(view.getByText('Pollo')).toBeTruthy());
    expect(view.getByText('Cebolla')).toBeTruthy();

    // Ninguna escritura: los nombres guardados permanecen idénticos
    expect(adapter.updates).toEqual([]);
    expect(adapter.deletes).toEqual([]);
    expect(adapter.saves).toBe(0);
    expect(adapter.items.map((i) => i.name)).toEqual(['Chicken', 'Cebolla', 'Sugar', 'Green onion']);
  });

  it('las etiquetas de accesibilidad usan el nombre visible localizado', async () => {
    const adapter = new SpyPantryAdapter(PANTRY);
    const view = await renderPantry(adapter, 'es');

    expect(view.getByLabelText('Editar Pollo')).toBeTruthy();
    expect(view.getByLabelText('Eliminar Pollo')).toBeTruthy();
    expect(view.getByLabelText('Aumentar cantidad de Pollo')).toBeTruthy();
    expect(view.getByLabelText('Disminuir cantidad de Pollo')).toBeTruthy();
    expect(view.getByLabelText('Ver o editar Pollo')).toBeTruthy();

    await switchLocale('en');
    await waitFor(() => expect(view.getByLabelText('Edit Onion')).toBeTruthy());
    expect(view.getByLabelText('Delete Chicken')).toBeTruthy();
    expect(view.getByLabelText('Increase quantity of Sugar')).toBeTruthy();
  });

  it('la búsqueda encuentra un alimento por su nombre en español y en inglés', async () => {
    const adapter = new SpyPantryAdapter(PANTRY);
    const view = await renderPantry(adapter, 'es');
    const search = view.getByTestId('pantry-search-input');

    await fireEvent.changeText(search, 'pollo');
    await waitFor(() => expect(view.getByTestId('ingredient-card-p-chicken')).toBeTruthy());
    expect(view.queryByTestId('ingredient-card-p-cebolla')).toBeNull();

    await fireEvent.changeText(search, 'chicken');
    await waitFor(() => expect(view.getByTestId('ingredient-card-p-chicken')).toBeTruthy());
    expect(view.queryByTestId('ingredient-card-p-sugar')).toBeNull();

    await fireEvent.changeText(search, 'onion');
    await waitFor(() => expect(view.getByTestId('ingredient-card-p-cebolla')).toBeTruthy());
    expect(view.getByTestId('ingredient-card-p-green-onion')).toBeTruthy();
    expect(view.queryByTestId('ingredient-card-p-chicken')).toBeNull();

    // Sin tilde también encuentra «Azúcar» (guardado como «Sugar»)
    await fireEvent.changeText(search, 'azucar');
    await waitFor(() => expect(view.getByTestId('ingredient-card-p-sugar')).toBeTruthy());
    expect(view.queryByTestId('ingredient-card-p-cebolla')).toBeNull();

    await switchLocale('en');
    await fireEvent.changeText(search, 'cebolla');
    await waitFor(() => expect(view.getByTestId('ingredient-card-p-cebolla')).toBeTruthy());
    // «Green onion» no tiene identidad bilingüe: no aparece al buscar «cebolla»
    expect(view.queryByTestId('ingredient-card-p-green-onion')).toBeNull();

    expect(adapter.updates).toEqual([]);
    expect(adapter.saves).toBe(0);
  });

  it('la búsqueda por categoría localizada se conserva', async () => {
    const adapter = new SpyPantryAdapter(PANTRY);
    const view = await renderPantry(adapter, 'en');
    await fireEvent.changeText(view.getByTestId('pantry-search-input'), 'Carnes');
    await waitFor(() => expect(view.getByTestId('ingredient-card-p-chicken')).toBeTruthy());
    expect(view.queryByTestId('ingredient-card-p-cebolla')).toBeNull();
  });

  it('el formulario de edición usa el nombre ORIGINAL y guardar sin cambios no lo reescribe', async () => {
    const adapter = new SpyPantryAdapter(PANTRY);
    const view = await renderPantry(adapter, 'es');

    await fireEvent.press(view.getByTestId('edit-ingredient-p-chicken'));
    await waitFor(() => expect(view.getByTestId('ingredient-name-input')).toBeTruthy());
    expect(view.getByTestId('ingredient-name-input').props.value).toBe('Chicken');

    // Abrir y cerrar sin cambios: ninguna escritura
    await fireEvent.press(view.getByTestId('cancel-ingredient-form'));
    await waitFor(() => expect(view.queryByTestId('ingredient-name-input')).toBeNull());
    expect(adapter.updates).toEqual([]);

    // Guardar sin cambiar el nombre: se envía el nombre original, no el traducido
    await fireEvent.press(view.getByTestId('edit-ingredient-p-chicken'));
    await waitFor(() => expect(view.getByTestId('ingredient-name-input')).toBeTruthy());
    await act(async () => {
      await fireEvent.press(view.getByTestId('submit-ingredient-form'));
    });
    await waitFor(() => expect(adapter.updates).toHaveLength(1));
    expect(adapter.updates[0]).toMatchObject({
      id: 'p-chicken',
      name: 'Chicken',
      quantity: 500,
      unit: 'g',
      category: 'Carnes y proteínas',
    });
    expect(adapter.items.find((i) => i.id === 'p-chicken')?.name).toBe('Chicken');
    await waitFor(() => expect(view.getByText('Pollo')).toBeTruthy());
  });

  it('eliminar usa el id original y muestra el nombre localizado en la confirmación', async () => {
    const adapter = new SpyPantryAdapter(PANTRY);
    const view = await renderPantry(adapter, 'es');

    await fireEvent.press(view.getByTestId('delete-ingredient-p-chicken'));
    await waitFor(() => expect(view.getByTestId('delete-confirm-button')).toBeTruthy());
    expect(view.getByText('«Pollo»')).toBeTruthy();

    await act(async () => {
      await fireEvent.press(view.getByTestId('delete-confirm-button'));
    });
    await waitFor(() => expect(view.queryByTestId('ingredient-card-p-chicken')).toBeNull());
    expect(adapter.deletes).toEqual(['p-chicken']);
    expect(adapter.items.map((i) => i.name)).toEqual(['Cebolla', 'Sugar', 'Green onion']);
  });

  it('los ajustes de cantidad usan el id original y no tocan nombre, unidad ni categoría', async () => {
    const adapter = new SpyPantryAdapter(PANTRY);
    const view = await renderPantry(adapter, 'en');

    await act(async () => {
      await fireEvent.press(view.getByTestId('stepper-plus-p-cebolla'));
    });
    await waitFor(() => expect(adapter.updates).toHaveLength(1));
    expect(adapter.updates[0]).toEqual({ id: 'p-cebolla', quantity: 4 });

    await act(async () => {
      await fireEvent.press(view.getByTestId('stepper-minus-p-chicken'));
    });
    await waitFor(() => expect(adapter.updates).toHaveLength(2));
    expect(adapter.updates[1]).toEqual({ id: 'p-chicken', quantity: 450 });

    expect(adapter.items).toEqual([
      { ...PANTRY[0], quantity: 450, expirationDate: undefined },
      { ...PANTRY[1], quantity: 4, expirationDate: undefined },
      PANTRY[2],
      PANTRY[3],
    ]);
    await waitFor(() => expect(view.getByText('Onion')).toBeTruthy());
  });
});
