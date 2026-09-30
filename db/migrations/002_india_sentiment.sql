-- India Market Sentiment Terminal schema (tables are prefixed india_ so the
-- dashboard stays isolated from other dashboards sharing the database).

CREATE TABLE IF NOT EXISTS india_series_meta (
  series_key          TEXT PRIMARY KEY,
  kind                TEXT NOT NULL,
  source_id           TEXT NOT NULL,
  origin              TEXT NOT NULL,
  fetched_at          TIMESTAMPTZ,
  source_last_updated TIMESTAMPTZ,
  fetch_status        TEXT NOT NULL DEFAULT 'never',
  fetch_error         TEXT,
  synthetic           BOOLEAN NOT NULL DEFAULT FALSE,
  obs_count           INTEGER NOT NULL DEFAULT 0,
  first_date          DATE,
  last_date           DATE
);

CREATE TABLE IF NOT EXISTS india_observations (
  series_key TEXT NOT NULL REFERENCES india_series_meta(series_key) ON DELETE CASCADE,
  obs_date   DATE NOT NULL,
  value      DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (series_key, obs_date)
);

-- Latest full option chain per underlying (every record: underlying, expiry,
-- strike, type, LTP, volume, OI, change in OI, IV, bid, ask, timestamp, lot size).
CREATE TABLE IF NOT EXISTS india_option_chains (
  underlying  TEXT PRIMARY KEY,
  snapshot    JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Intraday premium-pressure points computed from consecutive chain snapshots.
CREATE TABLE IF NOT EXISTS india_option_intraday (
  underlying TEXT NOT NULL,
  ts         TIMESTAMPTZ NOT NULL,
  point      JSONB NOT NULL,
  PRIMARY KEY (underlying, ts)
);

CREATE TABLE IF NOT EXISTS india_score_snapshots (
  as_of        DATE PRIMARY KEY,
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  score        DOUBLE PRECISION,
  confidence   DOUBLE PRECISION,
  band         TEXT,
  regime       TEXT,
  payload      JSONB
);

CREATE TABLE IF NOT EXISTS india_alerts (
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

CREATE TABLE IF NOT EXISTS india_alert_events (
  id           BIGSERIAL PRIMARY KEY,
  alert_id     TEXT NOT NULL REFERENCES india_alerts(id) ON DELETE CASCADE,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  message      TEXT NOT NULL,
  value        DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS india_alert_events_time ON india_alert_events (triggered_at DESC);
