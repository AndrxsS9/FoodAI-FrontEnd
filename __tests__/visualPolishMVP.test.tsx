/**
 * FoodAI - Pruebas del pulido visual del MVP.
 *
 * Verifica:
 * 1. Utilidades de fecha (formato corto/largo, relativo y suma de días) sin dependencias de Intl.
 * 2. Calendario mensual: navegación, selección accesible y límites de año.
 * 3. Formulario de alimento: selector de fecha con calendario, atajos y «Sin fecha de caducidad»,
 *    conservando el contrato de guardado (AAAA-MM-DD al crear, null al quitar la fecha al editar).
 * 4. Tarjeta de despensa: chip de caducidad legible y tonos de categoría en modo oscuro.
 * 5. Barra de pestañas con indicador activo.
 */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { CalendarPicker } from '../src/components/common';
import { IngredientCard, IngredientFormModal } from '../src/components/pantry';
import { getCategoryVisual } from '../src/components/pantry/categoryVisuals';
import { ThemeProvider, TypographyProvider, lightColors } from '../src/theme';
import { CATEGORY_CONFIG, Ingredient } from '../src/types/pantry';
import {
  addDaysFromToday,
  describeRelativeExpiration,
  formatLongDate,
  formatShortDate,
  parseIsoDateString,
  toIsoDateString,
} from '../src/utils/dateFormat';

jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
    Tabs: Object.assign(
      ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children),
      {
        Screen: ({ name, options }: { name: string; options: any }) =>
          React.createElement(
            View,
            { testID: `tab-${name}` },
            options.tabBarIcon({ color: '#000000', focused: name === 'despensa', size: 22 })
          ),
      }
    ),
  };
});

const withTheme = (ui: React.ReactElement, mode: 'light' | 'dark' = 'light') => (
  <ThemeProvider
    initialMode={mode}
    storageAdapter={{
      getThemeMode: async () => mode,
      saveThemeMode: async () => {},
      clearThemeMode: async () => {},
    }}
  >
    <TypographyProvider usingFallback={true}>{ui}</TypographyProvider>
  </ThemeProvider>
);

const baseIngredient: Ingredient = {
  id: 'ing-1',
  name: 'Leche entera',
  quantity: 2,
  unit: 'l',
  category: 'Lácteos',
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
};

describe('Utilidades de fecha', () => {
  it('formatea fechas cortas y largas en español', () => {
    expect(formatShortDate('2026-11-15')).toBe('15 nov 2026');
    expect(formatLongDate(new Date(2026, 0, 3))).toBe('3 de enero de 2026');
    expect(formatShortDate('2026-02-30')).toBeNull();
    expect(formatShortDate('')).toBeNull();
  });

  it('convierte entre Date y AAAA-MM-DD sin desfases de zona horaria', () => {
    const parsed = parseIsoDateString('2026-03-09');
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(2);
    expect(parsed?.getDate()).toBe(9);
    expect(toIsoDateString(parsed as Date)).toBe('2026-03-09');
    expect(parseIsoDateString('no-es-fecha')).toBeNull();
  });

  it('suma días cruzando meses y años', () => {
    expect(addDaysFromToday(3, new Date(2026, 11, 30))).toBe('2027-01-02');
    expect(addDaysFromToday(0, new Date(2026, 1, 28))).toBe('2026-02-28');
  });

  it('describe la caducidad relativa a una fecha de referencia', () => {
    const ref = new Date(2026, 10, 7, 15, 30);
    expect(describeRelativeExpiration('2026-11-07', ref)).toBe('Vence hoy');
    expect(describeRelativeExpiration('2026-11-08', ref)).toBe('Vence mañana');
    expect(describeRelativeExpiration('2026-11-17', ref)).toBe('Vence en 10 días');
    expect(describeRelativeExpiration('2026-11-06', ref)).toBe('Venció ayer');
    expect(describeRelativeExpiration('2026-11-01', ref)).toBe('Venció hace 6 días');
    expect(describeRelativeExpiration('', ref)).toBeNull();
  });
});

describe('CalendarPicker', () => {
  it('muestra el mes de la fecha seleccionada y la marca como seleccionada', async () => {
    const onSelect = jest.fn();
    const { getByTestId } = await render(
      withTheme(<CalendarPicker testID="cal" value="2026-11-15" onSelect={onSelect} />)
    );

    expect(getByTestId('cal-month-label').props.children).toBe('Noviembre 2026');
    expect(getByTestId('cal-day-2026-11-15').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true })
    );
    expect(getByTestId('cal-day-2026-11-16').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false })
    );
    expect(getByTestId('cal-day-2026-11-15').props.accessibilityLabel).toBe(
      '15 de noviembre de 2026'
    );
  });

  it('navega entre meses y devuelve la fecha elegida en AAAA-MM-DD', async () => {
    const onSelect = jest.fn();
    const { getByTestId } = await render(
      withTheme(<CalendarPicker testID="cal" value="2026-12-20" onSelect={onSelect} />)
    );

    await fireEvent.press(getByTestId('cal-next-month'));
    expect(getByTestId('cal-month-label').props.children).toBe('Enero 2027');

    await fireEvent.press(getByTestId('cal-day-2027-01-05'));
    expect(onSelect).toHaveBeenCalledWith('2027-01-05');

    await fireEvent.press(getByTestId('cal-prev-month'));
    await fireEvent.press(getByTestId('cal-prev-month'));
    expect(getByTestId('cal-month-label').props.children).toBe('Noviembre 2026');
  });

  it('no permite navegar fuera del rango de años válido', async () => {
    const { getByTestId } = await render(
      withTheme(<CalendarPicker testID="cal" value="2000-01-10" onSelect={jest.fn()} />)
    );
    expect(getByTestId('cal-prev-month').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true })
    );
  });
});

describe('IngredientFormModal: selector de fecha de caducidad', () => {
  const renderForm = async (initialIngredient: Ingredient | null = null) => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();
    const utils = await render(
      withTheme(
        <IngredientFormModal
          visible
          initialIngredient={initialIngredient}
          onClose={onClose}
          onSave={onSave}
        />
      )
    );
    return { ...utils, onSave, onClose };
  };

  it('muestra «Sin fecha de caducidad» por defecto con el atajo correspondiente activo', async () => {
    const { getByTestId } = await renderForm();

    expect(getByTestId('ingredient-expiration-value').props.children).toBe(
      'Sin fecha de caducidad'
    );
    expect(getByTestId('quick-exp-none').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true })
    );
  });

  it('aplica un atajo rápido y lo refleja como fecha legible', async () => {
    const { getByTestId } = await renderForm();

    await fireEvent.press(getByTestId('quick-exp-7d'));

    const expected = addDaysFromToday(7);
    expect(getByTestId('ingredient-expiration-value').props.children).toBe(
      formatShortDate(expected)
    );
    expect(getByTestId('quick-exp-7d').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true })
    );
    expect(getByTestId('quick-exp-none').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false })
    );
  });

  it('elige la fecha desde el calendario y la guarda en formato AAAA-MM-DD', async () => {
    const { getByTestId, queryByTestId, onSave } = await renderForm();

    await fireEvent.changeText(getByTestId('ingredient-name-input'), 'Yogur griego');
    expect(queryByTestId('ingredient-expiration-calendar')).toBeNull();

    await fireEvent.press(getByTestId('ingredient-expiration-trigger'));
    expect(getByTestId('ingredient-expiration-calendar')).toBeTruthy();

    const target = addDaysFromToday(1);
    const [y, m] = target.split('-').map(Number);
    const today = new Date();
    if (y !== today.getFullYear() || m - 1 !== today.getMonth()) {
      await fireEvent.press(getByTestId('ingredient-expiration-calendar-next-month'));
    }
    await fireEvent.press(getByTestId(`ingredient-expiration-calendar-day-${target}`));

    // El calendario se cierra tras elegir y el resumen muestra la fecha
    expect(queryByTestId('ingredient-expiration-calendar')).toBeNull();
    expect(getByTestId('ingredient-expiration-value').props.children).toBe(
      formatShortDate(target)
    );

    await act(async () => {
      await fireEvent.press(getByTestId('submit-ingredient-form'));
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Yogur griego', expirationDate: target })
    );
  });

  it('al editar, «Sin fecha» elimina la fecha guardada enviando null', async () => {
    const { getByTestId, onSave } = await renderForm({
      ...baseIngredient,
      expirationDate: '2099-12-31',
    });

    expect(getByTestId('ingredient-expiration-value').props.children).toBe('31 dic 2099');

    await fireEvent.press(getByTestId('quick-exp-none'));
    expect(getByTestId('ingredient-expiration-value').props.children).toBe(
      'Sin fecha de caducidad'
    );

    await act(async () => {
      await fireEvent.press(getByTestId('submit-ingredient-form'));
    });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ expirationDate: null }));
    });
  });

  it('crear sin fecha conserva expirationDate indefinido', async () => {
    const { getByTestId, onSave } = await renderForm();

    await fireEvent.changeText(getByTestId('ingredient-name-input'), 'Sal marina');
    await act(async () => {
      await fireEvent.press(getByTestId('submit-ingredient-form'));
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Sal marina', expirationDate: undefined })
    );
  });

  it('mantiene la selección accesible de unidad y categoría', async () => {
    const { getByTestId, getByLabelText } = await renderForm();

    await fireEvent.press(getByTestId('unit-option-kg'));
    await fireEvent.press(getByTestId('category-option-Lácteos'));

    expect(getByLabelText('Unidad: Kilogramos (kg)').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true })
    );
    expect(getByTestId('category-option-Lácteos').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true })
    );
  });
});

describe('IngredientCard: estado de caducidad y tonos de categoría', () => {
  it('muestra «Sin fecha de caducidad» cuando el alimento no tiene fecha', async () => {
    const { getByTestId, getByText } = await render(
      withTheme(<IngredientCard ingredient={baseIngredient} onAdjustQuantity={jest.fn()} />)
    );
    expect(getByTestId('expiration-chip-ing-1')).toBeTruthy();
    expect(getByText('Sin fecha de caducidad')).toBeTruthy();
    expect(getByTestId('quantity-display-ing-1').props.children).toBe('2 l');
  });

  it('muestra la fecha legible cuando la caducidad es lejana', async () => {
    const { getByText } = await render(
      withTheme(<IngredientCard ingredient={{ ...baseIngredient, expirationDate: '2099-12-31' }} />)
    );
    expect(getByText('Vence 31 dic 2099')).toBeTruthy();
  });

  it('muestra la etiqueta de urgencia para alimentos vencidos', async () => {
    const { getByText } = await render(
      withTheme(<IngredientCard ingredient={{ ...baseIngredient, expirationDate: '2020-01-01' }} />)
    );
    expect(getByText(/Vencido/)).toBeTruthy();
  });

  it('usa tonos oscuros dedicados en lugar de fondos pastel en modo oscuro', () => {
    const light = getCategoryVisual('Lácteos', 'light');
    const dark = getCategoryVisual('Lácteos', 'dark');
    expect(light.bgColor).toBe(CATEGORY_CONFIG['Lácteos'].bgColor);
    expect(dark.bgColor).not.toBe(CATEGORY_CONFIG['Lácteos'].bgColor);
    expect(dark.icon).toBe('cheese');
  });
});

describe('Barra de pestañas', () => {
  it('resalta solo la pestaña activa con un indicador en forma de píldora', async () => {
    const TabsLayout = require('../app/(tabs)/_layout').default;
    const { SafeAreaProvider } = require('react-native-safe-area-context');
    const { getByTestId } = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        {withTheme(<TabsLayout />)}
      </SafeAreaProvider>
    );

    const flatten = (node: any) => {
      const { StyleSheet } = require('react-native');
      return StyleSheet.flatten(node.props.style) ?? {};
    };

    const activePill = getByTestId('icon-fridge').parent;
    const inactivePill = getByTestId('icon-home-variant-outline').parent;
    expect(flatten(activePill).backgroundColor).toBe(lightColors.primaryFixed);
    expect(flatten(inactivePill).backgroundColor).toBeUndefined();
  });
});
