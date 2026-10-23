/**
 * Suite de pruebas unitarias para la capa de configuración de API (Fase 3A).
 * Valida:
 * 1. Validación de URLs base válidas (localhost, emulador Android 10.0.2.2, Wi-Fi LAN, HTTPS).
 * 2. Normalización de URLs (eliminación de slashes finales).
 * 3. Detección de URLs faltantes o vacías con mensajes accionables.
 * 4. Detección de protocolos inválidos o formatos malformados.
 * 5. Construcción de endpoints completos.
 */
import {
  API_ENDPOINTS,
  buildApiUrl,
  getApiBaseUrl,
  validateApiBaseUrl,
} from '../src/services/api/apiConfig';

describe('Configuración de API (apiConfig)', () => {
  const originalEnv = process.env.EXPO_PUBLIC_API_BASE_URL;

  afterEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = originalEnv;
  });

  describe('1. validateApiBaseUrl', () => {
    it('valida exitosamente localhost para desarrollo web', () => {
      const result = validateApiBaseUrl('http://localhost:3000');
      expect(result.isValid).toBe(true);
      expect(result.url).toBe('http://localhost:3000');
      expect(result.error).toBeUndefined();
    });

    it('valida exitosamente la dirección 10.0.2.2 para emuladores de Android', () => {
      const result = validateApiBaseUrl('http://10.0.2.2:3000');
      expect(result.isValid).toBe(true);
      expect(result.url).toBe('http://10.0.2.2:3000');
    });

    it('valida exitosamente direcciones IP de red local para dispositivos físicos Wi-Fi', () => {
      const result = validateApiBaseUrl('http://192.168.1.50:3000');
      expect(result.isValid).toBe(true);
      expect(result.url).toBe('http://192.168.1.50:3000');
    });

    it('valida exitosamente URLs seguras con protocolo HTTPS para despliegues de producción', () => {
      const result = validateApiBaseUrl('https://api.foodai.ejemplo.com');
      expect(result.isValid).toBe(true);
      expect(result.url).toBe('https://api.foodai.ejemplo.com');
    });

    it('normaliza URLs eliminando slashes finales duplicados', () => {
      const result = validateApiBaseUrl('http://localhost:3000///');
      expect(result.isValid).toBe(true);
      expect(result.url).toBe('http://localhost:3000');
    });

    it('rechaza URLs sin protocolo http/https con instrucciones claras', () => {
      const result = validateApiBaseUrl('localhost:3000');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('no especifica un protocolo válido');
      expect(result.advice).toContain('http:// o https://');
    });

    it('rechaza valores nulos, indefinidos o vacíos con sugerencias de configuración', () => {
      const emptyResult = validateApiBaseUrl('');
      expect(emptyResult.isValid).toBe(false);
      expect(emptyResult.error).toContain('EXPO_PUBLIC_API_BASE_URL no está configurada');
      expect(emptyResult.advice).toContain('.env');

      const nullResult = validateApiBaseUrl(null);
      expect(nullResult.isValid).toBe(false);
    });

    it('rechaza URLs sintácticamente malformadas', () => {
      const malformed = validateApiBaseUrl('http://');
      expect(malformed.isValid).toBe(false);
    });
  });

  describe('2. getApiBaseUrl', () => {
    it('obtiene la URL configurada en process.env.EXPO_PUBLIC_API_BASE_URL', () => {
      process.env.EXPO_PUBLIC_API_BASE_URL = 'http://127.0.0.1:3000';
      const url = getApiBaseUrl();
      expect(url).toBe('http://127.0.0.1:3000');
    });

    it('prioriza el overrideUrl si se proporciona explícitamente', () => {
      process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:3000';
      const url = getApiBaseUrl('http://custom-host:8080');
      expect(url).toBe('http://custom-host:8080');
    });

    it('lanza un error accionable si no hay URL configurada', () => {
      delete process.env.EXPO_PUBLIC_API_BASE_URL;
      expect(() => getApiBaseUrl()).toThrow(/EXPO_PUBLIC_API_BASE_URL no está configurada/);
    });
  });

  describe('3. buildApiUrl', () => {
    it('construye la URL completa del endpoint de recomendaciones de recetas', () => {
      const url = buildApiUrl(API_ENDPOINTS.RECIPES_RECOMMEND, 'http://localhost:3000');
      expect(url).toBe('http://localhost:3000/api/recipes/recommend');
    });

    it('garantiza un slash inicial en el endpoint si no se suministra', () => {
      const url = buildApiUrl('api/health', 'http://localhost:3000');
      expect(url).toBe('http://localhost:3000/api/health');
    });
  });
});
