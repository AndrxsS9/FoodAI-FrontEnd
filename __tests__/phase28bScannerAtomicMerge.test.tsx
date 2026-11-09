/**
 * Fase 28B — Integración renderizada del escáner (D4): la suma sobre un alimento existente se
 * calcula contra el estado persistido más reciente, no contra la instantánea de React tomada al
 * revisar. Se conservan la conversión g/kg y ml/l, el respaldo como ítem separado ante unidades
 * incompatibles y la acumulación de varias detecciones del mismo alimento.
 */
import React from 'react';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import ScannerScreen from '../app/escaner/index';
import { TypographyProvider } from '../src/theme';
import { PantryProvider } from '../src/context/PantryContext';
import { PantryStorageAdapter } from '../src/services/storage/pantryStorage';
import { CreateIngredientInput, Ingredient, UpdateIngredientInput } from '../src/types/pantry';
import { scannerApi } from '../src/services/api/scannerApi';

jest.setTimeout(30000);

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn().mockImplementation((uri) =>
    Promise.resolve({ uri: `${uri}_optimized.jpg`, width: 1600, height: 1200 })
  ),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));

jest.mock('../src/services/api/scannerApi', () => {
  const actual = jest.requireActual('../src/services/api/scannerApi');
  return { ...actual, scannerApi: { analyzeIngredientsImage: jest.fn() } };
});

/** Adaptador en memoria; `items` es accesible para simular escritores concurrentes. */
class MemoryPantryAdapter implements PantryStorageAdapter {
  items: Ingredient[];

  constructor(initial: Ingredient[]) {
    this.items = initial.map((i) => ({ ...i }));
  }

  async getIngredients(): Promise<Ingredient[]> {
    return this.items.map((i) => ({ ...i }));
  }

  async saveIngredients(ingredients: Ingredient[]): Promise<void> {
    this.items = ingredients.map((i) => ({ ...i }));
  }

  async addIngredient(input: CreateIngredientInput): Promise<Ingredient> {
    const created: Ingredient = {
      id: `mem-${this.items.length + 1}-${Math.random().toString(36).slice(2, 7)}`,
      name: input.name,
      quantity: input.quantity,
      unit: input.unit,
      category: input.category,
      expirationDate: input.expirationDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.items.unshift(created);
    return { ...created };
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
    return { ...updated };
  }

  async deleteIngredient(id: string): Promise<void> {
    this.items = this.items.filter((i) => i.id !== id);
  }

  async clearIngredients(): Promise<void> {
    this.items = [];
  }
}

const arroz1kg: Ingredient = {
  id: 'pantry-arroz',
  name: 'Arroz',
  quantity: 1,
  unit: 'kg',
  category: 'Granos y cereales',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

async function renderScanner(adapter: MemoryPantryAdapter) {
  const initial = adapter.items.map((i) => ({ ...i }));
  return render(
    <SafeAreaProvider
      initialMetrics={{
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
        frame: { x: 0, y: 0, width: 390, height: 844 },
      }}
    >
      <TypographyProvider usingFallback={true}>
        <PantryProvider storageAdapter={adapter} initialIngredients={initial}>
          <ScannerScreen />
        </PantryProvider>
      </TypographyProvider>
    </SafeAreaProvider>
  );
}

async function advanceToReview(screen: any) {
  await fireEvent.press(screen.getByTestId('scanner-gallery-button'));
  await waitFor(() => expect(screen.getByTestId('scanner-preview-state')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('scanner-analyze-button'));
  await waitFor(() => expect(screen.getByTestId('scanner-review-state')).toBeTruthy());
}

async function saveAndWait(screen: any) {
  await fireEvent.press(screen.getByTestId('scanner-confirm-save-button'));
  await waitFor(() => expect(screen.getByTestId('scanner-completed-state')).toBeTruthy());
}

describe('Escáner — fusión atómica de cantidades (Fase 28B · D4)', () => {
  beforeEach(() => {
    (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
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

  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
  });

  it('1 kg + incremento concurrente de 1 kg + 500 g escaneados = 2,5 kg persistidos (no 1,5 kg)', async () => {
    (scannerApi.analyzeIngredientsImage as jest.Mock).mockResolvedValueOnce([
      { name: 'Arroz', quantity: 500, unit: 'g', needsReview: false },
    ]);
    const adapter = new MemoryPantryAdapter([arroz1kg]);
    const screen = await renderScanner(adapter);
    await advanceToReview(screen);

    // Mientras el usuario revisa, otro flujo suma 1 kg directamente en el almacenamiento
    adapter.items[0] = { ...adapter.items[0], quantity: 2 };

    await saveAndWait(screen);

    expect(adapter.items).toHaveLength(1);
    expect(adapter.items[0].quantity).toBe(2.5);
    expect(adapter.items[0].unit).toBe('kg');
    expect(adapter.items[0].name).toBe('Arroz');
    expect(adapter.items[0].category).toBe('Granos y cereales');
  });

  it('acumula varias detecciones del mismo alimento sobre el valor persistido más reciente', async () => {
    (scannerApi.analyzeIngredientsImage as jest.Mock).mockResolvedValueOnce([
      { name: 'Arroz', quantity: 500, unit: 'g', needsReview: false },
      { name: 'Arroz', quantity: 1, unit: 'kg', needsReview: false },
    ]);
    const adapter = new MemoryPantryAdapter([arroz1kg]);
    const screen = await renderScanner(adapter);
    await advanceToReview(screen);

    adapter.items[0] = { ...adapter.items[0], quantity: 2 };
    await saveAndWait(screen);

    expect(adapter.items).toHaveLength(1);
    expect(adapter.items[0].quantity).toBe(3.5);
    expect(adapter.items[0].unit).toBe('kg');
  });

  it('si la unidad persistida cambió a una incompatible, guarda un ítem separado y no suma', async () => {
    (scannerApi.analyzeIngredientsImage as jest.Mock).mockResolvedValueOnce([
      { name: 'Arroz', quantity: 500, unit: 'g', needsReview: false },
    ]);
    const adapter = new MemoryPantryAdapter([arroz1kg]);
    const screen = await renderScanner(adapter);
    await advanceToReview(screen);

    adapter.items[0] = { ...adapter.items[0], quantity: 3, unit: 'unidad' };
    await saveAndWait(screen);

    expect(adapter.items).toHaveLength(2);
    const original = adapter.items.find((i) => i.id === 'pantry-arroz');
    expect(original?.quantity).toBe(3);
    expect(original?.unit).toBe('unidad');
    const added = adapter.items.find((i) => i.id !== 'pantry-arroz');
    expect(added?.name).toBe('Arroz');
    expect(added?.quantity).toBe(500);
    expect(added?.unit).toBe('g');
    expect(added?.category).toBe('Granos y cereales');
  });

  it('si el registro fue eliminado antes de guardar, conserva lo escaneado como alimento nuevo', async () => {
    (scannerApi.analyzeIngredientsImage as jest.Mock).mockResolvedValueOnce([
      { name: 'Arroz', quantity: 500, unit: 'g', needsReview: false },
    ]);
    const adapter = new MemoryPantryAdapter([arroz1kg]);
    const screen = await renderScanner(adapter);
    await advanceToReview(screen);

    adapter.items = [];
    await saveAndWait(screen);

    expect(adapter.items).toHaveLength(1);
    expect(adapter.items[0].name).toBe('Arroz');
    expect(adapter.items[0].quantity).toBe(500);
    expect(adapter.items[0].unit).toBe('g');
    expect(screen.queryByText(/no se pudieron guardar/)).toBeNull();
  });
});
