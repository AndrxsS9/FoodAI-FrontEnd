/**
 * Suite de pruebas unitarias para el cliente de API del Plan de Comidas (Fase 3C).
 * Valida la comunicación con el endpoint POST /api/meal-plans/generate:
 * 1. Peticiones HTTP correctas (método, headers, endpoint URL y payload JSON).
 * 2. Validación defensiva de precondiciones en cliente (despensa vacía, presupuesto >= 0, comensales 1-12, maxMinutes).
 * 3. Respuestas exitosas con validación de contrato de 3 días.
 * 4. Manejo de errores HTTP 400 (Zod backend), 429 (GEMINI_RATE_LIMIT).
 * 5. Manejo de errores HTTP 502 (INSUFFICIENT_RECIPES_FOR_PLAN, MEAL_PLAN_NOT_AVAILABLE).
 * 6. Manejo de errores HTTP 503 (GEMINI_UNAVAILABLE) y 504 (GEMINI_TIMEOUT).
 * 7. Control de tiempo de espera (timeout) y cancelación externa con AbortSignal.
 * 8. Manejo de fallos de red (NETWORK_ERROR) y JSON malformado (MALFORMED_JSON).
 * 9. Rechazo de respuestas con menos o más de 3 días o recetas inválidas.
 */

import {
  MealPlanApiError,
  generateMealPlan,
} from '../src/services/api/mealPlanApi';
import { MealPlanRequest } from '../src/types/mealPlan';

describe('Cliente de API de Plan de Comidas (mealPlanApi)', () => {
  const originalFetch = (globalThis as any).fetch;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:3000';
  });

  afterEach(() => {
    (globalThis as any).fetch = originalFetch;
    jest.clearAllMocks();
  });

  const validPantry = [
    { name: 'Arroz', quantity: 500, unit: 'g' as const, needsReview: false },
    { name: 'Pollo', quantity: 600, unit: 'g' as const, needsReview: false },
    { name: 'Huevo', quantity: 6, unit: 'unidad' as const, needsReview: false },
  ];

  const validRequest: MealPlanRequest = {
    pantry: validPantry,
    budget: 20000,
    servings: 2,
    maxMinutes: 45,
  };

  const createSampleRecipe = (index: number) => ({
    name: `Receta del día ${index}`,
    description: `Descripción nutritiva de la receta ${index}`,
    totalMinutes: 30,
    ingredients: [
      { name: 'Pollo', quantity: 200, unit: 'g' },
      { name: 'Arroz', quantity: 100, unit: 'g' },
    ],
    steps: ['Paso 1: Preparar ingredientes', 'Paso 2: Cocinar'],
    availableIngredients: [{ name: 'Pollo', quantity: 200, unit: 'g' }],
    missingIngredients: [{ name: 'Cebolla', quantity: 1, unit: 'unidad', estimatedCost: 1500 }],
    estimatedMissingCost: 1500,
    budgetRemaining: 18500,
    withinBudget: true,
    convenience: 90,
    reason: 'Excelente aprovechamiento del pollo',
  });

  const validBackendSuccessResponse = {
    success: true,
    data: {
      days: [
        { day: 1, recipe: createSampleRecipe(1) },
        { day: 2, recipe: createSampleRecipe(2) },
        { day: 3, recipe: createSampleRecipe(3) },
      ],
      totalEstimatedMissingCost: 4500,
      budgetRemaining: 15500,
      withinBudget: true,
    },
  };

  describe('1. Validación defensiva de precondiciones en cliente', () => {
    it('bloquea la llamada si la despensa está vacía con código EMPTY_PANTRY', async () => {
      await expect(
        generateMealPlan({ ...validRequest, pantry: [] })
      ).rejects.toMatchObject({
        code: 'EMPTY_PANTRY',
        isValidationError: true,
      });
    });

    it('bloquea la llamada si el presupuesto es negativo con INVALID_BUDGET', async () => {
      await expect(
        generateMealPlan({ ...validRequest, budget: -100 })
      ).rejects.toMatchObject({
        code: 'INVALID_BUDGET',
        isValidationError: true,
      });
    });

    it('acepta presupuesto 0 COP sin lanzar error de precondición', async () => {
      (globalThis as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => validBackendSuccessResponse,
      });

      const result = await generateMealPlan({ ...validRequest, budget: 0 });
      expect(result).toBeDefined();
      expect(result.days.length).toBe(3);
    });

    it('bloquea comensales menores a 1 o mayores a 12 con INVALID_SERVINGS', async () => {
      await expect(
        generateMealPlan({ ...validRequest, servings: 0 })
      ).rejects.toMatchObject({ code: 'INVALID_SERVINGS' });

      await expect(
        generateMealPlan({ ...validRequest, servings: 13 })
      ).rejects.toMatchObject({ code: 'INVALID_SERVINGS' });

      await expect(
        generateMealPlan({ ...validRequest, servings: 2.5 })
      ).rejects.toMatchObject({ code: 'INVALID_SERVINGS' });
    });

    it('acepta comensales entre 1 y 12', async () => {
      (globalThis as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => validBackendSuccessResponse,
      });

      const res1 = await generateMealPlan({ ...validRequest, servings: 1 });
      expect(res1.days.length).toBe(3);

      const res12 = await generateMealPlan({ ...validRequest, servings: 12 });
      expect(res12.days.length).toBe(3);
    });

    it('bloquea maxMinutes inválido (menor a 1 o mayor a 240) con INVALID_MAX_MINUTES', async () => {
      await expect(
        generateMealPlan({ ...validRequest, maxMinutes: 0 })
      ).rejects.toMatchObject({ code: 'INVALID_MAX_MINUTES' });

      await expect(
        generateMealPlan({ ...validRequest, maxMinutes: 250 })
      ).rejects.toMatchObject({ code: 'INVALID_MAX_MINUTES' });
    });

    it('acepta maxMinutes omitido/undefined sin fallar', async () => {
      (globalThis as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => validBackendSuccessResponse,
      });

      const { maxMinutes, ...requestWithoutMaxMinutes } = validRequest;
      const res = await generateMealPlan(requestWithoutMaxMinutes);
      expect(res.days.length).toBe(3);
    });
  });

  describe('2. Llamada HTTP y verificación de endpoint', () => {
    it('invoca el endpoint exacto POST /api/meal-plans/generate con headers y body correctos', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => validBackendSuccessResponse,
      });
      (globalThis as any).fetch = mockFetch;

      await generateMealPlan(validRequest);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];

      expect(url).toBe('http://localhost:3000/api/meal-plans/generate');
      expect(options.method).toBe('POST');
      expect(options.headers).toEqual({
        'Content-Type': 'application/json',
        Accept: 'application/json',
      });

      const parsedBody = JSON.parse(options.body);
      expect(parsedBody.pantry).toHaveLength(3);
      expect(parsedBody.budget).toBe(20000);
      expect(parsedBody.servings).toBe(2);
      expect(parsedBody.maxMinutes).toBe(45);
    });
  });

  describe('3. Validación estricta del contrato de 3 días', () => {
    it('retorna exitosamente el plan cuando contiene exactamente 3 días', async () => {
      (globalThis as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => validBackendSuccessResponse,
      });

      const response = await generateMealPlan(validRequest);

      expect(response.days).toHaveLength(3);
      expect(response.days[0].day).toBe(1);
      expect(response.days[1].day).toBe(2);
      expect(response.days[2].day).toBe(3);
      expect(response.totalEstimatedMissingCost).toBe(4500);
      expect(response.budgetRemaining).toBe(15500);
      expect(response.withinBudget).toBe(true);
    });

    it('rechaza con INVALID_RESPONSE_SHAPE si el backend devuelve menos de 3 días', async () => {
      const twoDaysResponse = {
        success: true,
        data: {
          days: [
            { day: 1, recipe: createSampleRecipe(1) },
            { day: 2, recipe: createSampleRecipe(2) },
          ],
          totalEstimatedMissingCost: 3000,
          budgetRemaining: 17000,
          withinBudget: true,
        },
      };

      (globalThis as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => twoDaysResponse,
      });

      await expect(generateMealPlan(validRequest)).rejects.toMatchObject({
        code: 'INVALID_RESPONSE_SHAPE',
      });
    });

    it('rechaza con INVALID_RESPONSE_SHAPE si los días no son correlativos 1, 2, 3', async () => {
      const invalidDaysResponse = {
        success: true,
        data: {
          days: [
            { day: 1, recipe: createSampleRecipe(1) },
            { day: 1, recipe: createSampleRecipe(2) },
            { day: 3, recipe: createSampleRecipe(3) },
          ],
          totalEstimatedMissingCost: 3000,
          budgetRemaining: 17000,
          withinBudget: true,
        },
      };

      (globalThis as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => invalidDaysResponse,
      });

      await expect(generateMealPlan(validRequest)).rejects.toMatchObject({
        code: 'INVALID_RESPONSE_SHAPE',
      });
    });

    it('rechaza si el totalEstimatedMissingCost es negativo', async () => {
      const negativeCostResponse = {
        success: true,
        data: {
          days: [
            { day: 1, recipe: createSampleRecipe(1) },
            { day: 2, recipe: createSampleRecipe(2) },
            { day: 3, recipe: createSampleRecipe(3) },
          ],
          totalEstimatedMissingCost: -500,
          budgetRemaining: 20500,
          withinBudget: true,
        },
      };

      (globalThis as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => negativeCostResponse,
      });

      await expect(generateMealPlan(validRequest)).rejects.toMatchObject({
        code: 'INVALID_RESPONSE_SHAPE',
      });
    });
  });

  describe('4. Manejo de errores HTTP y respuestas anómalas', () => {
    it('rechaza respuestas con JSON malformado lanzando MALFORMED_JSON', async () => {
      (globalThis as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        },
      });

      await expect(generateMealPlan(validRequest)).rejects.toMatchObject({
        code: 'MALFORMED_JSON',
      });
    });

    it('maneja errores de validación HTTP 400 del backend', async () => {
      (globalThis as any).fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Debes tener al menos un ingrediente en la despensa.',
            details: [{ field: 'pantry', message: 'Debes tener al menos un ingrediente' }],
          },
        }),
      });

      await expect(generateMealPlan(validRequest)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        status: 400,
        isValidationError: true,
      });
    });

    it('maneja error HTTP 429 de límite de tasa con isRateLimit: true', async () => {
      (globalThis as any).fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({
          success: false,
          error: {
            code: 'GEMINI_RATE_LIMIT',
            message: 'Cuota de Gemini excedida.',
          },
        }),
      });

      await expect(generateMealPlan(validRequest)).rejects.toMatchObject({
        code: 'GEMINI_RATE_LIMIT',
        status: 429,
        isRateLimit: true,
      });
    });

    it('maneja error HTTP 502 INSUFFICIENT_RECIPES_FOR_PLAN', async () => {
      (globalThis as any).fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({
          success: false,
          error: {
            code: 'INSUFFICIENT_RECIPES_FOR_PLAN',
            message: 'No se generaron suficientes recetas para construir un plan de tres días.',
          },
        }),
      });

      await expect(generateMealPlan(validRequest)).rejects.toMatchObject({
        code: 'INSUFFICIENT_RECIPES_FOR_PLAN',
        status: 502,
      });
    });

    it('maneja error HTTP 502 MEAL_PLAN_NOT_AVAILABLE', async () => {
      (globalThis as any).fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({
          success: false,
          error: {
            code: 'MEAL_PLAN_NOT_AVAILABLE',
            message: 'No existen suficientes combinaciones para crear el plan de comidas.',
          },
        }),
      });

      await expect(generateMealPlan(validRequest)).rejects.toMatchObject({
        code: 'MEAL_PLAN_NOT_AVAILABLE',
        status: 502,
      });
    });

    it('maneja error HTTP 503 GEMINI_UNAVAILABLE', async () => {
      (globalThis as any).fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({
          success: false,
          error: {
            code: 'GEMINI_UNAVAILABLE',
            message: 'Servicio de IA no disponible.',
          },
        }),
      });

      await expect(generateMealPlan(validRequest)).rejects.toMatchObject({
        code: 'GEMINI_UNAVAILABLE',
        status: 503,
      });
    });

    it('maneja error HTTP 504 GEMINI_TIMEOUT', async () => {
      (globalThis as any).fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 504,
        json: async () => ({
          success: false,
          error: {
            code: 'GEMINI_TIMEOUT',
            message: 'Tiempo de espera de IA agotado.',
          },
        }),
      });

      await expect(generateMealPlan(validRequest)).rejects.toMatchObject({
        code: 'GEMINI_TIMEOUT',
        status: 504,
      });
    });

    it('maneja errores de red no controlados con NETWORK_ERROR', async () => {
      (globalThis as any).fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(generateMealPlan(validRequest)).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
        isNetworkError: true,
      });
    });
  });

  describe('5. Cancelación y tiempo de espera', () => {
    it('cancela la petición cuando se activa una señal externa AbortSignal con REQUEST_ABORTED', async () => {
      const abortController = new AbortController();

      (globalThis as any).fetch = jest.fn().mockImplementation((_, opts) => {
        return new Promise((_, reject) => {
          opts.signal.addEventListener('abort', () => {
            const err = new Error('The user aborted a request.');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      const promise = generateMealPlan(validRequest, { signal: abortController.signal });
      abortController.abort();

      await expect(promise).rejects.toMatchObject({
        code: 'REQUEST_ABORTED',
      });
    });

    it('lanza REQUEST_ABORTED de inmediato si la señal ya estaba cancelada', async () => {
      const abortController = new AbortController();
      abortController.abort();

      await expect(
        generateMealPlan(validRequest, { signal: abortController.signal })
      ).rejects.toMatchObject({
        code: 'REQUEST_ABORTED',
      });
    });

    it('aborta por timeout si la petición supera el tiempo límite configurado', async () => {
      jest.useFakeTimers();

      (globalThis as any).fetch = jest.fn().mockImplementation((_, opts) => {
        return new Promise((_, reject) => {
          opts.signal.addEventListener('abort', () => {
            const err = new Error('The user aborted a request.');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      const promise = generateMealPlan(validRequest, { timeoutMs: 5000 });

      jest.advanceTimersByTime(5100);

      await expect(promise).rejects.toMatchObject({
        code: 'REQUEST_TIMEOUT',
        isTimeout: true,
      });

      jest.useRealTimers();
    });
  });
});
