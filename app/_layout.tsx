import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAppFonts } from '../src/hooks/useAppFonts';
import { TypographyProvider, colors } from '../src/theme';
import { PantryProvider } from '../src/context/PantryContext';
import { BudgetProvider } from '../src/context/BudgetContext';
import { RecipeProvider } from '../src/context/RecipeContext';

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
        <PantryProvider>
          <BudgetProvider>
            <RecipeProvider>
              <StatusBar style="dark" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.canvas },
                }}
              >
                <Stack.Screen name="index" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="design-system" />
                <Stack.Screen name="recetas" />
                <Stack.Screen name="escaner" />
              </Stack>
            </RecipeProvider>
          </BudgetProvider>
        </PantryProvider>
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
