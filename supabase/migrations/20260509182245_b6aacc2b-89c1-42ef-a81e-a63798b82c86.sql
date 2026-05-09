ALTER TABLE public.bug_combatant_log
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS duration_ms integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bug_combatant_log_reason_check'
  ) THEN
    ALTER TABLE public.bug_combatant_log
      ADD CONSTRAINT bug_combatant_log_reason_check
      CHECK (reason IS NULL OR reason IN ('initial','periodic','realtime','manual','cron'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bug_combatant_log_duration_check'
  ) THEN
    ALTER TABLE public.bug_combatant_log
      ADD CONSTRAINT bug_combatant_log_duration_check
      CHECK (duration_ms IS NULL OR (duration_ms >= 0 AND duration_ms <= 600000));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bug_combatant_log_reason
  ON public.bug_combatant_log (reason);