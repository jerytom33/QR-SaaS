/**
 * FileList Component
 * 
 * Features:
 * - Display list of files with pagination
 * - Filter by entity type/ID
 * - Sort by name, date, size
 * - Delete files with confirmation
 * - Share files
 * - Download files
 * - Show virus scan status
 * - Show image thumbnails
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
  Download,
  Trash2,
  Share2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Shield,
  Image as ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface FileListItem {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  createdAt: string;
  virusScanStatus: 'pending' | 'clean' | 'infected' | 'error';
  url?: string;
  thumbnailPath?: string;
}

interface FileListProps {
  entityType?: 'contact' | 'lead' | 'company' | 'email' | 'activity' | 'document';
  entityId?: string;
  onDelete?: (fileId: string) => void;
  onShare?: (fileId: string) => void;
  onDownload?: (fileId: string) => void;
  isLoading?: boolean;
  error?: string;
}

export function FileList({
  entityType,
  entityId,
  onDelete,
  onShare,
  onDownload,
  isLoading = false,
  error,
}: FileListProps) {
  const [files, setFiles] = useState<FileListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState('-createdAt');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Fetch files
  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: '20',
          sort: sortBy,
        });

        if (entityType && entityId) {
          params.append('entityType', entityType);
          params.append('entityId', entityId);
        }

        const response = await fetch(`/api/v1/files?${params}`);
        if (!response.ok) throw new Error('Failed to fetch files');

        const data = await response.json();
        setFiles(data.data);
        setTotalPages(data.pagination.pages);
      } catch (err) {
        console.error('Error fetching files:', err);
      }
    };

    fetchFiles();
  }, [page, sortBy, entityType, entityId]);

  const handleDelete = async (fileId: string) => {
    try {
      const response = await fetch(`/api/v1/files/${fileId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete file');

      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      onDelete?.(fileId);
    } catch (err) {
      console.error('Error deleting file:', err);
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const handleDownload = async (file: FileListItem) => {
    try {
      const response = await fetch(
        `/api/v1/files/download/${file.id}?inline=false`
      );
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      onDownload?.(file.id);
    } catch (err) {
      console.error('Error downloading file:', err);
    }
  };

  const getVirusScanIcon = (status: string) => {
    switch (status) {
      case 'clean':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'infected':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getVirusScanLabel = (status: string) => {
    switch (status) {
      case 'clean':
        return 'Clean';
      case 'infected':
        return 'Infected';
      case 'pending':
        return 'Scanning...';
      default:
        return 'Error';
    }
  };

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
      month: 'short',
      day: 'numeric',
    });
  };

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="flex gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <div>
            <h3 className="font-medium text-red-900">Error loading files</h3>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-gray-200 animate-pulse" />
        ))}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
        <ImageIcon className="mx-auto h-12 w-12 text-gray-400 mb-3" />
        <p className="text-gray-600">No files uploaded yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sort Controls */}
      <div className="flex gap-2">
        <select
          value={sortBy}
          onChange={(e) => {
            setSortBy(e.target.value);
            setPage(1);
          }}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="-createdAt">Newest First</option>
          <option value="createdAt">Oldest First</option>
          <option value="filename">Name (A-Z)</option>
          <option value="-filename">Name (Z-A)</option>
          <option value="size">Smallest First</option>
          <option value="-size">Largest First</option>
        </select>
      </div>

      {/* Files Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">
                File
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">
                Size
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">
                Date
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">
                Status
              </th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {files.map((file) => (
              <tr key={file.id} className="hover:bg-gray-50 transition-colors">
                {/* Filename */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {file.mimeType.startsWith('image/') ? (
                      <ImageIcon className="h-4 w-4 text-blue-500 shrink-0" />
                    ) : (
                      <div className="h-4 w-4 rounded bg-gray-300 shrink-0" />
                    )}
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {file.filename}
                    </span>
                  </div>
                </td>

                {/* Size */}
                <td className="px-4 py-3">
                  <p className="text-sm text-gray-600">
                    {formatFileSize(file.size)}
                  </p>
                </td>

                {/* Date */}
                <td className="px-4 py-3">
                  <p className="text-sm text-gray-600">
                    {formatDate(file.createdAt)}
                  </p>
                </td>

                {/* Virus Scan Status */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {getVirusScanIcon(file.virusScanStatus)}
                    <span className="text-sm text-gray-600">
                      {getVirusScanLabel(file.virusScanStatus)}
                    </span>
                  </div>
                </td>

                {/* Actions */}
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(file)}
                      disabled={file.virusScanStatus === 'infected'}
                      className="text-gray-600 hover:text-gray-900"
                      title="Download file"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onShare?.(file.id)}
                      className="text-gray-600 hover:text-gray-900"
                      title="Share file"
                    >
                      <Share2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirmId(file.id)}
                      className="text-gray-600 hover:text-red-600"
                      title="Delete file"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center">
          <p className="text-sm text-gray-600">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this file? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteConfirmId && handleDelete(deleteConfirmId)
              }
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default FileList;
