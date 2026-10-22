/**
 * Pruebas unitarias para el repositorio y adaptador de almacenamiento del presupuesto compartido (Fase 2C).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BUDGET_STORAGE_KEY,
  BUDGET_STORAGE_VERSION,
  budgetStorage,
  defaultBudgetPreferences,
} from '../src/services/storage/budgetStorage';
import { DEFAULT_BUDGET_COP, DEFAULT_SERVINGS } from '../src/types/budget';

describe('BudgetStorage Adapter (Fase 2C)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
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

  it('recupera valores por defecto si el JSON almacenado está corrupto', async () => {
    await AsyncStorage.setItem(BUDGET_STORAGE_KEY, 'JSON_CORRUPTO_!#$');
    const prefs = await budgetStorage.getPreferences();
    expect(prefs.budget).toBe(DEFAULT_BUDGET_COP);
    expect(prefs.servings).toBe(DEFAULT_SERVINGS);
  });

  it('recupera valores por defecto si la versión de esquema no coincide', async () => {
    const incompatibleEnvelope = {
      version: 999,
      preferences: { budget: 50000, servings: 6 },
    };
    await AsyncStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(incompatibleEnvelope));

    const prefs = await budgetStorage.getPreferences();
    expect(prefs.budget).toBe(DEFAULT_BUDGET_COP);
  });

  it('restablece las preferencias a los valores por defecto con resetPreferences', async () => {
    await budgetStorage.savePreferences({ budget: 45000, servings: 6 });
    const reset = await budgetStorage.resetPreferences();

    expect(reset.budget).toBe(DEFAULT_BUDGET_COP);
    expect(reset.servings).toBe(DEFAULT_SERVINGS);

    const current = await budgetStorage.getPreferences();
    expect(current.budget).toBe(DEFAULT_BUDGET_COP);
  });
});
