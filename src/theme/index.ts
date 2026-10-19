/**
 * FoodAI Design System - Unified Theme Export
 */

import { colors } from './colors';
import { typography, fontFamilies, fontSizes, lineHeights } from './typography';
import { spacing } from './spacing';
import { radius } from './radius';
import { shadows } from './shadows';

export const theme = {
  colors,
  typography,
  fontFamilies,
  fontSizes,
  lineHeights,
  spacing,
  radius,
  shadows,
} as const;

export type Theme = typeof theme;

export * from './colors';
export * from './typography';
export * from './spacing';
export * from './radius';
export * from './shadows';
