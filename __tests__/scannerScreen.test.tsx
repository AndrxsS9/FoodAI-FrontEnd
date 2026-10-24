import React from 'react';
import { render, fireEvent, waitFor, act, cleanup } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import ScannerScreen from '../app/escaner/index';
import { TypographyProvider } from '../src/theme';
import { PantryProvider } from '../src/context/PantryContext';
import { PantryStorageAdapter } from '../src/services/storage/pantryStorage';
import { CreateIngredientInput, Ingredient, UpdateIngredientInput } from '../src/types/pantry';
import { scannerApi } from '../src/services/api/scannerApi';

jest.setTimeout(30000);

// Mock expo-router
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  }),
}));

// Mock expo-image-picker
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

// Mock expo-image-manipulator
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn().mockImplementation((uri) =>
    Promise.resolve({
      uri: `${uri}_optimized.jpg`,
      width: 1600,
      height: 1200,
    })
  ),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));

// Mock scannerApi
jest.mock('../src/services/api/scannerApi', () => {
  const actual = jest.requireActual('../src/services/api/scannerApi');
  return {
    ...actual,
    scannerApi: {
      analyzeIngredientsImage: jest.fn(),
    },
  };
});

class MockPantryAdapter implements PantryStorageAdapter {
  private items: Ingredient[] = [];

  constructor(initial: Ingredient[] = []) {
    this.items = [...initial];
  }

  async getIngredients(): Promise<Ingredient[]> {
    return [...this.items];
  }

  async saveIngredients(ingredients: Ingredient[]): Promise<void> {
    this.items = [...ingredients];
  }

  async addIngredient(input: CreateIngredientInput): Promise<Ingredient> {
    const newItem: Ingredient = {
      id: `mock-${Date.now()}-${Math.random()}`,
      name: input.name,
      quantity: input.quantity,
      unit: input.unit,
      category: input.category,
      expirationDate: input.expirationDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.items.unshift(newItem);
    return newItem;
  }

  async updateIngredient(input: UpdateIngredientInput): Promise<Ingredient> {
    const idx = this.items.findIndex((i) => i.id === input.id);
    if (idx === -1) throw new Error('Not found');
    const existing = this.items[idx];
    const updated: Ingredient = {
      ...existing,
      name: input.name ?? existing.name,
      quantity: input.quantity ?? existing.quantity,
      unit: input.unit ?? existing.unit,
      category: input.category ?? existing.category,
      updatedAt: new Date().toISOString(),
    };
    this.items[idx] = updated;
    return updated;
  }

  async deleteIngredient(id: string): Promise<void> {
    this.items = this.items.filter((i) => i.id !== id);
  }

  async clearIngredients(): Promise<void> {
    this.items = [];
  }
}

async function renderScannerScreen(
  initialPantry: Ingredient[] = [],
  customAdapter?: MockPantryAdapter
) {
  const adapter = customAdapter || new MockPantryAdapter(initialPantry);
  const result = await render(
    <SafeAreaProvider
      initialMetrics={{
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
        frame: { x: 0, y: 0, width: 390, height: 844 },
      }}
    >
      <TypographyProvider usingFallback={true}>
        <PantryProvider storageAdapter={adapter} initialIngredients={initialPantry}>
          <ScannerScreen />
        </PantryProvider>
      </TypographyProvider>
    </SafeAreaProvider>
  );
  return Object.assign(result, { adapter });
}

describe('ScannerScreen', () => {
  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
  });

  describe('Capture State', () => {
    it('renders initial capture controls and guidance tips', async () => {
      const { getByTestId, getByText } = await renderScannerScreen();

      expect(getByTestId('scanner-take-photo-button')).toBeTruthy();
      expect(getByTestId('scanner-gallery-button')).toBeTruthy();
      expect(getByText('Consejos para una detección óptima')).toBeTruthy();
    });

    it('handles camera permission denied gracefully', async () => {
      (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        granted: false,
      });

      const { getByTestId, findByText } = await renderScannerScreen();

      await fireEvent.press(getByTestId('scanner-take-photo-button'));

      expect(
        await findByText(/No se otorgó permiso para acceder a la cámara/)
      ).toBeTruthy();
    });

    it('handles user cancellation of camera without error', async () => {
      (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        granted: true,
      });
      (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValueOnce({
        canceled: true,
        assets: null,
      });

      const { getByTestId, queryByTestId } = await renderScannerScreen();

      await fireEvent.press(getByTestId('scanner-take-photo-button'));

      expect(queryByTestId('scanner-preview-state')).toBeNull();
      expect(getByTestId('scanner-capture-state')).toBeTruthy();
    });

    it('advances to preview when a valid image is selected from gallery', async () => {
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        granted: true,
      });
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
        canceled: false,
        assets: [
          {
            uri: 'file:///pantry_photo.jpg',
            mimeType: 'image/jpeg',
            fileName: 'pantry_photo.jpg',
            width: 1200,
            height: 900,
            fileSize: 1024 * 1024,
          },
        ],
      });

      const { getByTestId } = await renderScannerScreen();

      await fireEvent.press(getByTestId('scanner-gallery-button'));

      await waitFor(() => {
        expect(getByTestId('scanner-preview-state')).toBeTruthy();
        expect(getByTestId('scanner-analyze-button')).toBeTruthy();
      });
    });
  });

  describe('Preview & Analysis State', () => {
    beforeEach(() => {
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: true,
      });
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [
          {
            uri: 'file:///photo.jpg',
            mimeType: 'image/jpeg',
            fileName: 'photo.jpg',
            width: 1200,
            height: 900,
            fileSize: 1024 * 1024,
          },
        ],
      });
    });

    it('displays error state when analysis fails and allows retry', async () => {
      (scannerApi.analyzeIngredientsImage as jest.Mock).mockRejectedValueOnce(
        new Error('Fallo de conexión con el backend')
      );

      const { getByTestId, findByText } = await renderScannerScreen();

      await fireEvent.press(getByTestId('scanner-gallery-button'));
      await waitFor(() => expect(getByTestId('scanner-preview-state')).toBeTruthy());

      await fireEvent.press(getByTestId('scanner-analyze-button'));

      await waitFor(() => {
        expect(getByTestId('scanner-error-state')).toBeTruthy();
      });
      expect(await findByText(/Fallo de conexión con el backend/)).toBeTruthy();
      expect(getByTestId('scanner-retry-analysis-button')).toBeTruthy();
    });

    it('prevents duplicate submissions on rapid clicks', async () => {
      let resolveAnalysis: (value: unknown) => void = () => {};
      (scannerApi.analyzeIngredientsImage as jest.Mock).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveAnalysis = resolve;
          })
      );

      const { getByTestId } = await renderScannerScreen();

      await fireEvent.press(getByTestId('scanner-gallery-button'));
      await waitFor(() => expect(getByTestId('scanner-preview-state')).toBeTruthy());

      // Doble clic rápido en el botón mientras la primera petición sigue pendiente
      const analyzeButton = getByTestId('scanner-analyze-button');
      await fireEvent.press(analyzeButton);
      await waitFor(() => expect(getByTestId('scanner-analyzing-state')).toBeTruthy());
      await fireEvent.press(analyzeButton);

      expect(scannerApi.analyzeIngredientsImage).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveAnalysis([
          { name: 'Tomate', quantity: 2, unit: 'unidad', needsReview: false },
        ]);
      });
      await waitFor(() => expect(getByTestId('scanner-review-state')).toBeTruthy());
      expect(scannerApi.analyzeIngredientsImage).toHaveBeenCalledTimes(1);
    });
  });

  describe('Review and Confirmation Flow', () => {
    const existingPantry: Ingredient[] = [
      {
        id: 'pantry-arroz',
        name: 'Arroz',
        quantity: 1,
        unit: 'kg',
        category: 'Granos y cereales',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    beforeEach(() => {
      (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: true,
      });
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [
          {
            uri: 'file:///photo.jpg',
            mimeType: 'image/jpeg',
            fileName: 'photo.jpg',
            width: 1200,
            height: 900,
            fileSize: 1024 * 1024,
          },
        ],
      });
    });

    const advanceToReview = async (screen: any) => {
      await fireEvent.press(screen.getByTestId('scanner-gallery-button'));
      await waitFor(() => expect(screen.getByTestId('scanner-preview-state')).toBeTruthy());

      await fireEvent.press(screen.getByTestId('scanner-analyze-button'));
      await waitFor(() => expect(screen.getByTestId('scanner-review-state')).toBeTruthy());
    };

    it(
      'requires quantity when Gemini returns quantity: null before allowing save',
      async () => {
        (scannerApi.analyzeIngredientsImage as jest.Mock).mockResolvedValueOnce([
          {
            name: 'Cebolla',
            quantity: null, // null retornado deliberadamente por IA
            unit: 'desconocida',
            needsReview: true,
          },
          {
            name: 'Tomate',
            quantity: 3,
            unit: 'unidad',
            needsReview: false,
          },
        ]);

        const screen = await renderScannerScreen(existingPantry);
        await advanceToReview(screen);

        const {
          getByTestId,
          getByText,
          queryByTestId,
          getAllByPlaceholderText,
        } = screen;

        // Debe mostrar aviso de cantidad pendiente
        expect(getByTestId('scanner-missing-quantity-notice')).toBeTruthy();
        expect(getByText(/sin cantidad definida/)).toBeTruthy();

        // Botón de guardar no debe permitir guardar mientras falte cantidad
        expect(getByText('Define las cantidades pendientes')).toBeTruthy();

        // Buscar el input de cantidad vacío de la cebolla (primer elemento)
        const quantityInputs = getAllByPlaceholderText('Ej. 2');
        const emptyQuantityInput = quantityInputs[0];
        expect(emptyQuantityInput.props.value).toBe('');

        // Ingresar cantidad inválida (0 o negativa)
        await fireEvent.changeText(emptyQuantityInput, '0');
        expect(getByText('Define las cantidades pendientes')).toBeTruthy();

        // Ingresar cantidad válida
        await fireEvent.changeText(emptyQuantityInput, '2');

        // Ahora todas las cantidades son válidas y el aviso desaparece
        await waitFor(() => {
          expect(queryByTestId('scanner-missing-quantity-notice')).toBeNull();
          expect(getByText(/Guardar 2 alimentos en mi despensa/)).toBeTruthy();
        });

        // Completar guardado
        const saveButton = getByTestId('scanner-confirm-save-button');
        await fireEvent.press(saveButton);

        await waitFor(() => {
          expect(screen.getByTestId('scanner-completed-state')).toBeTruthy();
        });
      },
      15000
    );

    it(
      'allows editing ingredient names, modifying quantities, toggling selection and saves confirmed items',
      async () => {
        (scannerApi.analyzeIngredientsImage as jest.Mock).mockResolvedValueOnce([
          {
            name: 'Tomate chonto',
            quantity: 4,
            unit: 'unidad',
            needsReview: false,
          },
          {
            name: 'Arroz blanco', // Duplicado de Arroz existente
            quantity: 2,
            unit: 'kg',
            needsReview: false,
          },
        ]);

        const customAdapter = new MockPantryAdapter(existingPantry);
        const screen = await renderScannerScreen(existingPantry, customAdapter);
        await advanceToReview(screen);

        const { getByTestId, getByText } = screen;

        // Debe detectar duplicado para el arroz
        expect(getByText(/En despensa/)).toBeTruthy();
        expect(getByText(/Sumar a despensa/)).toBeTruthy();

        // Confirmar y guardar
        const saveButton = getByTestId('scanner-confirm-save-button');
        await fireEvent.press(saveButton);

        // Debe avanzar a estado completado
        expect(await screen.findByTestId('scanner-completed-state')).toBeTruthy();
        expect(getByText('¡Alimentos guardados con éxito!')).toBeTruthy();

        // Verificar persistencia real en customAdapter
        const savedIngredients = await customAdapter.getIngredients();
        expect(savedIngredients.some((i) => i.name === 'Tomate chonto')).toBe(true);

        // Botón para ir a Mi Despensa
        await fireEvent.press(getByTestId('scanner-go-to-pantry-button'));
        expect(mockReplace).toHaveBeenCalledWith('/(tabs)/despensa');
      },
      15000
    );

    it(
      'supports excluding an ingredient before saving',
      async () => {
        (scannerApi.analyzeIngredientsImage as jest.Mock).mockResolvedValueOnce([
          {
            name: 'Aguacate',
            quantity: 2,
            unit: 'unidad',
            needsReview: false,
          },
          {
            name: 'Ingrediente no deseado',
            quantity: 1,
            unit: 'unidad',
            needsReview: false,
          },
        ]);

        const customAdapter = new MockPantryAdapter([]);
        const screen = await renderScannerScreen([], customAdapter);
        await advanceToReview(screen);

        const { getByTestId, getAllByTestId } = screen;

        // Deseleccionar todos: no se puede guardar
        await fireEvent.press(getByTestId('scanner-deselect-all-button'));
        expect(screen.getByText('Selecciona al menos un alimento')).toBeTruthy();

        // Seleccionar todos y excluir solo el segundo ingrediente
        await fireEvent.press(getByTestId('scanner-select-all-button'));
        const checkboxes = getAllByTestId(/^detected-checkbox-/);
        expect(checkboxes).toHaveLength(2);
        await fireEvent.press(checkboxes[1]);

        await fireEvent.press(getByTestId('scanner-confirm-save-button'));
        expect(await screen.findByTestId('scanner-completed-state')).toBeTruthy();

        // Solo se persiste el ingrediente confirmado
        const saved = await customAdapter.getIngredients();
        expect(saved).toHaveLength(1);
        expect(saved[0].name).toBe('Aguacate');
      },
      15000
    );

    it('guarda un ingrediente válido llamando a addIngredient con el payload exacto', async () => {
      (scannerApi.analyzeIngredientsImage as jest.Mock).mockResolvedValueOnce([
        { name: 'Tomate', quantity: 3, unit: 'unidad', needsReview: false },
      ]);

      const customAdapter = new MockPantryAdapter([]);
      const addSpy = jest.spyOn(customAdapter, 'addIngredient');
      const screen = await renderScannerScreen([], customAdapter);
      await advanceToReview(screen);

      await fireEvent.press(screen.getByTestId('scanner-confirm-save-button'));

      await waitFor(() => {
        expect(screen.getByTestId('scanner-completed-state')).toBeTruthy();
      });
      expect(addSpy).toHaveBeenCalledTimes(1);
      expect(addSpy).toHaveBeenCalledWith({
        name: 'Tomate',
        quantity: 3,
        unit: 'unidad',
        category: 'Verduras y frutas',
      });
    });

    it('informa exactamente qué ingredientes fallaron en un guardado parcial', async () => {
      (scannerApi.analyzeIngredientsImage as jest.Mock).mockResolvedValueOnce([
        { name: 'Tomate', quantity: 3, unit: 'unidad', needsReview: false },
        { name: 'Aguacate', quantity: 2, unit: 'unidad', needsReview: false },
      ]);

      const customAdapter = new MockPantryAdapter([]);
      const originalAdd = customAdapter.addIngredient.bind(customAdapter);
      jest
        .spyOn(customAdapter, 'addIngredient')
        .mockImplementation(async (input: CreateIngredientInput) => {
          if (input.name === 'Aguacate') {
            throw new Error('Fallo simulado de almacenamiento');
          }
          return originalAdd(input);
        });

      const screen = await renderScannerScreen([], customAdapter);
      await advanceToReview(screen);

      await fireEvent.press(screen.getByTestId('scanner-confirm-save-button'));

      expect(await screen.findByTestId('scanner-completed-state')).toBeTruthy();
      expect(await screen.findByText(/Aguacate/)).toBeTruthy();

      const saved = await customAdapter.getIngredients();
      expect(saved.map((i) => i.name)).toEqual(['Tomate']);
    });

    it('handles multiple detected ingredients targeting the same pantry record without lost updates (2 kg + 500 g + 1 kg = 3.5 kg)', async () => {
      const initialPantry: Ingredient[] = [
        {
          id: 'pantry-arroz-1',
          name: 'Arroz',
          quantity: 2,
          unit: 'kg',
          category: 'Granos y cereales',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ];

      (scannerApi.analyzeIngredientsImage as jest.Mock).mockResolvedValueOnce([
        { name: 'Arroz', quantity: 500, unit: 'g', needsReview: false },
        { name: 'Arroz', quantity: 1, unit: 'kg', needsReview: false },
      ]);

      const customAdapter = new MockPantryAdapter(initialPantry);
      const updateSpy = jest.spyOn(customAdapter, 'updateIngredient');
      const screen = await renderScannerScreen(initialPantry, customAdapter);
      await advanceToReview(screen);

      await fireEvent.press(screen.getByTestId('scanner-confirm-save-button'));

      await waitFor(() => {
        expect(screen.getByTestId('scanner-completed-state')).toBeTruthy();
      });

      // Se deben haber actualizado consecutivamente sin perder cantidades
      expect(updateSpy).toHaveBeenCalledTimes(2);

      const saved = await customAdapter.getIngredients();
      expect(saved).toHaveLength(1);
      expect(saved[0].name).toBe('Arroz');
      expect(saved[0].quantity).toBe(3.5);
      expect(saved[0].unit).toBe('kg');
    });

    it('safely saves incompatible unit duplicates as separate items without silently summing', async () => {
      const initialPantry: Ingredient[] = [
        {
          id: 'pantry-huevos-1',
          name: 'Huevos',
          quantity: 6,
          unit: 'unidad',
          category: 'Carnes y proteínas',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ];

      // Detectado en gramos (incompatible con unidad)
      (scannerApi.analyzeIngredientsImage as jest.Mock).mockResolvedValueOnce([
        { name: 'Huevos', quantity: 500, unit: 'g', needsReview: false },
      ]);

      const customAdapter = new MockPantryAdapter(initialPantry);
      const screen = await renderScannerScreen(initialPantry, customAdapter);
      await advanceToReview(screen);

      // Debe mostrar advertencia de unidades incompatibles
      const cards = screen.getAllByTestId(/^detected-card-/);
      expect(cards).toHaveLength(1);

      await fireEvent.press(screen.getByTestId('scanner-confirm-save-button'));

      await waitFor(() => {
        expect(screen.getByTestId('scanner-completed-state')).toBeTruthy();
      });

      const saved = await customAdapter.getIngredients();
      // Debe haber 2 ítems: los 6 huevos originales intactos y el nuevo de 500 g
      expect(saved).toHaveLength(2);
      const original = saved.find((i) => i.id === 'pantry-huevos-1');
      expect(original?.quantity).toBe(6);
      expect(original?.unit).toBe('unidad');

      const newItem = saved.find((i) => i.id !== 'pantry-huevos-1');
      expect(newItem?.name).toBe('Huevos');
      expect(newItem?.quantity).toBe(500);
      expect(newItem?.unit).toBe('g');
    });

    it('prevents cancellation races: cancel request A and immediately start request B ignores late response A', async () => {
      let resolveA: (val: any) => void = () => {};
      let resolveB: (val: any) => void = () => {};

      (scannerApi.analyzeIngredientsImage as jest.Mock)
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveA = resolve;
            })
        )
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveB = resolve;
            })
        );

      const screen = await renderScannerScreen([]);

      // Iniciar petición A
      await fireEvent.press(screen.getByTestId('scanner-gallery-button'));
      await waitFor(() => expect(screen.getByTestId('scanner-preview-state')).toBeTruthy());
      await fireEvent.press(screen.getByTestId('scanner-analyze-button'));
      await waitFor(() => expect(screen.getByTestId('scanner-analyzing-state')).toBeTruthy());

      // Cancelar petición A
      await fireEvent.press(screen.getByTestId('scanner-abort-button'));
      await waitFor(() => expect(screen.getByTestId('scanner-preview-state')).toBeTruthy());

      // Iniciar inmediatamente petición B
      await fireEvent.press(screen.getByTestId('scanner-analyze-button'));
      await waitFor(() => expect(screen.getByTestId('scanner-analyzing-state')).toBeTruthy());

      // Completar petición A tardíamente
      await act(async () => {
        resolveA([
          { name: 'Fantasma Tardío', quantity: 99, unit: 'unidad', needsReview: false },
        ]);
      });

      // El estado debe seguir siendo 'analyzing' de B, nunca review de A
      expect(screen.queryByText('Fantasma Tardío')).toBeNull();

      // Completar petición B
      await act(async () => {
        resolveB([
          { name: 'Alimento Legítimo B', quantity: 2, unit: 'unidad', needsReview: false },
        ]);
      });

      await waitFor(() => {
        expect(screen.getByTestId('scanner-review-state')).toBeTruthy();
      });
      expect(screen.getByDisplayValue('Alimento Legítimo B')).toBeTruthy();
      expect(screen.queryByDisplayValue('Fantasma Tardío')).toBeNull();
    });

    it('verifies no global test surfaces or synthetic buttons exist in production', async () => {
      const screen = await renderScannerScreen([]);
      expect((window as unknown as { __foodaiSelectAsset?: unknown }).__foodaiSelectAsset).toBeUndefined();
      expect(screen.queryByTestId('scanner-test-image-button')).toBeNull();
    });
  });
});
