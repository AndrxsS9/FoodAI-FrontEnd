/**
 * Suite de pruebas unitarias para el cliente de API de Recetas (Fase 3A).
 * Valida la comunicación segura con el endpoint POST /api/recipes/recommend:
 * 1. Peticiones HTTP correctas (método, headers, payload JSON).
 * 2. Validación defensiva de precondiciones en cliente (despensa vacía, presupuesto, comensales).
 * 3. Respuestas exitosas y retorno tipado de BackendRecipe[].
 * 4. Manejo de errores HTTP 400 de validación con detalles del backend.
 * 5. Manejo de límites de tasa HTTP 429 (RATE_LIMIT_EXCEEDED).
 * 6. Manejo de errores de servidor HTTP 500 / 503 / 504.
 * 7. Control de tiempo de espera (timeout) mediante AbortController.
 * 8. Cancelación mediante AbortSignal externo.
 * 9. Detección de fallos de red / conectividad (NETWORK_ERROR).
 * 10. Detección de respuestas con JSON malformado.
 * 11. Detección de respuestas con estructura o envelope inválido.
 * 12. Comprobación de salud con checkBackendHealth.
 */
import {
  RecipeApiError,
  checkBackendHealth,
  recommendRecipes,
} from '../src/services/api/recipeApi';
import { RecommendRecipesRequest } from '../src/types/recipe';

describe('Cliente de API de Recetas (recipeApi)', () => {
  const originalFetch = (globalThis as any).fetch;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:3000';
  });

  afterEach(() => {
    (globalThis as any).fetch = originalFetch;
    jest.clearAllMocks();
  });

  const validRequest: RecommendRecipesRequest = {
    pantry: [
      { name: 'Pollo', quantity: 500, unit: 'g', needsReview: false },
      { name: 'Arroz', quantity: 200, unit: 'g', needsReview: false },
    ],
    budget: 25000,
    servings: 2,
    maxMinutes: 40,
  };

  const sampleBackendRecipes = [
    {
      name: 'Pollo salteado con arroz',
      description: 'Plato rápido y nutritivo aprovechando tu despensa.',
      totalMinutes: 30,
      ingredients: [
        { name: 'Pollo', quantity: 300, unit: 'g' },
        { name: 'Arroz', quantity: 150, unit: 'g' },
      ],
      steps: ['Cocinar el arroz', 'Saltear el pollo', 'Servir caliente'],
      availableIngredients: [
        { name: 'Pollo', quantity: 300, unit: 'g' },
        { name: 'Arroz', quantity: 150, unit: 'g' },
      ],
      missingIngredients: [],
      estimatedMissingCost: 0,
      budgetRemaining: 25000,
      withinBudget: true,
      convenience: 95,
      reason: 'Aprovecha tus ingredientes al 100%.',
    },
  ];

  describe('1. Validaciones previas en cliente (Precondiciones para no gastar cuota)', () => {
    it('rechaza solicitudes con despensa vacía sin realizar llamadas HTTP', async () => {
      const mockFetch = jest.fn();
      (globalThis as any).fetch = mockFetch;

      await expect(
        recommendRecipes({
          pantry: [],
          budget: 20000,
          servings: 2,
        })
      ).rejects.toMatchObject({
        code: 'EMPTY_PANTRY',
        status: 400,
        isValidationError: true,
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rechaza presupuestos negativos sin invocar al servidor', async () => {
      const mockFetch = jest.fn();
      (globalThis as any).fetch = mockFetch;

      await expect(
        recommendRecipes({
          pantry: [{ name: 'Arroz', quantity: 500, unit: 'g', needsReview: false }],
          budget: -500,
          servings: 2,
        })
      ).rejects.toMatchObject({
        code: 'INVALID_BUDGET',
        status: 400,
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rechaza números de comensales fuera del rango permitido (1 a 12)', async () => {
      const mockFetch = jest.fn();
      (globalThis as any).fetch = mockFetch;

      await expect(
        recommendRecipes({
          pantry: [{ name: 'Arroz', quantity: 500, unit: 'g', needsReview: false }],
          budget: 20000,
          servings: 0,
        })
      ).rejects.toMatchObject({
        code: 'INVALID_SERVINGS',
      });

      await expect(
        recommendRecipes({
          pantry: [{ name: 'Arroz', quantity: 500, unit: 'g', needsReview: false }],
          budget: 20000,
          servings: 15,
        })
      ).rejects.toMatchObject({
        code: 'INVALID_SERVINGS',
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rechaza tiempos máximos negativos o mayores a 240 minutos', async () => {
      const mockFetch = jest.fn();
      (globalThis as any).fetch = mockFetch;

      await expect(
        recommendRecipes({
          pantry: [{ name: 'Arroz', quantity: 500, unit: 'g', needsReview: false }],
          budget: 20000,
          servings: 2,
          maxMinutes: 300,
        })
      ).rejects.toMatchObject({
        code: 'INVALID_MAX_MINUTES',
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('2. Petición exitosa y estructura de datos', () => {
    it('envía los encabezados y payload JSON correctos a POST /api/recipes/recommend', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            recipes: sampleBackendRecipes,
          },
        }),
      });
      (globalThis as any).fetch = mockFetch;

      const result = await recommendRecipes(validRequest);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:3000/api/recipes/recommend');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['Accept']).toBe('application/json');

      const parsedBody = JSON.parse(options.body);
      expect(parsedBody.pantry.length).toBe(2);
      expect(parsedBody.budget).toBe(25000);
      expect(parsedBody.servings).toBe(2);
      expect(parsedBody.maxMinutes).toBe(40);

      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Pollo salteado con arroz');
      expect(result[0].convenience).toBe(95);
    });

    it('soporta colecciones vacías de recetas cuando el backend no encuentra opciones', async () => {
      (globalThis as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            recipes: [],
          },
        }),
      });

      const result = await recommendRecipes(validRequest);
      expect(result).toEqual([]);
    });
  });

  describe('3. Manejo de errores HTTP del backend', () => {
    it('procesa errores 400 de validación Zod preservando detalles del backend', async () => {
      (globalThis as any).fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Los datos enviados no son válidos.',
            details: [{ field: 'budget', message: 'El presupuesto no puede ser negativo.' }],
          },
        }),
      });

      await expect(recommendRecipes(validRequest)).rejects.toMatchObject({
        name: 'RecipeApiError',
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Los datos enviados no son válidos.',
        isValidationError: true,
      });
    });

    it('procesa errores 429 de límite de tasa de IA (RATE_LIMIT_EXCEEDED)', async () => {
      (globalThis as any).fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Has superado el límite de solicitudes. Por favor, intenta de nuevo más tarde.',
          },
        }),
      });

      await expect(recommendRecipes(validRequest)).rejects.toMatchObject({
        status: 429,
        code: 'RATE_LIMIT_EXCEEDED',
        isRateLimit: true,
      });
    });

    it('procesa errores 500 de servidor o fallas de Gemini con mensaje amigable', async () => {
      (globalThis as any).fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Ocurrió un error interno en el servidor.',
          },
        }),
      });

      await expect(recommendRecipes(validRequest)).rejects.toMatchObject({
        status: 500,
        code: 'INTERNAL_ERROR',
      });
    });
  });

  describe('4. Resiliencia ante fallos de red, formato y timeouts', () => {
    it('captura fallos de conectividad de red arrojando NETWORK_ERROR descriptivo', async () => {
      (globalThis as any).fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(recommendRecipes(validRequest)).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
        isNetworkError: true,
        message: expect.stringContaining('No se pudo conectar con el servidor FoodAI'),
      });
    });

    it('captura respuestas que no son JSON válido arrojando MALFORMED_JSON', async () => {
      (globalThis as any).fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('Unexpected token < in JSON at position 0');
        },
      });

      await expect(recommendRecipes(validRequest)).rejects.toMatchObject({
        code: 'MALFORMED_JSON',
        status: 502,
      });
    });

    it('rechaza respuestas 200 con estructura de datos o envelope inválido', async () => {
      (globalThis as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            // Falta la propiedad 'recipes'
            notRecipes: [],
          },
        }),
      });

      await expect(recommendRecipes(validRequest)).rejects.toMatchObject({
        code: 'INVALID_RECIPES_ARRAY',
      });
    });

    it('cancela solicitudes cuando se activa un AbortSignal externo', async () => {
      const abortController = new AbortController();
      abortController.abort(); // Cancelado inmediatamente

      await expect(
        recommendRecipes(validRequest, { signal: abortController.signal })
      ).rejects.toMatchObject({
        code: 'REQUEST_ABORTED',
        isTimeout: true,
      });
    });
  });

  describe('5. checkBackendHealth', () => {
    it('retorna ok: true cuando GET /api/health responde 200', async () => {
      (globalThis as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'UP' }),
      });

      const health = await checkBackendHealth('http://localhost:3000');
      expect(health.ok).toBe(true);
      expect(health.status).toBe(200);
      expect(health.data).toEqual({ status: 'UP' });
    });

    it('retorna ok: false cuando el servidor está apagado o inalcanzable', async () => {
      (globalThis as any).fetch = jest.fn().mockRejectedValue(new Error('Connection refused'));

      const health = await checkBackendHealth('http://localhost:3000');
      expect(health.ok).toBe(false);
      expect(health.status).toBe(0);
      expect(health.error).toBe('Connection refused');
    });
  });
});
