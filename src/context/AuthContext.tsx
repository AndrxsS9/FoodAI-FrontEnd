/**
 * FoodAI - Contexto global y proveedor de autenticación Supabase (Fase 5).
 * Gestiona la restauración transparente de sesión, suscripción a eventos de ciclo de vida
 * (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED), prevención de concurrencia y aislamiento seguro.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AuthContextValue,
  AuthSession,
  AuthUser,
  SignInResult,
  SignUpResult,
  isValidEmail,
  isValidPassword,
  mapSupabaseAuthError,
  MIN_PASSWORD_LENGTH,
} from '../types/auth';
import { isSupabaseConfigured, supabase as defaultSupabase } from '../services/supabase/client';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export interface AuthProviderProps {
  children: React.ReactNode;
  supabaseClient?: SupabaseClient;
  initialSession?: AuthSession | null;
}

export function AuthProvider({
  children,
  supabaseClient = defaultSupabase,
  initialSession,
}: AuthProviderProps) {
  const [session, setSession] = useState<AuthSession | null>(initialSession ?? null);
  const [user, setUser] = useState<AuthUser | null>(initialSession?.user ?? null);
  const [isInitializing, setIsInitializing] = useState<boolean>(initialSession === undefined);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const isSubmittingRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  const authOpSeqRef = useRef<number>(0);

  // Inicialización de sesión y suscripción al listener de Supabase Auth
  useEffect(() => {
    isMountedRef.current = true;

    let authSubscription: { unsubscribe: () => void } | null = null;
    try {
      const { data: authListener } = supabaseClient.auth.onAuthStateChange(
        (_event, currentSession) => {
          if (!isMountedRef.current) return;
          const eventSeq = ++authOpSeqRef.current;
          if (eventSeq < authOpSeqRef.current) return;

          setSession(currentSession);
          setUser(currentSession?.user ?? null);
          if (currentSession) {
            setAuthError(null);
          }
        }
      );
      authSubscription = authListener?.subscription ?? null;
    } catch (subErr) {
      console.warn('[FoodAI:Auth] Error al registrar onAuthStateChange:', subErr);
    }

    // Si ya se proveyó una sesión inicial fija (ej. en pruebas), no inicializamos asíncronamente
    if (initialSession === undefined) {
      const initSeq = ++authOpSeqRef.current;

      supabaseClient.auth
        .getSession()
        .then(({ data, error }) => {
          if (error) {
            console.warn('[FoodAI:Auth] Error al restaurar sesión previa:', error.message);
          }
          if (isMountedRef.current && initSeq === authOpSeqRef.current) {
            const restoredSession = data?.session ?? null;
            setSession(restoredSession);
            setUser(restoredSession?.user ?? null);
          }
        })
        .catch((err) => {
          console.warn('[FoodAI:Auth] Excepción al restaurar sesión inicial:', err);
        })
        .finally(() => {
          if (isMountedRef.current && initSeq >= authOpSeqRef.current) {
            setIsInitializing(false);
          }
        });
    }

    return () => {
      isMountedRef.current = false;
      if (authSubscription) {
        authSubscription.unsubscribe();
      }
    };
  }, [supabaseClient, initialSession]);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  /**
   * Registro con correo y contraseña mediante supabase.auth.signUp()
   */
  const signUp = useCallback(
    async (email: string, password: string): Promise<SignUpResult> => {
      if (isSubmittingRef.current) {
        return { user: null, session: null, confirmationPending: false };
      }

      const trimmedEmail = email.trim();

      // Validaciones previas locales
      if (!isValidEmail(trimmedEmail)) {
        const msg = 'Por favor, ingresa un correo electrónico válido.';
        setAuthError(msg);
        throw new Error(msg);
      }

      if (!isValidPassword(password)) {
        const msg = `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
        setAuthError(msg);
        throw new Error(msg);
      }

      if (!isSupabaseConfigured() && typeof jest === 'undefined') {
        const msg =
          'Supabase no está configurado. Por favor, define EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY en tu archivo .env local.';
        setAuthError(msg);
        throw new Error(msg);
      }

      isSubmittingRef.current = true;
      setIsSubmitting(true);
      setAuthError(null);

      try {
        const { data, error } = await supabaseClient.auth.signUp({
          email: trimmedEmail,
          password,
        });

        if (error) {
          const friendlyMessage = mapSupabaseAuthError(error);
          setAuthError(friendlyMessage);
          throw new Error(friendlyMessage);
        }

        const registeredUser = data.user;
        const registeredSession = data.session;

        // Distinción estricta de confirmación pendiente:
        // Si hay usuario retornado pero data.session es null, Supabase requiere confirmación de correo
        const confirmationPending = Boolean(registeredUser && !registeredSession);

        if (registeredSession && isMountedRef.current) {
          authOpSeqRef.current++;
          setSession(registeredSession);
          setUser(registeredUser);
        }

        return {
          user: registeredUser,
          session: registeredSession,
          confirmationPending,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : mapSupabaseAuthError(err);
        setAuthError(msg);
        throw err instanceof Error ? err : new Error(msg);
      } finally {
        isSubmittingRef.current = false;
        if (isMountedRef.current) {
          setIsSubmitting(false);
        }
      }
    },
    [supabaseClient]
  );

  /**
   * Inicio de sesión con correo y contraseña mediante supabase.auth.signInWithPassword()
   */
  const signIn = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      if (isSubmittingRef.current) {
        throw new Error('Ya hay una operación de autenticación en curso.');
      }

      const trimmedEmail = email.trim();

      if (!isValidEmail(trimmedEmail)) {
        const msg = 'Por favor, ingresa un correo electrónico válido.';
        setAuthError(msg);
        throw new Error(msg);
      }

      if (!password) {
        const msg = 'Por favor, ingresa tu contraseña.';
        setAuthError(msg);
        throw new Error(msg);
      }

      if (!isSupabaseConfigured() && typeof jest === 'undefined') {
        const msg =
          'Supabase no está configurado. Por favor, define EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY en tu archivo .env local.';
        setAuthError(msg);
        throw new Error(msg);
      }

      isSubmittingRef.current = true;
      setIsSubmitting(true);
      setAuthError(null);

      try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });

        if (error) {
          const friendlyMessage = mapSupabaseAuthError(error);
          setAuthError(friendlyMessage);
          throw new Error(friendlyMessage);
        }

        if (isMountedRef.current) {
          authOpSeqRef.current++;
          setSession(data.session);
          setUser(data.user);
          setAuthError(null);
        }

        return {
          user: data.user,
          session: data.session,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : mapSupabaseAuthError(err);
        setAuthError(msg);
        throw err instanceof Error ? err : new Error(msg);
      } finally {
        isSubmittingRef.current = false;
        if (isMountedRef.current) {
          setIsSubmitting(false);
        }
      }
    },
    [supabaseClient]
  );

  /**
   * Cierre de sesión seguro mediante supabase.auth.signOut()
   */
  const signOut = useCallback(async () => {
    const opSeq = ++authOpSeqRef.current;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setAuthError(null);

    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) {
        const friendlyMessage = mapSupabaseAuthError(error);
        setAuthError(friendlyMessage);
        throw new Error(friendlyMessage);
      }

      if (isMountedRef.current && opSeq >= authOpSeqRef.current) {
        setSession(null);
        setUser(null);
        setIsInitializing(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : mapSupabaseAuthError(err);
      setAuthError(msg);
      throw err instanceof Error ? err : new Error(msg);
    } finally {
      isSubmittingRef.current = false;
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  }, [supabaseClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      isAuthenticated: Boolean(session && user),
      isInitializing,
      isSubmitting,
      authError,
      signUp,
      signIn,
      signOut,
      clearAuthError,
    }),
    [user, session, isInitializing, isSubmitting, authError, signUp, signIn, signOut, clearAuthError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser utilizado dentro de un AuthProvider');
  }
  return context;
}

export function useAuthSafe(): AuthContextValue | null {
  return useContext(AuthContext) ?? null;
}
