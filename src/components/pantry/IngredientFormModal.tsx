/**
 * Formulario modal accesible para el registro y edición de ingredientes (Fase 2B & Fase 6B.2).
 * Inspirado en la pantalla «5. Ingredientes Detectados» de Google Stitch.
 */
import React, {
  ComponentRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  CreateIngredientInput,
  INGREDIENT_CATEGORIES,
  INGREDIENT_UNITS,
  Ingredient,
  IngredientCategory,
  IngredientUnit,
} from '../../types/pantry';
import {
  AppColors,
  radius,
  spacing,
  useTypography,
  useAppTheme,
  useThemeStyles,
} from '../../theme';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import {
  detectIngredientSemanticWarnings,
  getSemanticCheckSignature,
  MAX_INGREDIENT_QUANTITY,
  parseQuantityInput,
  validateIngredientForm,
} from '../../utils/pantryValidation';
import {
  classifyIngredient,
  convertQuantity,
  getUnitChangeImpact,
  suggestIngredientMeasurement,
} from '../../utils/ingredientMapper';
import { getCategoryVisual } from './categoryVisuals';
import { ExpirationDateField } from './ExpirationDateField';
import { useLocale } from '../../context/LocaleContext';
import type { MessageKey } from '../../locales';
import { getCategoryLabel, getUnitName, getUnitShortLabel } from '../../locales/labels';
import { formatSemanticWarning, formatUnitNameList } from '../../locales/domainText';
import { localizeMessage } from '../../locales/messages';

export type IngredientFormSaveData = Omit<
  CreateIngredientInput,
  'expirationDate'
> & {
  expirationDate?: string | null;
};

export interface IngredientFormModalProps {
  visible: boolean;
  initialIngredient?: Ingredient | null;
  onClose: () => void;
  onSave: (data: IngredientFormSaveData) => Promise<void>;
  onDeleteRequest?: (ingredient: Ingredient) => void;
}

/** Campos de texto cuyo desplazamiento se sigue para mantenerlos visibles sobre el teclado. */
type FocusableField = 'name' | 'quantity';

/** Valores por defecto de un alimento nuevo cuyo nombre aún no se reconoce. */
const DEFAULT_NEW_UNIT: IngredientUnit = 'unidad';
/** «Otros» es neutral: no sugiere una categoría engañosa para nombres desconocidos. */
const DEFAULT_NEW_CATEGORY: IngredientCategory = 'Otros';

export const UNIT_CHANGE_QUANTITY_ERROR =
  'Confirma la cantidad o escríbela de nuevo después de cambiar la unidad.';

/** Cambio de unidad pendiente de que el usuario confirme o reescriba la cantidad. */
interface PendingUnitChange {
  from: IngredientUnit;
  to: IngredientUnit;
  /** Cantidad equivalente ofrecida solo para g↔kg y ml↔l (nunca entre masa y volumen). */
  convertedText: string | null;
}

/**
 * Calcula la conversión explícita ofrecida al usuario (g↔kg, ml↔l) si el resultado
 * sigue siendo una cantidad válida (máximo 3 decimales y dentro del límite).
 */
function computeOfferedConversion(
  quantityText: string,
  from: IngredientUnit,
  to: IngredientUnit
): string | null {
  const parsed = parseQuantityInput(quantityText);
  if (!parsed.ok) return null;
  const converted = convertQuantity(parsed.value, from, to);
  if (converted === null || converted <= 0 || converted > MAX_INGREDIENT_QUANTITY) return null;
  const rounded = Math.round(converted * 1000) / 1000;
  if (Math.abs(rounded - converted) > 1e-9) return null;
  return String(rounded);
}

/** Etiquetas compactas para los chips de unidad (el nombre completo se anuncia por accesibilidad). */
const unitChipKey = (unit: IngredientUnit) => `ingredientForm.unitChip.${unit}` as MessageKey;

function IngredientFormSheet({
  initialIngredient,
  onClose,
  onSave,
  onDeleteRequest,
}: Omit<IngredientFormModalProps, 'visible'>) {
  const typography = useTypography();
  const { colors, activeColorScheme } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const { t, tx, locale } = useLocale();
  const formatUnitList = (units: IngredientUnit[]) => formatUnitNameList(units, locale);
  // Los errores de validación son mensajes de dominio en español: se traducen al mostrarse.
  const localizeError = (message?: string) =>
    localizeMessage(message, locale, { fallbackKey: 'messages.pantry.fallback' }) ?? undefined;
  const isEditing = Boolean(initialIngredient);

  const [name, setName] = useState(initialIngredient?.name ?? '');
  const [quantityText, setQuantityText] = useState(
    initialIngredient ? String(initialIngredient.quantity) : '1'
  );
  // Selección manual. Al editar, los valores guardados se tratan como elecciones deliberadas:
  // nunca se reemplazan automáticamente por una sugerencia.
  const [manualUnit, setManualUnit] = useState<IngredientUnit>(
    initialIngredient?.unit ?? DEFAULT_NEW_UNIT
  );
  const [manualCategory, setManualCategory] = useState<IngredientCategory>(
    initialIngredient?.category ?? DEFAULT_NEW_CATEGORY
  );
  const [unitTouched, setUnitTouched] = useState(isEditing);
  const [categoryTouched, setCategoryTouched] = useState(isEditing);
  // Una cantidad guardada o escrita por el usuario tiene significado propio en su unidad
  const [quantityTouched, setQuantityTouched] = useState(isEditing);
  const [pendingUnitChange, setPendingUnitChange] = useState<PendingUnitChange | null>(null);
  // Firma de la combinación para la que ya se mostró el aviso semántico al intentar guardar
  const [warningPromptSignature, setWarningPromptSignature] = useState<string | null>(null);
  const [expirationDateText, setExpirationDateText] = useState(
    initialIngredient?.expirationDate ?? ''
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sugerencias deterministas derivadas del nombre (misma base de conocimiento que el escáner)
  const classification = useMemo(() => classifyIngredient(name), [name]);
  const measurement = useMemo(() => suggestIngredientMeasurement(name), [name]);

  const suggestedCategory =
    classification.confidence === 'high' ? classification.category : null;
  const suggestedUnit =
    measurement.confidence === 'high' ? measurement.preferredUnit : null;

  // Solo los campos que el usuario no ha elegido manualmente reciben la sugerencia
  const unit: IngredientUnit = unitTouched ? manualUnit : (suggestedUnit ?? manualUnit);
  const category: IngredientCategory = categoryTouched
    ? manualCategory
    : (suggestedCategory ?? manualCategory);
  const unitIsAutoSuggested = !unitTouched && suggestedUnit !== null;
  const categoryIsAutoSuggested = !categoryTouched && suggestedCategory !== null;

  // Al editar, una combinación sin cambios nunca se cuestiona (datos heredados se respetan)
  const isUnchangedStoredCombination =
    isEditing &&
    initialIngredient !== null &&
    initialIngredient !== undefined &&
    name.trim() === initialIngredient.name.trim() &&
    unit === initialIngredient.unit &&
    category === initialIngredient.category;

  const semanticWarnings = useMemo(
    () =>
      isUnchangedStoredCombination
        ? []
        : detectIngredientSemanticWarnings({ name, unit, category }),
    [isUnchangedStoredCombination, name, unit, category]
  );
  const semanticSignature = getSemanticCheckSignature({ name, unit, category });
  const isWarningPromptActive =
    semanticWarnings.length > 0 && warningPromptSignature === semanticSignature;

  // Insets seguros opcionales: sin proveedor (p. ej. pruebas aisladas) se asume 0
  const insets = useContext(SafeAreaInsetsContext);
  const topInset = insets?.top ?? 0;
  // En pantallas angostas o con fuente ampliada, los botones del pie se apilan para no truncarse
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const stackFooter = windowWidth < 360 || fontScale > 1.2;

  // Mantener visible el campo de texto enfocado cuando aparece el teclado
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const fieldOffsets = useRef<Partial<Record<FocusableField, number>>>({});
  const focusedField = useRef<FocusableField | null>(null);
  const warningsOffset = useRef<number | null>(null);

  const scrollToFocusedField = useCallback(() => {
    const key = focusedField.current;
    const y = key ? fieldOffsets.current[key] : undefined;
    if (y === undefined) return;
    scrollRef.current?.scrollTo({ y: Math.max(y - spacing.sm, 0), animated: true });
  }, []);

  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', scrollToFocusedField);
    return () => subscription.remove();
  }, [scrollToFocusedField]);

  const handleFieldFocus = useCallback(
    (key: FocusableField) => {
      focusedField.current = key;
      // Al cambiar de campo con el teclado ya abierto no habrá un nuevo keyboardDidShow
      if (Keyboard.isVisible()) scrollToFocusedField();
    },
    [scrollToFocusedField]
  );

  const handleFieldBlur = useCallback((key: FocusableField) => {
    if (focusedField.current === key) focusedField.current = null;
  }, []);

  const handleFieldLayout = useCallback((key: FocusableField, event: LayoutChangeEvent) => {
    fieldOffsets.current[key] = event.nativeEvent.layout.y;
  }, []);

  /**
   * Selección manual de unidad. La cantidad NUNCA se convierte en silencio: si ya tenía
   * significado (guardada o escrita por el usuario), se pide confirmarla o reescribirla.
   */
  const handleUnitSelect = (nextUnit: IngredientUnit) => {
    const impact = getUnitChangeImpact(unit, nextUnit);
    setManualUnit(nextUnit);
    setUnitTouched(true);
    if (errors.unit) setErrors((prev) => ({ ...prev, unit: '' }));

    if (impact === 'same') return;

    if (!quantityTouched) {
      setPendingUnitChange(null);
      return;
    }

    // Si ya había un cambio pendiente, el origen sigue siendo la unidad de la cantidad escrita
    const originUnit = pendingUnitChange ? pendingUnitChange.from : unit;
    if (originUnit === nextUnit) {
      setPendingUnitChange(null);
      if (errors.quantity === UNIT_CHANGE_QUANTITY_ERROR) {
        setErrors((prev) => ({ ...prev, quantity: '' }));
      }
      return;
    }

    setPendingUnitChange({
      from: originUnit,
      to: nextUnit,
      convertedText:
        getUnitChangeImpact(originUnit, nextUnit) === 'convertible'
          ? computeOfferedConversion(quantityText, originUnit, nextUnit)
          : null,
    });
  };

  const clearPendingUnitChange = () => {
    setPendingUnitChange(null);
    if (errors.quantity === UNIT_CHANGE_QUANTITY_ERROR) {
      setErrors((prev) => ({ ...prev, quantity: '' }));
    }
  };

  const handleCategorySelect = (nextCategory: IngredientCategory) => {
    setManualCategory(nextCategory);
    setCategoryTouched(true);
    if (errors.category) setErrors((prev) => ({ ...prev, category: '' }));
  };

  const handleSubmit = async () => {
    const validation = validateIngredientForm({
      name,
      quantityText,
      unit,
      category,
      expirationDateText,
    });

    if (!validation.isValid || !validation.sanitizedData) {
      setErrors({
        ...(validation.errors as Record<string, string>),
        ...(pendingUnitChange && !validation.errors.quantity
          ? { quantity: UNIT_CHANGE_QUANTITY_ERROR }
          : {}),
      });
      return;
    }

    // Tras cambiar de unidad, la cantidad debe confirmarse o reescribirse explícitamente
    if (pendingUnitChange) {
      setErrors({ quantity: UNIT_CHANGE_QUANTITY_ERROR });
      const quantityY = fieldOffsets.current.quantity;
      if (quantityY !== undefined) {
        scrollRef.current?.scrollTo({ y: Math.max(quantityY - spacing.sm, 0), animated: true });
      }
      return;
    }

    // Combinaciones sospechosas: primer intento muestra el aviso; el segundo confirma
    if (semanticWarnings.length > 0 && warningPromptSignature !== semanticSignature) {
      setErrors({});
      setWarningPromptSignature(semanticSignature);
      if (warningsOffset.current !== null) {
        scrollRef.current?.scrollTo({
          y: Math.max(warningsOffset.current - spacing.sm, 0),
          animated: true,
        });
      }
      return;
    }

    setErrors({});
    const sanitizedExp = validation.sanitizedData.expirationDate;
    const expirationDateToSave = isEditing
      ? (sanitizedExp ?? null)
      : sanitizedExp;

    const dataToSave: IngredientFormSaveData = {
      name: validation.sanitizedData.name,
      quantity: validation.sanitizedData.quantity,
      unit: validation.sanitizedData.unit,
      category: validation.sanitizedData.category,
      expirationDate: expirationDateToSave,
    };

    setIsSubmitting(true);
    try {
      await onSave(dataToSave);
      onClose();
    } catch (error) {
      setIsSubmitting(false);
      setErrors({
        form:
          error instanceof Error
            ? error.message
            : 'Ocurrió un error al guardar el ingrediente.',
      });
    }
  };

  return (
    // `padding` en ambas plataformas: KeyboardAvoidingView calcula solo el solapamiento real
    // entre esta vista y el borde superior del teclado (en Android, con edge-to-edge, la ventana
    // ya no se redimensiona; si un dispositivo sí la redimensiona, el solapamiento resulta 0).
    <KeyboardAvoidingView
      testID="ingredient-form-keyboard-avoider"
      behavior="padding"
      style={[styles.backdrop, { paddingTop: topInset + spacing.lg }]}
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityLabel={t('ingredientForm.closeLabel')}
      />

      <View
        style={styles.sheetContainer}
        accessibilityViewIsModal={true}
        aria-modal={true}
        accessibilityLabel={isEditing ? t('ingredientForm.editTitle') : t('ingredientForm.addTitleLabel')}
      >
        <View style={styles.sheetDragBar} />

        <View style={styles.headerRow}>
          <View style={styles.headerIconBox}>
            <MaterialCommunityIcons
              name={isEditing ? 'pencil-outline' : 'basket-plus-outline'}
              size={22}
              color={colors.primary}
            />
          </View>
          <View style={styles.headerTextCol}>
            <Text style={[styles.headerTitle, typography.headlineMd]}>
              {isEditing ? t('ingredientForm.editTitle') : t('ingredientForm.addTitle')}
            </Text>
            <Text style={[styles.headerSubtitle, typography.bodySm]}>
              {isEditing
                ? t('ingredientForm.editSubtitle')
                : t('ingredientForm.addSubtitle')}
            </Text>
          </View>

          <Pressable
            testID="close-ingredient-form"
            style={({ pressed }) => [
              styles.closeButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('ingredientForm.closeModal')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons name="close" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          testID="ingredient-form-scroll"
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {errors.form && (
            <View style={styles.errorBanner}>
              <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.error} />
              <Text style={[styles.errorBannerText, typography.bodySm]}>
                {localizeMessage(errors.form, locale, { fallbackKey: 'ingredientForm.saveFailed' })}
              </Text>
            </View>
          )}

          {/* 1. Nombre del alimento */}
          <View onLayout={(event) => handleFieldLayout('name', event)}>
            <Input
              onFocus={() => handleFieldFocus('name')}
              onBlur={() => handleFieldBlur('name')}
              testID="ingredient-name-input"
              label={t('ingredientForm.nameLabel')}
              placeholder={t('ingredientForm.namePlaceholder')}
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (errors.name) {
                  setErrors((prev) => ({ ...prev, name: '' }));
                }
              }}
              error={localizeError(errors.name)}
              leftIcon={
                <MaterialCommunityIcons name="food-outline" size={20} color={colors.outline} />
              }
              autoCapitalize="sentences"
              accessibilityLabel={t('ingredientForm.nameA11y')}
              containerStyle={styles.inputContainer}
            />
          </View>

          {/* 2. Cantidad y unidad */}
          <View
            style={styles.fieldSection}
            onLayout={(event) => handleFieldLayout('quantity', event)}
          >
            <Input
              onFocus={() => handleFieldFocus('quantity')}
              onBlur={() => handleFieldBlur('quantity')}
              testID="ingredient-quantity-input"
              label={t('ingredientForm.quantityLabel')}
              placeholder="1"
              keyboardType="decimal-pad"
              value={quantityText}
              onChangeText={(text) => {
                setQuantityText(text);
                setQuantityTouched(true);
                // La cantidad se escribió viendo esta unidad: fijarla para que un cambio
                // posterior del nombre no altere su significado en silencio
                if (!unitTouched) {
                  setManualUnit(unit);
                  setUnitTouched(true);
                }
                // Reescribir la cantidad resuelve un cambio de unidad pendiente
                setPendingUnitChange(null);
                if (errors.quantity) {
                  setErrors((prev) => ({ ...prev, quantity: '' }));
                }
              }}
              error={localizeError(errors.quantity)}
              leftIcon={
                <MaterialCommunityIcons name="scale-balance" size={20} color={colors.outline} />
              }
              rightIcon={
                <Text style={[styles.unitSuffix, typography.labelMd]}>
                  {getUnitShortLabel(unit, locale)}
                </Text>
              }
              accessibilityLabel={t('ingredientForm.quantityA11y')}
              containerStyle={styles.inputContainer}
            />

            <View style={styles.chipsWrap} accessibilityLabel={t('ingredientForm.unitGroupLabel')}>
              {INGREDIENT_UNITS.map((unitOpt) => {
                const isSelected = unit === unitOpt;
                const isRecommended = measurement.suggestedUnits.includes(unitOpt);
                return (
                  <Pressable
                    key={unitOpt}
                    testID={`unit-option-${unitOpt}`}
                    hitSlop={{ top: 2, bottom: 2 }}
                    style={({ pressed }) => [
                      styles.unitChip,
                      isSelected && styles.unitChipSelected,
                      pressed && !isSelected && styles.chipPressed,
                    ]}
                    onPress={() => handleUnitSelect(unitOpt)}
                    accessibilityRole="button"
                    accessibilityLabel={t('ingredientForm.unitOptionLabel', { unit: getUnitName(unitOpt, locale) })}
                    accessibilityHint={isRecommended ? t('ingredientForm.recommendedHint') : undefined}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text
                      style={[
                        styles.unitChipText,
                        typography.labelMd,
                        isSelected && styles.unitChipTextSelected,
                      ]}
                    >
                      {tx(unitChipKey(unitOpt))}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {measurement.suggestedUnits.length > 0 && (
              <View testID="unit-suggestion-hint" style={styles.suggestionRow}>
                <MaterialCommunityIcons
                  name="lightbulb-on-outline"
                  size={16}
                  color={colors.hintText}
                />
                <Text style={[styles.suggestionText, typography.bodySm]}>
                  {measurement.confidence === 'low'
                    ? t('ingredientForm.unitDependsOnForm', { units: formatUnitList(measurement.suggestedUnits) })
                    : unitIsAutoSuggested
                      ? t('ingredientForm.unitSuggested', { units: formatUnitList(measurement.suggestedUnits) })
                      : t('ingredientForm.unitRecommended', { units: formatUnitList(measurement.suggestedUnits) })}
                </Text>
                {unitTouched &&
                  suggestedUnit !== null &&
                  !measurement.suggestedUnits.includes(unit) && (
                    <Pressable
                      testID="apply-unit-suggestion"
                      onPress={() => handleUnitSelect(suggestedUnit)}
                      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={t('ingredientForm.useSuggestedUnitLabel', { unit: getUnitName(suggestedUnit, locale) })}
                    >
                      <Text style={[styles.suggestionAction, typography.labelMd]}>
                        {t('ingredientForm.useUnit', { unit: getUnitShortLabel(suggestedUnit, locale) })}
                      </Text>
                    </Pressable>
                  )}
              </View>
            )}
            {pendingUnitChange && (
              <View
                testID="unit-change-quantity-notice"
                style={styles.warningPanel}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
              >
                <View style={styles.warningRow}>
                  <MaterialCommunityIcons
                    name="swap-horizontal"
                    size={18}
                    color={colors.demoBadgeText}
                  />
                  <Text style={[styles.warningText, typography.bodySm]}>
                    {t('ingredientForm.unitChanged', {
                      from: getUnitName(pendingUnitChange.from, locale),
                      to: getUnitName(pendingUnitChange.to, locale),
                      quantity: quantityText.trim() || '—',
                    })}
                  </Text>
                </View>
                <View style={styles.warningActions}>
                  {pendingUnitChange.convertedText !== null && (
                    <Pressable
                      testID="convert-quantity-after-unit-change"
                      style={({ pressed }) => [styles.warningAction, pressed && styles.buttonPressed]}
                      onPress={() => {
                        setQuantityText(pendingUnitChange.convertedText ?? quantityText);
                        clearPendingUnitChange();
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={t('ingredientForm.convertLabel', { quantity: pendingUnitChange.convertedText, unit: getUnitName(pendingUnitChange.to, locale) })}
                    >
                      <Text style={[styles.warningActionText, typography.labelMd]}>
                        {t('ingredientForm.convertLabel', { quantity: pendingUnitChange.convertedText, unit: getUnitShortLabel(pendingUnitChange.to, locale) })}
                      </Text>
                    </Pressable>
                  )}
                  <Pressable
                    testID="keep-quantity-after-unit-change"
                    style={({ pressed }) => [styles.warningAction, pressed && styles.buttonPressed]}
                    onPress={clearPendingUnitChange}
                    accessibilityRole="button"
                    accessibilityLabel={t('ingredientForm.keepLabel', { quantity: quantityText.trim(), unit: getUnitName(pendingUnitChange.to, locale) })}
                  >
                    <Text style={[styles.warningActionText, typography.labelMd]}>
                      {t('ingredientForm.keepLabel', { quantity: quantityText.trim(), unit: getUnitShortLabel(pendingUnitChange.to, locale) })}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
            {errors.unit && (
              <Text style={[styles.fieldError, typography.bodySm]}>
                {localizeError(errors.unit)}
              </Text>
            )}
          </View>

          {/* 3. Categoría */}
          <View style={styles.fieldSection}>
            <Text style={[styles.sectionLabel, typography.labelMd]}>
              {t('ingredientForm.categoryLabel')}
            </Text>
            <View style={styles.categoryGrid}>
              {INGREDIENT_CATEGORIES.map((catOpt) => {
                const isSelected = category === catOpt;
                const visual = getCategoryVisual(catOpt, activeColorScheme);
                return (
                  <Pressable
                    key={catOpt}
                    testID={`category-option-${catOpt}`}
                    style={({ pressed }) => [
                      styles.categoryTile,
                      isSelected && styles.categoryTileSelected,
                      pressed && !isSelected && styles.chipPressed,
                    ]}
                    onPress={() => handleCategorySelect(catOpt)}
                    accessibilityRole="button"
                    accessibilityLabel={t('ingredientForm.categoryOptionLabel', { category: getCategoryLabel(catOpt, locale) })}
                    accessibilityHint={
                      catOpt === suggestedCategory ? t('ingredientForm.recommendedHint') : undefined
                    }
                    accessibilityState={{ selected: isSelected }}
                  >
                    <View style={[styles.categoryIconBox, { backgroundColor: visual.bgColor }]}>
                      <MaterialCommunityIcons name={visual.icon} size={18} color={visual.color} />
                      {/* Marca de selección superpuesta: no resta ancho al texto en pantallas angostas */}
                      {isSelected && (
                        <View style={styles.categoryCheckBadge}>
                          <MaterialCommunityIcons name="check" size={11} color={colors.onPrimary} />
                        </View>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.categoryTileText,
                        typography.labelMd,
                        isSelected && styles.categoryTileTextSelected,
                      ]}
                    >
                      {getCategoryLabel(catOpt, locale)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {suggestedCategory !== null &&
              (categoryIsAutoSuggested || category !== suggestedCategory) && (
                <View testID="category-suggestion-hint" style={styles.suggestionRow}>
                  <MaterialCommunityIcons
                    name="lightbulb-on-outline"
                    size={16}
                    color={colors.hintText}
                  />
                  <Text style={[styles.suggestionText, typography.bodySm]}>
                    {categoryIsAutoSuggested
                      ? t('ingredientForm.categoryAutoSuggested')
                      : t('ingredientForm.categorySuggestion', { category: getCategoryLabel(suggestedCategory, locale) })}
                  </Text>
                  {!categoryIsAutoSuggested && (
                    <Pressable
                      testID="apply-category-suggestion"
                      onPress={() => handleCategorySelect(suggestedCategory)}
                      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={t('ingredientForm.useSuggestedCategoryLabel', { category: getCategoryLabel(suggestedCategory, locale) })}
                    >
                      <Text style={[styles.suggestionAction, typography.labelMd]}>{t('ingredientForm.use')}</Text>
                    </Pressable>
                  )}
                </View>
              )}
            {errors.category && (
              <Text style={[styles.fieldError, typography.bodySm]}>
                {localizeError(errors.category)}
              </Text>
            )}
          </View>

          {/* Advertencias semánticas: no bloquean, pero exigen confirmación al guardar */}
          {semanticWarnings.length > 0 && (
            <View
              testID="ingredient-semantic-warnings"
              onLayout={(event) => {
                warningsOffset.current = event.nativeEvent.layout.y;
              }}
              style={[styles.warningPanel, isWarningPromptActive && styles.warningPanelActive]}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              <View style={styles.warningRow}>
                <MaterialCommunityIcons name="alert-outline" size={18} color={colors.demoBadgeText} />
                <Text style={[styles.warningTitle, typography.labelMd]}>
                  {t('ingredientForm.reviewCombination')}
                </Text>
              </View>
              {semanticWarnings.map((warning) => (
                <Text
                  key={warning.code}
                  testID={`semantic-warning-${warning.code}`}
                  style={[styles.warningText, typography.bodySm]}
                >
                  {formatSemanticWarning(warning, { name, unit, category }, locale)}
                </Text>
              ))}
              <Text style={[styles.warningText, typography.bodySm]}>
                {isWarningPromptActive
                  ? t('ingredientForm.saveAnywayPrompt')
                  : t('ingredientForm.canFixOrConfirm')}
              </Text>
            </View>
          )}

          {/* 4. Fecha de caducidad (opcional) con calendario */}
          <ExpirationDateField
            value={expirationDateText}
            onChange={(next) => {
              setExpirationDateText(next);
              if (errors.expirationDate) {
                setErrors((prev) => ({ ...prev, expirationDate: '' }));
              }
            }}
            error={localizeError(errors.expirationDate)}
          />

          {/* Si está editando, ofrecer botón de eliminar directo */}
          {isEditing && initialIngredient && onDeleteRequest && (
            <Pressable
              testID="form-delete-trigger-button"
              style={({ pressed }) => [
                styles.deleteTrigger,
                pressed && styles.buttonPressed,
              ]}
              onPress={() => {
                onClose();
                onDeleteRequest(initialIngredient);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('ingredientForm.deleteLabel', { name: initialIngredient.name })}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.error} />
              <Text style={[styles.deleteTriggerText, typography.labelMd]}>
                {t('ingredientForm.deleteThis')}
              </Text>
            </Pressable>
          )}
        </ScrollView>

        {/* Botones de acción fijos al pie de la hoja */}
        <View
          testID="ingredient-form-footer"
          style={[styles.footer, stackFooter && styles.footerStacked]}
        >
          <Button
            testID="cancel-ingredient-form"
            title={t('common.cancel')}
            variant="outline"
            size="lg"
            style={stackFooter ? styles.footerStackedButton : styles.footerCancel}
            onPress={onClose}
            disabled={isSubmitting}
            accessibilityLabel={t('ingredientForm.cancelLabel')}
          />
          <Button
            testID="submit-ingredient-form"
            title={
              isWarningPromptActive
                ? t('ingredientForm.saveAnyway')
                : isEditing
                  ? t('ingredientForm.saveChanges')
                  : t('ingredientForm.saveFood')
            }
            variant="primary"
            size="lg"
            style={stackFooter ? styles.footerStackedButton : styles.footerSubmit}
            onPress={handleSubmit}
            loading={isSubmitting}
            leftIcon={
              <MaterialCommunityIcons
                name={isEditing ? 'check' : 'plus'}
                size={20}
                color={colors.onPrimary}
              />
            }
            accessibilityLabel={
              isWarningPromptActive
                ? t('ingredientForm.saveAnywayLabel')
                : isEditing
                  ? t('ingredientForm.saveChangesLabel')
                  : t('ingredientForm.saveNewLabel')
            }
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

export function IngredientFormModal({
  visible,
  initialIngredient,
  onClose,
  onSave,
  onDeleteRequest,
}: IngredientFormModalProps) {
  const styles = useThemeStyles(createStyles);

  if (!visible) {
    return null;
  }

  const formKey = initialIngredient
    ? `edit-${initialIngredient.id}`
    : 'create-new-ingredient';

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.overlayRoot]}
      testID="ingredient-form-modal"
    >
      <IngredientFormSheet
        key={formKey}
        initialIngredient={initialIngredient}
        onClose={onClose}
        onSave={onSave}
        onDeleteRequest={onDeleteRequest}
      />
    </View>
  );
}

/** Margen lateral de la hoja: 20 dp deja dos categorías por fila incluso a 320 dp. */
const SHEET_GUTTER = spacing.md + 4;

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    overlayRoot: {
      zIndex: 1000,
      elevation: 10,
    },
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    sheetContainer: {
      // Se encoge para caber entre el inset superior y el teclado; el ScrollView absorbe el resto
      flexShrink: 1,
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl + 4,
      borderTopRightRadius: radius.xl + 4,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: colors.borderLight,
      paddingTop: spacing.sm,
      elevation: 10,
      shadowColor: colors.cardShadow,
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
    },
    sheetDragBar: {
      width: 40,
      height: 4,
      borderRadius: radius.full,
      backgroundColor: colors.outlineVariant,
      alignSelf: 'center',
      marginBottom: spacing.sm,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: SHEET_GUTTER,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    headerIconBox: {
      width: 44,
      height: 44,
      borderRadius: radius.md + 6,
      backgroundColor: colors.primaryFixed,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTextCol: {
      flex: 1,
      minWidth: 0,
    },
    headerTitle: {
      color: colors.textPrimary,
      fontWeight: '700',
    },
    headerSubtitle: {
      color: colors.textSecondary,
    },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceContainer,
    },
    buttonPressed: {
      opacity: 0.6,
    },
    scrollArea: {
      flexGrow: 0,
      flexShrink: 1,
    },
    scrollContent: {
      paddingHorizontal: SHEET_GUTTER,
      paddingTop: spacing.md,
      paddingBottom: spacing.lg,
      gap: spacing.lg,
    },
    inputContainer: {
      marginBottom: 0,
    },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.errorContainer,
      padding: spacing.sm,
      borderRadius: radius.md + 4,
    },
    errorBannerText: {
      color: colors.onErrorContainer,
      flex: 1,
    },
    fieldSection: {
      gap: spacing.sm,
    },
    sectionLabel: {
      color: colors.textPrimary,
    },
    unitSuffix: {
      color: colors.textSecondary,
    },
    chipsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    chipPressed: {
      backgroundColor: colors.surfaceContainerHigh,
    },
    unitChip: {
      minHeight: 40,
      minWidth: 48,
      paddingHorizontal: spacing.sm + 4,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    unitChipSelected: {
      backgroundColor: colors.primaryAction,
      borderColor: colors.primaryAction,
    },
    unitChipText: {
      color: colors.textSecondary,
    },
    unitChipTextSelected: {
      color: colors.onPrimary,
      fontWeight: '700',
    },
    categoryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    categoryTile: {
      flexGrow: 1,
      flexBasis: '45%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 52,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radius.md + 6,
      borderWidth: 1.5,
      borderColor: colors.borderLight,
      backgroundColor: colors.surface,
    },
    categoryTileSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.surfaceContainerLow,
    },
    categoryIconBox: {
      width: 32,
      height: 32,
      borderRadius: radius.md + 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    categoryCheckBadge: {
      position: 'absolute',
      right: -5,
      bottom: -5,
      width: 17,
      height: 17,
      borderRadius: radius.full,
      backgroundColor: colors.primaryAction,
      borderWidth: 2,
      borderColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    categoryTileText: {
      flex: 1,
      color: colors.textSecondary,
    },
    categoryTileTextSelected: {
      color: colors.textPrimary,
      fontWeight: '700',
    },
    fieldError: {
      color: colors.error,
      marginLeft: spacing.xs,
    },
    suggestionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: spacing.xs,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md + 2,
      backgroundColor: colors.hintBackground,
    },
    suggestionText: {
      flex: 1,
      minWidth: 160,
      color: colors.hintText,
    },
    suggestionAction: {
      color: colors.hintText,
      fontWeight: '700',
      textDecorationLine: 'underline',
    },
    warningPanel: {
      gap: spacing.xs,
      padding: spacing.sm + 2,
      borderRadius: radius.md + 4,
      borderWidth: 1.5,
      borderColor: 'transparent',
      backgroundColor: colors.demoBadgeBackground,
    },
    warningPanelActive: {
      borderColor: colors.demoBadgeText,
    },
    warningRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    warningTitle: {
      flex: 1,
      color: colors.demoBadgeText,
      fontWeight: '700',
    },
    warningText: {
      flex: 1,
      color: colors.demoBadgeText,
    },
    warningActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    warningAction: {
      minHeight: 44,
      paddingHorizontal: spacing.sm + 4,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.demoBadgeText,
      alignItems: 'center',
      justifyContent: 'center',
    },
    warningActionText: {
      color: colors.demoBadgeText,
      fontWeight: '700',
    },
    deleteTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      minHeight: 44,
      borderRadius: radius.md + 4,
      backgroundColor: colors.errorContainer,
    },
    deleteTriggerText: {
      color: colors.onErrorContainer,
    },
    footer: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: SHEET_GUTTER,
      paddingTop: spacing.md,
      paddingBottom: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.borderLight,
      backgroundColor: colors.surface,
    },
    footerCancel: {
      flex: 1,
      paddingHorizontal: spacing.sm,
    },
    footerSubmit: {
      flex: 1.6,
      paddingHorizontal: spacing.sm,
    },
    footerStacked: {
      flexDirection: 'column-reverse',
    },
    footerStackedButton: {
      width: '100%',
    },
  });
