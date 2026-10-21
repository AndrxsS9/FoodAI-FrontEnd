/**
 * Repositorio y adaptador de almacenamiento local para la despensa de FoodAI (Fase 2B).
 * Utiliza @react-native-async-storage/async-storage con versionado de esquema,
 * validación estructural y recuperación ante fallos o datos corruptos.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CreateIngredientInput,
  INGREDIENT_CATEGORIES,
  INGREDIENT_UNITS,
  Ingredient,
  UpdateIngredientInput,
} from '../../types/pantry';

export const PANTRY_STORAGE_KEY = '@foodai:pantry_v1';
export const PANTRY_STORAGE_VERSION = 1;

export interface PantryStorageEnvelope {
  version: number;
  updatedAt: string;
  ingredients: Ingredient[];
}

export interface PantryStorageAdapter {
  getIngredients(): Promise<Ingredient[]>;
  saveIngredients(ingredients: Ingredient[]): Promise<void>;
  addIngredient(input: CreateIngredientInput): Promise<Ingredient>;
  updateIngredient(input: UpdateIngredientInput): Promise<Ingredient>;
  deleteIngredient(id: string): Promise<void>;
  clearIngredients(): Promise<void>;
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

  if (typeof record.id !== 'string' || record.id.trim().length === 0) {
    return false;
  }

  if (typeof record.name !== 'string' || record.name.trim().length === 0) {
    return false;
  }

  if (
    typeof record.quantity !== 'number' ||
    !isFinite(record.quantity) ||
    record.quantity <= 0
  ) {
    return false;
  }

  if (
    typeof record.unit !== 'string' ||
    !INGREDIENT_UNITS.includes(record.unit as any)
  ) {
    return false;
  }

  if (
    typeof record.category !== 'string' ||
    !INGREDIENT_CATEGORIES.includes(record.category as any)
  ) {
    return false;
  }

  if (
    record.expirationDate !== undefined &&
    record.expirationDate !== null &&
    typeof record.expirationDate !== 'string'
  ) {
    return false;
  }

  return true;
}

/**
 * Parsea y sanea el JSON recuperado del almacenamiento local.
 * Si el contenido está corrupto, es inválido o no coincide con el sobre esperado,
 * retorna una lista vacía o los registros válidos filtrados sin provocar una excepción.
 */
export function parseAndValidateStoredIngredients(rawJson: string | null): Ingredient[] {
  if (!rawJson || typeof rawJson !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(rawJson);

    // Formato con sobre versionado: { version: 1, ingredients: [...] }
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.ingredients)) {
      return parsed.ingredients.filter(isValidStoredIngredient);
    }

    // Compatibilidad en caso de arreglo plano
    if (Array.isArray(parsed)) {
      return parsed.filter(isValidStoredIngredient);
    }

    return [];
  } catch (error) {
    // Protección ante JSON malformado o almacenamiento corrupto
    console.warn(
      '[PantryStorage] Advertencia: Contenido de almacenamiento corrupto o ilegible. Se restaurará a estado limpio.',
      error
    );
    return [];
  }
}

/**
 * Adaptador de almacenamiento en AsyncStorage.
 */
export class AsyncStoragePantryAdapter implements PantryStorageAdapter {
  private storageKey: string;

  constructor(storageKey: string = PANTRY_STORAGE_KEY) {
    this.storageKey = storageKey;
  }

  async getIngredients(): Promise<Ingredient[]> {
    try {
      const rawData = await AsyncStorage.getItem(this.storageKey);
      return parseAndValidateStoredIngredients(rawData);
    } catch (error) {
      console.error('[PantryStorage] Error al leer la despensa desde AsyncStorage:', error);
      throw new Error('No fue posible cargar los ingredientes desde el almacenamiento local.');
    }
  }

  async saveIngredients(ingredients: Ingredient[]): Promise<void> {
    try {
      // Filtrar y validar antes de persistir para asegurar integridad
      const validItems = ingredients.filter(isValidStoredIngredient);
      const envelope: PantryStorageEnvelope = {
        version: PANTRY_STORAGE_VERSION,
        updatedAt: new Date().toISOString(),
        ingredients: validItems,
      };

      await AsyncStorage.setItem(this.storageKey, JSON.stringify(envelope));
    } catch (error) {
      console.error('[PantryStorage] Error al guardar en AsyncStorage:', error);
      throw new Error('No fue posible guardar los cambios en el almacenamiento local.');
    }
  }

  async addIngredient(input: CreateIngredientInput): Promise<Ingredient> {
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
    await this.saveIngredients(updated);
    return newIngredient;
  }

  async updateIngredient(input: UpdateIngredientInput): Promise<Ingredient> {
    const current = await this.getIngredients();
    const index = current.findIndex((item) => item.id === input.id);

    if (index === -1) {
      throw new Error(`Ingrediente con id «${input.id}» no encontrado.`);
    }

    const existing = current[index];
    const now = new Date().toISOString();

    const updatedItem: Ingredient = {
      ...existing,
      name: input.name !== undefined ? input.name.trim() : existing.name,
      quantity: input.quantity !== undefined ? input.quantity : existing.quantity,
      unit: input.unit !== undefined ? input.unit : existing.unit,
      category: input.category !== undefined ? input.category : existing.category,
      expirationDate:
        input.expirationDate !== undefined ? input.expirationDate : existing.expirationDate,
      updatedAt: now,
    };

    const updatedList = [...current];
    updatedList[index] = updatedItem;

    await this.saveIngredients(updatedList);
    return updatedItem;
  }

  async deleteIngredient(id: string): Promise<void> {
    const current = await this.getIngredients();
    const filtered = current.filter((item) => item.id !== id);
    await this.saveIngredients(filtered);
  }

  async clearIngredients(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.storageKey);
    } catch (error) {
      console.error('[PantryStorage] Error al limpiar almacenamiento:', error);
      throw new Error('No fue posible limpiar la despensa.');
    }
  }
}

/**
 * Instancia singleton predeterminada del adaptador de almacenamiento.
 */
export const pantryStorage: PantryStorageAdapter = new AsyncStoragePantryAdapter();
