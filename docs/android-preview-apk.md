# APK Android Preview con GitHub Actions (EAS Build local)

Workflow: [`.github/workflows/android-preview-apk.yml`](../.github/workflows/android-preview-apk.yml)

Genera el APK del perfil `preview` de FoodAI **v1.0.0** ejecutando
`eas build --platform android --profile preview --local --non-interactive`
en un runner Ubuntu de GitHub. La compilación ocurre en el runner: **no usa la
cola de builds en la nube de Expo ni consume su cuota**.

> APK para pruebas internas del MVP. No es una compilación apta para Play Store.

## Requisitos previos (una sola vez)

| Dónde | Qué | Detalle |
|---|---|---|
| GitHub → Settings → Secrets and variables → Actions | Secreto `EXPO_TOKEN` | Token de acceso de expo.dev (Account settings → Access tokens) de una cuenta o robot con acceso al proyecto `@andresyi/foodai`. Es el **único** secreto de GitHub requerido. |
| expo.dev → Proyecto → Environment variables → `preview` | `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Visibilidad *Plain text* o *Sensitive* (no *Secret*: esas no se exponen a builds locales). Son las mismas que usaban los builds `preview` en la nube. |
| expo.dev → Proyecto → Credentials → Android | Keystore por defecto para `com.foodai.app` | Debe existir. El workflow **falla** si no existe, para evitar que EAS genere uno nuevo. |

`EXPO_PUBLIC_APP_VARIANT=preview` y `EXPO_PUBLIC_RECIPE_IMAGES_PREVIEW_ENABLED=true`
vienen de `eas.json` (perfil `preview`) y no requieren configuración adicional.

## Qué valida el workflow antes y después de compilar

1. `EXPO_TOKEN` presente y válido (`eas whoami`).
2. `app.json` apunta al owner `andresyi`, projectId `e53e26d8-…` y paquete `com.foodai.app`.
3. Existe un keystore Android **por defecto** en EAS (consulta de solo lectura; nunca
   descarga contraseñas en este paso). Si no existe → se detiene.
4. Las 3 variables del entorno `preview` existen, son URLs válidas, el backend no es
   `localhost`/`10.0.2.2`, Supabase usa `https` y la clave **no** es `service_role`
   ni `sb_secret_`. Nunca se imprimen valores.
5. Typecheck + Jest (puede omitirse con la entrada `skip_tests`).
6. Tras el build: APK existe, tiene exactamente un firmante, **la huella SHA-256 del
   certificado coincide con la del keystore EAS**, no está firmado con el certificado
   de depuración, paquete `com.foodai.app`, `versionName` `1.0.0`, no es depurable,
   declara `CAMERA`, no declara `RECORD_AUDIO` y contiene
   `assets/index.android.bundle` (instalable sin Metro).

## 1. Abrir la pestaña Actions

Repositorio `AndrxsS9/FoodAI-FrontEnd` → pestaña **Actions** → en la lista de la
izquierda, **Android Preview APK (EAS local)**.

> **Importante:** GitHub solo muestra el botón *Run workflow* de un workflow
> `workflow_dispatch` cuando el archivo existe en la **rama por defecto** del
> repositorio (`main`). Mientras el workflow esté solo en `develop` o en una rama de
> trabajo, no aparecerá el botón. Una vez en `main`, puede ejecutarse sobre cualquier
> rama que también contenga el archivo.

## 2. Lanzar el workflow manualmente

1. Pulsa **Run workflow**.
2. Elige la rama (normalmente `develop` o `main`).
3. (Opcional) `expected_cert_sha256`: huella SHA-256 del certificado de un APK EAS
   anterior (ver sección *Comparar firma*). Si no coincide, el workflow falla.
4. (Opcional) `skip_tests`: dejar en `false`.
5. Pulsa **Run workflow**.

## 3. Monitorear el build

Abre la ejecución → job **Build APK preview (eas build --local)**. Duración típica:
25–50 min (instalación del SDK/NDK, prebuild y Gradle). El paso
*Compilar APK (eas build --local)* es el más largo. Al terminar, el **Summary** de la
ejecución muestra el commit, las huellas SHA-1/SHA-256 del certificado y el SHA-256
del archivo APK.

## 4. Descargar el APK

En la página de la ejecución, sección **Artifacts** → **FoodAI-v1.0.0-Android-Preview**.
Se descarga un `.zip` con:

- `FoodAI-v1.0.0-Android-Preview.apk`
- `FoodAI-v1.0.0-Android-Preview.apk.sha256`

Verificar integridad tras descomprimir:

```bash
sha256sum -c FoodAI-v1.0.0-Android-Preview.apk.sha256
```

El artefacto se conserva 30 días.

## 5. Instalar y probar

- **Dispositivo físico:** copia el APK al teléfono, ábrelo y permite *Instalar apps
  desconocidas* para el gestor de archivos/navegador.
- **ADB:** `adb install -r FoodAI-v1.0.0-Android-Preview.apk`

Lista mínima de prueba:

- [ ] Abre sin Metro / sin PC conectado.
- [ ] Icono (normal y adaptativo) con el logo final del robot chef.
- [ ] Cambio Español ↔ Inglés.
- [ ] Registro / inicio de sesión con Supabase.
- [ ] Despensa: alta, edición y traducción visual de alimentos.
- [ ] Cámara: tomar foto de ingredientes y elegir de galería.
- [ ] Recetas con imágenes según la política preview.

Si ya hay un APK de FoodAI instalado firmado con **otro** certificado, Android
rechazará la actualización (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`): desinstala el
anterior o verifica antes la firma.

## Comparar firma con un APK EAS anterior

No se debe asumir compatibilidad de actualización sin confirmar que el certificado
es el mismo. Con Android SDK build-tools instalado:

```bash
# APK anterior (descargado de expo.dev → Builds)
apksigner verify --print-certs FoodAI-anterior.apk | grep 'SHA-256'
# APK nuevo
apksigner verify --print-certs FoodAI-v1.0.0-Android-Preview.apk | grep 'SHA-256'
```

Alternativa sin build-tools (JDK): `keytool -printcert -jarfile <apk>`.

Ambas huellas **deben ser idénticas**. Para que el workflow lo compruebe solo, pega la
huella del APK anterior en la entrada `expected_cert_sha256`: deben ser 64 caracteres
hexadecimales (acepta mayúsculas, minúsculas, `:` y espacios). Un valor con otro
formato hace fallar el workflow antes de compilar; nunca se ignora en silencio. La huella del keystore también se ve en expo.dev → Credentials →
Android.

## 6. Publicar como pre-release (manual, tras aprobación)

El workflow **no** crea releases. Cuando el APK esté aprobado:

1. GitHub → **Releases** → **Draft a new release**.
2. Tag nuevo, por ejemplo `v1.0.0-preview.1`, sobre el commit indicado en el Summary.
3. Título: `FoodAI v1.0.0 — Android Preview (MVP)`.
4. Adjunta `FoodAI-v1.0.0-Android-Preview.apk` y su `.sha256`.
5. En la descripción incluye el commit y la huella SHA-256 del certificado.
6. Marca **Set as a pre-release** y publica.

Con GitHub CLI (equivalente):

```bash
gh release create v1.0.0-preview.1 \
  FoodAI-v1.0.0-Android-Preview.apk FoodAI-v1.0.0-Android-Preview.apk.sha256 \
  --target <commit> --prerelease --title "FoodAI v1.0.0 — Android Preview (MVP)"
```

## Limitaciones conocidas

- `eas build --local` está marcado por Expo como *experimental*.
- `versionCode` queda en `1` (fuente de versión local, sin `autoIncrement` en `preview`).
- Si `EXPO_PUBLIC_API_BASE_URL` usa `http://`, Android puede bloquear el tráfico en
  claro en builds release; el workflow lo advierte.
- El build compila código nativo (NDK) y puede quedarse sin disco o tiempo en
  runners estándar; el workflow libera espacio y tiene límite de 120 min.
