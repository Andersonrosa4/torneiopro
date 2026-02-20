
-- Add futsal-specific columns to tournament_rules
ALTER TABLE public.tournament_rules
  ADD COLUMN IF NOT EXISTS halves_count integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS half_duration_minutes integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS halftime_interval_minutes integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS allow_draw boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS use_extra_time boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS extra_time_halves integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS extra_time_minutes integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS use_penalties boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS penalties_kicks integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS golden_goal_extra_time boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stop_clock_last_minutes integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS wo_enabled boolean NOT NULL DEFAULT true;
