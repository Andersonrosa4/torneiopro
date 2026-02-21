
-- =============================================
-- MÓDULO DE DESAFIOS RANQUEADOS
-- =============================================

-- 1) Comunidades de Ranking (configuradas pelo organizador)
CREATE TABLE public.ranking_communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sport sport_type NOT NULL DEFAULT 'beach_tennis',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_range INT NOT NULL DEFAULT 5,
  scoring_mode TEXT NOT NULL DEFAULT 'athlete',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ranking_communities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active communities"
  ON public.ranking_communities FOR SELECT
  USING (active = true);

CREATE POLICY "Creator can view own communities"
  ON public.ranking_communities FOR SELECT
  USING (created_by = auth.uid());

CREATE POLICY "Creator can manage own communities"
  ON public.ranking_communities FOR ALL
  USING (created_by = auth.uid());

CREATE POLICY "Admin can manage all communities"
  ON public.ranking_communities FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- 2) Membros da comunidade com ranking
CREATE TABLE public.community_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.ranking_communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  athlete_name TEXT NOT NULL,
  cpf TEXT,
  phone TEXT,
  photo_url TEXT,
  points INT NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(community_id, user_id)
);

ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view community members"
  ON public.community_members FOR SELECT
  USING (true);

CREATE POLICY "Community creator can manage members"
  ON public.community_members FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.ranking_communities rc
    WHERE rc.id = community_members.community_id AND rc.created_by = auth.uid()
  ));

CREATE POLICY "Admin can manage all members"
  ON public.community_members FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Athletes can update own photo"
  ON public.community_members FOR UPDATE
  USING (user_id = auth.uid());

-- 3) Desafios entre atletas
CREATE TABLE public.challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.ranking_communities(id) ON DELETE CASCADE,
  challenger_id UUID NOT NULL REFERENCES public.community_members(id) ON DELETE CASCADE,
  challenged_id UUID NOT NULL REFERENCES public.community_members(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  score_data JSONB,
  sets_won_challenger INT NOT NULL DEFAULT 0,
  sets_won_challenged INT NOT NULL DEFAULT 0,
  submitted_by UUID REFERENCES auth.users(id),
  confirmed_by UUID REFERENCES auth.users(id),
  winner_member_id UUID REFERENCES public.community_members(id),
  organizer_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Community members can view challenges"
  ON public.challenges FOR SELECT
  USING (true);

CREATE POLICY "Authenticated can create challenges"
  ON public.challenges FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Participants can update challenges"
  ON public.challenges FOR UPDATE
  USING (
    submitted_by = auth.uid()
    OR confirmed_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE (cm.id = challenges.challenger_id OR cm.id = challenges.challenged_id)
      AND cm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.ranking_communities rc
      WHERE rc.id = challenges.community_id AND rc.created_by = auth.uid()
    )
  );

CREATE POLICY "Community creator can manage challenges"
  ON public.challenges FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.ranking_communities rc
    WHERE rc.id = challenges.community_id AND rc.created_by = auth.uid()
  ));

CREATE POLICY "Admin can manage all challenges"
  ON public.challenges FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- 4) Notificações in-app
CREATE TABLE public.challenge_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.challenge_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.challenge_notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON public.challenge_notifications FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "System can insert notifications"
  ON public.challenge_notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 5) Storage bucket para fotos de atletas
INSERT INTO storage.buckets (id, name, public)
VALUES ('athlete-photos', 'athlete-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view athlete photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'athlete-photos');

CREATE POLICY "Authenticated users can upload own photo"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'athlete-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own photo"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'athlete-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 6) Realtime para notificações e desafios
ALTER PUBLICATION supabase_realtime ADD TABLE public.challenge_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.challenges;

-- 7) Trigger para updated_at na ranking_communities
CREATE TRIGGER update_ranking_communities_updated_at
  BEFORE UPDATE ON public.ranking_communities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
