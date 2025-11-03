/**
 * Storage System Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService } from '../index';
import { FileValidator } from '../validation';
import { LocalStorageProvider } from '../providers/local';
import {
  FileMetadata,
  StorageProviderType,
  ValidationResult,
} from '../types';

describe('FileValidator', () => {
  let validator: FileValidator;

  beforeEach(() => {
    validator = new FileValidator();
  });

  describe('MIME type validation', () => {
    it('should allow PDF files', () => {
      const file = new File(['test'], 'document.pdf', { type: 'application/pdf' });
      const result = validator.validate(file);
      expect(result.valid).toBe(true);
    });

    it('should allow image files', () => {
      const file = new File(['test'], 'photo.jpg', { type: 'image/jpeg' });
      const result = validator.validate(file);
      expect(result.valid).toBe(true);
    });

    it('should reject executable files', () => {
      const file = new File(['test'], 'malware.exe', { type: 'application/x-msdownload' });
      const result = validator.validate(file);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject scripts', () => {
      const file = new File(['test'], 'script.js', { type: 'text/javascript' });
      const result = validator.validate(file);
      expect(result.valid).toBe(false);
    });
  });

  describe('File size validation', () => {
    it('should reject empty files', () => {
      const file = new File([], 'empty.txt', { type: 'text/plain' });
      const result = validator.validate(file);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('empty');
    });

    it('should reject oversized images', () => {
      const largeBuffer = new ArrayBuffer(100 * 1024 * 1024);
      const file = new File([largeBuffer], 'huge.jpg', { type: 'image/jpeg' });
      const result = validator.validate(file);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('exceeds maximum size');
    });

    it('should warn about large files', () => {
      const largeBuffer = new ArrayBuffer(20 * 1024 * 1024);
      const file = new File([largeBuffer], 'large.pdf', { type: 'application/pdf' });
      const result = validator.validate(file);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Filename validation', () => {
    it('should reject filenames with illegal characters', () => {
      const file = new File(['test'], 'file<name>.txt', { type: 'text/plain' });
      const result = validator.validate(file);
      expect(result.valid).toBe(false);
    });

    it('should reject path traversal attempts', () => {
      const file = new File(['test'], '../../etc/passwd.txt', { type: 'text/plain' });
      const result = validator.validate(file);
      expect(result.valid).toBe(false);
    });

    it('should reject overly long filenames', () => {
      const longName = 'a'.repeat(300) + '.txt';
      const file = new File(['test'], longName, { type: 'text/plain' });
      const result = validator.validate(file);
      expect(result.valid).toBe(false);
    });
  });

  describe('File categorization', () => {
    it('should categorize documents', () => {
      const category = validator.getFileCategory('application/pdf');
      expect(category).toBe('document');
    });

    it('should categorize images', () => {
      const category = validator.getFileCategory('image/jpeg');
      expect(category).toBe('image');
    });

    it('should identify files needing optimization', () => {
      expect(validator.needsOptimization('image/jpeg')).toBe(true);
      expect(validator.needsOptimization('application/pdf')).toBe(false);
    });

    it('should identify files needing virus scanning', () => {
      expect(validator.needsVirusScan('application/zip')).toBe(true);
      expect(validator.needsVirusScan('image/jpeg')).toBe(false);
    });
  });
});

describe('StorageService', () => {
  let service: StorageService;
  let provider: LocalStorageProvider;

  beforeEach(async () => {
    // Initialize with local provider for testing
    provider = new LocalStorageProvider({
      basePath: './test-storage',
      publicUrl: 'http://localhost:3000/api/v1/files',
    });
    service = new StorageService(provider, 'Local');
  });

  describe('File operations', () => {
    it('should generate valid storage keys', () => {
      const metadata: FileMetadata = {
        filename: 'test-file.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        tenantId: 'tenant-123',
        userId: 'user-456',
        entityType: 'document',
        entityId: 'doc-789',
      };

      // Access private method through any for testing
      const service_any = service as any;
      const key = service_any.generateStorageKey(metadata);

      expect(key).toContain('tenant-123');
      expect(key).toContain('document');
      expect(key).toContain('doc-789');
      expect(key.endsWith('.pdf')).toBe(true);
    });

    it('should list files for entity', async () => {
      const files = await service.listFiles('contact', 'contact-123');
      expect(Array.isArray(files)).toBe(true);
    });

    it('should get storage usage', async () => {
      const usage = await service.getStorageUsage('tenant-123');
      expect(usage).toHaveProperty('totalFiles');
      expect(usage).toHaveProperty('totalSize');
    });
  });

  describe('Error handling', () => {
    it('should handle upload errors gracefully', async () => {
      const invalidFile = new File([], 'empty.txt', { type: 'text/plain' });
      const metadata: FileMetadata = {
        filename: 'empty.txt',
        mimeType: 'text/plain',
        size: 0,
        tenantId: 'tenant-123',
        userId: 'user-456',
        entityType: 'document',
        entityId: 'doc-789',
      };

      // This should throw an error
      await expect(
        service.uploadFile(invalidFile, metadata)
      ).rejects.toThrow();
    });

    it('should provide meaningful error messages', async () => {
      try {
        await service.downloadFile('nonexistent-file-id');
      } catch (error) {
        expect(error instanceof Error).toBe(true);
        expect((error as Error).message).toContain('Download failed');
      }
    });
  });
});

describe('Storage Provider Status', () => {
  let provider: LocalStorageProvider;

  beforeEach(() => {
    provider = new LocalStorageProvider({
      basePath: './test-storage',
      publicUrl: 'http://localhost:3000/api/v1/files',
    });
  });

  it('should report provider status', async () => {
    const status = await provider.getStatus();

    expect(status).toHaveProperty('totalFiles');
    expect(status).toHaveProperty('totalSize');
    expect(status).toHaveProperty('isHealthy');
    expect(typeof status.totalFiles).toBe('number');
    expect(typeof status.totalSize).toBe('number');
    expect(typeof status.isHealthy).toBe('boolean');
  });

  it('should include timestamp', async () => {
    const status = await provider.getStatus();
    expect(status.lastSync).toBeInstanceOf(Date);
  });
});

describe('File ID Generation', () => {
  it('should generate unique file IDs', () => {
    const provider = new LocalStorageProvider({
      basePath: './test-storage',
      publicUrl: 'http://localhost:3000/api/v1/files',
    });

    const provider_any = provider as any;
    const id1 = provider_any.generateFileId();
    const id2 = provider_any.generateFileId();

    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^file_/);
    expect(id2).toMatch(/^file_/);
  });
});
