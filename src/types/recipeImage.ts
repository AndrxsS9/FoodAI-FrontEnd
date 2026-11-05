/**
 * FoodAI - Claves estables del catálogo local de imágenes de referencia (Bloque 3A).
 *
 * Las claves son identificadores de texto estables: son lo único que se persiste
 * (p. ej. dentro de un plan de comidas en AsyncStorage). Nunca se persisten los
 * identificadores numéricos que Metro asigna a `require()`, porque pueden cambiar
 * entre compilaciones.
 *
 * Cada clave representa una CATEGORÍA de plato, no una receta concreta: la imagen
 * asociada es siempre una "imagen de referencia" y nunca una foto del plato generado.
 */

export const RECIPE_IMAGE_KEYS = [
  'soup',
  'cream-soup',
  'salad',
  'rice-dish',
  'pasta',
  'eggs',
  'chicken',
  'beef-stew',
  'fish',
  'legumes',
  'arepa',
  'sandwich',
  'potatoes',
  'sauteed-vegetables',
  'dessert',
  'beverage',
] as const;

export type RecipeImageKey = (typeof RECIPE_IMAGE_KEYS)[number];

/** Nombre visible (español) de cada categoría, usado en etiquetas de accesibilidad. */
export const RECIPE_IMAGE_CATEGORY_LABELS: Readonly<Record<RecipeImageKey, string>> = {
  soup: 'Sopa',
  'cream-soup': 'Crema',
  salad: 'Ensalada',
  'rice-dish': 'Arroz',
  pasta: 'Pasta',
  eggs: 'Huevos',
  chicken: 'Pollo',
  'beef-stew': 'Carne guisada',
  fish: 'Pescado',
  legumes: 'Legumbres',
  arepa: 'Arepa',
  sandwich: 'Sándwich',
  potatoes: 'Papas y tubérculos',
  'sauteed-vegetables': 'Verduras salteadas',
  dessert: 'Postre',
  beverage: 'Bebida',
};

const KEY_SET: ReadonlySet<string> = new Set(RECIPE_IMAGE_KEYS);

export function isRecipeImageKey(value: unknown): value is RecipeImageKey {
  return typeof value === 'string' && KEY_SET.has(value);
}

/**
 * Asset empaquetado tal como lo entrega Metro en Web: `{ uri: '/assets/...', width, height }`.
 * Solo se acepta una ruta relativa del MISMO origen (empieza por '/', no por '//', sin
 * esquema ni barras invertidas) con dimensiones numéricas. Nunca acepta hosts remotos.
 */
export function isBundledWebAssetSource(source: unknown): boolean {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return false;
  const s = source as { uri?: unknown; width?: unknown; height?: unknown };
  if (typeof s.uri !== 'string') return false;
  const uri = s.uri;
  if (!uri.startsWith('/') || uri.startsWith('//') || uri.includes('\\')) return false;
  return (
    typeof s.width === 'number' &&
    Number.isFinite(s.width) &&
    s.width > 0 &&
    typeof s.height === 'number' &&
    Number.isFinite(s.height) &&
    s.height > 0
  );
}

/**
 * Fuente empaquetada con la app (resultado de `require()`):
 * - Android/iOS: identificador numérico de Metro.
 * - Web: objeto de asset del mismo origen (ver isBundledWebAssetSource).
 * - Jest (jest-expo): objeto simulado `{ testUri }`.
 * Las URLs remotas, en texto o en `{ uri }` absoluta, NO son fuentes empaquetadas.
 */
export function isBundledImageSource(source: unknown): boolean {
  if (typeof source === 'number') return Number.isInteger(source) && source > 0;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return false;
  if (isBundledWebAssetSource(source)) return true;
  const s = source as { uri?: unknown; testUri?: unknown };
  return !('uri' in s) && typeof s.testUri === 'string' && s.testUri.trim().length > 0;
}

/** Ruta relativa al repositorio donde debe existir el asset aprobado de cada categoría. */
export function recipeImageAssetPath(key: RecipeImageKey): string {
  return `assets/images/recipes/${key}.webp`;
}
