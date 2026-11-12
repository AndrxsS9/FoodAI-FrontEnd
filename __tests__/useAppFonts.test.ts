import { renderHook, act } from '@testing-library/react-native';
import { useAppFonts } from '../src/hooks/useAppFonts';

// Mock @expo-google-fonts/plus-jakarta-sans
jest.mock('@expo-google-fonts/plus-jakarta-sans', () => ({
  useFonts: jest.fn(),
  PlusJakartaSans_400Regular: 'PlusJakartaSans_400Regular',
  PlusJakartaSans_500Medium: 'PlusJakartaSans_500Medium',
  PlusJakartaSans_600SemiBold: 'PlusJakartaSans_600SemiBold',
  PlusJakartaSans_700Bold: 'PlusJakartaSans_700Bold',
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useFonts } = require('@expo-google-fonts/plus-jakarta-sans');

describe('useAppFonts hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns isReady true and usingFallback false when fonts load successfully', async () => {
    useFonts.mockReturnValue([true, null]);

    const { result } = await renderHook(() => useAppFonts());

    expect(result.current.fontsLoaded).toBe(true);
    expect(result.current.fontError).toBeNull();
    expect(result.current.isReady).toBe(true);
    expect(result.current.usingFallback).toBe(false);
    expect(result.current.timedOut).toBe(false);
  });

  it('handles font loading failure gracefully with system fallback', async () => {
    const mockError = new Error('Network error loading fonts');
    useFonts.mockReturnValue([false, mockError]);

    const { result } = await renderHook(() => useAppFonts());

    expect(result.current.fontsLoaded).toBe(false);
    expect(result.current.fontError).toBe(mockError);
    expect(result.current.isReady).toBe(true);
    expect(result.current.usingFallback).toBe(true);
    expect(result.current.timedOut).toBe(false);
  });

  it('triggers safe fallback when font loading times out to prevent indefinite loading screens', async () => {
    // Fonts are not yet loaded and no error has occurred
    useFonts.mockReturnValue([false, null]);

    const { result } = await renderHook(() => useAppFonts({ timeoutMs: 1500 }));

    // Initially waiting for fonts
    expect(result.current.fontsLoaded).toBe(false);
    expect(result.current.fontError).toBeNull();
    expect(result.current.isReady).toBe(false);
    expect(result.current.usingFallback).toBe(false);
    expect(result.current.timedOut).toBe(false);

    // Fast-forward past timeout
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1500);
    });

    // Now unblocked with fallback enabled
    expect(result.current.isReady).toBe(true);
    expect(result.current.usingFallback).toBe(true);
    expect(result.current.timedOut).toBe(true);
  });
});
