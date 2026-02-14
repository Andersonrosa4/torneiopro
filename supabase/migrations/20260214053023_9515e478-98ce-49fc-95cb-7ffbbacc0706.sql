
-- Drop the overly permissive write policies
DROP POLICY IF EXISTS "Anyone can insert rankings" ON public.rankings;
DROP POLICY IF EXISTS "Anyone can update rankings" ON public.rankings;
DROP POLICY IF EXISTS "Anyone can delete rankings" ON public.rankings;

-- Create restricted policies: tournament creator OR admin
CREATE POLICY "Creator or admin can insert rankings"
ON public.rankings
FOR INSERT
WITH CHECK (
  is_tournament_creator(tournament_id)
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Creator or admin can update rankings"
ON public.rankings
FOR UPDATE
USING (
  is_tournament_creator(tournament_id)
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Creator or admin can delete rankings"
ON public.rankings
FOR DELETE
USING (
  is_tournament_creator(tournament_id)
  OR has_role(auth.uid(), 'admin'::app_role)
);
