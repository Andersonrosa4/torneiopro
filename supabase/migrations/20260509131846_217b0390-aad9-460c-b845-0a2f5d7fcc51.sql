CREATE OR REPLACE FUNCTION public.try_auto_healer_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_try_advisory_lock(hashtext('auto_healer_singleton')::bigint);
$$;

CREATE OR REPLACE FUNCTION public.release_auto_healer_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_advisory_unlock(hashtext('auto_healer_singleton')::bigint);
$$;

REVOKE ALL ON FUNCTION public.try_auto_healer_lock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_auto_healer_lock() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_auto_healer_lock() TO service_role;
GRANT EXECUTE ON FUNCTION public.release_auto_healer_lock() TO service_role;