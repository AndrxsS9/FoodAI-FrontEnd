/**
 * FoodAI Design System - Unified Theme Export
 */

import { colors, lightColors, darkColors } from './colors';
import { typography, fontFamilies, fontSizes, lineHeights } from './typography';
import { spacing } from './spacing';
import { radius } from './radius';
import { shadows } from './shadows';

export const theme = {
  colors,
  lightColors,
  darkColors,
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
export * from '../context/ThemeContext';
export {
  type ThemeStorageAdapter,
  AsyncStorageThemeStorageAdapter,
  APPEARANCE_STORAGE_KEY,
  APPEARANCE_STORAGE_VERSION,
  ThemeStorageError,
  isValidThemeMode,
} from '../services/storage/themeStorage';
