
-- ════════════════════════════════════════════════════════════════
-- LIXEIRA GLOBAL: Soft-delete + restauração
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.deleted_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid,
  record_snapshot jsonb NOT NULL,
  tournament_id uuid,
  modality_id uuid,
  stage_id uuid,
  deleted_by uuid,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  restored_at timestamptz,
  restored_by uuid,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS idx_deleted_records_tournament ON public.deleted_records(tournament_id) WHERE restored_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deleted_records_table ON public.deleted_records(table_name) WHERE restored_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deleted_records_deleted_at ON public.deleted_records(deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_deleted_records_record_id ON public.deleted_records(record_id) WHERE restored_at IS NULL;

ALTER TABLE public.deleted_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tournament access can view deleted_records" ON public.deleted_records;
CREATE POLICY "Tournament access can view deleted_records"
  ON public.deleted_records FOR SELECT
  USING (
    tournament_id IS NULL AND has_role(auth.uid(), 'admin'::app_role)
    OR (tournament_id IS NOT NULL AND has_tournament_access(tournament_id))
    OR has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Tournament access can update deleted_records" ON public.deleted_records;
CREATE POLICY "Tournament access can update deleted_records"
  ON public.deleted_records FOR UPDATE
  USING (
    tournament_id IS NULL AND has_role(auth.uid(), 'admin'::app_role)
    OR (tournament_id IS NOT NULL AND has_tournament_access(tournament_id))
    OR has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Tournament access can purge deleted_records" ON public.deleted_records;
CREATE POLICY "Tournament access can purge deleted_records"
  ON public.deleted_records FOR DELETE
  USING (
    tournament_id IS NULL AND has_role(auth.uid(), 'admin'::app_role)
    OR (tournament_id IS NOT NULL AND has_tournament_access(tournament_id))
    OR has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "System can insert deleted_records" ON public.deleted_records;
CREATE POLICY "System can insert deleted_records"
  ON public.deleted_records FOR INSERT
  WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════
-- Função genérica de captura
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.capture_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  snap jsonb;
  v_tournament uuid;
  v_modality uuid;
  v_stage uuid;
  v_record_id uuid;
BEGIN
  snap := to_jsonb(OLD);

  -- Extrai identificadores se existirem (genérico)
  BEGIN v_record_id := (snap->>'id')::uuid; EXCEPTION WHEN OTHERS THEN v_record_id := NULL; END;
  BEGIN v_tournament := (snap->>'tournament_id')::uuid; EXCEPTION WHEN OTHERS THEN v_tournament := NULL; END;
  BEGIN v_modality := (snap->>'modality_id')::uuid; EXCEPTION WHEN OTHERS THEN v_modality := NULL; END;
  BEGIN v_stage := (snap->>'stage_id')::uuid; EXCEPTION WHEN OTHERS THEN v_stage := NULL; END;

  -- Para a própria tabela tournaments, record_id é o tournament_id
  IF TG_TABLE_NAME = 'tournaments' THEN
    v_tournament := v_record_id;
  END IF;

  INSERT INTO public.deleted_records (
    table_name, record_id, record_snapshot,
    tournament_id, modality_id, stage_id,
    deleted_by, reason
  ) VALUES (
    TG_TABLE_NAME, v_record_id, snap,
    v_tournament, v_modality, v_stage,
    auth.uid(), current_setting('app.delete_reason', true)
  );

  RETURN OLD;
END;
$$;

-- ════════════════════════════════════════════════════════════════
-- Anexa o gatilho em todas as tabelas relevantes
-- ════════════════════════════════════════════════════════════════

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'tournaments', 'tournament_stages', 'modalities', 'teams', 'matches',
    'groups', 'classificacao_grupos', 'rankings', 'ranking_points_history',
    'participants', 'bookings', 'court_bookings', 'community_members',
    'ranking_communities', 'challenges', 'arenas', 'courts', 'tournament_organizers'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_capture_delete ON public.%I', tbl);
      EXECUTE format('CREATE TRIGGER trg_capture_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.capture_before_delete()', tbl);
    END IF;
  END LOOP;
END $$;
