/**
 * FoodAI - Pruebas de regresión del escáner en Android (MVP final, Bloque 1).
 *
 * Verifica:
 * 1. La forma exacta del multipart que React Native Android envía (FormData nativo de RN).
 * 2. Que un fallo al preparar la imagen NUNCA se reporte como caída de red o del servidor.
 * 3. La distinción entre fallos de transporte (fetch), errores HTTP del backend y cancelaciones.
 * 4. Que cuerpos no JSON de proxies (413/502/503/504) se clasifiquen por código HTTP.
 * 5. Que el diagnóstico registrado no exponga tokens, URIs privadas ni bytes de imagen.
 */
import { Platform } from 'react-native';
import { manipulateAsync } from 'expo-image-manipulator';
import {
  analyzeIngredientsImage,
  ScannerApiError,
} from '../src/services/api/scannerApi';
import { supabase } from '../src/services/supabase/client';
import { SelectedImage } from '../src/types/scanner';
import { optimizeImageIfNeeded } from '../src/utils/imageUtils';

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));

// Implementación real de FormData del runtime de React Native (el módulo no publica tipos).
const RNFormData: new () => FormData =
  require('react-native/Libraries/Network/FormData').default;

const ANDROID_CACHE_URI =
  'file:///data/user/0/com.foodai.app/cache/ImageManipulator/8f1c2a7e-private.jpg';
const ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c3ItYW5kcm9pZCJ9.c2VjcmV0LXNpZ25hdHVyZQ';

const androidImage: SelectedImage = {
  uri: ANDROID_CACHE_URI,
  mimeType: 'image/jpeg',
  fileName: 'alimento_1730000000000.jpg',
  width: 1920,
  height: 1440,
  fileSize: 812_345,
};

function htmlResponse(status: number) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new SyntaxError('JSON Parse error: Unexpected character: <');
    },
  };
}

// Serializa también instancias de Error (JSON.stringify las reduce a "{}").
function serializeLogCalls(calls: unknown[][]): string {
  return calls
    .flat()
    .map((arg) => (arg instanceof Error ? `${arg.name}: ${arg.message}` : JSON.stringify(arg)))
    .join(' ');
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe('scannerApi en Android (subida multipart y clasificación de errores)', () => {
  const originalFetch = globalThis.fetch;
  const originalFormData = globalThis.FormData;
  const originalPlatform = Platform.OS;
  let infoSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://foodai-backend.example.com';
    jest.restoreAllMocks();
    jest.spyOn(supabase.auth, 'getSession').mockImplementation(async () => ({
      data: {
        session: {
          access_token: ACCESS_TOKEN,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: 'usr-android' },
        } as any,
      },
      error: null,
    }));
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    (Platform as any).OS = 'android';
    // En el APK, FormData es la implementación de React Native (no la de Node/undici).
    (globalThis as any).FormData = RNFormData;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    (globalThis as any).FormData = originalFormData;
    (Platform as any).OS = originalPlatform;
    jest.restoreAllMocks();
  });

  function loggedText(): string {
    return serializeLogCalls(infoSpy.mock.calls);
  }

  it('envía un multipart compatible con OkHttp: campo "image", URI file://, tipo explícito y sin Content-Type manual', async () => {
    let capturedInit: any = null;
    globalThis.fetch = jest.fn().mockImplementation((_url: string, init: any) => {
      capturedInit = init;
      return Promise.resolve(
        jsonResponse(200, {
          success: true,
          data: { ingredients: [{ name: 'Tomate', quantity: 3, unit: 'unidad', needsReview: false }] },
        })
      );
    }) as unknown as typeof fetch;

    const result = await analyzeIngredientsImage(androidImage);

    expect(result).toEqual([{ name: 'Tomate', quantity: 3, unit: 'unidad', needsReview: false }]);
    expect(capturedInit.method).toBe('POST');
    expect(capturedInit.headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(capturedInit.headers['Content-Type']).toBeUndefined();
    expect(capturedInit.headers['content-type']).toBeUndefined();
    expect(capturedInit.body).toBeInstanceOf(RNFormData);

    // getParts() es exactamente lo que RCTNetworking entrega a NetworkingModule (Android).
    const parts = capturedInit.body.getParts();
    expect(parts).toHaveLength(1);
    const [part] = parts;
    expect(part.fieldName).toBe('image');
    expect(part.uri).toBe(ANDROID_CACHE_URI);
    expect(part.uri.startsWith('file://')).toBe(true);
    // Sin content-type de parte, Android rechaza con "Binary FormData part needs a content-type header".
    expect(part.headers['content-type']).toBe('image/jpeg');
    expect(part.headers['content-disposition']).toBe(
      'form-data; name="image"; filename="alimento_1730000000000.jpg"'
    );
  });

  it('clasifica un fallo al construir el FormData como error de preparación, no de red, y no llama a fetch', async () => {
    (globalThis as any).FormData = class BrokenFormData {
      append() {
        throw new TypeError(`No se pudo leer ${ANDROID_CACHE_URI}`);
      }
    };
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const error = await analyzeIngredientsImage(androidImage).catch((e) => e);

    expect(error).toBeInstanceOf(ScannerApiError);
    expect(error.code).toBe('IMAGE_PREPARATION_FAILED');
    expect(error.isNetworkError).toBe(false);
    expect(error.status).toBe(0);
    expect(error.message).not.toMatch(/conectar con el servidor/i);
    expect(error.message).toMatch(/preparar la foto/i);
    expect(error.diagnostic).toEqual(
      expect.objectContaining({ stage: 'prepare', platform: 'android', errorName: 'TypeError' })
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clasifica un rechazo de fetch (transporte nativo) como NETWORK_ERROR en la etapa de subida', async () => {
    globalThis.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('Network request failed')) as unknown as typeof fetch;

    const error = await analyzeIngredientsImage(androidImage).catch((e) => e);

    expect(error).toBeInstanceOf(ScannerApiError);
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.isNetworkError).toBe(true);
    expect(error.message).toMatch(/enviar la foto/i);
    expect(error.diagnostic).toEqual(
      expect.objectContaining({ stage: 'upload', platform: 'android', errorName: 'TypeError' })
    );
  });

  it('mantiene los errores JSON del backend como errores HTTP (400, 401, 413, 429, 500, 502, 503, 504)', async () => {
    const cases: [number, unknown, Record<string, unknown>][] = [
      [400, { success: false, error: { code: 'INVALID_IMAGE_FORMAT', message: 'x' } }, { code: 'INVALID_IMAGE_FORMAT', status: 400, isValidationError: true }],
      [401, { success: false, error: { code: 'INVALID_AUTH_TOKEN', message: 'x' } }, { code: 'INVALID_AUTH_TOKEN', status: 401, isAuthError: true }],
      [413, { success: false, error: { code: 'IMAGE_TOO_LARGE', message: 'La imagen supera el tamaño máximo permitido de 8 MB.' } }, { code: 'IMAGE_TOO_LARGE', status: 413, isValidationError: true }],
      [429, { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'x' } }, { code: 'RATE_LIMIT_EXCEEDED', status: 429, isRateLimit: true }],
      [500, { success: false, error: { code: 'INTERNAL_ERROR', message: 'x' } }, { code: 'INTERNAL_ERROR', status: 500 }],
      [502, { success: false, error: { code: 'IMAGE_ANALYSIS_FAILED', message: 'x' } }, { code: 'IMAGE_ANALYSIS_FAILED', status: 502 }],
      [503, { success: false, error: { code: 'GEMINI_UNAVAILABLE', message: 'x' } }, { code: 'GEMINI_UNAVAILABLE', status: 503 }],
      [504, { success: false, error: { code: 'GEMINI_TIMEOUT', message: 'x' } }, { code: 'GEMINI_TIMEOUT', status: 504, isTimeout: true }],
    ];

    for (const [status, body, expected] of cases) {
      globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(status, body)) as unknown as typeof fetch;
      const error = await analyzeIngredientsImage(androidImage).catch((e) => e);
      expect(error).toBeInstanceOf(ScannerApiError);
      expect(error).toMatchObject({ ...expected, isNetworkError: false });
      expect(error.diagnostic).toEqual(expect.objectContaining({ stage: 'response', httpStatus: status }));
    }
  });

  it('clasifica respuestas HTML de proxy (413/502/503/504) por código HTTP en vez de "JSON inválido"', async () => {
    const cases: [number, Record<string, unknown>][] = [
      [413, { code: 'IMAGE_TOO_LARGE', status: 413, isValidationError: true }],
      [502, { code: 'HTTP_502', status: 502 }],
      [503, { code: 'GEMINI_UNAVAILABLE', status: 503 }],
      [504, { code: 'GEMINI_TIMEOUT', status: 504, isTimeout: true }],
      [401, { code: 'AUTH_TOKEN_REQUIRED', status: 401, isAuthError: true }],
    ];

    for (const [status, expected] of cases) {
      globalThis.fetch = jest.fn().mockResolvedValue(htmlResponse(status)) as unknown as typeof fetch;
      const error = await analyzeIngredientsImage(androidImage).catch((e) => e);
      expect(error).toBeInstanceOf(ScannerApiError);
      expect(error).toMatchObject({ ...expected, isNetworkError: false });
      expect(error.code).not.toBe('MALFORMED_JSON');
    }
  });

  it('sigue reportando MALFORMED_JSON cuando una respuesta 200 no es JSON', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(htmlResponse(200)) as unknown as typeof fetch;
    await expect(analyzeIngredientsImage(androidImage)).rejects.toMatchObject({
      code: 'MALFORMED_JSON',
      status: 200,
    });
  });

  it('distingue la cancelación del usuario durante la subida (sin diagnóstico de falla)', async () => {
    const controller = new AbortController();
    globalThis.fetch = jest.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const abortError = new Error('Aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          });
          setTimeout(() => controller.abort(), 5);
        })
    ) as unknown as typeof fetch;

    const error = await analyzeIngredientsImage(androidImage, { signal: controller.signal }).catch(
      (e) => e
    );

    expect(error).toMatchObject({ code: 'REQUEST_ABORTED', isNetworkError: false, isTimeout: false });
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('distingue el tiempo límite del cliente durante la subida de un fallo de red', async () => {
    globalThis.fetch = jest.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new TypeError('Network request failed'));
          });
        })
    ) as unknown as typeof fetch;

    const error = await analyzeIngredientsImage(androidImage, { timeoutMs: 20 }).catch((e) => e);

    expect(error).toMatchObject({ code: 'REQUEST_TIMEOUT', isTimeout: true, isNetworkError: false });
    expect(error.diagnostic).toEqual(expect.objectContaining({ stage: 'upload' }));
  });

  it('registra un diagnóstico seguro sin tokens, encabezados, URIs privadas ni contenido de imagen', async () => {
    globalThis.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError(`Could not retrieve file for uri ${ANDROID_CACHE_URI}`)) as unknown as typeof fetch;

    await analyzeIngredientsImage(androidImage).catch(() => undefined);

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const logged = loggedText();
    expect(logged).toContain('NETWORK_ERROR');
    expect(logged).toContain('upload');
    expect(logged).toContain('android');
    expect(logged).not.toContain(ACCESS_TOKEN);
    expect(logged).not.toMatch(/Bearer/i);
    expect(logged).not.toMatch(/authorization/i);
    expect(logged).not.toContain('file://');
    expect(logged).not.toContain('8f1c2a7e-private');
    expect(logged).not.toContain('Could not retrieve file');
  });
});

describe('imageUtils: privacidad al fallar la optimización', () => {
  it('no registra la URI privada ni el mensaje crudo del error nativo', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (manipulateAsync as jest.Mock).mockRejectedValueOnce(
      new Error(`Could not load image from ${ANDROID_CACHE_URI}`)
    );

    const result = await optimizeImageIfNeeded({ ...androidImage, width: 4000, height: 3000 });

    expect(result.uri).toBe(ANDROID_CACHE_URI);
    expect(warnSpy).toHaveBeenCalled();
    const logged = serializeLogCalls(warnSpy.mock.calls);
    expect(logged).not.toContain('file://');
    expect(logged).not.toContain('Could not load image');
    warnSpy.mockRestore();
  });
});
