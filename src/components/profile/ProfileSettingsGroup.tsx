/**
 * FoodAI - Grupo de Configuración y Soporte del Proyecto (Fase 5B).
 * Presenta opciones informativas reales, sin pretender ser preferencias editables falsas.
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
import { MaterialIcons } from '@expo/vector-icons';
import { colors, radius, spacing, useTypography } from '../../theme';
import { Button } from '../common';

export function ProfileSettingsGroup() {
  const typography = useTypography();
  const [activeInfoModal, setActiveInfoModal] = useState<
    'config' | 'help' | 'about' | null
  >(null);

  return (
    <View style={styles.card}>
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
              Unidades métricas, moneda y almacenamiento
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
            <MaterialIcons
              name="help-outline"
              size={20}
              color={colors.textPrimary}
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    width: '100%',
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
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
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
    shadowColor: colors.primary,
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
});
