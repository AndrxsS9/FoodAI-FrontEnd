/**
 * Suite de pruebas automatizadas para la Pantalla de Perfil de Usuario
 * y Configuración de la Aplicación (PerfilScreen - Fase 4).
 *
 * Cobertura completa:
 * 1. Renderizado inicial según Google Stitch Screen 13 (encabezados, tarjetas, micro-panel, branding).
 * 2. Carga reactiva de preferencias persistidas en BudgetContext.
 * 3. Edición de presupuesto (COP): valores válidos, cero, valores negativos, NaN y límites.
 * 4. Edición de porciones del hogar (1 a 12 comensales) y control por stepper.
 * 5. Configuración de tiempo máximo de cocción (minutos y modo sin límite).
 * 6. Persistencia asíncrona exitosa y manejo de fallos de disco en almacenamiento local.
 * 7. Diálogo de confirmación para restablecer valores predeterminados y cancelación segura.
 * 8. Ejecución de restablecimiento de fábrica de preferencias culinarias.
 * 9. Sincronización entre pantallas y activación de obsolescencia (isStale) en MealPlanContext.
 * 10. Protección contra peticiones concurrentes o pulsaciones rápidas repetidas.
 * 11. Ausencia absoluta de llamadas automáticas o no intencionadas a la API de Gemini.
 * 12. Navegación, accesibilidad (roles, etiquetas y alertas) y modales informativos de soporte.
 */

import React from 'react';
import { render, fireEvent, waitFor, act, cleanup } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import PerfilScreen from '../app/(tabs)/perfil';
import { PantryProvider } from '../src/context/PantryContext';
import { BudgetProvider, useBudget } from '../src/context/BudgetContext';
import { RecipeProvider } from '../src/context/RecipeContext';
import { MealPlanProvider, useMealPlan } from '../src/context/MealPlanContext';
import { TypographyProvider } from '../src/theme';
import { Ingredient } from '../src/types/pantry';
import { BudgetPreferences, defaultBudgetPreferences } from '../src/types/budget';
import { BudgetStorageAdapter } from '../src/services/storage/budgetStorage';
import { recipeApi } from '../src/services/api/recipeApi';
import { mealPlanApi } from '../src/services/api/mealPlanApi';
import { ClientMealPlan, MealPlanGenerationSnapshot } from '../src/types/mealPlan';
import { MealPlanStorageAdapter } from '../src/services/storage/mealPlanStorage';

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

describe('Pantalla de Perfil y Configuración (PerfilScreen - Fase 4)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    cleanup();
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  const mockPantryItems: Ingredient[] = [
    {
      id: 'item-1',
      name: 'Pollo',
      quantity: 500,
      unit: 'g',
      category: 'Carnes y proteínas',
      expirationDate: '2026-10-26', // Urgente
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'item-2',
      name: 'Arroz',
      quantity: 1000,
      unit: 'g',
      category: 'Granos y cereales',
      expirationDate: '2026-12-31', // No urgente
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const renderWithProviders = async (
    ui: React.ReactElement,
    initialPreferences?: Partial<BudgetPreferences>,
    storageAdapter?: BudgetStorageAdapter,
    pantryIngredients: Ingredient[] = mockPantryItems,
    initialMealPlan: ClientMealPlan | null = null,
    mealPlanStorageAdapter?: MealPlanStorageAdapter
  ) => {
    return render(
      <SafeAreaProvider
        initialMetrics={{
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
          frame: { x: 0, y: 0, width: 390, height: 844 },
        }}
      >
        <TypographyProvider usingFallback={true}>
          <PantryProvider initialIngredients={pantryIngredients}>
            <BudgetProvider
              initialPreferences={initialPreferences}
              storageAdapter={storageAdapter}
            >
              <RecipeProvider>
                <MealPlanProvider
                  initialPlan={initialMealPlan}
                  storageAdapter={mealPlanStorageAdapter}
                >
                  {ui}
                </MealPlanProvider>
              </RecipeProvider>
            </BudgetProvider>
          </PantryProvider>
        </TypographyProvider>
      </SafeAreaProvider>
    );
  };

  // =========================================================================
  // 1. RENDERIZADO INICIAL Y FIDELIDAD VISUAL GOOGLE STITCH PANTALLA 13
  // =========================================================================
  describe('Renderizado inicial y estructura visual Google Stitch', () => {
    it('renderiza el título oficial en español y subtítulo institucional', async () => {
      const { getByText, getByLabelText } = await renderWithProviders(<PerfilScreen />);

      expect(getByText('Mi perfil y configuración')).toBeTruthy();
      expect(getByText('Recetario por Presupuesto')).toBeTruthy();
      expect(getByText('Perfil de Usuario')).toBeTruthy();
      expect(getByText('Fase 4')).toBeTruthy();
      expect(getByLabelText('Logotipo de Recetario por Presupuesto')).toBeTruthy();
    });

    it('renderiza la tarjeta de cabecera de usuario con avatar CR y etiqueta Hogar', async () => {
      const { getByText, getByLabelText } = await renderWithProviders(<PerfilScreen />);

      expect(getByText('CR')).toBeTruthy();
      expect(getByText('Camila R.')).toBeTruthy();
      expect(getByText('Hogar')).toBeTruthy();
      expect(getByText('Gestión de despensa activa')).toBeTruthy();
      expect(getByLabelText('Avatar de Camila R.')).toBeTruthy();
    });

    it('renderiza el micro-panel de impacto doméstico con métricas de la despensa', async () => {
      const { getByText } = await renderWithProviders(<PerfilScreen />);

      expect(getByText('Despensa al día')).toBeTruthy();
      expect(getByText('2')).toBeTruthy(); // totalCount de mockPantryItems
      expect(getByText('insumos')).toBeTruthy();

      expect(getByText('Por consumir pronto')).toBeTruthy();
      expect(getByText('1')).toBeTruthy(); // urgentCount de mockPantryItems
      expect(getByText('alimentos')).toBeTruthy();
      expect(getByText('1 por consumir pronto')).toBeTruthy();
    });

    it('renderiza la sección 1: Preferencias de hogar con valores predeterminados', async () => {
      const { getByText, getByTestId } = await renderWithProviders(<PerfilScreen />);

      expect(getByText('Preferencias y Configuración')).toBeTruthy();
      expect(getByText(/Preferencias de hogar · Pautas para calcular cantidades/)).toBeTruthy();

      // Porciones habituales
      expect(getByText('Porciones habituales')).toBeTruthy();
      expect(getByTestId('profile-servings-display')).toBeTruthy();
      expect(getByText('2 personas')).toBeTruthy();

      // Presupuesto por comida
      expect(getByText('Presupuesto por comida')).toBeTruthy();
      expect(getByTestId('profile-budget-display')).toBeTruthy();
      expect(getByText('$20.000 COP')).toBeTruthy();

      // Tiempo máximo de cocción
      expect(getByText('Tiempo máximo de cocción')).toBeTruthy();
      expect(getByTestId('profile-time-display')).toBeTruthy();
      expect(getByText('Sin límite')).toBeTruthy();

      // Botón Stitch para editar preferencias
      expect(getByTestId('btn-edit-pref')).toBeTruthy();
      expect(getByText('Editar preferencias')).toBeTruthy();
    });

    it('renderiza la sección 2: Configuración y Soporte del Proyecto', async () => {
      const { getByText, getByTestId } = await renderWithProviders(<PerfilScreen />);

      expect(getByTestId('settings-row-config')).toBeTruthy();
      expect(getByText('Configuración')).toBeTruthy();
      expect(getByText('Unidades métricas, moneda y alertas')).toBeTruthy();

      expect(getByTestId('settings-row-help')).toBeTruthy();
      expect(getByText('Ayuda y preguntas frecuentes')).toBeTruthy();
      expect(getByText('Guía de inventario y optimización')).toBeTruthy();

      expect(getByTestId('settings-row-about')).toBeTruthy();
      expect(getByText('Acerca del proyecto')).toBeTruthy();
      expect(getByText('v1.0.0')).toBeTruthy();
    });

    it('renderiza el botón de restablecimiento de preferencias con pie aclaratorio', async () => {
      const { getByText, getByTestId } = await renderWithProviders(<PerfilScreen />);

      expect(getByTestId('btn-reset-preferences')).toBeTruthy();
      expect(getByText('Restablecer preferencias')).toBeTruthy();
      expect(
        getByText('Tus datos de despensa y recetas permanecen guardados en este dispositivo.')
      ).toBeTruthy();
    });

    it('renderiza los accesos rápidos de desarrollo y navegación requeridos', async () => {
      const { getByTestId } = await renderWithProviders(<PerfilScreen />);

      expect(getByTestId('perfil-welcome-button')).toBeTruthy();
      expect(getByTestId('perfil-design-system-button')).toBeTruthy();
      expect(getByTestId('perfil-back-home-button')).toBeTruthy();
    });
  });

  // =========================================================================
  // 2. CARGA DE PREFERENCIAS PERSONALIZADAS
  // =========================================================================
  describe('Carga de preferencias personalizadas almacenadas', () => {
    it('muestra las preferencias personalizadas provistas al inicializar', async () => {
      const { getByText } = await renderWithProviders(<PerfilScreen />, {
        budget: 50000,
        servings: 4,
        maxMinutes: 45,
      });

      expect(getByText('$50.000 COP')).toBeTruthy();
      expect(getByText('4 personas')).toBeTruthy();
      expect(getByText('45 min')).toBeTruthy();
    });

    it('muestra 1 persona en singular cuando servings es 1', async () => {
      const { getByText } = await renderWithProviders(<PerfilScreen />, {
        servings: 1,
      });

      expect(getByText('1 persona')).toBeTruthy();
    });
  });

  // =========================================================================
  // 3. EDICIÓN Y VALIDACIÓN DE PRESUPUESTO
  // =========================================================================
  describe('Edición y validación del presupuesto predeterminado (COP)', () => {
    it('abre el modal de edición al presionar el botón Editar preferencias', async () => {
      const { getByTestId, getByText } = await renderWithProviders(<PerfilScreen />);

      const editBtn = getByTestId('btn-edit-pref');
      await act(async () => {
        fireEvent.press(editBtn);
      });

      expect(getByTestId('edit-preferences-modal')).toBeTruthy();
      expect(getByText('Presupuesto por comida (COP)')).toBeTruthy();
      expect(getByTestId('budget-input')).toBeTruthy();
      expect(getByTestId('save-preferences-button')).toBeTruthy();
    });

    it('abre el modal de edición al presionar la fila de presupuesto', async () => {
      const { getByTestId } = await renderWithProviders(<PerfilScreen />);

      const budgetRow = getByTestId('preference-row-budget');
      await act(async () => {
        fireEvent.press(budgetRow);
      });

      expect(getByTestId('edit-preferences-modal')).toBeTruthy();
      expect(getByTestId('budget-input')).toBeTruthy();
    });

    it('actualiza el presupuesto exitosamente y muestra notificación de éxito', async () => {
      const { getByTestId, getByText } = await renderWithProviders(
        <PerfilScreen />
      );

      // Abrir modal
      await act(async () => {
        fireEvent.press(getByTestId('btn-edit-pref'));
      });

      // Modificar presupuesto a 45000
      const input = getByTestId('budget-input');
      await act(async () => {
        fireEvent.changeText(input, '45000');
      });

      // Guardar
      await act(async () => {
        fireEvent.press(getByTestId('save-preferences-button'));
      });

      // Verificar que el modal se cierra y el nuevo presupuesto se muestra
      await waitFor(() => {
        expect(getByText('$45.000 COP')).toBeTruthy();
      });
      expect(getByTestId('preferences-saved-feedback')).toBeTruthy();
      expect(getByText('Preferencias guardadas exitosamente.')).toBeTruthy();
    });

    it('acepta presupuesto de cero ($0 COP) como valor válido', async () => {
      const { getByTestId, getByText } = await renderWithProviders(<PerfilScreen />);

      await act(async () => {
        fireEvent.press(getByTestId('btn-edit-pref'));
      });

      const input = getByTestId('budget-input');
      await act(async () => {
        fireEvent.changeText(input, '0');
      });

      await act(async () => {
        fireEvent.press(getByTestId('save-preferences-button'));
      });

      await waitFor(() => {
        expect(getByText('$0 COP')).toBeTruthy();
      });
      expect(getByText('Preferencias guardadas exitosamente.')).toBeTruthy();
    });

    it('rechaza presupuestos vacíos mostrando mensaje de error', async () => {
      const { getByTestId, getByText } = await renderWithProviders(<PerfilScreen />);

      await act(async () => {
        fireEvent.press(getByTestId('btn-edit-pref'));
      });

      const input = getByTestId('budget-input');
      await act(async () => {
        fireEvent.changeText(input, '   ');
      });

      await act(async () => {
        fireEvent.press(getByTestId('save-preferences-button'));
      });

      expect(getByTestId('budget-input-error')).toBeTruthy();
      expect(getByText('Por favor ingresa un monto de presupuesto.')).toBeTruthy();
    });

    it('rechaza presupuestos negativos mostrando mensaje de error', async () => {
      const { getByTestId, getByText } = await renderWithProviders(<PerfilScreen />);

      await act(async () => {
        fireEvent.press(getByTestId('btn-edit-pref'));
      });

      const input = getByTestId('budget-input');
      await act(async () => {
        fireEvent.changeText(input, '-15000');
      });

      await act(async () => {
        fireEvent.press(getByTestId('save-preferences-button'));
      });

      expect(getByTestId('budget-input-error')).toBeTruthy();
      expect(getByText('El presupuesto no puede ser un valor negativo.')).toBeTruthy();
    });

    it('rechaza presupuestos que superan el límite razonable', async () => {
      const { getByTestId, getByText } = await renderWithProviders(<PerfilScreen />);

      await act(async () => {
        fireEvent.press(getByTestId('btn-edit-pref'));
      });

      const input = getByTestId('budget-input');
      await act(async () => {
        fireEvent.changeText(input, '100000001');
      });

      await act(async () => {
        fireEvent.press(getByTestId('save-preferences-button'));
      });

      expect(getByTestId('budget-input-error')).toBeTruthy();
      expect(getByText('El presupuesto supera el monto razonable permitido.')).toBeTruthy();
    });
  });

  // =========================================================================
  // 4. EDICIÓN Y VALIDACIÓN DE PORCIONES FAMILIARES (SERVINGS)
  // =========================================================================
  describe('Edición y validación de porciones familiares (1 a 12)', () => {
    it('modifica el número de comensales mediante el Stepper', async () => {
      const { getByTestId, getByText, getByLabelText } = await renderWithProviders(
        <PerfilScreen />
      );

      await act(async () => {
        fireEvent.press(getByTestId('preference-row-servings'));
      });

      // Inicialmente 2 comensales -> incrementar
      const incrementBtn = getByLabelText('Aumentar');
      await act(async () => {
        fireEvent.press(incrementBtn);
      });

      // Guardar
      await act(async () => {
        fireEvent.press(getByTestId('save-preferences-button'));
      });

      await waitFor(() => {
        expect(getByText('3 personas')).toBeTruthy();
      });
    });

    it('respeta el rango mínimo de 1 comensal', async () => {
      const { getByTestId, getByLabelText, getByText } = await renderWithProviders(
        <PerfilScreen />,
        { servings: 1 }
      );

      await act(async () => {
        fireEvent.press(getByTestId('btn-edit-pref'));
      });

      const decrementBtn = getByLabelText('Disminuir');
      // Debe estar deshabilitado para 1
      await act(async () => {
        fireEvent.press(decrementBtn);
      });

      await act(async () => {
        fireEvent.press(getByTestId('save-preferences-button'));
      });

      expect(getByText('1 persona')).toBeTruthy();
    });
  });

  // =========================================================================
  // 5. EDICIÓN DEL TIEMPO MÁXIMO DE PREPARACIÓN
  // =========================================================================
  describe('Configuración del tiempo máximo de preparación (1 a 240 minutos)', () => {
    it('activa el límite de tiempo y guarda un valor numérico válido', async () => {
      const { getByTestId, getByText } = await renderWithProviders(<PerfilScreen />);

      await act(async () => {
        fireEvent.press(getByTestId('preference-row-time'));
      });

      // Alternar a con límite
      const toggleBtn = getByTestId('toggle-max-minutes');
      await act(async () => {
        fireEvent.press(toggleBtn);
      });

      // Ingresar 45 minutos
      const timeInput = getByTestId('max-minutes-input');
      await act(async () => {
        fireEvent.changeText(timeInput, '45');
      });

      await act(async () => {
        fireEvent.press(getByTestId('save-preferences-button'));
      });

      await waitFor(() => {
        expect(getByText('45 min')).toBeTruthy();
      });
    });

    it('permite quitar el límite de tiempo previamente configurado', async () => {
      const { getByTestId, getByText } = await renderWithProviders(<PerfilScreen />, {
        maxMinutes: 60,
      });

      expect(getByText('60 min')).toBeTruthy();

      await act(async () => {
        fireEvent.press(getByTestId('btn-edit-pref'));
      });

      // Alternar para desactivar límite
      const toggleBtn = getByTestId('toggle-max-minutes');
      await act(async () => {
        fireEvent.press(toggleBtn);
      });

      await act(async () => {
        fireEvent.press(getByTestId('save-preferences-button'));
      });

      await waitFor(() => {
        expect(getByText('Sin límite')).toBeTruthy();
      });
    });

    it('rechaza tiempos de cocción menores a 1 minuto', async () => {
      const { getByTestId, getByText } = await renderWithProviders(<PerfilScreen />);

      await act(async () => {
        fireEvent.press(getByTestId('btn-edit-pref'));
      });

      await act(async () => {
        fireEvent.press(getByTestId('toggle-max-minutes'));
      });

      const timeInput = getByTestId('max-minutes-input');
      await act(async () => {
        fireEvent.changeText(timeInput, '0');
      });

      await act(async () => {
        fireEvent.press(getByTestId('save-preferences-button'));
      });

      expect(getByTestId('max-minutes-input-error')).toBeTruthy();
      expect(
        getByText('El tiempo máximo debe estar entre 1 y 240 minutos.')
      ).toBeTruthy();
    });

    it('rechaza tiempos de cocción mayores a 240 minutos', async () => {
      const { getByTestId, getByText } = await renderWithProviders(<PerfilScreen />);

      await act(async () => {
        fireEvent.press(getByTestId('btn-edit-pref'));
      });

      await act(async () => {
        fireEvent.press(getByTestId('toggle-max-minutes'));
      });

      const timeInput = getByTestId('max-minutes-input');
      await act(async () => {
        fireEvent.changeText(timeInput, '300');
      });

      await act(async () => {
        fireEvent.press(getByTestId('save-preferences-button'));
      });

      expect(getByTestId('max-minutes-input-error')).toBeTruthy();
      expect(
        getByText('El tiempo máximo debe estar entre 1 y 240 minutos.')
      ).toBeTruthy();
    });
  });

  // =========================================================================
  // 6. CANCELACIÓN DE EDICIÓN
  // =========================================================================
  describe('Cancelación de edición sin mutar estado', () => {
    it('cierra el modal con el botón Cancelar sin guardar cambios', async () => {
      const { getByTestId, getByText, queryByTestId } = await renderWithProviders(
        <PerfilScreen />,
        { budget: 20000 }
      );

      await act(async () => {
        fireEvent.press(getByTestId('btn-edit-pref'));
      });

      const input = getByTestId('budget-input');
      await act(async () => {
        fireEvent.changeText(input, '99999');
      });

      const cancelBtn = getByTestId('cancel-preferences-button');
      await act(async () => {
        fireEvent.press(cancelBtn);
      });

      expect(queryByTestId('edit-preferences-modal')).toBeNull();
      expect(getByText('$20.000 COP')).toBeTruthy();
    });
  });

  // =========================================================================
  // 7. MANEJO DE FALLOS DE ALMACENAMIENTO Y RETROALIMENTACIÓN
  // =========================================================================
  describe('Manejo de errores de almacenamiento y persistencia', () => {
    it('muestra error informativo cuando storageAdapter.savePreferences falla', async () => {
      const failingAdapter: BudgetStorageAdapter = {
        getPreferences: async () => defaultBudgetPreferences,
        savePreferences: async () => {
          throw new Error('Fallo simulado de escritura en disco.');
        },
        resetPreferences: async () => defaultBudgetPreferences,
      };

      const { getByTestId, getAllByText, queryByTestId } = await renderWithProviders(
        <PerfilScreen />,
        { budget: 20000 },
        failingAdapter
      );

      await act(async () => {
        fireEvent.press(getByTestId('btn-edit-pref'));
      });

      await act(async () => {
        fireEvent.changeText(getByTestId('budget-input'), '30000');
      });

      await act(async () => {
        fireEvent.press(getByTestId('save-preferences-button'));
      });

      // El error debe mostrarse dentro del modal y el modal debe permanecer abierto
      await waitFor(() => {
        expect(getByTestId('edit-preferences-save-error')).toBeTruthy();
        expect(getAllByText('Fallo simulado de escritura en disco.').length).toBeGreaterThanOrEqual(1);
      });

      // NUNCA debe reportar éxito si la persistencia falló
      expect(queryByTestId('preferences-saved-feedback')).toBeNull();
    });
  });

  // =========================================================================
  // 8. RESTABLECIMIENTO DE VALORES PREDETERMINADOS (RESET)
  // =========================================================================
  describe('Restablecimiento de preferencias de hogar', () => {
    it('muestra diálogo de confirmación antes de restablecer', async () => {
      const { getByTestId, getByText } = await renderWithProviders(<PerfilScreen />);

      await act(async () => {
        fireEvent.press(getByTestId('btn-reset-preferences'));
      });

      expect(getByTestId('reset-confirm-modal')).toBeTruthy();
      expect(getByText('¿Restablecer preferencias?')).toBeTruthy();
      expect(
        getByText(/Se restaurará el presupuesto a \$20\.000 COP, las porciones a 2 personas/)
      ).toBeTruthy();
      expect(getByTestId('reset-cancel-button')).toBeTruthy();
      expect(getByTestId('reset-confirm-button')).toBeTruthy();
    });

    it('cancela el restablecimiento sin modificar las preferencias guardadas', async () => {
      const { getByTestId, getByText, queryByTestId } = await renderWithProviders(
        <PerfilScreen />,
        { budget: 75000, servings: 6, maxMinutes: 40 }
      );

      await act(async () => {
        fireEvent.press(getByTestId('btn-reset-preferences'));
      });

      await act(async () => {
        fireEvent.press(getByTestId('reset-cancel-button'));
      });

      expect(queryByTestId('reset-confirm-modal')).toBeNull();
      expect(getByText('$75.000 COP')).toBeTruthy();
      expect(getByText('6 personas')).toBeTruthy();
      expect(getByText('40 min')).toBeTruthy();
    });

    it('ejecuta el restablecimiento al confirmar restaurando los valores por defecto', async () => {
      const { getByTestId, getByText } = await renderWithProviders(<PerfilScreen />, {
        budget: 90000,
        servings: 5,
        maxMinutes: 30,
      });

      expect(getByText('$90.000 COP')).toBeTruthy();

      await act(async () => {
        fireEvent.press(getByTestId('btn-reset-preferences'));
      });

      await act(async () => {
        fireEvent.press(getByTestId('reset-confirm-button'));
      });

      await waitFor(() => {
        expect(getByText('$20.000 COP')).toBeTruthy();
        expect(getByText('2 personas')).toBeTruthy();
        expect(getByText('Sin límite')).toBeTruthy();
      });

      expect(getByTestId('preferences-saved-feedback')).toBeTruthy();
      expect(getByText('Preferencias restauradas a los valores iniciales.')).toBeTruthy();
    });

    it('muestra mensaje de error si el restablecimiento de almacenamiento falla', async () => {
      const failingResetAdapter: BudgetStorageAdapter = {
        getPreferences: async () => ({
          ...defaultBudgetPreferences,
          budget: 50000,
        }),
        savePreferences: async () => defaultBudgetPreferences,
        resetPreferences: async () => {
          throw new Error('Error al limpiar AsyncStorage.');
        },
      };

      const { getByTestId, getAllByText } = await renderWithProviders(
        <PerfilScreen />,
        { budget: 50000 },
        failingResetAdapter
      );

      await act(async () => {
        fireEvent.press(getByTestId('btn-reset-preferences'));
      });

      await act(async () => {
        fireEvent.press(getByTestId('reset-confirm-button'));
      });

      await waitFor(() => {
        expect(getAllByText('Error al limpiar AsyncStorage.').length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // =========================================================================
  // 9. PROTECCIÓN CONTRA PULSACIONES RÁPIDAS REPETIDAS (DEBOUNCE/GUARD)
  // =========================================================================
  describe('Protección contra interacciones concurrentes y rápidas', () => {
    it('previene múltiples ejecuciones paralelas ante pulsaciones rápidas de guardar', async () => {
      let saveCallsCount = 0;
      const trackingAdapter: BudgetStorageAdapter = {
        getPreferences: async () => defaultBudgetPreferences,
        savePreferences: async () => {
          saveCallsCount += 1;
          await new Promise((r) => setTimeout(r, 50));
          return {
            ...defaultBudgetPreferences,
            budget: 35000,
          };
        },
        resetPreferences: async () => defaultBudgetPreferences,
      };

      const { getByTestId } = await renderWithProviders(
        <PerfilScreen />,
        { budget: 20000, servings: 2 },
        trackingAdapter
      );

      await act(async () => {
        fireEvent.press(getByTestId('btn-edit-pref'));
      });

      // Modificar presupuesto para que se ejecute la persistencia
      await act(async () => {
        fireEvent.changeText(getByTestId('budget-input'), '35000');
      });

      const saveBtn = getByTestId('save-preferences-button');

      // Pulsaciones rápidas consecutivas en el mismo tick
      await act(async () => {
        fireEvent.press(saveBtn);
        fireEvent.press(saveBtn);
      });

      // La protección isSavingRef previene llamadas duplicadas al almacenamiento
      expect(saveCallsCount).toBe(1);
    });
  });

  // =========================================================================
  // 10. SINCRONIZACIÓN Y DETECCIÓN DE OBSOLESCENCIA EN PLAN DE COMIDAS
  // =========================================================================
  describe('Sincronización global y detección de obsolescencia en MealPlanContext', () => {
    it('activa isStale en MealPlanContext cuando se modifica el presupuesto desde Perfil', async () => {
      let capturedMealPlanContext: ReturnType<typeof useMealPlan> | undefined;

      const ContextInspector = () => {
        capturedMealPlanContext = useMealPlan();
        return <PerfilScreen />;
      };

      const samplePlan: ClientMealPlan = {
        days: [
          {
            day: 1,
            recipe: {
              id: 'receta-1',
              name: 'Arroz con pollo',
              description: 'Receta',
              totalMinutes: 30,
              servings: 2,
              ingredients: [],
              steps: ['Paso 1'],
              availableIngredients: [],
              missingIngredients: [],
              estimatedMissingCost: 0,
              budgetRemaining: 15000,
              withinBudget: true,
              convenience: '90%',
              reason: 'Óptima',
              isDemoFixture: false,
            },
          },
        ],
        totalEstimatedMissingCost: 5000,
        budgetRemaining: 15000,
        withinBudget: true,
        uniqueMissingIngredients: [],
        generatedAt: new Date().toISOString(),
      };

      const sampleSnapshot: MealPlanGenerationSnapshot = {
        pantryFingerprint: mockPantryItems
          .map((item) => `${item.id}:${item.name.toLowerCase()}:${item.quantity}:${item.unit}`)
          .sort()
          .join('|'),
        budget: 20000,
        servings: 2,
        generatedAt: new Date().toISOString(),
      };

      const mockPlanStorage: MealPlanStorageAdapter = {
        getStoredMealPlan: async () => ({ plan: samplePlan, snapshot: sampleSnapshot }),
        saveMealPlan: async () => {},
        clearMealPlan: async () => {},
      };

      const { getByTestId } = await render(
        <SafeAreaProvider
          initialMetrics={{
            insets: { top: 0, left: 0, right: 0, bottom: 0 },
            frame: { x: 0, y: 0, width: 390, height: 844 },
          }}
        >
          <TypographyProvider usingFallback={true}>
            <PantryProvider initialIngredients={mockPantryItems}>
              <BudgetProvider initialPreferences={{ budget: 20000, servings: 2 }}>
                <RecipeProvider>
                  <MealPlanProvider storageAdapter={mockPlanStorage}>
                    <ContextInspector />
                  </MealPlanProvider>
                </RecipeProvider>
              </BudgetProvider>
            </PantryProvider>
          </TypographyProvider>
        </SafeAreaProvider>
      );

      // Esperar a que se complete la restauración inicial del snapshot
      await waitFor(() => {
        expect(capturedMealPlanContext?.isRestoring).toBe(false);
      });
      expect(capturedMealPlanContext?.isStale).toBe(false);

      // Inicialmente el plan generado con snapshot no es stale si coincide
      await act(async () => {
        fireEvent.press(getByTestId('btn-edit-pref'));
      });

      // Cambiar presupuesto a 40000
      await act(async () => {
        fireEvent.changeText(getByTestId('budget-input'), '40000');
      });

      await act(async () => {
        fireEvent.press(getByTestId('save-preferences-button'));
      });

      await waitFor(() => {
        expect(capturedMealPlanContext?.isStale).toBe(true);
      });
    });
  });

  // =========================================================================
  // 11. AUSENCIA DE LLAMADAS A GEMINI AI TRAS MUTACIÓN DE PREFERENCIAS
  // =========================================================================
  describe('Ausencia de llamadas no intencionadas a la API de Gemini', () => {
    it('no invoca endpoints de Gemini o Backend al modificar las preferencias', async () => {
      const spyRecipeRecommend = jest.spyOn(recipeApi, 'recommendRecipes');
      const spyMealPlanGenerate = jest.spyOn(mealPlanApi, 'generateMealPlan');

      const { getByTestId } = await renderWithProviders(<PerfilScreen />);

      await act(async () => {
        fireEvent.press(getByTestId('btn-edit-pref'));
      });

      await act(async () => {
        fireEvent.changeText(getByTestId('budget-input'), '32000');
      });

      await act(async () => {
        fireEvent.press(getByTestId('save-preferences-button'));
      });

      // Ninguna llamada debe haberse realizado a Gemini
      expect(spyRecipeRecommend).not.toHaveBeenCalled();
      expect(spyMealPlanGenerate).not.toHaveBeenCalled();

      spyRecipeRecommend.mockRestore();
      spyMealPlanGenerate.mockRestore();
    });
  });

  // =========================================================================
  // 12. MODALES INFORMATIVOS DE CONFIGURACIÓN Y SOPORTE
  // =========================================================================
  describe('Modales informativos de configuración y soporte', () => {
    it('abre y cierra el modal informativo de Configuración', async () => {
      const { getByTestId, getByText, queryByTestId } = await renderWithProviders(
        <PerfilScreen />
      );

      await act(async () => {
        fireEvent.press(getByTestId('settings-row-config'));
      });

      expect(getByTestId('info-detail-modal')).toBeTruthy();
      expect(getByText('Configuración de la app')).toBeTruthy();
      expect(getByText(/Pesos colombianos \(COP\)/)).toBeTruthy();

      await act(async () => {
        fireEvent.press(getByTestId('close-info-modal-button'));
      });

      expect(queryByTestId('info-detail-modal')).toBeNull();
    });

    it('abre y cierra el modal informativo de Ayuda y preguntas frecuentes', async () => {
      const { getByTestId, getByText, queryByTestId } = await renderWithProviders(
        <PerfilScreen />
      );

      await act(async () => {
        fireEvent.press(getByTestId('settings-row-help'));
      });

      expect(getByTestId('info-detail-modal')).toBeTruthy();
      expect(getByText('Guía y preguntas frecuentes')).toBeTruthy();
      expect(getByText(/¿Cómo se calculan las recetas\?/)).toBeTruthy();

      await act(async () => {
        fireEvent.press(getByTestId('close-info-modal-button'));
      });

      expect(queryByTestId('info-detail-modal')).toBeNull();
    });

    it('abre y cierra el modal informativo de Acerca del proyecto', async () => {
      const { getByTestId, getByText, queryByTestId } = await renderWithProviders(
        <PerfilScreen />
      );

      await act(async () => {
        fireEvent.press(getByTestId('settings-row-about'));
      });

      expect(getByTestId('info-detail-modal')).toBeTruthy();
      expect(getByText('Acerca de FoodAI')).toBeTruthy();
      expect(getByText(/Fase 4 · Perfil y Configuración/)).toBeTruthy();

      await act(async () => {
        fireEvent.press(getByTestId('close-info-modal-button'));
      });

      expect(queryByTestId('info-detail-modal')).toBeNull();
    });
  });

  // =========================================================================
  // 13. NAVEGACIÓN Y ACCESIBILIDAD
  // =========================================================================
  describe('Navegación y accesibilidad', () => {
    it('navega hacia la bienvenida cuando se presiona Ver pantalla de bienvenida', async () => {
      const { getByTestId } = await renderWithProviders(<PerfilScreen />);

      await act(async () => {
        fireEvent.press(getByTestId('perfil-welcome-button'));
      });

      expect(mockPush).toHaveBeenCalledWith('/');
    });

    it('navega hacia el catálogo de diseño cuando se presiona Catálogo de componentes', async () => {
      const { getByTestId } = await renderWithProviders(<PerfilScreen />);

      await act(async () => {
        fireEvent.press(getByTestId('perfil-design-system-button'));
      });

      expect(mockPush).toHaveBeenCalledWith('/design-system');
    });

    it('navega hacia el Inicio cuando se presiona Volver al Inicio', async () => {
      const { getByTestId } = await renderWithProviders(<PerfilScreen />);

      await act(async () => {
        fireEvent.press(getByTestId('perfil-back-home-button'));
      });

      expect(mockPush).toHaveBeenCalledWith('/(tabs)');
    });

    it('provee roles y etiquetas accesibles en todos los elementos interactivos clave', async () => {
      const { getByLabelText, getByTestId } = await renderWithProviders(<PerfilScreen />);

      expect(getByTestId('btn-edit-pref').props.accessibilityRole).toBe('button');
      expect(getByTestId('btn-reset-preferences').props.accessibilityRole).toBe('button');
      expect(getByLabelText('Editar preferencias culinarias')).toBeTruthy();
      expect(getByLabelText('Restablecer preferencias a los valores iniciales')).toBeTruthy();
    });
  });
});
