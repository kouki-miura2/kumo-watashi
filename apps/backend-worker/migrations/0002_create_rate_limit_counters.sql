-- Migration number: 0002 	 2026-09-22T00:00:00.000Z

-- docs/spec.md section 10. Fixed-window counters keyed by an arbitrary caller-defined string
-- (e.g. "join-code:<ip>:<clientId>"), reused by any endpoint that needs throttling — not specific
-- to Transfer Sessions. See repository/rate-limiter.d1.ts.

CREATE TABLE rate_limit_counters (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_started_at INTEGER NOT NULL
);
