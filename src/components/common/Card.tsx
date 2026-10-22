import React from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radius, spacing } from '../../theme';

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

const variantStyles: Record<CardVariant, ViewStyle> = {
  elevated: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#5B4B8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  flat: {
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 0,
  },
  outlined: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
};

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
      style={combinedStyle}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  disabled: {
    opacity: 0.6,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.96,
  },
});
