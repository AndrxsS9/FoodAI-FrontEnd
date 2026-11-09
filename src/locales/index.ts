/**
 * FoodAI - Motor de localización ligero y estrictamente tipado (Fase 28C-A).
 *
 * - Catálogos: `es` (fuente canónica y predeterminada) y `en`.
 * - Claves tipadas derivadas del catálogo español: un error de escritura en una clave
 *   es un error de compilación, y el catálogo inglés debe tener exactamente la misma forma.
 * - Interpolación segura de una sola pasada: `{nombre}` se sustituye por el valor dado;
 *   los valores nunca se reinterpretan como plantillas ni se evalúan.
 * - Pluralización mediante entradas `{ one, other }` y la regla de cada idioma.
 * - Sin dependencias externas ni de React: puede usarse desde utilidades puras.
 */

import es from './es';
import en from './en';
import {
  DEFAULT_LOCALE,
  Locale,
  SUPPORTED_LOCALES,
  isSupportedLocale,
} from '../services/storage/localeStorage';

export { DEFAULT_LOCALE, SUPPORTED_LOCALES, isSupportedLocale };
export type { Locale };

// ---------------------------------------------------------------------------
// Tipos derivados del catálogo
// ---------------------------------------------------------------------------

export type SpanishCatalog = typeof es;

/** Convierte los literales del catálogo español en `string` conservando la forma. */
type Widen<T> = T extends string ? string : { readonly [K in keyof T]: Widen<T[K]> };

/** Forma obligatoria de cualquier catálogo: idéntica a la del español. */
export type TranslationCatalog = Widen<SpanishCatalog>;

export interface PluralForms {
  readonly one: string;
  readonly other: string;
}

type IsPlural<T> = T extends PluralForms ? true : false;
type Join<P extends string, K extends string> = P extends '' ? K : `${P}.${K}`;

type MessagePaths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? Join<P, K>
    : IsPlural<T[K]> extends true
    ? never
    : MessagePaths<T[K], Join<P, K>>;
}[keyof T & string];

type PluralPaths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? never
    : IsPlural<T[K]> extends true
    ? Join<P, K>
    : PluralPaths<T[K], Join<P, K>>;
}[keyof T & string];

/** Toda clave de mensaje simple válida (p. ej. `'settings.language.title'`). */
export type MessageKey = MessagePaths<SpanishCatalog>;
/** Toda clave de mensaje con formas plurales. */
export type PluralKey = PluralPaths<SpanishCatalog>;

type ValueAt<T, K extends string> = K extends `${infer H}.${infer R}`
  ? H extends keyof T
    ? ValueAt<T[H], R>
    : never
  : K extends keyof T
  ? T[K]
  : never;

type ExtractParams<S> = S extends `${string}{${infer P}}${infer R}` ? P | ExtractParams<R> : never;

/** Nombres de parámetros requeridos por una clave concreta. */
export type ParamsOf<K extends MessageKey> = ExtractParams<ValueAt<SpanishCatalog, K>>;

export type InterpolationValue = string | number;
export type InterpolationParams = Readonly<Record<string, InterpolationValue>>;

type ParamArgs<K extends MessageKey> = [ParamsOf<K>] extends [never]
  ? []
  : [params: { readonly [P in ParamsOf<K>]: InterpolationValue }];

/** Traducción con clave y parámetros verificados en compilación. */
export type Translate = <K extends MessageKey>(key: K, ...args: ParamArgs<K>) => string;
/** Traducción con clave dinámica (verificada) y parámetros libres. */
export type TranslateDynamic = (key: MessageKey, params?: InterpolationParams) => string;
/** Traducción plural: incluye `{count}` automáticamente. */
export type TranslatePlural = (key: PluralKey, count: number, params?: InterpolationParams) => string;

export interface Translator {
  locale: Locale;
  t: Translate;
  tx: TranslateDynamic;
  tp: TranslatePlural;
}

// ---------------------------------------------------------------------------
// Catálogos y búsqueda
// ---------------------------------------------------------------------------

export const catalogs: Readonly<Record<Locale, TranslationCatalog>> = { es, en };

function lookup(catalog: unknown, key: string): unknown {
  let node: unknown = catalog;
  for (const segment of key.split('.')) {
    if (!node || typeof node !== 'object' || !Object.prototype.hasOwnProperty.call(node, segment)) {
      return undefined;
    }
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

function isPluralForms(value: unknown): value is PluralForms {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as PluralForms).one === 'string' &&
    typeof (value as PluralForms).other === 'string'
  );
}

const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;

/**
 * Sustituye `{nombre}` por `params.nombre` en una única pasada. Los marcadores sin valor
 * se conservan tal cual (y se advierte en desarrollo) para no ocultar errores de datos.
 */
export function interpolate(template: string, params?: InterpolationParams): string {
  if (!params) return template;
  return template.replace(PLACEHOLDER_PATTERN, (match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(params, name)) {
      const value = params[name];
      if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
      if (typeof value === 'string') return value;
    }
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn(`[FoodAI:i18n] Falta el parámetro "${name}" para la plantilla "${template}".`);
    }
    return match;
  });
}

/** Lista de marcadores `{x}` presentes en una plantilla (sin duplicados, ordenados). */
export function extractPlaceholders(template: string): string[] {
  const names = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) names.add(match[1]);
  return [...names].sort();
}

/** Regla plural: 'one' únicamente para |n| === 1 en español e inglés. */
export function selectPluralForm(_locale: Locale, count: number): keyof PluralForms {
  return Math.abs(count) === 1 ? 'one' : 'other';
}

function resolveString(locale: Locale, key: string): string {
  const value = lookup(catalogs[locale], key);
  if (typeof value === 'string') return value;

  const fallback = lookup(catalogs[DEFAULT_LOCALE], key);
  if (typeof fallback === 'string') return fallback;

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(`[FoodAI:i18n] Clave de traducción inexistente: "${key}".`);
  }
  return key;
}

/** Indica si existe una plantilla simple para la clave (útil con claves construidas). */
export function hasMessage(locale: Locale, key: string): key is MessageKey {
  return typeof lookup(catalogs[locale], key) === 'string';
}

export function translate(locale: Locale, key: MessageKey, params?: InterpolationParams): string {
  return interpolate(resolveString(locale, key), params);
}

export function translatePlural(
  locale: Locale,
  key: PluralKey,
  count: number,
  params?: InterpolationParams
): string {
  let forms = lookup(catalogs[locale], key);
  if (!isPluralForms(forms)) forms = lookup(catalogs[DEFAULT_LOCALE], key);
  if (!isPluralForms(forms)) return key;

  const template = forms[selectPluralForm(locale, count)];
  return interpolate(template, { count, ...params });
}

const translatorCache = new Map<Locale, Translator>();

/** Devuelve un traductor estable (memoizado) para el idioma indicado. */
export function getTranslator(locale: Locale): Translator {
  const safeLocale = isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
  const cached = translatorCache.get(safeLocale);
  if (cached) return cached;

  const translator: Translator = {
    locale: safeLocale,
    t: ((key: MessageKey, params?: InterpolationParams) =>
      translate(safeLocale, key, params)) as Translate,
    tx: (key, params) => translate(safeLocale, key, params),
    tp: (key, count, params) => translatePlural(safeLocale, key, count, params),
  };
  translatorCache.set(safeLocale, translator);
  return translator;
}

// ---------------------------------------------------------------------------
// Utilidades de verificación de paridad (usadas por las pruebas)
// ---------------------------------------------------------------------------

export interface FlattenedEntry {
  key: string;
  value: string;
}

/** Aplana un catálogo en pares clave → plantilla (las formas plurales como `clave.one`). */
export function flattenCatalog(catalog: unknown, prefix = ''): FlattenedEntry[] {
  const entries: FlattenedEntry[] = [];
  if (!catalog || typeof catalog !== 'object') return entries;
  for (const [segment, value] of Object.entries(catalog as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${segment}` : segment;
    if (typeof value === 'string') entries.push({ key, value });
    else entries.push(...flattenCatalog(value, key));
  }
  return entries;
}

export interface CatalogParityReport {
  missingKeys: string[];
  extraKeys: string[];
  placeholderMismatches: { key: string; expected: string[]; actual: string[] }[];
  emptyValues: string[];
}

/** Compara la forma y los marcadores de un catálogo contra el catálogo de referencia. */
export function compareCatalogs(reference: unknown, candidate: unknown): CatalogParityReport {
  const ref = new Map(flattenCatalog(reference).map((e) => [e.key, e.value]));
  const cand = new Map(flattenCatalog(candidate).map((e) => [e.key, e.value]));

  const report: CatalogParityReport = {
    missingKeys: [],
    extraKeys: [],
    placeholderMismatches: [],
    emptyValues: [],
  };

  for (const [key, value] of ref) {
    const other = cand.get(key);
    if (other === undefined) {
      report.missingKeys.push(key);
      continue;
    }
    if (!other.trim()) report.emptyValues.push(key);

    // Las formas plurales comparten parámetros entre sí; se comparan por conjunto completo.
    const expected = extractPlaceholders(value);
    const actual = extractPlaceholders(other);
    if (expected.join('|') !== actual.join('|')) {
      report.placeholderMismatches.push({ key, expected, actual });
    }
  }
  for (const key of cand.keys()) {
    if (!ref.has(key)) report.extraKeys.push(key);
  }
  return report;
}
