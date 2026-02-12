-- Drop the existing restrictive SELECT policy and recreate as permissive
DROP POLICY IF EXISTS "Anyone authenticated can view tournaments" ON public.tournaments;

-- Create permissive SELECT policy so unauthenticated athletes can also look up by code
CREATE POLICY "Anyone can view tournaments"
ON public.tournaments
FOR SELECT
USING (true);
