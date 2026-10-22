/**
 * Pruebas unitarias para el contexto y estado reactivo de despensa (Fase 2B).
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { PantryProvider, usePantry } from '../src/context/PantryContext';
import { AsyncStoragePantryAdapter, PantryStorageAdapter } from '../src/services/storage/pantryStorage';
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
    const existing = this.items[idx];
    const resolvedExp =
      input.expirationDate === null
        ? undefined
        : input.expirationDate !== undefined
          ? input.expirationDate
          : existing.expirationDate;

    const updated: Ingredient = {
      ...existing,
      ...input,
      expirationDate: resolvedExp,
      updatedAt: new Date().toISOString(),
    };
    this.items[idx] = updated;
    return updated;
  }

  async deleteIngredient(id: string): Promise<void> {
    this.items = this.items.filter((i) => i.id !== id);
  }

  async adjustQuantity(id: string, delta: number): Promise<Ingredient> {
    const idx = this.items.findIndex((i) => i.id === id);
    if (idx === -1) throw new Error('Not found');
    const existing = this.items[idx];
    const newQty = Math.round((existing.quantity + delta) * 100) / 100;
    const updated: Ingredient = {
      ...existing,
      quantity: newQty > 0 ? newQty : existing.quantity,
      updatedAt: new Date().toISOString(),
    };
    this.items[idx] = updated;
    return updated;
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

  // --- CORRECCIÓN 5: RAPID QUANTITY UPDATES & RECOVERY (Escenario D) ---
  it('updates quantity several times consecutively and preserves exact final value (Escenario D)', async () => {
    const initial: Ingredient[] = [
      { id: 'rapid-1', name: 'Huevos', quantity: 6, unit: 'unidad', category: 'Lácteos', createdAt: '', updatedAt: '' },
    ];
    const adapter = new MockPantryAdapter(initial);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PantryProvider storageAdapter={adapter} initialIngredients={initial}>
        {children}
      </PantryProvider>
    );

    const { result } = await renderHook(() => usePantry(), { wrapper });

    await act(async () => {
      await result.current.adjustQuantity('rapid-1', 1);
      await result.current.adjustQuantity('rapid-1', 1);
      await result.current.adjustQuantity('rapid-1', 2);
    });

    expect(result.current.ingredients[0].quantity).toBe(10);
  });

  it('recalculates expiration urgency reactively when removing an expiration date (Escenario B & E)', async () => {
    const initial: Ingredient[] = [
      {
        id: 'urg-1',
        name: 'Carne fresca',
        quantity: 500,
        unit: 'g',
        category: 'Carnes y proteínas',
        expirationDate: '2020-01-01', // Vencido -> Urgente
        createdAt: '',
        updatedAt: '',
      },
    ];
    const adapter = new MockPantryAdapter(initial);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PantryProvider storageAdapter={adapter} initialIngredients={initial}>
        {children}
      </PantryProvider>
    );

    const { result } = await renderHook(() => usePantry(), { wrapper });

    expect(result.current.summary.urgentCount).toBe(1);

    // Editar y remover fecha de vencimiento (null)
    await act(async () => {
      await result.current.updateIngredient({
        id: 'urg-1',
        expirationDate: null,
      });
    });

    expect(result.current.ingredients[0].expirationDate).toBeUndefined();
    expect(result.current.summary.urgentCount).toBe(0);
    expect(result.current.summary.availableIngredients).toHaveLength(1);
  });

  it('prevents older delayed reads from overwriting newer successful mutations in React state (Concern 3)', async () => {
    let resolveGetIngredients!: (val: Ingredient[]) => void;
    const delayedGetPromise = new Promise<Ingredient[]>((res) => {
      resolveGetIngredients = res;
    });

    const mockAdapter: PantryStorageAdapter = {
      getIngredients: jest.fn().mockReturnValueOnce(delayedGetPromise),
      saveIngredients: jest.fn().mockResolvedValue(undefined),
      addIngredient: jest.fn().mockImplementation(async (input: CreateIngredientInput) => ({
        id: 'new-1',
        name: input.name,
        quantity: input.quantity,
        unit: input.unit,
        category: input.category,
        createdAt: '',
        updatedAt: '',
      })),
      updateIngredient: jest.fn(),
      deleteIngredient: jest.fn(),
      clearIngredients: jest.fn(),
    };

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PantryProvider storageAdapter={mockAdapter}>
        {children}
      </PantryProvider>
    );

    const { result } = await renderHook(() => usePantry(), { wrapper });

    // La lectura de hidratación inicial está en curso y pendiente.
    // Mientras tanto, se agrega un ingrediente exitosamente:
    await act(async () => {
      await result.current.addIngredient({
        name: 'Plátano',
        quantity: 3,
        unit: 'unidad',
        category: 'Verduras y frutas',
      });
    });

    expect(result.current.ingredients).toHaveLength(1);
    expect(result.current.ingredients[0].name).toBe('Plátano');

    // Ahora la lectura demorada resuelve con un snapshot anterior vacío []
    await act(async () => {
      resolveGetIngredients([]);
    });

    // La mutación más reciente ("Plátano") NO debe ser sobreescrita por la lectura obsoleta
    expect(result.current.ingredients).toHaveLength(1);
    expect(result.current.ingredients[0].name).toBe('Plátano');
  });

  it('handles refresh during concurrent writes preserving final persisted state (Concern 3)', async () => {
    const initial: Ingredient[] = [
      { id: 'item-1', name: 'Leche', quantity: 2, unit: 'l', category: 'Lácteos', createdAt: '', updatedAt: '' },
    ];
    const adapter = new AsyncStoragePantryAdapter('@foodai:test_concurrent_pantry');
    await adapter.saveIngredients(initial);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PantryProvider storageAdapter={adapter} initialIngredients={initial}>
        {children}
      </PantryProvider>
    );

    const { result } = await renderHook(() => usePantry(), { wrapper });

    // Lanzar concurrentemente una mutación y un refresh
    await act(async () => {
      await Promise.all([
        result.current.adjustQuantity('item-1', 1),
        result.current.refresh(),
      ]);
    });

    // El estado mostrado debe ser consistente y coincidir con el estado persistido
    const persisted = await adapter.getIngredients();
    expect(result.current.ingredients[0].quantity).toBe(persisted[0].quantity);
    expect(result.current.ingredients[0].quantity).toBe(3);
  });

  it('does not apply speculative optimistic changes if the storage operation fails (Concern 3)', async () => {
    const initial: Ingredient[] = [
      { id: 'item-stable', name: 'Arroz', quantity: 1, unit: 'kg', category: 'Granos y cereales', createdAt: '', updatedAt: '' },
    ];
    const failingAdapter: PantryStorageAdapter = {
      getIngredients: jest.fn().mockResolvedValue(initial),
      saveIngredients: jest.fn().mockRejectedValue(new Error('Storage failure')),
      addIngredient: jest.fn().mockRejectedValue(new Error('Storage failure')),
      updateIngredient: jest.fn().mockRejectedValue(new Error('Storage failure')),
      deleteIngredient: jest.fn().mockRejectedValue(new Error('Storage failure')),
      adjustQuantity: jest.fn().mockRejectedValue(new Error('Storage failure')),
      clearIngredients: jest.fn(),
    };

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PantryProvider storageAdapter={failingAdapter} initialIngredients={initial}>
        {children}
      </PantryProvider>
    );

    const { result } = await renderHook(() => usePantry(), { wrapper });

    await act(async () => {
      await expect(
        result.current.adjustQuantity('item-stable', 5)
      ).rejects.toThrow('Storage failure');
    });

    // Ninguna mutación optimista sobrevive en el estado de React
    expect(result.current.ingredients[0].quantity).toBe(1);
    expect(result.current.storageError).toBe('Storage failure');
  });
});
