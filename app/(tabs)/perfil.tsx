import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Button, Card, Stepper } from '../../src/components/common';
import { useBudget } from '../../src/context/BudgetContext';
import { usePantry } from '../../src/context/PantryContext';
import {
  formatCopCurrency,
  validateBudgetInput,
  validateMaxMinutesInput,
  validateServingsInput,
} from '../../src/types/recipe';
import {
  MAX_SERVINGS,
  MIN_SERVINGS,
} from '../../src/types/budget';
import { colors, radius, spacing, useTypography } from '../../src/theme';
import { useAuthSafe } from '../../src/context/AuthContext';

export default function PerfilScreen() {
  const typography = useTypography();
  const router = useRouter();
  const auth = useAuthSafe();


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

  // Estado global de la despensa para el micro-panel doméstico
  const { summary } = usePantry();

  // Estados locales para el modal de edición de preferencias
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [tempBudget, setTempBudget] = useState(String(budget));
  const [tempServings, setTempServings] = useState(servings);
  const [hasTimeLimit, setHasTimeLimit] = useState(maxMinutes !== undefined && maxMinutes !== null);
  const [tempMaxMinutes, setTempMaxMinutes] = useState(maxMinutes ? String(maxMinutes) : '30');
  const [inputErrors, setInputErrors] = useState<{
    budget?: string;
    servings?: string;
    maxMinutes?: string;
  }>({});
  const isSavingRef = React.useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Estados locales para el diálogo de confirmación de restablecimiento
  const isResettingRef = React.useRef(false);
  const [isResetDialogVisible, setIsResetDialogVisible] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Estados locales para el diálogo de confirmación de cierre de sesión (Fase 5 - Stitch Screen 13)
  const isLoggingOutRef = React.useRef(false);
  const [isLogoutModalVisible, setIsLogoutModalVisible] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

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

  // Modal informativo para soporte/configuración/acerca de
  const [activeInfoModal, setActiveInfoModal] = useState<'config' | 'help' | 'about' | null>(null);

  // Mensaje flotante de confirmación exitosa
  const [successFeedback, setSuccessFeedback] = useState<string | null>(null);

  // Sincronizar valores temporales cuando se abre el modal de edición
  const handleOpenEditModal = useCallback(() => {
    if (isBudgetLoading || isSaving || isSavingRef.current) return;
    setTempBudget(String(budget));
    setTempServings(servings);
    setHasTimeLimit(maxMinutes !== undefined && maxMinutes !== null);
    setTempMaxMinutes(maxMinutes ? String(maxMinutes) : '30');
    setInputErrors({});
    setSaveError(null);
    clearStorageError();
    setIsEditModalVisible(true);
  }, [isBudgetLoading, isSaving, budget, servings, maxMinutes, clearStorageError]);

  const handleCloseEditModal = useCallback(() => {
    if (isSaving || isSavingRef.current) return;
    setIsEditModalVisible(false);
    setInputErrors({});
    setSaveError(null);
  }, [isSaving]);

  // Manejo de autodescarte de notificación de éxito
  useEffect(() => {
    if (!successFeedback) return;
    const timer = setTimeout(() => {
      setSuccessFeedback(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [successFeedback]);

  // Guardar preferencias con validación y persistencia atómica multipropiedad
  const handleSavePreferences = async () => {
    if (isBudgetLoading || isSaving || isSavingRef.current) return;
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

    isSavingRef.current = true;
    setIsSaving(true);
    setSaveError(null);

    try {
      const finalBudget = Math.round(Number(sanitizedBudget));

      await updatePreferences({
        budget: finalBudget,
        servings: tempServings,
        maxMinutes: hasTimeLimit ? parsedMinutesToSave : null,
        resetMaxMinutes: !hasTimeLimit,
      });

      setIsEditModalVisible(false);
      setSuccessFeedback('Preferencias guardadas exitosamente.');
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Error al persistir las preferencias en el dispositivo.';
      setSaveError(msg);
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  // Restablecer valores predeterminados tras confirmación
  const handleConfirmReset = async () => {
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
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* 1. Header con logotipo FoodAI, título Stitch y avatar */}
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
          {/* Badge institucional Fase 4 */}
          <View style={styles.badgeWrapper}>
            <Text style={[styles.badgeText, typography.labelSm]}>Fase 4</Text>
          </View>

          {/* Avatar Stitch circular */}
          <View
            style={styles.headerAvatar}
            accessibilityRole="image"
            accessibilityLabel="Icono de perfil de usuario"
          >
            <MaterialIcons name="person" size={20} color={colors.onPrimary} />
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
            <MaterialIcons name="check-circle" size={20} color={colors.success} />
            <Text style={[styles.successFeedbackText, typography.labelMd]}>
              {successFeedback}
            </Text>
            <Pressable
              onPress={() => setSuccessFeedback(null)}
              accessibilityLabel="Cerrar notificación"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="close" size={18} color={colors.success} />
            </Pressable>
          </View>
        )}

        {/* Banner de error de almacenamiento global si existe */}
        {storageError && (
          <View
            style={styles.errorBanner}
            accessibilityRole="alert"
            accessibilityLabel={`Error de almacenamiento: ${storageError}`}
            testID="global-storage-error-banner"
          >
            <MaterialIcons name="error-outline" size={20} color={colors.error} />
            <Text style={[styles.errorBannerText, typography.bodySm]}>
              {storageError}
            </Text>
            <Pressable
              onPress={clearStorageError}
              accessibilityLabel="Cerrar mensaje de error"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="close" size={18} color={colors.error} />
            </Pressable>
          </View>
        )}

        {/* 2. Tarjeta Cabecera de Hogar Local (Stitch Screen 13) */}
        <Card variant="elevated" style={styles.userHeaderCard}>
          <View style={styles.userHeaderLeft}>
            <View
              style={styles.userAvatarInitials}
              accessibilityRole="image"
              accessibilityLabel="Avatar de Mi hogar"
            >
              <Text style={[styles.userAvatarText, typography.headlineMd]}>MH</Text>
            </View>

            <View style={styles.userMetaCol}>
              <View style={styles.userNameRow}>
                <Text style={[styles.userNameText, typography.headlineMd]}>
                  Mi hogar
                </Text>
                <View style={styles.householdPill}>
                  <Text style={[styles.householdPillText, typography.labelSm]}>
                    Hogar
                  </Text>
                </View>
              </View>
              <Text style={[styles.userStatusSub, typography.bodySm]}>
                Gestión de despensa activa
              </Text>
            </View>
          </View>

          <View
            style={styles.verifiedIconWrapper}
            accessibilityRole="image"
            accessibilityLabel="Perfil local del dispositivo"
          >
            <MaterialIcons name="home" size={22} color={colors.primary} />
          </View>
        </Card>

        {/* 3. Micro-panel de impacto doméstico sobrio (Stitch Screen 13) */}
        <View style={styles.impactGrid}>
          {/* Tarjeta 1: Despensa al día */}
          <View style={styles.impactCard}>
            <View style={styles.impactCardHeader}>
              <Text style={[styles.impactCardLabel, typography.labelSm]}>
                Despensa al día
              </Text>
              <MaterialIcons name="inventory-2" size={18} color={colors.outline} />
            </View>
            <View style={styles.impactValueRow}>
              <Text style={[styles.impactValueBig, typography.headlineLg]}>
                {summary.totalCount}
              </Text>
              <Text style={[styles.impactValueUnit, typography.bodySm]}>
                insumos
              </Text>
            </View>
            <Text style={[styles.impactCardSub, typography.bodySm]} numberOfLines={1}>
              {summary.urgentCount > 0
                ? `${summary.urgentCount} por consumir pronto`
                : 'Inventario al día'}
            </Text>
          </View>

          {/* Tarjeta 2: Por consumir pronto */}
          <View style={styles.impactCard}>
            <View style={styles.impactCardHeader}>
              <Text style={[styles.impactCardLabel, typography.labelSm]}>
                Por consumir pronto
              </Text>
              <MaterialIcons name="schedule" size={18} color={colors.outline} />
            </View>
            <View style={styles.impactValueRow}>
              <Text style={[styles.impactValueBig, typography.headlineLg]}>
                {summary.urgentCount}
              </Text>
              <Text style={[styles.impactValueUnit, typography.bodySm]}>
                alimentos
              </Text>
            </View>
            <Text style={[styles.impactCardSub, typography.bodySm]} numberOfLines={1}>
              {summary.urgentCount > 0
                ? 'Productos prioritarios'
                : 'Sin urgencias de caducidad'}
            </Text>
          </View>
        </View>

        {/* 4. Sección 1: Preferencias de hogar (Stitch Screen 13) */}
        <Card variant="elevated" style={styles.preferencesSectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionHeaderLeft}>
              <Text style={[styles.sectionTitle, typography.labelLg]}>
                Preferencias y Configuración
              </Text>
              <Text style={[styles.sectionSubtitle, typography.bodySm]}>
                Preferencias de hogar · Pautas para calcular cantidades y costos sugeridos
              </Text>
            </View>
            <MaterialIcons name="tune" size={20} color={colors.outline} />
          </View>

          {/* Indicador sutil de carga de presupuesto */}
          {isBudgetLoading && (
            <View
              style={styles.budgetLoadingInline}
              accessibilityRole="progressbar"
              accessibilityLabel="Cargando preferencias guardadas..."
              testID="budget-loading-banner"
            >
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.budgetLoadingText, typography.bodySm]}>
                Cargando preferencias guardadas...
              </Text>
            </View>
          )}

          <View style={styles.preferencesList}>
            {/* Fila A2: Porciones habituales */}
            <Pressable
              style={({ pressed }) => [
                styles.preferenceRow,
                (isBudgetLoading || isSaving) && styles.buttonDisabled,
                pressed && !(isBudgetLoading || isSaving) && styles.preferenceRowPressed,
              ]}
              onPress={handleOpenEditModal}
              disabled={isBudgetLoading || isSaving}
              accessibilityRole="button"
              accessibilityState={{ disabled: isBudgetLoading || isSaving, busy: isBudgetLoading }}
              accessibilityLabel={`Porciones habituales: ${servings} ${servings === 1 ? 'persona' : 'personas'}. Toca para modificar.`}
              testID="preference-row-servings"
            >
              <View style={styles.preferenceRowLeft}>
                <View style={styles.preferenceIconBox}>
                  <MaterialIcons name="group" size={18} color={colors.primary} />
                </View>
                <View style={styles.preferenceLabelCol}>
                  <Text style={[styles.preferenceTitle, typography.labelMd]}>
                    Porciones habituales
                  </Text>
                  <Text style={[styles.preferenceSubtitle, typography.bodySm]}>
                    Para cálculo de recetas
                  </Text>
                </View>
              </View>

              <View style={styles.preferenceValuePill} testID="profile-servings-display">
                <Text style={[styles.preferenceValueText, typography.labelMd]}>
                  {servings} {servings === 1 ? 'persona' : 'personas'}
                </Text>
              </View>
            </Pressable>

            {/* Fila A1: Presupuesto por comida */}
            <Pressable
              style={({ pressed }) => [
                styles.preferenceRow,
                (isBudgetLoading || isSaving) && styles.buttonDisabled,
                pressed && !(isBudgetLoading || isSaving) && styles.preferenceRowPressed,
              ]}
              onPress={handleOpenEditModal}
              disabled={isBudgetLoading || isSaving}
              accessibilityRole="button"
              accessibilityState={{ disabled: isBudgetLoading || isSaving, busy: isBudgetLoading }}
              accessibilityLabel={`Presupuesto por comida: ${formatCopCurrency(budget, true)}. Toca para modificar.`}
              testID="preference-row-budget"
            >
              <View style={styles.preferenceRowLeft}>
                <View style={styles.preferenceIconBox}>
                  <MaterialIcons name="payments" size={18} color={colors.primary} />
                </View>
                <View style={styles.preferenceLabelCol}>
                  <Text style={[styles.preferenceTitle, typography.labelMd]}>
                    Presupuesto por comida
                  </Text>
                  <Text style={[styles.preferenceSubtitle, typography.bodySm]}>
                    Tope de referencia objetivo
                  </Text>
                </View>
              </View>

              <View style={styles.preferenceValuePill} testID="profile-budget-display">
                <Text style={[styles.preferenceValueText, typography.labelMd]}>
                  {formatCopCurrency(budget, true)}
                </Text>
              </View>
            </Pressable>

            {/* Fila A3: Tiempo máximo de cocción */}
            <Pressable
              style={({ pressed }) => [
                styles.preferenceRow,
                (isBudgetLoading || isSaving) && styles.buttonDisabled,
                pressed && !(isBudgetLoading || isSaving) && styles.preferenceRowPressed,
              ]}
              onPress={handleOpenEditModal}
              disabled={isBudgetLoading || isSaving}
              accessibilityRole="button"
              accessibilityState={{ disabled: isBudgetLoading || isSaving, busy: isBudgetLoading }}
              accessibilityLabel={`Tiempo máximo de cocción: ${maxMinutes ? `${maxMinutes} min` : 'Sin límite'}. Toca para modificar.`}
              testID="preference-row-time"
            >
              <View style={styles.preferenceRowLeft}>
                <View style={styles.preferenceIconBox}>
                  <MaterialIcons name="timer" size={18} color={colors.primary} />
                </View>
                <View style={styles.preferenceLabelCol}>
                  <Text style={[styles.preferenceTitle, typography.labelMd]}>
                    Tiempo máximo de cocción
                  </Text>
                  <Text style={[styles.preferenceSubtitle, typography.bodySm]}>
                    Límite para recetas y planes
                  </Text>
                </View>
              </View>

              <View style={styles.preferenceValuePill} testID="profile-time-display">
                <Text style={[styles.preferenceValueText, typography.labelMd]}>
                  {maxMinutes ? `${maxMinutes} min` : 'Sin límite'}
                </Text>
              </View>
            </Pressable>
          </View>

          {/* Botón secundario original Stitch para editar */}
          <Pressable
            style={({ pressed }) => [
              styles.editPreferencesButton,
              (isBudgetLoading || isSaving) && styles.buttonDisabled,
              pressed && !(isBudgetLoading || isSaving) && styles.editPreferencesButtonPressed,
            ]}
            onPress={handleOpenEditModal}
            disabled={isBudgetLoading || isSaving}
            accessibilityRole="button"
            accessibilityState={{ disabled: isBudgetLoading || isSaving, busy: isBudgetLoading }}
            accessibilityLabel={
              isBudgetLoading
                ? 'Cargando preferencias guardadas. Por favor espera.'
                : 'Editar preferencias culinarias'
            }
            testID="btn-edit-pref"
          >
            {isBudgetLoading ? (
              <ActivityIndicator size="small" color={colors.outline} style={{ marginRight: spacing.xs }} />
            ) : (
              <MaterialIcons name="edit" size={18} color={colors.primary} />
            )}
            <Text
              style={[
                styles.editPreferencesButtonText,
                typography.labelLg,
                (isBudgetLoading || isSaving) && styles.textDisabled,
              ]}
            >
              {isBudgetLoading ? 'Cargando preferencias...' : 'Editar preferencias'}
            </Text>
          </Pressable>
        </Card>

        {/* 5. Sección 2: Configuración y Soporte del Proyecto (Stitch Screen 13) */}
        <Card variant="elevated" style={styles.settingsGroupCard}>
          {/* Fila 1: Configuración */}
          <Pressable
            style={({ pressed }) => [
              styles.settingsGroupRow,
              pressed && styles.settingsGroupRowPressed,
            ]}
            onPress={() => setActiveInfoModal('config')}
            accessibilityRole="button"
            accessibilityLabel="Configuración: Unidades métricas, moneda y almacenamiento"
            testID="settings-row-config"
          >
            <View style={styles.settingsRowLeft}>
              <View style={styles.settingsIconBox}>
                <MaterialIcons name="settings" size={20} color={colors.textPrimary} />
              </View>
              <View style={styles.settingsTextCol}>
                <Text style={[styles.settingsRowTitle, typography.labelLg]}>
                  Configuración
                </Text>
                <Text style={[styles.settingsRowSubtitle, typography.bodySm]}>
                  Unidades métricas, moneda y alertas
                </Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={colors.outline} />
          </Pressable>

          <View style={styles.rowDivider} />

          {/* Fila 2: Ayuda y preguntas frecuentes */}
          <Pressable
            style={({ pressed }) => [
              styles.settingsGroupRow,
              pressed && styles.settingsGroupRowPressed,
            ]}
            onPress={() => setActiveInfoModal('help')}
            accessibilityRole="button"
            accessibilityLabel="Ayuda y preguntas frecuentes: Guía de inventario y optimización"
            testID="settings-row-help"
          >
            <View style={styles.settingsRowLeft}>
              <View style={styles.settingsIconBox}>
                <MaterialIcons name="help-outline" size={20} color={colors.textPrimary} />
              </View>
              <View style={styles.settingsTextCol}>
                <Text style={[styles.settingsRowTitle, typography.labelLg]}>
                  Ayuda y preguntas frecuentes
                </Text>
                <Text style={[styles.settingsRowSubtitle, typography.bodySm]}>
                  Guía de inventario y optimización
                </Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={colors.outline} />
          </Pressable>

          <View style={styles.rowDivider} />

          {/* Fila 3: Acerca del proyecto */}
          <Pressable
            style={({ pressed }) => [
              styles.settingsGroupRow,
              pressed && styles.settingsGroupRowPressed,
            ]}
            onPress={() => setActiveInfoModal('about')}
            accessibilityRole="button"
            accessibilityLabel="Acerca del proyecto: Consumo responsable en el hogar. Versión 1.0.0"
            testID="settings-row-about"
          >
            <View style={styles.settingsRowLeft}>
              <View style={styles.settingsIconBox}>
                <MaterialIcons name="info" size={20} color={colors.textPrimary} />
              </View>
              <View style={styles.settingsTextCol}>
                <Text style={[styles.settingsRowTitle, typography.labelLg]}>
                  Acerca del proyecto
                </Text>
                <Text style={[styles.settingsRowSubtitle, typography.bodySm]}>
                  Consumo responsable en el hogar
                </Text>
              </View>
            </View>
            <View style={styles.versionBadgeRow}>
              <View style={styles.versionBadge}>
                <Text style={[styles.versionBadgeText, typography.labelSm]}>
                  v1.0.0
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={colors.outline} />
            </View>
          </Pressable>
        </Card>

        {/* 6. Acción destructiva sobria: Restablecer valores predeterminados (Adaptación funcional Stitch Screen 13) */}
        <View style={styles.resetActionSection}>
          <Pressable
            style={({ pressed }) => [
              styles.resetPreferencesButton,
              (isBudgetLoading || isResetting) && styles.buttonDisabled,
              pressed && !(isBudgetLoading || isResetting) && styles.resetPreferencesButtonPressed,
            ]}
            onPress={() => {
              if (isBudgetLoading || isResetting || isResettingRef.current) return;
              setResetError(null);
              setIsResetDialogVisible(true);
            }}
            disabled={isBudgetLoading || isResetting}
            accessibilityRole="button"
            accessibilityState={{ disabled: isBudgetLoading || isResetting, busy: isBudgetLoading }}
            accessibilityLabel={
              isBudgetLoading
                ? 'Cargando preferencias guardadas. Por favor espera.'
                : 'Restablecer preferencias a los valores iniciales'
            }
            testID="btn-reset-preferences"
          >
            <MaterialIcons
              name="restart-alt"
              size={20}
              color={isBudgetLoading || isResetting ? colors.outline : colors.secondary}
            />
            <Text
              style={[
                styles.resetPreferencesButtonText,
                typography.labelMd,
                (isBudgetLoading || isResetting) && styles.textDisabled,
              ]}
            >
              {isBudgetLoading ? 'Cargando preferencias...' : 'Restablecer preferencias'}
            </Text>
          </Pressable>

          <Text style={[styles.resetCaptionText, typography.bodySm]}>
            Tus datos de despensa y recetas permanecen guardados en este dispositivo.
          </Text>
        </View>

        {/* 6B. Enlace de cierre de sesión sobrio y seguro (Google Stitch Screen 13) */}
        <View style={styles.logoutActionSection}>
          <Pressable
            style={({ pressed }) => [
              styles.logoutButton,
              isLoggingOut && styles.buttonDisabled,
              pressed && !isLoggingOut && styles.logoutButtonPressed,
            ]}
            onPress={() => {
              setLogoutError(null);
              setIsLogoutModalVisible(true);
            }}
            disabled={isLoggingOut}
            accessibilityRole="button"
            accessibilityLabel="Cerrar sesión"
            accessibilityHint="Cierra la sesión actual en este dispositivo"
            testID="btn-logout"
          >
            {isLoggingOut ? (
              <ActivityIndicator size="small" color={colors.secondary} />
            ) : (
              <>
                <MaterialIcons name="logout" size={18} color={colors.secondary} />
                <Text style={[styles.logoutButtonText, typography.labelMd]}>
                  Cerrar sesión
                </Text>
              </>
            )}
          </Pressable>

          <Text style={[styles.resetCaptionText, typography.bodySm]}>
            Tus datos de despensa permanecen guardados en este dispositivo.
          </Text>
        </View>

        {/* 7. Accesos rápidos de desarrollo y navegación (compatibilidad total de suite y navegación) */}
        <Card variant="outlined" style={styles.devToolsCard}>
          <Text style={[styles.devToolsTitle, typography.labelSm]}>
            ACCESOS RÁPIDOS Y REPRODUCCIÓN
          </Text>
          <View style={styles.devButtonsCol}>
            <Button
              testID="perfil-welcome-button"
              title="Ver pantalla de bienvenida"
              variant="outline"
              size="md"
              fullWidth
              onPress={() => router.push('/')}
              leftIcon={<MaterialIcons name="auto-awesome" size={18} color={colors.primary} />}
            />

            <Button
              testID="perfil-design-system-button"
              title="Catálogo de componentes (Fase 1)"
              variant="tertiary"
              size="md"
              fullWidth
              onPress={() => router.push('/design-system')}
              leftIcon={<MaterialIcons name="palette" size={18} color={colors.textPrimary} />}
            />

            <Button
              testID="perfil-back-home-button"
              title="Volver al Inicio"
              variant="primary"
              size="md"
              fullWidth
              onPress={() => router.push('/(tabs)')}
              leftIcon={<MaterialIcons name="arrow-back" size={18} color={colors.onPrimary} />}
            />
          </View>
        </Card>
      </ScrollView>

      {/* ================================================================= */}
      {/* MODAL: EDICIÓN DE PREFERENCIAS CULINARIAS                         */}
      {/* ================================================================= */}
      <Modal
        visible={isEditModalVisible}
        transparent
        animationType="slide"
        onRequestClose={handleCloseEditModal}
        testID="edit-preferences-modal"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={handleCloseEditModal}
            accessibilityLabel="Cerrar modal de edición"
          />

          <View style={styles.modalSheetContainer}>
            <View style={styles.modalDragHandle} />

            <View style={styles.modalHeaderRow}>
              <View style={styles.modalHeaderTitleBox}>
                <MaterialIcons name="tune" size={24} color={colors.primary} />
                <Text style={[styles.modalTitleText, typography.headlineMd]}>
                  Editar preferencias
                </Text>
              </View>

              <Pressable
                onPress={handleCloseEditModal}
                style={styles.modalCloseButton}
                accessibilityRole="button"
                accessibilityLabel="Cerrar modal"
                disabled={isSaving}
                testID="close-edit-modal-button"
              >
                <MaterialIcons name="close" size={20} color={colors.textPrimary} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.modalScrollContent}
            >
              {/* Banner de error de guardado si ocurre */}
              {saveError && (
                <View
                  style={styles.modalErrorBanner}
                  accessibilityRole="alert"
                  testID="edit-preferences-save-error"
                >
                  <MaterialIcons name="error-outline" size={18} color={colors.error} />
                  <Text style={[styles.modalErrorBannerText, typography.bodySm]}>
                    {saveError}
                  </Text>
                </View>
              )}

              {/* Campo 1: Presupuesto por comida */}
              <View style={styles.modalFieldGroup}>
                <View style={styles.fieldHeaderRow}>
                  <Text style={[styles.fieldLabel, typography.labelMd]}>
                    Presupuesto por comida (COP)
                  </Text>
                  <Text style={[styles.fieldHint, typography.labelSm]}>
                    {formatCopCurrency(
                      Number(tempBudget.trim().replace(/[.,\s]/g, '')) || 0,
                      true
                    )}
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
                    accessibilityLabel="Presupuesto por comida en pesos colombianos"
                    testID="budget-input"
                    editable={!isSaving}
                  />
                  {tempBudget.length > 0 && !isSaving && (
                    <Pressable
                      onPress={() => setTempBudget('')}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel="Borrar presupuesto"
                    >
                      <MaterialIcons name="cancel" size={18} color={colors.outline} />
                    </Pressable>
                  )}
                </View>

                {inputErrors.budget && (
                  <Text
                    style={[styles.fieldErrorText, typography.bodySm]}
                    testID="budget-input-error"
                  >
                    {inputErrors.budget}
                  </Text>
                )}
                <Text style={[styles.fieldHelperText, typography.bodySm]}>
                  Valor de referencia utilizado por FoodAI para seleccionar recetas accesibles.
                </Text>
              </View>

              {/* Campo 2: Porciones habituales */}
              <View style={styles.modalFieldGroup}>
                <View style={styles.fieldHeaderRow}>
                  <Text style={[styles.fieldLabel, typography.labelMd]}>
                    Porciones habituales (comensales)
                  </Text>
                  <Text style={[styles.fieldHint, typography.labelSm]}>
                    1 a 12 personas
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
                    unit={tempServings === 1 ? 'persona' : 'personas'}
                    disabled={isSaving}
                    accessibilityLabel="Ajustar número de comensales"
                    testID="servings-stepper"
                  />
                </View>

                {inputErrors.servings && (
                  <Text
                    style={[styles.fieldErrorText, typography.bodySm]}
                    testID="servings-input-error"
                  >
                    {inputErrors.servings}
                  </Text>
                )}
              </View>

              {/* Campo 3: Tiempo máximo de cocción */}
              <View style={styles.modalFieldGroup}>
                <View style={styles.fieldHeaderRow}>
                  <Text style={[styles.fieldLabel, typography.labelMd]}>
                    Tiempo máximo de cocción
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
                      hasTimeLimit ? 'Quitar límite de tiempo' : 'Establecer límite de tiempo'
                    }
                    disabled={isSaving}
                    testID="toggle-max-minutes"
                  >
                    <MaterialIcons
                      name={hasTimeLimit ? 'check-box' : 'check-box-outline-blank'}
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
                      {hasTimeLimit ? 'Con límite' : 'Sin límite'}
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
                            setInputErrors((prev) => ({ ...prev, maxMinutes: undefined }));
                          }
                        }}
                        placeholder="30"
                        placeholderTextColor={colors.textTertiary}
                        keyboardType="numeric"
                        accessibilityLabel="Tiempo máximo en minutos"
                        testID="max-minutes-input"
                        editable={!isSaving}
                      />
                      <Text style={[styles.unitSuffix, typography.bodyLg]}>min</Text>
                    </View>

                    {inputErrors.maxMinutes && (
                      <Text
                        style={[styles.fieldErrorText, typography.bodySm]}
                        testID="max-minutes-input-error"
                      >
                        {inputErrors.maxMinutes}
                      </Text>
                    )}

                    <View style={styles.quickTimeChipsRow}>
                      {[15, 30, 45, 60].map((mins) => (
                        <Pressable
                          key={mins}
                          style={[
                            styles.quickTimeChip,
                            tempMaxMinutes === String(mins) && styles.quickTimeChipActive,
                          ]}
                          onPress={() => setTempMaxMinutes(String(mins))}
                          accessibilityRole="button"
                          accessibilityLabel={`${mins} minutos`}
                          disabled={isSaving}
                        >
                          <Text
                            style={[
                              styles.quickTimeChipText,
                              typography.labelSm,
                              tempMaxMinutes === String(mins) && styles.quickTimeChipTextActive,
                            ]}
                          >
                            {mins} min
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : (
                  <View style={styles.unlimitedTimeNote}>
                    <MaterialIcons name="all-inclusive" size={20} color={colors.outline} />
                    <Text style={[styles.unlimitedTimeText, typography.bodySm]}>
                      FoodAI considerará recetas de cualquier duración de preparación.
                    </Text>
                  </View>
                )}
              </View>

              {/* Botones de acción del modal */}
              <View style={styles.modalActionButtonsRow}>
                <Button
                  testID="cancel-preferences-button"
                  title="Cancelar"
                  variant="outline"
                  size="md"
                  onPress={handleCloseEditModal}
                  disabled={isSaving}
                  style={styles.modalCancelButton}
                />

                <Button
                  testID="save-preferences-button"
                  title={isSaving ? 'Guardando...' : 'Guardar preferencias'}
                  variant="primary"
                  size="md"
                  onPress={handleSavePreferences}
                  disabled={isSaving}
                  loading={isSaving}
                  style={styles.modalSaveButton}
                  leftIcon={
                    !isSaving ? (
                      <MaterialIcons name="check" size={18} color={colors.onPrimary} />
                    ) : undefined
                  }
                />
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ================================================================= */}
      {/* DIÁLOGO MODAL: CONFIRMACIÓN DE RESTABLECIMIENTO                   */}
      {/* ================================================================= */}
      <Modal
        visible={isResetDialogVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isResetting) setIsResetDialogVisible(false);
        }}
        testID="reset-confirm-modal"
      >
        <View style={styles.dialogOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!isResetting) setIsResetDialogVisible(false);
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

            {resetError && (
              <View style={styles.dialogErrorBox}>
                <Text style={[styles.dialogErrorText, typography.bodySm]}>
                  {resetError}
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
                onPress={handleConfirmReset}
                disabled={isResetting || isBudgetLoading}
                loading={isResetting}
              />

              <Button
                testID="reset-cancel-button"
                title="Cancelar"
                variant="outline"
                size="md"
                fullWidth
                onPress={() => setIsResetDialogVisible(false)}
                disabled={isResetting}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* ================================================================= */}
      {/* DIÁLOGO MODAL: CONFIRMACIÓN DE CIERRE DE SESIÓN (STITCH SCREEN 13) */}
      {/* ================================================================= */}
      <Modal
        visible={isLogoutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isLoggingOut) setIsLogoutModalVisible(false);
        }}
        testID="logout-confirm-modal"
      >
        <View style={styles.dialogOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!isLoggingOut) setIsLogoutModalVisible(false);
            }}
            accessibilityLabel="Cerrar diálogo de confirmación"
          />

          <View style={styles.dialogCard}>
            <View style={styles.dialogIconBox}>
              <MaterialIcons name="logout" size={32} color={colors.secondary} />
            </View>

            <Text
              style={[styles.dialogTitle, typography.headlineMd]}
              testID="logout-dialog-title"
            >
              ¿Deseas cerrar tu sesión actual?
            </Text>

            <Text style={[styles.dialogMessage, typography.bodyMd]}>
              Tus datos de despensa permanecen guardados en este dispositivo. Tendrás que iniciar sesión nuevamente para acceder a tu cuenta.
            </Text>

            {logoutError && (
              <View style={styles.dialogErrorBox} testID="logout-error-banner">
                <Text style={[styles.dialogErrorText, typography.bodySm]}>
                  {logoutError}
                </Text>
              </View>
            )}

            <View style={styles.dialogButtonsCol}>
              <Button
                testID="logout-confirm-button"
                title={isLoggingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
                variant="secondary"
                size="md"
                fullWidth
                onPress={handleConfirmLogout}
                disabled={isLoggingOut}
                loading={isLoggingOut}
              />

              <Button
                testID="logout-cancel-button"
                title="Cancelar"
                variant="outline"
                size="md"
                fullWidth
                disabled={isLoggingOut}
                onPress={() => setIsLogoutModalVisible(false)}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* ================================================================= */}
      {/* MODAL INFORMATIVO: CONFIGURACIÓN / AYUDA / ACERCA DE              */}
      {/* ================================================================= */}
      <Modal
        visible={activeInfoModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveInfoModal(null)}
        testID="info-detail-modal"
      >
        <View style={styles.dialogOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setActiveInfoModal(null)}
            accessibilityLabel="Cerrar modal de información"
          />

          <View style={styles.infoDialogCard}>
            <View style={styles.infoDialogHeader}>
              <View style={styles.infoDialogIconBox}>
                <MaterialIcons
                  name={
                    activeInfoModal === 'config'
                      ? 'settings'
                      : activeInfoModal === 'help'
                      ? 'help-outline'
                      : 'info'
                  }
                  size={24}
                  color={colors.primary}
                />
              </View>
              <Text style={[styles.infoDialogTitle, typography.headlineMd]}>
                {activeInfoModal === 'config' && 'Configuración de la app'}
                {activeInfoModal === 'help' && 'Guía y preguntas frecuentes'}
                {activeInfoModal === 'about' && 'Acerca de FoodAI'}
              </Text>
            </View>

            <ScrollView style={styles.infoDialogScroll}>
              {activeInfoModal === 'config' && (
                <View style={styles.infoContentBox}>
                  <Text style={[styles.infoParagraph, typography.bodyMd]}>
                    <Text style={{ fontWeight: '700' }}>Moneda predeterminada:</Text> Pesos colombianos (COP).
                  </Text>
                  <Text style={[styles.infoParagraph, typography.bodyMd]}>
                    <Text style={{ fontWeight: '700' }}>Unidades métricas:</Text> Gramos (g), Kilogramos (kg), Mililitros (ml), Litros (l) y unidades enteras.
                  </Text>
                  <Text style={[styles.infoParagraph, typography.bodyMd]}>
                    <Text style={{ fontWeight: '700' }}>Privacidad:</Text> Todas tus preferencias, ingredientes y planes permanecen guardados en el almacenamiento local seguro de tu dispositivo.
                  </Text>
                </View>
              )}

              {activeInfoModal === 'help' && (
                <View style={styles.infoContentBox}>
                  <Text style={[styles.infoParagraph, typography.bodyMd]}>
                    <Text style={{ fontWeight: '700' }}>¿Cómo se calculan las recetas?</Text> FoodAI prioriza los alimentos próximos a vencer en tu despensa y cruza los ingredientes faltantes con tu presupuesto disponible.
                  </Text>
                  <Text style={[styles.infoParagraph, typography.bodyMd]}>
                    <Text style={{ fontWeight: '700' }}>¿Qué pasa si cambio mi presupuesto?</Text> El nuevo monto se aplicará a todas las recomendaciones futuras y marcará como pendientes de actualización los planes generados anteriormente.
                  </Text>
                </View>
              )}

              {activeInfoModal === 'about' && (
                <View style={styles.infoContentBox}>
                  <Text style={[styles.infoParagraph, typography.bodyMd]}>
                    FoodAI es tu asistente culinario inteligente y libro mayor de cocina bajo el principio «Primero usa lo que tienes. Después decide qué comprar».
                  </Text>
                  <Text style={[styles.infoParagraph, typography.bodyMd]}>
                    <Text style={{ fontWeight: '700' }}>Versión:</Text> 1.0.0 (Fase 4 · Perfil y Configuración)
                  </Text>
                  <Text style={[styles.infoParagraph, typography.bodyMd]}>
                    Diseño fiel según Google Stitch Screen 13 «Perfil de Usuario».
                  </Text>
                </View>
              )}
            </ScrollView>

            <Button
              title="Entendido"
              variant="primary"
              size="md"
              fullWidth
              onPress={() => setActiveInfoModal(null)}
              testID="close-info-modal-button"
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.margin,
    paddingVertical: spacing.sm,
    backgroundColor: colors.canvas,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
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
  badgeWrapper: {
    backgroundColor: 'rgba(91, 75, 138, 0.12)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  badgeText: {
    color: colors.primary,
    fontWeight: '700',
  },
  headerAvatar: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
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
  userHeaderCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
    minWidth: 0,
  },
  userAvatarInitials: {
    width: 54,
    height: 54,
    borderRadius: radius.full,
    backgroundColor: colors.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    color: colors.primary,
    fontWeight: '700',
  },
  userMetaCol: {
    flex: 1,
    minWidth: 0,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  userNameText: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  householdPill: {
    backgroundColor: colors.surfaceContainer,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  householdPillText: {
    color: colors.outline,
    fontWeight: '600',
  },
  userStatusSub: {
    color: colors.textSecondary,
    marginTop: 2,
  },
  verifiedIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
  },
  impactGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  impactCard: {
    flex: 1,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.lg,
    padding: spacing.md,
    justifyContent: 'space-between',
    minHeight: 104,
  },
  impactCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  impactCardLabel: {
    color: colors.outline,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  impactValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  impactValueBig: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  impactValueUnit: {
    color: colors.textSecondary,
  },
  impactCardSub: {
    color: colors.outline,
    marginTop: 2,
  },
  preferencesSectionCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    gap: spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeaderLeft: {
    flex: 1,
    marginRight: spacing.sm,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: colors.textSecondary,
    marginTop: 2,
  },
  budgetLoadingInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  budgetLoadingText: {
    color: colors.primary,
  },
  preferencesList: {
    gap: spacing.sm,
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerLow,
  },
  preferenceRowPressed: {
    backgroundColor: colors.surfaceContainer,
    transform: [{ scale: 0.99 }],
  },
  preferenceRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    minWidth: 0,
    marginRight: spacing.xs,
  },
  preferenceIconBox: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preferenceLabelCol: {
    flex: 1,
    minWidth: 0,
  },
  preferenceTitle: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  preferenceSubtitle: {
    color: colors.textSecondary,
  },
  preferenceValuePill: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  preferenceValueText: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  editPreferencesButton: {
    width: '100%',
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerLow,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  editPreferencesButtonPressed: {
    backgroundColor: colors.surfaceContainer,
    transform: [{ scale: 0.99 }],
  },
  editPreferencesButtonText: {
    color: colors.primary,
    fontWeight: '600',
  },
  settingsGroupCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  settingsGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  settingsGroupRowPressed: {
    backgroundColor: colors.surfaceContainerLow,
  },
  settingsRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  settingsIconBox: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsTextCol: {
    flex: 1,
  },
  settingsRowTitle: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  settingsRowSubtitle: {
    color: colors.textSecondary,
    marginTop: 2,
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginLeft: 58,
  },
  versionBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  versionBadge: {
    backgroundColor: colors.surfaceContainer,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  versionBadgeText: {
    color: colors.outline,
    fontWeight: '700',
  },
  resetActionSection: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  resetPreferencesButton: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(233, 119, 94, 0.08)',
  },
  resetPreferencesButtonPressed: {
    backgroundColor: 'rgba(233, 119, 94, 0.16)',
    transform: [{ scale: 0.99 }],
  },
  resetPreferencesButtonText: {
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
  },
  logoutActionSection: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    alignItems: 'center',
    gap: spacing.xs,
  },
  logoutButton: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: radius.md,
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
  devToolsCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    gap: spacing.sm,
  },
  devToolsTitle: {
    color: colors.outline,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  devButtonsCol: {
    width: '100%',
    gap: spacing.sm,
  },

  // Estilos del modal de edición
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
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

  // Diálogos modales genéricos
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

  infoDialogCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    maxHeight: '80%',
  },
  infoDialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  infoDialogIconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoDialogTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
    flex: 1,
  },
  infoDialogScroll: {
    maxHeight: 260,
  },
  infoContentBox: {
    gap: spacing.sm,
  },
  infoParagraph: {
    color: colors.textSecondary,
    lineHeight: 22,
  },
});
