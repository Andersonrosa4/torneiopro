-- 1) Fix search_path nas funções de trigger pré-existentes
ALTER FUNCTION public.validate_match_team_assignment() SET search_path = public;
ALTER FUNCTION public.guard_match_integrity() SET search_path = public;

-- 2) Garantir que tabelas internas do auto-healer não fiquem expostas via PostgREST
REVOKE ALL ON TABLE public.bug_combatant_log FROM anon;
REVOKE ALL ON TABLE public.auto_healer_lock FROM anon, authenticated;

-- 3) Reafirma EXECUTE apenas para service_role nas funções de lock
REVOKE ALL ON FUNCTION public.acquire_auto_healer_lock(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_auto_healer_lock() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_auto_healer_lock(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_auto_healer_lock() TO service_role;