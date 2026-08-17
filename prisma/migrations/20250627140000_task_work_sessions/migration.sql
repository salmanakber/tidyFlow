-- Store per-task work sessions (multiple rounds when manager reopens work)
ALTER TABLE "task_assignments" ADD COLUMN IF NOT EXISTS "work_sessions" JSONB;
