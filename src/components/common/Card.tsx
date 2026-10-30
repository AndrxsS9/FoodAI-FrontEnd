import React, { useMemo } from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { radius, spacing, useAppTheme } from '../../theme';

export type CardVariant = 'elevated' | 'flat' | 'outlined';

export interface CardProps {
  children: React.ReactNode;
  variant?: CardVariant;
  padding?: keyof typeof spacing | number;
  disabled?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: 'button' | 'text' | 'header' | 'none';
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'elevated',
  padding = 'md',
  disabled = false,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole,
  testID,
  style,
}) => {
  const { colors, activeColorScheme } = useAppTheme();
  const isDark = activeColorScheme === 'dark';

  const variantStyles = useMemo<Record<CardVariant, ViewStyle>>(
    () => ({
      elevated: {
        backgroundColor: colors.surface,
        borderWidth: isDark ? 1 : 0,
        borderColor: isDark ? colors.border : 'transparent',
        shadowColor: colors.cardShadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 14,
        elevation: 3,
      },
      flat: {
        backgroundColor: colors.surfaceContainerLow,
        borderWidth: 0,
      },
      outlined: {
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.borderLight,
      },
    }),
    [colors, isDark]
  );

  const paddingValue = typeof padding === 'number' ? padding : spacing[padding];
  const flattenedCustomStyle = StyleSheet.flatten(style) || {};
  const combinedStyle: ViewStyle = {
    ...styles.base,
    ...variantStyles[variant],
    padding: paddingValue,
    ...(disabled ? styles.disabled : {}),
    ...flattenedCustomStyle,
  };

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={disabled ? undefined : onPress}
        disabled={disabled}
        accessibilityRole={accessibilityRole || 'button'}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled }}
        style={({ pressed }) => [
          combinedStyle,
          pressed && !disabled && styles.pressed,
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      style={combinedStyle}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.995 }],
  },
  disabled: {
    opacity: 0.5,
  },
});
