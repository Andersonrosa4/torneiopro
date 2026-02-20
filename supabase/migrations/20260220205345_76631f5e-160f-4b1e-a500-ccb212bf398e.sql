
-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: Organizer Auth → Supabase Auth
-- Utility functions, RLS policies, FK cleanup triggers, password hashing
-- ═══════════════════════════════════════════════════════════════

-- Enable pgcrypto for server-side bcrypt
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── 1. UTILITY FUNCTIONS ────────────────────────────────────

-- Check if current auth user is an admin organizer
CREATE OR REPLACE FUNCTION public.is_organizer_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizers
    WHERE user_id = auth.uid() AND role = 'admin'
  )
$$;

-- Get the organizers.id for the current auth user
CREATE OR REPLACE FUNCTION public.get_organizer_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.organizers WHERE user_id = auth.uid() LIMIT 1
$$;

-- Check if current user has access to a tournament (admin, creator, or associated)
CREATE OR REPLACE FUNCTION public.has_tournament_access(_tournament_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Is admin organizer
    EXISTS (
      SELECT 1 FROM public.organizers
      WHERE user_id = auth.uid() AND role = 'admin'
    )
    -- Or is tournament creator
    OR EXISTS (
      SELECT 1 FROM public.tournaments t
      JOIN public.organizers o ON o.id = t.created_by
      WHERE t.id = _tournament_id AND o.user_id = auth.uid()
    )
    -- Or is associated organizer
    OR EXISTS (
      SELECT 1 FROM public.tournament_organizers torg
      JOIN public.organizers o ON o.id = torg.organizer_id
      WHERE torg.tournament_id = _tournament_id AND o.user_id = auth.uid()
    )
$$;

-- ─── 2. FK CLEANUP TRIGGERS ─────────────────────────────────

-- Clean team references in matches before deleting a team
CREATE OR REPLACE FUNCTION public.cleanup_team_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.matches SET team1_id = NULL, winner_team_id = NULL WHERE team1_id = OLD.id;
  UPDATE public.matches SET team2_id = NULL, winner_team_id = NULL WHERE team2_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS before_team_delete ON public.teams;
CREATE TRIGGER before_team_delete
BEFORE DELETE ON public.teams
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_team_references();

-- Clean match references before deleting a match
CREATE OR REPLACE FUNCTION public.cleanup_match_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.matches SET next_win_match_id = NULL WHERE next_win_match_id = OLD.id;
  UPDATE public.matches SET next_lose_match_id = NULL WHERE next_lose_match_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS before_match_delete ON public.matches;
CREATE TRIGGER before_match_delete
BEFORE DELETE ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_match_references();

-- ─── 3. AUTO-SET created_by TRIGGERS ─────────────────────────

CREATE OR REPLACE FUNCTION public.set_organizer_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by = (SELECT id FROM public.organizers WHERE user_id = auth.uid() LIMIT 1);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_tournaments_created_by ON public.tournaments;
CREATE TRIGGER set_tournaments_created_by
BEFORE INSERT ON public.tournaments
FOR EACH ROW
EXECUTE FUNCTION public.set_organizer_created_by();

DROP TRIGGER IF EXISTS set_rankings_created_by ON public.rankings;
CREATE TRIGGER set_rankings_created_by
BEFORE INSERT ON public.rankings
FOR EACH ROW
EXECUTE FUNCTION public.set_organizer_created_by();

-- ─── 4. PASSWORD HASHING TRIGGER ────────────────────────────

CREATE OR REPLACE FUNCTION public.hash_organizer_password()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Hash password if it's new or changed, and not already bcrypt
  IF NEW.password_hash IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.password_hash IS DISTINCT FROM OLD.password_hash)
     AND NEW.password_hash NOT LIKE '$2%' THEN
    NEW.password_hash = crypt(NEW.password_hash, gen_salt('bf'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hash_organizer_password ON public.organizers;
CREATE TRIGGER hash_organizer_password
BEFORE INSERT OR UPDATE ON public.organizers
FOR EACH ROW
EXECUTE FUNCTION public.hash_organizer_password();

-- ─── 5. UPDATE RLS POLICIES ─────────────────────────────────

-- ── tournaments ──
DROP POLICY IF EXISTS "tournaments_select" ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_select_public" ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_insert" ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_update" ON public.tournaments;
DROP POLICY IF EXISTS "tournaments_delete" ON public.tournaments;

CREATE POLICY "tournaments_public_read" ON public.tournaments FOR SELECT USING (true);
CREATE POLICY "tournaments_insert" ON public.tournaments FOR INSERT WITH CHECK (get_organizer_id() IS NOT NULL);
CREATE POLICY "tournaments_update" ON public.tournaments FOR UPDATE USING (has_tournament_access(id));
CREATE POLICY "tournaments_delete" ON public.tournaments FOR DELETE USING (has_tournament_access(id));

-- ── matches ──
DROP POLICY IF EXISTS "Creator can add matches" ON public.matches;
DROP POLICY IF EXISTS "Creator can update matches" ON public.matches;
DROP POLICY IF EXISTS "Creator can delete matches" ON public.matches;

CREATE POLICY "Organizer can add matches" ON public.matches FOR INSERT WITH CHECK (has_tournament_access(tournament_id));
CREATE POLICY "Organizer can update matches" ON public.matches FOR UPDATE USING (has_tournament_access(tournament_id));
CREATE POLICY "Organizer can delete matches" ON public.matches FOR DELETE USING (has_tournament_access(tournament_id));

-- ── teams ──
DROP POLICY IF EXISTS "Creator can manage teams" ON public.teams;
DROP POLICY IF EXISTS "Creator can update teams" ON public.teams;
DROP POLICY IF EXISTS "Creator can delete teams" ON public.teams;

CREATE POLICY "Organizer can insert teams" ON public.teams FOR INSERT WITH CHECK (has_tournament_access(tournament_id));
CREATE POLICY "Organizer can update teams" ON public.teams FOR UPDATE USING (has_tournament_access(tournament_id));
CREATE POLICY "Organizer can delete teams" ON public.teams FOR DELETE USING (has_tournament_access(tournament_id));

-- ── participants ──
DROP POLICY IF EXISTS "Creator can add participants" ON public.participants;
DROP POLICY IF EXISTS "Creator can update participants" ON public.participants;
DROP POLICY IF EXISTS "Creator can delete participants" ON public.participants;

CREATE POLICY "Organizer can add participants" ON public.participants FOR INSERT WITH CHECK (has_tournament_access(tournament_id));
CREATE POLICY "Organizer can update participants" ON public.participants FOR UPDATE USING (has_tournament_access(tournament_id));
CREATE POLICY "Organizer can delete participants" ON public.participants FOR DELETE USING (has_tournament_access(tournament_id));

-- ── modalities ──
DROP POLICY IF EXISTS "Creator can insert modalities" ON public.modalities;
DROP POLICY IF EXISTS "Creator can update modalities" ON public.modalities;
DROP POLICY IF EXISTS "Creator can delete modalities" ON public.modalities;

CREATE POLICY "Organizer can insert modalities" ON public.modalities FOR INSERT WITH CHECK (has_tournament_access(tournament_id));
CREATE POLICY "Organizer can update modalities" ON public.modalities FOR UPDATE USING (has_tournament_access(tournament_id));
CREATE POLICY "Organizer can delete modalities" ON public.modalities FOR DELETE USING (has_tournament_access(tournament_id));

-- ── groups ──
DROP POLICY IF EXISTS "Creator can insert groups" ON public.groups;
DROP POLICY IF EXISTS "Creator can update groups" ON public.groups;
DROP POLICY IF EXISTS "Creator can delete groups" ON public.groups;

CREATE POLICY "Organizer can insert groups" ON public.groups FOR INSERT WITH CHECK (has_tournament_access(tournament_id));
CREATE POLICY "Organizer can update groups" ON public.groups FOR UPDATE USING (has_tournament_access(tournament_id));
CREATE POLICY "Organizer can delete groups" ON public.groups FOR DELETE USING (has_tournament_access(tournament_id));

-- ── classificacao_grupos ──
DROP POLICY IF EXISTS "Creator can insert classificacao_grupos" ON public.classificacao_grupos;
DROP POLICY IF EXISTS "Creator can update classificacao_grupos" ON public.classificacao_grupos;
DROP POLICY IF EXISTS "Creator can delete classificacao_grupos" ON public.classificacao_grupos;

CREATE POLICY "Organizer can insert classificacao_grupos" ON public.classificacao_grupos FOR INSERT WITH CHECK (has_tournament_access(tournament_id));
CREATE POLICY "Organizer can update classificacao_grupos" ON public.classificacao_grupos FOR UPDATE USING (has_tournament_access(tournament_id));
CREATE POLICY "Organizer can delete classificacao_grupos" ON public.classificacao_grupos FOR DELETE USING (has_tournament_access(tournament_id));

-- ── tournament_rules ──
DROP POLICY IF EXISTS "Creator can insert tournament_rules" ON public.tournament_rules;
DROP POLICY IF EXISTS "Creator can update tournament_rules" ON public.tournament_rules;
DROP POLICY IF EXISTS "Creator can delete tournament_rules" ON public.tournament_rules;

CREATE POLICY "Organizer can insert tournament_rules" ON public.tournament_rules FOR INSERT WITH CHECK (has_tournament_access(tournament_id));
CREATE POLICY "Organizer can update tournament_rules" ON public.tournament_rules FOR UPDATE USING (has_tournament_access(tournament_id));
CREATE POLICY "Organizer can delete tournament_rules" ON public.tournament_rules FOR DELETE USING (has_tournament_access(tournament_id));

-- ── rankings ──
DROP POLICY IF EXISTS "Creator or admin can insert rankings" ON public.rankings;
DROP POLICY IF EXISTS "Creator or admin can update rankings" ON public.rankings;
DROP POLICY IF EXISTS "Creator or admin can delete rankings" ON public.rankings;

CREATE POLICY "Organizer can insert rankings" ON public.rankings FOR INSERT WITH CHECK (has_tournament_access(tournament_id));
CREATE POLICY "Organizer can update rankings" ON public.rankings FOR UPDATE USING (has_tournament_access(tournament_id));
CREATE POLICY "Organizer can delete rankings" ON public.rankings FOR DELETE USING (has_tournament_access(tournament_id));

-- ── tournament_organizers ──
DROP POLICY IF EXISTS "No direct client write to tournament_organizers" ON public.tournament_organizers;
DROP POLICY IF EXISTS "No direct client update to tournament_organizers" ON public.tournament_organizers;
DROP POLICY IF EXISTS "No direct client delete to tournament_organizers" ON public.tournament_organizers;

CREATE POLICY "Authorized can insert tournament_organizers" ON public.tournament_organizers
FOR INSERT WITH CHECK (is_organizer_admin() OR is_tournament_creator(tournament_id));
CREATE POLICY "Authorized can update tournament_organizers" ON public.tournament_organizers
FOR UPDATE USING (is_organizer_admin() OR is_tournament_creator(tournament_id));
CREATE POLICY "Authorized can delete tournament_organizers" ON public.tournament_organizers
FOR DELETE USING (is_organizer_admin() OR is_tournament_creator(tournament_id));

-- ── organizers ──
DROP POLICY IF EXISTS "Admins can create organizers" ON public.organizers;
DROP POLICY IF EXISTS "Admins can update organizers" ON public.organizers;
DROP POLICY IF EXISTS "Admins can delete organizers" ON public.organizers;
DROP POLICY IF EXISTS "Admins can view organizers" ON public.organizers;

CREATE POLICY "Admin organizers can view all" ON public.organizers FOR SELECT USING (is_organizer_admin());
CREATE POLICY "Self can view own organizer" ON public.organizers FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admin organizers can insert" ON public.organizers FOR INSERT WITH CHECK (is_organizer_admin());
CREATE POLICY "Admin organizers can update" ON public.organizers FOR UPDATE USING (is_organizer_admin());
CREATE POLICY "Admin organizers can delete" ON public.organizers FOR DELETE USING (is_organizer_admin());
