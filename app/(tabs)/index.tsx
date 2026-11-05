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
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Button, Card, Chip, Input } from '../../src/components/common';
import { RecipeImage } from '../../src/components/recipe/RecipeImage';
import { usePantry } from '../../src/context/PantryContext';
import { useBudget } from '../../src/context/BudgetContext';
import { useRecipes } from '../../src/context/RecipeContext';
import { DEMO_DASHBOARD_DATA } from '../../src/fixtures/demoDashboardData';
import { formatCopCurrency } from '../../src/types/recipe';
import {
  hasBackendConvenienceScore,
  resolveDailyRecommendationState,
} from '../../src/utils/dailyRecommendation';
import {
  AppColors,
  radius,
  spacing,
  useTypography,
  useAppTheme,
  useThemeStyles,
} from '../../src/theme';

export default function HomeScreen() {
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const typography = useTypography();
  const router = useRouter();

  // Dynamic shared budget state from authoritative BudgetContext
  const { budget, setBudget } = useBudget();
  const [budgetModalVisible, setBudgetModalVisible] = useState(false);
  const [tempBudgetText, setTempBudgetText] = useState(String(budget));
  const [budgetError, setBudgetError] = useState<string | undefined>(undefined);

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
    isStale,
    error: recipeError,
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
        isPantryLoading,
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

  const goToRecipeGeneration = () => router.push('/recetas' as any);
  const goToPantry = () => router.push('/(tabs)/despensa');

  const renderStateCard = (config: {
    testID: string;
    icon: React.ComponentProps<typeof MaterialIcons>['name'];
    title: string;
    message: string;
    actionTestID: string;
    actionTitle: string;
    actionIcon: React.ComponentProps<typeof MaterialIcons>['name'];
    onAction: () => void;
    actionHint: string;
  }) => (
    <Card variant="outlined" style={styles.emptyRecipeCard} testID={config.testID}>
      <View style={styles.emptyRecipeIconBox}>
        <MaterialIcons name={config.icon} size={32} color={colors.outline} />
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
        leftIcon={<MaterialIcons name={config.actionIcon} size={18} color={colors.onPrimary} />}
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
            accessibilityLabel="Logotipo de Recetario por Presupuesto"
          />
          <View style={styles.headerTextCol}>
            <Text
              style={[styles.headerSubtext, typography.labelSm]}
              numberOfLines={1}
            >
              RECETARIO POR PRESUPUESTO
            </Text>
            <Text
              style={[styles.headerTitle, typography.headlineMd]}
              numberOfLines={1}
              accessibilityRole="header"
            >
              Inicio
            </Text>
          </View>
        </View>

        <Pressable
          testID="home-profile-avatar"
          accessibilityRole="button"
          accessibilityLabel="Perfil de usuario"
          accessibilityHint="Ir a la pestaña de perfil"
          onPress={() => router.push('/(tabs)/perfil')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => [
            styles.avatarButton,
            pressed && styles.avatarPressed,
          ]}
        >
          <MaterialIcons name="person" size={20} color={colors.onPrimary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Subtle demonstration data disclaimer banner */}
        {isDemoMode && (
          <View
            style={styles.demoBanner}
            testID="demo-data-banner"
            accessibilityRole="text"
            accessibilityLabel="Aviso: Vista de ejemplo con datos de demostración"
          >
            <View style={styles.demoBadge}>
              <MaterialIcons name="science" size={14} color={colors.primary} />
              <Text style={[styles.demoBadgeText, typography.labelSm]}>
                {DEMO_DASHBOARD_DATA.badgeLabel}
              </Text>
            </View>
            <Text style={[styles.demoNoticeText, typography.bodySm]}>
              {DEMO_DASHBOARD_DATA.noticeText}
            </Text>
          </View>
        )}

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
              COCINA INTELIGENTE Y CONSCIENTE
            </Text>
          </View>
          <Text
            style={[styles.greetingHeadline, typography.headlineXlMobile]}
            accessibilityRole="header"
          >
            ¿Qué podemos preparar hoy?
          </Text>
          <Text style={[styles.greetingSubtitle, typography.bodyMd]}>
            Primero usa lo que tienes. Después decide qué comprar.
          </Text>
          <View style={styles.heroChipsRow}>
            <View style={styles.heroChip}>
              <Text style={[styles.heroChipText, typography.labelSm]}>
                🥬 {summary.totalCount} en despensa
              </Text>
            </View>
            {summary.urgentCount > 0 && (
              <View style={[styles.heroChip, styles.heroChipUrgent]}>
                <Text style={[styles.heroChipUrgentText, typography.labelSm]}>
                  ⏰ {summary.urgentCount} por usar
                </Text>
              </View>
            )}
            <View style={[styles.heroChip, styles.heroChipBudget]}>
              <Text style={[styles.heroChipBudgetText, typography.labelSm]}>
                💰 Control de presupuesto
              </Text>
            </View>
          </View>
        </View>

        {/* 1. Dominant Action Card: Scanner */}
        <Card variant="elevated" style={styles.scannerCard}>
          <View style={styles.scannerHeader}>
            <View style={styles.scannerIconBox}>
              <MaterialIcons name="photo-camera" size={26} color={colors.primary} />
            </View>
            <View style={styles.scannerHeaderText}>
              <Text style={[styles.cardTitle, typography.headlineMd]}>
                Escanear alimentos
              </Text>
              <Text style={[styles.cardSubtitle, typography.bodySm]}>
                Muéstrame qué tienes
              </Text>
            </View>
          </View>

          {/* Viewfinder Preview */}
          <Pressable
            testID="home-viewfinder-press"
            accessibilityRole="button"
            accessibilityLabel="Abrir visor de cámara"
            accessibilityHint="Abre el escáner de alimentos con IA"
            onPress={() => router.push('/escaner' as any)}
            style={styles.viewfinderWrapper}
          >
            <Image
              source={require('../../assets/images/scanner-viewfinder.jpg')}
              style={styles.viewfinderImage}
              resizeMode="cover"
              accessibilityLabel="Vista previa del escáner con ingredientes en la mesa de cocina"
            />
            <View style={styles.viewfinderOverlay}>
              <View style={styles.viewfinderReticle}>
                <MaterialIcons name="center-focus-strong" size={30} color={colors.primary} />
              </View>
            </View>
          </Pressable>

          <Button
            testID="home-scan-button"
            title="Tomar foto"
            variant="primary"
            size="lg"
            fullWidth
            onPress={() => router.push('/escaner' as any)}
            accessibilityLabel="Tomar foto de los alimentos"
            accessibilityHint="Abre el escáner fotográfico con IA"
            leftIcon={<MaterialIcons name="add-a-photo" size={20} color={colors.onPrimary} />}
          />
        </Card>

        {/* 2. Pantry Summary Card (Sincronización real con estado local) */}
        <Card
          variant="elevated"
          style={styles.pantryCard}
          onPress={() => router.push('/(tabs)/despensa')}
          accessibilityLabel={
            summary.totalCount === 0
              ? 'Resumen de despensa: sin alimentos registrados. Toca para registrar ingredientes.'
              : `Resumen de despensa: ${summary.totalCount} productos, ${summary.urgentCount} por consumir pronto`
          }
          accessibilityHint="Toca para ir a la pantalla de despensa"
          testID="home-pantry-card"
        >
          <View style={styles.cardHeaderRow}>
            <View style={styles.iconTitleRow}>
              <View style={styles.pantryIconBox}>
                <MaterialIcons name="kitchen" size={22} color={colors.primary} />
              </View>
              <Text style={[styles.cardTitle, typography.headlineMd]}>
                Tu despensa
              </Text>
            </View>
            <View style={styles.pantryBadgeRow}>
              <Text
                style={[styles.countBadge, typography.labelMd]}
                testID="home-pantry-total-count"
              >
                {summary.totalCount} producto{summary.totalCount === 1 ? '' : 's'}
              </Text>
              <MaterialIcons name="chevron-right" size={18} color={colors.primary} />
            </View>
          </View>

          {summary.totalCount === 0 ? (
            <View style={styles.emptyPantryBox} testID="home-pantry-empty-state">
              <Text style={[styles.emptyPantryTitle, typography.bodyMd]}>
                Sin alimentos registrados
              </Text>
              <Text style={[styles.emptyPantryText, typography.bodySm]}>
                Toca aquí para registrar tus ingredientes y optimizar tu presupuesto.
              </Text>
            </View>
          ) : summary.urgentCount > 0 ? (
            <>
              {/* Urgent alert notice */}
              <View style={styles.urgentBanner} testID="home-urgent-banner">
                <View style={styles.urgentBannerLeft}>
                  <MaterialIcons name="schedule" size={18} color={colors.secondary} />
                  <Text style={[styles.urgentBannerTitle, typography.labelSm]}>
                    {summary.urgentCount} consumir pronto
                  </Text>
                </View>
                <Text style={[styles.urgentBannerTag, typography.labelSm]}>
                  Prioritarios
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
                  <MaterialIcons name="check-circle" size={18} color={colors.primary} />
                  <Text style={[styles.okBannerTitle, typography.labelSm]}>
                    Todos al día
                  </Text>
                </View>
                <Text style={[styles.okBannerTag, typography.labelSm]}>
                  Sin urgencias
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
              <MaterialIcons name="savings" size={26} color={colors.onTertiaryContainer} />
            </View>
            <View style={styles.budgetCol}>
              <View style={styles.budgetLabelRow}>
                <Text style={[styles.budgetLabel, typography.labelSm]}>
                  PRESUPUESTO DISPONIBLE
                </Text>
              </View>
              <Text
                style={[styles.budgetAmount, typography.headlineXl]}
                accessibilityLabel={`Presupuesto disponible: ${budget.toLocaleString('es-CO')} pesos colombianos`}
              >
                ${budget.toLocaleString('es-CO')}
                <Text style={[styles.budgetCurrency, typography.labelMd]}> COP</Text>
              </Text>
            </View>

            <Button
              testID="home-adjust-budget-button"
              title="Ajustar"
              variant="outline"
              size="sm"
              style={styles.adjustButton}
              onPress={handleOpenBudgetModal}
              accessibilityLabel="Ajustar presupuesto disponible"
              accessibilityHint="Abre un formulario para actualizar el presupuesto disponible"
              leftIcon={<MaterialIcons name="tune" size={16} color={colors.textPrimary} />}
            />
          </View>
        </Card>

        {/* 4. Recommendation of the Day (selección real y determinista sobre RecipeContext) */}
        <View style={styles.recommendationSection} testID="home-recommendation-section">
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleCol}>
              <View style={styles.sectionTitleRow}>
                <MaterialIcons name="auto-awesome" size={20} color={colors.tertiary} />
                <Text style={[styles.sectionTitle, typography.headlineMd]}>
                  Recomendación del día
                </Text>
              </View>
              {recommendedRecipe && (
                <Text style={[styles.sectionSubtitle, typography.labelSm]}>
                  Según tu despensa y presupuesto actuales
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
                  ? 'Generando recomendaciones con tu despensa actual...'
                  : 'Cargando tu despensa...'}
              </Text>
            </Card>
          ) : recommendation.kind === 'empty-pantry' ? (
            renderStateCard({
              testID: 'home-recommendation-empty-pantry',
              icon: 'kitchen',
              title: 'Tu despensa está vacía',
              message:
                'Registra o escanea tus alimentos para recibir una recomendación basada en lo que realmente tienes.',
              actionTestID: 'home-recommendation-go-pantry-button',
              actionTitle: 'Ir a mi despensa',
              actionIcon: 'add-circle-outline',
              onAction: goToPantry,
              actionHint: 'Abre la pantalla de despensa para registrar ingredientes',
            })
          ) : recommendation.kind === 'demo' ? (
            renderStateCard({
              testID: 'home-recommendation-demo-state',
              icon: 'auto-awesome',
              title: 'Aún no tienes una recomendación personalizada',
              message:
                'Genera recetas con IA a partir de tu despensa y presupuesto. Las recetas de ejemplo no se muestran aquí porque no están calculadas para ti.',
              actionTestID: 'home-recommendation-generate-button',
              actionTitle: 'Generar recomendaciones',
              actionIcon: 'restaurant-menu',
              onAction: goToRecipeGeneration,
              actionHint: 'Abre Recetas, donde puedes generar recomendaciones con IA',
            })
          ) : recommendation.kind === 'stale' ? (
            renderStateCard({
              testID: 'home-recommendation-stale-state',
              icon: 'update',
              title: 'Tu despensa o preferencias cambiaron',
              message:
                'La recomendación anterior se calculó con otra despensa, presupuesto, número de personas o tiempo. Actualízala para ver costos vigentes.',
              actionTestID: 'home-recommendation-refresh-button',
              actionTitle: 'Actualizar recomendación',
              actionIcon: 'refresh',
              onAction: goToRecipeGeneration,
              actionHint: 'Abre Recetas para volver a generar recomendaciones con tus datos actuales',
            })
          ) : recommendation.kind === 'error' ? (
            renderStateCard({
              testID: 'home-recommendation-error-state',
              icon: 'error-outline',
              title: 'No se pudo generar tu recomendación',
              message: recommendation.message,
              actionTestID: 'home-recommendation-generate-button',
              actionTitle: 'Ir a Recetas para reintentar',
              actionIcon: 'restaurant-menu',
              onAction: goToRecipeGeneration,
              actionHint: 'Abre Recetas, donde puedes reintentar la generación',
            })
          ) : recommendedRecipe && recommendedScore ? (
            <Card
              variant="elevated"
              style={styles.recipeCard}
              testID="home-recommended-recipe-card"
            >
              <RecipeImage
                source={recommendedRecipe.imageUrl}
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
                    accessibilityLabel={`Afinidad estimada por IA: ${recommendedRecipe.convenience}`}
                  >
                    <MaterialIcons name="verified" size={16} color={colors.tertiaryContainer} importantForAccessibility="no" accessibilityElementsHidden={true} />
                    <Text style={[styles.convenienceText, typography.labelSm]}>
                      {typeof recommendedRecipe.convenience === 'number'
                        ? `${recommendedRecipe.convenience}% conveniente`
                        : recommendedRecipe.convenience}
                    </Text>
                  </View>
                )}

                {/* Time & Servings pills */}
                <View style={styles.recipeMetaRow}>
                  <View style={styles.recipeMetaPill}>
                    <MaterialIcons name="timer" size={14} color={colors.textPrimary} />
                    <Text style={[styles.recipeMetaText, typography.labelSm]}>
                      {recommendedRecipe.totalMinutes} min
                    </Text>
                  </View>
                  <View style={styles.recipeMetaPill}>
                    <MaterialIcons name="group" size={14} color={colors.textPrimary} />
                    <Text style={[styles.recipeMetaText, typography.labelSm]}>
                      {recommendedRecipe.servings} persona{recommendedRecipe.servings === 1 ? '' : 's'}
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
                      <MaterialIcons name="kitchen" size={20} color={colors.primary} />
                      <Text style={[styles.highlightText, typography.bodySm]}>
                        Ya tienes {recommendedScore.availableCount} de{' '}
                        {recommendedScore.availableCount + recommendedScore.missingCount} ingredientes
                      </Text>
                    </View>
                  )}

                  {recommendedScore.missingCount === 0 &&
                  recommendedRecipe.estimatedMissingCost === 0 ? (
                    <View
                      style={[styles.highlightRow, styles.highlightRowPrimary]}
                      testID="home-recommendation-cost"
                    >
                      <MaterialIcons name="savings" size={20} color={colors.primary} />
                      <Text style={[styles.highlightText, typography.bodySm]}>
                        No necesitas comprar ingredientes adicionales
                      </Text>
                    </View>
                  ) : recommendedRecipe.withinBudget ? (
                    <View
                      style={[styles.highlightRow, styles.highlightRowPrimary]}
                      testID="home-recommendation-cost"
                    >
                      <MaterialIcons name="savings" size={20} color={colors.primary} />
                      <Text style={[styles.highlightText, typography.bodySm]}>
                        Solo necesitas aproximadamente{' '}
                        <Text style={[styles.highlightBold, { color: colors.primary }]}>
                          {formatCopCurrency(recommendedRecipe.estimatedMissingCost, false)}
                        </Text>
                      </Text>
                    </View>
                  ) : (
                    <View
                      style={[styles.highlightRow, styles.highlightRowWarning]}
                      testID="home-recommendation-cost"
                    >
                      <MaterialIcons name="warning-amber" size={20} color={colors.onErrorContainer} />
                      <Text style={[styles.highlightText, typography.bodySm]}>
                        Compra estimada de{' '}
                        <Text style={styles.highlightBold}>
                          {formatCopCurrency(recommendedRecipe.estimatedMissingCost, false)}
                        </Text>
                        : supera tu presupuesto
                      </Text>
                    </View>
                  )}

                  {recommendedRecipe.reason ? (
                    <View style={[styles.highlightRow, styles.highlightRowSecondary]}>
                      <MaterialIcons name="recycling" size={20} color={colors.secondary} />
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
                    Elegida entre tus {candidateCount} recetas generadas según presupuesto,
                    ingredientes que ya tienes y costo de lo que falta.
                  </Text>
                )}

                <Button
                  testID="home-view-recipe-button"
                  title="Ver receta"
                  variant="primary"
                  size="lg"
                  fullWidth
                  onPress={() => {
                    selectRecipe(recommendedRecipe);
                    router.push(`/recetas/${recommendedRecipe.id}` as any);
                  }}
                  accessibilityLabel={`Ver receta de ${recommendedRecipe.name}`}
                  accessibilityHint="Muestra los pasos detallados de la receta"
                  rightIcon={<MaterialIcons name="arrow-forward" size={18} color={colors.onPrimary} />}
                />
              </View>
            </Card>
          ) : (
            renderStateCard({
              testID: 'home-empty-recipe-state',
              icon: 'menu-book',
              title: 'Sin recomendaciones disponibles',
              message:
                'Aún no hay recetas generadas para tu despensa y presupuesto actuales. Genera recomendaciones con IA desde Recetas.',
              actionTestID: 'home-recommendation-generate-button',
              actionTitle: 'Generar recomendaciones',
              actionIcon: 'restaurant-menu',
              onAction: goToRecipeGeneration,
              actionHint: 'Abre Recetas, donde puedes generar recomendaciones con IA',
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
            accessibilityLabel="Diálogo de ajuste de presupuesto"
          >
            <View style={styles.modalIconBox}>
              <MaterialIcons name="account-balance-wallet" size={28} color={colors.primary} />
            </View>

            <Text style={[styles.modalTitle, typography.headlineMd]}>
              Ajustar presupuesto
            </Text>

            <Text style={[styles.modalDescription, typography.bodySm]}>
              Ingresa el presupuesto disponible en pesos colombianos (COP). Este valor se guarda en tus preferencias para estimar y recomendar tus recetas.
            </Text>

            <View style={styles.budgetInputContainer}>
              <Input
                testID="budget-input-field"
                label="Presupuesto disponible (COP)"
                placeholder="Ej. 25000"
                keyboardType="numeric"
                value={tempBudgetText}
                onChangeText={(val) => {
                  setTempBudgetText(val);
                  if (budgetError) setBudgetError(undefined);
                }}
                errorMessage={budgetError}
                helperText="Ingresa un valor mayor o igual a 0"
                leftElement={
                  <Text style={styles.currencyPrefix}>$</Text>
                }
              />
            </View>

            <View style={styles.modalButtonsRow}>
              <Button
                testID="budget-cancel-button"
                title="Cancelar"
                variant="outline"
                size="md"
                style={styles.modalButtonFlex}
                onPress={handleCloseBudgetModal}
                accessibilityLabel="Cancelar ajuste de presupuesto"
              />
              <Button
                testID="budget-confirm-button"
                title="Confirmar"
                variant="primary"
                size="md"
                style={styles.modalButtonFlex}
                onPress={handleSaveBudget}
                accessibilityLabel="Confirmar nuevo presupuesto"
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
    backgroundColor: colors.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.margin,
    paddingVertical: spacing.sm,
    backgroundColor: colors.canvas,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    zIndex: 2,
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
  demoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    backgroundColor: colors.surfaceContainerLow,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  demoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(91, 75, 138, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  demoBadgeText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 11,
  },
  demoNoticeText: {
    color: colors.textSecondary,
    fontSize: 12,
    flex: 1,
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
    backgroundColor: colors.tertiaryFixed,
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
    backgroundColor: colors.tertiary,
    opacity: 0.45,
  },
  budgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  budgetIconBox: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  adjustButton: {
    backgroundColor: colors.surface,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  budgetCol: {
    flex: 1,
  },
  budgetLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 4,
  },
  budgetLabel: {
    color: colors.onTertiaryContainer,
    letterSpacing: 0.5,
  },
  budgetAmount: {
    color: colors.onTertiaryFixed,
    fontWeight: '700',
    fontSize: 26,
    lineHeight: 32,
  },
  budgetCurrency: {
    color: colors.onTertiaryContainer,
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
    color: '#1C1C19',
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

