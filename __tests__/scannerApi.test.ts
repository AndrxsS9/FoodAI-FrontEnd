import {
  analyzeIngredientsImage,
  ScannerApiError,
  validateBackendDetectedIngredient,
  validateDetectedIngredientsResponse,
} from '../src/services/api/scannerApi';
import { supabase } from '../src/services/supabase/client';
import { SelectedImage } from '../src/types/scanner';

describe('scannerApi', () => {
  const originalFetch = globalThis.fetch;
  const mockAccessToken = 'mock-supabase-jwt-scanner-api';

  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:3000';
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jest.spyOn(supabase.auth, 'getSession').mockImplementation(async () => ({
      data: {
        session: {
          access_token: mockAccessToken,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        } as any,
      },
      error: null,
    }));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const mockImage: SelectedImage = {
    uri: 'file:///photo.jpg',
    mimeType: 'image/jpeg',
    fileName: 'food.jpg',
  };

  describe('validateBackendDetectedIngredient and validateDetectedIngredientsResponse', () => {
    it('accepts valid ingredient with positive quantity and valid unit', () => {
      const valid = {
        name: 'Tomate',
        quantity: 3,
        unit: 'unidad',
        needsReview: false,
      };

      const result = validateBackendDetectedIngredient(valid, 0);
      expect(result).toEqual(valid);
    });

    it('accepts valid ingredient with null quantity and desconocida unit', () => {
      const valid = {
        name: 'Arroz',
        quantity: null,
        unit: 'desconocida',
        needsReview: true,
      };

      const result = validateBackendDetectedIngredient(valid, 0);
      expect(result.quantity).toBeNull();
      expect(result.unit).toBe('desconocida');
      expect(result.needsReview).toBe(true);
    });

    it('rejects ingredient with missing or empty name', () => {
      expect(() =>
        validateBackendDetectedIngredient(
          { name: '   ', quantity: 1, unit: 'unidad', needsReview: false },
          0
        )
      ).toThrow(ScannerApiError);
    });

    it('rejects ingredient with negative or zero quantity', () => {
      expect(() =>
        validateBackendDetectedIngredient(
          { name: 'Manzana', quantity: -1, unit: 'unidad', needsReview: false },
          0
        )
      ).toThrow(ScannerApiError);

      expect(() =>
        validateBackendDetectedIngredient(
          { name: 'Manzana', quantity: 0, unit: 'unidad', needsReview: false },
          0
        )
      ).toThrow(ScannerApiError);
    });

    it('rejects ingredient with invalid unit', () => {
      expect(() =>
        validateBackendDetectedIngredient(
          { name: 'Pera', quantity: 2, unit: 'tonelada', needsReview: false },
          0
        )
      ).toThrow(ScannerApiError);
    });

    it('rejects ingredient with non-boolean needsReview', () => {
      expect(() =>
        validateBackendDetectedIngredient(
          { name: 'Pera', quantity: 2, unit: 'unidad', needsReview: 'no' },
          0
        )
      ).toThrow(ScannerApiError);
    });

    it('rejects non-array ingredients response', () => {
      expect(() => validateDetectedIngredientsResponse({ not: 'an array' })).toThrow(
        ScannerApiError
      );
    });
  });

  describe('analyzeIngredientsImage integration', () => {
    it('sends POST request to /api/ingredients/analyze with multipart image', async () => {
      const mockSuccessEnvelope = {
        success: true,
        data: {
          ingredients: [
            {
              name: 'Tomate',
              quantity: 2,
              unit: 'unidad',
              needsReview: false,
            },
            {
              name: 'Cebolla',
              quantity: null,
              unit: 'desconocida',
              needsReview: true,
            },
          ],
        },
      };

      let capturedUrl = '';
      let capturedMethod = '';
      let capturedHeaders: Record<string, string> = {};
      let capturedBody: any = null;

      globalThis.fetch = jest.fn().mockImplementation((url, init) => {
        capturedUrl = url;
        capturedMethod = init.method;
        capturedHeaders = init.headers;
        capturedBody = init.body;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockSuccessEnvelope,
        });
      });

      const result = await analyzeIngredientsImage(mockImage, {
        baseUrl: 'http://localhost:3000',
      });

      expect(capturedUrl).toBe('http://localhost:3000/api/ingredients/analyze');
      expect(capturedMethod).toBe('POST');
      expect(capturedHeaders.Authorization).toBe(`Bearer ${mockAccessToken}`);
      expect(capturedHeaders.Accept).toBe('application/json');
      expect(capturedHeaders['Content-Type']).toBeUndefined();
      expect(capturedBody).toBeInstanceOf(FormData);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Tomate');
      expect(result[0].quantity).toBe(2);
      expect(result[1].name).toBe('Cebolla');
      expect(result[1].quantity).toBeNull();
    });

    it('returns empty array when backend detects no ingredients', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { ingredients: [] },
        }),
      });

      const result = await analyzeIngredientsImage(mockImage);
      expect(result).toEqual([]);
    });

    it('throws MALFORMED_JSON when response is not valid JSON', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        },
      });

      await expect(analyzeIngredientsImage(mockImage)).rejects.toThrow(
        expect.objectContaining({
          code: 'MALFORMED_JSON',
        })
      );
    });

    it('throws INVALID_RESPONSE_SHAPE when success envelope is missing or corrupted', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: false,
          data: null,
        }),
      });

      await expect(analyzeIngredientsImage(mockImage)).rejects.toThrow(
        expect.objectContaining({
          code: 'INVALID_RESPONSE_SHAPE',
        })
      );
    });

    it('handles HTTP 400 IMAGE_REQUIRED and INVALID_IMAGE_FORMAT', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          error: {
            code: 'INVALID_IMAGE_FORMAT',
            message: 'Formato de imagen no permitido. Usa JPG, PNG o WEBP.',
          },
        }),
      });

      await expect(analyzeIngredientsImage(mockImage)).rejects.toThrow(
        expect.objectContaining({
          code: 'INVALID_IMAGE_FORMAT',
          status: 400,
          isValidationError: true,
        })
      );
    });

    it('handles HTTP 429 Rate Limit (GEMINI_RATE_LIMIT)', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({
          success: false,
          error: {
            code: 'GEMINI_RATE_LIMIT',
            message: 'Se alcanzó temporalmente el límite de solicitudes de análisis.',
          },
        }),
      });

      await expect(analyzeIngredientsImage(mockImage)).rejects.toThrow(
        expect.objectContaining({
          code: 'GEMINI_RATE_LIMIT',
          status: 429,
          isRateLimit: true,
        })
      );
    });

    it('handles HTTP 504 Gateway Timeout (GEMINI_TIMEOUT)', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 504,
        json: async () => ({
          success: false,
          error: {
            code: 'GEMINI_TIMEOUT',
            message: 'El servicio de análisis tardó demasiado en responder.',
          },
        }),
      });

      await expect(analyzeIngredientsImage(mockImage)).rejects.toThrow(
        expect.objectContaining({
          code: 'GEMINI_TIMEOUT',
          status: 504,
          isTimeout: true,
        })
      );
    });

    it('handles HTTP 500/502/503 server errors', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({
          success: false,
          error: {
            code: 'GEMINI_UNAVAILABLE',
            message: 'El servicio de análisis está temporalmente ocupado.',
          },
        }),
      });

      await expect(analyzeIngredientsImage(mockImage)).rejects.toThrow(
        expect.objectContaining({
          code: 'GEMINI_UNAVAILABLE',
          status: 503,
        })
      );
    });

    it('handles network error when backend is offline', async () => {
      globalThis.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));

      await expect(analyzeIngredientsImage(mockImage)).rejects.toThrow(
        expect.objectContaining({
          code: 'NETWORK_ERROR',
          isNetworkError: true,
        })
      );
    });

    it('handles cancellation via AbortSignal', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        analyzeIngredientsImage(mockImage, { signal: controller.signal })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'REQUEST_ABORTED',
        })
      );
    });

    it('handles timeout during response body reading without classifying as MALFORMED_JSON', async () => {
      // El cuerpo solo falla cuando el AbortSignal real de la petición se aborta por timeout.
      globalThis.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            new Promise((_resolve, reject) => {
              init.signal?.addEventListener('abort', () => {
                const abortError = new Error('The user aborted a request.');
                abortError.name = 'AbortError';
                reject(abortError);
              });
            }),
        });
      });

      await expect(
        analyzeIngredientsImage(mockImage, { timeoutMs: 50 })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'REQUEST_TIMEOUT',
          isTimeout: true,
        })
      );
    });
  });
});
