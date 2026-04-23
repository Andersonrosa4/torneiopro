CREATE OR REPLACE FUNCTION public.verify_organizer_password(_username text, _email text, _password text)
RETURNS TABLE(id uuid, username text, email text, role text, user_id uuid, password_valid boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.username,
    o.email,
    o.role,
    o.user_id,
    CASE
      WHEN o.password_hash LIKE '$2%' THEN o.password_hash = extensions.crypt(_password, o.password_hash)
      ELSE o.password_hash = _password
    END AS password_valid
  FROM public.organizers o
  WHERE
    (_email IS NOT NULL AND o.email = lower(trim(_email)))
    OR (_email IS NULL AND _username IS NOT NULL AND o.username = trim(_username))
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_organizer_password(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_organizer_password(text, text, text) TO service_role;