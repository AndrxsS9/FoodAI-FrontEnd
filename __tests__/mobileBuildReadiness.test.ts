/**
 * FoodAI - Mobile Build Readiness & Android APK Configuration Tests (Fase 6C.1).
 *
 * Valida de forma determinista:
 * 1. Configuración de app.json para Android (package, iconos adaptativos, esquema y permisos mínimos).
 * 2. Principio de mínimo privilegio: CAMERA habilitado, RECORD_AUDIO bloqueado y sin declaraciones innecesarias de almacenamiento.
 * 3. Plugins de Expo requeridos (expo-image-picker con descripciones en español y microphonePermission: false).
 * 4. Configuración de eas.json para generación de APK de vista previa (buildType: 'apk', distribution: 'internal').
 * 5. Protección de credenciales y ausencia de IDs ficticios o secretos quemados en código.
 */
import appConfig from '../app.json';
import easConfig from '../eas.json';

describe('Validación de Preparación para Build Android APK (Fase 6C.1)', () => {
  describe('1. app.json — Configuración Android y Expo SDK 58', () => {
    it('define el identificador de paquete Android correcto (reverse domain)', () => {
      expect(appConfig.expo.android).toBeDefined();
      expect(appConfig.expo.android.package).toBe('com.foodai.app');
    });

    it('define el identificador de paquete iOS correcto', () => {
      expect(appConfig.expo.ios).toBeDefined();
      expect(appConfig.expo.ios.bundleIdentifier).toBe('com.foodai.app');
    });

    it('define el esquema de enlaces profundos (deep linking) de la aplicación', () => {
      expect(appConfig.expo.scheme).toBe('foodai');
    });

    it('configura el estilo de interfaz de usuario como "automatic" (Light/Dark/System)', () => {
      expect(appConfig.expo.userInterfaceStyle).toBe('automatic');
    });

    it('define el icono principal y el adaptiveIcon de Android con imagen de primer plano', () => {
      expect(appConfig.expo.icon).toBe('./assets/images/logo.png');

      const adaptiveIcon = appConfig.expo.android.adaptiveIcon;
      expect(adaptiveIcon).toBeDefined();
      expect(adaptiveIcon.foregroundImage).toBe('./assets/images/FoodAI_android_adaptive_foreground.png');
      expect(adaptiveIcon.backgroundColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(adaptiveIcon.backgroundColor).toBe('#FFFFFF');
    });

    it('aplica el principio de mínimo privilegio en permisos de Android: incluye CAMERA y bloquea RECORD_AUDIO', () => {
      const permissions: string[] = appConfig.expo.android.permissions;
      expect(Array.isArray(permissions)).toBe(true);
      expect(permissions).toContain('android.permission.CAMERA');
      expect(permissions).not.toContain('android.permission.RECORD_AUDIO');

      const blockedPermissions: string[] = (appConfig.expo.android as { blockedPermissions?: string[] }).blockedPermissions ?? [];
      expect(Array.isArray(blockedPermissions)).toBe(true);
      expect(blockedPermissions).toContain('android.permission.RECORD_AUDIO');
    });

    it('configura el plugin expo-image-picker con descripciones en español y desactiva el permiso de micrófono', () => {
      const plugins = appConfig.expo.plugins;
      expect(Array.isArray(plugins)).toBe(true);
      expect(plugins).toContain('expo-router');
      expect(plugins).toContain('expo-status-bar');

      const imagePickerPlugin = plugins.find(
        (p: unknown) => Array.isArray(p) && p[0] === 'expo-image-picker'
      ) as [string, { cameraPermission?: string; photosPermission?: string; microphonePermission?: boolean }] | undefined;

      expect(imagePickerPlugin).toBeDefined();
      const options = imagePickerPlugin?.[1];
      expect(options?.cameraPermission).toMatch(/cámara/i);
      expect(options?.photosPermission).toMatch(/fotos/i);
      expect(options?.microphonePermission).toBe(false);
    });
  });

  describe('2. eas.json — Perfil de Build Preview para APK Instalable', () => {
    it('define la versión de CLI de EAS', () => {
      expect(easConfig.cli).toBeDefined();
      expect(easConfig.cli.version).toBeDefined();
    });

    it('configura el perfil "preview" para generar un APK instalable en Android', () => {
      const preview = easConfig.build?.preview;
      expect(preview).toBeDefined();
      expect(preview.distribution).toBe('internal');
      expect((preview as { environment?: string }).environment).toBe('preview');
      expect(preview.android).toBeDefined();
      expect(preview.android.buildType).toBe('apk');
    });

    it('configura el perfil "development" para desarrollo con developmentClient', () => {
      const dev = easConfig.build?.development;
      expect(dev).toBeDefined();
      expect(dev.developmentClient).toBe(true);
      expect(dev.distribution).toBe('internal');
    });

    it('configura el perfil "production" sin forzar APK (usa por defecto Android App Bundle AAB para Google Play)', () => {
      const prod = easConfig.build?.production;
      expect(prod).toBeDefined();
      expect((prod as { android?: { buildType?: string } }).android?.buildType).toBeUndefined();
    });

    it('no contiene credenciales quemadas, IDs ficticios de Expo ni secretos en texto claro', () => {
      const jsonStr = JSON.stringify(easConfig);
      expect(jsonStr).not.toMatch(/GEMINI/i);
      expect(jsonStr).not.toMatch(/service_role/i);
      expect(jsonStr).not.toMatch(/password/i);
      expect(jsonStr).not.toMatch(/fake-project-id/i);
    });
  });
});
