
-- Drop existing ranking policies
DROP POLICY IF EXISTS "Admin/Organizer can manage rankings" ON public.rankings;
DROP POLICY IF EXISTS "Admin/Organizer can update rankings" ON public.rankings;
DROP POLICY IF EXISTS "Admin/Organizer can delete rankings" ON public.rankings;
DROP POLICY IF EXISTS "Anyone can view rankings" ON public.rankings;

-- Recreate with permissive policies that work for both Supabase Auth users and anon (organizer custom auth)
CREATE POLICY "Anyone can view rankings"
ON public.rankings FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert rankings"
ON public.rankings FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update rankings"
ON public.rankings FOR UPDATE
USING (true);

CREATE POLICY "Anyone can delete rankings"
ON public.rankings FOR DELETE
USING (true);
