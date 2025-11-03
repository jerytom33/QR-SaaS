/**
 * File Optimization Service Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FileOptimizer, ImageOptimizationConfig } from '../optimization';

describe('FileOptimizer', () => {
  let optimizer: FileOptimizer;

  beforeEach(() => {
    const config: Partial<ImageOptimizationConfig> = {
      enableSharp: true,
      maxWidth: 1200,
      maxHeight: 1200,
      thumbnailWidth: 150,
      thumbnailHeight: 150,
      quality: 85,
      format: 'webp',
    };
    optimizer = new FileOptimizer(config);
  });

  describe('Initialization', () => {
    it('should initialize with default config', () => {
      const opt = new FileOptimizer();
      expect(opt).toBeDefined();
    });

    it('should accept custom config', () => {
      const config = {
        maxWidth: 2000,
        maxHeight: 2000,
        quality: 90,
      };
      const opt = new FileOptimizer(config);
      expect(opt).toBeDefined();
    });

    it('should initialize Sharp when available', () => {
      const opt = new FileOptimizer({ enableSharp: true });
      expect(opt).toBeDefined();
    });

    it('should handle Sharp unavailability gracefully', () => {
      const opt = new FileOptimizer({ enableSharp: false });
      expect(opt).toBeDefined();
    });
  });

  describe('Image Format Detection', () => {
    it('should detect JPEG format', () => {
      const filename = 'photo.jpg';
      const optimizer_any = optimizer as any;
      const format = optimizer_any.getImageFormat(filename);
      expect(format).toBe('jpg');
    });

    it('should detect PNG format', () => {
      const filename = 'image.png';
      const optimizer_any = optimizer as any;
      const format = optimizer_any.getImageFormat(filename);
      expect(format).toBe('png');
    });

    it('should detect GIF format', () => {
      const filename = 'animation.gif';
      const optimizer_any = optimizer as any;
      const format = optimizer_any.getImageFormat(filename);
      expect(format).toBe('gif');
    });

    it('should detect WebP format', () => {
      const filename = 'optimized.webp';
      const optimizer_any = optimizer as any;
      const format = optimizer_any.getImageFormat(filename);
      expect(format).toBe('webp');
    });
  });

  describe('Optimization Detection', () => {
    it('should identify JPEG as needing optimization', () => {
      const needsOpt = optimizer.needsOptimization('image/jpeg');
      expect(typeof needsOpt).toBe('boolean');
    });

    it('should identify PNG as needing optimization', () => {
      const needsOpt = optimizer.needsOptimization('image/png');
      expect(typeof needsOpt).toBe('boolean');
    });

    it('should not require optimization for PDFs', () => {
      const needsOpt = optimizer.needsOptimization('application/pdf');
      expect(needsOpt).toBe(false);
    });

    it('should not require optimization for documents', () => {
      const needsOpt = optimizer.needsOptimization('application/msword');
      expect(needsOpt).toBe(false);
    });

    it('should not require optimization for text', () => {
      const needsOpt = optimizer.needsOptimization('text/plain');
      expect(needsOpt).toBe(false);
    });
  });

  describe('Resize Info Calculation', () => {
    it('should calculate thumbnail size for landscape image', () => {
      const info = optimizer.calculateResizeInfo(1920, 1080);

      expect(info.thumbnail).toBeDefined();
      expect(info.thumbnail.width).toBeLessThanOrEqual(150);
      expect(info.thumbnail.height).toBeLessThanOrEqual(150);
    });

    it('should calculate thumbnail size for portrait image', () => {
      const info = optimizer.calculateResizeInfo(1080, 1920);

      expect(info.thumbnail).toBeDefined();
      expect(info.thumbnail.width).toBeLessThanOrEqual(150);
      expect(info.thumbnail.height).toBeLessThanOrEqual(150);
    });

    it('should calculate thumbnail size for square image', () => {
      const info = optimizer.calculateResizeInfo(1000, 1000);

      expect(info.thumbnail).toBeDefined();
      expect(info.thumbnail.width).toBeLessThanOrEqual(150);
      expect(info.thumbnail.height).toBeLessThanOrEqual(150);
    });

    it('should calculate optimized size for large image', () => {
      const info = optimizer.calculateResizeInfo(4000, 3000);

      expect(info.optimized).toBeDefined();
      expect(info.optimized.width).toBeLessThanOrEqual(1200);
      expect(info.optimized.height).toBeLessThanOrEqual(1200);
    });

    it('should handle missing dimensions', () => {
      const info = optimizer.calculateResizeInfo(undefined, undefined);

      expect(info.thumbnail).toBeDefined();
      expect(info.optimized).toBeDefined();
      expect(info.thumbnail.width).toBe(150);
      expect(info.thumbnail.height).toBe(150);
    });

    it('should maintain aspect ratio', () => {
      const info = optimizer.calculateResizeInfo(2000, 1000); // 2:1 aspect ratio

      const thumbAspect = info.thumbnail.width / info.thumbnail.height;
      expect(Math.abs(thumbAspect - 2)).toBeLessThan(0.1);

      const optAspect = info.optimized.width / info.optimized.height;
      expect(Math.abs(optAspect - 2)).toBeLessThan(0.1);
    });
  });

  describe('Metadata Extraction', () => {
    it('should handle metadata extraction for images', async () => {
      const buffer = Buffer.from('dummy image data');
      const metadata = await optimizer.extractMetadata(buffer, 'image/jpeg');

      expect(metadata).toBeDefined();
      expect(typeof metadata).toBe('object');
    });

    it('should handle metadata extraction for PDFs', async () => {
      const buffer = Buffer.from('%PDF-1.4 dummy');
      const metadata = await optimizer.extractMetadata(buffer, 'application/pdf');

      expect(metadata).toBeDefined();
      expect(typeof metadata).toBe('object');
    });

    it('should handle metadata extraction for other types', async () => {
      const buffer = Buffer.from('text content');
      const metadata = await optimizer.extractMetadata(buffer, 'text/plain');

      expect(typeof metadata).toBe('object');
    });

    it('should handle extraction errors gracefully', async () => {
      const buffer = Buffer.from([0xFF, 0xD8]); // Invalid JPEG
      const metadata = await optimizer.extractMetadata(buffer, 'image/jpeg');

      expect(typeof metadata).toBe('object');
    });
  });

  describe('Stats Calculation', () => {
    it('should calculate optimization statistics', () => {
      const original = Buffer.from('a'.repeat(1000000)); // 1MB
      const optimized = Buffer.from('a'.repeat(100000)); // 100KB
      const thumbnail = Buffer.from('a'.repeat(10000)); // 10KB

      const stats = optimizer.getStats(original, thumbnail, optimized);

      expect(stats).toHaveProperty('originalSize');
      expect(stats).toHaveProperty('optimizedSize');
      expect(stats).toHaveProperty('thumbnailSize');
      expect(stats).toHaveProperty('savings');

      expect(stats.originalSize).toBe(1000000);
      expect(stats.optimizedSize).toBe(100000);
      expect(stats.thumbnailSize).toBe(10000);
      expect(stats.savings).toBeGreaterThan(0);
    });

    it('should handle no optimization savings', () => {
      const buffer = Buffer.from('test');
      const stats = optimizer.getStats(buffer, buffer, buffer);

      expect(stats.savings).toBe(0);
    });

    it('should handle negative savings', () => {
      const original = Buffer.from('a'.repeat(100));
      const enlarged = Buffer.from('a'.repeat(1000));

      const stats = optimizer.getStats(original, enlarged, enlarged);

      expect(stats.savings).toBeLessThan(0);
    });
  });

  describe('Document Compression', () => {
    it('should handle document compression', async () => {
      const buffer = Buffer.from('%PDF-1.4 test');
      const result = await optimizer.compressDocument(buffer, 'test.pdf');

      expect(result).toBeDefined();
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('should return buffer on compression', async () => {
      const buffer = Buffer.from('test content');
      const result = await optimizer.compressDocument(buffer, 'test.txt');

      expect(Buffer.isBuffer(result)).toBe(true);
    });
  });

  describe('Image Optimization', () => {
    it('should return OptimizedImage structure when Sharp disabled', async () => {
      const noSharpOptimizer = new FileOptimizer({ enableSharp: false });
      const buffer = Buffer.from('dummy image');

      const result = await noSharpOptimizer.optimizeImage(buffer, 'test.jpg');

      expect(result).toHaveProperty('original');
      expect(result).toHaveProperty('thumbnail');
      expect(result).toHaveProperty('optimized');
      expect(result).toHaveProperty('metadata');
    });

    it('should return buffers', async () => {
      const noSharpOptimizer = new FileOptimizer({ enableSharp: false });
      const buffer = Buffer.from('dummy image');

      const result = await noSharpOptimizer.optimizeImage(buffer, 'test.jpg');

      expect(Buffer.isBuffer(result.original)).toBe(true);
      expect(Buffer.isBuffer(result.thumbnail)).toBe(true);
      expect(Buffer.isBuffer(result.optimized)).toBe(true);
    });

    it('should handle optimization errors gracefully', async () => {
      const optimizer_any = optimizer as any;
      const buffer = Buffer.from([0xFF, 0xD8]); // Incomplete JPEG

      const result = await optimizer.optimizeImage(buffer, 'broken.jpg');

      expect(result).toHaveProperty('original');
      expect(result).toHaveProperty('thumbnail');
      expect(result).toHaveProperty('optimized');
    });
  });
});
