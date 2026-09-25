-- Recruitment becomes an applicant-tracking system (jobs, a seven-stage
-- pipeline, candidate profiles with a timeline, comments and scorecards) and
-- Clients becomes a CRM (companies with properties, contacts, many deals on a
-- pipeline, and logged notes, emails, calls, meetings and tasks).

-- ── Jobs ────────────────────────────────────────────────────────────────────
ALTER TABLE roles ADD COLUMN department TEXT NOT NULL DEFAULT 'Ops';
ALTER TABLE roles ADD COLUMN location TEXT NOT NULL DEFAULT '';
ALTER TABLE roles ADD COLUMN employment_type TEXT NOT NULL DEFAULT 'Full time';
ALTER TABLE roles ADD COLUMN openings INTEGER NOT NULL DEFAULT 1;
ALTER TABLE roles ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE roles ADD COLUMN hiring_manager TEXT NOT NULL DEFAULT '';
ALTER TABLE roles ADD COLUMN created_at TEXT;

-- Job states: Draft, Published, On hold, Closed.
UPDATE roles SET status = CASE status
  WHEN 'New' THEN 'Draft'
  WHEN 'Open' THEN 'Published'
  WHEN 'Shortlisting' THEN 'Published'
  WHEN 'Filled' THEN 'Closed'
  ELSE status END;
UPDATE roles SET status_kind = CASE status
  WHEN 'Draft' THEN 'info'
  WHEN 'Published' THEN 'secure'
  WHEN 'On hold' THEN 'advisory'
  ELSE 'neutral' END;

-- ── Candidates ──────────────────────────────────────────────────────────────
ALTER TABLE candidates ADD COLUMN email TEXT NOT NULL DEFAULT '';
ALTER TABLE candidates ADD COLUMN phone TEXT NOT NULL DEFAULT '';
ALTER TABLE candidates ADD COLUMN location TEXT NOT NULL DEFAULT '';
ALTER TABLE candidates ADD COLUMN headline TEXT NOT NULL DEFAULT '';
ALTER TABLE candidates ADD COLUMN disqualified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE candidates ADD COLUMN disqualify_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE candidates ADD COLUMN created_at TEXT;

-- Pipeline goes from five stages to seven:
--   old: 0 Applied, 1 Screened, 2 Interview, 3 Licence check, 4 Offer
--   new: 0 Sourced, 1 Applied, 2 Phone screen, 3 Licence check, 4 Interview, 5 Offer, 6 Hired
UPDATE candidates SET stage = CASE stage WHEN 0 THEN 1 WHEN 1 THEN 2 WHEN 2 THEN 4 WHEN 3 THEN 3 WHEN 4 THEN 5 ELSE stage END;

-- Everything that happens to a candidate: created, stage moves, comments,
-- scorecards, disqualification. Drives the profile timeline and ratings.
CREATE TABLE candidate_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  kind TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  score INTEGER,
  verdict TEXT
);
CREATE INDEX idx_candidate_events_candidate ON candidate_events(candidate_id);

-- ── Companies ───────────────────────────────────────────────────────────────
ALTER TABLE clients ADD COLUMN domain TEXT NOT NULL DEFAULT '';
ALTER TABLE clients ADD COLUMN phone TEXT NOT NULL DEFAULT '';
ALTER TABLE clients ADD COLUMN city TEXT NOT NULL DEFAULT '';
ALTER TABLE clients ADD COLUMN created_at TEXT;

-- Lifecycle stages: Lead, Opportunity, Customer, Former customer.
UPDATE clients SET status = CASE status
  WHEN 'Prospect' THEN 'Lead'
  WHEN 'Proposal' THEN 'Opportunity'
  WHEN 'Active' THEN 'Customer'
  WHEN 'Dormant' THEN 'Former customer'
  ELSE status END;
UPDATE clients SET status_kind = CASE status
  WHEN 'Lead' THEN 'info'
  WHEN 'Opportunity' THEN 'advisory'
  WHEN 'Customer' THEN 'secure'
  ELSE 'neutral' END;

ALTER TABLE client_contacts ADD COLUMN email TEXT NOT NULL DEFAULT '';
ALTER TABLE client_contacts ADD COLUMN phone TEXT NOT NULL DEFAULT '';

-- ── Deals: many per company, on a pipeline ──────────────────────────────────
CREATE TABLE deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  stage TEXT NOT NULL,
  close_date TEXT,
  owner_initials TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  closed_at TEXT
);
CREATE INDEX idx_deals_client ON deals(client_id);

-- Carry over the old single "open proposal" per client.
INSERT INTO deals (client_id, name, amount, stage, owner_initials, sort_order, created_at)
SELECT d.client_id,
       d.name,
       CAST(REPLACE(REPLACE(REPLACE(REPLACE(UPPER(d.value), '$', ''), ',', ''), 'P.A.', ''), ' ', '') AS INTEGER),
       CASE d.stage
         WHEN 'SCOPING' THEN 'Site survey'
         WHEN 'DRAFTING' THEN 'Proposal sent'
         WHEN 'SUBMITTED' THEN 'Proposal sent'
         WHEN 'NEGOTIATING' THEN 'Negotiation'
         ELSE 'Enquiry' END,
       c.owner_initials,
       d.id,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM client_deals d JOIN clients c ON c.id = d.client_id;
DROP TABLE client_deals;

-- ── Engagements: notes, emails, calls, meetings and tasks ───────────────────
ALTER TABLE client_activity ADD COLUMN kind TEXT NOT NULL DEFAULT 'note';
ALTER TABLE client_activity ADD COLUMN subject TEXT NOT NULL DEFAULT '';
ALTER TABLE client_activity ADD COLUMN at TEXT;
ALTER TABLE client_activity ADD COLUMN actor TEXT NOT NULL DEFAULT '';
ALTER TABLE client_activity ADD COLUMN outcome TEXT NOT NULL DEFAULT '';
ALTER TABLE client_activity ADD COLUMN due_date TEXT;
ALTER TABLE client_activity ADD COLUMN done INTEGER NOT NULL DEFAULT 0;
ALTER TABLE client_activity ADD COLUMN contact_id INTEGER;
