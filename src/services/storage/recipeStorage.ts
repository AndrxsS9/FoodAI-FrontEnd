/**
 * FoodAI - Persistencia local segura de recetas reales generadas (Bloque 5).
 *
 * Guarda la última colección de recomendaciones REALES de un usuario autenticado para
 * restaurarla tras un reinicio en frío, sin volver a invocar a Gemini.
 *
 * Garantías:
 * - Clave aislada por usuario (`@foodai:<userId>:recipes_v1`); sin usuario no existe adaptador.
 * - Sobre versionado con propietario explícito, verificado al restaurar.
 * - Serialización por lista blanca: solo campos conocidos de ClientRecipe. Nunca se escriben
 *   tokens, sesiones ni campos ajenos, ni fuentes de imagen empaquetadas (`require()`).
 * - Validación estricta al restaurar: cualquier receta demo, identidad incoherente o campo
 *   malformado invalida la colección completa (no se muestran datos parciales).
 * - Los datos corruptos o de versión futura nunca se borran ni se sobrescriben en silencio:
 *   la lectura no modifica nada y la escritura respalda (o se niega) antes de reemplazarlos.
 * - Cola FIFO compartida por clave y orden lógico de escritura (independiente del reloj del
 *   dispositivo): una generación anterior nunca reemplaza a una posterior ya persistida.
 *
 * Orden lógico (Bloque 5B): cada generación aceptada reserva un ticket monotónico por clave
 * (`reserveWriteOrder`) en el instante en que se acepta, en memoria del proceso y compartido por
 * todas las instancias del adaptador (sobrevive a remontajes de proveedores). Dentro de la cola,
 * una escritura cuyo ticket es menor que el mayor ya escrito se omite. Tras un reinicio en frío
 * el proceso anterior ya no puede escribir, así que toda generación del proceso nuevo es posterior
 * a lo persistido aunque su ticket vuelva a empezar: no se requiere un contador persistido ni
 * cambio de esquema. `generatedAt` se conserva solo para presentación.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ClientRecipe,
  RecipeIngredient,
  RecipeMissingIngredient,
  StepDuration,
  isSecureRemoteImageUrl,
} from '../../types/recipe';
import { isRecipeImageKey } from '../../types/recipeImage';

export const RECIPE_STORAGE_VERSION = 1;
export const MAX_PERSISTED_RECIPES = 50;

export function getRecipeStorageKey(userId: string): string {
  return `@foodai:${userId}:recipes_v1`;
}

/** Datos de entrada usados en la generación, base de la detección de obsolescencia. */
export interface RecipeGenerationSnapshot {
  pantryFingerprint: string;
  budget: number;
  servings: number;
  maxMinutes?: number;
}

export interface PersistedRecipeCollection {
  generationId: string;
  generatedAt: string;
  snapshot: RecipeGenerationSnapshot;
  recipes: ClientRecipe[];
}

export interface RecipeStorageEnvelope {
  version: number;
  ownerUserId: string;
  savedAt: string;
  generation: {
    generationId: string;
    generatedAt: string;
    snapshot: RecipeGenerationSnapshot;
  };
  recipes: unknown[];
}

export type RecipeStorageLoadResult =
  | { status: 'empty' }
  | { status: 'valid'; collection: PersistedRecipeCollection }
  | { status: 'unsupported_version'; version: number }
  | { status: 'corrupt'; error: string };

export type RecipeStorageSaveResult =
  | { status: 'saved'; backupKey?: string }
  | { status: 'skipped_older' };

export type RecipeStorageWriteBlockReason = 'invalid_collection' | 'unsupported_version' | 'backup_failed';

export class RecipeStorageWriteBlockedError extends Error {
  readonly reason: RecipeStorageWriteBlockReason;
  constructor(message: string, reason: RecipeStorageWriteBlockReason) {
    super(message);
    this.name = 'RecipeStorageWriteBlockedError';
    this.reason = reason;
    Object.setPrototypeOf(this, RecipeStorageWriteBlockedError.prototype);
  }
}

// ==========================================
// Validadores de bajo nivel
// ==========================================

type Rec = Record<string, unknown>;

function isPlainObject(value: unknown): value is Rec {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isIsoDate(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function isOptionalNonNegative(value: unknown): boolean {
  return value === undefined || (isFiniteNumber(value) && value >= 0);
}

export function isValidGenerationSnapshot(value: unknown): value is RecipeGenerationSnapshot {
  if (!isPlainObject(value)) return false;
  return (
    typeof value.pantryFingerprint === 'string' &&
    isFiniteNumber(value.budget) &&
    value.budget >= 0 &&
    isFiniteNumber(value.servings) &&
    Number.isInteger(value.servings) &&
    value.servings > 0 &&
    (value.maxMinutes === undefined || (isFiniteNumber(value.maxMinutes) && value.maxMinutes > 0))
  );
}

function parseIngredient(value: unknown, withCost: boolean): RecipeMissingIngredient | null {
  if (!isPlainObject(value)) return null;
  if (typeof value.name !== 'string') return null;
  if (!(value.quantity === null || isFiniteNumber(value.quantity))) return null;
  if (typeof value.unit !== 'string') return null;
  if (!(value.needsReview === undefined || typeof value.needsReview === 'boolean')) return null;

  const ingredient: RecipeMissingIngredient = {
    name: value.name,
    quantity: value.quantity as number | null,
    unit: value.unit,
  };
  if (value.needsReview !== undefined) ingredient.needsReview = value.needsReview as boolean;

  if (withCost && value.estimatedCost !== undefined) {
    if (!isFiniteNumber(value.estimatedCost) || value.estimatedCost < 0) return null;
    ingredient.estimatedCost = value.estimatedCost;
  }
  return ingredient;
}

function parseIngredientList(value: unknown, withCost: boolean): RecipeMissingIngredient[] | null {
  if (!Array.isArray(value)) return null;
  const parsed: RecipeMissingIngredient[] = [];
  for (const item of value) {
    const ing = parseIngredient(item, withCost);
    if (!ing) return null;
    parsed.push(ing);
  }
  return parsed;
}

function parseStepDurations(value: unknown): StepDuration[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;
  const parsed: StepDuration[] = [];
  for (const sd of value) {
    if (!isPlainObject(sd) || !isFiniteNumber(sd.stepIndex)) return null;
    if (!isOptionalNonNegative(sd.minutes)) return null;
    if (!(sd.action === undefined || typeof sd.action === 'string')) return null;
    parsed.push({
      stepIndex: sd.stepIndex,
      ...(sd.minutes !== undefined ? { minutes: sd.minutes as number } : {}),
      ...(sd.action !== undefined ? { action: sd.action as string } : {}),
    });
  }
  return parsed;
}

/**
 * Reconstruye una receta persistida por lista blanca. Devuelve null si cualquier campo
 * es inválido, si no es una receta real o si su identidad no corresponde a la generación.
 */
export function parsePersistedRecipe(value: unknown, generationId: string): ClientRecipe | null {
  if (!isPlainObject(value)) return null;

  // Una receta demo (o sin bandera explícita) contamina la colección autenticada.
  if (value.isDemoFixture !== false) return null;

  if (!isNonEmptyString(value.id) || !isNonEmptyString(value.name)) return null;
  if (value.generationId !== generationId) return null;
  // Identidad de preparación usada por el ledger de consumo: debe ser exacta.
  if (value.instanceId !== `${value.id}::${generationId}`) return null;

  if (typeof value.description !== 'string' || typeof value.reason !== 'string') return null;
  if (!isFiniteNumber(value.totalMinutes) || value.totalMinutes <= 0) return null;
  if (!isFiniteNumber(value.servings) || value.servings <= 0) return null;
  if (!isOptionalNonNegative(value.prepMinutes) || !isOptionalNonNegative(value.cookMinutes)) return null;
  if (!isFiniteNumber(value.estimatedMissingCost) || value.estimatedMissingCost < 0) return null;
  if (!isFiniteNumber(value.budgetRemaining)) return null;
  if (typeof value.withinBudget !== 'boolean') return null;
  if (!(typeof value.convenience === 'string' || isFiniteNumber(value.convenience))) return null;

  if (!Array.isArray(value.steps) || !value.steps.every((s) => typeof s === 'string')) return null;

  const ingredients = parseIngredientList(value.ingredients, false);
  const availableIngredients = parseIngredientList(value.availableIngredients, false);
  const missingIngredients = parseIngredientList(value.missingIngredients, true);
  if (!ingredients || !availableIngredients || !missingIngredients) return null;

  const stepDurations = parseStepDurations(value.stepDurations);
  if (stepDurations === null) return null;

  // Imagen: solo URL remota segura en texto. Cualquier otro tipo indica manipulación.
  if (value.imageUrl !== undefined && value.imageUrl !== null && !isSecureRemoteImageUrl(value.imageUrl)) {
    return null;
  }
  // imageKey: texto. Una categoría desconocida (p. ej. de otra versión del catálogo) se
  // degrada a null y el catálogo la resuelve por nombre/ingredientes.
  if (!(value.imageKey === undefined || value.imageKey === null || typeof value.imageKey === 'string')) {
    return null;
  }
  const imageKey = isRecipeImageKey(value.imageKey) ? value.imageKey : null;

  const recipe: ClientRecipe = {
    id: value.id,
    instanceId: value.instanceId as string,
    generationId,
    name: value.name,
    description: value.description,
    totalMinutes: value.totalMinutes,
    servings: value.servings,
    ingredients: ingredients as RecipeIngredient[],
    steps: value.steps as string[],
    availableIngredients: availableIngredients as RecipeIngredient[],
    missingIngredients,
    estimatedMissingCost: value.estimatedMissingCost,
    budgetRemaining: value.budgetRemaining,
    withinBudget: value.withinBudget,
    convenience: value.convenience as string | number,
    reason: value.reason,
    isDemoFixture: false,
    imageKey,
  };
  if (value.prepMinutes !== undefined) recipe.prepMinutes = value.prepMinutes as number;
  if (value.cookMinutes !== undefined) recipe.cookMinutes = value.cookMinutes as number;
  if (stepDurations !== undefined) recipe.stepDurations = stepDurations;
  if (typeof value.imageUrl === 'string') recipe.imageUrl = value.imageUrl.trim();
  return recipe;
}

/**
 * Proyección por lista blanca de una receta en memoria a su forma persistible (JSON puro).
 * Descarta fuentes de imagen no textuales y cualquier campo no reconocido.
 */
export function toPersistableRecipe(recipe: ClientRecipe): Rec {
  const out: Rec = {
    id: recipe.id,
    instanceId: recipe.instanceId,
    generationId: recipe.generationId,
    name: recipe.name,
    description: recipe.description,
    totalMinutes: recipe.totalMinutes,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    stepDurations: recipe.stepDurations,
    servings: recipe.servings,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    availableIngredients: recipe.availableIngredients,
    missingIngredients: recipe.missingIngredients,
    estimatedMissingCost: recipe.estimatedMissingCost,
    budgetRemaining: recipe.budgetRemaining,
    withinBudget: recipe.withinBudget,
    convenience: recipe.convenience,
    reason: recipe.reason,
    isDemoFixture: recipe.isDemoFixture,
    imageKey: recipe.imageKey ?? null,
  };
  if (typeof recipe.imageUrl === 'string' && isSecureRemoteImageUrl(recipe.imageUrl)) {
    out.imageUrl = recipe.imageUrl.trim();
  }
  // Ida y vuelta JSON: elimina undefined y garantiza datos serializables puros.
  return JSON.parse(JSON.stringify(out)) as Rec;
}

/**
 * Valida una colección antes de escribirla. La misma validación estricta de lectura se
 * aplica a la escritura para no persistir nunca algo que no se podría restaurar.
 */
export function validateCollectionForSave(collection: PersistedRecipeCollection): string | null {
  if (!isNonEmptyString(collection.generationId)) return 'generationId ausente o inválido.';
  if (!isIsoDate(collection.generatedAt)) return 'generatedAt ausente o inválido.';
  if (!isValidGenerationSnapshot(collection.snapshot)) return 'Snapshot de generación inválido.';
  if (!Array.isArray(collection.recipes) || collection.recipes.length > MAX_PERSISTED_RECIPES) {
    return 'Colección de recetas inválida.';
  }
  const ids = new Set<string>();
  for (const recipe of collection.recipes) {
    const persisted = toPersistableRecipe(recipe);
    if (!parsePersistedRecipe(persisted, collection.generationId)) {
      return `La receta «${String(recipe?.id)}» no es una receta real válida para persistir.`;
    }
    if (ids.has(recipe.id)) return `Identificador de receta duplicado «${recipe.id}».`;
    ids.add(recipe.id);
  }
  return null;
}

/** Interpreta el contenido crudo almacenado sin efectos secundarios. */
export function parseRecipeStorageEnvelope(
  rawJson: string | null,
  expectedOwnerUserId: string
): RecipeStorageLoadResult {
  if (rawJson === null || rawJson === undefined) return { status: 'empty' };
  if (typeof rawJson !== 'string' || rawJson.trim().length === 0) {
    return { status: 'corrupt', error: 'Contenido almacenado vacío o no textual.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    return { status: 'corrupt', error: err instanceof Error ? err.message : 'JSON inválido.' };
  }

  if (!isPlainObject(parsed)) return { status: 'corrupt', error: 'El sobre debe ser un objeto.' };

  if (!isFiniteNumber(parsed.version) || !Number.isInteger(parsed.version) || parsed.version < 1) {
    return { status: 'corrupt', error: 'Versión de esquema ausente o inválida.' };
  }
  if (parsed.version !== RECIPE_STORAGE_VERSION) {
    return { status: 'unsupported_version', version: parsed.version };
  }

  if (parsed.ownerUserId !== expectedOwnerUserId) {
    return { status: 'corrupt', error: 'El propietario almacenado no coincide con el usuario activo.' };
  }

  const generation = parsed.generation;
  if (!isPlainObject(generation)) return { status: 'corrupt', error: 'Metadatos de generación ausentes.' };
  if (!isNonEmptyString(generation.generationId)) {
    return { status: 'corrupt', error: 'generationId ausente o inválido.' };
  }
  if (!isIsoDate(generation.generatedAt)) {
    return { status: 'corrupt', error: 'generatedAt ausente o inválido.' };
  }
  if (!isValidGenerationSnapshot(generation.snapshot)) {
    return { status: 'corrupt', error: 'Snapshot de generación inválido.' };
  }

  if (!Array.isArray(parsed.recipes) || parsed.recipes.length > MAX_PERSISTED_RECIPES) {
    return { status: 'corrupt', error: 'Listado de recetas inválido.' };
  }

  const recipes: ClientRecipe[] = [];
  const ids = new Set<string>();
  for (const raw of parsed.recipes) {
    const recipe = parsePersistedRecipe(raw, generation.generationId);
    if (!recipe) {
      return { status: 'corrupt', error: 'La colección contiene una receta inválida o de demostración.' };
    }
    if (ids.has(recipe.id)) {
      return { status: 'corrupt', error: `Identificador de receta duplicado «${recipe.id}».` };
    }
    ids.add(recipe.id);
    recipes.push(recipe);
  }

  const snapshot = generation.snapshot as RecipeGenerationSnapshot;
  return {
    status: 'valid',
    collection: {
      generationId: generation.generationId,
      generatedAt: generation.generatedAt,
      snapshot: {
        pantryFingerprint: snapshot.pantryFingerprint,
        budget: snapshot.budget,
        servings: snapshot.servings,
        ...(snapshot.maxMinutes !== undefined ? { maxMinutes: snapshot.maxMinutes } : {}),
      },
      recipes,
    },
  };
}

// ==========================================
// Adaptador
// ==========================================

export interface RecipeStorageAdapter {
  /** Lee la colección persistida. No modifica el almacenamiento. Lanza ante fallos de I/O. */
  load(): Promise<RecipeStorageLoadResult>;
  /**
   * Reserva el orden lógico de una generación en el momento en que se acepta. Debe llamarse
   * de forma síncrona al aceptar la generación y pasarse a `save`.
   */
  reserveWriteOrder(): number;
  /**
   * Persiste una colección real. Lanza ante fallos de I/O, validación o escritura bloqueada.
   * Sin `order` explícito se reserva uno al invocar (orden de llamada).
   */
  save(collection: PersistedRecipeCollection, order?: number): Promise<RecipeStorageSaveResult>;
}

/**
 * Colas FIFO compartidas por clave de almacenamiento: los proveedores se remontan por sesión,
 * por lo que varias instancias del adaptador del mismo usuario comparten una sola cola.
 */
const queuesByStorageKey = new Map<string, Promise<unknown>>();
/** Último ticket reservado por clave (monotónico dentro del proceso). */
const lastReservedOrderByKey = new Map<string, number>();
/** Mayor ticket cuya escritura se intentó por clave en este proceso (escrita o fallida). */
const highestAttemptedOrderByKey = new Map<string, number>();

export class AsyncStorageRecipeAdapter implements RecipeStorageAdapter {
  readonly ownerUserId: string;
  readonly storageKey: string;

  constructor(ownerUserId: string) {
    if (!isNonEmptyString(ownerUserId)) {
      throw new Error('El adaptador de recetas requiere un usuario autenticado.');
    }
    this.ownerUserId = ownerUserId;
    this.storageKey = getRecipeStorageKey(ownerUserId);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const previous = queuesByStorageKey.get(this.storageKey) ?? Promise.resolve();
    const next = previous.then(operation, operation);
    queuesByStorageKey.set(
      this.storageKey,
      next.catch(() => {})
    );
    return next;
  }

  load(): Promise<RecipeStorageLoadResult> {
    return this.enqueue(async () => {
      const raw = await AsyncStorage.getItem(this.storageKey);
      return parseRecipeStorageEnvelope(raw, this.ownerUserId);
    });
  }

  reserveWriteOrder(): number {
    const next = (lastReservedOrderByKey.get(this.storageKey) ?? 0) + 1;
    lastReservedOrderByKey.set(this.storageKey, next);
    return next;
  }

  save(collection: PersistedRecipeCollection, order?: number): Promise<RecipeStorageSaveResult> {
    const writeOrder = order ?? this.reserveWriteOrder();
    return this.enqueue(async () => {
      // Orden lógico, no de reloj: una generación aceptada antes nunca reemplaza a una posterior.
      if (writeOrder < (highestAttemptedOrderByKey.get(this.storageKey) ?? 0)) {
        return { status: 'skipped_older' } as const;
      }
      // Se marca como intentada antes de cualquier I/O: si esta escritura más reciente falla,
      // una escritura anterior retrasada tampoco puede restaurar una generación ya superada.
      highestAttemptedOrderByKey.set(this.storageKey, writeOrder);

      const validationError = validateCollectionForSave(collection);
      if (validationError) {
        throw new RecipeStorageWriteBlockedError(
          `Colección no persistible: ${validationError}`,
          'invalid_collection'
        );
      }

      const existingRaw = await AsyncStorage.getItem(this.storageKey);
      const existing = parseRecipeStorageEnvelope(existingRaw, this.ownerUserId);
      let backupKey: string | undefined;

      if (existing.status === 'unsupported_version') {
        // Datos de una versión que esta app no entiende: nunca se sobrescriben.
        throw new RecipeStorageWriteBlockedError(
          `Existe una colección con versión de esquema no soportada (v${existing.version}); no se sobrescribe.`,
          'unsupported_version'
        );
      }

      if (existing.status === 'corrupt' && existingRaw !== null) {
        // Preservar el original antes de reemplazarlo; sin respaldo no hay sobrescritura.
        backupKey = `${this.storageKey}_backup_${Date.now()}`;
        try {
          await AsyncStorage.setItem(backupKey, existingRaw);
        } catch {
          throw new RecipeStorageWriteBlockedError(
            'No se pudo respaldar la colección corrupta existente; se cancela la escritura.',
            'backup_failed'
          );
        }
      }

      const envelope: RecipeStorageEnvelope = {
        version: RECIPE_STORAGE_VERSION,
        ownerUserId: this.ownerUserId,
        savedAt: new Date().toISOString(),
        generation: {
          generationId: collection.generationId,
          generatedAt: collection.generatedAt,
          snapshot: collection.snapshot,
        },
        recipes: collection.recipes.map(toPersistableRecipe),
      };
      await AsyncStorage.setItem(this.storageKey, JSON.stringify(envelope));
      return backupKey ? { status: 'saved', backupKey } : { status: 'saved' };
    });
  }
}

/** Sin usuario autenticado no hay persistencia de recetas. */
export function createRecipeStorage(userId: string | null | undefined): RecipeStorageAdapter | null {
  return isNonEmptyString(userId) ? new AsyncStorageRecipeAdapter(userId) : null;
}
