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
  MAX_INGREDIENT_QUANTITY,
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

export interface PantryStorageCorruptionDetails {
  backupCreated: boolean;
  backupKey?: string;
  backupError?: string;
}

export class PantryStorageCorruptionError extends Error {
  readonly rawPayload: string;
  readonly backupCreated: boolean;
  readonly backupKey?: string;
  readonly backupError?: string;

  constructor(
    message: string,
    rawPayload: string,
    details?: PantryStorageCorruptionDetails
  ) {
    super(message);
    this.name = 'PantryStorageCorruptionError';
    this.rawPayload = rawPayload;
    this.backupCreated = details?.backupCreated ?? false;
    this.backupKey = details?.backupKey;
    this.backupError = details?.backupError;
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

    const rawIngredients = Array.isArray(envelope.ingredients)
      ? envelope.ingredients
      : Array.isArray(envelope.items)
      ? envelope.items
      : null;

    if (!rawIngredients) {
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

    for (const item of rawIngredients) {
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
   * Serializa la ejecución de operaciones de mutación y lectura (FIFO Mutex).
   * Cada operación espera que la anterior finalice (con éxito o fallo) antes de iniciar,
   * preservando el orden estricto de llegada y evitando que escrituras concurrentes
   * lean el mismo estado previo y se sobreescriban entre sí.
   */
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutationQueue.then(operation, operation);
    this.mutationQueue = next.catch(() => {});
    return next;
  }

  /**
   * Lectura interna directa sin pasar por `enqueue`, diseñada para consumo
   * de métodos que ya se ejecutan encolados y evitar deadlocks de autorreferencia.
   */
  private async getIngredientsInternal(): Promise<Ingredient[]> {
    try {
      const rawData = await AsyncStorage.getItem(this.storageKey);
      const parsed = parseStoredIngredientsEnvelope(rawData);

      if (parsed.status === 'unsupported_future_version') {
        throw new PantryStorageVersionError(parsed.version);
      }

      if (parsed.status === 'corrupt') {
        /**
         * DISTINCIÓN FUNDAMENTAL DE INTEGRIDAD DE DATOS:
         * 1. Preservación del payload original: El contenido corrupto en `this.storageKey`
         *    permanece intacto y JAMÁS se borra ni se sobreescribe con un estado vacío o regenerado.
         * 2. Respaldo adicional: Se intenta escribir una copia de seguridad en una clave timestamped.
         *    Se confirma explícitamente si la escritura del respaldo tuvo éxito o falló,
         *    y NUNCA se reporta que existe un respaldo si la operación de escritura falló.
         */
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
            `[PantryStorage] Advertencia: Fallo al crear la copia de respaldo en ${backupKey}:`,
            err
          );
        }

        const errorMessage = backupCreated
          ? `Almacenamiento corrupto: ${parsed.error}. Se preservó copia de respaldo en «${backupKey}». El payload original permanece intacto.`
          : `Almacenamiento corrupto: ${parsed.error}. No fue posible crear la copia de respaldo adicional (${backupError}). El payload original permanece intacto sin sobreescribir.`;

        throw new PantryStorageCorruptionError(
          errorMessage,
          parsed.rawPayload,
          {
            backupCreated,
            backupKey: backupCreated ? backupKey : undefined,
            backupError,
          }
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

  async getIngredients(): Promise<Ingredient[]> {
    return this.enqueue(() => this.getIngredientsInternal());
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
    return this.enqueue(async () => {
      if (!Array.isArray(ingredients)) {
        throw new Error(
          'No fue posible guardar: la lista de ingredientes debe ser un arreglo válido.'
        );
      }

      const seenIds = new Set<string>();
      for (let i = 0; i < ingredients.length; i++) {
        const item = ingredients[i];
        if (!isValidStoredIngredient(item)) {
          const detail =
            item &&
            typeof item === 'object' &&
            'name' in item &&
            typeof (item as Record<string, unknown>).name === 'string'
              ? `«${(item as Record<string, unknown>).name}»`
              : `en el índice ${i}`;
          throw new Error(
            `No es posible guardar ingredientes: el registro ${detail} contiene datos inválidos o no cumple con el esquema requerido.`
          );
        }

        if (seenIds.has(item.id)) {
          throw new Error(
            `No es posible guardar ingredientes: se detectó un identificador duplicado («${item.id}»).`
          );
        }
        seenIds.add(item.id);
      }

      await this.saveIngredientsInternal(ingredients);
    });
  }

  async addIngredient(input: CreateIngredientInput): Promise<Ingredient> {
    return this.enqueue(async () => {
      if (!isValidQuantityValue(input.quantity)) {
        throw new Error(
          `La cantidad del ingrediente debe ser un número positivo menor o igual a ${MAX_INGREDIENT_QUANTITY}.`
        );
      }

      const current = await this.getIngredientsInternal();
      const now = new Date().toISOString();
      const newIngredient: Ingredient = {
        id: `ing-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        name: input.name.trim(),
        quantity: Math.round(input.quantity * 1000) / 1000,
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
      if (input.quantity !== undefined && !isValidQuantityValue(input.quantity)) {
        throw new Error(
          `La cantidad debe ser un número positivo menor o igual a ${MAX_INGREDIENT_QUANTITY}.`
        );
      }

      const current = await this.getIngredientsInternal();
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

      const resolvedQuantity =
        input.quantity !== undefined
          ? Math.round(input.quantity * 1000) / 1000
          : existing.quantity;

      const updatedItem: Ingredient = {
        ...existing,
        name: input.name !== undefined ? input.name.trim() : existing.name,
        quantity: resolvedQuantity,
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
      const current = await this.getIngredientsInternal();
      const filtered = current.filter((item) => item.id !== id);
      await this.saveIngredientsInternal(filtered);
    });
  }

  async adjustQuantity(id: string, delta: number): Promise<Ingredient> {
    return this.enqueue(async () => {
      if (typeof delta !== 'number' || !Number.isFinite(delta) || Number.isNaN(delta)) {
        throw new Error('El incremento de cantidad debe ser un número finito válido.');
      }

      const current = await this.getIngredientsInternal();
      const index = current.findIndex((item) => item.id === id);

      if (index === -1) {
        throw new Error(`Ingrediente con id «${id}» no encontrado.`);
      }

      const existing = current[index];
      if (delta === 0) {
        return existing;
      }

      const rawNewQty = existing.quantity + delta;
      const roundedNewQty = Math.round(rawNewQty * 1000) / 1000;

      // Límite inferior explícito: la cantidad no puede ser menor o igual a cero.
      // Se ignora el decremento inválido y se conserva el valor actual del ingrediente.
      if (roundedNewQty <= 0) {
        return existing;
      }

      // Límite superior explícito: la cantidad resultante no puede exceder MAX_INGREDIENT_QUANTITY (100000).
      if (roundedNewQty > MAX_INGREDIENT_QUANTITY) {
        throw new Error(
          `La cantidad resultante (${roundedNewQty}) supera el límite máximo permitido de ${MAX_INGREDIENT_QUANTITY}.`
        );
      }

      const now = new Date().toISOString();
      const updatedItem: Ingredient = {
        ...existing,
        quantity: roundedNewQty,
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
