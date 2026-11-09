/**
 * Modal de confirmación accesible para eliminar un ingrediente de la despensa (Fase 2B & Fase 6B.2).
 */
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Ingredient } from '../../types/pantry';
import { AppColors, radius, spacing, useTypography, useAppTheme, useThemeStyles } from '../../theme';
import { Button } from '../common/Button';
import { useLocale } from '../../context/LocaleContext';

export interface DeleteConfirmationModalProps {
  visible: boolean;
  ingredient: Ingredient | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmationModal({
  visible,
  ingredient,
  onCancel,
  onConfirm,
}: DeleteConfirmationModalProps) {
  const typography = useTypography();
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);
  const { t } = useLocale();

  if (!visible || !ingredient) {
    return null;
  }

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.overlayRoot, styles.backdrop]}
      testID="delete-modal-backdrop"
      accessibilityRole="none"
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onCancel}
        accessibilityLabel={t('deleteModal.closeLabel')}
      />

      <View
        style={styles.modalCard}
        accessibilityRole="alert"
        accessibilityLabel={t('deleteModal.confirmLabel', { name: ingredient.name })}
      >
        <View style={styles.iconCircle}>
          <MaterialCommunityIcons name="trash-can-outline" size={32} color={colors.error} />
        </View>

        <Text style={[styles.title, typography.headlineMd]}>
          {t('deleteModal.title')}
        </Text>

        <Text style={[styles.description, typography.bodyMd]}>
          {t('deleteModal.messagePrefix')}{' '}
          <Text style={styles.boldText}>«{ingredient.name}»</Text>
          {t('deleteModal.messageSuffix')}
        </Text>

        <View style={styles.buttonsRow}>
          <View style={styles.buttonFlex}>
            <Button
              testID="delete-cancel-button"
              title={t('common.cancel')}
              variant="outline"
              size="md"
              fullWidth
              onPress={onCancel}
              accessibilityLabel={t('deleteModal.cancelLabel')}
            />
          </View>

          <View style={styles.buttonFlex}>
            <Button
              testID="delete-confirm-button"
              title={t('common.delete')}
              variant="secondary"
              size="md"
              fullWidth
              onPress={onConfirm}
              accessibilityLabel={t('deleteModal.confirmLabel', { name: ingredient.name })}
              style={{ backgroundColor: colors.error }}
              textStyle={{ color: colors.onError }}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    overlayRoot: {
      zIndex: 1100,
      elevation: 12,
    },
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.margin,
    },
    modalCard: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      padding: spacing.lg,
      alignItems: 'center',
      gap: spacing.md,
      elevation: 8,
      shadowColor: colors.cardShadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
    },
    iconCircle: {
      width: 60,
      height: 60,
      borderRadius: radius.full,
      backgroundColor: colors.errorContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      color: colors.textPrimary,
      fontWeight: '700',
      textAlign: 'center',
    },
    description: {
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
    boldText: {
      fontWeight: '700',
      color: colors.textPrimary,
    },
    buttonsRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      width: '100%',
      marginTop: spacing.xs,
    },
    buttonFlex: {
      flex: 1,
    },
  });
