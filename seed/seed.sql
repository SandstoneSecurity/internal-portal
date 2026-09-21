-- Fictional demo data, ported from the Claude Design prototype
-- (project/Sandstone Admin Portal.dc.html). Replace with real records once
-- the business has data to load — the schema in migrations/0001_init.sql
-- does not need to change to do that.

DELETE FROM intel_feed;
DELETE FROM regions;
DELETE FROM candidates;
DELETE FROM roles;
DELETE FROM gantt_tasks;
DELETE FROM gantt_sections;
DELETE FROM ops_cards;
DELETE FROM ops_columns;
DELETE FROM client_activity;
DELETE FROM client_deals;
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

INSERT INTO clients (id, org, sector, sites, value_pa, owner_initials, status, status_kind, meta) VALUES
(1, 'Harbourline Property Group', 'Commercial property', 6, '$840,000', 'JR', 'Active', 'secure', 'Client since 2021 · six CBD towers under standing orders'),
(2, 'Meridian Family Office', 'Private clients', 2, '$460,000', 'MK', 'Active', 'secure', 'Client since 2019 · residence and office, protective detail'),
(3, 'Castlereagh Hotels', 'Hospitality', 4, '$520,000', 'JR', 'Proposal', 'advisory', 'Client since 2023 · four venues, night coverage'),
(4, 'Port Kembla Logistics', 'Industrial', 3, '$310,000', 'TA', 'Active', 'secure', 'Client since 2020 · wharf and yard perimeter'),
(5, 'Aster Constructions', 'Construction', 5, '$290,000', 'DM', 'Prospect', 'info', 'Prospect · Barangaroo project mobilising September'),
(6, 'Whitmore Galleries', 'Cultural', 1, '$120,000', 'MK', 'Active', 'secure', 'Client since 2022 · daytime gallery posting'),
(7, 'Nortec Data Centres', 'Technology', 2, '$380,000', 'SK', 'Proposal', 'advisory', 'Client since 2024 · access control and after-hours response'),
(8, 'Pyrmont Retail Trust', 'Retail', 8, '$610,000', 'JR', 'Dormant', 'neutral', 'Contract lapsed June 2026 · renewal conversation open'),
(9, 'Elling & Co', 'Legal', 1, '$95,000', 'TA', 'Prospect', 'info', 'Prospect · chambers reception and after-hours');

INSERT INTO client_contacts (client_id, name, role, sort_order) VALUES
(1, 'Fiona Standish', 'Head of assets', 1), (1, 'Greg Malouf', 'Facilities, Kent St', 2),
(2, 'Principal — withheld', 'See file note', 1), (2, 'Alexandra Roy', 'Chief of staff', 2),
(3, 'Marco Delfino', 'Group operations', 1),
(4, 'Sue Hartigan', 'Site director', 1),
(5, 'Ray Okonkwo', 'Project director', 1),
(6, 'Elena Whitmore', 'Director', 1),
(7, 'Priya Raman', 'Security manager', 1),
(8, 'Colin Bray', 'Portfolio manager', 1),
(9, 'Judith Elling', 'Managing partner', 1);

INSERT INTO client_deals (client_id, name, value, stage, review_date) VALUES
(1, 'Concierge coverage extension — two towers', '$120,000 P.A.', 'PRICING', '12 SEP 26'),
(3, 'Crowd control uplift — summer season', '$95,000', 'AWAITING SIGNATURE', '05 SEP 26'),
(5, 'Site security — Barangaroo stage 2', '$290,000 P.A.', 'ORDER BOOK DRAFT', '08 SEP 26'),
(7, 'Second facility — Eastern Creek', '$210,000 P.A.', 'SCOPING', '19 SEP 26'),
(9, 'Reception posting — business hours', '$95,000 P.A.', 'CAPABILITY SENT', '02 SEP 26');

INSERT INTO client_activity (client_id, activity_date, body, sort_order) VALUES
(1, '28 AUG 26', 'Quarterly order book review held on site, Kent Street. Two variances actioned.', 1),
(1, '14 AUG 26', 'Pricing for concierge extension issued to F. Standish.', 2),
(1, '30 JUL 26', 'CCTV upgrade scope agreed; works begin 24 August.', 3),
(2, '27 AUG 26', 'Counter-surveillance sweep scheduled for 11 September.', 1),
(2, '18 AUG 26', 'Travel security brief delivered for Singapore itinerary.', 2),
(2, '02 AUG 26', 'Quarterly review; detail staffing unchanged.', 3),
(3, '26 AUG 26', 'Revised proposal issued; licensing schedule attached.', 1),
(3, '12 AUG 26', 'Venue walk-through, George Street site.', 2),
(4, '29 AUG 26', 'Trespass incident debrief booked for 1 September.', 1),
(4, '27 AUG 26', 'Patrol route change signed off.', 2),
(5, '25 AUG 26', 'Induction pack in preparation; order book draft issue 1 sent.', 1),
(6, '20 AUG 26', 'Exhibition changeover coverage confirmed for 5–7 September.', 1),
(7, '28 AUG 26', 'Escalation matrix update with client for sign-off.', 1),
(8, '15 AUG 26', 'Renewal meeting requested by client for mid-September.', 1),
(9, '21 AUG 26', 'Capability statement sent following referral.', 1);

INSERT INTO ops_columns (id, label, is_done, sort_order) VALUES
(1, 'Raised', 0, 1),
(2, 'In preparation', 0, 2),
(3, 'Awaiting sign-off', 0, 3),
(4, 'Complete — week 35', 1, 4);

INSERT INTO ops_cards (column_id, ref, title, site, line, due_label, is_late, owner_initials, sort_order) VALUES
(1, 'OP-231', 'Night patrol variance — loading dock', 'Harbourline · Kent Street tower', 'Ops', 'DUE 02 SEP', 0, 'DM', 1),
(1, 'OP-232', 'Key register audit', 'Castlereagh Hotels · four sites', 'Ops', 'DUE 04 SEP', 0, 'TA', 2),
(1, 'OP-233', 'Incident debrief — trespass 28 Aug', 'Port Kembla Logistics', 'Advisory', 'DUE 01 SEP', 1, 'JR', 3),
(1, 'OP-234', 'CCTV fault — camera 14, dock entry', 'Pyrmont Retail Trust', 'Tech', 'DUE 03 SEP', 0, 'SK', 4),
(2, 'OP-227', 'Order book revision, issue 4', 'Crown Street residence', 'Protective', 'DUE 09 SEP', 0, 'MK', 1),
(2, 'OP-228', 'Counter-surveillance sweep', 'Meridian Family Office', 'Protective', 'DUE 11 SEP', 0, 'MK', 2),
(2, 'OP-229', 'Roster uplift — October long weekend', 'All CBD sites', 'Ops', 'DUE 18 SEP', 0, 'TA', 3),
(3, 'OP-221', 'Q3 order book review — north shore', 'Six sites', 'Ops', 'DUE 31 AUG', 1, 'JR', 1),
(3, 'OP-224', 'Induction pack — Barangaroo mobilisation', 'Aster Constructions', 'Ops', 'DUE 05 SEP', 0, 'DM', 2),
(3, 'OP-225', 'Escalation matrix update', 'Nortec Data Centres', 'Tech', 'DUE 08 SEP', 0, 'SK', 3),
(4, 'OP-218', 'Licence renewals batch — August', 'Fourteen officers', 'Ops', '26 AUG', 0, 'TA', 1),
(4, 'OP-219', 'Patrol route change', 'Port Kembla Logistics', 'Ops', '27 AUG', 0, 'DM', 2),
(4, 'OP-220', 'Alarm response test', 'Kent Street tower', 'Tech', '28 AUG', 0, 'SK', 3);

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

INSERT INTO roles (id, title, meta, status, status_kind, sort_order) VALUES
(1, 'Security officer — night, CBD portfolio', 'Class 1A 1C · full time · 4 positions', 'Open', 'secure', 1),
(2, 'Control room operator', 'Class 1A · rotating shift · 2 positions', 'Open', 'secure', 2),
(3, 'Close protection officer', 'Class 1B · casual panel', 'Shortlisting', 'advisory', 3),
(4, 'Rostering coordinator', 'Head office, Surry Hills', 'New', 'info', 4);

INSERT INTO candidates (role_id, stage, name, licence, licence_ok, source, days_in_stage, sort_order) VALUES
(1, 0, 'Daniel Okafor', '1A 1C CURRENT', 1, 'Seek', 2, 1),
(1, 0, 'Priya Nair', '1A CURRENT', 1, 'Referral — T. Aldana', 3, 2),
(1, 0, 'Marcus Bell', '1A EXPIRED MAR 26', 0, 'Seek', 5, 3),
(1, 0, 'Jae-won Park', '1A 1C CURRENT', 1, 'Direct', 6, 4),
(1, 1, 'Sofia Ricci', '1A 1C CURRENT', 1, 'Seek', 4, 1),
(1, 1, 'Ahmed Haddad', '1A CURRENT', 1, 'Referral — D. Mercer', 7, 2),
(1, 1, 'Grace Tuivasa', '1A 1C 1D CURRENT', 1, 'Seek', 2, 3),
(1, 2, 'Liam Doherty', '1A 1C CURRENT', 1, 'Direct', 9, 1),
(1, 2, 'Renee Calloway', '1A CURRENT', 1, 'Seek', 3, 2),
(1, 3, 'Victor Osei', 'SLED CHECK LODGED', 0, 'Referral — M. Kessler', 11, 1),
(1, 3, 'Hannah Vo', 'SLED CHECK LODGED', 0, 'Seek', 8, 2),
(1, 4, 'Stefan Molnar', '1A 1C CURRENT', 1, 'Direct', 4, 1),
(2, 0, 'Isla McKenzie', '1A CURRENT', 1, 'Seek', 1, 1),
(2, 0, 'Tom Brandt', '1A CURRENT', 1, 'Seek', 4, 2),
(2, 1, 'Yuki Tanaka', '1A CURRENT', 1, 'Referral — J. Reeve', 5, 1),
(2, 2, 'Sam Whitfield', '1A CURRENT', 1, 'Direct', 6, 1),
(2, 3, 'Aline Fournier', 'SLED CHECK LODGED', 0, 'Seek', 9, 1),
(3, 0, 'Reuben Marsh', '1B CURRENT', 1, 'Direct', 3, 1),
(3, 1, 'Karla Jensen', '1B 1A CURRENT', 1, 'Referral — M. Kessler', 6, 1),
(3, 2, 'Owen Blackwood', '1B CURRENT', 1, 'Direct', 12, 1),
(4, 0, 'Mei Lin Chow', 'N/A — HEAD OFFICE', 1, 'Seek', 2, 1),
(4, 1, 'Patrick Doyle', 'N/A — HEAD OFFICE', 1, 'Seek', 5, 1);

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
