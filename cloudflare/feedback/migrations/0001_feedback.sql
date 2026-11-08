CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  uid_hash TEXT NOT NULL,
  email TEXT,
  category TEXT NOT NULL CHECK (category IN ('bug', 'idea', 'praise', 'question', 'other')),
  message TEXT NOT NULL,
  page TEXT NOT NULL,
  app_version TEXT NOT NULL,
  build_target TEXT NOT NULL CHECK (build_target IN ('beta', 'production')),
  plan TEXT CHECK (plan IS NULL OR plan IN ('free', 'premium')),
  viewport TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'triaged', 'resolved', 'wontfix')),
  discord_status TEXT NOT NULL DEFAULT 'disabled' CHECK (discord_status IN ('pending', 'sent', 'failed', 'disabled')),
  user_agent TEXT NOT NULL DEFAULT ''
);

CREATE INDEX feedback_created_id_idx ON feedback(created_at DESC, id DESC);
CREATE INDEX feedback_uid_created_idx ON feedback(uid_hash, created_at DESC);
