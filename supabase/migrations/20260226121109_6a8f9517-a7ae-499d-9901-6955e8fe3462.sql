
CREATE TABLE public.ranking_points_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ranking_id UUID NOT NULL REFERENCES public.rankings(id) ON DELETE CASCADE,
  athlete_name TEXT NOT NULL,
  points_added INTEGER NOT NULL,
  badge TEXT DEFAULT NULL,
  reason TEXT DEFAULT NULL,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  modality_id UUID REFERENCES public.modalities(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ranking_points_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read ranking history" ON public.ranking_points_history FOR SELECT USING (true);
CREATE POLICY "Organizers insert ranking history" ON public.ranking_points_history FOR INSERT WITH CHECK (true);
CREATE POLICY "Organizers delete ranking history" ON public.ranking_points_history FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.ranking_points_history;
