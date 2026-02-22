
-- Fix: Allow organizers to access tournaments created by the same admin who created their account
CREATE OR REPLACE FUNCTION public.has_tournament_access(_tournament_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    -- Is admin organizer
    EXISTS (
      SELECT 1 FROM public.organizers
      WHERE user_id = auth.uid() AND role = 'admin'
    )
    -- Or is tournament creator
    OR EXISTS (
      SELECT 1 FROM public.tournaments t
      JOIN public.organizers o ON o.id = t.created_by
      WHERE t.id = _tournament_id AND o.user_id = auth.uid()
    )
    -- Or is associated organizer via tournament_organizers
    OR EXISTS (
      SELECT 1 FROM public.tournament_organizers torg
      JOIN public.organizers o ON o.id = torg.organizer_id
      WHERE torg.tournament_id = _tournament_id AND o.user_id = auth.uid()
    )
    -- Or is organizer created by the same admin who created the tournament
    OR EXISTS (
      SELECT 1 FROM public.organizers o
      JOIN public.tournaments t ON t.id = _tournament_id
      WHERE o.user_id = auth.uid()
      AND o.created_by = t.created_by
    )
$function$;
