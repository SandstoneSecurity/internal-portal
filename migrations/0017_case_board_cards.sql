-- A case with dates (when the client asked, when the report is due) has a task on the operations board
-- that follows it: the case's dates, lead, client and status are kept in step with the task. A case with
-- an access list shows only its reference there, as the board is open to everyone.
ALTER TABLE ops_cards ADD COLUMN case_id INTEGER REFERENCES inv_cases(id);
CREATE UNIQUE INDEX idx_ops_cards_case ON ops_cards(case_id) WHERE case_id IS NOT NULL;

-- Cases that already have dates get their task now. Intake goes to the first open section, closed cases
-- to the first done one, and everything else to the second open section (In progress) where there is one.
INSERT INTO ops_cards (column_id, ref, title, site, line, description, priority, start_date, due_label, due_date,
                       created_at, completed_at, is_late, owner_initials, sort_order, is_milestone, case_id)
SELECT
  col.id,
  'OP-' || ((SELECT COALESCE(MAX(CAST(SUBSTR(ref, 4) AS INTEGER)), 100) FROM ops_cards WHERE ref LIKE 'OP-%') + ROW_NUMBER() OVER (ORDER BY c.id)),
  CASE WHEN c.access != '' THEN 'Restricted investigation' ELSE SUBSTR(c.title, 1, 120) END,
  CASE WHEN c.access != '' THEN '' ELSE COALESCE(cl.org, '') END,
  'Advisory',
  '',
  'None',
  CASE WHEN c.requested_at IS NOT NULL AND (c.due_date IS NULL OR c.requested_at <= c.due_date) THEN c.requested_at END,
  '',
  c.due_date,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  CASE WHEN col.is_done = 1 THEN COALESCE(c.closed_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) END,
  0,
  c.lead,
  (SELECT COALESCE(MAX(sort_order), 0) FROM ops_cards) + ROW_NUMBER() OVER (ORDER BY c.id),
  0,
  c.id
FROM inv_cases c
LEFT JOIN clients cl ON cl.id = c.client_id
JOIN ops_columns col ON col.id = COALESCE(
  CASE
    WHEN c.status = 'Closed' THEN (SELECT id FROM ops_columns WHERE is_done = 1 ORDER BY sort_order LIMIT 1)
    WHEN c.status = 'Intake' THEN (SELECT id FROM ops_columns WHERE is_done = 0 ORDER BY sort_order LIMIT 1)
    ELSE (SELECT id FROM ops_columns WHERE is_done = 0 ORDER BY sort_order LIMIT 1 OFFSET 1)
  END,
  (SELECT id FROM ops_columns WHERE is_done = 0 ORDER BY sort_order LIMIT 1),
  (SELECT id FROM ops_columns ORDER BY sort_order LIMIT 1)
)
WHERE (c.requested_at IS NOT NULL OR c.due_date IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM ops_cards k WHERE k.case_id = c.id);
