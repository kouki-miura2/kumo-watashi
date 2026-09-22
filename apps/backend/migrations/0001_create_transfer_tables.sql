-- Migration number: 0001 	 2026-09-22T08:51:35.377Z

-- docs/spec.md section 25. File bodies live in R2 (repository/file-blob-store.r2.ts), keyed by
-- transfer_files.id — no separate blob-key column needed.

CREATE TABLE transfer_sessions (
  id TEXT PRIMARY KEY,
  join_code_hash TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  sender_label TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX idx_transfer_sessions_join_code_hash ON transfer_sessions (join_code_hash);
CREATE INDEX idx_transfer_sessions_secret_hash ON transfer_sessions (secret_hash);

CREATE TABLE transfer_files (
  id TEXT PRIMARY KEY,
  transfer_id TEXT NOT NULL REFERENCES transfer_sessions (id),
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_transfer_files_transfer_id ON transfer_files (transfer_id);
