/**
 * FoodAI - Pruebas de regresión visual y de accesibilidad de la tarjeta de revisión del escáner.
 *
 * Verifica:
 * 1. Cantidad y unidad en secciones separadas, con etiquetas legibles (sin "CANTIDAD (ESTIMADA)" comprimido).
 * 2. Todas las unidades visibles en una cuadrícula adaptable (sin ScrollView horizontal ni recortes).
 * 3. Áreas táctiles mínimas de 44 dp y estados seleccionados visibles y anunciados.
 * 4. Sin dimensiones fijas que rompan con pantallas pequeñas o escalado de fuente.
 * 5. Colores de aviso derivados del tema (legibles en modo oscuro).
 * 6. Selección, edición de cantidad, duplicados y categorías siguen funcionando.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import {
  DetectedIngredientCard,
  DetectedIngredientCardProps,
  MIN_TOUCH_TARGET,
} from '../src/components/scanner/DetectedIngredientCard';
import { darkColors, ThemeProvider, TypographyProvider } from '../src/theme';
import { INGREDIENT_UNITS, INGREDIENT_UNIT_NAMES } from '../src/types/pantry';
import { ScannedIngredientItem } from '../src/types/scanner';

const baseItem: ScannedIngredientItem = {
  id: 'scan-1',
  name: 'Salchicha',
  quantity: 6,
  unit: 'unidad',
  category: 'Carnes y proteínas',
  needsReview: false,
  isSelected: true,
  action: 'create',
};

function buildHandlers() {
  return {
    onToggleSelect: jest.fn(),
    onChangeName: jest.fn(),
    onChangeQuantity: jest.fn(),
    onChangeUnit: jest.fn(),
    onChangeCategory: jest.fn(),
    onChangeAction: jest.fn(),
    onRemove: jest.fn(),
  };
}

const darkStorage = {
  getThemeMode: async () => 'dark' as const,
  saveThemeMode: async () => {},
  clearThemeMode: async () => {},
};

async function renderCard(
  overrides: Partial<ScannedIngredientItem> = {},
  options: { dark?: boolean } = {}
) {
  const handlers = buildHandlers();
  const props: DetectedIngredientCardProps = { item: { ...baseItem, ...overrides }, ...handlers };
  const card = (
    <TypographyProvider usingFallback={true}>
      <DetectedIngredientCard {...props} />
    </TypographyProvider>
  );
  const utils = await render(
    options.dark ? (
      <ThemeProvider initialMode="dark" storageAdapter={darkStorage}>
        {card}
      </ThemeProvider>
    ) : (
      card
    )
  );
  return { ...utils, handlers };
}

function flat(style: unknown) {
  const resolved = typeof style === 'function' ? style({ pressed: false }) : style;
  return StyleSheet.flatten(resolved) ?? {};
}

describe('DetectedIngredientCard: diseño de cantidad y unidad', () => {
  it('muestra cantidad y unidad en secciones separadas con etiquetas legibles', async () => {
    const { getByTestId, getByText, queryByText } = await renderCard();

    const quantitySection = getByTestId('detected-quantity-section-scan-1');
    const unitSection = getByTestId('detected-unit-section-scan-1');
    expect(quantitySection).not.toBe(unitSection);

    expect(getByText('Cantidad')).toBeTruthy();
    expect(getByText('Unidad')).toBeTruthy();
    expect(getByTestId('detected-quantity-hint-scan-1').props.children).toBe('Estimada');
    expect(queryByText(/CANTIDAD/)).toBeNull();
    expect(queryByText(/\(ESTIMADA\)/)).toBeNull();
  });

  it('marca la cantidad como obligatoria cuando la IA no la estimó', async () => {
    const { getByTestId } = await renderCard({ quantity: null, unit: 'desconocida', needsReview: true });

    expect(getByTestId('detected-quantity-hint-scan-1').props.children).toBe('Obligatoria');
    expect(getByTestId('detected-quantity-error-scan-1')).toBeTruthy();
  });

  it('no usa anchos ni altos fijos en el campo de cantidad (pantallas pequeñas y escalado de fuente)', async () => {
    const { getByTestId } = await renderCard();

    const sectionStyle = flat(getByTestId('detected-quantity-section-scan-1').props.style);
    expect(sectionStyle.width).toBeUndefined();

    const input = getByTestId('detected-quantity-input-scan-1');
    const containerStyle = flat(input.parent?.props.style);
    expect(containerStyle.height).toBeUndefined();
    expect(containerStyle.width).toBeUndefined();
    expect(containerStyle.minHeight).toBeGreaterThanOrEqual(48);
    expect(flat(input.props.style).flex).toBe(1);
  });

  it('muestra junto a la cantidad el nombre completo de la unidad seleccionada', async () => {
    const { getByTestId } = await renderCard({ unit: 'cucharada' });

    expect(getByTestId('detected-quantity-unit-suffix-scan-1').props.children).toBe(
      INGREDIENT_UNIT_NAMES.cucharada
    );
  });

  it('presenta todas las unidades en una cuadrícula que se ajusta, sin desplazamiento horizontal', async () => {
    const { getByTestId, container } = await renderCard();

    expect(container.queryAll((node) => node.props.horizontal === true)).toHaveLength(0);

    const wrapStyle = flat(getByTestId('detected-unit-options-scan-1').props.style);
    expect(wrapStyle.flexDirection).toBe('row');
    expect(wrapStyle.flexWrap).toBe('wrap');
    expect(wrapStyle.overflow).not.toBe('hidden');

    for (const unit of INGREDIENT_UNITS) {
      const chipStyle = flat(getByTestId(`detected-unit-scan-1-${unit}`).props.style);
      expect(chipStyle.minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
      expect(chipStyle.height).toBeUndefined();
      expect(chipStyle.width).toBeUndefined();
    }
  });

  it('anuncia y muestra visualmente la unidad seleccionada', async () => {
    const { getByTestId, getByLabelText } = await renderCard({ unit: 'kg' });

    for (const unit of INGREDIENT_UNITS) {
      const chip = getByTestId(`detected-unit-scan-1-${unit}`);
      expect(chip.props.accessibilityState).toEqual(
        expect.objectContaining({ selected: unit === 'kg' })
      );
    }

    // Estado visible no basado solo en color: ícono de verificación dentro del chip seleccionado
    const selectedChip = getByTestId('detected-unit-scan-1-kg');
    expect(selectedChip.queryAll((node) => node.props.testID === 'icon-check').length).toBeGreaterThan(0);
    expect(
      getByTestId('detected-unit-scan-1-g').queryAll((node) => node.props.testID === 'icon-check')
    ).toHaveLength(0);

    expect(getByLabelText('Unidad Kilogramos (kg)')).toBeTruthy();
    expect(getByTestId('detected-unit-options-scan-1').props.accessibilityRole).toBe('radiogroup');
  });

  it('cambia la unidad al tocar una opción', async () => {
    const { getByTestId, handlers } = await renderCard();

    await fireEvent.press(getByTestId('detected-unit-scan-1-taza'));

    expect(handlers.onChangeUnit).toHaveBeenCalledWith('scan-1', 'taza');
  });

  it('mantiene el análisis de cantidades decimales y vacías', async () => {
    const { getByTestId, handlers } = await renderCard();
    const input = getByTestId('detected-quantity-input-scan-1');

    await fireEvent.changeText(input, '1,5');
    expect(handlers.onChangeQuantity).toHaveBeenLastCalledWith('scan-1', 1.5);

    await fireEvent.changeText(input, '');
    expect(handlers.onChangeQuantity).toHaveBeenLastCalledWith('scan-1', null);
  });

  it('no desactiva el escalado de fuente ni trunca las etiquetas principales', async () => {
    const { container, getByText } = await renderCard();

    const textNodes = container.queryAll((node) => node.type === 'Text');
    expect(textNodes.length).toBeGreaterThan(0);
    for (const textNode of textNodes) {
      expect(textNode.props.allowFontScaling).not.toBe(false);
    }
    expect(getByText('Cantidad').props.numberOfLines).toBeUndefined();
    expect(getByText('Unidad').props.numberOfLines).toBeUndefined();
  });
});

describe('DetectedIngredientCard: controles, selección y duplicados', () => {
  it('ofrece áreas táctiles de al menos 44 dp en selección, eliminación y categorías', async () => {
    const { getByTestId } = await renderCard();

    for (const testID of [
      'detected-checkbox-scan-1',
      'detected-remove-scan-1',
      'detected-category-toggle-scan-1',
    ]) {
      const style = flat(getByTestId(testID).props.style);
      expect(Math.max(style.height ?? 0, style.minHeight ?? 0)).toBeGreaterThanOrEqual(
        MIN_TOUCH_TARGET
      );
    }
  });

  it('conserva la selección y exclusión del ingrediente', async () => {
    const { getByTestId, handlers } = await renderCard({ isSelected: false });

    const checkbox = getByTestId('detected-checkbox-scan-1');
    expect(checkbox.props.accessibilityState).toEqual(expect.objectContaining({ checked: false }));

    await fireEvent.press(checkbox);
    await fireEvent.press(getByTestId('detected-remove-scan-1'));

    expect(handlers.onToggleSelect).toHaveBeenCalledWith('scan-1');
    expect(handlers.onRemove).toHaveBeenCalledWith('scan-1');
  });

  it('permite cambiar la categoría con estado expandido y seleccionado accesible', async () => {
    const { getByTestId, queryByTestId, handlers } = await renderCard();

    const toggle = getByTestId('detected-category-toggle-scan-1');
    expect(toggle.props.accessibilityState).toEqual(expect.objectContaining({ expanded: false }));
    expect(queryByTestId('detected-category-picker-scan-1')).toBeNull();

    await fireEvent.press(toggle);

    expect(getByTestId('detected-category-toggle-scan-1').props.accessibilityState).toEqual(
      expect.objectContaining({ expanded: true })
    );
    expect(getByTestId('detected-category-scan-1-Carnes y proteínas').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true })
    );

    const lacteos = getByTestId('detected-category-scan-1-Lácteos');
    expect(flat(lacteos.props.style).minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    await fireEvent.press(lacteos);
    expect(handlers.onChangeCategory).toHaveBeenCalledWith('scan-1', 'Lácteos');
  });

  it('acomoda las acciones de duplicado en filas adaptables y respeta unidades incompatibles', async () => {
    const { getByTestId, handlers } = await renderCard({
      unit: 'g',
      duplicateMatch: {
        id: 'pantry-1',
        name: 'Salchicha',
        currentQuantity: 4,
        unit: 'unidad',
        category: 'Carnes y proteínas',
        matchType: 'exact',
      },
    });

    expect(getByTestId('detected-incompatible-notice-scan-1')).toBeTruthy();

    const addButton = getByTestId('detected-action-add-scan-1');
    const rowStyle = flat(addButton.parent?.props.style);
    expect(rowStyle.flexWrap).toBe('wrap');
    expect(flat(addButton.props.style).minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    expect(addButton.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));

    await fireEvent.press(addButton);
    expect(handlers.onChangeAction).not.toHaveBeenCalled();

    await fireEvent.press(getByTestId('detected-action-create-scan-1'));
    expect(handlers.onChangeAction).toHaveBeenCalledWith('scan-1', 'create');
  });
});

describe('DetectedIngredientCard: tema oscuro', () => {
  it('usa el tono de aviso del tema oscuro en revisión y posibles duplicados', async () => {
    const { findByTestId, getByText, container } = await renderCard(
      {
        category: 'Otros',
        needsReview: true,
        duplicateMatch: {
          id: 'pantry-2',
          name: 'Salchichas',
          currentQuantity: 2,
          unit: 'unidad',
          category: 'Otros',
          matchType: 'possible',
        },
      },
      { dark: true }
    );

    const badge = await findByTestId('detected-review-badge-scan-1');
    const [badgeIcon] = badge.queryAll((node) => node.props.testID === 'icon-help-outline');
    expect(badgeIcon.props.color).toBe(darkColors.demoBadgeText);

    const possibleLabel = getByText('¿En despensa?');
    expect(flat(possibleLabel.props.style).color).toBe(darkColors.demoBadgeText);
    // Ningún nodo conserva el marrón fijo anterior, de bajo contraste sobre superficies oscuras
    const legacyTone = container.queryAll(
      (node) => node.props.color === '#8A5E00' || flat(node.props.style).color === '#8A5E00'
    );
    expect(legacyTone).toHaveLength(0);
  });
});
