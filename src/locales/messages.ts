/**
 * FoodAI - Traducción de mensajes generados por la capa de dominio (Fase 28C-A).
 *
 * Los servicios, contextos y validadores siguen produciendo sus mensajes en español
 * canónico (sin cambios de comportamiento ni de pruebas existentes). La interfaz los
 * convierte al idioma activo en el momento de mostrarlos:
 *
 * 1. Coincidencia exacta contra `es.messages` → misma clave en el catálogo activo.
 * 2. Coincidencia por plantilla: `{x}` se convierte en un grupo de captura y los valores
 *    capturados se reinyectan en la plantilla del idioma activo (sin evaluarlos).
 * 3. Mensaje desconocido:
 *    - español → se muestra tal cual (comportamiento previo intacto);
 *    - otro idioma → se muestra el mensaje de respaldo indicado, nunca el texto crudo.
 */
import es from './es';
import {
  InterpolationParams,
  Locale,
  MessageKey,
  catalogs,
  extractPlaceholders,
  flattenCatalog,
  hasMessage,
  interpolate,
  translate,
} from './index';
import { getCategoryLabel, isCanonicalCategory, isCanonicalUnit, getUnitShortLabel } from './labels';

interface TemplateMatcher {
  key: string;
  pattern: RegExp;
  params: string[];
}

const MESSAGE_PREFIX = 'messages';

let exactIndex: Map<string, string> | null = null;
let templateMatchers: TemplateMatcher[] | null = null;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildIndexes() {
  exactIndex = new Map();
  templateMatchers = [];

  for (const { key, value } of flattenCatalog(es.messages, MESSAGE_PREFIX)) {
    const params = extractPlaceholders(value);
    if (params.length === 0) {
      if (!exactIndex.has(value)) exactIndex.set(value, key);
      continue;
    }

    const orderedParams: string[] = [];
    const source = value
      .split(/(\{\w+\})/g)
      .map((part) => {
        const match = /^\{(\w+)\}$/.exec(part);
        if (match) {
          orderedParams.push(match[1]);
          return '([\\s\\S]+?)';
        }
        return escapeRegExp(part);
      })
      .join('');
    templateMatchers.push({ key, pattern: new RegExp(`^${source}$`), params: orderedParams });
  }

  // Las plantillas más específicas (más texto literal) se prueban primero.
  templateMatchers.sort((a, b) => b.pattern.source.length - a.pattern.source.length);
}

function lookupTemplate(locale: Locale, key: string): string | null {
  let node: unknown = catalogs[locale];
  for (const segment of key.split('.')) {
    if (!node || typeof node !== 'object') return null;
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === 'string' ? node : null;
}

export interface LocalizedMessageMatch {
  key: string;
  params: InterpolationParams;
}

/** Identifica la clave del catálogo que corresponde a un mensaje de dominio en español. */
export function matchDomainMessage(message: string): LocalizedMessageMatch | null {
  if (!exactIndex || !templateMatchers) buildIndexes();
  const trimmed = message.trim();

  const exactKey = exactIndex!.get(trimmed);
  if (exactKey) return { key: exactKey, params: {} };

  for (const matcher of templateMatchers!) {
    const match = matcher.pattern.exec(trimmed);
    if (match) {
      const params: Record<string, string> = {};
      matcher.params.forEach((name, index) => {
        params[name] = match[index + 1];
      });
      return { key: matcher.key, params };
    }
  }
  return null;
}

/**
 * Los parámetros cuyo nombre empieza por `unit` o `category` transportan valores canónicos
 * (p. ej. 'unidad', 'Lácteos'); solo esos se convierten a su etiqueta visible. Cualquier otro
 * valor (nombres de alimentos escritos por el usuario, cantidades) se conserva intacto.
 */
export function localizeCanonicalParam(name: string, value: string, locale: Locale): string {
  if (/^unit/i.test(name) && isCanonicalUnit(value)) return getUnitShortLabel(value, locale);
  if (/^category/i.test(name) && isCanonicalCategory(value)) return getCategoryLabel(value, locale);
  return value;
}

export interface LocalizeMessageOptions {
  /** Mensaje a usar en idiomas distintos del español cuando el texto es desconocido. */
  fallbackKey?: MessageKey;
  /** Transforma los valores capturados (p. ej. traducir una categoría canónica). */
  mapParam?: (name: string, value: string) => string;
  /**
   * Para contenido (no errores): un texto desconocido se muestra tal cual en lugar del
   * mensaje de respaldo, p. ej. texto generado por el backend.
   */
  passthroughUnknown?: boolean;
}

/**
 * Traduce un mensaje de dominio al idioma activo. Devuelve `null` si no hay mensaje.
 */
export function localizeMessage(
  message: string | null | undefined,
  locale: Locale,
  options: LocalizeMessageOptions = {}
): string | null {
  if (message === null || message === undefined) return null;
  if (typeof message !== 'string' || !message.trim()) return null;

  if (locale === 'es') return message;

  const match = matchDomainMessage(message);
  if (match) {
    const template = lookupTemplate(locale, match.key);
    if (template) {
      const params: Record<string, string> = {};
      for (const [name, value] of Object.entries(match.params)) {
        const raw = String(value);
        params[name] = options.mapParam
          ? options.mapParam(name, raw)
          : localizeCanonicalParam(name, raw, locale);
      }
      return interpolate(template, params);
    }
  }

  if (options.passthroughUnknown) return message;
  return translate(locale, options.fallbackKey ?? 'common.genericError');
}

/**
 * Traduce un error que expone un código estable (`errorCode`) junto con su mensaje.
 *
 * - Español: se conserva el mensaje existente (sin cambios de comportamiento).
 * - Otros idiomas: `apiErrors.<contexto>.<CÓDIGO>` → `apiErrors.shared.<CÓDIGO>` →
 *   coincidencia del mensaje en el catálogo → `apiErrors.<contexto>.fallback`.
 *   Nunca se muestra el texto interno o del servidor sin traducir.
 */
export type CodedErrorContext = 'recipes' | 'mealPlan' | 'scanner';

export function localizeCodedError(
  context: CodedErrorContext,
  code: string | null | undefined,
  message: string | null | undefined,
  locale: Locale
): string | null {
  const hasMessageText = typeof message === 'string' && message.trim().length > 0;
  if (!hasMessageText && !code) return null;

  const contextFallback = `apiErrors.${context}.fallback` as MessageKey;

  if (locale === 'es') {
    if (hasMessageText) return message as string;
  }

  if (code) {
    const specific = `apiErrors.${context}.${code}`;
    if (hasMessage(locale, specific)) return translate(locale, specific);
    const shared = `apiErrors.shared.${code}`;
    if (hasMessage(locale, shared)) return translate(locale, shared);
  }

  if (hasMessageText) {
    return localizeMessage(message, locale, { fallbackKey: contextFallback });
  }
  return translate(locale, contextFallback);
}
