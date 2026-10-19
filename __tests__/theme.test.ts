import { colors, radius, spacing, typography } from '../src/theme';

describe('FoodAI Design Tokens (Stitch)', () => {
  describe('Color Tokens', () => {
    it('should have exact brand colors from Stitch specification', () => {
      expect(colors.primary).toBe('#5B4B8A');
      expect(colors.secondary).toBe('#E9775E');
      expect(colors.tertiary).toBe('#F3C969');
      expect(colors.canvas).toBe('#FAF7F2');
      expect(colors.textPrimary).toBe('#252B3A');
      expect(colors.textSecondary).toBe('#6C7280');
      expect(colors.border).toBe('#E8E2D8');
    });

    it('should provide appropriate contrast colors for actions', () => {
      expect(colors.onPrimary).toBe('#FFFFFF');
      expect(colors.onSecondary).toBe('#FFFFFF');
      expect(colors.onTertiary).toBe('#251A00');
    });
  });

  describe('Spacing Tokens', () => {
    it('should adhere to the 4px baseline grid', () => {
      expect(spacing.xs).toBe(4);
      expect(spacing.sm).toBe(8);
      expect(spacing.md).toBe(16);
      expect(spacing.lg).toBe(24);
      expect(spacing.xl).toBe(32);
    });
  });

  describe('Radius Tokens', () => {
    it('should define shapes according to the design system', () => {
      expect(radius.sm).toBe(4);
      expect(radius.md).toBe(8);
      expect(radius.lg).toBe(16);
      expect(radius.xl).toBe(24);
      expect(radius.full).toBe(9999);
    });
  });

  describe('Typography Tokens', () => {
    it('should define Plus Jakarta Sans font families and key variants', () => {
      expect(typography.headlineXl.fontFamily).toBe('PlusJakartaSans_700Bold');
      expect(typography.headlineXl.fontSize).toBe(32);
      expect(typography.headlineLg.fontSize).toBe(24);
      expect(typography.headlineMd.fontSize).toBe(20);
      expect(typography.bodyLg.fontSize).toBe(16);
      expect(typography.bodyMd.fontSize).toBe(14);
      expect(typography.bodySm.fontSize).toBe(13);
      expect(typography.labelLg.fontSize).toBe(14);
      expect(typography.labelMd.fontSize).toBe(12);
      expect(typography.labelSm.fontSize).toBe(11);
    });

    it('should provide safe system typography fallbacks', () => {
      const { systemFontFamilies, systemTypography, getTypography } = require('../src/theme');

      expect(systemFontFamilies.regular).toBeDefined();
      expect(systemFontFamilies.bold).toBeDefined();

      expect(systemTypography.headlineXl.fontSize).toBe(32);
      expect(systemTypography.headlineXl.fontFamily).toBe(systemFontFamilies.bold);

      expect(getTypography('headlineXl', false).fontFamily).toBe('PlusJakartaSans_700Bold');
      expect(getTypography('headlineXl', true).fontFamily).toBe(systemFontFamilies.bold);
    });
  });
});
