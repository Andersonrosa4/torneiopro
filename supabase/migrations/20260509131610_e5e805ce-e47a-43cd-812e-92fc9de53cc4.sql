
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.bug_combatant_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL,
  scanned int NOT NULL DEFAULT 0,
  fixed int NOT NULL DEFAULT 0,
  remaining int NOT NULL DEFAULT 0,
  applied_fixes jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'cron',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bug_combatant_log_tournament ON public.bug_combatant_log(tournament_id, created_at DESC);

ALTER TABLE public.bug_combatant_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tournament access can view bug log"
  ON public.bug_combatant_log FOR SELECT
  USING (public.has_tournament_access(tournament_id));

CREATE POLICY "Anyone can insert bug log"
  ON public.bug_combatant_log FOR INSERT
  WITH CHECK (true);
