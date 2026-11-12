/**
 * Pruebas unitarias para BudgetContext y BudgetProvider (Fase 2C).
 * Cubre reactividad, prevención de condiciones de carrera e hidratación obsoleta,
 * rechazo de valores inválidos y manejo explícito de fallos de almacenamiento.
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BudgetProvider, useBudget } from '../src/context/BudgetContext';
import {
  DEFAULT_BUDGET_COP,
  DEFAULT_SERVINGS,
  BudgetPreferences,
  defaultBudgetPreferences,
} from '../src/types/budget';
import { BudgetStorageAdapter } from '../src/services/storage/budgetStorage';

describe('BudgetContext & useBudget (Fase 2C)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await AsyncStorage.clear();
  });

  it('retorna valores por defecto cuando se invoca fuera del BudgetProvider sin lanzar error', async () => {
    const { result } = await renderHook(() => useBudget());
    expect(result.current.budget).toBe(DEFAULT_BUDGET_COP);
    expect(result.current.servings).toBe(DEFAULT_SERVINGS);
    expect(result.current.maxMinutes).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it('provee valores iniciales personalizados en BudgetProvider', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BudgetProvider initialPreferences={{ budget: 30000, servings: 3 }}>
        {children}
      </BudgetProvider>
    );

    const { result } = await renderHook(() => useBudget(), { wrapper });
    expect(result.current.budget).toBe(30000);
    expect(result.current.servings).toBe(3);
  });

  it('actualiza el presupuesto de forma reactiva con setBudget', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BudgetProvider initialPreferences={{ budget: 20000, servings: 2 }}>
        {children}
      </BudgetProvider>
    );

    const { result } = await renderHook(() => useBudget(), { wrapper });

    await act(async () => {
      await result.current.setBudget(45000);
    });

    expect(result.current.budget).toBe(45000);
  });

  it('rechaza presupuestos negativos en setBudget', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BudgetProvider initialPreferences={{ budget: 20000 }}>
        {children}
      </BudgetProvider>
    );

    const { result } = await renderHook(() => useBudget(), { wrapper });

    await expect(
      act(async () => {
        await result.current.setBudget(-500);
      })
    ).rejects.toThrow('El presupuesto no puede ser un valor negativo.');
  });

  it('actualiza el número de comensales con setServings', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BudgetProvider initialPreferences={{ servings: 2 }}>
        {children}
      </BudgetProvider>
    );

    const { result } = await renderHook(() => useBudget(), { wrapper });

    await act(async () => {
      await result.current.setServings(5);
    });

    expect(result.current.servings).toBe(5);
  });

  it('rechaza comensales fuera de rango 1-12 en setServings', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BudgetProvider initialPreferences={{ servings: 2 }}>
        {children}
      </BudgetProvider>
    );

    const { result } = await renderHook(() => useBudget(), { wrapper });

    await expect(
      act(async () => {
        await result.current.setServings(15);
      })
    ).rejects.toThrow('El número de personas debe estar entre 1 y 12.');
  });

  it('actualiza el tiempo máximo de preparación con setMaxMinutes y permite resetearlo', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BudgetProvider initialPreferences={{ maxMinutes: undefined }}>
        {children}
      </BudgetProvider>
    );

    const { result } = await renderHook(() => useBudget(), { wrapper });

    await act(async () => {
      await result.current.setMaxMinutes(45);
    });
    expect(result.current.maxMinutes).toBe(45);

    await act(async () => {
      await result.current.setMaxMinutes(null);
    });
    expect(result.current.maxMinutes).toBeUndefined();
  });

  it('protege contra hidratación obsoleta lenta que finalice después de una mutación del usuario', async () => {
    let resolveSlowHydration: (prefs: BudgetPreferences) => void;
    const slowHydrationPromise = new Promise<BudgetPreferences>((res) => {
      resolveSlowHydration = res;
    });

    const mockAdapter: BudgetStorageAdapter = {
      getPreferences: jest.fn().mockReturnValue(slowHydrationPromise),
      savePreferences: jest.fn().mockImplementation(async (input) => ({
        budget: input.budget ?? 20000,
        servings: input.servings ?? 2,
        updatedAt: new Date().toISOString(),
      })),
      resetPreferences: jest.fn(),
    };

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BudgetProvider storageAdapter={mockAdapter}>{children}</BudgetProvider>
    );

    const { result } = await renderHook(() => useBudget(), { wrapper });

    // El usuario realiza una mutación inmediata antes de que termine la hidratación lenta
    await act(async () => {
      await result.current.setBudget(60000);
    });
    expect(result.current.budget).toBe(60000);

    // Ahora se resuelve la lectura inicial lenta con datos antiguos (ej: 10000)
    resolveSlowHydration!({
      budget: 10000,
      servings: 1,
      updatedAt: new Date(Date.now() - 100000).toISOString(),
    });
    await act(async () => {
      await slowHydrationPromise;
      await new Promise((r) => setTimeout(r, 0));
    });

    // La versión del usuario debe prevalecer y no ser sobreescrita por la lectura obsoleta
    expect(result.current.budget).toBe(60000);
  });

  it('propaga error explícito y registra storageError cuando savePreferences falla', async () => {
    const mockFailingAdapter: BudgetStorageAdapter = {
      getPreferences: jest.fn().mockResolvedValue({
        budget: 20000,
        servings: 2,
        updatedAt: new Date().toISOString(),
      }),
      savePreferences: jest.fn().mockRejectedValue(new Error('Fallo crítico de almacenamiento')),
      resetPreferences: jest.fn(),
    };

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BudgetProvider
        storageAdapter={mockFailingAdapter}
        initialPreferences={{ budget: 20000, servings: 2 }}
      >
        {children}
      </BudgetProvider>
    );

    const { result } = await renderHook(() => useBudget(), { wrapper });

    let caughtError: Error | undefined;
    await act(async () => {
      try {
        await result.current.setBudget(50000);
      } catch (err) {
        caughtError = err as Error;
      }
    });

    expect(caughtError?.message).toBe('Fallo crítico de almacenamiento');
    expect(result.current.storageError).toBe('Fallo crítico de almacenamiento');

    await act(async () => {
      result.current.clearStorageError();
    });
    expect(result.current.storageError).toBeNull();
  });

  it('restablece los valores al estado por defecto con resetBudget', async () => {
    const mockResetAdapter: BudgetStorageAdapter = {
      getPreferences: jest.fn().mockResolvedValue(defaultBudgetPreferences),
      savePreferences: jest.fn(),
      resetPreferences: jest.fn().mockResolvedValue(defaultBudgetPreferences),
    };

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BudgetProvider
        storageAdapter={mockResetAdapter}
        initialPreferences={{ budget: 80000, servings: 6, maxMinutes: 60 }}
      >
        {children}
      </BudgetProvider>
    );

    const { result } = await renderHook(() => useBudget(), { wrapper });
    expect(result.current.budget).toBe(80000);

    await act(async () => {
      await result.current.resetBudget();
    });

    expect(result.current.budget).toBe(DEFAULT_BUDGET_COP);
    expect(result.current.servings).toBe(DEFAULT_SERVINGS);
    expect(result.current.maxMinutes).toBeUndefined();
  });

  describe('updatePreferences atómico (Fase 4 - FIX 1)', () => {
    it('persiste y actualiza múltiples preferencias de forma atómica en una única operación', async () => {
      const mockSaveAdapter: BudgetStorageAdapter = {
        getPreferences: jest.fn().mockResolvedValue(defaultBudgetPreferences),
        savePreferences: jest.fn().mockImplementation(async (patch) => ({
          budget: patch.budget ?? 20000,
          servings: patch.servings ?? 2,
          maxMinutes: patch.resetMaxMinutes ? undefined : patch.maxMinutes,
          updatedAt: new Date().toISOString(),
        })),
        resetPreferences: jest.fn().mockResolvedValue(defaultBudgetPreferences),
      };

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <BudgetProvider
          storageAdapter={mockSaveAdapter}
          initialPreferences={{ budget: 20000, servings: 2, maxMinutes: 30 }}
        >
          {children}
        </BudgetProvider>
      );

      const { result } = await renderHook(() => useBudget(), { wrapper });

      await act(async () => {
        const committed = await result.current.updatePreferences({
          budget: 55000,
          servings: 4,
          maxMinutes: 45,
        });
        expect(committed.budget).toBe(55000);
        expect(committed.servings).toBe(4);
        expect(committed.maxMinutes).toBe(45);
      });

      expect(mockSaveAdapter.savePreferences).toHaveBeenCalledTimes(1);
      expect(mockSaveAdapter.savePreferences).toHaveBeenCalledWith({
        budget: 55000,
        servings: 4,
        maxMinutes: 45,
      });
      expect(result.current.budget).toBe(55000);
      expect(result.current.servings).toBe(4);
      expect(result.current.maxMinutes).toBe(45);
    });

    it('valida todas las entradas antes de persistir y no invoca almacenamiento si hay campos inválidos', async () => {
      const mockSaveAdapter: BudgetStorageAdapter = {
        getPreferences: jest.fn().mockResolvedValue(defaultBudgetPreferences),
        savePreferences: jest.fn(),
        resetPreferences: jest.fn(),
      };

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <BudgetProvider
          storageAdapter={mockSaveAdapter}
          initialPreferences={{ budget: 20000, servings: 2 }}
        >
          {children}
        </BudgetProvider>
      );

      const { result } = await renderHook(() => useBudget(), { wrapper });

      // Presupuesto inválido
      let budgetError: Error | undefined;
      await act(async () => {
        try {
          await result.current.updatePreferences({ budget: -5000, servings: 4 });
        } catch (e) {
          budgetError = e as Error;
        }
      });
      expect(budgetError?.message).toBe('El presupuesto no puede ser un valor negativo.');

      // Porciones inválidas
      let servingsError: Error | undefined;
      await act(async () => {
        try {
          await result.current.updatePreferences({ budget: 30000, servings: 20 });
        } catch (e) {
          servingsError = e as Error;
        }
      });
      expect(servingsError?.message).toBe('El número de personas debe estar entre 1 y 12.');

      // Tiempo inválido
      let timeError: Error | undefined;
      await act(async () => {
        try {
          await result.current.updatePreferences({ maxMinutes: 500 });
        } catch (e) {
          timeError = e as Error;
        }
      });
      expect(timeError?.message).toBe('El tiempo máximo debe estar entre 1 y 240 minutos.');

      expect(mockSaveAdapter.savePreferences).not.toHaveBeenCalled();
    });

    it('permite remover el límite de tiempo opcional con resetMaxMinutes o maxMinutes null', async () => {
      const mockSaveAdapter: BudgetStorageAdapter = {
        getPreferences: jest.fn().mockResolvedValue(defaultBudgetPreferences),
        savePreferences: jest.fn().mockImplementation(async (patch) => ({
          budget: patch.budget ?? 20000,
          servings: patch.servings ?? 2,
          maxMinutes: patch.resetMaxMinutes ? undefined : patch.maxMinutes,
          updatedAt: new Date().toISOString(),
        })),
        resetPreferences: jest.fn(),
      };

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <BudgetProvider
          storageAdapter={mockSaveAdapter}
          initialPreferences={{ budget: 20000, servings: 2, maxMinutes: 60 }}
        >
          {children}
        </BudgetProvider>
      );

      const { result } = await renderHook(() => useBudget(), { wrapper });
      expect(result.current.maxMinutes).toBe(60);

      await act(async () => {
        await result.current.updatePreferences({ maxMinutes: null });
      });

      expect(mockSaveAdapter.savePreferences).toHaveBeenCalledWith({
        resetMaxMinutes: true,
        maxMinutes: null,
      });
      expect(result.current.maxMinutes).toBeUndefined();
    });

    it('no aplica mutaciones parciales ni altera el estado si storageAdapter.savePreferences falla', async () => {
      const failingAdapter: BudgetStorageAdapter = {
        getPreferences: jest.fn().mockResolvedValue(defaultBudgetPreferences),
        savePreferences: jest.fn().mockRejectedValue(new Error('Fallo de almacenamiento')),
        resetPreferences: jest.fn(),
      };

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <BudgetProvider
          storageAdapter={failingAdapter}
          initialPreferences={{ budget: 20000, servings: 2, maxMinutes: 30 }}
        >
          {children}
        </BudgetProvider>
      );

      const { result } = await renderHook(() => useBudget(), { wrapper });

      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.updatePreferences({
            budget: 90000,
            servings: 6,
            maxMinutes: 90,
          });
        } catch (err) {
          thrownError = err as Error;
        }
      });

      expect(thrownError?.message).toBe('Fallo de almacenamiento');
      expect(result.current.storageError).toBe('Fallo de almacenamiento');
      // Estado intacto: ninguna propiedad cambió
      expect(result.current.budget).toBe(20000);
      expect(result.current.servings).toBe(2);
      expect(result.current.maxMinutes).toBe(30);
    });
  });
});
