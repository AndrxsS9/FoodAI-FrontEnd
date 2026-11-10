/**
 * FoodAI - Fase 28C-B3.1: propagación del idioma a las APIs existentes del backend.
 *
 * Verifica, únicamente con red simulada:
 * 1. Escáner: `?locale=es|en` en Android (UploadTask nativo) y en iOS/Web (fetch + FormData).
 * 2. Recetas y planes: el cuerpo JSON incluye el `locale` seleccionado.
 * 3. Sin idioma indicado: solicitudes idénticas a las previas (el backend usa español) y valores
 *    no soportados se normalizan a español.
 * 4. Pantry, presupuesto, comensales y maxMinutes no cambian; Bearer intacto; sin Content-Type
 *    multipart manual; timeout y cancelación sin cambios; una sola petición por operación.
 */
import { Platform } from 'react-native';
import {
  appendLocaleQuery,
  normalizeApiLocale,
  withNormalizedLocale,
} from '../src/services/api/apiConfig';
import { analyzeIngredientsImage, ScannerApiError } from '../src/services/api/scannerApi';
import { recommendRecipes, RecipeApiError } from '../src/services/api/recipeApi';
import { generateMealPlan, MealPlanApiError } from '../src/services/api/mealPlanApi';
import { supabase } from '../src/services/supabase/client';
import { SelectedImage } from '../src/types/scanner';
import { FrontendPantryItemInput, mapPantryToRecommendRequest } from '../src/types/recipe';
import { mapPantryToMealPlanRequest } from '../src/types/mealPlan';

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));

const mockNativeStart = jest.fn();
const mockNativeCancel = jest.fn();
const mockNativeRelease = jest.fn();

// Solo se simula el módulo nativo: File y UploadTask son las clases reales de expo-file-system.
jest.mock('../node_modules/expo-file-system/build/ExpoFileSystem', () => {
  class FileSystemFile {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    validatePath() {}
    get exists() {
      return true;
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
      this.rejectPending?.(
        Object.assign(new Error('Upload was cancelled'), { code: 'ERR_UPLOAD_CANCELLED' })
      );
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

const BASE_URL = 'https://foodai-backend.example.com';
const ANALYZE_URL = `${BASE_URL}/api/ingredients/analyze`;
const RECIPES_URL = `${BASE_URL}/api/recipes/recommend`;
const MEAL_PLAN_URL = `${BASE_URL}/api/meal-plans/generate`;
const ACCESS_TOKEN = 'jwt-fase-28cb31-locale';

const IMAGE: SelectedImage = {
  uri: 'file:///data/user/0/com.foodai.app/cache/ImageManipulator/locale.jpg',
  mimeType: 'image/jpeg',
  fileName: 'locale.jpg',
  width: 1600,
  height: 1200,
  fileSize: 512_000,
};

const SCANNER_SUCCESS = {
  success: true,
  data: { ingredients: [{ name: 'Tomate', quantity: 2, unit: 'unidad', needsReview: false }] },
};

const BACKEND_RECIPE = {
  name: 'Arroz con pollo',
  description: 'Plato sencillo',
  totalMinutes: 30,
  ingredients: [{ name: 'Pollo', quantity: 200, unit: 'g' }],
  steps: ['Cocinar', 'Servir'],
  availableIngredients: [{ name: 'Pollo', quantity: 200, unit: 'g' }],
  missingIngredients: [],
  estimatedMissingCost: 0,
  budgetRemaining: 20000,
  withinBudget: true,
  convenience: 90,
  reason: 'Usa tu despensa',
};

const RECIPES_SUCCESS = { success: true, data: { recipes: [BACKEND_RECIPE] } };

const MEAL_PLAN_SUCCESS = {
  success: true,
  data: {
    days: [1, 2, 3].map((day) => ({ day, recipe: { ...BACKEND_RECIPE, name: `Día ${day}` } })),
    totalEstimatedMissingCost: 0,
    budgetRemaining: 20000,
    withinBudget: true,
  },
};

const PANTRY_INPUT: FrontendPantryItemInput[] = [
  { name: 'Pollo', quantity: 500, unit: 'g' } as FrontendPantryItemInput,
  { name: 'Arroz', quantity: 1, unit: 'kg' } as FrontendPantryItemInput,
];

const BASE_REQUEST = {
  pantry: [{ name: 'Pollo', quantity: 500, unit: 'g' as const, needsReview: false }],
  budget: 20000,
  servings: 2,
  maxMinutes: 45,
};

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** fetch simulado que respeta la señal de cancelación y nunca responde por sí solo. */
function hangingFetch() {
  return jest.fn(
    (_url: string, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        });
      })
  );
}

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_PLATFORM = Platform.OS;
let fetchMock: jest.Mock;

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_BASE_URL = BASE_URL;
  jest.restoreAllMocks();
  mockNativeStart.mockReset();
  mockNativeCancel.mockReset();
  mockNativeRelease.mockReset();
  jest.spyOn(supabase.auth, 'getSession').mockImplementation(async () => ({
    data: {
      session: {
        access_token: ACCESS_TOKEN,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'usr-locale' },
      } as any,
    },
    error: null,
  }));
  jest.spyOn(console, 'info').mockImplementation(() => {});
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  (Platform as any).OS = ORIGINAL_PLATFORM;
  jest.restoreAllMocks();
});

describe('Utilidades de idioma para peticiones', () => {
  it('normaliza es/en, omite undefined/null y convierte valores no soportados a español', () => {
    expect(normalizeApiLocale('es')).toBe('es');
    expect(normalizeApiLocale('en')).toBe('en');
    expect(normalizeApiLocale(undefined)).toBeUndefined();
    expect(normalizeApiLocale(null)).toBeUndefined();
    expect(normalizeApiLocale('fr')).toBe('es');
    expect(normalizeApiLocale('EN')).toBe('es');
    expect(normalizeApiLocale(42)).toBe('es');
  });

  it('agrega el parámetro de consulta solo cuando hay idioma', () => {
    expect(appendLocaleQuery(ANALYZE_URL, 'en')).toBe(`${ANALYZE_URL}?locale=en`);
    expect(appendLocaleQuery(ANALYZE_URL, 'es')).toBe(`${ANALYZE_URL}?locale=es`);
    expect(appendLocaleQuery(ANALYZE_URL, undefined)).toBe(ANALYZE_URL);
    expect(appendLocaleQuery(`${ANALYZE_URL}?x=1`, 'en')).toBe(`${ANALYZE_URL}?x=1&locale=en`);
  });

  it('withNormalizedLocale conserva la misma solicitud cuando no hay idioma', () => {
    const request = { ...BASE_REQUEST };
    expect(withNormalizedLocale(request)).toBe(request);
    expect(withNormalizedLocale({ ...BASE_REQUEST, locale: undefined })).not.toHaveProperty('locale');
    expect(withNormalizedLocale({ ...BASE_REQUEST, locale: 'fr' as any }).locale).toBe('es');
  });
});

describe('Escáner: POST /api/ingredients/analyze con ?locale', () => {
  describe('Android (UploadTask nativo de expo-file-system)', () => {
    beforeEach(() => {
      (Platform as any).OS = 'android';
    });

    it.each(['es', 'en'] as const)(
      'envía ?locale=%s sin alterar el multipart, el Bearer ni el Content-Type',
      async (locale) => {
        mockNativeStart.mockResolvedValue({
          status: 200,
          body: JSON.stringify(SCANNER_SUCCESS),
          headers: {},
        });

        const result = await analyzeIngredientsImage(IMAGE, { locale });

        expect(result).toEqual(SCANNER_SUCCESS.data.ingredients);
        expect(mockNativeStart).toHaveBeenCalledTimes(1);
        expect(fetchMock).not.toHaveBeenCalled();

        const [url, file, options] = mockNativeStart.mock.calls[0];
        expect(url).toBe(`${ANALYZE_URL}?locale=${locale}`);
        expect(url).not.toContain(ACCESS_TOKEN);
        expect(file.uri).toBe(IMAGE.uri);
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
        expect(Object.keys(options.headers).map((h) => h.toLowerCase())).not.toContain(
          'content-type'
        );
        expect(mockNativeRelease).toHaveBeenCalledTimes(1);
      }
    );

    it('sin idioma conserva la URL previa (el backend responde en español)', async () => {
      mockNativeStart.mockResolvedValue({
        status: 200,
        body: JSON.stringify(SCANNER_SUCCESS),
        headers: {},
      });

      await analyzeIngredientsImage(IMAGE);

      expect(mockNativeStart.mock.calls[0][0]).toBe(ANALYZE_URL);
    });

    it('la cancelación externa sigue cancelando la subida nativa con idioma', async () => {
      mockNativeStart.mockImplementation(() => new Promise(() => {}));
      const controller = new AbortController();

      const pending = analyzeIngredientsImage(IMAGE, { locale: 'en', signal: controller.signal });
      await new Promise((resolve) => setTimeout(resolve, 0));
      controller.abort();

      await expect(pending).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
      expect(mockNativeStart).toHaveBeenCalledTimes(1);
      expect(mockNativeStart.mock.calls[0][0]).toBe(`${ANALYZE_URL}?locale=en`);
    });

    it('el timeout existente sigue aplicando con idioma', async () => {
      mockNativeStart.mockImplementation(() => new Promise(() => {}));

      const error = await analyzeIngredientsImage(IMAGE, { locale: 'es', timeoutMs: 20 }).catch(
        (e) => e
      );

      expect(error).toBeInstanceOf(ScannerApiError);
      expect(error.code).toBe('REQUEST_TIMEOUT');
      expect(error.isTimeout).toBe(true);
      expect(mockNativeStart).toHaveBeenCalledTimes(1);
    });
  });

  describe.each(['ios', 'web'])('%s (fetch + FormData)', (platform) => {
    // En Web la imagen es una URI blob: que createAnalyzeFormData lee con fetch antes de subirla.
    const image: SelectedImage =
      platform === 'web'
        ? { uri: 'blob:http://localhost:8081/locale', mimeType: 'image/jpeg', fileName: 'scan.jpg' }
        : IMAGE;
    const blobResponse = { blob: async () => new Blob(['img'], { type: 'image/jpeg' }) };
    const apiCalls = () => fetchMock.mock.calls.filter(([url]) => !String(url).startsWith('blob:'));

    const respondWith = (handler: (url: string, init: any) => Promise<unknown>) => {
      fetchMock.mockImplementation(async (url: string, init: any) =>
        String(url).startsWith('blob:') ? blobResponse : handler(url, init)
      );
    };

    beforeEach(() => {
      (Platform as any).OS = platform;
    });

    it.each(['es', 'en'] as const)(
      'envía ?locale=%s con FormData, Bearer y sin Content-Type manual',
      async (locale) => {
        respondWith(async () => jsonResponse(200, SCANNER_SUCCESS));

        const result = await analyzeIngredientsImage(image, { locale });

        expect(result).toHaveLength(1);
        expect(apiCalls()).toHaveLength(1);
        expect(mockNativeStart).not.toHaveBeenCalled();

        const [url, init] = apiCalls()[0];
        expect(url).toBe(`${ANALYZE_URL}?locale=${locale}`);
        expect(init.method).toBe('POST');
        expect(init.body).toBeInstanceOf(FormData);
        expect(init.headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
        expect(init.headers.Accept).toBe('application/json');
        expect(Object.keys(init.headers).map((h: string) => h.toLowerCase())).not.toContain(
          'content-type'
        );
      }
    );

    it('valores no soportados se envían como español', async () => {
      respondWith(async () => jsonResponse(200, SCANNER_SUCCESS));

      await analyzeIngredientsImage(image, { locale: 'fr' as any });

      expect(apiCalls()[0][0]).toBe(`${ANALYZE_URL}?locale=es`);
    });

    it('timeout y cancelación conservan su clasificación', async () => {
      const hanging = hangingFetch();
      respondWith((url, init) => hanging(url, init));

      await expect(
        analyzeIngredientsImage(image, { locale: 'en', timeoutMs: 20 })
      ).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT', isTimeout: true });

      const controller = new AbortController();
      const pending = analyzeIngredientsImage(image, { locale: 'en', signal: controller.signal });
      await new Promise((resolve) => setTimeout(resolve, 0));
      controller.abort();
      await expect(pending).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
      expect(apiCalls()).toHaveLength(2);
    });
  });
});

describe('Recetas: POST /api/recipes/recommend con locale en el JSON', () => {
  it.each(['es', 'en'] as const)(
    'incluye locale=%s y conserva pantry, budget, servings y maxMinutes',
    async (locale) => {
      fetchMock.mockResolvedValue(jsonResponse(200, RECIPES_SUCCESS));

      const recipes = await recommendRecipes({ ...BASE_REQUEST, locale });

      expect(recipes).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(RECIPES_URL);
      expect(url).not.toContain('?');
      expect(init.headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(init.body)).toEqual({ ...BASE_REQUEST, locale });
    }
  );

  it('sin idioma el cuerpo es idéntico al contrato previo', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, RECIPES_SUCCESS));

    await recommendRecipes(BASE_REQUEST);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(BASE_REQUEST);
  });

  it('un idioma no soportado se envía como español', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, RECIPES_SUCCESS));

    await recommendRecipes({ ...BASE_REQUEST, locale: 'pt' as any });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).locale).toBe('es');
  });

  it('la validación de despensa vacía se mantiene y no llama a la red', async () => {
    await expect(
      recommendRecipes({ ...BASE_REQUEST, pantry: [], locale: 'en' })
    ).rejects.toMatchObject({ code: 'EMPTY_PANTRY' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('timeout y cancelación siguen funcionando', async () => {
    globalThis.fetch = hangingFetch() as unknown as typeof fetch;
    const timeoutError = await recommendRecipes(
      { ...BASE_REQUEST, locale: 'en' },
      { timeoutMs: 20 }
    ).catch((e) => e);
    expect(timeoutError).toBeInstanceOf(RecipeApiError);
    expect(timeoutError.code).toBe('REQUEST_TIMEOUT');

    const controller = new AbortController();
    const pending = recommendRecipes({ ...BASE_REQUEST, locale: 'en' }, { signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
  });

  it('el mapper agrega el idioma sin alterar los demás valores', () => {
    const withoutLocale = mapPantryToRecommendRequest(PANTRY_INPUT, 25000.4, 4, 60);
    const withLocale = mapPantryToRecommendRequest(PANTRY_INPUT, 25000.4, 4, 60, 'en');

    expect(withoutLocale).not.toHaveProperty('locale');
    expect(withLocale).toEqual({ ...withoutLocale, locale: 'en' });
    expect(withLocale.budget).toBe(25000);
    expect(withLocale.servings).toBe(4);
    expect(withLocale.maxMinutes).toBe(60);
    expect(mapPantryToRecommendRequest(PANTRY_INPUT, 20000, 2, undefined, 'es')).toEqual({
      pantry: withoutLocale.pantry,
      budget: 20000,
      servings: 2,
      locale: 'es',
    });
  });
});

describe('Planes de comida: POST /api/meal-plans/generate con locale en el JSON', () => {
  it.each(['es', 'en'] as const)(
    'incluye locale=%s y conserva pantry, budget, servings y maxMinutes',
    async (locale) => {
      fetchMock.mockResolvedValue(jsonResponse(200, MEAL_PLAN_SUCCESS));

      const plan = await generateMealPlan({ ...BASE_REQUEST, locale });

      expect(plan.days).toHaveLength(3);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(MEAL_PLAN_URL);
      expect(url).not.toContain('?');
      expect(init.headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(init.body)).toEqual({ ...BASE_REQUEST, locale });
    }
  );

  it('sin idioma el cuerpo es idéntico al contrato previo', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, MEAL_PLAN_SUCCESS));

    await generateMealPlan(BASE_REQUEST);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(BASE_REQUEST);
  });

  it('timeout y cancelación siguen funcionando', async () => {
    globalThis.fetch = hangingFetch() as unknown as typeof fetch;
    const timeoutError = await generateMealPlan(
      { ...BASE_REQUEST, locale: 'en' },
      { timeoutMs: 20 }
    ).catch((e) => e);
    expect(timeoutError).toBeInstanceOf(MealPlanApiError);
    expect(timeoutError.code).toBe('REQUEST_TIMEOUT');

    const controller = new AbortController();
    const pending = generateMealPlan({ ...BASE_REQUEST, locale: 'en' }, { signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
  });

  it('el mapper agrega el idioma sin alterar los demás valores', () => {
    const withoutLocale = mapPantryToMealPlanRequest(PANTRY_INPUT, 30000, 3, 90);
    const withLocale = mapPantryToMealPlanRequest(PANTRY_INPUT, 30000, 3, 90, 'en');

    expect(withoutLocale).not.toHaveProperty('locale');
    expect(withLocale).toEqual({ ...withoutLocale, locale: 'en' });
    expect(mapPantryToMealPlanRequest(PANTRY_INPUT, 30000, 3, 90, 'xx' as any).locale).toBe('es');
  });
});
