/**
 * FilePreview Component
 * 
 * Features:
 * - Image preview with thumbnail
 * - Document preview (PDF, Word, etc)
 * - Video/audio preview
 * - Metadata display
 * - Download button
 * - Share button
 * - Full-screen preview
 */

'use client';

import React, { useState } from 'react';
import {
  X,
  Download,
  Share2,
  Maximize2,
  Music,
  FileText,
  File,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FilePreviewProps {
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  url?: string;
  thumbnailPath?: string;
  imageMetadata?: {
    width: number;
    height: number;
    format: string;
  };
  onClose?: () => void;
  onDownload?: () => void;
  onShare?: () => void;
}

export function FilePreview({
  fileId,
  filename,
  mimeType,
  size,
  createdAt,
  url,
  thumbnailPath,
  imageMetadata,
  onClose,
  onDownload,
  onShare,
}: FilePreviewProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isImage = mimeType.startsWith('image/');
  const isPDF = mimeType === 'application/pdf';
  const isAudio = mimeType.startsWith('audio/');
  const isVideo = mimeType.startsWith('video/');
  const isText = mimeType.startsWith('text/');

  const getFileIcon = () => {
    if (isImage) return null;
    if (isAudio) return <Music className="h-12 w-12 text-blue-500" />;
    if (isVideo) return <FileText className="h-12 w-12 text-purple-500" />;
    if (isText) return <FileText className="h-12 w-12 text-orange-500" />;
    return <File className="h-12 w-12 text-gray-500" />;
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4 ${
        isFullScreen ? 'p-0' : ''
      }`}
    >
      <div
        className={`bg-white rounded-lg shadow-xl flex flex-col max-w-4xl w-full ${
          isFullScreen ? 'inset-0 fixed rounded-none' : 'max-h-[90vh]'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 p-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              {filename}
            </h2>
            <p className="text-sm text-gray-500">
              {formatFileSize(size)} • {formatDate(createdAt)}
            </p>
          </div>

          <div className="flex items-center gap-2 ml-4 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDownload?.()}
              title="Download file"
            >
              <Download className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onShare?.()}
              title="Share file"
            >
              <Share2 className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsFullScreen(!isFullScreen)}
              title={isFullScreen ? 'Exit full-screen' : 'Full-screen'}
            >
              <Maximize2 className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onClose?.()}
              title="Close"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Preview Content */}
        <div
          className={`flex-1 overflow-auto flex items-center justify-center ${
            isFullScreen ? 'p-0' : 'p-6'
          }`}
        >
          {isLoading && (
            <div className="text-center">
              <div className="h-12 w-12 rounded-full border-4 border-gray-200 border-t-blue-500 animate-spin mx-auto" />
              <p className="mt-3 text-gray-600">Loading preview...</p>
            </div>
          )}

          {/* Image Preview */}
          {isImage && (
            <img
              src={thumbnailPath || url}
              alt={filename}
              onLoad={() => setIsLoading(false)}
              className="max-w-full max-h-full object-contain"
            />
          )}

          {/* PDF Preview */}
          {isPDF && (
            <div className="w-full h-full flex flex-col items-center justify-center">
              <FileText className="h-16 w-16 text-red-500 mb-4" />
              <p className="text-gray-600 mb-4">PDF Preview</p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 underline"
              >
                Open in new tab
              </a>
            </div>
          )}

          {/* Audio Preview */}
          {isAudio && (
            <div className="w-full max-w-md px-4">
              <Music className="h-16 w-16 text-blue-500 mx-auto mb-4" />
              <p className="text-center text-gray-600 mb-6">Audio File</p>
              <audio
                src={url}
                controls
                className="w-full rounded-lg bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onLoadedMetadata={() => setIsLoading(false)}
              />
            </div>
          )}

          {/* Video Preview */}
          {isVideo && (
            <div className="w-full max-w-2xl px-4">
              <video
                src={url}
                controls
                className="w-full rounded-lg bg-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                onLoadedMetadata={() => setIsLoading(false)}
              />
            </div>
          )}

          {/* Text Preview */}
          {isText && (
            <div className="w-full max-w-2xl px-4 py-6">
              <p className="text-gray-600 text-center mb-4">Text File</p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 underline"
              >
                Open in new tab or download
              </a>
            </div>
          )}

          {/* Other Files */}
          {!isImage && !isPDF && !isAudio && !isVideo && !isText && (
            <div className="text-center">
              {getFileIcon()}
              <p className="mt-4 text-gray-600">
                Preview not available for this file type
              </p>
              <p className="text-sm text-gray-500 mt-2">
                MIME Type: {mimeType}
              </p>
              <Button
                onClick={() => onDownload?.()}
                className="mt-6"
              >
                Download File
              </Button>
            </div>
          )}
        </div>

        {/* Metadata Footer */}
        {imageMetadata && (
          <div className="border-t border-gray-200 bg-gray-50 p-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Dimensions</p>
                <p className="font-medium text-gray-900">
                  {imageMetadata.width}×{imageMetadata.height}px
                </p>
              </div>
              <div>
                <p className="text-gray-600">Format</p>
                <p className="font-medium text-gray-900 uppercase">
                  {imageMetadata.format}
                </p>
              </div>
              <div>
                <p className="text-gray-600">Size</p>
                <p className="font-medium text-gray-900">
                  {formatFileSize(size)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default FilePreview;
