-- Fix SELECT policies on all tables to be permissive for public athlete access

-- Teams
DROP POLICY IF EXISTS "Anyone can view teams" ON public.teams;
CREATE POLICY "Anyone can view teams" ON public.teams FOR SELECT USING (true);

-- Matches  
DROP POLICY IF EXISTS "View matches of any tournament" ON public.matches;
CREATE POLICY "Anyone can view matches" ON public.matches FOR SELECT USING (true);

-- Participants
DROP POLICY IF EXISTS "View participants of any tournament" ON public.participants;
CREATE POLICY "Anyone can view participants" ON public.participants FOR SELECT USING (true);

-- Rankings
DROP POLICY IF EXISTS "Anyone can view rankings" ON public.rankings;
CREATE POLICY "Anyone can view rankings" ON public.rankings FOR SELECT USING (true);

-- Profiles
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Anyone can view profiles" ON public.profiles FOR SELECT USING (true);
