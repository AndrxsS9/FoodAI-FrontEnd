/**
 * FoodAI Design System - Color Tokens
 * Based on Google Stitch specifications for "Recetario por Presupuesto"
 */

export const colors = {
  // Brand Anchors
  primary: '#5B4B8A',            // Deep Purple (Primary action, key headers, active states)
  primaryContainer: '#6C5D9B',
  onPrimary: '#FFFFFF',

  secondary: '#E9775E',          // Coral (Food vitality, urgent consumption alerts)
  secondaryContainer: '#FD876D',
  onSecondary: '#FFFFFF',

  tertiary: '#F3C969',           // Butter Yellow (Budget, convenience, financial grounding)
  tertiaryContainer: '#6C5100',
  onTertiary: '#251A00',

  // Canvas & Surfaces (Warm domestic Ivory feel)
  canvas: '#FAF7F2',             // Neutral Ivory canvas
  background: '#FAF7F2',
  surface: '#FFFFFF',            // Crisp card surface
  surfaceContainerLow: '#F6F3EE',
  surfaceContainer: '#F0EDE9',
  surfaceContainerHigh: '#EBE8E3',
  surfaceContainerHighest: '#E5E2DD',

  // Outlines & Borders
  border: '#E8E2D8',             // Low-contrast structural border
  borderLight: '#F0EDE9',
  outline: '#7A7580',
  outlineVariant: '#CAC4D1',

  // Typography & Text
  textPrimary: '#252B3A',        // Night Blue (High contrast text, headers, values)
  textSecondary: '#6C7280',      // Muted clarity text (timestamps, helpers, units)
  textTertiary: '#9E9AA2',
  textInverse: '#FAF7F2',

  // System & Semantic Feedback
  success: '#2E7D32',
  successContainer: '#E8F5E9',
  warning: '#ED6C02',
  error: '#BA1A1A',
  errorContainer: '#FFDAD6',
  onError: '#FFFFFF',
} as const;

export type ColorToken = keyof typeof colors;
