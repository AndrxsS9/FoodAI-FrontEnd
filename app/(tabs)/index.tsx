import React, { useState } from 'react';
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
import { Button, Card, Chip, Input } from '../../src/components/common';
import { usePantry } from '../../src/context/PantryContext';
import { useBudget } from '../../src/context/BudgetContext';
import { useRecipes } from '../../src/context/RecipeContext';
import { DEMO_DASHBOARD_DATA } from '../../src/fixtures/demoDashboardData';
import { formatCopCurrency } from '../../src/types/recipe';
import { colors, radius, spacing, useTypography } from '../../src/theme';

export default function HomeScreen() {
  const typography = useTypography();
  const router = useRouter();

  // Dialog state for feature preview announcements
  const [featureModalVisible, setFeatureModalVisible] = useState(false);
  const [modalContent, setModalContent] = useState<{
    title: string;
    description: string;
    icon: keyof typeof MaterialIcons.glyphMap;
  }>({
    title: '',
    description: '',
    icon: 'info',
  });

  // Dynamic shared budget state from authoritative BudgetContext
  const { budget, setBudget } = useBudget();
  const [budgetModalVisible, setBudgetModalVisible] = useState(false);
  const [tempBudgetText, setTempBudgetText] = useState(String(budget));
  const [budgetError, setBudgetError] = useState<string | undefined>(undefined);

  const showFeatureNotice = (
    title: string,
    description: string,
    icon: keyof typeof MaterialIcons.glyphMap = 'info'
  ) => {
    setModalContent({ title, description, icon });
    setFeatureModalVisible(true);
  };

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

  const { summary } = usePantry();
  const { recipes, isDemoMode, selectRecipe } = useRecipes();
  const recommendedRecipe = recipes.length > 0 ? recipes[0] : null;

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

        {/* Supportive Prompt & Greeting */}
        <View style={styles.greetingSection}>
          <Text style={[styles.greetingCategory, typography.labelMd]}>
            COCINA INTELIGENTE Y CONSCIENTE
          </Text>
          <Text
            style={[styles.greetingHeadline, typography.headlineXl]}
            accessibilityRole="header"
          >
            ¿Qué podemos preparar hoy?
          </Text>
          <Text style={[styles.greetingSubtitle, typography.bodySm]}>
            Primero usa lo que tienes. Después decide qué comprar.
          </Text>
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
            accessibilityHint="Muestra la vista previa del escáner"
            onPress={() =>
              showFeatureNotice(
                'Escáner de alimentos',
                'La captura de cámara y el reconocimiento de ingredientes con inteligencia artificial están en desarrollo y estarán disponibles en una próxima actualización.',
                'photo-camera'
              )
            }
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
            onPress={() =>
              showFeatureNotice(
                'Captura de cámara en preparación',
                'El módulo de cámara y detección fotográfica estará disponible en una próxima actualización.',
                'photo-camera'
              )
            }
            accessibilityLabel="Tomar foto de los alimentos"
            accessibilityHint="Inicia la captura fotográfica de la despensa"
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
              <MaterialIcons name="kitchen" size={22} color={colors.primary} />
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
                    onPress={() => router.push('/(tabs)/despensa')}
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
                    onPress={() => router.push('/(tabs)/despensa')}
                  />
                ))}
              </View>
            </>
          )}
        </Card>

        {/* 3. Available Budget Summary with Interactive Adjustment */}
        <Card variant="elevated" style={styles.budgetCard}>
          <View style={styles.budgetRow}>
            <View style={styles.budgetCol}>
              <View style={styles.budgetLabelRow}>
                <MaterialIcons name="payments" size={18} color={colors.outline} />
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
              onPress={handleOpenBudgetModal}
              accessibilityLabel="Ajustar presupuesto disponible"
              accessibilityHint="Abre un formulario para actualizar el presupuesto disponible"
              leftIcon={<MaterialIcons name="tune" size={16} color={colors.textPrimary} />}
            />
          </View>
        </Card>

        {/* 4. Recommendation of the Day (Autoritativo desde RecipeContext) */}
        <View style={styles.recommendationSection}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={[styles.sectionTitle, typography.headlineMd]}>
                Recomendación del día
              </Text>
              <Text style={[styles.sectionSubtitle, typography.labelSm]}>
                Optimizado a tu despensa
              </Text>
            </View>
            {recommendedRecipe?.isDemoFixture && (
              <View style={styles.demoBadge} testID="home-recipe-demo-badge">
                <Text style={[styles.demoBadgeText, typography.labelSm]}>
                  Receta de ejemplo
                </Text>
              </View>
            )}
          </View>

          {recommendedRecipe ? (
            <Card
              variant="elevated"
              style={styles.recipeCard}
              testID="home-recommended-recipe-card"
            >
              <View style={styles.recipeImageWrapper}>
                {recommendedRecipe.imageUrl ? (
                  <Image
                    source={recommendedRecipe.imageUrl}
                    style={styles.recipeImage}
                    resizeMode="cover"
                    accessibilityLabel={`Foto del plato${recommendedRecipe.isDemoFixture ? ' de ejemplo' : ''}: ${recommendedRecipe.name}`}
                  />
                ) : (
                  <View
                    style={styles.recipeImageFallback}
                    testID="home-recipe-fallback-image"
                    accessibilityRole="image"
                    accessibilityLabel={`Ilustración de ${recommendedRecipe.name}`}
                  >
                    <MaterialIcons name="restaurant" size={48} color={colors.outlineVariant} />
                    <Text style={[styles.recipeFallbackText, typography.labelSm]}>
                      FoodAI Receta
                    </Text>
                  </View>
                )}
                {/* Score pill */}
                <View
                  style={styles.convenienceBadge}
                  accessibilityRole="text"
                  accessibilityLabel={`Afinidad estimada${recommendedRecipe.isDemoFixture ? ' de ejemplo' : ''}: ${recommendedRecipe.convenience}`}
                >
                  <MaterialIcons name="verified" size={16} color={colors.tertiaryContainer} />
                  <Text style={[styles.convenienceText, typography.labelSm]}>
                    {typeof recommendedRecipe.convenience === 'number'
                      ? `${recommendedRecipe.convenience}% conveniente`
                      : recommendedRecipe.convenience}
                  </Text>
                </View>

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
              </View>

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
                  <View style={styles.highlightRow}>
                    <MaterialIcons name="savings" size={18} color={colors.primary} />
                    <Text style={[styles.highlightText, typography.bodySm]}>
                      Solo necesitas aproximadamente{' '}
                      <Text style={[styles.highlightBold, { color: colors.primary }]}>
                        {formatCopCurrency(recommendedRecipe.estimatedMissingCost, false)}
                      </Text>
                    </Text>
                  </View>

                  {recommendedRecipe.reason ? (
                    <View style={styles.highlightRow}>
                      <MaterialIcons name="recycling" size={18} color={colors.secondary} />
                      <Text style={[styles.highlightText, typography.bodySm]}>
                        {recommendedRecipe.reason}
                      </Text>
                    </View>
                  ) : null}
                </View>

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
                  accessibilityLabel={`Ver receta de ${recommendedRecipe.name}${recommendedRecipe.isDemoFixture ? ' (ejemplo)' : ''}`}
                  accessibilityHint="Muestra los pasos detallados de la receta"
                  rightIcon={<MaterialIcons name="arrow-forward" size={18} color={colors.onPrimary} />}
                />
              </View>
            </Card>
          ) : (
            <Card
              variant="outlined"
              style={styles.emptyRecipeCard}
              testID="home-empty-recipe-state"
            >
              <View style={styles.emptyRecipeIconBox}>
                <MaterialIcons name="menu-book" size={32} color={colors.outline} />
              </View>
              <Text style={[styles.emptyRecipeTitle, typography.headlineMd]}>
                Sin recomendaciones disponibles
              </Text>
              <Text style={[styles.emptyRecipeText, typography.bodySm]}>
                No hay recetas disponibles para tu despensa o presupuesto actual. Explora el catálogo o ajusta tus preferencias.
              </Text>
              <Button
                testID="home-explore-recipes-button"
                title="Explorar recetas"
                variant="primary"
                size="md"
                onPress={() => router.push('/recetas' as any)}
                leftIcon={<MaterialIcons name="restaurant-menu" size={18} color={colors.onPrimary} />}
              />
            </Card>
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

      {/* Reusable modal overlay informing users about upcoming features without broken buttons */}
      {featureModalVisible && (
        <View
          style={[StyleSheet.absoluteFill, styles.modalBackdrop]}
          testID="modal-backdrop"
          accessibilityRole="alert"
        >
          <View style={styles.modalCard}>
            <View style={styles.modalIconBox}>
              <MaterialIcons name={modalContent.icon} size={32} color={colors.primary} />
            </View>
            <Text style={[styles.modalTitle, typography.headlineMd]}>
              {modalContent.title}
            </Text>
            <Text style={[styles.modalDescription, typography.bodyMd]}>
              {modalContent.description}
            </Text>
            <Button
              testID="modal-close-button"
              title="Entendido"
              variant="primary"
              size="md"
              fullWidth
              onPress={() => setFeatureModalVisible(false)}
            />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
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
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
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
    paddingTop: spacing.xs,
  },
  greetingCategory: {
    color: colors.primary,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  greetingHeadline: {
    color: colors.textPrimary,
    fontWeight: '700',
    marginTop: 4,
  },
  greetingSubtitle: {
    color: colors.textSecondary,
    marginTop: 4,
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
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerLow,
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
    height: 130,
    borderRadius: radius.md,
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
    backgroundColor: 'rgba(91, 75, 138, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewfinderReticle: {
    width: 54,
    height: 54,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
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
    gap: spacing.xs + 2,
  },
  pantryBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  countBadge: {
    color: colors.primary,
    fontWeight: '600',
  },
  urgentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 218, 211, 0.6)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  urgentBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  urgentBannerTitle: {
    color: '#802916',
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
    backgroundColor: 'rgba(91, 75, 138, 0.08)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    borderRadius: radius.md,
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
    borderRadius: radius.md,
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
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  budgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    color: colors.outline,
    letterSpacing: 0.5,
  },
  budgetAmount: {
    color: colors.textPrimary,
    fontWeight: '700',
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
    height: 180,
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
    backgroundColor: '#F0EDE9',
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
    backgroundColor: '#FFDF9B',
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
    color: colors.tertiaryContainer,
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
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  recipeMetaText: {
    color: colors.textPrimary,
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
    alignItems: 'flex-start',
    gap: spacing.xs + 2,
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
    backgroundColor: 'rgba(37, 43, 58, 0.5)',
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
    borderRadius: radius.lg,
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
    backgroundColor: colors.surfaceContainerLow,
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

