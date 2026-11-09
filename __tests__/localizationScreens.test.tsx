/**
 * Fase 28C-A — Pantallas localizadas (español / inglés).
 *
 * Verifica que las pantallas principales se muestran en el idioma activo, que el cambio de
 * idioma es reactivo, que las etiquetas de accesibilidad se traducen y que los valores
 * canónicos (categorías, unidades) que se guardan nunca se traducen.
 */
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import type { SupabaseClient } from '@supabase/supabase-js';

import WelcomeScreen from '../app/index';
import LoginScreen from '../app/(auth)/login';
import RegisterScreen from '../app/(auth)/register';
import HomeScreen from '../app/(tabs)/index';
import DespensaScreen from '../app/(tabs)/despensa';
import PerfilScreen from '../app/(tabs)/perfil';
import PlanScreen from '../app/(tabs)/plan';
import RecipeDiscoveryScreen from '../app/(tabs)/recetas';
import RecipeDetailScreen from '../app/recetas/[id]';
import GuidedCookingScreen from '../app/recetas/[id]/cocinar';
import ScannerScreen from '../app/escaner/index';
import { ProfileSettingsGroup } from '../src/components/profile/ProfileSettingsGroup';
import { LocaleProvider, useLocale } from '../src/context/LocaleContext';
import { ThemeProvider, useAppTheme } from '../src/context/ThemeContext';
import { AuthProvider } from '../src/context/AuthContext';
import { PantryProvider } from '../src/context/PantryContext';
import { BudgetProvider } from '../src/context/BudgetContext';
import { RecipeProvider } from '../src/context/RecipeContext';
import { MealPlanProvider } from '../src/context/MealPlanContext';
import { TypographyProvider } from '../src/theme';
import {
  AsyncStorageLocaleStorageAdapter,
  LOCALE_STORAGE_KEY,
  Locale,
  LocaleStorageAdapter,
  LocaleStorageError,
} from '../src/services/storage/localeStorage';
import { PantryStorageAdapter } from '../src/services/storage/pantryStorage';
import { scannerApi } from '../src/services/api/scannerApi';
import { AuthSession, AuthUser } from '../src/types/auth';
import { CreateIngredientInput, Ingredient, UpdateIngredientInput } from '../src/types/pantry';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockSearchParams: { id?: string } = { id: 'demo-rec-1' };

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

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

class RecordingPantryAdapter implements PantryStorageAdapter {
  items: Ingredient[];
  added: CreateIngredientInput[] = [];
  constructor(initial: Ingredient[] = []) {
    this.items = initial.map((i) => ({ ...i }));
  }
  async getIngredients() {
    return this.items.map((i) => ({ ...i }));
  }
  async saveIngredients(next: Ingredient[]) {
    this.items = next.map((i) => ({ ...i }));
  }
  async addIngredient(input: CreateIngredientInput): Promise<Ingredient> {
    this.added.push({ ...input });
    const item: Ingredient = {
      ...input,
      id: `rec-${this.added.length}`,
      createdAt: '2026-11-09T00:00:00.000Z',
      updatedAt: '2026-11-09T00:00:00.000Z',
    };
    this.items.unshift(item);
    return item;
  }
  async updateIngredient(input: UpdateIngredientInput): Promise<Ingredient> {
    const idx = this.items.findIndex((i) => i.id === input.id);
    const updated = { ...this.items[idx], ...input, expirationDate: input.expirationDate ?? undefined } as Ingredient;
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

const PANTRY: Ingredient[] = [
  {
    id: 'p-leche',
    name: 'Leche entera',
    quantity: 2,
    unit: 'l',
    category: 'Lácteos',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 'p-huevos',
    name: 'Huevos',
    quantity: 6,
    unit: 'unidad',
    category: 'Carnes y proteínas',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
];

class MemoryLocaleAdapter implements LocaleStorageAdapter {
  stored: Locale | null = null;
  failSaves = false;
  async getLocale() {
    return this.stored;
  }
  async saveLocale(locale: Locale) {
    if (this.failSaves) throw new LocaleStorageError('save_failed', 'No se pudo guardar.');
    this.stored = locale;
  }
  async clearLocale() {
    this.stored = null;
  }
}

let localeControl: ReturnType<typeof useLocale> | null = null;
function LocaleControl() {
  localeControl = useLocale();
  return null;
}

const METRICS = {
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};

interface RenderOptions {
  locale?: Locale;
  localeAdapter?: LocaleStorageAdapter;
  pantry?: Ingredient[];
  pantryAdapter?: PantryStorageAdapter;
  demoRecipes?: boolean;
}

async function renderApp(ui: React.ReactElement, options: RenderOptions = {}) {
  const pantry = options.pantry ?? PANTRY;
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <TypographyProvider usingFallback>
        <LocaleProvider
          initialLocale={options.localeAdapter ? undefined : options.locale ?? 'es'}
          storageAdapter={options.localeAdapter ?? new MemoryLocaleAdapter()}
        >
          <ThemeProvider initialMode="light">
            <PantryProvider initialIngredients={pantry} storageAdapter={options.pantryAdapter}>
              <BudgetProvider initialPreferences={{ budget: 20000, servings: 2 }}>
                <RecipeProvider initialIsDemoMode={options.demoRecipes ?? true}>
                  <MealPlanProvider>
                    <LocaleControl />
                    {ui}
                  </MealPlanProvider>
                </RecipeProvider>
              </BudgetProvider>
            </PantryProvider>
          </ThemeProvider>
        </LocaleProvider>
      </TypographyProvider>
    </SafeAreaProvider>
  );
}

const switchLocale = async (next: Locale) => {
  await act(async () => {
    await localeControl!.setLocale(next).catch(() => {});
  });
};

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  localeControl = null;
  mockSearchParams = { id: 'demo-rec-1' };
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// 1. Selector de idioma
// ---------------------------------------------------------------------------

describe('Fase 28C-A · Selector de idioma (ProfileSettingsGroup)', () => {
  const renderSelector = (adapter: LocaleStorageAdapter = new MemoryLocaleAdapter()) =>
    render(
      <TypographyProvider usingFallback>
        <LocaleProvider storageAdapter={adapter}>
          <ThemeProvider initialMode="system">
            <LocaleControl />
            <ProfileSettingsGroup />
          </ThemeProvider>
        </LocaleProvider>
      </TypographyProvider>
    );

  it('muestra español por defecto con estados accesibles y conserva el selector de apariencia', async () => {
    const screen = await renderSelector();
    await waitFor(() => expect(screen.getByText('Idioma')).toBeTruthy());
    expect(screen.getByText('Idioma actual: Español')).toBeTruthy();
    const es = screen.getByTestId('language-option-es');
    const en = screen.getByTestId('language-option-en');
    expect(es.props.accessibilityRole).toBe('radio');
    expect(es.props.accessibilityLabel).toBe('Español, seleccionado');
    expect(es.props.accessibilityState).toMatchObject({ selected: true });
    expect(en.props.accessibilityLabel).toBe('English, no seleccionado');
    expect(en.props.accessibilityState).toMatchObject({ selected: false });
    expect(screen.getByTestId('theme-selector-group')).toBeTruthy();
    expect(screen.getByText('Apariencia visual')).toBeTruthy();
    expect(screen.queryByTestId('language-ai-notice')).toBeNull();
  });

  it('al elegir English la interfaz cambia de inmediato, se anuncia y se persiste', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    const screen = await renderSelector(new AsyncStorageLocaleStorageAdapter());
    await waitFor(() => expect(screen.getByText('Idioma')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('language-option-en'));

    await waitFor(() => expect(screen.getByText('Language')).toBeTruthy());
    expect(screen.getByText('Current language: English')).toBeTruthy();
    expect(screen.getByText('Appearance')).toBeTruthy();
    expect(screen.getByText('Light')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByTestId('language-option-en').props.accessibilityLabel).toBe('English, selected');
    expect(screen.getByTestId('language-option-es').props.accessibilityLabel).toBe('Español, not selected');
    expect(screen.getByTestId('appearance-option-light').props.accessibilityLabel).toBe('Light, not selected');
    expect(screen.getByTestId('language-ai-notice')).toBeTruthy();
    expect(announce).toHaveBeenCalledWith('Language changed to English');
    expect(JSON.parse((await AsyncStorage.getItem(LOCALE_STORAGE_KEY))!).locale).toBe('en');
    announce.mockRestore();
  });

  it('un fallo de persistencia muestra un aviso honesto y no anuncia éxito', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    const adapter = new MemoryLocaleAdapter();
    adapter.failSaves = true;
    const screen = await renderSelector(adapter);
    await waitFor(() => expect(screen.getByText('Idioma')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('language-option-en'));

    await waitFor(() => expect(screen.getByTestId('language-save-error-banner')).toBeTruthy());
    expect(
      screen.getByText(
        'The language was applied, but it could not be saved on this device. The previous language will be used after restarting the app.'
      )
    ).toBeTruthy();
    expect(screen.getByTestId('language-save-error-banner').props.accessibilityRole).toBe('alert');
    expect(announce).not.toHaveBeenCalled();
    expect(adapter.stored).toBeNull();

    await fireEvent.press(screen.getByTestId('language-error-dismiss'));
    expect(screen.queryByTestId('language-save-error-banner')).toBeNull();
    announce.mockRestore();
  });

  it('el selector de apariencia sigue funcionando en inglés', async () => {
    let theme: ReturnType<typeof useAppTheme> | null = null;
    function ThemeSpy() {
      theme = useAppTheme();
      return null;
    }
    const screen = await render(
      <TypographyProvider usingFallback>
        <LocaleProvider initialLocale="en">
          <ThemeProvider initialMode="system">
            <ThemeSpy />
            <ProfileSettingsGroup />
          </ThemeProvider>
        </LocaleProvider>
      </TypographyProvider>
    );
    await fireEvent.press(screen.getByTestId('appearance-option-dark'));
    await waitFor(() => expect(theme!.themeMode).toBe('dark'));
    expect(screen.getByTestId('appearance-option-dark').props.accessibilityLabel).toBe('Dark, selected');
  });
});

// ---------------------------------------------------------------------------
// 2. Bienvenida y autenticación
// ---------------------------------------------------------------------------

const MOCK_USER: AuthUser = {
  id: 'usr-i18n',
  email: 'i18n@foodai.app',
  created_at: '2026-10-26T10:00:00Z',
  app_metadata: {},
  user_metadata: { name: 'Ana Prueba' },
  aud: 'authenticated',
  email_confirmed_at: '2026-10-26T10:00:00Z',
} as AuthUser;

const MOCK_SESSION: AuthSession = {
  access_token: 'jwt',
  refresh_token: 'refresh',
  expires_in: 3600,
  token_type: 'bearer',
  user: MOCK_USER,
};

function mockSupabase(signInError?: { message: string }) {
  return {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signInWithPassword: jest.fn().mockResolvedValue(
        signInError
          ? { data: { user: null, session: null }, error: signInError }
          : { data: { user: MOCK_USER, session: MOCK_SESSION }, error: null }
      ),
      signUp: jest.fn().mockResolvedValue({ data: { user: MOCK_USER, session: MOCK_SESSION }, error: null }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
      updateUser: jest.fn(),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
  } as unknown as SupabaseClient;
}

async function renderAuth(ui: React.ReactElement, client: SupabaseClient, locale: Locale, session: AuthSession | null = null) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <TypographyProvider usingFallback>
        <LocaleProvider initialLocale={locale} storageAdapter={new MemoryLocaleAdapter()}>
          <AuthProvider initialSession={session} supabaseClient={client}>
            <PantryProvider initialIngredients={PANTRY}>
              <BudgetProvider initialPreferences={{ budget: 20000, servings: 2 }}>
                <RecipeProvider>
                  <MealPlanProvider>
                    <LocaleControl />
                    {ui}
                  </MealPlanProvider>
                </RecipeProvider>
              </BudgetProvider>
            </PantryProvider>
          </AuthProvider>
        </LocaleProvider>
      </TypographyProvider>
    </SafeAreaProvider>
  );
}

describe('Fase 28C-A · Bienvenida y autenticación', () => {
  it('la bienvenida se muestra en inglés con etiquetas accesibles traducidas', async () => {
    const screen = await renderApp(<WelcomeScreen />, { locale: 'en' });
    expect(screen.getByText('Use what you already have.')).toBeTruthy();
    expect(screen.getByText('SMART HOME')).toBeTruthy();
    expect(screen.getByLabelText('Skip introduction')).toBeTruthy();
    expect(screen.getByTestId('welcome-start-button').props.accessibilityLabel).toBe('Get started with FoodAI');
  });

  it('el inicio de sesión se muestra en inglés y traduce errores de Supabase', async () => {
    const client = mockSupabase({ message: 'Invalid login credentials' });
    const screen = await renderAuth(<LoginScreen />, client, 'en');
    expect(screen.getByText('Email')).toBeTruthy();
    expect(screen.getByPlaceholderText('example@email.com')).toBeTruthy();
    expect(screen.getByTestId('login-password-toggle').props.accessibilityLabel).toBe('Show password');

    await fireEvent.changeText(screen.getByTestId('login-email-input'), 'ana@foodai.app');
    await fireEvent.changeText(screen.getByTestId('login-password-input'), 'secreta1');
    await fireEvent.press(screen.getByTestId('login-submit-button'));

    await waitFor(() => expect(screen.getByTestId('login-error-message')).toBeTruthy());
    expect(screen.getByText('Incorrect email or password.')).toBeTruthy();
  });

  it('un error visible cambia de idioma al instante sin repetir la operación', async () => {
    const client = mockSupabase({ message: 'Invalid login credentials' });
    const screen = await renderAuth(<LoginScreen />, client, 'es');
    await fireEvent.changeText(screen.getByTestId('login-email-input'), 'ana@foodai.app');
    await fireEvent.changeText(screen.getByTestId('login-password-input'), 'secreta1');
    await fireEvent.press(screen.getByTestId('login-submit-button'));
    await waitFor(() => expect(screen.getByText('Correo electrónico o contraseña incorrectos.')).toBeTruthy());

    await switchLocale('en');
    expect(screen.getByText('Incorrect email or password.')).toBeTruthy();
    expect(client.auth.signInWithPassword).toHaveBeenCalledTimes(1);
  });

  it('el registro valida en inglés', async () => {
    const screen = await renderAuth(<RegisterScreen />, mockSupabase(), 'en');
    expect(screen.getByText('Create account')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('register-email-input'), 'ana@foodai.app');
    await fireEvent.changeText(screen.getByTestId('register-password-input'), 'secreta1');
    await fireEvent.changeText(screen.getByTestId('register-confirm-password-input'), 'otra-clave');
    await fireEvent(screen.getByTestId('register-confirm-password-input'), 'blur');
    await waitFor(() => expect(screen.getByText('The passwords do not match.')).toBeTruthy());
  });

  it('cambiar de idioma en Perfil no cierra la sesión ni pierde la identidad del usuario', async () => {
    const client = mockSupabase();
    const screen = await renderAuth(<PerfilScreen />, client, 'es', MOCK_SESSION);
    await waitFor(() => expect(screen.getByTestId('profile-display-name')).toBeTruthy());
    expect(screen.getByText('Mi perfil y configuración')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('language-option-en'));

    await waitFor(() => expect(screen.getByText('My profile and settings')).toBeTruthy());
    expect(screen.getByTestId('profile-display-name').props.children).toBe('Ana Prueba');
    expect(screen.getByTestId('profile-email').props.children).toBe('i18n@foodai.app');
    expect(screen.getByText('Verified')).toBeTruthy();
    expect(screen.getByText('Sign out')).toBeTruthy();
    expect(client.auth.signOut).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. Despensa: categorías/unidades traducidas y valores canónicos intactos
// ---------------------------------------------------------------------------

describe('Fase 28C-A · Despensa', () => {
  it('muestra categorías y unidades traducidas sin alterar los registros', async () => {
    const adapter = new RecordingPantryAdapter(PANTRY);
    const screen = await renderApp(<DespensaScreen />, { locale: 'en', pantryAdapter: adapter });
    await waitFor(() => expect(screen.getByText('Leche entera')).toBeTruthy());
    expect(screen.getByText('Pantry')).toBeTruthy();
    expect(screen.getByText('Dairy')).toBeTruthy();
    expect(screen.getByText('Meat & protein')).toBeTruthy();
    expect(screen.getByTestId('quantity-display-p-huevos').props.children).toBe('6 pc');
    expect(screen.getByTestId('ingredient-card-p-leche').props.accessibilityLabel).toBe(
      'Food: Leche entera, quantity: 2 l, category: Dairy, status: Available'
    );
    // Los nombres escritos por el usuario no se traducen y los datos no cambian
    expect(screen.queryByText('Whole milk')).toBeNull();
    expect(adapter.items.find((i) => i.id === 'p-leche')!.category).toBe('Lácteos');
  });

  it('la búsqueda acepta la etiqueta visible de la categoría', async () => {
    const screen = await renderApp(<DespensaScreen />, { locale: 'en' });
    await fireEvent.changeText(screen.getByPlaceholderText('Search my pantry...'), 'dairy');
    await waitFor(() => expect(screen.queryByText('Huevos')).toBeNull());
    expect(screen.getByText('Leche entera')).toBeTruthy();
  });

  it('guardar desde el formulario en inglés envía la categoría y unidad canónicas', async () => {
    const adapter = new RecordingPantryAdapter([]);
    const screen = await renderApp(<DespensaScreen />, { locale: 'en', pantry: [], pantryAdapter: adapter });
    await fireEvent.press(screen.getByTestId('empty-state-add-button'));
    await waitFor(() => expect(screen.getByText('Add food')).toBeTruthy());

    // Validación en inglés
    await fireEvent.press(screen.getByTestId('submit-ingredient-form'));
    await waitFor(() => expect(screen.getByText('The food name is required.')).toBeTruthy());

    await fireEvent.changeText(screen.getByTestId('ingredient-name-input'), 'Queso campesino');
    await fireEvent.changeText(screen.getByTestId('ingredient-quantity-input'), '250');
    await fireEvent.press(screen.getByTestId('unit-option-g'));
    await fireEvent.press(screen.getByTestId('category-option-Lácteos'));
    expect(screen.getByTestId('category-option-Lácteos').props.accessibilityLabel).toBe('Category: Dairy');
    await fireEvent.press(screen.getByTestId('submit-ingredient-form'));

    await waitFor(() => expect(adapter.added).toHaveLength(1));
    expect(adapter.added[0]).toMatchObject({ name: 'Queso campesino', quantity: 250, unit: 'g', category: 'Lácteos' });
  });

  it('las advertencias semánticas (Fase 28A) se muestran en inglés y siguen exigiendo confirmación', async () => {
    const adapter = new RecordingPantryAdapter([]);
    const screen = await renderApp(<DespensaScreen />, { locale: 'en', pantry: [], pantryAdapter: adapter });
    await fireEvent.press(screen.getByTestId('empty-state-add-button'));
    await fireEvent.changeText(screen.getByTestId('ingredient-name-input'), 'Leche');
    await fireEvent.press(screen.getByTestId('unit-option-kg'));
    await fireEvent.changeText(screen.getByTestId('ingredient-quantity-input'), '2');
    await fireEvent.press(screen.getByTestId('submit-ingredient-form'));

    await waitFor(() => expect(screen.getByTestId('semantic-warning-liquid_measured_by_mass')).toBeTruthy());
    expect(screen.getByTestId('semantic-warning-liquid_measured_by_mass').props.children).toMatch(
      /^“Leche” looks like a liquid and you are measuring it in kilograms \(kg\)/
    );
    expect(adapter.added).toHaveLength(0);
    expect(screen.getByText('Save anyway')).toBeTruthy();
  });

  it('la fecha de caducidad y el calendario se muestran en inglés', async () => {
    const screen = await renderApp(<DespensaScreen />, { locale: 'en', pantry: [] });
    await fireEvent.press(screen.getByTestId('empty-state-add-button'));
    expect(screen.getByText('Expiration date')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('quick-exp-3d'));
    await waitFor(() => expect(screen.getByText('Expires in 3 days')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('ingredient-expiration-trigger'));
    expect(screen.getByLabelText('Previous month')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 4. Escáner
// ---------------------------------------------------------------------------

describe('Fase 28C-A · Escáner', () => {
  beforeEach(() => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///photo.jpg', mimeType: 'image/jpeg', fileName: 'photo.jpg', width: 1200, height: 900, fileSize: 1024 * 1024 },
      ],
    });
  });

  it('captura, revisión y guardado en inglés con valores canónicos', async () => {
    (scannerApi.analyzeIngredientsImage as jest.Mock).mockResolvedValueOnce([
      { name: 'Tomate', quantity: 3, unit: 'unidad', needsReview: false },
    ]);
    const adapter = new RecordingPantryAdapter([]);
    const screen = await renderApp(<ScannerScreen />, { locale: 'en', pantry: [], pantryAdapter: adapter });

    expect(screen.getByText('Smart Scanner')).toBeTruthy();
    expect(screen.getByText('Tips for the best detection')).toBeTruthy();
    expect(screen.getByLabelText('Back')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('scanner-gallery-button'));
    await waitFor(() => expect(screen.getByText('Photo ready to analyze')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('scanner-analyze-button'));
    await waitFor(() => expect(screen.getByTestId('scanner-review-state')).toBeTruthy());

    expect(screen.getByText('1 food detected')).toBeTruthy();
    expect(screen.getByText('Save 1 food to my pantry')).toBeTruthy();
    expect(screen.getByText('Fruits & vegetables')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('scanner-confirm-save-button'));
    await waitFor(() => expect(screen.getByText('Food saved successfully!')).toBeTruthy());
    expect(adapter.added[0]).toMatchObject({ name: 'Tomate', unit: 'unidad', category: 'Verduras y frutas' });
  });

  it('los errores de la API se traducen por código y conservan el diagnóstico', async () => {
    const { ScannerApiError } = jest.requireActual('../src/services/api/scannerApi');
    (scannerApi.analyzeIngredientsImage as jest.Mock).mockRejectedValueOnce(
      new ScannerApiError('Mensaje interno del servidor', 'GEMINI_TIMEOUT', 504)
    );
    const screen = await renderApp(<ScannerScreen />, { locale: 'en' });
    await fireEvent.press(screen.getByTestId('scanner-gallery-button'));
    await waitFor(() => expect(screen.getByTestId('scanner-preview-state')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('scanner-analyze-button'));

    await waitFor(() => expect(screen.getByTestId('scanner-error-state')).toBeTruthy());
    expect(screen.getByText('The AI analysis service took too long to respond. Please try again.')).toBeTruthy();
    expect(screen.queryByText('Mensaje interno del servidor')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Recetas, detalle y modo cocina
// ---------------------------------------------------------------------------

describe('Fase 28C-A · Recetas y modo cocina', () => {
  it('el listado de recetas muestra la interfaz en inglés y COP con formato inglés', async () => {
    const screen = await renderApp(<RecipeDiscoveryScreen />, { locale: 'en' });
    expect(screen.getByText('Recommendations')).toBeTruthy();
    expect(screen.getByText('AVAILABLE BUDGET')).toBeTruthy();
    expect(screen.getByText('$20,000 COP')).toBeTruthy();
    expect(screen.getByText('Demo data')).toBeTruthy();
    expect(screen.getByLabelText('Search recipes')).toBeTruthy();
  });

  it('el detalle de receta usa textos de interfaz en inglés y conserva el contenido de la receta', async () => {
    const screen = await renderApp(<RecipeDetailScreen />, { locale: 'en' });
    expect(screen.getByText('Recipe details')).toBeTruthy();
    expect(screen.getByText('Already at home')).toBeTruthy();
    expect(screen.getByText('You need to buy')).toBeTruthy();
    expect(screen.getByTestId('recipe-start-cooking-button').props.accessibilityLabel).toBe(
      'Start guided step-by-step Cooking Mode'
    );
    // El nombre de la receta (contenido) no se traduce automáticamente
    const title = screen.getByTestId('recipe-detail-title').props.children;
    expect(typeof title).toBe('string');
  });

  it('el modo cocina navega con etiquetas en inglés', async () => {
    const screen = await renderApp(<GuidedCookingScreen />, { locale: 'en' });
    expect(screen.getByText('Cooking Mode')).toBeTruthy();
    expect(screen.getByTestId('cooking-step-counter').props.children).toMatch(/^Step 1 of \d+$/);
    expect(screen.getByLabelText('Next step')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('cooking-next-step-button'));
    await waitFor(() => expect(screen.getByTestId('cooking-step-counter').props.children).toMatch(/^Step 2 of/));
  });

  it('el modo cocina cambia de idioma sin perder el paso actual', async () => {
    const screen = await renderApp(<GuidedCookingScreen />, { locale: 'es' });
    await fireEvent.press(screen.getByTestId('cooking-next-step-button'));
    await waitFor(() => expect(screen.getByTestId('cooking-step-counter').props.children).toMatch(/^Paso 2 de/));
    await switchLocale('en');
    expect(screen.getByTestId('cooking-step-counter').props.children).toMatch(/^Step 2 of/);
  });
});

// ---------------------------------------------------------------------------
// 6. Plan de comidas e Inicio
// ---------------------------------------------------------------------------

describe('Fase 28C-A · Plan e Inicio', () => {
  it('el plan muestra resumen e introducción en inglés', async () => {
    const screen = await renderApp(<PlanScreen />, { locale: 'en' });
    await waitFor(() => expect(screen.getByText('Plan your meals for the next 3 days')).toBeTruthy());
    expect(screen.getByText('My meal plan')).toBeTruthy();
    expect(screen.getByTestId('plan-summary-value-budget').props.children).toBe('$20,000 COP');
    expect(screen.getByTestId('plan-summary-value-servings').props.children).toBe('2 people');
    expect(screen.getByText('Generate my 3-day plan')).toBeTruthy();
  });

  it('el plan con despensa vacía se muestra en inglés', async () => {
    const screen = await renderApp(<PlanScreen />, { locale: 'en', pantry: [] });
    await waitFor(() => expect(screen.getByText('Add food to your pantry before generating your plan.')).toBeTruthy());
  });

  it('Inicio muestra la interfaz y el presupuesto en inglés', async () => {
    const screen = await renderApp(<HomeScreen />, { locale: 'en' });
    expect(screen.getByText('What can we cook today?')).toBeTruthy();
    expect(screen.getByTestId('home-pantry-total-count').props.children.join('')).toBe('2 products');
    expect(screen.getByLabelText('Available budget: 20,000 Colombian pesos')).toBeTruthy();
    expect(screen.getByTestId('home-scan-button').props.accessibilityLabel).toBe('Take a photo of your food');
  });

  it('Inicio en español conserva exactamente los textos previos', async () => {
    const screen = await renderApp(<HomeScreen />, { locale: 'es' });
    expect(screen.getByText('¿Qué podemos preparar hoy?')).toBeTruthy();
    expect(screen.getByTestId('home-pantry-total-count').props.children.join('')).toBe('2 productos');
    expect(screen.getByLabelText('Presupuesto disponible: 20.000 pesos colombianos')).toBeTruthy();
  });
});
