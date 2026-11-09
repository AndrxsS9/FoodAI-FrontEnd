import React, { ComponentProps } from 'react';
import { StyleSheet, Platform, Text, useWindowDimensions, View } from 'react-native';
import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { gradientStyle, radius, shadowStyle, useTypography, useAppTheme } from '../../src/theme';
import { useLocale } from '../../src/context/LocaleContext';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Geometría de la barra flotante (dp). */
const BAR_BASE_HEIGHT = 72;
const BAR_SIDE_MARGIN = 10;
const BAR_TOP_GAP = 6;
const BAR_INNER_PADDING = 4;
const BAR_SIDE_MARGIN_NARROW = 6;
const BAR_INNER_PADDING_NARROW = 2;
const BAR_MIN_BOTTOM_GAP = 10;
/** Límite de escalado de la etiqueta: por encima no cabría «Despensa» en cinco pestañas a 320 dp. */
const MAX_LABEL_FONT_SCALE = 1.3;

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

/** Pestaña central: un círculo de acción la destaca sin cambiar su área táctil ni sus etiquetas. */
function RecipesTabIcon({ focused }: { focused: boolean }) {
  const { colors } = useAppTheme();
  return (
    <View
      testID="tab-recetas-emphasis"
      style={[
        styles.centralIcon,
        { backgroundColor: colors.cta },
        gradientStyle(colors.gradientCta),
        focused && { borderColor: colors.tabActive },
      ]}
    >
      <MaterialCommunityIcons
        name={focused ? 'chef-hat' : 'silverware-fork-knife'}
        size={22}
        color={colors.onPrimary}
      />
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const typography = useTypography();
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const { colors: activeColors } = useAppTheme();
  const { t } = useLocale();

  const pillColor = activeColors.tabPill;
  const bottomGap = Math.max(insets.bottom, BAR_MIN_BOTTOM_GAP);
  const isNarrow = windowWidth < 340;
  const sideGap = (isNarrow ? BAR_SIDE_MARGIN_NARROW : BAR_SIDE_MARGIN) + Math.max(insets.left, insets.right);
  const innerPadding = isNarrow ? BAR_INNER_PADDING_NARROW : BAR_INNER_PADDING;
  const labelScale = Math.min(Math.max(fontScale, 1), MAX_LABEL_FONT_SCALE);
  const barHeight = BAR_BASE_HEIGHT + Math.round((labelScale - 1) * 30);
  // Con cinco pestañas a 320 dp cada una dispone de unos 60 dp
  const labelFontSize = isNarrow ? 9.5 : 11;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // En Android, si la ventana se redimensiona con el teclado, la barra subiría sobre él
        // y taparía las acciones de los formularios; se oculta mientras el teclado está abierto.
        tabBarHideOnKeyboard: Platform.OS === 'android',
        tabBarActiveTintColor: activeColors.tabActive,
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
          paddingHorizontal: sideGap + innerPadding,
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
                backgroundColor: activeColors.surface,
                borderColor: activeColors.cardBorder,
              },
              gradientStyle(activeColors.gradientCard),
              shadowStyle(activeColors.shadowFloat),
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
        tabBarIconStyle: styles.barIconArea,
        tabBarItemStyle: styles.barItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarAccessibilityLabel: t('tabs.homeLabel'),
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
          title: t('tabs.pantry'),
          tabBarAccessibilityLabel: t('tabs.pantryLabel'),
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
        name="recetas"
        options={{
          title: t('tabs.recipes'),
          tabBarAccessibilityLabel: t('tabs.recipesLabel'),
          tabBarIcon: ({ focused }) => <RecipesTabIcon focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: t('tabs.plan'),
          tabBarAccessibilityLabel: t('tabs.planLabel'),
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
          title: t('tabs.profile'),
          tabBarAccessibilityLabel: t('tabs.profileLabel'),
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
  barItem: {
    borderRadius: 20,
    marginHorizontal: 1,
    overflow: 'hidden',
  },
  barIconArea: {
    height: 34,
    width: 44,
  },
  iconPill: {
    width: 44,
    height: 30,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centralIcon: {
    width: 38,
    height: 34,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    letterSpacing: 0,
    textAlign: 'center',
    // El botón de pestaña reserva 5 dp por lado que aquí hacen falta para «Despensa»
    marginHorizontal: -5,
  },
  labelActive: {
    fontWeight: '700',
  },
  labelInactive: {
    fontWeight: '500',
  },
});
