-- Real coordinates for the Intelligence map (a pannable, zoomable map of NSW
-- instead of the drawn outline). map_x/map_y stay for older clients; a region
-- without coordinates is placed from them.
ALTER TABLE regions ADD COLUMN lat REAL;
ALTER TABLE regions ADD COLUMN lng REAL;

UPDATE regions SET lat = -33.8688, lng = 151.2093 WHERE key = 'syd';
UPDATE regions SET lat = -32.9283, lng = 151.7817 WHERE key = 'new';
UPDATE regions SET lat = -34.4278, lng = 150.8931 WHERE key = 'wol';
UPDATE regions SET lat = -30.2963, lng = 153.1135 WHERE key = 'cof';
UPDATE regions SET lat = -32.2569, lng = 148.6011 WHERE key = 'dub';
UPDATE regions SET lat = -35.1082, lng = 147.3598 WHERE key = 'wag';
UPDATE regions SET lat = -31.9505, lng = 141.4533 WHERE key = 'bhq';
UPDATE regions SET lat = -31.0927, lng = 150.9320 WHERE key = 'tam';
