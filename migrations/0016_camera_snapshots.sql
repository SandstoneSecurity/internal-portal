-- A camera can carry a still from the real camera (compared with its modelled view in 3D) and a link to
-- its live feed. Level geometry also gains security devices and site photos, kept in its JSON.
ALTER TABLE tm_cameras ADD COLUMN snapshot_file_id INTEGER;
ALTER TABLE tm_cameras ADD COLUMN feed_url TEXT NOT NULL DEFAULT '';
