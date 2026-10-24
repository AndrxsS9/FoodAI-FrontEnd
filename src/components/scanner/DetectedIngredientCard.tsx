/**
 * FoodAI - Tarjeta interactiva de revisión y edición para ingredientes detectados (Fase 3B).
 * Permite corregir nombre, asignar cantidad requerida, seleccionar unidad/categoría,
 * excluir ingredientes o resolver duplicados existentes en la despensa.
 */
import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
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
  IngredientCategory,
  IngredientUnit,
} from '../../types/pantry';
import {
  ScannedIngredientAction,
  ScannedIngredientItem,
} from '../../types/scanner';
import { colors, radius, spacing, useTypography } from '../../theme';

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
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [quantityInput, setQuantityInput] = useState(
    item.quantity !== null ? String(item.quantity) : ''
  );

  const categoryCfg = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG['Otros'];
  const hasQuantityError =
    item.isSelected &&
    (item.quantity === null ||
      typeof item.quantity !== 'number' ||
      item.quantity <= 0 ||
      isNaN(item.quantity));

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
          style={[styles.checkbox, item.isSelected && styles.checkboxActive]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {item.isSelected && (
            <MaterialIcons name="check" size={16} color={colors.onPrimary} />
          )}
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
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
            <MaterialIcons name="help-outline" size={14} color="#8A5E00" />
            <Text style={[styles.reviewBadgeText, typography.labelSm]}>
              {item.quantity === null ? 'Cantidad requerida' : 'Confirmar datos'}
            </Text>
          </View>
        )}

        {item.duplicateMatch && (
          <View style={styles.duplicateBadge} testID={`detected-duplicate-badge-${item.id}`}>
            <MaterialIcons name="sync" size={14} color={colors.primary} />
            <Text style={[styles.duplicateBadgeText, typography.labelSm]}>
              En despensa
            </Text>
          </View>
        )}
      </View>

      {/* Quantity & Unit Row */}
      <View style={styles.quantityRow}>
        <View style={styles.quantityFieldGroup}>
          <Text style={[styles.fieldLabel, typography.labelSm]}>
            CANTIDAD {item.quantity === null ? '*' : '(ESTIMADA)'}
          </Text>
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
          </View>
        </View>

        <View style={styles.unitFieldGroup}>
          <Text style={[styles.fieldLabel, typography.labelSm]}>UNIDAD</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.unitScroll}
          >
            {INGREDIENT_UNITS.map((u) => {
              const isSelected = item.unit === u;
              return (
                <Pressable
                  key={u}
                  testID={`detected-unit-${item.id}-${u}`}
                  style={[
                    styles.unitChip,
                    isSelected && styles.unitChipSelected,
                  ]}
                  onPress={() => onChangeUnit(item.id, u)}
                  accessibilityRole="button"
                  accessibilityLabel={`Unidad ${INGREDIENT_UNIT_LABELS[u]}`}
                >
                  <Text
                    style={[
                      styles.unitChipText,
                      typography.labelSm,
                      isSelected && styles.unitChipTextSelected,
                    ]}
                  >
                    {INGREDIENT_UNIT_LABELS[u]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
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
            <MaterialIcons name="info-outline" size={18} color={colors.primary} />
            <Text style={[styles.duplicateText, typography.bodySm]}>
              Tienes{' '}
              <Text style={{ fontWeight: '700' }}>
                {item.duplicateMatch.currentQuantity}{' '}
                {INGREDIENT_UNIT_LABELS[item.duplicateMatch.unit]}
              </Text>{' '}
              de «{item.duplicateMatch.name}» actualmente en tu despensa.
            </Text>
          </View>

          <View style={styles.actionButtonsRow}>
            <Pressable
              testID={`detected-action-add-${item.id}`}
              style={[
                styles.actionOptionButton,
                item.action === 'add_to_existing' && styles.actionOptionButtonActive,
              ]}
              onPress={() => onChangeAction(item.id, 'add_to_existing')}
              accessibilityRole="radio"
              accessibilityState={{ checked: item.action === 'add_to_existing' }}
            >
              <MaterialIcons
                name="add-circle-outline"
                size={16}
                color={
                  item.action === 'add_to_existing'
                    ? colors.primary
                    : colors.textSecondary
                }
              />
              <Text
                style={[
                  styles.actionOptionText,
                  typography.labelSm,
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
        style={styles.expandDetailsButton}
        onPress={() => setIsEditingDetails(!isEditingDetails)}
        accessibilityRole="button"
        accessibilityLabel="Cambiar categoría de alimento"
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
          <Text style={[styles.fieldLabel, typography.labelSm]}>
            SELECCIONA LA CATEGORÍA:
          </Text>
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

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    shadowColor: '#000',
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
    backgroundColor: '#FFFDFD',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
  },
  nameInput: {
    color: colors.textPrimary,
    fontWeight: '700',
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  removeButton: {
    padding: 4,
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
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  categoryPillText: {
    fontWeight: '600',
  },
  reviewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFDF9B',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  reviewBadgeText: {
    color: '#6C5100',
    fontWeight: '600',
  },
  duplicateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(91, 75, 138, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  duplicateBadgeText: {
    color: colors.primary,
    fontWeight: '700',
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  quantityFieldGroup: {
    width: 110,
    gap: 4,
  },
  unitFieldGroup: {
    flex: 1,
    gap: 4,
    overflow: 'hidden',
  },
  fieldLabel: {
    color: colors.outline,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  quantityInputContainer: {
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerLow,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  quantityInputContainerError: {
    borderColor: colors.error,
    backgroundColor: '#FFF0F0',
  },
  quantityInput: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  unitScroll: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: 2,
  },
  unitChip: {
    paddingHorizontal: 10,
    height: 36,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  unitChipText: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  unitChipTextSelected: {
    color: colors.onPrimary,
  },
  errorNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: '#FFF0F0',
    padding: spacing.xs,
    borderRadius: radius.sm,
  },
  errorNoticeText: {
    color: colors.error,
    flex: 1,
  },
  duplicateSection: {
    backgroundColor: 'rgba(91, 75, 138, 0.05)',
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(91, 75, 138, 0.15)',
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
    gap: spacing.xs,
    marginTop: 4,
  },
  actionOptionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionOptionButtonActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(91, 75, 138, 0.08)',
  },
  actionOptionText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  actionOptionTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  expandDetailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  expandDetailsText: {
    color: colors.primary,
    fontWeight: '600',
  },
  categoryPickerContainer: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  categoryChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  categorySelectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceContainerLow,
  },
  categorySelectChipText: {
    color: colors.textPrimary,
  },
});
