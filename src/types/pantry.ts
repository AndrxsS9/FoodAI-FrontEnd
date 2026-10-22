/**
 * FoodAI - Modelos y tipos del dominio de despensa e ingredientes (Fase 2B).
 */

export const INGREDIENT_UNITS = [
  'unidad',
  'g',
  'kg',
  'ml',
  'l',
  'cucharada',
  'cucharadita',
  'taza',
  'desconocida',
] as const;

export type IngredientUnit = (typeof INGREDIENT_UNITS)[number];

export const INGREDIENT_UNIT_LABELS: Record<IngredientUnit, string> = {
  unidad: 'un',
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'l',
  cucharada: 'cda',
  cucharadita: 'cdta',
  taza: 'taza',
  desconocida: 's/u',
};

export const INGREDIENT_UNIT_NAMES: Record<IngredientUnit, string> = {
  unidad: 'Unidad(es)',
  g: 'Gramos (g)',
  kg: 'Kilogramos (kg)',
  ml: 'Mililitros (ml)',
  l: 'Litros (l)',
  cucharada: 'Cucharada(s)',
  cucharadita: 'Cucharadita(s)',
  taza: 'Taza(s)',
  desconocida: 'Desconocida',
};

export const INGREDIENT_CATEGORIES = [
  'Verduras y frutas',
  'Carnes y proteínas',
  'Lácteos',
  'Granos y cereales',
  'Alacena',
  'Otros',
] as const;

export type IngredientCategory = (typeof INGREDIENT_CATEGORIES)[number];

export interface CategoryVisualConfig {
  icon: string;
  color: string;
  bgColor: string;
}

export const CATEGORY_CONFIG: Record<IngredientCategory, CategoryVisualConfig> = {
  'Verduras y frutas': {
    icon: 'eco',
    color: '#2E7D32',
    bgColor: '#E8F5E9',
  },
  'Carnes y proteínas': {
    icon: 'set-meal',
    color: '#A0402B',
    bgColor: '#FFDAD3',
  },
  'Lácteos': {
    icon: 'lunch-dining',
    color: '#8A5E00',
    bgColor: '#FFDF9B',
  },
  'Granos y cereales': {
    icon: 'grain',
    color: '#65501B',
    bgColor: '#F6F0DC',
  },
  'Alacena': {
    icon: 'kitchen',
    color: '#5B4B8A',
    bgColor: '#E8DDFF',
  },
  'Otros': {
    icon: 'restaurant',
    color: '#49454F',
    bgColor: '#F0EDE9',
  },
};

export interface Ingredient {
  id: string;
  name: string;
  quantity: number;
  unit: IngredientUnit;
  category: IngredientCategory;
  expirationDate?: string; // Formato YYYY-MM-DD
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface CreateIngredientInput {
  name: string;
  quantity: number;
  unit: IngredientUnit;
  category: IngredientCategory;
  expirationDate?: string;
}

export interface UpdateIngredientInput {
  id: string;
  name?: string;
  quantity?: number;
  unit?: IngredientUnit;
  category?: IngredientCategory;
  expirationDate?: string | null;
}

export interface ExpirationStatus {
  isUrgent: boolean;
  daysRemaining: number | null;
  label: string;
  badgeVariant: 'urgent' | 'warning' | 'default';
}

/**
 * Calcula el estado de urgencia de vencimiento de un ingrediente.
 * Si no se proporciona fecha o el formato no es válido, no genera fechas ficticias
 * y retorna un estado neutro disponible.
 */
export function getExpirationStatus(
  expirationDate?: string,
  referenceDate: Date = new Date()
): ExpirationStatus {
  if (!expirationDate || typeof expirationDate !== 'string') {
    return {
      isUrgent: false,
      daysRemaining: null,
      label: 'Disponible',
      badgeVariant: 'default',
    };
  }

  const parts = expirationDate.trim().split('-');
  if (parts.length !== 3) {
    return {
      isUrgent: false,
      daysRemaining: null,
      label: 'Disponible',
      badgeVariant: 'default',
    };
  }

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    return {
      isUrgent: false,
      daysRemaining: null,
      label: 'Disponible',
      badgeVariant: 'default',
    };
  }

  const expDate = new Date(year, month, day, 0, 0, 0, 0);
  if (
    expDate.getFullYear() !== year ||
    expDate.getMonth() !== month ||
    expDate.getDate() !== day
  ) {
    return {
      isUrgent: false,
      daysRemaining: null,
      label: 'Disponible',
      badgeVariant: 'default',
    };
  }

  const today = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
    0,
    0,
    0,
    0
  );

  const diffMs = expDate.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      isUrgent: true,
      daysRemaining: diffDays,
      label: `Vencido (${Math.abs(diffDays)}d)`,
      badgeVariant: 'urgent',
    };
  }

  if (diffDays === 0) {
    return {
      isUrgent: true,
      daysRemaining: 0,
      label: 'Vence hoy',
      badgeVariant: 'urgent',
    };
  }

  if (diffDays === 1) {
    return {
      isUrgent: true,
      daysRemaining: 1,
      label: 'Vence mañana',
      badgeVariant: 'urgent',
    };
  }

  if (diffDays <= 3) {
    return {
      isUrgent: true,
      daysRemaining: diffDays,
      label: `Vence en ${diffDays} días`,
      badgeVariant: 'urgent',
    };
  }

  if (diffDays <= 7) {
    return {
      isUrgent: false,
      daysRemaining: diffDays,
      label: `Consumir pronto (${diffDays}d)`,
      badgeVariant: 'warning',
    };
  }

  return {
    isUrgent: false,
    daysRemaining: diffDays,
    label: 'Disponible',
    badgeVariant: 'default',
  };
}

export interface PantrySummary {
  totalCount: number;
  urgentCount: number;
  urgentIngredients: Ingredient[];
  availableIngredients: Ingredient[];
  categoriesBreakdown: Record<IngredientCategory, number>;
}
