/**
 * Prisma Migration Documentation - Phase 3.3: File Management
 * 
 * This migration adds file management capabilities to the CRM platform:
 * - File storage with multi-provider support (S3, Local, Azure, GCS)
 * - Virus scanning integration (VirusTotal, ClamAV)
 * - Image optimization (WebP conversion, thumbnails)
 * - File sharing with permissions
 * - Storage quota tracking
 * - Audit logging for compliance
 */

/* Migration to run in Prisma:

-- Create enums for file management
CREATE TYPE "VirusScanStatus" AS ENUM ('PENDING', 'SCANNING', 'CLEAN', 'INFECTED', 'QUARANTINED', 'ERROR', 'SKIPPED');
CREATE TYPE "FilePermission" AS ENUM ('VIEW', 'COMMENT', 'EDIT', 'ADMIN');

-- Create files table
CREATE TABLE "files" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "filename" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" BIGINT NOT NULL,
  
  "virusScanStatus" "VirusScanStatus" NOT NULL DEFAULT 'PENDING',
  "virusScanResult" TEXT,
  "scannedAt" TIMESTAMP(3),
  
  "isOptimized" BOOLEAN NOT NULL DEFAULT false,
  "thumbnailPath" TEXT,
  "optimizedPath" TEXT,
  "imageMetadata" TEXT,
  
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  
  "uploadedBy" TEXT NOT NULL,
  "isPublic" BOOLEAN NOT NULL DEFAULT false,
  "downloadCount" INTEGER NOT NULL DEFAULT 0,
  
  "deletedAt" TIMESTAMP(3),
  "deletedBy" TEXT,
  
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  
  "tenantId" TEXT NOT NULL,
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE
);

-- Create indexes for files
CREATE INDEX "files_tenantId_idx" ON "files"("tenantId");
CREATE INDEX "files_entityType_entityId_idx" ON "files"("entityType", "entityId");
CREATE INDEX "files_uploadedBy_idx" ON "files"("uploadedBy");
CREATE INDEX "files_createdAt_idx" ON "files"("createdAt");
CREATE INDEX "files_deletedAt_idx" ON "files"("deletedAt");

-- Create storage_quotas table
CREATE TABLE "storage_quotas" (
  "id" TEXT NOT NULL PRIMARY KEY,
  
  "totalUsageBytes" BIGINT NOT NULL DEFAULT 0,
  "fileCount" INTEGER NOT NULL DEFAULT 0,
  
  "limitBytes" BIGINT NOT NULL,
  "lastCalculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  "warningThreshold" INTEGER NOT NULL DEFAULT 80,
  "isWarned" BOOLEAN NOT NULL DEFAULT false,
  
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  
  "tenantId" TEXT NOT NULL UNIQUE,
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE
);

-- Create file_shares table
CREATE TABLE "file_shares" (
  "id" TEXT NOT NULL PRIMARY KEY,
  
  "permission" "FilePermission" NOT NULL DEFAULT 'VIEW',
  
  "sharedBy" TEXT NOT NULL,
  "sharedWith" TEXT NOT NULL,
  "shareToken" TEXT,
  "shareSignature" TEXT,
  
  "expiresAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  
  "fileId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  
  FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE,
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE,
  UNIQUE("fileId", "sharedWith")
);

-- Create indexes for file_shares
CREATE INDEX "file_shares_fileId_idx" ON "file_shares"("fileId");
CREATE INDEX "file_shares_sharedWith_idx" ON "file_shares"("sharedWith");
CREATE INDEX "file_shares_shareToken_idx" ON "file_shares"("shareToken");
CREATE INDEX "file_shares_shareSignature_idx" ON "file_shares"("shareSignature");
CREATE INDEX "file_shares_expiresAt_idx" ON "file_shares"("expiresAt");

-- Create file_audit_logs table
CREATE TABLE "file_audit_logs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "action" TEXT NOT NULL,
  "details" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  "fileId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "actorId" TEXT,
  
  FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE,
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE
);

-- Create indexes for file_audit_logs
CREATE INDEX "file_audit_logs_tenantId_idx" ON "file_audit_logs"("tenantId");
CREATE INDEX "file_audit_logs_fileId_idx" ON "file_audit_logs"("fileId");
CREATE INDEX "file_audit_logs_action_idx" ON "file_audit_logs"("action");
CREATE INDEX "file_audit_logs_createdAt_idx" ON "file_audit_logs"("createdAt");

*/

/**
 * Schema Summary:
 * 
 * File Model (7 core categories):
 * ├─ Identity: id, filename, storagePath, mimeType, size
 * ├─ Virus Scanning: virusScanStatus, virusScanResult, scannedAt
 * ├─ Image Optimization: isOptimized, thumbnailPath, optimizedPath, imageMetadata
 * ├─ Entity Linking: entityType, entityId
 * ├─ Ownership: uploadedBy, isPublic, downloadCount
 * ├─ Soft Delete: deletedAt, deletedBy
 * └─ Timestamps: createdAt, updatedAt
 * 
 * Relationships:
 * ├─ Many files belong to one Tenant
 * ├─ One file has many FileShare records
 * └─ One file has many FileAuditLog records
 * 
 * StorageQuota Model:
 * ├─ One quota record per Tenant (unique relationship)
 * ├─ Tracks: totalUsageBytes, fileCount, limitBytes
 * └─ Alerts: warningThreshold, isWarned
 * 
 * FileShare Model:
 * ├─ Links File to User with specific permission
 * ├─ Supports: expiration dates, revocation
 * ├─ Authentication: shareToken, shareSignature
 * └─ Unique constraint: (fileId, sharedWith) - can't share twice
 * 
 * FileAuditLog Model:
 * ├─ Tracks all file operations: UPLOAD, DOWNLOAD, DELETE, SHARE, UNSHARE
 * ├─ Records: action, details, actor, IP, user agent
 * └─ Enables: compliance auditing, forensics, analytics
 * 
 * Multi-Tenant Isolation:
 * ├─ All models include tenantId foreign key
 * ├─ Cascade delete on tenant deletion
 * └─ Indexes on (tenantId) for query performance
 * 
 * Virus Scanning States:
 * ├─ PENDING: Waiting to be scanned
 * ├─ SCANNING: Currently being scanned
 * ├─ CLEAN: Scanned and safe
 * ├─ INFECTED: Contains malware
 * ├─ QUARANTINED: Dangerous but preserved for analysis
 * ├─ ERROR: Scan failed
 * └─ SKIPPED: Too large or not scannable
 * 
 * File Permissions:
 * ├─ VIEW: Download only
 * ├─ COMMENT: Download + add comments
 * ├─ EDIT: Download + update file
 * └─ ADMIN: Full control including deletion
 */
