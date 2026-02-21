
-- 1. Tabela activities (Feed Universal)
CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  verb text NOT NULL,
  object_id uuid,
  object_type text,
  metadata jsonb DEFAULT '{}'::jsonb,
  visibility text NOT NULL DEFAULT 'public',
  sport text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view public activities"
  ON public.activities FOR SELECT
  USING (visibility = 'public');

CREATE POLICY "Users can view own activities"
  ON public.activities FOR SELECT
  TO authenticated
  USING (actor_id = auth.uid());

CREATE POLICY "Users can insert own activities"
  ON public.activities FOR INSERT
  TO authenticated
  WITH CHECK (actor_id = auth.uid());

CREATE INDEX idx_activities_sport ON public.activities (sport);
CREATE INDEX idx_activities_created_at ON public.activities (created_at DESC);
CREATE INDEX idx_activities_actor_id ON public.activities (actor_id);

-- 2. Tabela notifications (Sistema Geral)
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  reference_id uuid,
  reference_type text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX idx_notifications_user_id ON public.notifications (user_id);
CREATE INDEX idx_notifications_read ON public.notifications (user_id, read);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- 3. Tabela athlete_rankings (Ranking ELO por Esporte)
CREATE TABLE public.athlete_rankings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sport text NOT NULL,
  elo_rating integer NOT NULL DEFAULT 1200,
  points integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  matches_played integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, sport)
);

ALTER TABLE public.athlete_rankings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view athlete_rankings"
  ON public.athlete_rankings FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own ranking"
  ON public.athlete_rankings FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own ranking"
  ON public.athlete_rankings FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_athlete_rankings_user_sport ON public.athlete_rankings (user_id, sport);
CREATE INDEX idx_athlete_rankings_elo ON public.athlete_rankings (sport, elo_rating DESC);

-- 4. Adicionar coluna visibility em tournaments
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public';

-- 5. Adicionar coluna visibility em ranking_communities
ALTER TABLE public.ranking_communities ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public';
