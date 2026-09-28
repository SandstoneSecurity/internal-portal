-- NSW crime statistics for site location risk. Rates are BOCSAR's recorded
-- incidents per 100,000 population by Local Government Area; the state row is
-- area 'NSW'. crime_meta holds the last refresh and what the parser saw.
ALTER TABLE client_sites ADD COLUMN lga TEXT NOT NULL DEFAULT '';

CREATE TABLE crime_rates (
  area TEXT NOT NULL,
  offence TEXT NOT NULL,
  rate REAL NOT NULL,
  count INTEGER,
  rank INTEGER,
  PRIMARY KEY (area, offence)
);

CREATE TABLE crime_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  source TEXT,
  period TEXT,
  fetched_at TEXT,
  attempted_at TEXT,
  status TEXT NOT NULL DEFAULT 'none',
  message TEXT,
  detail TEXT,
  parser_version INTEGER
);
