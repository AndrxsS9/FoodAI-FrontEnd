/**
 * FoodAI - Pantalla de Perfil Personalizado y Configuración (Fase 5B).
 *
 * Características:
 * - Identidad real y personalizada de la cuenta autenticada (nombre, correo e iniciales dinámicas).
 * - Edición de nombre sincronizada con Supabase Auth user_metadata y el contexto de autenticación.
 * - Micro-panel de impacto doméstico con métricas en tiempo real de la despensa.
 * - Preferencias culinarias compactas (porciones, presupuesto COP y tiempo de cocción).
 * - Opciones de soporte y configuración informativas reales sin controles engañosos.
 * - Diálogos accesibles y sobrios para restablecer valores y cerrar sesión.
 * - Eliminación total de elementos de desarrollo, debug y badges obsoletos.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthSafe } from '../../src/context/AuthContext';
import { useBudget } from '../../src/context/BudgetContext';
import { usePantry } from '../../src/context/PantryContext';
import {
  AppColors, getAppSurfaces,
  radius,
  spacing,
  useTypography,
  useAppTheme,
  useThemeStyles,
} from '../../src/theme';
import {
  CulinaryPreferencesSection,
  EditPreferencesModal,
  LogoutDialog,
  PantryImpactCard,
  ProfileHeader,
  ProfileSettingsGroup,
  ResetPreferencesDialog,
} from '../../src/components/profile';

export default function PerfilScreen() {
  const typography = useTypography();
  const router = useRouter();
  const auth = useAuthSafe();
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);

  // Estado global de presupuesto y preferencias culinarias
  const {
    budget,
    servings,
    maxMinutes,
    isLoading: isBudgetLoading,
    storageError,
    updatePreferences,
    resetBudget,
    clearStorageError,
  } = useBudget();

  // Estado global de despensa
  const { summary } = usePantry();

  // Estados locales para el modal de edición de preferencias culinarias
  const [isEditPrefModalVisible, setIsEditPrefModalVisible] = useState(false);
  const isSavingPrefRef = useRef(false);
  const [isSavingPref, setIsSavingPref] = useState(false);
  const [savePrefError, setSavePrefError] = useState<string | null>(null);

  // Estados locales para el diálogo de confirmación de restablecimiento
  const isResettingRef = useRef(false);
  const [isResetDialogVisible, setIsResetDialogVisible] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Estados locales para el diálogo de confirmación de cierre de sesión
  const isLoggingOutRef = useRef(false);
  const [isLogoutModalVisible, setIsLogoutModalVisible] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  // Estado para actualización de nombre de perfil
  const [isUpdatingName, setIsUpdatingName] = useState(false);

  // Mensaje flotante de confirmación exitosa
  const [successFeedback, setSuccessFeedback] = useState<string | null>(null);

  // Manejo de autodescarte de notificación de éxito
  useEffect(() => {
    if (!successFeedback) return;
    const timer = setTimeout(() => {
      setSuccessFeedback(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [successFeedback]);

  // Actualizar nombre de usuario en Supabase Auth y sincronizar contexto
  const handleUpdateDisplayName = useCallback(
    async (newName: string) => {
      setIsUpdatingName(true);
      try {
        if (!auth?.updateProfile) {
          throw new Error('No se pudo actualizar el perfil. Inicia sesión nuevamente.');
        }
        await auth.updateProfile({ displayName: newName });
        setSuccessFeedback('Nombre de perfil actualizado correctamente.');
      } finally {
        setIsUpdatingName(false);
      }
    },
    [auth]
  );

  // Guardar preferencias culinarias
  const handleSavePreferences = useCallback(
    async (data: { budget: number; servings: number; maxMinutes: number | null }) => {
      if (isBudgetLoading || isSavingPref || isSavingPrefRef.current) return;
      isSavingPrefRef.current = true;
      setIsSavingPref(true);
      setSavePrefError(null);

      try {
        await updatePreferences({
          budget: data.budget,
          servings: data.servings,
          maxMinutes: data.maxMinutes,
          resetMaxMinutes: data.maxMinutes === null,
        });

        setIsEditPrefModalVisible(false);
        setSuccessFeedback('Preferencias guardadas exitosamente.');
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Error al persistir las preferencias en el dispositivo.';
        setSavePrefError(msg);
      } finally {
        isSavingPrefRef.current = false;
        setIsSavingPref(false);
      }
    },
    [isBudgetLoading, isSavingPref, updatePreferences]
  );

  // Restablecer valores predeterminados tras confirmación
  const handleConfirmReset = useCallback(async () => {
    if (isBudgetLoading || isResetting || isResettingRef.current) return;
    isResettingRef.current = true;
    setIsResetting(true);
    setResetError(null);

    try {
      await resetBudget();
      setIsResetDialogVisible(false);
      setSuccessFeedback('Preferencias restauradas a los valores iniciales.');
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Error al reiniciar las preferencias culinarias.';
      setResetError(msg);
    } finally {
      isResettingRef.current = false;
      setIsResetting(false);
    }
  }, [isBudgetLoading, isResetting, resetBudget]);

  // Cierre de sesión seguro
  const handleConfirmLogout = useCallback(async () => {
    if (isLoggingOutRef.current || isLoggingOut) return;
    isLoggingOutRef.current = true;
    setIsLoggingOut(true);
    setLogoutError(null);

    try {
      if (auth?.signOut) {
        await auth.signOut();
      }
      setIsLogoutModalVisible(false);
      router.replace('/(auth)/login');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al cerrar sesión.';
      setLogoutError(msg);
    } finally {
      isLoggingOutRef.current = false;
      setIsLoggingOut(false);
    }
  }, [auth, router, isLoggingOut]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* 1. Header con logotipo FoodAI e identidad institucional */}
      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <Image
            source={require('../../assets/images/logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
            accessibilityLabel="Logotipo de Recetario por Presupuesto"
          />
          <View style={styles.headerTextCol}>
            <View style={styles.headerSubRow}>
              <Text style={[styles.headerBrandSubtitle, typography.labelSm]}>
                Recetario por Presupuesto
              </Text>
              <Text style={[styles.headerDot, typography.labelSm]}>·</Text>
              <Text style={[styles.headerProfileSub, typography.labelSm]}>
                Perfil de Usuario
              </Text>
            </View>
            <Text
              style={[styles.headerTitle, typography.headlineMd]}
              accessibilityRole="header"
            >
              Mi perfil y configuración
            </Text>
          </View>
        </View>

        <View style={styles.headerRightCol}>
          <View
            style={styles.headerAvatar}
            accessibilityRole="image"
            accessibilityLabel="Icono de perfil de usuario"
          >
            <MaterialCommunityIcons name="account" size={20} color={colors.onPrimary} />
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Banner de retroalimentación de guardado exitoso */}
        {successFeedback && (
          <View
            style={styles.successFeedbackBanner}
            accessibilityRole="alert"
            accessibilityLabel={successFeedback}
            testID="preferences-saved-feedback"
          >
            <MaterialCommunityIcons name="check-circle" size={20} color={colors.success} />
            <Text style={[styles.successFeedbackText, typography.labelMd]}>
              {successFeedback}
            </Text>
            <Pressable
              onPress={() => setSuccessFeedback(null)}
              accessibilityLabel="Cerrar notificación"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons name="close" size={18} color={colors.success} />
            </Pressable>
          </View>
        )}

        {/* Banner de error de almacenamiento global */}
        {storageError && (
          <View
            style={styles.errorBanner}
            accessibilityRole="alert"
            accessibilityLabel={`Error de almacenamiento: ${storageError}`}
            testID="global-storage-error-banner"
          >
            <MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.error} />
            <Text style={[styles.errorBannerText, typography.bodySm]}>
              {storageError}
            </Text>
            <Pressable
              onPress={clearStorageError}
              accessibilityLabel="Cerrar mensaje de error"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons name="close" size={18} color={colors.error} />
            </Pressable>
          </View>
        )}

        {/* 2. Cabecera personalizada del usuario autenticado */}
        <ProfileHeader
          user={auth?.user ?? null}
          onUpdateDisplayName={handleUpdateDisplayName}
          isUpdatingName={isUpdatingName}
        />

        {/* 3. Micro-panel de impacto doméstico con métricas de despensa */}
        <PantryImpactCard summary={summary} />

        {/* 4. Preferencias culinarias del usuario */}
        <CulinaryPreferencesSection
          budget={budget}
          servings={servings}
          maxMinutes={maxMinutes}
          isLoading={isBudgetLoading}
          onOpenEdit={() => {
            clearStorageError();
            setSavePrefError(null);
            setIsEditPrefModalVisible(true);
          }}
        />

        {/* 5. Grupo de configuración y soporte del proyecto */}
        <ProfileSettingsGroup />

        {/* 6. Acción para restablecer valores culinarios */}
        <ResetPreferencesDialog
          visible={isResetDialogVisible}
          isResetting={isResetting}
          isLoading={isBudgetLoading}
          error={resetError}
          onOpenDialog={() => {
            setResetError(null);
            setIsResetDialogVisible(true);
          }}
          onCloseDialog={() => setIsResetDialogVisible(false)}
          onConfirmReset={handleConfirmReset}
        />

        {/* 7. Acción discreta de cierre de sesión */}
        <LogoutDialog
          visible={isLogoutModalVisible}
          isLoggingOut={isLoggingOut}
          error={logoutError}
          onOpenDialog={() => {
            setLogoutError(null);
            setIsLogoutModalVisible(true);
          }}
          onCloseDialog={() => setIsLogoutModalVisible(false)}
          onConfirmLogout={handleConfirmLogout}
        />
      </ScrollView>

      {/* Modal de edición de preferencias culinarias */}
      <EditPreferencesModal
        visible={isEditPrefModalVisible}
        budget={budget}
        servings={servings}
        maxMinutes={maxMinutes}
        isSaving={isSavingPref}
        saveError={savePrefError}
        onClose={() => {
          if (!isSavingPref) {
            setIsEditPrefModalVisible(false);
            setSavePrefError(null);
          }
        }}
        onSave={handleSavePreferences}
      />
    </SafeAreaView>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  safeArea: {
    flex: 1,
    ...getAppSurfaces(colors).canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.margin,
    paddingVertical: spacing.sm,
    minHeight: 64,
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  logoImage: {
    width: 34,
    height: 34,
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerBrandSubtitle: {
    color: colors.outline,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerDot: {
    color: colors.outline,
  },
  headerProfileSub: {
    color: colors.primary,
    fontWeight: '700',
  },
  headerTitle: {
    color: colors.textPrimary,
  },
  headerRightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerAvatar: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    backgroundColor: colors.primaryAction,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: spacing.margin,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  successFeedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successContainer,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(46, 125, 50, 0.25)',
  },
  successFeedbackText: {
    flex: 1,
    color: colors.success,
    fontWeight: '600',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.errorContainer,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(186, 26, 26, 0.25)',
  },
  errorBannerText: {
    flex: 1,
    color: colors.error,
  },
});
