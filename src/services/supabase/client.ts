/**
 * FoodAI - Cliente oficial de Supabase para Expo SDK 58 (Fase 5).
 * Configura la persistencia de sesión con AsyncStorage, compatibilidad multiplataforma
 * (Android, iOS y Web), y ciclo de vida AppState para refresco automático de tokens.
 */
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppState, AppStateStatus, Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

/**
 * Mensaje de error descriptivo cuando Supabase no está configurado.
 */
export const SUPABASE_NOT_CONFIGURED_ERROR =
  'Supabase no está configurado. Por favor, define EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY en tu archivo .env local.';

/**
 * Determina si las variables de entorno de Supabase están correctamente pobladas.
 */
export function isSupabaseConfigured(): boolean {
  if (!supabaseUrl || !supabasePublishableKey) return false;
  if (
    supabaseUrl.includes('tu-proyecto') ||
    supabaseUrl.includes('placeholder') ||
    supabasePublishableKey.includes('tu-supabase') ||
    supabasePublishableKey.includes('placeholder')
  ) {
    return false;
  }
  return true;
}

// Fallback seguro para evitar fallos de evaluación de módulos si no hay .env local configurado
const effectiveUrl = isSupabaseConfigured() ? supabaseUrl : 'https://placeholder.supabase.co';
const effectiveKey = isSupabaseConfigured() ? supabasePublishableKey : 'placeholder-publishable-key';

export const supabase: SupabaseClient = createClient(effectiveUrl, effectiveKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

// Control del ciclo de vida AppState para pausar/reanudar el refresco automático de tokens en primer plano
// Solo se suscribe en entornos nativos (evita colisiones en Web o en pruebas de Jest)
if (Platform.OS !== 'web' && typeof jest === 'undefined') {
  AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
