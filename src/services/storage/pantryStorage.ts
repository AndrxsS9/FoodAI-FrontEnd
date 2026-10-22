/**
 * Repositorio y adaptador de almacenamiento local para la despensa de FoodAI (Fase 2B).
 * Utiliza @react-native-async-storage/async-storage con versionado de esquema estricto,
 * validación estructural, serialización de operaciones contra escrituras concurrentes,
 * soporte explícito para eliminación de fechas de vencimiento y respaldo ante datos corruptos.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CreateIngredientInput,
  INGREDIENT_CATEGORIES,
  INGREDIENT_UNITS,
  Ingredient,
  IngredientCategory,
  IngredientUnit,
  UpdateIngredientInput,
} from '../../types/pantry';
import {
  MAX_INGREDIENT_NAME_LENGTH,
  MIN_INGREDIENT_NAME_LENGTH,
  isValidDateString,
  isValidIsoTimestamp,
  isValidQuantityValue,
} from '../../utils/pantryValidation';

export const PANTRY_STORAGE_KEY = '@foodai:pantry_v1';
export const PANTRY_STORAGE_VERSION = 1;

export interface PantryStorageEnvelope {
  version: number;
  updatedAt: string;
  ingredients: Ingredient[];
  quarantinedRecords?: unknown[];
}

export interface PantryStorageAdapter {
  getIngredients(): Promise<Ingredient[]>;
  saveIngredients(ingredients: Ingredient[]): Promise<void>;
  addIngredient(input: CreateIngredientInput): Promise<Ingredient>;
  updateIngredient(input: UpdateIngredientInput): Promise<Ingredient>;
  deleteIngredient(id: string): Promise<void>;
  clearIngredients(): Promise<void>;
  adjustQuantity?(id: string, delta: number): Promise<Ingredient>;
}

export class PantryStorageVersionError extends Error {
  readonly version: number;
  constructor(version: number) {
    super(
      `Versión de esquema no compatible (v${version}). La aplicación actual no puede modificar estos datos.`
    );
    this.name = 'PantryStorageVersionError';
    this.version = version;
  }
}

export class PantryStorageCorruptionError extends Error {
  readonly rawPayload: string;
  constructor(message: string, rawPayload: string) {
    super(message);
    this.name = 'PantryStorageCorruptionError';
    this.rawPayload = rawPayload;
  }
}

/**
 * Validador estricto para asegurar que un registro recuperado de almacenamiento
 * cumple con la estructura requerida por el modelo de ingredientes.
 */
export function isValidStoredIngredient(item: unknown): item is Ingredient {
  if (!item || typeof item !== 'object') {
    return false;
  }

  const record = item as Record<string, unknown>;

  // Validación de id
  if (
    typeof record.id !== 'string' ||
    record.id.trim().length === 0 ||
    record.id.length > 100
  ) {
    return false;
  }

  // Validación de nombre
  if (
    typeof record.name !== 'string' ||
    record.name.trim().length < MIN_INGREDIENT_NAME_LENGTH ||
    record.name.trim().length > MAX_INGREDIENT_NAME_LENGTH
  ) {
    return false;
  }

  // Validación de cantidad
  if (
    typeof record.quantity !== 'number' ||
    !isValidQuantityValue(record.quantity)
  ) {
    return false;
  }

  // Validación de unidad
  if (
    typeof record.unit !== 'string' ||
    !INGREDIENT_UNITS.includes(record.unit as IngredientUnit)
  ) {
    return false;
  }

  // Validación de categoría
  if (
    typeof record.category !== 'string' ||
    !INGREDIENT_CATEGORIES.includes(record.category as IngredientCategory)
  ) {
    return false;
  }

  // Validación de fecha de vencimiento opcional
  if (record.expirationDate !== undefined && record.expirationDate !== null) {
    if (
      typeof record.expirationDate !== 'string' ||
      !isValidDateString(record.expirationDate)
    ) {
      return false;
    }
  }

  // Validación de timestamps opcionales
  if (record.createdAt !== undefined && record.createdAt !== null) {
    if (typeof record.createdAt !== 'string') return false;
    if (
      record.createdAt.trim() !== '' &&
      !isValidIsoTimestamp(record.createdAt)
    ) {
      return false;
    }
  }

  if (record.updatedAt !== undefined && record.updatedAt !== null) {
    if (typeof record.updatedAt !== 'string') return false;
    if (
      record.updatedAt.trim() !== '' &&
      !isValidIsoTimestamp(record.updatedAt)
    ) {
      return false;
    }
  }

  return true;
}

export type StorageEnvelopeParseResult =
  | { status: 'empty'; ingredients: []; quarantined: [] }
  | { status: 'corrupt'; error: string; rawPayload: string }
  | { status: 'unsupported_future_version'; version: number; rawPayload: string }
  | {
      status: 'valid' | 'legacy';
      version: number;
      ingredients: Ingredient[];
      quarantined: unknown[];
    };

/**
 * Parsea e inspecciona la estructura del almacenamiento distinguiendo entre
 * vacío, sobre válido v1, formato legado de arreglo plano, versiones futuras no compatibles y datos corruptos.
 */
export function parseStoredIngredientsEnvelope(
  rawJson: string | null
): StorageEnvelopeParseResult {
  if (!rawJson || typeof rawJson !== 'string' || rawJson.trim() === '') {
    return { status: 'empty', ingredients: [], quarantined: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    return {
      status: 'corrupt',
      error: error instanceof Error ? error.message : 'JSON malformado',
      rawPayload: rawJson,
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      status: 'corrupt',
      error: 'El contenido raíz de almacenamiento no es un objeto válido.',
      rawPayload: rawJson,
    };
  }

  // 1. Sobre versionado: { version: number, ingredients: [...] }
  if (
    !Array.isArray(parsed) &&
    'version' in (parsed as Record<string, unknown>)
  ) {
    const envelope = parsed as Record<string, unknown>;
    const version = envelope.version;

    if (
      typeof version !== 'number' ||
      !Number.isInteger(version) ||
      version <= 0
    ) {
      return {
        status: 'corrupt',
        error:
          'El número de versión en el sobre de almacenamiento es inválido.',
        rawPayload: rawJson,
      };
    }

    if (version > PANTRY_STORAGE_VERSION) {
      return {
        status: 'unsupported_future_version',
        version,
        rawPayload: rawJson,
      };
    }

    if (!Array.isArray(envelope.ingredients)) {
      return {
        status: 'corrupt',
        error: 'El campo ingredients no es una lista válida.',
        rawPayload: rawJson,
      };
    }

    const seenIds = new Set<string>();
    const validIngredients: Ingredient[] = [];
    const quarantined: unknown[] = Array.isArray(envelope.quarantinedRecords)
      ? [...envelope.quarantinedRecords]
      : [];

    for (const item of envelope.ingredients) {
      if (isValidStoredIngredient(item)) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          validIngredients.push(item);
        } else {
          // Id duplicado
          quarantined.push(item);
        }
      } else {
        quarantined.push(item);
      }
    }

    return {
      status: 'valid',
      version,
      ingredients: validIngredients,
      quarantined,
    };
  }

  // 2. Compatibilidad con formato legado de arreglo plano (v0 / desarrollo temprano)
  if (Array.isArray(parsed)) {
    const seenIds = new Set<string>();
    const validIngredients: Ingredient[] = [];
    const quarantined: unknown[] = [];

    for (const item of parsed) {
      if (isValidStoredIngredient(item)) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          validIngredients.push(item);
        } else {
          quarantined.push(item);
        }
      } else {
        quarantined.push(item);
      }
    }

    return {
      status: 'legacy',
      version: 0,
      ingredients: validIngredients,
      quarantined,
    };
  }

  return {
    status: 'corrupt',
    error: 'Estructura de sobre de almacenamiento no reconocida.',
    rawPayload: rawJson,
  };
}

/**
 * Parsea y sanea el JSON recuperado del almacenamiento local para consumidores que
 * esperan una lista directa de ingredientes válidos sin lanzar excepciones.
 */
export function parseAndValidateStoredIngredients(
  rawJson: string | null
): Ingredient[] {
  const result = parseStoredIngredientsEnvelope(rawJson);
  if (result.status === 'valid' || result.status === 'legacy') {
    return result.ingredients;
  }

  if (result.status === 'unsupported_future_version') {
    console.warn(
      `[PantryStorage] Advertencia: Versión futura no soportada (v${result.version}). No se procesarán ingredientes.`
    );
    return [];
  }

  if (result.status === 'corrupt') {
    console.warn(
      '[PantryStorage] Advertencia: Contenido de almacenamiento corrupto o ilegible. Se restaurará a estado limpio.',
      result.error
    );
    return [];
  }

  return [];
}

/**
 * Adaptador de almacenamiento en AsyncStorage con cola secuencial para
 * serializar mutaciones y prevenir pérdidas de datos por escrituras concurrentes.
 */
export class AsyncStoragePantryAdapter implements PantryStorageAdapter {
  private storageKey: string;
  private mutationQueue: Promise<unknown> = Promise.resolve();
  private cachedQuarantinedRecords: unknown[] = [];

  constructor(storageKey: string = PANTRY_STORAGE_KEY) {
    this.storageKey = storageKey;
  }

  /**
   * Serializa la ejecución de operaciones de mutación (read-modify-write).
   * Cada operación espera que la anterior finalice (con éxito o fallo) antes de iniciar,
   * preservando el orden estricto de llegada y evitando que escrituras concurrentes
   * lean el mismo estado previo y se sobreescriban entre sí.
   */
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutationQueue.then(operation, operation);
    this.mutationQueue = next.catch(() => {});
    return next;
  }

  async getIngredients(): Promise<Ingredient[]> {
    try {
      const rawData = await AsyncStorage.getItem(this.storageKey);
      const parsed = parseStoredIngredientsEnvelope(rawData);

      if (parsed.status === 'unsupported_future_version') {
        throw new PantryStorageVersionError(parsed.version);
      }

      if (parsed.status === 'corrupt') {
        // Preservar payload corrupto original antes de cualquier acción
        try {
          await AsyncStorage.setItem(
            `${this.storageKey}_backup_${Date.now()}`,
            parsed.rawPayload
          );
        } catch {}
        throw new PantryStorageCorruptionError(
          `Almacenamiento corrupto: ${parsed.error}. Se preservó copia de respaldo.`,
          parsed.rawPayload
        );
      }

      this.cachedQuarantinedRecords = parsed.quarantined;
      return parsed.ingredients;
    } catch (error) {
      if (
        error instanceof PantryStorageVersionError ||
        error instanceof PantryStorageCorruptionError
      ) {
        throw error;
      }
      console.error(
        '[PantryStorage] Error al leer la despensa desde AsyncStorage:',
        error
      );
      throw new Error(
        'No fue posible cargar los ingredientes desde el almacenamiento local.'
      );
    }
  }

  private async saveIngredientsInternal(
    ingredients: Ingredient[]
  ): Promise<void> {
    try {
      const validItems = ingredients.filter(isValidStoredIngredient);
      const envelope: PantryStorageEnvelope = {
        version: PANTRY_STORAGE_VERSION,
        updatedAt: new Date().toISOString(),
        ingredients: validItems,
        quarantinedRecords:
          this.cachedQuarantinedRecords.length > 0
            ? this.cachedQuarantinedRecords
            : undefined,
      };

      await AsyncStorage.setItem(this.storageKey, JSON.stringify(envelope));
    } catch (error) {
      console.error('[PantryStorage] Error al guardar en AsyncStorage:', error);
      throw new Error(
        'No fue posible guardar los cambios en el almacenamiento local.'
      );
    }
  }

  async saveIngredients(ingredients: Ingredient[]): Promise<void> {
    return this.enqueue(() => this.saveIngredientsInternal(ingredients));
  }

  async addIngredient(input: CreateIngredientInput): Promise<Ingredient> {
    return this.enqueue(async () => {
      const current = await this.getIngredients();
      const now = new Date().toISOString();
      const newIngredient: Ingredient = {
        id: `ing-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        name: input.name.trim(),
        quantity: input.quantity,
        unit: input.unit,
        category: input.category,
        expirationDate: input.expirationDate,
        createdAt: now,
        updatedAt: now,
      };

      const updated = [newIngredient, ...current];
      await this.saveIngredientsInternal(updated);
      return newIngredient;
    });
  }

  async updateIngredient(input: UpdateIngredientInput): Promise<Ingredient> {
    return this.enqueue(async () => {
      const current = await this.getIngredients();
      const index = current.findIndex((item) => item.id === input.id);

      if (index === -1) {
        throw new Error(`Ingrediente con id «${input.id}» no encontrado.`);
      }

      const existing = current[index];
      const now = new Date().toISOString();

      // Semántica estricta de vencimiento:
      // - input.expirationDate === null -> eliminar fecha (undefined en Ingredient)
      // - input.expirationDate !== undefined -> reemplazar fecha
      // - input.expirationDate === undefined -> conservar fecha existente
      let resolvedExpirationDate: string | undefined = existing.expirationDate;
      if (input.expirationDate === null) {
        resolvedExpirationDate = undefined;
      } else if (input.expirationDate !== undefined) {
        resolvedExpirationDate = input.expirationDate;
      }

      const updatedItem: Ingredient = {
        ...existing,
        name: input.name !== undefined ? input.name.trim() : existing.name,
        quantity:
          input.quantity !== undefined ? input.quantity : existing.quantity,
        unit: input.unit !== undefined ? input.unit : existing.unit,
        category:
          input.category !== undefined ? input.category : existing.category,
        expirationDate: resolvedExpirationDate,
        updatedAt: now,
      };

      const updatedList = [...current];
      updatedList[index] = updatedItem;

      await this.saveIngredientsInternal(updatedList);
      return updatedItem;
    });
  }

  async deleteIngredient(id: string): Promise<void> {
    return this.enqueue(async () => {
      const current = await this.getIngredients();
      const filtered = current.filter((item) => item.id !== id);
      await this.saveIngredientsInternal(filtered);
    });
  }

  async adjustQuantity(id: string, delta: number): Promise<Ingredient> {
    return this.enqueue(async () => {
      const current = await this.getIngredients();
      const index = current.findIndex((item) => item.id === id);

      if (index === -1) {
        throw new Error(`Ingrediente con id «${id}» no encontrado.`);
      }

      const existing = current[index];
      const newQty = Math.round((existing.quantity + delta) * 100) / 100;
      if (newQty <= 0) {
        return existing;
      }

      const now = new Date().toISOString();
      const updatedItem: Ingredient = {
        ...existing,
        quantity: newQty,
        updatedAt: now,
      };

      const updatedList = [...current];
      updatedList[index] = updatedItem;

      await this.saveIngredientsInternal(updatedList);
      return updatedItem;
    });
  }

  async clearIngredients(): Promise<void> {
    return this.enqueue(async () => {
      try {
        await AsyncStorage.removeItem(this.storageKey);
        this.cachedQuarantinedRecords = [];
      } catch (error) {
        console.error('[PantryStorage] Error al limpiar almacenamiento:', error);
        throw new Error('No fue posible limpiar la despensa.');
      }
    });
  }
}

export const pantryStorage: PantryStorageAdapter =
  new AsyncStoragePantryAdapter();
