/**
 * Pruebas unitarias para el repositorio y adaptador de almacenamiento del presupuesto compartido (Fase 2C).
 * Cubre integridad de persistencia, serialización FIFO, protección ante datos corruptos
 * y versiones futuras, así como manejo explícito de fallos de escritura.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AsyncStorageBudgetAdapter,
  BUDGET_STORAGE_KEY,
  BUDGET_STORAGE_VERSION,
  BudgetStorageCorruptionError,
  BudgetStorageVersionError,
  budgetStorage,
} from '../src/services/storage/budgetStorage';
import { DEFAULT_BUDGET_COP, DEFAULT_SERVINGS } from '../src/types/budget';

describe('BudgetStorage Adapter (Fase 2C)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await AsyncStorage.clear();
  });

  it('retorna las preferencias por defecto cuando el almacenamiento está vacío', async () => {
    const prefs = await budgetStorage.getPreferences();
    expect(prefs.budget).toBe(DEFAULT_BUDGET_COP);
    expect(prefs.servings).toBe(DEFAULT_SERVINGS);
    expect(prefs.maxMinutes).toBeUndefined();
  });

  it('guarda y recupera preferencias válidas en AsyncStorage', async () => {
    const updated = await budgetStorage.savePreferences({
      budget: 35000,
      servings: 4,
      maxMinutes: 40,
    });

    expect(updated.budget).toBe(35000);
    expect(updated.servings).toBe(4);
    expect(updated.maxMinutes).toBe(40);

    const storedRaw = await AsyncStorage.getItem(BUDGET_STORAGE_KEY);
    expect(storedRaw).toBeTruthy();
    const parsed = JSON.parse(storedRaw!);
    expect(parsed.version).toBe(BUDGET_STORAGE_VERSION);
    expect(parsed.preferences.budget).toBe(35000);

    const reloaded = await budgetStorage.getPreferences();
    expect(reloaded.budget).toBe(35000);
    expect(reloaded.servings).toBe(4);
    expect(reloaded.maxMinutes).toBe(40);
  });

  it('limita valores fuera de rango al guardar', async () => {
    const updated = await budgetStorage.savePreferences({
      budget: -100, // Menor que 0
      servings: 20, // Mayor que 12
    });

    expect(updated.budget).toBe(0);
    expect(updated.servings).toBe(12);
  });

  it('permite reiniciar o desactivar maxMinutes explícitamente', async () => {
    await budgetStorage.savePreferences({ budget: 30000, maxMinutes: 45 });
    const mid = await budgetStorage.getPreferences();
    expect(mid.maxMinutes).toBe(45);

    // Desactivar pasando null o resetMaxMinutes
    const cleared = await budgetStorage.savePreferences({ maxMinutes: null });
    expect(cleared.maxMinutes).toBeUndefined();

    const current = await budgetStorage.getPreferences();
    expect(current.maxMinutes).toBeUndefined();
  });

  it('previene pérdida de actualizaciones ante escrituras concurrentes (FIFO Serialization)', async () => {
    // 3 operaciones concurrentes que mutan propiedades distintas
    const [resBudget, resServings, resMinutes] = await Promise.all([
      budgetStorage.savePreferences({ budget: 55000 }),
      budgetStorage.savePreferences({ servings: 6 }),
      budgetStorage.savePreferences({ maxMinutes: 35 }),
    ]);

    expect(resBudget.budget).toBe(55000);
    expect(resServings.servings).toBe(6);
    expect(resMinutes.maxMinutes).toBe(35);

    // El estado final en disco debe contener las 3 mutaciones consolidadas
    const finalState = await budgetStorage.getPreferences();
    expect(finalState.budget).toBe(55000);
    expect(finalState.servings).toBe(6);
    expect(finalState.maxMinutes).toBe(35);
  });

  it('preserva el payload original y crea respaldo ante JSON corrupto sin sobreescribir', async () => {
    const corruptPayload = 'CORRUPTED_JSON_DATA_{"invalid';
    await AsyncStorage.setItem(BUDGET_STORAGE_KEY, corruptPayload);

    await expect(budgetStorage.getPreferences()).rejects.toThrow(BudgetStorageCorruptionError);

    // Verificar que el payload corrupto original no fue destruido ni limpiado
    const rawAfterError = await AsyncStorage.getItem(BUDGET_STORAGE_KEY);
    expect(rawAfterError).toBe(corruptPayload);

    // Verificar que se creó una copia de respaldo timestamped
    const allKeys = await AsyncStorage.getAllKeys();
    const backupKeys = allKeys.filter((k) => k.startsWith(`${BUDGET_STORAGE_KEY}_backup_`));
    expect(backupKeys.length).toBeGreaterThan(0);
  });

  it('lanza BudgetStorageVersionError ante versiones futuras no compatibles', async () => {
    const futureEnvelope = {
      version: 99,
      updatedAt: new Date().toISOString(),
      preferences: { budget: 70000, servings: 5 },
    };
    await AsyncStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(futureEnvelope));

    await expect(budgetStorage.getPreferences()).rejects.toThrow(BudgetStorageVersionError);
  });

  it('propaga error y no reporta éxito falso si AsyncStorage.setItem falla', async () => {
    const originalSetItem = AsyncStorage.setItem;
    AsyncStorage.setItem = jest.fn().mockRejectedValueOnce(new Error('Fallo de disco I/O'));

    const customAdapter = new AsyncStorageBudgetAdapter('@foodai:test_fail');
    await expect(
      customAdapter.savePreferences({ budget: 40000 })
    ).rejects.toThrow('Fallo de disco I/O');

    AsyncStorage.setItem = originalSetItem;
  });

  it('restablece las preferencias a los valores por defecto con resetPreferences', async () => {
    await budgetStorage.savePreferences({ budget: 45000, servings: 6, maxMinutes: 50 });
    const reset = await budgetStorage.resetPreferences();

    expect(reset.budget).toBe(DEFAULT_BUDGET_COP);
    expect(reset.servings).toBe(DEFAULT_SERVINGS);
    expect(reset.maxMinutes).toBeUndefined();

    const current = await budgetStorage.getPreferences();
    expect(current.budget).toBe(DEFAULT_BUDGET_COP);
  });

  it('rechaza resetPreferences ante versiones futuras no compatibles y preserva los datos almacenados', async () => {
    const futureEnvelope = {
      version: 99,
      updatedAt: '2099-01-01T00:00:00.000Z',
      preferences: { budget: 99000, servings: 8 },
    };
    const futurePayload = JSON.stringify(futureEnvelope);
    await AsyncStorage.setItem(BUDGET_STORAGE_KEY, futurePayload);

    // Debe rechazar el reset con el error tipado correspondiente
    await expect(budgetStorage.resetPreferences()).rejects.toThrow(BudgetStorageVersionError);

    // El sobre de versión futura original NO debe haber sido sobreescrito
    const rawStored = await AsyncStorage.getItem(BUDGET_STORAGE_KEY);
    expect(rawStored).toBe(futurePayload);
  });

  it('rechaza resetPreferences ante almacenamiento corrupto y preserva el payload original', async () => {
    const corruptPayload = 'CORRUPTED_JSON_DATA_FOR_RESET_{';
    await AsyncStorage.setItem(BUDGET_STORAGE_KEY, corruptPayload);

    // Debe rechazar el reset con el error tipado de corrupción
    await expect(budgetStorage.resetPreferences()).rejects.toThrow(BudgetStorageCorruptionError);

    // El payload corrupto original no debe ser sobreescrito silenciosamente
    const rawStored = await AsyncStorage.getItem(BUDGET_STORAGE_KEY);
    expect(rawStored).toBe(corruptPayload);

    // Debe existir una copia de respaldo timestamped creada
    const allKeys = await AsyncStorage.getAllKeys();
    const backupKeys = allKeys.filter((k) => k.startsWith(`${BUDGET_STORAGE_KEY}_backup_`));
    expect(backupKeys.length).toBeGreaterThan(0);
  });
});
