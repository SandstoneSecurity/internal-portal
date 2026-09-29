-- Building geometry and CCTV cameras for the threat model's 3D site views.

-- Walls and openings for each level, as JSON (see shared/geometry.ts). Points
-- are fractions of the plan, so setting the scale moves nothing.
ALTER TABLE site_levels ADD COLUMN geometry TEXT NOT NULL DEFAULT '';
-- 1 once someone has measured the plan's scale (width_m is then real).
ALTER TABLE site_levels ADD COLUMN scale_set INTEGER NOT NULL DEFAULT 0;

CREATE TABLE tm_cameras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL REFERENCES client_sites(id) ON DELETE CASCADE,
  level_id INTEGER REFERENCES site_levels(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'fixed',
  -- Position as fractions of the plan.
  x REAL NOT NULL,
  y REAL NOT NULL,
  height_m REAL NOT NULL DEFAULT 3,
  -- Degrees clockwise from plan east; tilt is degrees below horizontal.
  yaw REAL NOT NULL DEFAULT 0,
  tilt REAL NOT NULL DEFAULT 25,
  hfov REAL NOT NULL DEFAULT 85,
  res_w INTEGER NOT NULL DEFAULT 2560,
  res_h INTEGER NOT NULL DEFAULT 1440,
  range_m REAL NOT NULL DEFAULT 30,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_tm_cameras_site ON tm_cameras(site_id);
