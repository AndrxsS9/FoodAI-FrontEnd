import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Button, Card, Chip, Header } from '../../src/components/common';
import { colors, radius, spacing, useTypography } from '../../src/theme';

export default function PlanScreen() {
  const typography = useTypography();
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <Header
        title="Plan Semanal"
        subtitle="Stitch Pantalla 12 · En desarrollo"
        rightElement={
          <View style={styles.badgeWrapper}>
            <Text style={[styles.badgeText, typography.labelSm]}>Fase 3</Text>
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Card variant="elevated" style={styles.statusCard}>
          <View style={styles.statusIconWrapper}>
            <MaterialIcons name="calendar-today" size={32} color={colors.primary} />
          </View>

          <Text style={[styles.statusTitle, typography.headlineMd]}>
            Planificación de Comidas y Presupuesto
          </Text>

          <Text style={[styles.statusDescription, typography.bodyMd]}>
            Esta sección corresponde a la pantalla original «12. Plan» de Google Stitch.
            Permitirá distribuir el menú de la semana minimizando compras adicionales y optimizando el presupuesto fijado.
          </Text>

          <View style={styles.featuresList}>
            <View style={styles.featureItem}>
              <MaterialIcons name="event-note" size={18} color={colors.primary} />
              <Text style={[styles.featureText, typography.bodySm]}>
                Calendario interactivo de lunes a domingo
              </Text>
            </View>

            <View style={styles.featureItem}>
              <MaterialIcons name="savings" size={18} color={colors.secondary} />
              <Text style={[styles.featureText, typography.bodySm]}>
                Límite de presupuesto distribuido por comida
              </Text>
            </View>

            <View style={styles.featureItem}>
              <MaterialIcons name="shopping-cart" size={18} color={colors.tertiaryContainer} />
              <Text style={[styles.featureText, typography.bodySm]}>
                Lista de compras generada automáticamente
              </Text>
            </View>
          </View>

          <View style={styles.chipsRow}>
            <Chip label="7 días de planificación" variant="budget" selected={false} />
            <Chip label="Estimado $20.000 COP" variant="filter" selected />
          </View>

          <Button
            testID="plan-back-home-button"
            title="Volver al Inicio"
            variant="primary"
            size="md"
            fullWidth
            onPress={() => router.push('/(tabs)')}
            leftIcon={<MaterialIcons name="arrow-back" size={18} color={colors.onPrimary} />}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  scrollContent: {
    padding: spacing.margin,
    paddingBottom: spacing.xxl,
  },
  badgeWrapper: {
    backgroundColor: 'rgba(243, 201, 105, 0.25)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  badgeText: {
    color: colors.tertiaryContainer,
    fontWeight: '700',
  },
  statusCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  statusIconWrapper: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
    textAlign: 'center',
  },
  statusDescription: {
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  featuresList: {
    width: '100%',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  featureText: {
    color: colors.textPrimary,
    flex: 1,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
  },
});
