/**
 * File Optimization Service
 * Handles image optimization, compression, and metadata extraction
 */

import { OptimizedImage } from './types';

/**
 * Image optimization configuration
 */
export interface ImageOptimizationConfig {
  enableSharp: boolean;
  maxWidth: number;
  maxHeight: number;
  thumbnailWidth: number;
  thumbnailHeight: number;
  quality: number;
  format: 'webp' | 'jpeg' | 'png';
}

/**
 * File optimization service
 */
export class FileOptimizer {
  private config: ImageOptimizationConfig;
  private sharpAvailable: boolean = false;
  private sharp: any = null;

  constructor(config?: Partial<ImageOptimizationConfig>) {
    this.config = {
      enableSharp: true,
      maxWidth: 1200,
      maxHeight: 1200,
      thumbnailWidth: 150,
      thumbnailHeight: 150,
      quality: 85,
      format: 'webp',
      ...config,
    };

    this.initializeSharp();
  }

  /**
   * Initialize Sharp if available
   */
  private initializeSharp(): void {
    try {
      // Dynamic require to avoid hard dependency
      this.sharp = require('sharp');
      this.sharpAvailable = true;
    } catch (error) {
      console.warn('Sharp not available - image optimization disabled');
      this.sharpAvailable = false;
    }
  }

  /**
   * Optimize an image
   */
  async optimizeImage(buffer: Buffer, filename: string): Promise<OptimizedImage> {
    if (!this.sharpAvailable || !this.config.enableSharp) {
      // Return original if Sharp not available
      return {
        original: buffer,
        thumbnail: buffer,
        optimized: buffer,
        metadata: {
          format: this.getImageFormat(filename),
        },
      };
    }

    try {
      const image = this.sharp(buffer);
      const metadata = await image.metadata();

      // Generate thumbnail (150x150)
      const thumbnail = await this.sharp(buffer)
        .resize(this.config.thumbnailWidth, this.config.thumbnailHeight, {
          fit: 'cover',
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toBuffer();

      // Generate optimized version (1200x1200 max)
      const optimized = await this.sharp(buffer)
        .resize(this.config.maxWidth, this.config.maxHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: this.config.quality })
        .toBuffer();

      return {
        original: buffer,
        thumbnail,
        optimized,
        metadata: {
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          hasAlpha: metadata.hasAlpha,
        },
      };
    } catch (error) {
      console.error('Image optimization failed:', error);
      // Return original on error
      return {
        original: buffer,
        thumbnail: buffer,
        optimized: buffer,
        metadata: {
          format: this.getImageFormat(filename),
        },
      };
    }
  }

  /**
   * Compress a document (PDF, etc)
   */
  async compressDocument(buffer: Buffer, filename: string): Promise<Buffer> {
    // TODO: Implement PDF compression using pdf-lib or pdfjs
    // For now, just return original
    console.debug('Document compression not yet implemented');
    return buffer;
  }

  /**
   * Extract metadata from file
   */
  async extractMetadata(buffer: Buffer, mimeType: string): Promise<Record<string, any>> {
    try {
      if (mimeType.startsWith('image/')) {
        return await this.extractImageMetadata(buffer);
      } else if (mimeType === 'application/pdf') {
        return await this.extractPdfMetadata(buffer);
      }
    } catch (error) {
      console.warn('Failed to extract metadata:', error);
    }

    return {};
  }

  /**
   * Extract image metadata
   */
  private async extractImageMetadata(buffer: Buffer): Promise<Record<string, any>> {
    if (!this.sharpAvailable) {
      return {};
    }

    try {
      const metadata = await this.sharp(buffer).metadata();
      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        colorspace: metadata.space,
        channels: metadata.channels,
        hasAlpha: metadata.hasAlpha,
        isProgressive: metadata.isProgressive,
        pages: metadata.pages,
        density: metadata.density,
        hasProfile: metadata.hasProfile,
        orientation: metadata.orientation,
      };
    } catch (error) {
      console.warn('Failed to extract image metadata:', error);
      return {};
    }
  }

  /**
   * Extract PDF metadata (placeholder)
   */
  private async extractPdfMetadata(buffer: Buffer): Promise<Record<string, any>> {
    // TODO: Implement PDF metadata extraction
    // Could use pdf-parse or pdfjs
    return {
      type: 'pdf',
      size: buffer.length,
    };
  }

  /**
   * Calculate image resize info
   */
  calculateResizeInfo(
    width: number | undefined,
    height: number | undefined
  ): {
    thumbnail: { width: number; height: number };
    optimized: { width: number; height: number };
  } {
    if (!width || !height) {
      return {
        thumbnail: { width: this.config.thumbnailWidth, height: this.config.thumbnailHeight },
        optimized: { width: this.config.maxWidth, height: this.config.maxHeight },
      };
    }

    const aspect = width / height;

    // Calculate thumbnail size
    let thumbWidth = this.config.thumbnailWidth;
    let thumbHeight = this.config.thumbnailHeight;
    if (aspect > 1) {
      thumbHeight = Math.round(thumbWidth / aspect);
    } else {
      thumbWidth = Math.round(thumbHeight * aspect);
    }

    // Calculate optimized size
    let optWidth = this.config.maxWidth;
    let optHeight = this.config.maxHeight;
    if (aspect > 1) {
      optHeight = Math.round(optWidth / aspect);
    } else {
      optWidth = Math.round(optHeight * aspect);
    }

    return {
      thumbnail: { width: thumbWidth, height: thumbHeight },
      optimized: { width: optWidth, height: optHeight },
    };
  }

  /**
   * Get image format from filename
   */
  private getImageFormat(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || 'unknown';
    return ext;
  }

  /**
   * Check if optimization is needed
   */
  needsOptimization(mimeType: string): boolean {
    return mimeType.startsWith('image/') && this.sharpAvailable && this.config.enableSharp;
  }

  /**
   * Get optimization stats
   */
  getStats(original: Buffer, thumbnail: Buffer, optimized: Buffer): {
    originalSize: number;
    thumbnailSize: number;
    optimizedSize: number;
    savings: number;
  } {
    return {
      originalSize: original.length,
      thumbnailSize: thumbnail.length,
      optimizedSize: optimized.length,
      savings: (100 * (original.length - optimized.length)) / original.length,
    };
  }
}

export default FileOptimizer;
