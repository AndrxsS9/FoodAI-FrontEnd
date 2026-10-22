export interface DemoUrgentItem {
  id: string;
  name: string;
}

export interface DemoPantrySummary {
  totalItems: number;
  urgentItemsCount: number;
  urgentItems: DemoUrgentItem[];
}

export interface DemoRecipeRecommendation {
  id: string;
  title: string;
  description: string;
  estimatedAdditionalCostCop: number;
  prepTimeMinutes: number;
  servings: number;
  convenienceScorePercent: number;
  urgentIngredientsUsedCount: number;
  isSimulatedAiScore: boolean;
}

export interface DemoDashboardData {
  isDemonstrationData: boolean;
  badgeLabel: string;
  noticeText: string;
  initialBudgetCop: number;
  pantrySummary: DemoPantrySummary;
  dailyRecommendation: DemoRecipeRecommendation;
}

/**
 * Fixture de datos de demostración para la pantalla principal de FoodAI (Fase 2A).
 * Estos valores representan una vista previa estática de la interfaz inspirada en Google Stitch
 * y NO corresponden a datos reales sincronizados ni a cálculos reales de inteligencia artificial.
 */
export const DEMO_DASHBOARD_DATA: DemoDashboardData = {
  isDemonstrationData: true,
  badgeLabel: 'Vista de ejemplo',
  noticeText: 'Datos de demostración para evaluación visual',
  initialBudgetCop: 20000,
  pantrySummary: {
    totalItems: 14,
    urgentItemsCount: 3,
    urgentItems: [
      { id: 'item-1', name: 'Tomate' },
      { id: 'item-2', name: 'Pollo' },
      { id: 'item-3', name: 'Espinaca' },
    ],
  },
  /**
   * @deprecated Utilizar `RecipeContext` como fuente única autoritativa para recomendaciones.
   * Este valor se mantiene sincronizado con `BASE_DEMO_RECIPES[0]` para compatibilidad visual.
   */
  dailyRecommendation: {
    id: 'demo-rec-1',
    title: 'Arroz con pollo y verduras',
    description: 'Una preparación balanceada en sartén para aprovechar el pollo y vegetales de tu despensa con una compra mínima.',
    estimatedAdditionalCostCop: 5800,
    prepTimeMinutes: 30,
    servings: 2,
    convenienceScorePercent: 94,
    urgentIngredientsUsedCount: 3,
    isSimulatedAiScore: true,
  },
};
