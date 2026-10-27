ALTER TABLE operation_profiles ADD COLUMN owner_id TEXT;
CREATE INDEX IF NOT EXISTS operation_profiles_by_owner
  ON operation_profiles (plant_id, owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS demo_session_owners (
  session_id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  plant_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS demo_session_owners_by_visitor
  ON demo_session_owners (visitor_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS demo_session_owners_by_expiration
  ON demo_session_owners (expires_at);
