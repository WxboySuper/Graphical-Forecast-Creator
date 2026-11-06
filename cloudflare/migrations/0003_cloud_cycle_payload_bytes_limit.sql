CREATE TRIGGER IF NOT EXISTS enforce_cloud_cycle_payload_insert_bytes
BEFORE INSERT ON cloud_cycles
WHEN length(CAST(NEW.payload_json AS BLOB)) > 750000
BEGIN
  SELECT RAISE(ABORT, 'cloud_cycle_too_large');
END;

CREATE TRIGGER IF NOT EXISTS enforce_cloud_cycle_payload_update_bytes
BEFORE UPDATE OF payload_json ON cloud_cycles
WHEN length(CAST(NEW.payload_json AS BLOB)) > 750000
BEGIN
  SELECT RAISE(ABORT, 'cloud_cycle_too_large');
END;
