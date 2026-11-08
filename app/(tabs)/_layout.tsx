import React, { ComponentProps } from 'react';
import { StyleSheet, Platform, View } from 'react-native';
import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, useTypography, useAppTheme } from '../../src/theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

interface TabIconProps {
  focused: boolean;
  color: string;
  activeIcon: IconName;
  inactiveIcon: IconName;
}

/** Ícono de pestaña con indicador en forma de píldora para el estado activo. */
function TabIcon({ focused, color, activeIcon, inactiveIcon }: TabIconProps) {
  const { colors } = useAppTheme();
  return (
    <View
      style={[
        styles.iconPill,
        focused && { backgroundColor: colors.primaryFixed },
      ]}
    >
      <MaterialCommunityIcons
        name={focused ? activeIcon : inactiveIcon}
        size={22}
        color={color}
      />
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const typography = useTypography();
  const { colors: activeColors } = useAppTheme();
  const bottomInset = Platform.OS === 'ios' ? insets.bottom : Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // En Android, si la ventana se redimensiona con el teclado, la barra subiría sobre él
        // y taparía las acciones de los formularios; se oculta mientras el teclado está abierto.
        tabBarHideOnKeyboard: Platform.OS === 'android',
        tabBarActiveTintColor: activeColors.primary,
        tabBarInactiveTintColor: activeColors.outline,
        tabBarStyle: {
          backgroundColor: activeColors.surface,
          borderTopColor: activeColors.borderLight,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 66 + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 8,
          elevation: 8,
          shadowColor: activeColors.cardShadow,
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 10,
        },
        tabBarLabelStyle: {
          ...typography.labelSm,
          fontSize: 11,
          letterSpacing: 0.2,
          marginTop: 4,
        },
        tabBarItemStyle: {
          paddingVertical: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarAccessibilityLabel: 'Pestaña Inicio',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              focused={focused}
              color={String(color)}
              activeIcon="home-variant"
              inactiveIcon="home-variant-outline"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="despensa"
        options={{
          title: 'Despensa',
          tabBarAccessibilityLabel: 'Pestaña Despensa',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              focused={focused}
              color={String(color)}
              activeIcon="fridge"
              inactiveIcon="fridge-outline"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: 'Plan',
          tabBarAccessibilityLabel: 'Pestaña Plan',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              focused={focused}
              color={String(color)}
              activeIcon="calendar-month"
              inactiveIcon="calendar-month-outline"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarAccessibilityLabel: 'Pestaña Perfil',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              focused={focused}
              color={String(color)}
              activeIcon="account-circle"
              inactiveIcon="account-circle-outline"
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconPill: {
    width: 56,
    height: 30,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
