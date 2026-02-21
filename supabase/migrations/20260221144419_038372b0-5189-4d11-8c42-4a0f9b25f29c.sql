
-- Fix overly permissive INSERT policies for new tables

-- 1) Challenges: only community members can create
DROP POLICY IF EXISTS "Authenticated can create challenges" ON public.challenges;
CREATE POLICY "Community members can create challenges"
  ON public.challenges FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.id = challenges.challenger_id
      AND cm.user_id = auth.uid()
    )
  );

-- 2) Notifications: only involved users or community creator can insert
DROP POLICY IF EXISTS "System can insert notifications" ON public.challenge_notifications;
CREATE POLICY "Involved users can insert notifications"
  ON public.challenge_notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.challenges c
      JOIN public.community_members cm ON (cm.id = c.challenger_id OR cm.id = c.challenged_id)
      WHERE c.id = challenge_notifications.challenge_id
      AND (cm.user_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.ranking_communities rc
        WHERE rc.id = c.community_id AND rc.created_by = auth.uid()
      ))
    )
  );
