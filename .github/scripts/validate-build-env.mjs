#!/usr/bin/env node
/**
 * FoodAI — Validación de configuración de entorno para el APK preview.
 *
 * Se ejecuta dentro de `eas env:exec preview ...`, de modo que recibe las
 * variables "Plain text" y "Sensitive" del entorno `preview` de EAS: las mismas
 * que `eas build --profile preview` inyecta en la compilación (eas.json →
 * build.preview.environment = "preview").
 *
 * Nunca imprime valores: solo nombres y el resultado de cada comprobación.
 */
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';

const errors = [];
const warnings = [];

function parseUrl(name, value) {
  const raw = (value ?? '').trim();
  if (!raw) {
    errors.push(`${name} no está definida en el entorno "preview" de EAS.`);
    return null;
  }
  try {
    const url = new URL(raw);
    if (!/^https?:$/.test(url.protocol) || !url.hostname) throw new Error('protocolo/host');
    return url;
  } catch {
    errors.push(`${name} no es una URL http(s) válida.`);
    return null;
  }
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '10.0.2.2', '::1', '[::1]']);

// 1. Backend FoodAI.
const apiUrl = parseUrl('EXPO_PUBLIC_API_BASE_URL', process.env.EXPO_PUBLIC_API_BASE_URL);
if (apiUrl) {
  if (LOCAL_HOSTS.has(apiUrl.hostname)) {
    errors.push(
      'EXPO_PUBLIC_API_BASE_URL apunta a un host local; un APK instalado en un dispositivo no podrá alcanzarlo.',
    );
  } else if (apiUrl.protocol === 'http:') {
    warnings.push(
      'EXPO_PUBLIC_API_BASE_URL usa http://; Android bloquea tráfico en claro por defecto en compilaciones release. Se recomienda https://.',
    );
  }
}

// 2. Supabase.
const supabaseUrl = parseUrl('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL);
if (supabaseUrl && supabaseUrl.protocol !== 'https:') {
  errors.push('EXPO_PUBLIC_SUPABASE_URL debe usar https://.');
}

const supabaseKey = (process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '').trim();
if (!supabaseKey) {
  errors.push('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY no está definida en el entorno "preview" de EAS.');
} else {
  if (supabaseKey.startsWith('sb_secret_')) {
    errors.push('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY contiene una clave secreta (sb_secret_). Usa la clave publishable/anon.');
  }
  const jwtParts = supabaseKey.split('.');
  if (jwtParts.length === 3) {
    try {
      const claims = JSON.parse(Buffer.from(jwtParts[1], 'base64url').toString('utf8'));
      if (claims?.role === 'service_role') {
        errors.push('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY es una clave service_role. Usa la clave anon/publishable.');
      }
    } catch {
      // No es un JWT decodificable: se acepta (p. ej. formato sb_publishable_).
    }
  }
}

// 3. Perfil preview de eas.json (política de imágenes y variante).
const easJson = JSON.parse(readFileSync('eas.json', 'utf8'));
const preview = easJson?.build?.preview ?? {};
const expectProfile = (condition, message) => {
  if (!condition) errors.push(`eas.json build.preview: ${message}`);
};
expectProfile(preview.environment === 'preview', 'environment debe ser "preview".');
expectProfile(preview.distribution === 'internal', 'distribution debe ser "internal".');
expectProfile(preview.android?.buildType === 'apk', 'android.buildType debe ser "apk".');
expectProfile(preview.developmentClient !== true, 'no debe ser un development client.');
expectProfile(preview.env?.EXPO_PUBLIC_APP_VARIANT === 'preview', 'env.EXPO_PUBLIC_APP_VARIANT debe ser "preview".');
expectProfile(
  preview.env?.EXPO_PUBLIC_RECIPE_IMAGES_PREVIEW_ENABLED === 'true',
  'env.EXPO_PUBLIC_RECIPE_IMAGES_PREVIEW_ENABLED debe ser "true".',
);

for (const warning of warnings) console.log(`::warning::${warning}`);

if (errors.length > 0) {
  for (const error of errors) console.error(`::error::${error}`);
  console.error(
    'Corrige la configuración en expo.dev → Proyecto → Environment variables → entorno "preview" (visibilidad Plain text o Sensitive) o en eas.json.',
  );
  process.exit(1);
}

console.log('Configuración de entorno preview verificada:');
for (const name of [
  'EXPO_PUBLIC_API_BASE_URL',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'EXPO_PUBLIC_APP_VARIANT (eas.json)',
  'EXPO_PUBLIC_RECIPE_IMAGES_PREVIEW_ENABLED (eas.json)',
]) {
  console.log(`  ✓ ${name}`);
}
