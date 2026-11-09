/**
 * FoodAI - Estabilización del pulido visual del MVP.
 *
 * Verifica:
 * 1. Teclado en el formulario de alimento: KeyboardAvoidingView con `padding`, inset superior
 *    seguro, pie de acciones fuera del ScrollView, desplazamiento al campo enfocado y pie
 *    apilado en pantallas angostas. La barra de pestañas se oculta con el teclado en Android.
 * 2. Calendario: años bisiestos, meses de distinta longitud, semana iniciando en lunes,
 *    límites de navegación e independencia de la zona horaria.
 * 3. Fechas vencidas editables y fechas inválidas nunca aceptadas en silencio.
 * 4. Persistencia real (AsyncStorage) de la fecha y de «Sin fecha de caducidad» tras reiniciar.
 * 5. Diseño adaptable: valores del plan y fechas de la despensa envuelven en lugar de truncarse.
 */
import React from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import DespensaScreen from '../app/(tabs)/despensa';
import { CalendarPicker } from '../src/components/common';
import { IngredientCard, IngredientFormModal } from '../src/components/pantry';
import { PantryProvider } from '../src/context/PantryContext';
import { AsyncStoragePantryAdapter } from '../src/services/storage/pantryStorage';
import { ThemeProvider, TypographyProvider } from '../src/theme';
import { Ingredient } from '../src/types/pantry';
import {
  addDaysFromToday,
  formatShortDate,
  parseIsoDateString,
  toIsoDateString,
} from '../src/utils/dateFormat';

let capturedScreenOptions: any = null;
jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
    Tabs: Object.assign(
      ({ children, screenOptions }: { children: React.ReactNode; screenOptions: any }) => {
        capturedScreenOptions = screenOptions;
        return React.createElement(View, null, children);
      },
      { Screen: () => null }
    ),
  };
});

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
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

const baseIngredient: Ingredient = {
  id: 'ing-1',
  name: 'Queso campesino',
  quantity: 1,
  unit: 'unidad',
  category: 'Lácteos',
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
};

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

afterEach(async () => {
  await cleanup();
  jest.restoreAllMocks();
});

describe('1. Formulario de alimento con teclado abierto', () => {
  it('evita el teclado con padding igual al solapamiento real y respeta el inset superior', async () => {
    const listeners: Record<string, ((e: any) => void)[]> = {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: any) => {
      (listeners[event] ??= []).push(cb);
      return { remove: jest.fn() } as any;
    }) as any);

    const { getByTestId } = await renderForm();
    const avoider = getByTestId('ingredient-form-keyboard-avoider');

    // inset superior (47) + espacio de respiro (24): la hoja nunca queda bajo la muesca
    expect(flat(avoider.props.style).paddingTop).toBe(47 + 24);
    // behavior="padding": KeyboardAvoidingView compone paddingBottom (0 sin teclado)
    expect(flat(avoider.props.style).paddingBottom).toBe(0);

    // Vista de 760 dp (pantalla menos barra de pestañas); teclado cuyo borde superior está en y=500
    await act(async () => {
      await avoider.props.onLayout({
        persist: () => {},
        nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 760 } },
      });
    });
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    await act(async () => {
      for (const cb of listeners[showEvent] ?? []) await cb({ endCoordinates: { screenY: 500, height: 344, screenX: 0, width: 390 } });
    });
    expect(flat(getByTestId('ingredient-form-keyboard-avoider').props.style).paddingBottom).toBe(260);
  });

  it('mantiene Guardar y Cancelar fuera del área desplazable para que sigan visibles', async () => {
    const { getByTestId } = await renderForm();

    const scroll = getByTestId('ingredient-form-scroll');
    const footer = getByTestId('ingredient-form-footer');
    const isInside = (node: any, ancestor: any): boolean =>
      node ? node === ancestor || isInside(node.parent, ancestor) : false;

    expect(isInside(getByTestId('submit-ingredient-form'), footer)).toBe(true);
    expect(isInside(getByTestId('cancel-ingredient-form'), footer)).toBe(true);
    expect(isInside(footer, scroll)).toBe(false);

    // La hoja se encoge (sin altura porcentual fija) y el ScrollView absorbe la reducción
    const sheet = footer.parent;
    expect(flat(sheet?.props.style).flexShrink).toBe(1);
    expect(flat(sheet?.props.style).maxHeight).toBeUndefined();
    expect(flat(scroll.props.style).flexShrink).toBe(1);
  });

  it('desplaza el ScrollView al campo enfocado cuando aparece el teclado', async () => {
    const listeners: Record<string, (() => void)[]> = {};
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: () => void) => {
      (listeners[event] ??= []).push(cb);
      return { remove: jest.fn() } as any;
    }) as any);
    const scrollTo = ScrollView.prototype.scrollTo as jest.Mock;
    scrollTo.mockClear();

    const { getByTestId } = await renderForm();
    const quantityInput = getByTestId('ingredient-quantity-input');

    // Simular el layout del bloque de cantidad dentro del contenido desplazable
    let section: any = quantityInput.parent;
    while (section && !section.props.onLayout) section = section.parent;
    await act(async () => {
      section.props.onLayout({ nativeEvent: { layout: { x: 0, y: 132, width: 300, height: 120 } } });
    });

    await fireEvent(quantityInput, 'focus');
    expect(listeners.keyboardDidShow?.length).toBeGreaterThan(0);
    await act(async () => {
      listeners.keyboardDidShow.forEach((cb) => cb());
    });

    expect(scrollTo).toHaveBeenCalledWith({ y: 132 - 8, animated: true });
  });

  // El mock de Jest usa 750×1334 con fontScale 2; cada caso fija su propia ventana
  const withWindow = async (
    width: number,
    fontScale: number,
    run: () => Promise<void>
  ) => {
    const original = Dimensions.get('window');
    const next = { ...original, width, height: 780, fontScale };
    Dimensions.set({ window: next, screen: next });
    try {
      await run();
    } finally {
      await cleanup();
      Dimensions.set({ window: original, screen: original });
    }
  };

  it.each([
    [320, 1, 'column-reverse'],
    [359, 1, 'column-reverse'],
    [360, 1, 'row'],
    [390, 1, 'row'],
    [390, 1.3, 'column-reverse'],
  ])('a %i dp con fontScale %s el pie usa %s', async (width, fontScale, direction) => {
    await withWindow(width, fontScale, async () => {
      const { getByTestId } = await renderForm({ ...baseIngredient });
      expect(flat(getByTestId('ingredient-form-footer').props.style).flexDirection).toBe(direction);
      const submitWidth = flat(getByTestId('submit-ingredient-form').props.style).width;
      expect(submitWidth).toBe(direction === 'row' ? undefined : '100%');
    });
  });

  it('oculta la barra de pestañas con el teclado solo en Android', async () => {
    const TabsLayout = require('../app/(tabs)/_layout').default;

    await render(wrap(<TabsLayout />));
    expect(capturedScreenOptions.tabBarHideOnKeyboard).toBe(false);
    await cleanup();

    jest.replaceProperty(Platform, 'OS', 'android');
    await render(wrap(<TabsLayout />));
    expect(capturedScreenOptions.tabBarHideOnKeyboard).toBe(true);
  });
});

describe('2. Calendario: exactitud de fechas', () => {
  const renderCalendar = (value: string) =>
    render(wrap(<CalendarPicker testID="cal" value={value} onSelect={jest.fn()} />));

  it.each([
    ['2028-02-10', '2028-02-29', true],
    ['2026-02-10', '2026-02-29', false],
    ['2000-02-10', '2000-02-29', true],
    ['2100-02-10', '2100-02-29', false],
  ])('febrero de %s: el día %s existe = %s (bisiestos)', async (value, day, exists) => {
    const { queryByTestId } = await renderCalendar(value);
    expect(Boolean(queryByTestId(`cal-day-${day}`))).toBe(exists);
  });

  it('respeta la cantidad de días de cada mes', async () => {
    const { queryByTestId, getByTestId } = await renderCalendar('2026-04-10');
    expect(queryByTestId('cal-day-2026-04-30')).toBeTruthy();
    expect(queryByTestId('cal-day-2026-04-31')).toBeNull();

    await fireEvent.press(getByTestId('cal-prev-month'));
    expect(queryByTestId('cal-day-2026-03-31')).toBeTruthy();
  });

  it('inicia la semana en lunes', async () => {
    // 1 de noviembre de 2026 es domingo -> séptima columna; 1 de junio de 2026 es lunes -> primera
    const nov = await renderCalendar('2026-11-15');
    const novFirst = nov.getByTestId('cal-day-2026-11-01');
    expect(novFirst.parent?.children.indexOf(novFirst)).toBe(6);
    await cleanup();

    const jun = await renderCalendar('2026-06-15');
    const junFirst = jun.getByTestId('cal-day-2026-06-01');
    expect(junFirst.parent?.children.indexOf(junFirst)).toBe(0);
  });

  it('navega doce meses hasta el mismo mes del año siguiente y respeta el límite 2100', async () => {
    const { getByTestId } = await renderCalendar('2026-05-10');
    for (let i = 0; i < 12; i += 1) {
      await fireEvent.press(getByTestId('cal-next-month'));
    }
    expect(getByTestId('cal-month-label').props.children).toBe('Mayo 2027');
    await cleanup();

    const last = await renderCalendar('2100-12-01');
    expect(last.getByTestId('cal-next-month').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true })
    );
  });

  it.each(['America/Bogota', 'Pacific/Kiritimati', 'America/Sao_Paulo', 'UTC'])(
    'no desplaza fechas por zona horaria (%s)',
    (tz) => {
      const previous = process.env.TZ;
      process.env.TZ = tz;
      try {
        expect(toIsoDateString(new Date(2026, 10, 1))).toBe('2026-11-01');
        const parsed = parseIsoDateString('2026-11-01');
        expect(parsed?.getDate()).toBe(1);
        expect(parsed?.getMonth()).toBe(10);
        expect(addDaysFromToday(1, new Date(2026, 9, 31, 23, 59))).toBe('2026-11-01');
      } finally {
        process.env.TZ = previous;
      }
    }
  );
});

describe('3. Fechas vencidas e inválidas en el formulario', () => {
  it('permite editar un alimento ya vencido eligiendo otra fecha pasada', async () => {
    const { getByTestId, onSave } = await renderForm({
      ...baseIngredient,
      expirationDate: '2020-01-01',
    });

    expect(getByTestId('ingredient-expiration-value').props.children).toBe('1 ene 2020');

    await fireEvent.press(getByTestId('ingredient-expiration-trigger'));
    expect(getByTestId('ingredient-expiration-calendar-month-label').props.children).toBe(
      'Enero 2020'
    );
    await fireEvent.press(getByTestId('ingredient-expiration-calendar-day-2020-01-05'));

    await act(async () => {
      await fireEvent.press(getByTestId('submit-ingredient-form'));
    });
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ expirationDate: '2020-01-05' }));
  });

  it('nunca acepta en silencio una fecha inválida heredada', async () => {
    const { getByTestId, getByText, onSave } = await renderForm({
      ...baseIngredient,
      expirationDate: '2026-02-30',
    });

    expect(getByText('Fecha no válida, elige otra en el calendario')).toBeTruthy();

    await act(async () => {
      await fireEvent.press(getByTestId('submit-ingredient-form'));
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(getByText('La fecha de vencimiento debe tener formato AAAA-MM-DD válido.')).toBeTruthy();
  });
});

describe('4. Persistencia real de la caducidad tras reiniciar la app', () => {
  const STORAGE_KEY = '@foodai:test_visual_polish_restart';

  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  const mountApp = async () =>
    render(
      wrap(
        <PantryProvider storageAdapter={new AsyncStoragePantryAdapter(STORAGE_KEY)}>
          <DespensaScreen />
        </PantryProvider>
      )
    );

  it('conserva la fecha elegida y luego «Sin fecha de caducidad» entre reinicios', async () => {
    // Sesión 1: crear un alimento con atajo de 15 días
    let app = await mountApp();
    await waitFor(() => expect(app.getByTestId('pantry-empty-state')).toBeTruthy());
    await fireEvent.press(app.getByTestId('pantry-add-ingredient-button'));
    await fireEvent.changeText(app.getByTestId('ingredient-name-input'), 'Arepas');
    await fireEvent.press(app.getByTestId('quick-exp-15d'));
    await act(async () => {
      await fireEvent.press(app.getByTestId('submit-ingredient-form'));
    });
    const expected = addDaysFromToday(15);
    await waitFor(() => expect(app.getByText(`Vence ${formatShortDate(expected)}`)).toBeTruthy());
    await cleanup();

    // Sesión 2: la fecha sobrevive; se quita con «Sin fecha»
    app = await mountApp();
    await waitFor(() => expect(app.getByText(`Vence ${formatShortDate(expected)}`)).toBeTruthy());
    const editButton = app.getAllByTestId(/^edit-ingredient-/)[0];
    await fireEvent.press(editButton);
    await fireEvent.press(app.getByTestId('quick-exp-none'));
    await act(async () => {
      await fireEvent.press(app.getByTestId('submit-ingredient-form'));
    });
    await waitFor(() => expect(app.getByText('Sin fecha de caducidad')).toBeTruthy());
    await cleanup();

    // Sesión 3: sigue sin fecha y el registro persistido no tiene metadatos de caducidad
    app = await mountApp();
    await waitFor(() => expect(app.getByText('Sin fecha de caducidad')).toBeTruthy());
    const stored = await new AsyncStoragePantryAdapter(STORAGE_KEY).getIngredients();
    expect(stored).toHaveLength(1);
    expect(stored[0].expirationDate).toBeUndefined();
  });
});

describe('5. Diseño adaptable sin truncar información', () => {
  it('la fila inferior de la tarjeta envuelve en lugar de recortar la fecha', async () => {
    const { getByTestId, getByText } = await render(
      wrap(
        <IngredientCard
          ingredient={{ ...baseIngredient, expirationDate: '2099-12-31' }}
          onAdjustQuantity={jest.fn()}
        />
      )
    );
    const footer = getByTestId('expiration-chip-ing-1').parent;
    expect(flat(footer?.props.style).flexWrap).toBe('wrap');
    expect(getByText('Vence 31 dic 2099').props.numberOfLines).not.toBe(1);
    expect(getByText('Queso campesino').props.numberOfLines).not.toBe(1);
  });

  it('los textos de categoría del formulario no se limitan a una cantidad de líneas', async () => {
    const { getByText } = await renderForm();
    expect(getByText('Carnes y proteínas').props.numberOfLines).toBeUndefined();
  });
});
