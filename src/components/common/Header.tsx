import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { AppColors, radius, spacing, useTypography, useAppTheme, useThemeStyles } from '../../theme';

export interface HeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightElement?: React.ReactNode;
  /** Muestra el logotipo de la marca a la izquierda del título */
  showLogo?: boolean;
  /** Texto pequeño en mayúsculas sobre el título (ej. nombre de la app) */
  eyebrow?: string;
  /** Aplica fondo del lienzo con sombra suave como barra superior fija */
  elevated?: boolean;
  style?: ViewStyle;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  showBack = false,
  onBack,
  rightElement,
  showLogo = false,
  eyebrow,
  elevated = false,
  style,
}) => {
  const typography = useTypography();
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);

  return (
    <View style={[styles.container, elevated && styles.elevated, style]}>
      <View style={styles.leftRow}>
        {showBack && (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Volver"
            accessibilityHint="Regresar a la pantalla anterior"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.backButtonPressed,
            ]}
          >
            <MaterialIcons name="arrow-back" size={22} color={colors.textPrimary} />
          </Pressable>
        )}

        {showLogo && (
          <Image
            source={require('../../../assets/images/logo.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Logotipo de Recetario por Presupuesto"
          />
        )}

        <View style={styles.titleContainer}>
          {eyebrow ? (
            <Text style={[styles.eyebrow, typography.labelSm]} numberOfLines={1}>
              {eyebrow}
            </Text>
          ) : null}
          <Text
            style={[styles.title, typography.headlineMd]}
            numberOfLines={1}
            accessibilityRole="header"
          >
            {title}
          </Text>
          {subtitle && (
            <Text style={[styles.subtitle, typography.bodySm]} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>

      {rightElement && <View style={styles.rightWrapper}>{rightElement}</View>}
    </View>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.margin,
      paddingVertical: spacing.sm,
      backgroundColor: 'transparent',
      minHeight: 56,
    },
    elevated: {
      backgroundColor: colors.canvas,
      shadowColor: colors.cardShadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 2,
      zIndex: 2,
    },
    logo: {
      width: 34,
      height: 34,
      borderRadius: radius.md,
      marginRight: spacing.sm,
    },
    eyebrow: {
      color: colors.outline,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    leftRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    backButton: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.xs,
      marginLeft: -spacing.sm,
    },
    backButtonPressed: {
      backgroundColor: colors.surfaceContainer,
      transform: [{ scale: 0.95 }],
    },
    titleContainer: {
      flex: 1,
    },
    title: {
      color: colors.textPrimary,
    },
    subtitle: {
      color: colors.textSecondary,
      marginTop: 2,
    },
    rightWrapper: {
      marginLeft: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
    },
  });
