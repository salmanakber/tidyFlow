ALTER TABLE `task_assignments`
  ADD COLUMN `tracker_active` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `on_break` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `break_started_at` DATETIME(3) NULL,
  ADD COLUMN `total_break_minutes` INT NOT NULL DEFAULT 0;
