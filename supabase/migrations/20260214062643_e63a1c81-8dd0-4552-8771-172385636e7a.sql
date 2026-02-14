
-- 1) Criar tabela groups
CREATE TABLE public.groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view groups" ON public.groups FOR SELECT USING (true);
CREATE POLICY "Creator can insert groups" ON public.groups FOR INSERT WITH CHECK (is_tournament_creator(tournament_id));
CREATE POLICY "Creator can update groups" ON public.groups FOR UPDATE USING (is_tournament_creator(tournament_id));
CREATE POLICY "Creator can delete groups" ON public.groups FOR DELETE USING (is_tournament_creator(tournament_id));

-- 2) Criar tabela classificacao_grupos
CREATE TABLE public.classificacao_grupos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  pontos INTEGER NOT NULL DEFAULT 0,
  jogos INTEGER NOT NULL DEFAULT 0,
  vitorias INTEGER NOT NULL DEFAULT 0,
  derrotas INTEGER NOT NULL DEFAULT 0,
  sets_pro INTEGER NOT NULL DEFAULT 0,
  sets_contra INTEGER NOT NULL DEFAULT 0,
  saldo_sets INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.classificacao_grupos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view classificacao_grupos" ON public.classificacao_grupos FOR SELECT USING (true);
CREATE POLICY "Creator can insert classificacao_grupos" ON public.classificacao_grupos FOR INSERT WITH CHECK (is_tournament_creator(tournament_id));
CREATE POLICY "Creator can update classificacao_grupos" ON public.classificacao_grupos FOR UPDATE USING (is_tournament_creator(tournament_id));
CREATE POLICY "Creator can delete classificacao_grupos" ON public.classificacao_grupos FOR DELETE USING (is_tournament_creator(tournament_id));

-- 3) Adicionar is_chapeu em matches
ALTER TABLE public.matches ADD COLUMN is_chapeu BOOLEAN DEFAULT false;
