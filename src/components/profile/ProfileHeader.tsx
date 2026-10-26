/**
 * FoodAI - Cabecera personalizada de perfil de usuario (Fase 5B).
 * Muestra el avatar con iniciales dinámicas, el nombre editable del usuario,
 * su correo autenticado con indicador de verificación y el disparador de edición.
 */
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, radius, spacing, useTypography } from '../../theme';
import { AuthUser, getAvatarInitials, getUserDisplayName } from '../../types/auth';
import { Button } from '../common';

export interface ProfileHeaderProps {
  user: AuthUser | null;
  onUpdateDisplayName: (newName: string) => Promise<void>;
  isUpdatingName?: boolean;
}

export function ProfileHeader({
  user,
  onUpdateDisplayName,
  isUpdatingName = false,
}: ProfileHeaderProps) {
  const typography = useTypography();
  const displayName = getUserDisplayName(user);
  const email = user?.email ?? 'correo@no-disponible.com';
  const initials = getAvatarInitials(displayName || email);
  const isEmailVerified = Boolean(user?.email_confirmed_at || user?.confirmed_at);

  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [tempName, setTempName] = useState(displayName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleOpenEditModal = () => {
    setTempName(displayName);
    setNameError(null);
    setSubmitError(null);
    setIsEditModalVisible(true);
  };

  const handleCloseEditModal = () => {
    if (isUpdatingName) return;
    setIsEditModalVisible(false);
    setNameError(null);
    setSubmitError(null);
  };

  const handleSaveName = async () => {
    const trimmed = tempName.trim();
    if (!trimmed) {
      setNameError('Por favor ingresa tu nombre.');
      return;
    }

    setSubmitError(null);
    setNameError(null);

    try {
      await onUpdateDisplayName(trimmed);
      setIsEditModalVisible(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al guardar el nombre.';
      setSubmitError(msg);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.avatarSection}>
          <View
            style={styles.avatarCircle}
            accessibilityRole="image"
            accessibilityLabel={`Avatar con iniciales ${initials}`}
            testID="profile-avatar-initials"
          >
            <Text style={[styles.avatarText, typography.headlineMd]}>{initials}</Text>
          </View>
        </View>

        <View style={styles.infoSection}>
          <View style={styles.nameRow}>
            <Text
              style={[styles.displayName, typography.headlineMd]}
              numberOfLines={1}
              accessibilityRole="header"
              testID="profile-display-name"
            >
              {displayName}
            </Text>
            <Pressable
              onPress={handleOpenEditModal}
              style={({ pressed }) => [
                styles.editNameButton,
                pressed && styles.editNameButtonPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Editar nombre de usuario"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              testID="btn-edit-name"
            >
              <MaterialIcons name="edit" size={16} color={colors.primary} />
            </Pressable>
          </View>

          <View style={styles.emailRow}>
            <MaterialIcons name="alternate-email" size={14} color={colors.outline} />
            <Text
              style={[styles.emailText, typography.bodySm]}
              numberOfLines={1}
              testID="profile-email"
            >
              {email}
            </Text>
            {isEmailVerified ? (
              <View
                style={styles.verifiedBadge}
                accessibilityLabel="Correo electrónico verificado"
                testID="profile-email-badge"
              >
                <MaterialIcons name="check-circle" size={12} color={colors.success} />
                <Text style={[styles.verifiedBadgeText, typography.labelSm]}>Verificado</Text>
              </View>
            ) : (
              <View
                style={styles.unverifiedBadge}
                accessibilityLabel="Correo electrónico sin verificar"
                testID="profile-email-badge"
              >
                <MaterialIcons name="schedule" size={12} color={colors.warning} />
                <Text style={[styles.unverifiedBadgeText, typography.labelSm]}>Sin verificar</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Modal para editar nombre de usuario */}
      <Modal
        visible={isEditModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseEditModal}
        testID="edit-name-modal"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={handleCloseEditModal}
            accessibilityLabel="Cerrar modal de edición de nombre"
          />

          <View style={styles.dialogCard}>
            <View style={styles.dialogHeader}>
              <View style={styles.dialogIconBox}>
                <MaterialIcons name="person" size={24} color={colors.primary} />
              </View>
              <Text style={[styles.dialogTitle, typography.headlineMd]}>
                Editar nombre
              </Text>
            </View>

            <Text style={[styles.dialogSubtitle, typography.bodySm]}>
              Ingresa el nombre con el que te identificarás en FoodAI.
            </Text>

            {submitError && (
              <View style={styles.errorBox} testID="edit-name-submit-error">
                <MaterialIcons name="error-outline" size={16} color={colors.error} />
                <Text style={[styles.errorText, typography.bodySm]}>{submitError}</Text>
              </View>
            )}

            <View style={styles.inputContainer}>
              <View
                style={[
                  styles.inputWrapper,
                  nameError && styles.inputWrapperError,
                ]}
              >
                <TextInput
                  style={[styles.inputField, typography.bodyLg]}
                  value={tempName}
                  onChangeText={(val) => {
                    setTempName(val);
                    if (nameError) setNameError(null);
                    if (submitError) setSubmitError(null);
                  }}
                  placeholder="Tu nombre completo"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="words"
                  autoCorrect={false}
                  editable={!isUpdatingName}
                  accessibilityLabel="Nombre de usuario"
                  testID="name-input"
                />
                {tempName.length > 0 && !isUpdatingName && (
                  <Pressable
                    onPress={() => setTempName('')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="Borrar nombre"
                  >
                    <MaterialIcons name="cancel" size={18} color={colors.outline} />
                  </Pressable>
                )}
              </View>

              {nameError && (
                <Text style={[styles.fieldErrorText, typography.bodySm]} testID="edit-name-error">
                  {nameError}
                </Text>
              )}
            </View>

            <View style={styles.dialogActionsRow}>
              <Button
                testID="cancel-name-button"
                title="Cancelar"
                variant="outline"
                size="md"
                onPress={handleCloseEditModal}
                disabled={isUpdatingName}
                style={styles.dialogCancelBtn}
              />

              <Button
                testID="save-name-button"
                title={isUpdatingName ? 'Guardando...' : 'Guardar'}
                variant="primary"
                size="md"
                onPress={handleSaveName}
                disabled={isUpdatingName}
                loading={isUpdatingName}
                style={styles.dialogSaveBtn}
                leftIcon={
                  !isUpdatingName ? (
                    <MaterialIcons name="check" size={16} color={colors.onPrimary} />
                  ) : undefined
                }
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarSection: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(243, 201, 105, 0.4)',
  },
  avatarText: {
    color: colors.primary,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  infoSection: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  displayName: {
    color: colors.textPrimary,
    fontWeight: '700',
    flexShrink: 1,
  },
  editNameButton: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: 'rgba(91, 75, 138, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editNameButtonPressed: {
    backgroundColor: 'rgba(91, 75, 138, 0.16)',
    transform: [{ scale: 0.95 }],
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  emailText: {
    color: colors.textSecondary,
    flexShrink: 1,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.successContainer,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.full,
    marginLeft: 4,
  },
  verifiedBadgeText: {
    color: colors.success,
    fontSize: 10,
    fontWeight: '700',
  },
  unverifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(237, 108, 2, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.full,
    marginLeft: 4,
  },
  unverifiedBadgeText: {
    color: colors.warning,
    fontSize: 10,
    fontWeight: '700',
  },

  // Modal styles
  modalOverlay: {
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
    gap: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },
  dialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dialogIconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: 'rgba(91, 75, 138, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  dialogSubtitle: {
    color: colors.textSecondary,
    lineHeight: 18,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorContainer,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  errorText: {
    color: colors.error,
    flex: 1,
  },
  inputContainer: {
    gap: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  inputWrapperError: {
    borderColor: colors.error,
  },
  inputField: {
    flex: 1,
    color: colors.textPrimary,
    paddingVertical: 8,
  },
  fieldErrorText: {
    color: colors.error,
    marginTop: 2,
  },
  dialogActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  dialogCancelBtn: {
    flex: 1,
  },
  dialogSaveBtn: {
    flex: 1.5,
  },
});
