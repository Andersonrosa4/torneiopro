CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.hash_organizer_password()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions
AS $$
BEGIN
  IF NEW.password_hash IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.password_hash IS DISTINCT FROM OLD.password_hash)
     AND NEW.password_hash NOT LIKE '$2%' THEN
    NEW.password_hash = extensions.crypt(NEW.password_hash, extensions.gen_salt('bf'));
  END IF;
  RETURN NEW;
END;
$$;