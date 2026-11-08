/**
 * FoodAI - Tarjeta interactiva de revisión y edición para ingredientes detectados (Fase 3B & Fase 6B.2).
 * Permite corregir nombre, asignar cantidad requerida, seleccionar unidad/categoría,
 * excluir ingredientes o resolver duplicados existentes en la despensa.
 */
import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
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
  darkColors,
  radius,
  spacing,
  useTypography,
  useAppTheme,
  useThemeStyles,
} from '../../theme';
import { getCategoryVisual } from '../pantry/categoryVisuals';

/** Área táctil mínima cómoda para controles interactivos (44 pt / dp). */
export const MIN_TOUCH_TARGET = 44;

/**
 * Superficies de la revisión del escáner. En oscuro siguen la referencia aprobada (púrpura profundo);
 * en claro se apoyan en los tokens del tema. `backgroundImage` es una mejora progresiva: donde el
 * degradado no se pinte queda el color sólido de `cardBackground`.
 */
export const getScannerPalette = (colors: AppColors) => {
  const isDark = colors === darkColors;
  return {
    isDark,
    canvasGradient: isDark
      ? { backgroundImage: 'linear-gradient(180deg, #2A1F49 0%, #17131F 26%, #131217 55%)' }
      : {},
    cardBackground: isDark ? '#231B38' : colors.surface,
    cardGradient: isDark
      ? { backgroundImage: 'linear-gradient(155deg, #2E2350 0%, #1E1830 62%, #1A1529 100%)' }
      : {},
    cardBorder: isDark ? '#46386F' : colors.primaryFixed,
    divider: isDark ? '#3A2E5C' : colors.borderLight,
    fieldBackground: isDark ? '#171225' : colors.canvas,
    fieldBorder: isDark ? '#7561B0' : colors.primaryContainer,
    controlBorder: isDark ? '#55467F' : colors.outlineVariant,
    accent: isDark ? '#CDB6FF' : colors.primary,
    selected: isDark ? '#BFA2F2' : colors.primaryAction,
    hintBackground: isDark ? '#3A2C60' : colors.primaryFixed,
    hintText: isDark ? '#D9CCFF' : colors.onPrimaryFixed,
    cta: isDark ? '#B99AF0' : colors.primaryAction,
    ctaGradient: isDark
      ? { backgroundImage: 'linear-gradient(180deg, #CDB0F7 0%, #AE8BE8 100%)' }
      : { backgroundImage: 'linear-gradient(180deg, #5B4B8A 0%, #433371 100%)' },
  };
};

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
  const { colors, activeColorScheme } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const palette = getScannerPalette(colors);
  const { width: windowWidth, fontScale } = useWindowDimensions();
  // En pantallas estrechas o con fuente grande el ancho se reserva para que el nombre siga legible
  const showCategoryTile = windowWidth >= 340 && fontScale <= 1.3;
  const [nameContentHeight, setNameContentHeight] = useState<number | null>(null);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [quantityInput, setQuantityInput] = useState(
    item.quantity !== null ? String(item.quantity) : ''
  );

  // Como en la referencia, el mosaico y la insignia usan el tono claro de la categoría en ambos temas
  const categoryVisual = getCategoryVisual(item.category, 'light');
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
      {/* Encabezado: selección, mosaico de categoría, nombre editable con insignias y exclusión */}
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
              <MaterialCommunityIcons name="check" size={16} color={colors.onPrimary} />
            )}
          </View>
        </Pressable>

        {showCategoryTile && (
          <View
            testID={`detected-category-tile-${item.id}`}
            style={[styles.categoryTile, { backgroundColor: categoryVisual.bgColor }]}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            <MaterialCommunityIcons name={categoryVisual.icon} size={28} color={categoryVisual.color} />
          </View>
        )}

        <View style={styles.nameContainer}>
          {/* Multilínea: un nombre largo envuelve en vez de recortarse; sigue siendo un solo renglón lógico */}
          <TextInput
            testID={`detected-name-input-${item.id}`}
            style={[
              typography.bodyLg,
              styles.nameInput,
              Platform.OS === 'web' && nameContentHeight !== null && { height: nameContentHeight },
            ]}
            value={item.name}
            onChangeText={(val) => onChangeName(item.id, val.replace(/[\r\n]+/g, ' '))}
            onContentSizeChange={
              Platform.OS === 'web'
                ? (event) => setNameContentHeight(event.nativeEvent.contentSize.height)
                : undefined
            }
            placeholder="Nombre del alimento"
            placeholderTextColor={colors.outline}
            accessibilityLabel="Nombre del ingrediente detectado"
            multiline
            scrollEnabled={false}
            submitBehavior="blurAndSubmit"
            returnKeyType="done"
            {...(Platform.OS === 'web' ? { rows: 1 } : null)}
          />

          {/* Insignias: categoría, revisión pendiente y coincidencia en despensa */}
          <View style={styles.badgesRow}>
            <View style={[styles.badge, { backgroundColor: categoryVisual.bgColor }]}>
              <MaterialCommunityIcons
                name={categoryVisual.icon}
                size={14}
                color={categoryVisual.color}
              />
              <Text
                style={[
                  styles.badgeText,
                  typography.labelSm,
                  { color: categoryVisual.color },
                ]}
              >
                {item.category}
              </Text>
            </View>

            {item.needsReview && (
              <View
                style={[styles.badge, styles.reviewBadge]}
                testID={`detected-review-badge-${item.id}`}
              >
                <MaterialCommunityIcons name="help-circle-outline" size={14} color={warningTone} />
                <Text style={[styles.badgeText, typography.labelSm, styles.reviewBadgeText]}>
                  {item.quantity === null ? 'Cantidad requerida' : 'Confirmar datos'}
                </Text>
              </View>
            )}

            {item.duplicateMatch && (
              <View
                style={[
                  styles.badge,
                  styles.duplicateBadge,
                  isPossibleDuplicate && styles.duplicateBadgePossible,
                ]}
                testID={`detected-duplicate-badge-${item.id}`}
              >
                <MaterialCommunityIcons
                  name={isPossibleDuplicate ? 'help-circle-outline' : 'sync'}
                  size={14}
                  color={isPossibleDuplicate ? warningTone : colors.primary}
                />
                <Text
                  style={[
                    styles.badgeText,
                    typography.labelSm,
                    styles.duplicateBadgeText,
                    isPossibleDuplicate && { color: warningTone },
                  ]}
                >
                  {isPossibleDuplicate ? '¿En despensa?' : 'En despensa'}
                </Text>
              </View>
            )}
          </View>
        </View>

        <Pressable
          testID={`detected-remove-${item.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Excluir ${item.name}`}
          onPress={() => onRemove(item.id)}
          style={({ pressed }) => [styles.removeButton, pressed && styles.removeButtonPressed]}
        >
          <View style={styles.removeButtonFrame}>
            <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.textPrimary} />
          </View>
        </Pressable>
      </View>

      <View style={styles.headerDivider} />

      {/* Datos: cantidad y unidad */}
      <View style={styles.detailsPanel}>
        <View style={styles.fieldSection} testID={`detected-quantity-section-${item.id}`}>
          <View style={styles.fieldLabelRow}>
            <View style={styles.fieldLabelGroup}>
              <MaterialCommunityIcons name="weight" size={18} color={colors.textPrimary} />
              <Text style={[styles.fieldLabel, typography.labelLg]}>Cantidad</Text>
            </View>
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
              style={[typography.bodyLg, styles.quantityInput]}
              value={quantityInput}
              onChangeText={handleQuantityTextChange}
              placeholder="Ej. 2"
              placeholderTextColor={colors.outline}
              keyboardType="decimal-pad"
              accessibilityLabel={`Cantidad para ${item.name}`}
            />
            <View style={styles.quantityDivider} />
            <Text
              testID={`detected-quantity-unit-suffix-${item.id}`}
              style={[styles.quantityUnitSuffix, typography.bodyMd]}
              numberOfLines={1}
              importantForAccessibility="no"
            >
              {INGREDIENT_UNIT_NAMES[item.unit]}
            </Text>
          </View>
        </View>

        {/* Sección de unidad: opciones en cuadrícula adaptable, sin desplazamiento horizontal oculto */}
        <View style={styles.fieldSection} testID={`detected-unit-section-${item.id}`}>
          <View style={styles.fieldLabelGroup}>
            <MaterialCommunityIcons name="layers-outline" size={18} color={colors.textPrimary} />
            <Text style={[styles.fieldLabel, typography.labelLg]}>Unidad</Text>
          </View>
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
                    pressed && !isSelected && styles.unitChipPressed,
                  ]}
                  onPress={() => onChangeUnit(item.id, u)}
                  accessibilityRole="button"
                  accessibilityLabel={`Unidad ${INGREDIENT_UNIT_NAMES[u]}`}
                  accessibilityState={{ selected: isSelected }}
                >
                  {/* El área táctil mide 44 dp; la píldora visible es más compacta, como en la referencia */}
                  <View style={[styles.unitChipPill, isSelected && styles.unitChipPillSelected]}>
                    {isSelected && (
                      <MaterialCommunityIcons name="check" size={14} color={colors.onPrimary} />
                    )}
                    <Text
                      style={[
                        styles.unitChipText,
                        typography.labelLg,
                        isSelected && styles.unitChipTextSelected,
                      ]}
                    >
                      {INGREDIENT_UNIT_LABELS[u]}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {/* Aviso cuando falta la cantidad */}
      {hasQuantityError && (
        <View style={styles.errorNotice} testID={`detected-quantity-error-${item.id}`}>
          <MaterialCommunityIcons name="alert-circle-outline" size={16} color={colors.error} />
          <Text style={[styles.errorNoticeText, typography.bodySm]}>
            Ingresa una cantidad mayor a 0 para poder guardar este alimento.
          </Text>
        </View>
      )}

      {/* Resolución de duplicados */}
      {item.duplicateMatch && (
        <View style={styles.duplicateSection} testID={`detected-duplicate-box-${item.id}`}>
          <View style={styles.duplicateInfoRow}>
            <MaterialCommunityIcons
              name={isPossibleDuplicate ? 'help-circle-outline' : 'information-outline'}
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
              <MaterialCommunityIcons name="information-outline" size={14} color={warningTone} />
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
              <MaterialCommunityIcons
                name="plus-circle-multiple-outline"
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
                  typography.labelMd,
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
              <MaterialCommunityIcons
                name="plus-circle-outline"
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
                  typography.labelMd,
                  item.action === 'create' && styles.actionOptionTextActive,
                ]}
              >
                Crear nuevo ítem
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Personalización de categoría desplegable */}
      <Pressable
        testID={`detected-category-toggle-${item.id}`}
        style={styles.expandDetailsButton}
        onPress={() => setIsEditingDetails(!isEditingDetails)}
        accessibilityRole="button"
        accessibilityLabel="Cambiar categoría de alimento"
        accessibilityState={{ expanded: isEditingDetails }}
      >
        <MaterialCommunityIcons name="tag-outline" size={18} color={palette.accent} />
        <Text style={[styles.expandDetailsText, typography.labelLg]}>
          {isEditingDetails ? 'Ocultar categorías' : 'Cambiar categoría'}
        </Text>
        <MaterialCommunityIcons
          name={isEditingDetails ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={palette.accent}
        />
      </Pressable>

      {isEditingDetails && (
        <View style={styles.categoryPickerContainer} testID={`detected-category-picker-${item.id}`}>
          <Text style={[styles.fieldLabel, typography.labelMd]}>Selecciona la categoría</Text>
          <View style={styles.categoryChipsWrap}>
            {INGREDIENT_CATEGORIES.map((cat) => {
              const isSelected = item.category === cat;
              const visual = getCategoryVisual(cat, activeColorScheme);
              return (
                <Pressable
                  key={cat}
                  testID={`detected-category-${item.id}-${cat}`}
                  style={[
                    styles.categorySelectChip,
                    isSelected && {
                      backgroundColor: visual.bgColor,
                      borderColor: visual.color,
                    },
                  ]}
                  onPress={() => onChangeCategory(item.id, cat)}
                  accessibilityRole="button"
                  accessibilityLabel={`Categoría ${cat}`}
                  accessibilityState={{ selected: isSelected }}
                >
                  <MaterialCommunityIcons
                    name={visual.icon}
                    size={16}
                    color={isSelected ? visual.color : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.categorySelectChipText,
                      typography.labelMd,
                      isSelected && { color: visual.color, fontWeight: '700' },
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

const createStyles = (colors: AppColors) => {
  const palette = getScannerPalette(colors);
  return StyleSheet.create({
    cardContainer: {
      backgroundColor: palette.cardBackground,
      ...palette.cardGradient,
      borderRadius: radius.lg + 4,
      borderWidth: 1,
      borderColor: palette.cardBorder,
      paddingHorizontal: spacing.sm + 6,
      paddingVertical: spacing.sm + 4,
      gap: spacing.sm + 4,
      overflow: 'hidden',
    },
    cardContainerDeselected: {
      opacity: 0.55,
    },
    cardContainerError: {
      borderColor: colors.error,
      borderWidth: 1.5,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xs,
      marginLeft: -spacing.xs - 2,
      marginRight: -spacing.xs,
    },
    checkboxTouchArea: {
      width: MIN_TOUCH_TARGET,
      height: MIN_TOUCH_TARGET,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.xs,
    },
    checkbox: {
      width: 26,
      height: 26,
      borderRadius: radius.md,
      borderWidth: 2,
      borderColor: palette.controlBorder,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.fieldBackground,
    },
    checkboxActive: {
      backgroundColor: palette.selected,
      borderColor: palette.selected,
    },
    categoryTile: {
      width: 52,
      height: 52,
      borderRadius: radius.md + 6,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.xs,
    },
    nameContainer: {
      flex: 1,
      minWidth: 0,
      gap: spacing.xs,
    },
    nameInput: {
      color: colors.textPrimary,
      fontWeight: '700',
      fontSize: 17,
      minHeight: MIN_TOUCH_TARGET - spacing.sm,
      paddingVertical: 2,
      paddingHorizontal: 0,
      textAlignVertical: 'center',
    },
    removeButton: {
      width: MIN_TOUCH_TARGET,
      height: MIN_TOUCH_TARGET,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md + 4,
      marginTop: spacing.xs,
    },
    removeButtonPressed: {
      opacity: 0.6,
    },
    removeButtonFrame: {
      width: 38,
      height: 38,
      borderRadius: radius.md + 2,
      borderWidth: 1,
      borderColor: palette.controlBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerDivider: {
      height: 1,
      backgroundColor: palette.divider,
    },
    badgesRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      flexWrap: 'wrap',
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: 4,
      borderRadius: radius.full,
      maxWidth: '100%',
    },
    badgeText: {
      fontWeight: '700',
      flexShrink: 1,
    },
    reviewBadge: {
      backgroundColor: colors.demoBadgeBackground,
    },
    reviewBadgeText: {
      color: colors.demoBadgeText,
    },
    duplicateBadge: {
      backgroundColor: colors.primaryFixed,
    },
    duplicateBadgePossible: {
      backgroundColor: colors.surfaceContainer,
    },
    duplicateBadgeText: {
      color: colors.primary,
    },
    detailsPanel: {
      gap: spacing.sm + 4,
    },
    fieldSection: {
      gap: spacing.xs + 2,
    },
    fieldLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    fieldLabelGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs + 2,
    },
    fieldLabel: {
      color: colors.textPrimary,
    },
    fieldHint: {
      color: palette.hintText,
      backgroundColor: palette.hintBackground,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: 3,
      borderRadius: radius.full,
      overflow: 'hidden',
    },
    fieldHintRequired: {
      color: colors.onErrorContainer,
      backgroundColor: colors.errorContainer,
    },
    quantityInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 4,
      minHeight: 52,
      borderWidth: 1.5,
      borderColor: palette.fieldBorder,
      borderRadius: radius.md + 6,
      backgroundColor: palette.fieldBackground,
      paddingHorizontal: spacing.md,
    },
    quantityInputContainerError: {
      borderColor: colors.error,
    },
    quantityInput: {
      flex: 1,
      minWidth: 0,
      minHeight: 48,
      paddingVertical: spacing.xs,
      color: colors.textPrimary,
      fontWeight: '700',
      fontSize: 20,
      lineHeight: 26,
    },
    quantityDivider: {
      width: 1,
      height: 24,
      backgroundColor: palette.controlBorder,
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
      columnGap: spacing.xs + 2,
    },
    unitChip: {
      minHeight: MIN_TOUCH_TARGET,
      justifyContent: 'center',
    },
    unitChipPressed: {
      opacity: 0.6,
    },
    unitChipPill: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      minWidth: 54,
      minHeight: 36,
      paddingHorizontal: spacing.sm + 6,
      paddingVertical: spacing.xs,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: palette.controlBorder,
    },
    unitChipPillSelected: {
      backgroundColor: palette.selected,
      borderColor: palette.selected,
      boxShadow: palette.isDark ? '0px 2px 10px rgba(191, 162, 242, 0.45)' : undefined,
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
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm + 4,
      borderRadius: radius.md + 4,
    },
    errorNoticeText: {
      color: colors.onErrorContainer,
      flex: 1,
    },
    duplicateSection: {
      backgroundColor: palette.fieldBackground,
      borderRadius: radius.lg,
      padding: spacing.sm + 4,
      gap: spacing.sm,
    },
    duplicateInfoRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
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
    },
    actionOptionButton: {
      flexGrow: 1,
      flexBasis: 140,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: MIN_TOUCH_TARGET,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md + 4,
      borderWidth: 1.5,
      borderColor: palette.controlBorder,
      backgroundColor: 'transparent',
    },
    actionOptionButtonActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryFixed,
    },
    actionOptionButtonDisabled: {
      opacity: 0.45,
    },
    actionOptionText: {
      color: colors.textSecondary,
    },
    actionOptionTextActive: {
      color: colors.primary,
      fontWeight: '700',
    },
    incompatibleNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: palette.cardBackground,
      padding: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: palette.controlBorder,
    },
    incompatibleNoticeText: {
      color: colors.textSecondary,
      flex: 1,
    },
    expandDetailsButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      alignContent: 'center',
      flexWrap: 'wrap',
      gap: spacing.sm,
      minHeight: MIN_TOUCH_TARGET,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: palette.controlBorder,
    },
    expandDetailsText: {
      color: palette.accent,
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
      borderColor: palette.controlBorder,
      backgroundColor: 'transparent',
    },
    categorySelectChipText: {
      color: colors.textPrimary,
    },
  });
};
