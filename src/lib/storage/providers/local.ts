/**
 * Local File System Storage Provider
 * For development and testing
 */

import fs from 'fs/promises';
import path from 'path';
import { createReadStream } from 'fs';
import { Readable } from 'stream';
import {
  StorageProvider,
  FileMetadata,
  StoredFileData,
  StorageStats,
} from '../types';

interface LocalConfig {
  basePath: string;
  publicUrl: string;
}

export class LocalStorageProvider implements StorageProvider {
  private basePath: string;
  private publicUrl: string;

  constructor(config: LocalConfig) {
    this.basePath = config.basePath;
    this.publicUrl = config.publicUrl;
    this.ensureDirectory();
  }

  /**
   * Upload a file to local storage
   */
  async upload(file: File, metadata: FileMetadata): Promise<StoredFileData> {
    try {
      const key = this.generateStorageKey(metadata);
      const filePath = path.join(this.basePath, key);

      // Ensure directory exists
      await fs.mkdir(path.dirname(filePath), { recursive: true });

      // Write file
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(filePath, buffer);

      // Write metadata as companion JSON file
      const metaPath = `${filePath}.meta.json`;
      await fs.writeFile(
        metaPath,
        JSON.stringify({
          ...metadata,
          uploadedAt: new Date().toISOString(),
        }, null, 2)
      );

      // Generate file ID and URL
      const fileId = this.generateFileId();
      const url = `${this.publicUrl}/download/${key}`;

      return {
        id: fileId,
        filename: metadata.filename,
        storageKey: key,
        url,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
      };
    } catch (error) {
      console.error('Local upload failed:', error);
      throw new Error(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Download a file from local storage
   */
  async download(fileId: string): Promise<Buffer> {
    try {
      // TODO: Get file record from database to get storage key
      const storageKey = await this.getStorageKeyFromFileId(fileId);
      const filePath = path.join(this.basePath, storageKey);

      // Check if file exists
      await fs.access(filePath);

      // Read file into buffer
      return await fs.readFile(filePath);
    } catch (error) {
      console.error('Local download failed:', error);
      throw new Error(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a file from local storage
   */
  async delete(fileId: string): Promise<void> {
    try {
      // TODO: Get file record from database to get storage key
      const storageKey = await this.getStorageKeyFromFileId(fileId);
      const filePath = path.join(this.basePath, storageKey);

      // Delete file
      await fs.unlink(filePath);

      // Delete metadata file
      const metaPath = `${filePath}.meta.json`;
      await fs.unlink(metaPath).catch(() => {
        // Ignore if meta file doesn't exist
      });
    } catch (error) {
      console.error('Local delete failed:', error);
      throw new Error(`Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get a download URL
   */
  async getUrl(fileId: string, expiresIn?: number): Promise<string> {
    try {
      const storageKey = await this.getStorageKeyFromFileId(fileId);
      // Local files don't expire, so we ignore expiresIn
      return `${this.publicUrl}/download/${storageKey}`;
    } catch (error) {
      console.error('Failed to get URL:', error);
      throw new Error(`URL generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get storage provider status
   */
  async getStatus(): Promise<StorageStats> {
    try {
      // Check if storage directory exists
      await fs.access(this.basePath);

      // Count files and calculate total size
      let totalFiles = 0;
      let totalSize = 0;

      const walkDir = async (dirPath: string): Promise<void> => {
        const files = await fs.readdir(dirPath);

        for (const file of files) {
          const filePath = path.join(dirPath, file);
          const stat = await fs.stat(filePath);

          if (stat.isDirectory()) {
            await walkDir(filePath);
          } else if (!file.endsWith('.meta.json')) {
            totalFiles++;
            totalSize += stat.size;
          }
        }
      };

      await walkDir(this.basePath);

      return {
        totalFiles,
        totalSize,
        isHealthy: true,
        lastSync: new Date(),
      };
    } catch (error) {
      console.error('Failed to get storage status:', error);
      return {
        totalFiles: 0,
        totalSize: 0,
        isHealthy: false,
        errorCount: 1,
        lastSync: new Date(),
      };
    }
  }

  /**
   * Generate a storage key for local storage
   */
  private generateStorageKey(metadata: FileMetadata): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const ext = this.getFileExtension(metadata.filename);
    const sanitized = this.sanitizeFilename(metadata.filename);

    return `${metadata.tenantId}/${metadata.entityType}/${metadata.entityId}/${timestamp}-${random}-${sanitized}.${ext}`;
  }

  /**
   * Generate a unique file ID
   */
  private generateFileId(): string {
    return 'file_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  }

  /**
   * Get file extension
   */
  private getFileExtension(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'bin';
  }

  /**
   * Sanitize filename for storage
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .toLowerCase()
      .replace(/[^a-z0-9-_.]/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 100);
  }

  /**
   * Ensure storage directory exists
   */
  private async ensureDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.basePath, { recursive: true });
    } catch (error) {
      console.error('Failed to create storage directory:', error);
    }
  }

  /**
   * Get storage key from file ID (placeholder)
   */
  private async getStorageKeyFromFileId(fileId: string): Promise<string> {
    // TODO: Look up file record from database
    throw new Error('File lookup not implemented');
  }
}

export default LocalStorageProvider;
