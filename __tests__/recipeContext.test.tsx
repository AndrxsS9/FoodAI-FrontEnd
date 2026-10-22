/**
 * Pruebas unitarias para RecipeContext y RecipeProvider (Fase 2C).
 * Verifica la abstracción de fuente de datos: modo demostración, selección de receta en sesión,
 * resolución resiliente por ID o slug, y desambiguación de nombres duplicados para Phase 3.
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { RecipeProvider, useRecipes } from '../src/context/RecipeContext';
import { BudgetProvider } from '../src/context/BudgetContext';
import { BackendRecipe } from '../src/types/recipe';

describe('RecipeContext & RecipeProvider (Fase 2C)', () => {
  const createWrapper = () => {
    return ({ children }: { children: React.ReactNode }) => (
      <BudgetProvider initialPreferences={{ budget: 20000, servings: 2 }}>
        <RecipeProvider>{children}</RecipeProvider>
      </BudgetProvider>
    );
  };

  it('inicia en modo demostración con recetas de demo escaladas según el presupuesto', async () => {
    const { result } = await renderHook(() => useRecipes(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isDemoMode).toBe(true);
    expect(result.current.demoMeta.isDemonstrationData).toBe(true);
    expect(result.current.recipes.length).toBeGreaterThan(0);
    expect(result.current.recipes[0].isDemoFixture).toBe(true);
  });

  it('retorna valores seguros por defecto si se usa fuera del RecipeProvider', async () => {
    const { result } = await renderHook(() => useRecipes());
    expect(result.current.recipes).toEqual([]);
    expect(result.current.selectedRecipe).toBeNull();
    expect(result.current.getRecipeById('demo-rec-1')).toBeUndefined();
  });

  it('resuelve recetas correctamente por ID y por slug', async () => {
    const { result } = await renderHook(() => useRecipes(), {
      wrapper: createWrapper(),
    });

    const byId = result.current.getRecipeById('demo-rec-1');
    expect(byId).toBeDefined();
    expect(byId?.name).toBe('Arroz con pollo y verduras');

    const bySlug = result.current.getRecipeById('tortilla-paisa-con-vegetales');
    expect(bySlug).toBeDefined();
    expect(bySlug?.id).toBe('demo-rec-2');

    const invalid = result.current.getRecipeById('inexistente-12345');
    expect(invalid).toBeUndefined();
  });

  it('mantiene la receta activa seleccionada durante la sesión', async () => {
    const { result } = await renderHook(() => useRecipes(), {
      wrapper: createWrapper(),
    });

    expect(result.current.selectedRecipe).toBeNull();

    await act(async () => {
      result.current.selectRecipe('demo-rec-1');
    });

    expect(result.current.selectedRecipe).toBeDefined();
    expect(result.current.selectedRecipe?.id).toBe('demo-rec-1');

    // La resolución prioriza la receta seleccionada en sesión
    const resolved = result.current.getRecipeById('demo-rec-1');
    expect(resolved?.id).toBe('demo-rec-1');

    await act(async () => {
      result.current.clearSelectedRecipe();
    });
    expect(result.current.selectedRecipe).toBeNull();
  });

  it('permite inyectar recomendaciones reales del backend desambiguando nombres duplicados (Phase 3 ready)', async () => {
    const { result } = await renderHook(() => useRecipes(), {
      wrapper: createWrapper(),
    });

    const backendMockRecipes: BackendRecipe[] = [
      {
        name: 'Arroz con pollo',
        description: 'Versión tradicional colombiana',
        totalMinutes: 35,
        ingredients: [{ name: 'Pollo', quantity: 400, unit: 'g' }],
        steps: ['Dorar el pollo', 'Agregar arroz'],
        availableIngredients: [{ name: 'Pollo', quantity: 400, unit: 'g' }],
        missingIngredients: [],
        estimatedMissingCost: 0,
        budgetRemaining: 20000,
        withinBudget: true,
        convenience: 95,
        reason: 'Receta óptima',
      },
      {
        name: 'Arroz con pollo', // Mismo nombre: debe desambiguarse sin colisión
        description: 'Versión rápida con vegetales',
        totalMinutes: 20,
        ingredients: [{ name: 'Pollo', quantity: 200, unit: 'g' }],
        steps: ['Saltear rápido'],
        availableIngredients: [{ name: 'Pollo', quantity: 200, unit: 'g' }],
        missingIngredients: [],
        estimatedMissingCost: 0,
        budgetRemaining: 20000,
        withinBudget: true,
        convenience: 85,
        reason: 'Versión express',
      },
    ];

    await act(async () => {
      result.current.setRealRecipes(backendMockRecipes);
    });

    expect(result.current.isDemoMode).toBe(false);
    expect(result.current.recipes.length).toBe(2);

    // Los dos tienen slugs distintos para evitar colisión de rutas en Expo Router
    expect(result.current.recipes[0].id).toBe('arroz-con-pollo');
    expect(result.current.recipes[1].id).toBe('arroz-con-pollo-2');

    // Cada receta se resuelve individualmente de forma unívoca
    const first = result.current.getRecipeById('arroz-con-pollo');
    const second = result.current.getRecipeById('arroz-con-pollo-2');
    expect(first?.totalMinutes).toBe(35);
    expect(second?.totalMinutes).toBe(20);
  });
});
