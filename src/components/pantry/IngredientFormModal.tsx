/**
 * Formulario modal accesible para el registro y edición de ingredientes (Fase 2B & Fase 6B.2).
 * Inspirado en la pantalla «5. Ingredientes Detectados» de Google Stitch.
 */
import React, {
  ComponentRef,
  useCallback,
  useContext,
  useEffect,
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
  INGREDIENT_UNIT_LABELS,
  INGREDIENT_UNIT_NAMES,
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
import { validateIngredientForm } from '../../utils/pantryValidation';
import { getCategoryVisual } from './categoryVisuals';
import { ExpirationDateField } from './ExpirationDateField';

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

/** Etiquetas compactas para los chips de unidad (el nombre completo se anuncia por accesibilidad). */
const UNIT_CHIP_LABELS: Record<IngredientUnit, string> = {
  unidad: 'Unidad',
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'l',
  cucharada: 'Cda.',
  cucharadita: 'Cdta.',
  taza: 'Taza',
  desconocida: 'Otra',
};

function IngredientFormSheet({
  initialIngredient,
  onClose,
  onSave,
  onDeleteRequest,
}: Omit<IngredientFormModalProps, 'visible'>) {
  const typography = useTypography();
  const { colors, activeColorScheme } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const isEditing = Boolean(initialIngredient);

  const [name, setName] = useState(initialIngredient?.name ?? '');
  const [quantityText, setQuantityText] = useState(
    initialIngredient ? String(initialIngredient.quantity) : '1'
  );
  const [unit, setUnit] = useState<IngredientUnit>(
    initialIngredient?.unit ?? 'unidad'
  );
  const [category, setCategory] = useState<IngredientCategory>(
    initialIngredient?.category ?? 'Verduras y frutas'
  );
  const [expirationDateText, setExpirationDateText] = useState(
    initialIngredient?.expirationDate ?? ''
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleSubmit = async () => {
    const validation = validateIngredientForm({
      name,
      quantityText,
      unit,
      category,
      expirationDateText,
    });

    if (!validation.isValid || !validation.sanitizedData) {
      setErrors(validation.errors as Record<string, string>);
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
        accessibilityLabel="Cerrar formulario de ingrediente"
      />

      <View
        style={styles.sheetContainer}
        accessibilityViewIsModal={true}
        aria-modal={true}
        accessibilityLabel={isEditing ? 'Editar alimento' : 'Agregar nuevo alimento'}
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
              {isEditing ? 'Editar alimento' : 'Agregar alimento'}
            </Text>
            <Text style={[styles.headerSubtitle, typography.bodySm]}>
              {isEditing
                ? 'Actualiza cantidad, categoría o fecha.'
                : 'Súmalo a tu despensa en segundos.'}
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
            accessibilityLabel="Cerrar modal"
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
                {errors.form}
              </Text>
            </View>
          )}

          {/* 1. Nombre del alimento */}
          <View onLayout={(event) => handleFieldLayout('name', event)}>
            <Input
              onFocus={() => handleFieldFocus('name')}
              onBlur={() => handleFieldBlur('name')}
              testID="ingredient-name-input"
              label="Nombre del alimento *"
              placeholder="Ej. Pechuga de pollo, Tomate, Arroz"
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (errors.name) {
                  setErrors((prev) => ({ ...prev, name: '' }));
                }
              }}
              error={errors.name}
              leftIcon={
                <MaterialCommunityIcons name="food-outline" size={20} color={colors.outline} />
              }
              autoCapitalize="sentences"
              accessibilityLabel="Nombre del alimento"
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
              label="Cantidad *"
              placeholder="1"
              keyboardType="decimal-pad"
              value={quantityText}
              onChangeText={(text) => {
                setQuantityText(text);
                if (errors.quantity) {
                  setErrors((prev) => ({ ...prev, quantity: '' }));
                }
              }}
              error={errors.quantity}
              leftIcon={
                <MaterialCommunityIcons name="scale-balance" size={20} color={colors.outline} />
              }
              rightIcon={
                <Text style={[styles.unitSuffix, typography.labelMd]}>
                  {INGREDIENT_UNIT_LABELS[unit]}
                </Text>
              }
              accessibilityLabel="Cantidad del alimento"
              containerStyle={styles.inputContainer}
            />

            <View style={styles.chipsWrap} accessibilityLabel="Unidad de medida">
              {INGREDIENT_UNITS.map((unitOpt) => {
                const isSelected = unit === unitOpt;
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
                    onPress={() => setUnit(unitOpt)}
                    accessibilityRole="button"
                    accessibilityLabel={`Unidad: ${INGREDIENT_UNIT_NAMES[unitOpt]}`}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text
                      style={[
                        styles.unitChipText,
                        typography.labelMd,
                        isSelected && styles.unitChipTextSelected,
                      ]}
                    >
                      {UNIT_CHIP_LABELS[unitOpt]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {errors.unit && (
              <Text style={[styles.fieldError, typography.bodySm]}>
                {errors.unit}
              </Text>
            )}
          </View>

          {/* 3. Categoría */}
          <View style={styles.fieldSection}>
            <Text style={[styles.sectionLabel, typography.labelMd]}>
              Categoría *
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
                    onPress={() => setCategory(catOpt)}
                    accessibilityRole="button"
                    accessibilityLabel={`Categoría: ${catOpt}`}
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
                      {catOpt}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {errors.category && (
              <Text style={[styles.fieldError, typography.bodySm]}>
                {errors.category}
              </Text>
            )}
          </View>

          {/* 4. Fecha de caducidad (opcional) con calendario */}
          <ExpirationDateField
            value={expirationDateText}
            onChange={(next) => {
              setExpirationDateText(next);
              if (errors.expirationDate) {
                setErrors((prev) => ({ ...prev, expirationDate: '' }));
              }
            }}
            error={errors.expirationDate}
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
              accessibilityLabel={`Eliminar ${initialIngredient.name} de la despensa`}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.error} />
              <Text style={[styles.deleteTriggerText, typography.labelMd]}>
                Eliminar este alimento
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
            title="Cancelar"
            variant="outline"
            size="lg"
            style={stackFooter ? styles.footerStackedButton : styles.footerCancel}
            onPress={onClose}
            disabled={isSubmitting}
            accessibilityLabel="Cancelar registro"
          />
          <Button
            testID="submit-ingredient-form"
            title={isEditing ? 'Guardar cambios' : 'Guardar alimento'}
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
              isEditing ? 'Confirmar y guardar cambios' : 'Guardar nuevo ingrediente'
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
