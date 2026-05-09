-- Keyset pagination indexes for bug_combatant_log
-- Order key: (created_at DESC, id DESC). Filters: tournament_id, source.

CREATE INDEX IF NOT EXISTS idx_bug_log_tournament_created
  ON public.bug_combatant_log (tournament_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_bug_log_source_created
  ON public.bug_combatant_log (source, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_bug_log_tournament_source_created
  ON public.bug_combatant_log (tournament_id, source, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_bug_log_created
  ON public.bug_combatant_log (created_at DESC, id DESC);