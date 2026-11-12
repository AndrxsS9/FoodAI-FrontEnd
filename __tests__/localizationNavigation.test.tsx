/**
 * Fase 28C-A — Navegación real (expo-router): las pestañas cambian de idioma de forma reactiva
 * sin reiniciar la navegación ni remontar los proveedores de sesión.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, cleanup, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';
import TabsLayout from '../app/(tabs)/_layout';
import HomeScreen from '../app/(tabs)/index';
import DespensaScreen from '../app/(tabs)/despensa';
import RecetasScreen from '../app/(tabs)/recetas';
import PlanScreen from '../app/(tabs)/plan';
import { BudgetProvider } from '../src/context/BudgetContext';
import { MealPlanProvider } from '../src/context/MealPlanContext';
import { PantryProvider } from '../src/context/PantryContext';
import { RecipeProvider } from '../src/context/RecipeContext';
import { LocaleProvider, useLocale } from '../src/context/LocaleContext';
import { Ingredient } from '../src/types/pantry';

jest.setTimeout(30000);

const PANTRY: Ingredient[] = [
  { id: 'p1', name: 'Pollo', quantity: 500, unit: 'g', category: 'Carnes y proteínas', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' },
];

const pantryStore = {
  getIngredients: async () => PANTRY.map((i) => ({ ...i })),
  saveIngredients: async () => {},
  addIngredient: async (i: any) => i,
  updateIngredient: async (i: any) => i,
  deleteIngredient: async () => {},
  clearIngredients: async () => {},
} as any;

const budgetStore = {
  getPreferences: async () => ({ budget: 20000, servings: 2, maxMinutes: 30, updatedAt: '2026-11-01T00:00:00.000Z' }),
  savePreferences: async (n: any) => n,
  updatePreferences: async (n: any) => n,
  resetPreferences: async () => ({ budget: 20000, servings: 2, maxMinutes: 30, updatedAt: '2026-11-01T00:00:00.000Z' }),
} as any;

let providerMounts = 0;
function MountProbe() {
  React.useEffect(() => {
    providerMounts += 1;
  }, []);
  return null;
}

let control: ReturnType<typeof useLocale> | null = null;
function LocaleControl() {
  control = useLocale();
  return null;
}

const Perfil = () => <Text testID="s-perfil">perfil</Text>;

async function renderApp() {
  const RootLayout = () => (
    <LocaleProvider initialLocale="es">
      <LocaleControl />
      <PantryProvider storageAdapter={pantryStore} userId="usr-i18n">
        <BudgetProvider storageAdapter={budgetStore} userId="usr-i18n">
          <RecipeProvider userId="usr-i18n">
            <MealPlanProvider>
              <MountProbe />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
              </Stack>
            </MealPlanProvider>
          </RecipeProvider>
        </BudgetProvider>
      </PantryProvider>
    </LocaleProvider>
  );
  await renderRouter(
    {
      _layout: RootLayout,
      '(tabs)/_layout': TabsLayout,
      '(tabs)/index': HomeScreen,
      '(tabs)/despensa': DespensaScreen,
      '(tabs)/recetas': RecetasScreen,
      '(tabs)/plan': PlanScreen,
      '(tabs)/perfil': Perfil,
    },
    { initialUrl: '/' }
  );
}

beforeEach(async () => {
  await AsyncStorage.clear();
  providerMounts = 0;
  control = null;
});

afterEach(async () => {
  await cleanup();
});

describe('Fase 28C-A · Pestañas y navegación', () => {
  it('las pestañas cambian de idioma sin reiniciar la navegación ni remontar proveedores', async () => {
    await renderApp();
    for (const label of ['Pestaña Inicio', 'Pestaña Despensa', 'Pestaña Recetas', 'Pestaña Plan', 'Pestaña Perfil']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }

    await fireEvent.press(screen.getByLabelText('Pestaña Despensa'));
    await waitFor(() => expect(screen.getByText('Pollo')).toBeTruthy());
    expect(screen).toHavePathname('/despensa');
    const mountsBefore = providerMounts;

    await act(async () => {
      await control!.setLocale('en');
    });

    for (const label of ['Home tab', 'Pantry tab', 'Recipes tab', 'Plan tab', 'Profile tab']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(screen.queryByLabelText('Pestaña Despensa')).toBeNull();
    // Misma ruta y mismo contenido: sin reinicio de navegación
    expect(screen).toHavePathname('/despensa');
    // Fase 28C-B3.4: el alimento conocido «Pollo» se MUESTRA en inglés (solo presentación)
    expect(screen.getByText('Chicken')).toBeTruthy();
    expect(screen.getByText('Meat & protein')).toBeTruthy();
    // Los proveedores de sesión no se remontaron
    expect(providerMounts).toBe(mountsBefore);

    // La navegación sigue funcionando en el nuevo idioma
    await fireEvent.press(screen.getByLabelText('Profile tab'));
    await waitFor(() => expect(screen.getByTestId('s-perfil')).toBeTruthy());
    expect(screen).toHavePathname('/perfil');
  });
});
