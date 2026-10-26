/**
 * FoodAI — Real Expo Router SDK 58 Stack.Protected Integration Tests
 *
 * Utiliza las utilidades oficiales de expo-router/testing-library:
 * - renderRouter
 * - testRouter
 * - screen
 *
 * Verificaciones:
 * 1. Acceso no autenticado a (tabs) redirige inmediatamente a /login antes de renderizar.
 * 2. Acceso no autenticado a /recetas redirige inmediatamente a /login.
 * 3. Acceso no autenticado a /escaner redirige inmediatamente a /login.
 * 4. Acceso autenticado a /login redirige automáticamente a /(tabs).
 * 5. Acceso a rutas públicas (index) permitido para todos.
 * 6. Navegación interna autenticada entre /(tabs) y /recetas/detalle preservando historial.
 */

import React from 'react';
import { Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { renderRouter, testRouter, screen } from 'expo-router/testing-library';

describe('Expo Router Stack.Protected Integration Tests', () => {
  it('redirects unauthenticated users trying to access /(tabs) directly to /login', async () => {
    const isAuthenticated = false;

    await renderRouter(
      {
        '_layout': () => (
          <Stack>
            <Stack.Screen name="index" />
            <Stack.Protected guard={!isAuthenticated} redirectTo="/(tabs)">
              <Stack.Screen name="login" />
            </Stack.Protected>
            <Stack.Protected guard={isAuthenticated} redirectTo="/login">
              <Stack.Screen name="(tabs)/index" />
            </Stack.Protected>
          </Stack>
        ),
        'index': () => (
          <View testID="public-index">
            <Text>Public Index</Text>
          </View>
        ),
        'login': () => (
          <View testID="auth-login">
            <Text>Login Screen</Text>
          </View>
        ),
        '(tabs)/index': () => (
          <View testID="private-tabs-home">
            <Text>Private Tabs Home</Text>
          </View>
        ),
      },
      { initialUrl: '/(tabs)' }
    );

    // Navegación directa a /(tabs) con isAuthenticated=false redirige a /login
    expect(screen.getByTestId('auth-login')).toBeTruthy();
    expect(screen.queryByTestId('private-tabs-home')).toBeNull();
  });

  it('redirects unauthenticated users trying to access /recetas directly to /login', async () => {
    const isAuthenticated = false;

    await renderRouter(
      {
        '_layout': () => (
          <Stack>
            <Stack.Protected guard={!isAuthenticated} redirectTo="/(tabs)">
              <Stack.Screen name="login" />
            </Stack.Protected>
            <Stack.Protected guard={isAuthenticated} redirectTo="/login">
              <Stack.Screen name="recetas/index" />
            </Stack.Protected>
          </Stack>
        ),
        'login': () => (
          <View testID="auth-login">
            <Text>Login Screen</Text>
          </View>
        ),
        'recetas/index': () => (
          <View testID="private-recetas">
            <Text>Private Recetas</Text>
          </View>
        ),
      },
      { initialUrl: '/recetas' }
    );

    expect(screen.getByTestId('auth-login')).toBeTruthy();
    expect(screen.queryByTestId('private-recetas')).toBeNull();
  });

  it('redirects unauthenticated users trying to access /escaner directly to /login', async () => {
    const isAuthenticated = false;

    await renderRouter(
      {
        '_layout': () => (
          <Stack>
            <Stack.Protected guard={!isAuthenticated} redirectTo="/(tabs)">
              <Stack.Screen name="login" />
            </Stack.Protected>
            <Stack.Protected guard={isAuthenticated} redirectTo="/login">
              <Stack.Screen name="escaner/index" />
            </Stack.Protected>
          </Stack>
        ),
        'login': () => (
          <View testID="auth-login">
            <Text>Login Screen</Text>
          </View>
        ),
        'escaner/index': () => (
          <View testID="private-escaner">
            <Text>Private Escaner</Text>
          </View>
        ),
      },
      { initialUrl: '/escaner' }
    );

    expect(screen.getByTestId('auth-login')).toBeTruthy();
    expect(screen.queryByTestId('private-escaner')).toBeNull();
  });

  it('redirects authenticated users away from /login to /(tabs)', async () => {
    const isAuthenticated = true;

    await renderRouter(
      {
        '_layout': () => (
          <Stack>
            <Stack.Protected guard={!isAuthenticated} redirectTo="/(tabs)">
              <Stack.Screen name="login" />
            </Stack.Protected>
            <Stack.Protected guard={isAuthenticated} redirectTo="/login">
              <Stack.Screen name="(tabs)/index" />
            </Stack.Protected>
          </Stack>
        ),
        'login': () => (
          <View testID="auth-login">
            <Text>Login Screen</Text>
          </View>
        ),
        '(tabs)/index': () => (
          <View testID="private-tabs-home">
            <Text>Private Tabs Home</Text>
          </View>
        ),
      },
      { initialUrl: '/login' }
    );

    // Usuario autenticado en /login es redirigido a /(tabs)
    expect(screen.getByTestId('private-tabs-home')).toBeTruthy();
    expect(screen.queryByTestId('auth-login')).toBeNull();
  });

  it('allows authenticated users to navigate between protected screens and go back', async () => {
    const isAuthenticated = true;

    await renderRouter(
      {
        '_layout': () => (
          <Stack>
            <Stack.Protected guard={isAuthenticated} redirectTo="/login">
              <Stack.Screen name="(tabs)/index" />
              <Stack.Screen name="recetas/detalle" />
            </Stack.Protected>
          </Stack>
        ),
        '(tabs)/index': () => (
          <View testID="private-tabs-home">
            <Text>Private Tabs Home</Text>
          </View>
        ),
        'recetas/detalle': () => (
          <View testID="private-recetas-detalle">
            <Text>Detalle Receta</Text>
          </View>
        ),
      },
      { initialUrl: '/(tabs)' }
    );

    expect(screen.getByTestId('private-tabs-home')).toBeTruthy();

    // Navegar a la pantalla de detalle de receta
    await testRouter.push('/recetas/detalle');
    expect(screen.getByTestId('private-recetas-detalle')).toBeTruthy();

    // Regresar con historial back
    await testRouter.back();
    expect(screen.getByTestId('private-tabs-home')).toBeTruthy();
  });

  it('renders public root route without restriction', async () => {
    const isAuthenticated = false;

    await renderRouter(
      {
        '_layout': () => (
          <Stack>
            <Stack.Screen name="index" />
            <Stack.Protected guard={isAuthenticated} redirectTo="/login">
              <Stack.Screen name="(tabs)/index" />
            </Stack.Protected>
          </Stack>
        ),
        'index': () => (
          <View testID="public-welcome">
            <Text>Welcome Public Screen</Text>
          </View>
        ),
        '(tabs)/index': () => (
          <View testID="private-tabs-home">
            <Text>Private Tabs</Text>
          </View>
        ),
      },
      { initialUrl: '/' }
    );

    expect(screen.getByTestId('public-welcome')).toBeTruthy();
  });
});
