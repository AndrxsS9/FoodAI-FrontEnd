/**
 * FoodAI - Textos de presentación derivados de estados de dominio (Fase 28C-A).
 *
 * Las funciones de dominio (vencimiento, advertencias semánticas) siguen produciendo sus
 * textos canónicos en español. Aquí se construye el texto visible a partir de los datos
 * estructurados (días restantes, código de advertencia, valores canónicos), sin modificar
 * ningún dato persistido. En español se devuelve exactamente el texto previo.
 */
import type { ExpirationStatus, IngredientCategory, IngredientUnit } from '../types/pantry';
import type { IngredientSemanticWarning } from '../utils/pantryValidation';
import { classifyIngredient } from '../utils/ingredientMapper';
import { Locale, translate } from './index';
import { getCategoryLabel, getUnitName } from './labels';

/** Etiqueta del estado de vencimiento («Vence hoy», «Consumir pronto (5d)», ...). */
export function getExpirationStatusLabel(status: ExpirationStatus, locale: Locale): string {
  if (locale === 'es') return status.label;

  const days = status.daysRemaining;
  if (days === null) return translate(locale, 'expiration.available');
  if (days < 0) return translate(locale, 'expiration.expired', { days: Math.abs(days) });
  if (days === 0) return translate(locale, 'expiration.today');
  if (days === 1) return translate(locale, 'expiration.tomorrow');
  if (days <= 3) return translate(locale, 'expiration.inDays', { days });
  if (days <= 7) return translate(locale, 'expiration.soon', { days });
  return translate(locale, 'expiration.available');
}

/** «Gramos (g), Kilogramos (kg) o Litros (l)» con la conjunción del idioma. */
export function formatUnitNameList(units: readonly IngredientUnit[], locale: Locale): string {
  const names = units.map((unit) => getUnitName(unit, locale));
  if (names.length <= 1) return names.join('');
  return translate(locale, 'ingredientForm.listOr', {
    list: names.slice(0, -1).join(', '),
    last: names[names.length - 1],
  });
}

export interface SemanticWarningInput {
  name: string;
  unit: IngredientUnit;
  category: IngredientCategory;
}

/**
 * Texto visible de una advertencia semántica (Fase 28A), traducido por su código estable.
 * El nombre del alimento se muestra tal como lo escribió el usuario.
 */
export function formatSemanticWarning(
  warning: IngredientSemanticWarning,
  input: SemanticWarningInput,
  locale: Locale
): string {
  if (locale === 'es') return warning.message;

  const name = (input.name ?? '').trim();
  const unit = getUnitName(input.unit, locale).toLowerCase();

  switch (warning.code) {
    case 'category_mismatch':
      return translate(locale, 'semanticWarnings.category_mismatch', {
        name,
        suggested: warning.suggestedCategory
          ? getCategoryLabel(warning.suggestedCategory, locale)
          : '',
        selected: getCategoryLabel(input.category, locale),
      });
    case 'liquid_measured_by_mass':
      return translate(locale, 'semanticWarnings.liquid_measured_by_mass', { name, unit });
    case 'solid_measured_by_volume':
      return classifyIngredient(name).presentation === 'powder'
        ? translate(locale, 'semanticWarnings.solid_measured_by_volume_powder', { name, unit })
        : translate(locale, 'semanticWarnings.solid_measured_by_volume', { name, unit });
    case 'countable_measured_by_volume':
      return translate(locale, 'semanticWarnings.countable_measured_by_volume', { name, unit });
    default:
      return warning.message;
  }
}
