/**
 * Adaptador y repositorio de persistencia para el Plan de Comidas de 3 Días (Fase 3C).
 * Utiliza @react-native-async-storage/async-storage con versionado de esquema,
 * validación estricta de integridad, cola FIFO contra escrituras concurrentes
 * y respaldo protector ante datos corruptos.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ClientMealPlan,
  MealPlanGenerationSnapshot,
} from '../../types/mealPlan';

export const MEAL_PLAN_STORAGE_KEY = '@foodai:meal_plan_v1';
export const MEAL_PLAN_STORAGE_VERSION = 1;

export interface MealPlanStorageEnvelope {
  version: number;
  updatedAt: string;
  plan: ClientMealPlan;
  snapshot: MealPlanGenerationSnapshot;
}

export class MealPlanStorageVersionError extends Error {
  readonly version: number;
  constructor(version: number) {
    super(
      `Versión de esquema del plan no compatible (v${version}). La aplicación actual no puede cargar estos datos.`
    );
    this.name = 'MealPlanStorageVersionError';
    this.version = version;
  }
}

export class MealPlanStorageCorruptionError extends Error {
  readonly rawPayload: string;
  readonly backupCreated: boolean;
  readonly backupKey?: string;

  constructor(
    message: string,
    rawPayload: string,
    backupCreated: boolean = false,
    backupKey?: string
  ) {
    super(message);
    this.name = 'MealPlanStorageCorruptionError';
    this.rawPayload = rawPayload;
    this.backupCreated = backupCreated;
    this.backupKey = backupKey;
  }
}

export type ParseMealPlanEnvelopeResult =
  | { status: 'empty' }
  | { status: 'valid'; version: number; plan: ClientMealPlan; snapshot: MealPlanGenerationSnapshot }
  | { status: 'unsupported_future_version'; version: number; rawPayload: string }
  | { status: 'corrupt'; error: string; rawPayload: string };

/**
 * Valida la integridad estructural de un ClientMealPlan recuperado del almacenamiento.
 */
export function isValidPersistedPlan(plan: unknown): plan is ClientMealPlan {
  if (!plan || typeof plan !== 'object') return false;
  const p = plan as Record<string, unknown>;

  if (!Array.isArray(p.days) || p.days.length !== 3) return false;
  if (typeof p.totalEstimatedMissingCost !== 'number' || !Number.isFinite(p.totalEstimatedMissingCost)) return false;
  if (typeof p.budgetRemaining !== 'number' || !Number.isFinite(p.budgetRemaining)) return false;
  if (typeof p.withinBudget !== 'boolean') return false;
  if (!Array.isArray(p.uniqueMissingIngredients)) return false;

  for (let i = 0; i < 3; i++) {
    const day = p.days[i];
    if (!day || typeof day !== 'object') return false;
    if (day.day !== i + 1) return false;
    if (!day.recipe || typeof day.recipe !== 'object') return false;
    if (!day.recipe.id || !day.recipe.name) return false;
    if (!Array.isArray(day.recipe.ingredients) || !Array.isArray(day.recipe.steps)) return false;
  }

  return true;
}

/**
 * Valida la integridad del snapshot de generación.
 */
export function isValidPersistedSnapshot(snapshot: unknown): snapshot is MealPlanGenerationSnapshot {
  if (!snapshot || typeof snapshot !== 'object') return false;
  const s = snapshot as Record<string, unknown>;
  return (
    typeof s.pantryFingerprint === 'string' &&
    typeof s.budget === 'number' &&
    typeof s.servings === 'number' &&
    typeof s.generatedAt === 'string'
  );
}

export function parseStoredMealPlanEnvelope(rawJson: string | null): ParseMealPlanEnvelopeResult {
  if (!rawJson || rawJson.trim().length === 0) {
    return { status: 'empty' };
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
      error: 'El sobre de almacenamiento de plan de comidas debe ser un objeto.',
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

  if (envelope.version > MEAL_PLAN_STORAGE_VERSION) {
    return {
      status: 'unsupported_future_version',
      version: envelope.version,
      rawPayload: rawJson,
    };
  }

  if (!isValidPersistedPlan(envelope.plan)) {
    return {
      status: 'corrupt',
      error: 'El sobre contiene un plan de comidas inválido o incompleto.',
      rawPayload: rawJson,
    };
  }

  if (!isValidPersistedSnapshot(envelope.snapshot)) {
    return {
      status: 'corrupt',
      error: 'El sobre contiene un snapshot de generación inválido.',
      rawPayload: rawJson,
    };
  }

  return {
    status: 'valid',
    version: envelope.version,
    plan: envelope.plan,
    snapshot: envelope.snapshot,
  };
}

export interface MealPlanStorageAdapter {
  getStoredMealPlan(): Promise<{ plan: ClientMealPlan; snapshot: MealPlanGenerationSnapshot } | null>;
  saveMealPlan(plan: ClientMealPlan, snapshot: MealPlanGenerationSnapshot): Promise<void>;
  clearMealPlan(): Promise<void>;
}

export class AsyncStorageMealPlanAdapter implements MealPlanStorageAdapter {
  private storageKey: string;
  private mutationQueue: Promise<unknown> = Promise.resolve();

  constructor(storageKey: string = MEAL_PLAN_STORAGE_KEY) {
    this.storageKey = storageKey;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutationQueue.then(operation, operation);
    this.mutationQueue = next.catch(() => {});
    return next;
  }

  private async getStoredMealPlanInternal(): Promise<{
    plan: ClientMealPlan;
    snapshot: MealPlanGenerationSnapshot;
  } | null> {
    try {
      const rawData = await AsyncStorage.getItem(this.storageKey);
      const parsed = parseStoredMealPlanEnvelope(rawData);

      if (parsed.status === 'empty') {
        return null;
      }

      if (parsed.status === 'unsupported_future_version') {
        throw new MealPlanStorageVersionError(parsed.version);
      }

      if (parsed.status === 'corrupt') {
        const backupKey = `${this.storageKey}_backup_${Date.now()}`;
        let backupCreated = false;

        try {
          await AsyncStorage.setItem(backupKey, parsed.rawPayload);
          backupCreated = true;
        } catch (err) {
          console.warn(
            `[MealPlanStorage] Advertencia: Fallo al crear la copia de respaldo en ${backupKey}:`,
            err
          );
        }

        const errorMessage = backupCreated
          ? `Almacenamiento del plan corrupto: ${parsed.error}. Se preservó copia de respaldo en «${backupKey}».`
          : `Almacenamiento del plan corrupto: ${parsed.error}.`;

        throw new MealPlanStorageCorruptionError(
          errorMessage,
          parsed.rawPayload,
          backupCreated,
          backupCreated ? backupKey : undefined
        );
      }

      return {
        plan: parsed.plan,
        snapshot: parsed.snapshot,
      };
    } catch (error) {
      if (
        error instanceof MealPlanStorageVersionError ||
        error instanceof MealPlanStorageCorruptionError
      ) {
        throw error;
      }
      console.error('[MealPlanStorage] Error al leer el plan de comidas desde AsyncStorage:', error);
      throw new Error('No fue posible cargar el plan de comidas desde el almacenamiento local.');
    }
  }

  async getStoredMealPlan(): Promise<{
    plan: ClientMealPlan;
    snapshot: MealPlanGenerationSnapshot;
  } | null> {
    return this.enqueue(() => this.getStoredMealPlanInternal());
  }

  private async saveMealPlanInternal(
    plan: ClientMealPlan,
    snapshot: MealPlanGenerationSnapshot
  ): Promise<void> {
    const envelope: MealPlanStorageEnvelope = {
      version: MEAL_PLAN_STORAGE_VERSION,
      updatedAt: new Date().toISOString(),
      plan,
      snapshot,
    };

    await AsyncStorage.setItem(this.storageKey, JSON.stringify(envelope));
  }

  async saveMealPlan(
    plan: ClientMealPlan,
    snapshot: MealPlanGenerationSnapshot
  ): Promise<void> {
    return this.enqueue(() => this.saveMealPlanInternal(plan, snapshot));
  }

  private async clearMealPlanInternal(): Promise<void> {
    await AsyncStorage.removeItem(this.storageKey);
  }

  async clearMealPlan(): Promise<void> {
    return this.enqueue(() => this.clearMealPlanInternal());
  }
}

export function getMealPlanStorageKey(userId?: string | null): string {
  return userId ? `@foodai:${userId}:meal_plan_v1` : MEAL_PLAN_STORAGE_KEY;
}

export function createMealPlanStorage(userId?: string | null): MealPlanStorageAdapter {
  return new AsyncStorageMealPlanAdapter(getMealPlanStorageKey(userId));
}

export const mealPlanStorage = new AsyncStorageMealPlanAdapter();

