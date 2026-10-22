/**
 * FoodAI - Tipos y preferencias de presupuesto compartido (Fase 2C).
 */

export const DEFAULT_BUDGET_COP = 20000;
export const DEFAULT_SERVINGS = 2;
export const MIN_BUDGET_COP = 0;
export const MAX_BUDGET_COP = 100000000;
export const MIN_SERVINGS = 1;
export const MAX_SERVINGS = 12;
export const MIN_PREP_MINUTES = 1;
export const MAX_PREP_MINUTES = 240;

export interface BudgetPreferences {
  budget: number; // en pesos colombianos (COP)
  servings: number; // número de comensales (1-12)
  maxMinutes?: number; // tiempo máximo en minutos (1-240)
  updatedAt: string; // ISO 8601
}
