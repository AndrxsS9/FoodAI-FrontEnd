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
import { isValidEmail } from '../../src/types/auth';
import { colors, radius, spacing, useTypography } from '../../src/theme';

export default function LoginScreen() {
  const typography = useTypography();
  const router = useRouter();
  const { signIn, isSubmitting, authError, clearAuthError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [emailTouched, setEmailTouched] = useState(false);

  const isEmailValid = isValidEmail(email.trim());
  const emailError = emailTouched && email.trim().length > 0 && !isEmailValid
    ? 'Ingresa un correo electrónico con formato válido.'
    : null;

  const isFormComplete = email.trim().length > 0 && password.length > 0;

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

  const handleSubmit = async () => {
    if (isSubmitting) return;

    const trimmedEmail = email.trim();
    setEmailTouched(true);

    if (!trimmedEmail) {
      setLocalError('Por favor, ingresa tu correo electrónico.');
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setLocalError('Por favor, ingresa un correo electrónico válido.');
      return;
    }

    if (!password) {
      setLocalError('Por favor, ingresa tu contraseña.');
      return;
    }

    setLocalError(null);
    clearAuthError();

    try {
      await signIn(trimmedEmail, password);
      // Tras el inicio de sesión exitoso, el RouteGuard o navegación redirige a /(tabs)
      router.replace('/(tabs)');
    } catch {
      // El error ya es procesado y propagado en authError por AuthContext
    }
  };

  const displayedError = localError || authError;

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
          {/* Encabezado doméstico Google Stitch */}
          <View style={styles.headerSection}>
            <View
              style={styles.categoryBadge}
              accessibilityRole="text"
              accessibilityLabel="Categoría: Autenticación segura"
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
              Iniciar sesión
            </Text>

            <Text style={[styles.subtitle, typography.bodyMd]}>
              Ingresa a tu cuenta para gestionar tu despensa y recetas inteligentes sin desperdicio.
            </Text>
          </View>

          {/* Tarjeta del formulario */}
          <View style={styles.formCard} testID="login-card">
            {/* Mensaje de error visible */}
            {displayedError ? (
              <View
                style={styles.errorBox}
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
                testID="login-error-message"
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
                  testID="login-email-input"
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
                  accessibilityHint="Ingresa la dirección de correo registrada en FoodAI"
                  accessibilityRole="textbox"
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
              <View style={styles.inputWrapper}>
                <MaterialIcons
                  name="lock-outline"
                  size={20}
                  color={colors.outline}
                  style={styles.inputIcon}
                />
                <TextInput
                  testID="login-password-input"
                  style={[styles.textInput, typography.bodyMd]}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textSecondary}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={password}
                  onChangeText={handlePasswordChange}
                  editable={!isSubmitting}
                  accessibilityLabel="Contraseña"
                  accessibilityHint="Ingresa tu contraseña de acceso"
                  accessibilityRole="textbox"
                  onSubmitEditing={handleSubmit}
                  returnKeyType="done"
                />
                <Pressable
                  testID="login-password-toggle"
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
            </View>

            {/* Botón de envío: Entrar */}
            <Pressable
              testID="login-submit-button"
              style={({ pressed }) => [
                styles.submitButton,
                (!isFormComplete || isSubmitting) && styles.submitButtonDisabled,
                pressed && !isSubmitting && styles.submitButtonPressed,
              ]}
              onPress={handleSubmit}
              disabled={isSubmitting || !isFormComplete}
              accessibilityRole="button"
              accessibilityLabel={isSubmitting ? 'Iniciando sesión...' : 'Entrar'}
              accessibilityState={{ disabled: isSubmitting || !isFormComplete, busy: isSubmitting }}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <>
                  <Text style={[styles.submitButtonText, typography.labelLg]}>
                    Entrar
                  </Text>
                  <MaterialIcons name="arrow-forward" size={20} color={colors.onPrimary} />
                </>
              )}
            </Pressable>
          </View>

          {/* Enlace hacia pantalla de registro */}
          <View style={styles.switchRow}>
            <Text style={[styles.switchPromptText, typography.bodyMd]}>
              ¿No tienes una cuenta?
            </Text>
            <Pressable
              testID="login-register-link"
              onPress={() => {
                clearAuthError();
                router.push('/(auth)/register');
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Crear cuenta nueva"
            >
              <Text style={[styles.switchLinkText, typography.labelLg]}>
                Crear cuenta
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
    marginBottom: spacing.lg,
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
});
