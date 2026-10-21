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
import { MaterialIcons } from '@expo/vector-icons';
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
} from '../../src/components/pantry';
import { usePantry } from '../../src/context/PantryContext';
import { colors, radius, spacing, useTypography } from '../../src/theme';
import { CreateIngredientInput, Ingredient } from '../../src/types/pantry';

export default function DespensaScreen() {
  const typography = useTypography();
  const router = useRouter();

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

  // Estados de modales
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  const [deletingIngredient, setDeletingIngredient] = useState<Ingredient | null>(null);
  const [scannerNoticeVisible, setScannerNoticeVisible] = useState(false);
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
        item.category.toLowerCase().includes(query)
    );
  }, [ingredients, searchQuery]);

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

  // Handlers para registro y edición
  const handleOpenAddModal = () => {
    setEditingIngredient(null);
    setFormModalVisible(true);
  };

  const handleOpenEditModal = (ingredient: Ingredient) => {
    setEditingIngredient(ingredient);
    setFormModalVisible(true);
  };

  const handleSaveIngredient = async (data: CreateIngredientInput) => {
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
      await addIngredient(data);
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
      Alert.alert(
        'Error',
        'No se pudo eliminar el alimento. Por favor intenta nuevamente.'
      );
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
              Despensa
            </Text>
          </View>
        </View>

        <Pressable
          testID="despensa-profile-avatar"
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
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 2. Barra de búsqueda y botones rápidos (Stitch 6) */}
        <View style={styles.topActionsContainer}>
          <Input
            testID="pantry-search-input"
            placeholder="Buscar en mi despensa..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            leftIcon={
              <MaterialIcons name="search" size={20} color={colors.outline} />
            }
            rightIcon={
              searchQuery ? (
                <Pressable
                  testID="clear-search-button"
                  onPress={() => setSearchQuery('')}
                  accessibilityRole="button"
                  accessibilityLabel="Limpiar búsqueda"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons name="clear" size={18} color={colors.outline} />
                </Pressable>
              ) : undefined
            }
            accessibilityLabel="Buscar alimentos en la despensa"
          />

          <View style={styles.actionButtonsRow}>
            <View style={styles.actionButtonFlex}>
              <Button
                testID="pantry-add-ingredient-button"
                title="Agregar alimento"
                variant="primary"
                size="md"
                fullWidth
                onPress={handleOpenAddModal}
                leftIcon={
                  <MaterialIcons name="add" size={18} color={colors.onPrimary} />
                }
                accessibilityLabel="Agregar nuevo alimento a la despensa"
              />
            </View>

            <View style={styles.actionButtonFlex}>
              <Button
                testID="pantry-scan-placeholder-button"
                title="Escanear nuevos"
                variant="outline"
                size="md"
                fullWidth
                onPress={() => setScannerNoticeVisible(true)}
                leftIcon={
                  <MaterialIcons
                    name="photo-camera"
                    size={18}
                    color={colors.primary}
                  />
                }
                accessibilityLabel="Escanear nuevos alimentos con la cámara"
              />
            </View>
          </View>
        </View>

        {/* 3. Estado de error de almacenamiento */}
        {storageError && (
          <Card variant="outlined" style={styles.errorCard}>
            <View style={styles.errorRow}>
              <MaterialIcons name="error-outline" size={24} color={colors.error} />
              <View style={styles.errorTextCol}>
                <Text style={[styles.errorTitle, typography.labelMd]}>
                  Error de almacenamiento
                </Text>
                <Text style={[styles.errorDesc, typography.bodySm]}>
                  {storageError}
                </Text>
              </View>
            </View>
            <View style={styles.errorActions}>
              <Button
                testID="pantry-retry-button"
                title="Reintentar"
                variant="outline"
                size="sm"
                onPress={refresh}
              />
              <Button
                testID="pantry-dismiss-error-button"
                title="Descartar"
                variant="ghost"
                size="sm"
                onPress={clearStorageError}
              />
            </View>
          </Card>
        )}

        {/* 4. Estado de carga */}
        {isLoading ? (
          <View
            style={styles.loadingContainer}
            testID="pantry-loading-state"
            accessibilityRole="progressbar"
            accessibilityLabel="Cargando tu despensa..."
          >
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, typography.bodyMd]}>
              Cargando tu despensa...
            </Text>
          </View>
        ) : ingredients.length === 0 ? (
          /* 5. Estado de despensa vacía */
          <Card
            variant="elevated"
            style={styles.emptyCard}
            testID="pantry-empty-state"
          >
            <View style={styles.emptyIconCircle}>
              <MaterialIcons name="kitchen" size={40} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, typography.headlineMd]}>
              Tu despensa está vacía
            </Text>
            <Text style={[styles.emptyDesc, typography.bodyMd]}>
              Registra los ingredientes que tienes en tu cocina para recibir recetas
              optimizadas a tu despensa y ahorrar en tus compras.
            </Text>

            <View style={styles.emptyAction}>
              <Button
                testID="empty-state-add-button"
                title="Agregar mi primer alimento"
                variant="primary"
                size="lg"
                fullWidth
                onPress={handleOpenAddModal}
                leftIcon={
                  <MaterialIcons name="add-circle" size={20} color={colors.onPrimary} />
                }
              />
            </View>
          </Card>
        ) : filteredIngredients.length === 0 ? (
          /* Estado cuando la búsqueda no produce resultados */
          <Card variant="outlined" style={styles.emptyCard} testID="pantry-no-search-results">
            <MaterialIcons name="search-off" size={36} color={colors.outline} />
            <Text style={[styles.emptyTitle, typography.headlineMd]}>
              Sin resultados para «{searchQuery}»
            </Text>
            <Text style={[styles.emptyDesc, typography.bodySm]}>
              No encontramos alimentos que coincidan con tu búsqueda. Intenta con otro término o limpia el filtro.
            </Text>
            <Button
              testID="clear-search-filter-button"
              title="Ver todos los alimentos"
              variant="outline"
              size="sm"
              onPress={() => setSearchQuery('')}
            />
          </Card>
        ) : (
          /* 6. Listados de alimentos */
          <View style={styles.listContainer}>
            {/* Sección 6A: Prioridad para cocinar hoy (Urgentes) */}
            {urgentFiltered.length > 0 && (
              <View style={styles.sectionContainer} testID="pantry-urgent-section">
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionTitleRow}>
                    <View style={styles.urgentPulseDot} />
                    <Text
                      style={[styles.sectionTitle, typography.headlineMd]}
                      accessibilityRole="header"
                    >
                      Prioridad para cocinar hoy
                    </Text>
                  </View>
                  <View style={styles.urgentCountBadge}>
                    <Text style={[styles.urgentCountText, typography.labelSm]}>
                      {urgentFiltered.length} crítico{urgentFiltered.length === 1 ? '' : 's'}
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

            {/* Sección 6B: Sugerencia de ahorro (Tarjeta Stitch 6) */}
            <Card variant="elevated" style={styles.savingsCard}>
              <View style={styles.savingsDecorationPill} />
              <View style={styles.savingsContent}>
                <View style={styles.savingsIconBox}>
                  <MaterialIcons name="savings" size={24} color="#503B00" />
                </View>
                <View style={styles.savingsTextCol}>
                  <View style={styles.savingsHeaderRow}>
                    <Text style={[styles.savingsBadge, typography.labelSm]}>
                      SUGERENCIA DE AHORRO
                    </Text>
                    <View style={styles.savingsDot} />
                  </View>
                  <Text style={[styles.savingsDesc, typography.bodyMd]}>
                    Tienes {ingredients.length} alimento{ingredients.length === 1 ? '' : 's'} disponible{ingredients.length === 1 ? '' : 's'} para aprovechar antes de realizar compras innecesarias.
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
                accessibilityLabel="¿Qué cocinamos con esto?"
              >
                <View style={styles.savingsCtaLeft}>
                  <MaterialIcons name="restaurant-menu" size={20} color={colors.onPrimary} />
                  <Text style={[styles.savingsCtaText, typography.labelMd]}>
                    ¿Qué cocinamos con esto?
                  </Text>
                </View>
                <MaterialIcons name="arrow-forward" size={18} color={colors.onPrimary} />
              </Pressable>
            </Card>

            {/* Sección 6C: Alimentos en despensa */}
            <View style={styles.sectionContainer} testID="pantry-regular-section">
              <View style={styles.sectionHeaderRow}>
                <Text
                  style={[styles.sectionTitle, typography.headlineMd]}
                  accessibilityRole="header"
                >
                  Disponibles en alacena y nevera
                </Text>
                <Text style={[styles.itemsCountLabel, typography.labelSm]}>
                  {regularFiltered.length} ítem{regularFiltered.length === 1 ? '' : 's'}
                </Text>
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

      {/* Modal informativo para escáner (Fase 2B Arquitectura preparada) */}
      {scannerNoticeVisible && (
        <View style={[StyleSheet.absoluteFill, styles.dialogBackdrop]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setScannerNoticeVisible(false)}
            accessibilityLabel="Cerrar aviso"
          />
          <View style={styles.dialogCard}>
            <View style={styles.dialogIconBox}>
              <MaterialIcons name="photo-camera" size={32} color={colors.primary} />
            </View>
            <Text style={[styles.dialogTitle, typography.headlineMd]}>
              Escanear nuevos alimentos
            </Text>
            <Text style={[styles.dialogDesc, typography.bodyMd]}>
              La arquitectura del escáner visual con cámara y reconocimiento con inteligencia artificial está preparada para fases posteriores. En esta Fase 2B puedes gestionar todos tus ingredientes de forma manual con persistencia local garantizada.
            </Text>
            <Button
              testID="close-scanner-notice-button"
              title="Entendido"
              variant="primary"
              size="md"
              fullWidth
              onPress={() => setScannerNoticeVisible(false)}
            />
          </View>
        </View>
      )}

      {/* Modal informativo para sugerencia culinaria */}
      {cookSuggestionVisible && (
        <View style={[StyleSheet.absoluteFill, styles.dialogBackdrop]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setCookSuggestionVisible(false)}
            accessibilityLabel="Cerrar sugerencia"
          />
          <View style={styles.dialogCard}>
            <View style={styles.dialogIconBox}>
              <MaterialIcons name="restaurant" size={32} color={colors.primary} />
            </View>
            <Text style={[styles.dialogTitle, typography.headlineMd]}>
              ¿Qué cocinamos con esto?
            </Text>
            <Text style={[styles.dialogDesc, typography.bodyMd]}>
              El motor de recomendación inteligente cruzará tus {ingredients.length} alimentos con tu presupuesto para sugerirte el menú ideal en la siguiente fase de recetas.
            </Text>
            <Button
              testID="close-cook-suggestion-button"
              title="Volver a la despensa"
              variant="primary"
              size="md"
              fullWidth
              onPress={() => setCookSuggestionVisible(false)}
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant,
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
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
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
  topActionsContainer: {
    gap: spacing.sm,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  actionButtonFlex: {
    flex: 1,
  },
  errorCard: {
    backgroundColor: '#FFF0F0',
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
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
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
    gap: spacing.xs,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  urgentPulseDot: {
    width: 9,
    height: 9,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  urgentCountBadge: {
    backgroundColor: '#FFDAD3',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  urgentCountText: {
    color: '#802916',
    fontWeight: '700',
  },
  itemsCountLabel: {
    color: colors.outline,
    fontWeight: '600',
  },
  cardsStack: {
    gap: spacing.xs,
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
    top: -24,
    right: -24,
    width: 96,
    height: 96,
    borderRadius: radius.full,
    backgroundColor: colors.tertiary,
    opacity: 0.15,
  },
  savingsContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  savingsIconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    backgroundColor: '#FFDF9B',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  savingsTextCol: {
    flex: 1,
    gap: 2,
  },
  savingsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  savingsBadge: {
    color: '#503B00',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  savingsDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: '#503B00',
  },
  savingsDesc: {
    color: colors.textPrimary,
    lineHeight: 20,
  },
  savingsCtaButton: {
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    elevation: 2,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  savingsCtaPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  savingsCtaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  savingsCtaText: {
    color: colors.onPrimary,
    fontWeight: '700',
  },
  dialogBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(37, 43, 58, 0.65)',
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
    backgroundColor: colors.surfaceContainerLow,
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
});
