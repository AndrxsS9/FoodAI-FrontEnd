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

    // --- CORRECCIÓN 1: SERIALIZACIÓN Y ESCRITURAS CONCURRENTES ---
    it('prevents data loss when adding ingredients concurrently without awaiting each call (Escenario A)', async () => {
      // Registrar arroz, pollo y tomates en ráfaga paralela
      await Promise.all([
        adapter.addIngredient({ name: 'Arroz', quantity: 1, unit: 'kg', category: 'Granos y cereales' }),
        adapter.addIngredient({ name: 'Pollo', quantity: 500, unit: 'g', category: 'Carnes y proteínas' }),
        adapter.addIngredient({ name: 'Tomates', quantity: 4, unit: 'unidad', category: 'Verduras y frutas' }),
      ]);

      const stored = await adapter.getIngredients();
      expect(stored).toHaveLength(3);
      const names = stored.map((i) => i.name);
      expect(names).toContain('Arroz');
      expect(names).toContain('Pollo');
      expect(names).toContain('Tomates');
    });

    it('handles concurrent quantity adjustments preserving all increments', async () => {
      const item = await adapter.addIngredient({
        name: 'Huevos',
        quantity: 2,
        unit: 'unidad',
        category: 'Lácteos',
      });

      // 4 incrementos rápidos concurrentes de +1
      await Promise.all([
        adapter.adjustQuantity(item.id, 1),
        adapter.adjustQuantity(item.id, 1),
        adapter.adjustQuantity(item.id, 1),
        adapter.adjustQuantity(item.id, 1),
      ]);

      const stored = await adapter.getIngredients();
      const updatedItem = stored.find((i) => i.id === item.id);
      expect(updatedItem?.quantity).toBe(6);
    });

    // --- CORRECCIÓN 2: ELIMINACIÓN DE FECHA DE VENCIMIENTO ---
    it('clears existing expiration date when passing explicit null (Escenario B)', async () => {
      const created = await adapter.addIngredient({
        name: 'Yogurt griego',
        quantity: 1,
        unit: 'unidad',
        category: 'Lácteos',
        expirationDate: '2026-10-30',
      });
      expect(created.expirationDate).toBe('2026-10-30');

      const updated = await adapter.updateIngredient({
        id: created.id,
        expirationDate: null,
      });
      expect(updated.expirationDate).toBeUndefined();

      const fromStorage = await adapter.getIngredients();
      expect(fromStorage[0].expirationDate).toBeUndefined();
    });

    it('preserves expiration date when expirationDate is omitted in partial update', async () => {
      const created = await adapter.addIngredient({
        name: 'Carne molida',
        quantity: 500,
        unit: 'g',
        category: 'Carnes y proteínas',
        expirationDate: '2026-11-20',
      });

      const updated = await adapter.updateIngredient({
        id: created.id,
        quantity: 750,
      });

      expect(updated.quantity).toBe(750);
      expect(updated.expirationDate).toBe('2026-11-20');

      const fromStorage = await adapter.getIngredients();
      expect(fromStorage[0].expirationDate).toBe('2026-11-20');
    });

    it('replaces expiration date when providing another valid date string', async () => {
      const created = await adapter.addIngredient({
        name: 'Pan tajado',
        quantity: 1,
        unit: 'unidad',
        category: 'Granos y cereales',
        expirationDate: '2026-10-25',
      });

      const updated = await adapter.updateIngredient({
        id: created.id,
        expirationDate: '2026-11-05',
      });

      expect(updated.expirationDate).toBe('2026-11-05');
    });

    // --- CORRECCIÓN 4: VERSIONES DE ESQUEMA E INTEGRIDAD DE ALMACENAMIENTO ---
    it('rejects unsupported future schema versions without overwriting user data (Escenario G)', async () => {
      const futurePayload = JSON.stringify({
        version: 99,
        updatedAt: new Date().toISOString(),
        ingredients: [
          {
            id: 'futuro-1',
            name: 'Alimento del futuro',
            quantity: 1,
            unit: 'unidad',
            category: 'Otros',
            createdAt: '2026-10-21T00:00:00.000Z',
            updatedAt: '2026-10-21T00:00:00.000Z',
          },
        ],
      });
      await AsyncStorage.setItem('@foodai:test_pantry', futurePayload);

      await expect(adapter.getIngredients()).rejects.toThrow(
        'Versión de esquema no compatible (v99)'
      );

      // Los datos originales deben permanecer intactos y nunca sobrescribirse con vacío
      const rawStored = await AsyncStorage.getItem('@foodai:test_pantry');
      expect(rawStored).toBe(futurePayload);
    });

    it('creates backup and throws on corrupted payload without destroying data (Escenario G)', async () => {
      const corruptedData = '{"version": 1, "ingredients": [{"id": "corrupto';
      await AsyncStorage.setItem('@foodai:test_pantry', corruptedData);

      await expect(adapter.getIngredients()).rejects.toThrow(
        'Almacenamiento corrupto'
      );

      // Los datos corruptos no se borran silenciosamente
      const rawStored = await AsyncStorage.getItem('@foodai:test_pantry');
      expect(rawStored).toBe(corruptedData);
    });

    it('deduplicates stored ingredients with duplicate IDs and preserves records in quarantine', async () => {
      const envelopeWithDuplicates = JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        ingredients: [
          { id: 'dup-1', name: 'Tomate', quantity: 2, unit: 'unidad', category: 'Verduras y frutas' },
          { id: 'dup-1', name: 'Tomate clonado', quantity: 1, unit: 'unidad', category: 'Verduras y frutas' },
          { id: 'uniq-2', name: 'Cebolla', quantity: 1, unit: 'unidad', category: 'Verduras y frutas' },
        ],
      });
      await AsyncStorage.setItem('@foodai:test_pantry', envelopeWithDuplicates);

      const result = await adapter.getIngredients();
      expect(result).toHaveLength(2);
      expect(result.map((i) => i.id)).toEqual(['dup-1', 'uniq-2']);

      // Guardar un nuevo alimento conserva los registros en cuarentena sin perderlos
      await adapter.addIngredient({
        name: 'Ajo',
        quantity: 3,
        unit: 'unidad',
        category: 'Verduras y frutas',
      });

      const raw = await AsyncStorage.getItem('@foodai:test_pantry');
      const parsed = JSON.parse(raw!);
      expect(parsed.quarantinedRecords).toHaveLength(1);
    });
  });
});
