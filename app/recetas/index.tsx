/**
 * FoodAI - Pantalla de Descubrimiento y Listado de Recetas (Fase 2C).
 * Inspirada en la pantalla Stitch «8. Opciones Convenientes».
 *
 * Muestra recetas optimizadas según la despensa del usuario y el presupuesto disponible,
 * distinguiendo entre ingredientes disponibles y faltantes, y etiquetando explícitamente
 * los datos demostrativos aislados para esta fase.
 */
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
import { Button, Card, Chip, Input, Stepper } from '../../src/components/common';
import { usePantry } from '../../src/context/PantryContext';
import { useBudget } from '../../src/context/BudgetContext';
import { DEMO_RECIPES_META, getDemoRecipes } from '../../src/fixtures/demoRecipes';
import { ClientRecipe, formatCopCurrency } from '../../src/types/recipe';
import { colors, radius, spacing, useTypography } from '../../src/theme';

type FilterType = 'all' | 'low-cost' | 'quick' | 'urgent';

export default function RecipeDiscoveryScreen() {
  const typography = useTypography();
  const router = useRouter();

  const { summary } = usePantry();
  const { budget, servings, setServings } = useBudget();

  // Estados de búsqueda, filtros y carga
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [maxMinutesFilter, setMaxMinutesFilter] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Obtener recetas dinámicas según presupuesto y comensales
  const recipes = useMemo(() => {
    return getDemoRecipes(budget, servings);
  }, [budget, servings]);

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
      result = result.filter((r) => r.reason.toLowerCase().includes('urgente') || r.reason.toLowerCase().includes('dañen'));
    }

    // Filtro por tiempo máximo
    if (maxMinutesFilter !== null) {
      result = result.filter((r) => r.totalMinutes <= maxMinutesFilter);
    }

    return result;
  }, [recipes, searchQuery, activeFilter, maxMinutesFilter]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const handleRetry = () => {
    setIsLoading(true);
    setError(null);
    setTimeout(() => {
      setIsLoading(false);
    }, 400);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* 1. Header con branding e identidad FoodAI */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable
            testID="recipes-back-button"
            accessibilityRole="button"
            accessibilityLabel="Volver a la pantalla anterior"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onPress={handleBack}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.backButtonPressed,
            ]}
          >
            <MaterialIcons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Image
            source={require('../../assets/images/logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
            accessibilityLabel="Logotipo FoodAI"
          />
          <Text
            style={[styles.headerTitle, typography.headlineMd]}
            numberOfLines={1}
            accessibilityRole="header"
          >
            Recomendaciones
          </Text>
        </View>

        <Pressable
          testID="recipes-profile-avatar"
          accessibilityRole="button"
          accessibilityLabel="Perfil de usuario"
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
        testID="recipes-scroll-view"
      >
        {/* 2. Banner de transparencia de datos demostrativos */}
        <View
          style={styles.demoBanner}
          testID="recipes-demo-banner"
          accessibilityRole="text"
          accessibilityLabel={DEMO_RECIPES_META.noticeText}
        >
          <View style={styles.demoBadge}>
            <MaterialIcons name="science" size={14} color={colors.primary} />
            <Text style={[styles.demoBadgeText, typography.labelSm]}>
              {DEMO_RECIPES_META.badgeLabel}
            </Text>
          </View>
          <Text style={[styles.demoNoticeText, typography.bodySm]}>
            {DEMO_RECIPES_META.noticeText}
          </Text>
        </View>

        {/* 3. Hero y contexto Stitch 8 */}
        <View style={styles.heroSection}>
          <View style={styles.pantryBadge}>
            <MaterialIcons name="eco" size={14} color="#5B4300" />
            <Text style={[styles.pantryBadgeText, typography.labelSm]}>
              Aprovecha tu despensa ({summary.totalCount} alimentos disponibles)
            </Text>
          </View>
          <Text
            style={[styles.heroHeadline, typography.headlineXl]}
            accessibilityRole="header"
          >
            Esto es lo que más te conviene
          </Text>
          <Text style={[styles.heroSubtitle, typography.bodySm]}>
            Opciones optimizadas para usar lo que tienes y gastar lo mínimo.
          </Text>
        </View>

        {/* 4. Barra de presupuesto compartido y comensales */}
        <Card variant="elevated" style={styles.budgetBarCard}>
          <View style={styles.budgetBarRow}>
            <View style={styles.budgetCol}>
              <View style={styles.budgetLabelRow}>
                <MaterialIcons name="payments" size={16} color={colors.outline} />
                <Text style={[styles.budgetLabel, typography.labelSm]}>
                  PRESUPUESTO DISPONIBLE
                </Text>
              </View>
              <Text style={[styles.budgetAmount, typography.headlineMd]}>
                {formatCopCurrency(budget)}
              </Text>
            </View>

            <View style={styles.servingsCol}>
              <Text style={[styles.servingsLabel, typography.labelSm]}>
                COMENSALES
              </Text>
              <Stepper
                value={servings}
                min={1}
                max={12}
                step={1}
                unit="pers."
                onChange={(val) => setServings(val)}
                accessibilityLabel="Ajustar número de comensales"
              />
            </View>
          </View>
        </Card>

        {/* 5. Búsqueda y Chips de Filtro */}
        <View style={styles.filterSection}>
          <Input
            testID="recipes-search-input"
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Buscar por receta o ingrediente..."
            leftIcon={
              <MaterialIcons name="search" size={20} color={colors.outline} />
            }
            rightIcon={
              searchQuery ? (
                <Pressable
                  testID="recipes-clear-search-button"
                  onPress={() => setSearchQuery('')}
                  accessibilityRole="button"
                  accessibilityLabel="Limpiar búsqueda"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons name="clear" size={18} color={colors.outline} />
                </Pressable>
              ) : undefined
            }
            accessibilityLabel="Buscar recetas"
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterChipsRow}
          >
            <Chip
              testID="filter-chip-all"
              label="Todas"
              variant="filter"
              selected={activeFilter === 'all'}
              onPress={() => setActiveFilter('all')}
            />
            <Chip
              testID="filter-chip-low-cost"
              label="Bajo costo (≤ $3.000)"
              variant="filter"
              selected={activeFilter === 'low-cost'}
              onPress={() => setActiveFilter('low-cost')}
            />
            <Chip
              testID="filter-chip-quick"
              label="Rápidas (≤ 25 min)"
              variant="filter"
              selected={activeFilter === 'quick'}
              onPress={() => setActiveFilter('quick')}
            />
            <Chip
              testID="filter-chip-urgent"
              label="Aprovecha urgentes"
              variant="filter"
              selected={activeFilter === 'urgent'}
              onPress={() => setActiveFilter('urgent')}
            />
          </ScrollView>
        </View>

        {/* 6. Estados de Carga, Error o Lista */}
        {isLoading ? (
          <View
            style={styles.centerContainer}
            testID="recipes-loading-state"
            accessibilityRole="progressbar"
            accessibilityLabel="Buscando las mejores recetas..."
          >
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, typography.bodyMd]}>
              Buscando las mejores recetas para tu despensa...
            </Text>
          </View>
        ) : error ? (
          <Card variant="outlined" style={styles.errorCard} testID="recipes-error-state">
            <MaterialIcons name="error-outline" size={36} color={colors.error} />
            <Text style={[styles.errorTitle, typography.headlineMd]}>
              No pudimos cargar las recetas
            </Text>
            <Text style={[styles.errorDesc, typography.bodySm]}>{error}</Text>
            <Button
              testID="recipes-retry-button"
              title="Reintentar"
              variant="primary"
              size="md"
              onPress={handleRetry}
            />
          </Card>
        ) : filteredRecipes.length === 0 ? (
          <Card
            variant="outlined"
            style={styles.emptyCard}
            testID="recipes-empty-state"
          >
            <MaterialIcons name="restaurant-menu" size={40} color={colors.outline} />
            <Text style={[styles.emptyTitle, typography.headlineMd]}>
              No encontramos recetas con estos filtros
            </Text>
            <Text style={[styles.emptyDesc, typography.bodySm]}>
              Prueba cambiando el término de búsqueda o ajusta los criterios de selección.
            </Text>
            <Button
              testID="recipes-reset-filter-button"
              title="Restablecer filtros"
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
                onPress={() => router.push(`/recetas/${recipe.id}` as any)}
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
  const availableCount = recipe.availableIngredients.length;
  const totalIngredientsCount = recipe.ingredients.length;

  return (
    <Card
      variant="elevated"
      style={[styles.recipeCard, isDominant && styles.dominantCard]}
      testID={`recipe-card-${recipe.id}`}
    >
      {/* Imagen o cabecera visual de respaldo */}
      <View style={styles.imageWrapper}>
        {recipe.imageUrl ? (
          <Image
            source={recipe.imageUrl}
            style={styles.recipeImage}
            resizeMode="cover"
            accessibilityLabel={`Foto de ${recipe.name}`}
          />
        ) : (
          <View style={styles.imageFallback} testID={`recipe-fallback-image-${recipe.id}`}>
            <MaterialIcons name="restaurant" size={48} color={colors.outlineVariant} />
            <Text style={[styles.imageFallbackText, typography.labelSm]}>FoodAI Receta</Text>
          </View>
        )}

        {/* Badge de afinidad / conveniencia */}
        <View style={styles.convenienceBadge}>
          <MaterialIcons name="verified" size={14} color="#503B00" />
          <Text style={[styles.convenienceBadgeText, typography.labelSm]}>
            {String(recipe.convenience)}
          </Text>
        </View>

        {/* Título en tarjeta dominante o normal */}
        {isDominant && (
          <View style={styles.dominantTitleOverlay}>
            <Text style={[styles.dominantTitle, typography.headlineLg]} numberOfLines={2}>
              {recipe.name}
            </Text>
          </View>
        )}
      </View>

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
              <MaterialIcons name="kitchen" size={18} color={colors.primary} />
            </View>
            <View style={styles.metricTextCol}>
              <Text style={[styles.metricLabel, typography.labelSm]}>Despensa</Text>
              <Text style={[styles.metricValue, typography.labelMd]}>
                {availableCount} de {totalIngredientsCount} listos
              </Text>
            </View>
          </View>

          <View style={styles.metricItem}>
            <View style={[styles.metricIconCircle, { backgroundColor: '#FFDAD3' }]}>
              <MaterialIcons name="shopping-cart" size={18} color={colors.secondary} />
            </View>
            <View style={styles.metricTextCol}>
              <Text style={[styles.metricLabel, typography.labelSm]}>Compra estimada</Text>
              <Text style={[styles.metricValue, typography.labelMd, { color: colors.secondary, fontWeight: '700' }]}>
                {formatCopCurrency(recipe.estimatedMissingCost)}
              </Text>
            </View>
          </View>
        </View>

        {/* Tiempo y porciones */}
        <View style={styles.metaRow}>
          <View style={styles.metaPill}>
            <MaterialIcons name="schedule" size={16} color={colors.textSecondary} />
            <Text style={[styles.metaText, typography.bodySm]}>{recipe.totalMinutes} min</Text>
          </View>
          <View style={styles.metaDivider} />
          <View style={styles.metaPill}>
            <MaterialIcons name="group" size={16} color={colors.textSecondary} />
            <Text style={[styles.metaText, typography.bodySm]}>{recipe.servings} personas</Text>
          </View>
        </View>

        {/* Razón contextual de conveniencia */}
        {recipe.reason ? (
          <View style={styles.reasonBox}>
            <MaterialIcons name="lightbulb" size={18} color={colors.secondary} style={styles.reasonIcon} />
            <Text style={[styles.reasonText, typography.bodySm]}>
              {recipe.reason}
            </Text>
          </View>
        ) : null}

        {/* Botón de acción principal */}
        <Button
          testID={`recipe-view-button-${recipe.id}`}
          title="Ver receta"
          variant="primary"
          size="md"
          fullWidth
          onPress={onPress}
          rightIcon={<MaterialIcons name="arrow-forward" size={18} color={colors.onPrimary} />}
          accessibilityLabel={`Ver receta completa: ${recipe.name}`}
          accessibilityHint="Abre el detalle completo de la receta con ingredientes y pasos"
        />
      </View>
    </Card>
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
    transform: [{ scale: 0.95 }],
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
    backgroundColor: colors.primary,
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
    backgroundColor: '#F6F3EE',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E8E2D8',
  },
  demoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#E8DDFF',
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
    backgroundColor: '#FFDF9B',
    borderRadius: radius.full,
    marginBottom: spacing.xs,
  },
  pantryBadgeText: {
    color: '#503B00',
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
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  budgetCol: {
    flex: 1,
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
    borderWidth: 1,
    borderColor: '#E8E2D8',
  },
  dominantCard: {
    borderColor: colors.primary,
    borderWidth: 1.5,
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
    backgroundColor: '#F0EDE9',
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
    backgroundColor: '#FFDF9B',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  convenienceBadgeText: {
    color: '#503B00',
    fontWeight: '700',
    fontSize: 11,
  },
  dominantTitleOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(28, 28, 25, 0.75)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dominantTitle: {
    color: colors.surface,
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
    backgroundColor: '#F6F3EE',
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
    backgroundColor: '#E8DDFF',
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
    backgroundColor: '#FFDAD3',
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  reasonIcon: {
    marginTop: 1,
  },
  reasonText: {
    color: '#73200E',
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
});
