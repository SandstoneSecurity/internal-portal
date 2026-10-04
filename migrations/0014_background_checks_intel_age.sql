-- Intelligence items now grey out with age and leave the feed after a fortnight, judged from when they
-- were logged. Items from before that was recorded start their clock now rather than vanishing at once.
UPDATE intel_feed SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE created_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_intel_feed_created ON intel_feed(created_at);

-- Background checks run for clients: one file per subject, a row per check ordered.
CREATE TABLE background_checks (
  id INTEGER PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id),
  subject TEXT NOT NULL,
  subject_kind TEXT NOT NULL DEFAULT 'Individual',
  purpose TEXT NOT NULL DEFAULT 'Pre-employment',
  details TEXT NOT NULL DEFAULT '',
  consent_date TEXT,
  due_date TEXT,
  owner_initials TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  closed_at TEXT
);
CREATE INDEX idx_background_checks_client ON background_checks(client_id);

CREATE TABLE background_check_items (
  id INTEGER PRIMARY KEY,
  check_id INTEGER NOT NULL REFERENCES background_checks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  result TEXT NOT NULL DEFAULT 'pending',
  finding TEXT NOT NULL DEFAULT '',
  completed_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_background_check_items_check ON background_check_items(check_id);
