/**
 * FoodAI - Micro-panel de impacto doméstico (Fase 5B).
 * Presenta métricas clave de la despensa de forma compacta y visualmente sobria.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { AppColors, radius, spacing, useTypography, useThemeColors, useThemeStyles } from '../../theme';
import { PantrySummary } from '../../types/pantry';

export interface PantryImpactCardProps {
  summary: PantrySummary;
}

export function PantryImpactCard({ summary }: PantryImpactCardProps) {
  const typography = useTypography();
  const colors = useThemeColors();
  const styles = useThemeStyles(createStyles);

  return (
    <View style={styles.impactGrid}>
      {/* Tarjeta 1: Despensa al día */}
      <View style={styles.impactCard}>
        <View style={styles.impactCardHeader}>
          <Text style={[styles.impactCardLabel, typography.labelSm]}>
            Despensa al día
          </Text>
          <MaterialIcons name="inventory-2" size={18} color={colors.outline} />
        </View>
        <View style={styles.impactValueRow}>
          <Text style={[styles.impactValueBig, typography.headlineLg]}>
            {summary.totalCount}
          </Text>
          <Text style={[styles.impactValueUnit, typography.bodySm]}>insumos</Text>
        </View>
        <Text style={[styles.impactCardSub, typography.bodySm]} numberOfLines={1}>
          {summary.urgentCount > 0
            ? `${summary.urgentCount} por consumir pronto`
            : 'Inventario al día'}
        </Text>
      </View>

      {/* Tarjeta 2: Por consumir pronto */}
      <View style={styles.impactCard}>
        <View style={styles.impactCardHeader}>
          <Text style={[styles.impactCardLabel, typography.labelSm]}>
            Por consumir pronto
          </Text>
          <MaterialIcons name="schedule" size={18} color={colors.outline} />
        </View>
        <View style={styles.impactValueRow}>
          <Text style={[styles.impactValueBig, typography.headlineLg]}>
            {summary.urgentCount}
          </Text>
          <Text style={[styles.impactValueUnit, typography.bodySm]}>alimentos</Text>
        </View>
        <Text style={[styles.impactCardSub, typography.bodySm]} numberOfLines={1}>
          {summary.urgentCount > 0
            ? 'Productos prioritarios'
            : 'Sin urgencias de caducidad'}
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
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.lg,
    padding: spacing.md,
    justifyContent: 'space-between',
    minHeight: 104,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
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
