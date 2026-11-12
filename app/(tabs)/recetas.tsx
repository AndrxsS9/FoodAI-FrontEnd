/**
 * FoodAI - Pestaña central de Recetas: descubrimiento y listado (Fase 2C).
 * Es la única instancia de esta pantalla; `/recetas` resuelve aquí. Las recetas viven en
 * RecipeContext y solo se generan al pulsar el botón, nunca al abrir la pestaña.
 * Inspirada en la pantalla Stitch «8. Opciones Convenientes».
 *
 * Muestra recetas optimizadas según la despensa del usuario y el presupuesto disponible,
 * distinguiendo entre ingredientes disponibles y faltantes, y etiquetando explícitamente
 * los datos demostrativos aislados para esta fase.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import { Button, Card, Chip, Input, Stepper } from '../../src/components/common';
import { RecipeImage } from '../../src/components/recipe/RecipeImage';
import { getRecipeImageSource } from '../../src/utils/recipeImageCatalog';
import { usePantry } from '../../src/context/PantryContext';
import { useBudget } from '../../src/context/BudgetContext';
import { useRecipes } from '../../src/context/RecipeContext';
import { ClientRecipe } from '../../src/types/recipe';
import { AppColors, getAppSurfaces, radius, spacing, useAppTheme, useThemeStyles, useTypography } from '../../src/theme';
import { useLocale } from '../../src/context/LocaleContext';
import type { MessageKey } from '../../src/locales';
import { localizeCodedError, localizeMessage } from '../../src/locales/messages';

type FilterType = 'all' | 'low-cost' | 'quick' | 'urgent';

export default function RecipeDiscoveryScreen() {
  const typography = useTypography();
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const { t, tx, tp, locale, format } = useLocale();

  const { summary } = usePantry();
  const {
    budget,
    servings,
    setServings,
    storageError,
    clearStorageError,
  } = useBudget();
  const {
    recipes,
    isDemoMode,
    selectRecipe,
    isLoading,
    isGenerating,
    isRestoring,
    isStale,
    error,
    errorCode,
    generateRecipes,
    clearError,
    persistenceWarningCode,
    clearPersistenceWarning,
  } = useRecipes();

  // Presentación localizada: los códigos estables se traducen; nunca se muestran textos internos.
  const localizedError = localizeCodedError('recipes', errorCode, error, locale);
  const persistenceWarning = persistenceWarningCode
    ? tx(`persistence.recipes.${persistenceWarningCode}` as MessageKey)
    : null;
  const localizedStorageError = localizeMessage(storageError, locale, {
    fallbackKey: 'messages.budget.fallback',
  });

  // Estados de control para persistencia asíncrona de comensales
  const [isUpdatingServings, setIsUpdatingServings] = useState(false);
  const isUpdatingServingsRef = useRef(false);

  const handleServingsChange = useCallback(
    async (newServings: number) => {
      // Bloquear invocaciones concurrentes o fuera de límites
      if (isUpdatingServingsRef.current) return;
      if (newServings < 1 || newServings > 12) return;
      if (newServings === servings) return;

      isUpdatingServingsRef.current = true;
      setIsUpdatingServings(true);
      try {
        await setServings(newServings);
      } catch {
        // BudgetContext captura, registra y propaga storageError
      } finally {
        isUpdatingServingsRef.current = false;
        setIsUpdatingServings(false);
      }
    },
    [servings, setServings]
  );

  // Estados de búsqueda y filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [maxMinutesFilter, setMaxMinutesFilter] = useState<number | null>(null);

  // Filtrado reactivo de recetas
  const filteredRecipes = useMemo(() => {
    let result = recipes;

    // Filtro por texto de búsqueda
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(query) ||
          r.description.toLowerCase().includes(query) ||
          r.ingredients.some((ing) => ing.name.toLowerCase().includes(query))
      );
    }

    // Filtro por categoría o criterio
    if (activeFilter === 'low-cost') {
      result = result.filter((r) => r.estimatedMissingCost <= 3000);
    } else if (activeFilter === 'quick') {
      result = result.filter((r) => r.totalMinutes <= 25);
    } else if (activeFilter === 'urgent') {
      result = result.filter((r) =>
        r.reason.toLowerCase().includes('urgente') ||
        r.reason.toLowerCase().includes('dañen')
      );
    }

    // Filtro por tiempo máximo explícito
    if (maxMinutesFilter !== null) {
      result = result.filter((r) => r.totalMinutes <= maxMinutesFilter);
    }

    return result;
  }, [recipes, searchQuery, activeFilter, maxMinutesFilter]);

  const handleSelectRecipe = (recipe: ClientRecipe) => {
    selectRecipe(recipe);
    router.push(`/recetas/${recipe.id}` as any);
  };

  const handleGenerateRecipes = async () => {
    try {
      await generateRecipes();
    } catch {
      // El error queda expuesto en RecipeContext y se renderiza en la UI
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* 1. Header con branding e identidad FoodAI */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image
            source={require('../../assets/images/logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
            accessibilityLabel={t('recipes.logoLabel')}
          />
          <Text
            style={[styles.headerTitle, typography.headlineMd]}
            numberOfLines={1}
            accessibilityRole="header"
          >
            {t('recipes.title')}
          </Text>
        </View>

        <Pressable
          testID="recipes-profile-avatar"
          accessibilityRole="button"
          accessibilityLabel={t('recipes.profileAvatarLabel')}
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
        testID="recipes-scroll-view"
      >
        {/* 2. Banner de transparencia de datos demostrativos (solo en modo demo) */}
        {isDemoMode && (
          <View
            style={styles.demoBanner}
            testID="recipes-demo-banner"
            accessibilityRole="text"
            accessibilityLabel={t('recipes.demoNotice')}
          >
            <View style={styles.demoBadge}>
              <MaterialCommunityIcons name="flask-outline" size={14} color={colors.primary} />
              <Text style={[styles.demoBadgeText, typography.labelSm]}>
                {t('recipes.demoBadge')}
              </Text>
            </View>
            <Text style={[styles.demoNoticeText, typography.bodySm]}>
              {t('recipes.demoNotice')}
            </Text>
          </View>
        )}

        {/* 2.1. Aviso cuando la despensa está vacía */}
        {summary.totalCount === 0 && (
          <Card
            variant="outlined"
            style={styles.emptyPantryNoticeCard}
            testID="recipes-empty-pantry-notice"
          >
            <View style={styles.emptyPantryNoticeHeader}>
              <MaterialCommunityIcons name="information-outline" size={20} color={colors.primary} />
              <Text style={[styles.emptyPantryNoticeTitle, typography.labelLg]}>
                {t('recipes.emptyPantryTitle')}
              </Text>
            </View>
            <Text style={[styles.emptyPantryNoticeText, typography.bodySm]}>
              {t('recipes.emptyPantryText')}
            </Text>
            <Button
              testID="recipes-empty-pantry-cta"
              title={t('recipes.goToPantry')}
              variant="outline"
              size="sm"
              onPress={() => router.push('/(tabs)/despensa')}
            />
          </Card>
        )}

        {/* 3. Hero y contexto Stitch 8 */}
        <View style={styles.heroSection}>
          <View style={styles.pantryBadge}>
            <MaterialCommunityIcons name="leaf" size={14} color={colors.onTertiaryContainer} />
            <Text style={[styles.pantryBadgeText, typography.labelSm]}>
              {t('recipes.pantryBadge', { count: summary.totalCount })}
            </Text>
          </View>
          {!isDemoMode && recipes.length > 0 && (
            <View style={styles.realAiBadge} testID="recipes-count-badge">
              <MaterialCommunityIcons name="creation" size={14} color={colors.onTertiaryContainer} />
              <Text style={[styles.realAiBadgeText, typography.labelSm]}>
                {tp('recipes.aiCountBadge', recipes.length)}
              </Text>
            </View>
          )}
          <Text
            style={[styles.heroHeadline, typography.headlineXl]}
            accessibilityRole="header"
          >
            {t('recipes.heroHeadline')}
          </Text>
          <Text style={[styles.heroSubtitle, typography.bodySm]}>
            {t('recipes.heroSubtitle')}
          </Text>
        </View>

        {/* 4. Barra de presupuesto compartido y comensales */}
        <Card variant="elevated" style={styles.budgetBarCard}>
          <View style={styles.budgetBarRow}>
            <View style={styles.budgetCol}>
              <View style={styles.budgetLabelRow}>
                <MaterialCommunityIcons name="cash-multiple" size={16} color={colors.outline} />
                <Text style={[styles.budgetLabel, typography.labelSm]}>
                  {t('recipes.budgetAvailable')}
                </Text>
              </View>
              <Text style={[styles.budgetAmount, typography.headlineMd]}>
                {format.currency(budget)}
              </Text>
            </View>

            <View style={styles.servingsCol}>
              <Text style={[styles.servingsLabel, typography.labelSm]}>
                {t('recipes.diners')}
              </Text>
              <Stepper
                value={servings}
                min={1}
                max={12}
                step={1}
                unit={t('recipes.dinersUnit')}
                disabled={isUpdatingServings}
                onChange={handleServingsChange}
                accessibilityLabel={t('recipes.dinersStepperLabel')}
              />
            </View>
          </View>
        </Card>

        {/* 4.1. Aviso de error de persistencia de comensales o presupuesto */}
        {localizedStorageError && (
          <Card
            variant="outlined"
            style={styles.storageErrorCard}
            testID="recipes-storage-error"
            accessibilityRole="text"
            accessibilityLabel={t('recipes.storageErrorLabel', { message: localizedStorageError })}
          >
            <View style={styles.storageErrorRow}>
              <MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.error} />
              <View style={styles.storageErrorTextCol}>
                <Text style={[styles.storageErrorTitle, typography.labelMd]}>
                  {t('recipes.storageErrorTitle')}
                </Text>
                <Text style={[styles.storageErrorDesc, typography.bodySm]}>
                  {localizedStorageError}
                </Text>
              </View>
              <Pressable
                testID="recipes-dismiss-storage-error-button"
                onPress={clearStorageError}
                accessibilityRole="button"
                accessibilityLabel={t('recipes.dismissError')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialCommunityIcons name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
          </Card>
        )}

        {/* 4.2. Aviso no bloqueante: recetas generadas pero no guardadas en el dispositivo */}
        {persistenceWarning && (
          <Card
            variant="outlined"
            style={styles.storageErrorCard}
            testID="recipes-persistence-warning"
            accessibilityRole="text"
            accessibilityLabel={t('recipes.persistenceWarningLabel', { message: persistenceWarning })}
          >
            <View
              style={styles.storageErrorRow}
              testID="recipes-persistence-warning-live"
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              <MaterialCommunityIcons name="cloud-off-outline" size={20} color={colors.error} />
              <View style={styles.storageErrorTextCol}>
                <Text style={[styles.storageErrorTitle, typography.labelMd]}>
                  {t('recipes.persistenceWarningTitle')}
                </Text>
                <Text style={[styles.storageErrorDesc, typography.bodySm]}>
                  {persistenceWarning}
                </Text>
              </View>
              <Pressable
                testID="recipes-dismiss-persistence-warning-button"
                onPress={clearPersistenceWarning}
                accessibilityRole="button"
                accessibilityLabel={t('recipes.dismissPersistenceWarning')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialCommunityIcons name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
          </Card>
        )}

        {/* 4.2. Acción Principal: Generar recetas con IA */}
        <View style={styles.aiActionSection}>
          <Button
            testID="recipes-generate-ai-button"
            title={isGenerating ? t('recipes.generating') : t('recipes.generate')}
            variant="primary"
            size="lg"
            fullWidth
            loading={isGenerating}
            disabled={isGenerating || summary.totalCount === 0}
            onPress={handleGenerateRecipes}
            accessibilityLabel={t('recipes.generateLabel')}
            accessibilityHint={t('recipes.generateHint')}
            leftIcon={
              !isGenerating ? (
                <MaterialCommunityIcons name="creation" size={20} color={colors.onPrimary} />
              ) : undefined
            }
          />
        </View>

        {/* 4.3. Aviso de recetas obsoletas (isStale) */}
        {isStale && !isGenerating && (
          <View style={styles.staleNoticeCard} testID="recipes-stale-banner">
            <View style={styles.staleNoticeContent}>
              <MaterialCommunityIcons name="update" size={22} color={colors.onTertiaryContainer} />
              <View style={styles.staleNoticeTextCol}>
                <Text style={[styles.staleNoticeTitle, typography.labelMd]}>
                  {t('recipes.staleTitle')}
                </Text>
                <Text style={[styles.staleNoticeDesc, typography.bodySm]}>
                  {t('recipes.staleDesc')}
                </Text>
              </View>
            </View>
            <Button
              testID="recipes-stale-regenerate-button"
              title={t('recipes.refresh')}
              variant="outline"
              size="sm"
              disabled={isGenerating || summary.totalCount === 0}
              onPress={handleGenerateRecipes}
            />
          </View>
        )}

        {/* 4.4. Tarjeta de error de API al generar con IA */}
        {localizedError && !isGenerating && (
          <Card variant="outlined" style={styles.apiErrorCard} testID="recipes-api-error-card">
            <View style={styles.apiErrorRow}>
              <MaterialCommunityIcons name="alert-circle-outline" size={24} color={colors.error} />
              <View style={styles.apiErrorTextCol}>
                <Text style={[styles.apiErrorTitle, typography.headlineMd]}>
                  {t('recipes.apiErrorTitle')}
                </Text>
                <Text style={[styles.apiErrorDesc, typography.bodySm]}>{localizedError}</Text>
              </View>
            </View>
            <View style={styles.apiErrorActions}>
              <Button
                testID="recipes-retry-button"
                title={t('common.retry')}
                variant="primary"
                size="sm"
                disabled={isGenerating || summary.totalCount === 0}
                onPress={handleGenerateRecipes}
              />
              <Button
                testID="recipes-dismiss-api-error-button"
                title={t('recipes.dismiss')}
                variant="ghost"
                size="sm"
                onPress={clearError}
              />
            </View>
          </Card>
        )}

        {/* 5. Búsqueda y Chips de Filtro */}
        <View style={styles.filterSection}>
          <Input
            testID="recipes-search-input"
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t('recipes.searchPlaceholder')}
            leftIcon={
              <MaterialCommunityIcons name="magnify" size={20} color={colors.outline} />
            }
            rightIcon={
              searchQuery ? (
                <Pressable
                  testID="recipes-clear-search-button"
                  onPress={() => setSearchQuery('')}
                  accessibilityRole="button"
                  accessibilityLabel={t('recipes.clearSearch')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialCommunityIcons name="close" size={18} color={colors.outline} />
                </Pressable>
              ) : undefined
            }
            accessibilityLabel={t('recipes.searchLabel')}
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterChipsRow}
          >
            <Chip
              testID="filter-chip-all"
              label={t('recipes.filterAll')}
              variant="filter"
              selected={activeFilter === 'all'}
              onPress={() => setActiveFilter('all')}
            />
            <Chip
              testID="filter-chip-low-cost"
              label={t('recipes.filterLowCost', { amount: format.currency(3000, false) })}
              variant="filter"
              selected={activeFilter === 'low-cost'}
              onPress={() => setActiveFilter('low-cost')}
            />
            <Chip
              testID="filter-chip-quick"
              label={t('recipes.filterQuick')}
              variant="filter"
              selected={activeFilter === 'quick'}
              onPress={() => setActiveFilter('quick')}
            />
            <Chip
              testID="filter-chip-max-30"
              label={t('recipes.filterMax30')}
              variant="filter"
              selected={maxMinutesFilter === 30}
              onPress={() => setMaxMinutesFilter((prev) => (prev === 30 ? null : 30))}
            />
            <Chip
              testID="filter-chip-urgent"
              label={t('recipes.filterUrgent')}
              variant="filter"
              selected={activeFilter === 'urgent'}
              onPress={() => setActiveFilter('urgent')}
            />
          </ScrollView>
        </View>

        {/* 6. Estados de Carga, Error o Lista */}
        {isLoading || isGenerating || isRestoring ? (
          <View
            style={styles.centerContainer}
            testID="recipes-loading-state"
            accessibilityRole="progressbar"
            accessibilityLabel={t('recipes.loadingLabel')}
          >
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, typography.bodyMd]}>
              {isGenerating
                ? t('recipes.loadingGenerating')
                : t('recipes.loadingSearching')}
            </Text>
          </View>
        ) : recipes.length === 0 ? (
          /* Usuario real sin recetas generadas todavía: no es un problema de filtros.
             Si la generación falló, el error y "Reintentar" ya se muestran en la tarjeta de
             error de API (4.4); no se duplica aquí. */
          <Card
            variant="outlined"
            style={styles.emptyCard}
            testID="recipes-no-generated-state"
          >
            <MaterialCommunityIcons name="silverware-fork-knife" size={40} color={colors.outline} />
            <Text style={[styles.emptyTitle, typography.headlineMd]}>
              {t('recipes.noGeneratedTitle')}
            </Text>
            <Text style={[styles.emptyDesc, typography.bodySm]}>
              {t('recipes.noGeneratedDesc')}
            </Text>
          </Card>
        ) : filteredRecipes.length === 0 ? (
          <Card
            variant="outlined"
            style={styles.emptyCard}
            testID="recipes-empty-state"
          >
            <MaterialCommunityIcons name="silverware-fork-knife" size={40} color={colors.outline} />
            <Text style={[styles.emptyTitle, typography.headlineMd]}>
              {t('recipes.noResultsTitle')}
            </Text>
            <Text style={[styles.emptyDesc, typography.bodySm]}>
              {t('recipes.noResultsDesc')}
            </Text>
            <Button
              testID="recipes-reset-filter-button"
              title={t('recipes.resetFilters')}
              variant="outline"
              size="sm"
              onPress={() => {
                setSearchQuery('');
                setActiveFilter('all');
                setMaxMinutesFilter(null);
              }}
            />
          </Card>
        ) : (
          /* 7. Lista de Tarjetas de Recetas */
          <View style={styles.recipeList} testID="recipes-list-container">
            {filteredRecipes.map((recipe, index) => (
              <RecipeCardItem
                key={recipe.id}
                recipe={recipe}
                isDominant={index === 0}
                onPress={() => handleSelectRecipe(recipe)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

interface RecipeCardItemProps {
  recipe: ClientRecipe;
  isDominant?: boolean;
  onPress: () => void;
}

function RecipeCardItem({ recipe, isDominant, onPress }: RecipeCardItemProps) {
  const typography = useTypography();
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const { t, tp, locale, format } = useLocale();
  const availableCount = recipe.availableIngredients.length;
  const totalIngredientsCount = recipe.ingredients.length;
  const image = useMemo(() => getRecipeImageSource(recipe), [recipe]);

  return (
    <Card
      variant="elevated"
      style={[styles.recipeCard, isDominant && styles.dominantCard]}
      testID={`recipe-card-${recipe.id}`}
    >
      {/* Imagen o cabecera visual de respaldo con RecipeImage */}
      <RecipeImage
        source={image.source}
        referenceLabel={image.referenceLabel}
        recipeName={recipe.name}
        isDemo={recipe.isDemoFixture}
        containerStyle={styles.imageWrapper}
        fallbackTestID={`recipe-fallback-image-${recipe.id}`}
        testID={`recipe-image-${recipe.id}`}
        borderRadius={0}
      >
        {/* Badge de afinidad / conveniencia */}
        <View style={styles.convenienceBadge}>
          <MaterialCommunityIcons name="check-decagram" size={14} color={colors.onTertiaryContainer} importantForAccessibility="no" accessibilityElementsHidden={true} />
          <Text style={[styles.convenienceBadgeText, typography.labelSm]}>
            {localizeMessage(String(recipe.convenience), locale, { passthroughUnknown: true })}
          </Text>
        </View>

        {/* Título en tarjeta dominante o normal */}
        {isDominant && (
          <View style={styles.dominantTitleOverlay}>
            <Text style={[styles.dominantTitle, typography.headlineLg]} numberOfLines={2} accessibilityRole="header">
              {recipe.name}
            </Text>
          </View>
        )}
      </RecipeImage>

      <View style={styles.cardBody}>
        {!isDominant && (
          <Text style={[styles.recipeTitle, typography.headlineMd]} numberOfLines={2}>
            {recipe.name}
          </Text>
        )}

        <Text style={[styles.recipeDesc, typography.bodySm]} numberOfLines={2}>
          {recipe.description}
        </Text>

        {/* Métricas clave: despensa y compra estimada */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricItem}>
            <View style={styles.metricIconCircle}>
              <MaterialCommunityIcons name="fridge-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.metricTextCol}>
              <Text style={[styles.metricLabel, typography.labelSm]}>{t('recipes.metricPantry')}</Text>
              <Text style={[styles.metricValue, typography.labelMd]}>
                {t('recipes.metricReady', { available: availableCount, total: totalIngredientsCount })}
              </Text>
            </View>
          </View>

          <View style={styles.metricItem}>
            <View style={[styles.metricIconCircle, { backgroundColor: colors.errorContainer }]}>
              <MaterialCommunityIcons name="cart-outline" size={18} color={colors.secondary} />
            </View>
            <View style={styles.metricTextCol}>
              <Text style={[styles.metricLabel, typography.labelSm]}>{t('recipes.metricPurchase')}</Text>
              <Text style={[styles.metricValue, typography.labelMd, { color: colors.secondary, fontWeight: '700' }]}>
                {format.currency(recipe.estimatedMissingCost)}
              </Text>
            </View>
          </View>
        </View>

        {/* Tiempo y porciones */}
        <View style={styles.metaRow}>
          <View style={styles.metaPill}>
            <MaterialCommunityIcons name="clock-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.metaText, typography.bodySm]}>{t('minutesShort', { count: recipe.totalMinutes })}</Text>
          </View>
          <View style={styles.metaDivider} />
          <View style={styles.metaPill}>
            <MaterialCommunityIcons name="account-group" size={16} color={colors.textSecondary} />
            <Text style={[styles.metaText, typography.bodySm]}>{tp('people', recipe.servings)}</Text>
          </View>
        </View>

        {/* Razón contextual de conveniencia */}
        {recipe.reason ? (
          <View style={styles.reasonBox}>
            <MaterialCommunityIcons name="lightbulb-on-outline" size={18} color={colors.hintText} style={styles.reasonIcon} />
            <Text style={[styles.reasonText, typography.bodySm]}>
              {recipe.reason}
            </Text>
          </View>
        ) : null}

        {/* Botón de acción principal */}
        <Button
          testID={`recipe-view-button-${recipe.id}`}
          title={t('recipes.viewRecipe')}
          variant="primary"
          size="md"
          fullWidth
          onPress={onPress}
          rightIcon={<MaterialCommunityIcons name="arrow-right" size={18} color={colors.onPrimary} />}
          accessibilityLabel={t('recipes.viewRecipeLabel', { name: recipe.name })}
          accessibilityHint={t('recipes.viewRecipeHint')}
        />
      </View>
    </Card>
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
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flex: 1,
      minWidth: 0,
    },
    logoImage: {
      width: 28,
      height: 28,
    },
    headerTitle: {
      color: colors.textPrimary,
      fontWeight: '700',
      flex: 1,
    },
    avatarButton: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      backgroundColor: colors.primaryAction,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarPressed: {
      opacity: 0.8,
    },
    scrollContent: {
      paddingBottom: spacing.xl * 2,
    },
    demoBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginHorizontal: spacing.margin,
      marginTop: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: radius.md,
    },
    demoBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      backgroundColor: colors.iconTile,
      borderRadius: radius.full,
    },
    demoBadgeText: {
      color: colors.primary,
      fontWeight: '700',
      fontSize: 10,
    },
    demoNoticeText: {
      color: colors.textSecondary,
      flex: 1,
      fontSize: 11,
      lineHeight: 15,
    },
    heroSection: {
      paddingHorizontal: spacing.margin,
      paddingTop: spacing.md,
      paddingBottom: spacing.xs,
    },
    pantryBadge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      backgroundColor: colors.tertiaryContainer,
      borderRadius: radius.full,
      marginBottom: spacing.xs,
    },
    pantryBadgeText: {
      color: colors.onTertiaryContainer,
      fontWeight: '700',
      fontSize: 11,
      textTransform: 'uppercase',
    },
    heroHeadline: {
      color: colors.textPrimary,
      fontWeight: '700',
      letterSpacing: -0.5,
    },
    heroSubtitle: {
      color: colors.textSecondary,
      marginTop: 4,
    },
    budgetBarCard: {
      marginHorizontal: spacing.margin,
      marginTop: spacing.sm,
      padding: spacing.md,
      backgroundColor: colors.surface,
    },
    budgetBarRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    budgetCol: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 170,
    },
    budgetLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginBottom: 2,
    },
    budgetLabel: {
      color: colors.outline,
      letterSpacing: 0.5,
    },
    budgetAmount: {
      color: colors.textPrimary,
      fontWeight: '700',
    },
    servingsCol: {
      alignItems: 'flex-end',
      marginLeft: 'auto',
    },
    servingsLabel: {
      color: colors.outline,
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    filterSection: {
      paddingHorizontal: spacing.margin,
      marginTop: spacing.md,
      gap: spacing.sm,
    },
    filterChipsRow: {
      flexDirection: 'row',
      gap: spacing.xs,
      paddingVertical: 4,
    },
    recipeList: {
      paddingHorizontal: spacing.margin,
      marginTop: spacing.md,
      gap: spacing.md,
    },
    recipeCard: {
      padding: 0,
      overflow: 'hidden',
      backgroundColor: colors.surface,
      shadowColor: colors.cardShadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.07,
      shadowRadius: 12,
      elevation: 2,
    },
    dominantCard: {
      shadowColor: colors.primaryAction,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.14,
      shadowRadius: 18,
      elevation: 5,
    },
    imageWrapper: {
      position: 'relative',
      width: '100%',
      height: 180,
      backgroundColor: colors.surfaceContainer,
    },
    recipeImage: {
      width: '100%',
      height: '100%',
    },
    imageFallback: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceContainerLow,
      gap: spacing.xs,
    },
    imageFallbackText: {
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
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radius.full,
      elevation: 2,
      shadowColor: '#000',
      shadowOpacity: 0.1,
      shadowRadius: 4,
    },
    convenienceBadgeText: {
      color: colors.onTertiaryContainer,
      fontWeight: '700',
      fontSize: 11,
    },
    dominantTitleOverlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    dominantTitle: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    cardBody: {
      padding: spacing.md,
      gap: spacing.sm,
    },
    recipeTitle: {
      color: colors.textPrimary,
      fontWeight: '700',
    },
    recipeDesc: {
      color: colors.textSecondary,
      lineHeight: 18,
    },
    metricsGrid: {
      flexDirection: 'row',
      gap: spacing.sm,
      backgroundColor: colors.surfaceContainerLow,
      padding: spacing.sm,
      borderRadius: radius.md,
    },
    metricItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    metricIconCircle: {
      width: 32,
      height: 32,
      borderRadius: radius.full,
      backgroundColor: colors.iconTile,
      alignItems: 'center',
      justifyContent: 'center',
    },
    metricTextCol: {
      flex: 1,
      minWidth: 0,
    },
    metricLabel: {
      color: colors.outline,
      fontSize: 10,
    },
    metricValue: {
      color: colors.textPrimary,
      fontWeight: '600',
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: 2,
    },
    metaPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    metaDivider: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.outlineVariant,
    },
    metaText: {
      color: colors.textSecondary,
    },
    reasonBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xs,
      backgroundColor: colors.hintBackground,
      padding: spacing.sm,
      borderRadius: radius.md + 4,
    },
    reasonIcon: {
      marginTop: 1,
    },
    reasonText: {
      color: colors.hintText,
      flex: 1,
      lineHeight: 18,
    },
    centerContainer: {
      paddingVertical: spacing.xl * 2,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
    },
    loadingText: {
      color: colors.textSecondary,
    },
    errorCard: {
      marginHorizontal: spacing.margin,
      marginTop: spacing.xl,
      padding: spacing.lg,
      alignItems: 'center',
      gap: spacing.sm,
    },
    errorTitle: {
      color: colors.error,
      fontWeight: '700',
    },
    errorDesc: {
      color: colors.textSecondary,
      textAlign: 'center',
    },
    emptyCard: {
      marginHorizontal: spacing.margin,
      marginTop: spacing.xl,
      padding: spacing.lg,
      alignItems: 'center',
      gap: spacing.sm,
    },
    emptyTitle: {
      color: colors.textPrimary,
      fontWeight: '700',
      textAlign: 'center',
    },
    emptyDesc: {
      color: colors.textSecondary,
      textAlign: 'center',
    },
    emptyPantryNoticeCard: {
      padding: spacing.md,
      gap: spacing.xs,
      backgroundColor: colors.primaryFixed,
    },
    emptyPantryNoticeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    emptyPantryNoticeTitle: {
      color: colors.primary,
      fontWeight: '700',
    },
    emptyPantryNoticeText: {
      color: colors.textSecondary,
      lineHeight: 18,
    },
    storageErrorCard: {
      marginHorizontal: spacing.margin,
      marginTop: spacing.sm,
      padding: spacing.md,
      borderColor: colors.error,
      borderWidth: 1,
      backgroundColor: colors.errorContainer,
    },
    storageErrorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    storageErrorTextCol: {
      flex: 1,
    },
    storageErrorTitle: {
      color: colors.error,
      fontWeight: '700',
    },
    storageErrorDesc: {
      color: colors.textSecondary,
      lineHeight: 18,
    },
    realAiBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      backgroundColor: colors.tertiaryContainer,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: radius.full,
      marginBottom: spacing.xs,
    },
    realAiBadgeText: {
      color: colors.onTertiaryContainer,
      fontWeight: '700',
    },
    aiActionSection: {
      marginHorizontal: spacing.margin,
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
    },
    staleNoticeCard: {
      marginHorizontal: spacing.margin,
      marginTop: spacing.sm,
      padding: spacing.md,
      backgroundColor: colors.tertiaryFixed,
      borderRadius: radius.md,
      gap: spacing.sm,
    },
    staleNoticeContent: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    staleNoticeTextCol: {
      flex: 1,
    },
    staleNoticeTitle: {
      color: colors.onTertiaryContainer,
      fontWeight: '700',
    },
    staleNoticeDesc: {
      color: colors.onTertiaryContainer,
      lineHeight: 18,
    },
    apiErrorCard: {
      marginHorizontal: spacing.margin,
      marginTop: spacing.sm,
      padding: spacing.md,
      borderColor: colors.error,
      borderWidth: 1,
      backgroundColor: colors.errorContainer,
      gap: spacing.sm,
    },
    apiErrorRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    apiErrorTextCol: {
      flex: 1,
    },
    apiErrorTitle: {
      color: colors.error,
      fontWeight: '700',
    },
    apiErrorDesc: {
      color: colors.textSecondary,
      lineHeight: 18,
    },
    apiErrorActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: spacing.sm,
    },
  });
