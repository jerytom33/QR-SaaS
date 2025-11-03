# 🎯 Phase 3.3: File Upload & Storage System

**Status:** Starting  
**Target Completion:** 90%  
**Duration:** ~2 weeks  
**Date Started:** November 2, 2025  

---

## 📋 Executive Summary

This phase implements a comprehensive file upload and storage system for the CRM, enabling:
- **Contact/Lead Attachments** - Resumes, photos, documents
- **Email Attachments** - Incoming/outgoing email files
- **Document Management** - Centralized file repository
- **File Sharing** - Secure sharing with permission controls
- **File Preview** - Images, PDFs, Office documents
- **Virus Scanning** - Security-first approach
- **Storage Optimization** - Image optimization, compression
- **Quota Management** - Per-tenant storage limits

---

## 🏗️ Architecture Design

### Storage Strategy

```
┌─────────────────────────────────────────────┐
│        Application Layer                    │
│  ┌─────────────────┐  ┌──────────────────┐ │
│  │  API Routes     │  │  Components      │ │
│  │  /upload        │  │  FileUploader    │ │
│  │  /download      │  │  FilePreview     │ │
│  │  /delete        │  │  FileManager     │ │
│  └─────────────────┘  └──────────────────┘ │
└─────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────┐
│    Storage Abstraction Layer                │
│  ┌─────────────────────────────────────────┐│
│  │  StorageProvider Interface              ││
│  │  - upload(file): Promise<StoredFile>    ││
│  │  - download(id): Promise<Buffer>        ││
│  │  - delete(id): Promise<void>            ││
│  │  - getUrl(id): string                   ││
│  └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
      ↓           ↓           ↓           ↓
   ┌──────┐   ┌──────┐   ┌──────┐   ┌──────┐
   │  S3  │   │Local │   │Azure │   │ GCS  │
   │      │   │ FS   │   │ Blob │   │      │
   └──────┘   └──────┘   └──────┘   └──────┘
```

### Data Model

```typescript
// File metadata stored in PostgreSQL
interface StoredFile {
  id: string;                    // UUID
  tenantId: string;              // Multi-tenant isolation
  userId: string;                // Owner
  entityType: 'contact' | 'lead' | 'company' | 'email' | 'activity' | 'document';
  entityId: string;              // Reference to entity
  filename: string;              // Original filename
  mimeType: string;              // Content type
  size: number;                  // File size in bytes
  storageKey: string;            // Provider-specific key
  storageProvider: 'S3' | 'local' | 'azure' | 'gcs';
  url?: string;                  // Public/signed URL
  
  // Optimization
  thumbnail?: string;            // Thumbnail URL (images)
  optimized?: string;            // Optimized version URL
  
  // Security
  virusScanStatus: 'pending' | 'clean' | 'infected';
  virusScanDetails?: {
    scanDate: Date;
    engine: string;
    result: string;
  };
  
  // Access control
  isPublic: boolean;             // Public or private
  sharedWith?: {
    userId: string;
    permission: 'view' | 'download' | 'delete';
    sharedDate: Date;
  }[];
  
  // Metadata
  properties?: Record<string, any>;  // Format-specific metadata
  tags?: string[];               // For organization
  version?: number;              // For versioning
  
  // Timestamps
  uploadedAt: Date;
  updatedAt: Date;
  deletedAt?: Date;              // Soft delete
  
  // Storage tracking
  storageQuotaUsed: number;      // Bytes used against quota
}

// Storage quota per tenant
interface StorageQuota {
  tenantId: string;
  quotaBytes: number;            // e.g., 100GB
  usedBytes: number;             // Calculated sum
  warningThreshold: number;      // 80%
  updatedAt: Date;
}
```

---

## 🔧 Implementation Tasks

### Task 1: Storage Provider Abstraction (Days 1-2)

**Objective:** Create pluggable storage provider interface

**Files to Create:**
```
src/lib/storage/
├── types.ts                    (TypeScript interfaces)
├── providers/
│   ├── index.ts               (provider registry)
│   ├── s3.ts                  (AWS S3 implementation)
│   ├── local.ts               (Local filesystem)
│   ├── azure.ts               (Azure Blob Storage)
│   └── gcs.ts                 (Google Cloud Storage)
├── index.ts                   (main storage service)
└── validation.ts              (file validation rules)
```

**Key Implementation Details:**

```typescript
// src/lib/storage/types.ts
export interface StorageProvider {
  upload(file: File, metadata: FileMetadata): Promise<StoredFileData>;
  download(fileId: string): Promise<Buffer>;
  delete(fileId: string): Promise<void>;
  getUrl(fileId: string, expiresIn?: number): Promise<string>;
  getStatus(): Promise<StorageStats>;
}

export interface FileMetadata {
  filename: string;
  mimeType: string;
  size: number;
  tenantId: string;
  userId: string;
  entityType: string;
  entityId: string;
  tags?: string[];
}

export interface StoredFileData {
  id: string;
  filename: string;
  url: string;
  storageKey: string;
  size: number;
}

// src/lib/storage/index.ts
export class StorageService {
  private provider: StorageProvider;
  
  constructor(provider: StorageProvider) {
    this.provider = provider;
  }
  
  async uploadFile(file: File, metadata: FileMetadata): Promise<StoredFile> {
    // Validate file
    this.validateFile(file, metadata);
    
    // Create DB record
    const dbRecord = await this.createFileRecord({
      filename: file.name,
      size: file.size,
      mimeType: file.type,
      ...metadata,
    });
    
    // Upload to storage
    const stored = await this.provider.upload(file, metadata);
    
    // Update DB with storage key and URL
    return await this.updateFileRecord(dbRecord.id, {
      storageKey: stored.storageKey,
      url: stored.url,
    });
  }
  
  async downloadFile(fileId: string): Promise<Buffer> {
    const file = await this.getFileRecord(fileId);
    return await this.provider.download(fileId);
  }
  
  async deleteFile(fileId: string): Promise<void> {
    const file = await this.getFileRecord(fileId);
    await this.provider.delete(fileId);
    await this.softDeleteFileRecord(fileId);
  }
}
```

**Tasks:**
- [ ] Define StorageProvider interface
- [ ] Create file validation utilities
- [ ] Implement error handling
- [ ] Add logging
- [ ] Create type definitions

---

### Task 2: AWS S3 Provider Implementation (Days 2-3)

**Objective:** Implement production-ready S3 storage provider

**Implementation:**

```typescript
// src/lib/storage/providers/s3.ts
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;
  private region: string;
  
  constructor() {
    this.bucket = process.env.AWS_S3_BUCKET!;
    this.region = process.env.AWS_REGION || 'us-east-1';
    this.client = new S3Client({ region: this.region });
  }
  
  async upload(file: File, metadata: FileMetadata): Promise<StoredFileData> {
    const key = this.generateStorageKey(metadata);
    const buffer = Buffer.from(await file.arrayBuffer());
    
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: file.type,
      Metadata: {
        'tenant-id': metadata.tenantId,
        'user-id': metadata.userId,
        'entity-type': metadata.entityType,
        'entity-id': metadata.entityId,
      },
      ServerSideEncryption: 'AES256',
      StorageClass: 'INTELLIGENT_TIERING',
      Tagging: this.buildTagString(metadata.tags),
    });
    
    await this.client.send(command);
    
    return {
      id: this.generateFileId(),
      filename: file.name,
      storageKey: key,
      url: `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`,
      size: file.size,
    };
  }
  
  async download(fileId: string): Promise<Buffer> {
    const file = await this.getFileRecord(fileId);
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: file.storageKey,
    });
    
    const response = await this.client.send(command);
    return Buffer.from(await response.Body!.transformToByteArray());
  }
  
  async delete(fileId: string): Promise<void> {
    const file = await this.getFileRecord(fileId);
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: file.storageKey,
    });
    
    await this.client.send(command);
  }
  
  async getUrl(fileId: string, expiresIn = 3600): Promise<string> {
    const file = await this.getFileRecord(fileId);
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: file.storageKey,
    });
    
    return await getSignedUrl(this.client, command, { expiresIn });
  }
  
  private generateStorageKey(metadata: FileMetadata): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const ext = this.getFileExtension(metadata.filename);
    return `${metadata.tenantId}/${metadata.entityType}/${metadata.entityId}/${timestamp}-${random}.${ext}`;
  }
}
```

**Environment Variables:**
```bash
AWS_S3_BUCKET=crm-files-production
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
```

**Tasks:**
- [ ] Install AWS SDK v3
- [ ] Implement upload with encryption
- [ ] Implement download and streaming
- [ ] Implement deletion
- [ ] Add signed URL generation
- [ ] Add bucket lifecycle policies
- [ ] Add CloudFront CDN integration
- [ ] Implement retry logic

---

### Task 3: Local File System Provider (Days 1-2)

**Objective:** Implement local storage for development

**Implementation:**

```typescript
// src/lib/storage/providers/local.ts
import fs from 'fs/promises';
import path from 'path';
import { createReadStream } from 'fs';

export class LocalStorageProvider implements StorageProvider {
  private basePath: string;
  private publicUrl: string;
  
  constructor() {
    this.basePath = process.env.STORAGE_PATH || './storage';
    this.publicUrl = process.env.STORAGE_URL || 'http://localhost:3000/api/v1/files';
    this.ensureDirectory();
  }
  
  async upload(file: File, metadata: FileMetadata): Promise<StoredFileData> {
    const key = this.generateStorageKey(metadata);
    const filePath = path.join(this.basePath, key);
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    
    // Write file
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);
    
    // Write metadata
    await fs.writeFile(`${filePath}.meta.json`, JSON.stringify(metadata, null, 2));
    
    return {
      id: this.generateFileId(),
      filename: file.name,
      storageKey: key,
      url: `${this.publicUrl}/download/${key}`,
      size: file.size,
    };
  }
  
  async download(fileId: string): Promise<Buffer> {
    const file = await this.getFileRecord(fileId);
    return await fs.readFile(path.join(this.basePath, file.storageKey));
  }
  
  async delete(fileId: string): Promise<void> {
    const file = await this.getFileRecord(fileId);
    const filePath = path.join(this.basePath, file.storageKey);
    await fs.unlink(filePath);
    await fs.unlink(`${filePath}.meta.json`);
  }
  
  async getUrl(fileId: string, expiresIn?: number): Promise<string> {
    const file = await this.getFileRecord(fileId);
    return `${this.publicUrl}/download/${file.storageKey}`;
  }
  
  private async ensureDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.basePath, { recursive: true });
    } catch (error) {
      console.error('Failed to create storage directory:', error);
    }
  }
}
```

**Tasks:**
- [ ] Implement local filesystem storage
- [ ] Add directory structure
- [ ] Implement file streaming
- [ ] Add metadata storage
- [ ] Implement cleanup routines
- [ ] Add permission handling

---

### Task 4: Virus Scanning Integration (Days 3-4)

**Objective:** Implement security-first virus scanning

**Implementation:**

```typescript
// src/lib/storage/virus-scan.ts
import NodeClam from 'clamscan';
import axios from 'axios';

export class VirusScanService {
  private clamscan: NodeClam | null = null;
  private virusTotal: boolean;
  private virusTotalKey: string | null;
  
  constructor() {
    this.virusTotal = process.env.VIRUS_SCAN_PROVIDER === 'virustotal';
    this.virusTotalKey = process.env.VIRUSTOTAL_API_KEY || null;
  }
  
  async scanFile(fileBuffer: Buffer, filename: string): Promise<ScanResult> {
    try {
      if (this.virusTotal && this.virusTotalKey) {
        return await this.scanWithVirusTotal(fileBuffer, filename);
      } else {
        return await this.scanWithClamAV(fileBuffer, filename);
      }
    } catch (error) {
      console.error('Virus scan failed:', error);
      // Return pending status if scan fails
      return {
        status: 'pending',
        engine: 'error',
        result: 'Scan service unavailable',
        timestamp: new Date(),
      };
    }
  }
  
  private async scanWithClamAV(fileBuffer: Buffer, filename: string): Promise<ScanResult> {
    const clamscan = await this.getClamscan();
    
    // Create temp file
    const tempPath = path.join(os.tmpdir(), `scan-${Date.now()}-${filename}`);
    await fs.writeFile(tempPath, fileBuffer);
    
    try {
      const { isInfected, viruses } = await clamscan.scanFile(tempPath);
      
      return {
        status: isInfected ? 'infected' : 'clean',
        engine: 'ClamAV',
        result: viruses ? viruses.join(', ') : 'No threats detected',
        timestamp: new Date(),
      };
    } finally {
      // Clean up temp file
      await fs.unlink(tempPath).catch(() => {});
    }
  }
  
  private async scanWithVirusTotal(fileBuffer: Buffer, filename: string): Promise<ScanResult> {
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: 'application/octet-stream' });
    formData.append('file', blob, filename);
    
    const response = await axios.post('https://www.virustotal.com/api/v3/files', formData, {
      headers: {
        'x-apikey': this.virusTotalKey!,
        ...formData.getHeaders(),
      },
    });
    
    const fileId = response.data.data.id;
    
    // Poll for results (with timeout)
    let result = await this.checkVirusTotalAnalysis(fileId);
    let attempts = 0;
    while (result.status === 'pending' && attempts < 10) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      result = await this.checkVirusTotalAnalysis(fileId);
      attempts++;
    }
    
    return result;
  }
  
  private async checkVirusTotalAnalysis(fileId: string): Promise<ScanResult> {
    const response = await axios.get(`https://www.virustotal.com/api/v3/analyses/${fileId}`, {
      headers: {
        'x-apikey': this.virusTotalKey!,
      },
    });
    
    const analysis = response.data.data.attributes.results;
    const detections = Object.entries(analysis)
      .filter(([, result]: any) => result.detected)
      .map(([engine, result]: any) => `${engine}: ${result.result}`)
      .slice(0, 3); // Top 3 detections
    
    return {
      status: detections.length > 0 ? 'infected' : 'clean',
      engine: 'VirusTotal',
      result: detections.length > 0 ? detections.join('; ') : 'No threats detected',
      timestamp: new Date(),
    };
  }
  
  private async getClamscan(): Promise<NodeClam> {
    if (!this.clamscan) {
      this.clamscan = await new NodeClam().init({
        clamdscan: {
          host: process.env.CLAMAV_HOST || 'localhost',
          port: parseInt(process.env.CLAMAV_PORT || '3310'),
        },
      });
    }
    return this.clamscan;
  }
}

export interface ScanResult {
  status: 'clean' | 'infected' | 'pending';
  engine: string;
  result: string;
  timestamp: Date;
}
```

**Environment Variables:**
```bash
VIRUS_SCAN_PROVIDER=virustotal  # or clamav
VIRUSTOTAL_API_KEY=your_api_key
CLAMAV_HOST=localhost
CLAMAV_PORT=3310
```

**Tasks:**
- [ ] Set up ClamAV or VirusTotal integration
- [ ] Implement async scanning
- [ ] Add scanning queue
- [ ] Implement retry logic
- [ ] Add scanning status tracking
- [ ] Implement quarantine system

---

### Task 5: File Validation & Optimization (Days 4-5)

**Objective:** Validate and optimize uploaded files

**Implementation:**

```typescript
// src/lib/storage/validation.ts
export class FileValidator {
  private allowedMimeTypes = new Set([
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    
    // Media
    'video/mp4',
    'audio/mpeg',
  ]);
  
  private blockedExtensions = new Set([
    'exe', 'bat', 'cmd', 'com', 'pif', 'scr', 'vbs', 'js', 'jar',
    'zip', 'rar', '7z', 'iso', 'dmg',
  ]);
  
  private maxSizes = {
    document: 100 * 1024 * 1024,      // 100 MB
    image: 50 * 1024 * 1024,          // 50 MB
    video: 500 * 1024 * 1024,         // 500 MB
    audio: 100 * 1024 * 1024,         // 100 MB
    default: 50 * 1024 * 1024,        // 50 MB
  };
  
  validate(file: File, context?: ValidationContext): ValidationResult {
    const errors: string[] = [];
    
    // Check file size
    if (file.size > this.getMaxSize(file.type)) {
      errors.push(`File exceeds maximum size of ${this.formatBytes(this.getMaxSize(file.type))}`);
    }
    
    // Check MIME type
    if (!this.allowedMimeTypes.has(file.type)) {
      errors.push(`File type ${file.type} is not allowed`);
    }
    
    // Check extension
    const ext = this.getExtension(file.name).toLowerCase();
    if (this.blockedExtensions.has(ext)) {
      errors.push(`File extension .${ext} is not allowed`);
    }
    
    // Check quota (if context provided)
    if (context?.tenantId) {
      const quotaError = this.checkQuota(context.tenantId, file.size);
      if (quotaError) {
        errors.push(quotaError);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings: this.getWarnings(file),
    };
  }
  
  private getMaxSize(mimeType: string): number {
    if (mimeType.startsWith('image/')) return this.maxSizes.image;
    if (mimeType.startsWith('video/')) return this.maxSizes.video;
    if (mimeType.startsWith('audio/')) return this.maxSizes.audio;
    if (mimeType.includes('application')) return this.maxSizes.document;
    return this.maxSizes.default;
  }
  
  private getWarnings(file: File): string[] {
    const warnings: string[] = [];
    
    // Warn about large files
    if (file.size > 10 * 1024 * 1024) {
      warnings.push('Large file - upload may take a while');
    }
    
    return warnings;
  }
}

// src/lib/storage/optimization.ts
export class FileOptimizer {
  async optimizeImage(buffer: Buffer, filename: string): Promise<OptimizedImage> {
    const sharp = require('sharp');
    const image = sharp(buffer);
    const metadata = await image.metadata();
    
    // Generate thumbnail (150x150)
    const thumbnail = await sharp(buffer)
      .resize(150, 150, { fit: 'cover', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    
    // Generate optimized version (1200x1200 max)
    const optimized = await sharp(buffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
    
    return {
      original: buffer,
      thumbnail,
      optimized,
      metadata: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        hasAlpha: metadata.hasAlpha,
      },
    };
  }
  
  async compressDocument(buffer: Buffer, filename: string): Promise<Buffer> {
    // Implement PDF compression using pdf-lib or similar
    // For now, just return original
    return buffer;
  }
}
```

**Tasks:**
- [ ] Implement file type validation
- [ ] Add size limits per file type
- [ ] Implement quota checking
- [ ] Add image optimization (sharp)
- [ ] Add image thumbnail generation
- [ ] Implement document compression
- [ ] Add metadata extraction
- [ ] Implement magic number validation

---

### Task 6: API Routes & Controllers (Days 5-6)

**Objective:** Create REST API for file operations

**Implementation:**

```typescript
// src/app/api/v1/files/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/middleware/auth';
import { storageService } from '@/lib/storage';

export const POST = auth(async (req: NextRequest, { user, tenant }) => {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const entityType = formData.get('entityType') as string;
    const entityId = formData.get('entityId') as string;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }
    
    // Validate file
    const validation = fileValidator.validate(file, {
      tenantId: tenant.id,
      userId: user.id,
    });
    
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.errors[0], details: validation.errors },
        { status: 400 }
      );
    }
    
    // Upload file
    const stored = await storageService.uploadFile(file, {
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      tenantId: tenant.id,
      userId: user.id,
      entityType,
      entityId,
    });
    
    // Queue virus scan
    await virusScanQueue.add({
      fileId: stored.id,
      filename: file.name,
    });
    
    return NextResponse.json(stored, { status: 201 });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Upload failed' },
      { status: 500 }
    );
  }
});

// src/app/api/v1/files/[id]/route.ts
export const GET = auth(async (req, { user, tenant, params }) => {
  try {
    const file = await getFileRecord(params.id, tenant.id);
    
    if (!file) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }
    
    // Check permissions
    if (!canAccessFile(file, user, tenant)) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }
    
    return NextResponse.json(file);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get file' },
      { status: 500 }
    );
  }
});

export const DELETE = auth(async (req, { user, tenant, params }) => {
  try {
    const file = await getFileRecord(params.id, tenant.id);
    
    if (!file) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }
    
    // Check ownership
    if (file.userId !== user.id && !user.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }
    
    await storageService.deleteFile(params.id);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Delete failed' },
      { status: 500 }
    );
  }
});

// src/app/api/v1/files/download/[id]/route.ts
export const GET = auth(async (req, { user, tenant, params }) => {
  try {
    const file = await getFileRecord(params.id, tenant.id);
    
    if (!file) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }
    
    // Check virus status
    if (file.virusScanStatus === 'infected') {
      return NextResponse.json(
        { error: 'File contains malware' },
        { status: 403 }
      );
    }
    
    const buffer = await storageService.downloadFile(params.id);
    
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': file.mimeType,
        'Content-Disposition': `attachment; filename="${file.filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Download failed' },
      { status: 500 }
    );
  }
});
```

**Tasks:**
- [ ] Create /upload endpoint
- [ ] Create /download endpoint
- [ ] Create /delete endpoint
- [ ] Create /list endpoint
- [ ] Implement proper error handling
- [ ] Add request validation
- [ ] Add rate limiting for uploads
- [ ] Implement streaming for large files

---

### Task 7: Database Migrations & Schema (Days 6)

**Objective:** Add file storage tables to Prisma schema

**Implementation:**

```prisma
// prisma/schema.prisma

model File {
  id                String   @id @default(cuid())
  tenantId          String
  userId            String
  
  // File metadata
  filename          String
  mimeType          String
  size              Int      @db.BigInt
  
  // Entity reference
  entityType        String   @db.VarChar(50)
  entityId          String
  
  // Storage
  storageKey        String   @unique
  storageProvider   String   @default("S3")
  url               String?
  
  // Optimization
  thumbnail         String?
  optimized         String?
  properties        Json?
  
  // Security
  virusScanStatus   String   @default("pending") @db.VarChar(20)
  virusScanDetails  Json?
  isPublic          Boolean  @default(false)
  
  // Access control
  sharedWith        Json?    // Array of { userId, permission, sharedDate }
  tags              String[] @default([])
  
  // Soft delete
  deletedAt         DateTime?
  
  // Timestamps
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  // Relationships
  tenant            Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  // Indexes
  @@index([tenantId])
  @@index([userId])
  @@index([entityType, entityId])
  @@index([createdAt])
  @@index([virusScanStatus])
  
  @@unique([tenantId, id])
}

model StorageQuota {
  id                String   @id @default(cuid())
  tenantId          String   @unique
  quotaBytes        BigInt   @default(107374182400) // 100GB
  usedBytes         BigInt   @default(0)
  warningThreshold  Int      @default(80)
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  tenant            Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@index([tenantId])
}

model FileShare {
  id                String   @id @default(cuid())
  fileId            String
  userId            String
  permission        String   @db.VarChar(50)
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  @@index([fileId])
  @@index([userId])
  @@unique([fileId, userId])
}
```

**Migration Command:**
```bash
npx prisma migrate dev --name add_file_storage
```

**Tasks:**
- [ ] Add File model
- [ ] Add StorageQuota model
- [ ] Add FileShare model
- [ ] Create migration
- [ ] Add indexes
- [ ] Add RLS policies for files table

---

### Task 8: React Components (Days 6-7)

**Objective:** Create file upload UI components

**Implementation:**

```typescript
// src/features/file-management/components/FileUploader.tsx
'use client';

import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface FileUploaderProps {
  entityType: string;
  entityId: string;
  onSuccess?: (file: StoredFile) => void;
  onError?: (error: string) => void;
}

export function FileUploader({ entityType, entityId, onSuccess, onError }: FileUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  };
  
  const handleFiles = async (files: File[]) => {
    for (const file of files) {
      await uploadFile(file);
    }
  };
  
  const uploadFile = async (file: File) => {
    try {
      setUploading(true);
      setError(null);
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entityType', entityType);
      formData.append('entityId', entityId);
      
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          setProgress((e.loaded / e.total) * 100);
        }
      });
      
      xhr.addEventListener('load', () => {
        if (xhr.status === 201) {
          const response = JSON.parse(xhr.responseText);
          onSuccess?.(response);
          setProgress(0);
        }
      });
      
      xhr.addEventListener('error', () => {
        setError('Upload failed');
        onError?.('Upload failed');
      });
      
      xhr.open('POST', '/api/v1/files/upload');
      xhr.send(formData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
      onError?.(message);
    } finally {
      setUploading(false);
    }
  };
  
  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center"
    >
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => handleFiles(Array.from(e.target.files || []))}
      />
      
      {uploading ? (
        <div>
          <p className="mb-4 text-sm text-gray-600">Uploading...</p>
          <Progress value={progress} className="mb-2" />
          <p className="text-xs text-gray-500">{Math.round(progress)}%</p>
        </div>
      ) : (
        <div>
          <p className="mb-4 text-gray-600">Drag and drop files here or click to select</p>
          <Button
            onClick={() => inputRef.current?.click()}
            variant="outline"
          >
            Select Files
          </Button>
        </div>
      )}
    </div>
  );
}

// src/features/file-management/components/FileList.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Trash2, Share2, FileIcon } from 'lucide-react';
import { formatBytes, formatDate } from '@/lib/utils';

interface FileListProps {
  entityType: string;
  entityId: string;
}

export function FileList({ entityType, entityId }: FileListProps) {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetchFiles();
  }, [entityType, entityId]);
  
  const fetchFiles = async () => {
    try {
      const response = await fetch(
        `/api/v1/files?entityType=${entityType}&entityId=${entityId}`
      );
      const data = await response.json();
      setFiles(data);
    } catch (error) {
      console.error('Failed to fetch files:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleDelete = async (fileId: string) => {
    if (!confirm('Are you sure?')) return;
    
    try {
      await fetch(`/api/v1/files/${fileId}`, { method: 'DELETE' });
      setFiles(files.filter(f => f.id !== fileId));
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };
  
  if (loading) return <div>Loading...</div>;
  
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Uploaded</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {files.map((file) => (
          <TableRow key={file.id}>
            <TableCell className="flex items-center gap-2">
              <FileIcon className="h-4 w-4" />
              {file.filename}
            </TableCell>
            <TableCell>{formatBytes(file.size)}</TableCell>
            <TableCell>
              <span className={`text-sm font-semibold ${
                file.virusScanStatus === 'clean' ? 'text-green-600' :
                file.virusScanStatus === 'infected' ? 'text-red-600' :
                'text-yellow-600'
              }`}>
                {file.virusScanStatus}
              </span>
            </TableCell>
            <TableCell>{formatDate(file.createdAt)}</TableCell>
            <TableCell className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => window.open(`/api/v1/files/download/${file.id}`)}
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost">
                <Share2 className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDelete(file.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// src/features/file-management/components/FilePreview.tsx
'use client';

import React from 'react';
import Image from 'next/image';

interface FilePreviewProps {
  file: StoredFile;
}

export function FilePreview({ file }: FilePreviewProps) {
  if (file.mimeType.startsWith('image/')) {
    return (
      <div className="relative w-full h-64">
        <Image
          src={file.url || `/api/v1/files/download/${file.id}`}
          alt={file.filename}
          fill
          className="object-contain"
        />
      </div>
    );
  }
  
  if (file.mimeType === 'application/pdf') {
    return (
      <iframe
        src={`/api/v1/files/download/${file.id}`}
        className="w-full h-96"
      />
    );
  }
  
  return (
    <div className="flex items-center justify-center h-64 bg-gray-100 rounded">
      <p className="text-gray-500">Preview not available for {file.mimeType}</p>
    </div>
  );
}
```

**Tasks:**
- [ ] Create FileUploader component
- [ ] Add drag-and-drop support
- [ ] Create FileList component
- [ ] Create FilePreview component
- [ ] Add file sharing UI
- [ ] Add quota indicator
- [ ] Implement error boundaries

---

### Task 9: Testing & Documentation (Days 7-8)

**Objective:** Create comprehensive tests and documentation

**Files to Create:**
```
src/lib/storage/__tests__/
├── storage.test.ts
├── validation.test.ts
└── virus-scan.test.ts

docs/
├── file-storage-guide.md
└── storage-api.md
```

**Task 10: Performance Optimization & Monitoring**

```typescript
// src/lib/storage/monitoring.ts
export async function monitorStorageUsage() {
  const quotas = await getStorageQuotas();
  
  for (const quota of quotas) {
    const used = await calculateUsedStorage(quota.tenantId);
    const percentage = (used / quota.quotaBytes) * 100;
    
    // Update quota
    await updateQuota(quota.tenantId, used);
    
    // Send alert if approaching limit
    if (percentage >= quota.warningThreshold) {
      await sendAlert({
        tenantId: quota.tenantId,
        message: `Storage usage at ${percentage}%`,
        severity: percentage >= 95 ? 'critical' : 'warning',
      });
    }
  }
}
```

---

## 📊 Dependencies

```json
{
  "@aws-sdk/client-s3": "^3.400.0",
  "@aws-sdk/s3-request-presigner": "^3.400.0",
  "sharp": "^0.32.0",
  "clamscan": "^2.0.0",
  "axios": "^1.5.0",
  "mime-types": "^2.1.35"
}
```

---

## ✅ Completion Checklist

### Week 1 (Days 1-4)
- [ ] Storage provider abstraction implemented
- [ ] S3 provider working with encryption
- [ ] Local provider for development
- [ ] File validation system
- [ ] Virus scanning integrated

### Week 2 (Days 5-8)
- [ ] Database migrations applied
- [ ] API routes created and tested
- [ ] React components built
- [ ] Performance monitoring
- [ ] Documentation complete
- [ ] End-to-end testing passed

---

## 🎯 Success Criteria

- ✅ Files upload successfully to S3/local storage
- ✅ Virus scanning completed before availability
- ✅ File preview working for common types
- ✅ Storage quota enforced
- ✅ RLS policies prevent cross-tenant access
- ✅ Performance: < 500ms for most operations
- ✅ Documentation complete and accurate

---

## 📝 Notes

1. **Storage Provider:** Start with S3 for production, use local for development
2. **Virus Scanning:** Use VirusTotal for ease, ClamAV for privacy
3. **Optimization:** Sharp handles image optimization well
4. **Cost:** ~$0.023 per GB stored on S3
5. **Security:** All files encrypted at rest and in transit

---

**Phase Status:** Ready to Implement  
**Estimated Duration:** 2 weeks  
**Target Completion:** Mid-November 2025
