/**
 * FoodAI - Cierre del MVP: pestaña central de Recetas y lenguaje visual común.
 *
 * Usa el navegador REAL de expo-router con las pantallas reales para comprobar:
 * 1. Cinco pestañas en orden, con Recetas al centro y destacada.
 * 2. Enlaces antiguos a /recetas, detalle y regreso, sin instancias duplicadas de las pestañas.
 * 3. Restauración en frío, ausencia de llamadas a Gemini al navegar y aislamiento por cuenta.
 * 4. Imágenes: respaldo de marca y política de aprobación intacta.
 * 5. Tokens de tema, contraste y comportamiento en pantallas pequeñas.
 */
import React from 'react';
import { Dimensions, StyleSheet, Text } from 'react-native';
import { act, fireEvent, render, waitFor, cleanup } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';
import TabsLayout from '../app/(tabs)/_layout';
import HomeScreen from '../app/(tabs)/index';
import DespensaScreen from '../app/(tabs)/despensa';
import RecetasScreen from '../app/(tabs)/recetas';
import PlanScreen from '../app/(tabs)/plan';
import RecetasLayout from '../app/recetas/_layout';
import RecipeDetailScreen from '../app/recetas/[id]';
import CookingScreen from '../app/recetas/[id]/cocinar';
import { Button, Card } from '../src/components/common';
import { RecipeImage } from '../src/components/recipe/RecipeImage';
import { BudgetProvider } from '../src/context/BudgetContext';
import { MealPlanProvider } from '../src/context/MealPlanContext';
import { PantryProvider } from '../src/context/PantryContext';
import { RecipeProvider } from '../src/context/RecipeContext';
import { AsyncStorageRecipeAdapter, PersistedRecipeCollection } from '../src/services/storage/recipeStorage';
import {
  AppColors,
  darkColors,
  getAppSurfaces,
  gradientStyle,
  lightColors,
  ThemeProvider,
  TypographyProvider,
} from '../src/theme';
import { Ingredient } from '../src/types/pantry';
import { BackendRecipe, ClientRecipe, normalizeBackendRecipe } from '../src/types/recipe';
import {
  getRecipeImageSource,
  RECIPE_IMAGE_APPROVALS,
  RECIPE_IMAGE_ASSET_RECORDS,
  RECIPE_IMAGE_CATALOG,
  RECIPE_IMAGE_DISPLAY_POLICY,
  selectRecipeImageCatalog,
} from '../src/utils/recipeImageCatalog';
import { resolveRecipeImageKey } from '../src/utils/recipeImageMatcher';
import { returnToTab } from '../src/utils/tabNavigation';

jest.setTimeout(30000);

const flat = (style: unknown): any =>
  StyleSheet.flatten(typeof style === 'function' ? style({ pressed: false }) : style) ?? {};

const PANTRY: Ingredient[] = [
  { id: 'p1', name: 'Pollo', quantity: 500, unit: 'g', category: 'Carnes y proteínas', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' },
  { id: 'p2', name: 'Arroz', quantity: 500, unit: 'g', category: 'Granos y cereales', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' },
];

const backendRecipe = (name: string): BackendRecipe => ({
  name,
  description: 'Generada por el backend',
  totalMinutes: 30,
  ingredients: [{ name: 'Pollo', quantity: 200, unit: 'g' }],
  steps: ['Cocinar'],
  availableIngredients: [{ name: 'Pollo', quantity: 200, unit: 'g' }],
  missingIngredients: [{ name: 'Tomate', quantity: 1, unit: 'unidad', estimatedCost: 1500 }],
  estimatedMissingCost: 1500,
  budgetRemaining: 18500,
  withinBudget: true,
  convenience: 88,
  reason: 'Aprovecha tu despensa',
});

const clientRecipe = (name: string, generationId: string, index: number, total: number): ClientRecipe =>
  normalizeBackendRecipe(backendRecipe(name), index, total, generationId);

const collection = (names: string[]): PersistedRecipeCollection => ({
  generationId: 'gen_1',
  generatedAt: '2026-11-07T10:00:00.000Z',
  snapshot: { pantryFingerprint: 'fp', budget: 20000, servings: 2, maxMinutes: 30 },
  recipes: names.map((n, i) => clientRecipe(n, 'gen_1', i, names.length)),
});

async function persist(uid: string, names: string[]) {
  const adapter = new AsyncStorageRecipeAdapter(uid);
  await adapter.save(collection(names), adapter.reserveWriteOrder());
}

function memoryPantry(items: Ingredient[]) {
  return {
    getIngredients: async () => items.map((i) => ({ ...i })),
    saveIngredients: async () => {},
    addIngredient: async (i: any) => i,
    updateIngredient: async (i: any) => i,
    deleteIngredient: async () => {},
    clearIngredients: async () => {},
  } as any;
}

function memoryBudget() {
  const prefs = { budget: 20000, servings: 2, maxMinutes: 30, updatedAt: '2026-11-01T00:00:00.000Z' };
  return {
    getPreferences: async () => ({ ...prefs }),
    savePreferences: async (next: any) => ({ ...prefs, ...next }),
    updatePreferences: async (next: any) => ({ ...prefs, ...next }),
    resetPreferences: async () => ({ ...prefs }),
  } as any;
}

const createApi = (names: string[] = ['Sopa nueva']) =>
  ({
    recommendRecipes: jest.fn(() => Promise.resolve(names.map(backendRecipe))),
    checkBackendHealth: jest.fn(),
  }) as any;

const Stub = (id: string) =>
  function StubScreen() {
    return <Text testID={id}>{id}</Text>;
  };

let providerMounts = 0;
function MountProbe() {
  React.useEffect(() => {
    providerMounts += 1;
  }, []);
  return null;
}

interface AppOptions {
  uid?: string;
  api?: any;
  pantry?: Ingredient[];
  recipeStorage?: any;
  initialUrl?: string;
}

async function renderApp({ uid = 'usr-a', api = createApi(), pantry = PANTRY, recipeStorage, initialUrl = '/' }: AppOptions = {}) {
  const pantryStore = memoryPantry(pantry);
  const budgetStore = memoryBudget();
  const RootLayout = () => (
    <PantryProvider storageAdapter={pantryStore} userId={uid}>
      <BudgetProvider storageAdapter={budgetStore} userId={uid}>
        <RecipeProvider userId={uid} recipeApiClient={api} storageAdapter={recipeStorage}>
          <MealPlanProvider>
            <MountProbe />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="recetas" />
            </Stack>
          </MealPlanProvider>
        </RecipeProvider>
      </BudgetProvider>
    </PantryProvider>
  );
  await renderRouter(
    {
      _layout: RootLayout,
      '(tabs)/_layout': TabsLayout,
      '(tabs)/index': HomeScreen,
      '(tabs)/despensa': DespensaScreen,
      '(tabs)/recetas': RecetasScreen,
      '(tabs)/plan': PlanScreen,
      '(tabs)/perfil': Stub('s-perfil'),
      'recetas/_layout': RecetasLayout,
      'recetas/[id]': RecipeDetailScreen,
      'recetas/[id]/cocinar': CookingScreen,
    },
    { initialUrl }
  );
  return { api };
}

/** Rutas del stack raíz: debe haber una sola instancia de `(tabs)`. */
const rootRoutes = (): string[] => {
  const state: any = (screen as any).getRouterState();
  const rootStack = state.routes[0]?.state ?? state;
  return rootStack.routes.map((r: any) => r.name);
};

const pressTab = (label: string) => fireEvent.press(screen.getByLabelText(label));

beforeEach(async () => {
  await AsyncStorage.clear();
  providerMounts = 0;
});

afterEach(async () => {
  await cleanup();
});

describe('Pestañas', () => {
  it('muestra exactamente cinco pestañas en orden, con Recetas al centro', async () => {
    await renderApp();

    const labels = ['Pestaña Inicio', 'Pestaña Despensa', 'Pestaña Recetas', 'Pestaña Plan', 'Pestaña Perfil'];
    const nodes = (screen as any).container.queryAll(
      (node: any) => /^Pestaña /.test(node.props['aria-label'] ?? node.props.accessibilityLabel ?? '')
    );
    const seen = nodes.map((n: any) => n.props['aria-label'] ?? n.props.accessibilityLabel);
    expect(Array.from(new Set(seen))).toEqual(labels);
    expect(Array.from(new Set(seen))[2]).toBe('Pestaña Recetas');
  });

  it('destaca Recetas sin cambiar su etiqueta accesible y resalta la pestaña activa', async () => {
    await renderApp();

    // La navegación pinta el ícono dos veces para el fundido entre activo e inactivo
    expect(screen.getAllByTestId('tab-recetas-emphasis', { includeHiddenElements: true }).length).toBeGreaterThan(0);

    await pressTab('Pestaña Recetas');
    await waitFor(() => expect(screen.getByTestId('recipes-scroll-view')).toBeTruthy());
    const isSelected = (label: string) => {
      const { props } = screen.getByLabelText(label);
      return props.accessibilityState?.selected ?? props['aria-selected'];
    };
    expect(isSelected('Pestaña Recetas')).toBe(true);
    expect(isSelected('Pestaña Inicio')).toBeFalsy();
  });

  it('Recetas se muestra con la barra de pestañas y sin botón de retroceso', async () => {
    await renderApp({ initialUrl: '/recetas' });

    await waitFor(() => expect(screen.getByTestId('recipes-scroll-view')).toBeTruthy());
    expect(screen.getByLabelText('Pestaña Plan')).toBeTruthy();
    expect(screen.queryByTestId('recipes-back-button')).toBeNull();
    expect((screen as any).getPathname()).toBe('/recetas');
  });
});

describe('Navegación hacia Recetas y regreso', () => {
  it('el enlace de Inicio abre la pestaña existente sin apilar otra instancia', async () => {
    await renderApp();

    await waitFor(() => expect(screen.getByTestId('home-recommendation-generate-button')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('home-recommendation-generate-button'));

    await waitFor(() => expect(screen.getByTestId('recipes-scroll-view')).toBeTruthy());
    expect((screen as any).getPathname()).toBe('/recetas');
    expect(rootRoutes()).toEqual(['(tabs)']);
  });

  it('el enlace de Despensa abre la pestaña existente sin apilar otra instancia', async () => {
    await renderApp({ initialUrl: '/despensa' });

    await waitFor(() => expect(screen.getByTestId('savings-cook-button')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('savings-cook-button'));
    await fireEvent.press(screen.getByTestId('pantry-discover-recipes-button'));

    await waitFor(() => expect(screen.getByTestId('recipes-scroll-view')).toBeTruthy());
    expect(rootRoutes()).toEqual(['(tabs)']);
  });

  it('el detalle se apila sobre las pestañas y volver regresa a Recetas', async () => {
    await persist('usr-a', ['Arroz con pollo', 'Sopa de lentejas']);
    await renderApp({ initialUrl: '/recetas' });

    const [view] = await screen.findAllByTestId(/^recipe-view-button-/);
    await fireEvent.press(view);

    await waitFor(() => expect((screen as any).getPathname()).toMatch(/^\/recetas\/.+/));
    expect(rootRoutes()).toEqual(['(tabs)', 'recetas']);
    // El detalle no muestra la barra por encima
    expect(screen.queryByLabelText('Pestaña Plan')).toBeNull();

    await fireEvent.press(screen.getByLabelText(/volver/i));
    await waitFor(() => expect((screen as any).getPathname()).toBe('/recetas'));
    expect(rootRoutes()).toEqual(['(tabs)']);
    expect(screen.getByLabelText('Pestaña Plan')).toBeTruthy();
  });

  it('una receta inexistente vuelve a Recetas sin duplicar las pestañas', async () => {
    await renderApp({ initialUrl: '/recetas' });
    await waitFor(() => expect(screen.getByTestId('recipes-scroll-view')).toBeTruthy());

    const { router } = require('expo-router');
    await act(async () => {
      router.push('/recetas/no-existe');
    });
    await waitFor(() => expect(screen.getByTestId('recipe-not-found-return-button')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('recipe-not-found-return-button'));

    await waitFor(() => expect((screen as any).getPathname()).toBe('/recetas'));
    expect(rootRoutes()).toEqual(['(tabs)']);
  });

  it('un enlace directo al detalle sigue resolviendo y su receta inexistente lleva a Recetas', async () => {
    await renderApp({ initialUrl: '/recetas/no-existe' });

    await waitFor(() => expect(screen.getByTestId('recipe-not-found-return-button')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('recipe-not-found-return-button'));

    await waitFor(() => expect((screen as any).getPathname()).toBe('/recetas'));
    expect(rootRoutes().filter((name) => name === '(tabs)')).toHaveLength(1);
  });

  it('no remonta los proveedores al cambiar de pestaña', async () => {
    await renderApp();
    await waitFor(() => expect(providerMounts).toBe(1));

    await pressTab('Pestaña Recetas');
    await pressTab('Pestaña Plan');
    await pressTab('Pestaña Recetas');

    expect(providerMounts).toBe(1);
  });
});

describe('Recetas: persistencia y Gemini', () => {
  it('navegar entre pestañas nunca llama a Gemini; solo el botón lo hace', async () => {
    const api = createApi();
    await renderApp({ api });

    await pressTab('Pestaña Recetas');
    await waitFor(() => expect(screen.getByTestId('recipes-scroll-view')).toBeTruthy());
    await pressTab('Pestaña Despensa');
    await pressTab('Pestaña Recetas');
    await pressTab('Pestaña Inicio');
    await pressTab('Pestaña Recetas');

    expect(api.recommendRecipes).not.toHaveBeenCalled();

    await waitFor(() =>
      expect(screen.getByTestId('recipes-generate-ai-button').props.accessibilityState.disabled).toBe(false)
    );
    await fireEvent.press(screen.getByTestId('recipes-generate-ai-button'));
    await waitFor(() => expect(api.recommendRecipes).toHaveBeenCalledTimes(1));
  });

  it('durante la restauración en frío muestra carga, no el estado vacío, y luego las recetas', async () => {
    await persist('usr-a', ['Arroz con pollo']);
    const real = new AsyncStorageRecipeAdapter('usr-a');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const recipeStorage = {
      load: async () => {
        const result = await real.load();
        await gate;
        return result;
      },
      reserveWriteOrder: () => real.reserveWriteOrder(),
      save: (c: any, o: any) => real.save(c, o),
    };
    const api = createApi();

    await renderApp({ recipeStorage, api, initialUrl: '/recetas' });

    await waitFor(() => expect(screen.getByTestId('recipes-loading-state')).toBeTruthy());
    expect(screen.queryByTestId('recipes-no-generated-state')).toBeNull();

    await act(async () => {
      release();
    });

    expect(await screen.findByText('Arroz con pollo')).toBeTruthy();
    expect(screen.queryByTestId('recipes-loading-state')).toBeNull();
    expect(api.recommendRecipes).not.toHaveBeenCalled();
  });

  it('las recetas generadas siguen disponibles tras reiniciar la app', async () => {
    await persist('usr-a', ['Arroz con pollo', 'Sopa de lentejas']);

    await renderApp({ initialUrl: '/recetas' });
    expect(await screen.findByText('Arroz con pollo')).toBeTruthy();
    await cleanup();

    const api = createApi();
    await renderApp({ api, initialUrl: '/recetas' });
    expect(await screen.findByText('Sopa de lentejas')).toBeTruthy();
    expect(api.recommendRecipes).not.toHaveBeenCalled();
  });

  it('aísla las recetas por cuenta', async () => {
    await persist('usr-a', ['Receta privada de Ana']);

    await renderApp({ uid: 'usr-b', initialUrl: '/recetas' });

    await waitFor(() => expect(screen.getByTestId('recipes-no-generated-state')).toBeTruthy());
    expect(screen.queryByText('Receta privada de Ana')).toBeNull();
  });

  it('conserva el aviso de despensa vacía y el botón deshabilitado', async () => {
    await renderApp({ pantry: [], initialUrl: '/recetas' });

    await waitFor(() => expect(screen.getByTestId('recipes-empty-pantry-notice')).toBeTruthy());
    expect(screen.getByTestId('recipes-generate-ai-button').props.accessibilityState.disabled).toBe(true);
  });
});

describe('Imágenes de recetas', () => {
  it('reconoce cortes inequívocos del ingrediente', () => {
    expect(resolveRecipeImageKey({ name: 'Tiras de pollo salteadas' })).toBe('chicken');
    expect(resolveRecipeImageKey({ name: 'Trozos de pollo al curry' })).toBe('chicken');
    expect(resolveRecipeImageKey({ name: 'Cubos de atún con limón' })).toBe('fish');
  });

  it('no asigna imágenes dudosas o de otra categoría', () => {
    for (const name of ['Tiras de carne', 'Bocados de queso', 'Tiras de plátano', 'Bandeja paisa', 'Pizza casera', 'Tiras']) {
      expect(resolveRecipeImageKey({ name })).toBeNull();
    }
  });

  it('producción sigue sin aprobaciones: ninguna imagen de preview se activa', () => {
    expect(RECIPE_IMAGE_APPROVALS).toEqual({});
    expect(RECIPE_IMAGE_CATALOG.size).toBe(0);
    expect(RECIPE_IMAGE_DISPLAY_POLICY).toBe('production-approved-only');
    expect(getRecipeImageSource({ name: 'Tiras de pollo salteadas' }).kind).toBe('none');
  });

  it('el catálogo de preview distingue imagen de referencia de receta sin imagen fiable', () => {
    const preview = selectRecipeImageCatalog('internal-preview-verified', RECIPE_IMAGE_ASSET_RECORDS, RECIPE_IMAGE_APPROVALS);
    expect(getRecipeImageSource({ name: 'Tiras de pollo salteadas' }, preview)).toEqual(
      expect.objectContaining({ kind: 'reference', referenceLabel: 'Pollo' })
    );
    expect(getRecipeImageSource({ name: 'Bandeja paisa' }, preview).kind).toBe('none');
  });

  it('ignora URLs remotas de recetas reales aunque sean HTTPS', () => {
    expect(getRecipeImageSource({ name: 'Bandeja paisa', imageUrl: 'https://example.com/a.webp' }).kind).toBe('none');
  });

  const renderImage = (props: Partial<React.ComponentProps<typeof RecipeImage>>) =>
    render(
      <TypographyProvider usingFallback={true}>
        <RecipeImage recipeName="Bandeja paisa" testID="img" {...props} />
      </TypographyProvider>
    );

  it('sin imagen muestra un respaldo de marca accesible, sin <Image> ni fuente rota', async () => {
    const { getByTestId, getByText, queryByTestId, getByLabelText } = await renderImage({ source: null });

    expect(queryByTestId('img-img')).toBeNull();
    expect(getByText('FoodAI Receta')).toBeTruthy();
    expect(getByLabelText('Ilustración de Bandeja paisa')).toBeTruthy();
    expect(flat(getByTestId('img-fallback').props.style).backgroundColor).toBe(lightColors.brandTile);
  });

  it('rechaza una URL insegura y usa el respaldo', async () => {
    const { queryByTestId, getByText } = await renderImage({ source: 'http://example.com/a.jpg' });

    expect(queryByTestId('img-img')).toBeNull();
    expect(getByText('FoodAI Receta')).toBeTruthy();
  });

  it('un fallo de carga pasa al respaldo en lugar de dejar un contenedor vacío', async () => {
    const { getByTestId, queryByTestId, getByText } = await renderImage({ source: { testUri: 'x' } as any });

    await fireEvent(getByTestId('img-img'), 'error');

    expect(queryByTestId('img-img')).toBeNull();
    expect(getByText('FoodAI Receta')).toBeTruthy();
  });

  it('la imagen de referencia conserva su insignia y aclara que no es el plato generado', async () => {
    const { getByTestId, getByLabelText } = await renderImage({ source: { testUri: 'x' } as any, referenceLabel: 'Pollo' });

    expect(getByTestId('img-reference-badge', { includeHiddenElements: true })).toBeTruthy();
    expect(
      getByLabelText('Imagen de referencia de la categoría Pollo para Bandeja paisa. No es una foto del plato generado.')
    ).toBeTruthy();
  });
});

describe('Tema', () => {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it.each([
    ['claro', lightColors],
    ['oscuro', darkColors],
  ])('tema %s: el texto y los controles cumplen contraste AA', (_name, colors: AppColors) => {
    expect(contrast(colors.textPrimary, colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.textSecondary, colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.primary, colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.onPrimary, colors.cta)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.hintText, colors.hintBackground)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.onTertiary, colors.tertiary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.tabActive, colors.tabPill)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#FFFFFF', colors.brandTile)).toBeGreaterThanOrEqual(4.5);
  });

  it('ambos temas definen los mismos tokens', () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
  });

  it('el degradado solo se aplica con token no vacío, y el tema claro usa superficies sólidas', () => {
    expect(gradientStyle('')).toEqual({});
    expect(getAppSurfaces(lightColors).card.backgroundImage).toBeUndefined();
    expect(getAppSurfaces(darkColors).card.backgroundImage).toEqual(expect.stringContaining('linear-gradient'));
    expect(getAppSurfaces(darkColors).card.backgroundColor).toBe(darkColors.surface);
  });

  const darkStorage = {
    getThemeMode: async () => 'dark' as const,
    saveThemeMode: async () => {},
    clearThemeMode: async () => {},
  };
  const inDark = (ui: React.ReactElement) => (
    <ThemeProvider initialMode="dark" storageAdapter={darkStorage}>
      <TypographyProvider usingFallback={true}>{ui}</TypographyProvider>
    </ThemeProvider>
  );

  it('una tarjeta con fondo propio no queda tapada por el degradado', async () => {
    const { findByTestId } = await render(
      inDark(
        <>
          <Card testID="normal">{null}</Card>
          <Card testID="alerta" style={{ backgroundColor: darkColors.errorContainer }}>{null}</Card>
        </>
      )
    );

    expect(flat((await findByTestId('normal')).props.style).backgroundImage).toEqual(expect.stringContaining('gradient'));
    expect(flat((await findByTestId('alerta')).props.style).backgroundImage).toBeUndefined();
  });

  it('el botón primario deshabilitado no conserva el degradado', async () => {
    const { findByTestId } = await render(
      inDark(
        <>
          <Button testID="activo" title="A" onPress={() => {}} />
          <Button testID="inactivo" title="B" onPress={() => {}} disabled />
        </>
      )
    );

    expect(flat((await findByTestId('activo')).props.style).backgroundImage).toEqual(expect.stringContaining('gradient'));
    expect(flat((await findByTestId('inactivo')).props.style).backgroundImage).toBeUndefined();
  });

  it('el botón de contorno usa un borde visible sobre fondo transparente', async () => {
    const { findByTestId } = await render(inDark(<Button testID="o" title="O" variant="outline" onPress={() => {}} />));

    const style = flat((await findByTestId('o')).props.style);
    expect(style.backgroundColor).toBe('transparent');
    expect(style.borderColor).toBe(darkColors.fieldBorder);
  });
});

describe('Pantallas pequeñas', () => {
  const withWindow = async (width: number, fontScale: number, run: () => Promise<void>) => {
    const original = Dimensions.get('window');
    const next = { ...original, width, height: 640, fontScale };
    Dimensions.set({ window: next, screen: next });
    try {
      await run();
    } finally {
      Dimensions.set({ window: original, screen: original });
    }
  };

  it.each([
    [320, 1],
    [320, 1.3],
    [360, 1],
  ])('a %i dp con fuente %s todas las pestañas se pueden tocar', async (width, fontScale) => {
    await withWindow(width, fontScale, async () => {
      await renderApp();
      for (const label of ['Inicio', 'Despensa', 'Recetas', 'Plan', 'Perfil']) {
        expect(screen.getByLabelText(`Pestaña ${label}`)).toBeTruthy();
      }
      await pressTab('Pestaña Perfil');
      expect(await screen.findByTestId('s-perfil')).toBeTruthy();
    });
  });

  it('la insignia de referencia cede el ícono a 320 dp y lo conserva a 390 dp', async () => {
    const render320 = () =>
      render(
        <TypographyProvider usingFallback={true}>
          <RecipeImage recipeName="R" testID="img" source={{ testUri: 'x' } as any} referenceLabel="Pollo" />
        </TypographyProvider>
      );

    await withWindow(320, 1, async () => {
      const { queryByTestId } = await render320();
      expect(queryByTestId('icon-image-outline', { includeHiddenElements: true })).toBeNull();
    });
    await cleanup();
    await withWindow(390, 1, async () => {
      const { queryByTestId } = await render320();
      expect(queryByTestId('icon-image-outline', { includeHiddenElements: true })).toBeTruthy();
    });
  });
});

describe('returnToTab', () => {
  it('con historial descarta hasta la pestaña existente', () => {
    const router = { replace: jest.fn(), canDismiss: () => true, dismissTo: jest.fn() };

    returnToTab(router, '/recetas');

    expect(router.dismissTo).toHaveBeenCalledWith('/recetas');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('sin historial reemplaza la ruta actual', () => {
    const router = { replace: jest.fn(), canDismiss: () => false, dismissTo: jest.fn() };

    returnToTab(router, '/recetas');

    expect(router.replace).toHaveBeenCalledWith('/recetas');
    expect(router.dismissTo).not.toHaveBeenCalled();
  });
});
