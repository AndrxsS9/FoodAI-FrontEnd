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
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Button, Card, Header } from '../../src/components/common';
import { useBudget } from '../../src/context/BudgetContext';
import { usePantry } from '../../src/context/PantryContext';
import { useMealPlan } from '../../src/context/MealPlanContext';
import {
  formatCopCurrency,
  formatIngredientQuantity,
} from '../../src/types/recipe';
import { AppColors, getAppSurfaces, radius, spacing, useAppTheme, useThemeStyles, useTypography } from '../../src/theme';

/** Cualquier emoji ya presente en el título: se respeta y no se añade otro. */
const EXISTING_EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const NEUTRAL_RECIPE_EMOJI = '🍽️';
const RECIPE_EMOJI_RULES: readonly { emoji: string; pattern: RegExp }[] = [
  {
    emoji: '🍲',
    pattern: /\b(sopas?|caldos?|sancochos?|ajiacos?|guisos?|estofados?|cocido|potajes?|consome|mondongo|cazuelas?)\b|^crema de\b/,
  },
  { emoji: '🥗', pattern: /\bensaladas?\b/ },
  {
    emoji: '🍝',
    pattern: /\b(pastas?|espaguetis?|spaghetti|fideos?|macarrones|lasanas?|tallarines|penne|fettuccine|raviolis?|noquis)\b/,
  },
  { emoji: '🍚', pattern: /\b(arroz|risotto|paella)\b/ },
  { emoji: '🥚', pattern: /\b(huevos?|omelette?)\b/ },
  { emoji: '🍗', pattern: /\b(pollo|gallina)\b/ },
];

/**
 * Emoji decorativo para el título visible de una preparación. Solo presentación: no altera el nombre,
 * los identificadores ni los datos guardados. Gana el plato o ingrediente mencionado primero
 * («Sopa de pollo» 🍲, «Pollo con arroz» 🍗) y, ante la duda, se usa el emoji neutro.
 * Devuelve null si el título ya trae un emoji.
 */
export function getRecipeTitleEmoji(recipeName: string): string | null {
  if (typeof recipeName !== 'string' || EXISTING_EMOJI.test(recipeName)) return null;
  const normalized = recipeName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    // Lo que el plato no lleva, y los falsos amigos, no deben clasificarlo
    .replace(/\bsin\s+\w+/g, ' ')
    .replace(/\barroz con leche\b/g, ' ')
    .replace(/\bpasta de (ajo|tomate|mani|maiz|achiote)\b/g, ' ');

  let bestEmoji = NEUTRAL_RECIPE_EMOJI;
  let bestIndex = Number.POSITIVE_INFINITY;
  for (const { emoji, pattern } of RECIPE_EMOJI_RULES) {
    const match = pattern.exec(normalized);
    if (match && match.index < bestIndex) {
      bestIndex = match.index;
      bestEmoji = emoji;
    }
  }
  return bestEmoji;
}

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
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const { width: windowWidth, height: windowHeight, fontScale } = useWindowDimensions();
  // Si el ancho o la fuente no dan para ícono y texto en fila, el ícono pasa arriba y el valor no se parte
  const stackSummaryTiles = windowWidth < 360 || fontScale > 1.3;
  // Los indicadores quedan fijos sobre el scroll para que el encabezado nunca los cubra; en pantallas
  // bajas o con fuente grande vuelven al scroll para no dejar sin espacio al contenido
  const pinSummary = !stackSummaryTiles && windowHeight >= 640;
  // A 360 dp se compacta el mosaico para que un monto como «$100.000 COP» quepa en una línea
  const compactSummaryTiles = !stackSummaryTiles && windowWidth < 380;

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

  const summaryGrid = (
    <View style={styles.summaryGrid} testID="plan-summary-strip">
      {[
        {
          key: 'budget',
          icon: 'piggy-bank' as const,
          label: 'Presupuesto',
          value: formatCopCurrency(budget),
        },
        {
          key: 'servings',
          icon: 'account-group' as const,
          label: 'Porciones',
          value: `${servings} ${servings === 1 ? 'persona' : 'personas'}`,
        },
        {
          key: 'time',
          icon: 'timer' as const,
          label: 'Tiempo máx.',
          value: maxMinutes ? `${maxMinutes} min` : 'Sin límite',
        },
        {
          key: 'pantry',
          icon: 'fridge' as const,
          label: 'Despensa',
          value: `${ingredients.length} ${ingredients.length === 1 ? 'ítem' : 'ítems'}`,
        },
      ].map((tile) => (
        <View
          key={tile.key}
          style={[
            styles.summaryTile,
            stackSummaryTiles && styles.summaryTileStacked,
            compactSummaryTiles && styles.summaryTileCompact,
          ]}
          testID={`plan-summary-${tile.key}`}
        >
          <View style={[styles.summaryIconBox, compactSummaryTiles && styles.summaryIconBoxCompact]}>
            <MaterialCommunityIcons name={tile.icon} size={compactSummaryTiles ? 18 : 20} color={colors.primary} />
          </View>
          {!stackSummaryTiles && <View style={styles.summaryDivider} />}
          {/* Sin numberOfLines: el valor (p. ej. «$250.000 COP») envuelve en lugar de truncarse */}
          <View style={styles.summaryTextCol}>
            <Text style={[styles.summaryLabel, typography.bodySm]}>{tile.label}</Text>
            <Text
              style={[
                styles.summaryValue,
                typography.labelLg,
                compactSummaryTiles && styles.summaryValueCompact,
              ]}
              testID={`plan-summary-value-${tile.key}`}
            >
              {tile.value}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* 1. Header institucional */}
      <Header
        showLogo
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
            <MaterialCommunityIcons name="account-outline" size={20} color={colors.onPrimary} />
          </Pressable>
        }
      />

      {pinSummary && <View style={styles.summaryPinned}>{summaryGrid}</View>}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        testID="plan-scroll-view"
      >
        {/* 2. Resumen en cuadrícula 2×2 cuando no cabe fijo sobre el scroll */}
        {!pinSummary && summaryGrid}

        {/* 3. Banner de alerta de plan obsoleto (isStale) */}
        {Boolean(plan && isStale) && (
          <View style={styles.staleBanner} testID="plan-stale-banner">
            <MaterialCommunityIcons name="information-outline" size={20} color={colors.onErrorContainer} />
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
              <MaterialCommunityIcons name="alert-circle-outline" size={24} color={colors.secondary} />
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
              leftIcon={<MaterialCommunityIcons name="close" size={16} color={colors.primary} />}
            />
          </Card>
        )}

        {/* 6. Estado de despensa vacía */}
        {!hasPantryItems && !plan && !isLoading && (
          <Card variant="outlined" style={styles.emptyCard} testID="plan-empty-pantry-card">
            <View style={styles.emptyIconCircle}>
              <MaterialCommunityIcons name="fridge-outline" size={40} color={colors.primary} />
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
              style={styles.ctaButton}
              textStyle={styles.ctaText}
              onPress={handleGoToPantry}
              leftIcon={<MaterialCommunityIcons name="plus" size={18} color={colors.onPrimary} />}
            />
          </Card>
        )}

        {/* 7. Estado inicial cuando hay despensa pero no se ha generado plan */}
        {hasPantryItems && !plan && !isLoading && (
          <Card variant="elevated" style={styles.introCard} testID="plan-intro-card">
            {/* Composición con íconos vectoriales: no añade imágenes ni assets */}
            <View
              style={styles.introIllustration}
              testID="plan-intro-illustration"
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
              <View style={styles.introHalo} />
              <MaterialCommunityIcons name="calendar-check" size={88} color={colors.primary} />
              <View style={styles.introBowl}>
                <MaterialCommunityIcons name="bowl-mix" size={30} color={colors.onPrimary} />
              </View>
              <View style={[styles.introSpark, styles.introSparkTop]} />
              <View style={[styles.introSpark, styles.introSparkMiddle]} />
              <View style={[styles.introSpark, styles.introSparkBottom]} />
            </View>
            <Text style={[styles.introTitle, typography.headlineLg]}>
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
              style={styles.ctaButton}
              textStyle={styles.ctaText}
              onPress={handleGeneratePlan}
              leftIcon={<MaterialCommunityIcons name="silverware-fork-knife" size={20} color={colors.onPrimary} />}
              rightIcon={
                stackSummaryTiles ? undefined : (
                  <MaterialCommunityIcons name="arrow-right" size={20} color={colors.onPrimary} />
                )
              }
            />
          </Card>
        )}

        {/* 8. Plan generado con éxito */}
        {Boolean(plan && !isLoading) && plan && (
          <View style={styles.planResultsContainer} testID="plan-results-section">
            {/* Botón de regeneración superior */}
            <View style={styles.regenerateRow}>
              <View style={styles.resultsHeaderTextCol}>
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
                style={isStale && hasPantryItems ? styles.ctaButton : styles.outlineAction}
                onPress={handleGeneratePlan}
                disabled={!hasPantryItems || isLoading}
                leftIcon={<MaterialCommunityIcons name="refresh" size={16} color={isStale ? colors.onPrimary : colors.primary} />}
              />
            </View>

            {/* Progreso del plan de 3 días (Fase 6A) */}
            <Card variant="elevated" style={styles.progressCard} testID="plan-progress-card">
              <View style={styles.progressHeaderRow}>
                <View style={styles.progressHeaderLeft}>
                  <MaterialCommunityIcons name="progress-check" size={20} color={colors.primary} />
                  <Text style={[typography.headlineMd, styles.progressCardTitle]}>
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
              const titleEmoji = getRecipeTitleEmoji(recipe.name);

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
                      <MaterialCommunityIcons name="star-circle-outline" size={14} color={colors.onTertiaryContainer} />
                      <Text style={[styles.convenienceBadgeText, typography.labelSm]}>
                        {recipe.convenience}
                      </Text>
                    </View>
                  </View>

                  {/* Título y descripción */}
                  <View style={styles.recipeTitleRow}>
                    {titleEmoji && (
                      <Text
                        style={styles.recipeEmoji}
                        testID={`plan-day-emoji-${dayItem.day}`}
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                      >
                        {titleEmoji}
                      </Text>
                    )}
                    <Text
                      style={[typography.headlineMd, styles.recipeName]}
                      numberOfLines={2}
                      testID={`plan-day-title-${dayItem.day}`}
                    >
                      {recipe.name}
                    </Text>
                  </View>
                  <Text style={[styles.recipeDescription, typography.bodySm]} numberOfLines={3}>
                    {recipe.description}
                  </Text>

                  {/* Métricas rápidas de la receta */}
                  <View style={styles.dayMetricsRow}>
                    <View style={styles.dayMetricItem}>
                      <MaterialCommunityIcons name="timer-outline" size={16} color={colors.primary} />
                      <Text style={[styles.dayMetricText, typography.labelSm]}>
                        {recipe.totalMinutes} min
                      </Text>
                    </View>

                    <View style={styles.dayMetricItem}>
                      <MaterialCommunityIcons name="check-circle-outline" size={16} color={colors.primary} />
                      <Text style={[styles.dayMetricText, typography.labelSm]}>
                        {recipe.availableIngredients.length} en casa
                      </Text>
                    </View>

                    {hasMissing ? (
                      <View style={styles.dayMetricItem}>
                        <MaterialCommunityIcons name="cart-plus" size={16} color={colors.secondary} />
                        <Text style={[styles.dayMetricText, typography.labelSm, { color: colors.secondary }]}>
                          {recipe.missingIngredients.length} por comprar
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.dayMetricItem}>
                        <MaterialCommunityIcons name="check-all" size={16} color={colors.primary} />
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
                      <MaterialCommunityIcons name="check-circle-outline" size={16} color={colors.primary} />
                      <Text style={[styles.completedBadgeText, typography.labelSm]}>
                        ¡Día completado!
                      </Text>
                    </View>
                  )}

                  <Button
                    testID={`plan-day-complete-button-${dayItem.day}`}
                    title={dayItem.isCompleted ? 'Marcar como pendiente' : 'Marcar día como completado'}
                    variant={dayItem.isCompleted ? 'ghost' : 'primary'}
                    size="md"
                    fullWidth
                    style={dayItem.isCompleted ? undefined : styles.ctaButton}
                    textStyle={dayItem.isCompleted ? undefined : styles.ctaText}
                    onPress={() => toggleDayCompleted(dayItem.day)}
                    leftIcon={
                      <MaterialCommunityIcons
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
                    style={styles.outlineAction}
                    textStyle={styles.outlineActionText}
                    onPress={() => handleNavigateToRecipe(recipe.id)}
                    leftIcon={<MaterialCommunityIcons name="book-open-variant" size={18} color={colors.primary} />}
                  />
                </Card>
              );
            })}

            {/* 9. Resumen presupuestario del plan */}
            <Card variant="elevated" style={styles.budgetCard} testID="plan-budget-summary">
              <View style={styles.budgetCardHeader}>
                <MaterialCommunityIcons name="wallet-outline" size={22} color={colors.primary} />
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
                <MaterialCommunityIcons
                  name={plan.withinBudget ? 'check-circle-outline' : 'alert-outline'}
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
                    <MaterialCommunityIcons name="cart-outline" size={18} color={colors.secondary} />
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
                  <MaterialCommunityIcons name="check-all" size={24} color={colors.primary} />
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
                        <MaterialCommunityIcons
                          name="checkbox-blank-circle-outline"
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

const createStyles = (colors: AppColors) => {
  const surfaces = getAppSurfaces(colors);
  const surfaceCard = surfaces.card;
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      ...surfaces.canvas,
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
      backgroundColor: colors.primaryAction,
      alignItems: 'center',
      justifyContent: 'center',
    },
    summaryPinned: {
      paddingHorizontal: spacing.margin,
      paddingTop: spacing.xs,
      paddingBottom: spacing.sm + 4,
    },
    summaryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    summaryTile: {
      flexGrow: 1,
      flexBasis: '45%',
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm - 2,
      padding: spacing.sm,
      ...surfaces.tile,
    },
    // Ícono arriba y texto debajo: todo el ancho del mosaico queda para el valor
    summaryTileStacked: {
      flexDirection: 'column',
      alignItems: 'flex-start',
    },
    summaryTileCompact: {
      gap: spacing.xs,
      paddingHorizontal: spacing.xs + 2,
    },
    summaryIconBoxCompact: {
      width: 32,
      height: 32,
    },
    summaryValueCompact: {
      fontSize: 13,
      letterSpacing: 0,
    },
    summaryIconBox: {
      width: 36,
      height: 36,
      borderRadius: radius.md + 4,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.iconTile,
    },
    summaryDivider: {
      width: 1,
      alignSelf: 'stretch',
      marginVertical: spacing.xs,
      backgroundColor: colors.cardBorder,
    },
    summaryTextCol: {
      flex: 1,
      flexBasis: 'auto',
      minWidth: 0,
    },
    summaryLabel: {
      color: colors.textSecondary,
    },
    summaryValue: {
      color: colors.textPrimary,
      fontWeight: '700',
    },
    staleBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.secondaryFixed,
      padding: spacing.md,
      borderRadius: radius.lg,
    },
    staleTextWrapper: {
      flex: 1,
    },
    staleTitle: {
      color: colors.onSecondaryFixed,
      fontWeight: '700',
    },
    staleDescription: {
      color: colors.onSecondaryFixed,
      marginTop: 2,
      lineHeight: 18,
    },
    errorCard: {
      backgroundColor: colors.errorContainer,
      borderColor: colors.error,
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
      ...surfaceCard,
      padding: spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
    },
    emptyIconCircle: {
      width: 72,
      height: 72,
      borderRadius: radius.full,
      backgroundColor: colors.iconTile,
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
      ...surfaceCard,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.lg,
      paddingBottom: spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm + 4,
    },
    introIllustration: {
      width: 176,
      height: 132,
      alignItems: 'center',
      justifyContent: 'center',
    },
    introHalo: {
      position: 'absolute',
      width: 128,
      height: 128,
      borderRadius: radius.full,
      backgroundColor: colors.iconTile,
    },
    introBowl: {
      position: 'absolute',
      right: 22,
      bottom: 6,
      width: 52,
      height: 52,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      ...surfaces.cta,
    },
    introSpark: {
      position: 'absolute',
      width: 16,
      height: 4,
      borderRadius: radius.full,
      backgroundColor: colors.tertiary,
    },
    introSparkTop: {
      top: 8,
      right: 38,
      transform: [{ rotate: '-70deg' }],
    },
    introSparkMiddle: {
      top: 22,
      right: 20,
      transform: [{ rotate: '-30deg' }],
    },
    introSparkBottom: {
      top: 40,
      right: 16,
      transform: [{ rotate: '0deg' }],
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
    ctaButton: {
      paddingHorizontal: spacing.md,
      borderRadius: radius.lg + 2,
    },
    ctaText: {
      fontSize: 15,
      fontWeight: '700',
    },
    outlineAction: {
      paddingHorizontal: spacing.md,
      borderRadius: radius.lg + 2,
    },
    outlineActionText: {
      fontSize: 15,
    },
    regenerateRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginBottom: spacing.xs,
    },
    resultsHeaderTextCol: {
      flex: 1,
      minWidth: 0,
    },
    resultsHeaderTitle: {
      color: colors.textPrimary,
      fontWeight: '700',
    },
    resultsHeaderSubtitle: {
      color: colors.textSecondary,
    },
    progressCard: {
      ...surfaceCard,
      padding: spacing.md,
      gap: spacing.sm + 2,
    },
    progressHeaderRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.xs,
    },
    progressHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    progressCardTitle: {
      color: colors.textPrimary,
      fontWeight: '700',
      fontSize: 17,
      lineHeight: 24,
    },
    progressCountText: {
      color: colors.primary,
      fontWeight: '700',
    },
    progressBarTrack: {
      width: '100%',
      height: 8,
      backgroundColor: colors.surfaceContainerLow,
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
      backgroundColor: colors.primaryFixed,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: radius.lg,
      marginBottom: 4,
    },
    completedBadgeText: {
      color: colors.primary,
      fontWeight: '600',
    },
    dayCard: {
      ...surfaceCard,
      padding: spacing.md,
      gap: spacing.sm + 2,
    },
    dayHeaderRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.xs,
    },
    dayBadge: {
      backgroundColor: colors.iconTile,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radius.full,
    },
    dayBadgeText: {
      color: colors.onPrimaryFixed,
      fontWeight: '700',
      fontSize: 11,
    },
    convenienceBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.tertiaryFixed,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radius.full,
    },
    convenienceBadgeText: {
      color: colors.onTertiaryContainer,
      fontWeight: '700',
      fontSize: 11,
    },
    recipeTitleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    recipeEmoji: {
      fontSize: 18,
      lineHeight: 26,
    },
    recipeName: {
      flexShrink: 1,
      color: colors.textPrimary,
      fontWeight: '700',
      fontSize: 18,
      lineHeight: 24,
    },
    recipeDescription: {
      color: colors.textSecondary,
      lineHeight: 18,
    },
    dayMetricsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm + 2,
      backgroundColor: colors.surfaceContainerLow,
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.sm + 2,
      borderRadius: radius.lg,
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
      gap: spacing.sm,
      paddingVertical: 2,
    },
    recipeCostLabel: {
      flexShrink: 1,
      color: colors.textSecondary,
    },
    recipeCostValue: {
      flexShrink: 0,
      color: colors.secondary,
      fontWeight: '700',
    },
    budgetCard: {
      ...surfaceCard,
      padding: spacing.md,
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
      gap: spacing.sm,
      paddingVertical: 2,
    },
    budgetTableLabel: {
      flex: 1,
      color: colors.textSecondary,
    },
    budgetTableValue: {
      flexShrink: 1,
      color: colors.textPrimary,
      fontWeight: '600',
      textAlign: 'right',
    },
    budgetDivider: {
      height: 1,
      backgroundColor: colors.cardBorder,
      marginVertical: spacing.xs,
    },
    budgetTotalLabel: {
      flex: 1,
      color: colors.textPrimary,
      fontWeight: '700',
    },
    budgetTotalValue: {
      flexShrink: 1,
      fontWeight: '700',
      textAlign: 'right',
    },
    withinBudgetBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      padding: spacing.sm,
      borderRadius: radius.lg,
      marginTop: spacing.xs,
    },
    withinBudgetSuccess: {
      backgroundColor: colors.primaryFixed,
    },
    withinBudgetWarning: {
      backgroundColor: colors.secondaryFixed,
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
      ...surfaceCard,
      padding: spacing.md,
      gap: spacing.sm,
    },
    shoppingHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.xs,
    },
    shoppingTitleRow: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    shoppingIconBox: {
      width: 28,
      height: 28,
      borderRadius: radius.full,
      backgroundColor: colors.secondaryFixed,
      alignItems: 'center',
      justifyContent: 'center',
    },
    shoppingTitle: {
      flexShrink: 1,
      color: colors.textPrimary,
      fontWeight: '700',
    },
    shoppingCountBadge: {
      backgroundColor: colors.errorContainer,
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
      backgroundColor: colors.surfaceContainerLow,
      borderColor: colors.outlineVariant,
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
      gap: spacing.sm,
      padding: spacing.sm + 2,
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: radius.md + 4,
      borderWidth: 1,
      borderColor: colors.cardBorder,
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
};
