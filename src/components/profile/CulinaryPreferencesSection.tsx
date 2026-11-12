/**
 * FoodAI - Sección de Preferencias Culinarias (Fase 5B).
 * Presenta de forma compacta y accesible las porciones habituales,
 * presupuesto por comida y tiempo máximo de cocción.
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppColors, getAppSurfaces, radius, spacing, useTypography, useThemeColors, useThemeStyles } from '../../theme';
import { useLocale } from '../../context/LocaleContext';

export interface CulinaryPreferencesSectionProps {
  budget: number;
  servings: number;
  maxMinutes?: number | null;
  isLoading?: boolean;
  onOpenEdit: () => void;
}

export function CulinaryPreferencesSection({
  budget,
  servings,
  maxMinutes,
  isLoading = false,
  onOpenEdit,
}: CulinaryPreferencesSectionProps) {
  const typography = useTypography();
  const { t, tp, format } = useLocale();
  const servingsText = tp('people', servings);
  const timeText = maxMinutes ? t('minutesShort', { count: maxMinutes }) : t('profile.culinary.noLimit');
  const colors = useThemeColors();
  const styles = useThemeStyles(createStyles);

  return (
    <View style={styles.card}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderLeft}>
          <Text style={[styles.sectionTitle, typography.labelLg]}>
            {t('profile.culinary.title')}
          </Text>
          <Text style={[styles.sectionSubtitle, typography.bodySm]}>
            {t('profile.culinary.subtitle')}
          </Text>
        </View>
        <MaterialCommunityIcons name="tune" size={20} color={colors.primary} />
      </View>

      {/* Indicador sutil de carga si está hidratando */}
      {isLoading && (
        <View
          style={styles.budgetLoadingInline}
          accessibilityRole="progressbar"
          accessibilityLabel={t('profile.culinary.loading')}
          testID="budget-loading-banner"
        >
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.budgetLoadingText, typography.bodySm]}>
            {t('profile.culinary.loading')}
          </Text>
        </View>
      )}

      <View style={styles.preferencesList}>
        {/* Fila 1: Porciones habituales */}
        <Pressable
          style={({ pressed }) => [
            styles.preferenceRow,
            isLoading && styles.buttonDisabled,
            pressed && !isLoading && styles.preferenceRowPressed,
          ]}
          onPress={onOpenEdit}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityState={{ disabled: isLoading, busy: isLoading }}
          accessibilityLabel={t('profile.culinary.servingsLabel', { value: servingsText })}
          testID="preference-row-servings"
        >
          <View style={styles.preferenceRowLeft}>
            <View style={styles.preferenceIconBox}>
              <MaterialCommunityIcons name="account-group" size={18} color={colors.primary} />
            </View>
            <View style={styles.preferenceLabelCol}>
              <Text style={[styles.preferenceTitle, typography.labelMd]}>
                {t('profile.culinary.servingsTitle')}
              </Text>
              <Text style={[styles.preferenceSubtitle, typography.bodySm]}>
                {t('profile.culinary.servingsSubtitle')}
              </Text>
            </View>
          </View>

          <View style={styles.preferenceValuePill} testID="profile-servings-display">
            <Text style={[styles.preferenceValueText, typography.labelMd]}>
              {servingsText}
            </Text>
          </View>
        </Pressable>

        {/* Fila 2: Presupuesto por comida */}
        <Pressable
          style={({ pressed }) => [
            styles.preferenceRow,
            isLoading && styles.buttonDisabled,
            pressed && !isLoading && styles.preferenceRowPressed,
          ]}
          onPress={onOpenEdit}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityState={{ disabled: isLoading, busy: isLoading }}
          accessibilityLabel={t('profile.culinary.budgetLabel', { value: format.currency(budget) })}
          testID="preference-row-budget"
        >
          <View style={styles.preferenceRowLeft}>
            <View style={styles.preferenceIconBox}>
              <MaterialCommunityIcons name="cash-multiple" size={18} color={colors.primary} />
            </View>
            <View style={styles.preferenceLabelCol}>
              <Text style={[styles.preferenceTitle, typography.labelMd]}>
                {t('profile.culinary.budgetTitle')}
              </Text>
              <Text style={[styles.preferenceSubtitle, typography.bodySm]}>
                {t('profile.culinary.budgetSubtitle')}
              </Text>
            </View>
          </View>

          <View style={styles.preferenceValuePill} testID="profile-budget-display">
            <Text style={[styles.preferenceValueText, typography.labelMd]}>
              {format.currency(budget)}
            </Text>
          </View>
        </Pressable>

        {/* Fila 3: Tiempo máximo de cocción */}
        <Pressable
          style={({ pressed }) => [
            styles.preferenceRow,
            isLoading && styles.buttonDisabled,
            pressed && !isLoading && styles.preferenceRowPressed,
          ]}
          onPress={onOpenEdit}
          disabled={isLoading}
          accessibilityRole="button"
          accessibilityState={{ disabled: isLoading, busy: isLoading }}
          accessibilityLabel={t('profile.culinary.timeLabel', { value: timeText })}
          testID="preference-row-time"
        >
          <View style={styles.preferenceRowLeft}>
            <View style={styles.preferenceIconBox}>
              <MaterialCommunityIcons name="timer-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.preferenceLabelCol}>
              <Text style={[styles.preferenceTitle, typography.labelMd]}>
                {t('profile.culinary.timeTitle')}
              </Text>
              <Text style={[styles.preferenceSubtitle, typography.bodySm]}>
                {t('profile.culinary.timeSubtitle')}
              </Text>
            </View>
          </View>

          <View style={styles.preferenceValuePill} testID="profile-time-display">
            <Text style={[styles.preferenceValueText, typography.labelMd]}>
              {timeText}
            </Text>
          </View>
        </Pressable>
      </View>

      {/* Botón para editar preferencias */}
      <Pressable
        style={({ pressed }) => [
          styles.editPreferencesButton,
          isLoading && styles.buttonDisabled,
          pressed && !isLoading && styles.editPreferencesButtonPressed,
        ]}
        onPress={onOpenEdit}
        disabled={isLoading}
        accessibilityRole="button"
        accessibilityState={{ disabled: isLoading, busy: isLoading }}
        accessibilityLabel={
          isLoading
            ? t('profile.culinary.loadingPleaseWait')
            : t('profile.culinary.editLabel')
        }
        testID="btn-edit-pref"
      >
        {isLoading ? (
          <ActivityIndicator
            size="small"
            color={colors.outline}
            style={{ marginRight: spacing.xs }}
          />
        ) : (
          <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.primary} />
        )}
        <Text
          style={[
            styles.editPreferencesButtonText,
            typography.labelLg,
            isLoading && styles.textDisabled,
          ]}
        >
          {isLoading ? t('profile.culinary.loadingShort') : t('profile.culinary.edit')}
        </Text>
      </Pressable>
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  card: {
    ...getAppSurfaces(colors).card,
    padding: spacing.md,
    gap: spacing.md,
    width: '100%',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeaderLeft: {
    flex: 1,
    marginRight: spacing.sm,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  budgetLoadingInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  budgetLoadingText: {
    color: colors.primary,
  },
  preferencesList: {
    gap: spacing.sm,
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainerLow,
  },
  preferenceRowPressed: {
    backgroundColor: colors.surfaceContainer,
    transform: [{ scale: 0.99 }],
  },
  preferenceRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    minWidth: 0,
    marginRight: spacing.xs,
  },
  preferenceIconBox: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preferenceLabelCol: {
    flex: 1,
    minWidth: 0,
  },
  preferenceTitle: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  preferenceSubtitle: {
    color: colors.textSecondary,
  },
  preferenceValuePill: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  preferenceValueText: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  editPreferencesButton: {
    width: '100%',
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainerLow,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  editPreferencesButtonPressed: {
    backgroundColor: colors.surfaceContainer,
    transform: [{ scale: 0.99 }],
  },
  editPreferencesButtonText: {
    color: colors.primary,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  textDisabled: {
    color: colors.outline,
  },
});
