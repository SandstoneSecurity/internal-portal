-- Feed items get their own place on the Intelligence map: a point (lat/lng) and
-- an optional place name. Items without a point sit at their region. A new
-- severity, Opportunity, is stored like the others (severity_kind 'secure').
ALTER TABLE intel_feed ADD COLUMN lat REAL;
ALTER TABLE intel_feed ADD COLUMN lng REAL;
ALTER TABLE intel_feed ADD COLUMN place TEXT NOT NULL DEFAULT '';

-- Where the demo items happened, matched by how their text starts (other items are
-- untouched). substr, not LIKE: D1 caps LIKE patterns at 50 bytes.
UPDATE intel_feed SET lat = -33.8670, lng = 151.2045, place = 'Kent Street, Sydney' WHERE lat IS NULL AND substr(headline, 1, 69) = 'Attempted forced entry at commercial tower loading dock, Kent Street.';
UPDATE intel_feed SET lat = -32.9230, lng = 151.7490, place = 'Hamilton, Newcastle' WHERE lat IS NULL AND substr(headline, 1, 43) = 'Copper theft on rail corridor near Hamilton';
UPDATE intel_feed SET lat = -34.4710, lng = 150.8930, place = 'Port Kembla' WHERE lat IS NULL AND substr(headline, 1, 53) = 'Aggravated trespass at Port Kembla industrial estate.';
UPDATE intel_feed SET lat = -33.8731, lng = 151.2111, place = 'Hyde Park, Sydney' WHERE lat IS NULL AND substr(headline, 1, 53) = 'Authorised assembly Saturday, Hyde Park to Town Hall.';
UPDATE intel_feed SET lat = -28.8100, lng = 153.2770, place = 'Northern Rivers' WHERE lat IS NULL AND substr(headline, 1, 62) = 'Severe weather warning, damaging winds on the northern rivers.';
UPDATE intel_feed SET lat = -35.0660, lng = 147.4130, place = 'Bomen, Wagga Wagga' WHERE lat IS NULL AND substr(headline, 1, 56) = 'Cluster of vehicle break-ins, Bomen industrial precinct.';
UPDATE intel_feed SET lat = -31.1170, lng = 150.8790, place = 'Tamworth saleyards' WHERE lat IS NULL AND substr(headline, 1, 35) = 'Regional saleyards precinct upgrade';
