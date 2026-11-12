/**
 * FoodAI - Utilidades de presentación de fechas de calendario (AAAA-MM-DD).
 * No dependen de Intl para mantener resultados idénticos en Hermes, web y pruebas.
 * El idioma es opcional y por defecto español (salidas idénticas a las previas, Fase 28C-A).
 */
import { isValidDateString } from './pantryValidation';
import type { Locale } from '../services/storage/localeStorage';
import {
  describeRelativeExpirationForLocale,
  formatLongDateParts,
  formatShortDateParts,
} from '../locales/format';

export const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

const MONTH_SHORT_NAMES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const;

/** Convierte una fecha local a `AAAA-MM-DD`. */
export function toIsoDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Interpreta `AAAA-MM-DD` como fecha local a medianoche; `null` si no es válida. */
export function parseIsoDateString(value?: string | null): Date | null {
  if (!value || !isValidDateString(value)) return null;
  const [y, m, d] = value.trim().split('-').map((part) => parseInt(part, 10));
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/** Fecha `AAAA-MM-DD` situada `days` días después de `reference`. */
export function addDaysFromToday(days: number, reference: Date = new Date()): string {
  const target = new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate() + days
  );
  return toIsoDateString(target);
}

/** Formato corto legible: «15 nov 2026» (en inglés «Nov 15, 2026»). */
export function formatShortDate(value?: string | null, locale: Locale = 'es'): string | null {
  const date = parseIsoDateString(value);
  if (!date) return null;
  if (locale !== 'es') return formatShortDateParts(date, locale);
  return `${date.getDate()} ${MONTH_SHORT_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

/** Formato largo para lectores de pantalla: «15 de noviembre de 2026» («November 15, 2026»). */
export function formatLongDate(date: Date, locale: Locale = 'es'): string {
  if (locale !== 'es') return formatLongDateParts(date, locale);
  return `${date.getDate()} de ${MONTH_NAMES[date.getMonth()]} de ${date.getFullYear()}`;
}

/** Descripción relativa respecto a hoy: «Vence hoy», «Vence en 3 días», «Venció hace 2 días». */
export function describeRelativeExpiration(
  value?: string | null,
  reference: Date = new Date(),
  locale: Locale = 'es'
): string | null {
  const date = parseIsoDateString(value);
  if (!date) return null;
  if (locale !== 'es') return describeRelativeExpirationForLocale(date, locale, reference);
  const today = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000);

  if (diff === 0) return 'Vence hoy';
  if (diff === 1) return 'Vence mañana';
  if (diff === -1) return 'Venció ayer';
  if (diff < 0) return `Venció hace ${Math.abs(diff)} días`;
  return `Vence en ${diff} días`;
}
