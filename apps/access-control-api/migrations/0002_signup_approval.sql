ALTER TABLE access_users ADD COLUMN global_view_only INTEGER NOT NULL DEFAULT 0 CHECK (global_view_only IN (0, 1));

CREATE TABLE access_signup_requests (
  auth0_sub TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX access_signup_requests_by_status ON access_signup_requests (status, requested_at DESC);
