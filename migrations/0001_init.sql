-- Sandstone internal portal — initial schema.
-- Status "kind" columns take one of: secure | advisory | breach | info | neutral
-- (see src/lib/status.ts for how the UI turns a kind into colour tokens).

CREATE TABLE metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  unit TEXT NOT NULL,
  note TEXT NOT NULL,
  note_kind TEXT NOT NULL DEFAULT 'neutral',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  licence_class TEXT NOT NULL,
  licence_expiry TEXT NOT NULL,
  expiry_soon INTEGER NOT NULL DEFAULT 0,
  site TEXT NOT NULL,
  status TEXT NOT NULL,
  status_kind TEXT NOT NULL DEFAULT 'neutral',
  employed_since TEXT NOT NULL,
  first_aid TEXT NOT NULL DEFAULT 'HLTAID011 · MAY 27',
  mobile TEXT NOT NULL,
  employment_type TEXT NOT NULL DEFAULT 'FULL TIME'
);

CREATE TABLE employee_shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  shift_date TEXT NOT NULL,
  span TEXT NOT NULL,
  site TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE clients (
  id INTEGER PRIMARY KEY,
  org TEXT NOT NULL,
  sector TEXT NOT NULL,
  sites INTEGER NOT NULL,
  value_pa TEXT NOT NULL,
  owner_initials TEXT NOT NULL,
  status TEXT NOT NULL,
  status_kind TEXT NOT NULL DEFAULT 'neutral',
  meta TEXT NOT NULL
);

CREATE TABLE client_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE client_deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL UNIQUE REFERENCES clients(id),
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  stage TEXT NOT NULL,
  review_date TEXT NOT NULL
);

CREATE TABLE client_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  activity_date TEXT NOT NULL,
  body TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE ops_columns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  is_done INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE ops_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  column_id INTEGER NOT NULL REFERENCES ops_columns(id),
  ref TEXT NOT NULL,
  title TEXT NOT NULL,
  site TEXT NOT NULL,
  line TEXT NOT NULL,
  due_label TEXT NOT NULL,
  is_late INTEGER NOT NULL DEFAULT 0,
  owner_initials TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE gantt_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  num TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE gantt_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER NOT NULL REFERENCES gantt_sections(id),
  name TEXT NOT NULL,
  start_day INTEGER NOT NULL,
  end_day INTEGER NOT NULL,
  kind TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE roles (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  meta TEXT NOT NULL,
  status TEXT NOT NULL,
  status_kind TEXT NOT NULL DEFAULT 'neutral',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  stage INTEGER NOT NULL,
  name TEXT NOT NULL,
  licence TEXT NOT NULL,
  licence_ok INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL,
  days_in_stage INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE regions (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  map_x REAL NOT NULL,
  map_y REAL NOT NULL,
  label_anchor TEXT NOT NULL,
  label_dx REAL NOT NULL,
  label_dy REAL NOT NULL
);

CREATE TABLE intel_feed (
  id INTEGER PRIMARY KEY,
  time_label TEXT NOT NULL,
  severity TEXT NOT NULL,
  severity_kind TEXT NOT NULL,
  region_key TEXT NOT NULL REFERENCES regions(key),
  headline TEXT NOT NULL,
  source TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_employee_shifts_employee ON employee_shifts(employee_id);
CREATE INDEX idx_client_contacts_client ON client_contacts(client_id);
CREATE INDEX idx_client_activity_client ON client_activity(client_id);
CREATE INDEX idx_ops_cards_column ON ops_cards(column_id);
CREATE INDEX idx_gantt_tasks_section ON gantt_tasks(section_id);
CREATE INDEX idx_candidates_role ON candidates(role_id);
CREATE INDEX idx_intel_feed_region ON intel_feed(region_key);
