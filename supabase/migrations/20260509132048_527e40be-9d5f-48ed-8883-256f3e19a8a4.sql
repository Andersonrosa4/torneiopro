DROP POLICY IF EXISTS "Anyone can insert bug log" ON public.bug_combatant_log;

CREATE POLICY "Admins can insert bug log"
ON public.bug_combatant_log
FOR INSERT
TO authenticated
WITH CHECK (public.is_organizer_admin());