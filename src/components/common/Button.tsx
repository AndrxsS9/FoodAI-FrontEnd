import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radius, spacing, useTypography } from '../../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

const sizeTypographyMap: Record<ButtonSize, 'labelSm' | 'labelMd' | 'labelLg'> = {
  sm: 'labelSm',
  md: 'labelMd',
  lg: 'labelLg',
};

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
  textStyle,
}) => {
  const typography = useTypography();
  const isInteractive = !disabled && !loading;
  const computedAccessibilityLabel = loading
    ? `${accessibilityLabel || title}, cargando`
    : (accessibilityLabel || title);

  return (
    <Pressable
      testID={testID}
      onPress={isInteractive ? onPress : undefined}
      disabled={!isInteractive}
      accessibilityRole="button"
      accessibilityLabel={computedAccessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !isInteractive, busy: loading }}
      hitSlop={size === 'sm' ? { top: 6, bottom: 6, left: 4, right: 4 } : undefined}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        styles[size],
        fullWidth && styles.fullWidth,
        pressed && isInteractive && styles[`${variant}Pressed`],
        pressed && isInteractive && styles.pressedTransform,
        disabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'outline' || variant === 'ghost' ? colors.primary : colors.onPrimary}
        />
      ) : (
        <View style={styles.contentRow}>
          {leftIcon && <View style={styles.leftIconWrapper}>{leftIcon}</View>}
          <Text
            style={[
              styles.textBase,
              typography[sizeTypographyMap[size]],
              styles[`${variant}Text`],
              disabled && styles.disabledText,
              textStyle,
            ]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {rightIcon && <View style={styles.rightIconWrapper}>{rightIcon}</View>}
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
  },
  fullWidth: {
    width: '100%',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftIconWrapper: {
    marginRight: spacing.sm,
  },
  rightIconWrapper: {
    marginLeft: spacing.sm,
  },
  pressedTransform: {
    transform: [{ scale: 0.99 }],
  },

  // Sizes
  sm: {
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  md: {
    height: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
  },
  lg: {
    height: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.xl,
  },

  // Variants
  primary: {
    backgroundColor: colors.primary,
  },
  primaryPressed: {
    backgroundColor: '#4C3C7A',
  },
  secondary: {
    backgroundColor: colors.secondary,
  },
  secondaryPressed: {
    backgroundColor: '#D6654C',
  },
  tertiary: {
    backgroundColor: colors.tertiary,
  },
  tertiaryPressed: {
    backgroundColor: '#E5B955',
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  outlinePressed: {
    backgroundColor: colors.canvas,
    borderColor: colors.outlineVariant,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  ghostPressed: {
    backgroundColor: colors.surfaceContainerLow,
  },

  // Disabled
  disabled: {
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: 'transparent',
    opacity: 0.65,
  },

  // Text base
  textBase: {
    textAlign: 'center',
  },

  // Text variant colors
  primaryText: {
    color: colors.onPrimary,
  },
  secondaryText: {
    color: colors.onSecondary,
  },
  tertiaryText: {
    color: colors.onTertiary,
  },
  outlineText: {
    color: colors.textPrimary,
  },
  ghostText: {
    color: colors.primary,
  },
  disabledText: {
    color: colors.textSecondary,
  },
});
