
-- Create profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Create tournament status enum
CREATE TYPE public.tournament_status AS ENUM ('draft', 'registration', 'in_progress', 'completed', 'cancelled');

-- Create tournaments table
CREATE TABLE public.tournaments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status public.tournament_status NOT NULL DEFAULT 'draft',
  format TEXT NOT NULL DEFAULT 'single_elimination',
  max_participants INTEGER NOT NULL DEFAULT 16,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

-- Helper function: check if user is tournament creator
CREATE OR REPLACE FUNCTION public.is_tournament_creator(_tournament_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tournaments
    WHERE id = _tournament_id AND created_by = auth.uid()
  );
$$;

CREATE POLICY "Anyone authenticated can view tournaments" ON public.tournaments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create tournaments" ON public.tournaments FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Creators can update own tournaments" ON public.tournaments FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "Creators can delete own tournaments" ON public.tournaments FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- Create participants table
CREATE TABLE public.participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  seed INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View participants of any tournament" ON public.participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "Creator can add participants" ON public.participants FOR INSERT TO authenticated WITH CHECK (public.is_tournament_creator(tournament_id));
CREATE POLICY "Creator can update participants" ON public.participants FOR UPDATE TO authenticated USING (public.is_tournament_creator(tournament_id));
CREATE POLICY "Creator can delete participants" ON public.participants FOR DELETE TO authenticated USING (public.is_tournament_creator(tournament_id));

-- Create match status enum
CREATE TYPE public.match_status AS ENUM ('pending', 'in_progress', 'completed');

-- Create matches table
CREATE TABLE public.matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,
  position INTEGER NOT NULL,
  participant1_id UUID REFERENCES public.participants(id) ON DELETE SET NULL,
  participant2_id UUID REFERENCES public.participants(id) ON DELETE SET NULL,
  score1 INTEGER DEFAULT 0,
  score2 INTEGER DEFAULT 0,
  winner_id UUID REFERENCES public.participants(id) ON DELETE SET NULL,
  status public.match_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View matches of any tournament" ON public.matches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Creator can add matches" ON public.matches FOR INSERT TO authenticated WITH CHECK (public.is_tournament_creator(tournament_id));
CREATE POLICY "Creator can update matches" ON public.matches FOR UPDATE TO authenticated USING (public.is_tournament_creator(tournament_id));
CREATE POLICY "Creator can delete matches" ON public.matches FOR DELETE TO authenticated USING (public.is_tournament_creator(tournament_id));

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Updated_at triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tournaments_updated_at BEFORE UPDATE ON public.tournaments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for matches (live scoring)
ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
