-- Migration: Add Row Level Security (RLS) Policies for Multi-Tenant Isolation
-- Date: 2025-11-02
-- Description: Implements database-level tenant isolation using PostgreSQL RLS

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY ON ALL TENANT-SCOPED TABLES
-- ============================================================================

-- Contacts table
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- Companies table
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- Leads table
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Pipelines table
ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;

-- Pipeline Stages table
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;

-- Activities table
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

-- API Keys table
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- QR Sessions table
ALTER TABLE qr_sessions ENABLE ROW LEVEL SECURITY;

-- Linked Devices table
ALTER TABLE linked_devices ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CREATE TENANT CONTEXT FUNCTION
-- ============================================================================

-- Function to get current tenant from session variable
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS TEXT AS $$
BEGIN
  RETURN current_setting('app.current_tenant_id', TRUE);
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- CONTACTS TABLE RLS POLICIES
-- ============================================================================

-- Policy: Allow SELECT only for records belonging to current tenant
CREATE POLICY contacts_tenant_select ON contacts
  FOR SELECT
  USING (tenant_id = get_current_tenant_id());

-- Policy: Allow INSERT only with current tenant_id
CREATE POLICY contacts_tenant_insert ON contacts
  FOR INSERT
  WITH CHECK (tenant_id = get_current_tenant_id());

-- Policy: Allow UPDATE only for records belonging to current tenant
CREATE POLICY contacts_tenant_update ON contacts
  FOR UPDATE
  USING (tenant_id = get_current_tenant_id())
  WITH CHECK (tenant_id = get_current_tenant_id());

-- Policy: Allow DELETE only for records belonging to current tenant
CREATE POLICY contacts_tenant_delete ON contacts
  FOR DELETE
  USING (tenant_id = get_current_tenant_id());

-- ============================================================================
-- COMPANIES TABLE RLS POLICIES
-- ============================================================================

CREATE POLICY companies_tenant_select ON companies
  FOR SELECT
  USING (tenant_id = get_current_tenant_id());

CREATE POLICY companies_tenant_insert ON companies
  FOR INSERT
  WITH CHECK (tenant_id = get_current_tenant_id());

CREATE POLICY companies_tenant_update ON companies
  FOR UPDATE
  USING (tenant_id = get_current_tenant_id())
  WITH CHECK (tenant_id = get_current_tenant_id());

CREATE POLICY companies_tenant_delete ON companies
  FOR DELETE
  USING (tenant_id = get_current_tenant_id());

-- ============================================================================
-- LEADS TABLE RLS POLICIES
-- ============================================================================

CREATE POLICY leads_tenant_select ON leads
  FOR SELECT
  USING (tenant_id = get_current_tenant_id());

CREATE POLICY leads_tenant_insert ON leads
  FOR INSERT
  WITH CHECK (tenant_id = get_current_tenant_id());

CREATE POLICY leads_tenant_update ON leads
  FOR UPDATE
  USING (tenant_id = get_current_tenant_id())
  WITH CHECK (tenant_id = get_current_tenant_id());

CREATE POLICY leads_tenant_delete ON leads
  FOR DELETE
  USING (tenant_id = get_current_tenant_id());

-- ============================================================================
-- PIPELINES TABLE RLS POLICIES
-- ============================================================================

CREATE POLICY pipelines_tenant_select ON pipelines
  FOR SELECT
  USING (tenant_id = get_current_tenant_id());

CREATE POLICY pipelines_tenant_insert ON pipelines
  FOR INSERT
  WITH CHECK (tenant_id = get_current_tenant_id());

CREATE POLICY pipelines_tenant_update ON pipelines
  FOR UPDATE
  USING (tenant_id = get_current_tenant_id())
  WITH CHECK (tenant_id = get_current_tenant_id());

CREATE POLICY pipelines_tenant_delete ON pipelines
  FOR DELETE
  USING (tenant_id = get_current_tenant_id());

-- ============================================================================
-- PIPELINE STAGES TABLE RLS POLICIES
-- ============================================================================

-- Pipeline stages inherit tenant through pipeline relationship
CREATE POLICY pipeline_stages_tenant_select ON pipeline_stages
  FOR SELECT
  USING (
    pipeline_id IN (
      SELECT id FROM pipelines WHERE tenant_id = get_current_tenant_id()
    )
  );

CREATE POLICY pipeline_stages_tenant_insert ON pipeline_stages
  FOR INSERT
  WITH CHECK (
    pipeline_id IN (
      SELECT id FROM pipelines WHERE tenant_id = get_current_tenant_id()
    )
  );

CREATE POLICY pipeline_stages_tenant_update ON pipeline_stages
  FOR UPDATE
  USING (
    pipeline_id IN (
      SELECT id FROM pipelines WHERE tenant_id = get_current_tenant_id()
    )
  )
  WITH CHECK (
    pipeline_id IN (
      SELECT id FROM pipelines WHERE tenant_id = get_current_tenant_id()
    )
  );

CREATE POLICY pipeline_stages_tenant_delete ON pipeline_stages
  FOR DELETE
  USING (
    pipeline_id IN (
      SELECT id FROM pipelines WHERE tenant_id = get_current_tenant_id()
    )
  );

-- ============================================================================
-- ACTIVITIES TABLE RLS POLICIES
-- ============================================================================

-- Activities don't have direct tenant_id, so we check through related entities
-- For now, we'll use a simplified approach - in production, add tenant_id to activities
-- This is a placeholder that needs to be enhanced based on your business logic
CREATE POLICY activities_tenant_select ON activities
  FOR SELECT
  USING (
    -- Allow if contact belongs to tenant
    (contact_id IS NOT NULL AND contact_id IN (
      SELECT id FROM contacts WHERE tenant_id = get_current_tenant_id()
    ))
    OR
    -- Allow if lead belongs to tenant
    (lead_id IS NOT NULL AND lead_id IN (
      SELECT id FROM leads WHERE tenant_id = get_current_tenant_id()
    ))
  );

CREATE POLICY activities_tenant_insert ON activities
  FOR INSERT
  WITH CHECK (
    (contact_id IS NOT NULL AND contact_id IN (
      SELECT id FROM contacts WHERE tenant_id = get_current_tenant_id()
    ))
    OR
    (lead_id IS NOT NULL AND lead_id IN (
      SELECT id FROM leads WHERE tenant_id = get_current_tenant_id()
    ))
  );

CREATE POLICY activities_tenant_update ON activities
  FOR UPDATE
  USING (
    (contact_id IS NOT NULL AND contact_id IN (
      SELECT id FROM contacts WHERE tenant_id = get_current_tenant_id()
    ))
    OR
    (lead_id IS NOT NULL AND lead_id IN (
      SELECT id FROM leads WHERE tenant_id = get_current_tenant_id()
    ))
  )
  WITH CHECK (
    (contact_id IS NOT NULL AND contact_id IN (
      SELECT id FROM contacts WHERE tenant_id = get_current_tenant_id()
    ))
    OR
    (lead_id IS NOT NULL AND lead_id IN (
      SELECT id FROM leads WHERE tenant_id = get_current_tenant_id()
    ))
  );

CREATE POLICY activities_tenant_delete ON activities
  FOR DELETE
  USING (
    (contact_id IS NOT NULL AND contact_id IN (
      SELECT id FROM contacts WHERE tenant_id = get_current_tenant_id()
    ))
    OR
    (lead_id IS NOT NULL AND lead_id IN (
      SELECT id FROM leads WHERE tenant_id = get_current_tenant_id()
    ))
  );

-- ============================================================================
-- API KEYS TABLE RLS POLICIES
-- ============================================================================

CREATE POLICY api_keys_tenant_select ON api_keys
  FOR SELECT
  USING (tenant_id = get_current_tenant_id());

CREATE POLICY api_keys_tenant_insert ON api_keys
  FOR INSERT
  WITH CHECK (tenant_id = get_current_tenant_id());

CREATE POLICY api_keys_tenant_update ON api_keys
  FOR UPDATE
  USING (tenant_id = get_current_tenant_id())
  WITH CHECK (tenant_id = get_current_tenant_id());

CREATE POLICY api_keys_tenant_delete ON api_keys
  FOR DELETE
  USING (tenant_id = get_current_tenant_id());

-- ============================================================================
-- QR SESSIONS TABLE RLS POLICIES
-- ============================================================================

CREATE POLICY qr_sessions_tenant_select ON qr_sessions
  FOR SELECT
  USING (tenant_id = get_current_tenant_id());

CREATE POLICY qr_sessions_tenant_insert ON qr_sessions
  FOR INSERT
  WITH CHECK (tenant_id = get_current_tenant_id());

CREATE POLICY qr_sessions_tenant_update ON qr_sessions
  FOR UPDATE
  USING (tenant_id = get_current_tenant_id())
  WITH CHECK (tenant_id = get_current_tenant_id());

CREATE POLICY qr_sessions_tenant_delete ON qr_sessions
  FOR DELETE
  USING (tenant_id = get_current_tenant_id());

-- ============================================================================
-- LINKED DEVICES TABLE RLS POLICIES
-- ============================================================================

CREATE POLICY linked_devices_tenant_select ON linked_devices
  FOR SELECT
  USING (tenant_id = get_current_tenant_id());

CREATE POLICY linked_devices_tenant_insert ON linked_devices
  FOR INSERT
  WITH CHECK (tenant_id = get_current_tenant_id());

CREATE POLICY linked_devices_tenant_update ON linked_devices
  FOR UPDATE
  USING (tenant_id = get_current_tenant_id())
  WITH CHECK (tenant_id = get_current_tenant_id());

CREATE POLICY linked_devices_tenant_delete ON linked_devices
  FOR DELETE
  USING (tenant_id = get_current_tenant_id());

-- ============================================================================
-- SUPER ADMIN BYPASS POLICIES (Optional - for admin operations)
-- ============================================================================

-- Create a function to check if user is super admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN current_setting('app.is_super_admin', TRUE) = 'true';
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add bypass policies for super admin (allows cross-tenant access for admin operations)
-- Uncomment if you need super admin to see all data

-- CREATE POLICY contacts_super_admin_all ON contacts
--   FOR ALL
--   USING (is_super_admin())
--   WITH CHECK (is_super_admin());

-- CREATE POLICY companies_super_admin_all ON companies
--   FOR ALL
--   USING (is_super_admin())
--   WITH CHECK (is_super_admin());

-- (Repeat for other tables as needed)

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Add indexes on tenant_id columns for better query performance with RLS
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_tenant_id ON contacts(tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companies_tenant_id ON companies(tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_tenant_id ON leads(tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pipelines_tenant_id ON pipelines(tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_keys_tenant_id ON api_keys(tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_qr_sessions_tenant_id ON qr_sessions(tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_linked_devices_tenant_id ON linked_devices(tenant_id);

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Ensure the application user has necessary permissions
-- Replace 'app_user' with your actual database user name
-- GRANT EXECUTE ON FUNCTION get_current_tenant_id() TO app_user;
-- GRANT EXECUTE ON FUNCTION is_super_admin() TO app_user;

-- ============================================================================
-- VERIFICATION QUERIES (for testing)
-- ============================================================================

-- Test tenant isolation:
-- SET app.current_tenant_id = 'tenant-1-id';
-- SELECT * FROM contacts; -- Should only show tenant-1 contacts

-- SET app.current_tenant_id = 'tenant-2-id';
-- SELECT * FROM contacts; -- Should only show tenant-2 contacts

-- SET app.current_tenant_id = '';
-- SELECT * FROM contacts; -- Should return no rows

-- ============================================================================
-- NOTES
-- ============================================================================

-- 1. RLS policies are now enabled on all tenant-scoped tables
-- 2. The application MUST set app.current_tenant_id for each request
-- 3. Without setting the tenant context, queries will return no results
-- 4. Super admin bypass is commented out - enable if needed
-- 5. Activities table policies are simplified - may need refinement
-- 6. Remember to test thoroughly before deploying to production
-- 7. Consider adding tenant_id directly to activities table for better performance

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================

-- To rollback RLS (in case of issues):
-- ALTER TABLE contacts DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE companies DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE leads DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE pipelines DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE pipeline_stages DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE activities DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE api_keys DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE qr_sessions DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE linked_devices DISABLE ROW LEVEL SECURITY;

-- DROP FUNCTION IF EXISTS get_current_tenant_id();
-- DROP FUNCTION IF EXISTS is_super_admin();
