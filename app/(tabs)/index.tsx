import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Button, Card, Chip, Input } from '../../src/components/common';
import { RecipeImage } from '../../src/components/recipe/RecipeImage';
import { getRecipeImageSource } from '../../src/utils/recipeImageCatalog';
import { usePantry } from '../../src/context/PantryContext';
import { useBudget } from '../../src/context/BudgetContext';
import { useRecipes } from '../../src/context/RecipeContext';
import { useLocale } from '../../src/context/LocaleContext';
import { localizeCodedError, localizeMessage } from '../../src/locales/messages';
import {
  hasBackendConvenienceScore,
  resolveDailyRecommendationState,
} from '../../src/utils/dailyRecommendation';
import {
  AppColors, getAppSurfaces,
  radius,
  spacing,
  useTypography,
  useAppTheme,
  useThemeStyles,
} from '../../src/theme';

/** Las píldoras sobre la imagen son claras en ambos temas: su contenido debe ser oscuro. */
const META_PILL_FOREGROUND = '#1C1C19';

export default function HomeScreen() {
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const typography = useTypography();
  const router = useRouter();
  const { t, tp, locale, format } = useLocale();

  // Dynamic shared budget state from authoritative BudgetContext
  const { budget, setBudget } = useBudget();
  const [budgetModalVisible, setBudgetModalVisible] = useState(false);
  const [tempBudgetText, setTempBudgetText] = useState(String(budget));
  const [budgetError, setBudgetError] = useState<string | undefined>(undefined);
  // Mensajes de dominio en español: se traducen solo al mostrarse.
  const localizedBudgetError =
    localizeMessage(budgetError, locale, { fallbackKey: 'messages.budget.budgetPersistFailed' }) ?? undefined;

  const handleOpenBudgetModal = () => {
    setTempBudgetText(String(budget));
    setBudgetError(undefined);
    setBudgetModalVisible(true);
  };

  const handleCloseBudgetModal = () => {
    setBudgetError(undefined);
    setBudgetModalVisible(false);
  };

  const handleSaveBudget = async () => {
    const sanitized = tempBudgetText.trim().replace(/[.,\s]/g, '');
    if (!sanitized) {
      setBudgetError('Por favor ingresa un monto de presupuesto.');
      return;
    }

    const parsed = Number(sanitized);
    if (isNaN(parsed) || !isFinite(parsed)) {
      setBudgetError('Por favor ingresa un número válido.');
      return;
    }

    if (parsed < 0) {
      setBudgetError('El presupuesto no puede ser un valor negativo.');
      return;
    }

    if (parsed > 100000000) {
      setBudgetError('El presupuesto supera el monto razonable permitido.');
      return;
    }

    try {
      await setBudget(parsed);
      setBudgetModalVisible(false);
      setBudgetError(undefined);
    } catch (err) {
      setBudgetError(
        err instanceof Error
          ? err.message
          : 'Error al persistir el nuevo presupuesto en el almacenamiento.'
      );
    }
  };

  const { summary, isLoading: isPantryLoading } = usePantry();
  const {
    recipes,
    isDemoMode,
    isGenerating,
    isRestoring: isRecipesRestoring,
    isStale,
    error: recipeError,
    errorCode: recipeErrorCode,
    selectRecipe,
  } = useRecipes();

  // Recomendación del día: selección pura y determinista sobre recetas REALES.
  // Solo describe el estado actual; nunca dispara generaciones con IA desde Inicio.
  const urgentIngredientNames = useMemo(
    () => summary.urgentIngredients.map((item) => item.name),
    [summary.urgentIngredients]
  );
  const recommendation = useMemo(
    () =>
      resolveDailyRecommendationState({
        // Una restauración en frío pendiente se trata como carga, nunca como "sin recetas".
        isPantryLoading: isPantryLoading || isRecipesRestoring,
        pantryCount: summary.totalCount,
        isDemoMode,
        isGenerating,
        isStale,
        recipes,
        error: recipeError,
        urgentIngredientNames,
      }),
    [
      isPantryLoading,
      isRecipesRestoring,
      summary.totalCount,
      isDemoMode,
      isGenerating,
      isStale,
      recipes,
      recipeError,
      urgentIngredientNames,
    ]
  );
  const recommendedRecipe = recommendation.kind === 'ready' ? recommendation.pick.recipe : null;
  const recommendedScore = recommendation.kind === 'ready' ? recommendation.pick.score : null;
  const candidateCount = recommendation.kind === 'ready' ? recommendation.pick.candidateCount : 0;
  const recommendedImage = useMemo(
    () => getRecipeImageSource(recommendedRecipe),
    [recommendedRecipe]
  );

  const goToRecipeGeneration = () => router.push('/recetas' as any);
  const goToPantry = () => router.push('/(tabs)/despensa');

  const renderStateCard = (config: {
    testID: string;
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    title: string;
    message: string;
    actionTestID: string;
    actionTitle: string;
    actionIcon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    onAction: () => void;
    actionHint: string;
  }) => (
    <Card variant="outlined" style={styles.emptyRecipeCard} testID={config.testID}>
      <View style={styles.emptyRecipeIconBox}>
        <MaterialCommunityIcons name={config.icon} size={32} color={colors.outline} />
      </View>
      <Text style={[styles.emptyRecipeTitle, typography.headlineMd]} accessibilityRole="header">
        {config.title}
      </Text>
      <Text style={[styles.emptyRecipeText, typography.bodySm]}>{config.message}</Text>
      <Button
        testID={config.actionTestID}
        title={config.actionTitle}
        variant="primary"
        size="md"
        onPress={config.onAction}
        accessibilityHint={config.actionHint}
        leftIcon={<MaterialCommunityIcons name={config.actionIcon} size={18} color={colors.onPrimary} />}
      />
    </Card>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Top App Header with Stitch Logo & User Profile */}
      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <Image
            source={require('../../assets/images/logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
            accessibilityLabel={t('home.logoLabel')}
          />
          <View style={styles.headerTextCol}>
            <Text
              style={[styles.headerSubtext, typography.labelSm]}
              numberOfLines={1}
            >
              {t('home.brandSubtitle')}
            </Text>
            <Text
              style={[styles.headerTitle, typography.headlineMd]}
              numberOfLines={1}
              accessibilityRole="header"
            >
              {t('home.title')}
            </Text>
          </View>
        </View>

        <Pressable
          testID="home-profile-avatar"
          accessibilityRole="button"
          accessibilityLabel={t('home.profileLabel')}
          accessibilityHint={t('home.profileHint')}
          onPress={() => router.push('/(tabs)/perfil')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => [
            styles.avatarButton,
            pressed && styles.avatarPressed,
          ]}
        >
          <MaterialCommunityIcons name="account" size={20} color={colors.onPrimary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Supportive Prompt & Greeting (hero card) */}
        <View style={styles.greetingSection} testID="home-greeting-hero">
          <View style={styles.heroGlowTop} pointerEvents="none" />
          <View style={styles.heroGlowBottom} pointerEvents="none" />
          <Text
            style={styles.heroEmoji}
            accessible={false}
            importantForAccessibility="no"
          >
            🍳
          </Text>
          <View style={styles.greetingPill}>
            <Text style={[styles.greetingCategory, typography.labelSm]}>
              {t('home.heroCategory')}
            </Text>
          </View>
          <Text
            style={[styles.greetingHeadline, typography.headlineXlMobile]}
            accessibilityRole="header"
          >
            {t('home.heroHeadline')}
          </Text>
          <Text style={[styles.greetingSubtitle, typography.bodyMd]}>
            {t('home.heroSubtitle')}
          </Text>
          <View style={styles.heroChipsRow}>
            <View style={styles.heroChip}>
              <Text style={[styles.heroChipText, typography.labelSm]}>
                {t('home.chipInPantry', { count: summary.totalCount })}
              </Text>
            </View>
            {summary.urgentCount > 0 && (
              <View style={[styles.heroChip, styles.heroChipUrgent]}>
                <Text style={[styles.heroChipUrgentText, typography.labelSm]}>
                  {t('home.chipToUse', { count: summary.urgentCount })}
                </Text>
              </View>
            )}
            <View style={[styles.heroChip, styles.heroChipBudget]}>
              <Text style={[styles.heroChipBudgetText, typography.labelSm]}>
                {t('home.chipBudget')}
              </Text>
            </View>
          </View>
        </View>

        {/* 1. Dominant Action Card: Scanner */}
        <Card variant="elevated" style={styles.scannerCard}>
          <View style={styles.scannerHeader}>
            <View style={styles.scannerIconBox}>
              <MaterialCommunityIcons name="camera-outline" size={26} color={colors.primary} />
            </View>
            <View style={styles.scannerHeaderText}>
              <Text style={[styles.cardTitle, typography.headlineMd]}>
                {t('home.scanTitle')}
              </Text>
              <Text style={[styles.cardSubtitle, typography.bodySm]}>
                {t('home.scanSubtitle')}
              </Text>
            </View>
          </View>

          {/* Viewfinder Preview */}
          <Pressable
            testID="home-viewfinder-press"
            accessibilityRole="button"
            accessibilityLabel={t('home.viewfinderLabel')}
            accessibilityHint={t('home.viewfinderHint')}
            onPress={() => router.push('/escaner' as any)}
            style={styles.viewfinderWrapper}
          >
            <Image
              source={require('../../assets/images/scanner-viewfinder.jpg')}
              style={styles.viewfinderImage}
              resizeMode="cover"
              accessibilityLabel={t('home.viewfinderImageLabel')}
            />
            <View style={styles.viewfinderOverlay}>
              <View style={styles.viewfinderReticle}>
                <MaterialCommunityIcons name="image-filter-center-focus" size={30} color={colors.primary} />
              </View>
            </View>
          </Pressable>

          <Button
            testID="home-scan-button"
            title={t('home.takePhoto')}
            variant="primary"
            size="lg"
            fullWidth
            onPress={() => router.push('/escaner' as any)}
            accessibilityLabel={t('home.takePhotoLabel')}
            accessibilityHint={t('home.takePhotoHint')}
            leftIcon={<MaterialCommunityIcons name="camera-plus-outline" size={20} color={colors.onPrimary} />}
          />
        </Card>

        {/* 2. Pantry Summary Card (Sincronización real con estado local) */}
        <Card
          variant="elevated"
          style={styles.pantryCard}
          onPress={() => router.push('/(tabs)/despensa')}
          accessibilityLabel={
            summary.totalCount === 0
              ? t('home.pantryCardEmptyLabel')
              : t('home.pantryCardLabel', { total: summary.totalCount, urgent: summary.urgentCount })
          }
          accessibilityHint={t('home.pantryCardHint')}
          testID="home-pantry-card"
        >
          <View style={styles.cardHeaderRow}>
            <View style={styles.iconTitleRow}>
              <View style={styles.pantryIconBox}>
                <MaterialCommunityIcons name="fridge-outline" size={22} color={colors.primary} />
              </View>
              <Text style={[styles.cardTitle, typography.headlineMd]}>
                {t('home.yourPantry')}
              </Text>
            </View>
            <View style={styles.pantryBadgeRow}>
              <Text
                style={[styles.countBadge, typography.labelMd]}
                testID="home-pantry-total-count"
              >
                {summary.totalCount} {tp('home.productsUnit', summary.totalCount)}
              </Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color={colors.primary} />
            </View>
          </View>

          {summary.totalCount === 0 ? (
            <View style={styles.emptyPantryBox} testID="home-pantry-empty-state">
              <Text style={[styles.emptyPantryTitle, typography.bodyMd]}>
                {t('home.noFoodsTitle')}
              </Text>
              <Text style={[styles.emptyPantryText, typography.bodySm]}>
                {t('home.noFoodsText')}
              </Text>
            </View>
          ) : summary.urgentCount > 0 ? (
            <>
              {/* Urgent alert notice */}
              <View style={styles.urgentBanner} testID="home-urgent-banner">
                <View style={styles.urgentBannerLeft}>
                  <MaterialCommunityIcons name="clock-outline" size={18} color={colors.secondary} />
                  <Text style={[styles.urgentBannerTitle, typography.labelSm]}>
                    {t('home.urgentBanner', { count: summary.urgentCount })}
                  </Text>
                </View>
                <Text style={[styles.urgentBannerTag, typography.labelSm]}>
                  {t('home.priority')}
                </Text>
              </View>

              {/* Urgent items chips */}
              <View style={styles.chipsWrap}>
                {summary.urgentIngredients.map((item) => (
                  <Chip
                    key={item.id}
                    label={item.name}
                    variant="urgent"
                    selected={false}
                    leftIcon={<View style={styles.chipDot} />}
                  />
                ))}
              </View>
            </>
          ) : (
            <>
              {/* All items are up to date notice */}
              <View style={styles.okBanner} testID="home-pantry-all-ok-banner">
                <View style={styles.okBannerLeft}>
                  <MaterialCommunityIcons name="check-circle" size={18} color={colors.primary} />
                  <Text style={[styles.okBannerTitle, typography.labelSm]}>
                    {t('home.allOk')}
                  </Text>
                </View>
                <Text style={[styles.okBannerTag, typography.labelSm]}>
                  {t('home.noUrgencies')}
                </Text>
              </View>

              {/* Available items preview chips */}
              <View style={styles.chipsWrap}>
                {summary.availableIngredients.slice(0, 4).map((item) => (
                  <Chip
                    key={item.id}
                    label={item.name}
                    variant="filter"
                    selected={false}
                  />
                ))}
              </View>
            </>
          )}
        </Card>

        {/* 3. Available Budget Summary with Interactive Adjustment */}
        <Card variant="flat" style={styles.budgetCard}>
          <View style={styles.budgetGlow} pointerEvents="none" />
          <View style={styles.budgetRow}>
            <View style={styles.budgetIconBox}>
              <MaterialCommunityIcons name="piggy-bank-outline" size={26} color={colors.primary} />
            </View>
            <View style={styles.budgetCol}>
              <View style={styles.budgetLabelRow}>
                <Text style={[styles.budgetLabel, typography.labelSm]}>
                  {t('home.budgetAvailable')}
                </Text>
              </View>
              <Text
                style={[styles.budgetAmount, typography.headlineXl]}
                accessibilityLabel={t('home.budgetAmountLabel', { amount: format.number(budget, 0) })}
              >
                {format.currency(budget, false)}
                <Text style={[styles.budgetCurrency, typography.labelMd]}>{t('home.currencySuffix')}</Text>
              </Text>
            </View>

            <Button
              testID="home-adjust-budget-button"
              title={t('home.adjust')}
              variant="outline"
              size="sm"
              style={styles.adjustButton}
              onPress={handleOpenBudgetModal}
              accessibilityLabel={t('home.adjustLabel')}
              accessibilityHint={t('home.adjustHint')}
              leftIcon={<MaterialCommunityIcons name="tune" size={16} color={colors.textPrimary} />}
            />
          </View>
        </Card>

        {/* 4. Recommendation of the Day (selección real y determinista sobre RecipeContext) */}
        <View style={styles.recommendationSection} testID="home-recommendation-section">
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleCol}>
              <View style={styles.sectionTitleRow}>
                <MaterialCommunityIcons name="creation" size={20} color={colors.tertiary} />
                <Text style={[styles.sectionTitle, typography.headlineMd]}>
                  {t('home.recommendationTitle')}
                </Text>
              </View>
              {recommendedRecipe && (
                <Text style={[styles.sectionSubtitle, typography.labelSm]}>
                  {t('home.recommendationSubtitle')}
                </Text>
              )}
            </View>
          </View>

          {recommendation.kind === 'loading-pantry' || recommendation.kind === 'generating' ? (
            <Card
              variant="outlined"
              style={styles.emptyRecipeCard}
              testID={
                recommendation.kind === 'generating'
                  ? 'home-recommendation-generating'
                  : 'home-recommendation-loading'
              }
            >
              <ActivityIndicator size="small" color={colors.primary} />
              <Text
                style={[styles.emptyRecipeText, typography.bodySm]}
                accessibilityLiveRegion="polite"
              >
                {recommendation.kind === 'generating'
                  ? t('home.generatingRecommendations')
                  : t('home.loadingPantry')}
              </Text>
            </Card>
          ) : recommendation.kind === 'empty-pantry' ? (
            renderStateCard({
              testID: 'home-recommendation-empty-pantry',
              icon: 'fridge-outline',
              title: t('home.emptyPantryTitle'),
              message: t('home.emptyPantryMessage'),
              actionTestID: 'home-recommendation-go-pantry-button',
              actionTitle: t('home.goToPantry'),
              actionIcon: 'plus-circle-outline',
              onAction: goToPantry,
              actionHint: t('home.goToPantryHint'),
            })
          ) : recommendation.kind === 'demo' ? (
            renderStateCard({
              testID: 'home-recommendation-demo-state',
              icon: 'creation',
              title: t('home.demoTitle'),
              message: t('home.demoMessage'),
              actionTestID: 'home-recommendation-generate-button',
              actionTitle: t('home.generateRecommendations'),
              actionIcon: 'silverware-fork-knife',
              onAction: goToRecipeGeneration,
              actionHint: t('home.generateHint'),
            })
          ) : recommendation.kind === 'stale' ? (
            renderStateCard({
              testID: 'home-recommendation-stale-state',
              icon: 'update',
              title: t('home.staleTitle'),
              message: t('home.staleMessage'),
              actionTestID: 'home-recommendation-refresh-button',
              actionTitle: t('home.refreshRecommendation'),
              actionIcon: 'refresh',
              onAction: goToRecipeGeneration,
              actionHint: t('home.refreshHint'),
            })
          ) : recommendation.kind === 'error' ? (
            renderStateCard({
              testID: 'home-recommendation-error-state',
              icon: 'alert-circle-outline',
              title: t('home.errorTitle'),
              message:
                localizeCodedError('recipes', recipeErrorCode, recommendation.message, locale) ??
                recommendation.message,
              actionTestID: 'home-recommendation-generate-button',
              actionTitle: t('home.retryInRecipes'),
              actionIcon: 'silverware-fork-knife',
              onAction: goToRecipeGeneration,
              actionHint: t('home.retryHint'),
            })
          ) : recommendedRecipe && recommendedScore ? (
            <Card
              variant="elevated"
              style={styles.recipeCard}
              testID="home-recommended-recipe-card"
            >
              <RecipeImage
                source={recommendedImage.source}
                referenceLabel={recommendedImage.referenceLabel}
                recipeName={recommendedRecipe.name}
                isDemo={recommendedRecipe.isDemoFixture}
                containerStyle={styles.recipeImageWrapper}
                fallbackTestID="home-recipe-fallback-image"
                testID="home-recipe-image"
                borderRadius={0}
              >
                {/* Score pill: solo se muestra el puntaje real devuelto por el backend */}
                {hasBackendConvenienceScore(recommendedRecipe.convenience) && (
                  <View
                    style={styles.convenienceBadge}
                    accessibilityRole="text"
                    accessibilityLabel={t('home.affinityLabel', {
                      value: localizeMessage(String(recommendedRecipe.convenience), locale, { passthroughUnknown: true }) ?? '',
                    })}
                  >
                    <MaterialCommunityIcons name="check-decagram" size={16} color={colors.onTertiaryContainer} importantForAccessibility="no" accessibilityElementsHidden={true} />
                    <Text style={[styles.convenienceText, typography.labelSm]}>
                      {typeof recommendedRecipe.convenience === 'number'
                        ? t('home.convenientPercent', { value: recommendedRecipe.convenience })
                        : localizeMessage(recommendedRecipe.convenience, locale, { passthroughUnknown: true })}
                    </Text>
                  </View>
                )}

                {/* Time & Servings pills */}
                <View style={styles.recipeMetaRow}>
                  <View style={styles.recipeMetaPill}>
                    <MaterialCommunityIcons name="timer-outline" size={14} color={META_PILL_FOREGROUND} />
                    <Text style={[styles.recipeMetaText, typography.labelSm]}>
                      {t('minutesShort', { count: recommendedRecipe.totalMinutes })}
                    </Text>
                  </View>
                  <View style={styles.recipeMetaPill}>
                    <MaterialCommunityIcons name="account-group" size={14} color={META_PILL_FOREGROUND} />
                    <Text style={[styles.recipeMetaText, typography.labelSm]}>
                      {tp('people', recommendedRecipe.servings)}
                    </Text>
                  </View>
                </View>
              </RecipeImage>

              {/* Recipe Content */}
              <View style={styles.recipeBody}>
                <Text style={[styles.recipeTitle, typography.headlineMd]}>
                  {recommendedRecipe.name}
                </Text>
                <Text style={[styles.recipeDescription, typography.bodySm]}>
                  {recommendedRecipe.description}
                </Text>

                {/* Value metrics */}
                <View style={styles.recipeHighlights}>
                  {recommendedScore.availableCount + recommendedScore.missingCount > 0 && (
                    <View
                      style={[styles.highlightRow, styles.highlightRowNeutral]}
                      testID="home-recommendation-coverage"
                    >
                      <MaterialCommunityIcons name="fridge-outline" size={20} color={colors.primary} />
                      <Text style={[styles.highlightText, typography.bodySm]}>
                        {t('home.coverage', {
                          available: recommendedScore.availableCount,
                          total: recommendedScore.availableCount + recommendedScore.missingCount,
                        })}
                      </Text>
                    </View>
                  )}

                  {recommendedScore.missingCount === 0 &&
                  recommendedRecipe.estimatedMissingCost === 0 ? (
                    <View
                      style={[styles.highlightRow, styles.highlightRowPrimary]}
                      testID="home-recommendation-cost"
                    >
                      <MaterialCommunityIcons name="piggy-bank-outline" size={20} color={colors.primary} />
                      <Text style={[styles.highlightText, typography.bodySm]}>
                        {t('home.noPurchaseNeeded')}
                      </Text>
                    </View>
                  ) : recommendedRecipe.withinBudget ? (
                    <View
                      style={[styles.highlightRow, styles.highlightRowPrimary]}
                      testID="home-recommendation-cost"
                    >
                      <MaterialCommunityIcons name="piggy-bank-outline" size={20} color={colors.primary} />
                      <Text style={[styles.highlightText, typography.bodySm]}>
                        {t('home.onlyNeedPrefix')}{' '}
                        <Text style={[styles.highlightBold, { color: colors.primary }]}>
                          {format.currency(recommendedRecipe.estimatedMissingCost, false)}
                        </Text>
                      </Text>
                    </View>
                  ) : (
                    <View
                      style={[styles.highlightRow, styles.highlightRowWarning]}
                      testID="home-recommendation-cost"
                    >
                      <MaterialCommunityIcons name="alert-outline" size={20} color={colors.onErrorContainer} />
                      <Text style={[styles.highlightText, typography.bodySm]}>
                        {t('home.estimatedPurchasePrefix')}{' '}
                        <Text style={styles.highlightBold}>
                          {format.currency(recommendedRecipe.estimatedMissingCost, false)}
                        </Text>
                        {t('home.overBudgetSuffix')}
                      </Text>
                    </View>
                  )}

                  {recommendedRecipe.reason ? (
                    <View style={[styles.highlightRow, styles.highlightRowSecondary]}>
                      <MaterialCommunityIcons name="recycle" size={20} color={colors.secondary} />
                      <Text style={[styles.highlightText, typography.bodySm]}>
                        {recommendedRecipe.reason}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {candidateCount > 1 && (
                  <Text
                    style={[styles.rankNote, typography.labelSm]}
                    testID="home-recommendation-rank-note"
                  >
                    {t('home.rankNote', { count: candidateCount })}
                  </Text>
                )}

                <Button
                  testID="home-view-recipe-button"
                  title={t('home.viewRecipe')}
                  variant="primary"
                  size="lg"
                  fullWidth
                  onPress={() => {
                    selectRecipe(recommendedRecipe);
                    router.push(`/recetas/${recommendedRecipe.id}` as any);
                  }}
                  accessibilityLabel={t('home.viewRecipeLabel', { name: recommendedRecipe.name })}
                  accessibilityHint={t('home.viewRecipeHint')}
                  rightIcon={<MaterialCommunityIcons name="arrow-right" size={18} color={colors.onPrimary} />}
                />
              </View>
            </Card>
          ) : (
            renderStateCard({
              testID: 'home-empty-recipe-state',
              icon: 'book-open-variant',
              title: t('home.noRecommendationsTitle'),
              message: t('home.noRecommendationsMessage'),
              actionTestID: 'home-recommendation-generate-button',
              actionTitle: t('home.generateRecommendations'),
              actionIcon: 'silverware-fork-knife',
              onAction: goToRecipeGeneration,
              actionHint: t('home.generateHint'),
            })
          )}
        </View>
      </ScrollView>

      {/* Accessible Budget Adjustment Modal */}
      {budgetModalVisible && (
        <View
          style={[StyleSheet.absoluteFill, styles.modalBackdrop]}
          testID="budget-modal-backdrop"
          accessibilityRole="none"
        >
          <View
            style={styles.budgetModalCard}
            accessibilityRole="alert"
            accessibilityLabel={t('home.budgetDialogLabel')}
          >
            <View style={styles.modalIconBox}>
              <MaterialCommunityIcons name="wallet-outline" size={28} color={colors.primary} />
            </View>

            <Text style={[styles.modalTitle, typography.headlineMd]}>
              {t('home.budgetDialogTitle')}
            </Text>

            <Text style={[styles.modalDescription, typography.bodySm]}>
              {t('home.budgetDialogDesc')}
            </Text>

            <View style={styles.budgetInputContainer}>
              <Input
                testID="budget-input-field"
                label={t('home.budgetInputLabel')}
                placeholder={t('home.budgetInputPlaceholder')}
                keyboardType="numeric"
                value={tempBudgetText}
                onChangeText={(val) => {
                  setTempBudgetText(val);
                  if (budgetError) setBudgetError(undefined);
                }}
                errorMessage={localizedBudgetError}
                helperText={t('home.budgetInputHelper')}
                leftElement={
                  <Text style={styles.currencyPrefix}>$</Text>
                }
              />
            </View>

            <View style={styles.modalButtonsRow}>
              <Button
                testID="budget-cancel-button"
                title={t('common.cancel')}
                variant="outline"
                size="md"
                style={styles.modalButtonFlex}
                onPress={handleCloseBudgetModal}
                accessibilityLabel={t('home.budgetCancelLabel')}
              />
              <Button
                testID="budget-confirm-button"
                title={t('common.confirm')}
                variant="primary"
                size="md"
                style={styles.modalButtonFlex}
                onPress={handleSaveBudget}
                accessibilityLabel={t('home.budgetConfirmLabel')}
              />
            </View>
          </View>
        </View>
      )}

    </SafeAreaView>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  safeArea: {
    flex: 1,
    ...getAppSurfaces(colors).canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.margin,
    paddingVertical: spacing.sm,
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  logoImage: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
  },
  headerTextCol: {
    flex: 1,
  },
  headerSubtext: {
    color: colors.outline,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  headerTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
    marginTop: -2,
  },
  avatarButton: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    backgroundColor: colors.primaryAction,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPressed: {
    opacity: 0.8,
  },
  scrollContent: {
    padding: spacing.margin,
    paddingBottom: spacing.xxl + spacing.md,
    gap: spacing.md,
  },
  greetingSection: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: colors.heroBackground,
    borderRadius: radius.xl,
    padding: spacing.lg,
    shadowColor: colors.heroBackground,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 5,
  },
  heroGlowTop: {
    position: 'absolute',
    top: -50,
    right: -40,
    width: 170,
    height: 170,
    borderRadius: radius.full,
    backgroundColor: colors.heroAccent,
    opacity: 0.7,
  },
  heroGlowBottom: {
    position: 'absolute',
    bottom: -60,
    left: -50,
    width: 150,
    height: 150,
    borderRadius: radius.full,
    backgroundColor: colors.tertiary,
    opacity: 0.16,
  },
  heroEmoji: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    fontSize: 46,
    transform: [{ rotate: '-8deg' }],
  },
  greetingPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 5,
    borderRadius: radius.full,
    maxWidth: '78%',
  },
  greetingCategory: {
    color: colors.onHero,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  greetingHeadline: {
    color: colors.onHero,
    fontWeight: '700',
    marginTop: spacing.sm + 2,
    maxWidth: '78%',
  },
  greetingSubtitle: {
    color: colors.onHeroMuted,
    marginTop: 4,
    maxWidth: '88%',
  },
  heroChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    marginTop: spacing.md,
  },
  heroChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  heroChipText: {
    color: colors.onHero,
  },
  heroChipUrgent: {
    backgroundColor: colors.secondaryFixed,
  },
  heroChipUrgentText: {
    color: colors.onSecondaryFixed,
  },
  heroChipBudget: {
    backgroundColor: colors.tertiaryFixed,
  },
  heroChipBudgetText: {
    color: colors.onTertiaryFixed,
  },
  scannerCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  scannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  scannerIconBox: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerHeaderText: {
    flex: 1,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  cardSubtitle: {
    color: colors.textSecondary,
    marginTop: 2,
  },
  viewfinderWrapper: {
    width: '100%',
    height: 160,
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: spacing.md,
    backgroundColor: colors.surfaceContainerLow,
  },
  viewfinderImage: {
    width: '100%',
    height: '100%',
    opacity: 0.85,
  },
  viewfinderOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(67, 51, 113, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewfinderReticle: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 6,
    borderColor: 'rgba(255, 255, 255, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  pantryCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  iconTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pantryIconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md + 4,
    backgroundColor: colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pantryBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  countBadge: {
    color: colors.primary,
    fontWeight: '600',
  },
  urgentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.secondaryFixed,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 10,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
  },
  urgentBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  urgentBannerTitle: {
    color: colors.onSecondaryFixed,
    fontWeight: '700',
  },
  urgentBannerTag: {
    color: colors.secondary,
    fontWeight: '600',
  },
  okBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primaryFixed,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 10,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
  },
  okBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  okBannerTitle: {
    color: colors.primary,
    fontWeight: '700',
  },
  okBannerTag: {
    color: colors.outline,
    fontWeight: '600',
  },
  emptyPantryBox: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  emptyPantryTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  emptyPantryText: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  chipDot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
    marginRight: 4,
  },
  budgetCard: {
    ...getAppSurfaces(colors).card,
    padding: spacing.md,
    position: 'relative',
    overflow: 'hidden',
  },
  budgetGlow: {
    position: 'absolute',
    right: -30,
    bottom: -40,
    width: 120,
    height: 120,
    borderRadius: radius.full,
    backgroundColor: colors.iconTile,
    opacity: 0.55,
  },
  budgetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  budgetIconBox: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.iconTile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustButton: {
    marginLeft: 'auto',
  },
  budgetCol: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 150,
  },
  budgetLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 4,
  },
  budgetLabel: {
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  budgetAmount: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 26,
    lineHeight: 32,
  },
  budgetCurrency: {
    color: colors.textSecondary,
    fontWeight: '500',
  },
  recommendationSection: {
    marginTop: spacing.xs,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitleCol: {
    flexShrink: 1,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  sectionSubtitle: {
    color: colors.outline,
  },
  recipeCard: {
    backgroundColor: colors.surface,
    overflow: 'hidden',
    padding: 0,
  },
  recipeImageWrapper: {
    width: '100%',
    height: 192,
    position: 'relative',
    backgroundColor: colors.surfaceContainerLow,
  },
  recipeImage: {
    width: '100%',
    height: '100%',
  },
  recipeImageFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainer,
    gap: spacing.xs,
  },
  recipeFallbackText: {
    color: colors.outline,
    fontWeight: '600',
  },
  convenienceBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.tertiaryContainer,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.full,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  convenienceText: {
    color: colors.onTertiaryContainer,
    fontWeight: '700',
  },
  recipeMetaRow: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  recipeMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  recipeMetaText: {
    color: META_PILL_FOREGROUND,
    fontWeight: '600',
    fontSize: 11,
  },
  recipeBody: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  recipeTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  recipeDescription: {
    color: colors.textSecondary,
    lineHeight: 18,
  },
  recipeHighlights: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
  },
  highlightRowPrimary: {
    backgroundColor: colors.primaryFixed,
  },
  highlightRowSecondary: {
    backgroundColor: colors.secondaryFixed,
  },
  highlightRowNeutral: {
    backgroundColor: colors.surfaceContainerLow,
  },
  highlightRowWarning: {
    backgroundColor: colors.errorContainer,
  },
  rankNote: {
    color: colors.textSecondary,
  },
  highlightText: {
    color: colors.textPrimary,
    flex: 1,
  },
  highlightBold: {
    fontWeight: '600',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.margin,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  budgetModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  modalIconBox: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  modalTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalDescription: {
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  budgetInputContainer: {
    marginVertical: spacing.xs,
  },
  currencyPrefix: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 16,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  modalButtonFlex: {
    flex: 1,
  },
  emptyRecipeCard: {
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceContainerLow,
    borderColor: colors.outlineVariant,
  },
  emptyRecipeIconBox: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyRecipeTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyRecipeText: {
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
});

