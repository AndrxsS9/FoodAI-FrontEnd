import React from 'react';
import {
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
  style?: ViewStyle;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  showBack = false,
  onBack,
  rightElement,
  style,
}) => {
  const typography = useTypography();
  const { colors } = useAppTheme();
  const styles = useThemeStyles(createStyles);

  return (
    <View style={[styles.container, style]}>
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

        <View style={styles.titleContainer}>
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
    leftRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    backButton: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      backgroundColor: colors.surfaceContainer,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.sm,
    },
    backButtonPressed: {
      backgroundColor: colors.surfaceContainerHigh,
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
