
-- Create modalities table
CREATE TABLE public.modalities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- 'Masculino', 'Feminino', 'Misto'
  sport TEXT NOT NULL DEFAULT 'beach_volleyball', -- volei_praia, beach_tennis, futevolei
  game_system TEXT NOT NULL DEFAULT 'single_elimination', -- single_elimination, double_elimination, groups
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tournament_id, name)
);

-- Enable RLS
ALTER TABLE public.modalities ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Anyone can view modalities" ON public.modalities FOR SELECT USING (true);
CREATE POLICY "Creator can insert modalities" ON public.modalities FOR INSERT WITH CHECK (is_tournament_creator(tournament_id));
CREATE POLICY "Creator can update modalities" ON public.modalities FOR UPDATE USING (is_tournament_creator(tournament_id));
CREATE POLICY "Creator can delete modalities" ON public.modalities FOR DELETE USING (is_tournament_creator(tournament_id));

-- Add modality_id to teams
ALTER TABLE public.teams ADD COLUMN modality_id UUID REFERENCES public.modalities(id) ON DELETE CASCADE;

-- Add modality_id and bracket type fields to matches
ALTER TABLE public.matches ADD COLUMN modality_id UUID REFERENCES public.modalities(id) ON DELETE CASCADE;
ALTER TABLE public.matches ADD COLUMN bracket_type TEXT DEFAULT 'winners'; -- winners, losers, final, third_place
ALTER TABLE public.matches ADD COLUMN bracket_half TEXT; -- upper, lower (for double elimination)
ALTER TABLE public.matches ADD COLUMN next_win_match_id UUID REFERENCES public.matches(id);
ALTER TABLE public.matches ADD COLUMN next_lose_match_id UUID REFERENCES public.matches(id);

-- Enable realtime for modalities
ALTER PUBLICATION supabase_realtime ADD TABLE public.modalities;

-- Auto-create modalities trigger
CREATE OR REPLACE FUNCTION public.create_default_modalities()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.modalities (tournament_id, name, sport, game_system)
  VALUES
    (NEW.id, 'Masculino', NEW.sport::text, 'single_elimination'),
    (NEW.id, 'Feminino', NEW.sport::text, 'single_elimination'),
    (NEW.id, 'Misto', NEW.sport::text, 'single_elimination');
  RETURN NEW;
END;
$$;

CREATE TRIGGER create_modalities_on_tournament
AFTER INSERT ON public.tournaments
FOR EACH ROW
EXECUTE FUNCTION public.create_default_modalities();
