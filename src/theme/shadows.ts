/**
 * FoodAI Design System - Elevation & Shadows
 * Tactile warm shadows with subtle deep purple undertone
 */

import { ViewStyle } from 'react-native';

export const shadows: Record<'none' | 'card' | 'modal', ViewStyle> = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },

  // Resting card shadow: tactile and gentle
  card: {
    shadowColor: '#5B4B8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },

  // Floating modal / sheet shadow: deeper elevation
  modal: {
    shadowColor: '#5B4B8A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 6,
  },
};
