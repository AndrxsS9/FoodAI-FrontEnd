/**
 * FoodAI Design System - Border Radius Tokens
 */

export const radius = {
  sm: 4,      // 0.25rem - standard badges, tiny chips
  md: 8,      // 0.5rem - steppers, small controls
  lg: 16,     // 1.0rem - primary cards, list items, container wrappers
  xl: 24,     // 1.5rem - bottom sheets, modal banners, large cards
  full: 9999, // Pill formats, circular avatars, round chips
} as const;

export type RadiusToken = keyof typeof radius;
