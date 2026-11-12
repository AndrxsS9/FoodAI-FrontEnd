/**
 * FoodAI - Modal de Edición de Preferencias Culinarias (Fase 5B).
 * Permite ajustar presupuesto, porciones con Stepper y tiempo límite de cocción.
 */
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppColors, radius, spacing, useTypography, useThemeColors, useThemeStyles } from '../../theme';
import { useLocale } from '../../context/LocaleContext';
import { localizeMessage } from '../../locales/messages';
import { Button, Stepper } from '../common';
import {
  validateBudgetInput,
  validateMaxMinutesInput,
  validateServingsInput,
} from '../../types/recipe';
import { MAX_SERVINGS, MIN_SERVINGS } from '../../types/budget';

export interface EditPreferencesModalProps {
  visible: boolean;
  budget: number;
  servings: number;
  maxMinutes?: number | null;
  isSaving: boolean;
  saveError: string | null;
  onClose: () => void;
  onSave: (data: {
    budget: number;
    servings: number;
    maxMinutes: number | null;
  }) => Promise<void>;
}

export function EditPreferencesModal(props: EditPreferencesModalProps) {
  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="slide"
      onRequestClose={props.onClose}
      testID="edit-preferences-modal"
    >
      {props.visible ? <EditPreferencesForm {...props} /> : null}
    </Modal>
  );
}

function EditPreferencesForm({
  budget,
  servings,
  maxMinutes,
  isSaving,
  saveError,
  onClose,
  onSave,
}: EditPreferencesModalProps) {
  const typography = useTypography();
  const colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const { t, tp, locale, format } = useLocale();
  const localizedSaveError = localizeMessage(saveError, locale, {
    fallbackKey: 'messages.budget.savePreferencesFailed',
  });
  const localizeFieldError = (message?: string) =>
    localizeMessage(message, locale, { fallbackKey: 'messages.budget.fallback' });

  const [tempBudget, setTempBudget] = useState(String(budget));
  const [tempServings, setTempServings] = useState(servings);
  const [hasTimeLimit, setHasTimeLimit] = useState(
    maxMinutes !== undefined && maxMinutes !== null
  );
  const [tempMaxMinutes, setTempMaxMinutes] = useState(
    maxMinutes ? String(maxMinutes) : '30'
  );
  const [inputErrors, setInputErrors] = useState<{
    budget?: string;
    servings?: string;
    maxMinutes?: string;
  }>({});

  const handleSave = async () => {
    if (isSaving) return;
    const errors: { budget?: string; servings?: string; maxMinutes?: string } = {};

    // 1. Validar presupuesto
    const sanitizedBudget = tempBudget.trim().replace(/[.,\s]/g, '');
    if (!sanitizedBudget) {
      errors.budget = 'Por favor ingresa un monto de presupuesto.';
    } else {
      const parsedBudget = Number(sanitizedBudget);
      const budgetValidation = validateBudgetInput(parsedBudget);
      if (!budgetValidation.isValid) {
        errors.budget = budgetValidation.error;
      }
    }

    // 2. Validar porciones
    const servingsValidation = validateServingsInput(tempServings);
    if (!servingsValidation.isValid) {
      errors.servings = servingsValidation.error;
    }

    // 3. Validar tiempo máximo opcional
    let parsedMinutesToSave: number | null = null;
    if (hasTimeLimit) {
      const sanitizedMinutes = tempMaxMinutes.trim();
      if (!sanitizedMinutes) {
        errors.maxMinutes = 'Por favor indica el tiempo máximo en minutos.';
      } else {
        const parsedMinutes = Number(sanitizedMinutes);
        const timeValidation = validateMaxMinutesInput(parsedMinutes);
        if (!timeValidation.isValid) {
          errors.maxMinutes = timeValidation.error;
        } else {
          parsedMinutesToSave = parsedMinutes;
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setInputErrors(errors);
      return;
    }

    const finalBudget = Math.round(Number(sanitizedBudget));
    await onSave({
      budget: finalBudget,
      servings: tempServings,
      maxMinutes: hasTimeLimit ? parsedMinutesToSave : null,
    });
  };

  return (
    <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={onClose}
          accessibilityLabel={t('profile.editPreferences.closeBackdropLabel')}
        />

        <View style={styles.modalSheetContainer}>
          <View style={styles.modalDragHandle} />

          <View style={styles.modalHeaderRow}>
            <View style={styles.modalHeaderTitleBox}>
              <MaterialCommunityIcons name="tune" size={24} color={colors.primary} />
              <Text style={[styles.modalTitleText, typography.headlineMd]}>
                {t('profile.editPreferences.title')}
              </Text>
            </View>

            <Pressable
              onPress={onClose}
              style={styles.modalCloseButton}
              accessibilityRole="button"
              accessibilityLabel={t('profile.editPreferences.closeLabel')}
              disabled={isSaving}
              testID="close-edit-modal-button"
            >
              <MaterialCommunityIcons name="close" size={20} color={colors.textPrimary} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.modalScrollContent}
          >
            {/* Banner de error de guardado si ocurre */}
            {localizedSaveError && (
              <View
                style={styles.modalErrorBanner}
                accessibilityRole="alert"
                testID="edit-preferences-save-error"
              >
                <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.error} />
                <Text style={[styles.modalErrorBannerText, typography.bodySm]}>
                  {localizedSaveError}
                </Text>
              </View>
            )}

            {/* Campo 1: Presupuesto por comida */}
            <View style={styles.modalFieldGroup}>
              <View style={styles.fieldHeaderRow}>
                <Text style={[styles.fieldLabel, typography.labelMd]}>
                  {t('profile.editPreferences.budgetField')}
                </Text>
                <Text style={[styles.fieldHint, typography.labelSm]}>
                  {format.currency(Number(tempBudget.trim().replace(/[.,\s]/g, '')) || 0)}
                </Text>
              </View>

              <View
                style={[
                  styles.textInputWrapper,
                  inputErrors.budget && styles.textInputWrapperError,
                ]}
              >
                <Text style={[styles.currencyPrefix, typography.bodyLg]}>$</Text>
                <TextInput
                  style={[styles.textInputField, typography.bodyLg]}
                  value={tempBudget}
                  onChangeText={(val) => {
                    setTempBudget(val);
                    if (inputErrors.budget) {
                      setInputErrors((prev) => ({ ...prev, budget: undefined }));
                    }
                  }}
                  placeholder="20000"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="numeric"
                  autoFocus={false}
                  accessibilityLabel={t('profile.editPreferences.budgetInputLabel')}
                  testID="budget-input"
                  editable={!isSaving}
                />
                {tempBudget.length > 0 && !isSaving && (
                  <Pressable
                    onPress={() => setTempBudget('')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel={t('profile.editPreferences.clearBudgetLabel')}
                  >
                    <MaterialCommunityIcons name="close-circle-outline" size={18} color={colors.outline} />
                  </Pressable>
                )}
              </View>

              {inputErrors.budget && (
                <Text
                  style={[styles.fieldErrorText, typography.bodySm]}
                  testID="budget-input-error"
                >
                  {localizeFieldError(inputErrors.budget)}
                </Text>
              )}
              <Text style={[styles.fieldHelperText, typography.bodySm]}>
                {t('profile.editPreferences.budgetHelper')}
              </Text>
            </View>

            {/* Campo 2: Porciones habituales */}
            <View style={styles.modalFieldGroup}>
              <View style={styles.fieldHeaderRow}>
                <Text style={[styles.fieldLabel, typography.labelMd]}>
                  {t('profile.editPreferences.servingsField')}
                </Text>
                <Text style={[styles.fieldHint, typography.labelSm]}>
                  {t('profile.editPreferences.servingsRange')}
                </Text>
              </View>

              <View style={styles.stepperCenterRow}>
                <Stepper
                  value={tempServings}
                  onChange={(val) => {
                    setTempServings(val);
                    if (inputErrors.servings) {
                      setInputErrors((prev) => ({ ...prev, servings: undefined }));
                    }
                  }}
                  min={MIN_SERVINGS}
                  max={MAX_SERVINGS}
                  step={1}
                  unit={tp('personUnit', tempServings)}
                  disabled={isSaving}
                  accessibilityLabel={t('profile.editPreferences.servingsStepperLabel')}
                  testID="servings-stepper"
                />
              </View>

              {inputErrors.servings && (
                <Text
                  style={[styles.fieldErrorText, typography.bodySm]}
                  testID="servings-input-error"
                >
                  {localizeFieldError(inputErrors.servings)}
                </Text>
              )}
            </View>

            {/* Campo 3: Tiempo máximo de cocción */}
            <View style={styles.modalFieldGroup}>
              <View style={styles.fieldHeaderRow}>
                <Text style={[styles.fieldLabel, typography.labelMd]}>
                  {t('profile.editPreferences.timeField')}
                </Text>
                <Pressable
                  style={styles.toggleLimitButton}
                  onPress={() => {
                    setHasTimeLimit((prev) => !prev);
                    if (inputErrors.maxMinutes) {
                      setInputErrors((prev) => ({ ...prev, maxMinutes: undefined }));
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={
                    hasTimeLimit
                      ? t('profile.editPreferences.removeLimitLabel')
                      : t('profile.editPreferences.setLimitLabel')
                  }
                  disabled={isSaving}
                  testID="toggle-max-minutes"
                >
                  <MaterialCommunityIcons
                    name={hasTimeLimit ? 'checkbox-marked' : 'checkbox-blank-outline'}
                    size={20}
                    color={hasTimeLimit ? colors.primary : colors.outline}
                  />
                  <Text
                    style={[
                      styles.toggleLimitText,
                      typography.labelSm,
                      hasTimeLimit && styles.toggleLimitTextActive,
                    ]}
                  >
                    {hasTimeLimit ? t('profile.editPreferences.withLimit') : t('profile.editPreferences.withoutLimit')}
                  </Text>
                </Pressable>
              </View>

              {hasTimeLimit ? (
                <View style={styles.timeLimitInputContainer}>
                  <View
                    style={[
                      styles.textInputWrapper,
                      inputErrors.maxMinutes && styles.textInputWrapperError,
                    ]}
                  >
                    <TextInput
                      style={[styles.textInputField, typography.bodyLg]}
                      value={tempMaxMinutes}
                      onChangeText={(val) => {
                        setTempMaxMinutes(val);
                        if (inputErrors.maxMinutes) {
                          setInputErrors((prev) => ({
                            ...prev,
                            maxMinutes: undefined,
                          }));
                        }
                      }}
                      placeholder="30"
                      placeholderTextColor={colors.textTertiary}
                      keyboardType="numeric"
                      accessibilityLabel={t('profile.editPreferences.minutesInputLabel')}
                      testID="max-minutes-input"
                      editable={!isSaving}
                    />
                    <Text style={[styles.unitSuffix, typography.bodyLg]}>{t('profile.editPreferences.minutesSuffix')}</Text>
                  </View>

                  {inputErrors.maxMinutes && (
                    <Text
                      style={[styles.fieldErrorText, typography.bodySm]}
                      testID="max-minutes-input-error"
                    >
                      {localizeFieldError(inputErrors.maxMinutes)}
                    </Text>
                  )}

                  <View style={styles.quickTimeChipsRow}>
                    {[15, 30, 45, 60].map((mins) => (
                      <Pressable
                        key={mins}
                        style={[
                          styles.quickTimeChip,
                          tempMaxMinutes === String(mins) &&
                            styles.quickTimeChipActive,
                        ]}
                        onPress={() => setTempMaxMinutes(String(mins))}
                        accessibilityRole="button"
                        accessibilityLabel={tp('minutesLong', mins)}
                        disabled={isSaving}
                      >
                        <Text
                          style={[
                            styles.quickTimeChipText,
                            typography.labelSm,
                            tempMaxMinutes === String(mins) &&
                              styles.quickTimeChipTextActive,
                          ]}
                        >
                          {t('minutesShort', { count: mins })}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : (
                <View style={styles.unlimitedTimeNote}>
                  <MaterialCommunityIcons
                    name="all-inclusive"
                    size={20}
                    color={colors.outline}
                  />
                  <Text style={[styles.unlimitedTimeText, typography.bodySm]}>
                    {t('profile.editPreferences.unlimitedNote')}
                  </Text>
                </View>
              )}
            </View>

            {/* Botones de acción del modal */}
            <View style={styles.modalActionButtonsRow}>
              <Button
                testID="cancel-preferences-button"
                title={t('common.cancel')}
                variant="outline"
                size="md"
                onPress={onClose}
                disabled={isSaving}
                style={styles.modalCancelButton}
              />

              <Button
                testID="save-preferences-button"
                title={isSaving ? t('profile.editPreferences.saving') : t('profile.editPreferences.save')}
                variant="primary"
                size="md"
                onPress={handleSave}
                disabled={isSaving}
                loading={isSaving}
                style={styles.modalSaveButton}
                leftIcon={
                  !isSaving ? (
                    <MaterialCommunityIcons
                      name="check"
                      size={18}
                      color={colors.onPrimary}
                    />
                  ) : undefined
                }
              />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
  },
  modalSheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.md,
  },
  modalDragHandle: {
    width: 44,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.margin,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  modalHeaderTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  modalTitleText: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScrollContent: {
    padding: spacing.margin,
    gap: spacing.lg,
  },
  modalErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorContainer,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  modalErrorBannerText: {
    color: colors.error,
    flex: 1,
  },
  modalFieldGroup: {
    gap: spacing.xs,
  },
  fieldHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldLabel: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  fieldHint: {
    color: colors.primary,
    fontWeight: '700',
  },
  textInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  textInputWrapperError: {
    borderColor: colors.error,
  },
  currencyPrefix: {
    color: colors.textPrimary,
    fontWeight: '700',
    marginRight: spacing.xs,
  },
  unitSuffix: {
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  textInputField: {
    flex: 1,
    color: colors.textPrimary,
    paddingVertical: 10,
  },
  fieldErrorText: {
    color: colors.error,
    marginTop: 2,
  },
  fieldHelperText: {
    color: colors.textSecondary,
    marginTop: 2,
  },
  stepperCenterRow: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  toggleLimitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 4,
    paddingHorizontal: spacing.xs,
  },
  toggleLimitText: {
    color: colors.outline,
    fontWeight: '600',
  },
  toggleLimitTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  timeLimitInputContainer: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  quickTimeChipsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickTimeChip: {
    flex: 1,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTimeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  quickTimeChipText: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  quickTimeChipTextActive: {
    color: colors.onPrimary,
    fontWeight: '700',
  },
  unlimitedTimeNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.xs,
  },
  unlimitedTimeText: {
    color: colors.textSecondary,
    flex: 1,
  },
  modalActionButtonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  modalCancelButton: {
    flex: 1,
  },
  modalSaveButton: {
    flex: 2,
  },
});
