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
import { formatCopCurrency } from '../../types/recipe';

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
  const colors = useThemeColors();
  const styles = useThemeStyles(createStyles);

  return (
    <View style={styles.card}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderLeft}>
          <Text style={[styles.sectionTitle, typography.labelLg]}>
            Preferencias y Configuración
          </Text>
          <Text style={[styles.sectionSubtitle, typography.bodySm]}>
            Preferencias de hogar · Pautas para calcular cantidades y costos sugeridos
          </Text>
        </View>
        <MaterialCommunityIcons name="tune" size={20} color={colors.primary} />
      </View>

      {/* Indicador sutil de carga si está hidratando */}
      {isLoading && (
        <View
          style={styles.budgetLoadingInline}
          accessibilityRole="progressbar"
          accessibilityLabel="Cargando preferencias guardadas..."
          testID="budget-loading-banner"
        >
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.budgetLoadingText, typography.bodySm]}>
            Cargando preferencias guardadas...
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
          accessibilityLabel={`Porciones habituales: ${servings} ${
            servings === 1 ? 'persona' : 'personas'
          }. Toca para modificar.`}
          testID="preference-row-servings"
        >
          <View style={styles.preferenceRowLeft}>
            <View style={styles.preferenceIconBox}>
              <MaterialCommunityIcons name="account-group" size={18} color={colors.primary} />
            </View>
            <View style={styles.preferenceLabelCol}>
              <Text style={[styles.preferenceTitle, typography.labelMd]}>
                Porciones habituales
              </Text>
              <Text style={[styles.preferenceSubtitle, typography.bodySm]}>
                Para cálculo de recetas
              </Text>
            </View>
          </View>

          <View style={styles.preferenceValuePill} testID="profile-servings-display">
            <Text style={[styles.preferenceValueText, typography.labelMd]}>
              {servings} {servings === 1 ? 'persona' : 'personas'}
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
          accessibilityLabel={`Presupuesto por comida: ${formatCopCurrency(
            budget,
            true
          )}. Toca para modificar.`}
          testID="preference-row-budget"
        >
          <View style={styles.preferenceRowLeft}>
            <View style={styles.preferenceIconBox}>
              <MaterialCommunityIcons name="cash-multiple" size={18} color={colors.primary} />
            </View>
            <View style={styles.preferenceLabelCol}>
              <Text style={[styles.preferenceTitle, typography.labelMd]}>
                Presupuesto por comida
              </Text>
              <Text style={[styles.preferenceSubtitle, typography.bodySm]}>
                Tope de referencia objetivo
              </Text>
            </View>
          </View>

          <View style={styles.preferenceValuePill} testID="profile-budget-display">
            <Text style={[styles.preferenceValueText, typography.labelMd]}>
              {formatCopCurrency(budget, true)}
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
          accessibilityLabel={`Tiempo máximo de cocción: ${
            maxMinutes ? `${maxMinutes} min` : 'Sin límite'
          }. Toca para modificar.`}
          testID="preference-row-time"
        >
          <View style={styles.preferenceRowLeft}>
            <View style={styles.preferenceIconBox}>
              <MaterialCommunityIcons name="timer-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.preferenceLabelCol}>
              <Text style={[styles.preferenceTitle, typography.labelMd]}>
                Tiempo máximo de cocción
              </Text>
              <Text style={[styles.preferenceSubtitle, typography.bodySm]}>
                Límite para recetas y planes
              </Text>
            </View>
          </View>

          <View style={styles.preferenceValuePill} testID="profile-time-display">
            <Text style={[styles.preferenceValueText, typography.labelMd]}>
              {maxMinutes ? `${maxMinutes} min` : 'Sin límite'}
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
            ? 'Cargando preferencias guardadas. Por favor espera.'
            : 'Editar preferencias culinarias'
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
          {isLoading ? 'Cargando preferencias...' : 'Editar preferencias'}
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
