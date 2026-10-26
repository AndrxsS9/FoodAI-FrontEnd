/**
 * FoodAI — Phase 5 Final Auth Initialization Blocker & Concurrency Regression Tests
 *
 * Cobertura determinista con Deferred Promises (sin supuestos de tiempo):
 * 1. INITIAL_SESSION llega antes de que getSession resuelva.
 * 2. getSession resuelve antes de que llegue INITIAL_SESSION.
 * 3. SIGNED_IN llega mientras getSession está pendiente (stale getSession no sobreescribe al nuevo usuario).
 * 4. SIGNED_OUT llega mientras getSession está pendiente (stale getSession no restaura sesión cerrada).
 * 5. signOut emite SIGNED_OUT antes de que resuelva la promesa de signOut.
 * 6. getSession rechaza (reject) con error de red (inicialización se completa, no se cuelga).
 * 7. getSession retorna error de Supabase (inicialización se completa).
 * 8. Restauración de sesión tras reinicio de la aplicación (app restart).
 * 9. Invariante de seguridad: Rutas privadas nunca accesibles sin autenticación o en fallo.
 *
 * Verificaciones en todos los casos:
 * - isInitializing eventualmente es false (nunca se queda en "Restaurando sesión...").
 * - Se preserva el usuario/sesión correcto.
 * - Los resultados obsoletos se descartan silenciosamente.
 * - Las rutas privadas nunca son accesibles sin autenticación.
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { AuthSession, AuthUser } from '../src/types/auth';
import type { SupabaseClient } from '@supabase/supabase-js';

// Helper de Promesas Diferidas Reales (Deferred Promise)
function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  promise.catch(() => {});
  return { promise, resolve, reject };
}

const USER_A: AuthUser = {
  id: 'usr-init-A',
  email: 'usera@foodai.app',
  created_at: '2026-10-26T12:00:00Z',
  app_metadata: {},
  user_metadata: { name: 'User A' },
  aud: 'authenticated',
};

const SESSION_A: AuthSession = {
  access_token: 'token-A-xyz',
  refresh_token: 'refresh-A-xyz',
  expires_in: 3600,
  token_type: 'bearer',
  user: USER_A,
};

const USER_B: AuthUser = {
  id: 'usr-init-B',
  email: 'userb@foodai.app',
  created_at: '2026-10-26T12:00:00Z',
  app_metadata: {},
  user_metadata: { name: 'User B' },
  aud: 'authenticated',
};

const SESSION_B: AuthSession = {
  access_token: 'token-B-xyz',
  refresh_token: 'refresh-B-xyz',
  expires_in: 3600,
  token_type: 'bearer',
  user: USER_B,
};

describe('FoodAI Phase 5 — Auth Initialization Race Protection Tests', () => {
  let authListenerCallback: (event: string, session: AuthSession | null) => void;
  let unsubscribeMock: jest.Mock;

  beforeEach(() => {
    unsubscribeMock = jest.fn();
    authListenerCallback = () => {};
  });

  function createMockSupabase(getSessionPromise: Promise<any>, signOutPromise?: Promise<any>) {
    return {
      auth: {
        onAuthStateChange: jest.fn((callback) => {
          authListenerCallback = callback;
          return { data: { subscription: { unsubscribe: unsubscribeMock } } };
        }),
        getSession: jest.fn(() => getSessionPromise),
        signOut: jest.fn(() => signOutPromise ?? Promise.resolve({ error: null })),
        signInWithPassword: jest.fn(),
        signUp: jest.fn(),
      },
    } as unknown as SupabaseClient;
  }

  // 1. INITIAL_SESSION arrives before getSession resolves
  it('completes initialization when INITIAL_SESSION arrives before getSession resolves', async () => {
    const getSessionDeferred = createDeferred<{ data: { session: AuthSession | null }; error: null }>();
    const mockSupabase = createMockSupabase(getSessionDeferred.promise);

    const { result } = await renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <AuthProvider supabaseClient={mockSupabase}>{children}</AuthProvider>
      ),
    });

    // En el montaje inicial, isInitializing es true
    expect(result.current.isInitializing).toBe(true);

    // Supabase emite INITIAL_SESSION antes de que getSession resuelva
    await act(async () => {
      authListenerCallback('INITIAL_SESSION', SESSION_A);
    });

    // Inicialización completada de inmediato con INITIAL_SESSION
    expect(result.current.isInitializing).toBe(false);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.id).toBe(USER_A.id);

    // Ahora resuelve getSession tardío
    await act(async () => {
      getSessionDeferred.resolve({ data: { session: SESSION_A }, error: null });
      await getSessionDeferred.promise;
    });

    expect(result.current.isInitializing).toBe(false);
    expect(result.current.user?.id).toBe(USER_A.id);
  });

  // 2. getSession resolves before INITIAL_SESSION
  it('completes initialization when getSession resolves before INITIAL_SESSION', async () => {
    const getSessionDeferred = createDeferred<{ data: { session: AuthSession | null }; error: null }>();
    const mockSupabase = createMockSupabase(getSessionDeferred.promise);

    const { result } = await renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <AuthProvider supabaseClient={mockSupabase}>{children}</AuthProvider>
      ),
    });
    expect(result.current.isInitializing).toBe(true);

    // getSession resuelve primero
    await act(async () => {
      getSessionDeferred.resolve({ data: { session: SESSION_A }, error: null });
      await getSessionDeferred.promise;
    });

    expect(result.current.isInitializing).toBe(false);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.id).toBe(USER_A.id);

    // Luego llega INITIAL_SESSION
    await act(async () => {
      authListenerCallback('INITIAL_SESSION', SESSION_A);
    });

    expect(result.current.isInitializing).toBe(false);
    expect(result.current.user?.id).toBe(USER_A.id);
  });

  // 3. SIGNED_IN arrives while getSession is pending (stale getSession ignored)
  it('does not allow stale getSession to overwrite a newer SIGNED_IN event', async () => {
    const getSessionDeferred = createDeferred<{ data: { session: AuthSession | null }; error: null }>();
    const mockSupabase = createMockSupabase(getSessionDeferred.promise);

    const { result } = await renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <AuthProvider supabaseClient={mockSupabase}>{children}</AuthProvider>
      ),
    });
    expect(result.current.isInitializing).toBe(true);

    // Usuario inicia sesión con Usuario B mientras getSession sigue pendiente
    await act(async () => {
      authListenerCallback('SIGNED_IN', SESSION_B);
    });

    expect(result.current.isInitializing).toBe(false);
    expect(result.current.user?.id).toBe(USER_B.id);

    // getSession finalmente resuelve con la sesión vieja del Usuario A
    await act(async () => {
      getSessionDeferred.resolve({ data: { session: SESSION_A }, error: null });
      await getSessionDeferred.promise;
    });

    // La sesión tardía del Usuario A NO debe sobreescribir al Usuario B
    expect(result.current.isInitializing).toBe(false);
    expect(result.current.user?.id).toBe(USER_B.id);
    expect(result.current.user?.email).toBe(USER_B.email);
  });

  // 4. SIGNED_OUT arrives while getSession is pending (stale getSession ignored)
  it('does not allow stale getSession to restore a logged-out session after SIGNED_OUT', async () => {
    const getSessionDeferred = createDeferred<{ data: { session: AuthSession | null }; error: null }>();
    const mockSupabase = createMockSupabase(getSessionDeferred.promise);

    const { result } = await renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <AuthProvider supabaseClient={mockSupabase}>{children}</AuthProvider>
      ),
    });
    expect(result.current.isInitializing).toBe(true);

    // SIGNED_OUT ocurre mientras getSession está pendiente
    await act(async () => {
      authListenerCallback('SIGNED_OUT', null);
    });

    expect(result.current.isInitializing).toBe(false);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();

    // getSession resuelve tarde intentando restaurar al Usuario A
    await act(async () => {
      getSessionDeferred.resolve({ data: { session: SESSION_A }, error: null });
      await getSessionDeferred.promise;
    });

    // El resultado obsoleto no debe restaurar la sesión cerrada
    expect(result.current.isInitializing).toBe(false);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  // 5. signOut emits SIGNED_OUT before the signOut promise resolves
  it('correctly logs out when signOut emits SIGNED_OUT before promise resolves', async () => {
    const signOutDeferred = createDeferred<{ error: null }>();
    const getSessionDeferred = createDeferred<{ data: { session: AuthSession | null }; error: null }>();
    const mockSupabase = createMockSupabase(getSessionDeferred.promise, signOutDeferred.promise);

    const { result } = await renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <AuthProvider supabaseClient={mockSupabase} initialSession={SESSION_A}>
          {children}
        </AuthProvider>
      ),
    });
    expect(result.current.isAuthenticated).toBe(true);

    // Iniciar signOut y emitir SIGNED_OUT mientras la llamada de red está en curso
    await act(async () => {
      const p = result.current.signOut();
      authListenerCallback('SIGNED_OUT', null);
      signOutDeferred.resolve({ error: null });
      await p;
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
    expect(result.current.isInitializing).toBe(false);
    expect(result.current.isSubmitting).toBe(false);
  });

  it('correctly logs out when INITIAL_SESSION with stale user arrives during signOut network call', async () => {
    const signOutDeferred = createDeferred<{ error: null }>();
    const getSessionDeferred = createDeferred<{ data: { session: AuthSession | null }; error: null }>();
    const mockSupabase = createMockSupabase(getSessionDeferred.promise, signOutDeferred.promise);

    const { result } = await renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <AuthProvider supabaseClient={mockSupabase} initialSession={SESSION_A}>
          {children}
        </AuthProvider>
      ),
    });
    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      const p = result.current.signOut();
      // INITIAL_SESSION tardío intenta revivir al Usuario A mientras signOut está en curso
      authListenerCallback('INITIAL_SESSION', SESSION_A);
      signOutDeferred.resolve({ error: null });
      await p;
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
    expect(result.current.isInitializing).toBe(false);
  });

  // 6. getSession rejects with a network error
  it('completes initialization when getSession rejects with a network error', async () => {
    const getSessionDeferred = createDeferred<any>();
    const mockSupabase = createMockSupabase(getSessionDeferred.promise);

    const { result } = await renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <AuthProvider supabaseClient={mockSupabase}>{children}</AuthProvider>
      ),
    });
    expect(result.current.isInitializing).toBe(true);

    await act(async () => {
      getSessionDeferred.reject(new Error('Network failure connecting to Supabase'));
      await getSessionDeferred.promise.catch(() => {});
    });

    // Inicialización debe completarse, no quedarse en true para siempre
    expect(result.current.isInitializing).toBe(false);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  // 7. getSession returns a Supabase auth error
  it('completes initialization when getSession returns a Supabase auth error', async () => {
    const getSessionDeferred = createDeferred<any>();
    const mockSupabase = createMockSupabase(getSessionDeferred.promise);

    const { result } = await renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <AuthProvider supabaseClient={mockSupabase}>{children}</AuthProvider>
      ),
    });
    expect(result.current.isInitializing).toBe(true);

    await act(async () => {
      getSessionDeferred.resolve({
        data: { session: null },
        error: { message: 'Invalid refresh token' },
      });
      await getSessionDeferred.promise;
    });

    expect(result.current.isInitializing).toBe(false);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  // 8. Session restoration succeeds after app restart
  it('restores authenticated session successfully after app restart', async () => {
    const getSessionDeferred = createDeferred<{ data: { session: AuthSession | null }; error: null }>();
    const mockSupabase = createMockSupabase(getSessionDeferred.promise);

    const { result } = await renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <AuthProvider supabaseClient={mockSupabase}>{children}</AuthProvider>
      ),
    });

    // Inicialmente restaurando
    expect(result.current.isInitializing).toBe(true);
    expect(result.current.isAuthenticated).toBe(false);

    // Sesión se restaura de almacenamiento asíncrono
    await act(async () => {
      getSessionDeferred.resolve({ data: { session: SESSION_A }, error: null });
      await getSessionDeferred.promise;
    });

    // Sesión restaurada con éxito
    expect(result.current.isInitializing).toBe(false);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.id).toBe(USER_A.id);
    expect(result.current.user?.email).toBe(USER_A.email);
  });

  // 9. Invariante de seguridad: Rutas privadas nunca accesibles sin autenticación o en fallo
  it('never marks state as authenticated when initialization resolves with null session', async () => {
    const getSessionDeferred = createDeferred<{ data: { session: AuthSession | null }; error: null }>();
    const mockSupabase = createMockSupabase(getSessionDeferred.promise);

    const { result } = await renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <AuthProvider supabaseClient={mockSupabase}>{children}</AuthProvider>
      ),
    });

    // Durante la inicialización
    expect(result.current.isInitializing).toBe(true);
    expect(result.current.isAuthenticated).toBe(false);

    // getSession devuelve session: null (usuario anónimo)
    await act(async () => {
      getSessionDeferred.resolve({ data: { session: null }, error: null });
      await getSessionDeferred.promise;
    });

    // Concluye inicialización: usuario es anónimo, nunca autenticado
    expect(result.current.isInitializing).toBe(false);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });
});
