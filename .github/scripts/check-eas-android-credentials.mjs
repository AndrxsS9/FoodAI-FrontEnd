#!/usr/bin/env node
/**
 * FoodAI — Verificación previa de credenciales Android en EAS (solo lectura).
 *
 * Motivo: en modo `--non-interactive`, EAS CLI GENERA un keystore nuevo de forma
 * silenciosa si el proyecto no tiene credenciales Android por defecto. Eso
 * produciría un APK firmado con otra identidad (incompatible como actualización
 * de los APK previos). Este script consulta la API de Expo ANTES de compilar y
 * aborta si no existe un keystore por defecto reutilizable.
 *
 * - Solo realiza una consulta GraphQL de lectura.
 * - Solo solicita campos públicos del certificado (huellas SHA-1/SHA-256);
 *   nunca descarga el keystore ni sus contraseñas.
 * - Si se define EXPECTED_SHA256, exige que coincida con la huella del keystore.
 *
 * Variables de entorno:
 *   EXPO_TOKEN            (obligatoria) token de acceso de Expo.
 *   EXPECTED_OWNER        (obligatoria) owner esperado en app.json.
 *   EXPECTED_PROJECT_ID   (obligatoria) extra.eas.projectId esperado.
 *   EXPECTED_PACKAGE      (obligatoria) android.package esperado.
 *   EXPECTED_SHA256       (opcional) huella SHA-256 del certificado esperado.
 *   GITHUB_OUTPUT         (opcional) archivo de salidas de GitHub Actions.
 */
import { appendFileSync, readFileSync } from 'node:fs';

const API_URL = 'https://api.expo.dev/graphql';

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

function requireEnv(name, value) {
  if (!value || !value.trim()) fail(`Falta la variable obligatoria ${name}.`);
  return value.trim();
}

/** Normaliza una huella a hexadecimal en minúsculas sin separadores. */
function normalizeFingerprint(value) {
  return String(value ?? '')
    .replace(/[^0-9a-fA-F]/g, '')
    .toLowerCase();
}

const token = requireEnv('EXPO_TOKEN', process.env.EXPO_TOKEN);
const expectedOwner = requireEnv('EXPECTED_OWNER', process.env.EXPECTED_OWNER);
const expectedProjectId = requireEnv('EXPECTED_PROJECT_ID', process.env.EXPECTED_PROJECT_ID);
const expectedPackage = requireEnv('EXPECTED_PACKAGE', process.env.EXPECTED_PACKAGE);
const expectedSha256 = parseExpectedFingerprint(process.env.EXPECTED_SHA256);

/**
 * Valida la huella opcional indicada por el usuario: 64 hex, con o sin ':' ni
 * espacios. Un valor no vacío con formato inválido aborta (nunca se ignora en
 * silencio). No se repite la entrada en el log para no reflejar texto arbitrario.
 */
function parseExpectedFingerprint(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const compact = raw.replace(/[\s:]/g, '');
  if (!/^[0-9a-fA-F]{64}$/.test(compact)) {
    fail('expected_cert_sha256 no es una huella SHA-256 válida (64 caracteres hexadecimales, con o sin ":").');
  }
  return compact.toLowerCase();
}

/** Elimina saltos de línea y comandos de workflow de textos remotos. */
function sanitizeForLog(value) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/::/g, ': :');
}

const { expo } = JSON.parse(readFileSync('app.json', 'utf8'));
const owner = expo?.owner;
const slug = expo?.slug;
const projectId = expo?.extra?.eas?.projectId;
const androidPackage = expo?.android?.package;

if (owner !== expectedOwner) fail(`app.json owner="${owner}" no coincide con "${expectedOwner}".`);
if (projectId !== expectedProjectId) {
  fail(`app.json extra.eas.projectId="${projectId}" no coincide con "${expectedProjectId}".`);
}
if (androidPackage !== expectedPackage) {
  fail(`app.json android.package="${androidPackage}" no coincide con "${expectedPackage}".`);
}
if (!slug) fail('app.json no define "slug".');

// Misma consulta (reducida a campos no sensibles) que usa EAS CLI para resolver
// las credenciales de compilación por defecto: legacyOnly=false + isDefault.
const query = `
  query FoodAiAndroidBuildCredentialsCheck(
    $projectFullName: String!
    $applicationIdentifier: String
  ) {
    app {
      byFullName(fullName: $projectFullName) {
        id
        androidAppCredentials(
          filter: { applicationIdentifier: $applicationIdentifier, legacyOnly: false }
        ) {
          id
          applicationIdentifier
          androidAppBuildCredentialsList {
            id
            isDefault
            name
            androidKeystore {
              id
              type
              sha1CertificateFingerprint
              sha256CertificateFingerprint
            }
          }
        }
      }
    }
  }
`;

const projectFullName = `@${owner}/${slug}`;

let response;
try {
  response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query,
      variables: { projectFullName, applicationIdentifier: androidPackage },
    }),
  });
} catch (error) {
  fail(`No se pudo contactar la API de Expo: ${error instanceof Error ? error.message : error}`);
}

if (!response.ok) {
  fail(`La API de Expo respondió HTTP ${response.status}. Revisa que EXPO_TOKEN sea válido y tenga acceso a ${projectFullName}.`);
}

const payload = await response.json();
if (payload.errors?.length) {
  const messages = payload.errors.map((e) => e.message).join(' | ');
  fail(`La API de Expo devolvió errores: ${messages}`);
}

const app = payload.data?.app?.byFullName;
if (!app) fail(`No se encontró el proyecto ${projectFullName} con el token proporcionado.`);
if (app.id !== expectedProjectId) {
  fail(`El proyecto remoto ${projectFullName} tiene id ${app.id}, distinto de ${expectedProjectId}.`);
}

const appCredentials = app.androidAppCredentials?.[0];
const defaultBuildCredentials = appCredentials?.androidAppBuildCredentialsList?.find(
  (credentials) => credentials.isDefault,
);
const keystore = defaultBuildCredentials?.androidKeystore;

if (!keystore) {
  fail(
    [
      `No existe un keystore Android por defecto en EAS para ${projectFullName} (${androidPackage}).`,
      'Se detiene la compilación: en modo no interactivo EAS CLI generaría un keystore NUEVO',
      'y el APK no sería compatible como actualización de los APK firmados anteriormente.',
      'Revisa las credenciales con `eas credentials --platform android` antes de reintentar.',
    ].join(' '),
  );
}

const sha1 = normalizeFingerprint(keystore.sha1CertificateFingerprint);
const sha256 = normalizeFingerprint(keystore.sha256CertificateFingerprint);
if (!sha256) fail('El keystore por defecto de EAS no reporta huella SHA-256.');

if (expectedSha256 && expectedSha256 !== sha256) {
  fail(
    `La huella SHA-256 del keystore EAS (${sha256}) no coincide con EXPECTED_SHA256 (${expectedSha256}).`,
  );
}

console.log(`Proyecto EAS verificado: ${projectFullName} (${app.id})`);
const credentialsName = sanitizeForLog(defaultBuildCredentials.name);
console.log(`Credenciales por defecto: "${credentialsName}" — keystore ${sanitizeForLog(keystore.type)}`);
console.log(`Certificado SHA-1:   ${sha1}`);
console.log(`Certificado SHA-256: ${sha256}`);
if (expectedSha256) console.log('La huella coincide con EXPECTED_SHA256.');

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `keystore_sha1=${sha1}\nkeystore_sha256=${sha256}\ncredentials_name=${credentialsName}\n`,
  );
}
