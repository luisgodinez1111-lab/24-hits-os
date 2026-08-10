-- Row Level Security (RLS) — última red de aislamiento entre tenants (ADR-004).
--
-- Convenciones de sesión (fijadas con SET LOCAL / set_config(..., true)):
--   app.current_org_id : UUID de la organización activa (operaciones de tenant).
--   app.bypass_rls     : 'on' para operaciones de sistema (bootstrap/seed).
--
-- Se aplica a las tablas OPERATIVAS org-scoped. Las tablas estructurales de IAM
-- (Role, Membership, etc.) y de identidad se protegen en la capa de aplicación,
-- pues el resolentor de permisos y los flujos de auth requieren lecturas cruzadas.
-- Se usa FORCE para que aplique también al rol dueño de las tablas.

-- Helper inline repetido por tabla (Postgres no permite políticas parametrizadas).

-- ---------------------------------------------------------------- Branch
ALTER TABLE "Branch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Branch" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Branch"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid
  );

-- ---------------------------------------------------------------- Warehouse
ALTER TABLE "Warehouse" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Warehouse" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Warehouse"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid
  );

-- ---------------------------------------------------------------- OrganizationSettings
ALTER TABLE "OrganizationSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrganizationSettings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OrganizationSettings"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid
  );

-- ---------------------------------------------------------------- FeatureFlag
ALTER TABLE "FeatureFlag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeatureFlag" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FeatureFlag"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "organizationId" = nullif(current_setting('app.current_org_id', true), '')::uuid
  );
