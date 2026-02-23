
-- Add entry_type column to rankings
ALTER TABLE public.rankings ADD COLUMN entry_type text NOT NULL DEFAULT 'individual';

-- Update existing pair entries
UPDATE public.rankings SET entry_type = 'pair' WHERE athlete_name LIKE '%/%';
