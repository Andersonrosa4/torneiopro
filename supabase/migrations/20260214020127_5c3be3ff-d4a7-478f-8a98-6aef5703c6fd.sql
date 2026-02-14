
-- ============================================
-- STEP 1: Add user_id column to organizers
-- ============================================
ALTER TABLE public.organizers
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Link the only existing auth user to their organizer
UPDATE public.organizers
SET user_id = '5c4b818b-6380-426e-af92-8d142e7fe546'
WHERE email = 'joao2892002@gmail.com';

-- ============================================
-- STEP 2: Drop ALL old tournament policies
-- ============================================
DROP POLICY IF EXISTS "Users can create tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Creators can update own tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Creators can delete own tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Anyone can view tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_select" ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_insert" ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_update" ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_delete" ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_select_public" ON public.tournaments;

-- ============================================
-- STEP 3: Ensure RLS is enabled
-- ============================================
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 4: Create new policies
-- ============================================

-- Public SELECT: anyone can read tournaments (for athletes, public views)
CREATE POLICY "tournaments_select_public"
ON public.tournaments
FOR SELECT
USING (true);

-- Owner SELECT: organizer can see own tournaments (redundant with public but explicit)
CREATE POLICY "tournaments_select"
ON public.tournaments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.organizers
    WHERE organizers.id = tournaments.created_by
    AND organizers.user_id = auth.uid()
  )
);

-- INSERT: only if organizer.user_id matches auth.uid()
CREATE POLICY "tournaments_insert"
ON public.tournaments
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.organizers
    WHERE organizers.id = created_by
    AND organizers.user_id = auth.uid()
  )
);

-- UPDATE: only if organizer.user_id matches auth.uid()
CREATE POLICY "tournaments_update"
ON public.tournaments
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.organizers
    WHERE organizers.id = tournaments.created_by
    AND organizers.user_id = auth.uid()
  )
);

-- DELETE: only if organizer.user_id matches auth.uid()
CREATE POLICY "tournaments_delete"
ON public.tournaments
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.organizers
    WHERE organizers.id = tournaments.created_by
    AND organizers.user_id = auth.uid()
  )
);

-- ============================================
-- STEP 5: Update is_tournament_creator function
-- to use the new organizers.user_id model
-- ============================================
CREATE OR REPLACE FUNCTION public.is_tournament_creator(_tournament_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tournaments t
    JOIN public.organizers o ON o.id = t.created_by
    WHERE t.id = _tournament_id
    AND o.user_id = auth.uid()
  );
$$;
