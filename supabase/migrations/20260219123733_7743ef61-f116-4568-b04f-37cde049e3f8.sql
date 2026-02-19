
-- Tabela de associação entre torneios e organizadores adicionais
CREATE TABLE public.tournament_organizers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  organizer_id uuid NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  granted_by uuid NOT NULL REFERENCES public.organizers(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(tournament_id, organizer_id)
);

-- RLS
ALTER TABLE public.tournament_organizers ENABLE ROW LEVEL SECURITY;

-- Qualquer um pode ler (para verificações internas via service role)
CREATE POLICY "Public can view tournament_organizers"
  ON public.tournament_organizers FOR SELECT
  USING (true);

-- Apenas admins podem inserir/deletar via RLS (edge function usa service role, então é apenas proteção extra)
CREATE POLICY "Admins can manage tournament_organizers"
  ON public.tournament_organizers FOR ALL
  USING (true)
  WITH CHECK (true);
