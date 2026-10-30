/**
 * FoodAI - Persistencia y control de recetas consumidas / deducidas (Fase 6A).
 * Previene la deducción duplicada ante confirmaciones repetidas, navegación
 * o reapertura de pantallas, con aislamiento estricto por usuario en AsyncStorage.
 *
 * Incluye soporte de Ledger Intent (Write-Ahead) con reconciliación conservadora
 * ante caídas de la aplicación y tolerancia a fallos parciales de almacenamiento.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ingredient } from '../../types/pantry';

export const CONSUMED_RECIPES_STORAGE_KEY = '@foodai:consumed_recipes_v1';

export function getConsumedRecipesStorageKey(userId?: string | null): string {
  return userId ? `@foodai:${userId}:consumed_recipes_v1` : CONSUMED_RECIPES_STORAGE_KEY;
}

export type ConsumptionStatus = 'pending' | 'completed' | 'requires_review';

export interface ConsumedIngredientDeduction {
  ingredientId: string;
  ingredientName: string;
  deductedQuantity: number;
  unit: string;
  stockBefore: number;
  stockAfter: number;
}

export interface ConsumedRecipeRecord {
  recipeId: string;
  consumedAt: string;
  mealPlanDay?: number;
  recipeName?: string;
  status?: ConsumptionStatus;
  instanceId?: string;
  deductions?: ConsumedIngredientDeduction[];
  reviewReason?: string;
}

export interface ConsumedRecipesEnvelope {
  version: number;
  updatedAt: string;
  records: Record<string, ConsumedRecipeRecord>;
}

export interface ReconciliationResult {
  status: ConsumptionStatus | 'aborted' | 'none';
  reconciled: boolean;
  action: 'confirmed' | 'cleared' | 'needs_review' | 'none';
  message?: string;
}

export async function getConsumedRecipeRecords(
  userId?: string | null
): Promise<Record<string, ConsumedRecipeRecord>> {
  const key = getConsumedRecipesStorageKey(userId);
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.records === 'object' && parsed.records !== null) {
      return parsed.records;
    }
    return {};
  } catch (err) {
    console.warn('[recipeConsumptionStorage] Error al leer recetas consumidas:', err);
    return {};
  }
}

/**
 * Determina si una clave de receta ya fue deducida legítimamente o requiere revisión.
 * - Registros 'completed' (o legados sin status) se consideran definitivamente deducidos.
 * - Registros 'requires_review': BLOQUEAN deducción automática y requieren atención manual.
 * - Registros 'pending': NUNCA expiran automáticamente de forma silenciosa. Se consideran
 *   bloqueados hasta que una reconciliación conservadora determine su estado real contra la despensa.
 */
export async function isRecipeDeducted(
  recipeKey: string,
  userId?: string | null
): Promise<boolean> {
  if (!recipeKey) return false;
  const records = await getConsumedRecipeRecords(userId);
  const cleanId = recipeKey.trim().toLowerCase();
  const record = records[cleanId];
  if (!record) return false;

  // Si no tiene status o está completed, requires_review o pending -> bloquea deducción
  if (
    !record.status ||
    record.status === 'completed' ||
    record.status === 'requires_review' ||
    record.status === 'pending'
  ) {
    return true;
  }

  return false;
}

/**
 * Registra una intención previa de deducción (Write-Ahead Intent) con el desglose exacto
 * de las cantidades que se planean descontar.
 */
export async function recordDeductionIntent(
  recipeKey: string,
  userId?: string | null,
  details?: {
    mealPlanDay?: number;
    recipeName?: string;
    instanceId?: string;
    deductions?: ConsumedIngredientDeduction[];
  }
): Promise<void> {
  if (!recipeKey) return;
  const key = getConsumedRecipesStorageKey(userId);
  const records = await getConsumedRecipeRecords(userId);
  const cleanId = recipeKey.trim().toLowerCase();

  const now = new Date().toISOString();
  records[cleanId] = {
    recipeId: cleanId,
    consumedAt: now,
    mealPlanDay: details?.mealPlanDay,
    recipeName: details?.recipeName,
    status: 'pending',
    instanceId: details?.instanceId,
    deductions: details?.deductions,
  };

  const envelope: ConsumedRecipesEnvelope = {
    version: 1,
    updatedAt: now,
    records,
  };

  await AsyncStorage.setItem(key, JSON.stringify(envelope));
}

/**
 * Confirma formalmente una deducción una vez completada la persistencia de la despensa.
 */
export async function confirmDeduction(
  recipeKey: string,
  userId?: string | null,
  details?: {
    mealPlanDay?: number;
    recipeName?: string;
    instanceId?: string;
    deductions?: ConsumedIngredientDeduction[];
  }
): Promise<void> {
  if (!recipeKey) return;
  const key = getConsumedRecipesStorageKey(userId);
  const records = await getConsumedRecipeRecords(userId);
  const cleanId = recipeKey.trim().toLowerCase();

  const now = new Date().toISOString();
  records[cleanId] = {
    recipeId: cleanId,
    consumedAt: now,
    mealPlanDay: details?.mealPlanDay ?? records[cleanId]?.mealPlanDay,
    recipeName: details?.recipeName ?? records[cleanId]?.recipeName,
    status: 'completed',
    instanceId: details?.instanceId ?? records[cleanId]?.instanceId,
    deductions: details?.deductions ?? records[cleanId]?.deductions,
  };

  const envelope: ConsumedRecipesEnvelope = {
    version: 1,
    updatedAt: now,
    records,
  };

  await AsyncStorage.setItem(key, JSON.stringify(envelope));
}

/**
 * Marca una receta para revisión manual en caso de reconciliación ambigua o fallo crítico de rollback.
 */
export async function markRequiresReview(
  recipeKey: string,
  userId?: string | null,
  reason?: string
): Promise<void> {
  if (!recipeKey) return;
  const key = getConsumedRecipesStorageKey(userId);
  const records = await getConsumedRecipeRecords(userId);
  const cleanId = recipeKey.trim().toLowerCase();

  if (records[cleanId]) {
    records[cleanId] = {
      ...records[cleanId],
      status: 'requires_review',
      reviewReason: reason,
    };
    const envelope: ConsumedRecipesEnvelope = {
      version: 1,
      updatedAt: new Date().toISOString(),
      records,
    };
    await AsyncStorage.setItem(key, JSON.stringify(envelope));
  }
}

/**
 * Elimina una intención de deducción pendiente en caso de cancelación o rollback exitoso.
 */
export async function removeDeductionIntent(
  recipeKey: string,
  userId?: string | null
): Promise<void> {
  if (!recipeKey) return;
  const key = getConsumedRecipesStorageKey(userId);
  const records = await getConsumedRecipeRecords(userId);
  const cleanId = recipeKey.trim().toLowerCase();

  if (records[cleanId] && records[cleanId].status === 'pending') {
    delete records[cleanId];
    const envelope: ConsumedRecipesEnvelope = {
      version: 1,
      updatedAt: new Date().toISOString(),
      records,
    };
    await AsyncStorage.setItem(key, JSON.stringify(envelope));
  }
}

/**
 * Reconciliación conservadora ante caídas de la aplicación (Crash Recovery).
 * Inspecciona el estado real actual de la despensa frente a los inventarios
 * esperados (stockBefore y stockAfter) del intento pendiente:
 *
 * 1. Si los ítems coinciden con stockAfter: La despensa ya se había descontado antes del crash.
 *    -> Se auto-confirma en el ledger (status: 'completed'). Se previene doble deducción.
 * 2. Si los ítems coinciden con stockBefore: La persistencia en despensa nunca ocurrió.
 *    -> Se descarta la intención previa (action: 'cleared'). Se permite deducción legítima.
 * 3. Si el estado es ambiguo (discrepancia o modificación concurrente):
 *    -> Se bloquea la deducción automática (status: 'requires_review').
 */
export async function reconcileDeductionIntent(
  recipeKey: string,
  currentPantry: Ingredient[],
  userId?: string | null
): Promise<ReconciliationResult> {
  if (!recipeKey) return { status: 'none', reconciled: false, action: 'none' };
  const records = await getConsumedRecipeRecords(userId);
  const cleanId = recipeKey.trim().toLowerCase();
  const record = records[cleanId];

  if (!record) {
    return { status: 'none', reconciled: false, action: 'none' };
  }

  if (record.status === 'completed') {
    return { status: 'completed', reconciled: true, action: 'confirmed' };
  }

  if (record.status === 'requires_review') {
    return {
      status: 'requires_review',
      reconciled: false,
      action: 'needs_review',
      message: record.reviewReason || 'Esta preparación requiere revisión manual antes de poder modificar la despensa.',
    };
  }

  const deductions = record.deductions || [];
  if (deductions.length === 0) {
    await confirmDeduction(cleanId, userId, {
      mealPlanDay: record.mealPlanDay,
      recipeName: record.recipeName,
      instanceId: record.instanceId,
    });
    return { status: 'completed', reconciled: true, action: 'confirmed' };
  }

  const pantryMap = new Map(currentPantry.map((i) => [i.id, i]));

  let allMatchStockAfter = true;
  let allMatchStockBefore = true;

  for (const d of deductions) {
    const currentItem = pantryMap.get(d.ingredientId);
    const currentQty = currentItem ? currentItem.quantity : 0;

    const matchesAfter = Math.abs(currentQty - d.stockAfter) < 0.001;
    const matchesBefore = currentItem ? Math.abs(currentQty - d.stockBefore) < 0.001 : false;

    if (!matchesAfter) {
      allMatchStockAfter = false;
    }
    if (!matchesBefore) {
      allMatchStockBefore = false;
    }
  }

  // CASO 1: La despensa ya fue descontada antes del crash
  if (allMatchStockAfter) {
    await confirmDeduction(cleanId, userId, {
      mealPlanDay: record.mealPlanDay,
      recipeName: record.recipeName,
      instanceId: record.instanceId,
      deductions: record.deductions,
    });
    return {
      status: 'completed',
      reconciled: true,
      action: 'confirmed',
      message: 'Recuperación exitosa: La deducción ya había sido persistida en la despensa y fue confirmada formalmente en el registro.',
    };
  }

  // CASO 2: La persistencia de despensa nunca ocurrió
  if (allMatchStockBefore) {
    await removeDeductionIntent(cleanId, userId);
    return {
      status: 'aborted',
      reconciled: true,
      action: 'cleared',
      message: 'Recuperación exitosa: La despensa no había sufrido cambios; la intención pendiente incompleta fue descartada de forma segura.',
    };
  }

  // CASO 3: Estado ambiguo -> Bloqueo conservador
  await markRequiresReview(
    cleanId,
    userId,
    'Estado ambiguo tras interrupción: las cantidades en despensa no coinciden exactamente con los estados esperados.'
  );
  return {
    status: 'requires_review',
    reconciled: false,
    action: 'needs_review',
    message: 'Se detectó una preparación pendiente interrumpida con cantidades ambiguas en la despensa. Se requiere revisión manual.',
  };
}

/**
 * Registra directamente la deducción completada (retrocompatibilidad).
 */
export async function recordRecipeDeduction(
  recipeId: string,
  userId?: string | null,
  details?: { mealPlanDay?: number; recipeName?: string; instanceId?: string }
): Promise<void> {
  return confirmDeduction(recipeId, userId, details);
}

export async function clearRecipeDeductions(userId?: string | null): Promise<void> {
  const key = getConsumedRecipesStorageKey(userId);
  await AsyncStorage.removeItem(key);
}
