/**
 * Corrección 1 (MVP) - Política de imágenes de preview interno vs. producción.
 *
 * Verifica que:
 * - Solo la combinación EXACTA EXPO_PUBLIC_APP_VARIANT='preview' +
 *   EXPO_PUBLIC_RECIPE_IMAGES_PREVIEW_ENABLED='true' activa las 16 imágenes verificadas.
 * - Producción sigue gobernada exclusivamente por RECIPE_IMAGE_APPROVALS (falla en cerrado).
 * - El catálogo de preview reutiliza los registros y el validador existentes sin fabricar
 *   aprobaciones.
 * - eas.json configura la política solo en el perfil interno 'preview'.
 */
declare const __dirname: string;
const fs = require('fs') as { readFileSync(p: string, encoding: 'utf8'): string };
const path = require('path') as { resolve(...parts: string[]): string; join(...parts: string[]): string };

import {
  RECIPE_IMAGE_APPROVALS,
  RECIPE_IMAGE_ASSET_RECORDS,
  RECIPE_IMAGE_CATALOG,
  RecipeImageApproval,
  RecipeImageAssetRecord,
  RecipeImageDisplayPolicy,
  buildRecipeImageCatalog,
  buildRecipeImagePreviewCatalog,
  getRecipeImageSource,
  isCompleteRecipeImageApproval,
  readRecipeImageBuildConfig,
  resolveRecipeImageDisplayPolicy,
  selectRecipeImageCatalog,
} from '../src/utils/recipeImageCatalog';
import { RECIPE_IMAGE_KEYS, RecipeImageKey, recipeImageAssetPath } from '../src/types/recipeImage';
import { BASE_DEMO_RECIPES } from '../src/fixtures/demoRecipes';

const ROOT = path.resolve(__dirname, '..');
const VARIANT = 'EXPO_PUBLIC_APP_VARIANT';
const FLAG = 'EXPO_PUBLIC_RECIPE_IMAGES_PREVIEW_ENABLED';

const recordOf = (key: RecipeImageKey) => RECIPE_IMAGE_ASSET_RECORDS.find((r) => r.key === key)!;
const recipe = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  ingredients: [],
  isDemoFixture: false,
  ...extra,
});

/** Carga el módulo del catálogo en un registro aislado con la configuración de entorno dada. */
function loadCatalogWithEnv(env: { variant?: string; flag?: string }) {
  const original = { variant: process.env[VARIANT], flag: process.env[FLAG] };
  const set = (k: string, v: string | undefined) => {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  };
  set(VARIANT, env.variant);
  set(FLAG, env.flag);
  let mod: typeof import('../src/utils/recipeImageCatalog') | undefined;
  try {
    jest.isolateModules(() => {
      mod = require('../src/utils/recipeImageCatalog');
    });
  } finally {
    set(VARIANT, original.variant);
    set(FLAG, original.flag);
  }
  return mod!;
}

describe('resolveRecipeImageDisplayPolicy — solo la combinación exacta activa el preview', () => {
  it('variante "preview" + indicador "true" → preview interno', () => {
    expect(resolveRecipeImageDisplayPolicy({ appVariant: 'preview', previewImagesEnabled: 'true' })).toBe(
      'internal-preview-verified'
    );
  });

  it.each<[string, Record<string, unknown> | null | undefined]>([
    ['configuración ausente', undefined],
    ['configuración nula', null],
    ['objeto vacío', {}],
    ['sin indicador', { appVariant: 'preview' }],
    ['sin variante', { previewImagesEnabled: 'true' }],
    ['variante production con indicador true', { appVariant: 'production', previewImagesEnabled: 'true' }],
    ['variante development con indicador true', { appVariant: 'development', previewImagesEnabled: 'true' }],
    ['indicador "false"', { appVariant: 'preview', previewImagesEnabled: 'false' }],
    ['indicador "TRUE"', { appVariant: 'preview', previewImagesEnabled: 'TRUE' }],
    ['indicador "1"', { appVariant: 'preview', previewImagesEnabled: '1' }],
    ['indicador "yes"', { appVariant: 'preview', previewImagesEnabled: 'yes' }],
    ['indicador con espacios', { appVariant: 'preview', previewImagesEnabled: ' true ' }],
    ['indicador booleano (no string)', { appVariant: 'preview', previewImagesEnabled: true }],
    ['variante "Preview"', { appVariant: 'Preview', previewImagesEnabled: 'true' }],
    ['variante con espacios', { appVariant: ' preview', previewImagesEnabled: 'true' }],
    ['variante vacía', { appVariant: '', previewImagesEnabled: 'true' }],
  ])('%s → producción (falla en cerrado)', (_label, config) => {
    expect(resolveRecipeImageDisplayPolicy(config as any)).toBe('production-approved-only');
  });
});

describe('readRecipeImageBuildConfig', () => {
  it('lee exactamente EXPO_PUBLIC_APP_VARIANT y EXPO_PUBLIC_RECIPE_IMAGES_PREVIEW_ENABLED', () => {
    const original = { v: process.env[VARIANT], f: process.env[FLAG] };
    try {
      process.env[VARIANT] = 'preview';
      process.env[FLAG] = 'true';
      expect(readRecipeImageBuildConfig()).toEqual({ appVariant: 'preview', previewImagesEnabled: 'true' });
      delete process.env[VARIANT];
      delete process.env[FLAG];
      expect(readRecipeImageBuildConfig()).toEqual({ appVariant: undefined, previewImagesEnabled: undefined });
    } finally {
      if (original.v === undefined) delete process.env[VARIANT];
      else process.env[VARIANT] = original.v;
      if (original.f === undefined) delete process.env[FLAG];
      else process.env[FLAG] = original.f;
    }
  });

  it('el código usa acceso literal process.env.EXPO_PUBLIC_* (requisito para que Expo lo incruste)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/utils/recipeImageCatalog.ts'), 'utf8');
    expect(src).toContain('process.env.EXPO_PUBLIC_APP_VARIANT');
    expect(src).toContain('process.env.EXPO_PUBLIC_RECIPE_IMAGES_PREVIEW_ENABLED');
    expect(src).not.toMatch(/process\.env\[/);
  });
});

describe('Catálogo de preview interno', () => {
  const preview = buildRecipeImagePreviewCatalog(RECIPE_IMAGE_ASSET_RECORDS);

  it('contiene exactamente los 16 registros verificados, reutilizando los mismos objetos', () => {
    expect(preview.size).toBe(16);
    expect([...preview.keys()].sort()).toEqual([...RECIPE_IMAGE_KEYS].sort());
    for (const key of RECIPE_IMAGE_KEYS) {
      expect(preview.get(key)).toBe(recordOf(key));
      expect(preview.get(key)!.source).toBe(recordOf(key).source);
    }
  });

  it('no fabrica aprobaciones: ninguna entrada tiene "approval" y producción sigue vacía', () => {
    for (const entry of preview.values()) expect('approval' in entry).toBe(false);
    expect(RECIPE_IMAGE_APPROVALS).toEqual({});
    expect(RECIPE_IMAGE_CATALOG.size).toBe(0);
  });

  it('aplica el mismo validador técnico: descarta registros inválidos y duplicados', () => {
    const base = recordOf('pasta');
    const bad = (key: RecipeImageKey, over: Partial<RecipeImageAssetRecord>) =>
      ({ ...recordOf(key), ...over }) as RecipeImageAssetRecord;
    const catalog = buildRecipeImagePreviewCatalog([
      bad('soup', { source: { uri: 'https://cdn.example.com/soup.webp' } as any }),
      bad('salad', { source: 'https://cdn.example.com/salad.webp' as any }),
      bad('eggs', { sha256: 'no-es-un-hash' }),
      bad('fish', { file: 'assets/images/recipes/otro.webp' }),
      bad('arepa', { provenance: { ...base.provenance, termsReference: 'http://inseguro.example.com' } as any }),
      bad('legumes', { key: 'pizza' as any }),
      base,
      { ...base, source: { testUri: 'duplicado' } as any },
    ]);
    expect([...catalog.keys()]).toEqual(['pasta']);
    expect(catalog.get('pasta')).toBe(base);
  });
});

describe('selectRecipeImageCatalog — producción sigue gobernada por las aprobaciones', () => {
  const approvalFor = (key: RecipeImageKey, sha = recordOf(key).sha256): RecipeImageApproval => ({
    approvedBy: 'SIMULACIÓN DE PRUEBA (no es una aprobación real)',
    approvedOn: '2026-11-06',
    sha256: sha,
  });

  it('producción sin aprobaciones → catálogo vacío', () => {
    expect(selectRecipeImageCatalog('production-approved-only', RECIPE_IMAGE_ASSET_RECORDS, {}).size).toBe(0);
  });

  it('producción con una aprobación válida (simulada) → solo esa imagen', () => {
    const catalog = selectRecipeImageCatalog('production-approved-only', RECIPE_IMAGE_ASSET_RECORDS, {
      pasta: approvalFor('pasta'),
    });
    expect([...catalog.keys()]).toEqual(['pasta']);
  });

  it('producción con una aprobación desactualizada (SHA distinto) o incompleta → inactiva', () => {
    expect(
      selectRecipeImageCatalog('production-approved-only', RECIPE_IMAGE_ASSET_RECORDS, {
        pasta: approvalFor('pasta', 'b'.repeat(64)),
        eggs: { ...approvalFor('eggs'), approvedBy: '  ' },
      }).size
    ).toBe(0);
    expect(isCompleteRecipeImageApproval(approvalFor('pasta', 'b'.repeat(64)), recordOf('pasta').sha256)).toBe(false);
  });

  it('el validador de producción sigue estricto: no acepta registros sin aprobación', () => {
    expect(buildRecipeImageCatalog(RECIPE_IMAGE_ASSET_RECORDS, {}).size).toBe(0);
  });

  it('preview muestra las 16 independientemente de las aprobaciones', () => {
    expect(selectRecipeImageCatalog('internal-preview-verified', RECIPE_IMAGE_ASSET_RECORDS, {}).size).toBe(16);
  });

  it('una política desconocida se trata como producción', () => {
    const catalog = selectRecipeImageCatalog('otra' as RecipeImageDisplayPolicy, RECIPE_IMAGE_ASSET_RECORDS, {});
    expect(catalog.size).toBe(0);
  });
});

describe('Cableado real por variables de entorno (módulo cargado con cada configuración)', () => {
  it('configuración de preview válida → política preview y las 16 imágenes activas', () => {
    const mod = loadCatalogWithEnv({ variant: 'preview', flag: 'true' });
    expect(mod.RECIPE_IMAGE_DISPLAY_POLICY).toBe('internal-preview-verified');
    expect(mod.ACTIVE_RECIPE_IMAGE_CATALOG.size).toBe(16);
    // El gate de producción no cambia en un build de preview
    expect(mod.RECIPE_IMAGE_CATALOG.size).toBe(0);
    expect(mod.RECIPE_IMAGE_APPROVALS).toEqual({});
    const pasta = mod.getRecipeImageSource(recipe('Pasta con tomate'));
    expect(pasta.kind).toBe('reference');
    expect(pasta.imageKey).toBe('pasta');
    expect(pasta.source).toBe(mod.RECIPE_IMAGE_ASSET_RECORDS.find((r) => r.key === 'pasta')!.source);
  });

  it.each<[string, { variant?: string; flag?: string }]>([
    ['sin variables', {}],
    ['solo indicador', { flag: 'true' }],
    ['solo variante', { variant: 'preview' }],
    ['indicador inválido "TRUE"', { variant: 'preview', flag: 'TRUE' }],
    ['indicador inválido "1"', { variant: 'preview', flag: '1' }],
    ['producción con indicador true', { variant: 'production', flag: 'true' }],
    ['producción explícita (eas.json)', { variant: 'production', flag: 'false' }],
  ])('%s → producción: sin aprobaciones no se activa ninguna imagen', (_label, env) => {
    const mod = loadCatalogWithEnv(env);
    expect(mod.RECIPE_IMAGE_DISPLAY_POLICY).toBe('production-approved-only');
    expect(mod.ACTIVE_RECIPE_IMAGE_CATALOG.size).toBe(Object.keys(mod.RECIPE_IMAGE_APPROVALS).length);
    expect(mod.getRecipeImageSource(recipe('Pasta con tomate'))).toEqual({
      kind: 'none',
      source: null,
      imageKey: 'pasta',
      referenceLabel: null,
    });
  });
});

describe('Resolución de imágenes con el catálogo de preview', () => {
  const preview = buildRecipeImagePreviewCatalog(RECIPE_IMAGE_ASSET_RECORDS);

  it.each<[string, RecipeImageKey]>([
    ['Pasta con tomate', 'pasta'],
    ['Huevos pericos', 'eggs'],
    ['Pollo al horno', 'chicken'],
    ['Sopa de lentejas', 'soup'],
    ['Arroz con leche', 'dessert'],
  ])('"%s" → %s.webp local', (name, key) => {
    const result = getRecipeImageSource(recipe(name), preview);
    expect(result).toEqual({
      kind: 'reference',
      source: recordOf(key).source,
      imageKey: key,
      referenceLabel: expect.any(String),
    });
    expect(recordOf(key).file).toBe(recipeImageAssetPath(key));
  });

  it('categoría desconocida o receta ausente → respaldo neutro', () => {
    expect(getRecipeImageSource(recipe('Plato especial del chef'), preview).kind).toBe('none');
    expect(getRecipeImageSource(null, preview).kind).toBe('none');
    expect(getRecipeImageSource(undefined, preview).kind).toBe('none');
  });

  it('receta demo con foto empaquetada conserva el comportamiento demo', () => {
    const demo = BASE_DEMO_RECIPES.find((r) => r.imageUrl)!;
    const result = getRecipeImageSource(demo, preview);
    expect(result.kind).toBe('demo-photo');
    expect(result.source).toBe(demo.imageUrl);
  });

  it('las URLs HTTPS siguen desactivadas también en preview', () => {
    const result = getRecipeImageSource(
      recipe('Plato especial', { imageUrl: 'https://images.example.com/plato.jpg' }),
      preview
    );
    expect(result.source).toBeNull();
    const withCategory = getRecipeImageSource(
      recipe('Pasta con tomate', { imageUrl: 'https://images.example.com/pasta.jpg' }),
      preview
    );
    expect(withCategory.source).toBe(recordOf('pasta').source);
  });

  it('la misma receta resuelve siempre la misma imagen y sin llamadas de red', () => {
    const original = globalThis.fetch;
    const fetchSpy = jest.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      const results = Array.from({ length: 3 }, () => getRecipeImageSource(recipe('Huevos pericos'), preview));
      expect(new Set(results.map((r) => r.source)).size).toBe(1);
      for (const key of RECIPE_IMAGE_KEYS) getRecipeImageSource(recipe('x', { imageKey: key }), preview);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('Manifiesto', () => {
  it('distingue verificadas, habilitadas en preview y aprobadas para producción con las cifras reales', () => {
    const manifest = fs.readFileSync(path.join(ROOT, 'assets/images/recipes/MANIFEST.md'), 'utf8');
    const total = RECIPE_IMAGE_KEYS.length;
    expect(manifest).toContain(`Archivos presentes y verificados técnicamente: ${RECIPE_IMAGE_ASSET_RECORDS.length} de ${total}`);
    expect(manifest).toContain(
      `Habilitados en preview interno: ${buildRecipeImagePreviewCatalog(RECIPE_IMAGE_ASSET_RECORDS).size} de ${total}`
    );
    expect(manifest).toContain(`Aprobados para producción: ${RECIPE_IMAGE_CATALOG.size} de ${total}`);
    expect(manifest).toContain('No es una aprobación');
  });
});

describe('Salvaguardas de eas.json', () => {
  type Profile = { extends?: string; env?: Record<string, string>; distribution?: string; android?: { buildType?: string } };
  const eas = JSON.parse(fs.readFileSync(path.join(ROOT, 'eas.json'), 'utf8')) as {
    build: Record<string, Profile>;
  };
  const effectiveEnv = (name: string, seen: string[] = []): Record<string, string> => {
    const profile = eas.build[name];
    if (!profile) throw new Error(`Perfil inexistente: ${name}`);
    if (seen.includes(name)) throw new Error(`Ciclo de extends: ${[...seen, name].join(' -> ')}`);
    const parent = profile.extends ? effectiveEnv(profile.extends, [...seen, name]) : {};
    return { ...parent, ...(profile.env ?? {}) };
  };
  const policyOf = (name: string) => {
    const env = effectiveEnv(name);
    return resolveRecipeImageDisplayPolicy({ appVariant: env[VARIANT], previewImagesEnabled: env[FLAG] });
  };

  it('el perfil interno "preview" (APK de distribución interna) activa la política de preview', () => {
    expect(eas.build.preview.distribution).toBe('internal');
    expect(eas.build.preview.android?.buildType).toBe('apk');
    expect(effectiveEnv('preview')).toMatchObject({ [VARIANT]: 'preview', [FLAG]: 'true' });
    expect(policyOf('preview')).toBe('internal-preview-verified');
  });

  it('el perfil "production" fija explícitamente variante production e indicador false', () => {
    expect(effectiveEnv('production')).toMatchObject({ [VARIANT]: 'production', [FLAG]: 'false' });
    expect(policyOf('production')).toBe('production-approved-only');
  });

  it('ningún perfil distinto de "preview" resuelve la política de preview (incluida la herencia)', () => {
    for (const name of Object.keys(eas.build)) {
      if (name === 'preview') continue;
      expect(policyOf(name)).toBe('production-approved-only');
    }
  });
});
