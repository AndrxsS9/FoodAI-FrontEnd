import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAppFonts } from '../src/hooks/useAppFonts';
import { TypographyProvider, colors } from '../src/theme';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { PantryProvider } from '../src/context/PantryContext';
import { BudgetProvider } from '../src/context/BudgetContext';
import { RecipeProvider } from '../src/context/RecipeContext';
import { MealPlanProvider } from '../src/context/MealPlanContext';

function RouteGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isInitializing } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isInitializing) return;

    const firstSegment = segments[0] as string | undefined;
    const inAuthGroup = firstSegment === '(auth)';
    const isWelcomeScreen = firstSegment === undefined || firstSegment === 'index';
    const isDesignSystem = firstSegment === 'design-system';

    const isPublicRoute = inAuthGroup || isWelcomeScreen || isDesignSystem;

    if (!isAuthenticated && !isPublicRoute) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isInitializing, segments, router]);

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

  return <>{children}</>;
}

export default function RootLayout() {
  const { isReady, fontError, usingFallback } = useAppFonts();

  useEffect(() => {
    if (fontError) {
      console.warn('[FoodAI] Error al cargar Plus Jakarta Sans, usando tipografía de respaldo del sistema:', fontError.message);
    } else if (usingFallback) {
      console.warn('[FoodAI] Tiempo de espera de fuentes agotado, usando tipografía de respaldo del sistema.');
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
          <PantryProvider>
            <BudgetProvider>
              <RecipeProvider>
                <MealPlanProvider>
                  <StatusBar style="dark" />
                  <RouteGuard>
                    <Stack
                      screenOptions={{
                        headerShown: false,
                        contentStyle: { backgroundColor: colors.canvas },
                      }}
                    >
                      <Stack.Screen name="index" />
                      <Stack.Screen name="(auth)" />
                      <Stack.Screen name="(tabs)" />
                      <Stack.Screen name="design-system" />
                      <Stack.Screen name="recetas" />
                      <Stack.Screen name="escaner" />
                    </Stack>
                  </RouteGuard>
                </MealPlanProvider>
              </RecipeProvider>
            </BudgetProvider>
          </PantryProvider>
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

