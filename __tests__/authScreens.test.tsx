/**
 * Suite de pruebas automatizadas para pantallas de autenticación y navegación (Fase 5):
 * - LoginScreen (app/(auth)/login.tsx)
 * - RegisterScreen (app/(auth)/register.tsx)
 * - Logout en PerfilScreen (app/(tabs)/perfil.tsx)
 */

import React from 'react';
import { render, fireEvent, waitFor, act, cleanup } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LoginScreen from '../app/(auth)/login';
import RegisterScreen from '../app/(auth)/register';
import PerfilScreen from '../app/(tabs)/perfil';
import { AuthProvider } from '../src/context/AuthContext';
import { TypographyProvider } from '../src/theme';
import { PantryProvider } from '../src/context/PantryContext';
import { BudgetProvider } from '../src/context/BudgetContext';
import { RecipeProvider } from '../src/context/RecipeContext';
import { MealPlanProvider } from '../src/context/MealPlanContext';
import { AuthSession, AuthUser } from '../src/types/auth';
import type { SupabaseClient } from '@supabase/supabase-js';

// Mocks de Expo Router
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  }),
}));

const MOCK_USER: AuthUser = {
  id: 'usr-screens-test',
  email: 'usuario.test@foodai.app',
  created_at: '2026-10-26T10:00:00Z',
  app_metadata: {},
  user_metadata: { name: 'Usuario Prueba' },
  aud: 'authenticated',
};

const MOCK_SESSION: AuthSession = {
  access_token: 'mock-screens-jwt',
  refresh_token: 'mock-screens-refresh',
  expires_in: 3600,
  token_type: 'bearer',
  user: MOCK_USER,
};

function createMockSupabaseClient(overrides?: {
  signInResult?: { data: { user: AuthUser | null; session: AuthSession | null }; error: any };
  signUpResult?: { data: { user: AuthUser | null; session: AuthSession | null }; error: any };
  signOutResult?: { error: any };
}) {
  return {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signInWithPassword: jest.fn().mockImplementation(() =>
        Promise.resolve(
          overrides?.signInResult ?? {
            data: { user: MOCK_USER, session: MOCK_SESSION },
            error: null,
          }
        )
      ),
      signUp: jest.fn().mockImplementation(() =>
        Promise.resolve(
          overrides?.signUpResult ?? {
            data: { user: MOCK_USER, session: MOCK_SESSION },
            error: null,
          }
        )
      ),
      signOut: jest.fn().mockImplementation(() =>
        Promise.resolve(overrides?.signOutResult ?? { error: null })
      ),
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
    },
  } as unknown as SupabaseClient;
}

const renderWithProviders = async (
  ui: React.ReactElement,
  options?: {
    client?: SupabaseClient;
    initialSession?: AuthSession | null;
  }
) => {
  const client = options?.client ?? createMockSupabaseClient();
  return render(
    <SafeAreaProvider
      initialMetrics={{
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
        frame: { x: 0, y: 0, width: 390, height: 844 },
      }}
    >
      <TypographyProvider usingFallback={true}>
        <AuthProvider initialSession={options?.initialSession ?? null} supabaseClient={client}>
          <PantryProvider>
            <BudgetProvider>
              <RecipeProvider>
                <MealPlanProvider>{ui}</MealPlanProvider>
              </RecipeProvider>
            </BudgetProvider>
          </PantryProvider>
        </AuthProvider>
      </TypographyProvider>
    </SafeAreaProvider>
  );
};

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

afterEach(async () => {
  cleanup();
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('LoginScreen (app/(auth)/login.tsx)', () => {
  it('renderiza correctamente todos los campos y botones según Google Stitch UI', async () => {
    const { getByTestId, getByText, queryByText } = await renderWithProviders(
      <LoginScreen />
    );

    expect(getByText('Iniciar sesión')).toBeTruthy();
    expect(getByTestId('login-email-input')).toBeTruthy();
    expect(getByTestId('login-password-input')).toBeTruthy();
    expect(getByTestId('login-submit-button')).toBeTruthy();
    expect(getByTestId('login-password-toggle')).toBeTruthy();
    expect(getByTestId('login-register-link')).toBeTruthy();
    expect(getByText('Entrar')).toBeTruthy();
    expect(getByText('¿No tienes una cuenta?')).toBeTruthy();
    expect(getByText('Crear cuenta')).toBeTruthy();

    // Verificación estricta del alcance MVP: NO debe haber opciones no soportadas
    expect(queryByText(/olvidaste/i)).toBeNull();
    expect(queryByText(/recuperar/i)).toBeNull();
    expect(queryByText(/google/i)).toBeNull();
    expect(queryByText(/apple/i)).toBeNull();
  });

  it('permite alternar la visibilidad de la contraseña', async () => {
    const { getByTestId } = await renderWithProviders(<LoginScreen />);

    const passwordInput = getByTestId('login-password-input');
    const toggleBtn = getByTestId('login-password-toggle');

    // Inicialmente secureTextEntry es true
    expect(passwordInput.props.secureTextEntry).toBe(true);

    // Al presionar el botón de toggle, secureTextEntry cambia a false
    await act(async () => {
      fireEvent.press(toggleBtn);
    });
    expect(passwordInput.props.secureTextEntry).toBe(false);

    // Al presionar de nuevo, vuelve a secureTextEntry = true
    await act(async () => {
      fireEvent.press(toggleBtn);
    });
    expect(passwordInput.props.secureTextEntry).toBe(true);
  });

  it('valida en cliente formato inválido de correo y deshabilita envío', async () => {
    const mockClient = createMockSupabaseClient();
    const { getByTestId, getByText } = await renderWithProviders(
      <LoginScreen />,
      { client: mockClient }
    );

    const emailInput = getByTestId('login-email-input');

    // Correo inválido
    await act(async () => {
      fireEvent.changeText(emailInput, 'correo-erroneo');
      fireEvent(emailInput, 'blur');
    });

    await waitFor(() => {
      expect(getByText('Ingresa un correo electrónico con formato válido.')).toBeTruthy();
    });
    expect(mockClient.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('inicia sesión exitosamente y navega a /(tabs)', async () => {
    const mockClient = createMockSupabaseClient({
      signInResult: {
        data: { user: MOCK_USER, session: MOCK_SESSION },
        error: null,
      },
    });

    const { getByTestId } = await renderWithProviders(
      <LoginScreen />,
      { client: mockClient }
    );

    await act(async () => {
      fireEvent.changeText(getByTestId('login-email-input'), 'usuario.test@foodai.app');
      fireEvent.changeText(getByTestId('login-password-input'), 'password123');
    });

    await act(async () => {
      fireEvent.press(getByTestId('login-submit-button'));
    });

    await waitFor(() => {
      expect(mockClient.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'usuario.test@foodai.app',
        password: 'password123',
      });
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    });
  });

  it('muestra banner de error cuando Supabase retorna credenciales incorrectas', async () => {
    const mockClient = createMockSupabaseClient({
      signInResult: {
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      },
    });

    const { getByTestId, getByText } = await renderWithProviders(
      <LoginScreen />,
      { client: mockClient }
    );

    await act(async () => {
      fireEvent.changeText(getByTestId('login-email-input'), 'usuario.test@foodai.app');
      fireEvent.changeText(getByTestId('login-password-input'), 'password_mala');
    });

    await act(async () => {
      fireEvent.press(getByTestId('login-submit-button'));
    });

    await waitFor(() => {
      expect(getByTestId('login-error-message')).toBeTruthy();
      expect(getByText('Correo electrónico o contraseña incorrectos.')).toBeTruthy();
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('navega a pantalla de registro al presionar Crear cuenta', async () => {
    const { getByTestId } = await renderWithProviders(<LoginScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('login-register-link'));
    });
    expect(mockPush).toHaveBeenCalledWith('/(auth)/register');
  });
});

describe('RegisterScreen (app/(auth)/register.tsx)', () => {
  it('renderiza correctamente todos los campos según el diseño de Google Stitch', async () => {
    const { getByTestId, getByText, queryByText } = await renderWithProviders(
      <RegisterScreen />
    );

    expect(getByText('Crear cuenta')).toBeTruthy();
    expect(getByTestId('register-email-input')).toBeTruthy();
    expect(getByTestId('register-password-input')).toBeTruthy();
    expect(getByTestId('register-confirm-password-input')).toBeTruthy();
    expect(getByTestId('register-submit-button')).toBeTruthy();
    expect(getByTestId('register-login-link')).toBeTruthy();
    expect(getByText('Registrarme')).toBeTruthy();
    expect(getByText('¿Ya tienes cuenta?')).toBeTruthy();
    expect(getByText('Iniciar sesión')).toBeTruthy();

    expect(queryByText(/google/i)).toBeNull();
    expect(queryByText(/apple/i)).toBeNull();
  });

  it('muestra error cuando las contraseñas no coinciden', async () => {
    const mockClient = createMockSupabaseClient();
    const { getByTestId, getByText } = await renderWithProviders(
      <RegisterScreen />,
      { client: mockClient }
    );

    const confirmInput = getByTestId('register-confirm-password-input');
    await act(async () => {
      fireEvent.changeText(getByTestId('register-email-input'), 'nuevo@foodai.app');
      fireEvent.changeText(getByTestId('register-password-input'), 'password123');
      fireEvent.changeText(confirmInput, 'otraPassword');
      fireEvent(confirmInput, 'blur');
    });

    await waitFor(() => {
      expect(getByText('Las contraseñas no coinciden.')).toBeTruthy();
    });
    expect(mockClient.auth.signUp).not.toHaveBeenCalled();
  });

  it('muestra error cuando la contraseña tiene menos de 6 caracteres', async () => {
    const mockClient = createMockSupabaseClient();
    const { getByTestId, getByText } = await renderWithProviders(
      <RegisterScreen />,
      { client: mockClient }
    );

    const passInput = getByTestId('register-password-input');
    await act(async () => {
      fireEvent.changeText(getByTestId('register-email-input'), 'nuevo@foodai.app');
      fireEvent.changeText(passInput, '12345');
      fireEvent.changeText(getByTestId('register-confirm-password-input'), '12345');
      fireEvent(passInput, 'blur');
    });

    await waitFor(() => {
      expect(getByText('La contraseña debe contener al menos 6 caracteres.')).toBeTruthy();
    });
    expect(mockClient.auth.signUp).not.toHaveBeenCalled();
  });

  it('muestra vista de confirmación de correo pendiente si Supabase no retorna sesión inmediata', async () => {
    const mockClient = createMockSupabaseClient({
      signUpResult: {
        data: { user: MOCK_USER, session: null }, // Confirmación requerida
        error: null,
      },
    });

    const { getByTestId, getByText, queryByTestId } = await renderWithProviders(
      <RegisterScreen />,
      { client: mockClient }
    );

    await act(async () => {
      fireEvent.changeText(getByTestId('register-email-input'), 'porconfirmar@foodai.app');
      fireEvent.changeText(getByTestId('register-password-input'), 'secreto123');
      fireEvent.changeText(getByTestId('register-confirm-password-input'), 'secreto123');
    });

    await act(async () => {
      fireEvent.press(getByTestId('register-submit-button'));
    });

    await waitFor(() => {
      expect(getByTestId('register-confirmation-card')).toBeTruthy();
      expect(getByText('Verifica tu correo electrónico')).toBeTruthy();
      expect(getByText('Ir a iniciar sesión')).toBeTruthy();
    });

    expect(queryByTestId('register-submit-button')).toBeNull();
    expect(mockReplace).not.toHaveBeenCalledWith('/(tabs)');

    await act(async () => {
      fireEvent.press(getByTestId('confirmation-go-login-button'));
    });
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
  });

  it('navega a /(tabs) directamente si el registro provee sesión activa (auto-confirmación)', async () => {
    const mockClient = createMockSupabaseClient({
      signUpResult: {
        data: { user: MOCK_USER, session: MOCK_SESSION },
        error: null,
      },
    });

    const { getByTestId } = await renderWithProviders(
      <RegisterScreen />,
      { client: mockClient }
    );

    await act(async () => {
      fireEvent.changeText(getByTestId('register-email-input'), 'directo@foodai.app');
      fireEvent.changeText(getByTestId('register-password-input'), 'secreto123');
      fireEvent.changeText(getByTestId('register-confirm-password-input'), 'secreto123');
    });

    await act(async () => {
      fireEvent.press(getByTestId('register-submit-button'));
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    });
  });
});

describe('PerfilScreen - Cierre de Sesión (Logout Stitch Screen 13)', () => {
  it('muestra el botón de Cerrar sesión con icono y estilos Stitch', async () => {
    const { getByTestId, getByText } = await renderWithProviders(
      <PerfilScreen />,
      { initialSession: MOCK_SESSION }
    );

    expect(getByTestId('btn-logout')).toBeTruthy();
    expect(getByText('Cerrar sesión')).toBeTruthy();
  });

  it('abre el diálogo modal de confirmación al presionar Cerrar sesión', async () => {
    const { getByTestId, getByText, queryByTestId } = await renderWithProviders(
      <PerfilScreen />,
      { initialSession: MOCK_SESSION }
    );

    // Al inicio el modal no está visible
    expect(queryByTestId('logout-confirm-modal')).toBeNull();

    // Presionar botón de logout
    await act(async () => {
      fireEvent.press(getByTestId('btn-logout'));
    });

    // Modal de confirmación visible
    expect(getByTestId('logout-confirm-modal')).toBeTruthy();
    expect(getByText('¿Deseas cerrar tu sesión actual?')).toBeTruthy();
    expect(getByTestId('logout-cancel-button')).toBeTruthy();
    expect(getByTestId('logout-confirm-button')).toBeTruthy();
  });

  it('cierra el modal sin desautenticar si el usuario presiona Cancelar', async () => {
    const mockClient = createMockSupabaseClient();
    const { getByTestId, queryByTestId } = await renderWithProviders(
      <PerfilScreen />,
      { client: mockClient, initialSession: MOCK_SESSION }
    );

    await act(async () => {
      fireEvent.press(getByTestId('btn-logout'));
    });
    expect(getByTestId('logout-confirm-modal')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId('logout-cancel-button'));
    });
    expect(queryByTestId('logout-confirm-modal')).toBeNull();
    expect(mockClient.auth.signOut).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('ejecuta signOut y redirige a /(auth)/login cuando el usuario confirma', async () => {
    const mockClient = createMockSupabaseClient();
    const { getByTestId } = await renderWithProviders(
      <PerfilScreen />,
      { client: mockClient, initialSession: MOCK_SESSION }
    );

    await act(async () => {
      fireEvent.press(getByTestId('btn-logout'));
    });

    await act(async () => {
      fireEvent.press(getByTestId('logout-confirm-button'));
    });

    await waitFor(() => {
      expect(mockClient.auth.signOut).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
    });
  });
});
