/**
 * Validaciones para el formulario de registro y edición de ingredientes (Fase 2B).
 */
import {
  INGREDIENT_CATEGORIES,
  INGREDIENT_UNITS,
  IngredientCategory,
  IngredientUnit,
} from '../types/pantry';

/** Límite superior documentado para la cantidad de un ingrediente. */
export const MAX_INGREDIENT_QUANTITY = 100000;
/** Longitudes permitidas para el nombre de un ingrediente. */
export const MIN_INGREDIENT_NAME_LENGTH = 2;
export const MAX_INGREDIENT_NAME_LENGTH = 60;

/**
 * Patrón estricto de cantidad: dígitos enteros con, opcionalmente, UN separador
 * decimal (punto o coma) seguido de 1 a 3 decimales. No se admiten signos,
 * letras, espacios internos, notación científica ni separadores de miles.
 * Tanto «.» como «,» se interpretan siempre como separador decimal.
 */
export const QUANTITY_PATTERN = /^\d{1,6}(?:[.,]\d{1,3})?$/;

export const QUANTITY_ERROR_MESSAGES = {
  empty: 'Ingresa una cantidad.',
  malformed: 'La cantidad debe ser un número mayor a cero.',
  notPositive: 'La cantidad debe ser un número mayor a cero.',
  tooLarge: 'La cantidad supera el límite razonable permitido.',
} as const;

export type QuantityParseResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

/**
 * Convierte el texto ingresado por el usuario en una cantidad numérica válida.
 * Valida la cadena completa ANTES de convertirla, por lo que entradas como
 * «2abc», «1kg», «1.2.3», «Infinity» o «NaN» se rechazan.
 */
export function parseQuantityInput(text: string): QuantityParseResult {
  const trimmed = (text ?? '').trim();

  if (!trimmed) {
    return { ok: false, error: QUANTITY_ERROR_MESSAGES.empty };
  }

  if (/^-\s*\d/.test(trimmed)) {
    return { ok: false, error: QUANTITY_ERROR_MESSAGES.notPositive };
  }

  if (!/^\d+(?:[.,]\d+)?$/.test(trimmed)) {
    return { ok: false, error: QUANTITY_ERROR_MESSAGES.malformed };
  }

  const value = Number(trimmed.replace(',', '.'));

  if (!Number.isFinite(value)) {
    return { ok: false, error: QUANTITY_ERROR_MESSAGES.malformed };
  }

  if (value <= 0) {
    return { ok: false, error: QUANTITY_ERROR_MESSAGES.notPositive };
  }

  if (value > MAX_INGREDIENT_QUANTITY) {
    return { ok: false, error: QUANTITY_ERROR_MESSAGES.tooLarge };
  }

  const decimalPart = trimmed.split(/[.,]/)[1];
  if (decimalPart && decimalPart.length > 3) {
    return { ok: false, error: QUANTITY_ERROR_MESSAGES.malformed };
  }

  return { ok: true, value };
}

/** Verifica que un valor numérico ya convertido sea una cantidad válida. */
export function isValidQuantityValue(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= MAX_INGREDIENT_QUANTITY
  );
}

const ISO_TIMESTAMP_PATTERN =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Valida una marca de tiempo ISO 8601 completa (p. ej. `2026-10-21T10:00:00.000Z`),
 * incluyendo validación real de calendario y rangos de hora.
 */
export function isValidIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = ISO_TIMESTAMP_PATTERN.exec(value);
  if (!match) return false;

  const [, datePart, hh, mm, ss] = match;
  if (!isValidDateString(datePart)) return false;
  if (Number(hh) > 23 || Number(mm) > 59 || Number(ss) > 59) return false;

  return !Number.isNaN(Date.parse(value));
}

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
  const trimmedName = (data.name ?? '').trim();
  if (!trimmedName) {
    errors.name = 'El nombre del alimento es obligatorio.';
  } else if (trimmedName.length < MIN_INGREDIENT_NAME_LENGTH) {
    errors.name = 'El nombre debe tener al menos 2 caracteres.';
  } else if (trimmedName.length > MAX_INGREDIENT_NAME_LENGTH) {
    errors.name = 'El nombre no puede superar 60 caracteres.';
  }

  // 2. Validación de cantidad estricta
  const quantityParsed = parseQuantityInput(data.quantityText);
  if (!quantityParsed.ok) {
    errors.quantity = quantityParsed.error;
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
    sanitizedData: isValid && quantityParsed.ok
      ? {
          name: trimmedName,
          quantity: quantityParsed.value,
          unit: data.unit,
          category: data.category,
          expirationDate: sanitizedExpiration,
        }
      : undefined,
  };
}
