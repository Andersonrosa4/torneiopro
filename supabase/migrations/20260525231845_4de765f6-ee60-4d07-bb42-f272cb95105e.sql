
CREATE OR REPLACE FUNCTION public.restore_deleted_record(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.deleted_records%ROWTYPE;
  cols text;
  vals text;
  sql text;
  can_access boolean;
BEGIN
  SELECT * INTO rec FROM public.deleted_records WHERE id = _id AND restored_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado na lixeira ou já restaurado';
  END IF;

  -- Autorização: admin global, ou organizador do torneio
  can_access := has_role(auth.uid(), 'admin'::app_role)
                OR (rec.tournament_id IS NOT NULL AND has_tournament_access(rec.tournament_id));
  IF NOT can_access THEN
    RAISE EXCEPTION 'Sem permissão para restaurar este registro';
  END IF;

  -- Monta INSERT dinâmico a partir do snapshot
  SELECT string_agg(quote_ident(key), ', '),
         string_agg(format('(%L::jsonb->>%L)', rec.record_snapshot, key), ', ')
    INTO cols, vals
    FROM jsonb_object_keys(rec.record_snapshot) AS key;

  -- Usa jsonb_populate_record para tipar corretamente
  sql := format(
    'INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I, %L::jsonb) ON CONFLICT DO NOTHING',
    rec.table_name, rec.table_name, rec.record_snapshot
  );

  BEGIN
    EXECUTE sql;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Falha ao restaurar %: %', rec.table_name, SQLERRM;
  END;

  UPDATE public.deleted_records
     SET restored_at = now(), restored_by = auth.uid()
   WHERE id = _id;

  RETURN jsonb_build_object('success', true, 'table', rec.table_name, 'record_id', rec.record_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_deleted_record(uuid) TO authenticated;
