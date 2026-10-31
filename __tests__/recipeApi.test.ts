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
  validateBackendIngredient,
  validateBackendRecipe,
  validateBackendRecipes,
} from '../src/services/api/recipeApi';
import { supabase } from '../src/services/supabase/client';
import { RecommendRecipesRequest } from '../src/types/recipe';

describe('Cliente de API de Recetas (recipeApi)', () => {
  const originalFetch = (globalThis as any).fetch;
  const mockAccessToken = 'mock-supabase-jwt-recipe-api';

  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:3000';
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
    (globalThis as any).fetch = originalFetch;
    jest.restoreAllMocks();
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
      expect(options.headers['Authorization']).toBe(`Bearer ${mockAccessToken}`);

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

  describe('4. Resiliencia ante fallos de red, formato y timeouts (FIX 1)', () => {
    it('captura fallos de conectividad de red arrojando NETWORK_ERROR descriptivo', async () => {
      (globalThis as any).fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(recommendRecipes(validRequest)).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
        isNetworkError: true,
        message: expect.stringContaining('No se pudo conectar con el servidor FoodAI'),
      });
    });

    it('1. Timeout antes de recibir encabezados HTTP (timeout before response headers)', async () => {
      // Mock de fetch que nunca resuelve dentro del timeout inyectado
      (globalThis as any).fetch = jest.fn().mockImplementation((_url, options) => {
        return new Promise((_resolve, reject) => {
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }
        });
      });

      await expect(
        recommendRecipes(validRequest, { timeoutMs: 30 })
      ).rejects.toMatchObject({
        code: 'REQUEST_TIMEOUT',
        isTimeout: true,
        message: expect.stringContaining('La solicitud a la IA excedió el tiempo límite de espera'),
      });
    });

    it('2. Timeout durante la lectura del cuerpo response.json() (timeout while reading body)', async () => {
      // Fetch resuelve headers de inmediato, pero json() se suspende hasta timeout
      (globalThis as any).fetch = jest.fn().mockImplementation((_url, options) => {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            new Promise((_resolve, reject) => {
              if (options?.signal) {
                options.signal.addEventListener('abort', () => {
                  const err = new Error('The operation was aborted while reading body');
                  err.name = 'AbortError';
                  reject(err);
                });
              }
            }),
        });
      });

      await expect(
        recommendRecipes(validRequest, { timeoutMs: 30 })
      ).rejects.toMatchObject({
        code: 'REQUEST_TIMEOUT',
        isTimeout: true,
        message: expect.stringContaining('La solicitud a la IA excedió el tiempo límite de espera'),
      });
    });

    it('3. Cancelación externa durante la lectura del cuerpo response.json()', async () => {
      const abortController = new AbortController();

      (globalThis as any).fetch = jest.fn().mockImplementation((_url, options) => {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            new Promise((_resolve, reject) => {
              if (options?.signal) {
                options.signal.addEventListener('abort', () => {
                  const err = new Error('Body read aborted externally');
                  err.name = 'AbortError';
                  reject(err);
                });
              }
              // Abortar externamente mientras se lee el cuerpo
              setTimeout(() => abortController.abort(), 10);
            }),
        });
      });

      await expect(
        recommendRecipes(validRequest, { signal: abortController.signal, timeoutMs: 5000 })
      ).rejects.toMatchObject({
        code: 'REQUEST_ABORTED',
        isTimeout: false,
        message: 'La solicitud de recetas fue cancelada.',
      });
    });

    it('4. Parseo exitoso de JSON antes de que expire el timeout', async () => {
      (globalThis as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { recipes: sampleBackendRecipes },
        }),
      });

      const result = await recommendRecipes(validRequest, { timeoutMs: 2000 });
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Pollo salteado con arroz');
    });

    it('5. JSON verdaderamente malformado (truly malformed JSON) no se confunde con abort', async () => {
      (globalThis as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        },
      });

      await expect(recommendRecipes(validRequest)).rejects.toMatchObject({
        code: 'MALFORMED_JSON',
        status: 200,
        message: expect.stringContaining('no es JSON válido'),
      });
    });

    it('6. Limpieza garantizada de temporizadores y listeners de abort en externalSignal', async () => {
      const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');
      const abortController = new AbortController();
      const removeEventListenerSpy = jest.spyOn(abortController.signal, 'removeEventListener');

      (globalThis as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { recipes: [] },
        }),
      });

      await recommendRecipes(validRequest, { signal: abortController.signal });

      expect(clearTimeoutSpy).toHaveBeenCalled();
      expect(removeEventListenerSpy).toHaveBeenCalledWith('abort', expect.any(Function));

      clearTimeoutSpy.mockRestore();
      removeEventListenerSpy.mockRestore();
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

    it('cancela solicitudes cuando se activa un AbortSignal externo antes de enviar', async () => {
      const abortController = new AbortController();
      abortController.abort(); // Cancelado inmediatamente

      await expect(
        recommendRecipes(validRequest, { signal: abortController.signal })
      ).rejects.toMatchObject({
        code: 'REQUEST_ABORTED',
        isTimeout: false,
        message: 'La solicitud de recetas fue cancelada.',
      });
    });
  });

  describe('5. Validación estricta en tiempo de ejecución de recetas (ISSUE 1)', () => {
    it('valida exitosamente una receta completa que cumple estrictamente el contrato', () => {
      const validated = validateBackendRecipe(sampleBackendRecipes[0], 0);
      expect(validated.name).toBe('Pollo salteado con arroz');
      expect(validated.totalMinutes).toBe(30);
      expect(validated.ingredients.length).toBe(2);
      expect(validated.withinBudget).toBe(true);
      expect(validated.budgetRemaining).toBe(25000);
      expect(validated.convenience).toBe(95);
    });

    it('preserva colecciones vacías de recetas si el endpoint así lo retorna', () => {
      const validated = validateBackendRecipes([]);
      expect(validated).toEqual([]);
    });

    it('rechaza colecciones que no sean arreglos', () => {
      expect(() => validateBackendRecipes(null)).toThrow(RecipeApiError);
      expect(() => validateBackendRecipes({})).toThrow(RecipeApiError);
      expect(() => validateBackendRecipes('no-array')).toThrow(RecipeApiError);
    });

    it('rechaza recetas nulas o no objetos', () => {
      expect(() => validateBackendRecipe(null, 0)).toThrow(
        /La receta en la posición #1 es inválida o nula/i
      );
      expect(() => validateBackendRecipe('string-recipe', 1)).toThrow(
        /La receta en la posición #2 es inválida o nula/i
      );
    });

    it('rechaza recetas con nombre ausente, vacío o solo espacios', () => {
      const invalid = { ...sampleBackendRecipes[0], name: '   ' };
      expect(() => validateBackendRecipe(invalid, 0)).toThrow(
        /carece de un nombre válido/i
      );
    });

    it('rechaza recetas con descripción ausente o vacía', () => {
      const invalid = { ...sampleBackendRecipes[0], description: '' };
      expect(() => validateBackendRecipe(invalid, 0)).toThrow(
        /carece de una descripción válida/i
      );
    });

    it('rechaza recetas con totalMinutes <= 0, no enteros o no numéricos', () => {
      expect(() =>
        validateBackendRecipe({ ...sampleBackendRecipes[0], totalMinutes: 0 }, 0)
      ).toThrow(/debe ser un entero positivo en minutos/i);

      expect(() =>
        validateBackendRecipe({ ...sampleBackendRecipes[0], totalMinutes: -15 }, 0)
      ).toThrow(/debe ser un entero positivo en minutos/i);

      expect(() =>
        validateBackendRecipe({ ...sampleBackendRecipes[0], totalMinutes: 25.5 }, 0)
      ).toThrow(/debe ser un entero positivo en minutos/i);

      expect(() =>
        validateBackendRecipe({ ...sampleBackendRecipes[0], totalMinutes: '30' as any }, 0)
      ).toThrow(/debe ser un entero positivo en minutos/i);
    });

    it('rechaza recetas sin ingredientes o con arreglo vacío', () => {
      expect(() =>
        validateBackendRecipe({ ...sampleBackendRecipes[0], ingredients: [] }, 0)
      ).toThrow(/debe contener al menos un ingrediente/i);

      expect(() =>
        validateBackendRecipe({ ...sampleBackendRecipes[0], ingredients: 'no-array' as any }, 0)
      ).toThrow(/debe contener al menos un ingrediente/i);
    });

    it('rechaza recetas sin pasos de preparación o con pasos vacíos', () => {
      expect(() =>
        validateBackendRecipe({ ...sampleBackendRecipes[0], steps: [] }, 0)
      ).toThrow(/debe contener al menos un paso de preparación válido/i);

      expect(() =>
        validateBackendRecipe({ ...sampleBackendRecipes[0], steps: ['  '] }, 0)
      ).toThrow(/debe contener al menos un paso de preparación válido/i);
    });

    it('valida ingredientes con cantidades nulas válidas y unidades permitidas por el backend', () => {
      const ing = validateBackendIngredient(
        { name: 'Sal al gusto', quantity: null, unit: 'desconocida' },
        0,
        0,
        'ingredients'
      );
      expect(ing.name).toBe('Sal al gusto');
      expect(ing.quantity).toBeNull();
      expect(ing.unit).toBe('desconocida');
    });

    it('rechaza ingredientes con unidades no soportadas por el contrato del backend', () => {
      expect(() =>
        validateBackendIngredient(
          { name: 'Harina', quantity: 2, unit: 'baldes' as any },
          0,
          0,
          'ingredients'
        )
      ).toThrow(/no está admitida por el backend/i);
    });

    it('rechaza ingredientes con cantidad negativa o cero', () => {
      expect(() =>
        validateBackendIngredient(
          { name: 'Pollo', quantity: -100, unit: 'g' },
          0,
          0,
          'ingredients'
        )
      ).toThrow(/debe ser un número positivo o null/i);

      expect(() =>
        validateBackendIngredient(
          { name: 'Pollo', quantity: 0, unit: 'g' },
          0,
          0,
          'ingredients'
        )
      ).toThrow(/debe ser un número positivo o null/i);
    });

    it('rechaza ingredientes con costo estimado negativo o no finito', () => {
      expect(() =>
        validateBackendIngredient(
          { name: 'Aceite', quantity: 1, unit: 'cucharada', estimatedCost: -200 },
          0,
          0,
          'ingredients'
        )
      ).toThrow(/debe ser un número finito no negativo/i);
    });

    it('rechaza recetas con estimatedMissingCost negativo', () => {
      expect(() =>
        validateBackendRecipe(
          { ...sampleBackendRecipes[0], estimatedMissingCost: -1000 },
          0
        )
      ).toThrow(/debe ser un número finito no negativo/i);
    });

    it('acepta recetas con budgetRemaining negativo cuando se excede el presupuesto', () => {
      const recipeWithDeficit = {
        ...sampleBackendRecipes[0],
        budgetRemaining: -4500,
        withinBudget: false,
      };
      const validated = validateBackendRecipe(recipeWithDeficit, 0);
      expect(validated.budgetRemaining).toBe(-4500);
      expect(validated.withinBudget).toBe(false);
    });

    it('rechaza recetas con withinBudget no booleano', () => {
      expect(() =>
        validateBackendRecipe(
          { ...sampleBackendRecipes[0], withinBudget: 'true' as any },
          0
        )
      ).toThrow(/debe ser un valor booleano/i);
    });

    it('rechaza recetas con índice de conveniencia fuera de rango (0-100)', () => {
      expect(() =>
        validateBackendRecipe({ ...sampleBackendRecipes[0], convenience: -1 }, 0)
      ).toThrow(/debe ser un número entre 0 y 100/i);

      expect(() =>
        validateBackendRecipe({ ...sampleBackendRecipes[0], convenience: 101 }, 0)
      ).toThrow(/debe ser un número entre 0 y 100/i);
    });

    it('rechaza recetas con razón vacía', () => {
      expect(() =>
        validateBackendRecipe({ ...sampleBackendRecipes[0], reason: '   ' }, 0)
      ).toThrow(/carece de una razón de conveniencia válida/i);
    });

    it('falla la llamada a recommendRecipes si el backend responde con una receta malformada', async () => {
      (globalThis as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            recipes: [
              {
                ...sampleBackendRecipes[0],
                totalMinutes: -99, // Inválido
              },
            ],
          },
        }),
      });

      await expect(recommendRecipes(validRequest)).rejects.toMatchObject({
        name: 'RecipeApiError',
        status: 200,
        code: 'INVALID_RESPONSE_SHAPE',
        message: expect.stringContaining('debe ser un entero positivo en minutos'),
      });
    });
  });

  describe('6. checkBackendHealth', () => {
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
