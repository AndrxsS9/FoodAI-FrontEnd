import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import {
  Button,
  Card,
  Chip,
  Header,
  Input,
  Stepper,
} from '../src/components/common';
import { colors, radius, spacing, typography } from '../src/theme';

export default function DesignSystemScreen() {
  const [inputText, setInputText] = useState('');
  const [selectedChip, setSelectedChip] = useState<'todos' | 'urgente' | 'bajo'>('todos');
  const [stepperValue, setStepperValue] = useState(2);
  const [pressCount, setPressCount] = useState(0);

  return (
    <SafeAreaView style={styles.safeArea}>
      <Header
        title="FoodAI Design System"
        subtitle="Fase 1: Inicialización & Tokens"
        rightElement={
          <View style={styles.badgeWrapper}>
            <Text style={styles.badgeText}>v1.0</Text>
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Brand Banner */}
        <Card variant="flat" style={styles.brandCard}>
          <View style={styles.brandRow}>
            <View style={styles.logoCircle}>
              <MaterialIcons name="restaurant-menu" size={24} color={colors.onPrimary} />
            </View>
            <View style={styles.brandTextCol}>
              <Text style={typography.headlineMd}>Recetario por Presupuesto</Text>
              <Text style={[typography.bodySm, styles.brandMotto]}>
                {'"Primero usa lo que tienes. Después decide qué comprar."'}
              </Text>
            </View>
          </View>
        </Card>

        {/* Color Palette Tokens */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Paleta Cromática (Stitch)</Text>
          <View style={styles.paletteRow}>
            <View style={[styles.colorBox, { backgroundColor: colors.primary }]}>
              <Text style={styles.colorBoxText}>Primary</Text>
              <Text style={styles.colorHexText}>#5B4B8A</Text>
            </View>
            <View style={[styles.colorBox, { backgroundColor: colors.secondary }]}>
              <Text style={styles.colorBoxText}>Coral</Text>
              <Text style={styles.colorHexText}>#E9775E</Text>
            </View>
            <View style={[styles.colorBox, { backgroundColor: colors.tertiary }]}>
              <Text style={[styles.colorBoxText, { color: colors.textPrimary }]}>Butter</Text>
              <Text style={[styles.colorHexText, { color: colors.textPrimary }]}>#F3C969</Text>
            </View>
            <View style={[styles.colorBox, { backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border }]}>
              <Text style={[styles.colorBoxText, { color: colors.textPrimary }]}>Ivory</Text>
              <Text style={[styles.colorHexText, { color: colors.textSecondary }]}>#FAF7F2</Text>
            </View>
          </View>
        </View>

        {/* Buttons Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Componentes: Botones</Text>
          <View style={styles.buttonStack}>
            <Button
              title="Cocinar con esto (Primary)"
              variant="primary"
              size="lg"
              fullWidth
              onPress={() => setPressCount((c) => c + 1)}
              leftIcon={<MaterialIcons name="local-dining" size={20} color={colors.onPrimary} />}
            />
            <Button
              title="Añadir sobrantes urgentes (Secondary)"
              variant="secondary"
              size="md"
              fullWidth
              onPress={() => setPressCount((c) => c + 1)}
              leftIcon={<MaterialIcons name="alarm" size={20} color={colors.onSecondary} />}
            />
            <Button
              title="Bajo presupuesto (Tertiary)"
              variant="tertiary"
              size="md"
              fullWidth
              onPress={() => setPressCount((c) => c + 1)}
              leftIcon={<MaterialIcons name="savings" size={20} color={colors.textPrimary} />}
            />
            <Button
              title="Configurar opciones (Outline)"
              variant="outline"
              size="md"
              fullWidth
              onPress={() => setPressCount((c) => c + 1)}
            />
          </View>
          {pressCount > 0 && (
            <Text style={styles.feedbackText}>Botones pulsados: {pressCount} veces</Text>
          )}
        </View>

        {/* Chips Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Componentes: Chips & Badges</Text>
          <View style={styles.chipsRow}>
            <Chip
              label="Todos los ingredientes"
              selected={selectedChip === 'todos'}
              variant="filter"
              onPress={() => setSelectedChip('todos')}
            />
            <Chip
              label="Consumir pronto"
              variant="urgent"
              selected={selectedChip === 'urgente'}
              onPress={() => setSelectedChip('urgente')}
              leftIcon={<MaterialIcons name="priority-high" size={14} color={colors.secondary} />}
            />
            <Chip
              label="Económico"
              variant="budget"
              selected={selectedChip === 'bajo'}
              onPress={() => setSelectedChip('bajo')}
              leftIcon={<MaterialIcons name="monetization-on" size={14} color={colors.textPrimary} />}
            />
          </View>
        </View>

        {/* Inputs & Stepper Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Componentes: Formularios y Controles</Text>
          <Input
            label="Presupuesto objetivo"
            placeholder="Ej. $20.000 COP"
            value={inputText}
            onChangeText={setInputText}
            helperText="Define cuánto deseas gastar como máximo en compras adicionales."
            leftElement={<MaterialIcons name="payments" size={20} color={colors.textSecondary} />}
          />

          <Card variant="elevated" style={styles.controlCard}>
            <View style={styles.controlRow}>
              <View>
                <Text style={typography.labelLg}>Número de porciones</Text>
                <Text style={[typography.bodySm, { color: colors.textSecondary }]}>
                  Calcula ingredientes proporcionalmente
                </Text>
              </View>
              <Stepper
                value={stepperValue}
                onChange={setStepperValue}
                min={1}
                max={12}
                unit="personas"
              />
            </View>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  scrollContent: {
    padding: spacing.margin,
    paddingBottom: spacing.xxl,
  },
  badgeWrapper: {
    backgroundColor: colors.surfaceContainerHigh,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  badgeText: {
    ...typography.labelSm,
    color: colors.primary,
  },
  brandCard: {
    marginBottom: spacing.lg,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoCircle: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  brandTextCol: {
    flex: 1,
  },
  brandMotto: {
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 2,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.headlineMd,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  paletteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  colorBox: {
    flex: 1,
    height: 64,
    borderRadius: radius.md,
    padding: spacing.xs,
    justifyContent: 'flex-end',
  },
  colorBoxText: {
    ...typography.labelSm,
    color: colors.onPrimary,
    fontSize: 10,
  },
  colorHexText: {
    fontSize: 9,
    color: colors.onPrimary,
    opacity: 0.85,
  },
  buttonStack: {
    gap: spacing.sm,
  },
  feedbackText: {
    ...typography.bodySm,
    color: colors.primary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  controlCard: {
    marginTop: spacing.sm,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
