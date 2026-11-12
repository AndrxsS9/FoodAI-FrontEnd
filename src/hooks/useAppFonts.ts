import { useEffect, useState } from 'react';
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';

export interface UseAppFontsOptions {
  timeoutMs?: number;
}

export interface UseAppFontsResult {
  fontsLoaded: boolean;
  fontError: Error | null;
  isReady: boolean;
  usingFallback: boolean;
  timedOut: boolean;
}

export const DEFAULT_FONT_TIMEOUT_MS = 3000;

export function useAppFonts(options: UseAppFontsOptions = {}): UseAppFontsResult {
  const { timeoutMs = DEFAULT_FONT_TIMEOUT_MS } = options;
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      return;
    }

    const timer = setTimeout(() => {
      setTimedOut(true);
    }, timeoutMs);

    return () => {
      clearTimeout(timer);
    };
  }, [fontsLoaded, fontError, timeoutMs]);

  const isReady = Boolean(fontsLoaded) || Boolean(fontError) || timedOut;
  const usingFallback = !fontsLoaded && (Boolean(fontError) || timedOut);

  return {
    fontsLoaded: Boolean(fontsLoaded),
    fontError: fontError ?? null,
    isReady,
    usingFallback,
    timedOut,
  };
}

