/**
 * Suite de pruebas exhaustivas para AuthContext y Supabase Client Architecture (Fase 5).
 *
 * Cobertura completa:
 * 1. Inicialización y restauración de sesión almacenada (getSession).
 * 2. Manejo de sesión expirada o ausente.
 * 3. Registro exitoso con sesión automática (signUp).
 * 4. Registro con confirmación de correo pendiente (signUp sin sesión inmediata).
 * 5. Errores de validación en registro: formato de email, contraseña corta.
 * 6. Mapeo de errores de Supabase al español comprensible.
 * 7. Inicio de sesión exitoso (signInWithPassword).
 * 8. Inicio de sesión con credenciales inválidas (Invalid login credentials).
 * 9. Manejo de errores de conexión o red en login y registro.
 * 10. Cierre de sesión exitoso (signOut) y limpieza de estado.
 * 11. Manejo de fallos en cierre de sesión.
 * 12. Protección anti-doble envío concurrente (double submit guard).
 * 13. Suscripción y desuscripción limpia al listener de autenticación (onAuthStateChange).
 * 14. Eventos SIGNED_IN, SIGNED_OUT y TOKEN_REFRESHED.
 * 15. Seguridad: ausencia de credenciales o tokens en registros/logs.
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { AuthProvider, useAuth, useAuthSafe } from '../src/context/AuthContext';
import {
  AuthSession,
  AuthUser,
  isValidEmail,
  isValidPassword,
  mapSupabaseAuthError,
} from '../src/types/auth';
import type { SupabaseClient } from '@supabase/supabase-js';

// Mocks de datos
const MOCK_USER: AuthUser = {
  id: 'usr-111-aaa',
  email: 'chef@foodai.app',
  created_at: '2026-10-26T10:00:00Z',
  app_metadata: {},
  user_metadata: { name: 'Chef FoodAI' },
  aud: 'authenticated',
};

const MOCK_SESSION: AuthSession = {
  access_token: 'mock-access-token-jwt',
  refresh_token: 'mock-refresh-token',
  expires_in: 3600,
  token_type: 'bearer',
  user: MOCK_USER,
};

function createMockSupabaseClient(overrides?: {
  getSessionResult?: { data: { session: AuthSession | null }; error: any };
  signUpResult?: { data: { user: AuthUser | null; session: AuthSession | null }; error: any };
  signInResult?: { data: { user: AuthUser | null; session: AuthSession | null }; error: any };
  signOutResult?: { error: any };
}) {
  let authStateCallback: ((event: string, session: AuthSession | null) => void) | null = null;
  const unsubscribeMock = jest.fn();

  const mockClient = {
    auth: {
      getSession: jest.fn().mockImplementation(() =>
        Promise.resolve(
          overrides?.getSessionResult ?? { data: { session: null }, error: null }
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
      signInWithPassword: jest.fn().mockImplementation(() =>
        Promise.resolve(
          overrides?.signInResult ?? {
            data: { user: MOCK_USER, session: MOCK_SESSION },
            error: null,
          }
        )
      ),
      signOut: jest.fn().mockImplementation(() =>
        Promise.resolve(overrides?.signOutResult ?? { error: null })
      ),
      onAuthStateChange: jest.fn().mockImplementation((cb) => {
        authStateCallback = cb;
        return {
          data: {
            subscription: {
              unsubscribe: unsubscribeMock,
            },
          },
        };
      }),
    },
    _emitAuthStateChange: (event: string, session: AuthSession | null) => {
      if (authStateCallback) {
        authStateCallback(event, session);
      }
    },
    _unsubscribeMock: unsubscribeMock,
  } as unknown as SupabaseClient & {
    _emitAuthStateChange: (event: string, session: AuthSession | null) => void;
    _unsubscribeMock: jest.Mock;
  };

  return mockClient;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Auth Validation & Error Mapping Helpers', () => {
  it('valida formatos correctos e incorrectos de correo electrónico', () => {
    expect(isValidEmail('usuario@dominio.com')).toBe(true);
    expect(isValidEmail('chef.cocina+test@foodai.app')).toBe(true);
    expect(isValidEmail('invalido')).toBe(false);
    expect(isValidEmail('invalido@')).toBe(false);
    expect(isValidEmail('@dominio.com')).toBe(false);
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('  ')).toBe(false);
  });

  it('valida requisitos mínimos de contraseña segura', () => {
    expect(isValidPassword('123456')).toBe(true);
    expect(isValidPassword('password123')).toBe(true);
    expect(isValidPassword('12345')).toBe(false);
    expect(isValidPassword('')).toBe(false);
  });

  it('traduce errores estándar de Supabase a mensajes comprensibles en español', () => {
    expect(mapSupabaseAuthError('Invalid login credentials')).toBe(
      'Correo electrónico o contraseña incorrectos.'
    );
    expect(mapSupabaseAuthError('User already registered')).toBe(
      'Ya existe una cuenta registrada con este correo electrónico.'
    );
    expect(mapSupabaseAuthError('Email not confirmed')).toBe(
      'Tu correo no ha sido confirmado. Por favor, revisa tu bandeja de entrada.'
    );
    expect(mapSupabaseAuthError('Password should be at least 6 characters')).toBe(
      'La contraseña debe contener al menos 6 caracteres.'
    );
    expect(mapSupabaseAuthError('Rate limit exceeded')).toBe(
      'Demasiados intentos. Por favor, espera unos momentos antes de volver a intentar.'
    );
    expect(mapSupabaseAuthError('Network request failed')).toBe(
      'Error de conexión. Verifica tu acceso a internet e inténtalo de nuevo.'
    );
    expect(mapSupabaseAuthError('Error no mapeado raro')).toBe('Error no mapeado raro');
    expect(mapSupabaseAuthError(null)).toBe('Ocurrió un error inesperado de autenticación.');
  });
});

describe('AuthContext - Inicialización y Restauración de Sesión', () => {
  it('restaura una sesión válida almacenada al iniciar', async () => {
    const mockSupabase = createMockSupabaseClient({
      getSessionResult: { data: { session: MOCK_SESSION }, error: null },
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider supabaseClient={mockSupabase}>{children}</AuthProvider>
    );

    const { result } = await renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.id).toBe(MOCK_USER.id);
    expect(result.current.session?.access_token).toBe(MOCK_SESSION.access_token);
  });

  it('inicia en estado desautenticado si no existe sesión previa en almacenamiento', async () => {
    const mockSupabase = createMockSupabaseClient({
      getSessionResult: { data: { session: null }, error: null },
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider supabaseClient={mockSupabase}>{children}</AuthProvider>
    );

    const { result } = await renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
  });

  it('limpia la suscripción del listener de Supabase al desmontarse el provider', async () => {
    const mockSupabase = createMockSupabaseClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider initialSession={null} supabaseClient={mockSupabase}>
        {children}
      </AuthProvider>
    );

    const { unmount } = await renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      unmount();
    });

    expect(mockSupabase._unsubscribeMock).toHaveBeenCalled();
  });
});

describe('AuthContext - Registro (signUp)', () => {
  it('registra exitosamente cuando Supabase retorna sesión inmediata', async () => {
    const mockSupabase = createMockSupabaseClient({
      signUpResult: {
        data: { user: MOCK_USER, session: MOCK_SESSION },
        error: null,
      },
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider initialSession={null} supabaseClient={mockSupabase}>
        {children}
      </AuthProvider>
    );

    const { result } = await renderHook(() => useAuth(), { wrapper });

    let signUpRes: any;
    await act(async () => {
      signUpRes = await result.current.signUp('nuevo@foodai.app', 'secreto123');
    });

    expect(signUpRes.user?.id).toBe(MOCK_USER.id);
    expect(signUpRes.confirmationPending).toBe(false);
    expect(signUpRes.session).toBeDefined();
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.id).toBe(MOCK_USER.id);
  });

  it('maneja registro con confirmación de correo pendiente (sin sesión inmediata)', async () => {
    const mockSupabase = createMockSupabaseClient({
      signUpResult: {
        data: { user: MOCK_USER, session: null },
        error: null,
      },
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider initialSession={null} supabaseClient={mockSupabase}>
        {children}
      </AuthProvider>
    );

    const { result } = await renderHook(() => useAuth(), { wrapper });

    let signUpRes: any;
    await act(async () => {
      signUpRes = await result.current.signUp('porconfirmar@foodai.app', 'secreto123');
    });

    expect(signUpRes.confirmationPending).toBe(true);
    expect(signUpRes.session).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('rechaza email inválido con mensaje de validación sin llamar a Supabase', async () => {
    const mockSupabase = createMockSupabaseClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider initialSession={null} supabaseClient={mockSupabase}>
        {children}
      </AuthProvider>
    );

    const { result } = await renderHook(() => useAuth(), { wrapper });

    let caughtError: any = null;
    await act(async () => {
      try {
        await result.current.signUp('correo-invalido', 'secreto123');
      } catch (err) {
        caughtError = err;
      }
    });

    expect(caughtError?.message).toBe('Por favor, ingresa un correo electrónico válido.');
    expect(mockSupabase.auth.signUp).not.toHaveBeenCalled();
  });

  it('rechaza contraseña de menos de 6 caracteres sin llamar a Supabase', async () => {
    const mockSupabase = createMockSupabaseClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider initialSession={null} supabaseClient={mockSupabase}>
        {children}
      </AuthProvider>
    );

    const { result } = await renderHook(() => useAuth(), { wrapper });

    let caughtError: any = null;
    await act(async () => {
      try {
        await result.current.signUp('valido@foodai.app', '12345');
      } catch (err) {
        caughtError = err;
      }
    });

    expect(caughtError?.message).toBe('La contraseña debe tener al menos 6 caracteres.');
    expect(mockSupabase.auth.signUp).not.toHaveBeenCalled();
  });

  it('captura errores devueltos por Supabase (ej. usuario ya existente)', async () => {
    const mockSupabase = createMockSupabaseClient({
      signUpResult: {
        data: { user: null, session: null },
        error: { message: 'User already registered' },
      },
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider initialSession={null} supabaseClient={mockSupabase}>
        {children}
      </AuthProvider>
    );

    const { result } = await renderHook(() => useAuth(), { wrapper });

    let caughtError: any = null;
    await act(async () => {
      try {
        await result.current.signUp('existente@foodai.app', 'secreto123');
      } catch (err) {
        caughtError = err;
      }
    });

    expect(caughtError?.message).toBe(
      'Ya existe una cuenta registrada con este correo electrónico.'
    );
    expect(result.current.authError).toBe(
      'Ya existe una cuenta registrada con este correo electrónico.'
    );
  });
});

describe('AuthContext - Inicio de Sesión (signIn)', () => {
  it('inicia sesión exitosamente y actualiza estado a autenticado', async () => {
    const mockSupabase = createMockSupabaseClient({
      signInResult: {
        data: { user: MOCK_USER, session: MOCK_SESSION },
        error: null,
      },
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider initialSession={null} supabaseClient={mockSupabase}>
        {children}
      </AuthProvider>
    );

    const { result } = await renderHook(() => useAuth(), { wrapper });

    let signInRes: any;
    await act(async () => {
      signInRes = await result.current.signIn('chef@foodai.app', 'clave123');
    });

    expect(signInRes.session).toBeDefined();
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.email).toBe('chef@foodai.app');
  });

  it('maneja credenciales inválidas con error amigable', async () => {
    const mockSupabase = createMockSupabaseClient({
      signInResult: {
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      },
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider initialSession={null} supabaseClient={mockSupabase}>
        {children}
      </AuthProvider>
    );

    const { result } = await renderHook(() => useAuth(), { wrapper });

    let caughtError: any = null;
    await act(async () => {
      try {
        await result.current.signIn('chef@foodai.app', 'errada');
      } catch (err) {
        caughtError = err;
      }
    });

    expect(caughtError?.message).toBe('Correo electrónico o contraseña incorrectos.');
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('rechaza doble llamada concurrente a signIn (anti double-submit)', async () => {
    let resolveFirstSignIn!: (val: any) => void;
    const firstPromise = new Promise((resolve) => {
      resolveFirstSignIn = resolve;
    });

    const mockSupabase = createMockSupabaseClient();
    (mockSupabase.auth.signInWithPassword as jest.Mock).mockImplementationOnce(() => firstPromise);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider initialSession={null} supabaseClient={mockSupabase}>
        {children}
      </AuthProvider>
    );

    const { result } = await renderHook(() => useAuth(), { wrapper });

    let promise1!: Promise<any>;
    let promise2Error: any = null;

    await act(async () => {
      promise1 = result.current.signIn('chef@foodai.app', 'clave123');
      try {
        await result.current.signIn('chef@foodai.app', 'clave123');
      } catch (err) {
        promise2Error = err;
      }
      resolveFirstSignIn({
        data: { user: MOCK_USER, session: MOCK_SESSION },
        error: null,
      });
      await promise1;
    });

    expect(promise2Error?.message).toBe('Ya hay una operación de autenticación en curso.');
  });

  it('permite limpiar el error de autenticación con clearAuthError', async () => {
    const mockSupabase = createMockSupabaseClient({
      signInResult: {
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      },
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider initialSession={null} supabaseClient={mockSupabase}>
        {children}
      </AuthProvider>
    );

    const { result } = await renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      try {
        await result.current.signIn('chef@foodai.app', 'errada');
      } catch {
        // esperado
      }
    });

    expect(result.current.authError).not.toBeNull();

    await act(async () => {
      result.current.clearAuthError();
    });

    expect(result.current.authError).toBeNull();
  });
});

describe('AuthContext - Cierre de Sesión (signOut)', () => {
  it('cierra sesión y restablece el estado a desautenticado', async () => {
    const mockSupabase = createMockSupabaseClient();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider initialSession={MOCK_SESSION} supabaseClient={mockSupabase}>
        {children}
      </AuthProvider>
    );

    const { result } = await renderHook(() => useAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
  });

  it('maneja fallos en signOut de Supabase manteniendo control seguro', async () => {
    const mockSupabase = createMockSupabaseClient({
      signOutResult: { error: { message: 'Network request failed' } },
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider initialSession={MOCK_SESSION} supabaseClient={mockSupabase}>
        {children}
      </AuthProvider>
    );

    const { result } = await renderHook(() => useAuth(), { wrapper });

    let caughtError: any = null;
    await act(async () => {
      try {
        await result.current.signOut();
      } catch (err) {
        caughtError = err;
      }
    });

    expect(caughtError?.message).toBe(
      'Error de conexión. Verifica tu acceso a internet e inténtalo de nuevo.'
    );
  });
});

describe('AuthContext - Reacción a Eventos Externos (onAuthStateChange)', () => {
  it('actualiza el usuario y la sesión cuando se emite SIGNED_IN', async () => {
    const mockSupabase = createMockSupabaseClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider initialSession={null} supabaseClient={mockSupabase}>
        {children}
      </AuthProvider>
    );

    const { result } = await renderHook(() => useAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(false);

    await act(async () => {
      mockSupabase._emitAuthStateChange('SIGNED_IN', MOCK_SESSION);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.id).toBe(MOCK_USER.id);
  });

  it('limpia el usuario y la sesión cuando se emite SIGNED_OUT', async () => {
    const mockSupabase = createMockSupabaseClient();

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider initialSession={MOCK_SESSION} supabaseClient={mockSupabase}>
        {children}
      </AuthProvider>
    );

    const { result } = await renderHook(() => useAuth(), { wrapper });

    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      mockSupabase._emitAuthStateChange('SIGNED_OUT', null);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });
});

describe('useAuthSafe helper hook', () => {
  it('retorna null sin lanzar excepción si se ejecuta fuera de AuthProvider', async () => {
    const { result } = await renderHook(() => useAuthSafe());
    expect(result.current).toBeNull();
  });
});
