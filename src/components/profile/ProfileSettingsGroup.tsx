/**
 * FoodAI - Grupo de Configuración, Apariencia, Idioma y Soporte del Proyecto
 * (Fase 5B, Fase 6B.2 y Fase 28C-A).
 *
 * Características:
 * - Selector genuino, reactivo y accesible de apariencia (Claro, Oscuro y Automático).
 * - Selector de idioma (Español / English) aplicado al instante y persistido en el dispositivo.
 * - Persistencia asíncrona inmediata en dispositivo sin remonte de autenticación.
 * - Manejo explícito de fallos de persistencia sin confirmaciones falsas.
 * - Información del sistema real sobre moneda (COP), unidades métricas y privacidad.
 * - Compatibilidad total con lectores de pantalla y WCAG AA.
 */

import React, { useState } from 'react';
import {
  AccessibilityInfo,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  AppColors, getAppSurfaces,
  ThemeMode,
  radius,
  spacing,
  useTypography,
  useAppTheme,
  useThemeStyles,
} from '../../theme';
import { Button } from '../common';
import { useLocale } from '../../context/LocaleContext';
import { Locale, MessageKey, getTranslator } from '../../locales';

interface AppearanceOption {
  id: ThemeMode;
  labelKey: MessageKey;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  hintKey: MessageKey;
}

const APPEARANCE_OPTIONS: AppearanceOption[] = [
  {
    id: 'light',
    labelKey: 'settings.themeLight',
    icon: 'white-balance-sunny',
    hintKey: 'settings.themeLightHint',
  },
  {
    id: 'dark',
    labelKey: 'settings.themeDark',
    icon: 'weather-night',
    hintKey: 'settings.themeDarkHint',
  },
  {
    id: 'system',
    labelKey: 'settings.themeSystem',
    icon: 'brightness-auto',
    hintKey: 'settings.themeSystemHint',
  },
];

interface LanguageOption {
  id: Locale;
  /** Nombre del idioma en su propio idioma (no se traduce). */
  labelKey: MessageKey;
  hintKey: MessageKey;
}

const LANGUAGE_OPTIONS: LanguageOption[] = [
  { id: 'es', labelKey: 'language.optionEs', hintKey: 'language.hintEs' },
  { id: 'en', labelKey: 'language.optionEn', hintKey: 'language.hintEn' },
];

export function ProfileSettingsGroup() {
  const typography = useTypography();
  const { themeMode, setThemeMode } = useAppTheme();
  const { t, tx, locale, setLocale, storageError: localeStorageError, clearStorageError } = useLocale();
  const styles = useThemeStyles(createStyles);

  const [activeInfoModal, setActiveInfoModal] = useState<
    'config' | 'help' | 'about' | null
  >(null);
  const [appearanceError, setAppearanceError] = useState<boolean>(false);

  const handleSelectTheme = async (mode: ThemeMode) => {
    if (mode === themeMode) return;
    try {
      setAppearanceError(false);
      await setThemeMode(mode);
    } catch {
      // Nunca se expone el mensaje interno del almacenamiento.
      setAppearanceError(true);
    }
  };

  const handleSelectLanguage = async (next: Locale) => {
    if (next === locale) return;
    try {
      await setLocale(next);
      // Anuncio en el idioma recién seleccionado, solo tras persistir correctamente.
      const nextT = getTranslator(next).t;
      AccessibilityInfo.announceForAccessibility?.(
        nextT('language.changedAnnouncement', { language: nextT(next === 'es' ? 'language.optionEs' : 'language.optionEn') })
      );
    } catch {
      // El contexto ya expone el código de error (`save_failed`); no se muestra éxito.
    }
  };

  const languageErrorMessage =
    localeStorageError === 'load_failed'
      ? t('language.loadFailed')
      : localeStorageError
      ? t('language.saveFailed')
      : null;
  const currentLanguageName = t(locale === 'es' ? 'language.optionEs' : 'language.optionEn');

  return (
    <View style={styles.card} testID="profile-settings-card">
      {/* SECCIÓN 1: Selector de Apariencia Visual */}
      <View style={styles.appearanceSection} testID="theme-selector-group">
        <View style={styles.appearanceHeader}>
          <View style={styles.settingsIconBox}>
            <MaterialCommunityIcons name="palette-outline" size={20} color={styles.iconColor.color} />
          </View>
          <View style={styles.settingsTextCol}>
            <Text style={[styles.settingsRowTitle, typography.labelLg]}>
              {t('settings.appearanceTitle')}
            </Text>
            <Text style={[styles.settingsRowSubtitle, typography.bodySm]}>
              {t('settings.appearanceSubtitle')}
            </Text>
          </View>
        </View>

        {appearanceError && (
          <View
            style={styles.appearanceErrorBanner}
            accessibilityRole="alert"
            testID="theme-save-error-banner"
          >
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color={styles.errorIconColor.color} />
            <Text style={[styles.appearanceErrorText, typography.labelSm]}>
              {t('settings.appearanceSaveFailed')}
            </Text>
            <Pressable
              onPress={() => setAppearanceError(false)}
              accessibilityLabel={t('common.closeErrorMessage')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons name="close" size={14} color={styles.errorIconColor.color} />
            </Pressable>
          </View>
        )}

        <View
          style={styles.optionsRow}
          accessibilityRole="radiogroup"
          accessibilityLabel={t('settings.themeOptionsLabel')}
        >
          {APPEARANCE_OPTIONS.map((option) => {
            const isSelected = themeMode === option.id;
            const label = tx(option.labelKey);

            return (
              <Pressable
                key={option.id}
                onPress={() => handleSelectTheme(option.id)}
                accessibilityRole="radio"
                accessibilityLabel={t('settings.optionState', {
                  label,
                  state: isSelected ? t('common.selected') : t('common.notSelected'),
                })}
                accessibilityHint={tx(option.hintKey)}
                accessibilityState={{ selected: isSelected }}
                testID={`appearance-option-${option.id}`}
                style={({ pressed }) => [
                  styles.optionButton,
                  isSelected && styles.optionButtonSelected,
                  pressed && styles.optionButtonPressed,
                ]}
              >
                <MaterialCommunityIcons
                  name={option.icon}
                  size={22}
                  color={isSelected ? styles.selectedColor.color : styles.unselectedColor.color}
                />
                <Text
                  style={[
                    styles.optionLabel,
                    typography.labelSm,
                    isSelected ? styles.optionLabelSelected : styles.optionLabelUnselected,
                  ]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.sectionDivider} />

      {/* SECCIÓN 2: Selector de Idioma (Fase 28C-A) */}
      <View style={styles.appearanceSection} testID="language-selector-group">
        <View style={styles.appearanceHeader}>
          <View style={styles.settingsIconBox}>
            <MaterialCommunityIcons name="translate" size={20} color={styles.iconColor.color} />
          </View>
          <View style={styles.settingsTextCol}>
            <Text style={[styles.settingsRowTitle, typography.labelLg]}>
              {t('language.title')}
            </Text>
            <Text
              style={[styles.settingsRowSubtitle, typography.bodySm]}
              testID="language-current-label"
            >
              {t('language.current', { language: currentLanguageName })}
            </Text>
          </View>
        </View>

        {languageErrorMessage && (
          <View
            style={styles.appearanceErrorBanner}
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            testID="language-save-error-banner"
          >
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color={styles.errorIconColor.color} />
            <Text style={[styles.appearanceErrorText, typography.labelSm]}>
              {languageErrorMessage}
            </Text>
            <Pressable
              onPress={clearStorageError}
              accessibilityLabel={t('common.closeErrorMessage')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              testID="language-error-dismiss"
            >
              <MaterialCommunityIcons name="close" size={14} color={styles.errorIconColor.color} />
            </Pressable>
          </View>
        )}

        <View
          style={styles.optionsRow}
          accessibilityRole="radiogroup"
          accessibilityLabel={t('language.optionsGroupLabel')}
        >
          {LANGUAGE_OPTIONS.map((option) => {
            const isSelected = locale === option.id;
            const label = tx(option.labelKey);

            return (
              <Pressable
                key={option.id}
                onPress={() => handleSelectLanguage(option.id)}
                accessibilityRole="radio"
                accessibilityLabel={t('settings.optionState', {
                  label,
                  state: isSelected ? t('common.selected') : t('common.notSelected'),
                })}
                accessibilityHint={tx(option.hintKey)}
                accessibilityState={{ selected: isSelected, checked: isSelected }}
                accessibilityLanguage={option.id}
                testID={`language-option-${option.id}`}
                style={({ pressed }) => [
                  styles.optionButton,
                  styles.languageOptionButton,
                  isSelected && styles.optionButtonSelected,
                  pressed && styles.optionButtonPressed,
                ]}
              >
                <Text
                  style={[
                    styles.languageCode,
                    typography.labelSm,
                    isSelected ? styles.optionLabelSelected : styles.optionLabelUnselected,
                  ]}
                  importantForAccessibility="no"
                >
                  {option.id.toUpperCase()}
                </Text>
                <Text
                  style={[
                    styles.optionLabel,
                    typography.labelSm,
                    isSelected ? styles.optionLabelSelected : styles.optionLabelUnselected,
                  ]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
                {isSelected && (
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={16}
                    color={styles.selectedColor.color}
                    testID={`language-option-${option.id}-check`}
                  />
                )}
              </Pressable>
            );
          })}
        </View>

        {locale !== 'es' && (
          <Text style={[styles.settingsRowSubtitle, typography.bodySm]} testID="language-ai-notice">
            {t('language.aiContentNotice')}
          </Text>
        )}
      </View>

      <View style={styles.sectionDivider} />

      {/* SECCIÓN 3: Filas Informativas y de Soporte */}
      {/* Fila 1: Configuración */}
      <Pressable
        style={({ pressed }) => [
          styles.settingsGroupRow,
          pressed && styles.settingsGroupRowPressed,
        ]}
        onPress={() => setActiveInfoModal('config')}
        accessibilityRole="button"
        accessibilityLabel={t('settings.configLabel')}
        testID="settings-row-config"
      >
        <View style={styles.settingsRowLeft}>
          <View style={styles.settingsIconBox}>
            <MaterialCommunityIcons name="cog-outline" size={20} color={styles.iconColor.color} />
          </View>
          <View style={styles.settingsTextCol}>
            <Text style={[styles.settingsRowTitle, typography.labelLg]}>
              {t('settings.configTitle')}
            </Text>
            <Text style={[styles.settingsRowSubtitle, typography.bodySm]}>
              {t('settings.configSubtitle')}
            </Text>
          </View>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={styles.chevronColor.color} />
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
        accessibilityLabel={t('settings.helpLabel')}
        testID="settings-row-help"
      >
        <View style={styles.settingsRowLeft}>
          <View style={styles.settingsIconBox}>
            <MaterialCommunityIcons
              name="help-circle-outline"
              size={20}
              color={styles.iconColor.color}
            />
          </View>
          <View style={styles.settingsTextCol}>
            <Text style={[styles.settingsRowTitle, typography.labelLg]}>
              {t('settings.helpTitle')}
            </Text>
            <Text style={[styles.settingsRowSubtitle, typography.bodySm]}>
              {t('settings.helpSubtitle')}
            </Text>
          </View>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={styles.chevronColor.color} />
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
        accessibilityLabel={t('settings.aboutLabel')}
        testID="settings-row-about"
      >
        <View style={styles.settingsRowLeft}>
          <View style={styles.settingsIconBox}>
            <MaterialCommunityIcons name="information" size={20} color={styles.iconColor.color} />
          </View>
          <View style={styles.settingsTextCol}>
            <Text style={[styles.settingsRowTitle, typography.labelLg]}>
              {t('settings.aboutTitle')}
            </Text>
            <Text style={[styles.settingsRowSubtitle, typography.bodySm]}>
              {t('settings.aboutSubtitle')}
            </Text>
          </View>
        </View>
        <View style={styles.versionBadgeRow}>
          <View style={styles.versionBadge}>
            <Text style={[styles.versionBadgeText, typography.labelSm]}>
              v1.0.0
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color={styles.chevronColor.color} />
        </View>
      </Pressable>

      {/* Modal informativo: Configuración / Ayuda / Acerca de */}
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
            accessibilityLabel={t('settings.closeInfoModal')}
          />

          <View style={styles.infoDialogCard}>
            <View style={styles.infoDialogHeader}>
              <View style={styles.infoDialogIconBox}>
                <MaterialCommunityIcons
                  name={
                    activeInfoModal === 'config'
                      ? 'cog-outline'
                      : activeInfoModal === 'help'
                      ? 'help-circle-outline'
                      : 'information'
                  }
                  size={24}
                  color={styles.selectedColor.color}
                />
              </View>
              <Text style={[styles.infoDialogTitle, typography.headlineMd]}>
                {activeInfoModal === 'config' && t('settings.configModalTitle')}
                {activeInfoModal === 'help' && t('settings.helpModalTitle')}
                {activeInfoModal === 'about' && t('settings.aboutModalTitle')}
              </Text>
            </View>

            <ScrollView style={styles.infoDialogScroll}>
              {activeInfoModal === 'config' && (
                <View style={styles.infoContentBox}>
                  <Text style={[styles.infoParagraph, typography.bodyMd]}>
                    <Text style={{ fontWeight: '700' }}>{t('settings.currencyLabel')}</Text>{' '}
                    {t('settings.currencyValue')}
                  </Text>
                  <Text style={[styles.infoParagraph, typography.bodyMd]}>
                    <Text style={{ fontWeight: '700' }}>{t('settings.unitsLabel')}</Text>{' '}
                    {t('settings.unitsValue')}
                  </Text>
                  <Text style={[styles.infoParagraph, typography.bodyMd]}>
                    <Text style={{ fontWeight: '700' }}>{t('settings.languageInfoLabel')}</Text>{' '}
                    {t('settings.languageInfoValue')}
                  </Text>
                  <Text style={[styles.infoParagraph, typography.bodyMd]}>
                    <Text style={{ fontWeight: '700' }}>{t('settings.privacyLabel')}</Text>{' '}
                    {t('settings.privacyValue')}
                  </Text>
                </View>
              )}

              {activeInfoModal === 'help' && (
                <View style={styles.infoContentBox}>
                  <Text style={[styles.infoParagraph, typography.bodyMd]}>
                    <Text style={{ fontWeight: '700' }}>{t('settings.helpRecipesQ')}</Text>{' '}
                    {t('settings.helpRecipesA')}
                  </Text>
                  <Text style={[styles.infoParagraph, typography.bodyMd]}>
                    <Text style={{ fontWeight: '700' }}>{t('settings.helpBudgetQ')}</Text>{' '}
                    {t('settings.helpBudgetA')}
                  </Text>
                </View>
              )}

              {activeInfoModal === 'about' && (
                <View style={styles.infoContentBox}>
                  <Text style={[styles.infoParagraph, typography.bodyMd]}>
                    {t('settings.aboutPrinciple')}
                  </Text>
                  <Text style={[styles.infoParagraph, typography.bodyMd]}>
                    <Text style={{ fontWeight: '700' }}>{t('settings.versionLabel')}</Text> 1.0.0
                  </Text>
                  <Text style={[styles.infoParagraph, typography.bodyMd]}>
                    {t('settings.aboutArchitecture')}
                  </Text>
                </View>
              )}
            </ScrollView>

            <Button
              title={t('common.understood')}
              variant="primary"
              size="md"
              fullWidth
              onPress={() => setActiveInfoModal(null)}
              testID="close-info-modal-button"
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: {
      ...getAppSurfaces(colors).card,
      overflow: 'hidden',
      width: '100%',
    },

    // Sección de apariencia
    appearanceSection: {
      padding: spacing.md,
      gap: spacing.sm,
    },
    appearanceHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    appearanceErrorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.errorContainer,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      gap: spacing.xs,
    },
    appearanceErrorText: {
      flex: 1,
      color: colors.error,
    },
    optionsRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: 2,
    },
    optionButton: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      paddingHorizontal: spacing.xs,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surfaceContainerLow,
      gap: 4,
      minHeight: 52,
    },
    optionButtonSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.surface,
    },
    optionButtonPressed: {
      opacity: 0.8,
    },
    optionLabel: {
      fontSize: 12,
    },
    languageOptionButton: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    languageCode: {
      fontSize: 11,
      letterSpacing: 0.5,
    },
    optionLabelSelected: {
      color: colors.primary,
      fontWeight: '700',
    },
    optionLabelUnselected: {
      color: colors.textSecondary,
      fontWeight: '500',
    },

    sectionDivider: {
      height: 1,
      backgroundColor: colors.borderLight,
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
      width: 36,
      height: 36,
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
      lineHeight: 18,
    },
    rowDivider: {
      height: 1,
      backgroundColor: colors.borderLight,
      marginLeft: 60,
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

    // Modal de información
    dialogOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.margin,
    },
    infoDialogCard: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      padding: spacing.lg,
      gap: spacing.md,
      maxHeight: '80%',
      shadowColor: colors.cardShadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 16,
      elevation: 8,
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

    // Helper colors for inline icons
    iconColor: {
      color: colors.textPrimary,
    },
    chevronColor: {
      color: colors.outline,
    },
    selectedColor: {
      color: colors.primary,
    },
    unselectedColor: {
      color: colors.outline,
    },
    errorIconColor: {
      color: colors.error,
    },
  });
