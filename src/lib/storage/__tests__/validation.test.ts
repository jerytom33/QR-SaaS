/**
 * File Validator Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { FileValidator } from '../validation';

describe('FileValidator - Comprehensive Tests', () => {
  const validator = new FileValidator();

  describe('Document Validation', () => {
    it('should accept PDF documents', () => {
      const file = new File(['%PDF-1.4'], 'report.pdf', { type: 'application/pdf' });
      const result = validator.validate(file);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should accept Word documents', () => {
      const file = new File(['docx content'], 'document.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const result = validator.validate(file);
      expect(result.valid).toBe(true);
    });

    it('should accept Excel spreadsheets', () => {
      const file = new File(['xlsx content'], 'data.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const result = validator.validate(file);
      expect(result.valid).toBe(true);
    });

    it('should accept plain text files', () => {
      const file = new File(['plain text'], 'notes.txt', { type: 'text/plain' });
      const result = validator.validate(file);
      expect(result.valid).toBe(true);
    });

    it('should accept CSV files', () => {
      const file = new File(['col1,col2,col3'], 'data.csv', { type: 'text/csv' });
      const result = validator.validate(file);
      expect(result.valid).toBe(true);
    });
  });

  describe('Image Validation', () => {
    it('should accept JPEG images', () => {
      const file = new File(['jpeg data'], 'photo.jpg', { type: 'image/jpeg' });
      const result = validator.validate(file);
      expect(result.valid).toBe(true);
    });

    it('should accept PNG images', () => {
      const file = new File(['png data'], 'image.png', { type: 'image/png' });
      const result = validator.validate(file);
      expect(result.valid).toBe(true);
    });

    it('should accept GIF images', () => {
      const file = new File(['gif data'], 'animation.gif', { type: 'image/gif' });
      const result = validator.validate(file);
      expect(result.valid).toBe(true);
    });

    it('should accept WebP images', () => {
      const file = new File(['webp data'], 'optimized.webp', { type: 'image/webp' });
      const result = validator.validate(file);
      expect(result.valid).toBe(true);
    });

    it('should accept SVG images', () => {
      const file = new File(['<svg></svg>'], 'vector.svg', { type: 'image/svg+xml' });
      const result = validator.validate(file);
      expect(result.valid).toBe(true);
    });
  });

  describe('Media Validation', () => {
    it('should accept MP4 videos', () => {
      const file = new File(['mp4 data'], 'video.mp4', { type: 'video/mp4' });
      const result = validator.validate(file);
      expect(result.valid).toBe(true);
    });

    it('should accept MP3 audio', () => {
      const file = new File(['mp3 data'], 'song.mp3', { type: 'audio/mpeg' });
      const result = validator.validate(file);
      expect(result.valid).toBe(true);
    });

    it('should accept WAV audio', () => {
      const file = new File(['wav data'], 'sound.wav', { type: 'audio/wav' });
      const result = validator.validate(file);
      expect(result.valid).toBe(true);
    });
  });

  describe('Rejection Cases', () => {
    it('should reject executable files', () => {
      const file = new File(['executable'], 'malware.exe', {
        type: 'application/x-msdownload',
      });
      const result = validator.validate(file);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('not allowed'))).toBe(true);
    });

    it('should reject batch files', () => {
      const file = new File(['batch'], 'script.bat', { type: 'text/x-batch' });
      const result = validator.validate(file);
      expect(result.valid).toBe(false);
    });

    it('should reject shell scripts', () => {
      const file = new File(['bash script'], 'script.sh', { type: 'text/x-shellscript' });
      const result = validator.validate(file);
      expect(result.valid).toBe(false);
    });

    it('should reject PowerShell scripts', () => {
      const file = new File(['ps1 script'], 'script.ps1', { type: 'text/x-powershell' });
      const result = validator.validate(file);
      expect(result.valid).toBe(false);
    });

    it('should reject archive files with blocked extensions', () => {
      const file = new File(['archive'], 'archive.zip', { type: 'application/x-zip-compressed' });
      const result = validator.validate(file);
      expect(result.valid).toBe(false);
    });

    it('should reject JAR files', () => {
      const file = new File(['jar content'], 'malicious.jar', { type: 'application/java-archive' });
      const result = validator.validate(file);
      expect(result.valid).toBe(false);
    });
  });

  describe('Size Validation', () => {
    it('should reject empty files', () => {
      const file = new File([], 'empty.txt', { type: 'text/plain' });
      const result = validator.validate(file);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('empty'))).toBe(true);
    });

    it('should accept reasonable document sizes', () => {
      const buffer = new ArrayBuffer(5 * 1024 * 1024); // 5 MB
      const file = new File([buffer], 'doc.pdf', { type: 'application/pdf' });
      const result = validator.validate(file);
      expect(result.valid).toBe(true);
    });

    it('should accept reasonable image sizes', () => {
      const buffer = new ArrayBuffer(10 * 1024 * 1024); // 10 MB
      const file = new File([buffer], 'photo.jpg', { type: 'image/jpeg' });
      const result = validator.validate(file);
      expect(result.valid).toBe(true);
    });

    it('should reject oversized images', () => {
      const buffer = new ArrayBuffer(100 * 1024 * 1024); // 100 MB
      const file = new File([buffer], 'huge.jpg', { type: 'image/jpeg' });
      const result = validator.validate(file);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('exceeds'))).toBe(true);
    });

    it('should reject oversized documents', () => {
      const buffer = new ArrayBuffer(200 * 1024 * 1024); // 200 MB
      const file = new File([buffer], 'huge.pdf', { type: 'application/pdf' });
      const result = validator.validate(file);
      expect(result.valid).toBe(false);
    });
  });

  describe('Filename Security', () => {
    it('should reject filenames with angle brackets', () => {
      const file = new File(['content'], 'file<name>.txt', { type: 'text/plain' });
      const result = validator.validate(file);
      expect(result.valid).toBe(false);
    });

    it('should reject filenames with path traversal', () => {
      const file = new File(['content'], '../../../etc/passwd', { type: 'text/plain' });
      const result = validator.validate(file);
      expect(result.valid).toBe(false);
    });

    it('should reject filenames with backslashes', () => {
      const file = new File(['content'], 'folder\\..\\file.txt', { type: 'text/plain' });
      const result = validator.validate(file);
      expect(result.valid).toBe(false);
    });

    it('should reject filenames with null bytes', () => {
      const file = new File(['content'], 'file\x00.txt', { type: 'text/plain' });
      const result = validator.validate(file);
      expect(result.valid).toBe(false);
    });

    it('should reject excessively long filenames', () => {
      const longName = 'a'.repeat(300) + '.txt';
      const file = new File(['content'], longName, { type: 'text/plain' });
      const result = validator.validate(file);
      expect(result.valid).toBe(false);
    });

    it('should allow normal filenames with hyphens and underscores', () => {
      const file = new File(['content'], 'file-name_v2.txt', { type: 'text/plain' });
      const result = validator.validate(file);
      expect(result.valid).toBe(true);
    });
  });

  describe('Warnings', () => {
    it('should warn about large files', () => {
      const buffer = new ArrayBuffer(20 * 1024 * 1024); // 20 MB
      const file = new File([buffer], 'large.pdf', { type: 'application/pdf' });
      const result = validator.validate(file);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Large file');
    });

    it('should warn about unknown MIME types', () => {
      const file = new File(['content'], 'file.unknown', { type: '' });
      const result = validator.validate(file);
      expect(result.warnings.some(w => w.includes('type could not be determined'))).toBe(true);
    });
  });

  describe('File Categorization', () => {
    it('should categorize PDF as document', () => {
      expect(validator.getFileCategory('application/pdf')).toBe('document');
    });

    it('should categorize JPEG as image', () => {
      expect(validator.getFileCategory('image/jpeg')).toBe('image');
    });

    it('should categorize MP4 as media', () => {
      expect(validator.getFileCategory('video/mp4')).toBe('media');
    });

    it('should categorize unknown types correctly', () => {
      const category = validator.getFileCategory('text/x-unknown');
      expect(typeof category).toBe('string');
    });
  });

  describe('Optimization and Scanning Detection', () => {
    it('should identify images for optimization', () => {
      expect(validator.needsOptimization('image/jpeg')).toBe(true);
      expect(validator.needsOptimization('image/png')).toBe(true);
    });

    it('should not mark non-images for optimization', () => {
      expect(validator.needsOptimization('application/pdf')).toBe(false);
      expect(validator.needsOptimization('text/plain')).toBe(false);
    });

    it('should identify documents for virus scanning', () => {
      expect(validator.needsVirusScan('application/pdf')).toBe(true);
      expect(validator.needsVirusScan('application/zip')).toBe(true);
    });

    it('should not require scanning for images', () => {
      expect(validator.needsVirusScan('image/jpeg')).toBe(false);
    });
  });
});
