/**
 * Adaptador y repositorio de persistencia para el presupuesto compartido (Fase 2C).
 * Utiliza @react-native-async-storage/async-storage con versionado de esquema.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BudgetPreferences,
  DEFAULT_BUDGET_COP,
  DEFAULT_SERVINGS,
  MAX_BUDGET_COP,
  MAX_PREP_MINUTES,
  MAX_SERVINGS,
  MIN_BUDGET_COP,
  MIN_PREP_MINUTES,
  MIN_SERVINGS,
} from '../../types/budget';

export const BUDGET_STORAGE_KEY = '@foodai:budget_v1';
export const BUDGET_STORAGE_VERSION = 1;

export interface BudgetStorageEnvelope {
  version: number;
  preferences: BudgetPreferences;
}

export interface BudgetStorageAdapter {
  getPreferences(): Promise<BudgetPreferences>;
  savePreferences(preferences: Partial<BudgetPreferences>): Promise<BudgetPreferences>;
  resetPreferences(): Promise<BudgetPreferences>;
}

export const defaultBudgetPreferences: BudgetPreferences = {
  budget: DEFAULT_BUDGET_COP,
  servings: DEFAULT_SERVINGS,
  updatedAt: new Date().toISOString(),
};

function sanitizeBudgetPreferences(input: unknown): BudgetPreferences {
  if (!input || typeof input !== 'object') {
    return { ...defaultBudgetPreferences, updatedAt: new Date().toISOString() };
  }

  const raw = input as Record<string, unknown>;

  let budget = typeof raw.budget === 'number' && Number.isFinite(raw.budget) ? raw.budget : DEFAULT_BUDGET_COP;
  if (budget < MIN_BUDGET_COP) budget = MIN_BUDGET_COP;
  if (budget > MAX_BUDGET_COP) budget = MAX_BUDGET_COP;

  let servings = typeof raw.servings === 'number' && Number.isInteger(raw.servings) ? raw.servings : DEFAULT_SERVINGS;
  if (servings < MIN_SERVINGS) servings = MIN_SERVINGS;
  if (servings > MAX_SERVINGS) servings = MAX_SERVINGS;

  let maxMinutes: number | undefined;
  if (typeof raw.maxMinutes === 'number' && Number.isInteger(raw.maxMinutes)) {
    if (raw.maxMinutes >= MIN_PREP_MINUTES && raw.maxMinutes <= MAX_PREP_MINUTES) {
      maxMinutes = raw.maxMinutes;
    }
  }

  const updatedAt = typeof raw.updatedAt === 'string' && !isNaN(Date.parse(raw.updatedAt))
    ? raw.updatedAt
    : new Date().toISOString();

  return {
    budget,
    servings,
    maxMinutes,
    updatedAt,
  };
}

export const budgetStorage: BudgetStorageAdapter = {
  async getPreferences(): Promise<BudgetPreferences> {
    try {
      const raw = await AsyncStorage.getItem(BUDGET_STORAGE_KEY);
      if (!raw) {
        return { ...defaultBudgetPreferences, updatedAt: new Date().toISOString() };
      }
      const parsed = JSON.parse(raw) as BudgetStorageEnvelope;
      if (!parsed || parsed.version !== BUDGET_STORAGE_VERSION) {
        return { ...defaultBudgetPreferences, updatedAt: new Date().toISOString() };
      }
      return sanitizeBudgetPreferences(parsed.preferences);
    } catch {
      return { ...defaultBudgetPreferences, updatedAt: new Date().toISOString() };
    }
  },

  async savePreferences(partial: Partial<BudgetPreferences>): Promise<BudgetPreferences> {
    const current = await this.getPreferences();
    const updated: BudgetPreferences = sanitizeBudgetPreferences({
      ...current,
      ...partial,
      updatedAt: new Date().toISOString(),
    });

    const envelope: BudgetStorageEnvelope = {
      version: BUDGET_STORAGE_VERSION,
      preferences: updated,
    };

    await AsyncStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(envelope));
    return updated;
  },

  async resetPreferences(): Promise<BudgetPreferences> {
    const fresh: BudgetPreferences = {
      ...defaultBudgetPreferences,
      updatedAt: new Date().toISOString(),
    };
    const envelope: BudgetStorageEnvelope = {
      version: BUDGET_STORAGE_VERSION,
      preferences: fresh,
    };
    await AsyncStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(envelope));
    return fresh;
  },
};
