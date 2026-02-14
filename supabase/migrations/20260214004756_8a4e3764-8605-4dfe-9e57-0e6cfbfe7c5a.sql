
-- Remove the auto-generate trigger (correct trigger name)
DROP TRIGGER IF EXISTS set_tournament_code ON public.tournaments;
DROP FUNCTION IF EXISTS public.generate_tournament_code() CASCADE;

-- Fill any existing NULL codes
UPDATE public.tournaments SET tournament_code = LPAD(FLOOR(RANDOM() * 100000)::TEXT, 5, '0') WHERE tournament_code IS NULL;

-- Alter column to NOT NULL
ALTER TABLE public.tournaments ALTER COLUMN tournament_code SET NOT NULL;

-- Add UNIQUE constraint
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_tournament_code_unique UNIQUE (tournament_code);
