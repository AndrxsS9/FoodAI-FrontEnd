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

export default function DespensaScreen() {
  const typography = useTypography();
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <Header
        title="Mi Despensa"
        subtitle="Stitch Pantalla 6 · En desarrollo"
        rightElement={
          <View style={styles.badgeWrapper}>
            <Text style={[styles.badgeText, typography.labelSm]}>Fase 2B</Text>
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Development Status Notice Card */}
        <Card variant="elevated" style={styles.statusCard}>
          <View style={styles.statusIconWrapper}>
            <MaterialIcons name="kitchen" size={32} color={colors.primary} />
          </View>

          <Text style={[styles.statusTitle, typography.headlineMd]}>
            Inventario de Despensa
          </Text>

          <Text style={[styles.statusDescription, typography.bodyMd]}>
            Esta sección corresponde a la pantalla original «6. Mi Despensa» de Google Stitch.
            Su desarrollo funcional completo se integrará en la Fase 2B con persistencia y sincronización tras el escaneo.
          </Text>

          <View style={styles.featuresList}>
            <View style={styles.featureItem}>
              <MaterialIcons name="check-circle" size={18} color={colors.primary} />
              <Text style={[styles.featureText, typography.bodySm]}>
                Categorización de frescos, refrigerados y alacena
              </Text>
            </View>

            <View style={styles.featureItem}>
              <MaterialIcons name="check-circle" size={18} color={colors.secondary} />
              <Text style={[styles.featureText, typography.bodySm]}>
                Alertas automáticas de consumo prioritario
              </Text>
            </View>

            <View style={styles.featureItem}>
              <MaterialIcons name="check-circle" size={18} color={colors.tertiaryContainer} />
              <Text style={[styles.featureText, typography.bodySm]}>
                Cálculo de aprovechamiento porcentual
              </Text>
            </View>
          </View>

          <View style={styles.chipsRow}>
            <Chip label="14 productos registrados" variant="filter" selected />
            <Chip label="3 urgentes" variant="urgent" selected={false} />
          </View>

          <Button
            testID="despensa-back-home-button"
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
    backgroundColor: 'rgba(91, 75, 138, 0.12)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  badgeText: {
    color: colors.primary,
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
