-- Milestones and dependencies for the operations timeline.
--
-- A milestone is a task with a single date (its due date), drawn as a
-- diamond. A dependency says a task cannot start until another is complete:
-- card_id waits on depends_on_id.

ALTER TABLE ops_cards ADD COLUMN is_milestone INTEGER NOT NULL DEFAULT 0;

CREATE TABLE ops_dependencies (
  card_id INTEGER NOT NULL REFERENCES ops_cards(id) ON DELETE CASCADE,
  depends_on_id INTEGER NOT NULL REFERENCES ops_cards(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (card_id, depends_on_id),
  CHECK (card_id != depends_on_id)
);
CREATE INDEX idx_ops_dependencies_on ON ops_dependencies(depends_on_id);
