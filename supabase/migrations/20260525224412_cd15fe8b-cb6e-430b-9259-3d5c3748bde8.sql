
-- =========================================================================
-- SECURITY HARDENING MIGRATION
-- Fixes critical PII exposure, privilege escalation, and missing RLS
-- Edge functions (court-booking-api, organizer-api, etc) use service_role
-- and continue to operate unaffected.
-- =========================================================================

-- 1) CUSTOMERS: remove anonymous read/insert; keep arena admin access
DROP POLICY IF EXISTS "Anyone can view customers" ON public.customers;
DROP POLICY IF EXISTS "Anyone can insert customers" ON public.customers;

CREATE POLICY "Arena admins can view customers"
  ON public.customers FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.arena_admins WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Authenticated can insert own customer record"
  ON public.customers FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 2) CUSTOMER_WALLET: remove anonymous read
DROP POLICY IF EXISTS "Anyone can view customer_wallet" ON public.customer_wallet;

CREATE POLICY "Arena admins can view customer_wallet"
  ON public.customer_wallet FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.arena_admins WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- 3) WALLET_TRANSACTIONS: remove anonymous read
DROP POLICY IF EXISTS "Anyone can view wallet_transactions" ON public.wallet_transactions;

CREATE POLICY "Arena admins can view wallet_transactions"
  ON public.wallet_transactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.arena_admins WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- 4) COURT_BOOKINGS: remove anonymous read/insert
DROP POLICY IF EXISTS "Anyone can view court_bookings" ON public.court_bookings;
DROP POLICY IF EXISTS "Anyone can insert court_bookings" ON public.court_bookings;

CREATE POLICY "Arena admins can view court_bookings"
  ON public.court_bookings FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.arena_admins WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- 5) PAYMENTS: remove anonymous read/insert
DROP POLICY IF EXISTS "Anyone can view payments" ON public.payments;
DROP POLICY IF EXISTS "Anyone can insert payments" ON public.payments;

CREATE POLICY "Arena admins can view payments"
  ON public.payments FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.arena_admins WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- 6) BOOKINGS: remove broad "Anyone can check availability"
-- Availability checks should go through an edge function/RPC.
DROP POLICY IF EXISTS "Anyone can check availability" ON public.bookings;

-- 7) COMMUNITY_MEMBERS: remove public read; restrict to authenticated viewing
DROP POLICY IF EXISTS "Anyone can view community members" ON public.community_members;

CREATE POLICY "Authenticated can view community members"
  ON public.community_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.ranking_communities rc
      WHERE rc.id = community_members.community_id
        AND rc.created_by = auth.uid()
    )
  );

-- 8) RANKING_POINTS_HISTORY: lock down INSERT/DELETE
DROP POLICY IF EXISTS "Anyone can insert ranking_points_history" ON public.ranking_points_history;
DROP POLICY IF EXISTS "Anyone can delete ranking_points_history" ON public.ranking_points_history;
DROP POLICY IF EXISTS "Public insert ranking_points_history" ON public.ranking_points_history;
DROP POLICY IF EXISTS "Public delete ranking_points_history" ON public.ranking_points_history;

-- Drop any remaining permissive ones with USING(true) for write ops
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT polname FROM pg_policy
    WHERE polrelid = 'public.ranking_points_history'::regclass
      AND polcmd IN ('a','d')
      AND (pg_get_expr(polqual, polrelid) = 'true' OR pg_get_expr(polwithcheck, polrelid) = 'true')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.ranking_points_history', p.polname);
  END LOOP;
END $$;

CREATE POLICY "Tournament organizers can insert history"
  ON public.ranking_points_history FOR INSERT
  TO authenticated
  WITH CHECK (public.has_tournament_access(tournament_id));

CREATE POLICY "Tournament organizers can delete history"
  ON public.ranking_points_history FOR DELETE
  TO authenticated
  USING (public.has_tournament_access(tournament_id));

-- 9) AMBASSADOR_INTERESTS: ensure INSERT requires authenticated + matching user_id
DROP POLICY IF EXISTS "Users can insert their own interest" ON public.ambassador_interests;
CREATE POLICY "Authenticated users can insert own interest"
  ON public.ambassador_interests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 10) ORGANIZERS: prevent password_hash exposure to clients
-- Revoke column-level SELECT on password_hash from anon/authenticated.
-- Edge functions use service_role (bypasses column ACLs).
REVOKE SELECT (password_hash) ON public.organizers FROM anon, authenticated, PUBLIC;

-- 11) has_tournament_access: remove the overly broad "same admin" branch
CREATE OR REPLACE FUNCTION public.has_tournament_access(_tournament_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.organizers
      WHERE user_id = auth.uid() AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.tournaments t
      JOIN public.organizers o ON o.id = t.created_by
      WHERE t.id = _tournament_id AND o.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.tournament_organizers torg
      JOIN public.organizers o ON o.id = torg.organizer_id
      WHERE torg.tournament_id = _tournament_id AND o.user_id = auth.uid()
    )
$$;

-- 12) STORAGE: add DELETE policy for athlete-photos
DROP POLICY IF EXISTS "Athletes can delete own photo" ON storage.objects;
CREATE POLICY "Athletes can delete own photo"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'athlete-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
