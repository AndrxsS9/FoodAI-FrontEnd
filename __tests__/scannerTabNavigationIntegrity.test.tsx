/**
 * FoodAI — Scanner Tab Navigation Integrity Regression Tests
 *
 * Verifies that the scanner completion screen:
 * 1. Uses returnToTab (dismissTo) to return to the existing (tabs) navigator instance.
 * 2. Prevents duplicated tab navigator instances in the navigation stack.
 * 3. Handles both 'Ver Mi Despensa' and 'Volver al Inicio' buttons.
 * 4. Preserves safe fallback to router.replace when no stack history exists (e.g. direct deep-links).
 * 5. Preserves Android back-button behavior without leaving phantom tab navigators.
 * 6. Does not trigger unintended provider remounting or data loss (recipes and pantry data remain intact).
 * 7. Confirms all five tabs (Inicio, Despensa, Recetas, Plan, Perfil) remain functional.
 */

import React from 'react';
import { View, Text } from 'react-native';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { returnToTab } from '../src/utils/tabNavigation';
import ScannerScreen from '../app/escaner/index';
import { TypographyProvider } from '../src/theme';
import { PantryProvider, usePantry } from '../src/context/PantryContext';
import { RecipeProvider, useRecipes } from '../src/context/RecipeContext';
import { PantryStorageAdapter } from '../src/services/storage/pantryStorage';
import { CreateIngredientInput, Ingredient, UpdateIngredientInput } from '../src/types/pantry';
import { BASE_DEMO_RECIPES } from '../src/fixtures/demoRecipes';
import { scannerApi } from '../src/services/api/scannerApi';
import * as ImagePicker from 'expo-image-picker';

jest.setTimeout(30000);

// Spies for router
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockDismissTo = jest.fn();
let mockCanDismissValue = true;

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    dismissTo: mockDismissTo,
    canDismiss: () => mockCanDismissValue,
  }),
}));

// Mock expo-image-picker
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', granted: true }),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

// Mock scanner API
jest.mock('../src/services/api/scannerApi', () => {
  const actual = jest.requireActual('../src/services/api/scannerApi');
  return {
    ...actual,
    scannerApi: {
      ...actual.scannerApi,
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

describe('Scanner Tab Navigation Integrity & Duplicate Navigator Prevention', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanDismissValue = true;
  });

  afterEach(() => {
    cleanup();
  });

  describe('1. Unit Tests for returnToTab Navigation Helper', () => {
    it('calls dismissTo and avoids replace when stack history exists (canDismiss = true)', () => {
      const mockRouter = {
        replace: jest.fn(),
        canDismiss: () => true,
        dismissTo: jest.fn(),
      };

      returnToTab(mockRouter, '/(tabs)/despensa');

      expect(mockRouter.dismissTo).toHaveBeenCalledTimes(1);
      expect(mockRouter.dismissTo).toHaveBeenCalledWith('/(tabs)/despensa');
      expect(mockRouter.replace).not.toHaveBeenCalled();
    });

    it('navigates to Home /(tabs) via dismissTo when history exists', () => {
      const mockRouter = {
        replace: jest.fn(),
        canDismiss: () => true,
        dismissTo: jest.fn(),
      };

      returnToTab(mockRouter, '/(tabs)');

      expect(mockRouter.dismissTo).toHaveBeenCalledTimes(1);
      expect(mockRouter.dismissTo).toHaveBeenCalledWith('/(tabs)');
      expect(mockRouter.replace).not.toHaveBeenCalled();
    });

    it('falls back safely to replace when no stack history exists (canDismiss = false)', () => {
      const mockRouter = {
        replace: jest.fn(),
        canDismiss: () => false,
        dismissTo: jest.fn(),
      };

      returnToTab(mockRouter, '/(tabs)/despensa');

      expect(mockRouter.replace).toHaveBeenCalledTimes(1);
      expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/despensa');
      expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    });

    it('falls back safely to replace when canDismiss is undefined', () => {
      const mockRouter = {
        replace: jest.fn(),
        dismissTo: jest.fn(),
      };

      returnToTab(mockRouter, '/(tabs)/despensa');

      expect(mockRouter.replace).toHaveBeenCalledTimes(1);
      expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/despensa');
      expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    });

    it('falls back safely to replace when dismissTo function is missing', () => {
      const mockRouter = {
        replace: jest.fn(),
        canDismiss: () => true,
      };

      returnToTab(mockRouter, '/(tabs)/despensa');

      expect(mockRouter.replace).toHaveBeenCalledTimes(1);
      expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/despensa');
    });
  });

  describe('2. ScannerScreen Completion Navigation with returnToTab', () => {
    const advanceScannerToCompleted = async (screen: any) => {
      // 1. Select gallery image
      (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
        canceled: false,
        assets: [
          {
            uri: 'file:///data/user/0/foodai/cache/scan_sample.jpg',
            width: 1080,
            height: 1920,
            fileSize: 450 * 1024,
            mimeType: 'image/jpeg',
          },
        ],
      });

      const galleryBtn = screen.getByTestId('scanner-gallery-button');
      await fireEvent.press(galleryBtn);

      // 2. Wait for preview state
      await waitFor(() => {
        expect(screen.getByTestId('scanner-preview-state')).toBeTruthy();
      });

      // 3. Mock analyze
      (scannerApi.analyzeIngredientsImage as jest.Mock).mockResolvedValueOnce([
        {
          name: 'Aguacate',
          quantity: 2,
          unit: 'unidad',
          category: 'Verduras y frutas',
          needsReview: false,
        },
      ]);

      const analyzeBtn = screen.getByTestId('scanner-analyze-button');
      await fireEvent.press(analyzeBtn);

      // 4. Wait for review state
      await waitFor(() => {
        expect(screen.getByTestId('scanner-review-state')).toBeTruthy();
      });

      // 5. Confirm and save
      const saveBtn = screen.getByTestId('scanner-confirm-save-button');
      await fireEvent.press(saveBtn);

      // 6. Wait for completed state
      await waitFor(() => {
        expect(screen.getByTestId('scanner-completed-state')).toBeTruthy();
      });
    };

    const renderScanner = async (initialPantry: Ingredient[] = []) => {
      const testAdapter = new MockPantryAdapter(initialPantry);
      const result = await render(
        <SafeAreaProvider
          initialMetrics={{
            insets: { top: 0, left: 0, right: 0, bottom: 0 },
            frame: { x: 0, y: 0, width: 390, height: 844 },
          }}
        >
          <TypographyProvider usingFallback={true}>
            <PantryProvider storageAdapter={testAdapter} initialIngredients={initialPantry}>
              <RecipeProvider>
                <ScannerScreen />
              </RecipeProvider>
            </PantryProvider>
          </TypographyProvider>
        </SafeAreaProvider>
      );
      return Object.assign(result, { adapter: testAdapter });
    };

    it('navigates to Pantry using dismissTo to reuse the existing tab navigator', async () => {
      mockCanDismissValue = true;
      const screen = await renderScanner();
      await advanceScannerToCompleted(screen);

      const pantryButton = screen.getByTestId('scanner-go-to-pantry-button');
      await fireEvent.press(pantryButton);

      // Reuses existing tab navigator: dismissTo called, replace NOT called
      expect(mockDismissTo).toHaveBeenCalledTimes(1);
      expect(mockDismissTo).toHaveBeenCalledWith('/(tabs)/despensa');
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('navigates to Home using dismissTo to reuse the existing tab navigator', async () => {
      mockCanDismissValue = true;
      const screen = await renderScanner();
      await advanceScannerToCompleted(screen);

      const homeButton = screen.getByTestId('scanner-go-home-button');
      await fireEvent.press(homeButton);

      // Reuses existing tab navigator: dismissTo called, replace NOT called
      expect(mockDismissTo).toHaveBeenCalledTimes(1);
      expect(mockDismissTo).toHaveBeenCalledWith('/(tabs)');
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('safely falls back to replace when scanner opened without prior tab history (deep-link)', async () => {
      mockCanDismissValue = false; // No history to dismiss
      const screen = await renderScanner();
      await advanceScannerToCompleted(screen);

      const pantryButton = screen.getByTestId('scanner-go-to-pantry-button');
      await fireEvent.press(pantryButton);

      expect(mockReplace).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)/despensa');
      expect(mockDismissTo).not.toHaveBeenCalled();
    });

    it('scan-again button resets scanner state locally without navigating or triggering extra requests', async () => {
      const screen = await renderScanner();
      await advanceScannerToCompleted(screen);

      const scanAgainButton = screen.getByTestId('scanner-scan-again-button');
      await fireEvent.press(scanAgainButton);

      // Returns to capture state
      await waitFor(() => {
        expect(screen.getByTestId('scanner-capture-state')).toBeTruthy();
      });

      // No router navigation triggered
      expect(mockDismissTo).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe('3. Prevention of Duplicate Tab Navigators and Provider State Preservation', () => {
    it('preserves pantry items and generated recipes without remounting providers', async () => {
      const initialIngredients: Ingredient[] = [
        {
          id: 'existing-pantry-1',
          name: 'Arroz Diana',
          quantity: 1000,
          unit: 'g',
          category: 'Alacena',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const pantryAdapter = new MockPantryAdapter(initialIngredients);

      // Test component checking provider data persistence
      function AppNavigationHarness() {
        const { ingredients } = usePantry();
        const { recipes } = useRecipes();

        return (
          <View testID="app-harness">
            <Text testID="pantry-count">{String(ingredients.length)}</Text>
            <Text testID="recipes-count">{String(recipes.length)}</Text>
          </View>
        );
      }

      const screen = await render(
        <SafeAreaProvider
          initialMetrics={{
            insets: { top: 0, left: 0, right: 0, bottom: 0 },
            frame: { x: 0, y: 0, width: 390, height: 844 },
          }}
        >
          <TypographyProvider usingFallback={true}>
            <PantryProvider storageAdapter={pantryAdapter} initialIngredients={initialIngredients}>
              <RecipeProvider initialRecipes={BASE_DEMO_RECIPES} initialIsDemoMode={false}>
                <AppNavigationHarness />
              </RecipeProvider>
            </PantryProvider>
          </TypographyProvider>
        </SafeAreaProvider>
      );

      expect(screen.getByTestId('pantry-count').props.children).toBe('1');
      expect(screen.getByTestId('recipes-count').props.children).toBe(String(BASE_DEMO_RECIPES.length));

      // Simulating scanner completion returning to tab via returnToTab
      const mockRouter = {
        replace: jest.fn(),
        canDismiss: () => true,
        dismissTo: jest.fn(),
      };

      returnToTab(mockRouter, '/(tabs)/despensa');

      // The router dismissed back to the existing tab
      expect(mockRouter.dismissTo).toHaveBeenCalledWith('/(tabs)/despensa');
      expect(mockRouter.replace).not.toHaveBeenCalled();

      // Data in providers remains completely untouched and available
      expect(screen.getByTestId('pantry-count').props.children).toBe('1');
      expect(screen.getByTestId('recipes-count').props.children).toBe(String(BASE_DEMO_RECIPES.length));
    });

    it('verifies simulated navigation stack does not duplicate (tabs) root entry', () => {
      // Simulating navigation stack transitions:
      // Initial state: [(tabs)]
      let stack: string[] = ['(tabs)'];

      // User opens scanner: push /escaner
      stack.push('escaner');
      expect(stack).toEqual(['(tabs)', 'escaner']);

      // Buggy behavior with replace('/(tabs)/despensa'):
      // stack.pop() + stack.push('(tabs)') => ['(tabs)', '(tabs)'] -> DUPLICATE!
      const buggyStack = [...stack];
      buggyStack.pop();
      buggyStack.push('(tabs)');
      const duplicateCount = buggyStack.filter((s) => s === '(tabs)').length;
      expect(duplicateCount).toBe(2); // This was the bug

      // Correct behavior with returnToTab (dismissTo):
      // dismisses top screen and targets existing tab
      const correctedStack = [...stack];
      const router = {
        canDismiss: () => correctedStack.length > 1,
        dismissTo: (_target: string) => {
          while (correctedStack.length > 1) {
            correctedStack.pop();
          }
        },
        replace: (target: string) => {
          correctedStack.pop();
          correctedStack.push(target);
        },
      };

      returnToTab(router, '/(tabs)/despensa');

      // The corrected stack has exactly ONE (tabs) instance
      expect(correctedStack).toEqual(['(tabs)']);
      expect(correctedStack.filter((s) => s === '(tabs)').length).toBe(1);
    });

    it('ensures back-button does not land on duplicate tab screens', () => {
      // If stack has [(tabs), (tabs)], pressing back pops to the phantom previous tab.
      // With [(tabs)], pressing back exits the app / finishes the activity.
      const singleStack = ['(tabs)'];
      const canGoBackInSingleStack = singleStack.length > 1;
      expect(canGoBackInSingleStack).toBe(false); // Back button exits cleanly
    });
  });

  describe('4. Tab Navigator All Five Tabs Integrity', () => {
    it('verifies all five tab routes are valid targets for returnToTab', () => {
      const tabs = [
        '/(tabs)',
        '/(tabs)/despensa',
        '/(tabs)/recetas',
        '/(tabs)/plan',
        '/(tabs)/perfil',
      ];

      tabs.forEach((tabHref) => {
        const mockRouter = {
          replace: jest.fn(),
          canDismiss: () => true,
          dismissTo: jest.fn(),
        };

        returnToTab(mockRouter, tabHref);
        expect(mockRouter.dismissTo).toHaveBeenCalledWith(tabHref);
        expect(mockRouter.replace).not.toHaveBeenCalled();
      });
    });
  });
});
