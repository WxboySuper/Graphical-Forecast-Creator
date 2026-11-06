-- Keep workflow records bounded to the same 750 KB request limit as the Worker.
CREATE TRIGGER IF NOT EXISTS enforce_workflow_awareness_payload_insert_limit
BEFORE INSERT ON workflow_awareness
WHEN length(CAST(NEW.data_json AS BLOB)) > 750000
BEGIN
  SELECT RAISE(ABORT, 'workflow_awareness_too_large');
END;

CREATE TRIGGER IF NOT EXISTS enforce_workflow_awareness_payload_update_limit
BEFORE UPDATE OF data_json ON workflow_awareness
WHEN length(CAST(NEW.data_json AS BLOB)) > 750000
BEGIN
  SELECT RAISE(ABORT, 'workflow_awareness_too_large');
END;
