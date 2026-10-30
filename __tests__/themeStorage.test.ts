/**
 * FoodAI - Pruebas unitarias para persistencia de tema (Fase 6B.2).
 * Cubre:
 * - Valor predeterminado ('system') cuando no hay preferencia guardada.
 * - Validación estricta de valores 'light', 'dark' y 'system'.
 * - Rechazo seguro de valores corruptos, nulos o no reconocidos.
 * - Resiliencia ante fallos de lectura y escritura en AsyncStorage.
 * - Envoltorio estructurado de errores con ThemeStorageError.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  APPEARANCE_STORAGE_KEY,
  APPEARANCE_STORAGE_VERSION,
  AsyncStorageThemeStorageAdapter,
  ThemeStorageError,
  isValidThemeMode,
} from '../src/services/storage/themeStorage';

describe('themeStorage (AsyncStorageThemeStorageAdapter)', () => {
  let adapter: AsyncStorageThemeStorageAdapter;

  beforeEach(async () => {
    await AsyncStorage.clear();
    adapter = new AsyncStorageThemeStorageAdapter();
  });

  afterEach(async () => {
    await AsyncStorage.clear();
  });

  describe('isValidThemeMode', () => {
    it('debe aceptar valores válidos: light, dark, system', () => {
      expect(isValidThemeMode('light')).toBe(true);
      expect(isValidThemeMode('dark')).toBe(true);
      expect(isValidThemeMode('system')).toBe(true);
    });

    it('debe rechazar valores inválidos', () => {
      expect(isValidThemeMode('blue')).toBe(false);
      expect(isValidThemeMode('')).toBe(false);
      expect(isValidThemeMode(null)).toBe(false);
      expect(isValidThemeMode(undefined)).toBe(false);
      expect(isValidThemeMode(123)).toBe(false);
      expect(isValidThemeMode({})).toBe(false);
    });
  });

  describe('getThemeMode', () => {
    it('debe retornar "system" por defecto si no existe preferencia guardada', async () => {
      const mode = await adapter.getThemeMode();
      expect(mode).toBe('system');
    });

    it('debe leer y retornar el modo guardado correctamente', async () => {
      await adapter.saveThemeMode('dark');
      const mode = await adapter.getThemeMode();
      expect(mode).toBe('dark');
    });

    it('debe retornar "system" de forma segura si el contenido almacenado es JSON corrupto', async () => {
      await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, 'invalid-json{{{');
      const mode = await adapter.getThemeMode();
      expect(mode).toBe('system');
    });

    it('debe retornar "system" si el objeto JSON no contiene un themeMode válido', async () => {
      await AsyncStorage.setItem(
        APPEARANCE_STORAGE_KEY,
        JSON.stringify({ version: 1, themeMode: 'invalid_mode' })
      );
      const mode = await adapter.getThemeMode();
      expect(mode).toBe('system');
    });

    it('debe capturar errores de lectura de AsyncStorage y retornar "system" sin lanzar excepción', async () => {
      const originalGetItem = AsyncStorage.getItem;
      AsyncStorage.getItem = jest.fn().mockRejectedValueOnce(new Error('Disco bloqueado'));

      const mode = await adapter.getThemeMode();
      expect(mode).toBe('system');

      AsyncStorage.getItem = originalGetItem;
    });

    it('debe rechazar versiones de sobre desconocidas o no soportadas y retornar "system"', async () => {
      await AsyncStorage.setItem(
        APPEARANCE_STORAGE_KEY,
        JSON.stringify({ version: 99, themeMode: 'dark', updatedAt: new Date().toISOString() })
      );
      const mode = await adapter.getThemeMode();
      expect(mode).toBe('system');
    });

    it('debe rechazar estructuras inválidas como arrays o primitivos serializados', async () => {
      await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(['dark']));
      expect(await adapter.getThemeMode()).toBe('system');

      await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(12345));
      expect(await adapter.getThemeMode()).toBe('system');

      await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(null));
      expect(await adapter.getThemeMode()).toBe('system');
    });

    it('debe soportar y recuperar valores de formato legacy directo sin sobre JSON', async () => {
      await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, 'dark');
      expect(await adapter.getThemeMode()).toBe('dark');

      await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, 'light');
      expect(await adapter.getThemeMode()).toBe('light');

      await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, 'system');
      expect(await adapter.getThemeMode()).toBe('system');
    });
  });

  describe('saveThemeMode', () => {
    it('debe guardar "light" con sobre estructurado de versión y timestamp', async () => {
      await adapter.saveThemeMode('light');

      const raw = await AsyncStorage.getItem(APPEARANCE_STORAGE_KEY);
      expect(raw).toBeTruthy();

      const parsed = JSON.parse(raw!);
      expect(parsed.version).toBe(APPEARANCE_STORAGE_VERSION);
      expect(parsed.themeMode).toBe('light');
      expect(typeof parsed.updatedAt).toBe('string');
    });

    it('debe guardar "dark" y "system" correctamente', async () => {
      await adapter.saveThemeMode('dark');
      expect(await adapter.getThemeMode()).toBe('dark');

      await adapter.saveThemeMode('system');
      expect(await adapter.getThemeMode()).toBe('system');
    });

    it('debe rechazar un modo inválido lanzando ThemeStorageError', async () => {
      await expect(
        adapter.saveThemeMode('sepia' as any)
      ).rejects.toThrow(ThemeStorageError);
    });

    it('debe envolver fallos de AsyncStorage.setItem en ThemeStorageError', async () => {
      const originalSetItem = AsyncStorage.setItem;
      AsyncStorage.setItem = jest.fn().mockRejectedValueOnce(new Error('Cuota de almacenamiento excedida'));

      await expect(adapter.saveThemeMode('dark')).rejects.toThrow(
        ThemeStorageError
      );

      AsyncStorage.setItem = originalSetItem;
    });

    it('debe serializar escrituras concurrentes preservando siempre la última preferencia seleccionada', async () => {
      const p1 = adapter.saveThemeMode('dark');
      const p2 = adapter.saveThemeMode('light');

      await Promise.all([p1, p2]);

      const raw = await AsyncStorage.getItem(APPEARANCE_STORAGE_KEY);
      const parsed = JSON.parse(raw!);
      expect(parsed.themeMode).toBe('light');
      expect(await adapter.getThemeMode()).toBe('light');
    });
  });

  describe('clearThemeMode', () => {
    it('debe eliminar la preferencia almacenada', async () => {
      await adapter.saveThemeMode('dark');
      expect(await adapter.getThemeMode()).toBe('dark');

      await adapter.clearThemeMode();
      const raw = await AsyncStorage.getItem(APPEARANCE_STORAGE_KEY);
      expect(raw).toBeNull();
      expect(await adapter.getThemeMode()).toBe('system');
    });

    it('debe envolver errores de eliminación en ThemeStorageError', async () => {
      const originalRemoveItem = AsyncStorage.removeItem;
      AsyncStorage.removeItem = jest.fn().mockRejectedValueOnce(new Error('Error de I/O'));

      await expect(adapter.clearThemeMode()).rejects.toThrow(
        ThemeStorageError
      );

      AsyncStorage.removeItem = originalRemoveItem;
    });
  });

  describe('Métodos alias getPreference y savePreference', () => {
    it('deben funcionar de forma idéntica a getThemeMode y saveThemeMode', async () => {
      await adapter.savePreference('dark');
      expect(await adapter.getPreference()).toBe('dark');
    });
  });
});
