
import React from 'react';
import { render, fireEvent, waitFor, cleanup, act } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import DespensaScreen from '../app/(tabs)/despensa';
import HomeScreen from '../app/(tabs)/index';
import { TypographyProvider } from '../src/theme';
import { PantryProvider } from '../src/context/PantryContext';
import { PantryStorageAdapter } from '../src/services/storage/pantryStorage';
import { CreateIngredientInput, Ingredient, UpdateIngredientInput } from '../src/types/pantry';

// Mock expo-router
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

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
    const resolvedExp =
      input.expirationDate === null
        ? undefined
        : input.expirationDate !== undefined
          ? input.expirationDate
          : existing.expirationDate;

    const updated: Ingredient = {
      ...existing,
      ...input,
      expirationDate: resolvedExp,
      updatedAt: new Date().toISOString(),
    };
    this.items[idx] = updated;
    return updated;
  }

  async deleteIngredient(id: string): Promise<void> {
    this.items = this.items.filter((i) => i.id !== id);
  }

  async adjustQuantity(id: string, delta: number): Promise<Ingredient> {
    const idx = this.items.findIndex((i) => i.id === id);
    if (idx === -1) throw new Error('Not found');
    const existing = this.items[idx];
    const newQty = Math.round((existing.quantity + delta) * 100) / 100;
    const updated: Ingredient = {
      ...existing,
      quantity: newQty > 0 ? newQty : existing.quantity,
      updatedAt: new Date().toISOString(),
    };
    this.items[idx] = updated;
    return updated;
  }

  async clearIngredients(): Promise<void> {
    this.items = [];
  }
}

const SAMPLE_INGREDIENTS: Ingredient[] = [
  {
    id: 'ing-1',
    name: 'Tomate chonto',
    quantity: 4,
    unit: 'unidad',
    category: 'Verduras y frutas',
    expirationDate: '2026-10-22', // Urgente
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'ing-2',
    name: 'Pechuga de pollo',
    quantity: 500,
    unit: 'g',
    category: 'Carnes y proteínas',
    expirationDate: '2026-10-22', // Urgente
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'ing-3',
    name: 'Arroz blanco',
    quantity: 1,
    unit: 'kg',
    category: 'Granos y cereales',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const renderScreen = async (
  ui: React.ReactElement,
  initialIngredients?: Ingredient[]
) => {
  const items = (initialIngredients ?? SAMPLE_INGREDIENTS).map((i) => ({
    ...i,
  }));
  const adapter = new MockPantryAdapter(items);
  return await render(
    <SafeAreaProvider
      initialMetrics={{
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
        frame: { x: 0, y: 0, width: 390, height: 844 },
      }}
    >
      <TypographyProvider usingFallback={true}>
        <PantryProvider initialIngredients={items} storageAdapter={adapter}>
          {ui}
        </PantryProvider>
      </TypographyProvider>
    </SafeAreaProvider>
  );
};

describe('Despensa Screen (6. Mi Despensa - Fase 2B)', () => {
  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
  });

  describe('Empty & Loading States', () => {
    it('renders warm empty state when no ingredients exist', async () => {
      const { getByTestId, getByText } = await renderScreen(<DespensaScreen />, []);

      expect(getByTestId('pantry-empty-state')).toBeTruthy();
      expect(getByText('Tu despensa está vacía')).toBeTruthy();
      expect(getByText('Agregar mi primer alimento')).toBeTruthy();
    });
  });

  describe('Pantry List & Sections', () => {
    it('renders header, action buttons, search bar and list sections correctly', async () => {
      const { getByText, getByTestId, getByPlaceholderText } = await renderScreen(
        <DespensaScreen />,
        SAMPLE_INGREDIENTS
      );

      // Header
      expect(getByText('RECETARIO POR PRESUPUESTO')).toBeTruthy();
      expect(getByText('Despensa')).toBeTruthy();

      // Top actions
      expect(getByPlaceholderText('Buscar en mi despensa...')).toBeTruthy();
      expect(getByTestId('pantry-add-ingredient-button')).toBeTruthy();
      expect(getByTestId('pantry-scan-placeholder-button')).toBeTruthy();

      // Urgent section
      expect(getByTestId('pantry-urgent-section')).toBeTruthy();
      expect(getByText('Prioridad para cocinar hoy')).toBeTruthy();
      expect(getByText('Tomate chonto')).toBeTruthy();
      expect(getByText('Pechuga de pollo')).toBeTruthy();

      // General inventory section
      expect(getByTestId('pantry-regular-section')).toBeTruthy();
      expect(getByText('Disponibles en alacena y nevera')).toBeTruthy();
      expect(getByText('Arroz blanco')).toBeTruthy();

      // Savings card
      expect(getByText('SUGERENCIA DE AHORRO')).toBeTruthy();
      expect(getByText('¿Qué cocinamos con esto?')).toBeTruthy();
    });

    it('filters ingredients in real time by name and shows no results card if not found', async () => {
      const { getByPlaceholderText, getByText, queryByText, getByTestId } = await renderScreen(
        <DespensaScreen />,
        SAMPLE_INGREDIENTS
      );

      const searchInput = getByPlaceholderText('Buscar en mi despensa...');

      // Buscar "arroz"
      fireEvent.changeText(searchInput, 'arroz');
      await waitFor(() => {
        expect(getByText('Arroz blanco')).toBeTruthy();
        expect(queryByText('Tomate chonto')).toBeNull();
      });

      // Buscar algo inexistente
      fireEvent.changeText(searchInput, 'ingrediente-inexistente');
      await waitFor(() => {
        expect(getByTestId('pantry-no-search-results')).toBeTruthy();
        expect(getByText('Ver todos los alimentos')).toBeTruthy();
      });

      // Limpiar filtro
      fireEvent.press(getByTestId('clear-search-filter-button'));
      await waitFor(() => {
        expect(getByText('Tomate chonto')).toBeTruthy();
        expect(getByText('Arroz blanco')).toBeTruthy();
      });
    });
  });

  describe('Adding Ingredients Flow', () => {
    it('opens add modal, displays validation errors on empty submission', async () => {
      const { getByTestId, getByText, queryByTestId } = await renderScreen(<DespensaScreen />, []);

      // Abrir modal desde el botón de la barra superior
      fireEvent.press(getByTestId('pantry-add-ingredient-button'));

      await waitFor(() => {
        expect(getByTestId('submit-ingredient-form')).toBeTruthy();
      });

      // Intentar guardar con campos vacíos
      const submitBtn = getByTestId('submit-ingredient-form');
      fireEvent.press(submitBtn);

      await waitFor(() => {
        expect(getByText('El nombre del alimento es obligatorio.')).toBeTruthy();
      });

      // Cerrar modal para dejar el estado limpio
      fireEvent.press(getByTestId('cancel-ingredient-form'));

      await waitFor(() => {
        expect(queryByTestId('submit-ingredient-form')).toBeNull();
      });
    });

    it('adds a new ingredient successfully and displays it in list', async () => {
      const { getByTestId, getByText, queryByTestId } = await renderScreen(
        <DespensaScreen />,
        SAMPLE_INGREDIENTS
      );

      fireEvent.press(getByTestId('pantry-add-ingredient-button'));

      await waitFor(() => {
        expect(getByTestId('ingredient-name-input')).toBeTruthy();
      });

      const nameInput = getByTestId('ingredient-name-input');

      // Llenar campo nombre
      fireEvent.changeText(nameInput, 'Zanahoria fresca');

      await waitFor(() => {
        expect(nameInput.props.value).toBe('Zanahoria fresca');
      });

      // Guardar
      await act(async () => {
        await fireEvent.press(getByTestId('submit-ingredient-form'));
      });

      await waitFor(() => {
        expect(queryByTestId('submit-ingredient-form')).toBeNull();
        expect(getByText('Zanahoria fresca')).toBeTruthy();
      });
    });

    it('cancels adding ingredient without saving anything', async () => {
      const { getByTestId, queryByTestId } = await renderScreen(<DespensaScreen />, []);

      fireEvent.press(getByTestId('pantry-add-ingredient-button'));

      await waitFor(() => {
        expect(getByTestId('cancel-ingredient-form')).toBeTruthy();
      });

      fireEvent.press(getByTestId('cancel-ingredient-form'));

      await waitFor(() => {
        expect(queryByTestId('submit-ingredient-form')).toBeNull();
      });
    });
  });

  describe('Editing & Quantity Adjustment', () => {
    it('adjusts ingredient quantity directly via card stepper buttons', async () => {
      const { getByTestId } = await renderScreen(<DespensaScreen />, SAMPLE_INGREDIENTS);

      const plusBtn = getByTestId('stepper-plus-ing-1');
      await act(async () => {
        await fireEvent.press(plusBtn);
      });

      await waitFor(() => {
        expect(getByTestId('quantity-display-ing-1')).toBeTruthy();
      });
    });

    it('opens edit modal pre-populated and saves changes', async () => {
      const { getByTestId, getByText, queryByTestId } = await renderScreen(
        <DespensaScreen />,
        SAMPLE_INGREDIENTS
      );

      fireEvent.press(getByTestId('edit-ingredient-ing-3'));

      await waitFor(() => {
        expect(getByTestId('ingredient-name-input')).toBeTruthy();
      });

      const nameInput = getByTestId('ingredient-name-input');
      fireEvent.changeText(nameInput, 'Arroz integral');

      await waitFor(() => {
        expect(nameInput.props.value).toBe('Arroz integral');
      });

      await act(async () => {
        await fireEvent.press(getByTestId('submit-ingredient-form'));
      });

      await waitFor(() => {
        expect(queryByTestId('submit-ingredient-form')).toBeNull();
        expect(getByText('Arroz integral')).toBeTruthy();
      });
    });
  });

  describe('Deletion Flow with Confirmation Modal', () => {
    it('prompts confirmation when clicking delete and cancels cleanly', async () => {
      const { getByTestId, getByText, queryByTestId } = await renderScreen(
        <DespensaScreen />,
        SAMPLE_INGREDIENTS
      );

      // Clic en eliminar tomate
      fireEvent.press(getByTestId('delete-ingredient-ing-1'));

      await waitFor(() => {
        expect(getByTestId('delete-confirm-button')).toBeTruthy();
        expect(getByText(/¿Estás seguro de que deseas eliminar/)).toBeTruthy();
      });

      // Cancelar
      fireEvent.press(getByTestId('delete-cancel-button'));

      await waitFor(() => {
        expect(queryByTestId('delete-confirm-button')).toBeNull();
        // Tomate sigue presente
        expect(getByText('Tomate chonto')).toBeTruthy();
      });
    });

    it('confirms deletion and removes the ingredient from the inventory', async () => {
      const { getByTestId, queryByTestId, queryByText } = await renderScreen(
        <DespensaScreen />,
        SAMPLE_INGREDIENTS
      );

      fireEvent.press(getByTestId('delete-ingredient-ing-1'));

      await waitFor(() => {
        expect(getByTestId('delete-confirm-button')).toBeTruthy();
      });

      // Confirmar eliminación
      await act(async () => {
        await fireEvent.press(getByTestId('delete-confirm-button'));
      });

      await waitFor(() => {
        expect(queryByTestId('delete-confirm-button')).toBeNull();
        expect(queryByText('Tomate chonto')).toBeNull();
      });
    });
  });

  describe('Feature Previews and Non-breaking Modals', () => {
    it('displays informative modal for scanner preview without backend or camera permissions', async () => {
      const { getByTestId, getByText, queryByTestId } = await renderScreen(
        <DespensaScreen />,
        SAMPLE_INGREDIENTS
      );

      fireEvent.press(getByTestId('pantry-scan-placeholder-button'));

      await waitFor(() => {
        expect(getByText('Escanear nuevos alimentos')).toBeTruthy();
      });

      fireEvent.press(getByTestId('close-scanner-notice-button'));

      await waitFor(() => {
        expect(queryByTestId('close-scanner-notice-button')).toBeNull();
      });
    });

    it('displays culinary suggestion preview dialog', async () => {
      const { getByTestId, queryByTestId } = await renderScreen(
        <DespensaScreen />,
        SAMPLE_INGREDIENTS
      );

      fireEvent.press(getByTestId('savings-cook-button'));

      await waitFor(() => {
        expect(getByTestId('close-cook-suggestion-button')).toBeTruthy();
      });

      fireEvent.press(getByTestId('close-cook-suggestion-button'));

      await waitFor(() => {
        expect(queryByTestId('close-cook-suggestion-button')).toBeNull();
      });
    });
  });
});

describe('Home Screen Real Pantry Synchronization (Fase 2B)', () => {
  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
  });

  it('displays real ingredient counts and urgent alerts from PantryContext', async () => {
    const { getByText, getByTestId } = await renderScreen(<HomeScreen />, SAMPLE_INGREDIENTS);

    // Cuenta real de productos en la despensa
    expect(getByTestId('home-pantry-total-count')).toBeTruthy();
    expect(getByText('3 productos')).toBeTruthy();

    // Banner urgente real (2 productos urgentes)
    expect(getByTestId('home-urgent-banner')).toBeTruthy();
    expect(getByText('2 consumir pronto')).toBeTruthy();
    expect(getByText('Tomate chonto')).toBeTruthy();
    expect(getByText('Pechuga de pollo')).toBeTruthy();
  });

  it('displays meaningful empty state card on Home when pantry has 0 ingredients', async () => {
    const { getByTestId, getByText, queryByTestId } = await renderScreen(<HomeScreen />, []);

    expect(getByTestId('home-pantry-empty-state')).toBeTruthy();
    expect(getByText('Sin alimentos registrados')).toBeTruthy();
    expect(getByText('0 productos')).toBeTruthy();
    expect(queryByTestId('home-urgent-banner')).toBeNull();
  });

  it('navigates to Despensa screen when pressing the pantry card on Home', async () => {
    const { getByTestId } = await renderScreen(<HomeScreen />, SAMPLE_INGREDIENTS);

    fireEvent.press(getByTestId('home-pantry-card'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/despensa');
  });
});
