/**
 * FoodAI - Etiquetas de presentación para valores canónicos (Fase 28C-A).
 *
 * Las categorías y unidades se almacenan y se envían al backend SIEMPRE con su valor
 * canónico en español ('Lácteos', 'unidad', 'cucharada', ...). Estas funciones solo
 * producen el texto visible; nunca deben usarse para construir datos persistidos o
 * cargas útiles de API.
 */
import {
  INGREDIENT_CATEGORIES,
  INGREDIENT_UNITS,
  IngredientCategory,
  IngredientUnit,
} from '../types/pantry';
import { formatIngredientQuantity } from '../types/recipe';
import { RECIPE_IMAGE_CATEGORY_LABELS, RecipeImageKey } from '../types/recipeImage';
import { Locale, MessageKey, translate } from './index';
import { formatNumberForLocale } from './format';

const CATEGORY_KEYS: Readonly<Record<IngredientCategory, MessageKey>> = {
  'Verduras y frutas': 'categories.produce',
  'Carnes y proteínas': 'categories.proteins',
  'Lácteos': 'categories.dairy',
  'Granos y cereales': 'categories.grains',
  'Alacena': 'categories.pantry',
  'Otros': 'categories.other',
};

export function isCanonicalCategory(value: unknown): value is IngredientCategory {
  return typeof value === 'string' && (INGREDIENT_CATEGORIES as readonly string[]).includes(value);
}

export function isCanonicalUnit(value: unknown): value is IngredientUnit {
  return typeof value === 'string' && (INGREDIENT_UNITS as readonly string[]).includes(value);
}

/**
 * Nombre visible de una categoría. Un valor no canónico (datos antiguos o externos)
 * se muestra tal cual: nunca se reescribe información del usuario.
 */
export function getCategoryLabel(category: string, locale: Locale): string {
  return isCanonicalCategory(category) ? translate(locale, CATEGORY_KEYS[category]) : category;
}

/** Abreviatura visible de una unidad («un», «cda» / «pc», «tbsp»). */
export function getUnitShortLabel(unit: string, locale: Locale): string {
  return isCanonicalUnit(unit) ? translate(locale, `units.short.${unit}` as MessageKey) : unit;
}

/** Nombre completo visible de una unidad («Gramos (g)» / «Grams (g)»). */
export function getUnitName(unit: string, locale: Locale): string {
  return isCanonicalUnit(unit) ? translate(locale, `units.name.${unit}` as MessageKey) : unit;
}

/**
 * Traduce una abreviatura o nombre de unidad ya formateado en español
 * (p. ej. «cda», «s/u», «unidad») a su etiqueta corta en el idioma activo.
 * Valores desconocidos se devuelven sin cambios.
 */
export function localizeUnitText(unitText: string, locale: Locale): string {
  const trimmed = (unitText ?? '').trim();
  if (!trimmed || locale === 'es') return unitText;
  if (isCanonicalUnit(trimmed)) return getUnitShortLabel(trimmed, locale);
  const lower = trimmed.toLowerCase();
  for (const unit of INGREDIENT_UNITS) {
    if (translate('es', `units.short.${unit}` as MessageKey).toLowerCase() === lower) {
      return getUnitShortLabel(unit, locale);
    }
  }
  return unitText;
}

/**
 * Cantidad de un ingrediente de receta lista para mostrar. En español delega en
 * `formatIngredientQuantity` (salida idéntica a la previa); en otros idiomas aplica las
 * mismas reglas con textos y unidades traducidos. Nunca muestra una cantidad nula como cero.
 */
export function formatIngredientQuantityForLocale(
  quantity: number | null | undefined,
  unit: string | undefined,
  locale: Locale
): string {
  if (locale === 'es') return formatIngredientQuantity(quantity, unit);

  const safeUnit = unit ? unit.trim() : '';
  const isUnknownUnit =
    !safeUnit || safeUnit.toLowerCase() === 'desconocida' || safeUnit.toLowerCase() === 's/u';

  if (quantity === null || quantity === undefined) {
    return isUnknownUnit
      ? translate(locale, 'messages.recipe.quantityToConfirm')
      : translate(locale, 'messages.recipe.quantityToConfirmUnit', {
          unit: localizeUnitText(safeUnit, locale),
        });
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return translate(locale, 'messages.recipe.quantityToTaste');
  }

  const displayQty = Number.isInteger(quantity)
    ? quantity.toString()
    : formatNumberForLocale(quantity, locale, 2);

  return isUnknownUnit ? displayQty : `${displayQty} ${localizeUnitText(safeUnit, locale)}`;
}

/**
 * Etiqueta visible de la categoría de una imagen de referencia de receta. Recibe la etiqueta
 * canónica en español (RECIPE_IMAGE_CATEGORY_LABELS) y la traduce; otras etiquetas se respetan.
 */
export function localizeRecipeImageLabel(label: string, locale: Locale): string {
  if (locale === 'es') return label;
  const entry = (Object.entries(RECIPE_IMAGE_CATEGORY_LABELS) as [RecipeImageKey, string][]).find(
    ([, esLabel]) => esLabel === label
  );
  return entry ? translate(locale, `recipeImage.categories.${entry[0]}` as MessageKey) : label;
}
