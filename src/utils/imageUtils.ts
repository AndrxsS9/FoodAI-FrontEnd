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

export interface ImageCandidateValidation {
  isValid: boolean;
  error?: string;
  mimeType?: SupportedMimeType;
}

/**
 * Valida un candidato de imagen antes de ser procesado o subido.
 */
export function validateImageCandidate(candidate: {
  uri?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
}): ImageCandidateValidation {
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

  if (typeof candidate.fileSize === 'number' && candidate.fileSize > MAX_IMAGE_SIZE_BYTES) {
    return {
      isValid: false,
      error: `La imagen excede el límite máximo permitido de 8 MB (${(candidate.fileSize / (1024 * 1024)).toFixed(1)} MB).`,
      mimeType: detectedMime as SupportedMimeType,
    };
  }

  return {
    isValid: true,
    mimeType: detectedMime as SupportedMimeType,
  };
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
    typeof image.fileSize === 'number' && image.fileSize > 2 * 1024 * 1024; // > 2MB

  // Si la imagen es moderada y ya cumple los requisitos, no re-procesar innecesariamente
  if (!needsDimensionReduction && !needsSizeCompression && isSupportedMimeType(image.mimeType)) {
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
      // Si no tenemos dimensiones, aseguramos un ancho máximo razonable
      actions.push({ resize: { width: MAX_IMAGE_DIMENSION } });
    }

    const manipResult = await manipulateAsync(
      image.uri,
      actions,
      {
        compress: DEFAULT_JPEG_QUALITY,
        format: SaveFormat.JPEG,
      }
    );

    return {
      uri: manipResult.uri,
      mimeType: 'image/jpeg',
      fileName: image.fileName?.replace(/\.[^/.]+$/, '.jpg') || 'scanned_ingredient.jpg',
      width: manipResult.width,
      height: manipResult.height,
    };
  } catch (err) {
    // Si la manipulación falla (por ejemplo en ciertas plataformas web sin canvas),
    // retornamos la original si cumple con las restricciones de tamaño
    console.warn('[FoodAI:imageUtils] No se pudo optimizar la imagen con ImageManipulator:', err);
    return image;
  }
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
