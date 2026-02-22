-- Fix realtime filtering: matches needs FULL replica identity
-- so that UPDATE events include tournament_id in the old record,
-- allowing the filter tournament_id=eq.X to work correctly.
ALTER TABLE public.matches REPLICA IDENTITY FULL;

-- Also fix teams table for the same reason
ALTER TABLE public.teams REPLICA IDENTITY FULL;