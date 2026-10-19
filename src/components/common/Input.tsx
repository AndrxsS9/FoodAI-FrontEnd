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
import { colors, radius, spacing, typography } from '../../theme';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  helperText?: string;
  errorMessage?: string;
  disabled?: boolean;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
}

export const Input: React.FC<InputProps> = ({
  label,
  helperText,
  errorMessage,
  disabled = false,
  leftElement,
  rightElement,
  containerStyle,
  inputStyle,
  onFocus,
  onBlur,
  ...textInputProps
}) => {
  const [isFocused, setIsFocused] = useState(false);

  const hasError = Boolean(errorMessage);
  const isEditable = !disabled && textInputProps.editable !== false;

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Text
          style={[styles.label, disabled && styles.labelDisabled]}
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
        {leftElement && <View style={styles.leftElement}>{leftElement}</View>}

        <TextInput
          placeholderTextColor={colors.textSecondary}
          editable={isEditable}
          accessibilityLabel={textInputProps.accessibilityLabel || label || textInputProps.placeholder}
          accessibilityHint={textInputProps.accessibilityHint || helperText}
          accessibilityState={{ disabled: !isEditable, ...textInputProps.accessibilityState }}
          aria-invalid={hasError}
          onFocus={(e) => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, disabled && styles.disabledInput, inputStyle]}
          {...textInputProps}
        />

        {rightElement && <View style={styles.rightElement}>{rightElement}</View>}
      </View>

      {hasError ? (
        <Text
          style={styles.errorText}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {errorMessage}
        </Text>
      ) : helperText ? (
        <Text style={styles.helperText}>{helperText}</Text>
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
    ...typography.labelMd,
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
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  leftElement: {
    marginRight: spacing.sm,
  },
  rightElement: {
    marginLeft: spacing.sm,
  },
  helperText: {
    ...typography.bodySm,
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
    ...typography.bodySm,
    color: colors.error,
    marginTop: spacing.xs,
    marginLeft: spacing.xs,
  },
});
