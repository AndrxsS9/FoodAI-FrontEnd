/**
 * FoodAI - Formateadores de presentación por idioma (Fase 28C-A).
 *
 * - Fechas de calendario sin depender de Intl para obtener resultados idénticos en Hermes,
 *   web y pruebas. El formato español reproduce exactamente las salidas previas.
 * - Moneda: SIEMPRE pesos colombianos (COP). El idioma solo cambia la presentación
 *   (separador de miles), nunca el valor ni la lógica de presupuesto.
 * - Puras y sin React: utilizables desde utilidades y pruebas.
 */
import type { Locale } from '../services/storage/localeStorage';
import { translate, translatePlural } from './index';

export const MONTH_NAMES_BY_LOCALE: Readonly<Record<Locale, readonly string[]>> = {
  es: [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ],
  en: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],
};

export const MONTH_SHORT_NAMES_BY_LOCALE: Readonly<Record<Locale, readonly string[]>> = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

/** Iniciales de los días de la semana, comenzando en lunes. */
export const WEEKDAY_INITIALS_BY_LOCALE: Readonly<Record<Locale, readonly string[]>> = {
  es: ['L', 'M', 'X', 'J', 'V', 'S', 'D'],
  en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
};

/** Nombres completos de los días de la semana, comenzando en lunes (lectores de pantalla). */
export const WEEKDAY_NAMES_BY_LOCALE: Readonly<Record<Locale, readonly string[]>> = {
  es: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'],
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
};

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/** «Noviembre 2026» / «November 2026». */
export function formatMonthYear(month: number, year: number, locale: Locale): string {
  return `${capitalize(MONTH_NAMES_BY_LOCALE[locale][month] ?? '')} ${year}`;
}

/** «15 nov 2026» / «Nov 15, 2026». */
export function formatShortDateParts(date: Date, locale: Locale): string {
  const month = MONTH_SHORT_NAMES_BY_LOCALE[locale][date.getMonth()];
  return locale === 'en'
    ? `${month} ${date.getDate()}, ${date.getFullYear()}`
    : `${date.getDate()} ${month} ${date.getFullYear()}`;
}

/** «15 de noviembre de 2026» / «November 15, 2026». */
export function formatLongDateParts(date: Date, locale: Locale): string {
  const month = MONTH_NAMES_BY_LOCALE[locale][date.getMonth()];
  return locale === 'en'
    ? `${month} ${date.getDate()}, ${date.getFullYear()}`
    : `${date.getDate()} de ${month} de ${date.getFullYear()}`;
}

/** Agrupa los miles de un entero no negativo con el separador del idioma. */
function groupThousands(integer: number, locale: Locale): string {
  const separator = locale === 'en' ? ',' : '.';
  return String(integer).replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/**
 * Formatea un número para presentación: separador de miles y hasta `maxFractionDigits`
 * decimales («1.234,5» en español, «1,234.5» en inglés).
 */
export function formatNumberForLocale(
  value: number,
  locale: Locale,
  maxFractionDigits = 2
): string {
  if (!Number.isFinite(value)) return '0';
  const factor = Math.pow(10, Math.max(0, maxFractionDigits));
  const rounded = Math.round(Math.abs(value) * factor) / factor;
  const [intPart, fracPart] = String(rounded).split('.');
  const sign = value < 0 && rounded !== 0 ? '-' : '';
  const decimalSeparator = locale === 'en' ? '.' : ',';
  const grouped = groupThousands(Number(intPart), locale);
  return fracPart ? `${sign}${grouped}${decimalSeparator}${fracPart}` : `${sign}${grouped}`;
}

/**
 * Pesos colombianos (COP) en ambos idiomas: «$12.500 COP» / «$12,500 COP».
 * Redondea a pesos enteros y conserva el signo de valores negativos.
 */
export function formatCopForLocale(amount: number, locale: Locale, withSuffix = true): string {
  if (!Number.isFinite(amount)) return withSuffix ? '$0 COP' : '$0';
  // Misma semántica que `formatCopCurrency` (types/recipe) para mantener salidas idénticas en español.
  const isNegative = amount < 0;
  const formatted = groupThousands(Math.abs(Math.round(amount)), locale);
  const sign = isNegative ? '-' : '';
  return withSuffix ? `${sign}$${formatted} COP` : `${sign}$${formatted}`;
}

/**
 * Descripción relativa de vencimiento respecto a hoy:
 * «Vence hoy», «Vence en 3 días», «Venció hace 2 días» (y equivalentes en inglés).
 */
export function describeRelativeExpirationForLocale(
  date: Date,
  locale: Locale,
  reference: Date = new Date()
): string {
  const today = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000);

  if (diff === 0) return translate(locale, 'dates.expiresToday');
  if (diff === 1) return translate(locale, 'dates.expiresTomorrow');
  if (diff === -1) return translate(locale, 'dates.expiredYesterday');
  if (diff < 0) return translatePlural(locale, 'dates.expiredDaysAgo', Math.abs(diff));
  return translatePlural(locale, 'dates.expiresInDays', diff);
}

export interface LocaleFormatters {
  number: (value: number, maxFractionDigits?: number) => string;
  /** Moneda COP (el idioma solo afecta la presentación). */
  currency: (amount: number, withSuffix?: boolean) => string;
  shortDate: (date: Date) => string;
  longDate: (date: Date) => string;
  monthYear: (month: number, year: number) => string;
  weekdayInitials: readonly string[];
}

const formatterCache = new Map<Locale, LocaleFormatters>();

export function getFormatters(locale: Locale): LocaleFormatters {
  const cached = formatterCache.get(locale);
  if (cached) return cached;
  const formatters: LocaleFormatters = {
    number: (value, digits) => formatNumberForLocale(value, locale, digits),
    currency: (amount, withSuffix) => formatCopForLocale(amount, locale, withSuffix),
    shortDate: (date) => formatShortDateParts(date, locale),
    longDate: (date) => formatLongDateParts(date, locale),
    monthYear: (month, year) => formatMonthYear(month, year, locale),
    weekdayInitials: WEEKDAY_INITIALS_BY_LOCALE[locale],
  };
  formatterCache.set(locale, formatters);
  return formatters;
}
