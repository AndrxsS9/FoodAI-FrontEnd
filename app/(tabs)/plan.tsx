/**
 * FoodAI - Pantalla de Planificación de Comidas de 3 Días (Fase 3C).
 * Inspirada en el lenguaje de diseño Google Stitch y el sistema de diseño FoodAI.
 *
 * Integra:
 * - Resumen del estado actual de despensa y presupuesto.
 * - Generación explícita de menú de 3 días con IA (Gemini vía backend).
 * - Desglose de recetas recomendadas para Día 1, Día 2 y Día 3.
 * - Análisis de compatibilidad presupuestaria en COP (dentro o fuera de presupuesto).
 * - Lista agregada de ingredientes por comprar sin invención de precios unitarios.
 * - Detección reactiva de obsolescencia ante cambios en inventario o presupuesto.
 * - Navegación segura hacia el detalle de cada receta planificada y modo cocina.
 */

import React, { useRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Button, Card, Header } from '../../src/components/common';
import { useBudget } from '../../src/context/BudgetContext';
import { usePantry } from '../../src/context/PantryContext';
import { useMealPlan } from '../../src/context/MealPlanContext';
import {
  formatCopCurrency,
  formatIngredientQuantity,
} from '../../src/types/recipe';
import { colors, radius, spacing, useTypography } from '../../src/theme';

export interface PlanScreenProps {
  /** Callback opcional para pruebas y observabilidad de concurrencia/ciclo de vida de peticiones */
  onRequestTracked?: (info: {
    requestId: number;
    activeRequestId: number | null;
    sequenceId: number;
    phase: 'start' | 'cancel' | 'settled';
  }) => void;
}

export default function PlanScreen({ onRequestTracked }: PlanScreenProps = {}) {
  const typography = useTypography();
  const router = useRouter();

  const { budget, servings, maxMinutes } = useBudget();
  const { ingredients } = usePantry();
  const {
    plan,
    isGenerating,
    isStale,
    error,
    generateMealPlan,
    cancelGeneration,
    clearError,
    toggleDayCompleted,
    completedDaysCount,
  } = useMealPlan();

  // Secuencia monótona estricta e identificador de la petición activa (nunca se resetea la secuencia)
  const requestSequenceRef = useRef<number>(0);
  const activeRequestIdRef = useRef<number | null>(null);

  const hasPantryItems = ingredients.length > 0;
  // Un único estado autoritativo de carga: isGenerating del contexto
  const isLoading = isGenerating;

  const handleGeneratePlan = () => {
    // Si no hay alimentos, ya está cargando o ya existe una petición activa en curso, ignorar síncronamente
    if (!hasPantryItems || isLoading || activeRequestIdRef.current !== null) return;

    const requestId = ++requestSequenceRef.current;
    activeRequestIdRef.current = requestId;

    onRequestTracked?.({
      requestId,
      activeRequestId: activeRequestIdRef.current,
      sequenceId: requestSequenceRef.current,
      phase: 'start',
    });

    void (async () => {
      try {
        await generateMealPlan();
      } catch {
        // El error ya es capturado y expuesto reactivamente por MealPlanContext
      } finally {
        // Solo liberamos si este requestId sigue siendo el activo
        if (activeRequestIdRef.current === requestId) {
          activeRequestIdRef.current = null;
          onRequestTracked?.({
            requestId,
            activeRequestId: null,
            sequenceId: requestSequenceRef.current,
            phase: 'settled',
          });
        }
      }
    })();
  };

  const handleCancelGeneration = () => {
    // Limpiamos la referencia activa pero NUNCA reseteamos la secuencia monótona
    const previousActive = activeRequestIdRef.current;
    activeRequestIdRef.current = null;

    if (previousActive !== null) {
      onRequestTracked?.({
        requestId: previousActive,
        activeRequestId: null,
        sequenceId: requestSequenceRef.current,
        phase: 'cancel',
      });
    }

    cancelGeneration();
  };

  const handleNavigateToRecipe = (recipeId: string) => {
    router.push({
      pathname: `/recetas/${recipeId}` as any,
      params: { fromPlan: 'true' },
    });
  };

  const handleGoToPantry = () => {
    router.push('/(tabs)/despensa');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* 1. Header institucional */}
      <Header
        title="Mi plan de comidas"
        subtitle="Organiza tres días según tu despensa y presupuesto"
        rightElement={
          <Pressable
            testID="plan-profile-avatar"
            accessibilityRole="button"
            accessibilityLabel="Perfil de usuario"
            onPress={() => router.push('/(tabs)/perfil')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.avatarButton}
          >
            <MaterialIcons name="person" size={20} color={colors.onPrimary} />
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        testID="plan-scroll-view"
      >
        {/* 2. Franja de resumen de parámetros activos (Stitch design) */}
        <View style={styles.summaryStrip} testID="plan-summary-strip">
          <View style={styles.summaryItem}>
            <MaterialIcons name="savings" size={18} color={colors.primary} />
            <View>
              <Text style={[styles.summaryLabel, typography.labelSm]}>Presupuesto</Text>
              <Text style={[styles.summaryValue, typography.labelMd]}>
                {formatCopCurrency(budget)}
              </Text>
            </View>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryItem}>
            <MaterialIcons name="group" size={18} color={colors.primary} />
            <View>
              <Text style={[styles.summaryLabel, typography.labelSm]}>Porciones</Text>
              <Text style={[styles.summaryValue, typography.labelMd]}>
                {servings} {servings === 1 ? 'persona' : 'personas'}
              </Text>
            </View>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryItem}>
            <MaterialIcons name="timer" size={18} color={colors.primary} />
            <View>
              <Text style={[styles.summaryLabel, typography.labelSm]}>Tiempo máx.</Text>
              <Text style={[styles.summaryValue, typography.labelMd]}>
                {maxMinutes ? `${maxMinutes} min` : 'Sin límite'}
              </Text>
            </View>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryItem}>
            <MaterialIcons name="kitchen" size={18} color={colors.primary} />
            <View>
              <Text style={[styles.summaryLabel, typography.labelSm]}>Despensa</Text>
              <Text style={[styles.summaryValue, typography.labelMd]}>
                {ingredients.length} {ingredients.length === 1 ? 'ítem' : 'ítems'}
              </Text>
            </View>
          </View>
        </View>

        {/* 3. Banner de alerta de plan obsoleto (isStale) */}
        {Boolean(plan && isStale) && (
          <View style={styles.staleBanner} testID="plan-stale-banner">
            <MaterialIcons name="info" size={20} color="#73200E" />
            <View style={styles.staleTextWrapper}>
              <Text style={[styles.staleTitle, typography.labelMd]}>
                Cambios en tu despensa o presupuesto
              </Text>
              <Text style={[styles.staleDescription, typography.bodySm]}>
                Tu plan podría estar desactualizado. Genera uno nuevo para usar tus datos actuales.
              </Text>
            </View>
          </View>
        )}

        {/* 4. Banner de error en caso de fallo */}
        {Boolean(error) && (
          <Card variant="outlined" style={styles.errorCard} testID="plan-error-banner">
            <View style={styles.errorHeaderRow}>
              <MaterialIcons name="error-outline" size={24} color={colors.secondary} />
              <Text style={[styles.errorTitle, typography.headlineMd]}>
                No pudimos generar el plan
              </Text>
            </View>
            <Text style={[styles.errorDescription, typography.bodySm]}>
              {error}
            </Text>
            <View style={styles.errorActionsRow}>
              <Button
                title="Descartar"
                variant="ghost"
                size="sm"
                onPress={clearError}
              />
              <Button
                title="Intentar nuevamente"
                variant="secondary"
                size="sm"
                onPress={handleGeneratePlan}
                disabled={!hasPantryItems || isLoading}
              />
            </View>
          </Card>
        )}

        {/* 5. Estado de carga durante generación con IA */}
        {isLoading && (
          <Card variant="elevated" style={styles.loadingCard} testID="plan-loading-state">
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingTitle, typography.headlineMd]}>
              Preparando tu plan con inteligencia artificial...
            </Text>
            <Text style={[styles.loadingSubtitle, typography.bodySm]}>
              Analizando combinaciones óptimas de 3 días según tu despensa y presupuesto.
            </Text>
            <Button
              testID="cancel-generation-button"
              title="Cancelar"
              variant="outline"
              size="sm"
              onPress={handleCancelGeneration}
              leftIcon={<MaterialIcons name="close" size={16} color={colors.primary} />}
            />
          </Card>
        )}

        {/* 6. Estado de despensa vacía */}
        {!hasPantryItems && !plan && !isLoading && (
          <Card variant="outlined" style={styles.emptyCard} testID="plan-empty-pantry-card">
            <View style={styles.emptyIconCircle}>
              <MaterialIcons name="kitchen" size={40} color={colors.outline} />
            </View>
            <Text style={[styles.emptyTitle, typography.headlineMd]}>
              Tu despensa está vacía
            </Text>
            <Text style={[styles.emptyDescription, typography.bodyMd]}>
              Agrega alimentos a tu despensa antes de generar tu plan.
            </Text>
            <Button
              testID="plan-go-to-pantry-button"
              title="Ir a Mi Despensa"
              variant="primary"
              size="md"
              onPress={handleGoToPantry}
              leftIcon={<MaterialIcons name="add" size={18} color={colors.onPrimary} />}
            />
          </Card>
        )}

        {/* 7. Estado inicial cuando hay despensa pero no se ha generado plan */}
        {hasPantryItems && !plan && !isLoading && (
          <Card variant="elevated" style={styles.introCard} testID="plan-intro-card">
            <View style={styles.introIconCircle}>
              <MaterialIcons name="auto-awesome" size={32} color={colors.primary} />
            </View>
            <Text style={[styles.introTitle, typography.headlineMd]}>
              Planifica tus comidas de los próximos 3 días
            </Text>
            <Text style={[styles.introDescription, typography.bodyMd]}>
              FoodAI seleccionará una receta por día aprovechando al máximo tus reservas actuales
              y manteniendo el gasto adicional dentro de tu presupuesto.
            </Text>
            <Button
              testID="generate-meal-plan-button"
              title="Generar mi plan de 3 días"
              variant="primary"
              size="lg"
              fullWidth
              onPress={handleGeneratePlan}
              leftIcon={<MaterialIcons name="restaurant-menu" size={20} color={colors.onPrimary} />}
            />
          </Card>
        )}

        {/* 8. Plan generado con éxito */}
        {Boolean(plan && !isLoading) && plan && (
          <View style={styles.planResultsContainer} testID="plan-results-section">
            {/* Botón de regeneración superior */}
            <View style={styles.regenerateRow}>
              <View>
                <Text style={[styles.resultsHeaderTitle, typography.headlineMd]}>
                  Menú de 3 Días
                </Text>
                <Text style={[styles.resultsHeaderSubtitle, typography.bodySm]}>
                  Una receta diaria optimizada para tu despensa
                </Text>
              </View>
              <Button
                testID="generate-meal-plan-button"
                title={isStale ? 'Actualizar plan' : 'Regenerar'}
                variant={isStale ? 'primary' : 'outline'}
                size="sm"
                onPress={handleGeneratePlan}
                disabled={!hasPantryItems || isLoading}
                leftIcon={<MaterialIcons name="refresh" size={16} color={isStale ? colors.onPrimary : colors.primary} />}
              />
            </View>

            {/* Progreso del plan de 3 días (Fase 6A) */}
            <Card variant="elevated" style={styles.progressCard} testID="plan-progress-card">
              <View style={styles.progressHeaderRow}>
                <View style={styles.progressHeaderLeft}>
                  <MaterialIcons name="task-alt" size={20} color={colors.primary} />
                  <Text style={[styles.progressCardTitle, typography.headlineMd]}>
                    Progreso del plan
                  </Text>
                </View>
                <Text style={[styles.progressCountText, typography.labelMd]} testID="plan-progress-text">
                  {completedDaysCount}/3 días completados
                </Text>
              </View>

              <View
                style={styles.progressBarTrack}
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: 3, now: completedDaysCount }}
                testID="plan-progress-bar"
              >
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${Math.round((completedDaysCount / 3) * 100)}%` },
                  ]}
                  testID="plan-progress-bar-fill"
                />
              </View>
            </Card>

            {/* Tarjetas de los 3 días */}
            {plan.days.map((dayItem) => {
              const recipe = dayItem.recipe;
              const hasMissing = recipe.missingIngredients.length > 0;

              return (
                <Card
                  key={`day-${dayItem.day}-${recipe.id}`}
                  variant="elevated"
                  style={styles.dayCard}
                  testID={`plan-day-card-${dayItem.day}`}
                >
                  {/* Encabezado del día */}
                  <View style={styles.dayHeaderRow}>
                    <View style={styles.dayBadge}>
                      <Text style={[styles.dayBadgeText, typography.labelSm]}>
                        Día {dayItem.day}
                      </Text>
                    </View>

                    <View style={styles.convenienceBadge}>
                      <MaterialIcons name="stars" size={14} color="#503B00" />
                      <Text style={[styles.convenienceBadgeText, typography.labelSm]}>
                        {recipe.convenience}
                      </Text>
                    </View>
                  </View>

                  {/* Título y descripción */}
                  <Text style={[styles.recipeName, typography.headlineMd]} numberOfLines={2}>
                    {recipe.name}
                  </Text>
                  <Text style={[styles.recipeDescription, typography.bodySm]} numberOfLines={3}>
                    {recipe.description}
                  </Text>

                  {/* Métricas rápidas de la receta */}
                  <View style={styles.dayMetricsRow}>
                    <View style={styles.dayMetricItem}>
                      <MaterialIcons name="timer" size={16} color={colors.primary} />
                      <Text style={[styles.dayMetricText, typography.labelSm]}>
                        {recipe.totalMinutes} min
                      </Text>
                    </View>

                    <View style={styles.dayMetricItem}>
                      <MaterialIcons name="check-circle" size={16} color={colors.primary} />
                      <Text style={[styles.dayMetricText, typography.labelSm]}>
                        {recipe.availableIngredients.length} en casa
                      </Text>
                    </View>

                    {hasMissing ? (
                      <View style={styles.dayMetricItem}>
                        <MaterialIcons name="add-shopping-cart" size={16} color={colors.secondary} />
                        <Text style={[styles.dayMetricText, typography.labelSm, { color: colors.secondary }]}>
                          {recipe.missingIngredients.length} por comprar
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.dayMetricItem}>
                        <MaterialIcons name="done-all" size={16} color={colors.primary} />
                        <Text style={[styles.dayMetricText, typography.labelSm, { color: colors.primary }]}>
                          Completa
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Costo adicional si aplica */}
                  {recipe.estimatedMissingCost > 0 && (
                    <View style={styles.recipeCostRow}>
                      <Text style={[styles.recipeCostLabel, typography.bodySm]}>
                        Costo estimado para este día:
                      </Text>
                      <Text style={[styles.recipeCostValue, typography.labelMd]}>
                        ~{formatCopCurrency(recipe.estimatedMissingCost)}
                      </Text>
                    </View>
                  )}
                  {/* Estado de completado del día (Fase 6A) */}
                  {dayItem.isCompleted && (
                    <View style={styles.completedBadge} testID={`plan-day-completed-badge-${dayItem.day}`}>
                      <MaterialIcons name="check-circle" size={16} color={colors.primary} />
                      <Text style={[styles.completedBadgeText, typography.labelSm]}>
                        ¡Día completado!
                      </Text>
                    </View>
                  )}

                  <Button
                    testID={`plan-day-complete-button-${dayItem.day}`}
                    title={dayItem.isCompleted ? 'Marcar como pendiente' : 'Marcar día como completado'}
                    variant={dayItem.isCompleted ? 'ghost' : 'secondary'}
                    size="md"
                    fullWidth
                    onPress={() => toggleDayCompleted(dayItem.day)}
                    leftIcon={
                      <MaterialIcons
                        name={dayItem.isCompleted ? 'undo' : 'check'}
                        size={18}
                        color={dayItem.isCompleted ? colors.textPrimary : colors.onPrimary}
                      />
                    }
                  />

                  <Button
                    testID={`plan-view-recipe-button-${dayItem.day}`}
                    title="Ver receta y preparación"
                    variant="outline"
                    size="md"
                    fullWidth
                    onPress={() => handleNavigateToRecipe(recipe.id)}
                    leftIcon={<MaterialIcons name="menu-book" size={18} color={colors.primary} />}
                  />
                </Card>
              );
            })}

            {/* 9. Resumen presupuestario del plan */}
            <Card variant="elevated" style={styles.budgetCard} testID="plan-budget-summary">
              <View style={styles.budgetCardHeader}>
                <MaterialIcons name="account-balance-wallet" size={22} color={colors.primary} />
                <Text style={[styles.budgetCardTitle, typography.headlineMd]}>
                  Balance del plan
                </Text>
              </View>

              <View style={styles.budgetTableRow}>
                <Text style={[styles.budgetTableLabel, typography.bodyMd]}>
                  Presupuesto disponible
                </Text>
                <Text style={[styles.budgetTableValue, typography.labelLg]}>
                  {formatCopCurrency(budget)}
                </Text>
              </View>

              <View style={styles.budgetTableRow}>
                <Text style={[styles.budgetTableLabel, typography.bodyMd]}>
                  Costo adicional estimado del plan
                </Text>
                <Text
                  style={[
                    styles.budgetTableValue,
                    typography.labelLg,
                    { color: colors.secondary },
                  ]}
                >
                  {formatCopCurrency(plan.totalEstimatedMissingCost)}
                </Text>
              </View>

              <View style={styles.budgetDivider} />

              <View style={styles.budgetTableRow}>
                <Text style={[styles.budgetTotalLabel, typography.headlineMd]}>
                  Presupuesto restante
                </Text>
                <Text
                  style={[
                    styles.budgetTotalValue,
                    typography.headlineMd,
                    {
                      color: plan.withinBudget ? colors.primary : colors.secondary,
                    },
                  ]}
                >
                  {formatCopCurrency(plan.budgetRemaining)}
                </Text>
              </View>

              {/* Indicador de compatibilidad presupuestaria */}
              <View
                style={[
                  styles.withinBudgetBadge,
                  plan.withinBudget ? styles.withinBudgetSuccess : styles.withinBudgetWarning,
                ]}
              >
                <MaterialIcons
                  name={plan.withinBudget ? 'check-circle' : 'warning'}
                  size={18}
                  color={plan.withinBudget ? colors.primary : colors.secondary}
                />
                <Text
                  style={[
                    styles.withinBudgetText,
                    typography.labelMd,
                    { color: plan.withinBudget ? colors.primary : colors.secondary },
                  ]}
                >
                  {plan.withinBudget
                    ? '¡El plan se ajusta a tu presupuesto!'
                    : 'El plan supera tu presupuesto fijado'}
                </Text>
              </View>

              {/* Nota honesta de limitación MVP */}
              <Text style={[styles.disclaimerText, typography.bodySm]}>
                * Los costos son aproximaciones orientativas basadas en precios de referencia en Colombia.
                No constituyen una factura ni cotización garantizada de supermercado.
              </Text>
            </Card>

            {/* 10. Sección de compras estimadas (Ingredientes por comprar) */}
            <View style={styles.shoppingSection} testID="plan-missing-ingredients-section">
              <View style={styles.shoppingHeaderRow}>
                <View style={styles.shoppingTitleRow}>
                  <View style={styles.shoppingIconBox}>
                    <MaterialIcons name="shopping-cart" size={18} color={colors.secondary} />
                  </View>
                  <Text style={[styles.shoppingTitle, typography.headlineMd]}>
                    Ingredientes por comprar
                  </Text>
                </View>
                <View style={styles.shoppingCountBadge}>
                  <Text style={[styles.shoppingCountText, typography.labelSm]}>
                    {plan.uniqueMissingIngredients.length} ítems
                  </Text>
                </View>
              </View>

              {plan.uniqueMissingIngredients.length === 0 ? (
                <Card variant="outlined" style={styles.allReadyCard}>
                  <MaterialIcons name="done-all" size={24} color={colors.primary} />
                  <Text style={[styles.allReadyText, typography.bodyMd]}>
                    ¡Tienes todos los ingredientes necesarios en tu despensa! No necesitas compras extra.
                  </Text>
                </Card>
              ) : (
                <View style={styles.missingListContainer}>
                  {plan.uniqueMissingIngredients.map((item, idx) => (
                    <View
                      key={`missing-${item.name}-${idx}`}
                      style={styles.missingItemRow}
                      testID={`plan-missing-item-${idx}`}
                    >
                      <View style={styles.missingItemLeft}>
                        <MaterialIcons
                          name="radio-button-unchecked"
                          size={18}
                          color={colors.secondary}
                        />
                        <View style={styles.missingItemTextCol}>
                          <Text style={[styles.missingItemName, typography.bodyMd]}>
                            {item.name}
                          </Text>
                          <Text style={[styles.missingItemQuantity, typography.bodySm]}>
                            {formatIngredientQuantity(item.quantity, item.unit)}
                          </Text>
                        </View>
                      </View>

                      {item.estimatedCost ? (
                        <Text style={[styles.missingItemCost, typography.labelMd]}>
                          ~{formatCopCurrency(item.estimatedCost, false)}
                        </Text>
                      ) : null}
                    </View>
                  ))}

                  <Text style={[styles.shoppingDisclaimerText, typography.bodySm]}>
                    Nota: Los faltantes han sido deduplicados por alimento para el menú de 3 días.
                    Las cantidades no corresponden a una suma de paquetes comerciales cerrados.
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}
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
    paddingBottom: spacing.xxl + 20,
    gap: spacing.md,
  },
  avatarButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#E8E2D8',
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  summaryLabel: {
    color: colors.outline,
    fontSize: 10,
  },
  summaryValue: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 12,
  },
  summaryDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E8E2D8',
    marginHorizontal: 4,
  },
  staleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FFDAD3',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#FFB4A8',
  },
  staleTextWrapper: {
    flex: 1,
  },
  staleTitle: {
    color: '#73200E',
    fontWeight: '700',
  },
  staleDescription: {
    color: '#73200E',
    marginTop: 2,
    lineHeight: 18,
  },
  errorCard: {
    backgroundColor: '#FFF8F6',
    borderColor: '#FFDAD3',
    padding: spacing.md,
    gap: spacing.sm,
  },
  errorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  errorTitle: {
    color: colors.secondary,
    fontWeight: '700',
  },
  errorDescription: {
    color: colors.textPrimary,
    lineHeight: 18,
  },
  errorActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  loadingCard: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
  },
  loadingTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
    textAlign: 'center',
  },
  loadingSubtitle: {
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  emptyCard: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyDescription: {
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
  },
  introCard: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
  },
  introIconCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: '#E8DDFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  introTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
    textAlign: 'center',
  },
  introDescription: {
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xs,
  },
  planResultsContainer: {
    gap: spacing.md,
  },
  regenerateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  resultsHeaderTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  resultsHeaderSubtitle: {
    color: colors.textSecondary,
  },
  progressCard: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: '#E8E2D8',
    borderRadius: radius.lg,
  },
  progressHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  progressCardTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  progressCountText: {
    color: colors.primary,
    fontWeight: '700',
  },
  progressBarTrack: {
    width: '100%',
    height: 8,
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.full,
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EAF6ED',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    marginBottom: 4,
  },
  completedBadgeText: {
    color: colors.primary,
    fontWeight: '600',
  },
  dayCard: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  dayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  dayBadgeText: {
    color: colors.onPrimary,
    fontWeight: '700',
    fontSize: 11,
  },
  convenienceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFDF9B',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  convenienceBadgeText: {
    color: '#503B00',
    fontWeight: '700',
    fontSize: 11,
  },
  recipeName: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  recipeDescription: {
    color: colors.textSecondary,
    lineHeight: 18,
  },
  dayMetricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    backgroundColor: colors.canvas,
    padding: spacing.xs,
    borderRadius: radius.sm,
  },
  dayMetricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dayMetricText: {
    color: colors.textPrimary,
    fontSize: 11,
  },
  recipeCostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  recipeCostLabel: {
    color: colors.textSecondary,
  },
  recipeCostValue: {
    color: colors.secondary,
    fontWeight: '700',
  },
  budgetCard: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  budgetCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  budgetCardTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  budgetTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  budgetTableLabel: {
    color: colors.textSecondary,
  },
  budgetTableValue: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  budgetDivider: {
    height: 1,
    backgroundColor: '#E8E2D8',
    marginVertical: spacing.xs,
  },
  budgetTotalLabel: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  budgetTotalValue: {
    fontWeight: '700',
  },
  withinBudgetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: spacing.sm,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  withinBudgetSuccess: {
    backgroundColor: '#E8F5E9',
  },
  withinBudgetWarning: {
    backgroundColor: '#FFDAD3',
  },
  withinBudgetText: {
    fontWeight: '700',
  },
  disclaimerText: {
    color: colors.outline,
    fontSize: 11,
    lineHeight: 15,
    marginTop: spacing.xs,
  },
  shoppingSection: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: '#E8E2D8',
    gap: spacing.sm,
  },
  shoppingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shoppingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  shoppingIconBox: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: '#FFDAD3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shoppingTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  shoppingCountBadge: {
    backgroundColor: '#FFDAD3',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  shoppingCountText: {
    color: colors.secondary,
    fontWeight: '700',
    fontSize: 11,
  },
  allReadyCard: {
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#E8F5E9',
    borderColor: '#C8E6C9',
  },
  allReadyText: {
    color: colors.primary,
    flex: 1,
  },
  missingListContainer: {
    gap: spacing.xs,
  },
  missingItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.sm,
    backgroundColor: colors.canvas,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E8E2D8',
  },
  missingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  missingItemTextCol: {
    flex: 1,
  },
  missingItemName: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  missingItemQuantity: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  missingItemCost: {
    color: colors.secondary,
    fontWeight: '700',
  },
  shoppingDisclaimerText: {
    color: colors.outline,
    fontSize: 11,
    lineHeight: 15,
    marginTop: spacing.xs,
  },
});
