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
  const lastAppliedSeqRef = useRef<number>(0);
  const isSigningOutRef = useRef<boolean>(false);
  const lastLoginSeqRef = useRef<number>(0);
  const initialSessionHandledRef = useRef<boolean>(initialSession !== undefined);

  // Inicialización de sesión y suscripción al listener de Supabase Auth
  useEffect(() => {
    isMountedRef.current = true;

    let authSubscription: { unsubscribe: () => void } | null = null;
    try {
      const { data: authListener } = supabaseClient.auth.onAuthStateChange(
        (event, currentSession) => {
          if (!isMountedRef.current) return;
          const eventSeq = ++authOpSeqRef.current;

          // Protección de ciclo de vida:
          // Si el estado inicial ya fue determinado o superado por una acción posterior (ej. SIGNED_IN o signOut),
          // cualquier INITIAL_SESSION tardío o desordenado es obsoleto y se descarta.
          if (event === 'INITIAL_SESSION') {
            if (initialSessionHandledRef.current) {
              setIsInitializing(false);
              return;
            }
            initialSessionHandledRef.current = true;
          }

          // Protección significativa contra eventos fuera de orden
          if (eventSeq < lastAppliedSeqRef.current) return;

          // Si un signOut explícito está en progreso y llega un evento con usuario previo,
          // evitamos revivir esa sesión mientras se procesa la salida
          if (isSigningOutRef.current && (event === 'INITIAL_SESSION' || currentSession?.user)) {
            if (event === 'SIGNED_OUT' || !currentSession) {
              lastAppliedSeqRef.current = eventSeq;
              setSession(null);
              setUser(null);
              setIsInitializing(false);
            }
            return;
          }

          if (event === 'SIGNED_IN') {
            initialSessionHandledRef.current = true;
            if (currentSession?.user) {
              lastLoginSeqRef.current = eventSeq;
            }
          }

          if (event === 'SIGNED_OUT') {
            initialSessionHandledRef.current = true;
          }

          lastAppliedSeqRef.current = eventSeq;
          setSession(currentSession);
          setUser(currentSession?.user ?? null);
          if (currentSession) {
            setAuthError(null);
          }

          // Cualquier evento de ciclo de vida (INITIAL_SESSION, SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED)
          // confirma que el estado de autenticación se determinó
          setIsInitializing(false);
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
          // Solo aplicar si no hay signOut en curso y ningún evento más reciente fijó el estado
          if (
            isMountedRef.current &&
            !isSigningOutRef.current &&
            !initialSessionHandledRef.current &&
            initSeq >= lastAppliedSeqRef.current
          ) {
            lastAppliedSeqRef.current = initSeq;
            initialSessionHandledRef.current = true;
            const restoredSession = data?.session ?? null;
            setSession(restoredSession);
            setUser(restoredSession?.user ?? null);
          }
        })
        .catch((err) => {
          console.warn('[FoodAI:Auth] Excepción al restaurar sesión inicial:', err);
        })
        .finally(() => {
          // La inicialización siempre concluye al resolver getSession (éxito, error o descarte por evento)
          initialSessionHandledRef.current = true;
          if (isMountedRef.current) {
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
          initialSessionHandledRef.current = true;
          const signUpSeq = ++authOpSeqRef.current;
          if (signUpSeq >= lastAppliedSeqRef.current) {
            lastAppliedSeqRef.current = signUpSeq;
            lastLoginSeqRef.current = signUpSeq;
            setSession(registeredSession);
            setUser(registeredUser);
          }
          setIsInitializing(false);
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

      const signInSeq = ++authOpSeqRef.current;
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
          initialSessionHandledRef.current = true;
          if (signInSeq >= lastAppliedSeqRef.current) {
            lastAppliedSeqRef.current = signInSeq;
            lastLoginSeqRef.current = signInSeq;
            setSession(data.session);
            setUser(data.user);
            setAuthError(null);
          }
          setIsInitializing(false);
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
    const signOutSeq = ++authOpSeqRef.current;
    isSigningOutRef.current = true;
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

      if (isMountedRef.current) {
        initialSessionHandledRef.current = true;
        // Garantizar cierre de sesión a menos que un login posterior más nuevo haya ocurrido
        if (signOutSeq >= lastLoginSeqRef.current) {
          lastAppliedSeqRef.current = Math.max(lastAppliedSeqRef.current, signOutSeq);
          setSession(null);
          setUser(null);
        }
        setIsInitializing(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : mapSupabaseAuthError(err);
      setAuthError(msg);
      throw err instanceof Error ? err : new Error(msg);
    } finally {
      isSigningOutRef.current = false;
      isSubmittingRef.current = false;
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  }, [supabaseClient]);

  /**
   * Actualización del perfil y metadatos del usuario autenticado (Fase 5B).
   * Persiste el nombre para mostrar en Supabase Auth user_metadata y sincroniza el contexto.
   */
  const updateProfile = useCallback(
    async (attributes: { displayName: string }): Promise<AuthUser> => {
      const trimmed = attributes?.displayName?.trim();
      if (!trimmed) {
        const msg = 'El nombre no puede estar vacío.';
        setAuthError(msg);
        throw new Error(msg);
      }

      if (isSubmittingRef.current) {
        throw new Error('Ya hay una operación de autenticación en curso.');
      }

      const updateSeq = ++authOpSeqRef.current;
      isSubmittingRef.current = true;
      setIsSubmitting(true);
      setAuthError(null);

      try {
        const { data, error } = await supabaseClient.auth.updateUser({
          data: {
            display_name: trimmed,
            name: trimmed,
          },
        });

        if (error) {
          const friendlyMessage = mapSupabaseAuthError(error);
          setAuthError(friendlyMessage);
          throw new Error(friendlyMessage);
        }

        const updatedUser = data?.user;
        if (!updatedUser) {
          throw new Error('No se pudo actualizar el perfil del usuario.');
        }

        if (isMountedRef.current && updateSeq >= lastAppliedSeqRef.current) {
          lastAppliedSeqRef.current = updateSeq;
          setUser(updatedUser);
          setSession((prev) => (prev ? { ...prev, user: updatedUser } : null));
          setAuthError(null);
        }

        return updatedUser;
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
      updateProfile,
    }),
    [
      user,
      session,
      isInitializing,
      isSubmitting,
      authError,
      signUp,
      signIn,
      signOut,
      clearAuthError,
      updateProfile,
    ]
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
