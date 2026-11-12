/**
 * FoodAI - Micro-panel de impacto doméstico (Fase 5B).
 * Presenta métricas clave de la despensa de forma compacta y visualmente sobria.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppColors, getAppSurfaces, spacing, useTypography, useThemeColors, useThemeStyles } from '../../theme';
import { useLocale } from '../../context/LocaleContext';
import { PantrySummary } from '../../types/pantry';

export interface PantryImpactCardProps {
  summary: PantrySummary;
}

export function PantryImpactCard({ summary }: PantryImpactCardProps) {
  const typography = useTypography();
  const { t, tp } = useLocale();
  const colors = useThemeColors();
  const styles = useThemeStyles(createStyles);

  return (
    <View style={styles.impactGrid}>
      {/* Tarjeta 1: Despensa al día */}
      <View style={styles.impactCard}>
        <View style={styles.impactCardHeader}>
          <Text style={[styles.impactCardLabel, typography.labelSm]}>
            {t('profile.impact.pantryUpToDate')}
          </Text>
          <MaterialCommunityIcons name="package-variant-closed" size={18} color={colors.outline} />
        </View>
        <View style={styles.impactValueRow}>
          <Text style={[styles.impactValueBig, typography.headlineLg]}>
            {summary.totalCount}
          </Text>
          <Text style={[styles.impactValueUnit, typography.bodySm]}>{t('profile.impact.itemsUnit')}</Text>
        </View>
        <Text style={[styles.impactCardSub, typography.bodySm]} numberOfLines={1}>
          {summary.urgentCount > 0
            ? tp('profile.impact.urgentSoon', summary.urgentCount)
            : t('profile.impact.inventoryUpToDate')}
        </Text>
      </View>

      {/* Tarjeta 2: Por consumir pronto */}
      <View style={styles.impactCard}>
        <View style={styles.impactCardHeader}>
          <Text style={[styles.impactCardLabel, typography.labelSm]}>
            {t('profile.impact.consumeSoon')}
          </Text>
          <MaterialCommunityIcons name="clock-outline" size={18} color={colors.outline} />
        </View>
        <View style={styles.impactValueRow}>
          <Text style={[styles.impactValueBig, typography.headlineLg]}>
            {summary.urgentCount}
          </Text>
          <Text style={[styles.impactValueUnit, typography.bodySm]}>{t('profile.impact.foodsUnit')}</Text>
        </View>
        <Text style={[styles.impactCardSub, typography.bodySm]} numberOfLines={1}>
          {summary.urgentCount > 0
            ? t('profile.impact.priorityProducts')
            : t('profile.impact.noUrgencies')}
        </Text>
      </View>
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  impactGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  impactCard: {
    flex: 1,
    ...getAppSurfaces(colors).tile,
    padding: spacing.md,
    justifyContent: 'space-between',
    minHeight: 104,
  },
  impactCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  impactCardLabel: {
    color: colors.outline,
    textTransform: 'uppercase',
    fontWeight: '600',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  impactValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  impactValueBig: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  impactValueUnit: {
    color: colors.textSecondary,
  },
  impactCardSub: {
    color: colors.outline,
    marginTop: 2,
    fontSize: 12,
  },
});
