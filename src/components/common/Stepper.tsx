import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, radius, spacing, useTypography } from '../../theme';

export interface StepperProps {
  value: number;
  onChange: (newValue: number) => void | Promise<void>;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: ViewStyle;
}

const getDecimalPlaces = (num: number): number => {
  if (!Number.isFinite(num)) return 0;
  const parts = num.toString().split('.');
  return parts[1] ? parts[1].length : 0;
};

const roundToPrecision = (num: number, precision: number): number => {
  const factor = Math.pow(10, precision);
  return Math.round(num * factor) / factor;
};

export const Stepper: React.FC<StepperProps> = ({
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  unit,
  disabled = false,
  accessibilityLabel = 'Ajustar cantidad',
  accessibilityHint,
  style,
}) => {
  const typography = useTypography();
  // Normalize min and max bounds safely
  const parsedMin = Number.isFinite(min) ? min : 0;
  const parsedMax = Number.isFinite(max) ? max : 9999;
  const safeMin = Math.min(parsedMin, parsedMax);
  const safeMax = Math.max(parsedMin, parsedMax);

  // Normalize step: must be finite and strictly positive
  const safeStep = Number.isFinite(step) && step > 0 ? step : 1;

  // Decimal precision to prevent IEEE-754 floating-point inaccuracies
  const precision = Math.min(
    Math.max(getDecimalPlaces(safeStep), getDecimalPlaces(value)),
    10
  );

  // Normalize current value safely within bounds
  const parsedValue = Number.isFinite(value) ? value : safeMin;
  const safeValue = roundToPrecision(
    Math.min(Math.max(parsedValue, safeMin), safeMax),
    precision
  );

  const canDecrement = !disabled && safeValue > safeMin;
  const canIncrement = !disabled && safeValue < safeMax;

  const handleDecrement = () => {
    if (!canDecrement) return;
    const rawNext = safeValue - safeStep;
    const clampedNext = Math.max(safeMin, rawNext);
    const roundedNext = roundToPrecision(clampedNext, precision);
    if (Number.isFinite(roundedNext)) {
      try {
        const result = onChange(roundedNext);
        if (result && typeof (result as any).catch === 'function') {
          (result as any).catch(() => {});
        }
      } catch {
        // Ignorar excepciones síncronas en el callback
      }
    }
  };

  const handleIncrement = () => {
    if (!canIncrement) return;
    const rawNext = safeValue + safeStep;
    const clampedNext = Math.min(safeMax, rawNext);
    const roundedNext = roundToPrecision(clampedNext, precision);
    if (Number.isFinite(roundedNext)) {
      try {
        const result = onChange(roundedNext);
        if (result && typeof (result as any).catch === 'function') {
          (result as any).catch(() => {});
        }
      } catch {
        // Ignorar excepciones síncronas en el callback
      }
    }
  };

  return (
    <View
      style={[styles.container, disabled && styles.containerDisabled, style]}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
    >
      <Pressable
        onPress={handleDecrement}
        disabled={!canDecrement}
        accessibilityRole="button"
        accessibilityLabel="Disminuir"
        accessibilityHint={`Disminuir en ${safeStep}${unit ? ` ${unit}` : ''}`}
        accessibilityState={{ disabled: !canDecrement }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={({ pressed }) => [
          styles.stepButton,
          !canDecrement && styles.buttonDisabled,
          pressed && canDecrement && styles.buttonPressed,
        ]}
      >
        <MaterialIcons
          name="remove"
          size={18}
          color={canDecrement ? colors.textPrimary : colors.textTertiary}
        />
      </Pressable>

      <View style={styles.valueContainer}>
        <Text style={[styles.valueText, typography.labelMd, disabled && styles.valueTextDisabled]}>
          {safeValue}
          {unit ? ` ${unit}` : ''}
        </Text>
      </View>

      <Pressable
        onPress={handleIncrement}
        disabled={!canIncrement}
        accessibilityRole="button"
        accessibilityLabel="Aumentar"
        accessibilityHint={`Aumentar en ${safeStep}${unit ? ` ${unit}` : ''}`}
        accessibilityState={{ disabled: !canIncrement }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={({ pressed }) => [
          styles.stepButton,
          !canIncrement && styles.buttonDisabled,
          pressed && canIncrement && styles.buttonPressed,
        ]}
      >
        <MaterialIcons
          name="add"
          size={18}
          color={canIncrement ? colors.textPrimary : colors.textTertiary}
        />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.full,
    padding: 3,
  },
  containerDisabled: {
    opacity: 0.6,
  },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonPressed: {
    backgroundColor: colors.surfaceContainer,
    transform: [{ scale: 0.92 }],
  },
  buttonDisabled: {
    backgroundColor: colors.surfaceContainerLow,
    borderColor: 'transparent',
    opacity: 0.5,
  },
  valueContainer: {
    minWidth: 44,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueText: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  valueTextDisabled: {
    color: colors.textSecondary,
  },
});
