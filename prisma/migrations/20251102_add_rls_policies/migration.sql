-- PHASE 1.1: PostgreSQL Row Level Security (RLS) Implementation
-- Ensures complete multi-tenant data isolation at the database level
-- Date: November 2, 2025
-- This migration enables RLS on all tenant-scoped tables and creates isolation policies

-- ============================================================================
-- 1. CREATE TENANT CONTEXT SETTING FUNCTION
-- ============================================================================
-- This function sets the current tenant in the session context
-- Used by Prisma middleware to enforce isolation

CREATE OR REPLACE FUNCTION set_tenant_context(tenant_id TEXT) RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_tenant_id', tenant_id, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to get current tenant
CREATE OR REPLACE FUNCTION get_tenant_id() RETURNS TEXT AS $$
BEGIN
  RETURN current_setting('app.current_tenant_id', true);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 2. ENABLE RLS ON ALL TENANT-SCOPED TABLES
-- ============================================================================

-- Enable RLS on profiles table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Enable RLS on contacts table
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- Enable RLS on companies table
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- Enable RLS on leads table
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Enable RLS on pipelines table
ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;

-- Enable RLS on pipeline_stages table (related to pipelines)
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;

-- Enable RLS on activities table
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

-- Enable RLS on api_keys table
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Enable RLS on qr_sessions table
ALTER TABLE qr_sessions ENABLE ROW LEVEL SECURITY;

-- Enable RLS on linked_devices table
ALTER TABLE linked_devices ENABLE ROW LEVEL SECURITY;

-- Enable RLS on files table (Phase 3.3)
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- Enable RLS on storage_quota table (Phase 3.3)
ALTER TABLE storage_quota ENABLE ROW LEVEL SECURITY;

-- Enable RLS on file_shares table (Phase 3.3)
ALTER TABLE file_shares ENABLE ROW LEVEL SECURITY;

-- Enable RLS on file_audit_logs table (Phase 3.3)
ALTER TABLE file_audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. PROFILES TABLE POLICIES
-- ============================================================================

CREATE POLICY profiles_tenant_isolation_select ON profiles
  FOR SELECT
  USING (tenant_id = get_tenant_id());

CREATE POLICY profiles_tenant_isolation_insert ON profiles
  FOR INSERT
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY profiles_tenant_isolation_update ON profiles
  FOR UPDATE
  USING (tenant_id = get_tenant_id())
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY profiles_tenant_isolation_delete ON profiles
  FOR DELETE
  USING (tenant_id = get_tenant_id());

-- ============================================================================
-- 4. CONTACTS TABLE POLICIES
-- ============================================================================

CREATE POLICY contacts_tenant_isolation_select ON contacts
  FOR SELECT
  USING (tenant_id = get_tenant_id());

CREATE POLICY contacts_tenant_isolation_insert ON contacts
  FOR INSERT
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY contacts_tenant_isolation_update ON contacts
  FOR UPDATE
  USING (tenant_id = get_tenant_id())
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY contacts_tenant_isolation_delete ON contacts
  FOR DELETE
  USING (tenant_id = get_tenant_id());

-- ============================================================================
-- 5. COMPANIES TABLE POLICIES
-- ============================================================================

CREATE POLICY companies_tenant_isolation_select ON companies
  FOR SELECT
  USING (tenant_id = get_tenant_id());

CREATE POLICY companies_tenant_isolation_insert ON companies
  FOR INSERT
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY companies_tenant_isolation_update ON companies
  FOR UPDATE
  USING (tenant_id = get_tenant_id())
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY companies_tenant_isolation_delete ON companies
  FOR DELETE
  USING (tenant_id = get_tenant_id());

-- ============================================================================
-- 6. LEADS TABLE POLICIES
-- ============================================================================

CREATE POLICY leads_tenant_isolation_select ON leads
  FOR SELECT
  USING (tenant_id = get_tenant_id());

CREATE POLICY leads_tenant_isolation_insert ON leads
  FOR INSERT
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY leads_tenant_isolation_update ON leads
  FOR UPDATE
  USING (tenant_id = get_tenant_id())
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY leads_tenant_isolation_delete ON leads
  FOR DELETE
  USING (tenant_id = get_tenant_id());

-- ============================================================================
-- 7. PIPELINES TABLE POLICIES
-- ============================================================================

CREATE POLICY pipelines_tenant_isolation_select ON pipelines
  FOR SELECT
  USING (tenant_id = get_tenant_id());

CREATE POLICY pipelines_tenant_isolation_insert ON pipelines
  FOR INSERT
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY pipelines_tenant_isolation_update ON pipelines
  FOR UPDATE
  USING (tenant_id = get_tenant_id())
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY pipelines_tenant_isolation_delete ON pipelines
  FOR DELETE
  USING (tenant_id = get_tenant_id());

-- ============================================================================
-- 8. PIPELINE_STAGES TABLE POLICIES
-- ============================================================================
-- Note: Pipeline stages are related to pipelines which have tenant_id
-- We'll check the parent pipeline's tenant_id

CREATE POLICY pipeline_stages_tenant_isolation_select ON pipeline_stages
  FOR SELECT
  USING (
    pipeline_id IN (
      SELECT id FROM pipelines WHERE tenant_id = get_tenant_id()
    )
  );

CREATE POLICY pipeline_stages_tenant_isolation_insert ON pipeline_stages
  FOR INSERT
  WITH CHECK (
    pipeline_id IN (
      SELECT id FROM pipelines WHERE tenant_id = get_tenant_id()
    )
  );

CREATE POLICY pipeline_stages_tenant_isolation_update ON pipeline_stages
  FOR UPDATE
  USING (
    pipeline_id IN (
      SELECT id FROM pipelines WHERE tenant_id = get_tenant_id()
    )
  )
  WITH CHECK (
    pipeline_id IN (
      SELECT id FROM pipelines WHERE tenant_id = get_tenant_id()
    )
  );

CREATE POLICY pipeline_stages_tenant_isolation_delete ON pipeline_stages
  FOR DELETE
  USING (
    pipeline_id IN (
      SELECT id FROM pipelines WHERE tenant_id = get_tenant_id()
    )
  );

-- ============================================================================
-- 9. ACTIVITIES TABLE POLICIES
-- ============================================================================
-- Activities can be related to contacts or leads, both of which have tenant_id

CREATE POLICY activities_tenant_isolation_select ON activities
  FOR SELECT
  USING (tenant_id = get_tenant_id());

CREATE POLICY activities_tenant_isolation_insert ON activities
  FOR INSERT
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY activities_tenant_isolation_update ON activities
  FOR UPDATE
  USING (tenant_id = get_tenant_id())
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY activities_tenant_isolation_delete ON activities
  FOR DELETE
  USING (tenant_id = get_tenant_id());

-- ============================================================================
-- 10. API_KEYS TABLE POLICIES
-- ============================================================================

CREATE POLICY api_keys_tenant_isolation_select ON api_keys
  FOR SELECT
  USING (tenant_id = get_tenant_id());

CREATE POLICY api_keys_tenant_isolation_insert ON api_keys
  FOR INSERT
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY api_keys_tenant_isolation_update ON api_keys
  FOR UPDATE
  USING (tenant_id = get_tenant_id())
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY api_keys_tenant_isolation_delete ON api_keys
  FOR DELETE
  USING (tenant_id = get_tenant_id());

-- ============================================================================
-- 11. QR_SESSIONS TABLE POLICIES
-- ============================================================================

CREATE POLICY qr_sessions_tenant_isolation_select ON qr_sessions
  FOR SELECT
  USING (tenant_id = get_tenant_id());

CREATE POLICY qr_sessions_tenant_isolation_insert ON qr_sessions
  FOR INSERT
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY qr_sessions_tenant_isolation_update ON qr_sessions
  FOR UPDATE
  USING (tenant_id = get_tenant_id())
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY qr_sessions_tenant_isolation_delete ON qr_sessions
  FOR DELETE
  USING (tenant_id = get_tenant_id());

-- ============================================================================
-- 12. LINKED_DEVICES TABLE POLICIES
-- ============================================================================
-- Note: Linked devices are related to profiles which have tenant_id

CREATE POLICY linked_devices_tenant_isolation_select ON linked_devices
  FOR SELECT
  USING (tenant_id = get_tenant_id());

CREATE POLICY linked_devices_tenant_isolation_insert ON linked_devices
  FOR INSERT
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY linked_devices_tenant_isolation_update ON linked_devices
  FOR UPDATE
  USING (tenant_id = get_tenant_id())
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY linked_devices_tenant_isolation_delete ON linked_devices
  FOR DELETE
  USING (tenant_id = get_tenant_id());

-- ============================================================================
-- 13. FILES TABLE POLICIES (Phase 3.3)
-- ============================================================================

CREATE POLICY files_tenant_isolation_select ON files
  FOR SELECT
  USING (tenant_id = get_tenant_id());

CREATE POLICY files_tenant_isolation_insert ON files
  FOR INSERT
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY files_tenant_isolation_update ON files
  FOR UPDATE
  USING (tenant_id = get_tenant_id())
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY files_tenant_isolation_delete ON files
  FOR DELETE
  USING (tenant_id = get_tenant_id());

-- ============================================================================
-- 14. STORAGE_QUOTA TABLE POLICIES (Phase 3.3)
-- ============================================================================

CREATE POLICY storage_quota_tenant_isolation_select ON storage_quota
  FOR SELECT
  USING (tenant_id = get_tenant_id());

CREATE POLICY storage_quota_tenant_isolation_insert ON storage_quota
  FOR INSERT
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY storage_quota_tenant_isolation_update ON storage_quota
  FOR UPDATE
  USING (tenant_id = get_tenant_id())
  WITH CHECK (tenant_id = get_tenant_id());

CREATE POLICY storage_quota_tenant_isolation_delete ON storage_quota
  FOR DELETE
  USING (tenant_id = get_tenant_id());

-- ============================================================================
-- 15. FILE_SHARES TABLE POLICIES (Phase 3.3)
-- ============================================================================
-- File shares are related to files which have tenant_id

CREATE POLICY file_shares_tenant_isolation_select ON file_shares
  FOR SELECT
  USING (
    file_id IN (
      SELECT id FROM files WHERE tenant_id = get_tenant_id()
    )
  );

CREATE POLICY file_shares_tenant_isolation_insert ON file_shares
  FOR INSERT
  WITH CHECK (
    file_id IN (
      SELECT id FROM files WHERE tenant_id = get_tenant_id()
    )
  );

CREATE POLICY file_shares_tenant_isolation_update ON file_shares
  FOR UPDATE
  USING (
    file_id IN (
      SELECT id FROM files WHERE tenant_id = get_tenant_id()
    )
  )
  WITH CHECK (
    file_id IN (
      SELECT id FROM files WHERE tenant_id = get_tenant_id()
    )
  );

CREATE POLICY file_shares_tenant_isolation_delete ON file_shares
  FOR DELETE
  USING (
    file_id IN (
      SELECT id FROM files WHERE tenant_id = get_tenant_id()
    )
  );

-- ============================================================================
-- 16. FILE_AUDIT_LOGS TABLE POLICIES (Phase 3.3)
-- ============================================================================

CREATE POLICY file_audit_logs_tenant_isolation_select ON file_audit_logs
  FOR SELECT
  USING (tenant_id = get_tenant_id());

CREATE POLICY file_audit_logs_tenant_isolation_insert ON file_audit_logs
  FOR INSERT
  WITH CHECK (tenant_id = get_tenant_id());

-- Note: Typically audit logs are immutable, so no UPDATE/DELETE policies

-- ============================================================================
-- 17. SYSTEM TABLES - NO RLS NEEDED
-- ============================================================================
-- Tenants table: No RLS needed (auth handled at app layer)
-- _prisma_migrations: No RLS needed (system table)

-- ============================================================================
-- 18. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================
-- RLS queries are optimized with indexes on tenant_id and frequently filtered columns

CREATE INDEX idx_profiles_tenant_id ON profiles(tenant_id);
CREATE INDEX idx_contacts_tenant_id ON contacts(tenant_id);
CREATE INDEX idx_companies_tenant_id ON companies(tenant_id);
CREATE INDEX idx_leads_tenant_id ON leads(tenant_id);
CREATE INDEX idx_pipelines_tenant_id ON pipelines(tenant_id);
CREATE INDEX idx_activities_tenant_id ON activities(tenant_id);
CREATE INDEX idx_api_keys_tenant_id ON api_keys(tenant_id);
CREATE INDEX idx_qr_sessions_tenant_id ON qr_sessions(tenant_id);
CREATE INDEX idx_linked_devices_tenant_id ON linked_devices(tenant_id);
CREATE INDEX idx_files_tenant_id ON files(tenant_id);
CREATE INDEX idx_storage_quota_tenant_id ON storage_quota(tenant_id);
CREATE INDEX idx_file_audit_logs_tenant_id ON file_audit_logs(tenant_id);

-- Additional useful indexes for common queries
CREATE INDEX idx_profiles_user_id ON profiles(user_id);
CREATE INDEX idx_contacts_company_id ON contacts(company_id);
CREATE INDEX idx_leads_contact_id ON leads(contact_id);
CREATE INDEX idx_leads_pipeline_id ON leads(pipeline_id);
CREATE INDEX idx_activities_contact_id ON activities(contact_id);
CREATE INDEX idx_activities_lead_id ON activities(lead_id);
CREATE INDEX idx_api_keys_tenant_id_active ON api_keys(tenant_id, is_active);
CREATE INDEX idx_files_deleted_at ON files(deleted_at);
CREATE INDEX idx_file_shares_file_id ON file_shares(file_id);

-- ============================================================================
-- 19. GRANT APPROPRIATE PERMISSIONS
-- ============================================================================
-- Grant execute on tenant context functions to app user (adjust as needed)

GRANT EXECUTE ON FUNCTION set_tenant_context(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_tenant_id() TO authenticated;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- After migration, verify RLS is enabled:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
--
-- Expected output: All tenant-scoped tables should have rowsecurity = true
--
-- To test RLS policies:
-- SELECT set_tenant_context('tenant-123');
-- SELECT * FROM contacts; -- Should only return contacts for tenant-123
-- SELECT set_tenant_context('different-tenant');
-- SELECT * FROM contacts; -- Should return different results or none
