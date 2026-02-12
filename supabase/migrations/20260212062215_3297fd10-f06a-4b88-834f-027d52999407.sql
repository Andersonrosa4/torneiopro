
-- 1. Enum para roles
CREATE TYPE public.app_role AS ENUM ('admin', 'organizer', 'athlete');

-- 2. Enum para esportes
CREATE TYPE public.sport_type AS ENUM ('beach_volleyball', 'futevolei', 'beach_tennis');

-- 3. Tabela de roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. Função para checar role (SECURITY DEFINER evita recursão)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 5. RLS para user_roles
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- 6. Adicionar colunas ao tournaments
ALTER TABLE public.tournaments
  ADD COLUMN sport sport_type NOT NULL DEFAULT 'beach_volleyball',
  ADD COLUMN tournament_code VARCHAR(5) UNIQUE,
  ADD COLUMN category TEXT,
  ADD COLUMN event_date DATE,
  ADD COLUMN location TEXT,
  ADD COLUMN registration_value DECIMAL(10,2),
  ADD COLUMN num_brackets INTEGER DEFAULT 1,
  ADD COLUMN num_sets INTEGER DEFAULT 3,
  ADD COLUMN games_per_set INTEGER;

-- 7. Função para gerar código de 5 dígitos único
CREATE OR REPLACE FUNCTION public.generate_tournament_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  new_code VARCHAR(5);
BEGIN
  LOOP
    new_code := LPAD(FLOOR(RANDOM() * 100000)::TEXT, 5, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.tournaments WHERE tournament_code = new_code);
  END LOOP;
  NEW.tournament_code := new_code;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_tournament_code
  BEFORE INSERT ON public.tournaments
  FOR EACH ROW
  WHEN (NEW.tournament_code IS NULL)
  EXECUTE FUNCTION public.generate_tournament_code();

-- 8. Tabela de times/duplas
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE NOT NULL,
  player1_name TEXT NOT NULL,
  player2_name TEXT NOT NULL,
  seed INTEGER,
  is_fictitious BOOLEAN DEFAULT false,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('paid', 'pending')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- 9. RLS para teams
CREATE POLICY "Anyone can view teams"
  ON public.teams FOR SELECT USING (true);

CREATE POLICY "Creator can manage teams"
  ON public.teams FOR INSERT
  WITH CHECK (is_tournament_creator(tournament_id));

CREATE POLICY "Creator can update teams"
  ON public.teams FOR UPDATE
  USING (is_tournament_creator(tournament_id));

CREATE POLICY "Creator can delete teams"
  ON public.teams FOR DELETE
  USING (is_tournament_creator(tournament_id));

-- 10. Atualizar matches para referenciar teams em vez de participants
-- Adicionar coluna bracket_number
ALTER TABLE public.matches
  ADD COLUMN bracket_number INTEGER DEFAULT 1,
  ADD COLUMN team1_id UUID REFERENCES public.teams(id),
  ADD COLUMN team2_id UUID REFERENCES public.teams(id),
  ADD COLUMN winner_team_id UUID REFERENCES public.teams(id);

-- 11. Tabela de ranking
CREATE TABLE public.rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_name TEXT NOT NULL,
  sport sport_type NOT NULL,
  tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
  points INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.rankings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view rankings"
  ON public.rankings FOR SELECT USING (true);

CREATE POLICY "Admin/Organizer can manage rankings"
  ON public.rankings FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'organizer'));

CREATE POLICY "Admin/Organizer can update rankings"
  ON public.rankings FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'organizer'));

CREATE POLICY "Admin/Organizer can delete rankings"
  ON public.rankings FOR DELETE
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'organizer'));

-- 12. Habilitar realtime para teams
ALTER PUBLICATION supabase_realtime ADD TABLE public.teams;
