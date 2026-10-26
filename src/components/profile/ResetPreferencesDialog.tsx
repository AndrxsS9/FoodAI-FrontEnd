/**
 * FoodAI - Diálogo y Botón de Restablecimiento de Preferencias (Fase 5B).
 * Acción sobria con confirmación modal para restaurar valores culinarios de fábrica.
 */
import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, radius, spacing, useTypography } from '../../theme';
import { Button } from '../common';

export interface ResetPreferencesDialogProps {
  visible: boolean;
  isResetting: boolean;
  isLoading: boolean;
  error: string | null;
  onOpenDialog: () => void;
  onCloseDialog: () => void;
  onConfirmReset: () => Promise<void>;
}

export function ResetPreferencesDialog({
  visible,
  isResetting,
  isLoading,
  error,
  onOpenDialog,
  onCloseDialog,
  onConfirmReset,
}: ResetPreferencesDialogProps) {
  const typography = useTypography();

  return (
    <View style={styles.resetSection}>
      <Pressable
        style={({ pressed }) => [
          styles.resetButton,
          (isLoading || isResetting) && styles.buttonDisabled,
          pressed && !(isLoading || isResetting) && styles.resetButtonPressed,
        ]}
        onPress={onOpenDialog}
        disabled={isLoading || isResetting}
        accessibilityRole="button"
        accessibilityState={{ disabled: isLoading || isResetting, busy: isLoading }}
        accessibilityLabel={
          isLoading
            ? 'Cargando preferencias guardadas. Por favor espera.'
            : 'Restablecer preferencias a los valores iniciales'
        }
        testID="btn-reset-preferences"
      >
        <MaterialIcons
          name="restart-alt"
          size={20}
          color={isLoading || isResetting ? colors.outline : colors.secondary}
        />
        <Text
          style={[
            styles.resetButtonText,
            typography.labelMd,
            (isLoading || isResetting) && styles.textDisabled,
          ]}
        >
          {isLoading ? 'Cargando preferencias...' : 'Restablecer preferencias'}
        </Text>
      </Pressable>

      <Text style={[styles.resetCaptionText, typography.bodySm]}>
        Tus datos de despensa y recetas permanecen guardados en este dispositivo.
      </Text>

      {/* Modal de confirmación */}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isResetting) onCloseDialog();
        }}
        testID="reset-confirm-modal"
      >
        <View style={styles.dialogOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!isResetting) onCloseDialog();
            }}
            accessibilityLabel="Cerrar diálogo de confirmación"
          />

          <View style={styles.dialogCard}>
            <View style={styles.dialogIconBox}>
              <MaterialIcons name="restart-alt" size={32} color={colors.secondary} />
            </View>

            <Text
              style={[styles.dialogTitle, typography.headlineMd]}
              testID="reset-dialog-title"
            >
              ¿Restablecer preferencias?
            </Text>

            <Text style={[styles.dialogMessage, typography.bodyMd]}>
              Se restaurará el presupuesto a $20.000 COP, las porciones a 2 personas y se eliminará el límite de tiempo. Tus alimentos en la despensa y recetas guardadas no se verán afectados.
            </Text>

            {error && (
              <View style={styles.dialogErrorBox}>
                <Text style={[styles.dialogErrorText, typography.bodySm]}>
                  {error}
                </Text>
              </View>
            )}

            <View style={styles.dialogButtonsCol}>
              <Button
                testID="reset-confirm-button"
                title={isResetting ? 'Restableciendo...' : 'Sí, restablecer preferencias'}
                variant="secondary"
                size="md"
                fullWidth
                onPress={onConfirmReset}
                disabled={isResetting || isLoading}
                loading={isResetting}
              />

              <Button
                testID="reset-cancel-button"
                title="Cancelar"
                variant="outline"
                size="md"
                fullWidth
                onPress={onCloseDialog}
                disabled={isResetting}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  resetSection: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.xs,
    width: '100%',
  },
  resetButton: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(233, 119, 94, 0.08)',
  },
  resetButtonPressed: {
    backgroundColor: 'rgba(233, 119, 94, 0.16)',
    transform: [{ scale: 0.99 }],
  },
  resetButtonText: {
    color: colors.secondary,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  textDisabled: {
    color: colors.outline,
  },
  resetCaptionText: {
    color: colors.outline,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    fontSize: 12,
  },

  // Modal styles
  dialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
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
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },
  dialogIconBox: {
    width: 60,
    height: 60,
    borderRadius: radius.full,
    backgroundColor: 'rgba(233, 119, 94, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogTitle: {
    color: colors.textPrimary,
    textAlign: 'center',
    fontWeight: '700',
  },
  dialogMessage: {
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  dialogErrorBox: {
    backgroundColor: colors.errorContainer,
    borderRadius: radius.md,
    padding: spacing.sm,
    width: '100%',
  },
  dialogErrorText: {
    color: colors.error,
    textAlign: 'center',
  },
  dialogButtonsCol: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
