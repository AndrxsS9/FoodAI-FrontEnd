/**
 * FoodAI - Pantalla de Modo Cocina Guiado Paso a Paso (Fase 2C & Fase 6A).
 * Inspirada en la pantalla Stitch «10. Modo Cocina».
 *
 * Ofrece una interfaz de alta legibilidad optimizada para cocinar en la cocina:
 * - Visualización de un solo paso a la vez con tipografía amplia y de alto contraste.
 * - Contador de progreso y barra interactiva de avance.
 * - Controles táctiles amplios (Anterior y Siguiente) con bloqueo en bordes.
 * - Cronómetro de tiempo transcurrido (stopwatch) en header independiente.
 * - Temporizador culinario activo de cuenta regresiva por paso (Fase 6A).
 * - Ingredientes requeridos para el paso activo.
 * - Estado explícito de finalización («¡Buen provecho!») con deducción confirmada de despensa (Fase 6A).
 * - Protección robusta contra recetas inexistentes o listas vacías de pasos.
 */
import React, { useEffect, useMemo, useState } from 'react';
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
import { Button, Card } from '../../../src/components/common';
import { useRecipes } from '../../../src/context/RecipeContext';
import { useMealPlanSafe } from '../../../src/context/MealPlanContext';
import { usePantrySafe } from '../../../src/context/PantryContext';
import { calculatePantryDeduction } from '../../../src/utils/pantryConsumption';
import { formatCopCurrency } from '../../../src/types/recipe';
import {
  AppColors,
  radius,
  spacing,
  useTypography,
  useAppTheme,
  useThemeStyles,
} from '../../../src/theme';

interface StepCountdownCardProps {
  stepDuration: { stepIndex: number; minutes?: number; action?: string };
}

function StepCountdownCard({ stepDuration }: StepCountdownCardProps) {
  const typography = useTypography();
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const initialSeconds = Math.round((stepDuration.minutes || 0) * 60);
  const [countdownSeconds, setCountdownSeconds] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isRunning && countdownSeconds > 0) {
      interval = setInterval(() => {
        setCountdownSeconds((prev) => {
          if (prev <= 1) {
            setIsRunning(false);
            setIsCompleted(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, countdownSeconds]);

  const handleToggle = () => {
    if (countdownSeconds <= 0) {
      setCountdownSeconds(initialSeconds);
      setIsCompleted(false);
    }
    setIsRunning((prev) => !prev);
  };

  const handleReset = () => {
    setIsRunning(false);
    setIsCompleted(false);
    setCountdownSeconds(initialSeconds);
  };

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `${pad(mins)}:${pad(secs)}`;
  };

  return (
    <Card variant="outlined" style={styles.stepTimerCard} testID="cooking-step-countdown-card">
      <View style={styles.stepTimerHeaderRow}>
        <View style={styles.stepTimerTitleBox}>
          <MaterialIcons name="hourglass-top" size={20} color={colors.primary} />
          <View>
            <Text style={[styles.stepTimerTitle, typography.labelMd]}>
              Temporizador del paso
            </Text>
            {Boolean(stepDuration.action) && (
              <Text style={[styles.stepTimerSubtitle, typography.bodySm]}>
                {stepDuration.action}
              </Text>
            )}
          </View>
        </View>

        <Text
          style={[
            styles.stepTimerCountdown,
            typography.headlineLg,
            isCompleted && styles.stepTimerCountdownCompleted,
          ]}
          testID="cooking-step-countdown-display"
        >
          {formatTimer(countdownSeconds)}
        </Text>
      </View>

      {isCompleted && (
        <View style={styles.stepTimerCompletedBadge} testID="cooking-countdown-completed">
          <MaterialIcons name="check-circle" size={16} color={colors.primary} />
          <Text style={[styles.stepTimerCompletedText, typography.labelSm]}>
            ¡Tiempo del paso completado!
          </Text>
        </View>
      )}

      <View style={styles.stepTimerActionsRow}>
        <Button
          testID="cooking-step-countdown-toggle"
          title={isRunning ? 'Pausar' : isCompleted ? 'Reiniciar' : 'Iniciar'}
          variant="primary"
          size="sm"
          onPress={handleToggle}
          leftIcon={
            <MaterialIcons
              name={isRunning ? 'pause' : 'play-arrow'}
              size={18}
              color={colors.onPrimary}
            />
          }
        />
        <Button
          testID="cooking-step-countdown-reset"
          title="Restablecer"
          variant="outline"
          size="sm"
          onPress={handleReset}
          leftIcon={<MaterialIcons name="replay" size={18} color={colors.primary} />}
        />
      </View>
    </Card>
  );
}

export default function GuidedCookingScreen() {
  const typography = useTypography();
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; fromPlan?: string }>();
  const recipeId = params.id ? String(params.id).trim() : '';

  const { getRecipeById, selectedRecipe } = useRecipes();
  const mealPlan = useMealPlanSafe();
  const pantry = usePantrySafe();

  const plannedRecipe = useMemo(() => {
    return mealPlan?.getRecipeById(recipeId);
  }, [mealPlan, recipeId]);

  const recipe = useMemo(() => {
    if (params.fromPlan === 'true' || plannedRecipe) {
      return (
        plannedRecipe ||
        getRecipeById(recipeId) ||
        (selectedRecipe?.id === recipeId ? selectedRecipe : undefined)
      );
    }
    return (
      getRecipeById(recipeId) ||
      (selectedRecipe?.id === recipeId ? selectedRecipe : undefined) ||
      plannedRecipe
    );
  }, [getRecipeById, selectedRecipe, plannedRecipe, recipeId, params.fromPlan]);

  // Pasos normalizados seguros
  const steps = useMemo(() => {
    if (!recipe || !Array.isArray(recipe.steps) || recipe.steps.length === 0) {
      return [];
    }
    return recipe.steps;
  }, [recipe]);

  // Estado del paso actual (índice 0-based)
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // Estado del modal de finalización
  const [isFinished, setIsFinished] = useState(false);

  // Cronómetro general de cocina (stopwatch de tiempo transcurrido)
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning]);

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `${pad(mins)}:${pad(secs)}`;
  };

  const handleToggleTimer = () => {
    setIsTimerRunning((prev) => !prev);
  };

  const handleResetTimer = () => {
    setIsTimerRunning(false);
    setTimerSeconds(0);
  };

  // Metadatos de duración para el paso activo (soporta indexación 0-based o 1-based)
  const currentStepDuration = useMemo(() => {
    if (!recipe?.stepDurations || !Array.isArray(recipe.stepDurations)) return undefined;
    const zeroBasedExists = recipe.stepDurations.some((sd) => sd.stepIndex === 0);
    const targetIndex = zeroBasedExists ? currentStepIndex : currentStepIndex + 1;
    const match = recipe.stepDurations.find((sd) => sd.stepIndex === targetIndex);
    if (match && typeof match.minutes === 'number' && match.minutes > 0) {
      return match;
    }
    return undefined;
  }, [recipe, currentStepIndex]);

  // Estado y consumo confirmado de despensa
  const [isDeducted, setIsDeducted] = useState(false);
  const [isDeducting, setIsDeducting] = useState(false);
  const [deductionFeedback, setDeductionFeedback] = useState<{
    tone: 'success' | 'error';
    message: string;
  } | null>(null);
  // Solo una bandera explícita identifica la receta como demo; el bloqueo definitivo vive en PantryContext.
  const isDemoRecipe = recipe?.isDemoFixture === true;

  useEffect(() => {
    let isMounted = true;
    if (recipe && pantry?.checkIfRecipeDeducted) {
      pantry.checkIfRecipeDeducted(recipe).then((deducted) => {
        if (isMounted) setIsDeducted(deducted);
      });
    }
    return () => {
      isMounted = false;
    };
  }, [recipe, pantry]);

  const deductionPlan = useMemo(() => {
    if (!recipe?.ingredients || !pantry?.ingredients) return null;
    return calculatePantryDeduction(pantry.ingredients, recipe.ingredients);
  }, [pantry, recipe]);

  const handleConfirmDeduction = async () => {
    if (!recipe || isDemoRecipe || isDeducted || isDeducting || !pantry) return;
    setIsDeducting(true);
    setDeductionFeedback(null);
    try {
      const result = await pantry.consumeRecipeIngredients(recipe);
      if (result.success) {
        setIsDeducted(true);
        setDeductionFeedback({
          tone: 'success',
          message: `¡Descuento exitoso! Se descontaron ${result.deductedCount} ingredientes.`,
        });
        if (mealPlan && recipe.id) {
          await mealPlan.markRecipeCompleted(recipe.id);
        }
      } else {
        if (result.alreadyDeducted) {
          setIsDeducted(true);
        }
        setDeductionFeedback({
          tone: 'error',
          message: result.error || 'No se pudo aplicar el descuento.',
        });
      }
    } catch {
      setDeductionFeedback({
        tone: 'error',
        message: 'Ocurrió un error al descontar ingredientes de la despensa.',
      });
    } finally {
      setIsDeducting(false);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(
        (recipe
          ? `/recetas/${recipe.id}${params.fromPlan === 'true' ? '?fromPlan=true' : ''}`
          : params.fromPlan === 'true'
          ? '/(tabs)/plan'
          : '/recetas') as any
      );
    }
  };

  const totalSteps = steps.length;
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === totalSteps - 1;
  const progressPercent = totalSteps > 0 ? Math.round(((currentStepIndex + 1) / totalSteps) * 100) : 0;

  const handleNextStep = () => {
    if (isLastStep) {
      setIsFinished(true);
      setIsTimerRunning(false);
    } else {
      setCurrentStepIndex((prev) => Math.min(prev + 1, totalSteps - 1));
    }
  };

  const handlePrevStep = () => {
    if (!isFirstStep) {
      setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
    }
  };

  const handleJumpToEnd = () => {
    if (totalSteps > 0) {
      setCurrentStepIndex(totalSteps - 1);
    }
  };

  // Manejo de receta inválida o inexistente
  if (!recipe) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable
            testID="cooking-mode-exit-button"
            accessibilityRole="button"
            accessibilityLabel="Salir de Modo Cocina"
            onPress={handleBack}
            style={styles.closeButton}
          >
            <MaterialIcons name="close" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, typography.headlineMd]}>Modo Cocina</Text>
        </View>

        <View style={styles.centerContainer} testID="cooking-not-found-state">
          <Card variant="outlined" style={styles.emptyCard}>
            <MaterialIcons name="error-outline" size={48} color={colors.error} />
            <Text style={[styles.emptyTitle, typography.headlineMd]}>
              Receta no encontrada
            </Text>
            <Text style={[styles.emptyDesc, typography.bodyMd]}>
              No es posible iniciar el Modo Cocina porque la receta solicitada no existe.
            </Text>
            <Button
              testID="cooking-return-button"
              title="Volver a recetas"
              variant="primary"
              size="md"
              onPress={() => router.replace('/recetas' as any)}
            />
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  // Manejo de receta sin pasos registrados
  if (totalSteps === 0) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable
            testID="cooking-mode-exit-button"
            accessibilityRole="button"
            accessibilityLabel="Salir de Modo Cocina"
            onPress={handleBack}
            style={styles.closeButton}
          >
            <MaterialIcons name="close" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, typography.headlineMd]}>Modo Cocina</Text>
        </View>

        <View style={styles.centerContainer} testID="cooking-no-steps-state">
          <Card variant="outlined" style={styles.emptyCard}>
            <MaterialIcons name="info-outline" size={48} color={colors.outline} />
            <Text style={[styles.emptyTitle, typography.headlineMd]}>
              Sin instrucciones de preparación
            </Text>
            <Text style={[styles.emptyDesc, typography.bodyMd]}>
              Esta receta no cuenta con pasos de preparación registrados.
            </Text>
            <Button
              testID="cooking-return-button"
              title="Volver al detalle"
              variant="primary"
              size="md"
              onPress={handleBack}
            />
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  const activeStepText = steps[currentStepIndex];

  // Ingredientes sugeridos para contexto culinario
  const activeStepIngredients = recipe.ingredients.slice(0, 3);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* 1. Header con temporizador y botón de salida */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable
            testID="cooking-mode-exit-button"
            accessibilityRole="button"
            accessibilityLabel="Salir de Modo Cocina"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onPress={handleBack}
            style={styles.closeButton}
          >
            <MaterialIcons name="close" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text
            style={[styles.headerTitle, typography.headlineMd]}
            numberOfLines={1}
            accessibilityRole="header"
          >
            Modo Cocina
          </Text>
        </View>

        <View style={styles.headerRight}>
          {/* Botón interactivo de temporizador */}
          <Pressable
            testID="cooking-timer-button"
            style={({ pressed }) => [
              styles.timerPill,
              isTimerRunning && styles.timerPillActive,
              pressed && styles.timerPillPressed,
            ]}
            onPress={handleToggleTimer}
            onLongPress={handleResetTimer}
            accessibilityRole="button"
            accessibilityLabel={`Temporizador de cocina: ${formatTimer(timerSeconds)}. Presiona para pausar o iniciar, mantén presionado para reiniciar.`}
          >
            <MaterialIcons
              name={isTimerRunning ? 'pause' : 'timer'}
              size={18}
              color={isTimerRunning ? colors.onPrimary : colors.primary}
            />
            <Text
              style={[
                styles.timerText,
                typography.labelMd,
                isTimerRunning && styles.timerTextActive,
              ]}
              testID="cooking-timer-display"
            >
              {formatTimer(timerSeconds)}
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        testID="cooking-scroll-view"
      >
        {/* 2. Identidad de la receta y progreso visual */}
        <View style={styles.progressSection}>
          <View style={styles.recipeMetaRow}>
            <Text
              style={[styles.recipeNameText, typography.headlineMd]}
              numberOfLines={1}
            >
              {recipe.name}
            </Text>
            <View style={styles.servingsPill}>
              <Text style={[styles.servingsPillText, typography.labelSm]}>
                {recipe.servings} comensales
              </Text>
            </View>
          </View>

          <View style={styles.progressInfoRow}>
            <Text
              style={[styles.stepCountText, typography.labelMd]}
              testID="cooking-step-counter"
            >
              Paso {currentStepIndex + 1} de {totalSteps}
            </Text>
            <Text
              style={[styles.stepPercentText, typography.labelSm]}
              testID="cooking-step-percentage"
            >
              {progressPercent}% completado
            </Text>
          </View>

          {/* Barra de progreso */}
          <View
            style={styles.progressBarTrack}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 1, max: totalSteps, now: currentStepIndex + 1 }}
          >
            <View
              style={[styles.progressBarFill, { width: `${progressPercent}%` }]}
              testID="cooking-progress-fill"
            />
          </View>
        </View>

        {/* 3. Tarjeta de Instrucción Activa (Alta legibilidad a distancia) */}
        <Card variant="elevated" style={styles.instructionCard} testID="cooking-instruction-card">
          <View style={styles.stepBadgeRow}>
            <View style={styles.stepCircleBadge} testID="cooking-step-badge">
              <Text style={[styles.stepCircleText, typography.headlineMd]}>
                {currentStepIndex + 1}
              </Text>
            </View>
            <Text style={[styles.stepBadgeLabel, typography.labelSm]}>
              INSTRUCCIÓN ACTIVA
            </Text>
          </View>

          <Text
            style={[styles.instructionHeadline, typography.headlineLg]}
            testID="cooking-step-instruction-text"
          >
            {activeStepText}
          </Text>

          {/* Consejo culinario contextual */}
          <View style={styles.tipBox} testID="cooking-step-tip">
            <MaterialIcons name="lightbulb" size={20} color={colors.secondary} style={styles.tipIcon} />
            <Text style={[styles.tipText, typography.bodySm]}>
              <Text style={styles.tipBold}>Consejo: </Text>
              Mantén el fuego controlado y los utensilios secos antes de incorporar los alimentos.
            </Text>
          </View>
        </Card>

        {/* 3b. Temporizador de cuenta regresiva del paso activo (Fase 6A) */}
        {Boolean(currentStepDuration) && currentStepDuration && (
          <StepCountdownCard
            key={`step-timer-${currentStepIndex}`}
            stepDuration={currentStepDuration}
          />
        )}

        {/* 4. Ingredientes necesarios para este paso */}
        <View style={styles.stepIngredientsSection}>
          <View style={styles.stepIngredientsHeader}>
            <View style={styles.stepIngredientsLeft}>
              <MaterialIcons name="restaurant" size={18} color={colors.outline} />
              <Text style={[styles.stepIngredientsTitle, typography.labelMd]}>
                Ingredientes de referencia
              </Text>
            </View>
            <Text style={[styles.stepIngredientsCount, typography.labelSm]}>
              {activeStepIngredients.length} sugeridos
            </Text>
          </View>

          <View style={styles.chipsWrap}>
            {activeStepIngredients.map((item, idx) => (
              <View key={`chip-${idx}`} style={styles.ingredientPill} testID={`step-ingredient-chip-${idx}`}>
                <View style={styles.ingredientDot} />
                <Text style={[styles.ingredientPillText, typography.bodySm]}>
                  {item.name}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* 5. Acción rápida: Saltar al final */}
        {!isLastStep && (
          <Pressable
            testID="cooking-jump-final-button"
            onPress={handleJumpToEnd}
            style={styles.jumpEndButton}
            accessibilityRole="button"
            accessibilityLabel="Saltar al último paso de la receta"
          >
            <Text style={[styles.jumpEndText, typography.labelSm]}>
              Saltar al final →
            </Text>
          </Pressable>
        )}
      </ScrollView>

      {/* 6. Controles táctiles amplios de navegación de cocina */}
      <View style={styles.bottomControlsBar} testID="cooking-controls-bar">
        <View style={styles.controlButtonWrapper}>
          <Button
            testID="cooking-prev-step-button"
            title="Anterior"
            variant="outline"
            size="lg"
            fullWidth
            disabled={isFirstStep}
            onPress={handlePrevStep}
            leftIcon={
              <MaterialIcons
                name="chevron-left"
                size={22}
                color={isFirstStep ? colors.outlineVariant : colors.textPrimary}
              />
            }
            accessibilityLabel="Paso anterior"
          />
        </View>

        <View style={styles.controlButtonWrapper}>
          <Button
            testID="cooking-next-step-button"
            title={isLastStep ? 'Finalizar preparación' : 'Siguiente'}
            variant="primary"
            size="lg"
            fullWidth
            onPress={handleNextStep}
            rightIcon={
              <MaterialIcons
                name={isLastStep ? 'check-circle' : 'chevron-right'}
                size={22}
                color={colors.onPrimary}
              />
            }
            accessibilityLabel={isLastStep ? 'Finalizar preparación de la receta' : 'Siguiente paso'}
          />
        </View>
      </View>

      {/* 7. Modal de Felicitación / Buen Provecho con Deducción Confirmada de Despensa */}
      {isFinished && (
        <View style={[StyleSheet.absoluteFill, styles.modalBackdrop]} testID="cooking-finish-modal">
          <View style={styles.finishCard}>
            <ScrollView
              style={styles.finishScrollBox}
              contentContainerStyle={styles.finishScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.finishIconCircle}>
                <MaterialIcons name="dinner-dining" size={40} color={colors.primary} />
              </View>

              <Text style={[styles.finishTitle, typography.headlineXl]}>
                ¡Buen provecho!
              </Text>

              <Text style={[styles.finishDesc, typography.bodyMd]}>
                Completaste tu plato de «{recipe.name}» aprovechando al máximo cada ingrediente de tu despensa sin desperdicios.
              </Text>

              <View style={styles.finishMetricsBox}>
                <View style={styles.finishMetricItem}>
                  <Text style={[styles.finishMetricLabel, typography.labelSm]}>
                    Tiempo de cocina
                  </Text>
                  <Text style={[styles.finishMetricValue, typography.headlineMd]}>
                    {timerSeconds > 0 ? formatTimer(timerSeconds) : `${recipe.totalMinutes} min`}
                  </Text>
                </View>

                <View style={styles.finishMetricDivider} />

                <View style={styles.finishMetricItem}>
                  <Text style={[styles.finishMetricLabel, typography.labelSm]}>
                    Compra adicional
                  </Text>
                  <Text style={[styles.finishMetricValue, typography.headlineMd, { color: colors.secondary }]}>
                    {formatCopCurrency(recipe.estimatedMissingCost)}
                  </Text>
                </View>
              </View>

              {/* Deducción en Despensa (Fase 6A) */}
              {isDeducted ? (
                <View style={styles.deductedBadge} testID="cooking-already-deducted-badge">
                  <MaterialIcons name="check-circle" size={18} color={colors.primary} />
                  <Text style={[styles.deductedBadgeText, typography.labelSm]}>
                    Ingredientes ya descontados de tu despensa
                  </Text>
                </View>
              ) : pantry ? (
                <View style={styles.deductionSection} testID="cooking-deduction-section">
                  <View style={styles.deductionHeaderRow}>
                    <MaterialIcons name="inventory" size={18} color={colors.primary} />
                    <Text style={[styles.deductionTitle, typography.labelMd]}>
                      Descuento en despensa
                    </Text>
                  </View>

                  {isDemoRecipe ? (
                    <Text
                      style={[styles.deductionEmptyText, typography.bodySm]}
                      testID="cooking-demo-deduction-notice"
                    >
                      Esta es una receta de demostración: no descuenta ingredientes de tu despensa real.
                    </Text>
                  ) : deductionPlan && deductionPlan.deductibleItems.length > 0 ? (
                    <View style={styles.deductibleList} testID="cooking-deductible-list">
                      {deductionPlan.deductibleItems.map((item, idx) => (
                        <View key={`deduct-${idx}`} style={styles.deductibleRow} testID={`cooking-deduct-item-${idx}`}>
                          <MaterialIcons name="remove-circle-outline" size={16} color={colors.primary} />
                          <Text style={[styles.deductibleText, typography.bodySm]}>
                            {item.recipeIngredientName}: -{item.deductQuantity} {item.pantryUnit || item.recipeUnit} (quedan {item.stockAfter} {item.pantryUnit || item.recipeUnit})
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={[styles.deductionEmptyText, typography.bodySm]}>
                      No hay ingredientes coincidentes para descontar de tu despensa.
                    </Text>
                  )}

                  {!isDemoRecipe && deductionPlan && deductionPlan.reviewItems.length > 0 && (
                    <View style={styles.reviewList} testID="cooking-review-list">
                      <Text style={[styles.reviewHeader, typography.labelSm]}>
                        Requieren revisión manual ({deductionPlan.reviewItems.length})
                      </Text>
                      {deductionPlan.reviewItems.map((item, idx) => (
                        <View key={`review-${idx}`} style={styles.reviewRow} testID={`cooking-review-item-${idx}`}>
                          <MaterialIcons name="info-outline" size={14} color={colors.secondary} />
                          <Text style={[styles.reviewText, typography.bodySm]}>
                            {item.recipeIngredientName} ({item.message})
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <Button
                    testID="cooking-confirm-deduction-button"
                    title={isDeducting ? 'Descontando...' : 'Confirmar descuento en despensa'}
                    variant="secondary"
                    size="sm"
                    fullWidth
                    disabled={
                      isDemoRecipe ||
                      isDeducting ||
                      isDeducted ||
                      !deductionPlan ||
                      deductionPlan.deductibleItems.length === 0
                    }
                    onPress={handleConfirmDeduction}
                    leftIcon={<MaterialIcons name="done" size={18} color={colors.onPrimary} />}
                  />
                </View>
              ) : null}

              {deductionFeedback?.tone === 'success' && (
                <View style={styles.deductionSuccessBadge} testID="cooking-deduction-success">
                  <MaterialIcons name="task-alt" size={16} color={colors.primary} />
                  <Text style={[styles.deductionSuccessText, typography.labelSm]}>
                    {deductionFeedback.message}
                  </Text>
                </View>
              )}

              {deductionFeedback?.tone === 'error' && (
                <View
                  style={styles.deductionErrorBadge}
                  testID="cooking-deduction-error"
                  accessibilityRole="alert"
                >
                  <MaterialIcons name="error-outline" size={16} color={colors.error} />
                  <Text style={[styles.deductionErrorText, typography.labelSm]}>
                    {deductionFeedback.message}
                  </Text>
                </View>
              )}

              <View style={styles.finishActions}>
                <Button
                  testID="cooking-finish-confirm-button"
                  title="Volver a la despensa"
                  variant="primary"
                  size="md"
                  fullWidth
                  onPress={() => router.replace('/(tabs)/despensa')}
                />
                <Button
                  testID="cooking-finish-review-button"
                  title="Revisar los pasos"
                  variant="outline"
                  size="md"
                  fullWidth
                  onPress={() => setIsFinished(false)}
                />
              </View>
            </ScrollView>
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainer,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceContainer,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  timerPillActive: {
    backgroundColor: colors.primary,
  },
  timerPillPressed: {
    opacity: 0.8,
  },
  timerText: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  timerTextActive: {
    color: colors.onPrimary,
  },
  scrollContent: {
    paddingHorizontal: spacing.margin,
    paddingTop: spacing.md,
    paddingBottom: 110,
  },
  progressSection: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  recipeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  recipeNameText: {
    color: colors.textPrimary,
    fontWeight: '700',
    flex: 1,
  },
  servingsPill: {
    backgroundColor: colors.surfaceContainer,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  servingsPillText: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  progressInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  stepCountText: {
    color: colors.primary,
    fontWeight: '700',
  },
  stepPercentText: {
    color: colors.textSecondary,
  },
  progressBarTrack: {
    width: '100%',
    height: 8,
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.full,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.full,
  },
  instructionCard: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    gap: spacing.md,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 2,
  },
  stepBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepCircleBadge: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleText: {
    color: colors.primary,
    fontWeight: '700',
  },
  stepBadgeLabel: {
    color: colors.outline,
    letterSpacing: 0.5,
  },
  instructionHeadline: {
    color: colors.textPrimary,
    fontWeight: '600',
    lineHeight: 32,
    letterSpacing: -0.3,
  },
  tipBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.surfaceContainerLow,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  tipIcon: {
    marginTop: 1,
  },
  tipText: {
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
  tipBold: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  stepTimerCard: {
    backgroundColor: colors.canvas,
    borderColor: colors.outlineVariant,
    padding: spacing.md,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    gap: spacing.sm,
  },
  stepTimerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepTimerTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  stepTimerTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  stepTimerSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  stepTimerCountdown: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 22,
  },
  stepTimerCountdownCompleted: {
    color: colors.secondary,
  },
  stepTimerCompletedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.successContainer,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.md,
  },
  stepTimerCompletedText: {
    color: colors.primary,
    fontWeight: '600',
  },
  stepTimerActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 4,
  },
  stepIngredientsSection: {
    marginTop: spacing.lg,
    gap: spacing.xs,
  },
  stepIngredientsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  stepIngredientsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepIngredientsTitle: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  stepIngredientsCount: {
    color: colors.outline,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  ingredientPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    shadowColor: colors.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 2,
  },
  ingredientDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  ingredientPillText: {
    color: colors.textPrimary,
    fontWeight: '500',
  },
  jumpEndButton: {
    alignSelf: 'flex-end',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    marginTop: spacing.sm,
  },
  jumpEndText: {
    color: colors.secondary,
    fontWeight: '600',
  },
  bottomControlsBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.margin,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  controlButtonWrapper: {
    flex: 1,
  },
  modalBackdrop: {
    backgroundColor: 'rgba(28, 28, 25, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.margin,
    zIndex: 100,
  },
  finishCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  finishScrollBox: {
    width: '100%',
  },
  finishScrollContent: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  finishIconCircle: {
    width: 68,
    height: 68,
    borderRadius: radius.full,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  finishTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  finishDesc: {
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  finishMetricsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: colors.surfaceContainerLow,
    padding: spacing.md,
    borderRadius: radius.lg,
    marginVertical: spacing.xs,
  },
  finishMetricItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  finishMetricDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.outlineVariant,
  },
  finishMetricLabel: {
    color: colors.outline,
    fontSize: 11,
  },
  finishMetricValue: {
    color: colors.primary,
    fontWeight: '700',
  },
  deductedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.successContainer,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    width: '100%',
    marginVertical: spacing.xs,
  },
  deductedBadgeText: {
    color: colors.primary,
    fontWeight: '600',
    flex: 1,
  },
  deductionSection: {
    width: '100%',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
    marginVertical: spacing.xs,
  },
  deductionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  deductionTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  deductibleList: {
    gap: 4,
    marginBottom: spacing.xs,
  },
  deductibleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deductibleText: {
    color: colors.textPrimary,
    flex: 1,
  },
  deductionEmptyText: {
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: spacing.xs,
  },
  reviewList: {
    gap: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    marginBottom: spacing.xs,
  },
  reviewHeader: {
    color: colors.outline,
    fontWeight: '600',
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reviewText: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: 12,
  },
  deductionSuccessBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.successContainer,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    width: '100%',
    marginBottom: spacing.xs,
  },
  deductionSuccessText: {
    color: colors.primary,
    fontWeight: '600',
    flex: 1,
  },
  deductionErrorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.errorContainer,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    width: '100%',
    marginBottom: spacing.xs,
  },
  deductionErrorText: {
    color: colors.onErrorContainer,
    fontWeight: '600',
    flex: 1,
  },
  finishActions: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.margin,
  },
  emptyCard: {
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    width: '100%',
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
});
