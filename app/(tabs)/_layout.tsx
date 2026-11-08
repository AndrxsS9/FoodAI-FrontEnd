import React, { ComponentProps } from 'react';
import { StyleSheet, Platform, Text, useWindowDimensions, View } from 'react-native';
import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, useTypography, useAppTheme } from '../../src/theme';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Geometría de la barra flotante (dp). */
const BAR_BASE_HEIGHT = 68;
const BAR_SIDE_MARGIN = 12;
const BAR_TOP_GAP = 6;
const BAR_INNER_PADDING = 6;
const BAR_MIN_BOTTOM_GAP = 10;
/** Límite de escalado de la etiqueta: por encima no cabría «Despensa» en cuatro pestañas a 320 dp. */
const MAX_LABEL_FONT_SCALE = 1.4;

interface TabIconProps {
  focused: boolean;
  color: string;
  pillColor: string;
  activeIcon: IconName;
  inactiveIcon: IconName;
}

/** Ícono de pestaña; su fondo coincide con la píldora que cubre ícono y etiqueta en la pestaña activa. */
function TabIcon({ focused, color, pillColor, activeIcon, inactiveIcon }: TabIconProps) {
  return (
    <View
      style={[
        styles.iconPill,
        focused && { backgroundColor: pillColor },
      ]}
    >
      <MaterialCommunityIcons
        name={focused ? activeIcon : inactiveIcon}
        size={24}
        color={color}
      />
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const typography = useTypography();
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const { colors: activeColors, activeColorScheme } = useAppTheme();
  const isDark = activeColorScheme === 'dark';

  const pillColor = isDark ? '#46337A' : activeColors.primaryFixed;
  const activeTint = isDark ? '#D9C7FF' : activeColors.primary;
  const bottomGap = Math.max(insets.bottom, BAR_MIN_BOTTOM_GAP);
  const sideGap = BAR_SIDE_MARGIN + Math.max(insets.left, insets.right);
  const labelScale = Math.min(Math.max(fontScale, 1), MAX_LABEL_FONT_SCALE);
  const barHeight = BAR_BASE_HEIGHT + Math.round((labelScale - 1) * 30);
  // Con cuatro pestañas a 320 dp cada una dispone de unos 70 dp
  const labelFontSize = windowWidth < 340 ? 11 : 12;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // En Android, si la ventana se redimensiona con el teclado, la barra subiría sobre él
        // y taparía las acciones de los formularios; se oculta mientras el teclado está abierto.
        tabBarHideOnKeyboard: Platform.OS === 'android',
        tabBarActiveTintColor: activeTint,
        tabBarInactiveTintColor: activeColors.textSecondary,
        tabBarActiveBackgroundColor: pillColor,
        // La barra sigue en el flujo y reserva su espacio: ninguna pantalla queda debajo de ella. La
        // apariencia flotante la da tabBarBackground; con márgenes reales quedaría una franja visible al
        // ocultarse con el teclado, porque la navegación solo la desplaza su altura más el inset inferior.
        tabBarStyle: {
          backgroundColor: activeColors.canvas,
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
          height: BAR_TOP_GAP + barHeight + bottomGap,
          paddingTop: BAR_TOP_GAP + BAR_INNER_PADDING,
          paddingBottom: bottomGap + BAR_INNER_PADDING,
          paddingHorizontal: sideGap + BAR_INNER_PADDING,
        },
        tabBarBackground: () => (
          <View
            testID="tab-bar-surface"
            style={[
              styles.barSurface,
              {
                top: BAR_TOP_GAP,
                bottom: bottomGap,
                left: sideGap,
                right: sideGap,
                backgroundColor: isDark ? '#231B38' : activeColors.surface,
                borderColor: isDark ? '#46386F' : activeColors.primaryFixed,
                // boxShadow en vez de elevation: en Android la elevación pintaría la superficie sobre las pestañas
                boxShadow: isDark
                  ? '0px 8px 22px rgba(0, 0, 0, 0.5)'
                  : '0px 6px 18px rgba(91, 75, 138, 0.18)',
              },
              isDark && styles.barSurfaceGradient,
            ]}
          />
        ),
        tabBarLabel: ({ focused, color, children }) => (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            maxFontSizeMultiplier={MAX_LABEL_FONT_SCALE}
            style={[
              typography.labelSm,
              styles.label,
              { color, fontSize: labelFontSize },
              focused ? styles.labelActive : styles.labelInactive,
            ]}
          >
            {children}
          </Text>
        ),
        tabBarItemStyle: styles.barItem,
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
              pillColor={pillColor}
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
              pillColor={pillColor}
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
              pillColor={pillColor}
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
              pillColor={pillColor}
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
  barSurface: {
    position: 'absolute',
    borderRadius: 28,
    borderWidth: 1,
  },
  barSurfaceGradient: {
    backgroundImage: 'linear-gradient(160deg, #2E2350 0%, #1E1830 100%)',
  },
  barItem: {
    borderRadius: 22,
    marginHorizontal: 2,
    overflow: 'hidden',
  },
  iconPill: {
    width: 48,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  labelActive: {
    fontWeight: '700',
  },
  labelInactive: {
    fontWeight: '500',
  },
});
