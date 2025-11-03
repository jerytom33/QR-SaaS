/**
 * Storage System Type Definitions
 * Provides interfaces and types for the file storage abstraction layer
 */

/**
 * Supported storage providers
 */
export type StorageProviderType = 'S3' | 'Local' | 'Azure' | 'GCS';

/**
 * Supported entity types for file associations
 */
export type EntityType = 'contact' | 'lead' | 'company' | 'email' | 'activity' | 'document';

/**
 * Virus scan status
 */
export type VirusScanStatus = 'pending' | 'clean' | 'infected' | 'error';

/**
 * File access permissions
 */
export type FilePermission = 'view' | 'download' | 'delete' | 'share';

/**
 * Core storage provider interface
 */
export interface StorageProvider {
  /**
   * Upload a file to storage
   */
  upload(file: File, metadata: FileMetadata): Promise<StoredFileData>;

  /**
   * Download a file from storage
   */
  download(fileId: string): Promise<Buffer>;

  /**
   * Delete a file from storage
   */
  delete(fileId: string): Promise<void>;

  /**
   * Get a download URL (public or signed)
   */
  getUrl(fileId: string, expiresIn?: number): Promise<string>;

  /**
   * Get storage provider status
   */
  getStatus(): Promise<StorageStats>;
}

/**
 * File metadata required for upload
 */
export interface FileMetadata {
  filename: string;
  mimeType: string;
  size: number;
  tenantId: string;
  userId: string;
  entityType: EntityType;
  entityId: string;
  tags?: string[];
  isPublic?: boolean;
}

/**
 * Stored file data returned after upload
 */
export interface StoredFileData {
  id: string;
  filename: string;
  url: string;
  storageKey: string;
  size: number;
  mimeType: string;
}

/**
 * Complete file record in database
 */
export interface StoredFile {
  id: string;
  tenantId: string;
  userId: string;
  entityType: EntityType;
  entityId: string;
  filename: string;
  mimeType: string;
  size: number;
  storageKey: string;
  storageProvider: StorageProviderType;
  url?: string;
  thumbnail?: string;
  optimized?: string;
  virusScanStatus: VirusScanStatus;
  virusScanDetails?: VirusScanResult;
  isPublic: boolean;
  sharedWith?: FileShare[];
  properties?: Record<string, any>;
  tags?: string[];
  version?: number;
  uploadedAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

/**
 * File sharing information
 */
export interface FileShare {
  userId: string;
  permission: FilePermission;
  sharedDate: Date;
}

/**
 * Storage quota information
 */
export interface StorageQuota {
  tenantId: string;
  quotaBytes: number;
  usedBytes: number;
  warningThreshold: number;
  updatedAt: Date;
}

/**
 * Virus scan result
 */
export interface VirusScanResult {
  status: VirusScanStatus;
  engine: string;
  result: string;
  timestamp: Date;
  detections?: string[];
}

/**
 * Storage provider status statistics
 */
export interface StorageStats {
  totalFiles: number;
  totalSize: number;
  lastSync?: Date;
  isHealthy: boolean;
  errorCount?: number;
}

/**
 * File validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * File validation context
 */
export interface ValidationContext {
  tenantId: string;
  userId?: string;
}

/**
 * Optimized image data
 */
export interface OptimizedImage {
  original: Buffer;
  thumbnail: Buffer;
  optimized: Buffer;
  metadata: {
    width?: number;
    height?: number;
    format?: string;
    hasAlpha?: boolean;
  };
}

/**
 * File upload options
 */
export interface UploadOptions {
  overwrite?: boolean;
  encrypt?: boolean;
  compress?: boolean;
  optimize?: boolean;
  scanForViruses?: boolean;
}

/**
 * File download options
 */
export interface DownloadOptions {
  streaming?: boolean;
  includeMetadata?: boolean;
}

/**
 * Storage provider configuration
 */
export interface StorageConfig {
  provider: StorageProviderType;
  region?: string;
  bucket?: string;
  basePath?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  encryptionKey?: string;
}

/**
 * Pagination options for file listing
 */
export interface PaginationOptions {
  skip?: number;
  take?: number;
  sort?: {
    field: 'name' | 'size' | 'date';
    order: 'asc' | 'desc';
  };
}

/**
 * File filter options
 */
export interface FileFilterOptions {
  entityType?: EntityType;
  entityId?: string;
  mimeType?: string;
  tags?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
}
