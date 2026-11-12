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
  IngredientCategory,
  IngredientUnit,
} from '../../types/pantry';
import {
  ScannedIngredientAction,
  ScannedIngredientItem,
} from '../../types/scanner';
import {
  areUnitsCompatibleForAddition,
  suggestIngredientMeasurement,
} from '../../utils/ingredientMapper';
import {
  getScannedItemSemanticWarnings,
  isScannedItemSemanticallyConfirmed,
} from '../../utils/pantryValidation';
import {
  AppColors,
  getAppSurfaces,
  radius,
  shadowStyle,
  spacing,
  useTypography,
  useAppTheme,
  useThemeStyles,
} from '../../theme';
import { getCategoryVisual } from '../pantry/categoryVisuals';
import { useLocale } from '../../context/LocaleContext';
import { getCategoryLabel, getUnitName, getUnitShortLabel } from '../../locales/labels';
import { formatSemanticWarning } from '../../locales/domainText';

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
  /** Confirma explícitamente una combinación inusual de nombre, unidad y categoría. */
  onConfirmWarnings?: (id: string) => void;
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
  onConfirmWarnings,
}: DetectedIngredientCardProps) {
  const typography = useTypography();
  const { colors, activeColorScheme } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const { t, locale } = useLocale();
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
  // Mismas reglas semánticas que el formulario manual; nunca modifican los datos detectados
  const semanticWarnings = getScannedItemSemanticWarnings(item);
  const semanticConfirmed =
    semanticWarnings.length > 0 && isScannedItemSemanticallyConfirmed(item);
  const unitSuggestion =
    item.unit === 'desconocida' ? suggestIngredientMeasurement(item.name) : null;

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
          accessibilityLabel={t('detectedCard.selectLabel', { name: item.name })}
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
            placeholder={t('detectedCard.namePlaceholder')}
            placeholderTextColor={colors.outline}
            accessibilityLabel={t('detectedCard.nameLabel')}
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
                {getCategoryLabel(item.category, locale)}
              </Text>
            </View>

            {item.needsReview && (
              <View
                style={[styles.badge, styles.reviewBadge]}
                testID={`detected-review-badge-${item.id}`}
              >
                <MaterialCommunityIcons name="help-circle-outline" size={14} color={warningTone} />
                <Text style={[styles.badgeText, typography.labelSm, styles.reviewBadgeText]}>
                  {item.quantity === null ? t('detectedCard.quantityRequired') : t('detectedCard.confirmData')}
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
                  {isPossibleDuplicate ? t('detectedCard.possiblyInPantry') : t('detectedCard.inPantry')}
                </Text>
              </View>
            )}
          </View>
        </View>

        <Pressable
          testID={`detected-remove-${item.id}`}
          accessibilityRole="button"
          accessibilityLabel={t('detectedCard.excludeLabel', { name: item.name })}
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
              <Text style={[styles.fieldLabel, typography.labelLg]}>{t('detectedCard.quantity')}</Text>
            </View>
            <Text
              testID={`detected-quantity-hint-${item.id}`}
              style={[
                styles.fieldHint,
                typography.labelSm,
                item.quantity === null && styles.fieldHintRequired,
              ]}
            >
              {item.quantity === null ? t('detectedCard.mandatory') : t('detectedCard.estimated')}
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
              placeholder={t('detectedCard.quantityPlaceholder')}
              placeholderTextColor={colors.outline}
              keyboardType="decimal-pad"
              accessibilityLabel={t('detectedCard.quantityLabel', { name: item.name })}
            />
            <View style={styles.quantityDivider} />
            <Text
              testID={`detected-quantity-unit-suffix-${item.id}`}
              style={[styles.quantityUnitSuffix, typography.bodyMd]}
              numberOfLines={1}
              importantForAccessibility="no"
            >
              {getUnitName(item.unit, locale)}
            </Text>
          </View>
        </View>

        {/* Sección de unidad: opciones en cuadrícula adaptable, sin desplazamiento horizontal oculto */}
        <View style={styles.fieldSection} testID={`detected-unit-section-${item.id}`}>
          <View style={styles.fieldLabelGroup}>
            <MaterialCommunityIcons name="layers-outline" size={18} color={colors.textPrimary} />
            <Text style={[styles.fieldLabel, typography.labelLg]}>{t('detectedCard.unit')}</Text>
          </View>
          <View
            style={styles.unitOptionsWrap}
            testID={`detected-unit-options-${item.id}`}
            accessibilityRole="radiogroup"
            accessibilityLabel={t('detectedCard.unitGroupLabel', { name: item.name })}
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
                  accessibilityLabel={t('detectedCard.unitOptionLabel', { unit: getUnitName(u, locale) })}
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
                      {getUnitShortLabel(u, locale)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          {unitSuggestion && unitSuggestion.suggestedUnits.length > 0 && (
            <Text
              testID={`detected-unit-suggestion-${item.id}`}
              style={[styles.unitSuggestionText, typography.bodySm]}
            >
              {t('detectedCard.suggestedUnits')}{' '}
              {unitSuggestion.suggestedUnits.map((u) => getUnitShortLabel(u, locale)).join(', ')}
            </Text>
          )}
        </View>
      </View>

      {/* Combinación inusual de nombre, unidad y categoría: se marca y se pide confirmación */}
      {item.isSelected && semanticWarnings.length > 0 && (
        <View
          style={styles.semanticNotice}
          testID={`detected-semantic-warning-${item.id}`}
          accessibilityRole="alert"
        >
          {semanticWarnings.map((warning) => (
            <View key={warning.code} style={styles.semanticWarningItem}>
              <View style={styles.semanticNoticeRow}>
                <MaterialCommunityIcons name="alert-outline" size={16} color={warningTone} />
                <Text style={[styles.semanticNoticeText, typography.bodySm]}>
                  {formatSemanticWarning(warning, item, locale)}
                </Text>
              </View>
              {warning.suggestedCategory && (
                <Pressable
                  testID={`detected-apply-category-${item.id}`}
                  style={({ pressed }) => [
                    styles.suggestedCategoryButton,
                    pressed && styles.removeButtonPressed,
                  ]}
                  onPress={() => onChangeCategory(item.id, warning.suggestedCategory!)}
                  accessibilityRole="button"
                  accessibilityLabel={t('detectedCard.changeCategoryToLabel', { category: getCategoryLabel(warning.suggestedCategory, locale) })}
                >
                  <MaterialCommunityIcons name="tag-outline" size={14} color={colors.primary} />
                  <Text style={[styles.suggestedCategoryText, typography.labelMd]}>
                    {t('detectedCard.changeCategoryTo', { category: getCategoryLabel(warning.suggestedCategory, locale) })}
                  </Text>
                </Pressable>
              )}
            </View>
          ))}
          {semanticConfirmed ? (
            <View style={styles.semanticNoticeRow}>
              <MaterialCommunityIcons name="check-circle-outline" size={16} color={warningTone} />
              <Text
                testID={`detected-semantic-confirmed-${item.id}`}
                style={[styles.semanticNoticeText, typography.labelMd]}
              >
                {t('detectedCard.confirmedCorrect')}
              </Text>
            </View>
          ) : (
            onConfirmWarnings && (
              <Pressable
                testID={`detected-semantic-confirm-${item.id}`}
                style={({ pressed }) => [
                  styles.semanticConfirmButton,
                  pressed && styles.removeButtonPressed,
                ]}
                onPress={() => onConfirmWarnings(item.id)}
                accessibilityRole="button"
                accessibilityLabel={t('detectedCard.confirmCorrectLabel', { name: item.name })}
              >
                <Text style={[styles.semanticConfirmText, typography.labelMd]}>
                  {t('detectedCard.dataCorrect')}
                </Text>
              </Pressable>
            )
          )}
        </View>
      )}

      {/* Aviso cuando falta la cantidad */}
      {hasQuantityError && (
        <View style={styles.errorNotice} testID={`detected-quantity-error-${item.id}`}>
          <MaterialCommunityIcons name="alert-circle-outline" size={16} color={colors.error} />
          <Text style={[styles.errorNoticeText, typography.bodySm]}>
            {t('detectedCard.quantityError')}
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
                  <Text style={{ fontWeight: '700', color: warningTone }}>{t('detectedCard.possibleMatch')}</Text>
                  {t('detectedCard.youHave')}{' '}
                  <Text style={{ fontWeight: '700' }}>
                    {item.duplicateMatch.currentQuantity}{' '}
                    {getUnitShortLabel(item.duplicateMatch.unit, locale)}
                  </Text>{' '}
                  {t('detectedCard.possibleMatchSuffix', { name: item.duplicateMatch.name })}
                </>
              ) : (
                <>
                  {t('detectedCard.youHave')}{' '}
                  <Text style={{ fontWeight: '700' }}>
                    {item.duplicateMatch.currentQuantity}{' '}
                    {getUnitShortLabel(item.duplicateMatch.unit, locale)}
                  </Text>{' '}
                  {t('detectedCard.exactMatchSuffix', { name: item.duplicateMatch.name })}
                </>
              )}
            </Text>
          </View>

          {!isCompatibleWithDuplicate && (
            <View style={styles.incompatibleNotice} testID={`detected-incompatible-notice-${item.id}`}>
              <MaterialCommunityIcons name="information-outline" size={14} color={warningTone} />
              <Text style={[styles.incompatibleNoticeText, typography.bodySm]}>
                {t('detectedCard.incompatibleUnits', {
                  unitA: getUnitShortLabel(item.unit, locale),
                  unitB: getUnitShortLabel(item.duplicateMatch.unit, locale),
                })}
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
                {t('detectedCard.addToPantry')}
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
                {t('detectedCard.createNew')}
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
        accessibilityLabel={t('detectedCard.changeCategoryLabel')}
        accessibilityState={{ expanded: isEditingDetails }}
      >
        <MaterialCommunityIcons name="tag-outline" size={18} color={colors.primary} />
        <Text style={[styles.expandDetailsText, typography.labelLg]}>
          {isEditingDetails ? t('detectedCard.hideCategories') : t('detectedCard.changeCategory')}
        </Text>
        <MaterialCommunityIcons
          name={isEditingDetails ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.primary}
        />
      </Pressable>

      {isEditingDetails && (
        <View style={styles.categoryPickerContainer} testID={`detected-category-picker-${item.id}`}>
          <Text style={[styles.fieldLabel, typography.labelMd]}>{t('detectedCard.selectCategory')}</Text>
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
                  accessibilityLabel={t('detectedCard.categoryOptionLabel', { category: getCategoryLabel(cat, locale) })}
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
                    {getCategoryLabel(cat, locale)}
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
  return StyleSheet.create({
    cardContainer: {
      ...getAppSurfaces(colors).card,
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
      borderColor: colors.controlBorder,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.fieldBackground,
    },
    checkboxActive: {
      backgroundColor: colors.selected,
      borderColor: colors.selected,
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
      borderColor: colors.controlBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerDivider: {
      height: 1,
      backgroundColor: colors.divider,
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
      color: colors.hintText,
      backgroundColor: colors.hintBackground,
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
      borderColor: colors.fieldBorder,
      borderRadius: radius.md + 6,
      backgroundColor: colors.fieldBackground,
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
      backgroundColor: colors.controlBorder,
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
      borderColor: colors.controlBorder,
    },
    unitChipPillSelected: {
      backgroundColor: colors.selected,
      borderColor: colors.selected,
      ...shadowStyle(colors.shadowSelected),
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
    unitSuggestionText: {
      color: colors.textSecondary,
    },
    semanticNotice: {
      gap: spacing.xs,
      backgroundColor: colors.demoBadgeBackground,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm + 4,
      borderRadius: radius.md + 4,
    },
    semanticWarningItem: {
      gap: spacing.xs,
    },
    suggestedCategoryButton: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: MIN_TOUCH_TARGET,
      paddingHorizontal: spacing.sm + 4,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.surface,
      justifyContent: 'center',
    },
    suggestedCategoryText: {
      color: colors.primary,
      fontWeight: '700',
    },
    semanticNoticeRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xs,
    },
    semanticNoticeText: {
      color: colors.demoBadgeText,
      flex: 1,
    },
    semanticConfirmButton: {
      alignSelf: 'flex-start',
      minHeight: MIN_TOUCH_TARGET,
      paddingHorizontal: spacing.sm + 4,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.demoBadgeText,
      alignItems: 'center',
      justifyContent: 'center',
    },
    semanticConfirmText: {
      color: colors.demoBadgeText,
      fontWeight: '700',
    },
    duplicateSection: {
      backgroundColor: colors.fieldBackground,
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
      borderColor: colors.controlBorder,
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
      backgroundColor: colors.surface,
      padding: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.controlBorder,
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
      borderColor: colors.controlBorder,
    },
    expandDetailsText: {
      color: colors.primary,
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
      borderColor: colors.controlBorder,
      backgroundColor: 'transparent',
    },
    categorySelectChipText: {
      color: colors.textPrimary,
    },
  });
};
