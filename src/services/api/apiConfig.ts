/**
 * FoodAI - Capa de configuración de API y resolución de entorno (Fase 3A).
 * Gestiona la URL base del backend garantizando compatibilidad entre:
 * 1. Expo Web (localhost / 127.0.0.1).
 * 2. Emulador de Android (10.0.2.2 en lugar de localhost).
 * 3. Dispositivos físicos (Android / iOS) en la misma red Wi-Fi local.
 * 4. Despliegues futuros seguros sobre HTTPS.
 *
 * REGLA ESTRICTA DE SEGURIDAD:
 * Este módulo SOLO gestiona la URL base pública del backend.
 * NUNCA debe contener credenciales, secretos ni la clave de API de Gemini.
 */

export const DEFAULT_API_TIMEOUT_MS = 10000; // 10 segundos para endpoints generales (ej: /api/health)
export const DEFAULT_AI_RECIPES_TIMEOUT_MS = 75000; // 75 segundos: acomoda 3 intentos de 20s de Gemini en backend + demoras de backoff + margen de red
export const DEFAULT_AI_SCANNER_TIMEOUT_MS = 75000; // 75 segundos: acomoda 3 intentos de 20s de Gemini en backend + demoras de backoff + margen de red y subida multipart
export const DEFAULT_AI_MEAL_PLANS_TIMEOUT_MS = 75000; // 75 segundos: acomoda cálculo de combinaciones de 3 días con Gemini en backend

export const API_ENDPOINTS = {
  HEALTH: '/api/health',
  RECIPES_RECOMMEND: '/api/recipes/recommend',
  INGREDIENTS_ANALYZE: '/api/ingredients/analyze',
  MEAL_PLANS_GENERATE: '/api/meal-plans/generate',
} as const;

export interface ApiBaseUrlValidation {
  isValid: boolean;
  url?: string;
  error?: string;
  advice?: string;
}

/**
 * Valida que una URL base cumpla con las normas de protocolo y formato requeridas.
 */
export function validateApiBaseUrl(rawUrl?: string | null): ApiBaseUrlValidation {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return {
      isValid: false,
      error: 'La variable de entorno EXPO_PUBLIC_API_BASE_URL no está configurada.',
      advice:
        'Crea un archivo .env en la raíz del proyecto definiendo EXPO_PUBLIC_API_BASE_URL (ej: http://localhost:3000 para web o http://10.0.2.2:3000 para emulador Android).',
    };
  }

  const trimmed = rawUrl.trim();

  // Debe iniciar con http:// o https://
  if (!/^https?:\/\//i.test(trimmed)) {
    return {
      isValid: false,
      error: `La URL base "${trimmed}" no especifica un protocolo válido (debe iniciar con http:// o https://).`,
      advice: 'Asegúrate de anteponer http:// o https:// en EXPO_PUBLIC_API_BASE_URL.',
    };
  }

  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname) {
      return {
        isValid: false,
        error: `La URL base "${trimmed}" carece de un nombre de host válido.`,
        advice: 'Verifica que el formato sea http://<host>:<puerto> sin caracteres inválidos.',
      };
    }

    // Normalizar eliminando slashes finales
    const normalized = trimmed.replace(/\/+$/, '');

    return {
      isValid: true,
      url: normalized,
    };
  } catch {
    return {
      isValid: false,
      error: `La URL base "${trimmed}" tiene una sintaxis de URL malformada.`,
      advice: 'Revisa que no contenga espacios ni caracteres no permitidos en una URL.',
    };
  }
}

/**
 * Obtiene la URL base pública del backend activa en el entorno actual.
 * Si se pasa un override (útil para pruebas automatizadas), se valida y utiliza.
 *
 * Lanza un error descriptivo con instrucciones claras si la configuración es inexistente o inválida.
 */
export function getApiBaseUrl(overrideUrl?: string): string {
  const candidate = overrideUrl ?? process.env.EXPO_PUBLIC_API_BASE_URL;
  const validation = validateApiBaseUrl(candidate);

  if (!validation.isValid || !validation.url) {
    const errorMsg = [
      validation.error ?? 'Configuración de API inválida.',
      validation.advice ?? '',
    ]
      .filter(Boolean)
      .join(' ');

    throw new Error(errorMsg);
  }

  return validation.url;
}

/**
 * Construye una URL completa para un endpoint específico a partir de la URL base configurada.
 */
export function buildApiUrl(endpoint: string, overrideBaseUrl?: string): string {
  const base = getApiBaseUrl(overrideBaseUrl);
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${cleanEndpoint}`;
}
