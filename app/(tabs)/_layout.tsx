import React from 'react';
import { StyleSheet, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTypography, useAppTheme } from '../../src/theme';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const typography = useTypography();
  const { colors: activeColors } = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: activeColors.primary,
        tabBarInactiveTintColor: activeColors.outline,
        tabBarStyle: {
          backgroundColor: activeColors.surface,
          borderTopColor: activeColors.borderLight,
          borderTopWidth: 1,
          height: 60 + (Platform.OS === 'ios' ? insets.bottom : Math.max(insets.bottom, 6)),
          paddingBottom: Platform.OS === 'ios' ? insets.bottom : Math.max(insets.bottom, 6),
          paddingTop: 6,
          elevation: 8,
          shadowColor: activeColors.cardShadow,
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 10,
        },
        tabBarLabelStyle: {
          ...typography.labelSm,
          fontSize: 11,
          marginTop: 2,
        },
        tabBarItemStyle: {
          paddingVertical: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarAccessibilityLabel: 'Pestaña Inicio',
          tabBarIcon: ({ color, focused }) => (
            <MaterialIcons
              name="home"
              size={24}
              color={String(color)}
              style={focused ? styles.activeIcon : undefined}
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
            <MaterialIcons
              name="kitchen"
              size={24}
              color={String(color)}
              style={focused ? styles.activeIcon : undefined}
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
            <MaterialIcons
              name="calendar-today"
              size={24}
              color={String(color)}
              style={focused ? styles.activeIcon : undefined}
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
            <MaterialIcons
              name="account-circle"
              size={24}
              color={String(color)}
              style={focused ? styles.activeIcon : undefined}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  activeIcon: {
    transform: [{ scale: 1.05 }],
  },
});
