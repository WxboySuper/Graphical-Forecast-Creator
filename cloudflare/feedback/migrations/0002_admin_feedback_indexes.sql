CREATE INDEX feedback_status_created_id_idx ON feedback(status, created_at DESC, id DESC);
CREATE INDEX feedback_target_created_id_idx ON feedback(build_target, created_at DESC, id DESC);
CREATE INDEX feedback_category_created_id_idx ON feedback(category, created_at DESC, id DESC);

CREATE TABLE feedback_admin_attempts (
  key_hash TEXT PRIMARY KEY,
  window_started INTEGER NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts >= 0)
);
CREATE INDEX feedback_admin_attempts_window_idx ON feedback_admin_attempts(window_started);
