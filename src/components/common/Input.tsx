import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radius, spacing, useTypography } from '../../theme';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  helperText?: string;
  errorMessage?: string;
  error?: string;
  disabled?: boolean;
  leftElement?: React.ReactNode;
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
}

export const Input: React.FC<InputProps> = ({
  label,
  helperText,
  errorMessage,
  error,
  disabled = false,
  leftElement,
  leftIcon,
  rightElement,
  rightIcon,
  containerStyle,
  inputStyle,
  onFocus,
  onBlur,
  ...textInputProps
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const typography = useTypography();

  const effectiveErrorMessage = errorMessage || error;
  const hasError = Boolean(effectiveErrorMessage);
  const effectiveLeft = leftElement || leftIcon;
  const effectiveRight = rightElement || rightIcon;
  const isEditable = !disabled && textInputProps.editable !== false;

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Text
          style={[styles.label, typography.labelMd, disabled && styles.labelDisabled]}
          accessibilityRole="text"
        >
          {label}
        </Text>
      )}

      <View
        style={[
          styles.inputWrapper,
          isFocused && styles.focusedWrapper,
          hasError && styles.errorWrapper,
          disabled && styles.disabledWrapper,
        ]}
      >
        {effectiveLeft && <View style={styles.leftElement}>{effectiveLeft}</View>}

        <TextInput
          placeholderTextColor={colors.textSecondary}
          {...textInputProps}
          editable={isEditable}
          accessibilityLabel={textInputProps.accessibilityLabel || label || textInputProps.placeholder}
          accessibilityHint={textInputProps.accessibilityHint || helperText}
          accessibilityState={{
            ...textInputProps.accessibilityState,
            disabled: !isEditable,
          }}
          aria-invalid={hasError}
          onFocus={(e) => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, typography.bodyMd, disabled && styles.disabledInput, inputStyle]}
        />

        {effectiveRight && <View style={styles.rightElement}>{effectiveRight}</View>}
      </View>

      {hasError ? (
        <Text
          style={[styles.errorText, typography.bodySm]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {effectiveErrorMessage}
        </Text>
      ) : helperText ? (
        <Text style={[styles.helperText, typography.bodySm]}>{helperText}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: spacing.sm,
  },
  label: {
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  focusedWrapper: {
    borderColor: colors.primary,
  },
  errorWrapper: {
    borderColor: colors.error,
  },
  input: {
    flex: 1,
    height: '100%',
    color: colors.textPrimary,
  },
  leftElement: {
    marginRight: spacing.sm,
  },
  rightElement: {
    marginLeft: spacing.sm,
  },
  helperText: {
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginLeft: spacing.xs,
  },
  labelDisabled: {
    color: colors.textSecondary,
  },
  disabledWrapper: {
    backgroundColor: colors.surfaceContainerLow,
    borderColor: colors.borderLight,
    opacity: 0.7,
  },
  disabledInput: {
    color: colors.textSecondary,
  },
  errorText: {
    color: colors.error,
    marginTop: spacing.xs,
    marginLeft: spacing.xs,
  },
});
