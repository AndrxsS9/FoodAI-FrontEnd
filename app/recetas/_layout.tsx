import React from 'react';
import { Stack } from 'expo-router';
import { useAppTheme } from '../../src/theme';

export default function RecetasLayout() {
  const { colors } = useAppTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="[id]" />
      <Stack.Screen name="[id]/cocinar" />
    </Stack>
  );
}
