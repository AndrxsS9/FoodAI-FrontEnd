/**
 * FoodAI - Pantalla de Detalle de Receta (Fase 2C).
 * Inspirada en la pantalla Stitch «9. Detalle de Receta».
 *
 * Muestra el desglose completo de una receta:
 * - Métricas de tiempo, porciones y costo de compra adicional.
 * - Desglose visual entre ingredientes disponibles en despensa e ingredientes por comprar.
 * - Checklist interactivo de preparación.
 * - Instrucciones completas de preparación.
 * - Acción primaria para iniciar el Modo Cocina guiado.
 */
import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card } from '../../src/components/common';
import { RecipeImage } from '../../src/components/recipe/RecipeImage';
import { usePantry } from '../../src/context/PantryContext';
import { useRecipes } from '../../src/context/RecipeContext';
import { useMealPlanSafe } from '../../src/context/MealPlanContext';
import {
  formatCopCurrency,
  formatIngredientQuantity,
} from '../../src/types/recipe';
import { AppColors, radius, spacing, useAppTheme, useThemeStyles, useTypography } from '../../src/theme';

export default function RecipeDetailScreen() {
  const typography = useTypography();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; fromPlan?: string }>();
  const { summary } = usePantry();
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);

  const recipeId = params.id ? String(params.id).trim() : '';
  const { getRecipeById, selectRecipe, demoMeta } = useRecipes();
  const mealPlan = useMealPlanSafe();

  const plannedRecipe = useMemo(() => {
    return mealPlan?.getRecipeById(recipeId);
  }, [mealPlan, recipeId]);

  // Búsqueda segura de la receta (soporta tanto ID como slug, activa en sesión o plan de comidas)
  const recipe = useMemo(() => {
    if (params.fromPlan === 'true' || plannedRecipe) {
      return plannedRecipe || getRecipeById(recipeId);
    }
    return getRecipeById(recipeId) || plannedRecipe;
  }, [params.fromPlan, plannedRecipe, getRecipeById, recipeId]);

  // Estado local para checklist interactivo de ingredientes disponibles
  const [checkedIngredients, setCheckedIngredients] = useState<Record<string, boolean>>({});

  const toggleCheck = (name: string) => {
    setCheckedIngredients((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
  };

  const handleBack = () => {
    if (params.fromPlan === 'true') {
      router.replace('/(tabs)/plan' as any);
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/recetas' as any);
    }
  };

  const handleStartCooking = () => {
    if (recipe) {
      selectRecipe(recipe);
      const isFromPlan = params.fromPlan === 'true' || Boolean(plannedRecipe);
      if (isFromPlan) {
        router.push({
          pathname: `/recetas/${recipe.id}/cocinar` as any,
          params: { fromPlan: 'true' },
        });
      } else {
        router.push(`/recetas/${recipe.id}/cocinar` as any);
      }
    }
  };

  // Manejo elegante de receta no encontrada o ID inválido
  if (!recipe) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable
            testID="recipe-detail-back-button"
            accessibilityRole="button"
            accessibilityLabel="Volver a recetas"
            onPress={handleBack}
            style={styles.backButton}
          >
            <MaterialIcons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, typography.headlineMd]}>Detalle de receta</Text>
        </View>

        <View style={styles.notFoundContainer} testID="recipe-not-found-state">
          <Card variant="outlined" style={styles.notFoundCard}>
            <MaterialIcons name="search-off" size={48} color={colors.outline} />
            <Text style={[styles.notFoundTitle, typography.headlineMd]}>
              Receta no encontrada
            </Text>
            <Text style={[styles.notFoundDesc, typography.bodyMd]}>
              El identificador solicitado «{recipeId || 'desconocido'}» no corresponde a ninguna receta disponible.
            </Text>
            <Button
              testID="recipe-not-found-return-button"
              title="Volver al catálogo de recetas"
              variant="primary"
              size="md"
              onPress={() => router.replace('/recetas' as any)}
            />
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* 1. Header con navegación accesible */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable
            testID="recipe-detail-back-button"
            accessibilityRole="button"
            accessibilityLabel="Volver al catálogo de recetas"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onPress={handleBack}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.backButtonPressed,
            ]}
          >
            <MaterialIcons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text
            style={[styles.headerTitle, typography.headlineMd]}
            numberOfLines={1}
            accessibilityRole="header"
          >
            Detalle de receta
          </Text>
        </View>

        <Pressable
          testID="recipe-detail-profile-avatar"
          accessibilityRole="button"
          accessibilityLabel="Perfil de usuario"
          onPress={() => router.push('/(tabs)/perfil')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.avatarButton}
        >
          <MaterialIcons name="person" size={20} color={colors.onPrimary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        testID="recipe-detail-scroll-view"
      >
        {/* 2. Banner de datos demostrativos */}
        {recipe.isDemoFixture && (
          <View
            style={styles.demoBanner}
            testID="recipe-detail-demo-banner"
            accessibilityRole="text"
          >
            <View style={styles.demoBadge}>
              <MaterialIcons name="science" size={14} color={colors.primary} />
              <Text style={[styles.demoBadgeText, typography.labelSm]}>
                {demoMeta.badgeLabel}
              </Text>
            </View>
            <Text style={[styles.demoNoticeText, typography.bodySm]}>
              {demoMeta.noticeText}
            </Text>
          </View>
        )}

        {/* 3. Hero Visual & Título */}
        <View style={styles.heroWrapper}>
          <RecipeImage
            source={recipe.imageUrl}
            recipeName={recipe.name}
            isDemo={recipe.isDemoFixture}
            containerStyle={styles.heroImageContainer}
            fallbackTestID="recipe-detail-fallback-image"
            testID="recipe-detail-image"
            borderRadius={radius.xl}
          >
            <View style={styles.heroGradientOverlay} accessible={false} importantForAccessibility="no" accessibilityElementsHidden={true} />

            {/* Badge de afinidad / conveniencia */}
            <View style={styles.conveniencePill}>
              <MaterialIcons name="stars" size={16} color={colors.onTertiaryContainer} importantForAccessibility="no" accessibilityElementsHidden={true} />
              <Text style={[styles.conveniencePillText, typography.labelMd]}>
                {String(recipe.convenience)}
              </Text>
            </View>

            <View style={styles.heroTitleBottom}>
              <View style={styles.pantryTag}>
                <Text style={[styles.pantryTagText, typography.labelSm]}>
                  APROVECHA TU DESPENSA
                </Text>
              </View>
              <Text
                style={[styles.heroTitle, typography.headlineXl]}
                accessibilityRole="header"
                testID="recipe-detail-title"
              >
                {recipe.name}
              </Text>
            </View>
          </RecipeImage>
        </View>

        {/* 4. Quick Meta Metrics (Stitch Screen 9) */}
        <View style={styles.metricsRow} testID="recipe-quick-metrics">
          <View style={styles.metricCardCol}>
            <View style={styles.metricIconBox}>
              <MaterialIcons name="timer" size={20} color={colors.primary} />
            </View>
            <Text style={[styles.metricLabel, typography.labelSm]}>Tiempo</Text>
            <Text style={[styles.metricMain, typography.labelLg]}>
              {recipe.totalMinutes} min
            </Text>
          </View>

          <View style={styles.metricCardCol}>
            <View style={styles.metricIconBox}>
              <MaterialIcons name="group" size={20} color={colors.primary} />
            </View>
            <Text style={[styles.metricLabel, typography.labelSm]}>Porciones</Text>
            <Text style={[styles.metricMain, typography.labelLg]}>
              {recipe.servings} personas
            </Text>
          </View>

          <View style={styles.metricCardCol}>
            <View style={[styles.metricIconBox, { backgroundColor: colors.errorContainer }]}>
              <MaterialIcons name="payments" size={20} color={colors.secondary} />
            </View>
            <Text style={[styles.metricLabel, typography.labelSm]}>Compra aprox.</Text>
            <Text
              style={[
                styles.metricMain,
                typography.labelLg,
                { color: colors.secondary, fontWeight: '700' },
              ]}
            >
              {formatCopCurrency(recipe.estimatedMissingCost, false)}
            </Text>
          </View>
        </View>

        {/* 4b. Estimaciones de Tiempo de Preparación y Cocción */}
        {(recipe.prepMinutes !== undefined || recipe.cookMinutes !== undefined) && (
          <View style={styles.timingBreakdownRow} testID="recipe-timing-breakdown">
            {recipe.prepMinutes !== undefined && (
              <View style={styles.timingItem} testID="recipe-prep-minutes">
                <MaterialIcons name="hourglass-empty" size={16} color={colors.primary} />
                <Text style={[styles.timingText, typography.labelSm]}>
                  Preparación: <Text style={styles.timingValue}>{recipe.prepMinutes} min</Text>
                </Text>
              </View>
            )}
            {recipe.cookMinutes !== undefined && (
              <View style={styles.timingItem} testID="recipe-cook-minutes">
                <MaterialIcons name="local-fire-department" size={16} color={colors.secondary} />
                <Text style={[styles.timingText, typography.labelSm]}>
                  Cocción: <Text style={styles.timingValue}>{recipe.cookMinutes} min</Text>
                </Text>
              </View>
            )}
          </View>
        )}

        {/* 5. Análisis de Presupuesto y Razón de Conveniencia */}
        <Card variant="elevated" style={styles.budgetStatusCard}>
          <View style={styles.budgetStatusRow}>
            <View style={styles.budgetStatusLeft}>
              <MaterialIcons
                name={recipe.withinBudget ? 'check-circle' : 'warning'}
                size={20}
                color={recipe.withinBudget ? colors.primary : colors.secondary}
              />
              <Text style={[styles.budgetStatusTitle, typography.labelMd]}>
                {recipe.withinBudget ? 'Compatible con tu presupuesto' : 'Supera tu presupuesto'}
              </Text>
            </View>
            <Text style={[styles.budgetStatusRemaining, typography.labelLg]}>
              {recipe.withinBudget
                ? `Te quedan: ${formatCopCurrency(recipe.budgetRemaining)}`
                : `Excede por: ${formatCopCurrency(Math.abs(recipe.budgetRemaining))}`}
            </Text>
          </View>

          {recipe.reason ? (
            <View style={styles.reasonCardBox}>
              <MaterialIcons name="lightbulb" size={18} color={colors.secondary} />
              <Text style={[styles.reasonCardText, typography.bodySm]}>
                {recipe.reason}
              </Text>
            </View>
          ) : null}
        </Card>

        {/* 6. SECCIÓN 1: YA TIENES EN CASA (Disponibles) */}
        <View style={styles.sectionContainer} testID="recipe-available-ingredients-section">
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIconCircle}>
                <MaterialIcons name="kitchen" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.sectionTitle, typography.headlineMd]}>
                Ya tienes en casa
              </Text>
            </View>
            <View style={styles.countBadge}>
              <Text style={[styles.countBadgeText, typography.labelSm]}>
                {recipe.availableIngredients.length} ingredientes
              </Text>
            </View>
          </View>

          <Text style={[styles.sectionSubtitle, typography.bodySm]}>
            Disponible en tus reservas actuales sin coste adicional. Puedes marcar los que tengas a mano:
          </Text>

          <View style={styles.ingredientsList}>
            {recipe.availableIngredients.map((item, index) => {
              const isChecked = !!checkedIngredients[item.name];
              const isUrgent = summary.urgentIngredients.some(
                (u) => u.name.toLowerCase() === item.name.toLowerCase()
              );

              return (
                <Pressable
                  key={`avail-${item.name}-${index}`}
                  style={[
                    styles.ingredientRow,
                    isChecked && styles.ingredientRowChecked,
                  ]}
                  onPress={() => toggleCheck(item.name)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isChecked }}
                  accessibilityLabel={`${item.name}, cantidad: ${formatIngredientQuantity(item.quantity, item.unit)}`}
                  testID={`available-ingredient-${index}`}
                >
                  <View style={styles.ingredientLeft}>
                    <MaterialIcons
                      name={isChecked ? 'check-circle' : 'radio-button-unchecked'}
                      size={22}
                      color={isChecked ? colors.primary : colors.outline}
                    />
                    <View style={styles.ingredientNameCol}>
                      <Text
                        style={[
                          styles.ingredientName,
                          typography.bodyMd,
                          isChecked && styles.ingredientNameChecked,
                        ]}
                      >
                        {item.name}
                      </Text>
                      {isUrgent && (
                        <Text style={[styles.urgentInlineTag, typography.labelSm]}>
                          Consumir pronto
                        </Text>
                      )}
                    </View>
                  </View>

                  <Text style={[styles.ingredientQuantity, typography.labelMd]}>
                    {formatIngredientQuantity(item.quantity, item.unit)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 7. SECCIÓN 2: NECESITAS COMPRAR (Faltantes) */}
        <View style={styles.sectionContainer} testID="recipe-missing-ingredients-section">
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleRow}>
              <View style={[styles.sectionIconCircle, { backgroundColor: colors.errorContainer }]}>
                <MaterialIcons name="shopping-cart" size={18} color={colors.secondary} />
              </View>
              <Text style={[styles.sectionTitle, typography.headlineMd, { color: colors.secondary }]}>
                Necesitas comprar
              </Text>
            </View>
            <View style={[styles.countBadge, { backgroundColor: colors.errorContainer }]}>
              <Text style={[styles.countBadgeText, typography.labelSm, { color: colors.secondary }]}>
                {recipe.missingIngredients.length} faltante{recipe.missingIngredients.length === 1 ? '' : 's'}
              </Text>
            </View>
          </View>

          {recipe.missingIngredients.length === 0 ? (
            <Card variant="outlined" style={styles.allReadyCard}>
              <MaterialIcons name="done-all" size={24} color={colors.primary} />
              <Text style={[styles.allReadyText, typography.bodyMd]}>
                ¡Tienes todos los ingredientes necesarios en tu despensa! No requieres compras extra.
              </Text>
            </Card>
          ) : (
            <View style={styles.ingredientsList}>
              {recipe.missingIngredients.map((item, index) => (
                <View
                  key={`missing-${item.name}-${index}`}
                  style={[styles.ingredientRow, styles.missingRow]}
                  testID={`missing-ingredient-${index}`}
                >
                  <View style={styles.ingredientLeft}>
                    <MaterialIcons name="add-shopping-cart" size={20} color={colors.secondary} />
                    <View style={styles.ingredientNameCol}>
                      <Text style={[styles.ingredientName, typography.bodyMd]}>
                        {item.name}
                      </Text>
                      <Text style={[styles.ingredientQuantitySub, typography.bodySm]}>
                        {formatIngredientQuantity(item.quantity, item.unit)}
                      </Text>
                    </View>
                  </View>

                  {item.estimatedCost ? (
                    <Text style={[styles.missingCostText, typography.labelMd]}>
                      ~{formatCopCurrency(item.estimatedCost, false)}
                    </Text>
                  ) : (
                    <Text style={[styles.missingCostText, typography.bodySm, { color: colors.outline }]}>
                      Precio pendiente
                    </Text>
                  )}
                </View>
              ))}

              {/* Total Price Bar */}
              <View style={styles.totalMissingBar}>
                <View style={styles.totalMissingLeft}>
                  <MaterialIcons name="receipt-long" size={20} color={colors.secondary} />
                  <Text style={[styles.totalMissingLabel, typography.labelLg]}>
                    Compra estimada
                  </Text>
                </View>
                <Text style={[styles.totalMissingAmount, typography.headlineMd]}>
                  {formatCopCurrency(recipe.estimatedMissingCost)}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* 8. SECCIÓN 3: PREPARACIÓN */}
        <View style={styles.sectionContainer} testID="recipe-steps-section">
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIconCircle}>
                <MaterialIcons name="restaurant-menu" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.sectionTitle, typography.headlineMd]}>
                Preparación
              </Text>
            </View>
            <View style={styles.countBadge}>
              <Text style={[styles.countBadgeText, typography.labelSm]}>
                {recipe.steps.length} pasos
              </Text>
            </View>
          </View>

          <View style={styles.stepsList}>
            {recipe.steps.map((step, index) => (
              <View key={`step-${index}`} style={styles.stepItem} testID={`recipe-step-${index}`}>
                <View style={styles.stepNumberBadge}>
                  <Text style={[styles.stepNumberText, typography.labelMd]}>
                    {index + 1}
                  </Text>
                </View>
                <View style={styles.stepContentCol}>
                  <Text style={[styles.stepText, typography.bodyMd]}>{step}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* 9. Barra inferior fija con CTA principal para Modo Cocina */}
      <View style={styles.fixedBottomBar}>
        <Button
          testID="recipe-start-cooking-button"
          title="Preparar esta receta (Modo Cocina)"
          variant="primary"
          size="lg"
          fullWidth
          onPress={handleStartCooking}
          leftIcon={<MaterialIcons name="restaurant-menu" size={20} color={colors.onPrimary} />}
          accessibilityLabel="Iniciar Modo Cocina guiado paso a paso"
          accessibilityHint="Abre la pantalla de cocina interactiva para preparar la receta"
        />
      </View>
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
      backgroundColor: colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.outlineVariant,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flex: 1,
      minWidth: 0,
    },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceContainer,
    },
    backButtonPressed: {
      opacity: 0.7,
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
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollContent: {
      paddingBottom: 100, // Espacio para la barra fija inferior
    },
    notFoundContainer: {
      flex: 1,
      padding: spacing.margin,
      justifyContent: 'center',
    },
    notFoundCard: {
      padding: spacing.xl,
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.surface,
    },
    notFoundTitle: {
      color: colors.textPrimary,
      fontWeight: '700',
      textAlign: 'center',
    },
    notFoundDesc: {
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.sm,
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
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    demoBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      backgroundColor: colors.primaryContainer,
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
    heroWrapper: {
      paddingHorizontal: spacing.margin,
      marginTop: spacing.md,
    },
    heroImageContainer: {
      position: 'relative',
      width: '100%',
      height: 220,
      borderRadius: radius.xl,
      overflow: 'hidden',
      backgroundColor: colors.surfaceContainer,
    },
    heroImage: {
      width: '100%',
      height: '100%',
    },
    heroFallback: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceContainerLow,
      gap: spacing.xs,
    },
    heroFallbackText: {
      color: colors.outline,
      fontWeight: '600',
    },
    heroGradientOverlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
    },
    conveniencePill: {
      position: 'absolute',
      top: spacing.sm,
      right: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.tertiaryContainer,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: radius.full,
    },
    conveniencePillText: {
      color: colors.onTertiaryContainer,
      fontWeight: '700',
    },
    heroTitleBottom: {
      position: 'absolute',
      bottom: spacing.md,
      left: spacing.md,
      right: spacing.md,
      gap: 4,
    },
    pantryTag: {
      alignSelf: 'flex-start',
      backgroundColor: colors.primary,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radius.sm,
    },
    pantryTagText: {
      color: colors.onPrimary,
      fontWeight: '700',
      fontSize: 10,
      letterSpacing: 0.5,
    },
    heroTitle: {
      color: '#FFFFFF',
      fontWeight: '700',
      textShadowColor: 'rgba(0,0,0,0.6)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    metricsRow: {
      flexDirection: 'row',
      gap: spacing.xs,
      marginHorizontal: spacing.margin,
      marginTop: spacing.md,
      backgroundColor: colors.surface,
      padding: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    metricCardCol: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xs,
      gap: 2,
    },
    metricIconBox: {
      width: 32,
      height: 32,
      borderRadius: radius.full,
      backgroundColor: colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
    },
    metricLabel: {
      color: colors.outline,
      fontSize: 11,
    },
    metricMain: {
      color: colors.textPrimary,
      fontWeight: '600',
    },
    timingBreakdownRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.md,
      marginHorizontal: spacing.margin,
      marginTop: spacing.xs,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    timingItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    timingText: {
      color: colors.textSecondary,
    },
    timingValue: {
      color: colors.textPrimary,
      fontWeight: '700',
    },
    budgetStatusCard: {
      marginHorizontal: spacing.margin,
      marginTop: spacing.sm,
      padding: spacing.md,
      backgroundColor: colors.surface,
      gap: spacing.xs,
    },
    budgetStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    budgetStatusLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    budgetStatusTitle: {
      color: colors.textPrimary,
      fontWeight: '600',
    },
    budgetStatusRemaining: {
      color: colors.primary,
      fontWeight: '700',
    },
    reasonCardBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xs,
      backgroundColor: colors.errorContainer,
      padding: spacing.sm,
      borderRadius: radius.md,
      marginTop: spacing.xs,
    },
    reasonCardText: {
      color: colors.onErrorContainer,
      flex: 1,
      lineHeight: 18,
    },
    sectionContainer: {
      marginHorizontal: spacing.margin,
      marginTop: spacing.lg,
      padding: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      gap: spacing.sm,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    sectionIconCircle: {
      width: 28,
      height: 28,
      borderRadius: radius.full,
      backgroundColor: colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionTitle: {
      color: colors.textPrimary,
      fontWeight: '700',
    },
    countBadge: {
      backgroundColor: colors.primaryContainer,
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: radius.full,
    },
    countBadgeText: {
      color: colors.primary,
      fontWeight: '700',
      fontSize: 11,
    },
    sectionSubtitle: {
      color: colors.textSecondary,
      marginBottom: spacing.xs,
    },
    ingredientsList: {
      gap: spacing.xs,
    },
    ingredientRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: spacing.sm,
      backgroundColor: colors.canvas,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    ingredientRowChecked: {
      backgroundColor: colors.surfaceContainerLow,
      opacity: 0.85,
    },
    missingRow: {
      backgroundColor: colors.errorContainer,
      borderColor: colors.error,
    },
    ingredientLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flex: 1,
      minWidth: 0,
    },
    ingredientNameCol: {
      flex: 1,
      minWidth: 0,
    },
    ingredientName: {
      color: colors.textPrimary,
      fontWeight: '500',
    },
    ingredientNameChecked: {
      textDecorationLine: 'line-through',
      color: colors.outline,
    },
    urgentInlineTag: {
      color: colors.secondary,
      fontWeight: '700',
      fontSize: 11,
      marginTop: 2,
    },
    ingredientQuantity: {
      color: colors.textSecondary,
      marginLeft: spacing.sm,
    },
    ingredientQuantitySub: {
      color: colors.textSecondary,
      fontSize: 12,
    },
    missingCostText: {
      color: colors.secondary,
      fontWeight: '700',
      marginLeft: spacing.sm,
    },
    totalMissingBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: spacing.md,
      backgroundColor: colors.errorContainer,
      borderRadius: radius.md,
      marginTop: spacing.xs,
    },
    totalMissingLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    totalMissingLabel: {
      color: colors.onErrorContainer,
      fontWeight: '700',
    },
    totalMissingAmount: {
      color: colors.onErrorContainer,
      fontWeight: '700',
    },
    allReadyCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      backgroundColor: colors.surfaceContainerLow,
      borderColor: colors.outlineVariant,
    },
    allReadyText: {
      color: colors.primary,
      flex: 1,
    },
    stepsList: {
      gap: spacing.md,
      marginTop: spacing.xs,
    },
    stepItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    stepNumberBadge: {
      width: 28,
      height: 28,
      borderRadius: radius.full,
      backgroundColor: colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    stepNumberText: {
      color: colors.primary,
      fontWeight: '700',
    },
    stepContentCol: {
      flex: 1,
    },
    stepText: {
      color: colors.textPrimary,
      lineHeight: 22,
    },
    fixedBottomBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: spacing.margin,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      backgroundColor: colors.surface,
      borderTopWidth: 1,
      borderTopColor: colors.outlineVariant,
    },
  });
