CREATE TABLE IF NOT EXISTS saved_studies (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  plant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS saved_studies_by_owner
  ON saved_studies (owner_id, plant_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS saved_study_versions (
  study_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  source_session_id TEXT NOT NULL,
  source_study_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  payload_size INTEGER NOT NULL,
  PRIMARY KEY (study_id, version)
);
CREATE INDEX IF NOT EXISTS saved_study_versions_by_source_session
  ON saved_study_versions (source_session_id);
CREATE TRIGGER IF NOT EXISTS delete_saved_study_versions
AFTER DELETE ON saved_studies
BEGIN
  DELETE FROM saved_study_versions WHERE study_id = OLD.id;
END;

CREATE TABLE IF NOT EXISTS demo_study_owner_keys (
  visitor_id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
