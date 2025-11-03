/**
 * Storage Provider Registry
 * Manages initialization and retrieval of storage providers
 */

import { StorageProvider, StorageProviderType, StorageConfig } from '../types';

export class StorageProviderRegistry {
  private providers = new Map<StorageProviderType, StorageProvider>();
  private config: StorageConfig;

  constructor(config: StorageConfig) {
    this.config = config;
  }

  /**
   * Get or initialize a storage provider
   */
  async getProvider(type?: StorageProviderType): Promise<StorageProvider> {
    const providerType = type || this.config.provider;

    // Return cached provider if available
    if (this.providers.has(providerType)) {
      return this.providers.get(providerType)!;
    }

    // Initialize new provider
    let provider: StorageProvider;

    switch (providerType) {
      case 'S3':
        provider = await this.initializeS3Provider();
        break;
      case 'Local':
        provider = await this.initializeLocalProvider();
        break;
      case 'Azure':
        provider = await this.initializeAzureProvider();
        break;
      case 'GCS':
        provider = await this.initializeGCSProvider();
        break;
      default:
        throw new Error(`Unknown storage provider: ${providerType}`);
    }

    // Cache provider
    this.providers.set(providerType, provider);
    return provider;
  }

  /**
   * Initialize S3 provider
   */
  private async initializeS3Provider(): Promise<StorageProvider> {
    // Dynamic import to avoid requiring AWS SDK if not using S3
  const { S3StorageProvider } = await import('./s3');
    return new S3StorageProvider({
      region: this.config.region || 'us-east-1',
      bucket: this.config.bucket || process.env.AWS_S3_BUCKET!,
      accessKeyId: this.config.accessKeyId || process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: this.config.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY!,
    });
  }

  /**
   * Initialize Local provider
   */
  private async initializeLocalProvider(): Promise<StorageProvider> {
  const { LocalStorageProvider } = await import('./local');
    return new LocalStorageProvider({
      basePath: this.config.basePath || process.env.STORAGE_PATH || './storage',
      publicUrl: process.env.STORAGE_URL || 'http://localhost:3000/api/v1/files',
    });
  }

  /**
   * Initialize Azure provider
   */
  private async initializeAzureProvider(): Promise<StorageProvider> {
  const { AzureStorageProvider } = await import('./azure');
    return new AzureStorageProvider({
      accountName: process.env.AZURE_STORAGE_ACCOUNT_NAME!,
      accountKey: process.env.AZURE_STORAGE_ACCOUNT_KEY!,
      container: this.config.bucket || 'files',
    });
  }

  /**
   * Initialize GCS provider
   */
  private async initializeGCSProvider(): Promise<StorageProvider> {
  const { GCSStorageProvider } = await import('./gcs');
    return new GCSStorageProvider({
      projectId: process.env.GCS_PROJECT_ID!,
      bucket: this.config.bucket || process.env.GCS_BUCKET!,
      keyFilename: process.env.GCS_KEY_FILE,
    });
  }

  /**
   * Check all providers' status
   */
  async checkAllProviders(): Promise<Record<StorageProviderType, boolean>> {
    const results: Record<StorageProviderType, boolean> = {
      S3: false,
      Local: false,
      Azure: false,
      GCS: false,
    };

    for (const [type] of this.providers) {
      try {
        const provider = await this.getProvider(type);
        const status = await provider.getStatus();
        results[type] = status.isHealthy;
      } catch (error) {
        results[type] = false;
      }
    }

    return results;
  }
}

/**
 * Create a storage provider registry with default config
 */
export function createStorageRegistry(): StorageProviderRegistry {
  const provider = (process.env.STORAGE_PROVIDER || 'Local') as StorageProviderType;

  const config: StorageConfig = {
    provider,
    region: process.env.AWS_REGION,
    bucket: process.env.AWS_S3_BUCKET,
    basePath: process.env.STORAGE_PATH,
  };

  return new StorageProviderRegistry(config);
}

export default StorageProviderRegistry;
