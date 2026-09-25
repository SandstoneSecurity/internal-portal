-- Fictional demo data, ported from the Claude Design prototype
-- (project/Sandstone Admin Portal.dc.html). Replace with real records once
-- the business has data to load — the schema in migrations/0001_init.sql
-- does not need to change to do that.

DELETE FROM intel_feed;
DELETE FROM regions;
DELETE FROM candidate_events;
DELETE FROM candidates;
DELETE FROM roles;
DELETE FROM gantt_tasks;
DELETE FROM gantt_sections;
DELETE FROM ops_dependencies;
DELETE FROM ops_subtasks;
DELETE FROM ops_cards;
DELETE FROM ops_columns;
DELETE FROM client_activity;
DELETE FROM deals;
DELETE FROM client_contacts;
DELETE FROM clients;
DELETE FROM employee_shifts;
DELETE FROM employees;
DELETE FROM metrics;

INSERT INTO metrics (label, value, unit, note, note_kind, sort_order) VALUES
('Officers on shift', '38', 'of 84 rostered', 'NIGHT COVER FROM 18:00', 'neutral', 1),
('Sites under order', '27', 'order books current', '2 REVIEWS DUE SEP', 'neutral', 2),
('Open work items', '13', '2 past due', 'OP-221 · OP-233', 'breach', 3),
('Licences expiring', '6', 'next 90 days', 'SLED AUDIT OCT', 'advisory', 4);

INSERT INTO employees (id, name, role, licence_class, licence_expiry, expiry_soon, site, status, status_kind, employed_since, mobile) VALUES
(1, 'Tereza Aldana', 'Supervisor, CBD portfolio', '1A 1C', '14 OCT 26', 1, 'Kent Street tower', 'On shift', 'secure', '2019', '0400 000 001'),
(2, 'Daniel Mercer', 'Senior security officer', '1A 1C', '02 MAR 27', 0, 'Crown Street residence', 'On shift', 'secure', '2020', '0400 000 002'),
(3, 'Mira Kessler', 'Close protection officer', '1A 1B', '22 SEP 26', 1, 'Meridian Family Office', 'Rostered', 'info', '2021', '0400 000 003'),
(4, 'Sione Kata', 'Technology officer', '1A 2C', '30 JUN 27', 0, 'Mobile — CBD sites', 'On shift', 'secure', '2022', '0400 000 004'),
(5, 'Joanna Reeve', 'Control room operator', '1A', '08 NOV 26', 1, 'Control room, Surry Hills', 'On shift', 'secure', '2018', '0400 000 005'),
(6, 'Harry Nguyen', 'Security officer', '1A 1C', '17 JAN 28', 0, 'Castlereagh Hotels', 'Rostered', 'info', '2023', '0400 000 006'),
(7, 'Beth Calloway', 'Security officer', '1A', '25 SEP 26', 1, 'Port Kembla Logistics', 'Leave', 'neutral', '2021', '0400 000 007'),
(8, 'Owen Fitzgerald', 'Mobile patrol officer', '1A 1C', '11 DEC 26', 0, 'Mobile — north shore', 'On shift', 'secure', '2020', '0400 000 008'),
(9, 'Anika Rahman', 'Security officer', '1A 1C', '03 OCT 26', 1, 'Whitmore Galleries', 'Rostered', 'info', '2022', '0400 000 009'),
(10, 'Callum Price', 'Security officer', '1A', '19 NOV 26', 1, 'Nortec Data Centres', 'On shift', 'secure', '2024', '0400 000 010');

INSERT INTO employee_shifts (employee_id, shift_date, span, site, sort_order) VALUES
(1, '29 AUG', '1800–0600', 'KENT ST', 1), (1, '27 AUG', '1800–0600', 'KENT ST', 2), (1, '25 AUG', '1800–0600', 'KENT ST', 3),
(2, '29 AUG', '0600–1800', 'CROWN ST', 1), (2, '28 AUG', '0600–1800', 'CROWN ST', 2), (2, '26 AUG', '0600–1800', 'CROWN ST', 3),
(3, '28 AUG', '0800–2000', 'MERIDIAN', 1), (3, '27 AUG', '0800–2000', 'MERIDIAN', 2), (3, '24 AUG', 'TRAVEL', 'MERIDIAN', 3),
(4, '29 AUG', '0800–1600', 'PYRMONT', 1), (4, '28 AUG', '0800–1600', 'KENT ST', 2), (4, '27 AUG', '0800–1600', 'NORTEC', 3),
(5, '29 AUG', '2200–0600', 'CONTROL', 1), (5, '28 AUG', '2200–0600', 'CONTROL', 2), (5, '26 AUG', '2200–0600', 'CONTROL', 3),
(6, '28 AUG', '1400–2200', 'CASTLEREAGH', 1), (6, '27 AUG', '1400–2200', 'CASTLEREAGH', 2), (6, '25 AUG', '1400–2200', 'CASTLEREAGH', 3),
(7, '22 AUG', '0600–1800', 'PT KEMBLA', 1), (7, '21 AUG', '0600–1800', 'PT KEMBLA', 2), (7, '19 AUG', '0600–1800', 'PT KEMBLA', 3),
(8, '29 AUG', '1800–0600', 'MOBILE N', 1), (8, '28 AUG', '1800–0600', 'MOBILE N', 2), (8, '26 AUG', '1800–0600', 'MOBILE N', 3),
(9, '28 AUG', '0900–1700', 'WHITMORE', 1), (9, '26 AUG', '0900–1700', 'WHITMORE', 2), (9, '25 AUG', '0900–1700', 'WHITMORE', 3),
(10, '29 AUG', '1800–0600', 'NORTEC', 1), (10, '27 AUG', '1800–0600', 'NORTEC', 2), (10, '25 AUG', '1800–0600', 'NORTEC', 3);

INSERT INTO clients (id, org, sector, sites, value_pa, owner_initials, status, status_kind, meta, domain, phone, city, created_at) VALUES
(1, 'Harbourline Property Group', 'Commercial property', 6, '$840,000', 'JR', 'Customer', 'secure', 'Six CBD towers under standing orders. Client since 2021.', 'harbourline.com.au', '02 9251 4400', 'Sydney', datetime('now', '-400 days')),
(2, 'Meridian Family Office', 'Private clients', 2, '$460,000', 'MK', 'Customer', 'secure', 'Residence and office, protective detail. Client since 2019.', 'meridianfo.com.au', '02 8076 1200', 'Sydney', datetime('now', '-900 days')),
(3, 'Castlereagh Hotels', 'Hospitality', 4, '$520,000', 'JR', 'Opportunity', 'advisory', 'Four venues, night coverage.', 'castlereaghhotels.com.au', '02 9264 3300', 'Sydney', datetime('now', '-200 days')),
(4, 'Port Kembla Logistics', 'Industrial', 3, '$310,000', 'TA', 'Customer', 'secure', 'Wharf and yard perimeter. Client since 2020.', 'pklogistics.com.au', '02 4275 0100', 'Wollongong', datetime('now', '-700 days')),
(5, 'Aster Constructions', 'Construction', 5, '$290,000', 'DM', 'Opportunity', 'advisory', 'Barangaroo project mobilising.', 'asterconstructions.com.au', '02 9018 5500', 'Sydney', datetime('now', '-60 days')),
(6, 'Whitmore Galleries', 'Cultural', 1, '$120,000', 'MK', 'Customer', 'secure', 'Daytime gallery posting.', 'whitmoregalleries.com', '02 9331 2020', 'Paddington', datetime('now', '-500 days')),
(7, 'Nortec Data Centres', 'Technology', 2, '$380,000', 'SK', 'Opportunity', 'advisory', 'Access control and after-hours response.', 'nortec.io', '02 8880 7000', 'Eastern Creek', datetime('now', '-150 days')),
(8, 'Pyrmont Retail Trust', 'Retail', 8, '$610,000', 'JR', 'Former customer', 'neutral', 'Contract lapsed June 2026; renewal conversation open.', 'pyrmontretail.com.au', '02 9660 1800', 'Pyrmont', datetime('now', '-1100 days')),
(9, 'Elling & Co', 'Legal', 1, '$95,000', 'TA', 'Lead', 'info', 'Chambers reception and after-hours.', 'elling.law', '02 9233 4100', 'Sydney', datetime('now', '-20 days'));

INSERT INTO client_contacts (client_id, name, role, email, phone, sort_order) VALUES
(1, 'Fiona Standish', 'Head of assets', 'fiona.standish@harbourline.com.au', '0412 555 101', 1), (1, 'Greg Malouf', 'Facilities, Kent St', 'greg.malouf@harbourline.com.au', '0412 555 102', 2),
(2, 'Alexandra Roy', 'Chief of staff', 'a.roy@meridianfo.com.au', '0413 555 201', 1),
(3, 'Marco Delfino', 'Group operations', 'marco@castlereaghhotels.com.au', '0414 555 301', 1),
(4, 'Sue Hartigan', 'Site director', 'sue.hartigan@pklogistics.com.au', '0415 555 401', 1),
(5, 'Ray Okonkwo', 'Project director', 'ray.okonkwo@asterconstructions.com.au', '0416 555 501', 1),
(6, 'Elena Whitmore', 'Director', 'elena@whitmoregalleries.com', '0417 555 601', 1),
(7, 'Priya Raman', 'Security manager', 'priya.raman@nortec.io', '0418 555 701', 1),
(8, 'Colin Bray', 'Portfolio manager', 'colin.bray@pyrmontretail.com.au', '0419 555 801', 1),
(9, 'Judith Elling', 'Managing partner', 'judith@elling.law', '0420 555 901', 1);

INSERT INTO deals (client_id, name, amount, stage, close_date, owner_initials, sort_order, created_at, closed_at) VALUES
(1, 'Concierge coverage extension — two towers', 120000, 'Negotiation', date('now', '+14 days'), 'JR', 1, datetime('now', '-30 days'), NULL),
(3, 'Crowd control uplift — summer season', 95000, 'Proposal sent', date('now', '+10 days'), 'JR', 1, datetime('now', '-20 days'), NULL),
(5, 'Site security — Barangaroo stage 2', 290000, 'Proposal sent', date('now', '+21 days'), 'DM', 2, datetime('now', '-25 days'), NULL),
(7, 'Second facility — Eastern Creek', 210000, 'Site survey', date('now', '+35 days'), 'SK', 1, datetime('now', '-12 days'), NULL),
(9, 'Reception posting — business hours', 95000, 'Enquiry', date('now', '+45 days'), 'TA', 1, datetime('now', '-6 days'), NULL),
(8, 'Retail portfolio renewal', 610000, 'Enquiry', date('now', '+60 days'), 'JR', 2, datetime('now', '-4 days'), NULL),
(2, 'Travel security — Singapore itinerary', 38000, 'Closed won', date('now', '-18 days'), 'MK', 1, datetime('now', '-40 days'), datetime('now', '-18 days')),
(4, 'Wharf CCTV upgrade', 64000, 'Closed lost', date('now', '-9 days'), 'TA', 1, datetime('now', '-50 days'), datetime('now', '-9 days'));

INSERT INTO client_activity (client_id, activity_date, body, sort_order, kind, subject, at, actor, outcome, due_date, done) VALUES
(1, '', 'Two variances actioned. Next review in December.', 1, 'meeting', 'Quarterly order book review — Kent Street', datetime('now', '-4 days'), 'william@sandstonesecurity.com', '', NULL, 0),
(1, '', 'Pricing for the concierge extension, two towers, 24/7.', 2, 'email', 'Concierge extension — pricing', datetime('now', '-12 days'), 'william@sandstonesecurity.com', '', NULL, 0),
(1, '', '', 3, 'task', 'Send revised pricing to F. Standish', datetime('now', '-2 days'), 'william@sandstonesecurity.com', '', date('now', '+2 days'), 0),
(2, '', 'Sweep scheduled for the boardroom and principal''s office.', 1, 'call', 'Counter-surveillance sweep booking', datetime('now', '-5 days'), 'william@sandstonesecurity.com', 'Connected', NULL, 0),
(2, '', 'Travel security brief delivered for the Singapore itinerary.', 2, 'note', '', datetime('now', '-18 days'), 'william@sandstonesecurity.com', '', NULL, 0),
(3, '', 'Revised proposal issued; licensing schedule attached.', 1, 'email', 'Summer season proposal — revision 2', datetime('now', '-6 days'), 'william@sandstonesecurity.com', '', NULL, 0),
(3, '', 'Walked the George Street venue with M. Delfino.', 2, 'meeting', 'Venue walk-through', datetime('now', '-20 days'), 'william@sandstonesecurity.com', '', NULL, 0),
(3, '', '', 3, 'task', 'Follow up on proposal signature', datetime('now', '-1 days'), 'william@sandstonesecurity.com', '', date('now', '-1 days'), 0),
(4, '', 'Trespass incident debrief booked.', 1, 'call', 'Incident debrief', datetime('now', '-3 days'), 'william@sandstonesecurity.com', 'Left voicemail', NULL, 0),
(5, '', 'Induction pack in preparation; order book draft issue 1 sent.', 1, 'note', '', datetime('now', '-7 days'), 'william@sandstonesecurity.com', '', NULL, 0),
(6, '', 'Exhibition changeover coverage confirmed.', 1, 'email', 'Exhibition changeover', datetime('now', '-9 days'), 'william@sandstonesecurity.com', '', NULL, 0),
(7, '', 'Escalation matrix update with client for sign-off.', 1, 'meeting', 'Escalation matrix review', datetime('now', '-2 days'), 'william@sandstonesecurity.com', '', NULL, 0),
(8, '', 'Client asked for a renewal meeting mid-month.', 1, 'call', 'Renewal conversation', datetime('now', '-10 days'), 'william@sandstonesecurity.com', 'Connected', NULL, 0),
(9, '', 'Capability statement sent following referral.', 1, 'email', 'Capability statement', datetime('now', '-6 days'), 'william@sandstonesecurity.com', '', NULL, 0);

INSERT INTO ops_columns (id, label, is_done, sort_order) VALUES
(1, 'To do', 0, 1),
(2, 'In progress', 0, 2),
(3, 'Complete', 1, 3);

-- Dates are relative to the day the seed is loaded so the board always looks live.
INSERT INTO ops_cards (id, column_id, ref, title, site, line, due_label, is_late, owner_initials, sort_order, description, priority, start_date, due_date, created_at, completed_at) VALUES
(1, 1, 'OP-231', 'Night patrol variance — loading dock', 'Harbourline · Kent Street tower', 'Ops', '', 0, 'DM', 1, 'Patrol logged the dock roller door open at 02:40 on two consecutive nights. Confirm with the building manager and amend the patrol brief.', 'High', date('now', '-2 days'), date('now', '+1 day'), datetime('now', '-3 days'), NULL),
(2, 1, 'OP-232', 'Key register audit', 'Castlereagh Hotels · four sites', 'Ops', '', 0, 'TA', 2, 'Quarterly reconciliation of issued keys and access cards against the register.', 'Medium', date('now'), date('now', '+6 days'), datetime('now', '-1 days'), NULL),
(3, 1, 'OP-233', 'Incident debrief — trespass', 'Port Kembla Logistics', 'Advisory', '', 0, 'JR', 3, 'Debrief the client on the trespass incident and recommend perimeter changes.', 'High', date('now', '-6 days'), date('now', '-1 day'), datetime('now', '-6 days'), NULL),
(4, 1, 'OP-234', 'CCTV fault — camera 14, dock entry', 'Pyrmont Retail Trust', 'Tech', '', 0, 'SK', 4, '', 'Low', NULL, date('now', '+3 days'), datetime('now', '-1 days'), NULL),
(5, 2, 'OP-227', 'Order book revision, issue 4', 'Crown Street residence', 'Protective', '', 0, 'MK', 1, 'Revise the order book for the principal''s new movement schedule.', 'Medium', date('now', '-4 days'), date('now', '+9 days'), datetime('now', '-5 days'), NULL),
(6, 2, 'OP-228', 'Counter-surveillance sweep', 'Meridian Family Office', 'Protective', '', 0, 'MK', 2, 'Technical sweep of the boardroom and principal''s office ahead of the quarterly meeting.', 'High', date('now', '+2 days'), date('now', '+4 days'), datetime('now', '-2 days'), NULL),
(7, 2, 'OP-229', 'Roster uplift — October long weekend', 'All CBD sites', 'Ops', '', 0, 'TA', 3, '', 'Medium', date('now', '-1 days'), date('now', '+11 days'), datetime('now', '-4 days'), NULL),
(8, 2, 'OP-224', 'Induction pack — Barangaroo mobilisation', 'Aster Constructions', 'Training', '', 0, 'DM', 4, 'Site induction for twelve officers joining the Barangaroo contract.', 'Medium', date('now', '-3 days'), date('now'), datetime('now', '-8 days'), NULL),
(9, 2, 'OP-225', 'Escalation matrix update', 'Nortec Data Centres', 'Tech', '', 0, 'SK', 5, '', 'Low', NULL, date('now', '+14 days'), datetime('now', '-2 days'), NULL),
(10, 3, 'OP-218', 'Licence renewals batch — August', 'Fourteen officers', 'Ops', '', 0, 'TA', 1, '', 'None', date('now', '-20 days'), date('now', '-8 days'), datetime('now', '-21 days'), datetime('now', '-9 days')),
(11, 3, 'OP-219', 'Patrol route change', 'Port Kembla Logistics', 'Ops', '', 0, 'DM', 2, '', 'None', date('now', '-14 days'), date('now', '-6 days'), datetime('now', '-15 days'), datetime('now', '-6 days')),
(12, 3, 'OP-220', 'Alarm response test', 'Kent Street tower', 'Tech', '', 0, 'SK', 3, '', 'None', date('now', '-10 days'), date('now', '-5 days'), datetime('now', '-11 days'), datetime('now', '-5 days'));

INSERT INTO ops_cards (id, column_id, ref, title, site, line, due_label, is_late, owner_initials, sort_order, description, priority, start_date, due_date, created_at, completed_at, is_milestone) VALUES
(13, 1, 'OP-235', 'Barangaroo contract go-live', 'Aster Constructions', 'Ops', '', 0, 'DM', 5, 'First night shift on the Barangaroo site with the full inducted team.', 'High', NULL, date('now', '+7 days'), datetime('now', '-2 days'), NULL, 1),
(14, 1, 'OP-236', 'Meridian quarterly board meeting', 'Meridian Family Office', 'Protective', '', 0, 'MK', 6, '', 'Medium', NULL, date('now', '+5 days'), datetime('now', '-2 days'), NULL, 1);

INSERT INTO ops_dependencies (card_id, depends_on_id, created_at) VALUES
(13, 8, datetime('now', '-2 days')),
(14, 6, datetime('now', '-2 days')),
(2, 1, datetime('now', '-1 days'));

INSERT INTO ops_subtasks (card_id, title, done, owner_initials, start_date, due_date, sort_order, created_at, completed_at) VALUES
(1, 'Pull access-control logs for both nights', 1, 'DM', date('now', '-2 days'), date('now', '-1 day'), 1, datetime('now', '-2 days'), datetime('now', '-1 days')),
(1, 'Walk the dock with the building manager', 0, 'DM', date('now'), date('now'), 2, datetime('now', '-2 days'), NULL),
(1, 'Amend patrol brief and reissue', 0, 'JR', date('now', '+1 day'), date('now', '+1 day'), 3, datetime('now', '-2 days'), NULL),
(3, 'Draft debrief note', 1, 'JR', date('now', '-6 days'), date('now', '-4 days'), 1, datetime('now', '-6 days'), datetime('now', '-4 days')),
(3, 'Perimeter recommendations', 0, 'JR', date('now', '-3 days'), date('now', '-1 day'), 2, datetime('now', '-6 days'), NULL),
(5, 'Confirm principal movement schedule', 1, 'MK', date('now', '-4 days'), date('now', '-2 days'), 1, datetime('now', '-4 days'), datetime('now', '-2 days')),
(5, 'Redraft residence routines', 0, 'MK', date('now', '-1 days'), date('now', '+5 days'), 2, datetime('now', '-4 days'), NULL),
(5, 'Client sign-off', 0, 'JR', date('now', '+6 days'), date('now', '+9 days'), 3, datetime('now', '-4 days'), NULL),
(6, 'Book sweep equipment', 1, 'SK', date('now', '-1 days'), date('now'), 1, datetime('now', '-2 days'), datetime('now')),
(6, 'Sweep boardroom and principal''s office', 0, 'MK', date('now', '+2 days'), date('now', '+2 days'), 2, datetime('now', '-2 days'), NULL),
(6, 'Written findings to client', 0, 'MK', date('now', '+3 days'), date('now', '+4 days'), 3, datetime('now', '-2 days'), NULL),
(8, 'Print induction packs', 1, 'DM', date('now', '-3 days'), date('now', '-2 days'), 1, datetime('now', '-3 days'), datetime('now', '-2 days')),
(8, 'Site walk with Aster safety lead', 1, 'DM', date('now', '-1 days'), date('now', '-1 days'), 2, datetime('now', '-3 days'), datetime('now', '-1 days')),
(8, 'Induction session — twelve officers', 0, 'DM', date('now'), date('now'), 3, datetime('now', '-3 days'), NULL);

INSERT INTO gantt_sections (id, num, name, sort_order) VALUES
(1, '01', 'Mobilisation — Crown Street residence', 1),
(2, '02', 'CCTV upgrade — Kent Street tower', 2),
(3, '03', 'Q3 order book reviews', 3);

INSERT INTO gantt_tasks (section_id, name, start_day, end_day, kind, sort_order) VALUES
(1, 'Order book drafting', 0, 11, 'done', 1),
(1, 'Licensing and vetting', 7, 25, 'done', 2),
(1, 'Site induction', 21, 32, 'active', 3),
(1, 'Go-live, night cover', 35, 39, 'plan', 4),
(2, 'Scope and vendor selection', 0, 18, 'done', 1),
(2, 'Cabling and camera heads', 21, 46, 'active', 2),
(2, 'Commissioning and handover', 49, 60, 'plan', 3),
(3, 'North shore sites', 14, 25, 'done', 1),
(3, 'CBD sites', 28, 39, 'plan', 2),
(3, 'Client sign-off', 42, 53, 'plan', 3);

INSERT INTO roles (id, title, meta, status, status_kind, sort_order, department, location, employment_type, openings, description, hiring_manager, created_at) VALUES
(1, 'Security officer — night, CBD portfolio', '', 'Published', 'secure', 1, 'Ops', 'Sydney CBD', 'Full time', 4, 'Night patrols and static posts across six CBD towers. Class 1A and 1C required; first aid current.', 'Tereza Aldana', datetime('now', '-30 days')),
(2, 'Control room operator', '', 'Published', 'secure', 2, 'Ops', 'Surry Hills', 'Full time', 2, 'Monitor alarms, CCTV and patrol GPS; dispatch and escalate. Rotating 12-hour shifts.', 'Joanna Reeve', datetime('now', '-21 days')),
(3, 'Close protection officer', '', 'On hold', 'advisory', 3, 'Protective', 'Sydney', 'Casual', 2, 'Casual panel for private-client details and travel. Class 1B required.', 'Mira Kessler', datetime('now', '-45 days')),
(4, 'Rostering coordinator', '', 'Draft', 'info', 4, 'Head office', 'Surry Hills', 'Full time', 1, 'Build and publish rosters across the portfolio; manage leave and fatigue rules.', 'William Chan', datetime('now', '-3 days'));

INSERT INTO candidates (role_id, stage, name, licence, licence_ok, source, days_in_stage, sort_order, email, phone, location, headline, disqualified, disqualify_reason, created_at, stage_since) VALUES
(1, 0, 'Jae-won Park', '1A 1C CURRENT', 1, 'LinkedIn', 6, 1, 'jaewon.park@example.com', '0400 111 001', 'Strathfield', 'Security officer, retail', 0, '', datetime('now', '-6 days'), date('now', '-6 days')),
(1, 1, 'Daniel Okafor', '1A 1C CURRENT', 1, 'Seek', 2, 1, 'daniel.okafor@example.com', '0400 111 002', 'Parramatta', 'Crowd controller, 4 years', 0, '', datetime('now', '-2 days'), date('now', '-2 days')),
(1, 1, 'Priya Nair', '1A CURRENT', 1, 'Referral — T. Aldana', 3, 2, 'priya.nair@example.com', '0400 111 003', 'Burwood', 'Static guard, hospital', 0, '', datetime('now', '-3 days'), date('now', '-3 days')),
(1, 1, 'Marcus Bell', '1A EXPIRED MAR 26', 0, 'Seek', 5, 3, 'marcus.bell@example.com', '0400 111 004', 'Blacktown', 'Mobile patrol', 1, 'Licence not current', datetime('now', '-5 days'), date('now', '-5 days')),
(1, 2, 'Sofia Ricci', '1A 1C CURRENT', 1, 'Seek', 4, 1, 'sofia.ricci@example.com', '0400 111 005', 'Leichhardt', 'Concierge security, CBD tower', 0, '', datetime('now', '-9 days'), date('now', '-4 days')),
(1, 2, 'Ahmed Haddad', '1A CURRENT', 1, 'Referral — D. Mercer', 7, 2, 'ahmed.haddad@example.com', '0400 111 006', 'Auburn', 'Loss prevention officer', 0, '', datetime('now', '-12 days'), date('now', '-7 days')),
(1, 3, 'Victor Osei', 'SLED CHECK LODGED', 0, 'Referral — M. Kessler', 11, 1, 'victor.osei@example.com', '0400 111 007', 'Mascot', 'Former ADF, security team lead', 0, '', datetime('now', '-18 days'), date('now', '-11 days')),
(1, 4, 'Liam Doherty', '1A 1C CURRENT', 1, 'Direct', 9, 1, 'liam.doherty@example.com', '0400 111 008', 'Newtown', 'Security supervisor, events', 0, '', datetime('now', '-20 days'), date('now', '-9 days')),
(1, 4, 'Renee Calloway', '1A CURRENT', 1, 'Seek', 3, 2, 'renee.calloway@example.com', '0400 111 009', 'Ryde', 'Night officer, data centre', 0, '', datetime('now', '-16 days'), date('now', '-3 days')),
(1, 5, 'Stefan Molnar', '1A 1C CURRENT', 1, 'Direct', 4, 1, 'stefan.molnar@example.com', '0400 111 010', 'Chatswood', 'Senior officer, CBD portfolio', 0, '', datetime('now', '-25 days'), date('now', '-4 days')),
(1, 6, 'Grace Tuivasa', '1A 1C 1D CURRENT', 1, 'Seek', 2, 1, 'grace.tuivasa@example.com', '0400 111 011', 'Liverpool', 'Security officer, hospitality', 0, '', datetime('now', '-28 days'), date('now', '-2 days')),
(2, 1, 'Isla McKenzie', '1A CURRENT', 1, 'Seek', 1, 1, 'isla.mckenzie@example.com', '0400 222 001', 'Glebe', 'Alarm monitoring, 2 years', 0, '', datetime('now', '-1 days'), date('now', '-1 days')),
(2, 2, 'Yuki Tanaka', '1A CURRENT', 1, 'Referral — J. Reeve', 5, 1, 'yuki.tanaka@example.com', '0400 222 002', 'Redfern', 'Dispatcher, emergency services', 0, '', datetime('now', '-8 days'), date('now', '-5 days')),
(2, 3, 'Aline Fournier', 'SLED CHECK LODGED', 0, 'Seek', 9, 1, 'aline.fournier@example.com', '0400 222 003', 'Randwick', 'CCTV operator, casino', 0, '', datetime('now', '-14 days'), date('now', '-9 days')),
(2, 4, 'Sam Whitfield', '1A CURRENT', 1, 'Direct', 6, 1, 'sam.whitfield@example.com', '0400 222 004', 'Marrickville', 'Control room operator, transport', 0, '', datetime('now', '-15 days'), date('now', '-6 days')),
(3, 1, 'Reuben Marsh', '1B CURRENT', 1, 'Direct', 3, 1, 'reuben.marsh@example.com', '0400 333 001', 'Mosman', 'Close protection, corporate', 0, '', datetime('now', '-3 days'), date('now', '-3 days')),
(3, 2, 'Karla Jensen', '1B 1A CURRENT', 1, 'Referral — M. Kessler', 6, 1, 'karla.jensen@example.com', '0400 333 002', 'Double Bay', 'Executive protection, travel', 0, '', datetime('now', '-10 days'), date('now', '-6 days')),
(4, 1, 'Mei Lin Chow', 'N/A — HEAD OFFICE', 1, 'Seek', 2, 1, 'meilin.chow@example.com', '0400 444 001', 'Zetland', 'Workforce planner, aged care', 0, '', datetime('now', '-2 days'), date('now', '-2 days'));

INSERT INTO candidate_events (candidate_id, at, actor, kind, body, score, verdict)
SELECT id, created_at, 'william@sandstonesecurity.com', 'created', 'Added to pipeline · source: ' || source, NULL, NULL FROM candidates;
INSERT INTO candidate_events (candidate_id, at, actor, kind, body, score, verdict)
SELECT id, datetime('now', '-3 days'), 'william@sandstonesecurity.com', 'evaluation', 'Calm under pressure; strong incident reporting. Good fit for the CBD night roster.', 4, 'Hire' FROM candidates WHERE name IN ('Liam Doherty', 'Stefan Molnar', 'Sofia Ricci');
INSERT INTO candidate_events (candidate_id, at, actor, kind, body, score, verdict)
SELECT id, datetime('now', '-2 days'), 'william@sandstonesecurity.com', 'evaluation', 'Excellent references from the events contractor.', 5, 'Strong hire' FROM candidates WHERE name IN ('Stefan Molnar', 'Grace Tuivasa');
INSERT INTO candidate_events (candidate_id, at, actor, kind, body, score, verdict)
SELECT id, datetime('now', '-1 days'), 'william@sandstonesecurity.com', 'comment', 'Available to start after two weeks'' notice. Prefers nights.', NULL, NULL FROM candidates WHERE name IN ('Stefan Molnar', 'Renee Calloway');
INSERT INTO candidate_events (candidate_id, at, actor, kind, body, score, verdict)
SELECT id, datetime('now', '-5 days'), 'william@sandstonesecurity.com', 'disqualified', 'Licence not current', NULL, NULL FROM candidates WHERE disqualified = 1;

INSERT INTO regions (key, label, map_x, map_y, label_anchor, label_dx, label_dy) VALUES
('syd', 'Sydney', 598, 370, 'start', 10, 4),
('new', 'Newcastle', 631, 311, 'start', 10, 4),
('wol', 'Wollongong', 579, 405, 'start', 10, 12),
('cof', 'Coffs Harbour', 708, 145, 'end', -10, 4),
('dub', 'Dubbo', 447, 268, 'start', 10, 4),
('wag', 'Wagga Wagga', 375, 448, 'start', 10, 4),
('bhq', 'Broken Hill', 33, 250, 'start', 10, 4),
('tam', 'Tamworth', 582, 195, 'end', -10, 4);

INSERT INTO intel_feed (id, time_label, severity, severity_kind, region_key, headline, source, sort_order) VALUES
(1, '05:40', 'Breach', 'breach', 'syd', 'Attempted forced entry at commercial tower loading dock, Kent Street. Officer on scene 05:44; police attended 05:58.', 'Patrol report · OP-231 raised', 1),
(2, '04:15', 'Advisory', 'advisory', 'new', 'Copper theft on rail corridor near Hamilton — third incident this month. Adjacent industrial sites advised.', 'NSW Police media', 2),
(3, 'YEST 22:10', 'Advisory', 'advisory', 'wol', 'Aggravated trespass at Port Kembla industrial estate. Client site perimeter held; debrief 1 September.', 'Patrol report · OP-233', 3),
(4, 'YEST 18:00', 'Info', 'info', 'syd', 'Authorised assembly Saturday, Hyde Park to Town Hall. Road closures 10:00–14:00; two client sites on route.', 'City of Sydney notice', 4),
(5, 'YEST 16:45', 'Advisory', 'advisory', 'cof', 'Severe weather warning, damaging winds on the northern rivers. Perimeter and signage checks advised.', 'Bureau of Meteorology', 5),
(6, 'YEST 11:20', 'Info', 'info', 'dub', 'SLED announces regional licensing audit round for October. Fourteen officer renewals fall in window.', 'SLED circular', 6),
(7, '28 AUG', 'Advisory', 'advisory', 'wag', 'Cluster of vehicle break-ins, Bomen industrial precinct. Mobile patrol frequency increased.', 'NSW Police media', 7),
(8, '27 AUG', 'Info', 'info', 'bhq', 'Mine site contractor inductions resume 7 September; two officers to re-induct.', 'Client notice', 8),
(9, '26 AUG', 'Info', 'info', 'tam', 'Regional saleyards precinct upgrade — expression of interest window opens for site security tender.', 'Tender watch', 9);
