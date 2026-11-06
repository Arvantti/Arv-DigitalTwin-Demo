CREATE TABLE IF NOT EXISTS comparison_source_events (
  event_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  comparison_id TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS comparison_source_events_latest
  ON comparison_source_events (session_id, comparison_id, source, created_at);
