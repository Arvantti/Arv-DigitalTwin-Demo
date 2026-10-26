CREATE TABLE IF NOT EXISTS operation_profiles (
  id TEXT PRIMARY KEY,
  plant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS operation_profiles_by_plant_updated
  ON operation_profiles (plant_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS samples (
  session_id TEXT NOT NULL,
  t REAL NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (session_id, t)
);
CREATE TABLE IF NOT EXISTS commands (
  session_id TEXT NOT NULL,
  t REAL NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS commands_by_session_time ON commands (session_id, t);

CREATE TABLE IF NOT EXISTS scene_frames (
  session_id TEXT NOT NULL,
  t REAL NOT NULL,
  snapshot TEXT NOT NULL,
  PRIMARY KEY (session_id, t)
);
CREATE TABLE IF NOT EXISTS recommendations (
  session_id TEXT NOT NULL,
  recommendation_id TEXT NOT NULL,
  t REAL NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (session_id, recommendation_id)
);
CREATE TABLE IF NOT EXISTS fractal_studies (
  session_id TEXT NOT NULL,
  study_id TEXT NOT NULL,
  t REAL NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (session_id, study_id)
);
CREATE INDEX IF NOT EXISTS fractal_studies_by_session_time
  ON fractal_studies (session_id, t DESC);

CREATE TABLE IF NOT EXISTS session_checkpoints (
  session_id TEXT PRIMARY KEY,
  plant_id TEXT NOT NULL,
  simulated_t REAL NOT NULL,
  schema_version INTEGER NOT NULL,
  payload BLOB NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS session_checkpoints_by_plant
  ON session_checkpoints (plant_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  event_id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  plant_id TEXT NOT NULL,
  session_id TEXT,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_events_by_plant_time
  ON audit_events (plant_id, created_at DESC);
