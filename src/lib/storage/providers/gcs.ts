/**
 * Google Cloud Storage Provider
 * Production implementation for GCS
 */

import { StorageProvider, FileMetadata, StoredFileData, StorageStats } from '../types';

export class GCSStorageProvider implements StorageProvider {
  constructor(config: any) {
    // TODO: Initialize GCS SDK
  }

  async upload(file: File, metadata: FileMetadata): Promise<StoredFileData> {
    throw new Error('Not implemented yet');
  }

  async download(fileId: string): Promise<Buffer> {
    throw new Error('Not implemented yet');
  }

  async delete(fileId: string): Promise<void> {
    throw new Error('Not implemented yet');
  }

  async getUrl(fileId: string, expiresIn?: number): Promise<string> {
    throw new Error('Not implemented yet');
  }

  async getStatus(): Promise<StorageStats> {
    return {
      totalFiles: 0,
      totalSize: 0,
      isHealthy: false,
    };
  }
}

export default GCSStorageProvider;
