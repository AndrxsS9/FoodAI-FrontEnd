/**
 * Adaptador y repositorio de persistencia para el presupuesto compartido (Fase 2C).
 * Utiliza @react-native-async-storage/async-storage con versionado de esquema,
 * serialización FIFO contra escrituras concurrentes, respaldo ante datos corruptos
 * y protección estricta contra versiones futuras no soportadas.
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
  SaveBudgetPreferencesInput,
} from '../../types/budget';

export const BUDGET_STORAGE_KEY = '@foodai:budget_v1';
export const BUDGET_STORAGE_VERSION = 1;

export interface BudgetStorageEnvelope {
  version: number;
  updatedAt: string;
  preferences: BudgetPreferences;
}

export class BudgetStorageVersionError extends Error {
  readonly version: number;
  constructor(version: number) {
    super(
      `Versión de esquema no compatible (v${version}). La aplicación actual no puede modificar estos datos.`
    );
    this.name = 'BudgetStorageVersionError';
    this.version = version;
  }
}

export interface BudgetStorageCorruptionDetails {
  backupCreated: boolean;
  backupKey?: string;
  backupError?: string;
}

export class BudgetStorageCorruptionError extends Error {
  readonly rawPayload: string;
  readonly backupCreated: boolean;
  readonly backupKey?: string;
  readonly backupError?: string;

  constructor(
    message: string,
    rawPayload: string,
    details?: BudgetStorageCorruptionDetails
  ) {
    super(message);
    this.name = 'BudgetStorageCorruptionError';
    this.rawPayload = rawPayload;
    this.backupCreated = details?.backupCreated ?? false;
    this.backupKey = details?.backupKey;
    this.backupError = details?.backupError;
  }
}

export interface BudgetStorageAdapter {
  getPreferences(): Promise<BudgetPreferences>;
  savePreferences(input: SaveBudgetPreferencesInput): Promise<BudgetPreferences>;
  resetPreferences(): Promise<BudgetPreferences>;
}

export const defaultBudgetPreferences: BudgetPreferences = {
  budget: DEFAULT_BUDGET_COP,
  servings: DEFAULT_SERVINGS,
  updatedAt: new Date().toISOString(),
};

export type ParseBudgetEnvelopeResult =
  | { status: 'empty'; preferences: BudgetPreferences }
  | { status: 'valid'; version: number; preferences: BudgetPreferences }
  | { status: 'unsupported_future_version'; version: number; rawPayload: string }
  | { status: 'corrupt'; error: string; rawPayload: string };

export function sanitizeBudgetPreferences(input: unknown): BudgetPreferences {
  if (!input || typeof input !== 'object') {
    return { ...defaultBudgetPreferences, updatedAt: new Date().toISOString() };
  }

  const raw = input as Record<string, unknown>;

  let budget =
    typeof raw.budget === 'number' && Number.isFinite(raw.budget)
      ? raw.budget
      : DEFAULT_BUDGET_COP;
  if (budget < MIN_BUDGET_COP) budget = MIN_BUDGET_COP;
  if (budget > MAX_BUDGET_COP) budget = MAX_BUDGET_COP;

  let servings =
    typeof raw.servings === 'number' && Number.isInteger(raw.servings)
      ? raw.servings
      : DEFAULT_SERVINGS;
  if (servings < MIN_SERVINGS) servings = MIN_SERVINGS;
  if (servings > MAX_SERVINGS) servings = MAX_SERVINGS;

  let maxMinutes: number | undefined;
  if (typeof raw.maxMinutes === 'number' && Number.isInteger(raw.maxMinutes)) {
    if (raw.maxMinutes >= MIN_PREP_MINUTES && raw.maxMinutes <= MAX_PREP_MINUTES) {
      maxMinutes = raw.maxMinutes;
    }
  }

  const updatedAt =
    typeof raw.updatedAt === 'string' && !isNaN(Date.parse(raw.updatedAt))
      ? raw.updatedAt
      : new Date().toISOString();

  return {
    budget,
    servings,
    maxMinutes,
    updatedAt,
  };
}

export function parseStoredBudgetEnvelope(rawJson: string | null): ParseBudgetEnvelopeResult {
  if (!rawJson || rawJson.trim().length === 0) {
    return {
      status: 'empty',
      preferences: { ...defaultBudgetPreferences, updatedAt: new Date().toISOString() },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    return {
      status: 'corrupt',
      error: err instanceof Error ? err.message : 'Error al parsear JSON.',
      rawPayload: rawJson,
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      status: 'corrupt',
      error: 'El sobre de almacenamiento de presupuesto debe ser un objeto.',
      rawPayload: rawJson,
    };
  }

  const envelope = parsed as Record<string, unknown>;

  if (typeof envelope.version !== 'number' || !Number.isInteger(envelope.version)) {
    return {
      status: 'corrupt',
      error: 'La versión del sobre de almacenamiento debe ser un número entero.',
      rawPayload: rawJson,
    };
  }

  if (envelope.version > BUDGET_STORAGE_VERSION) {
    return {
      status: 'unsupported_future_version',
      version: envelope.version,
      rawPayload: rawJson,
    };
  }

  if (!envelope.preferences || typeof envelope.preferences !== 'object') {
    return {
      status: 'corrupt',
      error: 'El sobre no contiene un objeto de preferencias válido.',
      rawPayload: rawJson,
    };
  }

  const sanitized = sanitizeBudgetPreferences(envelope.preferences);

  return {
    status: 'valid',
    version: envelope.version,
    preferences: sanitized,
  };
}

export class AsyncStorageBudgetAdapter implements BudgetStorageAdapter {
  private storageKey: string;
  private mutationQueue: Promise<unknown> = Promise.resolve();

  constructor(storageKey: string = BUDGET_STORAGE_KEY) {
    this.storageKey = storageKey;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutationQueue.then(operation, operation);
    this.mutationQueue = next.catch(() => {});
    return next;
  }

  private async getPreferencesInternal(): Promise<BudgetPreferences> {
    try {
      const rawData = await AsyncStorage.getItem(this.storageKey);
      const parsed = parseStoredBudgetEnvelope(rawData);

      if (parsed.status === 'empty') {
        return { ...defaultBudgetPreferences, updatedAt: new Date().toISOString() };
      }

      if (parsed.status === 'unsupported_future_version') {
        throw new BudgetStorageVersionError(parsed.version);
      }

      if (parsed.status === 'corrupt') {
        const backupKey = `${this.storageKey}_backup_${Date.now()}`;
        let backupCreated = false;
        let backupError: string | undefined;

        try {
          await AsyncStorage.setItem(backupKey, parsed.rawPayload);
          backupCreated = true;
        } catch (err) {
          backupCreated = false;
          backupError = err instanceof Error ? err.message : String(err);
          console.warn(
            `[BudgetStorage] Advertencia: Fallo al crear la copia de respaldo en ${backupKey}:`,
            err
          );
        }

        const errorMessage = backupCreated
          ? `Almacenamiento corrupto: ${parsed.error}. Se preservó copia de respaldo en «${backupKey}». El payload original permanece intacto.`
          : `Almacenamiento corrupto: ${parsed.error}. No fue posible crear la copia de respaldo (${backupError}). El payload original permanece intacto.`;

        throw new BudgetStorageCorruptionError(errorMessage, parsed.rawPayload, {
          backupCreated,
          backupKey: backupCreated ? backupKey : undefined,
          backupError,
        });
      }

      return parsed.preferences;
    } catch (error) {
      if (
        error instanceof BudgetStorageVersionError ||
        error instanceof BudgetStorageCorruptionError
      ) {
        throw error;
      }
      console.error('[BudgetStorage] Error al leer el presupuesto desde AsyncStorage:', error);
      throw new Error('No fue posible cargar las preferencias de presupuesto desde el almacenamiento local.');
    }
  }

  async getPreferences(): Promise<BudgetPreferences> {
    return this.enqueue(() => this.getPreferencesInternal());
  }

  private async savePreferencesInternal(
    input: SaveBudgetPreferencesInput
  ): Promise<BudgetPreferences> {
    const current = await this.getPreferencesInternal();

    // Determinar nuevo maxMinutes según semántica explícita:
    // 1. Si resetMaxMinutes === true o maxMinutes === null -> se desactiva (undefined)
    // 2. Si maxMinutes es un número válido -> se actualiza
    // 3. Si maxMinutes es undefined y no se solicitó reset -> se mantiene el actual
    let updatedMaxMinutes: number | undefined;
    if (input.resetMaxMinutes === true || input.maxMinutes === null) {
      updatedMaxMinutes = undefined;
    } else if (input.maxMinutes !== undefined) {
      updatedMaxMinutes = input.maxMinutes;
    } else {
      updatedMaxMinutes = current.maxMinutes;
    }

    const updated = sanitizeBudgetPreferences({
      budget: input.budget !== undefined ? input.budget : current.budget,
      servings: input.servings !== undefined ? input.servings : current.servings,
      maxMinutes: updatedMaxMinutes,
      updatedAt: new Date().toISOString(),
    });

    const envelope: BudgetStorageEnvelope = {
      version: BUDGET_STORAGE_VERSION,
      updatedAt: updated.updatedAt,
      preferences: updated,
    };

    await AsyncStorage.setItem(this.storageKey, JSON.stringify(envelope));
    return updated;
  }

  async savePreferences(input: SaveBudgetPreferencesInput): Promise<BudgetPreferences> {
    return this.enqueue(() => this.savePreferencesInternal(input));
  }

  private async resetPreferencesInternal(): Promise<BudgetPreferences> {
    // Validar versión y estado de integridad previos antes de sobreescribir
    await this.getPreferencesInternal();

    const fresh: BudgetPreferences = {
      ...defaultBudgetPreferences,
      updatedAt: new Date().toISOString(),
    };
    const envelope: BudgetStorageEnvelope = {
      version: BUDGET_STORAGE_VERSION,
      updatedAt: fresh.updatedAt,
      preferences: fresh,
    };
    await AsyncStorage.setItem(this.storageKey, JSON.stringify(envelope));
    return fresh;
  }

  async resetPreferences(): Promise<BudgetPreferences> {
    return this.enqueue(() => this.resetPreferencesInternal());
  }
}

export const budgetStorage = new AsyncStorageBudgetAdapter();
