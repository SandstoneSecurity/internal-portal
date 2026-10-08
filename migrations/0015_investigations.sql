-- Investigations: a case opened on a client's request, with its evidence register (files kept here with
-- their SHA-256), link chart, timeline, report versions and an append-only audit log.
CREATE TABLE inv_cases (
  id INTEGER PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id),
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'Other',
  instructions TEXT NOT NULL DEFAULT '',
  legal_basis TEXT NOT NULL DEFAULT '',
  requested_at TEXT,
  requested_by TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Intake',
  lead TEXT NOT NULL DEFAULT '',
  access TEXT NOT NULL DEFAULT '',
  due_date TEXT,
  evidence_seq INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  closed_at TEXT
);
CREATE INDEX idx_inv_cases_client ON inv_cases(client_id);

CREATE TABLE inv_files (
  id INTEGER PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES inv_cases(id),
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  chunks INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_inv_files_case ON inv_files(case_id);
CREATE TABLE inv_file_chunks (
  file_id INTEGER NOT NULL REFERENCES inv_files(id),
  seq INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (file_id, seq)
);

CREATE TABLE inv_evidence (
  id INTEGER PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES inv_cases(id),
  seq INTEGER NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'Document',
  source TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  obtained_at TEXT,
  obtained_by TEXT NOT NULL DEFAULT '',
  reliability TEXT NOT NULL DEFAULT 'F',
  credibility TEXT NOT NULL DEFAULT '6',
  notes TEXT NOT NULL DEFAULT '',
  file_id INTEGER REFERENCES inv_files(id),
  capture TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (case_id, seq)
);

CREATE TABLE inv_entities (
  id INTEGER PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES inv_cases(id),
  kind TEXT NOT NULL DEFAULT 'Person',
  name TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  x REAL,
  y REAL
);
CREATE INDEX idx_inv_entities_case ON inv_entities(case_id);

CREATE TABLE inv_links (
  id INTEGER PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES inv_cases(id),
  from_id INTEGER NOT NULL REFERENCES inv_entities(id),
  to_id INTEGER NOT NULL REFERENCES inv_entities(id),
  label TEXT NOT NULL,
  evidence_id INTEGER REFERENCES inv_evidence(id),
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_inv_links_case ON inv_links(case_id);

CREATE TABLE inv_events (
  id INTEGER PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES inv_cases(id),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  basis TEXT NOT NULL DEFAULT 'Documented',
  place TEXT NOT NULL DEFAULT '',
  lat REAL,
  lng REAL,
  evidence_id INTEGER REFERENCES inv_evidence(id),
  entity_ids TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_inv_events_case ON inv_events(case_id);

CREATE TABLE inv_reports (
  id INTEGER PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES inv_cases(id),
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  file_id INTEGER REFERENCES inv_files(id),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (case_id, version)
);

-- Append-only: nothing in the API edits or deletes a row here except deleting the whole case.
CREATE TABLE inv_log (
  id INTEGER PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES inv_cases(id),
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_inv_log_case ON inv_log(case_id);
