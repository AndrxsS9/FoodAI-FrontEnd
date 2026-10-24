/**
 * FoodAI - Utilidades de validación, compresión y preparación de imágenes (Fase 3B).
 * Cumple con las restricciones del backend:
 * - Formatos admitidos: image/jpeg, image/png, image/webp.
 * - Límite de tamaño: 8 MB (8 * 1024 * 1024 bytes).
 * - Optimización automática de dimensiones y compresión con expo-image-manipulator.
 * - Soporte adecuado de FormData para Web y React Native nativo.
 */
import { Platform } from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { SelectedImage } from '../types/scanner';

export const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB
export const MAX_IMAGE_DIMENSION = 1920; // 1920px max dimension for optimal AI balance
export const DEFAULT_JPEG_QUALITY = 0.8;

export const SUPPORTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

/**
 * Normaliza y valida si un MIME type es aceptado por el backend FoodAI.
 */
export function isSupportedMimeType(mimeType?: string | null): boolean {
  if (!mimeType || typeof mimeType !== 'string') return false;
  const clean = mimeType.trim().toLowerCase();
  if (clean === 'image/jpg') return true;
  return SUPPORTED_MIME_TYPES.includes(clean as SupportedMimeType);
}

/**
 * Infiere el tipo MIME a partir de la URI o nombre de archivo.
 */
export function inferMimeTypeFromUri(uri: string): string {
  const clean = uri.toLowerCase().split('?')[0];
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
  if (clean.endsWith('.gif')) return 'image/gif';
  if (clean.endsWith('.bmp')) return 'image/bmp';
  if (clean.endsWith('.svg')) return 'image/svg+xml';
  if (clean.endsWith('.pdf')) return 'application/pdf';
  return 'image/jpeg';
}

/**
 * Sanea y asegura un MIME type válido para el backend.
 */
export function normalizeMimeType(mimeType?: string | null, uriFallback?: string): SupportedMimeType | string {
  if (mimeType) {
    const clean = mimeType.trim().toLowerCase();
    if (clean === 'image/jpg' || clean === 'image/jpeg') return 'image/jpeg';
    if (clean === 'image/png') return 'image/png';
    if (clean === 'image/webp') return 'image/webp';
    return clean;
  }
  if (uriFallback) {
    return inferMimeTypeFromUri(uriFallback);
  }
  return 'image/jpeg';
}

export const MAX_RAW_IMAGE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB límite absoluto previo a optimización

export interface ImageCandidateValidationOptions {
  allowOversizedForOptimization?: boolean;
}

export interface ImageCandidateValidation {
  isValid: boolean;
  error?: string;
  mimeType?: SupportedMimeType;
  requiresOptimization?: boolean;
}

/**
 * Valida un candidato de imagen antes de ser procesado o subido.
 */
export function validateImageCandidate(
  candidate: {
    uri?: string | null;
    mimeType?: string | null;
    fileSize?: number | null;
    allowOversizedForOptimization?: boolean;
  },
  options?: ImageCandidateValidationOptions
): ImageCandidateValidation {
  const allowOversized =
    options?.allowOversizedForOptimization ??
    candidate?.allowOversizedForOptimization ??
    false;

  if (!candidate || !candidate.uri || typeof candidate.uri !== 'string' || !candidate.uri.trim()) {
    return {
      isValid: false,
      error: 'Debes seleccionar o capturar una imagen.',
    };
  }

  // Si se provee mimeType explícito no soportado, rechazar de inmediato
  if (candidate.mimeType && !isSupportedMimeType(candidate.mimeType)) {
    return {
      isValid: false,
      error: 'Formato de imagen no permitido. Usa JPG, PNG o WEBP.',
    };
  }

  const detectedMime = candidate.mimeType
    ? normalizeMimeType(candidate.mimeType)
    : inferMimeTypeFromUri(candidate.uri);

  if (!isSupportedMimeType(detectedMime)) {
    return {
      isValid: false,
      error: 'Formato de imagen no permitido. Usa JPG, PNG o WEBP.',
    };
  }

  // Límite de cordura previo para evitar fallos de memoria por archivos colosales
  if (typeof candidate.fileSize === 'number' && candidate.fileSize > MAX_RAW_IMAGE_SIZE_BYTES) {
    return {
      isValid: false,
      error: `La imagen es excesivamente grande (${(candidate.fileSize / (1024 * 1024)).toFixed(1)} MB) y supera el límite admisible de 50 MB.`,
      mimeType: detectedMime as SupportedMimeType,
    };
  }

  if (typeof candidate.fileSize === 'number' && candidate.fileSize > MAX_IMAGE_SIZE_BYTES) {
    if (allowOversized) {
      return {
        isValid: true,
        mimeType: detectedMime as SupportedMimeType,
        requiresOptimization: true,
      };
    }

    return {
      isValid: false,
      error: `La imagen excede el límite máximo permitido de 8 MB (${(candidate.fileSize / (1024 * 1024)).toFixed(1)} MB).`,
      mimeType: detectedMime as SupportedMimeType,
      requiresOptimization: false,
    };
  }

  return {
    isValid: true,
    mimeType: detectedMime as SupportedMimeType,
    requiresOptimization: false,
  };
}

/**
 * Calcula con precisión matemática el tamaño exacto en bytes de una cadena en Base64,
 * descontando caracteres de padding ('=').
 */
export function getBase64ByteLength(base64: string): number {
  const len = base64.length;
  if (len === 0) return 0;
  let padding = 0;
  if (base64.endsWith('==')) {
    padding = 2;
  } else if (base64.endsWith('=')) {
    padding = 1;
  }
  return Math.floor((len * 3) / 4) - padding;
}

/**
 * Determina el tamaño en bytes de un archivo o blob en runtime de forma estricta para web y nativo.
 * NUNCA utiliza estimaciones basadas en dimensiones.
 */
export async function determineFileSizeAsync(
  uri: string,
  fallbackSize?: number | null
): Promise<number | null> {
  if (!uri || typeof uri !== 'string' || !uri.trim()) return null;

  try {
    // 1. Data URI (Base64)
    if (uri.startsWith('data:')) {
      const commaIdx = uri.indexOf(',');
      if (commaIdx !== -1) {
        const base64Data = uri.slice(commaIdx + 1);
        return getBase64ByteLength(base64Data);
      }
    }

    const isNodeEnv = typeof process !== 'undefined' && Boolean(process.versions?.node);

    // 2. Web: Blobs y URLs HTTP(S) se determinan de forma certera con fetch
    if (
      typeof fetch === 'function' &&
      (uri.startsWith('blob:') || uri.startsWith('http:') || uri.startsWith('https:'))
    ) {
      const response = await fetch(uri);
      if (response.ok || response.status === 200) {
        const blob = await response.blob();
        if (typeof blob.size === 'number' && blob.size > 0) {
          return blob.size;
        }
      }
    }

    // 3. React Native nativo (Android / iOS en runtime Hermes/JSC):
    // fetch() sobre file:// es la API nativa de React Native para leer archivos del sandbox
    if (!isNodeEnv && Platform.OS !== 'web' && uri.startsWith('file://')) {
      try {
        const response = await fetch(uri);
        if (response.ok || response.status === 200 || response.status === 0) {
          const blob = await response.blob();
          if (typeof blob.size === 'number' && blob.size > 0) {
            return blob.size;
          }
        }
      } catch {
        // Continuar con fallback si el fetch nativo no está disponible
      }
    }
  } catch {
    // Fallback si la lectura falla
  }

  // 5. Tamaño previamente verificado (ej. metadata fileSize provista por ImagePicker o base64 medido)
  if (typeof fallbackSize === 'number' && fallbackSize > 0) {
    return fallbackSize;
  }

  return null;
}

/**
 * Optimiza la imagen si es demasiado grande o si proviene de una cámara de alta resolución,
 * garantizando que sea menor a 8 MB sin perder nitidez de ingredientes.
 */
export async function optimizeImageIfNeeded(image: SelectedImage): Promise<SelectedImage> {
  const needsDimensionReduction =
    (image.width && image.width > MAX_IMAGE_DIMENSION) ||
    (image.height && image.height > MAX_IMAGE_DIMENSION);

  const needsSizeCompression =
    typeof image.fileSize === 'number'
      ? image.fileSize > 2 * 1024 * 1024 // > 2MB
      : true; // Si no se conoce el tamaño, optimizar por precaución

  // Si la imagen es moderada y ya cumple los requisitos con tamaño y dimensiones conocidas, no re-procesar
  if (
    !needsDimensionReduction &&
    !needsSizeCompression &&
    typeof image.fileSize === 'number' &&
    image.width &&
    image.height &&
    isSupportedMimeType(image.mimeType)
  ) {
    return image;
  }

  try {
    const actions: { resize: { width?: number; height?: number } }[] = [];

    if (image.width && image.height) {
      if (image.width >= image.height && image.width > MAX_IMAGE_DIMENSION) {
        actions.push({ resize: { width: MAX_IMAGE_DIMENSION } });
      } else if (image.height > image.width && image.height > MAX_IMAGE_DIMENSION) {
        actions.push({ resize: { height: MAX_IMAGE_DIMENSION } });
      }
    } else {
      actions.push({ resize: { width: MAX_IMAGE_DIMENSION } });
    }

    const manipResult = await manipulateAsync(
      image.uri,
      actions,
      {
        compress: DEFAULT_JPEG_QUALITY,
        format: SaveFormat.JPEG,
        base64: true,
      }
    );

    let calculatedSize: number | null = null;
    if (manipResult.base64 && typeof manipResult.base64 === 'string') {
      calculatedSize = getBase64ByteLength(manipResult.base64);
    } else {
      calculatedSize = await determineFileSizeAsync(manipResult.uri, null);
    }

    return {
      uri: manipResult.uri,
      mimeType: 'image/jpeg',
      fileName: image.fileName?.replace(/\.[^/.]+$/, '.jpg') || 'scanned_ingredient.jpg',
      width: manipResult.width,
      height: manipResult.height,
      fileSize: calculatedSize ?? undefined,
    };
  } catch (err) {
    console.warn('[FoodAI:imageUtils] No se pudo optimizar la imagen con ImageManipulator:', err);
    return image;
  }
}

export interface PreparedImageResult {
  optimizedImage: SelectedImage;
  finalSize: number | null;
}

/**
 * Pipeline estricto de seguridad para subida de imágenes:
 * 1. Valida el formato soportado (JPG, PNG, WEBP).
 * 2. Optimiza y comprime si es necesario o si supera el umbral.
 * 3. Determina el tamaño de archivo final exacto (sin estimaciones).
 * 4. Valida que el resultado final no supere estrictamente los 8 MB.
 * 5. Si la medición falla o si el archivo final excede 8 MB, bloquea la subida.
 */
export async function prepareAndValidateImageForUpload(
  rawImage: SelectedImage
): Promise<SelectedImage> {
  // 1. Validar formato permitido
  const initialValidation = validateImageCandidate(rawImage, {
    allowOversizedForOptimization: true,
  });

  if (!initialValidation.isValid) {
    throw new Error(initialValidation.error || 'Formato de imagen no permitido. Usa JPG, PNG o WEBP.');
  }

  // 2. Optimizar y comprimir la imagen
  const optimized = await optimizeImageIfNeeded(rawImage);

  // Si la imagen original era > 8 MB y la optimización falló (se retornó la misma URI original)
  if (
    typeof rawImage.fileSize === 'number' &&
    rawImage.fileSize > MAX_IMAGE_SIZE_BYTES &&
    optimized.uri === rawImage.uri
  ) {
    throw new Error(
      `No se pudo comprimir la imagen y supera el límite máximo permitido de 8 MB (${(rawImage.fileSize / (1024 * 1024)).toFixed(1)} MB).`
    );
  }

  // 3. Determinar tamaño final real sin estimaciones basadas en dimensiones
  const finalSize = await determineFileSizeAsync(optimized.uri, optimized.fileSize);

  // Validación estricta: un tamaño final desconocido o no medible NUNCA puede pasar silenciosamente
  if (finalSize === null || typeof finalSize !== 'number' || finalSize <= 0) {
    throw new Error(
      'No se pudo determinar con certeza el tamaño del archivo de imagen para garantizar el límite de 8 MB. Por favor selecciona otra foto.'
    );
  }

  // 4. Validar resultado final (estricto máximo 8 MB = 8 * 1024 * 1024 bytes)
  if (finalSize > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(
      `La imagen excede el límite máximo de 8 MB (${(finalSize / (1024 * 1024)).toFixed(1)} MB) incluso tras la optimización. Por favor selecciona una imagen más pequeña.`
    );
  }

  return {
    ...optimized,
    fileSize: finalSize,
  };
}

/**
 * Construye el objeto FormData con el campo multipart requerido ('image')
 * de acuerdo a la plataforma (Web vs React Native).
 */
export async function createAnalyzeFormData(image: SelectedImage): Promise<FormData> {
  const formData = new FormData();
  const fileName = image.fileName || `ingrediente_${Date.now()}.jpg`;
  const mimeType = image.mimeType || 'image/jpeg';

  if (Platform.OS === 'web') {
    // En Web convertimos la URI en un Blob binario real
    const response = await fetch(image.uri);
    const blob = await response.blob();
    formData.append('image', blob, fileName);
  } else {
    // En React Native (Android / iOS)
    formData.append('image', {
      uri: image.uri,
      name: fileName,
      type: mimeType,
    } as any);
  }

  return formData;
}
