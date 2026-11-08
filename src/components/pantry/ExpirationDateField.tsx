/**
 * FoodAI - Campo de fecha de caducidad con calendario y atajos rápidos.
 * El valor se conserva como texto `AAAA-MM-DD` (vacío = sin fecha de caducidad),
 * por lo que la validación y la persistencia existentes no cambian.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  AppColors,
  radius,
  spacing,
  useAppTheme,
  useThemeStyles,
  useTypography,
} from '../../theme';
import { CalendarPicker } from '../common/CalendarPicker';
import {
  addDaysFromToday,
  describeRelativeExpiration,
  formatShortDate,
} from '../../utils/dateFormat';

interface QuickOption {
  testID: string;
  label: string;
  accessibilityLabel: string;
  days: number | null;
}

const QUICK_OPTIONS: QuickOption[] = [
  { testID: 'quick-exp-none', label: 'Sin fecha', accessibilityLabel: 'Sin fecha de caducidad', days: null },
  { testID: 'quick-exp-3d', label: '3 días', accessibilityLabel: 'Vence en 3 días', days: 3 },
  { testID: 'quick-exp-7d', label: '1 semana', accessibilityLabel: 'Vence en 1 semana', days: 7 },
  { testID: 'quick-exp-15d', label: '15 días', accessibilityLabel: 'Vence en 15 días', days: 15 },
];

export interface ExpirationDateFieldProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function ExpirationDateField({ value, onChange, error }: ExpirationDateFieldProps) {
  const typography = useTypography();
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const trimmed = value.trim();
  const hasDate = trimmed.length > 0;
  const formatted = formatShortDate(trimmed);
  const relative = describeRelativeExpiration(trimmed);

  const title = !hasDate ? 'Sin fecha de caducidad' : formatted ?? trimmed;
  const subtitle = !hasDate
    ? 'No se mostrarán alertas de vencimiento'
    : relative ?? 'Fecha no válida, elige otra en el calendario';

  const handleQuick = (days: number | null) => {
    onChange(days === null ? '' : addDaysFromToday(days));
    setIsCalendarOpen(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, typography.labelMd]}>Fecha de caducidad</Text>
        <Text style={[styles.optionalPill, typography.labelSm]}>Opcional</Text>
      </View>

      <Pressable
        testID="ingredient-expiration-trigger"
        onPress={() => setIsCalendarOpen((open) => !open)}
        accessibilityRole="button"
        accessibilityLabel={`Fecha de caducidad: ${title}. ${subtitle}`}
        accessibilityHint={isCalendarOpen ? 'Ocultar calendario' : 'Abrir calendario para elegir la fecha'}
        accessibilityState={{ expanded: isCalendarOpen }}
        style={({ pressed }) => [
          styles.trigger,
          isCalendarOpen && styles.triggerOpen,
          Boolean(error) && styles.triggerError,
          pressed && styles.triggerPressed,
        ]}
      >
        <View style={[styles.triggerIcon, hasDate && styles.triggerIconActive]}>
          <MaterialCommunityIcons
            name={hasDate ? 'calendar-check-outline' : 'calendar-remove-outline'}
            size={20}
            color={hasDate ? colors.primary : colors.textSecondary}
          />
        </View>
        <View style={styles.triggerTextCol}>
          <Text
            testID="ingredient-expiration-value"
            style={[styles.triggerTitle, typography.labelLg, !hasDate && styles.triggerTitleMuted]}
          >
            {title}
          </Text>
          <Text style={[styles.triggerSubtitle, typography.bodySm]}>{subtitle}</Text>
        </View>
        <MaterialCommunityIcons
          name={isCalendarOpen ? 'chevron-up' : 'chevron-down'}
          size={22}
          color={colors.textSecondary}
        />
      </Pressable>

      <View style={styles.quickRow}>
        {QUICK_OPTIONS.map((option) => {
          const isActive =
            option.days === null ? !hasDate : trimmed === addDaysFromToday(option.days);
          return (
            <Pressable
              key={option.testID}
              testID={option.testID}
              hitSlop={{ top: 2, bottom: 2 }}
              onPress={() => handleQuick(option.days)}
              accessibilityRole="button"
              accessibilityLabel={option.accessibilityLabel}
              accessibilityState={{ selected: isActive }}
              style={({ pressed }) => [
                styles.quickChip,
                isActive && styles.quickChipActive,
                pressed && !isActive && styles.quickChipPressed,
              ]}
            >
              {option.days === null && (
                <MaterialCommunityIcons
                  name="infinity"
                  size={14}
                  color={isActive ? colors.onPrimary : colors.textSecondary}
                />
              )}
              <Text
                style={[
                  styles.quickChipText,
                  typography.labelMd,
                  isActive && styles.quickChipTextActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isCalendarOpen && (
        <CalendarPicker
          testID="ingredient-expiration-calendar"
          value={hasDate ? trimmed : null}
          onSelect={(iso) => {
            onChange(iso);
            setIsCalendarOpen(false);
          }}
        />
      )}

      {Boolean(error) && (
        <Text
          style={[styles.errorText, typography.bodySm]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      )}
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      gap: spacing.sm,
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    label: {
      color: colors.textPrimary,
    },
    optionalPill: {
      color: colors.textSecondary,
      backgroundColor: colors.surfaceContainer,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.full,
      overflow: 'hidden',
    },
    trigger: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 60,
      paddingHorizontal: spacing.sm + 4,
      paddingVertical: spacing.sm,
      borderRadius: radius.md + 4,
      borderWidth: 1.5,
      borderColor: colors.borderLight,
      backgroundColor: colors.surface,
    },
    triggerOpen: {
      borderColor: colors.primary,
    },
    triggerError: {
      borderColor: colors.error,
    },
    triggerPressed: {
      backgroundColor: colors.surfaceContainerLow,
    },
    triggerIcon: {
      width: 38,
      height: 38,
      borderRadius: radius.md + 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceContainer,
    },
    triggerIconActive: {
      backgroundColor: colors.primaryFixed,
    },
    triggerTextCol: {
      flex: 1,
      minWidth: 0,
      gap: 1,
    },
    triggerTitle: {
      color: colors.textPrimary,
    },
    triggerTitleMuted: {
      color: colors.textSecondary,
    },
    triggerSubtitle: {
      color: colors.textSecondary,
    },
    quickRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    quickChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      minHeight: 40,
      paddingHorizontal: spacing.sm + 4,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    quickChipActive: {
      backgroundColor: colors.primaryAction,
      borderColor: colors.primaryAction,
    },
    quickChipPressed: {
      backgroundColor: colors.surfaceContainerLow,
    },
    quickChipText: {
      color: colors.textSecondary,
    },
    quickChipTextActive: {
      color: colors.onPrimary,
    },
    errorText: {
      color: colors.error,
      marginLeft: spacing.xs,
    },
  });
