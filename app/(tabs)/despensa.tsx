/**
 * FoodAI - Pantalla principal de Despensa (Fase 2B).
 * Implementa el registro manual, visualización, edición, eliminación y persistencia local
 * de ingredientes según el diseño Stitch «6. Mi Despensa» y «5. Ingredientes Detectados».
 */
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import {
  Button,
  Card,
  Input,
} from '../../src/components/common';
import {
  DeleteConfirmationModal,
  IngredientCard,
  IngredientFormModal,
  IngredientFormSaveData,
} from '../../src/components/pantry';
import { usePantry } from '../../src/context/PantryContext';
import { AppColors, getAppSurfaces, radius, spacing, useAppTheme, useThemeStyles, useTypography } from '../../src/theme';
import { Ingredient } from '../../src/types/pantry';
import { useLocale } from '../../src/context/LocaleContext';
import { getCategoryLabel } from '../../src/locales/labels';
import { localizeMessage } from '../../src/locales/messages';

export default function DespensaScreen() {
  const typography = useTypography();
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const { t, tp, locale } = useLocale();

  const {
    ingredients,
    isLoading,
    storageError,
    summary,
    addIngredient,
    updateIngredient,
    deleteIngredient,
    adjustQuantity,
    refresh,
    clearStorageError,
  } = usePantry();
  const localizedStorageError = localizeMessage(storageError, locale, {
    fallbackKey: 'messages.pantry.fallback',
  });

  // Estados de modales
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  const [deletingIngredient, setDeletingIngredient] = useState<Ingredient | null>(null);
  const [cookSuggestionVisible, setCookSuggestionVisible] = useState(false);

  // Filtro de búsqueda
  const [searchQuery, setSearchQuery] = useState('');

  // Filtrado reactivo de ingredientes
  const filteredIngredients = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return ingredients;
    return ingredients.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        // Búsqueda también por la etiqueta visible de la categoría (solo presentación)
        getCategoryLabel(item.category, locale).toLowerCase().includes(query)
    );
  }, [ingredients, searchQuery, locale]);

  // Separación entre urgentes y disponibles dentro de los filtrados
  const { urgentFiltered, regularFiltered } = useMemo(() => {
    const urgent: Ingredient[] = [];
    const regular: Ingredient[] = [];

    filteredIngredients.forEach((item) => {
      const isUrgent = summary.urgentIngredients.some((u) => u.id === item.id);
      if (isUrgent) {
        urgent.push(item);
      } else {
        regular.push(item);
      }
    });

    return { urgentFiltered: urgent, regularFiltered: regular };
  }, [filteredIngredients, summary.urgentIngredients]);

  // Número de categorías con al menos un alimento (solo presentación)
  const activeCategoriesCount = useMemo(
    () => Object.values(summary.categoriesBreakdown).filter((count) => count > 0).length,
    [summary.categoriesBreakdown]
  );

  // Handlers para registro y edición
  const handleOpenAddModal = () => {
    setEditingIngredient(null);
    setFormModalVisible(true);
  };

  const handleOpenEditModal = (ingredient: Ingredient) => {
    setEditingIngredient(ingredient);
    setFormModalVisible(true);
  };

  const handleSaveIngredient = async (data: IngredientFormSaveData) => {
    if (editingIngredient) {
      await updateIngredient({
        id: editingIngredient.id,
        name: data.name,
        quantity: data.quantity,
        unit: data.unit,
        category: data.category,
        expirationDate: data.expirationDate,
      });
    } else {
      await addIngredient({
        name: data.name,
        quantity: data.quantity,
        unit: data.unit,
        category: data.category,
        expirationDate: data.expirationDate ?? undefined,
      });
    }
  };

  const handleDeleteRequest = (ingredient: Ingredient) => {
    setDeletingIngredient(ingredient);
  };

  const handleConfirmDelete = async () => {
    if (!deletingIngredient) return;
    try {
      await deleteIngredient(deletingIngredient.id);
      setDeletingIngredient(null);
    } catch {
      Alert.alert(t('pantry.deleteErrorTitle'), t('pantry.deleteErrorMessage'));
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* 1. Header con logotipo FoodAI y avatar de perfil */}
      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <Image
            source={require('../../assets/images/logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
            accessibilityLabel={t('pantry.logoLabel')}
          />
          <View style={styles.headerTextCol}>
            <Text
              style={[styles.headerSubtext, typography.labelSm]}
              numberOfLines={1}
            >
              {t('pantry.brandSubtitle')}
            </Text>
            <Text
              style={[styles.headerTitle, typography.headlineMd]}
              numberOfLines={1}
              accessibilityRole="header"
            >
              {t('pantry.title')}
            </Text>
          </View>
        </View>

        <Pressable
          testID="despensa-profile-avatar"
          accessibilityRole="button"
          accessibilityLabel={t('pantry.profileLabel')}
          accessibilityHint={t('pantry.profileHint')}
          onPress={() => router.push('/(tabs)/perfil')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => [
            styles.avatarButton,
            pressed && styles.avatarPressed,
          ]}
        >
          <MaterialCommunityIcons name="account-outline" size={20} color={colors.onPrimary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 2. Resumen del inventario (solo cuando hay alimentos) */}
        {!isLoading && ingredients.length > 0 && (
          <View style={styles.overviewRow} testID="pantry-overview">
            <View style={styles.overviewTile}>
              <View style={[styles.overviewIcon, { backgroundColor: colors.primaryFixed }]}>
                <MaterialCommunityIcons name="fridge-outline" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.overviewValue, typography.headlineMd]}>
                {summary.totalCount}
              </Text>
              <Text style={[styles.overviewLabel, typography.labelSm]}>
                {tp('pantry.overviewFoods', summary.totalCount)}
              </Text>
            </View>
            <View style={styles.overviewTile}>
              <View style={[styles.overviewIcon, { backgroundColor: colors.secondaryFixed }]}>
                <MaterialCommunityIcons
                  name="clock-alert-outline"
                  size={18}
                  color={colors.onSecondaryFixed}
                />
              </View>
              <Text style={[styles.overviewValue, typography.headlineMd]}>
                {summary.urgentCount}
              </Text>
              <Text style={[styles.overviewLabel, typography.labelSm]}>{t('pantry.overviewExpiring')}</Text>
            </View>
            <View style={styles.overviewTile}>
              <View style={[styles.overviewIcon, { backgroundColor: colors.tertiaryFixed }]}>
                <MaterialCommunityIcons
                  name="tag-outline"
                  size={18}
                  color={colors.onTertiaryFixed}
                />
              </View>
              <Text style={[styles.overviewValue, typography.headlineMd]}>
                {activeCategoriesCount}
              </Text>
              <Text style={[styles.overviewLabel, typography.labelSm]}>
                {tp('pantry.overviewCategories', activeCategoriesCount)}
              </Text>
            </View>
          </View>
        )}

        {/* 3. Barra de búsqueda y botones rápidos (Stitch 6) */}
        <View style={styles.topActionsContainer}>
          <Input
            testID="pantry-search-input"
            placeholder={t('pantry.searchPlaceholder')}
            value={searchQuery}
            onChangeText={setSearchQuery}
            containerStyle={styles.searchContainer}
            leftIcon={
              <MaterialCommunityIcons name="magnify" size={20} color={colors.outline} />
            }
            rightIcon={
              searchQuery ? (
                <Pressable
                  testID="clear-search-button"
                  onPress={() => setSearchQuery('')}
                  accessibilityRole="button"
                  accessibilityLabel={t('pantry.clearSearch')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialCommunityIcons name="close-circle" size={18} color={colors.outline} />
                </Pressable>
              ) : undefined
            }
            accessibilityLabel={t('pantry.searchLabel')}
          />

          <View style={styles.actionButtonsRow}>
            <Button
              testID="pantry-add-ingredient-button"
              title={t('pantry.add')}
              variant="primary"
              size="md"
              style={styles.actionButton}
              onPress={handleOpenAddModal}
              leftIcon={
                <MaterialCommunityIcons name="plus" size={20} color={colors.onPrimary} />
              }
              accessibilityLabel={t('pantry.addLabel')}
            />

            <Button
              testID="pantry-scan-placeholder-button"
              title={t('pantry.scan')}
              variant="outline"
              size="md"
              style={styles.actionButton}
              onPress={() => router.push('/escaner' as any)}
              leftIcon={
                <MaterialCommunityIcons
                  name="camera-outline"
                  size={20}
                  color={colors.primary}
                />
              }
              accessibilityLabel={t('pantry.scanLabel')}
            />
          </View>
        </View>

        {/* 4. Estado de error de almacenamiento */}
        {localizedStorageError && (
          <Card variant="outlined" style={styles.errorCard}>
            <View style={styles.errorRow}>
              <MaterialCommunityIcons name="alert-circle-outline" size={24} color={colors.error} />
              <View style={styles.errorTextCol}>
                <Text style={[styles.errorTitle, typography.labelMd]}>
                  {t('pantry.storageErrorTitle')}
                </Text>
                <Text style={[styles.errorDesc, typography.bodySm]}>
                  {localizedStorageError}
                </Text>
              </View>
            </View>
            <View style={styles.errorActions}>
              <Button
                testID="pantry-retry-button"
                title={t('common.retry')}
                variant="outline"
                size="sm"
                onPress={refresh}
              />
              <Button
                testID="pantry-dismiss-error-button"
                title={t('pantry.dismiss')}
                variant="ghost"
                size="sm"
                onPress={clearStorageError}
              />
            </View>
          </Card>
        )}

        {/* 5. Estado de carga */}
        {isLoading ? (
          <View
            style={styles.loadingContainer}
            testID="pantry-loading-state"
            accessibilityRole="progressbar"
            accessibilityLabel={t('pantry.loading')}
          >
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, typography.bodyMd]}>
              {t('pantry.loading')}
            </Text>
          </View>
        ) : ingredients.length === 0 ? (
          /* 6. Estado de despensa vacía */
          <Card
            variant="elevated"
            style={styles.emptyCard}
            testID="pantry-empty-state"
          >
            <View style={styles.emptyIconCircle}>
              <MaterialCommunityIcons name="fridge-outline" size={38} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, typography.headlineMd]}>
              {t('pantry.emptyTitle')}
            </Text>
            <Text style={[styles.emptyDesc, typography.bodyMd]}>
              {t('pantry.emptyDesc')}
            </Text>

            <View style={styles.emptyAction}>
              <Button
                testID="empty-state-add-button"
                title={t('pantry.addFirst')}
                variant="primary"
                size="lg"
                fullWidth
                onPress={handleOpenAddModal}
                leftIcon={
                  <MaterialCommunityIcons name="plus-circle-outline" size={20} color={colors.onPrimary} />
                }
              />
            </View>
          </Card>
        ) : filteredIngredients.length === 0 ? (
          /* Estado cuando la búsqueda no produce resultados */
          <Card variant="outlined" style={styles.emptyCard} testID="pantry-no-search-results">
            <View style={[styles.emptyIconCircle, styles.emptyIconCircleMuted]}>
              <MaterialCommunityIcons name="magnify-close" size={34} color={colors.outline} />
            </View>
            <Text style={[styles.emptyTitle, typography.headlineMd]}>
              {t('pantry.noResultsTitle', { query: searchQuery })}
            </Text>
            <Text style={[styles.emptyDesc, typography.bodySm]}>
              {t('pantry.noResultsDesc')}
            </Text>
            <Button
              testID="clear-search-filter-button"
              title={t('pantry.showAll')}
              variant="outline"
              size="sm"
              onPress={() => setSearchQuery('')}
            />
          </Card>
        ) : (
          /* 7. Listados de alimentos */
          <View style={styles.listContainer}>
            {/* Sección 7A: Prioridad para cocinar hoy (Urgentes) */}
            {urgentFiltered.length > 0 && (
              <View style={styles.sectionContainer} testID="pantry-urgent-section">
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionTitleRow}>
                    <View style={[styles.sectionIcon, { backgroundColor: colors.secondaryFixed }]}>
                      <MaterialCommunityIcons name="fire" size={16} color={colors.onSecondaryFixed} />
                    </View>
                    <Text
                      style={[styles.sectionTitle, typography.labelLg]}
                      accessibilityRole="header"
                    >
                      {t('pantry.urgentTitle')}
                    </Text>
                  </View>
                  <View style={styles.urgentCountBadge}>
                    <Text style={[styles.urgentCountText, typography.labelSm]}>
                      {tp('pantry.criticalCount', urgentFiltered.length)}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardsStack}>
                  {urgentFiltered.map((ingredient) => (
                    <IngredientCard
                      key={ingredient.id}
                      ingredient={ingredient}
                      onEdit={handleOpenEditModal}
                      onDelete={handleDeleteRequest}
                      onAdjustQuantity={adjustQuantity}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* Sección 7B: Sugerencia de ahorro (Tarjeta Stitch 6) */}
            <Card variant="elevated" style={styles.savingsCard}>
              <View style={styles.savingsDecorationPill} />
              <View style={styles.savingsContent}>
                <View style={styles.savingsIconBox}>
                  <MaterialCommunityIcons
                    name="piggy-bank-outline"
                    size={24}
                    color={colors.onTertiaryContainer}
                  />
                </View>
                <View style={styles.savingsTextCol}>
                  <Text style={[styles.savingsBadge, typography.labelSm]}>
                    {t('pantry.savingsBadge')}
                  </Text>
                  <Text style={[styles.savingsDesc, typography.bodyMd]}>
                    {tp('pantry.savingsDesc', ingredients.length)}
                  </Text>
                </View>
              </View>

              <Pressable
                testID="savings-cook-button"
                style={({ pressed }) => [
                  styles.savingsCtaButton,
                  pressed && styles.savingsCtaPressed,
                ]}
                onPress={() => setCookSuggestionVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={t('pantry.whatToCook')}
              >
                <View style={styles.savingsCtaLeft}>
                  <MaterialCommunityIcons name="silverware-fork-knife" size={18} color={colors.onPrimary} />
                  <Text style={[styles.savingsCtaText, typography.labelLg]}>
                    {t('pantry.whatToCook')}
                  </Text>
                </View>
                <MaterialCommunityIcons name="arrow-right" size={18} color={colors.onPrimary} />
              </Pressable>
            </Card>

            {/* Sección 7C: Alimentos en despensa */}
            <View style={styles.sectionContainer} testID="pantry-regular-section">
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleRow}>
                  <View style={[styles.sectionIcon, { backgroundColor: colors.primaryFixed }]}>
                    <MaterialCommunityIcons name="basket-outline" size={16} color={colors.primary} />
                  </View>
                  <Text
                    style={[styles.sectionTitle, typography.labelLg]}
                    accessibilityRole="header"
                  >
                    {t('pantry.regularTitle')}
                  </Text>
                </View>
                <View style={styles.itemsCountBadge}>
                  <Text style={[styles.itemsCountLabel, typography.labelSm]}>
                    {tp('pantry.itemsCount', regularFiltered.length)}
                  </Text>
                </View>
              </View>

              <View style={styles.cardsStack}>
                {regularFiltered.map((ingredient) => (
                  <IngredientCard
                    key={ingredient.id}
                    ingredient={ingredient}
                    onEdit={handleOpenEditModal}
                    onDelete={handleDeleteRequest}
                    onAdjustQuantity={adjustQuantity}
                  />
                ))}
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Modal de formulario para agregar / editar */}
      <IngredientFormModal
        visible={formModalVisible}
        initialIngredient={editingIngredient}
        onClose={() => {
          setFormModalVisible(false);
          setEditingIngredient(null);
        }}
        onSave={handleSaveIngredient}
        onDeleteRequest={handleDeleteRequest}
      />

      {/* Modal accesible de confirmación para eliminar */}
      <DeleteConfirmationModal
        visible={Boolean(deletingIngredient)}
        ingredient={deletingIngredient}
        onCancel={() => setDeletingIngredient(null)}
        onConfirm={handleConfirmDelete}
      />

      {/* Modal informativo para sugerencia culinaria */}
      {cookSuggestionVisible && (
        <View style={[StyleSheet.absoluteFill, styles.dialogBackdrop]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setCookSuggestionVisible(false)}
            accessibilityLabel={t('pantry.closeSuggestion')}
          />
          <View style={styles.dialogCard}>
            <View style={styles.dialogIconBox}>
              <MaterialCommunityIcons name="chef-hat" size={30} color={colors.primary} />
            </View>
            <Text style={[styles.dialogTitle, typography.headlineMd]}>
              {t('pantry.whatToCook')}
            </Text>
            <Text style={[styles.dialogDesc, typography.bodyMd]}>
              {t('pantry.suggestionDesc', { count: ingredients.length })}
            </Text>
            <View style={styles.dialogActions}>
              <Button
                testID="pantry-discover-recipes-button"
                title={t('pantry.discoverRecipes')}
                variant="primary"
                size="md"
                fullWidth
                onPress={() => {
                  setCookSuggestionVisible(false);
                  router.push('/recetas' as any);
                }}
                leftIcon={<MaterialCommunityIcons name="silverware-fork-knife" size={18} color={colors.onPrimary} />}
              />
              <Button
                testID="close-cook-suggestion-button"
                title={t('pantry.backToPantry')}
                variant="outline"
                size="md"
                fullWidth
                onPress={() => setCookSuggestionVisible(false)}
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
      flex: 1,
      minWidth: 0,
      gap: spacing.sm,
    },
    logoImage: {
      width: 32,
      height: 32,
    },
    headerTextCol: {
      flex: 1,
      minWidth: 0,
    },
    headerSubtext: {
      color: colors.outline,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    headerTitle: {
      color: colors.textPrimary,
      fontWeight: '700',
    },
    avatarButton: {
      width: 38,
      height: 38,
      borderRadius: radius.full,
      backgroundColor: colors.primaryAction,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarPressed: {
      opacity: 0.7,
    },
    scrollContent: {
      padding: spacing.margin,
      paddingBottom: spacing.xxl + 20,
      gap: spacing.md,
    },
    overviewRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    overviewTile: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderLight,
      paddingVertical: spacing.sm + 4,
      paddingHorizontal: spacing.sm + 4,
      gap: 2,
    },
    overviewIcon: {
      width: 32,
      height: 32,
      borderRadius: radius.md + 2,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xs,
    },
    overviewValue: {
      color: colors.textPrimary,
      fontWeight: '700',
    },
    overviewLabel: {
      color: colors.textSecondary,
    },
    topActionsContainer: {
      gap: spacing.sm,
    },
    searchContainer: {
      marginBottom: 0,
    },
    actionButtonsRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    actionButton: {
      flex: 1,
      paddingHorizontal: spacing.sm,
    },
    errorCard: {
      backgroundColor: colors.errorContainer,
      borderColor: colors.error,
      padding: spacing.md,
      gap: spacing.sm,
    },
    errorRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
    },
    errorTextCol: {
      flex: 1,
    },
    errorTitle: {
      color: colors.error,
      fontWeight: '700',
    },
    errorDesc: {
      color: colors.textPrimary,
      lineHeight: 18,
    },
    errorActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.xs,
    },
    loadingContainer: {
      padding: spacing.xl,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    loadingText: {
      color: colors.textSecondary,
    },
    emptyCard: {
      backgroundColor: colors.surface,
      padding: spacing.lg,
      alignItems: 'center',
      gap: spacing.sm,
      borderRadius: radius.xl,
    },
    emptyIconCircle: {
      width: 76,
      height: 76,
      borderRadius: radius.full,
      backgroundColor: colors.primaryFixed,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xs,
    },
    emptyIconCircleMuted: {
      backgroundColor: colors.surfaceContainer,
    },
    emptyTitle: {
      color: colors.textPrimary,
      fontWeight: '700',
      textAlign: 'center',
    },
    emptyDesc: {
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 22,
      maxWidth: 320,
    },
    emptyAction: {
      width: '100%',
      marginTop: spacing.sm,
    },
    listContainer: {
      gap: spacing.lg,
    },
    sectionContainer: {
      gap: spacing.sm + 4,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flex: 1,
      minWidth: 0,
    },
    sectionIcon: {
      width: 28,
      height: 28,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionTitle: {
      flexShrink: 1,
      color: colors.textPrimary,
      fontWeight: '700',
      fontSize: 16,
      lineHeight: 22,
    },
    urgentCountBadge: {
      backgroundColor: colors.secondaryFixed,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: 3,
      borderRadius: radius.full,
    },
    urgentCountText: {
      color: colors.onSecondaryFixed,
      fontWeight: '700',
    },
    itemsCountBadge: {
      backgroundColor: colors.surfaceContainer,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: 3,
      borderRadius: radius.full,
    },
    itemsCountLabel: {
      color: colors.textSecondary,
      fontWeight: '700',
    },
    cardsStack: {
      gap: spacing.sm,
    },
    savingsCard: {
      position: 'relative',
      overflow: 'hidden',
      backgroundColor: colors.surface,
      padding: spacing.md,
      borderRadius: radius.xl,
      gap: spacing.md,
    },
    savingsDecorationPill: {
      position: 'absolute',
      top: -32,
      right: -32,
      width: 120,
      height: 120,
      borderRadius: radius.full,
      backgroundColor: colors.tertiaryFixed,
      opacity: 0.5,
    },
    savingsContent: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm + 4,
    },
    savingsIconBox: {
      width: 46,
      height: 46,
      borderRadius: radius.md + 6,
      backgroundColor: colors.tertiaryFixed,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    savingsTextCol: {
      flex: 1,
      gap: 4,
    },
    savingsBadge: {
      color: colors.onTertiaryContainer,
      fontWeight: '700',
      letterSpacing: 0.6,
    },
    savingsDesc: {
      color: colors.textPrimary,
      lineHeight: 20,
    },
    savingsCtaButton: {
      minHeight: 52,
      borderRadius: radius.md + 6,
      ...getAppSurfaces(colors).cta,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      elevation: 2,
      shadowColor: colors.primaryAction,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.22,
      shadowRadius: 10,
    },
    savingsCtaPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.99 }],
    },
    savingsCtaLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    savingsCtaText: {
      color: colors.onPrimary,
      fontWeight: '700',
    },
    dialogBackdrop: {
      flex: 1,
      backgroundColor: colors.backdrop,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.margin,
    },
    dialogCard: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      padding: spacing.lg,
      alignItems: 'center',
      gap: spacing.md,
      elevation: 8,
    },
    dialogIconBox: {
      width: 60,
      height: 60,
      borderRadius: radius.full,
      backgroundColor: colors.primaryFixed,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dialogTitle: {
      color: colors.textPrimary,
      fontWeight: '700',
      textAlign: 'center',
    },
    dialogDesc: {
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
    dialogActions: {
      width: '100%',
      gap: spacing.sm,
    },
  });
