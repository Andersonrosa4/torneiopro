
-- Tabela de perguntas do quiz
CREATE TABLE public.quiz_questions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sport text NOT NULL,
  question text NOT NULL,
  option_a text NOT NULL,
  option_b text NOT NULL,
  option_c text NOT NULL,
  option_d text NOT NULL,
  correct_option text NOT NULL CHECK (correct_option IN ('a', 'b', 'c', 'd')),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Tabela de pontuações do quiz
CREATE TABLE public.quiz_scores (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  player_name text NOT NULL,
  sport text NOT NULL,
  score integer NOT NULL DEFAULT 0,
  total_questions integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS para quiz_questions (leitura pública, apenas admin insere)
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view quiz questions"
ON public.quiz_questions FOR SELECT
USING (true);

CREATE POLICY "Admins can manage quiz questions"
ON public.quiz_questions FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS para quiz_scores (leitura pública, inserção pública para atletas)
ALTER TABLE public.quiz_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view quiz scores"
ON public.quiz_scores FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert quiz scores"
ON public.quiz_scores FOR INSERT
WITH CHECK (true);

-- Índices
CREATE INDEX idx_quiz_questions_sport ON public.quiz_questions(sport);
CREATE INDEX idx_quiz_scores_tournament ON public.quiz_scores(tournament_id, sport);
CREATE INDEX idx_quiz_scores_ranking ON public.quiz_scores(tournament_id, sport, score DESC);
