-- CVs and other files sent with an application. The careers site writes these
-- straight into this database (in chunks, since D1 caps a single value), so in
-- production the tables already exist; this makes the schema the portal reads
-- explicit and gives local and test databases the same shape.
CREATE TABLE IF NOT EXISTS careers_cv_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  chunks INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS careers_cv_chunks (
  file_id INTEGER NOT NULL REFERENCES careers_cv_files(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (file_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_careers_cv_files_candidate ON careers_cv_files(candidate_id);
