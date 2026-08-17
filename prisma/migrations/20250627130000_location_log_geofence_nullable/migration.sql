-- Allow null within_geofence when property has no coordinates (location still recorded).
ALTER TABLE location_logs ALTER COLUMN within_geofence DROP NOT NULL;
ALTER TABLE location_logs ALTER COLUMN within_geofence DROP DEFAULT;
