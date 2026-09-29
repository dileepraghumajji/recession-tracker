-- Macro Recession Stress Monitor schema

CREATE TABLE IF NOT EXISTS series_meta (
  series_key          TEXT PRIMARY KEY,
  provider            TEXT NOT NULL,
  source_id           TEXT NOT NULL,
  fetched_at          TIMESTAMPTZ,
  source_last_updated TIMESTAMPTZ,
  fetch_status        TEXT NOT NULL DEFAULT 'never',
  fetch_error         TEXT,
  synthetic           BOOLEAN NOT NULL DEFAULT FALSE,
  obs_count           INTEGER NOT NULL DEFAULT 0,
  first_date          DATE,
  last_date           DATE
);

CREATE TABLE IF NOT EXISTS observations (
  series_key TEXT NOT NULL REFERENCES series_meta(series_key) ON DELETE CASCADE,
  obs_date   DATE NOT NULL,
  value      DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (series_key, obs_date)
);

CREATE TABLE IF NOT EXISTS score_snapshots (
  as_of        DATE PRIMARY KEY,
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  recession    DOUBLE PRECISION,
  inflation    DOUBLE PRECISION,
  financial    DOUBLE PRECISION,
  overall      DOUBLE PRECISION,
  regime       TEXT,
  freshness    DOUBLE PRECISION,
  payload      JSONB
);

CREATE TABLE IF NOT EXISTS alerts (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  rule               JSONB NOT NULL,
  enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_state         BOOLEAN,
  last_value         DOUBLE PRECISION,
  last_evaluated_at  TIMESTAMPTZ,
  last_triggered_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS alert_events (
  id           BIGSERIAL PRIMARY KEY,
  alert_id     TEXT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  message      TEXT NOT NULL,
  value        DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS alert_events_time ON alert_events (triggered_at DESC);

CREATE TABLE IF NOT EXISTS schema_migrations (
  name       TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
