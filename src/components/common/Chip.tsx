import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radius, spacing, typography } from '../../theme';

export type ChipVariant = 'filter' | 'urgent' | 'budget' | 'neutral';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  variant?: ChipVariant;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  accessibilityLabel?: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Chip: React.FC<ChipProps> = ({
  label,
  selected = false,
  onPress,
  variant = 'filter',
  leftIcon,
  rightIcon,
  accessibilityLabel,
  style,
  textStyle,
}) => {
  const isPressable = typeof onPress === 'function';

  const containerStyles = [
    styles.base,
    styles[variant],
    selected && styles.selected,
    style,
  ];

  const content = (
    <>
      {leftIcon && <View style={styles.leftIconWrapper}>{leftIcon}</View>}
      <Text
        style={[
          styles.text,
          styles[`${variant}Text`],
          selected && styles.selectedText,
          textStyle,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {rightIcon && <View style={styles.rightIconWrapper}>{rightIcon}</View>}
    </>
  );

  if (isPressable) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || label}
        accessibilityState={{ selected }}
        style={({ pressed }) => [
          containerStyles,
          pressed && styles.pressed,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={containerStyles} accessibilityLabel={accessibilityLabel || label}>
      {content}
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
  },
  leftIconWrapper: {
    marginRight: spacing.xs,
  },
  rightIconWrapper: {
    marginLeft: spacing.xs,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },

  // Variants
  filter: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  urgent: {
    backgroundColor: 'rgba(233, 119, 94, 0.16)', // Coral tint
    borderWidth: 0,
  },
  budget: {
    backgroundColor: 'rgba(243, 201, 105, 0.28)', // Butter Yellow tint
    borderWidth: 0,
  },
  neutral: {
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 0,
  },

  // Selected State (e.g. for active filter or unit selection)
  selected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },

  // Text base
  text: {
    ...typography.labelSm,
    textAlign: 'center',
  },

  filterText: {
    color: colors.textPrimary,
  },
  urgentText: {
    color: colors.secondary,
  },
  budgetText: {
    color: colors.textPrimary,
  },
  neutralText: {
    color: colors.textSecondary,
  },
  selectedText: {
    color: colors.onPrimary,
  },
});
