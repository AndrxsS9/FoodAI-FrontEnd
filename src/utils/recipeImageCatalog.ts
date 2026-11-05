/**
 * FoodAI - Catálogo local de imágenes de referencia y resolución compartida de la
 * imagen de una receta (Bloque 3A).
 *
 * Reglas de integridad:
 * - Solo se registran assets WebP locales que EXISTEN en `assets/images/recipes/`
 *   y cuyos derechos de uso están documentados (ver MANIFEST.md en esa carpeta).
 * - Cada registro usa un `require()` estático (compatible con Metro) y una clave
 *   de texto estable. Solo la clave se persiste; nunca el número de Metro.
 * - Las imágenes remotas de recetas reales están DESACTIVADAS en el MVP, aunque la
 *   URL sea HTTPS: HTTPS no prueba relevancia ni licencia. Requieren un diseño
 *   aparte y revisado.
 */
import type { ImageSourcePropType } from 'react-native';
import {
  RECIPE_IMAGE_CATEGORY_LABELS,
  RecipeImageKey,
  isBundledImageSource,
  isRecipeImageKey,
  recipeImageAssetPath,
} from '../types/recipeImage';
import { RecipeImageMatchInput, resolveRecipeImageKey } from './recipeImageMatcher';

/** Interruptor explícito: las URLs remotas de recetas reales no se cargan en el MVP. */
export const REMOTE_RECIPE_IMAGES_ENABLED = false;

export interface RecipeImageLicense {
  /** 'original': creada por/para el equipo; 'licensed': licencia de terceros verificada. */
  kind: 'original' | 'licensed';
  author: string;
  /** Nombre exacto de la licencia o contrato (p. ej. "Encargo interno FoodAI 2026-11"). */
  licenseName: string;
  /** Referencia verificable del origen (URL de la licencia, nº de contrato o encargo). */
  sourceReference: string;
  /** Fecha ISO (AAAA-MM-DD) en que se obtuvieron los derechos. */
  acquiredOn: string;
  /** Persona responsable que aprobó el uso en la app. */
  approvedBy: string;
  attributionRequired: boolean;
  attributionText?: string;
}

export interface ApprovedRecipeImageAsset {
  key: RecipeImageKey;
  /** Ruta relativa al repositorio; debe ser exactamente `assets/images/recipes/<key>.webp`. */
  file: string;
  source: ImageSourcePropType;
  license: RecipeImageLicense;
}

/**
 * Assets aprobados. VACÍO a propósito: todavía no existen imágenes con derechos
 * documentados. Para añadir una, colocar el archivo real y registrar, por ejemplo:
 *
 *   {
 *     key: 'soup',
 *     file: 'assets/images/recipes/soup.webp',
 *     source: require('../../assets/images/recipes/soup.webp'),
 *     license: { ...datos reales y verificables... },
 *   },
 *
 * Las pruebas de integridad fallan si el archivo no existe o la licencia está incompleta.
 */
export const APPROVED_RECIPE_IMAGE_ASSETS: readonly ApprovedRecipeImageAsset[] = [];

export type RecipeImageCatalog = ReadonlyMap<RecipeImageKey, ApprovedRecipeImageAsset>;

const nonEmpty = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

export function isCompleteRecipeImageLicense(license: unknown): license is RecipeImageLicense {
  if (!license || typeof license !== 'object') return false;
  const l = license as Partial<RecipeImageLicense>;
  if (l.kind !== 'original' && l.kind !== 'licensed') return false;
  if (![l.author, l.licenseName, l.sourceReference, l.approvedBy].every(nonEmpty)) return false;
  if (typeof l.acquiredOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(l.acquiredOn)) return false;
  if (typeof l.attributionRequired !== 'boolean') return false;
  if (l.attributionRequired && !nonEmpty(l.attributionText)) return false;
  return true;
}

/**
 * Construye el catálogo descartando registros inválidos: clave desconocida, ruta
 * distinta de la canónica, fuente no empaquetada, licencia incompleta o duplicados.
 */
export function buildRecipeImageCatalog(
  assets: readonly ApprovedRecipeImageAsset[]
): RecipeImageCatalog {
  const catalog = new Map<RecipeImageKey, ApprovedRecipeImageAsset>();
  for (const asset of assets) {
    if (!asset || !isRecipeImageKey(asset.key)) continue;
    if (asset.file !== recipeImageAssetPath(asset.key)) continue;
    if (!isBundledImageSource(asset.source)) continue;
    if (!isCompleteRecipeImageLicense(asset.license)) continue;
    if (catalog.has(asset.key)) continue;
    catalog.set(asset.key, asset);
  }
  return catalog;
}

export const RECIPE_IMAGE_CATALOG: RecipeImageCatalog = buildRecipeImageCatalog(
  APPROVED_RECIPE_IMAGE_ASSETS
);

export interface RecipeImageRecipeInput extends RecipeImageMatchInput {
  isDemoFixture?: boolean;
  imageUrl?: unknown;
  imageKey?: unknown;
}

export type RecipeImagePresentation =
  | {
      /** Foto empaquetada de una receta de demostración (comportamiento existente). */
      kind: 'demo-photo';
      source: ImageSourcePropType;
      imageKey: null;
      referenceLabel: null;
    }
  | {
      /** Imagen de referencia de la categoría; NO es una foto del plato generado. */
      kind: 'reference';
      source: ImageSourcePropType;
      imageKey: RecipeImageKey;
      referenceLabel: string;
    }
  | {
      /** Sin imagen fiable: la UI muestra el respaldo neutro de RecipeImage. */
      kind: 'none';
      source: null;
      imageKey: RecipeImageKey | null;
      referenceLabel: null;
    };

/** Clave persistida válida o, si falta o es desconocida, la derivada del nombre/ingredientes. */
export function getRecipeImageKey(recipe: RecipeImageRecipeInput): RecipeImageKey | null {
  return isRecipeImageKey(recipe.imageKey) ? recipe.imageKey : resolveRecipeImageKey(recipe);
}

/**
 * Punto único de integración para Inicio, Recetas y Detalle.
 * Prioridad: foto empaquetada de demo → imagen de referencia del catálogo → respaldo neutro.
 * Las URLs remotas (HTTPS o no) de recetas reales se ignoran mientras
 * REMOTE_RECIPE_IMAGES_ENABLED sea false.
 */
export function getRecipeImageSource(
  recipe: RecipeImageRecipeInput | null | undefined,
  catalog: RecipeImageCatalog = RECIPE_IMAGE_CATALOG
): RecipeImagePresentation {
  if (!recipe) return { kind: 'none', source: null, imageKey: null, referenceLabel: null };

  if (recipe.isDemoFixture === true && isBundledImageSource(recipe.imageUrl)) {
    return {
      kind: 'demo-photo',
      source: recipe.imageUrl as ImageSourcePropType,
      imageKey: null,
      referenceLabel: null,
    };
  }

  const imageKey = getRecipeImageKey(recipe);
  const asset = imageKey ? catalog.get(imageKey) : undefined;
  if (imageKey && asset) {
    return {
      kind: 'reference',
      source: asset.source,
      imageKey,
      referenceLabel: RECIPE_IMAGE_CATEGORY_LABELS[imageKey],
    };
  }

  return { kind: 'none', source: null, imageKey, referenceLabel: null };
}
