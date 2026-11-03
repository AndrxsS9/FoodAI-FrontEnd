/**
 * FoodAI - Tarjeta interactiva de revisión y edición para ingredientes detectados (Fase 3B & Fase 6B.2).
 * Permite corregir nombre, asignar cantidad requerida, seleccionar unidad/categoría,
 * excluir ingredientes o resolver duplicados existentes en la despensa.
 */
import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import {
  CATEGORY_CONFIG,
  INGREDIENT_CATEGORIES,
  INGREDIENT_UNITS,
  INGREDIENT_UNIT_LABELS,
  INGREDIENT_UNIT_NAMES,
  IngredientCategory,
  IngredientUnit,
} from '../../types/pantry';
import {
  ScannedIngredientAction,
  ScannedIngredientItem,
} from '../../types/scanner';
import { areUnitsCompatibleForAddition } from '../../utils/ingredientMapper';
import {
  AppColors,
  radius,
  spacing,
  useTypography,
  useAppTheme,
  useThemeStyles,
} from '../../theme';

/** Área táctil mínima cómoda para controles interactivos (44 pt / dp). */
export const MIN_TOUCH_TARGET = 44;

export interface DetectedIngredientCardProps {
  item: ScannedIngredientItem;
  onToggleSelect: (id: string) => void;
  onChangeName: (id: string, name: string) => void;
  onChangeQuantity: (id: string, quantity: number | null) => void;
  onChangeUnit: (id: string, unit: IngredientUnit) => void;
  onChangeCategory: (id: string, category: IngredientCategory) => void;
  onChangeAction: (id: string, action: ScannedIngredientAction) => void;
  onRemove: (id: string) => void;
}

export function DetectedIngredientCard({
  item,
  onToggleSelect,
  onChangeName,
  onChangeQuantity,
  onChangeUnit,
  onChangeCategory,
  onChangeAction,
  onRemove,
}: DetectedIngredientCardProps) {
  const typography = useTypography();
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [quantityInput, setQuantityInput] = useState(
    item.quantity !== null ? String(item.quantity) : ''
  );

  const categoryCfg = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG['Otros'];
  const isCompatibleWithDuplicate = item.duplicateMatch
    ? areUnitsCompatibleForAddition(item.duplicateMatch.unit, item.unit)
    : true;
  const hasQuantityError =
    item.isSelected &&
    (item.quantity === null ||
      typeof item.quantity !== 'number' ||
      item.quantity <= 0 ||
      isNaN(item.quantity));
  const isPossibleDuplicate = item.duplicateMatch?.matchType === 'possible';
  // Tono cálido del tema (legible en claro y oscuro) para avisos de revisión y posibles duplicados
  const warningTone = colors.demoBadgeText;

  const handleQuantityTextChange = (text: string) => {
    setQuantityInput(text);
    const sanitized = text.replace(',', '.').trim();
    if (!sanitized) {
      onChangeQuantity(item.id, null);
      return;
    }
    const parsed = parseFloat(sanitized);
    if (!isNaN(parsed) && parsed > 0 && isFinite(parsed)) {
      onChangeQuantity(item.id, parsed);
    } else {
      onChangeQuantity(item.id, null);
    }
  };

  return (
    <View
      style={[
        styles.cardContainer,
        !item.isSelected && styles.cardContainerDeselected,
        hasQuantityError && styles.cardContainerError,
      ]}
      testID={`detected-card-${item.id}`}
    >
      {/* Header: Checkbox, Name, Status Badge, Remove Action */}
      <View style={styles.headerRow}>
        <Pressable
          testID={`detected-checkbox-${item.id}`}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.isSelected }}
          accessibilityLabel={`Seleccionar ingrediente ${item.name}`}
          onPress={() => onToggleSelect(item.id)}
          style={styles.checkboxTouchArea}
        >
          <View style={[styles.checkbox, item.isSelected && styles.checkboxActive]}>
            {item.isSelected && (
              <MaterialIcons name="check" size={16} color={colors.onPrimary} />
            )}
          </View>
        </Pressable>

        <View style={styles.nameContainer}>
          <TextInput
            testID={`detected-name-input-${item.id}`}
            style={[styles.nameInput, typography.headlineMd]}
            value={item.name}
            onChangeText={(val) => onChangeName(item.id, val)}
            placeholder="Nombre del alimento"
            placeholderTextColor={colors.outline}
            accessibilityLabel="Nombre del ingrediente detectado"
          />
        </View>

        <Pressable
          testID={`detected-remove-${item.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Excluir ${item.name}`}
          onPress={() => onRemove(item.id)}
          style={styles.removeButton}
        >
          <MaterialIcons name="delete-outline" size={22} color={colors.outline} />
        </Pressable>
      </View>

      {/* Badges Row: Needs review notice & Category badge */}
      <View style={styles.badgesRow}>
        <View
          style={[
            styles.categoryPill,
            { backgroundColor: categoryCfg.bgColor },
          ]}
        >
          <MaterialIcons
            name={categoryCfg.icon as any}
            size={14}
            color={categoryCfg.color}
          />
          <Text
            style={[
              styles.categoryPillText,
              typography.labelSm,
              { color: categoryCfg.color },
            ]}
          >
            {item.category}
          </Text>
        </View>

        {item.needsReview && (
          <View style={styles.reviewBadge} testID={`detected-review-badge-${item.id}`}>
            <MaterialIcons name="help-outline" size={14} color={warningTone} />
            <Text style={[styles.reviewBadgeText, typography.labelSm]}>
              {item.quantity === null ? 'Cantidad requerida' : 'Confirmar datos'}
            </Text>
          </View>
        )}

        {item.duplicateMatch && (
          <View
            style={[
              styles.duplicateBadge,
              isPossibleDuplicate && styles.duplicateBadgePossible,
            ]}
            testID={`detected-duplicate-badge-${item.id}`}
          >
            <MaterialIcons
              name={isPossibleDuplicate ? 'help-outline' : 'sync'}
              size={14}
              color={isPossibleDuplicate ? warningTone : colors.primary}
            />
            <Text
              style={[
                styles.duplicateBadgeText,
                typography.labelSm,
                isPossibleDuplicate && { color: warningTone },
              ]}
            >
              {isPossibleDuplicate ? '¿En despensa?' : 'En despensa'}
            </Text>
          </View>
        )}
      </View>

      {/* Sección de cantidad: etiqueta legible en una línea, estado y campo a lo ancho */}
      <View style={styles.fieldSection} testID={`detected-quantity-section-${item.id}`}>
        <View style={styles.fieldLabelRow}>
          <Text style={[styles.fieldLabel, typography.labelMd]}>Cantidad</Text>
          <Text
            testID={`detected-quantity-hint-${item.id}`}
            style={[
              styles.fieldHint,
              typography.labelSm,
              item.quantity === null && styles.fieldHintRequired,
            ]}
          >
            {item.quantity === null ? 'Obligatoria' : 'Estimada'}
          </Text>
        </View>
        <View
          style={[
            styles.quantityInputContainer,
            hasQuantityError && styles.quantityInputContainerError,
          ]}
        >
          <TextInput
            testID={`detected-quantity-input-${item.id}`}
            style={[styles.quantityInput, typography.bodyMd]}
            value={quantityInput}
            onChangeText={handleQuantityTextChange}
            placeholder="Ej. 2"
            placeholderTextColor={colors.outline}
            keyboardType="decimal-pad"
            accessibilityLabel={`Cantidad para ${item.name}`}
          />
          <Text
            testID={`detected-quantity-unit-suffix-${item.id}`}
            style={[styles.quantityUnitSuffix, typography.bodySm]}
            numberOfLines={1}
            importantForAccessibility="no"
          >
            {INGREDIENT_UNIT_NAMES[item.unit]}
          </Text>
        </View>
      </View>

      {/* Sección de unidad: opciones en cuadrícula adaptable, sin desplazamiento horizontal oculto */}
      <View style={styles.fieldSection} testID={`detected-unit-section-${item.id}`}>
        <Text style={[styles.fieldLabel, typography.labelMd]}>Unidad</Text>
        <View
          style={styles.unitOptionsWrap}
          testID={`detected-unit-options-${item.id}`}
          accessibilityRole="radiogroup"
          accessibilityLabel={`Unidad de medida para ${item.name}`}
        >
          {INGREDIENT_UNITS.map((u) => {
            const isSelected = item.unit === u;
            return (
              <Pressable
                key={u}
                testID={`detected-unit-${item.id}-${u}`}
                style={({ pressed }) => [
                  styles.unitChip,
                  isSelected && styles.unitChipSelected,
                  pressed && !isSelected && styles.unitChipPressed,
                ]}
                onPress={() => onChangeUnit(item.id, u)}
                accessibilityRole="button"
                accessibilityLabel={`Unidad ${INGREDIENT_UNIT_NAMES[u]}`}
                accessibilityState={{ selected: isSelected }}
              >
                {isSelected && (
                  <MaterialIcons name="check" size={14} color={colors.onPrimary} />
                )}
                <Text
                  style={[
                    styles.unitChipText,
                    typography.labelMd,
                    isSelected && styles.unitChipTextSelected,
                  ]}
                >
                  {INGREDIENT_UNIT_LABELS[u]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Error message when quantity is missing */}
      {hasQuantityError && (
        <View style={styles.errorNotice} testID={`detected-quantity-error-${item.id}`}>
          <MaterialIcons name="error" size={16} color={colors.error} />
          <Text style={[styles.errorNoticeText, typography.bodySm]}>
            Ingresa una cantidad mayor a 0 para poder guardar este alimento.
          </Text>
        </View>
      )}

      {/* Duplicate Resolution Section */}
      {item.duplicateMatch && (
        <View style={styles.duplicateSection} testID={`detected-duplicate-box-${item.id}`}>
          <View style={styles.duplicateInfoRow}>
            <MaterialIcons
              name={isPossibleDuplicate ? 'help-outline' : 'info-outline'}
              size={18}
              color={isPossibleDuplicate ? warningTone : colors.primary}
            />
            <Text style={[styles.duplicateText, typography.bodySm]}>
              {isPossibleDuplicate ? (
                <>
                  <Text style={{ fontWeight: '700', color: warningTone }}>Posible coincidencia: </Text>
                  Tienes{' '}
                  <Text style={{ fontWeight: '700' }}>
                    {item.duplicateMatch.currentQuantity}{' '}
                    {INGREDIENT_UNIT_LABELS[item.duplicateMatch.unit]}
                  </Text>{' '}
                  de «{item.duplicateMatch.name}» en tu despensa. ¿Deseas sumar o crear un nuevo ítem?
                </>
              ) : (
                <>
                  Tienes{' '}
                  <Text style={{ fontWeight: '700' }}>
                    {item.duplicateMatch.currentQuantity}{' '}
                    {INGREDIENT_UNIT_LABELS[item.duplicateMatch.unit]}
                  </Text>{' '}
                  de «{item.duplicateMatch.name}» actualmente en tu despensa.
                </>
              )}
            </Text>
          </View>

          {!isCompatibleWithDuplicate && (
            <View style={styles.incompatibleNotice} testID={`detected-incompatible-notice-${item.id}`}>
              <MaterialIcons name="info" size={14} color={warningTone} />
              <Text style={[styles.incompatibleNoticeText, typography.bodySm]}>
                Unidades no compatibles ({INGREDIENT_UNIT_LABELS[item.unit]} y {INGREDIENT_UNIT_LABELS[item.duplicateMatch.unit]}). No se pueden sumar directamente.
              </Text>
            </View>
          )}

          <View style={styles.actionButtonsRow}>
            <Pressable
              testID={`detected-action-add-${item.id}`}
              disabled={!isCompatibleWithDuplicate}
              style={[
                styles.actionOptionButton,
                item.action === 'add_to_existing' && styles.actionOptionButtonActive,
                !isCompatibleWithDuplicate && styles.actionOptionButtonDisabled,
              ]}
              onPress={() => {
                if (isCompatibleWithDuplicate) {
                  onChangeAction(item.id, 'add_to_existing');
                }
              }}
              accessibilityRole="radio"
              accessibilityState={{
                checked: item.action === 'add_to_existing',
                disabled: !isCompatibleWithDuplicate,
              }}
            >
              <MaterialIcons
                name="add-circle-outline"
                size={16}
                color={
                  !isCompatibleWithDuplicate
                    ? colors.outline
                    : item.action === 'add_to_existing'
                    ? colors.primary
                    : colors.textSecondary
                }
              />
              <Text
                style={[
                  styles.actionOptionText,
                  typography.labelSm,
                  !isCompatibleWithDuplicate && { color: colors.outline },
                  item.action === 'add_to_existing' &&
                    styles.actionOptionTextActive,
                ]}
              >
                Sumar a despensa
              </Text>
            </Pressable>

            <Pressable
              testID={`detected-action-create-${item.id}`}
              style={[
                styles.actionOptionButton,
                item.action === 'create' && styles.actionOptionButtonActive,
              ]}
              onPress={() => onChangeAction(item.id, 'create')}
              accessibilityRole="radio"
              accessibilityState={{ checked: item.action === 'create' }}
            >
              <MaterialIcons
                name="fiber-new"
                size={16}
                color={
                  item.action === 'create'
                    ? colors.primary
                    : colors.textSecondary
                }
              />
              <Text
                style={[
                  styles.actionOptionText,
                  typography.labelSm,
                  item.action === 'create' && styles.actionOptionTextActive,
                ]}
              >
                Crear nuevo ítem
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Expandable Category Customization */}
      <Pressable
        testID={`detected-category-toggle-${item.id}`}
        style={styles.expandDetailsButton}
        onPress={() => setIsEditingDetails(!isEditingDetails)}
        accessibilityRole="button"
        accessibilityLabel="Cambiar categoría de alimento"
        accessibilityState={{ expanded: isEditingDetails }}
      >
        <Text style={[styles.expandDetailsText, typography.labelSm]}>
          {isEditingDetails ? 'Ocultar categorías' : 'Cambiar categoría'}
        </Text>
        <MaterialIcons
          name={isEditingDetails ? 'expand-less' : 'expand-more'}
          size={18}
          color={colors.primary}
        />
      </Pressable>

      {isEditingDetails && (
        <View style={styles.categoryPickerContainer} testID={`detected-category-picker-${item.id}`}>
          <Text style={[styles.fieldLabel, typography.labelMd]}>Selecciona la categoría</Text>
          <View style={styles.categoryChipsWrap}>
            {INGREDIENT_CATEGORIES.map((cat) => {
              const isSelected = item.category === cat;
              const cfg = CATEGORY_CONFIG[cat];
              return (
                <Pressable
                  key={cat}
                  testID={`detected-category-${item.id}-${cat}`}
                  style={[
                    styles.categorySelectChip,
                    isSelected && {
                      backgroundColor: cfg.bgColor,
                      borderColor: cfg.color,
                    },
                  ]}
                  onPress={() => onChangeCategory(item.id, cat)}
                  accessibilityRole="button"
                  accessibilityLabel={`Categoría ${cat}`}
                  accessibilityState={{ selected: isSelected }}
                >
                  <MaterialIcons
                    name={cfg.icon as any}
                    size={14}
                    color={isSelected ? cfg.color : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.categorySelectChipText,
                      typography.labelSm,
                      isSelected && { color: cfg.color, fontWeight: '700' },
                    ]}
                  >
                    {cat}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    cardContainer: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.md,
      shadowColor: colors.cardShadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
    },
    cardContainerDeselected: {
      opacity: 0.5,
      backgroundColor: colors.surfaceContainerLow,
    },
    cardContainerError: {
      borderColor: colors.error,
      backgroundColor: colors.errorContainer,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginHorizontal: -spacing.xs,
    },
    checkboxTouchArea: {
      width: MIN_TOUCH_TARGET,
      height: MIN_TOUCH_TARGET,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: radius.sm,
      borderWidth: 2,
      borderColor: colors.outline,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    checkboxActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    nameContainer: {
      flex: 1,
      minWidth: 0,
    },
    nameInput: {
      color: colors.textPrimary,
      fontWeight: '700',
      minHeight: MIN_TOUCH_TARGET,
      paddingVertical: spacing.xs,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    removeButton: {
      width: MIN_TOUCH_TARGET,
      height: MIN_TOUCH_TARGET,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.full,
    },
    badgesRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      flexWrap: 'wrap',
    },
    categoryPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: radius.full,
    },
    categoryPillText: {
      fontWeight: '600',
    },
    reviewBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.demoBadgeBackground,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: radius.full,
    },
    reviewBadgeText: {
      color: colors.demoBadgeText,
      fontWeight: '600',
    },
    duplicateBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.surfaceContainerLow,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: radius.full,
    },
    duplicateBadgePossible: {
      backgroundColor: colors.surfaceContainer,
    },
    duplicateBadgeText: {
      color: colors.primary,
      fontWeight: '700',
    },
    fieldSection: {
      gap: spacing.xs,
    },
    fieldLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    fieldLabel: {
      color: colors.textSecondary,
    },
    fieldHint: {
      color: colors.textSecondary,
      backgroundColor: colors.surfaceContainer,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.full,
      overflow: 'hidden',
    },
    fieldHintRequired: {
      color: colors.error,
      backgroundColor: colors.errorContainer,
    },
    quantityInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 48,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceContainerLow,
      paddingHorizontal: spacing.md,
    },
    quantityInputContainerError: {
      borderColor: colors.error,
      backgroundColor: colors.errorContainer,
    },
    quantityInput: {
      flex: 1,
      minWidth: 0,
      minHeight: 46,
      paddingVertical: spacing.xs,
      color: colors.textPrimary,
      fontWeight: '600',
    },
    quantityUnitSuffix: {
      flexShrink: 1,
      maxWidth: '55%',
      color: colors.textSecondary,
      textAlign: 'right',
    },
    unitOptionsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    unitChip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      minWidth: 56,
      minHeight: MIN_TOUCH_TARGET,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceContainerLow,
    },
    unitChipSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    unitChipPressed: {
      backgroundColor: colors.surfaceContainerHigh,
    },
    unitChipText: {
      color: colors.textPrimary,
    },
    unitChipTextSelected: {
      color: colors.onPrimary,
      fontWeight: '700',
    },
    errorNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.errorContainer,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md,
      marginTop: -spacing.xs,
    },
    errorNoticeText: {
      color: colors.error,
      flex: 1,
    },
    duplicateSection: {
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: radius.md,
      padding: spacing.sm,
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    duplicateInfoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    duplicateText: {
      color: colors.textPrimary,
      flex: 1,
      lineHeight: 18,
    },
    actionButtonsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginTop: 4,
    },
    actionOptionButton: {
      flexGrow: 1,
      flexBasis: 140,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      minHeight: MIN_TOUCH_TARGET,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    actionOptionButtonActive: {
      borderColor: colors.primary,
      backgroundColor: colors.surfaceContainer,
    },
    actionOptionButtonDisabled: {
      opacity: 0.45,
      backgroundColor: colors.surfaceContainerLow,
    },
    actionOptionText: {
      color: colors.textSecondary,
      fontWeight: '600',
    },
    actionOptionTextActive: {
      color: colors.primary,
      fontWeight: '700',
    },
    incompatibleNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.surfaceContainer,
      padding: spacing.xs,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 4,
    },
    incompatibleNoticeText: {
      color: colors.textSecondary,
      flex: 1,
    },
    expandDetailsButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      minHeight: MIN_TOUCH_TARGET,
      borderTopWidth: 1,
      borderTopColor: colors.borderLight,
    },
    expandDetailsText: {
      color: colors.primary,
      fontWeight: '600',
    },
    categoryPickerContainer: {
      gap: spacing.sm,
    },
    categoryChipsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    categorySelectChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: MIN_TOUCH_TARGET,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceContainerLow,
    },
    categorySelectChipText: {
      color: colors.textPrimary,
    },
  });
