-- Case notes: running notes on a case's summary (analyst notes, client calls, decisions), each dated and
-- attributed. Only whoever wrote a note can change or remove it, and each change is in the case's audit log.
CREATE TABLE inv_notes (
  id INTEGER PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES inv_cases(id),
  body TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX idx_inv_notes_case ON inv_notes(case_id);
