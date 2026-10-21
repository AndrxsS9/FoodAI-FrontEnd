import React from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Button } from '../src/components/common';
import { colors, radius, spacing, useTypography } from '../src/theme';

export default function WelcomeScreen() {
  const typography = useTypography();
  const router = useRouter();

  const handleNavigateToHome = () => {
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Top bar: Category badge and Skip button */}
        <View style={styles.topBar}>
          <View
            style={styles.categoryBadge}
            accessibilityRole="text"
            accessibilityLabel="Categoría: Hogar inteligente"
          >
            <MaterialIcons name="eco" size={18} color={colors.primary} />
            <Text style={[styles.categoryBadgeText, typography.labelSm]}>
              HOGAR INTELIGENTE
            </Text>
          </View>

          <Pressable
            testID="welcome-skip-button"
            accessibilityRole="button"
            accessibilityLabel="Omitir introducción"
            accessibilityHint="Ir directamente a la pantalla de inicio"
            onPress={handleNavigateToHome}
            hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
            style={({ pressed }) => [
              styles.skipButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={[styles.skipButtonText, typography.labelMd]}>
              Omitir
            </Text>
          </Pressable>
        </View>

        {/* Hero Illustration Card */}
        <View style={styles.heroCard} testID="welcome-hero-card">
          <View style={styles.heroGlowTop} />
          <View style={styles.heroGlowBottom} />
          <View style={styles.heroImageWrapper}>
            <Image
              source={require('../assets/images/welcome-hero.png')}
              style={styles.heroImage}
              resizeMode="contain"
              accessibilityLabel="Ilustración de cocina inteligente con despensa, sartén e ingredientes frescos"
            />
            <View style={styles.heroPillBadge}>
              <MaterialIcons name="auto-awesome" size={15} color={colors.tertiaryContainer} />
              <Text style={[styles.heroPillText, typography.labelSm]}>
                Aprovecha mejor tu despensa
              </Text>
            </View>
          </View>
        </View>

        {/* Value Proposition */}
        <View style={styles.valueSection}>
          <View style={styles.ecoPill}>
            <MaterialIcons name="eco" size={14} color={colors.secondary} />
            <Text style={[styles.ecoPillText, typography.labelSm]}>
              Menos desperdicio. Más aprovechamiento.
            </Text>
          </View>

          <Text
            style={[styles.headline, typography.headlineXl]}
            accessibilityRole="header"
          >
            Aprovecha lo que ya tienes.
          </Text>

          <Text style={[styles.subtitle, typography.bodyLg]}>
            Muéstranos tus alimentos y descubre qué puedes preparar sin gastar de más.
          </Text>
        </View>

        {/* 3 Step Features */}
        <View style={styles.stepsRow}>
          {/* Step 1 */}
          <View style={styles.stepCard} testID="step-1">
            <View style={[styles.stepIconCircle, { backgroundColor: colors.surfaceContainerHighest }]}>
              <MaterialIcons name="photo-camera" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.stepTitle, typography.labelSm]}>1. Escanea</Text>
            <Text style={[styles.stepDesc, typography.bodySm]}>Tus alimentos</Text>
          </View>

          {/* Step 2 */}
          <View style={styles.stepCard} testID="step-2">
            <View style={[styles.stepIconCircle, { backgroundColor: colors.surfaceContainerHighest }]}>
              <MaterialIcons name="auto-awesome" size={18} color={colors.secondary} />
            </View>
            <Text style={[styles.stepTitle, typography.labelSm]}>2. Elige</Text>
            <Text style={[styles.stepDesc, typography.bodySm]}>Tu presupuesto</Text>
          </View>

          {/* Step 3 */}
          <View style={styles.stepCard} testID="step-3">
            <View style={[styles.stepIconCircle, { backgroundColor: colors.surfaceContainerHighest }]}>
              <MaterialIcons name="savings" size={18} color={colors.tertiaryContainer} />
            </View>
            <Text style={[styles.stepTitle, typography.labelSm]}>3. Cocina</Text>
            <Text style={[styles.stepDesc, typography.bodySm]}>Aprovecha lo que tienes</Text>
          </View>
        </View>

        {/* Primary CTA and Pager dots */}
        <View style={styles.actionContainer}>
          <Button
            testID="welcome-start-button"
            title="Comenzar"
            variant="primary"
            size="lg"
            fullWidth
            onPress={handleNavigateToHome}
            accessibilityLabel="Comenzar con FoodAI"
            accessibilityHint="Navega a la pantalla principal de la aplicación"
            rightIcon={<MaterialIcons name="arrow-forward" size={20} color={colors.onPrimary} />}
          />

          <View
            style={styles.pagerDots}
            accessible={false}
            importantForAccessibility="no"
            aria-hidden={true}
          >
            <View style={[styles.dot, styles.dotActive]} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </View>
        </View>
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
    flexGrow: 1,
    paddingHorizontal: spacing.margin,
    paddingBottom: spacing.lg,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceContainerLow,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  categoryBadgeText: {
    color: colors.textSecondary,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  skipButton: {
    paddingVertical: 4,
    paddingHorizontal: spacing.xs,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  skipButtonText: {
    color: colors.textSecondary,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: '#5B4B8A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    position: 'relative',
    overflow: 'hidden',
  },
  heroGlowTop: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 120,
    height: 120,
    borderRadius: radius.full,
    backgroundColor: 'rgba(243, 201, 105, 0.25)',
  },
  heroGlowBottom: {
    position: 'absolute',
    bottom: -20,
    left: -20,
    width: 110,
    height: 110,
    borderRadius: radius.full,
    backgroundColor: 'rgba(233, 119, 94, 0.2)',
  },
  heroImageWrapper: {
    width: '100%',
    alignItems: 'center',
    zIndex: 1,
  },
  heroImage: {
    width: '100%',
    height: 170,
    maxHeight: 190,
  },
  heroPillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 223, 155, 0.7)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    marginTop: spacing.xs,
  },
  heroPillText: {
    color: colors.tertiaryContainer,
    fontWeight: '700',
    fontSize: 11,
  },
  valueSection: {
    alignItems: 'center',
    textAlign: 'center',
    marginVertical: spacing.xs,
  },
  ecoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255, 218, 211, 0.7)',
    marginBottom: spacing.xs,
  },
  ecoPillText: {
    color: '#802916',
    fontWeight: '700',
  },
  headline: {
    color: colors.textPrimary,
    textAlign: 'center',
    fontWeight: '700',
    marginTop: 4,
    marginBottom: spacing.xs,
    maxWidth: 320,
  },
  subtitle: {
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 310,
    lineHeight: 22,
  },
  stepsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginVertical: spacing.sm,
    width: '100%',
  },
  stepCard: {
    flex: 1,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    textAlign: 'center',
  },
  stepIconCircle: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  stepTitle: {
    color: colors.textPrimary,
    fontWeight: '600',
    textAlign: 'center',
  },
  stepDesc: {
    color: colors.textSecondary,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 2,
  },
  actionContainer: {
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
  },
  pagerDots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  dot: {
    width: 8,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHighest,
  },
  dotActive: {
    width: 24,
    backgroundColor: colors.primary,
  },
});
