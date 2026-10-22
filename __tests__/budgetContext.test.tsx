/**
 * Pruebas unitarias para BudgetContext y BudgetProvider (Fase 2C).
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BudgetProvider, useBudget } from '../src/context/BudgetContext';
import { DEFAULT_BUDGET_COP, DEFAULT_SERVINGS } from '../src/types/budget';

describe('BudgetContext & useBudget (Fase 2C)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
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

  it('actualiza el tiempo máximo de preparación con setMaxMinutes', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BudgetProvider initialPreferences={{ maxMinutes: undefined }}>
        {children}
      </BudgetProvider>
    );

    const { result } = await renderHook(() => useBudget(), { wrapper });

    await act(async () => {
      await result.current.setMaxMinutes(30);
    });

    expect(result.current.maxMinutes).toBe(30);
  });

  it('restablece las preferencias al estado por defecto con resetBudget', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BudgetProvider initialPreferences={{ budget: 50000, servings: 6 }}>
        {children}
      </BudgetProvider>
    );

    const { result } = await renderHook(() => useBudget(), { wrapper });

    await act(async () => {
      await result.current.resetBudget();
    });

    expect(result.current.budget).toBe(DEFAULT_BUDGET_COP);
    expect(result.current.servings).toBe(DEFAULT_SERVINGS);
  });
});
