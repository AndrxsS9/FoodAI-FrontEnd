/**
 * FoodAI - Pruebas de regresión del escáner (MVP final, Bloque 1).
 *
 * Android: subida multipart nativa con expo-file-system (UploadTask real de Expo sobre un
 * módulo nativo simulado; se verifica exactamente lo que recibe FileSystemUploadTask.kt).
 * iOS y Web: fetch + FormData sin cambios.
 *
 * Verifica:
 * 1. Campo multipart "image", MIME de la imagen, Bearer y ausencia de Content-Type manual.
 * 2. Que un fallo al preparar la imagen NUNCA se reporte como caída de red o del servidor.
 * 3. La distinción entre fallos de transporte, errores HTTP del backend, cancelaciones y timeouts.
 * 4. Que cuerpos no JSON de proxies (413/502/503/504) se clasifiquen por código HTTP.
 * 5. Que no existan reintentos de aplicación (una sola subida por análisis).
 * 6. Que el diagnóstico registrado no exponga tokens, URIs privadas ni mensajes nativos crudos.
 */
import { Platform } from 'react-native';
import { manipulateAsync } from 'expo-image-manipulator';
import {
  analyzeIngredientsImage,
  formatScannerDiagnostic,
  ScannerApiError,
} from '../src/services/api/scannerApi';
import { supabase } from '../src/services/supabase/client';
import { SelectedImage } from '../src/types/scanner';
import { optimizeImageIfNeeded } from '../src/utils/imageUtils';

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));

const mockNativeStart = jest.fn();
const mockNativeCancel = jest.fn();
const mockNativeRelease = jest.fn();
let mockFileExists = true;

// Se simula solo el módulo nativo: File y UploadTask son las clases reales de expo-file-system.
jest.mock('../node_modules/expo-file-system/build/ExpoFileSystem', () => {
  class FileSystemFile {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    validatePath() {}
    get exists() {
      return mockFileExists;
    }
  }

  class FileSystemDirectory {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    validatePath() {}
  }

  class FileSystemUploadTask {
    private rejectPending?: (error: Error) => void;

    start(url: string, file: unknown, options: unknown) {
      return new Promise((resolve, reject) => {
        this.rejectPending = reject;
        Promise.resolve(mockNativeStart(url, file, options)).then(resolve, reject);
      });
    }

    cancel() {
      mockNativeCancel();
      const cancelled = Object.assign(new Error('Upload was cancelled'), {
        code: 'ERR_UPLOAD_CANCELLED',
      });
      this.rejectPending?.(cancelled);
    }

    release() {
      mockNativeRelease();
    }

    addListener() {
      return { remove() {} };
    }
  }

  return {
    __esModule: true,
    default: { FileSystemFile, FileSystemDirectory, FileSystemUploadTask },
  };
});

// Implementación real de FormData del runtime de React Native (el módulo no publica tipos).
const RNFormData: new () => FormData =
  require('react-native/Libraries/Network/FormData').default;

const ANDROID_CACHE_URI =
  'file:///data/user/0/com.foodai.app/cache/ImageManipulator/8f1c2a7e-private.jpg';
const ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c3ItYW5kcm9pZCJ9.c2VjcmV0LXNpZ25hdHVyZQ';
const ANALYZE_URL = 'https://foodai-backend.example.com/api/ingredients/analyze';

const androidImage: SelectedImage = {
  uri: ANDROID_CACHE_URI,
  mimeType: 'image/jpeg',
  fileName: 'alimento_1730000000000.jpg',
  width: 1920,
  height: 1440,
  fileSize: 812_345,
};

const SUCCESS_BODY = {
  success: true,
  data: { ingredients: [{ name: 'Tomate', quantity: 3, unit: 'unidad', needsReview: false }] },
};

function nativeResult(status: number, body: unknown) {
  return {
    status,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  };
}

function nativeFailure(message: string) {
  return Object.assign(new Error(`Unable to upload a file: ${message}`), {
    code: 'ERR_UNABLE_TO_UPLOAD',
  });
}

function htmlFetchResponse(status: number) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new SyntaxError('JSON Parse error: Unexpected character: <');
    },
  };
}

function jsonFetchResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

// Serializa también instancias de Error (JSON.stringify las reduce a "{}").
function serializeLogCalls(calls: unknown[][]): string {
  return calls
    .flat()
    .map((arg) => (arg instanceof Error ? `${arg.name}: ${arg.message}` : JSON.stringify(arg)))
    .join(' ');
}

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_FORM_DATA = globalThis.FormData;
const ORIGINAL_PLATFORM = Platform.OS;

let infoSpy: jest.SpyInstance;
let fetchMock: jest.Mock;

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://foodai-backend.example.com';
  jest.restoreAllMocks();
  mockNativeStart.mockReset();
  mockNativeCancel.mockReset();
  mockNativeRelease.mockReset();
  mockFileExists = true;
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
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  (globalThis as any).FormData = ORIGINAL_FORM_DATA;
  (Platform as any).OS = ORIGINAL_PLATFORM;
  jest.restoreAllMocks();
});

describe('Android: subida multipart nativa con expo-file-system', () => {
  beforeEach(() => {
    (Platform as any).OS = 'android';
  });

  it('envía una sola subida multipart con campo "image", MIME, Bearer y sin Content-Type manual', async () => {
    mockNativeStart.mockResolvedValue(nativeResult(200, SUCCESS_BODY));

    const result = await analyzeIngredientsImage(androidImage);

    expect(result).toEqual([{ name: 'Tomate', quantity: 3, unit: 'unidad', needsReview: false }]);
    expect(mockNativeStart).toHaveBeenCalledTimes(1);

    const [url, file, options] = mockNativeStart.mock.calls[0];
    expect(url).toBe(ANALYZE_URL);
    expect(file.uri).toBe(ANDROID_CACHE_URI);
    expect(options).toEqual({
      httpMethod: 'POST',
      uploadType: 1, // UploadType.MULTIPART
      fieldName: 'image',
      mimeType: 'image/jpeg',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      parameters: undefined,
      sessionType: undefined,
    });
    expect(Object.keys(options.headers).map((h) => h.toLowerCase())).not.toContain('content-type');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockNativeRelease).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['image/png', 'file:///data/user/0/com.foodai.app/cache/ImagePicker/foto.png'],
    ['image/webp', 'file:///data/user/0/com.foodai.app/cache/ImagePicker/foto.webp'],
  ])('respeta el MIME %s de la imagen', async (mimeType, uri) => {
    mockNativeStart.mockResolvedValue(nativeResult(200, SUCCESS_BODY));

    await analyzeIngredientsImage({ ...androidImage, uri, mimeType });

    expect(mockNativeStart.mock.calls[0][2].mimeType).toBe(mimeType);
    expect(mockNativeStart.mock.calls[0][2].fieldName).toBe('image');
  });

  it('usa image/jpeg cuando la imagen no informa MIME', async () => {
    mockNativeStart.mockResolvedValue(nativeResult(200, SUCCESS_BODY));

    await analyzeIngredientsImage({ ...androidImage, mimeType: '' });

    expect(mockNativeStart.mock.calls[0][2].mimeType).toBe('image/jpeg');
  });

  it('clasifica un archivo optimizado inexistente como error de preparación y no inicia la subida', async () => {
    mockFileExists = false;

    const error = await analyzeIngredientsImage(androidImage).catch((e) => e);

    expect(error).toBeInstanceOf(ScannerApiError);
    expect(error).toMatchObject({ code: 'IMAGE_PREPARATION_FAILED', isNetworkError: false, status: 0 });
    expect(error.message).toMatch(/preparar la foto/i);
    expect(error.diagnostic).toEqual(
      expect.objectContaining({
        stage: 'prepare',
        transport: 'expo-file-system',
        errorName: 'ImageFileUnavailableError',
      })
    );
    expect(mockNativeStart).not.toHaveBeenCalled();
  });

  it.each([
    ['File does not exist'],
    ["Missing 'READ' permission for accessing the file."],
  ])('clasifica la falla nativa de archivo "%s" como preparación, no como red', async (message) => {
    mockNativeStart.mockRejectedValue(nativeFailure(message));

    const error = await analyzeIngredientsImage(androidImage).catch((e) => e);

    expect(error).toMatchObject({ code: 'IMAGE_PREPARATION_FAILED', isNetworkError: false });
    expect(error.diagnostic).toEqual(
      expect.objectContaining({ stage: 'upload', failureKind: 'file', nativeErrorCode: 'ERR_UNABLE_TO_UPLOAD' })
    );
  });

  it.each([
    ['unexpected end of stream on https://foodai-backend.example.com/...', 'stream'],
    ['Failed to connect to foodai-backend.example.com/10.0.0.1:443', 'connection'],
    ['Connection reset', 'connection'],
    ['Unable to resolve host "foodai-backend.example.com": No address associated with hostname', 'dns'],
    ['javax.net.ssl.SSLHandshakeException: Chain validation failed', 'tls'],
    ['timeout', 'timeout'],
    ['Something unexpected', 'other'],
  ])('clasifica la falla de transporte nativa "%s" como NETWORK_ERROR (%s) sin reintentar', async (message, kind) => {
    mockNativeStart.mockRejectedValue(nativeFailure(message));

    const error = await analyzeIngredientsImage(androidImage).catch((e) => e);

    expect(error).toBeInstanceOf(ScannerApiError);
    expect(error).toMatchObject({ code: 'NETWORK_ERROR', isNetworkError: true, isTimeout: false });
    expect(error.message).toMatch(/enviar la foto/i);
    expect(error.diagnostic).toEqual(
      expect.objectContaining({
        stage: 'upload',
        platform: 'android',
        transport: 'expo-file-system',
        failureKind: kind,
        nativeErrorCode: 'ERR_UNABLE_TO_UPLOAD',
      })
    );
    expect(mockNativeStart).toHaveBeenCalledTimes(1);
    expect(mockNativeRelease).toHaveBeenCalledTimes(1);
  });

  it('mantiene los errores JSON del backend (400, 401, 413, 429, 500, 502, 503, 504)', async () => {
    const cases: [number, unknown, Record<string, unknown>][] = [
      [400, { success: false, error: { code: 'INVALID_IMAGE_FORMAT', message: 'x' } }, { code: 'INVALID_IMAGE_FORMAT', status: 400, isValidationError: true, message: 'Formato de imagen no permitido. Usa JPG, PNG o WEBP.' }],
      [400, { success: false, error: { code: 'IMAGE_REQUIRED', message: 'x' } }, { code: 'IMAGE_REQUIRED', status: 400, isValidationError: true }],
      [401, { success: false, error: { code: 'INVALID_AUTH_TOKEN', message: 'x' } }, { code: 'INVALID_AUTH_TOKEN', status: 401, isAuthError: true }],
      [413, { success: false, error: { code: 'IMAGE_TOO_LARGE', message: 'x' } }, { code: 'IMAGE_TOO_LARGE', status: 413, isValidationError: true }],
      [429, { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'x' } }, { code: 'RATE_LIMIT_EXCEEDED', status: 429, isRateLimit: true }],
      [500, { success: false, error: { code: 'INTERNAL_ERROR', message: 'x' } }, { code: 'INTERNAL_ERROR', status: 500 }],
      [502, { success: false, error: { code: 'IMAGE_ANALYSIS_FAILED', message: 'x' } }, { code: 'IMAGE_ANALYSIS_FAILED', status: 502 }],
      [503, { success: false, error: { code: 'GEMINI_UNAVAILABLE', message: 'x' } }, { code: 'GEMINI_UNAVAILABLE', status: 503 }],
      [503, { success: false, error: { code: 'AUTH_VERIFICATION_UNAVAILABLE', message: 'x' } }, { code: 'AUTH_VERIFICATION_UNAVAILABLE', status: 503, isAuthError: false }],
      [504, { success: false, error: { code: 'GEMINI_TIMEOUT', message: 'x' } }, { code: 'GEMINI_TIMEOUT', status: 504, isTimeout: true }],
    ];

    for (const [status, body, expected] of cases) {
      mockNativeStart.mockReset();
      mockNativeStart.mockResolvedValue(nativeResult(status, body));
      const error = await analyzeIngredientsImage(androidImage).catch((e) => e);
      expect(error).toBeInstanceOf(ScannerApiError);
      expect(error).toMatchObject({ ...expected, isNetworkError: false });
      expect(error.diagnostic).toEqual(
        expect.objectContaining({ stage: 'response', httpStatus: status, transport: 'expo-file-system' })
      );
      expect(mockNativeStart).toHaveBeenCalledTimes(1);
    }
  });

  it('clasifica cuerpos HTML o vacíos de proxy por código HTTP en vez de "JSON inválido"', async () => {
    const cases: [number, string, Record<string, unknown>][] = [
      [413, '<html>413 Request Entity Too Large</html>', { code: 'IMAGE_TOO_LARGE', status: 413, isValidationError: true }],
      [502, '<html>502 Bad Gateway</html>', { code: 'HTTP_502', status: 502 }],
      [503, '', { code: 'GEMINI_UNAVAILABLE', status: 503 }],
      [504, '<html>504 Gateway Timeout</html>', { code: 'GEMINI_TIMEOUT', status: 504, isTimeout: true }],
      [401, '', { code: 'AUTH_TOKEN_REQUIRED', status: 401, isAuthError: true }],
    ];

    for (const [status, body, expected] of cases) {
      mockNativeStart.mockResolvedValue(nativeResult(status, body));
      const error = await analyzeIngredientsImage(androidImage).catch((e) => e);
      expect(error).toMatchObject({ ...expected, isNetworkError: false });
      expect(error.code).not.toBe('MALFORMED_JSON');
    }
  });

  it('reporta MALFORMED_JSON e INVALID_RESPONSE_SHAPE para respuestas 200 inválidas', async () => {
    mockNativeStart.mockResolvedValue(nativeResult(200, '<html>ok</html>'));
    await expect(analyzeIngredientsImage(androidImage)).rejects.toMatchObject({
      code: 'MALFORMED_JSON',
      status: 200,
    });

    mockNativeStart.mockResolvedValue(nativeResult(200, { success: true }));
    await expect(analyzeIngredientsImage(androidImage)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE_SHAPE',
    });
  });

  it('cancela la subida nativa cuando el usuario aborta y no registra diagnóstico de falla', async () => {
    const controller = new AbortController();
    mockNativeStart.mockImplementation(() => {
      setTimeout(() => controller.abort(), 5);
      return new Promise(() => {});
    });

    const error = await analyzeIngredientsImage(androidImage, { signal: controller.signal }).catch(
      (e) => e
    );

    expect(error).toMatchObject({ code: 'REQUEST_ABORTED', isNetworkError: false, isTimeout: false });
    expect(mockNativeCancel).toHaveBeenCalledTimes(1);
    expect(mockNativeRelease).toHaveBeenCalledTimes(1);
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('no inicia la subida nativa si la señal ya estaba abortada', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      analyzeIngredientsImage(androidImage, { signal: controller.signal })
    ).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
    expect(mockNativeStart).not.toHaveBeenCalled();
  });

  it('cancela la subida nativa al agotar el tiempo límite y lo reporta como timeout, no como red', async () => {
    mockNativeStart.mockImplementation(() => new Promise(() => {}));

    const error = await analyzeIngredientsImage(androidImage, { timeoutMs: 20 }).catch((e) => e);

    expect(error).toMatchObject({ code: 'REQUEST_TIMEOUT', isTimeout: true, isNetworkError: false });
    expect(error.diagnostic).toEqual(expect.objectContaining({ stage: 'upload', transport: 'expo-file-system' }));
    expect(mockNativeCancel).toHaveBeenCalledTimes(1);
    expect(mockNativeStart).toHaveBeenCalledTimes(1);
  });

  it('registra un diagnóstico seguro sin tokens, encabezados, URIs privadas ni mensajes nativos', async () => {
    mockNativeStart.mockRejectedValue(
      nativeFailure(`unexpected end of stream on ${ANALYZE_URL} reading ${ANDROID_CACHE_URI}`)
    );

    const error = await analyzeIngredientsImage(androidImage).catch((e) => e);

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const logged = serializeLogCalls(infoSpy.mock.calls);
    expect(logged).toContain('NETWORK_ERROR');
    expect(logged).toContain('expo-file-system');
    expect(logged).toContain('stream');
    expect(logged).not.toContain(ACCESS_TOKEN);
    expect(logged).not.toMatch(/Bearer/i);
    expect(logged).not.toMatch(/authorization/i);
    expect(logged).not.toContain('file://');
    expect(logged).not.toContain('8f1c2a7e-private');
    expect(logged).not.toContain('unexpected end of stream');
    expect(logged).not.toContain('foodai-backend.example.com');
    expect(error.message).not.toContain('file://');
    expect(formatScannerDiagnostic(error)).toBe('NETWORK_ERROR (upload · expo-file-system · stream)');
  });
});

describe('iOS: fetch + FormData de React Native (sin cambios)', () => {
  beforeEach(() => {
    (Platform as any).OS = 'ios';
    (globalThis as any).FormData = RNFormData;
  });

  it('envía el multipart con campo "image", URI file://, tipo explícito y sin usar la subida nativa', async () => {
    fetchMock.mockResolvedValue(jsonFetchResponse(200, SUCCESS_BODY));

    await analyzeIngredientsImage(androidImage);

    expect(mockNativeStart).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(ANALYZE_URL);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(init.headers['Content-Type']).toBeUndefined();
    expect(init.body).toBeInstanceOf(RNFormData);

    const [part] = init.body.getParts();
    expect(part.fieldName).toBe('image');
    expect(part.uri).toBe(ANDROID_CACHE_URI);
    expect(part.headers['content-type']).toBe('image/jpeg');
    expect(part.headers['content-disposition']).toBe(
      'form-data; name="image"; filename="alimento_1730000000000.jpg"'
    );
  });

  it('clasifica un fallo al construir el FormData como error de preparación y no llama a fetch', async () => {
    (globalThis as any).FormData = class BrokenFormData {
      append() {
        throw new TypeError(`No se pudo leer ${ANDROID_CACHE_URI}`);
      }
    };

    const error = await analyzeIngredientsImage(androidImage).catch((e) => e);

    expect(error).toMatchObject({ code: 'IMAGE_PREPARATION_FAILED', isNetworkError: false });
    expect(error.diagnostic).toEqual(
      expect.objectContaining({ stage: 'prepare', transport: 'fetch', errorName: 'TypeError' })
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clasifica el rechazo de fetch como NETWORK_ERROR (upload · fetch · rn_fetch_failed)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));

    const error = await analyzeIngredientsImage(androidImage).catch((e) => e);

    expect(error).toMatchObject({ code: 'NETWORK_ERROR', isNetworkError: true });
    expect(formatScannerDiagnostic(error)).toBe('NETWORK_ERROR (upload · fetch · rn_fetch_failed)');
  });

  it('clasifica cuerpos HTML de proxy por código HTTP', async () => {
    fetchMock.mockResolvedValue(htmlFetchResponse(502));

    await expect(analyzeIngredientsImage(androidImage)).rejects.toMatchObject({
      code: 'HTTP_502',
      status: 502,
      isNetworkError: false,
    });
  });
});

describe('Web: fetch + Blob (sin cambios)', () => {
  it('convierte la URI en Blob, sube con fetch y no usa la subida nativa', async () => {
    (Platform as any).OS = 'web';
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('blob:')) {
        return { blob: async () => new Blob(['img'], { type: 'image/jpeg' }) };
      }
      return jsonFetchResponse(200, SUCCESS_BODY);
    });

    const result = await analyzeIngredientsImage({
      uri: 'blob:http://localhost:8081/1234',
      mimeType: 'image/jpeg',
      fileName: 'scan.jpg',
    });

    expect(result).toHaveLength(1);
    expect(mockNativeStart).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [postUrl, init] = fetchMock.mock.calls[1];
    expect(postUrl).toBe(ANALYZE_URL);
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('image')).toBeInstanceOf(Blob);
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
