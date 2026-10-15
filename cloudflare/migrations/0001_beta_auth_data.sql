CREATE TABLE IF NOT EXISTS users (
  clerk_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  legacy_uid TEXT UNIQUE,
  email_verified INTEGER NOT NULL CHECK (email_verified IN (0, 1)),
  display_name TEXT NOT NULL DEFAULT '',
  beta_access INTEGER NOT NULL DEFAULT 0 CHECK (beta_access IN (0, 1)),
  migration_status TEXT NOT NULL DEFAULT 'no_match' CHECK (migration_status IN ('migrating', 'complete', 'no_match', 'failed')),
  migrated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS users_legacy_uid_idx ON users(legacy_uid);

-- Worker account deletion removes dependent rows explicitly. D1 connection
-- PRAGMA settings are not persisted, so these declarations are not the cleanup guarantee.
CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(clerk_id) ON DELETE CASCADE,
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS user_entitlements (
  user_id TEXT PRIMARY KEY REFERENCES users(clerk_id) ON DELETE CASCADE,
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS user_metrics (
  user_id TEXT PRIMARY KEY REFERENCES users(clerk_id) ON DELETE CASCADE,
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS cloud_cycles (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(clerk_id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  cycle_date TEXT NOT NULL,
  metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json)),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  payload_bytes INTEGER NOT NULL CHECK (payload_bytes >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS cloud_cycles_user_updated_idx ON cloud_cycles(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS workflow_awareness (
  user_id TEXT NOT NULL REFERENCES users(clerk_id) ON DELETE CASCADE,
  cycle_id TEXT NOT NULL,
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  PRIMARY KEY (user_id, cycle_id)
);

CREATE TABLE IF NOT EXISTS custom_products (
  user_id TEXT NOT NULL REFERENCES users(clerk_id) ON DELETE CASCADE,
  slot_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  PRIMARY KEY (user_id, slot_id),
  UNIQUE (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS stripe_events (
  event_id TEXT PRIMARY KEY,
  processed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS stripe_events_processed_idx ON stripe_events(processed_at);

CREATE TABLE IF NOT EXISTS billing_cleanup_queue (
  stripe_customer_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS product_metric_events (
  event_id TEXT PRIMARY KEY,
  event_date TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('account_signup', 'account_signin', 'cycle_saved', 'discussion_saved', 'verification_run', 'cloud_cycle_saved', 'cloud_cycle_loaded', 'upgrades', 'cancellations')),
  user_id TEXT NOT NULL REFERENCES users(clerk_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS product_metric_events_date_user_idx ON product_metric_events(event_date, user_id);

-- Forecast drafts, discussions and verification sessions are currently local
-- browser workflow state. This table supports future opt-in server persistence
-- without pretending those records were part of the Firestore snapshot.
CREATE TABLE IF NOT EXISTS user_records (
  user_id TEXT NOT NULL REFERENCES users(clerk_id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (record_type IN ('forecast', 'discussion', 'verification')),
  record_id TEXT NOT NULL,
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, record_type, record_id)
);
CREATE INDEX IF NOT EXISTS user_records_user_type_updated_idx ON user_records(user_id, record_type, updated_at DESC);
