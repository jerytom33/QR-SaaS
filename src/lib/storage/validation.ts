/**
 * File Validation System
 * Validates file types, sizes, and other security constraints
 */

import { ValidationResult, ValidationContext, FileMetadata } from './types';

export class FileValidator {
  // Allowed MIME types by category
  private allowedMimeTypes = new Map<string, Set<string>>([
    ['document', new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.macro-enabled.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv',
    ])],
    ['image', new Set([
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'image/x-icon',
      'image/tiff',
    ])],
    ['media', new Set([
      'video/mp4',
      'video/mpeg',
      'video/quicktime',
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'audio/webm',
    ])],
    ['archive', new Set([
      'application/x-zip-compressed',
      'application/x-rar-compressed',
      'application/x-7z-compressed',
      'application/x-tar',
      'application/gzip',
    ])],
  ]);

  // File extensions that are always blocked
  private blockedExtensions = new Set([
    'exe', 'bat', 'cmd', 'com', 'pif', 'scr', 'vbs',
    'js', 'jar', 'zip', 'rar', '7z', 'iso', 'dmg', 'app',
    'apk', 'msi', 'dll', 'so', 'dylib', 'sh', 'bash', 'ps1',
    'py', 'rb', 'php', 'asp', 'aspx', 'jsp', 'jspx',
  ]);

  // Maximum file sizes by category (in bytes)
  private maxSizes = {
    document: 100 * 1024 * 1024,      // 100 MB
    image: 50 * 1024 * 1024,          // 50 MB
    video: 500 * 1024 * 1024,         // 500 MB
    media: 100 * 1024 * 1024,         // 100 MB
    archive: 200 * 1024 * 1024,       // 200 MB
    default: 50 * 1024 * 1024,        // 50 MB
  };

  // Magic numbers (file signatures) for verification
  private magicNumbers = new Map<string, Buffer>([
    ['pdf', Buffer.from([0x25, 0x50, 0x44, 0x46])],
    ['jpeg', Buffer.from([0xFF, 0xD8, 0xFF])],
    ['png', Buffer.from([0x89, 0x50, 0x4E, 0x47])],
    ['gif', Buffer.from([0x47, 0x49, 0x46])],
    ['zip', Buffer.from([0x50, 0x4B, 0x03, 0x04])],
  ]);

  /**
   * Validate a file
   */
  validate(file: File, context?: ValidationContext): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check file size
    if (file.size === 0) {
      errors.push('File is empty');
    }

    if (file.size > this.getMaxSize(file.type)) {
      errors.push(
        `File exceeds maximum size of ${this.formatBytes(this.getMaxSize(file.type))}`
      );
    }

    // Check MIME type
    if (!this.isAllowedMimeType(file.type)) {
      errors.push(`File type ${file.type || 'unknown'} is not allowed`);
    }

    // Check file extension
    const ext = this.getExtension(file.name).toLowerCase();
    if (this.blockedExtensions.has(ext)) {
      errors.push(`File extension .${ext} is not allowed (security risk)`);
    }

    // Validate filename
    if (!this.isValidFilename(file.name)) {
      errors.push('Invalid filename - contains illegal characters');
    }

    // Check quota if context provided
    if (context?.tenantId) {
      const quotaError = this.checkQuota(context.tenantId, file.size);
      if (quotaError) {
        errors.push(quotaError);
      }
    }

    // Generate warnings
    if (file.size > 10 * 1024 * 1024) {
      warnings.push(`Large file (${this.formatBytes(file.size)}) - upload may take time`);
    }

    if (file.type === '' || file.type === 'application/octet-stream') {
      warnings.push('File type could not be determined - verify before using');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate file with magic number checking
   */
  async validateWithMagicNumbers(file: File): Promise<ValidationResult> {
    const basicValidation = this.validate(file);

    if (!basicValidation.valid) {
      return basicValidation;
    }

    try {
      // Read first 512 bytes for magic number check
      const buffer = await file.slice(0, 512).arrayBuffer();
      const header = Buffer.from(buffer);

      // Verify magic number matches claimed MIME type
      const ext = this.getExtension(file.name).toLowerCase();
      const expectedMagic = this.magicNumbers.get(ext);

      if (expectedMagic && !header.includes(expectedMagic)) {
        return {
          valid: false,
          errors: ['File contents do not match file extension (possible tampering)'],
          warnings: [],
        };
      }
    } catch (error) {
      // If we can't read the file, continue with basic validation
      console.warn('Could not perform magic number validation:', error);
    }

    return basicValidation;
  }

  /**
   * Check if MIME type is allowed
   */
  private isAllowedMimeType(mimeType: string): boolean {
    if (!mimeType) {
      return false;
    }

    // Check each category
    for (const allowedTypes of this.allowedMimeTypes.values()) {
      if (allowedTypes.has(mimeType)) {
        return true;
      }
    }

    // Check for wildcard patterns
    if (mimeType.startsWith('text/')) {
      return true;
    }

    return false;
  }

  /**
   * Get maximum file size for MIME type
   */
  private getMaxSize(mimeType: string): number {
    if (mimeType.startsWith('image/')) {
      return this.maxSizes.image;
    }
    if (mimeType.startsWith('video/')) {
      return this.maxSizes.video;
    }
    if (mimeType.startsWith('audio/')) {
      return this.maxSizes.media;
    }
    if (mimeType.includes('application') && mimeType.includes('zip')) {
      return this.maxSizes.archive;
    }
    if (mimeType.includes('application')) {
      return this.maxSizes.document;
    }
    return this.maxSizes.default;
  }

  /**
   * Get file extension
   */
  private getExtension(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? parts[parts.length - 1] : '';
  }

  /**
   * Check if filename is valid
   */
  private isValidFilename(filename: string): boolean {
    // Check for illegal characters
    const illegalChars = /[<>:"|?*\x00-\x1f]/g;
    if (illegalChars.test(filename)) {
      return false;
    }

    // Check length
    if (filename.length > 255) {
      return false;
    }

    // Check for path traversal attempts
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return false;
    }

    return true;
  }

  /**
   * Check storage quota (stub - implement with actual quota system)
   */
  private checkQuota(tenantId: string, fileSize: number): string | null {
    // TODO: Implement actual quota checking
    // For now, just allow all files
    return null;
  }

  /**
   * Format bytes to human-readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Get file category from MIME type
   */
  getFileCategory(mimeType: string): string {
    for (const [category, types] of this.allowedMimeTypes) {
      if (types.has(mimeType)) {
        return category;
      }
    }
    if (mimeType.startsWith('text/')) return 'text';
    return 'other';
  }

  /**
   * Check if file type needs optimization
   */
  needsOptimization(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  /**
   * Check if file type needs virus scanning
   */
  needsVirusScan(mimeType: string): boolean {
    // Scan documents, archives, and executables
    return (
      mimeType.includes('application') ||
      mimeType.includes('archive') ||
      mimeType === 'text/x-shellscript'
    );
  }
}

export default new FileValidator();
