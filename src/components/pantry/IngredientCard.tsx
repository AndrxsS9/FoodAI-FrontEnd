/**
 * Tarjeta de ingrediente para la lista de despensa (Fase 2B).
 * Inspirada en las pantallas 6 (Mi Despensa) y 5 (Ingredientes Detectados) de Google Stitch.
 */
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import {
  CATEGORY_CONFIG,
  INGREDIENT_UNIT_LABELS,
  Ingredient,
  getExpirationStatus,
} from '../../types/pantry';
import { colors, radius, spacing, useTypography } from '../../theme';
import { Card } from '../common/Card';

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
  const catConfig = CATEGORY_CONFIG[ingredient.category] || CATEGORY_CONFIG.Otros;
  const expiration = getExpirationStatus(ingredient.expirationDate);

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

  return (
    <Card
      variant="elevated"
      style={styles.card}
      testID={`ingredient-card-${ingredient.id}`}
      accessibilityRole="text"
      accessibilityLabel={`Alimento: ${ingredient.name}, cantidad: ${quantityDisplay}, categoría: ${ingredient.category}, estado: ${expiration.label}`}
    >
      <View style={styles.contentRow}>
        {/* Ícono de categoría con fondo suave acorde a la paleta */}
        <View
          style={[styles.iconContainer, { backgroundColor: catConfig.bgColor }]}
          accessibilityRole="none"
        >
          <MaterialIcons
            name={catConfig.icon as any}
            size={24}
            color={catConfig.color}
          />
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
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {ingredient.name}
          </Text>

          <View style={styles.tagsRow}>
            {/* Categoría chip */}
            <View style={styles.categoryChip}>
              <Text style={[styles.categoryText, typography.labelSm]}>
                {ingredient.category}
              </Text>
            </View>

            {/* Badge de vencimiento/prioridad */}
            {expiration.isUrgent ? (
              <View style={styles.urgentBadge}>
                <MaterialIcons name="schedule" size={12} color={colors.secondary} />
                <Text style={[styles.urgentText, typography.labelSm]}>
                  {expiration.label}
                </Text>
              </View>
            ) : expiration.daysRemaining !== null ? (
              <View style={styles.warningBadge}>
                <MaterialIcons name="event" size={12} color={colors.tertiaryContainer} />
                <Text style={[styles.warningText, typography.labelSm]}>
                  {expiration.label}
                </Text>
              </View>
            ) : null}
          </View>
        </Pressable>

        {/* Acciones: Editar y Eliminar */}
        <View style={styles.actionsCol}>
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
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="edit" size={20} color={colors.textSecondary} />
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
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="delete-outline" size={20} color={colors.error} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Barra inferior: Stepper de cantidad rápida y fecha */}
      <View style={styles.footerRow}>
        <View style={styles.expirationInfo}>
          <MaterialIcons name="calendar-today" size={14} color={colors.outline} />
          <Text style={[styles.expirationDateText, typography.bodySm]}>
            {ingredient.expirationDate
              ? `Vence: ${ingredient.expirationDate}`
              : 'Sin fecha de caducidad'}
          </Text>
        </View>

        {onAdjustQuantity && (
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
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <MaterialIcons name="remove" size={16} color={colors.textPrimary} />
            </Pressable>

            <Text
              style={[styles.quantityText, typography.labelMd]}
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
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <MaterialIcons name="add" size={16} color={colors.textPrimary} />
            </Pressable>
          </View>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.xl,
    gap: spacing.sm,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  infoCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  nameText: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  categoryChip: {
    backgroundColor: colors.surfaceContainerLow,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  categoryText: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  urgentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(233, 119, 94, 0.15)',
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: radius.full,
    gap: 3,
  },
  urgentText: {
    color: colors.secondary,
    fontWeight: '700',
    fontSize: 11,
  },
  warningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(243, 201, 105, 0.25)',
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: radius.full,
    gap: 3,
  },
  warningText: {
    color: '#8A5E00',
    fontWeight: '600',
    fontSize: 11,
  },
  actionsCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.6,
    transform: [{ scale: 0.95 }],
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outlineVariant,
  },
  expirationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    minWidth: 0,
  },
  expirationDateText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.full,
    padding: 2,
    gap: 4,
  },
  stepperBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 1,
  },
  quantityText: {
    color: colors.textPrimary,
    fontWeight: '700',
    paddingHorizontal: spacing.xs,
    minWidth: 48,
    textAlign: 'center',
  },
});
