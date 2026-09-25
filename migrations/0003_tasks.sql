-- Turns the operations board into a task board: three sections (To do, In
-- progress, Complete), richer tasks (description, start date, priority,
-- completion time) and subtasks with their own owner and dates.

ALTER TABLE ops_cards ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE ops_cards ADD COLUMN start_date TEXT;
ALTER TABLE ops_cards ADD COLUMN priority TEXT NOT NULL DEFAULT 'None';
ALTER TABLE ops_cards ADD COLUMN completed_at TEXT;

CREATE TABLE ops_subtasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL REFERENCES ops_cards(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  owner_initials TEXT NOT NULL DEFAULT '',
  start_date TEXT,
  due_date TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX idx_ops_subtasks_card ON ops_subtasks(card_id);

-- Fold the four-stage board into three. Cards awaiting sign-off are still in
-- progress, so they move there before that column goes. Only the standard
-- labels are touched; a board someone has customised keeps its columns.
UPDATE ops_cards
SET column_id = (SELECT id FROM ops_columns WHERE label = 'In preparation' LIMIT 1)
WHERE column_id IN (SELECT id FROM ops_columns WHERE label = 'Awaiting sign-off')
  AND EXISTS (SELECT 1 FROM ops_columns WHERE label = 'In preparation');
DELETE FROM ops_columns
WHERE label = 'Awaiting sign-off'
  AND NOT EXISTS (SELECT 1 FROM ops_cards WHERE ops_cards.column_id = ops_columns.id);

UPDATE ops_columns SET label = 'To do', sort_order = 1 WHERE label = 'Raised';
UPDATE ops_columns SET label = 'In progress', sort_order = 2 WHERE label = 'In preparation';
UPDATE ops_columns SET label = 'Complete', sort_order = 3 WHERE is_done = 1 AND label LIKE 'Complete%';

-- Cards already in the done column count as completed from now.
UPDATE ops_cards
SET completed_at = COALESCE(created_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
WHERE completed_at IS NULL
  AND column_id IN (SELECT id FROM ops_columns WHERE is_done = 1);
