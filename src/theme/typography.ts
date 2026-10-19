/**
 * FoodAI Design System - Typography Tokens
 * Based on Google Stitch specification with Plus Jakarta Sans
 */

import { TextStyle } from 'react-native';

export const fontFamilies = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semiBold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
} as const;

export const fontSizes = {
  xs: 11,
  sm: 12,
  caption: 13,
  body: 14,
  bodyLarge: 16,
  titleSm: 20,
  titleMd: 24,
  titleLg: 26,
  titleXl: 32,
} as const;

export const lineHeights = {
  xs: 14,
  sm: 16,
  caption: 18,
  body: 20,
  bodyLarge: 24,
  titleSm: 28,
  titleMd: 32,
  titleLg: 32,
  titleXl: 40,
} as const;

export const typography = {
  headlineXl: {
    fontFamily: fontFamilies.bold,
    fontSize: fontSizes.titleXl,
    lineHeight: lineHeights.titleXl,
    fontWeight: '700',
    letterSpacing: -0.64,
  } satisfies TextStyle,

  headlineXlMobile: {
    fontFamily: fontFamilies.bold,
    fontSize: fontSizes.titleLg,
    lineHeight: lineHeights.titleLg,
    fontWeight: '700',
    letterSpacing: -0.26,
  } satisfies TextStyle,

  headlineLg: {
    fontFamily: fontFamilies.semiBold,
    fontSize: fontSizes.titleMd,
    lineHeight: lineHeights.titleMd,
    fontWeight: '600',
    letterSpacing: -0.24,
  } satisfies TextStyle,

  headlineMd: {
    fontFamily: fontFamilies.semiBold,
    fontSize: fontSizes.titleSm,
    lineHeight: lineHeights.titleSm,
    fontWeight: '600',
  } satisfies TextStyle,

  bodyLg: {
    fontFamily: fontFamilies.medium,
    fontSize: fontSizes.bodyLarge,
    lineHeight: lineHeights.bodyLarge,
    fontWeight: '500',
  } satisfies TextStyle,

  bodyMd: {
    fontFamily: fontFamilies.regular,
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontWeight: '400',
  } satisfies TextStyle,

  bodySm: {
    fontFamily: fontFamilies.regular,
    fontSize: fontSizes.caption,
    lineHeight: lineHeights.caption,
    fontWeight: '400',
  } satisfies TextStyle,

  labelLg: {
    fontFamily: fontFamilies.semiBold,
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontWeight: '600',
    letterSpacing: 0.14,
  } satisfies TextStyle,

  labelMd: {
    fontFamily: fontFamilies.semiBold,
    fontSize: fontSizes.sm,
    lineHeight: lineHeights.sm,
    fontWeight: '600',
    letterSpacing: 0.24,
  } satisfies TextStyle,

  labelSm: {
    fontFamily: fontFamilies.bold,
    fontSize: fontSizes.xs,
    lineHeight: lineHeights.xs,
    fontWeight: '700',
    letterSpacing: 0.44,
  } satisfies TextStyle,
} as const;

export type TypographyVariant = keyof typeof typography;
