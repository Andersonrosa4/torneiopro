-- Add auto-advance flag (opt-out: default true)
ALTER TABLE public.tournament_rules
ADD COLUMN IF NOT EXISTS auto_advance_knockout BOOLEAN NOT NULL DEFAULT true;