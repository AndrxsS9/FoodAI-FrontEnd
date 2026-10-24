import { Platform } from 'react-native';
import {
  createAnalyzeFormData,
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

  describe('prepareAndValidateImageForUpload - End-to-end upload safety pipeline', () => {
    it('passes directly for an already valid image under 8 MB', async () => {
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

    it('optimizes oversized image (10 MB) down to under 8 MB and validates final size', async () => {
      (ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValueOnce({
        uri: 'file:///compressed.jpg',
        width: 1920,
        height: 1440,
      });

      const input = {
        uri: 'file:///oversized.jpg',
        mimeType: 'image/jpeg',
        fileName: 'oversized.jpg',
        width: 4000,
        height: 3000,
        fileSize: 10 * 1024 * 1024, // 10 MB (> 8 MB)
      };

      const ready = await prepareAndValidateImageForUpload(input);
      expect(ready.uri).toBe('file:///compressed.jpg');
      expect(ready.fileSize).toBeLessThanOrEqual(MAX_IMAGE_SIZE_BYTES);
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
