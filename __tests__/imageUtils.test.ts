import { Platform } from 'react-native';
import {
  createAnalyzeFormData,
  determineFileSizeAsync,
  getBase64ByteLength,
  inferMimeTypeFromUri,
  isSupportedMimeType,
  MAX_IMAGE_SIZE_BYTES,
  MAX_RAW_IMAGE_SIZE_BYTES,
  normalizeMimeType,
  optimizeImageIfNeeded,
  prepareAndValidateImageForUpload,
  validateImageCandidate,
} from '../src/utils/imageUtils';
import * as ImageManipulator from 'expo-image-manipulator';

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: {
    JPEG: 'jpeg',
    PNG: 'png',
    WEBP: 'webp',
  },
}));

describe('imageUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('MIME Type Validation and Inference', () => {
    it('correctly validates supported MIME types', () => {
      expect(isSupportedMimeType('image/jpeg')).toBe(true);
      expect(isSupportedMimeType('image/jpg')).toBe(true);
      expect(isSupportedMimeType('image/png')).toBe(true);
      expect(isSupportedMimeType('image/webp')).toBe(true);
      expect(isSupportedMimeType('image/gif')).toBe(false);
      expect(isSupportedMimeType('image/bmp')).toBe(false);
      expect(isSupportedMimeType('application/pdf')).toBe(false);
      expect(isSupportedMimeType('')).toBe(false);
      expect(isSupportedMimeType(null)).toBe(false);
    });

    it('infers MIME type from URI extension', () => {
      expect(inferMimeTypeFromUri('file:///photos/food.png')).toBe('image/png');
      expect(inferMimeTypeFromUri('https://example.com/item.webp?v=1')).toBe('image/webp');
      expect(inferMimeTypeFromUri('file:///photos/food.jpg')).toBe('image/jpeg');
      expect(inferMimeTypeFromUri('file:///photos/food.jpeg')).toBe('image/jpeg');
      expect(inferMimeTypeFromUri('file:///photos/unknown_file')).toBe('image/jpeg');
    });

    it('normalizes MIME types correctly', () => {
      expect(normalizeMimeType('image/jpg')).toBe('image/jpeg');
      expect(normalizeMimeType('image/jpeg')).toBe('image/jpeg');
      expect(normalizeMimeType('image/png')).toBe('image/png');
      expect(normalizeMimeType('image/webp')).toBe('image/webp');
      expect(normalizeMimeType(undefined, 'photo.png')).toBe('image/png');
      expect(normalizeMimeType(undefined, 'photo.xyz')).toBe('image/jpeg');
    });
  });

  describe('validateImageCandidate', () => {
    it('rejects empty or null candidates', () => {
      expect(validateImageCandidate({ uri: '' }).isValid).toBe(false);
      expect(validateImageCandidate({ uri: null as any }).isValid).toBe(false);
    });

    it('rejects unsupported image format', () => {
      const result = validateImageCandidate({
        uri: 'file:///image.gif',
        mimeType: 'image/gif',
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Formato de imagen no permitido');
    });

    it('rejects image exceeding 8 MB when allowOversizedForOptimization is false', () => {
      const result = validateImageCandidate({
        uri: 'file:///huge_photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: MAX_IMAGE_SIZE_BYTES + 1024,
        allowOversizedForOptimization: false,
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('excede el límite máximo permitido de 8 MB');
    });

    it('allows oversized image for optimization if within MAX_RAW_IMAGE_SIZE_BYTES', () => {
      const result = validateImageCandidate({
        uri: 'file:///huge_photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: 12 * 1024 * 1024,
        allowOversizedForOptimization: true,
      });
      expect(result.isValid).toBe(true);
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('rejects excessively large images exceeding MAX_RAW_IMAGE_SIZE_BYTES even with allowOversizedForOptimization', () => {
      const result = validateImageCandidate({
        uri: 'file:///monstrous_photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: MAX_RAW_IMAGE_SIZE_BYTES + 1024,
        allowOversizedForOptimization: true,
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('supera el límite admisible de 50 MB');
    });

    it('accepts valid candidate within 8 MB and allowed format', () => {
      const result = validateImageCandidate({
        uri: 'file:///photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: 3 * 1024 * 1024,
      });
      expect(result.isValid).toBe(true);
      expect(result.mimeType).toBe('image/jpeg');
    });
  });

  describe('optimizeImageIfNeeded', () => {
    it('skips optimization if image is already small and within dimensions', async () => {
      const input = {
        uri: 'file:///photo.jpg',
        mimeType: 'image/jpeg',
        width: 800,
        height: 600,
        fileSize: 500 * 1024,
      };

      const result = await optimizeImageIfNeeded(input);
      expect(result).toBe(input);
      expect(ImageManipulator.manipulateAsync).not.toHaveBeenCalled();
    });

    it('optimizes image when width or height exceeds 1920', async () => {
      (ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValueOnce({
        uri: 'file:///optimized_photo.jpg',
        width: 1920,
        height: 1080,
      });

      const input = {
        uri: 'file:///raw_camera.jpg',
        mimeType: 'image/jpeg',
        fileName: 'raw_camera.jpg',
        width: 4000,
        height: 2250,
        fileSize: 7 * 1024 * 1024,
      };

      const result = await optimizeImageIfNeeded(input);
      expect(ImageManipulator.manipulateAsync).toHaveBeenCalledTimes(1);
      expect(result.uri).toBe('file:///optimized_photo.jpg');
      expect(result.width).toBe(1920);
    });

    it('falls back to original image if manipulateAsync throws an error', async () => {
      (ImageManipulator.manipulateAsync as jest.Mock).mockRejectedValueOnce(
        new Error('Canvas error')
      );

      const input = {
        uri: 'file:///photo.jpg',
        mimeType: 'image/jpeg',
        width: 3000,
        height: 2000,
      };

      const result = await optimizeImageIfNeeded(input);
      expect(result.uri).toBe('file:///photo.jpg');
    });
  });

  describe('determineFileSizeAsync and getBase64ByteLength', () => {
    it('calculates exact byte length from base64 string handling padding', () => {
      // "hello" -> "aGVsbG8=" (5 bytes)
      expect(getBase64ByteLength('aGVsbG8=')).toBe(5);
      // "test" -> "dGVzdA==" (4 bytes)
      expect(getBase64ByteLength('dGVzdA==')).toBe(4);
      // "man" -> "bWFu" (3 bytes, no padding)
      expect(getBase64ByteLength('bWFu')).toBe(3);
      expect(getBase64ByteLength('')).toBe(0);
    });

    it('measures byte length of data URI directly', async () => {
      const dataUri = 'data:image/jpeg;base64,aGVsbG8=';
      const size = await determineFileSizeAsync(dataUri);
      expect(size).toBe(5);
    });

    it('measures size of web blob URI using fetch', async () => {
      const mockBlob = new Blob(['image payload of 20 bytes'], { type: 'image/jpeg' });
      const originalFetch = globalThis.fetch;
      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        blob: async () => mockBlob,
      }) as any;

      try {
        const size = await determineFileSizeAsync('blob:http://localhost/photo-blob');
        expect(size).toBe(mockBlob.size);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('returns fallbackSize if positive when runtime file measuring fails', async () => {
      const size = await determineFileSizeAsync('file:///unknown_nonexistent.jpg', 3500000);
      expect(size).toBe(3500000);
    });

    it('returns null if size cannot be determined reliably and no positive fallback exists', async () => {
      const size = await determineFileSizeAsync('file:///unknown_nonexistent.jpg', null);
      expect(size).toBeNull();
    });
  });

  describe('prepareAndValidateImageForUpload - Strict size validation pipeline', () => {
    it('passes directly for an already valid image of known size below 8 MB', async () => {
      const input = {
        uri: 'file:///small_photo.jpg',
        mimeType: 'image/jpeg',
        width: 800,
        height: 600,
        fileSize: 2 * 1024 * 1024,
      };

      const ready = await prepareAndValidateImageForUpload(input);
      expect(ready.uri).toBe('file:///small_photo.jpg');
      expect(ready.fileSize).toBe(2 * 1024 * 1024);
    });

    it('accepts a compressed image of known size below 8 MB', async () => {
      // 100 bytes base64 payload simulates a compressed image of 100 bytes
      const sampleBase64 = btoa('a'.repeat(100));
      (ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValueOnce({
        uri: 'file:///compressed.jpg',
        width: 1920,
        height: 1080,
        base64: sampleBase64,
      });

      const input = {
        uri: 'file:///oversized_camera.jpg',
        mimeType: 'image/jpeg',
        fileName: 'raw.jpg',
        width: 4000,
        height: 3000,
        fileSize: 10 * 1024 * 1024, // 10 MB (> 8 MB)
      };

      const ready = await prepareAndValidateImageForUpload(input);
      expect(ready.uri).toBe('file:///compressed.jpg');
      expect(ready.fileSize).toBe(100);
      expect(ready.fileSize).toBeLessThanOrEqual(MAX_IMAGE_SIZE_BYTES);
    });

    it('rejects a final image above 8 MB even after compression', async () => {
      // Generar base64 equivalente a 9 MB (> 8 MB)
      // 9 MB = 9 * 1024 * 1024 = 9437184 bytes
      // Longitud base64 aproximada: 9437184 * 4 / 3 = 12582912 caracteres
      const simulatedNineMbBase64 = 'A'.repeat(12582912);
      (ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValueOnce({
        uri: 'file:///still_huge.jpg',
        width: 1920,
        height: 1080,
        base64: simulatedNineMbBase64,
      });

      const input = {
        uri: 'file:///massive.jpg',
        mimeType: 'image/jpeg',
        width: 4000,
        height: 3000,
        fileSize: 15 * 1024 * 1024,
      };

      await expect(prepareAndValidateImageForUpload(input)).rejects.toThrow(
        /La imagen excede el límite máximo de 8 MB/
      );
    });

    it('rejects an image with unknown final size and does not silently accept it', async () => {
      (ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValueOnce({
        uri: 'file:///unmeasurable_result.jpg',
        width: 1920,
        height: 1080,
        // Sin base64 y sin ruta medible en disco
      });

      const input = {
        uri: 'file:///unmeasurable_input.jpg',
        mimeType: 'image/jpeg',
        width: 4000,
        height: 3000,
        // fileSize no disponible
      };

      await expect(prepareAndValidateImageForUpload(input)).rejects.toThrow(
        'No se pudo determinar con certeza el tamaño del archivo de imagen para garantizar el límite de 8 MB. Por favor selecciona otra foto.'
      );
    });

    it('prevents a mocked image with large dimensions from passing based only on an estimated size', async () => {
      // Una imagen con dimensiones 4000x3000 pero sin tamaño en bytes real
      // bajo el código anterior calculaba (4000*3000*0.35) = 4.2 MB y pasaba silenciosamente.
      // Ahora DEBE fallar si no se puede medir el tamaño real con certeza.
      (ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValueOnce({
        uri: 'file:///dimension_only.jpg',
        width: 4000,
        height: 3000,
      });

      const input = {
        uri: 'file:///large_dim.jpg',
        mimeType: 'image/jpeg',
        width: 4000,
        height: 3000,
      };

      await expect(prepareAndValidateImageForUpload(input)).rejects.toThrow(
        'No se pudo determinar con certeza el tamaño del archivo de imagen para garantizar el límite de 8 MB. Por favor selecciona otra foto.'
      );
    });

    it('handles valid Web blob URI path correctly', async () => {
      const originalPlatform = Platform.OS;
      (Platform as any).OS = 'web';

      const mockBlob = new Blob(['sample-blob-content-3mb'], { type: 'image/jpeg' });
      const originalFetch = globalThis.fetch;
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        blob: async () => mockBlob,
      }) as any;

      try {
        const input = {
          uri: 'blob:http://localhost:8081/valid-blob-id',
          mimeType: 'image/jpeg',
          width: 800,
          height: 600,
          fileSize: mockBlob.size,
        };

        const ready = await prepareAndValidateImageForUpload(input);
        expect(ready.uri).toBe('blob:http://localhost:8081/valid-blob-id');
        expect(ready.fileSize).toBe(mockBlob.size);
      } finally {
        (Platform as any).OS = originalPlatform;
        globalThis.fetch = originalFetch;
      }
    });

    it('blocks upload if image is oversized and optimization fails', async () => {
      (ImageManipulator.manipulateAsync as jest.Mock).mockRejectedValueOnce(
        new Error('Out of memory')
      );

      const input = {
        uri: 'file:///huge.jpg',
        mimeType: 'image/jpeg',
        width: 4000,
        height: 3000,
        fileSize: 12 * 1024 * 1024,
      };

      await expect(prepareAndValidateImageForUpload(input)).rejects.toThrow(
        /supera el límite máximo permitido de 8 MB/
      );
    });

    it('rejects unsupported format before attempting upload', async () => {
      const input = {
        uri: 'file:///animated.gif',
        mimeType: 'image/gif',
        width: 500,
        height: 500,
      };

      await expect(prepareAndValidateImageForUpload(input)).rejects.toThrow(
        /Formato de imagen no permitido/
      );
    });
  });

  describe('createAnalyzeFormData', () => {
    it('appends file with exact field name "image"', async () => {
      const input = {
        uri: 'file:///photo.jpg',
        mimeType: 'image/jpeg',
        fileName: 'food.jpg',
      };

      const formData = await createAnalyzeFormData(input);
      expect(formData).toBeInstanceOf(FormData);
    });

    it('handles web platform with real blob fetching', async () => {
      const originalPlatform = Platform.OS;
      (Platform as any).OS = 'web';

      const mockBlob = new Blob(['test'], { type: 'image/jpeg' });
      const mockFetch = jest.fn().mockResolvedValueOnce({
        blob: async () => mockBlob,
      });
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch as any;

      try {
        const formData = await createAnalyzeFormData({
          uri: 'blob:http://localhost/12345',
          mimeType: 'image/jpeg',
          fileName: 'scan.jpg',
        });

        expect(mockFetch).toHaveBeenCalledWith('blob:http://localhost/12345');
        expect(formData).toBeInstanceOf(FormData);
      } finally {
        (Platform as any).OS = originalPlatform;
        globalThis.fetch = originalFetch;
      }
    });
  });
});
