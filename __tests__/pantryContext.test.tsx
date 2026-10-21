/**
 * Pruebas unitarias para el contexto y estado reactivo de despensa (Fase 2B).
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { PantryProvider, usePantry } from '../src/context/PantryContext';
import { PantryStorageAdapter } from '../src/services/storage/pantryStorage';
import { CreateIngredientInput, Ingredient, UpdateIngredientInput } from '../src/types/pantry';

class MockPantryAdapter implements PantryStorageAdapter {
  private items: Ingredient[] = [];

  constructor(initial: Ingredient[] = []) {
    this.items = [...initial];
  }

  async getIngredients(): Promise<Ingredient[]> {
    return [...this.items];
  }

  async saveIngredients(ingredients: Ingredient[]): Promise<void> {
    this.items = [...ingredients];
  }

  async addIngredient(input: CreateIngredientInput): Promise<Ingredient> {
    const newItem: Ingredient = {
      id: `mock-${Date.now()}-${Math.random()}`,
      name: input.name,
      quantity: input.quantity,
      unit: input.unit,
      category: input.category,
      expirationDate: input.expirationDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.items.unshift(newItem);
    return newItem;
  }

  async updateIngredient(input: UpdateIngredientInput): Promise<Ingredient> {
    const idx = this.items.findIndex((i) => i.id === input.id);
    if (idx === -1) throw new Error('Not found');
    const updated: Ingredient = {
      ...this.items[idx],
      ...input,
      updatedAt: new Date().toISOString(),
    };
    this.items[idx] = updated;
    return updated;
  }

  async deleteIngredient(id: string): Promise<void> {
    this.items = this.items.filter((i) => i.id !== id);
  }

  async clearIngredients(): Promise<void> {
    this.items = [];
  }
}

describe('PantryContext State Management', () => {
  it('initializes with provided initial ingredients and calculates summary', async () => {
    const initial: Ingredient[] = [
      {
        id: '1',
        name: 'Pollo',
        quantity: 500,
        unit: 'g',
        category: 'Carnes y proteínas',
        expirationDate: '2020-01-01', // vencido -> urgente
        createdAt: '',
        updatedAt: '',
      },
      {
        id: '2',
        name: 'Arroz',
        quantity: 1,
        unit: 'kg',
        category: 'Granos y cereales',
        createdAt: '',
        updatedAt: '',
      },
    ];

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PantryProvider initialIngredients={initial}>{children}</PantryProvider>
    );

    const { result } = await renderHook(() => usePantry(), { wrapper });

    expect(result.current.ingredients).toHaveLength(2);
    expect(result.current.summary.totalCount).toBe(2);
    expect(result.current.summary.urgentCount).toBe(1);
    expect(result.current.summary.urgentIngredients[0].name).toBe('Pollo');
    expect(result.current.summary.availableIngredients[0].name).toBe('Arroz');
    expect(result.current.summary.categoriesBreakdown['Carnes y proteínas']).toBe(1);
    expect(result.current.summary.categoriesBreakdown['Granos y cereales']).toBe(1);
  });

  it('adds an ingredient and updates state and summary reactively', async () => {
    const adapter = new MockPantryAdapter();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PantryProvider storageAdapter={adapter}>{children}</PantryProvider>
    );

    const { result } = await renderHook(() => usePantry(), { wrapper });

    await act(async () => {
      await result.current.addIngredient({
        name: 'Plátano maduro',
        quantity: 3,
        unit: 'unidad',
        category: 'Verduras y frutas',
      });
    });

    expect(result.current.ingredients).toHaveLength(1);
    expect(result.current.ingredients[0].name).toBe('Plátano maduro');
    expect(result.current.summary.totalCount).toBe(1);
  });

  it('updates an ingredient and preserves unedited fields', async () => {
    const initial: Ingredient[] = [
      {
        id: 'test-1',
        name: 'Leche entera',
        quantity: 1,
        unit: 'l',
        category: 'Lácteos',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ];
    const adapter = new MockPantryAdapter(initial);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PantryProvider storageAdapter={adapter} initialIngredients={initial}>
        {children}
      </PantryProvider>
    );

    const { result } = await renderHook(() => usePantry(), { wrapper });

    await act(async () => {
      await result.current.updateIngredient({
        id: 'test-1',
        quantity: 3,
      });
    });

    expect(result.current.ingredients[0].quantity).toBe(3);
    expect(result.current.ingredients[0].name).toBe('Leche entera');
    expect(result.current.ingredients[0].unit).toBe('l');
  });

  it('deletes an ingredient and updates summary', async () => {
    const initial: Ingredient[] = [
      { id: 'del-1', name: 'Huevos', quantity: 6, unit: 'unidad', category: 'Lácteos', createdAt: '', updatedAt: '' },
    ];
    const adapter = new MockPantryAdapter(initial);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PantryProvider storageAdapter={adapter} initialIngredients={initial}>
        {children}
      </PantryProvider>
    );

    const { result } = await renderHook(() => usePantry(), { wrapper });
    expect(result.current.summary.totalCount).toBe(1);

    await act(async () => {
      await result.current.deleteIngredient('del-1');
    });

    expect(result.current.ingredients).toHaveLength(0);
    expect(result.current.summary.totalCount).toBe(0);
  });

  it('adjusts quantity via delta without dropping below zero', async () => {
    const initial: Ingredient[] = [
      { id: 'adj-1', name: 'Tomate', quantity: 2, unit: 'unidad', category: 'Verduras y frutas', createdAt: '', updatedAt: '' },
    ];
    const adapter = new MockPantryAdapter(initial);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PantryProvider storageAdapter={adapter} initialIngredients={initial}>
        {children}
      </PantryProvider>
    );

    const { result } = await renderHook(() => usePantry(), { wrapper });

    // Aumentar en 1
    await act(async () => {
      await result.current.adjustQuantity('adj-1', 1);
    });
    expect(result.current.ingredients[0].quantity).toBe(3);

    // Disminuir en 2
    await act(async () => {
      await result.current.adjustQuantity('adj-1', -2);
    });
    expect(result.current.ingredients[0].quantity).toBe(1);

    // Intentar disminuir más allá de cero (debe ignorarse)
    await act(async () => {
      await result.current.adjustQuantity('adj-1', -2);
    });
    expect(result.current.ingredients[0].quantity).toBe(1);
  });
});
