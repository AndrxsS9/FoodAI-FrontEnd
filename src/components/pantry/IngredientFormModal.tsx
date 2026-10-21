/**
 * Formulario modal accesible para el registro y edición de ingredientes (Fase 2B).
 * Inspirado en la pantalla «5. Ingredientes Detectados» de Google Stitch.
 */
import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import {
  CATEGORY_CONFIG,
  CreateIngredientInput,
  INGREDIENT_CATEGORIES,
  INGREDIENT_UNITS,
  INGREDIENT_UNIT_NAMES,
  Ingredient,
  IngredientCategory,
  IngredientUnit,
} from '../../types/pantry';
import { colors, radius, spacing, useTypography } from '../../theme';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { validateIngredientForm } from '../../utils/pantryValidation';

export interface IngredientFormModalProps {
  visible: boolean;
  initialIngredient?: Ingredient | null;
  onClose: () => void;
  onSave: (data: CreateIngredientInput) => Promise<void>;
  onDeleteRequest?: (ingredient: Ingredient) => void;
}

function IngredientFormSheet({
  initialIngredient,
  onClose,
  onSave,
  onDeleteRequest,
}: Omit<IngredientFormModalProps, 'visible'>) {
  const typography = useTypography();
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

  const handleQuickExpiration = (daysFromNow: number | null) => {
    if (daysFromNow === null) {
      setExpirationDateText('');
      return;
    }

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysFromNow);

    const y = targetDate.getFullYear();
    const m = String(targetDate.getMonth() + 1).padStart(2, '0');
    const d = String(targetDate.getDate()).padStart(2, '0');
    setExpirationDateText(`${y}-${m}-${d}`);
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
      setErrors(validation.errors as Record<string, string>);
      return;
    }

    setErrors({});
    const dataToSave: CreateIngredientInput = {
      name: validation.sanitizedData.name,
      quantity: validation.sanitizedData.quantity,
      unit: validation.sanitizedData.unit,
      category: validation.sanitizedData.category,
      expirationDate: validation.sanitizedData.expirationDate,
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
    <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Cerrar formulario de ingrediente"
        />

        <View
          style={styles.sheetContainer}
          accessibilityRole="dialog"
          accessibilityLabel={isEditing ? 'Editar alimento' : 'Agregar nuevo alimento'}
        >
          {/* Barra de agarre decorativa (estilo bottom sheet) */}
          <View style={styles.sheetDragBar} />

          {/* Encabezado del modal */}
          <View style={styles.headerRow}>
            <View style={styles.headerTextCol}>
              <Text style={[styles.headerTitle, typography.headlineMd]}>
                {isEditing ? 'Editar alimento' : 'Agregar alimento'}
              </Text>
              <Text style={[styles.headerSubtitle, typography.bodySm]}>
                {isEditing
                  ? 'Modifica las cantidades o categoría guardada.'
                  : 'Ingresa los datos para sumar el alimento a tu despensa.'}
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
              <MaterialIcons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Banner de error general si ocurre fallo de persistencia */}
            {errors.form && (
              <View style={styles.errorBanner}>
                <MaterialIcons name="error-outline" size={18} color={colors.error} />
                <Text style={[styles.errorBannerText, typography.bodySm]}>
                  {errors.form}
                </Text>
              </View>
            )}

            {/* 1. Nombre del alimento */}
            <View style={styles.fieldSection}>
              <Input
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
                  <MaterialIcons name="restaurant" size={20} color={colors.outline} />
                }
                autoCapitalize="sentences"
                accessibilityLabel="Nombre del alimento"
              />
            </View>

            {/* 2. Cantidad */}
            <View style={styles.fieldSection}>
              <Input
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
                  <MaterialIcons name="scale" size={20} color={colors.outline} />
                }
                accessibilityLabel="Cantidad del alimento"
              />
            </View>

            {/* 3. Unidad de medida */}
            <View style={styles.fieldSection}>
              <Text style={[styles.sectionLabel, typography.labelMd]}>
                Unidad de medida *
              </Text>
              <View style={styles.chipsWrap}>
                {INGREDIENT_UNITS.map((unitOpt) => {
                  const isSelected = unit === unitOpt;
                  return (
                    <Pressable
                      key={unitOpt}
                      testID={`unit-option-${unitOpt}`}
                      style={[
                        styles.chip,
                        isSelected ? styles.chipSelected : styles.chipUnselected,
                      ]}
                      onPress={() => setUnit(unitOpt)}
                      accessibilityRole="button"
                      accessibilityLabel={`Unidad: ${INGREDIENT_UNIT_NAMES[unitOpt]}`}
                      accessibilityState={{ selected: isSelected }}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          typography.labelSm,
                          isSelected
                            ? styles.chipTextSelected
                            : styles.chipTextUnselected,
                        ]}
                      >
                        {INGREDIENT_UNIT_NAMES[unitOpt]}
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

            {/* 4. Categoría */}
            <View style={styles.fieldSection}>
              <Text style={[styles.sectionLabel, typography.labelMd]}>
                Categoría *
              </Text>
              <View style={styles.chipsWrap}>
                {INGREDIENT_CATEGORIES.map((catOpt) => {
                  const isSelected = category === catOpt;
                  const config = CATEGORY_CONFIG[catOpt];
                  return (
                    <Pressable
                      key={catOpt}
                      testID={`category-option-${catOpt}`}
                      style={[
                        styles.chip,
                        isSelected
                          ? [styles.chipSelected, { backgroundColor: config.color }]
                          : styles.chipUnselected,
                      ]}
                      onPress={() => setCategory(catOpt)}
                      accessibilityRole="button"
                      accessibilityLabel={`Categoría: ${catOpt}`}
                      accessibilityState={{ selected: isSelected }}
                    >
                      <MaterialIcons
                        name={config.icon as any}
                        size={16}
                        color={isSelected ? colors.onPrimary : config.color}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          styles.chipText,
                          typography.labelSm,
                          isSelected
                            ? styles.chipTextSelected
                            : styles.chipTextUnselected,
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

            {/* 5. Fecha de caducidad (Opcional) */}
            <View style={styles.fieldSection}>
              <Input
                testID="ingredient-expiration-input"
                label="Fecha de vencimiento (Opcional)"
                placeholder="AAAA-MM-DD (ej. 2026-11-15)"
                value={expirationDateText}
                onChangeText={(text) => {
                  setExpirationDateText(text);
                  if (errors.expirationDate) {
                    setErrors((prev) => ({ ...prev, expirationDate: '' }));
                  }
                }}
                error={errors.expirationDate}
                leftIcon={
                  <MaterialIcons name="event" size={20} color={colors.outline} />
                }
                accessibilityLabel="Fecha de vencimiento en formato año mes día"
              />

              <Text style={[styles.helperText, typography.bodySm]}>
                Atajos rápidos de consumo:
              </Text>

              <View style={styles.quickDatesRow}>
                <Pressable
                  testID="quick-exp-none"
                  style={styles.quickDateBtn}
                  onPress={() => handleQuickExpiration(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Sin fecha de caducidad"
                >
                  <Text style={[styles.quickDateText, typography.labelSm]}>
                    Sin fecha
                  </Text>
                </Pressable>

                <Pressable
                  testID="quick-exp-3d"
                  style={styles.quickDateBtn}
                  onPress={() => handleQuickExpiration(3)}
                  accessibilityRole="button"
                  accessibilityLabel="Vence en 3 días"
                >
                  <Text style={[styles.quickDateText, typography.labelSm]}>
                    En 3 días
                  </Text>
                </Pressable>

                <Pressable
                  testID="quick-exp-7d"
                  style={styles.quickDateBtn}
                  onPress={() => handleQuickExpiration(7)}
                  accessibilityRole="button"
                  accessibilityLabel="Vence en 1 semana"
                >
                  <Text style={[styles.quickDateText, typography.labelSm]}>
                    En 1 semana
                  </Text>
                </Pressable>

                <Pressable
                  testID="quick-exp-15d"
                  style={styles.quickDateBtn}
                  onPress={() => handleQuickExpiration(15)}
                  accessibilityRole="button"
                  accessibilityLabel="Vence en 15 días"
                >
                  <Text style={[styles.quickDateText, typography.labelSm]}>
                    En 15 días
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Si está editando, ofrecer botón de eliminar directo */}
            {isEditing && initialIngredient && onDeleteRequest && (
              <View style={styles.deleteSection}>
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
                  <MaterialIcons name="delete" size={18} color={colors.error} />
                  <Text style={[styles.deleteTriggerText, typography.labelMd]}>
                    Eliminar este alimento
                  </Text>
                </Pressable>
              </View>
            )}

            {/* Botones de acción */}
            <View style={styles.submitSection}>
              <Button
                testID="submit-ingredient-form"
                title={isEditing ? 'Guardar cambios' : 'Guardar alimento'}
                variant="primary"
                size="lg"
                fullWidth
                onPress={handleSubmit}
                loading={isSubmitting}
                leftIcon={
                  <MaterialIcons
                    name={isEditing ? 'check' : 'add'}
                    size={20}
                    color={colors.onPrimary}
                  />
                }
                accessibilityLabel={
                  isEditing ? 'Confirmar y guardar cambios' : 'Guardar nuevo ingrediente'
                }
              />

              <Button
                testID="cancel-ingredient-form"
                title="Cancelar"
                variant="outline"
                size="md"
                fullWidth
                onPress={onClose}
                disabled={isSubmitting}
                accessibilityLabel="Cancelar registro"
              />
            </View>
          </ScrollView>
        </View>
      </View>
  );
}

export function IngredientFormModal({
  visible,
  initialIngredient,
  onClose,
  onSave,
  onDeleteRequest,
}: IngredientFormModalProps) {
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

const styles = StyleSheet.create({
  overlayRoot: {
    zIndex: 1000,
    elevation: 10,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(37, 43, 58, 0.55)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    maxHeight: '90%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.margin,
    paddingBottom: spacing.xl,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  sheetDragBar: {
    width: 44,
    height: 5,
    borderRadius: radius.full,
    backgroundColor: colors.outlineVariant,
    alignSelf: 'center',
    marginBottom: spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
  },
  headerTextCol: {
    flex: 1,
    gap: 2,
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
    backgroundColor: colors.surfaceContainerLow,
  },
  buttonPressed: {
    opacity: 0.6,
  },
  scrollArea: {
    width: '100%',
  },
  scrollContent: {
    paddingVertical: spacing.xs,
    gap: spacing.md,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(186, 26, 26, 0.1)',
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  errorBannerText: {
    color: colors.error,
    flex: 1,
  },
  fieldSection: {
    gap: spacing.xs,
  },
  sectionLabel: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipUnselected: {
    backgroundColor: colors.surfaceContainerLow,
    borderColor: colors.outlineVariant,
  },
  chipText: {
    fontWeight: '600',
  },
  chipTextSelected: {
    color: colors.onPrimary,
  },
  chipTextUnselected: {
    color: colors.textPrimary,
  },
  fieldError: {
    color: colors.error,
    marginTop: 2,
  },
  helperText: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  quickDatesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  quickDateBtn: {
    backgroundColor: colors.surfaceContainerLow,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
  },
  quickDateText: {
    color: colors.textSecondary,
    fontWeight: '500',
  },
  deleteSection: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  deleteTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.xs,
  },
  deleteTriggerText: {
    color: colors.error,
    fontWeight: '600',
  },
  submitSection: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
});
