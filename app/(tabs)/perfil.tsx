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

export default function PerfilScreen() {
  const typography = useTypography();
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <Header
        title="Perfil de Usuario"
        subtitle="Stitch Pantalla 13 · En desarrollo"
        rightElement={
          <View style={styles.badgeWrapper}>
            <Text style={[styles.badgeText, typography.labelSm]}>Fase 4</Text>
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Card variant="elevated" style={styles.statusCard}>
          <View style={styles.statusIconWrapper}>
            <MaterialIcons name="person" size={36} color={colors.primary} />
          </View>

          <Text style={[styles.statusTitle, typography.headlineMd]}>
            Preferencias y Configuración
          </Text>

          <Text style={[styles.statusDescription, typography.bodyMd]}>
            Esta sección corresponde a la pantalla original «13. Perfil» de Google Stitch.
            Permitirá personalizar restricciones alimentarias, tamaño de porciones familiares y presupuesto predeterminado.
          </Text>

          <View style={styles.featuresList}>
            <View style={styles.featureItem}>
              <MaterialIcons name="tune" size={18} color={colors.primary} />
              <Text style={[styles.featureText, typography.bodySm]}>
                Restricciones y alergias alimentarias
              </Text>
            </View>

            <View style={styles.featureItem}>
              <MaterialIcons name="groups" size={18} color={colors.secondary} />
              <Text style={[styles.featureText, typography.bodySm]}>
                Porciones habituales del hogar (2 personas por defecto)
              </Text>
            </View>

            <View style={styles.featureItem}>
              <MaterialIcons name="notifications-active" size={18} color={colors.tertiaryContainer} />
              <Text style={[styles.featureText, typography.bodySm]}>
                Avisos de caducidad y sugerencias de comida
              </Text>
            </View>
          </View>

          <View style={styles.chipsRow}>
            <Chip label="2 personas" variant="filter" selected />
            <Chip label="Sin desperdicio" variant="filter" selected />
          </View>

          {/* Quick links to replay Welcome flow and Design System */}
          <View style={styles.buttonStack}>
            <Button
              testID="perfil-welcome-button"
              title="Ver pantalla de bienvenida"
              variant="outline"
              size="md"
              fullWidth
              onPress={() => router.push('/')}
              leftIcon={<MaterialIcons name="auto-awesome" size={18} color={colors.primary} />}
            />

            <Button
              testID="perfil-design-system-button"
              title="Catálogo de componentes (Fase 1)"
              variant="tertiary"
              size="md"
              fullWidth
              onPress={() => router.push('/design-system')}
              leftIcon={<MaterialIcons name="palette" size={18} color={colors.textPrimary} />}
            />

            <Button
              testID="perfil-back-home-button"
              title="Volver al Inicio"
              variant="primary"
              size="md"
              fullWidth
              onPress={() => router.push('/(tabs)')}
              leftIcon={<MaterialIcons name="arrow-back" size={18} color={colors.onPrimary} />}
            />
          </View>
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
  buttonStack: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
