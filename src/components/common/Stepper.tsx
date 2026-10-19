import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../../theme';

export interface StepperProps {
  value: number;
  onChange: (newValue: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  accessibilityLabel?: string;
  style?: ViewStyle;
}

export const Stepper: React.FC<StepperProps> = ({
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  unit,
  accessibilityLabel = 'Ajustar cantidad',
  style,
}) => {
  const canDecrement = value > min;
  const canIncrement = value < max;

  const handleDecrement = () => {
    if (canDecrement) {
      const next = Math.max(min, value - step);
      onChange(next);
    }
  };

  const handleIncrement = () => {
    if (canIncrement) {
      const next = Math.min(max, value + step);
      onChange(next);
    }
  };

  return (
    <View style={[styles.container, style]} accessibilityLabel={accessibilityLabel}>
      <Pressable
        onPress={handleDecrement}
        disabled={!canDecrement}
        accessibilityRole="button"
        accessibilityLabel="Disminuir"
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
        <Text style={styles.valueText}>
          {value}
          {unit ? ` ${unit}` : ''}
        </Text>
      </View>

      <Pressable
        onPress={handleIncrement}
        disabled={!canIncrement}
        accessibilityRole="button"
        accessibilityLabel="Aumentar"
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
    ...typography.labelMd,
    color: colors.textPrimary,
    fontWeight: '700',
  },
});
