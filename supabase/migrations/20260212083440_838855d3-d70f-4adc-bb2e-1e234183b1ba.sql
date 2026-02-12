-- Drop the foreign key constraint that references auth.users
-- Organizers use their own UUIDs from the organizers table, not auth.users
ALTER TABLE public.tournaments DROP CONSTRAINT tournaments_created_by_fkey;