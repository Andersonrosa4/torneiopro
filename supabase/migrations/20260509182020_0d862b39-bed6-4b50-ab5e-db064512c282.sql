CREATE TABLE IF NOT EXISTS public.bug_combatant_config (
  id text PRIMARY KEY DEFAULT 'singleton' CHECK (id = 'singleton'),
  cooldown_ms integer NOT NULL DEFAULT 15000 CHECK (cooldown_ms >= 1000 AND cooldown_ms <= 600000),
  watchdog_interval_ms integer NOT NULL DEFAULT 30000 CHECK (watchdog_interval_ms >= 5000 AND watchdog_interval_ms <= 3600000),
  realtime_debounce_ms integer NOT NULL DEFAULT 2500 CHECK (realtime_debounce_ms >= 250 AND realtime_debounce_ms <= 60000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

INSERT INTO public.bug_combatant_config (id) VALUES ('singleton')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.bug_combatant_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bcc_read_all" ON public.bug_combatant_config;
CREATE POLICY "bcc_read_all"
  ON public.bug_combatant_config
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "bcc_update_admin" ON public.bug_combatant_config;
CREATE POLICY "bcc_update_admin"
  ON public.bug_combatant_config
  FOR UPDATE
  USING (public.is_organizer_admin())
  WITH CHECK (public.is_organizer_admin());

CREATE OR REPLACE FUNCTION public.bug_combatant_config_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bcc_touch ON public.bug_combatant_config;
CREATE TRIGGER trg_bcc_touch
  BEFORE UPDATE ON public.bug_combatant_config
  FOR EACH ROW
  EXECUTE FUNCTION public.bug_combatant_config_touch();