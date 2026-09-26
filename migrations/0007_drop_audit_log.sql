-- The portal has a single user, so a log of who changed what isn't needed.
-- Nothing writes to or reads from this table any more.
DROP INDEX IF EXISTS idx_audit_log_at;
DROP TABLE IF EXISTS audit_log;
