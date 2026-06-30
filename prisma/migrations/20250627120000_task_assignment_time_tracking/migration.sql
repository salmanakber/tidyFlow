-- Automated GPS time tracking on task assignments
ALTER TABLE `task_assignments`
  ADD COLUMN `started_at` DATETIME(3) NULL,
  ADD COLUMN `ended_at` DATETIME(3) NULL,
  ADD COLUMN `start_latitude` DECIMAL(10, 8) NULL,
  ADD COLUMN `start_longitude` DECIMAL(11, 8) NULL,
  ADD COLUMN `end_latitude` DECIMAL(10, 8) NULL,
  ADD COLUMN `end_longitude` DECIMAL(11, 8) NULL,
  ADD COLUMN `start_within_geofence` BOOLEAN NULL,
  ADD COLUMN `end_within_geofence` BOOLEAN NULL,
  ADD COLUMN `start_distance_meters` DECIMAL(10, 2) NULL,
  ADD COLUMN `end_distance_meters` DECIMAL(10, 2) NULL,
  ADD COLUMN `duration_minutes` INT NULL,
  ADD COLUMN `edited_duration_minutes` INT NULL,
  ADD COLUMN `edited_by` INT NULL,
  ADD COLUMN `edited_at` DATETIME(3) NULL,
  ADD COLUMN `payroll_logged_at` DATETIME(3) NULL;

CREATE INDEX `task_assignments_ended_at_idx` ON `task_assignments`(`ended_at`);
