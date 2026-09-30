-- Resumable background jobs of the India Market Sentiment Terminal (e.g. the
-- market-breadth computation, which spans several time-limited invocations).
-- A lease (owner + expiry) guarantees only one instance works on a job at a time;
-- state is saved only by the current lease holder.

CREATE TABLE IF NOT EXISTS india_jobs (
  job_key     TEXT PRIMARY KEY,
  state       JSONB,
  lease_owner TEXT,
  lease_until TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
