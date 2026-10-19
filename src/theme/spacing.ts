/**
 * FoodAI Design System - Spacing Tokens
 * 4px baseline grid
 */

export const spacing = {
  xs: 4,      // 0.25rem
  sm: 8,      // 0.5rem
  md: 16,     // 1rem
  lg: 24,     // 1.5rem
  xl: 32,     // 2rem
  xxl: 40,    // 2.5rem

  // Layout boundaries
  gutter: 16,
  margin: 16,
  cardPadding: 16,
} as const;

export type SpacingToken = keyof typeof spacing;
