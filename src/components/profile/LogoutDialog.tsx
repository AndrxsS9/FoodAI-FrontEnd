/**
 * FoodAI - Diálogo y Botón Discreto de Cierre de Sesión (Fase 5B).
 * Proporciona un flujo de salida seguro, respetuoso y con confirmación explícita.
 */
import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppColors, radius, spacing, useTypography, useThemeColors, useThemeStyles } from '../../theme';
import { useLocale } from '../../context/LocaleContext';
import { localizeMessage } from '../../locales/messages';
import { Button } from '../common';

export interface LogoutDialogProps {
  visible: boolean;
  isLoggingOut: boolean;
  error: string | null;
  onOpenDialog: () => void;
  onCloseDialog: () => void;
  onConfirmLogout: () => Promise<void>;
}

export function LogoutDialog({
  visible,
  isLoggingOut,
  error,
  onOpenDialog,
  onCloseDialog,
  onConfirmLogout,
}: LogoutDialogProps) {
  const typography = useTypography();
  const colors = useThemeColors();
  const styles = useThemeStyles(createStyles);
  const { t, locale } = useLocale();
  const localizedError = localizeMessage(error, locale, { fallbackKey: 'messages.profile.logoutFailed' });

  return (
    <View style={styles.logoutSection}>
      <Pressable
        style={({ pressed }) => [
          styles.logoutButton,
          isLoggingOut && styles.buttonDisabled,
          pressed && !isLoggingOut && styles.logoutButtonPressed,
        ]}
        onPress={onOpenDialog}
        disabled={isLoggingOut}
        accessibilityRole="button"
        accessibilityLabel={t('profile.logout.button')}
        accessibilityHint={t('profile.logout.buttonHint')}
        testID="btn-logout"
      >
        {isLoggingOut ? (
          <ActivityIndicator size="small" color={colors.secondary} />
        ) : (
          <>
            <MaterialCommunityIcons name="logout" size={18} color={colors.secondary} />
            <Text style={[styles.logoutButtonText, typography.labelMd]}>
              {t('profile.logout.button')}
            </Text>
          </>
        )}
      </Pressable>

      <Text style={[styles.logoutCaptionText, typography.bodySm]}>
        {t('profile.logout.caption')}
      </Text>

      {/* Modal de confirmación de cierre de sesión */}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isLoggingOut) onCloseDialog();
        }}
        testID="logout-confirm-modal"
      >
        <View style={styles.dialogOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!isLoggingOut) onCloseDialog();
            }}
            accessibilityLabel={t('profile.logout.closeDialogLabel')}
          />

          <View style={styles.dialogCard}>
            <View style={styles.dialogIconBox}>
              <MaterialCommunityIcons name="logout" size={32} color={colors.secondary} />
            </View>

            <Text
              style={[styles.dialogTitle, typography.headlineMd]}
              testID="logout-dialog-title"
            >
              {t('profile.logout.dialogTitle')}
            </Text>

            <Text style={[styles.dialogMessage, typography.bodyMd]}>
              {t('profile.logout.dialogMessage')}
            </Text>

            {localizedError && (
              <View style={styles.dialogErrorBox} testID="logout-error-banner">
                <Text style={[styles.dialogErrorText, typography.bodySm]}>
                  {localizedError}
                </Text>
              </View>
            )}

            <View style={styles.dialogButtonsCol}>
              <Button
                testID="logout-confirm-button"
                title={isLoggingOut ? t('profile.logout.loggingOut') : t('profile.logout.button')}
                variant="secondary"
                size="md"
                fullWidth
                onPress={onConfirmLogout}
                disabled={isLoggingOut}
                loading={isLoggingOut}
              />

              <Button
                testID="logout-cancel-button"
                title={t('common.cancel')}
                variant="outline"
                size="md"
                fullWidth
                disabled={isLoggingOut}
                onPress={onCloseDialog}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  logoutSection: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    alignItems: 'center',
    gap: spacing.xs,
    width: '100%',
  },
  logoutButton: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: 'transparent',
  },
  logoutButtonPressed: {
    backgroundColor: 'rgba(233, 119, 94, 0.12)',
    transform: [{ scale: 0.99 }],
  },
  logoutButtonText: {
    color: colors.secondary,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  logoutCaptionText: {
    color: colors.outline,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    fontSize: 12,
  },

  // Modal styles
  dialogOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
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
