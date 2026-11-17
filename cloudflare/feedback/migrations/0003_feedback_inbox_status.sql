-- Preserve existing submissions while replacing the original status check.
CREATE TABLE feedback_inbox (
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
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'handled')),
  handled_at INTEGER,
  discord_status TEXT NOT NULL DEFAULT 'disabled' CHECK (discord_status IN ('pending', 'sent', 'failed', 'disabled')),
  user_agent TEXT NOT NULL DEFAULT ''
);

INSERT INTO feedback_inbox (id, created_at, uid_hash, email, category, message, page, app_version, build_target, plan, viewport, status, handled_at, discord_status, user_agent)
SELECT id, created_at, uid_hash, email, category, message, page, app_version, build_target, plan, viewport,
  CASE WHEN status IN ('new', 'read', 'handled') THEN status WHEN status IN ('resolved', 'wontfix') THEN 'handled' ELSE 'read' END,
  CASE WHEN status IN ('handled', 'resolved', 'wontfix') THEN created_at ELSE NULL END,
  discord_status, user_agent
FROM feedback;

DROP TABLE feedback;
ALTER TABLE feedback_inbox RENAME TO feedback;
CREATE INDEX feedback_created_id_idx ON feedback(created_at DESC, id DESC);
CREATE INDEX feedback_uid_created_idx ON feedback(uid_hash, created_at DESC);
CREATE INDEX feedback_status_created_id_idx ON feedback(status, created_at DESC, id DESC);
CREATE INDEX feedback_target_created_id_idx ON feedback(build_target, created_at DESC, id DESC);
CREATE INDEX feedback_category_created_id_idx ON feedback(category, created_at DESC, id DESC);
