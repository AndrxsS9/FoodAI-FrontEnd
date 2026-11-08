/**
 * Tarjeta de ingrediente para la lista de despensa (Fase 2B & Fase 6B.2).
 * Inspirada en las pantallas 6 (Mi Despensa) y 5 (Ingredientes Detectados) de Google Stitch.
 */
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  INGREDIENT_UNIT_LABELS,
  Ingredient,
  getExpirationStatus,
} from '../../types/pantry';
import {
  AppColors,
  radius,
  spacing,
  useTypography,
  useAppTheme,
  useThemeStyles,
} from '../../theme';
import { Card } from '../common/Card';
import { formatShortDate } from '../../utils/dateFormat';
import { CategoryIconName, getCategoryVisual } from './categoryVisuals';

export interface IngredientCardProps {
  ingredient: Ingredient;
  onPress?: (ingredient: Ingredient) => void;
  onEdit?: (ingredient: Ingredient) => void;
  onDelete?: (ingredient: Ingredient) => void;
  onAdjustQuantity?: (id: string, delta: number) => void;
}

export function IngredientCard({
  ingredient,
  onPress,
  onEdit,
  onDelete,
  onAdjustQuantity,
}: IngredientCardProps) {
  const typography = useTypography();
  const { colors, activeColorScheme } = useAppTheme();
  const styles = useThemeStyles(createStyles);

  const catVisual = getCategoryVisual(ingredient.category, activeColorScheme);
  const expiration = getExpirationStatus(ingredient.expirationDate);
  const formattedDate = formatShortDate(ingredient.expirationDate);

  // Determinar paso de incremento según la unidad
  const step =
    ingredient.unit === 'g' || ingredient.unit === 'ml'
      ? 50
      : ingredient.unit === 'kg' || ingredient.unit === 'l'
      ? 0.5
      : 1;

  const handleMinus = () => {
    if (ingredient.quantity - step <= 0) {
      // Si llega a cero o menos, sugerir eliminar
      if (onDelete) {
        onDelete(ingredient);
      }
      return;
    }
    if (onAdjustQuantity) {
      onAdjustQuantity(ingredient.id, -step);
    }
  };

  const handlePlus = () => {
    if (onAdjustQuantity) {
      onAdjustQuantity(ingredient.id, step);
    }
  };

  const unitLabel = INGREDIENT_UNIT_LABELS[ingredient.unit] || ingredient.unit;
  const quantityDisplay = `${ingredient.quantity} ${unitLabel}`;

  // Chip de estado de caducidad: urgente, pronto, con fecha o sin fecha
  const statusChip: { icon: CategoryIconName; label: string; tone: 'urgent' | 'warning' | 'neutral' } =
    expiration.isUrgent
      ? { icon: 'clock-alert-outline', label: expiration.label, tone: 'urgent' }
      : expiration.badgeVariant === 'warning'
      ? { icon: 'clock-outline', label: expiration.label, tone: 'warning' }
      : formattedDate
      ? { icon: 'calendar-blank-outline', label: `Vence ${formattedDate}`, tone: 'neutral' }
      : { icon: 'infinity', label: 'Sin fecha de caducidad', tone: 'neutral' };

  const statusColor =
    statusChip.tone === 'urgent'
      ? colors.onSecondaryFixed
      : statusChip.tone === 'warning'
      ? colors.onTertiaryFixed
      : colors.textSecondary;

  return (
    <Card
      variant="elevated"
      style={[styles.card, expiration.isUrgent && styles.cardUrgent]}
      testID={`ingredient-card-${ingredient.id}`}
      accessibilityRole="text"
      accessibilityLabel={`Alimento: ${ingredient.name}, cantidad: ${quantityDisplay}, categoría: ${ingredient.category}, estado: ${expiration.label}`}
    >
      <View style={styles.contentRow}>
        {/* Ícono de categoría con fondo suave acorde a la paleta */}
        <View
          style={[styles.iconContainer, { backgroundColor: catVisual.bgColor }]}
          accessibilityRole="none"
        >
          <MaterialCommunityIcons name={catVisual.icon} size={24} color={catVisual.color} />
        </View>

        {/* Información del ingrediente */}
        <Pressable
          style={styles.infoCol}
          onPress={() => onPress && onPress(ingredient)}
          disabled={!onPress}
          accessibilityRole={onPress ? 'button' : 'none'}
          accessibilityLabel={`Ver o editar ${ingredient.name}`}
        >
          <Text
            style={[styles.nameText, typography.bodyLg]}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {ingredient.name}
          </Text>
          <Text style={[styles.categoryText, typography.bodySm]} numberOfLines={1}>
            {ingredient.category}
          </Text>
        </Pressable>

        {/* Acciones: Editar y Eliminar */}
        <View style={styles.actionsRow}>
          {onEdit && (
            <Pressable
              testID={`edit-ingredient-${ingredient.id}`}
              style={({ pressed }) => [
                styles.iconButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={() => onEdit(ingredient)}
              accessibilityRole="button"
              accessibilityLabel={`Editar ${ingredient.name}`}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            >
              <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.textSecondary} />
            </Pressable>
          )}

          {onDelete && (
            <Pressable
              testID={`delete-ingredient-${ingredient.id}`}
              style={({ pressed }) => [
                styles.iconButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={() => onDelete(ingredient)}
              accessibilityRole="button"
              accessibilityLabel={`Eliminar ${ingredient.name}`}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.error} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Barra inferior: estado de caducidad y stepper de cantidad */}
      <View style={styles.footerRow}>
        <View
          testID={`expiration-chip-${ingredient.id}`}
          style={[
            styles.statusChip,
            statusChip.tone === 'urgent' && styles.statusChipUrgent,
            statusChip.tone === 'warning' && styles.statusChipWarning,
          ]}
        >
          <MaterialCommunityIcons name={statusChip.icon} size={14} color={statusColor} />
          <Text
            style={[styles.statusText, typography.labelMd, { color: statusColor }]}
            numberOfLines={2}
          >
            {statusChip.label}
          </Text>
        </View>

        {onAdjustQuantity ? (
          <View style={styles.stepperContainer}>
            <Pressable
              testID={`stepper-minus-${ingredient.id}`}
              style={({ pressed }) => [
                styles.stepperBtn,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleMinus}
              accessibilityRole="button"
              accessibilityLabel={`Disminuir cantidad de ${ingredient.name}`}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <MaterialCommunityIcons name="minus" size={16} color={colors.textPrimary} />
            </Pressable>

            <Text
              style={[styles.quantityText, typography.labelLg]}
              testID={`quantity-display-${ingredient.id}`}
            >
              {quantityDisplay}
            </Text>

            <Pressable
              testID={`stepper-plus-${ingredient.id}`}
              style={({ pressed }) => [
                styles.stepperBtn,
                pressed && styles.buttonPressed,
              ]}
              onPress={handlePlus}
              accessibilityRole="button"
              accessibilityLabel={`Aumentar cantidad de ${ingredient.name}`}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <MaterialCommunityIcons name="plus" size={16} color={colors.textPrimary} />
            </Pressable>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: {
      padding: spacing.md,
      borderRadius: radius.lg + 4,
      gap: spacing.sm + 4,
    },
    cardUrgent: {
      borderLeftWidth: 3,
      borderLeftColor: colors.secondary,
    },
    contentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 4,
    },
    iconContainer: {
      width: 46,
      height: 46,
      borderRadius: radius.md + 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoCol: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    nameText: {
      color: colors.textPrimary,
      fontWeight: '700',
    },
    categoryText: {
      color: colors.textSecondary,
    },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      flexShrink: 0,
    },
    iconButton: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceContainerLow,
    },
    buttonPressed: {
      opacity: 0.6,
      transform: [{ scale: 0.95 }],
    },
    // Si la etiqueta de caducidad y el stepper no caben (320 dp o fuente grande), el stepper
    // pasa a la línea siguiente alineado a la derecha en lugar de truncar la fecha.
    footerRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    statusChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      flexShrink: 1,
      minWidth: 0,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: 6,
      borderRadius: radius.full,
      backgroundColor: colors.surfaceContainerLow,
    },
    statusChipUrgent: {
      backgroundColor: colors.secondaryFixed,
    },
    statusChipWarning: {
      backgroundColor: colors.tertiaryFixed,
    },
    statusText: {
      flexShrink: 1,
    },
    stepperContainer: {
      marginLeft: 'auto',
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: radius.full,
      padding: 3,
      gap: 2,
      flexShrink: 0,
    },
    stepperBtn: {
      width: 32,
      height: 32,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    quantityText: {
      color: colors.textPrimary,
      fontWeight: '700',
      paddingHorizontal: spacing.xs,
      minWidth: 52,
      textAlign: 'center',
    },
  });
