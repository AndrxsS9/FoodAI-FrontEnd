import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { isValidEmail, isValidPassword, MIN_PASSWORD_LENGTH } from '../../src/types/auth';
import { colors, radius, spacing, useTypography } from '../../src/theme';

export default function RegisterScreen() {
  const typography = useTypography();
  const router = useRouter();
  const { signUp, isSubmitting, authError, clearAuthError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [localError, setLocalError] = useState<string | null>(null);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false);

  // Estado para la confirmación de correo pendiente (Fase 5 - Sección 9)
  const [isConfirmationPending, setIsConfirmationPending] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  const trimmedEmail = email.trim();
  const isEmailValid = isValidEmail(trimmedEmail);
  const isPasswordLengthValid = isValidPassword(password);
  const doPasswordsMatch = password === confirmPassword;

  const emailError =
    emailTouched && trimmedEmail.length > 0 && !isEmailValid
      ? 'Ingresa un correo electrónico con formato válido.'
      : null;

  const passwordError =
    passwordTouched && password.length > 0 && !isPasswordLengthValid
      ? `La contraseña debe contener al menos ${MIN_PASSWORD_LENGTH} caracteres.`
      : null;

  const confirmPasswordError =
    confirmPasswordTouched && confirmPassword.length > 0 && !doPasswordsMatch
      ? 'Las contraseñas no coinciden.'
      : null;

  const isFormComplete =
    trimmedEmail.length > 0 &&
    password.length >= MIN_PASSWORD_LENGTH &&
    confirmPassword.length > 0 &&
    doPasswordsMatch;

  const handleEmailChange = (text: string) => {
    setEmail(text);
    if (localError) setLocalError(null);
    if (authError) clearAuthError();
  };

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    if (localError) setLocalError(null);
    if (authError) clearAuthError();
  };

  const handleConfirmPasswordChange = (text: string) => {
    setConfirmPassword(text);
    if (localError) setLocalError(null);
    if (authError) clearAuthError();
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;

    setEmailTouched(true);
    setPasswordTouched(true);
    setConfirmPasswordTouched(true);

    if (!trimmedEmail) {
      setLocalError('Por favor, ingresa tu correo electrónico.');
      return;
    }

    if (!isEmailValid) {
      setLocalError('Por favor, ingresa un correo electrónico válido.');
      return;
    }

    if (!password) {
      setLocalError('Por favor, ingresa una contraseña.');
      return;
    }

    if (!isPasswordLengthValid) {
      setLocalError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }

    if (!doPasswordsMatch) {
      setLocalError('Las contraseñas no coinciden.');
      return;
    }

    setLocalError(null);
    clearAuthError();

    try {
      const result = await signUp(trimmedEmail, password);

      if (result.confirmationPending) {
        // Correo de confirmación habilitado en Supabase (Sección 9)
        setRegisteredEmail(trimmedEmail);
        setIsConfirmationPending(true);
      } else if (result.session) {
        // Sesión activa directa (sin confirmación obligatoria en Supabase)
        router.replace('/(tabs)');
      } else {
        setRegisteredEmail(trimmedEmail);
        setIsConfirmationPending(true);
      }
    } catch {
      // El error es manejado y propagado por AuthContext
    }
  };

  const displayedError = localError || authError;

  // Vista de confirmación de correo pendiente
  if (isConfirmationPending) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.confirmationContainer} testID="register-confirmation-card">
          <View style={styles.confirmationIconBox}>
            <MaterialIcons name="mark-email-read" size={48} color={colors.primary} />
          </View>

          <Text style={[styles.headline, typography.headlineLg]} accessibilityRole="header">
            Verifica tu correo electrónico
          </Text>

          <Text style={[styles.confirmationMessage, typography.bodyMd]}>
            Hemos enviado un enlace de confirmación a:
          </Text>

          <View style={styles.emailPill}>
            <Text style={[styles.emailPillText, typography.labelLg]}>
              {registeredEmail}
            </Text>
          </View>

          <Text style={[styles.confirmationSubtext, typography.bodySm]}>
            1. Revisa tu bandeja de entrada y confirma tu cuenta abriendo el enlace en tu navegador web.
            {'\n\n'}
            2. Una vez confirmada tu cuenta en el navegador, regresa a FoodAI e inicia sesión manualmente con tu correo y contraseña.
          </Text>

          <Pressable
            testID="confirmation-go-login-button"
            style={({ pressed }) => [
              styles.submitButton,
              styles.confirmationButton,
              pressed && styles.submitButtonPressed,
            ]}
            onPress={() => {
              clearAuthError();
              router.replace('/(auth)/login');
            }}
            accessibilityRole="button"
            accessibilityLabel="Ir a iniciar sesión"
          >
            <Text style={[styles.submitButtonText, typography.labelLg]}>
              Ir a iniciar sesión
            </Text>
            <MaterialIcons name="arrow-forward" size={20} color={colors.onPrimary} />
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Encabezado */}
          <View style={styles.headerSection}>
            <View
              style={styles.categoryBadge}
              accessibilityRole="text"
              accessibilityLabel="Categoría: Nueva cuenta"
            >
              <MaterialIcons name="eco" size={16} color={colors.primary} />
              <Text style={[styles.categoryBadgeText, typography.labelSm]}>
                HOGAR INTELIGENTE
              </Text>
            </View>

            <Text
              style={[styles.headline, typography.headlineXl]}
              accessibilityRole="header"
            >
              Crear cuenta
            </Text>

            <Text style={[styles.subtitle, typography.bodyMd]}>
              Regístrate para planificar tus comidas, registrar tu despensa y cocinar sin desperdiciar alimentos.
            </Text>
          </View>

          {/* Tarjeta del formulario */}
          <View style={styles.formCard} testID="register-card">
            {/* Mensaje de error visible */}
            {displayedError ? (
              <View
                style={styles.errorBox}
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
                testID="register-error-message"
              >
                <MaterialIcons name="error-outline" size={20} color={colors.error} />
                <Text style={[styles.errorBoxText, typography.bodySm]}>
                  {displayedError}
                </Text>
              </View>
            ) : null}

            {/* Campo: Correo electrónico */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, typography.labelMd]}>
                Correo electrónico
              </Text>
              <View
                style={[
                  styles.inputWrapper,
                  emailError ? styles.inputWrapperError : undefined,
                ]}
              >
                <MaterialIcons
                  name="mail-outline"
                  size={20}
                  color={emailError ? colors.error : colors.outline}
                  style={styles.inputIcon}
                />
                <TextInput
                  testID="register-email-input"
                  style={[styles.textInput, typography.bodyMd]}
                  placeholder="ejemplo@correo.com"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={email}
                  onChangeText={handleEmailChange}
                  onBlur={() => setEmailTouched(true)}
                  editable={!isSubmitting}
                  accessibilityLabel="Correo electrónico"
                  accessibilityHint="Ingresa una dirección de correo para tu nueva cuenta"
                />
              </View>
              {emailError ? (
                <Text style={[styles.fieldErrorText, typography.bodySm]}>
                  {emailError}
                </Text>
              ) : null}
            </View>

            {/* Campo: Contraseña */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, typography.labelMd]}>
                Contraseña
              </Text>
              <View
                style={[
                  styles.inputWrapper,
                  passwordError ? styles.inputWrapperError : undefined,
                ]}
              >
                <MaterialIcons
                  name="lock-outline"
                  size={20}
                  color={passwordError ? colors.error : colors.outline}
                  style={styles.inputIcon}
                />
                <TextInput
                  testID="register-password-input"
                  style={[styles.textInput, typography.bodyMd]}
                  placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
                  placeholderTextColor={colors.textSecondary}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={password}
                  onChangeText={handlePasswordChange}
                  onBlur={() => setPasswordTouched(true)}
                  editable={!isSubmitting}
                  accessibilityLabel="Contraseña"
                  accessibilityHint={`Ingresa una contraseña segura de al menos ${MIN_PASSWORD_LENGTH} caracteres`}
                />
                <Pressable
                  testID="register-password-toggle"
                  style={styles.toggleButton}
                  onPress={() => setShowPassword((prev) => !prev)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  <MaterialIcons
                    name={showPassword ? 'visibility' : 'visibility-off'}
                    size={20}
                    color={colors.outline}
                  />
                </Pressable>
              </View>
              {passwordError ? (
                <Text style={[styles.fieldErrorText, typography.bodySm]}>
                  {passwordError}
                </Text>
              ) : null}
            </View>

            {/* Campo: Confirmar contraseña */}
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, typography.labelMd]}>
                Confirmar contraseña
              </Text>
              <View
                style={[
                  styles.inputWrapper,
                  confirmPasswordError ? styles.inputWrapperError : undefined,
                ]}
              >
                <MaterialIcons
                  name="lock-outline"
                  size={20}
                  color={confirmPasswordError ? colors.error : colors.outline}
                  style={styles.inputIcon}
                />
                <TextInput
                  testID="register-confirm-password-input"
                  style={[styles.textInput, typography.bodyMd]}
                  placeholder="Repite tu contraseña"
                  placeholderTextColor={colors.textSecondary}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={confirmPassword}
                  onChangeText={handleConfirmPasswordChange}
                  onBlur={() => setConfirmPasswordTouched(true)}
                  editable={!isSubmitting}
                  accessibilityLabel="Confirmar contraseña"
                  accessibilityHint="Vuelve a ingresar la misma contraseña para confirmarla"
                  onSubmitEditing={handleSubmit}
                  returnKeyType="done"
                />
                <Pressable
                  testID="register-confirm-password-toggle"
                  style={styles.toggleButton}
                  onPress={() => setShowConfirmPassword((prev) => !prev)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel={
                    showConfirmPassword
                      ? 'Ocultar confirmación de contraseña'
                      : 'Mostrar confirmación de contraseña'
                  }
                >
                  <MaterialIcons
                    name={showConfirmPassword ? 'visibility' : 'visibility-off'}
                    size={20}
                    color={colors.outline}
                  />
                </Pressable>
              </View>
              {confirmPasswordError ? (
                <Text style={[styles.fieldErrorText, typography.bodySm]}>
                  {confirmPasswordError}
                </Text>
              ) : null}
            </View>

            {/* Botón de envío: Registrarme */}
            <Pressable
              testID="register-submit-button"
              style={({ pressed }) => [
                styles.submitButton,
                (!isFormComplete || isSubmitting) && styles.submitButtonDisabled,
                pressed && !isSubmitting && styles.submitButtonPressed,
              ]}
              onPress={handleSubmit}
              disabled={isSubmitting || !isFormComplete}
              accessibilityRole="button"
              accessibilityLabel={isSubmitting ? 'Registrando cuenta...' : 'Registrarme'}
              accessibilityState={{
                disabled: isSubmitting || !isFormComplete,
                busy: isSubmitting,
              }}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <>
                  <Text style={[styles.submitButtonText, typography.labelLg]}>
                    Registrarme
                  </Text>
                  <MaterialIcons name="person-add" size={20} color={colors.onPrimary} />
                </>
              )}
            </Pressable>
          </View>

          {/* Enlace hacia inicio de sesión */}
          <View style={styles.switchRow}>
            <Text style={[styles.switchPromptText, typography.bodyMd]}>
              ¿Ya tienes cuenta?
            </Text>
            <Pressable
              testID="register-login-link"
              onPress={() => {
                clearAuthError();
                router.push('/(auth)/login');
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Iniciar sesión con cuenta existente"
            >
              <Text style={[styles.switchLinkText, typography.labelLg]}>
                Iniciar sesión
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.margin,
    paddingVertical: spacing.lg,
    justifyContent: 'center',
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceContainerLow,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.full,
    marginBottom: spacing.sm,
  },
  categoryBadgeText: {
    color: colors.textSecondary,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  headline: {
    color: colors.textPrimary,
    textAlign: 'center',
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 22,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: '#5B4B8A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    gap: spacing.md,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.errorContainer,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(186, 26, 26, 0.2)',
  },
  errorBoxText: {
    color: colors.error,
    flex: 1,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
  },
  inputWrapperError: {
    borderColor: colors.error,
  },
  inputIcon: {
    marginRight: spacing.xs,
  },
  textInput: {
    flex: 1,
    height: '100%',
    color: colors.textPrimary,
    paddingVertical: 0,
  },
  toggleButton: {
    padding: spacing.xs,
  },
  fieldErrorText: {
    color: colors.error,
    fontSize: 12,
  },
  submitButton: {
    height: 52,
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
    marginTop: spacing.xs,
  },
  submitButtonDisabled: {
    backgroundColor: colors.surfaceContainerHighest,
    shadowOpacity: 0,
    elevation: 0,
  },
  submitButtonPressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.9,
  },
  submitButtonText: {
    color: colors.onPrimary,
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  switchPromptText: {
    color: colors.textSecondary,
  },
  switchLinkText: {
    color: colors.primary,
    fontWeight: '700',
  },
  confirmationContainer: {
    flex: 1,
    paddingHorizontal: spacing.margin,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmationIconBox: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    backgroundColor: 'rgba(91, 75, 138, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  confirmationMessage: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  emailPill: {
    backgroundColor: colors.surfaceContainerLow,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    marginVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  emailPillText: {
    color: colors.primary,
  },
  confirmationSubtext: {
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  confirmationButton: {
    width: '100%',
    maxWidth: 320,
  },
});
