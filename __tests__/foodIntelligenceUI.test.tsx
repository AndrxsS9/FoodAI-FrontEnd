/**
 * FoodAI - Fase 28A: sugerencias inteligentes en el formulario manual y el escáner (interfaz).
 *
 * Cubre:
 * 1-5. Sugerencias automáticas de categoría y unidad en el formulario (claramente indicadas).
 * 6.   Nombres desconocidos conservan la selección manual / valores neutrales.
 * 7.   Las elecciones manuales nunca se sobrescriben al cambiar el nombre.
 * 8.   Cambiar de unidad nunca convierte la cantidad en silencio.
 * 9.   Combinaciones sospechosas exigen confirmación antes de guardar.
 * 10.  Editar un alimento existente no modifica en silencio sus valores guardados.
 * 11.  El escáner conserva medidas detectadas, marca combinaciones inusuales y pide confirmación.
 * 15.  Accesibilidad y pantallas pequeñas.
 */
import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { IngredientFormModal } from '../src/components/pantry';
import {
  DetectedIngredientCard,
  DetectedIngredientCardProps,
  MIN_TOUCH_TARGET,
} from '../src/components/scanner/DetectedIngredientCard';
import { ThemeProvider, TypographyProvider } from '../src/theme';
import {
  CreateIngredientInput,
  Ingredient,
  UpdateIngredientInput,
} from '../src/types/pantry';
import { ScannedIngredientItem } from '../src/types/scanner';
import { UNIT_CHANGE_QUANTITY_ERROR } from '../src/components/pantry/IngredientFormModal';
import ScannerScreen from '../app/escaner/index';
import { PantryProvider } from '../src/context/PantryContext';
import { PantryStorageAdapter } from '../src/services/storage/pantryStorage';
import { scannerApi } from '../src/services/api/scannerApi';

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
  manipulateAsync: jest.fn().mockImplementation((uri: string) =>
    Promise.resolve({ uri: `${uri}_optimized.jpg`, width: 1600, height: 1200 })
  ),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));

jest.mock('../src/services/api/scannerApi', () => {
  const actual = jest.requireActual('../src/services/api/scannerApi');
  return { ...actual, scannerApi: { analyzeIngredientsImage: jest.fn() } };
});

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const lightStorage = {
  getThemeMode: async () => 'light' as const,
  saveThemeMode: async () => {},
  clearThemeMode: async () => {},
};

const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={METRICS}>
    <ThemeProvider initialMode="light" storageAdapter={lightStorage}>
      <TypographyProvider usingFallback={true}>{ui}</TypographyProvider>
    </ThemeProvider>
  </SafeAreaProvider>
);

const flat = (style: unknown) =>
  StyleSheet.flatten(typeof style === 'function' ? style({ pressed: false }) : style) ?? {};

const isSelected = (node: { props: { accessibilityState?: { selected?: boolean } } }) =>
  node.props.accessibilityState?.selected === true;

const renderForm = async (initialIngredient: Ingredient | null = null) => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const utils = await render(
    wrap(
      <IngredientFormModal
        visible
        initialIngredient={initialIngredient}
        onClose={jest.fn()}
        onSave={onSave}
      />
    )
  );
  return { ...utils, onSave };
};

const submit = async (getByTestId: (id: string) => any) => {
  await act(async () => {
    await fireEvent.press(getByTestId('submit-ingredient-form'));
  });
};

afterEach(async () => {
  await cleanup();
  jest.clearAllMocks();
});

describe('Formulario manual · sugerencias automáticas', () => {
  it.each([
    ['Leche líquida', 'Lácteos', 'l'],
    ['Leche en polvo', 'Lácteos', 'g'],
    ['Arroz', 'Granos y cereales', 'kg'],
    ['Huevos', 'Carnes y proteínas', 'unidad'],
    ['Aceite de oliva', 'Alacena', 'l'],
    ['Zanahoria', 'Verduras y frutas', 'unidad'],
  ])('«%s» sugiere %s y la unidad %s, y se guarda así', async (name, category, unit) => {
    const { getByTestId, onSave } = await renderForm();

    await fireEvent.changeText(getByTestId('ingredient-name-input'), name);

    expect(isSelected(getByTestId(`category-option-${category}`))).toBe(true);
    expect(isSelected(getByTestId(`unit-option-${unit}`))).toBe(true);

    await submit(getByTestId);
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name, category, unit, quantity: 1 })
    );
  });

  it('indica claramente que los valores son recomendaciones', async () => {
    const { getByTestId, getByText } = await renderForm();
    await fireEvent.changeText(getByTestId('ingredient-name-input'), 'Leche');

    expect(getByTestId('category-suggestion-hint')).toBeTruthy();
    expect(getByText('Categoría sugerida según el nombre. Puedes cambiarla.')).toBeTruthy();
    expect(getByTestId('unit-suggestion-hint')).toBeTruthy();
    expect(getByText(/Unidad sugerida: Litros \(l\) o Mililitros \(ml\)/)).toBeTruthy();
  });

  it('pasar de «Leche» a «Leche en polvo» actualiza la unidad sugerida sin tocar la cantidad', async () => {
    const { getByTestId } = await renderForm();
    const nameInput = getByTestId('ingredient-name-input');

    await fireEvent.changeText(nameInput, 'Leche');
    expect(isSelected(getByTestId('unit-option-l'))).toBe(true);

    await fireEvent.changeText(nameInput, 'Leche en polvo');
    expect(isSelected(getByTestId('unit-option-g'))).toBe(true);
    expect(isSelected(getByTestId('category-option-Lácteos'))).toBe(true);
    expect(getByTestId('ingredient-quantity-input').props.value).toBe('1');
  });

  it('un producto con presentación variable reconoce la categoría pero deja la unidad manual', async () => {
    const { getByTestId, getByText } = await renderForm();
    await fireEvent.changeText(getByTestId('ingredient-name-input'), 'Yogur');

    expect(isSelected(getByTestId('category-option-Lácteos'))).toBe(true);
    expect(isSelected(getByTestId('unit-option-unidad'))).toBe(true);
    expect(getByText(/Depende de la presentación/)).toBeTruthy();
  });
});

describe('Formulario manual · nombres desconocidos y elecciones manuales', () => {
  it('6. un nombre desconocido usa valores neutrales sin sugerencias inventadas', async () => {
    const { getByTestId, queryByTestId, onSave } = await renderForm();
    await fireEvent.changeText(getByTestId('ingredient-name-input'), 'Producto XYZ');

    expect(isSelected(getByTestId('category-option-Otros'))).toBe(true);
    expect(isSelected(getByTestId('category-option-Verduras y frutas'))).toBe(false);
    expect(isSelected(getByTestId('unit-option-unidad'))).toBe(true);
    expect(queryByTestId('category-suggestion-hint')).toBeNull();
    expect(queryByTestId('unit-suggestion-hint')).toBeNull();
    expect(queryByTestId('ingredient-semantic-warnings')).toBeNull();

    await submit(getByTestId);
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'Otros', unit: 'unidad' })
    );
  });

  it('6. un nombre desconocido conserva la elección manual previa', async () => {
    const { getByTestId, onSave } = await renderForm();
    await fireEvent.press(getByTestId('unit-option-taza'));
    await fireEvent.press(getByTestId('category-option-Alacena'));
    await fireEvent.changeText(getByTestId('ingredient-name-input'), 'Ingrediente casero');

    expect(isSelected(getByTestId('unit-option-taza'))).toBe(true);
    expect(isSelected(getByTestId('category-option-Alacena'))).toBe(true);

    await submit(getByTestId);
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ unit: 'taza', category: 'Alacena' })
    );
  });

  it('7. las elecciones manuales no cambian cuando el nombre cambia', async () => {
    const { getByTestId } = await renderForm();
    const nameInput = getByTestId('ingredient-name-input');

    await fireEvent.changeText(nameInput, 'Leche');
    await fireEvent.press(getByTestId('category-option-Alacena'));
    await fireEvent.press(getByTestId('unit-option-ml'));

    for (const next of ['Arroz', 'Huevos', 'Producto XYZ', 'Leche en polvo']) {
      await fireEvent.changeText(nameInput, next);
      expect(isSelected(getByTestId('category-option-Alacena'))).toBe(true);
      expect(isSelected(getByTestId('unit-option-ml'))).toBe(true);
    }
  });

  it('7. con una elección manual distinta se ofrece aplicar la sugerencia de forma explícita', async () => {
    const { getByTestId } = await renderForm();
    await fireEvent.press(getByTestId('category-option-Granos y cereales'));
    await fireEvent.changeText(getByTestId('ingredient-name-input'), 'Leche');

    expect(isSelected(getByTestId('category-option-Granos y cereales'))).toBe(true);
    await fireEvent.press(getByTestId('apply-category-suggestion'));
    expect(isSelected(getByTestId('category-option-Lácteos'))).toBe(true);
  });
});

describe('Formulario manual · 8. sin conversión inesperada de cantidad', () => {
  it('escribir la cantidad fija la unidad visible: cambiar el nombre después no altera su significado', async () => {
    const { getByTestId } = await renderForm();
    await fireEvent.changeText(getByTestId('ingredient-quantity-input'), '3');
    await fireEvent.changeText(getByTestId('ingredient-name-input'), 'Leche');

    // 3 unidades (bolsas) de leche: la unidad no se reinterpreta como litros
    expect(isSelected(getByTestId('unit-option-unidad'))).toBe(true);
    expect(getByTestId('ingredient-quantity-input').props.value).toBe('3');
    expect(getByTestId('apply-unit-suggestion')).toBeTruthy();
  });

  it('cambiar entre g y kg exige confirmar; la conversión solo ocurre si el usuario la elige', async () => {
    const { getByTestId, getByText, onSave } = await renderForm();
    await fireEvent.changeText(getByTestId('ingredient-name-input'), 'Arroz');
    await fireEvent.changeText(getByTestId('ingredient-quantity-input'), '1,5');
    await fireEvent.press(getByTestId('unit-option-g'));

    expect(getByTestId('unit-change-quantity-notice')).toBeTruthy();
    expect(getByTestId('ingredient-quantity-input').props.value).toBe('1,5');

    // Guardar sin resolver: bloqueado con mensaje claro
    await submit(getByTestId);
    expect(onSave).not.toHaveBeenCalled();
    expect(getByText(UNIT_CHANGE_QUANTITY_ERROR)).toBeTruthy();

    await fireEvent.press(getByTestId('convert-quantity-after-unit-change'));
    expect(getByTestId('ingredient-quantity-input').props.value).toBe('1500');

    await submit(getByTestId);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ quantity: 1500, unit: 'g' }));
  });

  it('cambiar de volumen a masa no ofrece conversión y conserva la cantidad tal cual', async () => {
    const { getByTestId, queryByTestId, onSave } = await renderForm();
    await fireEvent.changeText(getByTestId('ingredient-name-input'), 'Leche');
    await fireEvent.changeText(getByTestId('ingredient-quantity-input'), '2');
    await fireEvent.press(getByTestId('unit-option-kg'));

    expect(getByTestId('unit-change-quantity-notice')).toBeTruthy();
    expect(queryByTestId('convert-quantity-after-unit-change')).toBeNull();

    await fireEvent.press(getByTestId('keep-quantity-after-unit-change'));
    expect(queryByTestId('unit-change-quantity-notice')).toBeNull();
    expect(getByTestId('ingredient-quantity-input').props.value).toBe('2');

    // Leche en kg sigue siendo sospechoso: primero aviso, luego confirmación
    await submit(getByTestId);
    expect(onSave).not.toHaveBeenCalled();
    await submit(getByTestId);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ quantity: 2, unit: 'kg' }));
  });

  it('reescribir la cantidad también resuelve el cambio pendiente', async () => {
    const { getByTestId, queryByTestId, onSave } = await renderForm();
    await fireEvent.changeText(getByTestId('ingredient-name-input'), 'Arroz');
    await fireEvent.changeText(getByTestId('ingredient-quantity-input'), '2');
    await fireEvent.press(getByTestId('unit-option-g'));
    await fireEvent.changeText(getByTestId('ingredient-quantity-input'), '750');

    expect(queryByTestId('unit-change-quantity-notice')).toBeNull();
    await submit(getByTestId);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ quantity: 750, unit: 'g' }));
  });

  it('volver a la unidad original cancela el aviso pendiente', async () => {
    const { getByTestId, queryByTestId } = await renderForm();
    await fireEvent.changeText(getByTestId('ingredient-name-input'), 'Arroz');
    await fireEvent.changeText(getByTestId('ingredient-quantity-input'), '2');
    await fireEvent.press(getByTestId('unit-option-g'));
    await fireEvent.press(getByTestId('unit-option-kg'));
    expect(queryByTestId('unit-change-quantity-notice')).toBeNull();
  });
});

describe('Formulario manual · 9. combinaciones sospechosas', () => {
  it.each([
    ['Arroz', 'category-option-Lácteos', 'semantic-warning-category_mismatch'],
    ['Leche', 'category-option-Granos y cereales', 'semantic-warning-category_mismatch'],
    ['Huevos', 'unit-option-l', 'semantic-warning-countable_measured_by_volume'],
    ['Leche', 'unit-option-kg', 'semantic-warning-liquid_measured_by_mass'],
  ])('«%s» + %s muestra aviso y exige confirmación', async (name, controlId, warningId) => {
    const { getByTestId, getByText, onSave } = await renderForm();
    await fireEvent.changeText(getByTestId('ingredient-name-input'), name);
    await fireEvent.press(getByTestId(controlId));

    expect(getByTestId('ingredient-semantic-warnings')).toBeTruthy();
    expect(getByTestId(warningId)).toBeTruthy();

    await submit(getByTestId);
    expect(onSave).not.toHaveBeenCalled();
    expect(getByText('Guardar de todos modos')).toBeTruthy();

    await submit(getByTestId);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('cambiar la combinación tras el aviso exige confirmar de nuevo', async () => {
    const { getByTestId, onSave } = await renderForm();
    await fireEvent.changeText(getByTestId('ingredient-name-input'), 'Arroz');
    await fireEvent.press(getByTestId('category-option-Lácteos'));
    await submit(getByTestId);
    expect(onSave).not.toHaveBeenCalled();

    await fireEvent.press(getByTestId('unit-option-l'));
    await submit(getByTestId);
    expect(onSave).not.toHaveBeenCalled();

    await submit(getByTestId);
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'Lácteos', unit: 'l' })
    );
  });

  it('corregir la combinación elimina el aviso y guarda con una sola pulsación', async () => {
    const { getByTestId, queryByTestId, onSave } = await renderForm();
    await fireEvent.changeText(getByTestId('ingredient-name-input'), 'Arroz');
    await fireEvent.press(getByTestId('category-option-Lácteos'));
    await fireEvent.press(getByTestId('apply-category-suggestion'));

    expect(queryByTestId('ingredient-semantic-warnings')).toBeNull();
    await submit(getByTestId);
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'Granos y cereales' })
    );
  });
});

describe('Formulario manual · 10. edición sin modificaciones silenciosas', () => {
  const legacyLeche: Ingredient = {
    id: 'legacy-1',
    name: 'Leche',
    quantity: 2,
    unit: 'unidad',
    category: 'Verduras y frutas', // antiguo valor por defecto
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('abre con los valores guardados y los guarda sin cambios ni avisos', async () => {
    const { getByTestId, queryByTestId, onSave } = await renderForm(legacyLeche);

    expect(isSelected(getByTestId('unit-option-unidad'))).toBe(true);
    expect(isSelected(getByTestId('category-option-Verduras y frutas'))).toBe(true);
    expect(queryByTestId('ingredient-semantic-warnings')).toBeNull();

    await submit(getByTestId);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      name: 'Leche',
      quantity: 2,
      unit: 'unidad',
      category: 'Verduras y frutas',
      expirationDate: null,
    });
  });

  it('renombrar no reemplaza la unidad ni la categoría guardadas', async () => {
    const { getByTestId } = await renderForm(legacyLeche);
    await fireEvent.changeText(getByTestId('ingredient-name-input'), 'Leche en polvo');

    expect(isSelected(getByTestId('unit-option-unidad'))).toBe(true);
    expect(isSelected(getByTestId('category-option-Verduras y frutas'))).toBe(true);
    // La sugerencia se ofrece, pero solo se aplica si el usuario la elige
    expect(getByTestId('apply-category-suggestion')).toBeTruthy();
    expect(getByTestId('apply-unit-suggestion')).toBeTruthy();
  });

  it('cambiar la unidad de un registro guardado exige confirmar la cantidad', async () => {
    const { getByTestId, onSave } = await renderForm(legacyLeche);
    await fireEvent.press(getByTestId('unit-option-l'));

    expect(getByTestId('unit-change-quantity-notice')).toBeTruthy();
    expect(getByTestId('ingredient-quantity-input').props.value).toBe('2');
    await submit(getByTestId);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('Formulario manual · 15. accesibilidad y pantallas pequeñas', () => {
  it('anuncia las opciones recomendadas sin cambiar las etiquetas existentes', async () => {
    const { getByTestId, getByLabelText } = await renderForm();
    await fireEvent.changeText(getByTestId('ingredient-name-input'), 'Leche');

    const litros = getByLabelText('Unidad: Litros (l)');
    expect(litros.props.accessibilityHint).toBe('Recomendada para este alimento');
    expect(getByLabelText('Unidad: Kilogramos (kg)').props.accessibilityHint).toBeUndefined();
    expect(getByLabelText('Categoría: Lácteos').props.accessibilityHint).toBe(
      'Recomendada para este alimento'
    );
  });

  it('los avisos se anuncian como alertas y sus acciones tienen área táctil de 44 dp', async () => {
    const { getByTestId, getByLabelText } = await renderForm();
    await fireEvent.changeText(getByTestId('ingredient-name-input'), 'Leche');
    await fireEvent.changeText(getByTestId('ingredient-quantity-input'), '2');
    await fireEvent.press(getByTestId('unit-option-kg'));

    expect(getByTestId('ingredient-semantic-warnings').props.accessibilityRole).toBe('alert');
    expect(getByTestId('unit-change-quantity-notice').props.accessibilityRole).toBe('alert');
    expect(flat(getByTestId('keep-quantity-after-unit-change').props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(getByLabelText('Mantener 2 Kilogramos (kg)')).toBeTruthy();
  });

  it('a 320 dp las sugerencias envuelven en lugar de recortarse', async () => {
    const original = Dimensions.get('window');
    const narrow = { ...original, width: 320, height: 640, fontScale: 1.3 };
    Dimensions.set({ window: narrow, screen: narrow });
    try {
      const { getByTestId } = await renderForm();
      await fireEvent.changeText(getByTestId('ingredient-name-input'), 'Arroz');
      await fireEvent.press(getByTestId('category-option-Lácteos'));

      for (const id of ['unit-suggestion-hint', 'category-suggestion-hint']) {
        const style = flat(getByTestId(id).props.style);
        expect(style.flexWrap).toBe('wrap');
        expect(style.width).toBeUndefined();
        expect(style.height).toBeUndefined();
      }
      expect(flat(getByTestId('ingredient-semantic-warnings').props.style).height).toBeUndefined();
      // El pie sigue apilándose en pantallas angostas
      expect(flat(getByTestId('ingredient-form-footer').props.style).flexDirection).toBe(
        'column-reverse'
      );
    } finally {
      Dimensions.set({ window: original, screen: original });
    }
  });
});

// ---------------------------------------------------------------------------
// Escáner
// ---------------------------------------------------------------------------

const baseScanned: ScannedIngredientItem = {
  id: 'scan-1',
  name: 'Leche',
  quantity: 1,
  unit: 'kg',
  category: 'Lácteos',
  needsReview: false,
  isSelected: true,
  action: 'create',
};

async function renderCard(overrides: Partial<ScannedIngredientItem> = {}) {
  const handlers = {
    onToggleSelect: jest.fn(),
    onChangeName: jest.fn(),
    onChangeQuantity: jest.fn(),
    onChangeUnit: jest.fn(),
    onChangeCategory: jest.fn(),
    onChangeAction: jest.fn(),
    onRemove: jest.fn(),
    onConfirmWarnings: jest.fn(),
  };
  const props: DetectedIngredientCardProps = { item: { ...baseScanned, ...overrides }, ...handlers };
  const utils = await render(wrap(<DetectedIngredientCard {...props} />));
  return { ...utils, handlers };
}

describe('Escáner · tarjeta de revisión', () => {
  it('marca la combinación inusual sin alterar la cantidad ni la unidad detectadas', async () => {
    const { getByTestId, handlers } = await renderCard();

    expect(getByTestId('detected-semantic-warning-scan-1')).toBeTruthy();
    expect(getByTestId('detected-quantity-input-scan-1').props.value).toBe('1');
    expect(isSelected(getByTestId('detected-unit-scan-1-kg'))).toBe(true);
    expect(handlers.onChangeUnit).not.toHaveBeenCalled();
    expect(handlers.onChangeQuantity).not.toHaveBeenCalled();

    const confirm = getByTestId('detected-semantic-confirm-scan-1');
    expect(flat(confirm.props.style).minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    await fireEvent.press(confirm);
    expect(handlers.onConfirmWarnings).toHaveBeenCalledWith('scan-1');
  });

  it('no muestra avisos para medidas válidas', async () => {
    const { queryByTestId } = await renderCard({ name: 'Huevos', unit: 'unidad', quantity: 12, category: 'Carnes y proteínas' });
    expect(queryByTestId('detected-semantic-warning-scan-1')).toBeNull();
  });

  it('sugiere unidades (sin aplicarlas) cuando la IA no reconoció la unidad', async () => {
    const { getByTestId, handlers } = await renderCard({
      name: 'Arroz',
      unit: 'desconocida',
      quantity: null,
      category: 'Granos y cereales',
    });
    expect(getByTestId('detected-unit-suggestion-scan-1').props.children).toEqual([
      'Unidades sugeridas:',
      ' ',
      'kg, g',
    ]);
    expect(isSelected(getByTestId('detected-unit-scan-1-desconocida'))).toBe(true);
    expect(handlers.onChangeUnit).not.toHaveBeenCalled();
  });

  it('permite desplegar el selector de categorías y corregir la categoría manualmente', async () => {
    const { getByTestId, handlers } = await renderCard({
      category: 'Lácteos',
    });

    const toggle = getByTestId('detected-category-toggle-scan-1');
    expect(flat(toggle.props.style).minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    await fireEvent.press(toggle);

    expect(getByTestId('detected-category-picker-scan-1')).toBeTruthy();
    const alacenaChip = getByTestId('detected-category-scan-1-Alacena');
    expect(flat(alacenaChip.props.style).minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    await fireEvent.press(alacenaChip);

    expect(handlers.onChangeCategory).toHaveBeenCalledWith('scan-1', 'Alacena');
  });

  it('ofrece corregir la categoría directamente desde el aviso semántico cuando hay sugerencia', async () => {
    const { getByTestId, handlers } = await renderCard({
      name: 'Pollo',
      category: 'Granos y cereales',
      quantity: 2,
      unit: 'kg',
    });

    expect(getByTestId('detected-semantic-warning-scan-1')).toBeTruthy();
    const applyBtn = getByTestId('detected-apply-category-scan-1');
    expect(flat(applyBtn.props.style).minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    await fireEvent.press(applyBtn);

    expect(handlers.onChangeCategory).toHaveBeenCalledWith('scan-1', 'Carnes y proteínas');
  });

  it('cambiar el nombre del ingrediente conserva cantidades y no sobrescribe elecciones manuales', async () => {
    const { getByTestId, handlers } = await renderCard({
      name: 'Arroz',
      quantity: 1.5,
      unit: 'kg',
      category: 'Granos y cereales',
    });

    const nameInput = getByTestId('detected-name-input-scan-1');
    await fireEvent.changeText(nameInput, 'Pollo');

    expect(handlers.onChangeName).toHaveBeenCalledWith('scan-1', 'Pollo');
    expect(getByTestId('detected-quantity-input-scan-1').props.value).toBe('1.5');
    expect(handlers.onChangeQuantity).not.toHaveBeenCalled();
    expect(handlers.onChangeUnit).not.toHaveBeenCalled();
  });
});

class MemoryPantryAdapter implements PantryStorageAdapter {
  items: Ingredient[];
  constructor(initial: Ingredient[] = []) {
    this.items = [...initial];
  }
  async getIngredients() {
    return [...this.items];
  }
  async saveIngredients(ingredients: Ingredient[]) {
    this.items = [...ingredients];
  }
  async addIngredient(input: CreateIngredientInput) {
    const created: Ingredient = {
      id: `mem-${this.items.length + 1}`,
      ...input,
      createdAt: '2026-11-09T00:00:00.000Z',
      updatedAt: '2026-11-09T00:00:00.000Z',
    };
    this.items.unshift(created);
    return created;
  }
  async updateIngredient(input: UpdateIngredientInput) {
    const idx = this.items.findIndex((i) => i.id === input.id);
    const updated = { ...this.items[idx], ...input } as Ingredient;
    this.items[idx] = updated;
    return updated;
  }
  async deleteIngredient(id: string) {
    this.items = this.items.filter((i) => i.id !== id);
  }
  async clearIngredients() {
    this.items = [];
  }
}

describe('Escáner · flujo completo con la misma validación', () => {
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

  const renderScanner = async (adapter: MemoryPantryAdapter) => {
    const screen = await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <TypographyProvider usingFallback={true}>
          <PantryProvider storageAdapter={adapter} initialIngredients={adapter.items}>
            <ScannerScreen />
          </PantryProvider>
        </TypographyProvider>
      </SafeAreaProvider>
    );
    await fireEvent.press(screen.getByTestId('scanner-gallery-button'));
    await waitFor(() => expect(screen.getByTestId('scanner-preview-state')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('scanner-analyze-button'));
    await waitFor(() => expect(screen.getByTestId('scanner-review-state')).toBeTruthy());
    return screen;
  };

  it('bloquea el guardado hasta confirmar y luego guarda exactamente lo detectado', async () => {
    (scannerApi.analyzeIngredientsImage as jest.Mock).mockResolvedValueOnce([
      { name: 'Leche', quantity: 1, unit: 'kg', needsReview: false },
      { name: 'Arroz', quantity: 500, unit: 'g', needsReview: false },
    ]);
    const adapter = new MemoryPantryAdapter();
    const screen = await renderScanner(adapter);

    expect(screen.getByTestId('scanner-semantic-warning-notice')).toBeTruthy();
    expect(screen.getByText('Revisa las unidades o categorías')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('scanner-confirm-save-button'));
    expect(adapter.items).toHaveLength(0);

    const lecheCard = screen.getAllByTestId(/^detected-semantic-confirm-/)[0];
    await fireEvent.press(lecheCard);
    expect(screen.queryByTestId('scanner-semantic-warning-notice')).toBeNull();

    await act(async () => {
      await fireEvent.press(screen.getByTestId('scanner-confirm-save-button'));
    });
    await waitFor(() => expect(screen.getByTestId('scanner-completed-state')).toBeTruthy());

    const saved = adapter.items.map((i) => [i.name, i.quantity, i.unit, i.category]);
    expect(saved).toEqual(
      expect.arrayContaining([
        ['Leche', 1, 'kg', 'Lácteos'],
        ['Arroz', 500, 'g', 'Granos y cereales'],
      ])
    );
    // Los metadatos de revisión no llegan a la despensa
    expect(adapter.items.every((i) => !('semanticReviewSignature' in i))).toBe(true);
  });

  it('corregir la unidad elimina el aviso sin confirmación adicional', async () => {
    (scannerApi.analyzeIngredientsImage as jest.Mock).mockResolvedValueOnce([
      { name: 'Huevos', quantity: 1, unit: 'l', needsReview: false },
    ]);
    const adapter = new MemoryPantryAdapter();
    const screen = await renderScanner(adapter);

    const card = screen.getAllByTestId(/^detected-card-/)[0];
    const id = card.props.testID.replace('detected-card-', '');
    expect(screen.getByTestId(`detected-semantic-warning-${id}`)).toBeTruthy();

    await fireEvent.press(screen.getByTestId(`detected-unit-${id}-unidad`));
    expect(screen.queryByTestId(`detected-semantic-warning-${id}`)).toBeNull();
    // La cantidad detectada no se reinterpreta al cambiar la unidad
    expect(screen.getByTestId(`detected-quantity-input-${id}`).props.value).toBe('1');
    expect(screen.queryByTestId('scanner-semantic-warning-notice')).toBeNull();
  });

  it('los alimentos válidos se guardan sin pasos extra ni nuevas solicitudes a la IA', async () => {
    (scannerApi.analyzeIngredientsImage as jest.Mock).mockResolvedValueOnce([
      { name: 'Huevos', quantity: 12, unit: 'unidad', needsReview: false },
    ]);
    const adapter = new MemoryPantryAdapter();
    const screen = await renderScanner(adapter);

    expect(screen.queryByTestId('scanner-semantic-warning-notice')).toBeNull();
    await act(async () => {
      await fireEvent.press(screen.getByTestId('scanner-confirm-save-button'));
    });
    await waitFor(() => expect(screen.getByTestId('scanner-completed-state')).toBeTruthy());
    expect(adapter.items[0]).toMatchObject({ name: 'Huevos', quantity: 12, unit: 'unidad' });
    expect(scannerApi.analyzeIngredientsImage).toHaveBeenCalledTimes(1);
  });

  it('el usuario puede corregir la categoría de un alimento detectado antes de guardar', async () => {
    (scannerApi.analyzeIngredientsImage as jest.Mock).mockResolvedValueOnce([
      { name: 'Leche de almendras', quantity: 1, unit: 'l', needsReview: false },
    ]);
    const adapter = new MemoryPantryAdapter();
    const screen = await renderScanner(adapter);

    // Inicialmente detectado con categoría inteligente Otros (no Lácteos)
    expect(screen.getByText('Otros')).toBeTruthy();

    // El usuario decide corregir la categoría a Alacena antes de guardar
    const card = screen.getAllByTestId(/^detected-card-/)[0];
    const id = card.props.testID.replace('detected-card-', '');

    await fireEvent.press(screen.getByTestId(`detected-category-toggle-${id}`));
    await fireEvent.press(screen.getByTestId(`detected-category-${id}-Alacena`));

    // Guardar en la despensa
    await act(async () => {
      await fireEvent.press(screen.getByTestId('scanner-confirm-save-button'));
    });
    await waitFor(() => expect(screen.getByTestId('scanner-completed-state')).toBeTruthy());

    expect(adapter.items[0]).toMatchObject({
      name: 'Leche de almendras',
      quantity: 1,
      unit: 'l',
      category: 'Alacena',
    });
  });
});
