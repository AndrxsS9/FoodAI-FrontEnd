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
import {
  AppColors,
  radius,
  spacing,
  useTypography,
  useAppTheme,
  useThemeStyles,
} from '../src/theme';
import { useLocale } from '../src/context/LocaleContext';

export default function WelcomeScreen() {
  const typography = useTypography();
  const { t } = useLocale();
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);

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
            accessibilityLabel={t('welcome.categoryBadgeLabel')}
          >
            <MaterialIcons name="eco" size={18} color={colors.primary} />
            <Text style={[styles.categoryBadgeText, typography.labelSm]}>
              {t('common.smartHome')}
            </Text>
          </View>

          <Pressable
            testID="welcome-skip-button"
            accessibilityRole="button"
            accessibilityLabel={t('welcome.skipLabel')}
            accessibilityHint={t('welcome.skipHint')}
            onPress={handleNavigateToHome}
            hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
            style={({ pressed }) => [
              styles.skipButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={[styles.skipButtonText, typography.labelMd]}>
              {t('welcome.skip')}
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
              accessibilityLabel={t('welcome.heroImageLabel')}
            />
            <View style={styles.heroPillBadge}>
              <MaterialIcons name="auto-awesome" size={15} color={colors.demoBadgeText} />
              <Text style={[styles.heroPillText, typography.labelSm]}>
                {t('welcome.heroPill')}
              </Text>
            </View>
          </View>
        </View>

        {/* Value Proposition */}
        <View style={styles.valueSection}>
          <View style={styles.ecoPill}>
            <MaterialIcons name="eco" size={14} color={colors.secondary} />
            <Text style={[styles.ecoPillText, typography.labelSm]}>
              {t('welcome.ecoPill')}
            </Text>
          </View>

          <Text
            style={[styles.headline, typography.headlineXl]}
            accessibilityRole="header"
          >
            {t('welcome.headline')}
          </Text>

          <Text style={[styles.subtitle, typography.bodyLg]}>
            {t('welcome.subtitle')}
          </Text>
        </View>

        {/* 3 Step Feature Highlights */}
        <View
          style={styles.stepsRow}
          accessible={false}
          accessibilityLabel={t('welcome.stepsLabel')}
        >
          {/* Step 1 */}
          <View style={styles.stepCard} testID="step-1">
            <View style={[styles.stepIconCircle, { backgroundColor: colors.surfaceContainerHighest }]}>
              <MaterialIcons name="photo-camera" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.stepTitle, typography.labelSm]}>{t('welcome.step1Title')}</Text>
            <Text style={[styles.stepDesc, typography.bodySm]}>{t('welcome.step1Desc')}</Text>
          </View>

          {/* Step 2 */}
          <View style={styles.stepCard} testID="step-2">
            <View style={[styles.stepIconCircle, { backgroundColor: colors.surfaceContainerHighest }]}>
              <MaterialIcons name="auto-awesome" size={18} color={colors.secondary} />
            </View>
            <Text style={[styles.stepTitle, typography.labelSm]}>{t('welcome.step2Title')}</Text>
            <Text style={[styles.stepDesc, typography.bodySm]}>{t('welcome.step2Desc')}</Text>
          </View>

          {/* Step 3 */}
          <View style={styles.stepCard} testID="step-3">
            <View style={[styles.stepIconCircle, { backgroundColor: colors.surfaceContainerHighest }]}>
              <MaterialIcons name="savings" size={18} color={colors.tertiary} />
            </View>
            <Text style={[styles.stepTitle, typography.labelSm]}>{t('welcome.step3Title')}</Text>
            <Text style={[styles.stepDesc, typography.bodySm]}>{t('welcome.step3Desc')}</Text>
          </View>
        </View>

        {/* Primary CTA and Pager dots */}
        <View style={styles.actionContainer}>
          <Button
            testID="welcome-start-button"
            title={t('welcome.start')}
            variant="primary"
            size="lg"
            fullWidth
            onPress={handleNavigateToHome}
            accessibilityLabel={t('welcome.startLabel')}
            accessibilityHint={t('welcome.startHint')}
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

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
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
      shadowColor: colors.cardShadow,
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
      backgroundColor: 'rgba(243, 201, 105, 0.15)',
    },
    heroGlowBottom: {
      position: 'absolute',
      bottom: -20,
      left: -20,
      width: 110,
      height: 110,
      borderRadius: radius.full,
      backgroundColor: 'rgba(233, 119, 94, 0.15)',
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
      backgroundColor: colors.demoBadgeBackground,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: radius.full,
      marginTop: spacing.xs,
    },
    heroPillText: {
      color: colors.demoBadgeText,
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
      backgroundColor: colors.surfaceContainerLow,
      marginBottom: spacing.xs,
    },
    ecoPillText: {
      color: colors.secondary,
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
