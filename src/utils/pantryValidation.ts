/**
 * Validaciones para el formulario de registro y edición de ingredientes (Fase 2B).
 */
import {
  INGREDIENT_CATEGORIES,
  INGREDIENT_UNITS,
  IngredientCategory,
  IngredientUnit,
} from '../types/pantry';

export interface IngredientFormData {
  name: string;
  quantityText: string;
  unit: IngredientUnit;
  category: IngredientCategory;
  expirationDateText?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: {
    name?: string;
    quantity?: string;
    unit?: string;
    category?: string;
    expirationDate?: string;
  };
  sanitizedData?: {
    name: string;
    quantity: number;
    unit: IngredientUnit;
    category: IngredientCategory;
    expirationDate?: string;
  };
}

/**
 * Valida si una cadena de texto representa una fecha de calendario real en formato YYYY-MM-DD.
 */
export function isValidDateString(dateStr: string): boolean {
  const trimmed = dateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return false;
  }

  const [yearStr, monthStr, dayStr] = trimmed.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  if (year < 2000 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/**
 * Valida los datos del formulario de ingrediente y retorna los mensajes de error en español.
 */
export function validateIngredientForm(data: IngredientFormData): ValidationResult {
  const errors: ValidationResult['errors'] = {};

  // 1. Validación de nombre
  const trimmedName = data.name.trim();
  if (!trimmedName) {
    errors.name = 'El nombre del alimento es obligatorio.';
  } else if (trimmedName.length < 2) {
    errors.name = 'El nombre debe tener al menos 2 caracteres.';
  } else if (trimmedName.length > 60) {
    errors.name = 'El nombre no puede superar 60 caracteres.';
  }

  // 2. Validación de cantidad
  const sanitizedQtyStr = data.quantityText.trim().replace(',', '.');
  if (!sanitizedQtyStr) {
    errors.quantity = 'Ingresa una cantidad.';
  } else {
    const parsedQty = parseFloat(sanitizedQtyStr);
    if (isNaN(parsedQty) || !isFinite(parsedQty) || parsedQty <= 0) {
      errors.quantity = 'La cantidad debe ser un número mayor a cero.';
    } else if (parsedQty > 100000) {
      errors.quantity = 'La cantidad supera el límite razonable permitido.';
    }
  }

  // 3. Validación de unidad
  if (!INGREDIENT_UNITS.includes(data.unit)) {
    errors.unit = 'Selecciona una unidad de medida válida.';
  }

  // 4. Validación de categoría
  if (!INGREDIENT_CATEGORIES.includes(data.category)) {
    errors.category = 'Selecciona una categoría válida.';
  }

  // 5. Validación de fecha opcional
  let sanitizedExpiration: string | undefined = undefined;
  if (data.expirationDateText && data.expirationDateText.trim().length > 0) {
    const trimmedExp = data.expirationDateText.trim();
    if (!isValidDateString(trimmedExp)) {
      errors.expirationDate =
        'La fecha de vencimiento debe tener formato AAAA-MM-DD válido.';
    } else {
      sanitizedExpiration = trimmedExp;
    }
  }

  const isValid = Object.keys(errors).length === 0;

  return {
    isValid,
    errors,
    sanitizedData: isValid
      ? {
          name: trimmedName,
          quantity: parseFloat(sanitizedQtyStr),
          unit: data.unit,
          category: data.category,
          expirationDate: sanitizedExpiration,
        }
      : undefined,
  };
}
