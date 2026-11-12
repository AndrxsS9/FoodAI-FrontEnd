/**
 * FoodAI - Tonos e íconos de categoría adaptados al esquema de color activo.
 * Los tonos claros provienen de CATEGORY_CONFIG; en modo oscuro se usan tintes
 * profundos con primer plano luminoso para conservar contraste sin fondos pastel.
 */
import type { ComponentProps } from 'react';
import type { MaterialCommunityIcons } from '@expo/vector-icons';
import { CATEGORY_CONFIG, IngredientCategory } from '../../types/pantry';
import type { ColorScheme } from '../../context/ThemeContext';

export type CategoryIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface CategoryVisual {
  icon: CategoryIconName;
  color: string;
  bgColor: string;
}

const CATEGORY_ICONS: Record<IngredientCategory, CategoryIconName> = {
  'Verduras y frutas': 'food-apple-outline',
  'Carnes y proteínas': 'food-drumstick-outline',
  'Lácteos': 'cheese',
  'Granos y cereales': 'barley',
  'Alacena': 'package-variant-closed',
  'Otros': 'food-outline',
};

const DARK_TONES: Record<IngredientCategory, { color: string; bgColor: string }> = {
  'Verduras y frutas': { color: '#81C784', bgColor: '#1B3B1E' },
  'Carnes y proteínas': { color: '#FFB4A4', bgColor: '#4A2018' },
  'Lácteos': { color: '#FDD67C', bgColor: '#3D2E00' },
  'Granos y cereales': { color: '#E6C98A', bgColor: '#33291A' },
  'Alacena': { color: '#C9B8F5', bgColor: '#2E2452' },
  'Otros': { color: '#ABA5B3', bgColor: '#2B2835' },
};

export function getCategoryVisual(
  category: IngredientCategory,
  scheme: ColorScheme
): CategoryVisual {
  const key: IngredientCategory = CATEGORY_CONFIG[category] ? category : 'Otros';
  const tone =
    scheme === 'dark'
      ? DARK_TONES[key]
      : { color: CATEGORY_CONFIG[key].color, bgColor: CATEGORY_CONFIG[key].bgColor };
  return { icon: CATEGORY_ICONS[key], ...tone };
}
