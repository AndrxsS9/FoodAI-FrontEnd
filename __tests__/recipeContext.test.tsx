/**
 * Pruebas unitarias para RecipeContext y RecipeProvider (Fase 2C).
 * Verifica la abstracción de fuente de datos: modo demostración, selección de receta en sesión,
 * resolución resiliente por ID o slug, y desambiguación de nombres duplicados para Phase 3.
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { RecipeProvider, useRecipes } from '../src/context/RecipeContext';
import { BudgetProvider, useBudget } from '../src/context/BudgetContext';
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

    // La resolución prioriza la receta seleccionada en sesión si no está en la colección
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

  it('desambigua colisiones complejas con Set de IDs reservados para nombres como Arroz, Arroz y Arroz 2', async () => {
    const { result } = await renderHook(() => useRecipes(), {
      wrapper: createWrapper(),
    });

    const collisionMockRecipes: BackendRecipe[] = [
      {
        name: 'Arroz',
        description: 'Arroz blanco clásico',
        totalMinutes: 20,
        ingredients: [{ name: 'Arroz', quantity: 200, unit: 'g' }],
        steps: ['Cocinar'],
        availableIngredients: [{ name: 'Arroz', quantity: 200, unit: 'g' }],
        missingIngredients: [],
        estimatedMissingCost: 0,
        budgetRemaining: 20000,
        withinBudget: true,
        convenience: 90,
        reason: 'Básico',
      },
      {
        name: 'Arroz',
        description: 'Arroz frito',
        totalMinutes: 25,
        ingredients: [{ name: 'Arroz', quantity: 200, unit: 'g' }],
        steps: ['Saltear'],
        availableIngredients: [{ name: 'Arroz', quantity: 200, unit: 'g' }],
        missingIngredients: [],
        estimatedMissingCost: 0,
        budgetRemaining: 20000,
        withinBudget: true,
        convenience: 85,
        reason: 'Variante',
      },
      {
        name: 'Arroz 2',
        description: 'Arroz con ajo',
        totalMinutes: 22,
        ingredients: [{ name: 'Arroz', quantity: 200, unit: 'g' }],
        steps: ['Dorar ajo y cocinar arroz'],
        availableIngredients: [{ name: 'Arroz', quantity: 200, unit: 'g' }],
        missingIngredients: [],
        estimatedMissingCost: 0,
        budgetRemaining: 20000,
        withinBudget: true,
        convenience: 80,
        reason: 'Con ajo',
      },
    ];

    await act(async () => {
      result.current.setRealRecipes(collisionMockRecipes);
    });

    expect(result.current.recipes.length).toBe(3);
    const ids = result.current.recipes.map((r) => r.id);
    expect(ids[0]).toBe('arroz');
    expect(ids[1]).toBe('arroz-2');
    expect(ids[2]).toBe('arroz-2-2');

    // Comprobar que los tres IDs son únicos en el conjunto
    expect(new Set(ids).size).toBe(3);
  });

  it('prioriza IDs exactos de cliente sobre slugs y sobre la receta seleccionada en sesión (sin eclipsar)', async () => {
    const { result } = await renderHook(() => useRecipes(), {
      wrapper: createWrapper(),
    });

    const mockRecipes: BackendRecipe[] = [
      {
        name: 'Arroz',
        description: 'Arroz blanco clásico',
        totalMinutes: 20,
        ingredients: [],
        steps: [],
        availableIngredients: [],
        missingIngredients: [],
        estimatedMissingCost: 0,
        budgetRemaining: 20000,
        withinBudget: true,
        convenience: 90,
        reason: '',
      },
      {
        name: 'Arroz',
        description: 'Arroz frito',
        totalMinutes: 25,
        ingredients: [],
        steps: [],
        availableIngredients: [],
        missingIngredients: [],
        estimatedMissingCost: 0,
        budgetRemaining: 20000,
        withinBudget: true,
        convenience: 85,
        reason: '',
      },
    ];

    await act(async () => {
      result.current.setRealRecipes(mockRecipes);
    });

    // Seleccionamos el segundo arroz ('arroz-2')
    await act(async () => {
      result.current.selectRecipe('arroz-2');
    });

    expect(result.current.selectedRecipe?.id).toBe('arroz-2');
    expect(result.current.selectedRecipe?.description).toBe('Arroz frito');

    // Resolver por el ID exacto 'arroz' (el primer arroz).
    // NO debe ser eclipsado por la receta seleccionada 'arroz-2' (cuyo nombre también es 'Arroz')
    const resolvedFirst = result.current.getRecipeById('arroz');
    expect(resolvedFirst).toBeDefined();
    expect(resolvedFirst?.id).toBe('arroz');
    expect(resolvedFirst?.description).toBe('Arroz blanco clásico');
  });

  it('limpia o actualiza la receta seleccionada cuando cambia la colección de recetas reales', async () => {
    const { result } = await renderHook(() => useRecipes(), {
      wrapper: createWrapper(),
    });

    const initialCollection: BackendRecipe[] = [
      {
        name: 'Pollo al horno',
        description: 'Pollo asado',
        totalMinutes: 45,
        ingredients: [],
        steps: [],
        availableIngredients: [],
        missingIngredients: [],
        estimatedMissingCost: 0,
        budgetRemaining: 20000,
        withinBudget: true,
        convenience: 90,
        reason: '',
      },
    ];

    await act(async () => {
      result.current.setRealRecipes(initialCollection);
    });

    await act(async () => {
      result.current.selectRecipe('pollo-al-horno');
    });

    expect(result.current.selectedRecipe?.id).toBe('pollo-al-horno');

    // Ahora se reemplaza la colección activa por una que NO incluye Pollo al horno
    const newCollection: BackendRecipe[] = [
      {
        name: 'Sopa de verduras',
        description: 'Sopa ligera',
        totalMinutes: 20,
        ingredients: [],
        steps: [],
        availableIngredients: [],
        missingIngredients: [],
        estimatedMissingCost: 0,
        budgetRemaining: 20000,
        withinBudget: true,
        convenience: 80,
        reason: '',
      },
    ];

    await act(async () => {
      result.current.setRealRecipes(newCollection);
    });

    // La receta seleccionada obsoleta debe haber sido limpiada a null
    expect(result.current.selectedRecipe).toBeNull();
  });

  it('limpia la receta seleccionada al alternar entre modo demo y modo real', async () => {
    const { result } = await renderHook(() => useRecipes(), {
      wrapper: createWrapper(),
    });

    // En modo demo, seleccionar una receta demo
    await act(async () => {
      result.current.selectRecipe('demo-rec-1');
    });
    expect(result.current.selectedRecipe?.id).toBe('demo-rec-1');

    // Desactivar modo demo
    await act(async () => {
      result.current.setDemoMode(false);
    });
    expect(result.current.selectedRecipe).toBeNull();
  });

  it('actualiza de forma reactiva las porciones y costos de la receta demo seleccionada al cambiar comensales', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BudgetProvider initialPreferences={{ budget: 20000, servings: 2 }}>
        <RecipeProvider>{children}</RecipeProvider>
      </BudgetProvider>
    );

    const useCombined = () => ({
      budget: useBudget(),
      recipes: useRecipes(),
    });

    const { result } = await renderHook(() => useCombined(), { wrapper });

    // Seleccionar demo-rec-1 con 2 porciones iniciales
    await act(async () => {
      result.current.recipes.selectRecipe('demo-rec-1');
    });

    expect(result.current.recipes.selectedRecipe?.id).toBe('demo-rec-1');
    expect(result.current.recipes.selectedRecipe?.servings).toBe(2);
    const initialCost = result.current.recipes.selectedRecipe?.estimatedMissingCost ?? 0;
    expect(initialCost).toBe(5800);

    // Cambiar comensales a 4 (duplicar porciones)
    await act(async () => {
      await result.current.budget.setServings(4);
    });

    // La receta seleccionada NO debe quedar obsoleta: sus porciones y costo deben actualizarse automáticamente
    expect(result.current.recipes.selectedRecipe?.id).toBe('demo-rec-1');
    expect(result.current.recipes.selectedRecipe?.servings).toBe(4);
    expect(result.current.recipes.selectedRecipe?.estimatedMissingCost).toBe(initialCost * 2);
  });

  describe('Integración de IA con Backend real en RecipeContext (Fase 3A)', () => {
    const SAMPLE_INGREDIENTS = [
      {
        id: 'p1',
        name: 'Pollo',
        quantity: 500,
        unit: 'g' as const,
        category: 'Carnes y proteínas' as const,
        createdAt: '2026-10-22T00:00:00.000Z',
        updatedAt: '2026-10-22T00:00:00.000Z',
      },
      {
        id: 'p2',
        name: 'Arroz',
        quantity: 1,
        unit: 'kg' as const,
        category: 'Granos y cereales' as const,
        createdAt: '2026-10-22T00:00:00.000Z',
        updatedAt: '2026-10-22T00:00:00.000Z',
      },
    ];

    const SAMPLE_BACKEND_RECIPES: BackendRecipe[] = [
      {
        name: 'Arroz con Pollo Criollo',
        description: 'Receta generada por Gemini a partir de tu despensa.',
        totalMinutes: 35,
        ingredients: [
          { name: 'Pollo', quantity: 400, unit: 'g' },
          { name: 'Arroz', quantity: 200, unit: 'g' },
        ],
        steps: ['Dorar el pollo', 'Cocinar con arroz'],
        availableIngredients: [
          { name: 'Pollo', quantity: 400, unit: 'g' },
          { name: 'Arroz', quantity: 200, unit: 'g' },
        ],
        missingIngredients: [],
        estimatedMissingCost: 0,
        budgetRemaining: 20000,
        withinBudget: true,
        convenience: 98,
        reason: 'Aprovecha tus ingredientes al máximo.',
      },
    ];

    const createPantryWrapper = (options?: {
      initialIngredients?: typeof SAMPLE_INGREDIENTS;
      mockApiClient?: any;
    }) => {
      const { PantryProvider } = require('../src/context/PantryContext');
      return ({ children }: { children: React.ReactNode }) => (
        <PantryProvider initialIngredients={options?.initialIngredients ?? SAMPLE_INGREDIENTS}>
          <BudgetProvider initialPreferences={{ budget: 20000, servings: 2 }}>
            <RecipeProvider recipeApiClient={options?.mockApiClient}>
              {children}
            </RecipeProvider>
          </BudgetProvider>
        </PantryProvider>
      );
    };

    it('genera recetas reales exitosamente y desactiva el modo de demostración', async () => {
      const mockRecommend = jest.fn().mockResolvedValue(SAMPLE_BACKEND_RECIPES);
      const mockClient = { recommendRecipes: mockRecommend, checkBackendHealth: jest.fn() };

      const { result } = await renderHook(() => useRecipes(), {
        wrapper: createPantryWrapper({ mockApiClient: mockClient }),
      });

      expect(result.current.isDemoMode).toBe(true);

      let generated: any;
      await act(async () => {
        generated = await result.current.generateRecipes();
      });

      expect(mockRecommend).toHaveBeenCalledTimes(1);
      expect(result.current.isDemoMode).toBe(false);
      expect(result.current.recipes.length).toBe(1);
      expect(result.current.recipes[0].name).toBe('Arroz con Pollo Criollo');
      expect(result.current.recipes[0].isDemoFixture).toBe(false);
      expect(result.current.isStale).toBe(false);
      expect(result.current.lastGeneratedAt).toBeTruthy();
      expect(generated.length).toBe(1);
    });

    it('bloquea llamadas cuando la despensa está vacía y reporta EMPTY_PANTRY sin llamar a la API', async () => {
      const mockRecommend = jest.fn();
      const mockClient = { recommendRecipes: mockRecommend, checkBackendHealth: jest.fn() };

      const { result } = await renderHook(() => useRecipes(), {
        wrapper: createPantryWrapper({ initialIngredients: [], mockApiClient: mockClient }),
      });

      let caughtError: any;
      await act(async () => {
        try {
          await result.current.generateRecipes();
        } catch (err) {
          caughtError = err;
        }
      });

      expect(caughtError).toBeDefined();
      expect(caughtError.message).toMatch(/despensa está vacía/i);
      expect(mockRecommend).not.toHaveBeenCalled();
      expect(result.current.error).toContain('despensa está vacía');
      expect(result.current.errorCode).toBe('EMPTY_PANTRY');
    });

    it('preserva el error y NO hace fallback silencioso a demo ante fallo del backend', async () => {
      const mockRecommend = jest.fn().mockRejectedValue(new Error('Gemini API quota exceeded'));
      const mockClient = { recommendRecipes: mockRecommend, checkBackendHealth: jest.fn() };

      const { result } = await renderHook(() => useRecipes(), {
        wrapper: createPantryWrapper({ mockApiClient: mockClient }),
      });

      let caughtError: any;
      await act(async () => {
        try {
          await result.current.generateRecipes();
        } catch (err) {
          caughtError = err;
        }
      });

      expect(caughtError).toBeDefined();
      expect(caughtError.message).toBe('Gemini API quota exceeded');
      expect(result.current.error).toBe('Gemini API quota exceeded');
      expect(result.current.isGenerating).toBe(false);
      // No debe fingir que todo salió bien ni cambiar a modo real
      expect(result.current.isDemoMode).toBe(true);
    });

    it('detecta automáticamente cuando las recetas quedan obsoletas (isStale) tras cambios en presupuesto', async () => {
      const mockRecommend = jest.fn().mockResolvedValue(SAMPLE_BACKEND_RECIPES);
      const mockClient = { recommendRecipes: mockRecommend, checkBackendHealth: jest.fn() };

      const { PantryProvider } = require('../src/context/PantryContext');
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <PantryProvider initialIngredients={SAMPLE_INGREDIENTS}>
          <BudgetProvider initialPreferences={{ budget: 20000, servings: 2 }}>
            <RecipeProvider recipeApiClient={mockClient}>
              {children}
            </RecipeProvider>
          </BudgetProvider>
        </PantryProvider>
      );

      const useCombined = () => ({
        budget: useBudget(),
        recipes: useRecipes(),
      });

      const { result } = await renderHook(() => useCombined(), { wrapper });

      // 1. Generar recetas iniciales
      await act(async () => {
        await result.current.recipes.generateRecipes();
      });

      expect(result.current.recipes.isDemoMode).toBe(false);
      expect(result.current.recipes.isStale).toBe(false);

      // 2. Modificar el presupuesto
      await act(async () => {
        await result.current.budget.setBudget(35000);
      });

      // 3. Debe detectarse inmediatamente como obsoleto (isStale = true)
      expect(result.current.recipes.isStale).toBe(true);

      // 4. Regenerar con el nuevo presupuesto
      await act(async () => {
        await result.current.recipes.generateRecipes();
      });

      // 5. Debe volver a estar al día (isStale = false)
      expect(result.current.recipes.isStale).toBe(false);
    });

    it('detecta obsolescencia (isStale) ante cambios o reseteo de maxMinutes (ISSUE 3)', async () => {
      const mockRecommend = jest.fn().mockResolvedValue(SAMPLE_BACKEND_RECIPES);
      const mockClient = { recommendRecipes: mockRecommend, checkBackendHealth: jest.fn() };

      const { PantryProvider } = require('../src/context/PantryContext');
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <PantryProvider initialIngredients={SAMPLE_INGREDIENTS}>
          <BudgetProvider initialPreferences={{ budget: 20000, servings: 2, maxMinutes: 30 }}>
            <RecipeProvider recipeApiClient={mockClient}>
              {children}
            </RecipeProvider>
          </BudgetProvider>
        </PantryProvider>
      );

      const useCombined = () => ({
        budget: useBudget(),
        recipes: useRecipes(),
      });

      const { result } = await renderHook(() => useCombined(), { wrapper });

      // 1. Generación inicial con maxMinutes = 30
      await act(async () => {
        await result.current.recipes.generateRecipes();
      });

      expect(result.current.recipes.isStale).toBe(false);

      // 2. Parámetros sin cambios: NO debe disparar isStale falsamente
      expect(result.current.recipes.isStale).toBe(false);

      // 3. Modificar maxMinutes de 30 a 45 minutos -> debe marcarse isStale
      await act(async () => {
        await result.current.budget.setMaxMinutes(45);
      });
      expect(result.current.recipes.isStale).toBe(true);

      // 4. Regenerar con éxito -> limpia el estado isStale
      await act(async () => {
        await result.current.recipes.generateRecipes();
      });
      expect(result.current.recipes.isStale).toBe(false);

      // 5. Resetear maxMinutes a undefined / null -> debe marcarse isStale
      await act(async () => {
        await result.current.budget.setMaxMinutes(null);
      });
      expect(result.current.recipes.isStale).toBe(true);

      // 6. Si la llamada de regeneración falla, NO debe marcarse falsamente como actualizado
      mockRecommend.mockRejectedValueOnce(new Error('Fallo temporal de IA'));
      await act(async () => {
        try {
          await result.current.recipes.generateRecipes();
        } catch {
          // esperado
        }
      });

      // Debe continuar en estado isStale porque la generación falló
      expect(result.current.recipes.isStale).toBe(true);
      expect(result.current.recipes.error).toBe('Fallo temporal de IA');
    });

    it('permite limpiar el error con clearError()', async () => {
      const mockRecommend = jest.fn().mockRejectedValue(new Error('Fallo de red'));
      const mockClient = { recommendRecipes: mockRecommend, checkBackendHealth: jest.fn() };

      const { result } = await renderHook(() => useRecipes(), {
        wrapper: createPantryWrapper({ mockApiClient: mockClient }),
      });

      await act(async () => {
        try {
          await result.current.generateRecipes();
        } catch {
          // esperado
        }
      });

      expect(result.current.error).toBe('Fallo de red');

      await act(async () => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.errorCode).toBeNull();
    });
  });
});
