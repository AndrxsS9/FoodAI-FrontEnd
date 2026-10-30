/**
 * FoodAI Design System - Color Tokens
 * Based on Google Stitch specifications for "Recetario por Presupuesto"
 * Supports Light, Dark and System appearance palettes.
 */

export const lightColors = {
  // Brand Anchors
  primary: '#5B4B8A',            // Deep Purple (Primary action, key headers, active states)
  primaryContainer: '#6C5D9B',
  onPrimary: '#FFFFFF',

  secondary: '#E9775E',          // Coral (Food vitality, urgent consumption alerts)
  secondaryContainer: '#FD876D',
  onSecondary: '#FFFFFF',

  tertiary: '#F3C969',           // Butter Yellow (Budget, convenience, financial grounding)
  tertiaryContainer: '#FFDF9B',
  onTertiary: '#251A00',
  onTertiaryContainer: '#503B00',

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
  onErrorContainer: '#802916',

  // Semantic Helpers
  overlay: 'rgba(0, 0, 0, 0.45)',
  backdrop: 'rgba(37, 43, 58, 0.65)',
  cardShadow: '#5B4B8A',
  disabled: '#EBE8E3',
  disabledText: '#9E9AA2',
  demoBadgeBackground: '#FFDF9B',
  demoBadgeText: '#503B00',

  // Demo-aligned accents (Recetario por Presupuesto mockup)
  primaryAction: '#433371',      // Deep action purple for primary buttons
  primaryFixed: '#E8DDFF',       // Lavender tint for icon boxes and soft highlights
  onPrimaryFixed: '#200D4C',
  secondaryFixed: '#FFDAD3',     // Soft coral tint for urgency banners
  onSecondaryFixed: '#802916',
  tertiaryFixed: '#FFDF9B',      // Butter tint for budget surfaces
  onTertiaryFixed: '#251A00',
  heroBackground: '#433371',     // Greeting hero card
  heroAccent: '#5B4B8A',
  onHero: '#FFFFFF',
  onHeroMuted: '#E8DDFF',
} as const;

export const darkColors = {
  // Brand Anchors (Harmonized for dark contrast with > 7:1 ratio on dark canvas)
  primary: '#A996DC',            // Luminous Deep Purple (accessible on #131217)
  primaryContainer: '#443572',
  onPrimary: '#1E103E',          // High contrast deep indigo on primary

  secondary: '#FF8D75',          // Luminous Coral for dark theme
  secondaryContainer: '#5C2317',
  onSecondary: '#380E06',

  tertiary: '#FDD67C',           // Warm Butter Yellow for dark theme
  tertiaryContainer: '#523C00',
  onTertiary: '#2E2100',
  onTertiaryContainer: '#FFDF9B',

  // Canvas & Surfaces (Rich dark tones avoiding harsh pure black)
  canvas: '#131217',             // Neutral dark canvas with warm domestic undertone
  background: '#131217',
  surface: '#1C1A22',            // Elevated surface for cards and sheets
  surfaceContainerLow: '#17151C',
  surfaceContainer: '#22202A',
  surfaceContainerHigh: '#2B2835',
  surfaceContainerHighest: '#353241',

  // Outlines & Borders
  border: '#353240',             // Gentle structural border
  borderLight: '#282532',
  outline: '#948F9B',
  outlineVariant: '#484452',

  // Typography & Text (WCAG AA & AAA compliant contrast)
  textPrimary: '#F3EFF7',        // Crisp off-white text
  textSecondary: '#ABA5B3',      // Muted clarity text
  textTertiary: '#7A7582',
  textInverse: '#1C1A22',

  // System & Semantic Feedback
  success: '#81C784',
  successContainer: '#1B3B1E',
  warning: '#FFB74D',
  error: '#FFB4AB',
  errorContainer: '#5C1D18',
  onError: '#410002',
  onErrorContainer: '#FFDAD6',

  // Semantic Helpers
  overlay: 'rgba(0, 0, 0, 0.70)',
  backdrop: 'rgba(0, 0, 0, 0.75)',
  cardShadow: '#000000',
  disabled: '#2B2835',
  disabledText: '#7A7582',
  demoBadgeBackground: '#523C00',
  demoBadgeText: '#FDD67C',

  // Demo-aligned accents (Recetario por Presupuesto mockup)
  primaryAction: '#A996DC',
  primaryFixed: '#2E2452',
  onPrimaryFixed: '#E8DDFF',
  secondaryFixed: '#4A2018',
  onSecondaryFixed: '#FFB4A4',
  tertiaryFixed: '#3D2E00',
  onTertiaryFixed: '#FFDF9B',
  heroBackground: '#2E2452',
  heroAccent: '#443572',
  onHero: '#FFFFFF',
  onHeroMuted: '#D2C1FF',
} as const;

export type AppColors = {
  [K in keyof typeof lightColors]: string;
};

export const colors: AppColors = lightColors;

export type ColorToken = keyof typeof lightColors;
