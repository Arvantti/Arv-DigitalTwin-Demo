CREATE TABLE IF NOT EXISTS access_users (
  auth0_sub TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('client', 'reseller')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS twin_access_grants (
  auth0_sub TEXT NOT NULL REFERENCES access_users(auth0_sub) ON DELETE CASCADE,
  twin_id TEXT NOT NULL,
  permission TEXT NOT NULL CHECK (permission IN (
    'view', 'saved_studies.read', 'saved_studies.create', 'saved_studies.edit'
  )),
  granted_by TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  PRIMARY KEY (auth0_sub, twin_id, permission)
);
CREATE INDEX IF NOT EXISTS twin_access_grants_by_twin ON twin_access_grants (twin_id, permission);

CREATE TABLE IF NOT EXISTS access_admin_audit (
  id TEXT PRIMARY KEY,
  actor_sub TEXT NOT NULL,
  target_sub TEXT NOT NULL,
  twin_id TEXT,
  action TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS access_admin_audit_by_target ON access_admin_audit (target_sub, created_at DESC);
