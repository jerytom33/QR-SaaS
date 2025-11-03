/**
 * Vercel Blob Storage Integration
 * Replaces filesystem storage for Vercel serverless environment
 */

import { put, del, list, head } from '@vercel/blob';

export interface BlobUploadResult {
  url: string;
  pathname: string;
  contentType: string;
  contentDisposition: string;
}

/**
 * Upload a file to Vercel Blob storage
 */
export async function uploadToBlob(
  filename: string,
  fileBuffer: Buffer,
  options?: {
    contentType?: string;
    access?: 'public';
    addRandomSuffix?: boolean;
  }
): Promise<BlobUploadResult> {
  try {
    const blob = await put(filename, fileBuffer, {
      access: 'public',
      contentType: options?.contentType,
      addRandomSuffix: options?.addRandomSuffix !== false,
    });

    return {
      url: blob.url,
      pathname: blob.pathname,
      contentType: blob.contentType || options?.contentType || 'application/octet-stream',
      contentDisposition: blob.contentDisposition || '',
    };
  } catch (error) {
    console.error('Blob upload error:', error);
    throw new Error('Failed to upload file to cloud storage');
  }
}

/**
 * Delete a file from Vercel Blob storage
 */
export async function deleteFromBlob(url: string): Promise<void> {
  try {
    await del(url);
  } catch (error) {
    console.error('Blob delete error:', error);
    throw new Error('Failed to delete file from cloud storage');
  }
}

/**
 * List files in Vercel Blob storage
 */
export async function listBlobFiles(options?: {
  prefix?: string;
  limit?: number;
  cursor?: string;
}) {
  try {
    const result = await list({
      prefix: options?.prefix,
      limit: options?.limit || 1000,
      cursor: options?.cursor,
    });

    return {
      blobs: result.blobs,
      cursor: result.cursor,
      hasMore: result.hasMore,
    };
  } catch (error) {
    console.error('Blob list error:', error);
    throw new Error('Failed to list files from cloud storage');
  }
}

/**
 * Get file metadata from Vercel Blob storage
 */
export async function getBlobMetadata(url: string) {
  try {
    const metadata = await head(url);
    return {
      url: metadata.url,
      pathname: metadata.pathname,
      contentType: metadata.contentType,
      contentDisposition: metadata.contentDisposition,
      size: metadata.size,
      uploadedAt: metadata.uploadedAt,
    };
  } catch (error) {
    console.error('Blob metadata error:', error);
    throw new Error('Failed to get file metadata from cloud storage');
  }
}

/**
 * Check if Vercel Blob storage is configured
 */
export function isBlobStorageConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/**
 * Fallback for local development (use filesystem)
 */
export function shouldUseBlobStorage(): boolean {
  // Use Blob storage in production or if explicitly configured
  return process.env.NODE_ENV === 'production' || isBlobStorageConfigured();
}
