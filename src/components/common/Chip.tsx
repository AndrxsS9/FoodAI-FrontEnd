import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { AppColors, radius, spacing, useTypography, useThemeStyles } from '../../theme';

export type ChipVariant = 'filter' | 'urgent' | 'budget' | 'neutral';

export interface ChipProps {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  variant?: ChipVariant;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: 'button' | 'checkbox' | 'radio';
  testID?: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Chip: React.FC<ChipProps> = ({
  label,
  selected = false,
  disabled = false,
  onPress,
  variant = 'filter',
  leftIcon,
  rightIcon,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  testID,
  style,
  textStyle,
}) => {
  const typography = useTypography();
  const styles = useThemeStyles(createStyles);
  const isPressable = typeof onPress === 'function';

  const containerStyles = [
    styles.base,
    styles[variant],
    selected && styles.selected,
    disabled && styles.disabled,
    style,
  ];

  const content = (
    <>
      {leftIcon && <View style={styles.leftIconWrapper}>{leftIcon}</View>}
      <Text
        style={[
          styles.text,
          typography.labelSm,
          styles[`${variant}Text`],
          selected && styles.selectedText,
          disabled && styles.disabledText,
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
        testID={testID}
        onPress={disabled ? undefined : onPress}
        disabled={disabled}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel || label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ selected, disabled }}
        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
        style={({ pressed }) => [
          containerStyles,
          pressed && !disabled && styles.pressed,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      testID={testID}
      style={containerStyles}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ selected, disabled }}
    >
      {content}
    </View>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    base: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: 34,
      paddingHorizontal: spacing.md - 2,
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
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 0,
    },
    urgent: {
      backgroundColor: colors.secondaryFixed,
      borderWidth: 0,
    },
    budget: {
      backgroundColor: colors.tertiaryFixed,
      borderWidth: 0,
    },
    neutral: {
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 0,
    },

    // Selected State
    selected: {
      backgroundColor: colors.primaryAction,
      borderColor: colors.primaryAction,
    },

    disabled: {
      opacity: 0.5,
      borderColor: colors.borderLight,
    },

    // Text base
    text: {
      textAlign: 'center',
    },

    filterText: {
      color: colors.textPrimary,
    },
    urgentText: {
      color: colors.onSecondaryFixed,
    },
    budgetText: {
      color: colors.onTertiaryFixed,
    },
    neutralText: {
      color: colors.textSecondary,
    },
    selectedText: {
      color: colors.onPrimary,
    },
    disabledText: {
      color: colors.textTertiary,
    },
  });
