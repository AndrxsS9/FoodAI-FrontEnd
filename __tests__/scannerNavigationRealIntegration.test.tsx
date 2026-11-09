/**
 * FoodAI — Real Expo Router SDK 58 Navigation Integration Test
 *
 * Investigates the 6 real navigation scenarios requested:
 * 1. Open scanner from Home, then select "Ver Mi Despensa"
 * 2. Open scanner from Pantry, then select "Volver al Inicio"
 * 3. Open scanner from Pantry and return to Pantry
 * 4. Open scanner through a direct deep link without an existing tab navigator
 * 5. Repeat scanner entry and exit several times
 * 6. Use Android Back after scanner completion
 */

import React, { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Stack, Tabs, useRouter } from 'expo-router';
import { renderRouter, testRouter, screen, fireEvent, act } from 'expo-router/testing-library';
import { returnToTab } from '../src/utils/tabNavigation';
import { PantryProvider, usePantry } from '../src/context/PantryContext';
import { RecipeProvider, useRecipes } from '../src/context/RecipeContext';
import { TypographyProvider } from '../src/theme';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BASE_DEMO_RECIPES } from '../src/fixtures/demoRecipes';
import { Ingredient } from '../src/types/pantry';

describe('Real Expo Router Navigation Scenarios Investigation', () => {
  let homeMountCount = 0;
  let pantryMountCount = 0;
  let tabsLayoutMountCount = 0;

  beforeEach(() => {
    homeMountCount = 0;
    pantryMountCount = 0;
    tabsLayoutMountCount = 0;
  });

  function TabsLayoutWrapper() {
    useEffect(() => {
      tabsLayoutMountCount++;
    }, []);

    return (
      <Tabs screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="despensa" />
        <Tabs.Screen name="recetas" />
        <Tabs.Screen name="plan" />
        <Tabs.Screen name="perfil" />
      </Tabs>
    );
  }

  function HomeScreen() {
    const router = useRouter();
    const { recipes } = useRecipes();
    useEffect(() => {
      homeMountCount++;
    }, []);

    return (
      <View testID="screen-home">
        <Text testID="home-recipe-count">{String(recipes.length)}</Text>
        <Pressable testID="home-open-scanner" onPress={() => router.push('/escaner')}>
          <Text>Escanear</Text>
        </Pressable>
      </View>
    );
  }

  function DespensaScreen() {
    const router = useRouter();
    const { ingredients } = usePantry();
    useEffect(() => {
      pantryMountCount++;
    }, []);

    return (
      <View testID="screen-despensa">
        <Text testID="pantry-ingredient-count">{String(ingredients.length)}</Text>
        <Pressable testID="despensa-open-scanner" onPress={() => router.push('/escaner')}>
          <Text>Escanear</Text>
        </Pressable>
      </View>
    );
  }

  function RecetasScreen() {
    return (
      <View testID="screen-recetas">
        <Text>Recetas Tab Screen</Text>
      </View>
    );
  }

  function PlanScreen() {
    return (
      <View testID="screen-plan">
        <Text>Plan Tab Screen</Text>
      </View>
    );
  }

  function PerfilScreen() {
    return (
      <View testID="screen-perfil">
        <Text>Perfil Tab Screen</Text>
      </View>
    );
  }

  function ScannerScreenComponent() {
    const router = useRouter();
    const { addIngredient } = usePantry();

    const handleSaveAndGoPantry = async () => {
      await addIngredient({
        name: 'Aguacate Hass',
        quantity: 2,
        unit: 'unidad',
        category: 'Verduras y frutas',
      });
      returnToTab(router, '/(tabs)/despensa');
    };

    return (
      <View testID="screen-scanner">
        <Text>Scanner Screen</Text>
        <Pressable testID="scanner-go-to-pantry" onPress={handleSaveAndGoPantry}>
          <Text>Ver Mi Despensa</Text>
        </Pressable>
        <Pressable
          testID="scanner-go-to-home"
          onPress={() => returnToTab(router, '/(tabs)')}
        >
          <Text>Volver al Inicio</Text>
        </Pressable>
      </View>
    );
  }

  const initialTestIngredients: Ingredient[] = [
    {
      id: 'item-init-1',
      name: 'Tomate Chonto',
      quantity: 3,
      unit: 'unidad',
      category: 'Verduras y frutas',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  function RootLayoutWrapper() {
    return (
      <SafeAreaProvider
        initialMetrics={{
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
          frame: { x: 0, y: 0, width: 390, height: 844 },
        }}
      >
        <TypographyProvider usingFallback={true}>
          <PantryProvider initialIngredients={initialTestIngredients}>
            <RecipeProvider initialRecipes={BASE_DEMO_RECIPES} initialIsDemoMode={false}>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="escaner" />
              </Stack>
            </RecipeProvider>
          </PantryProvider>
        </TypographyProvider>
      </SafeAreaProvider>
    );
  }

  const routerConfig = {
    '_layout': RootLayoutWrapper,
    '(tabs)/_layout': TabsLayoutWrapper,
    '(tabs)/index': HomeScreen,
    '(tabs)/despensa': DespensaScreen,
    '(tabs)/recetas': RecetasScreen,
    '(tabs)/plan': PlanScreen,
    '(tabs)/perfil': PerfilScreen,
    'escaner': ScannerScreenComponent,
  };

  /**
   * Helper to inspect the real root stack routes from the routerState
   */
  function getRootStackRoutes(routerResult: any) {
    const rawState = routerResult.getRouterState();
    const rootState =
      rawState?.routes?.[0]?.name === '__root' ? rawState.routes[0].state : rawState;
    return rootState?.routes || [];
  }

  it('Scenario 1: Open scanner from Home, then select "Ver Mi Despensa"', async () => {
    const result = await renderRouter(routerConfig, { initialUrl: '/(tabs)' });
    expect(screen.getByTestId('screen-home')).toBeTruthy();
    expect(tabsLayoutMountCount).toBe(1);

    // Open scanner from Home
    await testRouter.push('/escaner');
    expect(screen.getByTestId('screen-scanner')).toBeTruthy();
    expect(result.getPathname()).toBe('/escaner');

    let rootRoutes = getRootStackRoutes(result);
    expect(rootRoutes.length).toBe(2);
    expect(rootRoutes.map((r: any) => r.name)).toEqual(['(tabs)', 'escaner']);

    // Click "Ver Mi Despensa"
    await act(async () => {
      fireEvent.press(screen.getByTestId('scanner-go-to-pantry'));
    });

    expect(screen.getByTestId('screen-despensa')).toBeTruthy();
    expect(result.getPathname()).toBe('/despensa');

    // Tab navigator was NOT remounted
    expect(tabsLayoutMountCount).toBe(1);
    expect(pantryMountCount).toBe(1);
    expect(homeMountCount).toBe(1);

    // Root stack has strictly ONE (tabs) instance
    rootRoutes = getRootStackRoutes(result);
    expect(rootRoutes.length).toBe(1);
    expect(rootRoutes[0].name).toBe('(tabs)');

    // Data survived: pantry has 2 items (1 initial + 1 newly scanned)
    expect(screen.getByTestId('pantry-ingredient-count').props.children).toBe('2');
  });

  it('Scenario 2: Open scanner from Pantry, then select "Volver al Inicio"', async () => {
    const result = await renderRouter(routerConfig, { initialUrl: '/despensa' });
    expect(screen.getByTestId('screen-despensa')).toBeTruthy();
    expect(tabsLayoutMountCount).toBe(1);

    // Open scanner from Pantry
    await testRouter.push('/escaner');
    expect(screen.getByTestId('screen-scanner')).toBeTruthy();

    let rootRoutes = getRootStackRoutes(result);
    expect(rootRoutes.length).toBe(2);

    // Click "Volver al Inicio"
    await act(async () => {
      fireEvent.press(screen.getByTestId('scanner-go-to-home'));
    });

    expect(screen.getByTestId('screen-home')).toBeTruthy();
    expect(result.getPathname()).toBe('/');

    // Tab navigator was NOT remounted
    expect(tabsLayoutMountCount).toBe(1);
    expect(pantryMountCount).toBe(1);
    expect(homeMountCount).toBe(1);

    // Root stack has strictly ONE (tabs) instance
    rootRoutes = getRootStackRoutes(result);
    expect(rootRoutes.length).toBe(1);
    expect(rootRoutes[0].name).toBe('(tabs)');

    // Recipe data survived
    expect(screen.getByTestId('home-recipe-count').props.children).toBe(
      String(BASE_DEMO_RECIPES.length)
    );
  });

  it('Scenario 3: Open scanner from Pantry and return to Pantry', async () => {
    const result = await renderRouter(routerConfig, { initialUrl: '/despensa' });
    expect(screen.getByTestId('screen-despensa')).toBeTruthy();
    expect(tabsLayoutMountCount).toBe(1);

    // Open scanner from Pantry
    await testRouter.push('/escaner');
    expect(screen.getByTestId('screen-scanner')).toBeTruthy();

    // Click "Ver Mi Despensa"
    await act(async () => {
      fireEvent.press(screen.getByTestId('scanner-go-to-pantry'));
    });

    expect(screen.getByTestId('screen-despensa')).toBeTruthy();
    expect(result.getPathname()).toBe('/despensa');

    // Tab navigator was NOT remounted
    expect(tabsLayoutMountCount).toBe(1);
    expect(pantryMountCount).toBe(1);
    expect(homeMountCount).toBe(0);

    // Root stack has strictly ONE (tabs) instance
    const rootRoutes = getRootStackRoutes(result);
    expect(rootRoutes.length).toBe(1);
    expect(rootRoutes[0].name).toBe('(tabs)');
  });

  it('Scenario 4: Open scanner through a direct deep link without an existing tab navigator', async () => {
    // Initial URL points directly to /escaner (no prior tabs history)
    const result = await renderRouter(routerConfig, { initialUrl: '/escaner' });
    expect(screen.getByTestId('screen-scanner')).toBeTruthy();
    expect(result.getPathname()).toBe('/escaner');

    let rootRoutes = getRootStackRoutes(result);
    // Only escaner is in the stack
    expect(rootRoutes.length).toBe(1);
    expect(rootRoutes[0].name).toBe('escaner');

    // In direct deep link, canDismiss is false, returnToTab falls back safely to replace
    await act(async () => {
      fireEvent.press(screen.getByTestId('scanner-go-to-pantry'));
    });

    expect(screen.getByTestId('screen-despensa')).toBeTruthy();
    expect(result.getPathname()).toBe('/despensa');

    // Now (tabs) is the sole root route
    rootRoutes = getRootStackRoutes(result);
    expect(rootRoutes.length).toBe(1);
    expect(rootRoutes[0].name).toBe('(tabs)');
  });

  it('Scenario 5: Repeat scanner entry and exit several times (no stack growth)', async () => {
    const result = await renderRouter(routerConfig, { initialUrl: '/(tabs)' });
    expect(screen.getByTestId('screen-home')).toBeTruthy();

    for (let cycle = 1; cycle <= 4; cycle++) {
      // 1. Enter scanner
      await testRouter.push('/escaner');
      expect(screen.getByTestId('screen-scanner')).toBeTruthy();
      let routes = getRootStackRoutes(result);
      expect(routes.length).toBe(2);
      expect(routes[1].name).toBe('escaner');

      // 2. Exit scanner to either pantry or home alternately
      const targetBtn =
        cycle % 2 === 0
          ? screen.getByTestId('scanner-go-to-pantry')
          : screen.getByTestId('scanner-go-to-home');

      await act(async () => {
        fireEvent.press(targetBtn);
      });

      // 3. Verify exactly 1 route in root stack after each exit
      routes = getRootStackRoutes(result);
      expect(routes.length).toBe(1);
      expect(routes[0].name).toBe('(tabs)');
    }

    // After 4 cycles, tabs layout was never duplicated
    expect(tabsLayoutMountCount).toBe(1);
  });

  it('Scenario 6: Use Android Back after scanner completion', async () => {
    const result = await renderRouter(routerConfig, { initialUrl: '/(tabs)' });
    expect(screen.getByTestId('screen-home')).toBeTruthy();

    // 1. Enter scanner
    await testRouter.push('/escaner');
    expect(screen.getByTestId('screen-scanner')).toBeTruthy();

    // 2. Complete scanner flow and return to Despensa
    await act(async () => {
      fireEvent.press(screen.getByTestId('scanner-go-to-pantry'));
    });
    expect(screen.getByTestId('screen-despensa')).toBeTruthy();

    // 3. Root stack has exactly ONE (tabs)
    let rootRoutes = getRootStackRoutes(result);
    expect(rootRoutes.length).toBe(1);
    expect(rootRoutes[0].name).toBe('(tabs)');

    // 4. Android hardware back:
    // With default tab back behavior, back navigates to the initial tab (Home), NOT to a duplicate tabs screen or scanner!
    await testRouter.back();
    expect(screen.getByTestId('screen-home')).toBeTruthy();
    expect(result.getPathname()).toBe('/');

    // After returning to initial tab, root stack is still strictly ONE (tabs) and cannot go back further
    rootRoutes = getRootStackRoutes(result);
    expect(rootRoutes.length).toBe(1);
    expect(rootRoutes[0].name).toBe('(tabs)');
    expect(testRouter.canGoBack()).toBe(false);
  });
});
