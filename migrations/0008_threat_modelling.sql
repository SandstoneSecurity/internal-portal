-- Threat modelling: a client's sites (with floor plans per level), the model
-- elements placed on them (zones, assets, entry points), threat scenarios drawn
-- from the library in shared/threatLibrary.ts, the controls applied, and the
-- incidents actually observed, which calibrate the scenario frequencies.

-- Organisation profile used to scale losses and staff-based threats.
ALTER TABLE clients ADD COLUMN staff INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clients ADD COLUMN revenue INTEGER NOT NULL DEFAULT 0;
-- Years of incident history the logged incidents cover (0 = none recorded yet).
ALTER TABLE clients ADD COLUMN history_years INTEGER NOT NULL DEFAULT 0;

CREATE TABLE client_sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  suburb TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'NSW',
  postcode TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'office',
  occupants INTEGER NOT NULL DEFAULT 0,
  -- Local crime relative to the state average (1 = average).
  crime_factor REAL NOT NULL DEFAULT 1,
  hours TEXT NOT NULL DEFAULT 'Business hours',
  notes TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_client_sites_client ON client_sites(client_id);

-- Floor plans, stored in chunks like candidates' CVs (D1 caps a single value).
CREATE TABLE site_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES client_sites(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  chunks INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE site_file_chunks (
  file_id INTEGER NOT NULL REFERENCES site_files(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (file_id, seq)
);

CREATE TABLE site_levels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES client_sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- Stacking order, ground first.
  sort_order INTEGER NOT NULL DEFAULT 0,
  height_m REAL NOT NULL DEFAULT 3.6,
  -- Real-world width the floor plan spans, for 3D scale.
  width_m REAL NOT NULL DEFAULT 40,
  plan_file_id INTEGER REFERENCES site_files(id) ON DELETE SET NULL,
  plan_w INTEGER,
  plan_h INTEGER
);
CREATE INDEX idx_site_levels_site ON site_levels(site_id);

-- Zones, assets and entry points. Positions are fractions of the floor plan (0–1).
CREATE TABLE tm_elements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES client_sites(id) ON DELETE CASCADE,
  level_id INTEGER REFERENCES site_levels(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  subtype TEXT NOT NULL DEFAULT '',
  value INTEGER NOT NULL DEFAULT 0,
  criticality INTEGER NOT NULL DEFAULT 3,
  zone_id INTEGER REFERENCES tm_elements(id) ON DELETE SET NULL,
  x REAL,
  y REAL,
  w REAL,
  h REAL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_tm_elements_site ON tm_elements(site_id);

-- A threat acting on the organisation or one of its sites. Rate and loss
-- columns override the library (NULL = use the library value).
CREATE TABLE tm_scenarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  site_id INTEGER REFERENCES client_sites(id) ON DELETE CASCADE,
  threat_key TEXT NOT NULL,
  element_id INTEGER REFERENCES tm_elements(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT '',
  domain TEXT NOT NULL DEFAULT '',
  rate_low REAL,
  rate_typical REAL,
  rate_high REAL,
  loss_low INTEGER,
  loss_typical INTEGER,
  loss_high INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_tm_scenarios_client ON tm_scenarios(client_id);

CREATE TABLE tm_controls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  site_id INTEGER REFERENCES client_sites(id) ON DELETE CASCADE,
  control_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'In place',
  capex INTEGER NOT NULL DEFAULT 0,
  opex INTEGER NOT NULL DEFAULT 0,
  effectiveness REAL NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_tm_controls_client ON tm_controls(client_id);

CREATE TABLE tm_incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  site_id INTEGER REFERENCES client_sites(id) ON DELETE CASCADE,
  threat_key TEXT NOT NULL,
  occurred_on TEXT NOT NULL,
  loss INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_tm_incidents_client ON tm_incidents(client_id);
