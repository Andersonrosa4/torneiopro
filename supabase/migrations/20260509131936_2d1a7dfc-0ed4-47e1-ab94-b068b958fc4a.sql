-- Drop previous advisory-lock based functions (não funcionam com pooler)
DROP FUNCTION IF EXISTS public.try_auto_healer_lock();
DROP FUNCTION IF EXISTS public.release_auto_healer_lock();

CREATE TABLE IF NOT EXISTS public.auto_healer_lock (
  id text PRIMARY KEY,
  locked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  holder text
);

ALTER TABLE public.auto_healer_lock ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role bypasses RLS, clientes não acessam.

INSERT INTO public.auto_healer_lock (id, locked_at, expires_at, holder)
VALUES ('singleton', now() - interval '1 hour', now() - interval '1 hour', NULL)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.acquire_auto_healer_lock(ttl_seconds integer DEFAULT 240)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  acquired boolean := false;
BEGIN
  UPDATE public.auto_healer_lock
     SET locked_at = now(),
         expires_at = now() + make_interval(secs => ttl_seconds),
         holder = gen_random_uuid()::text
   WHERE id = 'singleton'
     AND expires_at < now();
  GET DIAGNOSTICS acquired = ROW_COUNT;
  RETURN acquired;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_auto_healer_lock()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.auto_healer_lock
     SET expires_at = now() - interval '1 second',
         holder = NULL
   WHERE id = 'singleton';
$$;

REVOKE ALL ON FUNCTION public.acquire_auto_healer_lock(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_auto_healer_lock() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_auto_healer_lock(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_auto_healer_lock() TO service_role;