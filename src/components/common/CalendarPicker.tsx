/**
 * FoodAI - Calendario mensual accesible, sin dependencias nativas.
 * Trabaja con fechas `AAAA-MM-DD` y semanas que inician en lunes.
 * Funciona igual en Android, iOS, web y pruebas, y respeta el tema activo.
 */
import React, { useMemo, useState } from 'react';
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
import {
  MONTH_NAMES,
  WEEKDAY_INITIALS,
  formatLongDate,
  parseIsoDateString,
  toIsoDateString,
} from '../../utils/dateFormat';

/** Límites coherentes con la validación de fechas de la despensa (2000-2100). */
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

export interface CalendarPickerProps {
  /** Fecha seleccionada en formato `AAAA-MM-DD` (vacía si no hay selección). */
  value?: string | null;
  onSelect: (isoDate: string) => void;
  testID?: string;
}

interface VisibleMonth {
  year: number;
  month: number; // 0-11
}

function buildMonthCells({ year, month }: VisibleMonth): (Date | null)[] {
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // lunes = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

export function CalendarPicker({ value, onSelect, testID = 'calendar-picker' }: CalendarPickerProps) {
  const typography = useTypography();
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);

  const todayIso = toIsoDateString(new Date());
  const [visible, setVisible] = useState<VisibleMonth>(() => {
    const initial = parseIsoDateString(value) ?? new Date();
    return { year: initial.getFullYear(), month: initial.getMonth() };
  });

  const weeks = useMemo(() => {
    const cells = buildMonthCells(visible);
    const rows: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7));
    }
    return rows;
  }, [visible]);

  const canGoBack = visible.year > MIN_YEAR || visible.month > 0;
  const canGoForward = visible.year < MAX_YEAR || visible.month < 11;

  const shiftMonth = (delta: number) => {
    setVisible((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const monthLabel = `${MONTH_NAMES[visible.month].charAt(0).toUpperCase()}${MONTH_NAMES[visible.month].slice(1)} ${visible.year}`;

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.headerRow}>
        <Pressable
          testID={`${testID}-prev-month`}
          hitSlop={4}
          onPress={() => shiftMonth(-1)}
          disabled={!canGoBack}
          accessibilityRole="button"
          accessibilityLabel="Mes anterior"
          accessibilityState={{ disabled: !canGoBack }}
          style={({ pressed }) => [
            styles.navButton,
            pressed && styles.navButtonPressed,
            !canGoBack && styles.navButtonDisabled,
          ]}
        >
          <MaterialCommunityIcons name="chevron-left" size={22} color={colors.textPrimary} />
        </Pressable>

        <Text
          testID={`${testID}-month-label`}
          style={[styles.monthLabel, typography.labelLg]}
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
        >
          {monthLabel}
        </Text>

        <Pressable
          testID={`${testID}-next-month`}
          hitSlop={4}
          onPress={() => shiftMonth(1)}
          disabled={!canGoForward}
          accessibilityRole="button"
          accessibilityLabel="Mes siguiente"
          accessibilityState={{ disabled: !canGoForward }}
          style={({ pressed }) => [
            styles.navButton,
            pressed && styles.navButtonPressed,
            !canGoForward && styles.navButtonDisabled,
          ]}
        >
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textPrimary} />
        </Pressable>
      </View>

      <View style={styles.weekRow} importantForAccessibility="no-hide-descendants">
        {WEEKDAY_INITIALS.map((initial) => (
          <Text key={initial} style={[styles.weekdayLabel, typography.labelSm]}>
            {initial}
          </Text>
        ))}
      </View>

      {weeks.map((week, rowIndex) => (
        <View key={`week-${rowIndex}`} style={styles.weekRow}>
          {week.map((date, colIndex) => {
            if (!date) {
              return <View key={`empty-${rowIndex}-${colIndex}`} style={styles.dayCell} />;
            }
            const iso = toIsoDateString(date);
            const isSelected = iso === value;
            const isToday = iso === todayIso;
            const isPast = iso < todayIso;
            return (
              <Pressable
                key={iso}
                testID={`${testID}-day-${iso}`}
                onPress={() => onSelect(iso)}
                accessibilityRole="button"
                accessibilityLabel={`${formatLongDate(date)}${isToday ? ', hoy' : ''}`}
                accessibilityState={{ selected: isSelected }}
                style={styles.dayCell}
              >
                {({ pressed }) => (
                  <View
                    style={[
                      styles.dayCircle,
                      isToday && !isSelected && styles.dayCircleToday,
                      pressed && !isSelected && styles.dayCirclePressed,
                      isSelected && styles.dayCircleSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        typography.labelMd,
                        isPast && styles.dayTextPast,
                        isToday && styles.dayTextToday,
                        isSelected && styles.dayTextSelected,
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderLight,
      paddingHorizontal: spacing.sm,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.xs,
    },
    navButton: {
      width: 40,
      height: 40,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    navButtonPressed: {
      backgroundColor: colors.surfaceContainerHigh,
    },
    navButtonDisabled: {
      opacity: 0.35,
    },
    monthLabel: {
      color: colors.textPrimary,
      fontWeight: '700',
    },
    weekRow: {
      flexDirection: 'row',
    },
    weekdayLabel: {
      flex: 1,
      textAlign: 'center',
      color: colors.textSecondary,
      paddingVertical: spacing.xs,
    },
    dayCell: {
      flex: 1,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayCircle: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayCircleToday: {
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    dayCirclePressed: {
      backgroundColor: colors.surfaceContainerHigh,
    },
    dayCircleSelected: {
      backgroundColor: colors.primaryAction,
    },
    dayText: {
      color: colors.textPrimary,
    },
    // Los días pasados siguen siendo seleccionables (alimentos ya vencidos): atenuados pero legibles
    dayTextPast: {
      color: colors.textSecondary,
    },
    dayTextToday: {
      color: colors.primary,
      fontWeight: '700',
    },
    dayTextSelected: {
      color: colors.onPrimary,
      fontWeight: '700',
    },
  });
