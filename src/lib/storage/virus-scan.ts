/**
 * Virus Scanning Service
 * Integrates with VirusTotal API or ClamAV for file security scanning
 */

import axios, { AxiosError } from 'axios';
import FormData from 'form-data';

/**
 * Scan result from virus scanning
 */
export interface VirusScanResult {
  status: 'clean' | 'infected' | 'pending' | 'error';
  engine: string;
  result: string;
  timestamp: Date;
  detections?: string[];
  scanId?: string;
}

/**
 * Virus scanning configuration
 */
export interface ScanConfig {
  provider: 'virustotal' | 'clamav' | 'disabled';
  virusTotal?: {
    apiKey: string;
    maxRetries?: number;
    retryDelay?: number;
  };
  clamav?: {
    host: string;
    port: number;
    timeout?: number;
  };
}

/**
 * Virus Scanner Service
 */
export class VirusScanService {
  private provider: 'virustotal' | 'clamav' | 'disabled';
  private virusTotalKey?: string;
  private clamavHost?: string;
  private clamavPort?: number;
  private maxRetries: number = 3;
  private retryDelay: number = 1000;

  constructor(config: ScanConfig) {
    this.provider = config.provider;

    if (config.provider === 'virustotal' && config.virusTotal) {
      this.virusTotalKey = config.virusTotal.apiKey;
      this.maxRetries = config.virusTotal.maxRetries || 3;
      this.retryDelay = config.virusTotal.retryDelay || 1000;
    }

    if (config.provider === 'clamav' && config.clamav) {
      this.clamavHost = config.clamav.host;
      this.clamavPort = config.clamav.port;
    }
  }

  /**
   * Scan a file
   */
  async scanFile(fileBuffer: Buffer, filename: string): Promise<VirusScanResult> {
    if (this.provider === 'disabled') {
      return {
        status: 'clean',
        engine: 'disabled',
        result: 'Virus scanning disabled',
        timestamp: new Date(),
      };
    }

    try {
      if (this.provider === 'virustotal') {
        return await this.scanWithVirusTotal(fileBuffer, filename);
      } else if (this.provider === 'clamav') {
        return await this.scanWithClamAV(fileBuffer, filename);
      }
    } catch (error) {
      console.error('Virus scan failed:', error);
      return {
        status: 'error',
        engine: this.provider,
        result: `Scanning failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      };
    }

    return {
      status: 'error',
      engine: 'unknown',
      result: 'Unknown scanning engine',
      timestamp: new Date(),
    };
  }

  /**
   * Scan with VirusTotal
   */
  private async scanWithVirusTotal(fileBuffer: Buffer, filename: string): Promise<VirusScanResult> {
    if (!this.virusTotalKey) {
      throw new Error('VirusTotal API key not configured');
    }

    // Upload file to VirusTotal
    const fileId = await this.uploadToVirusTotal(fileBuffer, filename);

    // Poll for scan results with retries
    return await this.pollVirusTotalResults(fileId);
  }

  /**
   * Upload file to VirusTotal
   */
  private async uploadToVirusTotal(fileBuffer: Buffer, filename: string): Promise<string> {
    const formData = new FormData();
    formData.append('file', fileBuffer, filename);

    try {
      const response = await axios.post('https://www.virustotal.com/api/v3/files', formData, {
        headers: {
          ...formData.getHeaders(),
          'x-apikey': this.virusTotalKey!,
        },
        timeout: 30000,
      });

      return response.data.data.id;
    } catch (error) {
      const axiosError = error as AxiosError;
      throw new Error(`VirusTotal upload failed: ${axiosError.message}`);
    }
  }

  /**
   * Poll VirusTotal for analysis results
   */
  private async pollVirusTotalResults(fileId: string): Promise<VirusScanResult> {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await axios.get(
          `https://www.virustotal.com/api/v3/analyses/${fileId}`,
          {
            headers: {
              'x-apikey': this.virusTotalKey!,
            },
            timeout: 10000,
          }
        );

        const analysis = response.data.data;

        if (analysis.type !== 'analysis') {
          throw new Error('Invalid analysis response');
        }

        // Wait for analysis to complete if still queued
        if (analysis.attributes.status === 'queued') {
          if (attempt < this.maxRetries - 1) {
            await this.delay(this.retryDelay * Math.pow(2, attempt)); // Exponential backoff
            continue;
          } else {
            return {
              status: 'pending',
              engine: 'VirusTotal',
              result: 'Analysis timed out',
              timestamp: new Date(),
              scanId: fileId,
            };
          }
        }

        // Parse results
        const results = analysis.attributes.results;
        const detections: string[] = [];

        for (const [engine, result] of Object.entries(results)) {
          const engineResult = result as any;
          if (engineResult.detected) {
            detections.push(`${engine}: ${engineResult.category}`);
          }
        }

        const status = detections.length > 0 ? 'infected' : 'clean';

        return {
          status,
          engine: 'VirusTotal',
          result: detections.length > 0
            ? `Threats detected: ${detections.slice(0, 3).join('; ')}`
            : 'No threats detected',
          timestamp: new Date(),
          detections: detections.slice(0, 10),
          scanId: fileId,
        };
      } catch (error) {
        if (attempt === this.maxRetries - 1) {
          throw error;
        }
        await this.delay(this.retryDelay * Math.pow(2, attempt));
      }
    }

    throw new Error('VirusTotal scanning failed after retries');
  }

  /**
   * Scan with ClamAV (placeholder)
   */
  private async scanWithClamAV(fileBuffer: Buffer, filename: string): Promise<VirusScanResult> {
    // TODO: Implement ClamAV integration
    // This requires the 'clamscan' npm package
    // For now, return a placeholder result
    return {
      status: 'clean',
      engine: 'ClamAV',
      result: 'ClamAV integration not yet implemented',
      timestamp: new Date(),
    };
  }

  /**
   * Delay helper for retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Batch scan multiple files
   */
  async batchScan(
    files: Array<{ buffer: Buffer; filename: string }>,
    parallel: number = 3
  ): Promise<Map<string, VirusScanResult>> {
    const results = new Map<string, VirusScanResult>();

    // Process files in parallel batches
    for (let i = 0; i < files.length; i += parallel) {
      const batch = files.slice(i, i + parallel);
      const batchResults = await Promise.all(
        batch.map(f => this.scanFile(f.buffer, f.filename))
      );

      batch.forEach((file, index) => {
        results.set(file.filename, batchResults[index]);
      });
    }

    return results;
  }

  /**
   * Check if file size is suitable for scanning
   */
  static isScannable(fileSize: number): boolean {
    // VirusTotal has a 650MB limit
    // ClamAV typically has configurable limits
    const maxSize = 650 * 1024 * 1024; // 650 MB
    return fileSize > 0 && fileSize <= maxSize;
  }

  /**
   * Get optimal scan configuration based on environment
   */
  static getOptimalConfig(): ScanConfig {
    const provider = (process.env.VIRUS_SCAN_PROVIDER || 'disabled') as 'virustotal' | 'clamav' | 'disabled';

    if (provider === 'virustotal') {
      return {
        provider: 'virustotal',
        virusTotal: {
          apiKey: process.env.VIRUSTOTAL_API_KEY || '',
          maxRetries: 3,
          retryDelay: 1000,
        },
      };
    }

    if (provider === 'clamav') {
      return {
        provider: 'clamav',
        clamav: {
          host: process.env.CLAMAV_HOST || 'localhost',
          port: parseInt(process.env.CLAMAV_PORT || '3310'),
          timeout: 30000,
        },
      };
    }

    return {
      provider: 'disabled',
    };
  }
}

export default VirusScanService;
