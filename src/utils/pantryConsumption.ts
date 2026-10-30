/**
 * FoodAI - Lógica del dominio para el consumo y deducción de ingredientes de la despensa (Fase 6A).
 * Implementa deducción segura, verificación de compatibilidad de unidades (g/kg, ml/l),
 * prevención de inventario negativo y distinción clara entre deducciones exitosas
 * e ingredientes que requieren revisión manual.
 */

import { Ingredient, IngredientUnit } from '../types/pantry';
import { RecipeIngredient } from '../types/recipe';
import {
  areUnitsCompatibleForAddition,
  convertQuantity,
  findDuplicateInPantry,
} from './ingredientMapper';

export type DeductionItemStatus =
  | 'deductible_full'
  | 'deductible_partial'
  | 'requires_review_unit'
  | 'requires_review_quantity'
  | 'requires_review_not_found';

export interface PantryDeductionItem {
  recipeIngredientName: string;
  recipeQuantity: number | null;
  recipeUnit: string;
  matchedPantryItem?: Ingredient;
  deductQuantity: number; // en la unidad del ingrediente de la despensa
  pantryUnit?: IngredientUnit;
  stockBefore: number;
  stockAfter: number;
  status: DeductionItemStatus;
  requiresReview: boolean;
  message: string;
}

export interface PantryDeductionPlan {
  items: PantryDeductionItem[];
  deductibleItems: PantryDeductionItem[];
  reviewItems: PantryDeductionItem[];
  canDeductAny: boolean;
  totalDeductibleCount: number;
  totalReviewCount: number;
}

export function calculatePantryDeduction(
  pantryIngredients: Ingredient[],
  recipeIngredients: RecipeIngredient[]
): PantryDeductionPlan {
  // Rastreo del stock remanente para manejar ingredientes duplicados en la misma receta
  const remainingStockMap = new Map<string, number>();
  for (const item of pantryIngredients || []) {
    remainingStockMap.set(item.id, item.quantity);
  }

  const items: PantryDeductionItem[] = [];

  for (const recipeIng of recipeIngredients || []) {
    const rawName = recipeIng.name?.trim() || 'Ingrediente';
    const rawQuantity = recipeIng.quantity;
    const rawUnit = recipeIng.unit?.trim().toLowerCase() || '';

    const matchedDuplicate = findDuplicateInPantry(rawName, pantryIngredients || []);

    if (!matchedDuplicate) {
      items.push({
        recipeIngredientName: rawName,
        recipeQuantity: rawQuantity,
        recipeUnit: rawUnit,
        deductQuantity: 0,
        stockBefore: 0,
        stockAfter: 0,
        status: 'requires_review_not_found',
        requiresReview: true,
        message: 'No se encontró en tu despensa.',
      });
      continue;
    }

    const pantryItem = (pantryIngredients || []).find((p) => p.id === matchedDuplicate.id)!;
    const currentStock = remainingStockMap.get(pantryItem.id) ?? pantryItem.quantity;

    // Regla 7: Nunca inventar cantidades para medidas nulas o desconocidas
    if (
      rawQuantity === null ||
      rawQuantity === undefined ||
      !Number.isFinite(rawQuantity) ||
      rawQuantity <= 0 ||
      rawUnit === '' ||
      rawUnit === 'desconocida' ||
      rawUnit === 's/u'
    ) {
      items.push({
        recipeIngredientName: rawName,
        recipeQuantity: rawQuantity,
        recipeUnit: rawUnit,
        matchedPantryItem: pantryItem,
        pantryUnit: pantryItem.unit,
        deductQuantity: 0,
        stockBefore: currentStock,
        stockAfter: currentStock,
        status: 'requires_review_quantity',
        requiresReview: true,
        message: 'Cantidad o unidad por confirmar en la receta; no se dedujo automáticamente.',
      });
      continue;
    }

    // Reglas 5 y 6: Verificación de unidades compatibles
    const unitsCompatible = areUnitsCompatibleForAddition(
      pantryItem.unit,
      rawUnit as IngredientUnit
    );

    if (!unitsCompatible) {
      items.push({
        recipeIngredientName: rawName,
        recipeQuantity: rawQuantity,
        recipeUnit: rawUnit,
        matchedPantryItem: pantryItem,
        pantryUnit: pantryItem.unit,
        deductQuantity: 0,
        stockBefore: currentStock,
        stockAfter: currentStock,
        status: 'requires_review_unit',
        requiresReview: true,
        message: `Unidades no compatibles (${pantryItem.unit} vs ${rawUnit}); requiere revisión manual.`,
      });
      continue;
    }

    // Conversión de unidades compatible (ej: g a kg, ml a l)
    const convertedQty = convertQuantity(
      rawQuantity,
      rawUnit as IngredientUnit,
      pantryItem.unit
    );

    if (convertedQty === null || !Number.isFinite(convertedQty) || convertedQty <= 0) {
      items.push({
        recipeIngredientName: rawName,
        recipeQuantity: rawQuantity,
        recipeUnit: rawUnit,
        matchedPantryItem: pantryItem,
        pantryUnit: pantryItem.unit,
        deductQuantity: 0,
        stockBefore: currentStock,
        stockAfter: currentStock,
        status: 'requires_review_unit',
        requiresReview: true,
        message: `No fue posible convertir de ${rawUnit} a ${pantryItem.unit}.`,
      });
      continue;
    }

    const roundedNeeded = Math.round(convertedQty * 1000) / 1000;

    // Regla 8: No permitir stock negativo
    if (roundedNeeded <= currentStock) {
      const remaining = Math.round((currentStock - roundedNeeded) * 1000) / 1000;
      remainingStockMap.set(pantryItem.id, remaining);

      items.push({
        recipeIngredientName: rawName,
        recipeQuantity: rawQuantity,
        recipeUnit: rawUnit,
        matchedPantryItem: pantryItem,
        pantryUnit: pantryItem.unit,
        deductQuantity: roundedNeeded,
        stockBefore: currentStock,
        stockAfter: remaining,
        status: 'deductible_full',
        requiresReview: false,
        message: `Se descontarán ${roundedNeeded} ${pantryItem.unit}.`,
      });
    } else {
      // Stock insuficiente: consumir solo lo disponible (stockAfter = 0, jamás negativo)
      const deductQty = currentStock;
      remainingStockMap.set(pantryItem.id, 0);

      items.push({
        recipeIngredientName: rawName,
        recipeQuantity: rawQuantity,
        recipeUnit: rawUnit,
        matchedPantryItem: pantryItem,
        pantryUnit: pantryItem.unit,
        deductQuantity: deductQty,
        stockBefore: currentStock,
        stockAfter: 0,
        status: 'deductible_partial',
        requiresReview: true,
        message: `Stock insuficiente (${currentStock} ${pantryItem.unit} disponibles vs ${roundedNeeded} ${pantryItem.unit} requeridos); se agota el inventario disponible.`,
      });
    }
  }

  const deductibleItems = items.filter((i) => i.deductQuantity > 0);
  const reviewItems = items.filter((i) => i.requiresReview);

  return {
    items,
    deductibleItems,
    reviewItems,
    canDeductAny: deductibleItems.length > 0,
    totalDeductibleCount: deductibleItems.length,
    totalReviewCount: reviewItems.length,
  };
}

export interface ApplyDeductionResult {
  updatedPantry: Ingredient[];
  deductedCount: number;
}

export function applyPantryDeduction(
  currentPantry: Ingredient[],
  plan: PantryDeductionPlan
): ApplyDeductionResult {
  const stockAfterMap = new Map<string, number>();

  for (const item of plan.items) {
    if (item.matchedPantryItem && item.deductQuantity > 0) {
      stockAfterMap.set(item.matchedPantryItem.id, item.stockAfter);
    }
  }

  const now = new Date().toISOString();
  const updatedPantry: Ingredient[] = [];

  for (const pantryItem of currentPantry || []) {
    if (stockAfterMap.has(pantryItem.id)) {
      const newStock = stockAfterMap.get(pantryItem.id)!;
      // En FoodAI el esquema de despensa requiere quantity > 0.
      // Si el alimento se agota completamente (0 stock), se remueve de la despensa activa.
      if (newStock > 0) {
        updatedPantry.push({
          ...pantryItem,
          quantity: newStock,
          updatedAt: now,
        });
      }
      // Si newStock <= 0, no se incluye (se elimina por consumo total).
    } else {
      updatedPantry.push(pantryItem);
    }
  }

  return {
    updatedPantry,
    deductedCount: stockAfterMap.size,
  };
}
