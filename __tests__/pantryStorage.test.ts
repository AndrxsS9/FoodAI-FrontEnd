/**
 * Pruebas unitarias para el almacenamiento y persistencia local de la despensa (Fase 2B).
 * Valida la recuperación ante datos corruptos, sobre versionado y consistencia de datos.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AsyncStoragePantryAdapter,
  isValidStoredIngredient,
  parseAndValidateStoredIngredients,
} from '../src/services/storage/pantryStorage';
import { Ingredient } from '../src/types/pantry';

describe('Pantry Local Persistence & Storage Adapter', () => {
  let adapter: AsyncStoragePantryAdapter;

  beforeEach(async () => {
    await AsyncStorage.clear();
    adapter = new AsyncStoragePantryAdapter('@foodai:test_pantry');
  });

  describe('isValidStoredIngredient()', () => {
    it('approves a valid stored ingredient object', () => {
      const valid: Ingredient = {
        id: 'ing-1',
        name: 'Tomate',
        quantity: 2,
        unit: 'unidad',
        category: 'Verduras y frutas',
        expirationDate: '2026-10-25',
        createdAt: '2026-10-21T00:00:00.000Z',
        updatedAt: '2026-10-21T00:00:00.000Z',
      };
      expect(isValidStoredIngredient(valid)).toBe(true);
    });

    it('rejects items missing required fields or having negative quantity', () => {
      expect(isValidStoredIngredient(null)).toBe(false);
      expect(isValidStoredIngredient({})).toBe(false);
      expect(isValidStoredIngredient({ id: '', name: 'Arroz', quantity: 1, unit: 'kg', category: 'Alacena' })).toBe(false);
      expect(isValidStoredIngredient({ id: '1', name: '', quantity: 1, unit: 'kg', category: 'Alacena' })).toBe(false);
      expect(isValidStoredIngredient({ id: '1', name: 'Arroz', quantity: -5, unit: 'kg', category: 'Alacena' })).toBe(false);
      expect(isValidStoredIngredient({ id: '1', name: 'Arroz', quantity: 0, unit: 'kg', category: 'Alacena' })).toBe(false);
      expect(isValidStoredIngredient({ id: '1', name: 'Arroz', quantity: 1, unit: 'galones', category: 'Alacena' })).toBe(false);
      expect(isValidStoredIngredient({ id: '1', name: 'Arroz', quantity: 1, unit: 'kg', category: 'Inexistente' })).toBe(false);
    });
  });

  describe('parseAndValidateStoredIngredients()', () => {
    it('returns empty array when raw string is null or empty', () => {
      expect(parseAndValidateStoredIngredients(null)).toEqual([]);
      expect(parseAndValidateStoredIngredients('')).toEqual([]);
    });

    it('handles malformed, truncated or corrupted JSON without crashing', () => {
      const corruptedJson = '{"version": 1, "ingredients": [{"id": "1", "name": "Tomate", "quant';
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const result = parseAndValidateStoredIngredients(corruptedJson);

      expect(result).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('parses valid versioned envelope correctly', () => {
      const validEnvelope = JSON.stringify({
        version: 1,
        updatedAt: '2026-10-21T10:00:00.000Z',
        ingredients: [
          {
            id: 'ing-1',
            name: 'Cebolla',
            quantity: 3,
            unit: 'unidad',
            category: 'Verduras y frutas',
            createdAt: '2026-10-21T10:00:00.000Z',
            updatedAt: '2026-10-21T10:00:00.000Z',
          },
        ],
      });

      const result = parseAndValidateStoredIngredients(validEnvelope);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Cebolla');
    });

    it('filters out corrupted records while preserving valid ones', () => {
      const mixedData = JSON.stringify({
        version: 1,
        ingredients: [
          {
            id: 'valid-1',
            name: 'Papas',
            quantity: 2,
            unit: 'kg',
            category: 'Verduras y frutas',
            createdAt: '2026-10-21T10:00:00.000Z',
            updatedAt: '2026-10-21T10:00:00.000Z',
          },
          {
            id: '', // Corrupto: id vacío
            name: 'Bad item',
            quantity: 1,
            unit: 'kg',
            category: 'Alacena',
          },
          {
            id: 'valid-2',
            name: 'Aceite',
            quantity: 500,
            unit: 'ml',
            category: 'Alacena',
            createdAt: '2026-10-21T10:00:00.000Z',
            updatedAt: '2026-10-21T10:00:00.000Z',
          },
        ],
      });

      const result = parseAndValidateStoredIngredients(mixedData);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Papas');
      expect(result[1].name).toBe('Aceite');
    });
  });

  describe('AsyncStoragePantryAdapter Operations & Consistency', () => {
    it('starts with empty list on first run', async () => {
      const ingredients = await adapter.getIngredients();
      expect(ingredients).toEqual([]);
    });

    it('adds new ingredients and generates unique identities', async () => {
      const item1 = await adapter.addIngredient({
        name: 'Huevos',
        quantity: 12,
        unit: 'unidad',
        category: 'Lácteos',
      });

      const item2 = await adapter.addIngredient({
        name: 'Leche',
        quantity: 1,
        unit: 'l',
        category: 'Lácteos',
      });

      expect(item1.id).toBeTruthy();
      expect(item2.id).toBeTruthy();
      expect(item1.id).not.toBe(item2.id);

      const all = await adapter.getIngredients();
      expect(all).toHaveLength(2);
      expect(all[0].name).toBe('Leche');
      expect(all[1].name).toBe('Huevos');
    });

    it('updates ingredient without changing its original identity', async () => {
      const created = await adapter.addIngredient({
        name: 'Arroz',
        quantity: 500,
        unit: 'g',
        category: 'Granos y cereales',
      });

      const originalId = created.id;

      const updated = await adapter.updateIngredient({
        id: originalId,
        quantity: 1000,
      });

      expect(updated.id).toBe(originalId);
      expect(updated.quantity).toBe(1000);

      const fromStorage = await adapter.getIngredients();
      expect(fromStorage).toHaveLength(1);
      expect(fromStorage[0].id).toBe(originalId);
      expect(fromStorage[0].quantity).toBe(1000);
    });

    it('throws when updating non-existent ingredient', async () => {
      await expect(
        adapter.updateIngredient({ id: 'non-existent', name: 'Fantasma' })
      ).rejects.toThrow('no encontrado');
    });

    it('deletes ingredient by id accurately', async () => {
      const item1 = await adapter.addIngredient({
        name: 'Zanahorias',
        quantity: 3,
        unit: 'unidad',
        category: 'Verduras y frutas',
      });

      const item2 = await adapter.addIngredient({
        name: 'Pollo',
        quantity: 500,
        unit: 'g',
        category: 'Carnes y proteínas',
      });

      await adapter.deleteIngredient(item1.id);

      const remaining = await adapter.getIngredients();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(item2.id);
      expect(remaining[0].name).toBe('Pollo');
    });

    it('clears all pantry ingredients safely', async () => {
      await adapter.addIngredient({
        name: 'Queso',
        quantity: 250,
        unit: 'g',
        category: 'Lácteos',
      });

      await adapter.clearIngredients();

      const list = await adapter.getIngredients();
      expect(list).toEqual([]);
    });

    it('maintains data consistency across multiple consecutive operations', async () => {
      // 1. Añadir 3 alimentos
      const a = await adapter.addIngredient({ name: 'Avena', quantity: 500, unit: 'g', category: 'Granos y cereales' });
      const b = await adapter.addIngredient({ name: 'Yogurt', quantity: 1, unit: 'l', category: 'Lácteos' });
      const c = await adapter.addIngredient({ name: 'Manzanas', quantity: 4, unit: 'unidad', category: 'Verduras y frutas' });

      // 2. Modificar el segundo
      await adapter.updateIngredient({ id: b.id, quantity: 2 });

      // 3. Eliminar el primero
      await adapter.deleteIngredient(a.id);

      // 4. Modificar el tercero
      await adapter.updateIngredient({ id: c.id, name: 'Manzanas rojas', quantity: 6 });

      const final = await adapter.getIngredients();
      expect(final).toHaveLength(2);

      const names = final.map((item) => item.name);
      expect(names).toContain('Yogurt');
      expect(names).toContain('Manzanas rojas');
      expect(names).not.toContain('Avena');

      const yogurt = final.find((i) => i.id === b.id);
      expect(yogurt?.quantity).toBe(2);

      const manzanas = final.find((i) => i.id === c.id);
      expect(manzanas?.quantity).toBe(6);
    });
  });
});
