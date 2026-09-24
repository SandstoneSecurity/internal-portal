-- Makes the portal writable: real dates instead of pre-formatted labels, an
-- audit log of every change, and the reference lists the forms choose from.

-- ISO dates (YYYY-MM-DD / ISO timestamps). The old *_label / expiry_soon /
-- is_late columns stay for rows written before this migration; the Worker
-- prefers the ISO column when it is set and derives labels and flags from it.
ALTER TABLE ops_cards ADD COLUMN due_date TEXT;
ALTER TABLE ops_cards ADD COLUMN created_at TEXT;
ALTER TABLE employees ADD COLUMN licence_expiry_date TEXT;
ALTER TABLE intel_feed ADD COLUMN created_at TEXT;
ALTER TABLE candidates ADD COLUMN stage_since TEXT;

-- Every write through the API leaves a record: who (Cloudflare Access email),
-- when, what, and a one-line human summary.
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  summary TEXT NOT NULL
);
CREATE INDEX idx_audit_log_at ON audit_log(at);

-- Reference data the forms depend on. Written as one statement per row (D1
-- caps compound SELECTs), and never disturbs a database already loaded from
-- seed/seed.sql: board columns are only added while the board holds nothing
-- but these standard columns, and regions are keyed so re-runs are no-ops.
INSERT INTO ops_columns (label, is_done, sort_order)
SELECT 'Raised', 0, 1
WHERE NOT EXISTS (SELECT 1 FROM ops_columns WHERE label NOT IN ('Raised', 'In preparation', 'Awaiting sign-off', 'Complete'))
  AND NOT EXISTS (SELECT 1 FROM ops_columns WHERE label = 'Raised');
INSERT INTO ops_columns (label, is_done, sort_order)
SELECT 'In preparation', 0, 2
WHERE NOT EXISTS (SELECT 1 FROM ops_columns WHERE label NOT IN ('Raised', 'In preparation', 'Awaiting sign-off', 'Complete'))
  AND NOT EXISTS (SELECT 1 FROM ops_columns WHERE label = 'In preparation');
INSERT INTO ops_columns (label, is_done, sort_order)
SELECT 'Awaiting sign-off', 0, 3
WHERE NOT EXISTS (SELECT 1 FROM ops_columns WHERE label NOT IN ('Raised', 'In preparation', 'Awaiting sign-off', 'Complete'))
  AND NOT EXISTS (SELECT 1 FROM ops_columns WHERE label = 'Awaiting sign-off');
INSERT INTO ops_columns (label, is_done, sort_order)
SELECT 'Complete', 1, 4
WHERE NOT EXISTS (SELECT 1 FROM ops_columns WHERE label NOT IN ('Raised', 'In preparation', 'Awaiting sign-off', 'Complete'))
  AND NOT EXISTS (SELECT 1 FROM ops_columns WHERE label = 'Complete');

INSERT OR IGNORE INTO regions (key, label, map_x, map_y, label_anchor, label_dx, label_dy) VALUES ('syd', 'Sydney', 598, 370, 'start', 10, 4);
INSERT OR IGNORE INTO regions (key, label, map_x, map_y, label_anchor, label_dx, label_dy) VALUES ('new', 'Newcastle', 631, 311, 'start', 10, 4);
INSERT OR IGNORE INTO regions (key, label, map_x, map_y, label_anchor, label_dx, label_dy) VALUES ('wol', 'Wollongong', 579, 405, 'start', 10, 12);
INSERT OR IGNORE INTO regions (key, label, map_x, map_y, label_anchor, label_dx, label_dy) VALUES ('cof', 'Coffs Harbour', 708, 145, 'end', -10, 4);
INSERT OR IGNORE INTO regions (key, label, map_x, map_y, label_anchor, label_dx, label_dy) VALUES ('dub', 'Dubbo', 447, 268, 'start', 10, 4);
INSERT OR IGNORE INTO regions (key, label, map_x, map_y, label_anchor, label_dx, label_dy) VALUES ('wag', 'Wagga Wagga', 375, 448, 'start', 10, 4);
INSERT OR IGNORE INTO regions (key, label, map_x, map_y, label_anchor, label_dx, label_dy) VALUES ('bhq', 'Broken Hill', 33, 250, 'start', 10, 4);
INSERT OR IGNORE INTO regions (key, label, map_x, map_y, label_anchor, label_dx, label_dy) VALUES ('tam', 'Tamworth', 582, 195, 'end', -10, 4);
