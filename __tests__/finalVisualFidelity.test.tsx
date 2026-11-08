/**
 * FoodAI - Regresión de la corrección final de fidelidad visual del MVP.
 *
 * Cubre las tres áreas autorizadas sin depender de píxeles:
 * 1. Revisión del escáner: encabezado, conteo dinámico, tarjetas, nombres largos, pie fijo y teclado.
 * 2. Plan de 3 días: indicadores 2×2, estados vacío/inicial/generado y emojis solo de presentación.
 * 3. Barra de pestañas flotante: píldora activa, insets, anchos pequeños y escalado de fuente.
 */
import React from 'react';
import { Dimensions, Keyboard, StyleSheet } from 'react-native';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import ScannerScreen from '../app/escaner/index';
import PlanScreen, { getRecipeTitleEmoji } from '../app/(tabs)/plan';
import TabsLayout from '../app/(tabs)/_layout';
import {
  DetectedIngredientCard,
  MIN_TOUCH_TARGET,
} from '../src/components/scanner/DetectedIngredientCard';
import { BudgetProvider } from '../src/context/BudgetContext';
import { MealPlanProvider } from '../src/context/MealPlanContext';
import { PantryProvider } from '../src/context/PantryContext';
import { RecipeProvider } from '../src/context/RecipeContext';
import { scannerApi } from '../src/services/api/scannerApi';
import { darkColors, lightColors, ThemeProvider, TypographyProvider } from '../src/theme';
import { ClientMealPlan } from '../src/types/mealPlan';
import { INGREDIENT_UNITS, Ingredient } from '../src/types/pantry';
import { ScannedIngredientItem } from '../src/types/scanner';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockScreenOptions: any = null;
const mockRegisteredTabs: Record<string, any> = {};

jest.mock('expo-router', () => {
  const ReactActual = require('react');
  const { View } = require('react-native');
  return {
    useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack }),
    Tabs: Object.assign(
      ({ children, screenOptions }: { children: React.ReactNode; screenOptions: any }) => {
        mockScreenOptions = screenOptions;
        return ReactActual.createElement(View, null, children);
      },
      {
        Screen: ({ name, options }: { name: string; options: any }) => {
          mockRegisteredTabs[name] = options;
          return null;
        },
      }
    ),
  };
});

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

const flat = (style: unknown): any =>
  StyleSheet.flatten(typeof style === 'function' ? style({ pressed: false }) : style) ?? {};

const metrics = (bottom = 0) => ({
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom },
});

const themeStorage = (mode: 'light' | 'dark') => ({
  getThemeMode: async () => mode,
  saveThemeMode: async () => {},
  clearThemeMode: async () => {},
});

/** Ejecuta `run` con un tamaño de ventana y escala de fuente concretos. */
const withWindow = async (
  size: { width: number; height?: number; fontScale?: number },
  run: () => Promise<void>
) => {
  const original = Dimensions.get('window');
  const next = { ...original, height: 800, fontScale: 1, ...size };
  await act(async () => {
    Dimensions.set({ window: next, screen: next });
  });
  try {
    await run();
  } finally {
    await act(async () => {
      Dimensions.set({ window: original, screen: original });
    });
  }
};

afterEach(async () => {
  await cleanup();
  jest.clearAllMocks();
});

/** Los elementos decorativos están ocultos a la accesibilidad; las consultas deben incluirlos a propósito. */
const HIDDEN = { includeHiddenElements: true };

// ---------------------------------------------------------------------------------------------
// 1. Escáner
// ---------------------------------------------------------------------------------------------
describe('Revisión del escáner', () => {
  const LONG_NAME = 'Suplemento en polvo para ganar masa muscular de alto rendimiento';

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

  const renderReview = async (detected: unknown[], bottomInset = 0) => {
    (scannerApi.analyzeIngredientsImage as jest.Mock).mockResolvedValueOnce(detected);
    const screen = await render(
      <SafeAreaProvider initialMetrics={metrics(bottomInset)}>
        <TypographyProvider usingFallback={true}>
          <PantryProvider initialIngredients={[]}>
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

  const three = [
    { name: 'Harina de trigo', quantity: 500, unit: 'g', category: 'Granos y cereales', needsReview: false },
    { name: 'Fideos', quantity: 250, unit: 'g', category: 'Otros', needsReview: false },
    { name: 'Huevos', quantity: 6, unit: 'unidad', category: 'Carnes y proteínas', needsReview: false },
  ];

  it('muestra el conteo en singular con un alimento y sin la tarjeta de resumen anterior', async () => {
    const screen = await renderReview([
      { name: 'Suplemento', quantity: 3200, unit: 'g', needsReview: false },
    ]);

    expect(screen.getByText('1 alimento detectado')).toBeTruthy();
    expect(screen.getByText('Revisa y corrige los datos antes de guardarlos.')).toBeTruthy();
    expect(screen.queryByText('RESULTADO DEL ESCÁNER')).toBeNull();
    expect(screen.queryByLabelText('Miniatura de la foto analizada')).toBeNull();
    expect(screen.queryByText(/seleccionado/)).toBeNull();
    expect(screen.getByText('Guardar 1 alimento en mi despensa')).toBeTruthy();
  });

  it('muestra los datos reales, en su orden, con varios alimentos', async () => {
    const screen = await renderReview(three);

    expect(screen.getByText('3 alimentos detectados')).toBeTruthy();
    expect(screen.getAllByTestId(/^detected-card-/)).toHaveLength(3);
    expect(screen.getAllByLabelText('Nombre del ingrediente detectado').map((n: any) => n.props.value)).toEqual([
      'Harina de trigo',
      'Fideos',
      'Huevos',
    ]);
    expect(screen.getByDisplayValue('500')).toBeTruthy();
    expect(screen.getByDisplayValue('250')).toBeTruthy();
  });

  it('presenta un encabezado con mosaico de ícono y conserva el botón Volver', async () => {
    const screen = await renderReview(three);

    expect(screen.queryByTestId('scanner-header-icon')).toBeNull();
    expect(screen.getByTestId('scanner-header-icon', HIDDEN)).toBeTruthy();
    expect(screen.getByText('Escáner Inteligente')).toBeTruthy();

    // Desde la revisión, Volver reinicia el flujo en lugar de abandonar la pantalla
    await fireEvent.press(screen.getByLabelText('Volver'));
    expect(screen.getByTestId('scanner-capture-state')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('«Todos» y «Ninguno» cambian la selección y son enlaces compactos sin relleno', async () => {
    const screen = await renderReview(three);

    const none = screen.getByTestId('scanner-deselect-all-button');
    expect(flat(none.props.style).backgroundColor).toBeUndefined();
    expect(flat(none.props.style).minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);

    await fireEvent.press(none);
    expect(screen.getByText('Selecciona al menos un alimento')).toBeTruthy();
    expect(screen.getByTestId('scanner-confirm-save-button').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true })
    );

    await fireEvent.press(screen.getByTestId('scanner-select-all-button'));
    expect(screen.getByText('Guardar 3 alimentos en mi despensa')).toBeTruthy();
  });

  it('no aplica el degradado de acción al botón Guardar deshabilitado', async () => {
    const screen = await renderReview(three);

    const enabledStyle = flat(screen.getByTestId('scanner-confirm-save-button').props.style);
    expect(enabledStyle.backgroundImage).toEqual(expect.stringContaining('linear-gradient'));

    await fireEvent.press(screen.getByTestId('scanner-deselect-all-button'));
    const disabledStyle = flat(screen.getByTestId('scanner-confirm-save-button').props.style);
    expect(disabledStyle.backgroundImage).toBeUndefined();
  });

  it('un nombre largo envuelve sin recortarse ni alterar el valor', async () => {
    const screen = await renderReview([
      { name: LONG_NAME, quantity: 1, unit: 'unidad', needsReview: false },
    ]);

    const input = screen.getByDisplayValue(LONG_NAME);
    expect(input.props.multiline).toBe(true);
    expect(input.props.scrollEnabled).toBe(false);
    expect(input.props.numberOfLines).toBeUndefined();
  });

  it('guarda los alimentos editados con su unidad y categoría', async () => {
    const screen = await renderReview([
      { name: 'Harina de trigo', quantity: 500, unit: 'g', category: 'Otros', needsReview: false },
    ]);
    const id = screen.getByTestId(/^detected-checkbox-/).props.testID.replace('detected-checkbox-', '');

    await fireEvent.press(screen.getByTestId(`detected-unit-${id}-kg`));
    await fireEvent.changeText(screen.getByTestId(`detected-quantity-input-${id}`), '2');
    await fireEvent.press(screen.getByTestId(`detected-category-toggle-${id}`));
    await fireEvent.press(screen.getByTestId(`detected-category-${id}-Granos y cereales`));

    expect(screen.getByTestId(`detected-unit-${id}-kg`).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true })
    );

    await fireEvent.press(screen.getByTestId('scanner-confirm-save-button'));
    expect(await screen.findByTestId('scanner-completed-state')).toBeTruthy();
  });

  it('Descartar vuelve a la captura', async () => {
    const screen = await renderReview(three);

    await fireEvent.press(screen.getByTestId('scanner-retake-from-review-button'));

    expect(screen.getByTestId('scanner-capture-state')).toBeTruthy();
    expect(screen.queryByTestId('scanner-review-footer')).toBeNull();
  });

  it('el pie fijo respeta el inset inferior y no agrega una barra de pestañas', async () => {
    const screen = await renderReview(three, 34);

    expect(flat(screen.getByTestId('scanner-review-footer').props.style).paddingBottom).toBe(34);
    expect(screen.queryByTestId('tab-bar-surface')).toBeNull();
    expect(screen.queryByLabelText('Pestaña Plan')).toBeNull();
  });

  it('el pie se oculta con el teclado y el contenido gana espacio para seguir alcanzable', async () => {
    const listeners: Record<string, (event: any) => void> = {};
    const spy = jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, cb: any) => {
      listeners[name] = cb;
      return { remove: jest.fn() };
    }) as any);

    const screen = await renderReview(three);
    expect(screen.getByTestId('scanner-review-footer')).toBeTruthy();

    await act(async () => {
      listeners.keyboardDidShow({ endCoordinates: { height: 300 } });
    });
    expect(screen.queryByTestId('scanner-review-footer')).toBeNull();
    const scrollProps = screen.getByTestId('scanner-scroll-view').props;
    expect(flat(scrollProps.contentContainerStyle).paddingBottom).toBeGreaterThanOrEqual(300);
    expect(scrollProps.keyboardShouldPersistTaps).toBe('handled');

    await act(async () => {
      listeners.keyboardDidHide({});
    });
    expect(screen.getByTestId('scanner-review-footer')).toBeTruthy();
    spy.mockRestore();
  });
});

describe('Tarjeta de alimento detectado', () => {
  const item: ScannedIngredientItem = {
    id: 'scan-1',
    name: 'Harina de trigo',
    quantity: 500,
    unit: 'g',
    category: 'Granos y cereales',
    needsReview: false,
    isSelected: true,
    action: 'create',
  };

  const renderCard = async (overrides: Partial<ScannedIngredientItem> = {}) => {
    const handlers = {
      onToggleSelect: jest.fn(),
      onChangeName: jest.fn(),
      onChangeQuantity: jest.fn(),
      onChangeUnit: jest.fn(),
      onChangeCategory: jest.fn(),
      onChangeAction: jest.fn(),
      onRemove: jest.fn(),
    };
    const utils = await render(
      <TypographyProvider usingFallback={true}>
        <DetectedIngredientCard item={{ ...item, ...overrides }} {...handlers} />
      </TypographyProvider>
    );
    return { ...utils, handlers };
  };

  it('muestra el mosaico de categoría y lo cede al nombre en pantallas estrechas o fuente grande', async () => {
    await withWindow({ width: 390 }, async () => {
      const { getByTestId } = await renderCard();
      expect(getByTestId('detected-category-tile-scan-1', HIDDEN)).toBeTruthy();
    });
    await cleanup();
    await withWindow({ width: 320 }, async () => {
      const { queryByTestId } = await renderCard();
      expect(queryByTestId('detected-category-tile-scan-1', HIDDEN)).toBeNull();
    });
    await cleanup();
    await withWindow({ width: 390, fontScale: 1.5 }, async () => {
      const { queryByTestId } = await renderCard();
      expect(queryByTestId('detected-category-tile-scan-1', HIDDEN)).toBeNull();
    });
  });

  it('un salto de línea pegado no se cuela en el nombre', async () => {
    const { getByTestId, handlers } = await renderCard();

    await fireEvent.changeText(getByTestId('detected-name-input-scan-1'), 'Harina\nde\r\ntrigo');

    expect(handlers.onChangeName).toHaveBeenCalledWith('scan-1', 'Harina de trigo');
  });

  it('conserva todas las unidades; la píldora es compacta sin reducir el área táctil', async () => {
    const { getByTestId, handlers } = await renderCard();

    for (const unit of INGREDIENT_UNITS) {
      const chip = getByTestId(`detected-unit-scan-1-${unit}`);
      expect(flat(chip.props.style).minHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    }
    await fireEvent.press(getByTestId('detected-unit-scan-1-kg'));
    expect(handlers.onChangeUnit).toHaveBeenCalledWith('scan-1', 'kg');
  });

  it('centra «Cambiar categoría» aunque el contenido pueda envolver', async () => {
    const { getByTestId } = await renderCard();

    const style = flat(getByTestId('detected-category-toggle-scan-1').props.style);
    expect(style.flexWrap).toBe('wrap');
    expect(style.alignContent).toBe('center');
    expect(style.borderRadius).toBeGreaterThan(100);
    expect(style.borderWidth).toBe(1);
  });

  it('la eliminación y la selección siguen funcionando con el nuevo marco', async () => {
    const { getByTestId, handlers } = await renderCard();

    await fireEvent.press(getByTestId('detected-remove-scan-1'));
    await fireEvent.press(getByTestId('detected-checkbox-scan-1'));

    expect(handlers.onRemove).toHaveBeenCalledWith('scan-1');
    expect(handlers.onToggleSelect).toHaveBeenCalledWith('scan-1');
  });
});

// ---------------------------------------------------------------------------------------------
// 2. Plan
// ---------------------------------------------------------------------------------------------
describe('Pantalla del plan', () => {
  const now = '2026-11-08T10:00:00.000Z';
  const pantry: Ingredient[] = [
    { id: 'i1', name: 'Pollo', quantity: 500, unit: 'g', category: 'Carnes y proteínas', createdAt: now, updatedAt: now },
    { id: 'i2', name: 'Arroz', quantity: 500, unit: 'g', category: 'Granos y cereales', createdAt: now, updatedAt: now },
  ];

  const day = (n: number, id: string, name: string): ClientMealPlan['days'][number] =>
    ({
      day: n,
      recipe: {
        id,
        name,
        description: `Descripción ${n}`,
        totalMinutes: 30,
        servings: 2,
        ingredients: [{ name: 'Pollo', quantity: 200, unit: 'g' }],
        steps: ['Paso'],
        availableIngredients: [{ name: 'Pollo', quantity: 200, unit: 'g' }],
        missingIngredients: [{ name: 'Tomate', quantity: 1, unit: 'unidad', estimatedCost: 1500 }],
        estimatedMissingCost: 1500,
        budgetRemaining: 18500,
        withinBudget: true,
        convenience: '51% conveniente',
        reason: 'Razón',
        isDemoFixture: false,
      },
    } as ClientMealPlan['days'][number]);

  const plan: ClientMealPlan = {
    days: [
      day(1, 'plan-dia-1', 'Pollo desmenuzado básico'),
      day(2, 'plan-dia-2', 'Tiras de pollo salteadas'),
      day(3, 'plan-dia-3', '🥘 Guiso de la casa'),
    ],
    totalEstimatedMissingCost: 4500,
    budgetRemaining: 15500,
    withinBudget: true,
    uniqueMissingIngredients: [{ name: 'Tomate', quantity: 1, unit: 'unidad', estimatedCost: 1500 }],
  };

  const renderPlan = async (
    options: { ingredients?: Ingredient[]; initialPlan?: ClientMealPlan | null; budget?: number; client?: any } = {}
  ) =>
    render(
      <SafeAreaProvider initialMetrics={metrics()}>
        <TypographyProvider usingFallback={true}>
          <PantryProvider initialIngredients={options.ingredients ?? pantry}>
            <BudgetProvider
              initialPreferences={{ budget: options.budget ?? 100000, servings: 4, maxMinutes: 60 }}
            >
              <RecipeProvider>
                <MealPlanProvider initialPlan={options.initialPlan ?? null} mealPlanApiClient={options.client}>
                  <PlanScreen />
                </MealPlanProvider>
              </RecipeProvider>
            </BudgetProvider>
          </PantryProvider>
        </TypographyProvider>
      </SafeAreaProvider>
    );

  const textOf = (node: any) => [node.props.children].flat().join('');

  it('muestra los cuatro indicadores con sus valores reales', async () => {
    const { getByTestId, getByText } = await renderPlan();

    expect(textOf(getByTestId('plan-summary-value-budget'))).toMatch(/100\.000/);
    expect(textOf(getByTestId('plan-summary-value-servings'))).toBe('4 personas');
    expect(textOf(getByTestId('plan-summary-value-time'))).toBe('60 min');
    expect(textOf(getByTestId('plan-summary-value-pantry'))).toBe('2 ítems');
    for (const label of ['Presupuesto', 'Porciones', 'Tiempo máx.', 'Despensa']) {
      expect(getByText(label)).toBeTruthy();
    }
  });

  it('forma una cuadrícula 2×2 sin truncar los montos grandes', async () => {
    const { getByTestId } = await renderPlan({ budget: 12500000 });

    const grid = flat(getByTestId('plan-summary-strip').props.style);
    expect(grid.flexDirection).toBe('row');
    expect(grid.flexWrap).toBe('wrap');
    for (const key of ['budget', 'servings', 'time', 'pantry']) {
      expect(flat(getByTestId(`plan-summary-${key}`).props.style).flexBasis).toBe('45%');
      expect(getByTestId(`plan-summary-value-${key}`).props.numberOfLines).toBeUndefined();
    }
    expect(textOf(getByTestId('plan-summary-value-budget'))).toMatch(/12\.500\.000/);
  });

  it('usa contenedores de ícono de un mismo tono púrpura en los cuatro indicadores', async () => {
    const { getByTestId } = await renderPlan();

    const tints = ['piggy-bank', 'account-group', 'timer', 'fridge'].map(
      (icon) => flat(getByTestId(`icon-${icon}`).parent?.props.style).backgroundColor
    );
    expect(new Set(tints)).toEqual(new Set([lightColors.primaryFixed]));
  });

  it.each([
    [390, 844, 1, 'row', true],
    [360, 800, 1, 'row', true],
    [360, 600, 1, 'row', false],
    [320, 568, 1, 'column', false],
    [390, 844, 1.5, 'column', false],
  ])(
    'a %i×%i dp con fuente %s: mosaico en %s, fijo sobre el scroll = %s',
    async (width, height, fontScale, direction, pinned) => {
      await withWindow({ width, height, fontScale }, async () => {
        const { getByTestId } = await renderPlan();

        expect(flat(getByTestId('plan-summary-budget').props.style).flexDirection).toBe(direction);

        const summary = getByTestId('plan-summary-strip');
        const scroll = getByTestId('plan-scroll-view');
        const insideScroll = scroll.queryAll((node: any) => node.props.testID === 'plan-summary-strip').length > 0;
        expect(insideScroll).toBe(!pinned);
        expect(summary).toBeTruthy();
      });
    }
  );

  it('estado sin despensa: conserva el mensaje y la navegación', async () => {
    const { getByText, getByTestId } = await renderPlan({ ingredients: [] });

    expect(getByText('Tu despensa está vacía')).toBeTruthy();
    expect(textOf(getByTestId('plan-summary-value-pantry'))).toBe('0 ítems');

    await fireEvent.press(getByTestId('plan-go-to-pantry-button'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/despensa');
  });

  it('estado inicial: composición con íconos y CTA que genera el plan', async () => {
    const client = { generateMealPlan: jest.fn().mockReturnValue(new Promise(() => {})) };
    const { getByTestId, getByText } = await renderPlan({ client });

    expect(getByText('Planifica tus comidas de los próximos 3 días')).toBeTruthy();
    // Ninguna imagen nueva: la ilustración se compone solo con íconos vectoriales
    const illustration = getByTestId('plan-intro-illustration', HIDDEN);
    expect(illustration.queryAll((node: any) => node.type === 'Image')).toHaveLength(0);
    expect(getByTestId('icon-calendar-check', HIDDEN)).toBeTruthy();
    expect(getByTestId('icon-bowl-mix', HIDDEN)).toBeTruthy();

    await fireEvent.press(getByTestId('generate-meal-plan-button'));
    expect(client.generateMealPlan).toHaveBeenCalledTimes(1);
  });

  it('plan generado: conserva días, progreso, costos, conveniencia y disponibilidad', async () => {
    const { getByTestId, getAllByText, getByText } = await renderPlan({ initialPlan: plan });

    for (const n of [1, 2, 3]) expect(getByTestId(`plan-day-card-${n}`)).toBeTruthy();
    expect(textOf(getByTestId('plan-progress-text'))).toBe('0/3 días completados');
    expect(getAllByText('51% conveniente')).toHaveLength(3);
    expect(getAllByText('1 en casa')).toHaveLength(3);
    expect(getAllByText('1 por comprar')).toHaveLength(3);
    expect(getAllByText(/~\$?1\.500/).length).toBeGreaterThanOrEqual(3);
    expect(getByText('Descripción 1')).toBeTruthy();
    expect(getByTestId('plan-budget-summary')).toBeTruthy();
    expect(getByTestId('plan-missing-ingredients-section')).toBeTruthy();
  });

  it('plan generado: completar, ver receta y regenerar siguen funcionando', async () => {
    const client = { generateMealPlan: jest.fn().mockReturnValue(new Promise(() => {})) };
    const { getByTestId, findByTestId } = await renderPlan({ initialPlan: plan, client });

    await fireEvent.press(getByTestId('plan-day-complete-button-1'));
    expect(await findByTestId('plan-day-completed-badge-1')).toBeTruthy();
    expect(textOf(getByTestId('plan-progress-text'))).toBe('1/3 días completados');

    await fireEvent.press(getByTestId('plan-view-recipe-button-2'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/recetas/plan-dia-2',
      params: { fromPlan: 'true' },
    });

    await fireEvent.press(getByTestId('generate-meal-plan-button'));
    expect(client.generateMealPlan).toHaveBeenCalledTimes(1);
  });

  it('el emoji va aparte: el título conserva el nombre original sin mutar el plan', async () => {
    const snapshot = JSON.parse(JSON.stringify(plan.days.map((d) => d.recipe)));
    const { getByTestId, getByText, queryByTestId } = await renderPlan({ initialPlan: plan });

    expect(getByTestId('plan-day-title-1').props.children).toBe('Pollo desmenuzado básico');
    expect(getByText('Pollo desmenuzado básico')).toBeTruthy();
    const emoji = getByTestId('plan-day-emoji-1', HIDDEN);
    expect(emoji.props.children).toBe('🍗');
    expect(emoji.props.importantForAccessibility).toBe('no');

    // Un título que ya trae emoji no recibe otro
    expect(getByTestId('plan-day-title-3').props.children).toBe('🥘 Guiso de la casa');
    expect(queryByTestId('plan-day-emoji-3', HIDDEN)).toBeNull();

    expect(plan.days.map((d) => d.recipe)).toEqual(snapshot);
  });
});

describe('getRecipeTitleEmoji', () => {
  it.each([
    ['Pollo desmenuzado básico', '🍗'],
    ['Tiras de pollo salteadas', '🍗'],
    ['Pasta con tomate', '🍝'],
    ['Espaguetis a la boloñesa', '🍝'],
    ['Lasaña de carne', '🍝'],
    ['Ensalada fresca', '🥗'],
    ['Sopa de verduras', '🍲'],
    ['Ajiaco santafereño', '🍲'],
    ['Consomé de res', '🍲'],
    ['Crema de tomate', '🍲'],
    ['Arroz con verduras', '🍚'],
    ['Huevos revueltos', '🥚'],
    ['Omelette de queso', '🥚'],
  ])('%s → %s', (name, emoji) => {
    expect(getRecipeTitleEmoji(name)).toBe(emoji);
  });

  it.each([
    ['Sopa de pollo', '🍲'],
    ['Ensalada de pollo', '🥗'],
    ['Pollo con ensalada', '🍗'],
    ['Arroz con pollo', '🍚'],
    ['Pollo con arroz', '🍗'],
    ['Sopa de fideos', '🍲'],
    ['Pollo en crema', '🍗'],
  ])('gana lo mencionado primero: %s → %s', (name, emoji) => {
    expect(getRecipeTitleEmoji(name)).toBe(emoji);
  });

  it.each([
    ['Ensalada de repollo', '🥗'],
    ['Repollo guisado', '🍽️'],
    ['Arepa sin huevo', '🍽️'],
    ['Arroz con leche', '🍽️'],
    ['Salsa con pasta de ajo', '🍽️'],
    ['Salsa de crema', '🍽️'],
    ['Tortilla', '🍽️'],
    ['Bandeja del día', '🍽️'],
    ['', '🍽️'],
  ])('evita clasificar mal ante la duda: «%s» → %s', (name, emoji) => {
    expect(getRecipeTitleEmoji(name)).toBe(emoji);
  });

  it('ignora mayúsculas y acentos, y es determinista', () => {
    expect(getRecipeTitleEmoji('POLLO AL HORNO')).toBe('🍗');
    expect(getRecipeTitleEmoji('consome')).toBe('🍲');
    const first = getRecipeTitleEmoji('Pollo y arroz');
    expect(getRecipeTitleEmoji('Pollo y arroz')).toBe(first);
  });

  it('no duplica un emoji existente', () => {
    expect(getRecipeTitleEmoji('🍗 Pollo asado')).toBeNull();
    expect(getRecipeTitleEmoji('Pasta 🍝')).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// 3. Barra de pestañas
// ---------------------------------------------------------------------------------------------
describe('Barra de pestañas flotante', () => {
  const renderTabs = async (mode: 'light' | 'dark' = 'light', bottomInset = 0) =>
    render(
      <SafeAreaProvider initialMetrics={metrics(bottomInset)}>
        <ThemeProvider initialMode={mode} storageAdapter={themeStorage(mode)}>
          <TypographyProvider usingFallback={true}>
            <TabsLayout />
          </TypographyProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    );

  const renderSurface = async () => render(mockScreenOptions.tabBarBackground());

  it('conserva las cuatro rutas, sus títulos y etiquetas accesibles', async () => {
    await renderTabs();

    expect(Object.keys(mockRegisteredTabs).sort()).toEqual(['despensa', 'index', 'perfil', 'plan']);
    expect(mockRegisteredTabs.plan.title).toBe('Plan');
    expect(mockRegisteredTabs.despensa.tabBarAccessibilityLabel).toBe('Pestaña Despensa');
  });

  it('flota sin tabBar absoluta ni márgenes, para no tapar pantallas ni dejar franja con el teclado', async () => {
    await renderTabs();

    const style = mockScreenOptions.tabBarStyle;
    expect(style.position).toBeUndefined();
    expect(style.marginBottom).toBeUndefined();
    expect(style.marginHorizontal).toBeUndefined();
    expect(style.elevation).toBe(0);
    expect(style.borderTopWidth).toBe(0);
  });

  it('la superficie es redondeada, con borde y sombra que no alteran el orden de pintado', async () => {
    await renderTabs();
    const { getByTestId } = await renderSurface();

    const surface = flat(getByTestId('tab-bar-surface').props.style);
    expect(surface.position).toBe('absolute');
    expect(surface.borderRadius).toBeGreaterThanOrEqual(24);
    expect(surface.borderWidth).toBe(1);
    expect(surface.boxShadow).toEqual(expect.any(String));
    expect(surface.elevation).toBeUndefined();
    expect(surface.backgroundColor).toBe(lightColors.surface);
  });

  it('respeta el inset inferior del sistema y mantiene un margen mínimo sin él', async () => {
    await renderTabs('light', 34);
    const withInset = mockScreenOptions.tabBarStyle;
    expect(withInset.paddingBottom).toBeGreaterThan(34);
    expect(withInset.height).toBeGreaterThan(34 + 60);
    const { getByTestId } = await renderSurface();
    expect(flat(getByTestId('tab-bar-surface').props.style).bottom).toBe(34);
    await cleanup();

    await renderTabs('light', 0);
    const { getByTestId: getSurface } = await renderSurface();
    expect(flat(getSurface('tab-bar-surface').props.style).bottom).toBeGreaterThanOrEqual(8);
  });

  it('resalta con una píldora que abarca ícono y etiqueta, en claro y oscuro', async () => {
    await renderTabs('light');
    expect(mockScreenOptions.tabBarActiveBackgroundColor).toBe(lightColors.primaryFixed);
    expect(mockScreenOptions.tabBarItemStyle.overflow).toBe('hidden');
    expect(mockScreenOptions.tabBarItemStyle.borderRadius).toBeGreaterThanOrEqual(16);
    await cleanup();

    await renderTabs('dark');
    await waitFor(() => expect(mockScreenOptions.tabBarStyle.backgroundColor).toBe(darkColors.canvas));
    expect(mockScreenOptions.tabBarActiveBackgroundColor).not.toBe(lightColors.primaryFixed);
    expect(mockScreenOptions.tabBarInactiveTintColor).toBe(darkColors.textSecondary);
  });

  it('solo la pestaña activa recibe el fondo y el ícono relleno', async () => {
    await renderTabs();

    const active = await render(
      mockRegisteredTabs.plan.tabBarIcon({ focused: true, color: '#111111', size: 24 })
    );
    const activeIcon = active.getByTestId('icon-calendar-month');
    expect(flat(activeIcon.parent?.props.style).backgroundColor).toBe(lightColors.primaryFixed);
    await cleanup();

    await renderTabs();
    const inactive = await render(
      mockRegisteredTabs.plan.tabBarIcon({ focused: false, color: '#111111', size: 24 })
    );
    const inactiveIcon = inactive.getByTestId('icon-calendar-month-outline');
    expect(flat(inactiveIcon.parent?.props.style).backgroundColor).toBeUndefined();
  });

  it.each([320, 360, 390])('a %i dp cada pestaña dispone de ancho para «Despensa»', async (width) => {
    await withWindow({ width }, async () => {
      await renderTabs();
      const style = mockScreenOptions.tabBarStyle;
      const margin = mockScreenOptions.tabBarItemStyle.marginHorizontal;
      const perTab = (width - 2 * style.paddingHorizontal) / 4 - 2 * margin;
      expect(perTab).toBeGreaterThanOrEqual(60);
      expect(style.height).toBeLessThan(120);
    });
  });

  it('crece con la fuente grande y la etiqueta se ajusta en una línea sin truncarse', async () => {
    let baseHeight = 0;
    await withWindow({ width: 360, fontScale: 1 }, async () => {
      await renderTabs();
      baseHeight = mockScreenOptions.tabBarStyle.height;
    });
    await cleanup();

    await withWindow({ width: 320, fontScale: 2 }, async () => {
      await renderTabs();
      expect(mockScreenOptions.tabBarStyle.height).toBeGreaterThan(baseHeight);

      const { getByText } = await render(
        mockScreenOptions.tabBarLabel({
          focused: true,
          color: '#111111',
          position: 'below-icon',
          children: 'Despensa',
        })
      );
      const label = getByText('Despensa');
      expect(label.props.numberOfLines).toBe(1);
      expect(label.props.adjustsFontSizeToFit).toBe(true);
      expect(label.props.maxFontSizeMultiplier).toBeGreaterThanOrEqual(1.3);
      expect(flat(label.props.style).color).toBe('#111111');
    });
  });
});
