CREATE TABLE IF NOT EXISTS demo_visitors (
  visitor_id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS demo_visitors_by_expiration ON demo_visitors (expires_at);
