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

  // Lenguaje visual púrpura aprobado (superficies, controles y navegación)
  cta: '#433371',                // Fondo sólido de la acción principal
  cardBorder: '#E8DDFF',
  divider: '#F0EDE9',
  fieldBackground: '#FAF7F2',
  fieldBorder: '#6C5D9B',
  controlBorder: '#CAC4D1',
  selected: '#433371',
  hintBackground: '#E8DDFF',
  hintText: '#200D4C',
  iconTile: '#E8DDFF',
  dockSurface: '#FFFFFF',
  brandTile: '#5B4498',
  tabPill: '#E8DDFF',
  tabActive: '#5B4B8A',
  // Degradados: vacíos cuando el tema usa superficies sólidas
  gradientCanvas: '',
  gradientCard: '',
  gradientTile: '',
  gradientCta: 'linear-gradient(180deg, #5B4B8A 0%, #433371 100%)',
  gradientBrand: 'linear-gradient(150deg, #8166CC 0%, #4F3A91 100%)',
  // Sombras: boxShadow no altera el orden de pintado, a diferencia de elevation en Android
  shadowFloat: '0px 6px 18px rgba(91, 75, 138, 0.18)',
  shadowDock: '0px -4px 16px rgba(91, 75, 138, 0.14)',
  shadowSelected: '',
} as const;

export const darkColors = {
  // Brand Anchors (Harmonized for dark contrast with > 7:1 ratio on dark canvas)
  primary: '#CDB6FF',            // Acento púrpura luminoso (accesible sobre lienzo y tarjetas)
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
  surface: '#231B38',            // Tarjetas y hojas: púrpura profundo
  surfaceContainerLow: '#171225',
  surfaceContainer: '#2B2244',
  surfaceContainerHigh: '#342A50',
  surfaceContainerHighest: '#3D3260',

  // Outlines & Borders
  border: '#46386F',             // Borde estructural púrpura
  borderLight: '#3A2E5C',
  outline: '#A79FB8',
  outlineVariant: '#55467F',

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
  disabled: '#342A50',
  disabledText: '#8F88A0',
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

  // Lenguaje visual púrpura aprobado (superficies, controles y navegación)
  cta: '#B99AF0',
  cardBorder: '#46386F',
  divider: '#3A2E5C',
  fieldBackground: '#171225',
  fieldBorder: '#7561B0',
  controlBorder: '#55467F',
  selected: '#BFA2F2',
  hintBackground: '#3A2C60',
  hintText: '#D9CCFF',
  iconTile: '#3A2C60',
  dockSurface: '#1C1730',
  brandTile: '#5B4498',
  tabPill: '#46337A',
  tabActive: '#D9C7FF',
  gradientCanvas: 'linear-gradient(180deg, #241A3E 0%, #15121D 24%, #131217 50%)',
  gradientCard: 'linear-gradient(155deg, #2E2350 0%, #1E1830 62%, #1A1529 100%)',
  gradientTile: 'linear-gradient(150deg, #2B2240 0%, #1C1829 100%)',
  gradientCta: 'linear-gradient(180deg, #CDB0F7 0%, #AE8BE8 100%)',
  gradientBrand: 'linear-gradient(150deg, #8166CC 0%, #4F3A91 100%)',
  shadowFloat: '0px 8px 22px rgba(0, 0, 0, 0.5)',
  shadowDock: '0px -6px 20px rgba(0, 0, 0, 0.45)',
  shadowSelected: '0px 2px 10px rgba(191, 162, 242, 0.45)',
} as const;

export type AppColors = {
  [K in keyof typeof lightColors]: string;
};

export const colors: AppColors = lightColors;

export type ColorToken = keyof typeof lightColors;
