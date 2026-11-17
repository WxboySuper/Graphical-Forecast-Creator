CREATE TABLE telemetry_daily_counts (
  kind TEXT NOT NULL CHECK (kind IN ('visit', 'active')),
  day TEXT NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 0),
  PRIMARY KEY (kind, day)
);

CREATE TABLE telemetry_dedupe (
  kind TEXT NOT NULL CHECK (kind IN ('visit', 'active')),
  day TEXT NOT NULL,
  hash TEXT NOT NULL,
  PRIMARY KEY (kind, day, hash)
);

CREATE INDEX telemetry_dedupe_day_idx ON telemetry_dedupe(day);
