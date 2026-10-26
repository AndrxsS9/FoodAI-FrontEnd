import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAppFonts } from '../src/hooks/useAppFonts';
import { TypographyProvider, colors } from '../src/theme';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { PantryProvider } from '../src/context/PantryContext';
import { BudgetProvider } from '../src/context/BudgetContext';
import { RecipeProvider } from '../src/context/RecipeContext';
import { MealPlanProvider } from '../src/context/MealPlanContext';

/**
 * Barrera de proveedores vinculada a la sesión del usuario (FIX 2).
 * Al cambiar el identificador del usuario (user?.id), React desmonta completamente
 * los árboles anteriores y monta nuevos proveedores limpios, garantizando un aislamiento
 * estricto e instantáneo sin contaminación ni flashes visuales entre cuentas.
 */
function AuthenticatedProviders({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const sessionKey = user?.id ?? 'anonymous';

  return (
    <PantryProvider key={`pantry-${sessionKey}`}>
      <BudgetProvider key={`budget-${sessionKey}`}>
        <RecipeProvider key={`recipe-${sessionKey}`}>
          <MealPlanProvider key={`mealplan-${sessionKey}`}>
            {children}
          </MealPlanProvider>
        </RecipeProvider>
      </BudgetProvider>
    </PantryProvider>
  );
}

/**
 * Navegador raíz con protección declarativa previa al renderizado mediante Stack.Protected (FIX 1).
 * Evita el flash de rutas privadas protegiendo directamente:
 * - (tabs)
 * - recetas
 * - escaner
 * Y manteniendo como públicas:
 * - index (bienvenida / onboarding)
 * - (auth) (login y registro)
 * - design-system
 */
function RootNavigation() {
  const { isAuthenticated, isInitializing } = useAuth();

  if (isInitializing) {
    return (
      <View
        style={styles.loadingContainer}
        testID="auth-loading-screen"
        accessibilityRole="progressbar"
        accessibilityLabel="Restaurando sesión..."
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.canvas },
        }}
      >
        {/* Rutas públicas siempre accesibles */}
        <Stack.Screen name="index" />
        <Stack.Screen name="design-system" />

        {/* Grupo de autenticación: Accesible solo si NO está autenticado */}
        <Stack.Protected guard={!isAuthenticated} redirectTo="/(tabs)">
          <Stack.Screen name="(auth)" />
        </Stack.Protected>

        {/* Rutas privadas existentes protegidas antes de su renderizado */}
        <Stack.Protected guard={isAuthenticated} redirectTo="/(auth)/login">
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="recetas" />
          <Stack.Screen name="escaner" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const { isReady, fontError, usingFallback } = useAppFonts();

  useEffect(() => {
    if (fontError) {
      console.warn(
        '[FoodAI] Error al cargar Plus Jakarta Sans, usando tipografía de respaldo del sistema:',
        fontError.message
      );
    } else if (usingFallback) {
      console.warn(
        '[FoodAI] Tiempo de espera de fuentes agotado, usando tipografía de respaldo del sistema.'
      );
    }
  }, [fontError, usingFallback]);

  if (!isReady) {
    return (
      <View
        style={styles.loadingContainer}
        testID="app-loading-screen"
        accessibilityRole="progressbar"
        accessibilityLabel="Cargando aplicación..."
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <TypographyProvider usingFallback={usingFallback}>
        <AuthProvider>
          <AuthenticatedProviders>
            <RootNavigation />
          </AuthenticatedProviders>
        </AuthProvider>
      </TypographyProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvas,
  },
});

