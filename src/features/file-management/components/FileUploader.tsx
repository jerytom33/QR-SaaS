/**
 * FileUploader Component
 * 
 * Features:
 * - Drag and drop file upload
 * - File validation with error feedback
 * - Upload progress tracking
 * - Multiple file uploads
 * - File type filtering
 * - Size restrictions
 * - Accessibility support
 */

'use client';

import React, { useRef, useState, useCallback } from 'react';
import { Upload, X, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

interface FileUploadEvent {
  files: File[];
  entityType: string;
  entityId: string;
}

interface UploadedFile {
  id: string;
  filename: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  size: number;
  url?: string;
}

interface FileUploaderProps {
  entityType: 'contact' | 'lead' | 'company' | 'email' | 'activity' | 'document';
  entityId: string;
  onUploadStart?: (files: File[]) => void;
  onUploadProgress?: (fileId: string, progress: number) => void;
  onUploadComplete?: (fileId: string, response: any) => void;
  onUploadError?: (fileId: string, error: string) => void;
  acceptedFileTypes?: string[];
  maxFileSize?: number; // in bytes
  maxFiles?: number;
  disabled?: boolean;
}

export function FileUploader({
  entityType,
  entityId,
  onUploadStart,
  onUploadProgress,
  onUploadComplete,
  onUploadError,
  acceptedFileTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'text/csv',
  ],
  maxFileSize = 100 * 1024 * 1024, // 100MB default
  maxFiles = 10,
  disabled = false,
}: FileUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  /**
   * Validate file before upload
   */
  const validateFile = (file: File): string | null => {
    // Check file type
    if (!acceptedFileTypes.includes(file.type)) {
      return `File type ${file.type} is not allowed`;
    }

    // Check file size
    if (file.size > maxFileSize) {
      return `File size ${(file.size / 1024 / 1024).toFixed(2)}MB exceeds maximum of ${(maxFileSize / 1024 / 1024).toFixed(2)}MB`;
    }

    // Check filename length
    if (file.name.length > 255) {
      return 'Filename is too long (max 255 characters)';
    }

    return null;
  };

  /**
   * Handle file selection
   */
  const handleFileSelect = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const fileArray = Array.from(files);
      const validFiles: File[] = [];
      const newUploadedFiles: UploadedFile[] = [];

      // Check max files limit
      if (uploadedFiles.length + fileArray.length > maxFiles) {
        const error = `Too many files. Maximum is ${maxFiles}`;
        alert(error);
        return;
      }

      // Validate each file
      for (const file of fileArray) {
        const validationError = validateFile(file);
        
        if (validationError) {
          const fileId = `${file.name}-${Date.now()}`;
          newUploadedFiles.push({
            id: fileId,
            filename: file.name,
            progress: 0,
            status: 'error',
            error: validationError,
            size: file.size,
          });
          onUploadError?.(fileId, validationError);
        } else {
          validFiles.push(file);
          const fileId = `${file.name}-${Date.now()}`;
          newUploadedFiles.push({
            id: fileId,
            filename: file.name,
            progress: 0,
            status: 'pending',
            size: file.size,
          });
        }
      }

      // Add to uploaded files list
      setUploadedFiles((prev) => [...prev, ...newUploadedFiles]);

      // Upload valid files
      if (validFiles.length > 0) {
        onUploadStart?.(validFiles);
        await uploadFiles(validFiles);
      }
    },
    [uploadedFiles, maxFiles, acceptedFileTypes, maxFileSize, onUploadStart, onUploadError]
  );

  /**
   * Upload files to server
   */
  const uploadFiles = async (files: File[]) => {
    setIsUploading(true);

    for (const file of files) {
      const fileId = `${file.name}-${Date.now()}`;

      try {
        // Update status to uploading
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === fileId ? { ...f, status: 'uploading' } : f
          )
        );

        // Create form data
        const formData = new FormData();
        formData.append('file', file);
        formData.append('entityType', entityType);
        formData.append('entityId', entityId);

        // Upload with progress tracking
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            setUploadedFiles((prev) =>
              prev.map((f) =>
                f.id === fileId ? { ...f, progress } : f
              )
            );
            onUploadProgress?.(fileId, progress);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              setUploadedFiles((prev) =>
                prev.map((f) =>
                  f.id === fileId
                    ? {
                        ...f,
                        status: 'success',
                        progress: 100,
                        url: response.url,
                      }
                    : f
                )
              );
              onUploadComplete?.(fileId, response);
            } catch (e) {
              throw new Error('Failed to parse response');
            }
          } else {
            throw new Error(`Upload failed with status ${xhr.status}`);
          }
        });

        xhr.addEventListener('error', () => {
          const errorMsg = 'Upload failed';
          setUploadedFiles((prev) =>
            prev.map((f) =>
              f.id === fileId ? { ...f, status: 'error', error: errorMsg } : f
            )
          );
          onUploadError?.(fileId, errorMsg);
        });

        xhr.addEventListener('abort', () => {
          const errorMsg = 'Upload cancelled';
          setUploadedFiles((prev) =>
            prev.map((f) =>
              f.id === fileId ? { ...f, status: 'error', error: errorMsg } : f
            )
          );
          onUploadError?.(fileId, errorMsg);
        });

        xhr.open('POST', '/api/v1/files/upload');
        xhr.send(formData);
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : 'Unknown error occurred';
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === fileId ? { ...f, status: 'error', error: errorMsg } : f
          )
        );
        onUploadError?.(fileId, errorMsg);
      }
    }

    setIsUploading(false);
  };

  /**
   * Remove file from list
   */
  const removeFile = (fileId: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  /**
   * Handle drag and drop
   */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (!disabled) {
        handleFileSelect(e.dataTransfer.files);
      }
    },
    [disabled, handleFileSelect]
  );

  return (
    <div className="w-full space-y-4">
      {/* Upload Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 bg-gray-50'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptedFileTypes.join(',')}
          onChange={(e) => handleFileSelect(e.target.files)}
          disabled={disabled || isUploading}
          className="hidden"
          aria-label="File upload"
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isUploading}
          className="mx-auto mb-3 inline-flex items-center justify-center"
          type="button"
        >
          <Upload className="h-12 w-12 text-gray-400" />
        </button>

        <p className="text-lg font-medium text-gray-900">
          Drag files here or click to browse
        </p>
        <p className="mt-2 text-sm text-gray-600">
          Supported formats: PDF, Word, Excel, CSV, Images (JPG, PNG, GIF, WebP)
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Maximum file size: {(maxFileSize / 1024 / 1024).toFixed(0)}MB
        </p>
      </div>

      {/* Uploaded Files List */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-900">
            {uploadedFiles.length} file{uploadedFiles.length !== 1 ? 's' : ''}
          </h3>
          {uploadedFiles.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3"
            >
              {/* Status Icon */}
              <div className="shrink-0">
                {file.status === 'uploading' && (
                  <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                )}
                {file.status === 'success' && (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                )}
                {file.status === 'error' && (
                  <AlertCircle className="h-5 w-5 text-red-500" />
                )}
                {file.status === 'pending' && (
                  <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                )}
              </div>

              {/* File Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {file.filename}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-xs text-gray-500">
                    {(file.size / 1024).toFixed(0)} KB
                  </p>
                  {file.error && (
                    <p className="text-xs text-red-500">{file.error}</p>
                  )}
                  {file.status === 'uploading' && (
                    <p className="text-xs text-blue-600">{file.progress}%</p>
                  )}
                </div>

                {/* Progress Bar */}
                {file.status === 'uploading' && (
                  <div className="mt-2 h-1 w-full rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all"
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Remove Button */}
              <button
                onClick={() => removeFile(file.id)}
                disabled={file.status === 'uploading'}
                className="shrink-0 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                type="button"
                aria-label={`Remove ${file.filename}`}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload Summary */}
      {uploadedFiles.length > 0 && (
        <div className="text-sm text-gray-600">
          <p>
            {uploadedFiles.filter((f) => f.status === 'success').length}/
            {uploadedFiles.length} files uploaded successfully
          </p>
        </div>
      )}
    </div>
  );
}

export default FileUploader;
