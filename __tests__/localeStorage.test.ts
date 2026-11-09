/**
 * Fase 28C-A — Persistencia de la preferencia de idioma.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AsyncStorageLocaleStorageAdapter,
  LOCALE_STORAGE_KEY,
  LOCALE_STORAGE_VERSION,
  LocaleStorageError,
  isSupportedLocale,
  parseStoredLocale,
} from '../src/services/storage/localeStorage';
import { APPEARANCE_STORAGE_KEY } from '../src/services/storage/themeStorage';

describe('Fase 28C-A · localeStorage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('usa una clave propia, versionada y distinta de la apariencia', () => {
    expect(LOCALE_STORAGE_KEY).toBe('@foodai:locale_preference_v1');
    expect(LOCALE_STORAGE_KEY).not.toBe(APPEARANCE_STORAGE_KEY);
    expect(LOCALE_STORAGE_VERSION).toBe(1);
  });

  it('valida idiomas soportados', () => {
    expect(isSupportedLocale('es')).toBe(true);
    expect(isSupportedLocale('en')).toBe(true);
    expect(isSupportedLocale('fr')).toBe(false);
    expect(isSupportedLocale(null)).toBe(false);
  });

  it('sin preferencia guardada devuelve null (el contexto aplicará español)', async () => {
    const adapter = new AsyncStorageLocaleStorageAdapter();
    await expect(adapter.getLocale()).resolves.toBeNull();
  });

  it('guarda un sobre JSON versionado y lo relee', async () => {
    const adapter = new AsyncStorageLocaleStorageAdapter();
    await adapter.saveLocale('en');
    const raw = await AsyncStorage.getItem(LOCALE_STORAGE_KEY);
    const envelope = JSON.parse(raw!);
    expect(envelope).toEqual({ version: 1, updatedAt: expect.any(String), locale: 'en' });
    await expect(adapter.getLocale()).resolves.toBe('en');
  });

  it('interpreta valores legados y descarta contenido corrupto o desconocido', () => {
    expect(parseStoredLocale('en')).toBe('en');
    expect(parseStoredLocale(' es ')).toBe('es');
    expect(parseStoredLocale('{"version":1,"locale":"en"}')).toBe('en');
    expect(parseStoredLocale('{"version":2,"locale":"en"}')).toBeNull();
    expect(parseStoredLocale('{"version":1,"locale":"fr"}')).toBeNull();
    expect(parseStoredLocale('[1,2]')).toBeNull();
    expect(parseStoredLocale('{no-json')).toBeNull();
    expect(parseStoredLocale(null)).toBeNull();
  });

  it('un contenido corrupto almacenado no rompe la lectura', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await AsyncStorage.setItem(LOCALE_STORAGE_KEY, '{corrupto');
    const adapter = new AsyncStorageLocaleStorageAdapter();
    await expect(adapter.getLocale()).resolves.toBeNull();
  });

  it('reporta explícitamente un fallo de lectura de I/O', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk read error'));
    const adapter = new AsyncStorageLocaleStorageAdapter();
    const error = await adapter.getLocale().catch((e) => e);
    expect(error).toBeInstanceOf(LocaleStorageError);
    expect(error.code).toBe('load_failed');
    expect(error.message).not.toContain('disk read error');
  });

  it('reporta explícitamente un fallo de escritura', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
    const adapter = new AsyncStorageLocaleStorageAdapter();
    const error = await adapter.saveLocale('en').catch((e) => e);
    expect(error).toBeInstanceOf(LocaleStorageError);
    expect(error.code).toBe('save_failed');
  });

  it('rechaza idiomas no soportados sin escribir', async () => {
    const setItem = AsyncStorage.setItem as jest.Mock;
    setItem.mockClear();
    const adapter = new AsyncStorageLocaleStorageAdapter();
    await expect(adapter.saveLocale('fr' as never)).rejects.toMatchObject({ code: 'invalid_locale' });
    expect(setItem).not.toHaveBeenCalled();
  });

  it('una escritura obsoleta nunca sobrescribe una elección más reciente', async () => {
    const adapter = new AsyncStorageLocaleStorageAdapter();
    const setItem = AsyncStorage.setItem as jest.Mock;
    setItem.mockClear();

    await Promise.all([adapter.saveLocale('en'), adapter.saveLocale('es'), adapter.saveLocale('en')]);
    await expect(adapter.getLocale()).resolves.toBe('en');
    const writes = setItem.mock.calls.map(([, value]) => JSON.parse(value).locale);
    // Las escrituras que quedaron obsoletas antes de ejecutarse se omiten; la última gana.
    expect(writes[writes.length - 1]).toBe('en');
    expect(writes).not.toContain('es');
  });

  it('borra la preferencia y reporta fallos de borrado', async () => {
    const adapter = new AsyncStorageLocaleStorageAdapter();
    await adapter.saveLocale('en');
    await adapter.clearLocale();
    await expect(adapter.getLocale()).resolves.toBeNull();
    jest.spyOn(AsyncStorage, 'removeItem').mockRejectedValueOnce(new Error('x'));
    await expect(adapter.clearLocale()).rejects.toMatchObject({ code: 'clear_failed' });
  });
});
