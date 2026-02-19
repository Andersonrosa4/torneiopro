
-- Remove permissive ALL policy and replace with service-role-only logic
-- Since writes are done via edge function (service role), RLS effectively only needs to allow reads
DROP POLICY IF EXISTS "Admins can manage tournament_organizers" ON public.tournament_organizers;

-- Only service role can write (edge function bypasses RLS anyway), no direct client writes allowed
CREATE POLICY "No direct client write to tournament_organizers"
  ON public.tournament_organizers FOR INSERT
  WITH CHECK (false);

CREATE POLICY "No direct client update to tournament_organizers"
  ON public.tournament_organizers FOR UPDATE
  USING (false);

CREATE POLICY "No direct client delete to tournament_organizers"
  ON public.tournament_organizers FOR DELETE
  USING (false);
