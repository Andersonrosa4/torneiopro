
-- Fix: organizers SELECT policies must be PERMISSIVE so that ANY one grants access
DROP POLICY IF EXISTS "Admin organizers can view all" ON public.organizers;
DROP POLICY IF EXISTS "Self can view own organizer" ON public.organizers;
DROP POLICY IF EXISTS "Admin organizers can insert" ON public.organizers;
DROP POLICY IF EXISTS "Admin organizers can update" ON public.organizers;
DROP POLICY IF EXISTS "Admin organizers can delete" ON public.organizers;

-- Recreate explicitly AS PERMISSIVE
CREATE POLICY "Admin organizers can view all"
  ON public.organizers AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (is_organizer_admin());

CREATE POLICY "Self can view own organizer"
  ON public.organizers AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admin organizers can insert"
  ON public.organizers AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (is_organizer_admin());

CREATE POLICY "Admin organizers can update"
  ON public.organizers AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING (is_organizer_admin());

CREATE POLICY "Admin organizers can delete"
  ON public.organizers AS PERMISSIVE FOR DELETE
  TO authenticated
  USING (is_organizer_admin());
