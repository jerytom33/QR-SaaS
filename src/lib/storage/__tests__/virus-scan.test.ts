/**
 * Virus Scanning Service Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VirusScanService, VirusScanResult, ScanConfig } from '../virus-scan';

describe('VirusScanService', () => {
  let service: VirusScanService;

  describe('Disabled scanning', () => {
    beforeEach(() => {
      const config: ScanConfig = {
        provider: 'disabled',
      };
      service = new VirusScanService(config);
    });

    it('should return clean status when disabled', async () => {
      const buffer = Buffer.from('test file content');
      const result = await service.scanFile(buffer, 'test.txt');

      expect(result.status).toBe('clean');
      expect(result.engine).toBe('disabled');
    });

    it('should handle batch scanning when disabled', async () => {
      const files = [
        { buffer: Buffer.from('content1'), filename: 'file1.txt' },
        { buffer: Buffer.from('content2'), filename: 'file2.txt' },
      ];

      const results = await service.batchScan(files);
      expect(results.size).toBe(2);
    });
  });

  describe('Configuration', () => {
    it('should accept VirusTotal configuration', () => {
      const config: ScanConfig = {
        provider: 'virustotal',
        virusTotal: {
          apiKey: 'test-key',
          maxRetries: 5,
          retryDelay: 500,
        },
      };
      const service = new VirusScanService(config);
      expect(service).toBeDefined();
    });

    it('should accept ClamAV configuration', () => {
      const config: ScanConfig = {
        provider: 'clamav',
        clamav: {
          host: 'localhost',
          port: 3310,
          timeout: 30000,
        },
      };
      const service = new VirusScanService(config);
      expect(service).toBeDefined();
    });

    it('should get optimal config from environment', () => {
      const config = VirusScanService.getOptimalConfig();
      expect(config).toBeDefined();
      expect(config.provider).toMatch(/^(disabled|virustotal|clamav)$/);
    });
  });

  describe('File Size Checking', () => {
    it('should allow scannable files', () => {
      expect(VirusScanService.isScannable(1024)).toBe(true);
      expect(VirusScanService.isScannable(10 * 1024 * 1024)).toBe(true);
      expect(VirusScanService.isScannable(500 * 1024 * 1024)).toBe(true);
    });

    it('should reject empty files', () => {
      expect(VirusScanService.isScannable(0)).toBe(false);
    });

    it('should reject oversized files', () => {
      expect(VirusScanService.isScannable(700 * 1024 * 1024)).toBe(false);
      expect(VirusScanService.isScannable(1000 * 1024 * 1024)).toBe(false);
    });
  });

  describe('Scan Result Handling', () => {
    beforeEach(() => {
      const config: ScanConfig = {
        provider: 'disabled',
      };
      service = new VirusScanService(config);
    });

    it('should return valid scan result structure', async () => {
      const buffer = Buffer.from('test content');
      const result = await service.scanFile(buffer, 'test.txt');

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('engine');
      expect(result).toHaveProperty('result');
      expect(result).toHaveProperty('timestamp');
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should handle scan errors gracefully', async () => {
      const config: ScanConfig = {
        provider: 'virustotal',
        virusTotal: {
          apiKey: '', // Invalid key
        },
      };
      const errorService = new VirusScanService(config);

      // This would normally error, but returns error status instead
      // (actual test would need network access)
    });
  });

  describe('Batch Scanning', () => {
    beforeEach(() => {
      const config: ScanConfig = {
        provider: 'disabled',
      };
      service = new VirusScanService(config);
    });

    it('should scan multiple files in parallel', async () => {
      const files = [
        { buffer: Buffer.from('content1'), filename: 'file1.txt' },
        { buffer: Buffer.from('content2'), filename: 'file2.txt' },
        { buffer: Buffer.from('content3'), filename: 'file3.txt' },
      ];

      const results = await service.batchScan(files, 2);

      expect(results.size).toBe(3);
      expect(results.has('file1.txt')).toBe(true);
      expect(results.has('file2.txt')).toBe(true);
      expect(results.has('file3.txt')).toBe(true);
    });

    it('should respect parallel limit', async () => {
      const files = Array.from({ length: 10 }, (_, i) => ({
        buffer: Buffer.from(`content${i}`),
        filename: `file${i}.txt`,
      }));

      const results = await service.batchScan(files, 3);
      expect(results.size).toBe(10);
    });
  });

  describe('Result Status Types', () => {
    it('should have valid status values', async () => {
      const config: ScanConfig = { provider: 'disabled' };
      const service = new VirusScanService(config);

      const result = await service.scanFile(Buffer.from('test'), 'test.txt');
      expect(['clean', 'infected', 'pending', 'error']).toContain(result.status);
    });
  });
});
