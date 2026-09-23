-- Migration number: 0003 	 2026-09-22T00:00:00.000Z

-- docs/spec.md section 5.1 — a single-row lease lock coordinating opportunistic expired-session
-- cleanup across requests instead of a Cloudflare Workers Cron Trigger (Cron's 10ms Free-plan CPU
-- budget per invocation is too tight for an unbounded delete sweep). Whichever request's
-- conditional UPDATE claims the lease (locked_until in the future) runs the sweep and releases it
-- immediately after; every other concurrent request sees the row still locked and proceeds without
-- waiting. See repository/cleanup-lock.d1.ts.

CREATE TABLE cleanup_lock (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  locked_until INTEGER NOT NULL
);

INSERT INTO cleanup_lock (id, locked_until) VALUES (1, 0);
