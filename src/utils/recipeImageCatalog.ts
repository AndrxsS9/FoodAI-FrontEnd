/**
 * FoodAI - Catálogo local de imágenes de referencia y resolución compartida de la
 * imagen de una receta (Bloques 3A y 3C).
 *
 * Reglas de integridad:
 * - Solo se registran assets WebP locales que EXISTEN en `assets/images/recipes/`,
 *   con su SHA-256 verificado y su procedencia documentada (ver MANIFEST.md).
 * - Cada registro usa un `require()` estático (compatible con Metro) y una clave
 *   de texto estable. Solo la clave se persiste; nunca el número de Metro.
 * - Registrar un archivo NO lo activa: una imagen solo entra al catálogo de
 *   producción cuando existe una aprobación humana explícita ligada al SHA-256
 *   exacto del archivo revisado (RECIPE_IMAGE_APPROVALS). Si el archivo cambia
 *   después de aprobado, la aprobación deja de ser válida.
 * - Las imágenes remotas de recetas reales están DESACTIVADAS en el MVP, aunque la
 *   URL sea HTTPS: HTTPS no prueba relevancia ni licencia.
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

/** Procedencia verificable de un asset (hechos, no decisiones). */
export type RecipeImageProvenance =
  | {
      /** Imagen generada con un servicio de IA. */
      kind: 'ai-generated';
      /** Proveedor real del servicio de generación. */
      provider: string;
      /** Cómo se obtuvo y procesó el archivo (sin inventar modelo, fecha ni autor). */
      workflow: string;
      /** Términos del proveedor que rigen el uso del resultado (https). */
      termsReference: string;
      attributionRequired: boolean;
      attributionText?: string;
    }
  | {
      /** 'original': creada por/para el equipo; 'licensed': licencia de terceros. */
      kind: 'original' | 'licensed';
      author: string;
      /** Nombre exacto de la licencia o contrato. */
      licenseName: string;
      /** Referencia verificable (URL de la licencia, nº de contrato o encargo). */
      sourceReference: string;
      attributionRequired: boolean;
      attributionText?: string;
    };

/** Decisión humana explícita de usar un archivo concreto en producción. */
export interface RecipeImageApproval {
  /** Nombre real de la persona responsable que aprueba. Nunca un marcador genérico. */
  approvedBy: string;
  /** Fecha ISO (AAAA-MM-DD) de la aprobación. */
  approvedOn: string;
  /** SHA-256 del archivo exacto que se revisó y aprobó. */
  sha256: string;
}

export interface RecipeImageAssetRecord {
  key: RecipeImageKey;
  /** Ruta relativa al repositorio; debe ser exactamente `assets/images/recipes/<key>.webp`. */
  file: string;
  source: ImageSourcePropType;
  /** SHA-256 del archivo verificado técnicamente (las pruebas lo comparan con el disco). */
  sha256: string;
  provenance: RecipeImageProvenance;
}

export interface ApprovedRecipeImageAsset extends RecipeImageAssetRecord {
  approval: RecipeImageApproval;
}

const GEMINI_PROVENANCE: RecipeImageProvenance = {
  kind: 'ai-generated',
  provider: 'Google Gemini (generación de imágenes)',
  workflow:
    'Generada individualmente con el servicio de generación de imágenes de Google Gemini y ' +
    'convertida a WebP 1600x900. Modelo exacto, fecha y servicio (API o aplicación) no documentados.',
  termsReference: 'https://ai.google.dev/gemini-api/terms',
  attributionRequired: false,
};

const CHATGPT_COMPOSITE_BORDER_CORRECTED_PROVENANCE: RecipeImageProvenance = {
  kind: 'ai-generated',
  provider: 'OpenAI (generación de imágenes en ChatGPT)',
  workflow:
    'Generada con ChatGPT como parte de una única composición fotográfica (collage) de 13 platos; ' +
    'recortada, redimensionada a 1600x900 y convertida a WebP. Corrección técnica (Bloque 3D): ' +
    'eliminadas las 12 filas inferiores (costura del collage) y 10,7 px por lado, reescalada 1,35 % ' +
    'a 1600x900 (LANCZOS) y recodificada a WebP. Modelo exacto y fecha no documentados.',
  termsReference: 'https://openai.com/policies/terms-of-use/',
  attributionRequired: false,
};

const CHATGPT_INDIVIDUAL_PROVENANCE: RecipeImageProvenance = {
  kind: 'ai-generated',
  provider: 'OpenAI (generación de imágenes en ChatGPT)',
  workflow:
    'Generada individualmente con la generación de imágenes de OpenAI en ChatGPT (Bloque 3E, ' +
    'reemplazo de la versión del collage); redimensionada a 1600x900 y convertida a WebP para FoodAI. ' +
    'Modelo exacto y fecha no documentados.',
  termsReference: 'https://openai.com/policies/terms-of-use/',
  attributionRequired: false,
};

/**
 * Registro de los 16 archivos presentes y verificados técnicamente (WebP, 1600x900,
 * RGB sin alfa, <= 150 KiB). Estar registrado NO implica estar aprobado.
 */
export const RECIPE_IMAGE_ASSET_RECORDS: readonly RecipeImageAssetRecord[] = [
  {
    key: 'soup',
    file: 'assets/images/recipes/soup.webp',
    source: require('../../assets/images/recipes/soup.webp'),
    sha256: '4777432c736510c59def347e174cfb9c07fe65e73043d14539bb3c545e275a68',
    provenance: GEMINI_PROVENANCE,
  },
  {
    key: 'cream-soup',
    file: 'assets/images/recipes/cream-soup.webp',
    source: require('../../assets/images/recipes/cream-soup.webp'),
    sha256: 'ad143873c178a1c866f2a85bf426fe57e9438dc9194d9332dfec03e42ad109a2',
    provenance: GEMINI_PROVENANCE,
  },
  {
    key: 'salad',
    file: 'assets/images/recipes/salad.webp',
    source: require('../../assets/images/recipes/salad.webp'),
    sha256: '5fb8924059edd7c0a7091c5458361d58015bc288d63e275ca89afc8ed506691c',
    provenance: GEMINI_PROVENANCE,
  },
  {
    key: 'rice-dish',
    file: 'assets/images/recipes/rice-dish.webp',
    source: require('../../assets/images/recipes/rice-dish.webp'),
    sha256: 'fe541ca4c79b87f6ce0bc5b4be4779c201d62c5f20ee130bb30e27304bf9c30d',
    provenance: CHATGPT_COMPOSITE_BORDER_CORRECTED_PROVENANCE,
  },
  {
    key: 'pasta',
    file: 'assets/images/recipes/pasta.webp',
    source: require('../../assets/images/recipes/pasta.webp'),
    sha256: '24189badb0e66c22493a0fabd7747c2e05cb5ed3af73a6de1a02fdbc1bd3f8dc',
    provenance: CHATGPT_INDIVIDUAL_PROVENANCE,
  },
  {
    key: 'eggs',
    file: 'assets/images/recipes/eggs.webp',
    source: require('../../assets/images/recipes/eggs.webp'),
    sha256: '328617321b1ca9468b475a759421aa234578dcb95e41865435baf694351ad77c',
    provenance: CHATGPT_INDIVIDUAL_PROVENANCE,
  },
  {
    key: 'chicken',
    file: 'assets/images/recipes/chicken.webp',
    source: require('../../assets/images/recipes/chicken.webp'),
    sha256: 'c67eecd829ad89519182e1d35b8b819628a6a14fd5cc5c459ac0adbc731e6fc9',
    provenance: CHATGPT_INDIVIDUAL_PROVENANCE,
  },
  {
    key: 'beef-stew',
    file: 'assets/images/recipes/beef-stew.webp',
    source: require('../../assets/images/recipes/beef-stew.webp'),
    sha256: 'ac2f99eb53061e4b665ca2e01ddc5c3c6a33552f2646a323e55969f345bd2f1e',
    provenance: CHATGPT_COMPOSITE_BORDER_CORRECTED_PROVENANCE,
  },
  {
    key: 'fish',
    file: 'assets/images/recipes/fish.webp',
    source: require('../../assets/images/recipes/fish.webp'),
    sha256: '50f5f1d7ef61b43f38857dd0bf90fc035346d759d19dcc4f3a922f664142c7c8',
    provenance: CHATGPT_INDIVIDUAL_PROVENANCE,
  },
  {
    key: 'legumes',
    file: 'assets/images/recipes/legumes.webp',
    source: require('../../assets/images/recipes/legumes.webp'),
    sha256: '4f1df2735523b5c42e5ecfbb238c506331e8bfb93ec6ffb2a62df3d853a74201',
    provenance: CHATGPT_COMPOSITE_BORDER_CORRECTED_PROVENANCE,
  },
  {
    key: 'arepa',
    file: 'assets/images/recipes/arepa.webp',
    source: require('../../assets/images/recipes/arepa.webp'),
    sha256: 'd393db4231a72b50f5d0d59b06f4f0e24ba460a7cbb0ace40e5255472614c03c',
    provenance: CHATGPT_COMPOSITE_BORDER_CORRECTED_PROVENANCE,
  },
  {
    key: 'sandwich',
    file: 'assets/images/recipes/sandwich.webp',
    source: require('../../assets/images/recipes/sandwich.webp'),
    sha256: 'cec76ec03372c87683f350d0f022c5e8766f970723854b4b56b50b28f73ea9af',
    provenance: CHATGPT_INDIVIDUAL_PROVENANCE,
  },
  {
    key: 'potatoes',
    file: 'assets/images/recipes/potatoes.webp',
    source: require('../../assets/images/recipes/potatoes.webp'),
    sha256: '48c9a846832eb1dce36f0c7dc72a407630a135227c82978071f28737d4125c20',
    provenance: CHATGPT_COMPOSITE_BORDER_CORRECTED_PROVENANCE,
  },
  {
    key: 'sauteed-vegetables',
    file: 'assets/images/recipes/sauteed-vegetables.webp',
    source: require('../../assets/images/recipes/sauteed-vegetables.webp'),
    sha256: '66215f8def85b8bca4bf6fc3b9605e7135685276df3037be926b71b9831161bf',
    provenance: CHATGPT_COMPOSITE_BORDER_CORRECTED_PROVENANCE,
  },
  {
    key: 'dessert',
    file: 'assets/images/recipes/dessert.webp',
    source: require('../../assets/images/recipes/dessert.webp'),
    sha256: '24ac21c4581f528ca36a7c494c4f4dbce59e9747b8ed6ac6edf8fb0d58862e06',
    provenance: CHATGPT_COMPOSITE_BORDER_CORRECTED_PROVENANCE,
  },
  {
    key: 'beverage',
    file: 'assets/images/recipes/beverage.webp',
    source: require('../../assets/images/recipes/beverage.webp'),
    sha256: '8dd55a387db81b7361c2f71188be4580a90d6e732021bd069aeb0acc26c17681',
    provenance: CHATGPT_COMPOSITE_BORDER_CORRECTED_PROVENANCE,
  },
];

/**
 * Aprobaciones humanas explícitas. VACÍO: el responsable del proyecto todavía no ha
 * aprobado ninguna imagen para producción. Mientras esté vacío, toda receta real
 * muestra el respaldo neutro. Para aprobar una imagen tras revisarla:
 *
 *   soup: { approvedBy: '<nombre real>', approvedOn: 'AAAA-MM-DD', sha256: '<sha256 del archivo revisado>' },
 *
 * No usar marcadores, nombres de equipo genéricos ni aprobaciones simuladas.
 */
export const RECIPE_IMAGE_APPROVALS: Readonly<Partial<Record<RecipeImageKey, RecipeImageApproval>>> = {};

export type RecipeImageCatalog = ReadonlyMap<RecipeImageKey, ApprovedRecipeImageAsset>;

const nonEmpty = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
const isIsoDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isSha256 = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const isHttpsUrl = (v: unknown) => typeof v === 'string' && /^https:\/\/[^\s/]+\.[^\s]+$/.test(v);

export function isCompleteRecipeImageProvenance(value: unknown): value is RecipeImageProvenance {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  if (typeof p.attributionRequired !== 'boolean') return false;
  if (p.attributionRequired && !nonEmpty(p.attributionText)) return false;
  if (p.kind === 'ai-generated') {
    return nonEmpty(p.provider) && nonEmpty(p.workflow) && isHttpsUrl(p.termsReference);
  }
  if (p.kind === 'original' || p.kind === 'licensed') {
    return nonEmpty(p.author) && nonEmpty(p.licenseName) && nonEmpty(p.sourceReference);
  }
  return false;
}

export function isCompleteRecipeImageApproval(
  approval: unknown,
  expectedSha256: string
): approval is RecipeImageApproval {
  if (!approval || typeof approval !== 'object') return false;
  const a = approval as Partial<RecipeImageApproval>;
  return (
    nonEmpty(a.approvedBy) &&
    isIsoDate(a.approvedOn) &&
    isSha256(a.sha256) &&
    a.sha256 === expectedSha256
  );
}

/** Valida un registro técnico (sin considerar la aprobación). */
export function isValidRecipeImageAssetRecord(record: unknown): record is RecipeImageAssetRecord {
  if (!record || typeof record !== 'object') return false;
  const r = record as Partial<RecipeImageAssetRecord>;
  return (
    isRecipeImageKey(r.key) &&
    r.file === recipeImageAssetPath(r.key) &&
    isBundledImageSource(r.source) &&
    isSha256(r.sha256) &&
    isCompleteRecipeImageProvenance(r.provenance)
  );
}

/**
 * Construye el catálogo de producción: solo entran registros técnicamente válidos
 * CON una aprobación humana completa cuyo SHA-256 coincide con el del registro.
 * Descarta claves desconocidas, rutas no canónicas, fuentes no empaquetadas,
 * procedencia incompleta, aprobaciones ausentes o desactualizadas y duplicados.
 */
export function buildRecipeImageCatalog(
  records: readonly RecipeImageAssetRecord[],
  approvals: Readonly<Partial<Record<RecipeImageKey, RecipeImageApproval>>>
): RecipeImageCatalog {
  const catalog = new Map<RecipeImageKey, ApprovedRecipeImageAsset>();
  for (const record of records) {
    if (!isValidRecipeImageAssetRecord(record)) continue;
    if (catalog.has(record.key)) continue;
    const approval = approvals[record.key];
    if (!isCompleteRecipeImageApproval(approval, record.sha256)) continue;
    catalog.set(record.key, { ...record, approval });
  }
  return catalog;
}

export const RECIPE_IMAGE_CATALOG: RecipeImageCatalog = buildRecipeImageCatalog(
  RECIPE_IMAGE_ASSET_RECORDS,
  RECIPE_IMAGE_APPROVALS
);

// ==========================================
// Política de visualización: producción vs. preview interno
// ==========================================

/**
 * - 'production-approved-only': solo imágenes con aprobación humana (RECIPE_IMAGE_CATALOG).
 * - 'internal-preview-verified': builds INTERNOS de preview muestran los registros técnicamente
 *   verificados para probarlos en dispositivo. NO equivale a aprobación comercial.
 */
export type RecipeImageDisplayPolicy = 'production-approved-only' | 'internal-preview-verified';

/** Valor EXACTO de EXPO_PUBLIC_APP_VARIANT que permite la política de preview. */
export const RECIPE_IMAGE_PREVIEW_APP_VARIANT = 'preview';
/** Valor EXACTO de EXPO_PUBLIC_RECIPE_IMAGES_PREVIEW_ENABLED que la activa. */
export const RECIPE_IMAGE_PREVIEW_FLAG_VALUE = 'true';

export interface RecipeImageBuildConfig {
  /** EXPO_PUBLIC_APP_VARIANT, fijado por perfil de compilación en eas.json. */
  appVariant?: unknown;
  /** EXPO_PUBLIC_RECIPE_IMAGES_PREVIEW_ENABLED, fijado por perfil de compilación en eas.json. */
  previewImagesEnabled?: unknown;
}

/**
 * Lee la configuración de compilación. El acceso a `process.env.EXPO_PUBLIC_*` es LITERAL a
 * propósito: Expo solo incrusta en el bundle las lecturas estáticas (sin destructuring ni
 * acceso dinámico). No es una credencial: las variables EXPO_PUBLIC_ son públicas.
 */
export function readRecipeImageBuildConfig(): RecipeImageBuildConfig {
  return {
    appVariant: process.env.EXPO_PUBLIC_APP_VARIANT,
    previewImagesEnabled: process.env.EXPO_PUBLIC_RECIPE_IMAGES_PREVIEW_ENABLED,
  };
}

/**
 * Falla en cerrado: la política de preview exige AMBAS condiciones con valores exactos
 * (variante 'preview' e indicador 'true'). Cualquier ausencia, valor inválido, variante
 * 'production' u otra combinación devuelve la política estricta de producción.
 * No depende de __DEV__ (los APK de preview de EAS son bundles de release).
 */
export function resolveRecipeImageDisplayPolicy(
  config: RecipeImageBuildConfig | null | undefined
): RecipeImageDisplayPolicy {
  if (
    config &&
    config.appVariant === RECIPE_IMAGE_PREVIEW_APP_VARIANT &&
    config.previewImagesEnabled === RECIPE_IMAGE_PREVIEW_FLAG_VALUE
  ) {
    return 'internal-preview-verified';
  }
  return 'production-approved-only';
}

/** Catálogo que consume la UI: el aprobado (producción) o el de preview interno. */
export type RecipeImageDisplayCatalog = ReadonlyMap<RecipeImageKey, RecipeImageAssetRecord>;

/**
 * Catálogo de PREVIEW INTERNO: los registros técnicamente válidos (mismo validador que
 * producción: clave, ruta canónica, fuente empaquetada, SHA-256 y procedencia), SIN
 * aprobación. No fabrica objetos RecipeImageApproval ni pasa por buildRecipeImageCatalog:
 * sus entradas son los registros tal cual y nunca se consideran aprobadas.
 */
export function buildRecipeImagePreviewCatalog(
  records: readonly RecipeImageAssetRecord[]
): RecipeImageDisplayCatalog {
  const catalog = new Map<RecipeImageKey, RecipeImageAssetRecord>();
  for (const record of records) {
    if (!isValidRecipeImageAssetRecord(record)) continue;
    if (catalog.has(record.key)) continue;
    catalog.set(record.key, record);
  }
  return catalog;
}

/** Selecciona el catálogo según la política; cualquier valor desconocido usa producción. */
export function selectRecipeImageCatalog(
  policy: RecipeImageDisplayPolicy,
  records: readonly RecipeImageAssetRecord[],
  approvals: Readonly<Partial<Record<RecipeImageKey, RecipeImageApproval>>>
): RecipeImageDisplayCatalog {
  return policy === 'internal-preview-verified'
    ? buildRecipeImagePreviewCatalog(records)
    : buildRecipeImageCatalog(records, approvals);
}

/** Política resuelta en tiempo de compilación para este bundle. */
export const RECIPE_IMAGE_DISPLAY_POLICY: RecipeImageDisplayPolicy = resolveRecipeImageDisplayPolicy(
  readRecipeImageBuildConfig()
);

/** Catálogo efectivo que usa la UI (Inicio, Recetas y Detalle vía getRecipeImageSource). */
export const ACTIVE_RECIPE_IMAGE_CATALOG: RecipeImageDisplayCatalog = selectRecipeImageCatalog(
  RECIPE_IMAGE_DISPLAY_POLICY,
  RECIPE_IMAGE_ASSET_RECORDS,
  RECIPE_IMAGE_APPROVALS
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
 * Por defecto usa ACTIVE_RECIPE_IMAGE_CATALOG (aprobadas en producción; verificadas en preview
 * interno). Acepta también un RecipeImageCatalog aprobado (subtipo).
 * Las URLs remotas (HTTPS o no) de recetas reales se ignoran mientras
 * REMOTE_RECIPE_IMAGES_ENABLED sea false.
 */
export function getRecipeImageSource(
  recipe: RecipeImageRecipeInput | null | undefined,
  catalog: RecipeImageDisplayCatalog = ACTIVE_RECIPE_IMAGE_CATALOG
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
