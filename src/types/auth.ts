/**
 * FoodAI - Tipos e interfaces de autenticación Supabase (Fase 5).
 * Define los contratos para la sesión persistente, el usuario activo,
 * validaciones de credenciales y estados del flujo de autenticación.
 */
import type { Session, User } from '@supabase/supabase-js';

export type AuthUser = User;
export type AuthSession = Session;

export interface SignUpResult {
  user: AuthUser | null;
  session: AuthSession | null;
  confirmationPending: boolean;
}

export interface SignInResult {
  user: AuthUser | null;
  session: AuthSession | null;
}

export interface AuthContextValue {
  user: AuthUser | null;
  session: AuthSession | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  isSubmitting: boolean;
  authError: string | null;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  clearAuthError: () => void;
  updateProfile?: (attributes: { displayName: string }) => Promise<AuthUser>;
}

/**
 * Validador estricto de formato de correo electrónico.
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  // Expresión regular estándar RFC 5322 simplificada
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed);
}

/**
 * Longitud mínima recomendada para contraseñas de Supabase Auth.
 */
export const MIN_PASSWORD_LENGTH = 6;

/**
 * Validador de política de contraseña mínima.
 */
export function isValidPassword(password: string): boolean {
  if (!password || typeof password !== 'string') return false;
  return password.length >= MIN_PASSWORD_LENGTH;
}

/**
 * Mapeador de errores técnicos de Supabase a mensajes amigables en español.
 */
export function mapSupabaseAuthError(error: unknown): string {
  if (!error) return 'Ocurrió un error inesperado de autenticación.';

  let message = '';
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  } else if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as any).message === 'string'
  ) {
    message = (error as any).message;
  } else {
    message = String(error);
  }

  const normalized = message.toLowerCase();

  if (normalized.includes('invalid login credentials') || normalized.includes('invalid_grant')) {
    return 'Correo electrónico o contraseña incorrectos.';
  }
  if (normalized.includes('email not confirmed')) {
    return 'Tu correo no ha sido confirmado. Por favor, revisa tu bandeja de entrada.';
  }
  if (normalized.includes('user already registered') || normalized.includes('already exists')) {
    return 'Ya existe una cuenta registrada con este correo electrónico.';
  }
  if (normalized.includes('password should be at least')) {
    return `La contraseña debe contener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (normalized.includes('rate limit') || normalized.includes('too many requests')) {
    return 'Demasiados intentos. Por favor, espera unos momentos antes de volver a intentar.';
  }
  if (normalized.includes('network') || normalized.includes('fetch failed') || normalized.includes('failed to fetch')) {
    return 'Error de conexión. Verifica tu acceso a internet e inténtalo de nuevo.';
  }

  return message;
}

/**
 * Obtiene el nombre para mostrar del usuario a partir de sus metadatos o correo.
 */
export function getUserDisplayName(
  user: AuthUser | null | undefined,
  fallback: string = 'Usuario'
): string {
  if (!user) return fallback;

  const metadata = user.user_metadata;
  if (metadata) {
    if (typeof metadata.display_name === 'string' && metadata.display_name.trim().length > 0) {
      return metadata.display_name.trim();
    }
    if (typeof metadata.name === 'string' && metadata.name.trim().length > 0) {
      return metadata.name.trim();
    }
    if (typeof metadata.full_name === 'string' && metadata.full_name.trim().length > 0) {
      return metadata.full_name.trim();
    }
  }

  if (user.email && typeof user.email === 'string') {
    const prefix = user.email.split('@')[0];
    if (prefix) {
      return prefix.charAt(0).toUpperCase() + prefix.slice(1);
    }
  }

  return fallback;
}

/**
 * Genera iniciales dinámicas legibles para el avatar (1 o 2 letras mayúsculas).
 */
export function getAvatarInitials(nameOrEmail?: string | null): string {
  if (!nameOrEmail || typeof nameOrEmail !== 'string') return 'U';

  const clean = nameOrEmail.trim();
  if (!clean) return 'U';

  // Si contiene @ y no espacios, usar la parte antes del @
  const target = clean.includes('@') && !clean.includes(' ') ? clean.split('@')[0] : clean;
  const words = target.split(/\s+/).filter(Boolean);

  if (words.length >= 2) {
    const firstLetter = words[0].charAt(0).toUpperCase();
    const secondLetter = words[1].charAt(0).toUpperCase();
    return `${firstLetter}${secondLetter}`;
  }

  if (words.length === 1) {
    const single = words[0];
    if (single.length >= 2) {
      return single.slice(0, 2).toUpperCase();
    }
    return single.charAt(0).toUpperCase();
  }

  return 'U';
}
