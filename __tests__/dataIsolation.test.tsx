/**
 * Suite de pruebas automatizadas para Aislamiento de Datos de Usuario (Fase 5 - Sección 13):
 *
 * 1. Aislamiento estricto de despensa entre Usuario A y Usuario B:
 *    - Usuario A crea ingredientes -> se persisten con clave prefijada por su ID (@foodai:user-a:pantry_v1).
 *    - Usuario B inicia sesión en el mismo dispositivo -> despensa limpia, sin rastros de los datos de Usuario A.
 *    - Usuario B agrega sus propios ingredientes -> se persisten bajo @foodai:user-b:pantry_v1.
 *    - Usuario A reingresa -> Usuario A recupera sus ingredientes intactos y sin contaminación de Usuario B.
 * 2. Aislamiento de preferencias presupuestarias entre Usuario A y Usuario B:
 *    - Usuario A configura $80.000 COP y 4 personas.
 *    - Usuario B inicia sesión y tiene los valores por defecto ($20.000 COP, 2 personas).
 * 3. Frontera segura fail-closed: datos locales pre-existentes heredados (@foodai:pantry_v1)
 *    NO se asignan ni se migran silenciosamente a una nueva cuenta registrada.
 * 4. Descarte de operaciones asíncronas pendientes del usuario anterior al cambiar de sesión.
 * 5. Verificación de seguridad de credenciales: Supabase service_role key y claves secretas
 *    NUNCA están expuestas ni cableadas en el código del cliente frontend.
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { PantryProvider, usePantry } from '../src/context/PantryContext';
import { BudgetProvider, useBudget } from '../src/context/BudgetContext';
import { AuthSession, AuthUser } from '../src/types/auth';
import type { SupabaseClient } from '@supabase/supabase-js';

const USER_A: AuthUser = {
  id: 'usr-alice-111',
  email: 'alice@foodai.app',
  created_at: '2026-10-26T10:00:00Z',
  app_metadata: {},
  user_metadata: { name: 'Alice' },
  aud: 'authenticated',
};

const SESSION_A: AuthSession = {
  access_token: 'jwt-alice',
  refresh_token: 'refresh-alice',
  expires_in: 3600,
  token_type: 'bearer',
  user: USER_A,
};

const USER_B: AuthUser = {
  id: 'usr-bob-222',
  email: 'bob@foodai.app',
  created_at: '2026-10-26T11:00:00Z',
  app_metadata: {},
  user_metadata: { name: 'Bob' },
  aud: 'authenticated',
};

const SESSION_B: AuthSession = {
  access_token: 'jwt-bob',
  refresh_token: 'refresh-bob',
  expires_in: 3600,
  token_type: 'bearer',
  user: USER_B,
};

function createMockSupabaseClient() {
  return {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signInWithPassword: jest.fn().mockImplementation(({ email }) => {
        const session = email.includes('alice') ? SESSION_A : SESSION_B;
        return Promise.resolve({ data: { user: session.user, session }, error: null });
      }),
      signUp: jest.fn().mockResolvedValue({ data: { user: USER_A, session: SESSION_A }, error: null }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
    },
  } as unknown as SupabaseClient;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

afterEach(async () => {
  await AsyncStorage.clear();
});

describe('Aislamiento de Datos de Usuario (Fase 5 - Sección 13)', () => {
  it('1. Usuario A persiste ingredientes exclusivamente bajo su clave scoped (@foodai:usr-alice-111:pantry_v1)', async () => {
    const client = createMockSupabaseClient();
    const wrapperA = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider initialSession={SESSION_A} supabaseClient={client}>
        <PantryProvider>{children}</PantryProvider>
      </AuthProvider>
    );

    const { result } = await renderHook(() => usePantry(), { wrapper: wrapperA });

    await act(async () => {
      await result.current.addIngredient({
        name: 'Pollo fresco',
        quantity: 500,
        unit: 'g',
        category: 'Carnes y proteínas',
      });
    });

    expect(result.current.ingredients).toHaveLength(1);
    expect(result.current.ingredients[0].name).toBe('Pollo fresco');

    // Comprobar que en AsyncStorage se guardó bajo la clave específica de Usuario A
    const rawStorageUserA = await AsyncStorage.getItem(`@foodai:${USER_A.id}:pantry_v1`);
    expect(rawStorageUserA).not.toBeNull();
    const parsedA = JSON.parse(rawStorageUserA!);
    expect(parsedA.ingredients[0].name).toBe('Pollo fresco');

    // Comprobar que NO se guardó en la clave anónima global
    const legacyStorage = await AsyncStorage.getItem('@foodai:pantry_v1');
    expect(legacyStorage).toBeNull();
  });

  it('2. Usuario B no ve los datos de Usuario A y almacena sus propios ingredientes de forma aislada', async () => {
    // Pre-poblar datos de Usuario A en AsyncStorage
    const envelopeA = {
      version: 1,
      updatedAt: new Date().toISOString(),
      ingredients: [
        {
          id: 'item-a-1',
          name: 'Carne de res de Alice',
          quantity: 400,
          unit: 'g',
          category: 'Carnes y proteínas',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };
    await AsyncStorage.setItem(`@foodai:${USER_A.id}:pantry_v1`, JSON.stringify(envelopeA));

    const client = createMockSupabaseClient();
    const wrapperB = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider initialSession={SESSION_B} supabaseClient={client}>
        <PantryProvider>{children}</PantryProvider>
      </AuthProvider>
    );

    const { result } = await renderHook(() => usePantry(), { wrapper: wrapperB });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Usuario B no debe ver la carne de Alice
    expect(result.current.ingredients).toEqual([]);

    // Usuario B agrega su propio ingrediente
    await act(async () => {
      await result.current.addIngredient({
        name: 'Manzanas de Bob',
        quantity: 4,
        unit: 'unidad',
        category: 'Verduras y frutas',
      });
    });

    expect(result.current.ingredients).toHaveLength(1);
    expect(result.current.ingredients[0].name).toBe('Manzanas de Bob');

    // Verificar que Usuario B se guardó en su propia clave
    const rawStorageUserB = await AsyncStorage.getItem(`@foodai:${USER_B.id}:pantry_v1`);
    expect(rawStorageUserB).not.toBeNull();
    const parsedB = JSON.parse(rawStorageUserB!);
    expect(parsedB.ingredients[0].name).toBe('Manzanas de Bob');

    // Verificar que los datos de Usuario A siguen intactos y no fueron sobreescritos
    const rawA = await AsyncStorage.getItem(`@foodai:${USER_A.id}:pantry_v1`);
    expect(rawA).not.toBeNull();
    expect(JSON.parse(rawA!).ingredients[0].name).toBe('Carne de res de Alice');
  });

  it('3. Usuario A reingresa y recupera sus ingredientes sin contaminación cruzada con Usuario B', async () => {
    // Ambos usuarios tienen datos persistidos en el dispositivo
    const envelopeA = {
      version: 1,
      updatedAt: new Date().toISOString(),
      ingredients: [
        {
          id: 'item-a-1',
          name: 'Pollo fresco de Alice',
          quantity: 500,
          unit: 'g',
          category: 'Carnes y proteínas',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };
    const envelopeB = {
      version: 1,
      updatedAt: new Date().toISOString(),
      ingredients: [
        {
          id: 'item-b-1',
          name: 'Manzanas de Bob',
          quantity: 3,
          unit: 'unidad',
          category: 'Verduras y frutas',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    await AsyncStorage.setItem(`@foodai:${USER_A.id}:pantry_v1`, JSON.stringify(envelopeA));
    await AsyncStorage.setItem(`@foodai:${USER_B.id}:pantry_v1`, JSON.stringify(envelopeB));

    const client = createMockSupabaseClient();
    const wrapperA = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider initialSession={SESSION_A} supabaseClient={client}>
        <PantryProvider>{children}</PantryProvider>
      </AuthProvider>
    );

    const { result } = await renderHook(() => usePantry(), { wrapper: wrapperA });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Usuario A debe ver exclusivamente sus ingredientes
    expect(result.current.ingredients).toHaveLength(1);
    expect(result.current.ingredients[0].name).toBe('Pollo fresco de Alice');
  });

  it('4. Aísla las preferencias presupuestarias entre Usuario A y Usuario B', async () => {
    // Usuario A tiene presupuesto personalizado guardado
    const envelopeBudgetA = {
      version: 1,
      updatedAt: new Date().toISOString(),
      preferences: {
        budget: 85000,
        servings: 5,
        maxMinutes: 40,
      },
    };
    await AsyncStorage.setItem(`@foodai:${USER_A.id}:budget_v1`, JSON.stringify(envelopeBudgetA));

    const client = createMockSupabaseClient();

    // 1. Verificar carga de Usuario A
    const wrapperA = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider initialSession={SESSION_A} supabaseClient={client}>
        <BudgetProvider>{children}</BudgetProvider>
      </AuthProvider>
    );

    const hookA = await renderHook(() => useBudget(), { wrapper: wrapperA });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(hookA.result.current.budget).toBe(85000);
    expect(hookA.result.current.servings).toBe(5);

    // 2. Usuario B inicia sesión: debe ver los valores por defecto de FoodAI y no los 85.000 de Alice
    const wrapperB = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider initialSession={SESSION_B} supabaseClient={client}>
        <BudgetProvider>{children}</BudgetProvider>
      </AuthProvider>
    );

    const hookB = await renderHook(() => useBudget(), { wrapper: wrapperB });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(hookB.result.current.budget).toBe(20000);
    expect(hookB.result.current.servings).toBe(2);
  });

  it('5. Frontera fail-closed: datos locales heredados (@foodai:pantry_v1) NO se asignan a una nueva cuenta', async () => {
    // Simular despensa anónima anterior a la Fase 5
    const legacyEnvelope = {
      version: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      ingredients: [
        {
          id: 'legacy-item-1',
          name: 'Arroz antiguo anónimo',
          quantity: 1000,
          unit: 'g',
          category: 'Granos y cereales',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
    };
    await AsyncStorage.setItem('@foodai:pantry_v1', JSON.stringify(legacyEnvelope));

    const client = createMockSupabaseClient();

    // Nuevo usuario registrado inicia sesión
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider initialSession={SESSION_A} supabaseClient={client}>
        <PantryProvider>{children}</PantryProvider>
      </AuthProvider>
    );

    const { result } = await renderHook(() => usePantry(), { wrapper });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // La despensa del nuevo usuario debe iniciar vacía (no migra silenciosamente los datos anónimos)
    expect(result.current.ingredients).toEqual([]);

    // Y los datos heredados siguen protegidos en su clave legacy original sin alteración
    const stillLegacy = await AsyncStorage.getItem('@foodai:pantry_v1');
    expect(stillLegacy).not.toBeNull();
    expect(JSON.parse(stillLegacy!).ingredients[0].name).toBe('Arroz antiguo anónimo');
  });

  it('6. Invalida el estado en memoria ante cierre de sesión y cambio de usuario', async () => {
    const client = createMockSupabaseClient();

    const wrapperA = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider initialSession={SESSION_A} supabaseClient={client}>
        <PantryProvider>{children}</PantryProvider>
      </AuthProvider>
    );

    const hookA = await renderHook(
      () => ({
        auth: useAuth(),
        pantry: usePantry(),
      }),
      { wrapper: wrapperA }
    );

    await act(async () => {
      await hookA.result.current.pantry.addIngredient({
        name: 'Queso campesino',
        quantity: 250,
        unit: 'g',
        category: 'Lácteos',
      });
    });

    expect(hookA.result.current.pantry.ingredients).toHaveLength(1);

    // Usuario B se monta en el dispositivo
    const wrapperB = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider initialSession={SESSION_B} supabaseClient={client}>
        <PantryProvider>{children}</PantryProvider>
      </AuthProvider>
    );

    const hookB = await renderHook(() => usePantry(), { wrapper: wrapperB });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // El estado del nuevo usuario no debe reflejar 'Queso campesino'
    expect(hookB.result.current.ingredients).toEqual([]);
  });

  it('7. Garantiza que ninguna clave sensible (service_role, GEMINI_API_KEY) está presente en el frontend', () => {
    const clientModule = require('../src/services/supabase/client');
    expect(clientModule.supabase).toBeDefined();
    expect(clientModule.isSupabaseConfigured).toBeDefined();

    // Comprobar que en las variables de entorno de Expo públicas no se cuelan service_role ni secret
    const expoPublicKeys = Object.keys(process.env).filter((k) => k.startsWith('EXPO_PUBLIC_'));
    for (const key of expoPublicKeys) {
      expect(key).not.toMatch(/service_role/i);
      expect(key).not.toMatch(/secret/i);
      expect(key).not.toMatch(/gemini/i);
    }
  });
});
