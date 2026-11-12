/**
 * Validaciones para el formulario de registro y edición de ingredientes (Fase 2B).
 */
import {
  INGREDIENT_CATEGORIES,
  INGREDIENT_UNITS,
  INGREDIENT_UNIT_NAMES,
  IngredientCategory,
  IngredientUnit,
} from '../types/pantry';
import {
  classifyIngredient,
  getUnitDimension,
  suggestIngredientMeasurement,
} from './ingredientMapper';

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

// ---------------------------------------------------------------------------
// Validación semántica (Fase 28A)
// ---------------------------------------------------------------------------

export type SemanticWarningCode =
  | 'category_mismatch'
  | 'liquid_measured_by_mass'
  | 'solid_measured_by_volume'
  | 'countable_measured_by_volume';

/**
 * Advertencia sobre una combinación sospechosa de nombre, categoría y unidad.
 * NUNCA bloquea por sí sola: la interfaz debe pedir confirmación explícita.
 */
export interface IngredientSemanticWarning {
  code: SemanticWarningCode;
  field: 'category' | 'unit';
  message: string;
  /** Categoría recomendada (solo para `category_mismatch`). */
  suggestedCategory?: IngredientCategory;
  /** Unidades recomendadas (solo para advertencias de unidad). */
  suggestedUnits?: IngredientUnit[];
}

export interface SemanticCheckInput {
  name: string;
  unit: IngredientUnit;
  category: IngredientCategory;
}

function unitLabel(unit: IngredientUnit): string {
  return INGREDIENT_UNIT_NAMES[unit].toLowerCase();
}

/**
 * Detecta combinaciones sospechosas (ej. leche líquida en kilogramos, arroz como lácteo,
 * huevos en litros). Solo opera con clasificaciones de confianza alta; los nombres
 * desconocidos o ambiguos nunca generan advertencias. Las unidades de cocina
 * (cucharada, cucharadita, taza) y «desconocida» no se consideran sospechosas aquí.
 */
export function detectIngredientSemanticWarnings(
  input: SemanticCheckInput
): IngredientSemanticWarning[] {
  const trimmedName = (input.name ?? '').trim();
  if (!trimmedName) return [];

  const classification = classifyIngredient(trimmedName);
  if (classification.confidence !== 'high' || !classification.category) return [];

  const warnings: IngredientSemanticWarning[] = [];

  if (
    INGREDIENT_CATEGORIES.includes(input.category) &&
    !classification.acceptableCategories.includes(input.category)
  ) {
    warnings.push({
      code: 'category_mismatch',
      field: 'category',
      message: `«${trimmedName}» suele pertenecer a ${classification.category}, pero elegiste ${input.category}.`,
      suggestedCategory: classification.category,
    });
  }

  const dimension = getUnitDimension(input.unit);
  const presentation = classification.presentation;
  const suggestedUnits = suggestIngredientMeasurement(trimmedName).suggestedUnits;

  if (presentation === 'liquid' && dimension === 'mass') {
    warnings.push({
      code: 'liquid_measured_by_mass',
      field: 'unit',
      message: `«${trimmedName}» parece un líquido y lo estás midiendo en ${unitLabel(input.unit)}. Si es en polvo o sólido, acláralo en el nombre (por ejemplo, «en polvo»).`,
      suggestedUnits,
    });
  } else if (
    (presentation === 'solid' || presentation === 'powder' || presentation === 'piece') &&
    dimension === 'volume'
  ) {
    warnings.push({
      code: 'solid_measured_by_volume',
      field: 'unit',
      message: `«${trimmedName}» es un alimento ${presentation === 'powder' ? 'en polvo' : 'sólido'} y lo estás midiendo en ${unitLabel(input.unit)}. FoodAI no convierte masa en volumen.`,
      suggestedUnits,
    });
  } else if (presentation === 'unit' && dimension === 'volume') {
    warnings.push({
      code: 'countable_measured_by_volume',
      field: 'unit',
      message: `«${trimmedName}» se cuenta por unidades; medirlo en ${unitLabel(input.unit)} parece un error.`,
      suggestedUnits,
    });
  }

  return warnings;
}

/**
 * Firma estable de una combinación revisada: permite exigir una nueva confirmación
 * cuando el usuario cambia el nombre, la unidad o la categoría tras confirmar.
 */
export function getSemanticCheckSignature(input: SemanticCheckInput): string {
  return [(input.name ?? '').trim().toLowerCase(), input.unit, input.category].join('|');
}

/** Datos mínimos de un ítem en revisión del escáner para la validación semántica. */
export interface ScannedSemanticInput extends SemanticCheckInput {
  action?: 'create' | 'add_to_existing';
  semanticReviewSignature?: string;
}

/**
 * Advertencias aplicables a un alimento detectado por el escáner. Cuando se suma a un
 * registro existente, la categoría no se guarda, por lo que solo se revisa la unidad.
 */
export function getScannedItemSemanticWarnings(
  item: ScannedSemanticInput
): IngredientSemanticWarning[] {
  const warnings = detectIngredientSemanticWarnings(item);
  return item.action === 'add_to_existing'
    ? warnings.filter((w) => w.field !== 'category')
    : warnings;
}

/** Indica si el usuario ya confirmó explícitamente la combinación actual del ítem. */
export function isScannedItemSemanticallyConfirmed(item: ScannedSemanticInput): boolean {
  return item.semanticReviewSignature === getSemanticCheckSignature(item);
}

export interface ValidationResult {
  isValid: boolean;
  /**
   * Advertencias semánticas no bloqueantes (Fase 28A). No afectan `isValid`;
   * la interfaz decide cómo solicitar confirmación.
   */
  warnings: IngredientSemanticWarning[];
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

  const warnings =
    trimmedName && !errors.unit && !errors.category
      ? detectIngredientSemanticWarnings({
          name: trimmedName,
          unit: data.unit,
          category: data.category,
        })
      : [];

  return {
    isValid,
    warnings,
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
