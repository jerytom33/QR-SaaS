-- Phase 2.2b - Query Optimization Indexes
-- Created: 2025-11-02
-- Purpose: Add composite indexes to support efficient queries for Phase 2.1 routes

-- ============================================================
-- CONTACTS TABLE INDEXES
-- ============================================================

-- Index for filtering by tenant_id, status, and sorting by created_at
-- Used by: List Contacts, Filter by Status
-- Expected usage: 1000s of calls per day
-- Cardinality: HIGH (status has 5 values, but combined with tenant_id is more selective)
CREATE INDEX CONCURRENTLY idx_contacts_tenant_status 
ON contacts(tenant_id, status, created_at DESC) 
WHERE deleted_at IS NULL;

-- Index for email lookups
-- Used by: Get Contact by Email, Email validation
-- Expected usage: 100s of calls per day
-- Cardinality: VERY HIGH (email is unique per contact)
CREATE INDEX CONCURRENTLY idx_contacts_tenant_email 
ON contacts(tenant_id, email) 
WHERE deleted_at IS NULL;

-- Index for date filtering
-- Used by: List by Date Range, Recently Modified Contacts
-- Expected usage: 100s of calls per day
CREATE INDEX CONCURRENTLY idx_contacts_tenant_created 
ON contacts(tenant_id, created_at DESC) 
WHERE deleted_at IS NULL;

-- Index for company lookups
-- Used by: Get Contacts by Company, Company Report
-- Expected usage: 100s of calls per day
CREATE INDEX CONCURRENTLY idx_contacts_company 
ON contacts(company_id, tenant_id) 
WHERE deleted_at IS NULL;

-- ============================================================
-- COMPANIES TABLE INDEXES
-- ============================================================

-- Index for filtering by tenant_id, status, and sorting
-- Used by: List Companies, Filter by Status
-- Expected usage: 1000s of calls per day
CREATE INDEX CONCURRENTLY idx_companies_tenant_status 
ON companies(tenant_id, status, created_at DESC) 
WHERE deleted_at IS NULL;

-- Index for domain lookups
-- Used by: Find Company by Domain, Domain validation
-- Expected usage: 100s of calls per day
CREATE INDEX CONCURRENTLY idx_companies_tenant_domain 
ON companies(tenant_id, domain) 
WHERE deleted_at IS NULL;

-- Index for industry segmentation
-- Used by: List by Industry, Industry Reports
-- Expected usage: 10s of calls per day
CREATE INDEX CONCURRENTLY idx_companies_tenant_industry 
ON companies(tenant_id, industry, created_at DESC) 
WHERE deleted_at IS NULL;

-- ============================================================
-- LEADS TABLE INDEXES
-- ============================================================

-- Index for pipeline board view (most critical)
-- Used by: Get Leads by Pipeline/Stage, Pipeline Board
-- Expected usage: 10000s of calls per day
-- Cardinality: HIGH (pipeline_id filters to specific pipeline, stage_id filters further)
CREATE INDEX CONCURRENTLY idx_leads_pipeline_stage 
ON leads(pipeline_id, stage_id, created_at DESC) 
WHERE deleted_at IS NULL;

-- Index for status filtering
-- Used by: Filter Leads by Status, Status Reports
-- Expected usage: 1000s of calls per day
CREATE INDEX CONCURRENTLY idx_leads_tenant_status 
ON leads(tenant_id, status, created_at DESC) 
WHERE deleted_at IS NULL;

-- Index for priority filtering
-- Used by: High Priority Leads, Priority Reports
-- Expected usage: 100s of calls per day
CREATE INDEX CONCURRENTLY idx_leads_tenant_priority 
ON leads(tenant_id, priority, created_at DESC) 
WHERE deleted_at IS NULL;

-- Index for contact lookups
-- Used by: Get Leads by Contact, Contact Details
-- Expected usage: 100s of calls per day
CREATE INDEX CONCURRENTLY idx_leads_contact 
ON leads(contact_id, tenant_id) 
WHERE deleted_at IS NULL;

-- ============================================================
-- ACTIVITIES TABLE INDEXES
-- ============================================================

-- Index for entity activity tracking (most critical)
-- Used by: Get Activities for Entity, Audit Trail
-- Expected usage: 10000s of calls per day
-- Cardinality: MEDIUM (entity_type has ~10 values, entity_id is unique per type)
CREATE INDEX CONCURRENTLY idx_activities_entity 
ON activities(entity_type, entity_id, tenant_id, created_at DESC);

-- Index for user activity feed
-- Used by: User Activity Feed, User Actions
-- Expected usage: 1000s of calls per day
CREATE INDEX CONCURRENTLY idx_activities_user 
ON activities(user_id, tenant_id, created_at DESC);

-- Index for audit trail by date
-- Used by: Audit Reports, Date Range Queries
-- Expected usage: 100s of calls per day
CREATE INDEX CONCURRENTLY idx_activities_tenant_date 
ON activities(tenant_id, created_at DESC);

-- ============================================================
-- WEBHOOKS TABLE INDEXES
-- ============================================================

-- Index for webhook filtering
-- Used by: List Active Webhooks, Webhook Discovery
-- Expected usage: 10s of calls per day
CREATE INDEX CONCURRENTLY idx_webhooks_tenant_active 
ON webhooks(tenant_id, is_active) 
WHERE deleted_at IS NULL;

-- ============================================================
-- API_KEYS TABLE INDEXES
-- ============================================================

-- Index for API key listing
-- Used by: List API Keys, Key Management
-- Expected usage: 100s of calls per day
CREATE INDEX CONCURRENTLY idx_api_keys_tenant 
ON api_keys(tenant_id, created_at DESC) 
WHERE deleted_at IS NULL;

-- Index for key prefix lookup (fast key validation)
-- Used by: Key Validation, Key Discovery
-- Expected usage: 10000s of calls per day (every API request)
-- CRITICAL: Must be very fast as every authenticated request uses this
CREATE INDEX CONCURRENTLY idx_api_keys_prefix 
ON api_keys(key_prefix) 
WHERE deleted_at IS NULL;

-- ============================================================
-- REPORTS TABLE INDEXES
-- ============================================================

-- Index for report listing and filtering
-- Used by: List Reports, Report Discovery
-- Expected usage: 100s of calls per day
CREATE INDEX CONCURRENTLY idx_reports_tenant_created 
ON reports(tenant_id, created_at DESC) 
WHERE deleted_at IS NULL;

-- ============================================================
-- PARTIAL INDEX STRATEGY NOTES
-- ============================================================
-- All indexes use WHERE deleted_at IS NULL to exclude soft-deleted records.
-- This dramatically reduces index size and improves query performance.
-- 
-- For example:
-- - Full contacts table: 1,000,000 records
-- - Active contacts (deleted_at IS NULL): 950,000 records
-- - Index size reduction: 5% smaller
-- - But more importantly: more selective queries = better query planner
--
-- ============================================================
-- COLUMN ORDER STRATEGY
-- ============================================================
-- Index column order follows these patterns:
-- 1. Most selective columns first (tenant_id, status)
-- 2. Then sorting columns (created_at DESC)
-- 3. Exception: For "key_prefix" lookup, it's the only column needed
--
-- Example for idx_contacts_tenant_status:
-- - tenant_id first (filters to single tenant)
-- - status second (filters to one status type)
-- - created_at DESC last (for sorting results)
--
-- This allows the index to be used for:
-- - WHERE tenant_id = X AND status = Y ORDER BY created_at DESC
-- - WHERE tenant_id = X AND status = Y (not sorted, index still used)
-- - WHERE tenant_id = X (only first two index levels used)
-- ============================================================
