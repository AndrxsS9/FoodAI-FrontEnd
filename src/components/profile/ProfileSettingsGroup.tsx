/**
 * FoodAI - Grupo de Configuración, Apariencia y Soporte del Proyecto (Fase 5B & Fase 6B.2).
 *
 * Características:
 * - Selector genuino, reactivo y accesible de apariencia (Claro, Oscuro y Automático).
 * - Persistencia asíncrona inmediata en dispositivo sin remonte de autenticación.
 * - Manejo explícito de fallos de persistencia sin confirmaciones falsas.
 * - Información del sistema real sobre moneda (COP), unidades métricas y privacidad.
 * - Compatibilidad total con lectores de pantalla y WCAG AA.
 */

import React, { useState } from 'react';
import {
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

interface AppearanceOption {
  id: ThemeMode;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  hint: string;
}

const APPEARANCE_OPTIONS: AppearanceOption[] = [
  {
    id: 'light',
    label: 'Claro',
    icon: 'white-balance-sunny',
    hint: 'Paleta luminosa con fondo marfil cálido',
  },
  {
    id: 'dark',
    label: 'Oscuro',
    icon: 'weather-night',
    hint: 'Paleta nocturna con tonos oscuros elegantes',
  },
  {
    id: 'system',
    label: 'Automático',
    icon: 'brightness-auto',
    hint: 'Sigue automáticamente la apariencia del dispositivo',
  },
];

export function ProfileSettingsGroup() {
  const typography = useTypography();
  const { themeMode, setThemeMode } = useAppTheme();
  const styles = useThemeStyles(createStyles);

  const [activeInfoModal, setActiveInfoModal] = useState<
    'config' | 'help' | 'about' | null
  >(null);
  const [appearanceError, setAppearanceError] = useState<string | null>(null);

  const handleSelectTheme = async (mode: ThemeMode) => {
    if (mode === themeMode) return;
    try {
      setAppearanceError(null);
      await setThemeMode(mode);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Error al persistir la preferencia de apariencia.';
      setAppearanceError(msg);
    }
  };

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
              Apariencia visual
            </Text>
            <Text style={[styles.settingsRowSubtitle, typography.bodySm]}>
              Selecciona tu tema preferido
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
              {appearanceError}
            </Text>
            <Pressable
              onPress={() => setAppearanceError(null)}
              accessibilityLabel="Cerrar mensaje de error"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons name="close" size={14} color={styles.errorIconColor.color} />
            </Pressable>
          </View>
        )}

        <View
          style={styles.optionsRow}
          accessibilityRole="radiogroup"
          accessibilityLabel="Opciones de tema: Claro, Oscuro y Automático"
        >
          {APPEARANCE_OPTIONS.map((option) => {
            const isSelected = themeMode === option.id;

            return (
              <Pressable
                key={option.id}
                onPress={() => handleSelectTheme(option.id)}
                accessibilityRole="radio"
                accessibilityLabel={`${option.label}, ${
                  isSelected ? 'seleccionado' : 'no seleccionado'
                }`}
                accessibilityHint={option.hint}
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
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.sectionDivider} />

      {/* SECCIÓN 2: Filas Informativas y de Soporte */}
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
            <MaterialCommunityIcons name="cog-outline" size={20} color={styles.iconColor.color} />
          </View>
          <View style={styles.settingsTextCol}>
            <Text style={[styles.settingsRowTitle, typography.labelLg]}>
              Configuración
            </Text>
            <Text style={[styles.settingsRowSubtitle, typography.bodySm]}>
              Unidades métricas, moneda y almacenamiento
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
        accessibilityLabel="Ayuda y preguntas frecuentes: Guía de inventario y optimización"
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
              Ayuda y preguntas frecuentes
            </Text>
            <Text style={[styles.settingsRowSubtitle, typography.bodySm]}>
              Guía de inventario y optimización
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
        accessibilityLabel="Acerca del proyecto: Consumo responsable en el hogar. Versión 1.0.0"
        testID="settings-row-about"
      >
        <View style={styles.settingsRowLeft}>
          <View style={styles.settingsIconBox}>
            <MaterialCommunityIcons name="information" size={20} color={styles.iconColor.color} />
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
            accessibilityLabel="Cerrar modal de información"
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
                {activeInfoModal === 'config' && 'Configuración de la app'}
                {activeInfoModal === 'help' && 'Guía y preguntas frecuentes'}
                {activeInfoModal === 'about' && 'Acerca de FoodAI'}
              </Text>
            </View>

            <ScrollView style={styles.infoDialogScroll}>
              {activeInfoModal === 'config' && (
                <View style={styles.infoContentBox}>
                  <Text style={[styles.infoParagraph, typography.bodyMd]}>
                    <Text style={{ fontWeight: '700' }}>Moneda predeterminada:</Text>{' '}
                    Pesos colombianos (COP).
                  </Text>
                  <Text style={[styles.infoParagraph, typography.bodyMd]}>
                    <Text style={{ fontWeight: '700' }}>Unidades métricas:</Text>{' '}
                    Gramos (g), Kilogramos (kg), Mililitros (ml), Litros (l) y unidades enteras.
                  </Text>
                  <Text style={[styles.infoParagraph, typography.bodyMd]}>
                    <Text style={{ fontWeight: '700' }}>Privacidad y datos aislados:</Text>{' '}
                    Tus preferencias, despensa y planes de cocina están aislados por usuario y se guardan localmente en tu dispositivo.
                  </Text>
                </View>
              )}

              {activeInfoModal === 'help' && (
                <View style={styles.infoContentBox}>
                  <Text style={[styles.infoParagraph, typography.bodyMd]}>
                    <Text style={{ fontWeight: '700' }}>¿Cómo se calculan las recetas?</Text>{' '}
                    FoodAI prioriza los alimentos próximos a vencer en tu despensa y cruza los ingredientes faltantes con tu presupuesto disponible.
                  </Text>
                  <Text style={[styles.infoParagraph, typography.bodyMd]}>
                    <Text style={{ fontWeight: '700' }}>¿Qué pasa si cambio mi presupuesto?</Text>{' '}
                    El nuevo monto se aplicará a todas las recomendaciones futuras y actualizará tus planes culinarios.
                  </Text>
                </View>
              )}

              {activeInfoModal === 'about' && (
                <View style={styles.infoContentBox}>
                  <Text style={[styles.infoParagraph, typography.bodyMd]}>
                    FoodAI es tu asistente culinario inteligente bajo el principio: «Primero usa lo que tienes. Después decide qué comprar».
                  </Text>
                  <Text style={[styles.infoParagraph, typography.bodyMd]}>
                    <Text style={{ fontWeight: '700' }}>Versión:</Text> 1.0.0
                  </Text>
                  <Text style={[styles.infoParagraph, typography.bodyMd]}>
                    Diseñado con una arquitectura móvil moderna, accesible y aislada por cuenta.
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
